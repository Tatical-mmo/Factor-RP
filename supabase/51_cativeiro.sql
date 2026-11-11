-- Fator RP - esconderijos dos clãs na mata (cativeiro).
-- Um membro de clã pode levar um jogador FERIDO (derrubado na briga) para um dos 4 esconderijos da mata por até 15 min.
-- É crime (+2). O refém não age nem atira. Qualquer jogador que achar o esconderijo pode libertar (+200 se não for do clã).
-- Rode depois do 50b.

alter table public.perfis add column if not exists cativeiro integer check (cativeiro between 1 and 4);
alter table public.perfis add column if not exists cativeiro_ate timestamptz;
alter table public.perfis add column if not exists cativeiro_cla bigint;
alter table public.perfis add column if not exists sequestro_em timestamptz;

create or replace function public.capturar_refem(p_alvo uuid, p_local integer) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a perfis%rowtype; meu bigint; ate timestamptz := now() + interval '15 minutes';
begin
  p := jogador_livre();
  select cla into meu from membros_cla where jogador = p.id;
  if meu is null then raise exception 'so membros de cla'; end if;
  if p_local is null or p_local not between 1 and 4 then raise exception 'esconderijo invalido'; end if;
  if p.sequestro_em is not null and p.sequestro_em > now() - interval '30 seconds' then raise exception 'devagar'; end if;
  select * into a from perfis where id = p_alvo for update;
  if a.id is null or a.id = p.id or a.cargo <> 'jogador' then raise exception 'jogador invalido'; end if;
  if exists (select 1 from membros_cla where jogador = a.id and cla = meu) then raise exception 'ele e do seu cla'; end if;
  if coalesce(a.pena_seg, 0) > 0 or (a.cativeiro_ate is not null and a.cativeiro_ate > now()) then raise exception 'ele ja esta preso'; end if;
  update perfis set cativeiro = p_local, cativeiro_ate = ate, cativeiro_cla = meu where id = a.id;
  update perfis set crimes = crimes + 2, sequestro_em = now() where id = p.id;
  insert into comandos (alvo, autor, tipo, dados) values (a.id, p.id, 'aviso', jsonb_build_object('texto', '⛓️ Você foi sequestrado por um clã e levado para um esconderijo na mata!'));
  return ate;
end $$;

create or replace function public.libertar_refem(p_alvo uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a perfis%rowtype; premio integer := 0;
begin
  p := jogador_livre();
  if p.cativeiro_ate is not null and p.cativeiro_ate > now() then raise exception 'voce esta preso'; end if;
  select * into a from perfis where id = p_alvo for update;
  if a.id is null or a.cativeiro_ate is null or a.cativeiro_ate <= now() then raise exception 'ele nao esta preso'; end if;
  if not exists (select 1 from membros_cla where jogador = p.id and cla = a.cativeiro_cla) then premio := 200; end if;
  update perfis set cativeiro = null, cativeiro_ate = null, cativeiro_cla = null where id = a.id;
  if premio > 0 then update perfis set moedas = moedas + premio where id = p.id; end if;
  insert into comandos (alvo, autor, tipo, dados) values (a.id, p.id, 'aviso', jsonb_build_object('texto', format('🔓 %s libertou você do esconderijo!', p.nome)));
  return premio;
end $$;

do $$
declare f text;
begin
  foreach f in array array['capturar_refem(uuid, integer)', 'libertar_refem(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
