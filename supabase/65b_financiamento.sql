-- 65b · Financiamento: tela do banco, contratar, pagar (rode depois do 65a).

create or replace function public.fin_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c credito%rowtype; f financiamentos%rowtype; resto integer := 0;
begin
  if auth.uid() is null or not exists (select 1 from perfis where id = auth.uid()) then raise exception 'sem permissao'; end if;
  insert into credito (jogador) values (auth.uid()) on conflict (jogador) do nothing;
  perform fin_cobrar(auth.uid());
  select * into c from credito where jogador = auth.uid();
  select * into f from financiamentos where jogador = auth.uid() and status = 'ativo';
  if f.id is not null and f.pagas < f.n then   -- para quitar hoje: valor presente das parcelas que faltam
    resto := ceil(f.parcela * (1 - power(1 + f.taxa, -(f.n - f.pagas))) / f.taxa)::integer;
  end if;
  return jsonb_build_object('nivel', c.nivel, 'limpos', c.limpos, 'restrito', c.restrito, 'cond', fin_nivel(c.nivel),
    'extra', case when c.restrito then 2 else 0 end,
    'fin', case when f.id is null then null else jsonb_build_object('valor', f.valor, 'n', f.n, 'taxa', f.taxa, 'parcela', f.parcela,
      'pagas', f.pagas, 'proxima', f.proxima, 'atraso', f.atraso, 'inadimplente', f.inadimplente, 'atrasou', f.atrasou, 'quitar', resto + f.atraso) end);
end $$;

create or replace function public.fin_contratar(p_valor integer, p_n integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c credito%rowtype; cond jsonb; i numeric; parc integer; cb contas_banco%rowtype;
begin
  p := jogador_livre();
  if p.cargo <> 'jogador' then raise exception 'a equipe nao pega financiamento'; end if;
  insert into credito (jogador) values (p.id) on conflict (jogador) do nothing;
  perform fin_cobrar(p.id);
  if exists (select 1 from financiamentos where jogador = p.id and status = 'ativo') then raise exception 'termine o financiamento atual antes'; end if;
  cb := banco_atualizar(p.id);
  if cb.divida > 0 then raise exception 'pague o emprestimo atual antes'; end if;
  select * into c from credito where jogador = p.id;
  cond := fin_nivel(c.nivel);
  if p_valor is null or p_valor < 1000 or p_valor > (cond->>'limite')::integer then raise exception 'valor de 1.000 a % no seu nivel', cond->>'limite'; end if;
  if p_n is null or p_n < 2 or p_n > (cond->>'max')::integer then raise exception 'de 2 a % parcelas no seu nivel', cond->>'max'; end if;
  i := fin_taxa(c.nivel, p_n, c.restrito);
  parc := ceil(p_valor * i / (1 - power(1 + i, -p_n)))::integer;
  insert into financiamentos (jogador, valor, n, taxa, parcela, proxima) values (p.id, p_valor, p_n, i, parc, now() + interval '64 minutes');
  update perfis set moedas = moedas + p_valor where id = p.id;
  return parc;
end $$;

-- pagar: 'parcela' adianta a próxima; 'quitar' paga tudo com desconto dos juros; 'atraso' paga o atrasado (p_valor)
create or replace function public.fin_pagar(p_modo text, p_valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; f financiamentos%rowtype; v integer;
begin
  p := jogador_livre();
  perform fin_cobrar(p.id);
  select * into f from financiamentos where jogador = p.id and status = 'ativo' for update;
  if f.id is null then raise exception 'voce nao tem financiamento'; end if;
  select * into p from perfis where id = p.id for update;
  if p_modo = 'atraso' then
    v := least(coalesce(p_valor, 0), f.atraso); if v < 1 then raise exception 'nada em atraso'; end if;
    if p.moedas < v then raise exception 'moedas insuficientes'; end if;
    update perfis set moedas = moedas - v where id = p.id;
    update financiamentos set atraso = atraso - v, inadimplente = atraso - v > 0 where id = f.id returning * into f;
  elsif p_modo = 'parcela' then
    if f.inadimplente then raise exception 'pague o atraso antes'; end if;
    if f.pagas >= f.n then raise exception 'nao ha parcelas'; end if;
    if p.moedas < f.parcela then raise exception 'moedas insuficientes'; end if;
    update perfis set moedas = moedas - f.parcela where id = p.id;
    update financiamentos set pagas = pagas + 1 where id = f.id returning * into f;
  elsif p_modo = 'quitar' then
    v := f.atraso + case when f.pagas < f.n then ceil(f.parcela * (1 - power(1 + f.taxa, -(f.n - f.pagas))) / f.taxa)::integer else 0 end;
    if p.moedas < v then raise exception 'moedas insuficientes (precisa de %)', v; end if;
    update perfis set moedas = moedas - v where id = p.id;
    update financiamentos set pagas = n, atraso = 0, inadimplente = false where id = f.id returning * into f;
  else raise exception 'modo invalido'; end if;
  if f.pagas >= f.n and f.atraso = 0 then perform fin_quitou(f); return 0; end if;
  return f.n - f.pagas;
end $$;

-- o empréstimo à vista não convive com um financiamento
create or replace function public.banco_emprestimo(p_valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c contas_banco%rowtype; total integer;
begin
  p := jogador_livre();
  if p.cargo <> 'jogador' then raise exception 'a equipe nao pega emprestimo'; end if;
  if p_valor is null or p_valor < 500 or p_valor > 20000 then raise exception 'emprestimo de 500 a 20.000'; end if;
  if exists (select 1 from financiamentos where jogador = p.id and status = 'ativo') then raise exception 'voce ja tem um financiamento'; end if;
  c := banco_atualizar(p.id);
  if c.divida > 0 then raise exception 'pague o emprestimo atual antes'; end if;
  total := ceil(p_valor * 1.10)::integer;
  update contas_banco set divida = total, vence_ciclo = ciclo_atual() + 3 where jogador = p.id;
  update perfis set moedas = moedas + p_valor where id = p.id;
  return total;
end $$;

-- devedores: também quem está inadimplente no financiamento
create or replace function public.devedores() returns setof uuid
language sql stable security definer set search_path = public as $$
  select jogador from contas_banco where divida > 0 and vence_ciclo is not null and ciclo_atual() >= vence_ciclo
  union select jogador from financiamentos where status = 'ativo' and inadimplente;
$$;

do $$
declare f text;
begin
  foreach f in array array['fin_estado()', 'fin_contratar(integer, integer)', 'fin_pagar(text, integer)', 'banco_emprestimo(integer)', 'devedores()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
