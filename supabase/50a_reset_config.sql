-- Fator RP - (1) reset do mapa mais completo e (2) configurações do administrador: polícia robô e crimes de NPC.
-- (1) O reset agora também libera casas do esgoto, cofres dos clãs, assaltos ao cargueiro, Lixeiros e a residência
--     oficial, e devolve quantas coisas mudou (para o admin conferir). Cada parte que não existir no banco é pulada.
-- (2) Quantos policiais robô andam na rua (0 a 20) e se os NPCs cometem crimes (ligado/desligado + chance por ciclo
--     de 2 minutos). Polícia, PRF e Exército em serviço prendem o ladrão NPC (+300).
-- Rode depois do 49.

create or replace function public.admin_resetar_mundo(p_partes text[], p_confirma text) returns text
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; n integer; res text[] := '{}';   -- partes que não existirem no banco são puladas
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if p_confirma is distinct from 'RESETAR' then raise exception 'digite RESETAR para confirmar'; end if;
  if p_partes is null or cardinality(p_partes) = 0 then raise exception 'escolha o que resetar'; end if;
  if 'moradia' = any(p_partes) then
    if to_regclass('public.bau') is not null then delete from bau; end if;
    delete from casas where tipo = 'unidade';
    update casas set dono = null, inquilino = null, pago_ate = null, aluguel = null, a_venda = false, modelo = null, nivel = 1 where tipo <> 'oficial';
    get diagnostics n = row_count; res := res || format('%s casas liberadas', n);
    if to_regclass('public.casas_esgoto') is not null then update casas_esgoto set dono = null, desde = null where dono is not null; end if;
  end if;
  if 'empresas' = any(p_partes) then
    delete from empresas; get diagnostics n = row_count; res := res || format('%s empresas apagadas', n);
    delete from membros;
    if to_regclass('public.missoes') is not null then delete from missoes; end if;
    if to_regclass('public.ofertas') is not null then delete from ofertas; end if;
    if to_regclass('public.negocios') is not null then delete from negocios; end if;
    if to_regclass('public.lojas_assaltadas') is not null then delete from lojas_assaltadas; end if;
    delete from carros where modelo <> 'presidencial'; get diagnostics n = row_count; res := res || format('%s carros apagados', n);
  end if;
  if 'clas' = any(p_partes) then
    if to_regclass('public.favores') is not null then delete from favores; end if;
    if to_regclass('public.assaltos_navio') is not null then delete from assaltos_navio; end if;
    delete from clas; get diagnostics n = row_count; res := res || format('%s clãs apagados', n);
    update territorios set dono_cla = null, captura_cla = null, captura_inicio = null, capturado_em = null;
  end if;
  if 'jogadores' = any(p_partes) then
    update perfis set moedas = 500, crimes = 0, pena_seg = 0, pena_marca = null, algemado = false, fianca = 0, fome = 100,
      policial = false, prf = false, eleitoral = false, profissao = null, profissao_desde = null, matancas = 0, recompensa = 0,
      cerco_ate = null, pos_x = 0, pos_z = 27, turno_em = null, pd_morte = null, pd_por = null, arma_militar = false,
      lixeiro = false, lixeiro_missao = null, prisao_militar_ate = null;
    get diagnostics n = row_count; res := res || format('%s jogadores zerados', n);
    delete from inventario; delete from carreiras; delete from contas_banco; delete from metas; delete from encomendas;
    delete from personagens_comprados; delete from agressoes; delete from cacadas;
  end if;
  if 'prefeitura' = any(p_partes) then
    select * into pf from prefeitura where id = 1;
    perform deixar_cargo(pf.prefeito);
    update prefeitura set prefeito = null, posse = null, vaga_ciclo = ciclo_atual(), salario_ciclo = -1, cofre = 0, motivo = 'mapa resetado', eleicao_ate = null,
      seguranca1 = null, seguranca2 = null where id = 1;
    update casas set dono = null, inquilino = null where tipo = 'oficial';
    delete from votos; delete from candidatos; delete from noticias; delete from ocorrencias; delete from assaltos; delete from incendios;
    update outdoors set anunciante = null, titulo = null, texto = null, tipo = null, ate = null;
    res := res || 'prefeitura zerada'::text;
  end if;
  perform registrar(null, 'reset_mapa', jsonb_build_object('partes', p_partes, 'resultado', res));
  perform avisar_todos('🧹 O mapa foi resetado pela administração. Bom começo a todos!');
  return array_to_string(res, ' · ');
end $$;

-- ---------------------------------------------------------------- configurações do jogo
create table if not exists public.config_jogo (
  id            integer primary key default 1 check (id = 1),
  policia_robo  integer not null default 12 check (policia_robo between 0 and 20),
  crimes_npc    boolean not null default false,
  chance_crime  integer not null default 30 check (chance_crime between 0 and 100),
  atualizado    timestamptz not null default now()
);
insert into public.config_jogo (id) values (1) on conflict (id) do nothing;
do $$
begin
  alter table public.config_jogo enable row level security;
  drop policy if exists "leitura publica" on public.config_jogo;
  create policy "leitura publica" on public.config_jogo for select using (true);
  revoke all on public.config_jogo from anon, authenticated;
  grant select on public.config_jogo to anon, authenticated;
end $$;
-- policiais robô extras (ids 21 a 28) para quando o admin aumentar
insert into public.robos_policia (id, tipo) select g, 'pe' from generate_series(21, 28) g on conflict (id) do nothing;

create or replace function public.admin_config(p_policia integer, p_crimes boolean, p_chance integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  update config_jogo set policia_robo = greatest(0, least(20, coalesce(p_policia, 12))), crimes_npc = coalesce(p_crimes, false),
    chance_crime = greatest(0, least(100, coalesce(p_chance, 30))), atualizado = now() where id = 1;
  perform registrar(null, 'config', jsonb_build_object('policia', p_policia, 'crimes', p_crimes, 'chance', p_chance));
end $$;

-- ladrões NPC presos (um por ciclo de 2 min: o jogo inteiro sorteia o mesmo ladrão pelo número do ciclo)
create table if not exists public.bandidos_presos (
  ciclo integer primary key,
  por   uuid references public.perfis (id) on delete set null,
  em    timestamptz not null default now()
);
do $$
begin
  alter table public.bandidos_presos enable row level security;
  drop policy if exists "leitura publica" on public.bandidos_presos;
  create policy "leitura publica" on public.bandidos_presos for select using (true);
  revoke all on public.bandidos_presos from anon, authenticated;
  grant select on public.bandidos_presos to anon, authenticated;
end $$;

create or replace function public.prender_bandido(p_ciclo integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; agora_ciclo integer := floor(extract(epoch from now()) / 120)::int;
begin
  p := jogador_livre();
  if not (p.policial or p.prf or p.profissao = 'exercito' or p.cargo = 'admin') then raise exception 'so policia prf ou exercito'; end if;
  if not (select crimes_npc from config_jogo where id = 1) then raise exception 'crimes de npc desligados'; end if;
  if p_ciclo < agora_ciclo - 2 or p_ciclo > agora_ciclo then raise exception 'o ladrao ja fugiu'; end if;
  insert into bandidos_presos (ciclo, por) values (p_ciclo, p.id) on conflict do nothing;
  if not found then raise exception 'outro agente ja prendeu'; end if;
  update perfis set moedas = moedas + 300 where id = p.id;
  return 300;
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_config(integer, boolean, integer)', 'prender_bandido(integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
