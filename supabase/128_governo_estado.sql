-- 128: Governo do Estado (etapa 4 das cidades novas). Rode depois do 127.
--  · Governador eleito pelo voto, no painel em frente à Sede do Governo (no continente). Mandato e campanha seguem
--    o relógio da prefeitura: 20 ciclos, campanha nos últimos 4 (com o governo vago, a campanha fica aberta e o mais
--    votado assume na virada do ciclo). Candidatura: 10.000 (vai para o cofre do Estado); ficha suja não se candidata.
--  · Salário do governador sai do cofre do Estado (pedágio + candidaturas), até 12.000 por ciclo jogado.
--  · Veículos oficiais do governo: carro presidencial azul-marinho e helicóptero, que ficam com o governador.
--  · Até 5 seguranças nomeados pelo governador.

create table if not exists public.governo (
  id integer primary key default 1 check (id = 1),
  mandato integer not null default -1,
  governador uuid references public.perfis (id) on delete set null,
  posse timestamptz, vaga_ciclo integer not null default -1, salario_ciclo integer not null default -1, motivo text,
  seg1 uuid references public.perfis (id) on delete set null, seg2 uuid references public.perfis (id) on delete set null,
  seg3 uuid references public.perfis (id) on delete set null, seg4 uuid references public.perfis (id) on delete set null,
  seg5 uuid references public.perfis (id) on delete set null
);
insert into public.governo (id) values (1) on conflict do nothing;
create table if not exists public.candidatos_gov (
  mandato integer not null, jogador uuid not null references public.perfis (id) on delete cascade,
  slogan text not null default '', votos integer not null default 0, inscrito_em timestamptz not null default now(),
  primary key (mandato, jogador)
);
create table if not exists public.votos_gov (
  mandato integer not null, eleitor uuid not null references public.perfis (id) on delete cascade, candidato uuid not null,
  primary key (mandato, eleitor)
);
do $$
begin
  alter table public.governo enable row level security;
  drop policy if exists "leitura publica" on public.governo;
  create policy "leitura publica" on public.governo for select using (true);
  alter table public.candidatos_gov enable row level security;
  drop policy if exists "leitura publica" on public.candidatos_gov;
  create policy "leitura publica" on public.candidatos_gov for select using (true);
  alter table public.votos_gov enable row level security;
  drop policy if exists "meu voto" on public.votos_gov;
  create policy "meu voto" on public.votos_gov for select using (eleitor = auth.uid());
  revoke all on public.governo, public.candidatos_gov, public.votos_gov from anon, authenticated;
  grant select on public.governo, public.candidatos_gov, public.votos_gov to authenticated;
  grant select on public.governo, public.candidatos_gov to anon;
end $$;

-- veículos oficiais: a coluna "oficial" separa os do governo dos do prefeito
alter table public.carros add column if not exists oficial text;
insert into public.carros (dono, modelo, cor, x, z, ang, oficial)
  select null, 'presidencial', '#0b1a3a', -170, -2955, 0, 'governo' where not exists (select 1 from carros where oficial = 'governo' and modelo = 'presidencial');
insert into public.carros (dono, modelo, cor, x, z, ang, oficial)
  select null, 'helicoptero', '#0b1a3a', -400, -2945, 0, 'governo' where not exists (select 1 from carros where oficial = 'governo' and modelo = 'helicoptero');

