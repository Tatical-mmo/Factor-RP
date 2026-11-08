-- Fator RP - prefeitura (parte 1 de 3): mandato, eleição, salário do prefeito, residência oficial e outdoors.
-- Mandato = 20 ciclos de dia e noite (cada ciclo dura 32 min, igual ao céu do jogo).
-- A campanha para o próximo mandato abre nos últimos 4 ciclos. Com a prefeitura vaga, a campanha fica
-- aberta e, a cada virada de ciclo, o candidato mais votado assume até o fim do mandato atual.
-- Rode 21a, 21b e 21c em ordem.

create or replace function public.ciclo_atual() returns integer language sql stable as $$ select floor(extract(epoch from now()) / 1920)::integer; $$;
create or replace function public.mandato_atual() returns integer language sql stable as $$ select floor(ciclo_atual() / 20.0)::integer; $$;

create table if not exists public.prefeitura (
  id              integer primary key default 1 check (id = 1),
  mandato         integer not null default -1,
  prefeito        uuid references public.perfis (id) on delete set null,
  posse           timestamptz,
  vaga_ciclo      integer not null default -1,   -- ciclo em que a prefeitura ficou vaga
  salario_ciclo   integer not null default -1,   -- último ciclo em que o prefeito recebeu
  cofre           integer not null default 0 check (cofre >= 0),
  salario_policia integer not null default 100 check (salario_policia between 50 and 250),
  motivo          text
);
insert into public.prefeitura (id) values (1) on conflict do nothing;

create table if not exists public.candidatos (
  mandato     integer not null,
  jogador     uuid not null references public.perfis (id) on delete cascade,
  slogan      text not null default '',
  votos       integer not null default 0,
  inscrito_em timestamptz not null default now(),
  primary key (mandato, jogador)
);
create table if not exists public.votos (
  mandato   integer not null,
  eleitor   uuid not null references public.perfis (id) on delete cascade,
  candidato uuid not null,
  primary key (mandato, eleitor)
);
create table if not exists public.outdoors (
  id         integer primary key,
  x          real not null,
  z          real not null,
  anunciante uuid references public.perfis (id) on delete set null,
  titulo     text,
  texto      text,
  tipo       text check (tipo in ('candidato', 'empresa')),
  ate        timestamptz
);
insert into public.outdoors (id, x, z) values
  (1, 12, -115), (2, 12, 115), (3, -154, -116), (4, 155, -116), (5, -27, 44), (6, -27, 10), (7, 75, -936), (8, -75, 936)
on conflict (id) do update set x = excluded.x, z = excluded.z;

create table if not exists public.carros (
  id     bigint generated always as identity primary key,
  dono   uuid references public.perfis (id) on delete cascade,
  modelo text not null check (modelo in ('popular', 'suv', 'esportivo', 'presidencial')),
  cor    text not null default '#c0392b',
  x      real not null default 0,
  z      real not null default 0,
  ang    real not null default 0
);
-- residência oficial (dentro da prefeitura): é do prefeito enquanto durar o mandato
alter table public.casas drop constraint if exists casas_tipo_v2;
alter table public.casas drop constraint if exists casas_tipo_v3;
alter table public.casas add constraint casas_tipo_v3 check (tipo in ('casa', 'apto', 'terreno', 'unidade', 'oficial'));
insert into public.casas (id, x, z, preco, tipo, rotulo) values (9000, -124, -115, 0, 'oficial', 'Residência Oficial')
on conflict (id) do update set x = excluded.x, z = excluded.z, tipo = excluded.tipo, rotulo = excluded.rotulo;

