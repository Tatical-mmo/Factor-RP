-- Fator RP - imóveis que evoluem (parte 1 de 2): estrutura, evolução e regras de moradia.
-- No terreno: 1 casa -> 2 casa ampliada -> 3 condomínio (4 unidades) -> 4 prédio pequeno (8) -> 5 prédio grande (20).
-- Cada unidade é uma linha em casas (tipo 'unidade', pai = terreno). O dono do prédio define aluguel
-- por dia e/ou preço de venda de cada unidade. Rode 14a e depois 14b.

alter table public.casas add column if not exists pai       integer references public.casas (id) on delete cascade;
alter table public.casas add column if not exists nivel     integer not null default 1;
alter table public.casas add column if not exists inquilino uuid references public.perfis (id) on delete set null;
alter table public.casas add column if not exists aluguel   integer;
alter table public.casas add column if not exists pago_ate  timestamptz;
alter table public.casas add column if not exists a_venda   boolean not null default false;
alter table public.casas drop constraint if exists casas_tipo_v1;
alter table public.casas drop constraint if exists casas_tipo_v2;
alter table public.casas add constraint casas_tipo_v2 check (tipo in ('casa', 'apto', 'terreno', 'unidade'));
alter table public.casas drop constraint if exists casas_nivel_v1;
alter table public.casas add constraint casas_nivel_v1 check (nivel between 1 and 5);
alter table public.casas drop constraint if exists casas_aluguel_v1;
alter table public.casas add constraint casas_aluguel_v1 check (aluguel is null or aluguel between 50 and 50000);

-- quem mora: dono ou inquilino com aluguel em dia
create or replace function public.mora_em(c public.casas, p uuid) returns boolean
language sql stable as $$ select c.dono = p or (c.inquilino = p and c.pago_ate > now()); $$;

create or replace function public.moradia(p_casa integer) returns public.casas
language plpgsql stable security definer set search_path = public as $$
declare c casas%rowtype;
begin
  select * into c from casas where id = p_casa;
  if c.id is null or not coalesce(mora_em(c, auth.uid()), false) then raise exception 'essa moradia nao e sua'; end if;
  return c;
end $$;

create or replace function public.total_moradias(p uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from casas where dono = p or (inquilino = p and pago_ate > now());
$$;

-- o baú também aparece para quem aluga
drop policy if exists "dono ve o bau" on public.bau;
create policy "dono ve o bau" on public.bau for select to authenticated
  using (exists (select 1 from public.casas c where c.id = casa and (c.dono = auth.uid() or (c.inquilino = auth.uid() and c.pago_ate > now()))));

-- custo para evoluir o imóvel e unidades de cada estágio
create or replace function public.imovel(p_nivel integer, item text) returns integer
language sql immutable as $$
  select case item
    when 'evoluir'  then (array[60000, 150000, 350000, 800000, null])[p_nivel]
    when 'unidades' then (array[0, 0, 4, 8, 20])[p_nivel]
  end;
$$;

create or replace function public.evoluir_imovel(p_casa integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c casas%rowtype; custo integer; n integer; k integer;
begin
  select * into c from casas where id = p_casa and dono = auth.uid() for update;
  if c.id is null or c.tipo <> 'terreno' then raise exception 'so imoveis em terreno evoluem'; end if;
  if c.modelo is null then raise exception 'construa a casa primeiro'; end if;
  if c.nivel >= 5 then raise exception 'nivel maximo'; end if;
  custo := imovel(c.nivel, 'evoluir');
  update perfis set moedas = moedas - custo where id = auth.uid() and moedas >= custo;
  if not found then raise exception 'moedas insuficientes'; end if;
  update casas set nivel = nivel + 1 where id = c.id;
  n := imovel(c.nivel + 1, 'unidades');
  for k in 1..n loop
    insert into casas (id, x, z, preco, tipo, rotulo, pai)
      values (10000 + c.id * 100 + k, c.x, c.z, 0, 'unidade', format('%s · Apto %s', c.rotulo, k), c.id)
    on conflict (id) do nothing;
  end loop;
  return c.nivel + 1;
end $$;

-- comprar casa/apartamento/terreno do sistema: limite de 3 moradias (contando aluguéis)
create or replace function public.comprar_casa(p_casa integer) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c casas%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if total_moradias(p.id) >= 3 then raise exception 'limite de 3 moradias'; end if;
  select * into c from casas where id = p_casa for update;
  if c.id is null or c.tipo = 'unidade' then raise exception 'casa invalida'; end if;
  if c.dono is not null then raise exception 'casa ja vendida'; end if;
  if p.moedas < c.preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - c.preco where id = p.id;
  update casas set dono = p.id where id = c.id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['evoluir_imovel(integer)', 'comprar_casa(integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['moradia(integer)', 'total_moradias(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
