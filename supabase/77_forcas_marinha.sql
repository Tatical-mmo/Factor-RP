-- Fator RP - Forças Armadas (Exército, Marinha, Aeronáutica) e míssil de cruzeiro da Marinha. Rode depois do 76.
-- O General Supremo (administrador) define a Força de cada militar. Os caças são só da Aeronáutica.
-- O míssil de cruzeiro: um General da Marinha pede (alvo no mapa) e o General Supremo autoriza; o admin pode lançar direto.
-- Espera de 10 min entre lançamentos; o pedido vence em 10 min.

alter table public.perfis add column if not exists forca text not null default 'exercito';
do $$ begin
  alter table public.perfis add constraint perfis_forca_ok check (forca in ('exercito', 'marinha', 'aeronautica'));
exception when duplicate_object then null; end $$;

create or replace function public.definir_forca(p_jogador uuid, p_forca text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis where id = auth.uid() and cargo = 'admin') then raise exception 'so o general supremo'; end if;
  if p_forca not in ('exercito', 'marinha', 'aeronautica') then raise exception 'forca invalida'; end if;
  update perfis set forca = p_forca where id = p_jogador and profissao = 'exercito';
  if not found then raise exception 'so militares do exercito'; end if;
  insert into comandos (alvo, autor, tipo, dados) values (p_jogador, auth.uid(), 'aviso', jsonb_build_object('texto',
    '🎖️ O General Supremo transferiu você para a ' || case p_forca when 'marinha' then 'Marinha ⚓' when 'aeronautica' then 'Aeronáutica ✈️' else 'Exército 🪖' end || '.'));
end $$;

create table if not exists public.missil_pedidos (
  id bigint generated always as identity primary key,
  autor uuid not null references public.perfis (id) on delete cascade,
  autor_nome text not null,
  x real not null, z real not null,
  status text not null default 'pendente' check (status in ('pendente', 'lancado', 'recusado', 'vencido')),
  criado timestamptz not null default now(),
  decidido_por uuid, decidido_em timestamptz
);
alter table public.missil_pedidos enable row level security;   -- só pelas funções

create or replace function public.general_marinha(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis p join carreiras c on c.jogador = p.id and c.carreira = 'exercito'
                 where p.id = p_uid and p.profissao = 'exercito' and p.forca = 'marinha' and c.minutos >= 7200);
$$;

-- pede (General da Marinha) ou lança direto (General Supremo). Devolve o status.
create or replace function public.pedir_missil(p_x real, p_z real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare adm boolean; v_nome text; ult timestamptz; novo bigint;
begin
  select cargo = 'admin', perfis.nome into adm, v_nome from perfis where id = auth.uid();
  if not coalesce(adm, false) and not general_marinha(auth.uid()) then raise exception 'so general da marinha'; end if;
  if abs(p_x) > 1400 or abs(p_z) > 1500 then raise exception 'alvo fora do mapa'; end if;
  select max(decidido_em) into ult from missil_pedidos where status = 'lancado';
  if ult is not null and ult > now() - interval '10 minutes' then raise exception 'missil recarregando'; end if;
  update missil_pedidos set status = 'vencido' where status = 'pendente' and criado < now() - interval '10 minutes';
  if adm then
    insert into missil_pedidos (autor, autor_nome, x, z, status, decidido_por, decidido_em) values (auth.uid(), v_nome, p_x, p_z, 'lancado', auth.uid(), now()) returning id into novo;
    return jsonb_build_object('status', 'lancado', 'id', novo);
  end if;
  if exists (select 1 from missil_pedidos where status = 'pendente') then raise exception 'ja tem pedido esperando'; end if;
  insert into missil_pedidos (autor, autor_nome, x, z) values (auth.uid(), v_nome, p_x, p_z) returning id into novo;
  insert into comandos (alvo, autor, tipo, dados) select perfis.id, auth.uid(), 'aviso', jsonb_build_object('texto', '🚀 ' || v_nome || ' pediu autorização para lançar um míssil de cruzeiro. Decida no ☰ › Míssil da Marinha.')
    from perfis where cargo = 'admin';
  return jsonb_build_object('status', 'pendente', 'id', novo);
end $$;

create or replace function public.missil_pendente() returns table (id bigint, autor_nome text, x real, z real, criado timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis where perfis.id = auth.uid() and cargo = 'admin') then raise exception 'so o general supremo'; end if;
  return query select m.id, m.autor_nome, m.x, m.z, m.criado from missil_pedidos m where m.status = 'pendente' and m.criado > now() - interval '10 minutes' order by m.id desc limit 5;
end $$;

-- o General Supremo autoriza (lança) ou recusa
create or replace function public.decidir_missil(p_id bigint, p_lancar boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m missil_pedidos%rowtype; ult timestamptz;
begin
  if not exists (select 1 from perfis where id = auth.uid() and cargo = 'admin') then raise exception 'so o general supremo'; end if;
  select * into m from missil_pedidos where missil_pedidos.id = p_id and status = 'pendente' and criado > now() - interval '10 minutes' for update;
  if not found then raise exception 'pedido invalido'; end if;
  if p_lancar then
    select max(decidido_em) into ult from missil_pedidos where status = 'lancado';
    if ult is not null and ult > now() - interval '10 minutes' then raise exception 'missil recarregando'; end if;
  end if;
  update missil_pedidos set status = case when p_lancar then 'lancado' else 'recusado' end, decidido_por = auth.uid(), decidido_em = now() where missil_pedidos.id = p_id;
  insert into comandos (alvo, autor, tipo, dados) values (m.autor, auth.uid(), 'aviso', jsonb_build_object('texto',
    case when p_lancar then '🚀 O General Supremo AUTORIZOU: míssil de cruzeiro lançado!' else '❌ O General Supremo recusou o lançamento do míssil.' end));
  return jsonb_build_object('x', m.x, 'z', m.z, 'autor', m.autor_nome);
end $$;

-- registro para o painel do admin
create or replace function public.missil_historico() returns table (autor_nome text, x real, z real, status text, criado timestamptz, decidido_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis where perfis.id = auth.uid() and cargo = 'admin') then raise exception 'so o general supremo'; end if;
  return query select m.autor_nome, m.x, m.z, m.status, m.criado, m.decidido_em from missil_pedidos m order by m.id desc limit 20;
end $$;

do $$
declare f text;
begin
  foreach f in array array['definir_forca(uuid, text)', 'general_marinha(uuid)', 'pedir_missil(real, real)', 'missil_pendente()', 'decidir_missil(bigint, boolean)', 'missil_historico()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
