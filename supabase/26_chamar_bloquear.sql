-- Fator RP - chamar e recolher veículos, bloqueio remoto e agressão à polícia NPC.
-- Chamar: o robô motorista traz um veículo parado da empresa até o dono (se não for usado em 5 min, volta).
-- Recolher: o robô leva de volta para a garagem. Bloquear: o dono trava o veículo roubado; em 20 s ele
-- para, o ladrão é jogado para fora e o veículo volta para a garagem (a carga que ainda estiver dentro se perde).
-- Bater ou atirar na polícia NPC é crime (no máximo 1 estrela a cada 15 s).

alter table public.caminhoes add column if not exists bloqueio_em timestamptz;
alter table public.perfis add column if not exists npc_agressao timestamptz;

create or replace function public.veiculo_na_garagem(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update caminhoes set status = 'parado', motorista = null, sequestrado = false, roubado = false, escolta = false, vida = 100, carga = 0,
    pedido = null, partida = null, chegada = null, retorno = null, rota = null, pos_x = null, pos_z = null, ang = null, ativo_em = null, bloqueio_em = null
  where id = p_id;
$$;

create or replace function public.veiculo_do_dono(p_caminhao bigint) returns public.caminhoes
language plpgsql security definer set search_path = public as $$
declare c caminhoes%rowtype;
begin
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null or not exists (select 1 from empresas where id = c.empresa and dono = auth.uid()) then raise exception 'esse veiculo nao e seu'; end if;
  return c;
end $$;

create or replace function public.chamar_veiculo(p_caminhao bigint, p_x real, p_z real) returns void
language plpgsql security definer set search_path = public as $$
declare c caminhoes%rowtype;
begin
  perform jogador_livre();
  c := veiculo_do_dono(p_caminhao);
  if c.sequestrado then raise exception 'o veiculo foi roubado: use o bloqueio'; end if;
  if not (c.status = 'parado' or (c.status = 'dirigido' and c.motorista is null)) then raise exception 'o veiculo esta ocupado'; end if;
  update caminhoes set status = 'dirigido', motorista = null, pos_x = p_x, pos_z = p_z, ang = 0, ativo_em = now() where id = c.id;
end $$;

create or replace function public.recolher_veiculo(p_caminhao bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c caminhoes%rowtype;
begin
  c := veiculo_do_dono(p_caminhao);
  if c.sequestrado then raise exception 'o veiculo foi roubado: use o bloqueio'; end if;
  if c.status <> 'dirigido' or (c.motorista is not null and c.motorista <> auth.uid()) then raise exception 'o veiculo nao esta na rua'; end if;
  perform veiculo_na_garagem(c.id);
end $$;

create or replace function public.bloquear_veiculo(p_caminhao bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare c caminhoes%rowtype;
begin
  c := veiculo_do_dono(p_caminhao);
  if not c.sequestrado or c.status <> 'dirigido' then raise exception 'o veiculo nao esta roubado'; end if;
  if c.bloqueio_em is not null then return greatest(0, ceil(extract(epoch from (c.bloqueio_em - now()))))::integer; end if;
  update caminhoes set bloqueio_em = now() + interval '20 seconds' where id = c.id;
  if c.motorista is not null then perform avisar(c.motorista, '🔒 O dono acionou o BLOQUEIO: o veículo trava em 20 s!'); end if;
  return 20;
end $$;

-- posição enquanto dirige; se o bloqueio venceu, o veículo trava e volta para a garagem
create or replace function public.mover_veiculo(p_caminhao bigint, p_x real, p_z real, p_ang real) returns text
language plpgsql security definer set search_path = public as $$
declare c caminhoes%rowtype;
begin
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null or c.status <> 'dirigido' or c.motorista is distinct from auth.uid() then return 'perdeu'; end if;
  if c.bloqueio_em is not null and c.bloqueio_em <= now() then
    perform veiculo_na_garagem(c.id);
    perform avisar((select dono from empresas where id = c.empresa), '🔒 O bloqueio travou o veículo roubado. Ele voltou para a garagem.');
    return 'bloqueado';
  end if;
  update caminhoes set pos_x = p_x, pos_z = p_z, ang = p_ang,
    ativo_em = case when c.pos_x is null or abs(c.pos_x - p_x) + abs(c.pos_z - p_z) > 1.5 then now() else ativo_em end
  where id = c.id;
  return 'ok';
end $$;

-- viagens + bloqueios vencidos + devolução dos veículos parados há 5 minutos
create or replace function public.processar_caminhoes() returns integer
language plpgsql security definer set search_path = public as $$
declare c caminhoes%rowtype; n integer := 0;
begin
  for c in select * from caminhoes where status = 'em_rota' and not roubado and chegada <= now() for update skip locked loop
    if c.pedido is not null then perform registrar_entrega(c.pedido, c.carga); end if;
    update caminhoes set status = 'voltando', carga = 0 where id = c.id;
    n := n + 1;
  end loop;
  update caminhoes set status = 'parado', pedido = null, partida = null, chegada = null, retorno = null, rota = null,
    roubado = false, escolta = false, vida = 100
    where status = 'voltando' and retorno <= now();
  for c in select * from caminhoes where status = 'dirigido'
             and (coalesce(ativo_em, now() - interval '1 hour') < now() - interval '5 minutes' or bloqueio_em <= now()) for update skip locked loop
    perform veiculo_na_garagem(c.id);
    if c.sequestrado then perform avisar((select dono from empresas where id = c.empresa), 'Seu veículo roubado voltou para a garagem.'); end if;
  end loop;
  perform produzir_robos();
  return n;
end $$;

create or replace function public.agredir_policia_npc() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.policial or p.prf or p.cargo <> 'jogador' then return p.crimes; end if;
  if p.npc_agressao is not null and p.npc_agressao > now() - interval '15 seconds' then return p.crimes; end if;
  update perfis set crimes = crimes + 1, npc_agressao = now() where id = p.id returning crimes into p.crimes;
  return p.crimes;
end $$;

do $$
declare f text;
begin
  foreach f in array array['chamar_veiculo(bigint, real, real)', 'recolher_veiculo(bigint)', 'bloquear_veiculo(bigint)',
                           'mover_veiculo(bigint, real, real, real)', 'processar_caminhoes()', 'agredir_policia_npc()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.veiculo_do_dono(bigint) from public, anon, authenticated;
  revoke all on function public.veiculo_na_garagem(bigint) from public, anon, authenticated;
end $$;
