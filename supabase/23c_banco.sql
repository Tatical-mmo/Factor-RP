-- Fator RP - banco: poupança com rendimento, empréstimo com juros e cobrança automática.
-- Poupança rende 1% por ciclo de dia e noite (sobre até 200.000) e fica protegida: quem morre só perde
-- moedas da carteira. Empréstimo de até 20.000 com 10% de juros e prazo de 3 ciclos. Depois do prazo
-- o banco cobra sozinho da poupança e da carteira; quem deve fica "negativado" e não pega outro empréstimo.

create table if not exists public.contas_banco (
  jogador     uuid primary key references public.perfis (id) on delete cascade,
  saldo       integer not null default 0 check (saldo >= 0),
  rende_ciclo integer not null default 0,
  divida      integer not null default 0 check (divida >= 0),
  vence_ciclo integer,
  rendeu      bigint not null default 0
);
do $$
begin
  alter table public.contas_banco enable row level security;
  revoke all on public.contas_banco from anon, authenticated;
end $$;

-- abre a conta se precisar, paga o rendimento e cobra a dívida vencida; devolve a conta atualizada
create or replace function public.banco_atualizar(p_jogador uuid) returns public.contas_banco
language plpgsql security definer set search_path = public as $$
declare c contas_banco%rowtype; ciclos integer; ganho integer; cobra integer; agora integer := ciclo_atual();
begin
  insert into contas_banco (jogador, rende_ciclo) values (p_jogador, agora) on conflict (jogador) do nothing;
  select * into c from contas_banco where jogador = p_jogador for update;
  ciclos := least(30, agora - c.rende_ciclo);
  if ciclos > 0 then
    ganho := floor(least(c.saldo, 200000) * (power(1.01, ciclos) - 1))::integer;
    update contas_banco set saldo = saldo + ganho, rende_ciclo = agora, rendeu = rendeu + ganho where jogador = p_jogador returning * into c;
  end if;
  if c.divida > 0 and c.vence_ciclo is not null and agora >= c.vence_ciclo then
    cobra := least(c.divida, c.saldo);
    update contas_banco set saldo = saldo - cobra, divida = divida - cobra where jogador = p_jogador returning * into c;
    cobra := least(c.divida, (select moedas from perfis where id = p_jogador));
    if cobra > 0 then
      update perfis set moedas = moedas - cobra where id = p_jogador;
      update contas_banco set divida = divida - cobra where jogador = p_jogador returning * into c;
    end if;
    if c.divida = 0 then update contas_banco set vence_ciclo = null where jogador = p_jogador returning * into c; end if;
  end if;
  return c;
end $$;

create or replace function public.banco_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c contas_banco%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from perfis where id = auth.uid()) then raise exception 'sem permissao'; end if;
  c := banco_atualizar(auth.uid());
  select * into p from perfis where id = auth.uid();
  return jsonb_build_object('saldo', c.saldo, 'divida', c.divida, 'vence_ciclo', c.vence_ciclo, 'ciclo', ciclo_atual(),
    'rendeu', c.rendeu, 'negativado', c.divida > 0 and c.vence_ciclo is not null and ciclo_atual() >= c.vence_ciclo,
    'limite', 20000, 'carteira', p.moedas);
end $$;

create or replace function public.banco_depositar(p_valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c contas_banco%rowtype;
begin
  p := jogador_livre();
  if p_valor is null or p_valor < 1 then raise exception 'quantidade invalida'; end if;
  c := banco_atualizar(p.id);
  select * into p from perfis where id = p.id for update;
  if p.moedas < p_valor then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - p_valor where id = p.id;
  update contas_banco set saldo = saldo + p_valor where jogador = p.id returning * into c;
  return c.saldo;
end $$;

create or replace function public.banco_sacar(p_valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c contas_banco%rowtype;
begin
  p := jogador_livre();
  if p_valor is null or p_valor < 1 then raise exception 'quantidade invalida'; end if;
  c := banco_atualizar(p.id);
  if c.saldo < p_valor then raise exception 'saldo insuficiente'; end if;
  update contas_banco set saldo = saldo - p_valor where jogador = p.id returning * into c;
  update perfis set moedas = moedas + p_valor where id = p.id;
  return c.saldo;
end $$;

create or replace function public.banco_emprestimo(p_valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c contas_banco%rowtype; total integer;
begin
  p := jogador_livre();
  if p.cargo <> 'jogador' then raise exception 'a equipe nao pega emprestimo'; end if;
  if p_valor is null or p_valor < 500 or p_valor > 20000 then raise exception 'emprestimo de 500 a 20.000'; end if;
  c := banco_atualizar(p.id);
  if c.divida > 0 then raise exception 'pague o emprestimo atual antes'; end if;
  total := ceil(p_valor * 1.10)::integer;
  update contas_banco set divida = total, vence_ciclo = ciclo_atual() + 3 where jogador = p.id;
  update perfis set moedas = moedas + p_valor where id = p.id;
  return total;
end $$;

create or replace function public.banco_pagar(p_valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c contas_banco%rowtype; v integer;
begin
  p := jogador_livre();
  c := banco_atualizar(p.id);
  if c.divida = 0 then raise exception 'voce nao tem divida'; end if;
  v := least(coalesce(p_valor, 0), c.divida);
  if v < 1 then raise exception 'quantidade invalida'; end if;
  select * into p from perfis where id = p.id for update;
  if p.moedas < v then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - v where id = p.id;
  update contas_banco set divida = divida - v, vence_ciclo = case when divida - v = 0 then null else vence_ciclo end where jogador = p.id returning * into c;
  return c.divida;
end $$;

-- quem está negativado (para a etiqueta DEVEDOR no jogo)
create or replace function public.devedores() returns setof uuid
language sql stable security definer set search_path = public as $$
  select jogador from contas_banco where divida > 0 and vence_ciclo is not null and ciclo_atual() >= vence_ciclo;
$$;

do $$
declare f text;
begin
  foreach f in array array['banco_estado()', 'banco_depositar(integer)', 'banco_sacar(integer)', 'banco_emprestimo(integer)', 'banco_pagar(integer)', 'devedores()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.banco_atualizar(uuid) from public, anon, authenticated;
end $$;
