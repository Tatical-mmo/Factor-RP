-- 112: comando da licitação no painel do Exército.
-- Abrir licitação, fechar agora, quebrar o contrato (encerra e abre outra) e ver quem está concorrendo.
-- Pode: admin ou Coronel para cima. O admin também dá lance sem exigir nível 5 e 5 caminhões (para testar).
-- Rode depois do 111.

create or replace function public.comando_exercito(p perfis) returns boolean
language sql stable security definer set search_path = public as $$
  select p.cargo = 'admin' or (p.profissao = 'exercito'
    and coalesce((select minutos from carreiras where jogador = p.id and carreira = 'exercito'), 0) >= 5400)
$$;

create or replace function public.dar_lance(p_empresa bigint, p_valor integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e empresas%rowtype; l licitacoes%rowtype; adm boolean;
begin
  p := jogador_livre(); adm := p.cargo = 'admin';
  select * into e from empresas where id = p_empresa;
  if e.id is null or e.dono <> p.id then raise exception 'empresa invalida'; end if;
  if e.tipo <> 'transportadora' and not coalesce(e.transporte, false) then raise exception 'so transportadoras'; end if;   -- grupo (fundida) também
  if not adm and e.nivel < 5 then raise exception 'precisa nivel 5'; end if;
  if not adm and (select count(*) from caminhoes where empresa = e.id and tipo = 'caminhao') < 5 then raise exception 'a licitacao exige 5 caminhoes'; end if;
  if p_valor not between 10000 and 5000000 then raise exception 'lance invalido'; end if;
  select * into l from licitacoes where status = 'aberta' order by id desc limit 1;
  if l.id is null then
    if exists (select 1 from licitacoes where status = 'vigente') then raise exception 'contrato em andamento'; end if;
    insert into licitacoes default values returning * into l;
  end if;
  insert into licitacao_lances (licitacao, empresa, valor) values (l.id, e.id, p_valor)
    on conflict (licitacao, empresa) do update set valor = excluded.valor, em = now();
  return l.id;
end $$;

-- o que o painel mostra: licitação atual, empresa do contrato e os lances com o nome das empresas
create or replace function public.licitacao_painel() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l licitacoes%rowtype;
begin
  select * into l from licitacoes where status in ('aberta', 'vigente') order by id desc limit 1;
  if l.id is null then return jsonb_build_object('licitacao', null); end if;
  return jsonb_build_object(
    'licitacao', to_jsonb(l),
    'empresa_nome', (select nome from empresas where id = l.empresa),
    'lances', coalesce((select jsonb_agg(jsonb_build_object('empresa', x.empresa, 'nome', e.nome, 'valor', x.valor, 'em', x.em) order by x.valor, x.em)
                        from licitacao_lances x left join empresas e on e.id = x.empresa where x.licitacao = l.id), '[]'::jsonb));
end $$;

-- p_acao: 'abrir' | 'fechar_agora' | 'quebrar'
create or replace function public.licitacao_comando(p_acao text) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; l licitacoes%rowtype; v_dono uuid;
begin
  p := jogador_livre();
  if not comando_exercito(p) then raise exception 'so coronel ou acima'; end if;
  select * into l from licitacoes where status in ('aberta', 'vigente') order by id desc limit 1 for update;
  if p_acao = 'abrir' then
    if l.status = 'aberta' then raise exception 'ja tem licitacao aberta'; end if;
    if l.status = 'vigente' then raise exception 'contrato em andamento'; end if;
    insert into licitacoes default values;
    return 'aberta';
  elsif p_acao = 'fechar_agora' then
    if l.id is null or l.status <> 'aberta' then raise exception 'nenhuma licitacao aberta'; end if;
    if not exists (select 1 from licitacao_lances where licitacao = l.id) then raise exception 'licitacao sem lances'; end if;
    update licitacoes set fecha_em = now() where id = l.id;
    perform processar_jujubas();
    return 'fechada';
  elsif p_acao = 'quebrar' then
    if l.id is null or l.status <> 'vigente' then raise exception 'nenhum contrato vigente'; end if;
    update licitacoes set status = 'encerrada' where id = l.id;
    select e.dono into v_dono from empresas e where e.id = l.empresa;
    if v_dono is not null then
      perform avisar(v_dono, '🎖️ O Exército quebrou o contrato do transporte de rações. Uma nova licitação foi aberta: dá para dar lance de novo.');
    end if;
    insert into licitacoes default values;
    return 'quebrado';
  end if;
  raise exception 'acao invalida';
end $$;

revoke all on function public.licitacao_comando(text) from public, anon;
grant execute on function public.licitacao_comando(text) to authenticated;
grant execute on function public.licitacao_painel() to authenticated;
grant execute on function public.dar_lance(bigint, integer) to authenticated;
revoke all on function public.comando_exercito(perfis) from public, anon, authenticated;
notify pgrst, 'reload schema';
