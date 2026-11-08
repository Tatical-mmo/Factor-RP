-- Fator RP - robô motorista e sequestro de veículos.
-- Todo veículo de empresa (caminhão, van e helicóptero) já vem com um robô motorista (não conta como funcionário).
-- Quem zera a vida do veículo arranca o robô e assume a direção, com a carga dentro. Para ficar com a carga,
-- leva o veículo até um território do seu clã ou até a sua casa e descarrega. Helicóptero só pode ser
-- atacado no chão (enquanto carrega na fábrica). Veículo parado por 5 minutos volta sozinho para o dono.
-- O dono pode dirigir qualquer veículo dele a qualquer momento; quando desce, o robô leva de volta à garagem.
-- Policial que acha um veículo roubado abandonado devolve ao dono e ganha 300.

alter table public.caminhoes add column if not exists motorista   uuid references public.perfis (id) on delete set null;
alter table public.caminhoes add column if not exists sequestrado boolean not null default false;
alter table public.caminhoes add column if not exists pos_x       real;
alter table public.caminhoes add column if not exists pos_z       real;
alter table public.caminhoes add column if not exists ang         real;
alter table public.caminhoes add column if not exists ativo_em    timestamptz;
alter table public.caminhoes drop constraint if exists caminhoes_status_check;
alter table public.caminhoes add constraint caminhoes_status_check check (status in ('parado', 'em_rota', 'voltando', 'dirigido'));

