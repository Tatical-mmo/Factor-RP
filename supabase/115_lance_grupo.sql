-- 115: empresa fundida (grupo = fábrica + transportadora) também dá lance na licitação das rações.
-- Rode depois do 114.
create or replace function public.dar_lance(p_empresa bigint, p_valor integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e empresas%rowtype; l licitacoes%rowtype; adm boolean;
begin
  p := jogador_livre(); adm := p.cargo = 'admin';
  select * into e from empresas where id = p_empresa;
  if e.id is null or e.dono <> p.id then raise exception 'empresa invalida'; end if;
  if e.tipo <> 'transportadora' and not coalesce(e.transporte, false) then raise exception 'so transportadoras'; end if;
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
grant execute on function public.dar_lance(bigint, integer) to authenticated;
notify pgrst, 'reload schema';