do $$
declare t text;
begin
  foreach t in array array['prefeitura', 'candidatos', 'outdoors'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('create policy "leitura publica" on public.%I for select using (true)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
  alter table public.votos enable row level security;
  drop policy if exists "ve o proprio voto" on public.votos;
  create policy "ve o proprio voto" on public.votos for select to authenticated using (eleitor = auth.uid());
  revoke all on public.votos from anon, authenticated;
  grant select on public.votos to authenticated;
end $$;

-- para qual mandato a campanha está aberta agora (null = fechada)
create or replace function public.mandato_em_campanha() returns integer
language sql stable security definer set search_path = public as $$
  select case when (select prefeito from prefeitura where id = 1) is null and ciclo_atual() % 20 < 16 then mandato_atual()
              when ciclo_atual() % 20 >= 16 then mandato_atual() + 1 end;
$$;

-- tomar posse e deixar o cargo: residência oficial e carro presidencial acompanham o prefeito
create or replace function public.deixar_cargo(p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p is null then return; end if;
  perform devolver_bau(9000, p);
  update casas set dono = null where id = 9000;
  update carros set dono = null, x = -150, z = -119, ang = 0 where modelo = 'presidencial';
end $$;
create or replace function public.assumir_cargo(p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update casas set dono = p where id = 9000;
  update carros set dono = p where modelo = 'presidencial';
  perform avisar(p, 'Você é o novo PREFEITO! Mandato de 20 ciclos, 9.500 por ciclo jogado. A residência oficial e o carro presidencial são seus.');
end $$;

-- aplica o resultado da eleição quando o mandato vira (ou quando a prefeitura está vaga)
create or replace function public.processar_prefeitura() returns void
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; m integer := mandato_atual(); vencedor uuid;
begin
  select * into pf from prefeitura where id = 1 for update;
  if pf.mandato < m then
    perform deixar_cargo(pf.prefeito);
    select jogador into vencedor from candidatos where mandato = m order by votos desc, inscrito_em limit 1;
    update prefeitura set mandato = m, prefeito = vencedor, posse = now(), salario_ciclo = -1, vaga_ciclo = ciclo_atual(),
      motivo = case when vencedor is null then 'sem candidatos' end where id = 1;
    if vencedor is not null then perform assumir_cargo(vencedor); end if;
  elsif pf.prefeito is null and ciclo_atual() > pf.vaga_ciclo and ciclo_atual() % 20 < 16 then
    select jogador into vencedor from candidatos where mandato = m and votos > 0 order by votos desc, inscrito_em limit 1;
    if vencedor is not null then
      update prefeitura set prefeito = vencedor, posse = now(), salario_ciclo = -1, motivo = null where id = 1;
      perform assumir_cargo(vencedor);
    end if;
  end if;
end $$;

create or replace function public.candidatar(p_slogan text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m integer;
begin
  perform processar_prefeitura();
  p := jogador_livre();
  m := mandato_em_campanha();
  if m is null then raise exception 'a campanha ainda nao abriu'; end if;
  if p.crimes > 0 then raise exception 'ficha suja: quem tem crimes nao se candidata'; end if;
  if exists (select 1 from candidatos where mandato = m and jogador = p.id) then raise exception 'voce ja e candidato'; end if;
  update perfis set moedas = moedas - 5000 where id = p.id and moedas >= 5000;
  if not found then raise exception 'moedas insuficientes'; end if;
  update prefeitura set cofre = cofre + 5000 where id = 1;
  insert into candidatos (mandato, jogador, slogan) values (m, p.id, left(coalesce(btrim(p_slogan), ''), 60));
end $$;

create or replace function public.votar(p_candidato uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m integer; antes uuid;
begin
  perform processar_prefeitura();
  p := jogador_livre();
  m := mandato_em_campanha();
  if m is null then raise exception 'nao ha eleicao agora'; end if;
  if not exists (select 1 from candidatos where mandato = m and jogador = p_candidato) then raise exception 'candidato invalido'; end if;
  select candidato into antes from votos where mandato = m and eleitor = p.id;
  if antes = p_candidato then raise exception 'voce ja vota nele'; end if;
  if antes is not null then update candidatos set votos = votos - 1 where mandato = m and jogador = antes; end if;
  insert into votos (mandato, eleitor, candidato) values (m, p.id, p_candidato)
    on conflict (mandato, eleitor) do update set candidato = excluded.candidato;
  update candidatos set votos = votos + 1 where mandato = m and jogador = p_candidato;
end $$;

-- salário do prefeito: 9.500 por ciclo em que ele joga (o jogo pede sozinho)
create or replace function public.salario_prefeito() returns integer
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype;
begin
  perform processar_prefeitura();
  select * into pf from prefeitura where id = 1 for update;
  if pf.prefeito is distinct from auth.uid() or pf.salario_ciclo >= ciclo_atual() then return 0; end if;
  update prefeitura set salario_ciclo = ciclo_atual() where id = 1;
  update perfis set moedas = moedas + 9500 where id = auth.uid();
  return 9500;
end $$;

create or replace function public.renunciar() returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select prefeito from prefeitura where id = 1) is distinct from auth.uid() then raise exception 'voce nao e o prefeito'; end if;
  perform deixar_cargo(auth.uid());
  update prefeitura set prefeito = null, vaga_ciclo = ciclo_atual(), motivo = 'renuncia' where id = 1;
end $$;

do $$
declare f text;
begin
  foreach f in array array['processar_prefeitura()', 'candidatar(text)', 'votar(uuid)', 'salario_prefeito()', 'renunciar()',
                           'mandato_em_campanha()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['deixar_cargo(uuid)', 'assumir_cargo(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