-- devolve o veículo à garagem (sem carga)
create or replace function public.veiculo_na_garagem(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update caminhoes set status = 'parado', motorista = null, sequestrado = false, roubado = false, escolta = false, vida = 100, carga = 0,
    pedido = null, partida = null, chegada = null, retorno = null, rota = null, pos_x = null, pos_z = null, ang = null, ativo_em = null
  where id = p_id;
$$;

drop function if exists public.atacar_caminhao(bigint);
create or replace function public.atacar_caminhao(p_caminhao bigint, p_x real default null, p_z real default null, p_ang real default 0) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c caminhoes%rowtype; item text; t real;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial or p.prf then raise exception 'policial nao rouba carga'; end if;
  if p.ultimo_ataque is not null and p.ultimo_ataque > now() - interval '900 milliseconds' then return -1; end if;
  update perfis set ultimo_ataque = now() where id = p.id;
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null or c.status <> 'em_rota' or c.roubado or c.carga <= 0 then raise exception 'caminhao sem carga'; end if;
  if c.tipo = 'helicoptero' then
    t := extract(epoch from (now() - c.partida));
    if t < (c.rota ->> 'd1')::real or t > (c.rota ->> 'd1')::real + 8 then raise exception 'helicoptero fora de alcance'; end if;
  end if;
  if exists (select 1 from empresas where id = c.empresa and dono = p.id) then raise exception 'esse caminhao e seu'; end if;
  update caminhoes set vida = greatest(0, vida - 10) where id = c.id returning * into c;
  if c.vida > 0 then return c.vida; end if;
  -- sequestro: o pedido perde as caixas e o ladrão assume a direção com a carga dentro
  item := c.rota ->> 'produto';
  update pedidos set em_transito = em_transito - c.carga, qtd = qtd - c.carga where id = c.pedido and qtd - c.carga >= 1;
  if not found then update pedidos set em_transito = 0, status = 'cancelado' where id = c.pedido; end if;
  update pedidos set status = 'concluido' where id = c.pedido and entregues >= qtd and status = 'aceito';
  update caminhoes set status = 'dirigido', motorista = p.id, sequestrado = true, roubado = true, escolta = false, pedido = null,
    pos_x = coalesce(p_x, pos_x), pos_z = coalesce(p_z, pos_z), ang = coalesce(p_ang, 0), ativo_em = now()
  where id = c.id;
  update perfis set crimes = crimes + 1 where id = p.id;
  perform avisar((select dono from empresas where id = c.empresa), format('🚨 Um veículo seu foi SEQUESTRADO por %s! Se ele ficar 5 min parado, volta para você.', p.nome));
  perform avisar(p.id, format('Você tomou o veículo com %s caixas de %s. Leve até um território do seu clã ou até sua casa e toque em Descarregar.', c.carga, item));
  return 0;
end $$;

-- entrar: o dono pega qualquer veículo dele; outro jogador só um veículo roubado abandonado; policial devolve
create or replace function public.entrar_veiculo(p_caminhao bigint, p_x real, p_z real, p_ang real) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c caminhoes%rowtype; dono uuid;
begin
  p := jogador_livre();
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null then raise exception 'veiculo invalido'; end if;
  select e.dono into dono from empresas e where e.id = c.empresa;
  if c.status = 'dirigido' and c.motorista is not null and c.motorista <> p.id and c.ativo_em > now() - interval '5 minutes' then raise exception 'alguem esta dirigindo'; end if;
  if dono = p.id then
    if c.status = 'em_rota' then   -- assume no meio da entrega: as caixas voltam para o pedido
      update pedidos set em_transito = greatest(0, em_transito - c.carga) where id = c.pedido;
    end if;
    update caminhoes set status = 'dirigido', motorista = p.id, sequestrado = false, roubado = false, escolta = false, carga = 0, pedido = null,
      partida = null, chegada = null, retorno = null, rota = null, ativo_em = now(),
      pos_x = case when c.status = 'dirigido' then pos_x else p_x end, pos_z = case when c.status = 'dirigido' then pos_z else p_z end,
      ang = case when c.status = 'dirigido' then ang else p_ang end
    where id = c.id;
    return case when c.sequestrado then 'recuperado' else 'dono' end;
  end if;
  if c.status <> 'dirigido' or not c.sequestrado then raise exception 'esse veiculo nao e seu'; end if;
  if p.policial or p.prf then
    perform veiculo_na_garagem(c.id);
    update perfis set moedas = moedas + 300 where id = p.id;
    perform avisar(dono, format('🚓 %s recuperou seu veículo roubado. Ele voltou para a garagem.', p.nome));
    return 'policia';
  end if;
  update caminhoes set motorista = p.id, ativo_em = now() where id = c.id;
  return 'ladrao';
end $$;

-- posição enquanto dirige (a cada ~1,5 s); só conta como atividade se andou
create or replace function public.mover_veiculo(p_caminhao bigint, p_x real, p_z real, p_ang real) returns text
language plpgsql security definer set search_path = public as $$
declare c caminhoes%rowtype;
begin
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null or c.status <> 'dirigido' or c.motorista is distinct from auth.uid() then return 'perdeu'; end if;
  update caminhoes set pos_x = p_x, pos_z = p_z, ang = p_ang,
    ativo_em = case when c.pos_x is null or abs(c.pos_x - p_x) + abs(c.pos_z - p_z) > 1.5 then now() else ativo_em end
  where id = c.id;
  return 'ok';
end $$;

-- descer: o dono devolve à garagem na hora; o ladrão abandona (5 min e volta)
create or replace function public.sair_veiculo(p_caminhao bigint, p_x real, p_z real, p_ang real) returns void
language plpgsql security definer set search_path = public as $$
declare c caminhoes%rowtype;
begin
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null or c.status <> 'dirigido' or c.motorista is distinct from auth.uid() then return; end if;
  if not c.sequestrado then perform veiculo_na_garagem(c.id); return; end if;
  update caminhoes set motorista = null, pos_x = p_x, pos_z = p_z, ang = p_ang where id = c.id;
end $$;

-- descarregar a carga roubada num território do clã ou na própria casa
create or replace function public.descarregar_roubo(p_caminhao bigint, p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c caminhoes%rowtype; cla_id bigint; item text; ok boolean;
begin
  p := jogador_livre();
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null or c.status <> 'dirigido' or c.motorista is distinct from p.id or not c.sequestrado then raise exception 'voce nao esta nesse veiculo'; end if;
  if c.carga <= 0 then raise exception 'o veiculo esta vazio'; end if;
  select cla into cla_id from membros_cla where jogador = p.id;
  ok := exists (select 1 from territorios t where cla_id is not null and t.dono_cla = cla_id and abs(t.x - p_x) < 32 and abs(t.z - p_z) < 32)
     or exists (select 1 from casas h where (h.dono = p.id or h.inquilino = p.id) and abs(h.x - p_x) < 25 and abs(h.z - p_z) < 25);
  if not ok then raise exception 'descarregue num territorio do seu cla ou na sua casa'; end if;
  item := c.rota ->> 'produto';
  if item is null then item := 'chocolate'; end if;
  if cla_id is not null then
    execute format('update clas set %I = %I + $1 where id = $2', item, item) using c.carga, cla_id;
  else
    perform dar_item(p.id, item, c.carga);
  end if;
  update caminhoes set carga = 0, ativo_em = now() where id = c.id;
  return c.carga;
end $$;

-- viagens + devolução dos veículos parados há 5 minutos
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
  for c in select * from caminhoes where status = 'dirigido' and coalesce(ativo_em, now() - interval '1 hour') < now() - interval '5 minutes' for update skip locked loop
    perform veiculo_na_garagem(c.id);
    if c.sequestrado then perform avisar((select dono from empresas where id = c.empresa), 'Seu veículo roubado foi abandonado e voltou para a garagem.'); end if;
  end loop;
  perform produzir_robos();
  return n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['atacar_caminhao(bigint, real, real, real)', 'entrar_veiculo(bigint, real, real, real)', 'mover_veiculo(bigint, real, real, real)',
                           'sair_veiculo(bigint, real, real, real)', 'descarregar_roubo(bigint, real, real)', 'processar_caminhoes()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.veiculo_na_garagem(bigint) from public, anon, authenticated;
end $$;