-- o carro presidencial do prefeito não pode mais pegar o do governo
create or replace function public.deixar_cargo(p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p is null then return; end if;
  perform devolver_bau(9000, p);
  update casas set dono = null where id = 9000;
  update carros set dono = null, x = -150, z = -119, ang = 0 where modelo = 'presidencial' and oficial is null;
end $$;
create or replace function public.assumir_cargo(p uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update casas set dono = p where id = 9000;
  update carros set dono = p where modelo = 'presidencial' and oficial is null;
  perform avisar(p, 'Você é o novo PREFEITO! Mandato de 20 ciclos, 9.500 por ciclo jogado. A residência oficial e o carro presidencial são seus.');
end $$;
update public.carros set dono = (select prefeito from prefeitura where id = 1) where modelo = 'presidencial' and oficial is null;

create or replace function public.campanha_gov() returns integer
language sql stable as $$
  select case when ciclo_atual() % 20 >= 16 then mandato_atual() + 1
              when (select governador from governo where id = 1) is null then mandato_atual() end;
$$;

create or replace function public.processar_governo() returns void
language plpgsql security definer set search_path = public as $$
declare g governo%rowtype; m integer := mandato_atual(); vencedor uuid;
begin
  select * into g from governo where id = 1 for update;
  if g.mandato < m then
    select jogador into vencedor from candidatos_gov where mandato = m order by votos desc, inscrito_em limit 1;
    update carros set dono = vencedor, x = case when vencedor is null then (case modelo when 'helicoptero' then -400 else -170 end) else x end,
      z = case when vencedor is null then (case modelo when 'helicoptero' then -2945 else -2955 end) else z end where oficial = 'governo';
    update governo set mandato = m, governador = vencedor, posse = now(), salario_ciclo = -1, vaga_ciclo = ciclo_atual(),
      motivo = case when vencedor is null then 'sem candidatos' end, seg1 = null, seg2 = null, seg3 = null, seg4 = null, seg5 = null where id = 1;
    if vencedor is not null then
      perform avisar(vencedor, 'Você é o novo GOVERNADOR do Estado! Carro oficial e helicóptero são seus (garagem). Nomeie até 5 seguranças no painel da Sede.');
      perform avisar_todos(format('🏛️ %s é o novo Governador do Estado!', (select nome from perfis where id = vencedor)));
    end if;
  elsif g.governador is null and ciclo_atual() > g.vaga_ciclo and ciclo_atual() % 20 < 16 then
    select jogador into vencedor from candidatos_gov where mandato = m and votos > 0 order by votos desc, inscrito_em limit 1;
    if vencedor is not null then
      update governo set governador = vencedor, posse = now(), salario_ciclo = -1, motivo = null where id = 1;
      update carros set dono = vencedor where oficial = 'governo';
      perform avisar(vencedor, 'Você é o novo GOVERNADOR do Estado! Carro oficial e helicóptero são seus (garagem). Nomeie até 5 seguranças no painel da Sede.');
      perform avisar_todos(format('🏛️ %s é o novo Governador do Estado!', (select nome from perfis where id = vencedor)));
    end if;
  end if;
end $$;

create or replace function public.candidatar_governador(p_slogan text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m integer;
begin
  perform processar_governo();
  p := jogador_livre();
  m := campanha_gov();
  if m is null then raise exception 'a campanha ainda nao abriu'; end if;
  if p.crimes > 0 then raise exception 'ficha suja: quem tem crimes nao se candidata'; end if;
  if exists (select 1 from candidatos_gov where mandato = m and jogador = p.id) then raise exception 'voce ja e candidato'; end if;
  update perfis set moedas = moedas - 10000 where id = p.id and moedas >= 10000;
  if not found then raise exception 'moedas insuficientes'; end if;
  update estado_cofre set saldo = saldo + 10000 where id = 1;
  insert into candidatos_gov (mandato, jogador, slogan) values (m, p.id, left(coalesce(btrim(p_slogan), ''), 60));
end $$;

create or replace function public.votar_governador(p_candidato uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m integer;
begin
  p := jogador_livre();
  m := campanha_gov();
  if m is null then raise exception 'a campanha ainda nao abriu'; end if;
  if not exists (select 1 from candidatos_gov where mandato = m and jogador = p_candidato) then raise exception 'candidato invalido'; end if;
  if exists (select 1 from votos_gov where mandato = m and eleitor = p.id) then raise exception 'voce ja votou'; end if;
  insert into votos_gov (mandato, eleitor, candidato) values (m, p.id, p_candidato);
  update candidatos_gov set votos = votos + 1 where mandato = m and jogador = p_candidato;
end $$;

create or replace function public.salario_governador() returns integer
language plpgsql security definer set search_path = public as $$
declare g governo%rowtype; v integer;
begin
  perform processar_governo();
  select * into g from governo where id = 1 for update;
  if g.governador is distinct from auth.uid() or g.salario_ciclo >= ciclo_atual() then return 0; end if;
  select least(12000, saldo)::integer into v from estado_cofre where id = 1 for update;
  update governo set salario_ciclo = ciclo_atual() where id = 1;
  if v <= 0 then return 0; end if;
  update estado_cofre set saldo = saldo - v where id = 1;
  update perfis set moedas = moedas + v where id = auth.uid();
  return v;
end $$;

-- governador nomeia (ou tira, com p_jogador nulo) um segurança na vaga 1 a 5
create or replace function public.nomear_seguranca_gov(p_vaga integer, p_jogador uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select governador from governo where id = 1) is distinct from auth.uid() then raise exception 'so o governador'; end if;
  if p_vaga not between 1 and 5 then raise exception 'vaga invalida'; end if;
  if p_jogador is not null and p_jogador in (select unnest(array[seg1, seg2, seg3, seg4, seg5]) from governo where id = 1) then raise exception 'ja e seguranca'; end if;
  execute format('update governo set seg%s = $1 where id = 1', p_vaga) using p_jogador;
  if p_jogador is not null then perform avisar(p_jogador, '🕴️ Você foi nomeado SEGURANÇA do Governador do Estado.'); end if;
end $$;

revoke all on function public.processar_governo(), public.candidatar_governador(text), public.votar_governador(uuid), public.salario_governador(), public.nomear_seguranca_gov(integer, uuid) from public, anon;
grant execute on function public.processar_governo(), public.candidatar_governador(text), public.votar_governador(uuid), public.salario_governador(), public.nomear_seguranca_gov(integer, uuid) to authenticated;
notify pgrst, 'reload schema';
