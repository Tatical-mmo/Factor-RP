-- Fator RP - painel de administração
-- Cole tudo no Supabase em SQL Editor > New query e toque em Run.
-- Pode rodar de novo sem problema (o script é idempotente).

-- ------------------------------------------------------------ colunas novas
alter table public.perfis
  add column if not exists banido          boolean not null default false,
  add column if not exists banido_motivo   text,
  add column if not exists imortal         boolean not null default false,
  add column if not exists algemado        boolean not null default false,
  add column if not exists pena_seg        integer not null default 0 check (pena_seg >= 0),
  add column if not exists pena_marca      timestamptz,
  add column if not exists poderes         jsonb   not null default '{}'::jsonb,
  add column if not exists salario         integer not null default 0 check (salario >= 0),
  add column if not exists salario_pago_em timestamptz;

-- ------------------------------------------------------------ comandos para um jogador (ex.: teleporte)
create table if not exists public.comandos (
  id        bigint generated always as identity primary key,
  alvo      uuid not null references public.perfis (id) on delete cascade,
  autor     uuid references public.perfis (id) on delete set null,
  tipo      text not null,
  dados     jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
alter table public.comandos enable row level security;
drop policy if exists "ve os proprios comandos" on public.comandos;
create policy "ve os proprios comandos" on public.comandos for select to authenticated using (alvo = auth.uid());
revoke all on public.comandos from anon, authenticated;
grant select on public.comandos to authenticated;

-- ------------------------------------------------------------ histórico de ações da equipe
create table if not exists public.registro_admin (
  id        bigint generated always as identity primary key,
  autor     uuid references public.perfis (id) on delete set null,
  alvo      uuid references public.perfis (id) on delete set null,
  acao      text not null,
  detalhes  jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
alter table public.registro_admin enable row level security;
drop policy if exists "admin ve o historico" on public.registro_admin;
create policy "admin ve o historico" on public.registro_admin for select to authenticated
  using (exists (select 1 from public.perfis p where p.id = auth.uid() and p.cargo = 'admin'));
revoke all on public.registro_admin from anon, authenticated;
grant select on public.registro_admin to authenticated;

-- ------------------------------------------------------------ funções de apoio
-- quem chama tem esse poder? (admin tem todos; moderador só os marcados)
create or replace function public.pode(poder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfis
    where id = auth.uid() and not banido
      and (cargo = 'admin' or (cargo = 'moderador' and coalesce((poderes ->> poder)::boolean, false)))
  );
$$;

create or replace function public.cargo_de(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select cargo from perfis where id = uid;
$$;

-- moderador só age em jogador; admin age em jogador e moderador, nunca em outro admin
create or replace function public.pode_agir_em(alvo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case cargo_de(auth.uid())
    when 'admin' then coalesce(cargo_de(alvo), 'admin') <> 'admin'
    when 'moderador' then coalesce(cargo_de(alvo), 'admin') = 'jogador'
    else false end;
$$;

create or replace function public.registrar(alvo uuid, acao text, detalhes jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into registro_admin (autor, alvo, acao, detalhes) values (auth.uid(), alvo, acao, detalhes);
$$;

-- ------------------------------------------------------------ ações da equipe
create or replace function public.admin_moedas(alvo uuid, valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare novo integer;
begin
  if not pode('moedas') then raise exception 'sem permissao'; end if;
  if alvo = auth.uid() then
    if cargo_de(auth.uid()) <> 'admin' then raise exception 'moderador nao muda as proprias moedas'; end if;
  elsif not pode_agir_em(alvo) then raise exception 'voce nao pode mudar as moedas desse jogador'; end if;
  if abs(valor) > 10000000 then raise exception 'valor muito alto'; end if;
  update perfis set moedas = greatest(0, moedas + valor) where id = alvo returning moedas into novo;
  if novo is null then raise exception 'jogador nao encontrado'; end if;
  perform registrar(alvo, 'moedas', jsonb_build_object('valor', valor, 'saldo', novo));
  return novo;
end $$;

create or replace function public.admin_banir(alvo uuid, motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode('banir') then raise exception 'sem permissao'; end if;
  if not pode_agir_em(alvo) then raise exception 'voce nao pode banir esse jogador'; end if;
  update perfis set banido = true, banido_motivo = left(coalesce(motivo, ''), 200), algemado = false where id = alvo;
  perform registrar(alvo, 'banir', jsonb_build_object('motivo', motivo));
end $$;

create or replace function public.admin_desbanir(alvo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode('banir') then raise exception 'sem permissao'; end if;
  if not pode_agir_em(alvo) then raise exception 'voce nao pode desbanir esse jogador'; end if;
  update perfis set banido = false, banido_motivo = null where id = alvo;
  perform registrar(alvo, 'desbanir');
end $$;

create or replace function public.admin_algemar(alvo uuid, ligado boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode('algemar') then raise exception 'sem permissao'; end if;
  if not pode_agir_em(alvo) then raise exception 'voce nao pode algemar esse jogador'; end if;
  if ligado and cargo_de(alvo) <> 'jogador' then raise exception 'algemas nao funcionam na equipe'; end if;
  update perfis set algemado = ligado where id = alvo;
  perform registrar(alvo, case when ligado then 'algemar' else 'soltar_algemas' end);
end $$;

create or replace function public.admin_prender(alvo uuid, minutos integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode('prender') then raise exception 'sem permissao'; end if;
  if not pode_agir_em(alvo) then raise exception 'voce nao pode prender esse jogador'; end if;
  if minutos > 0 and cargo_de(alvo) <> 'jogador' then raise exception 'a equipe nao pode ser presa'; end if;
  if minutos < 0 or minutos > 1440 then raise exception 'tempo invalido'; end if;
  update perfis set pena_seg = minutos * 60, pena_marca = now(), algemado = false where id = alvo;
  perform registrar(alvo, case when minutos > 0 then 'prender' else 'soltar' end, jsonb_build_object('minutos', minutos));
end $$;

create or replace function public.admin_teleporte(alvo uuid, x real, z real) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode('teleportar') then raise exception 'sem permissao'; end if;
  if alvo <> auth.uid() and not pode_agir_em(alvo) then raise exception 'voce nao pode mover esse jogador'; end if;
  insert into comandos (alvo, autor, tipo, dados) values (alvo, auth.uid(), 'teleporte', jsonb_build_object('x', x, 'z', z));
  perform registrar(alvo, 'teleporte', jsonb_build_object('x', x, 'z', z));
end $$;

-- só o admin nomeia moderadores e define poderes e salário
create or replace function public.admin_definir_cargo(alvo uuid, novo_cargo text, novos_poderes jsonb, novo_salario integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if cargo_de(auth.uid()) <> 'admin' then raise exception 'so o administrador pode fazer isso'; end if;
  if alvo = auth.uid() then raise exception 'voce nao pode mudar o proprio cargo'; end if;
  if novo_cargo not in ('jogador', 'moderador') then raise exception 'cargo invalido'; end if;
  if cargo_de(alvo) = 'admin' then raise exception 'nao e possivel mudar outro administrador'; end if;
  update perfis set
    cargo = novo_cargo,
    poderes = case when novo_cargo = 'moderador' then coalesce(novos_poderes, '{}'::jsonb) else '{}'::jsonb end,
    salario = case when novo_cargo = 'moderador' then greatest(0, least(coalesce(novo_salario, 0), 1000000)) else 0 end,
    -- quem volta a ser jogador perde a skin de robô
    personagem = case when novo_cargo = 'jogador' and personagem in ('Rusty_Scout_Bot', 'Rustbolt_Sentinel') then 'Urban_Explorer' else personagem end
  where id = alvo;
  perform registrar(alvo, 'cargo', jsonb_build_object('cargo', novo_cargo, 'poderes', novos_poderes, 'salario', novo_salario));
end $$;

-- ------------------------------------------------------------ ações da própria equipe sobre si
create or replace function public.staff_skin(novo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(cargo_de(auth.uid()), 'jogador') = 'jogador' then raise exception 'so a equipe troca de skin de graca'; end if;
  if novo not in ('Rusty_Scout_Bot','Rustbolt_Sentinel',
    'Autumn_Traveler','Bandaged_Trailblazer','Bandit_Brave','Curly_Wanderer','Desert_Scout_Ava',
    'Desert_Warden','Dustbound_Scout','Dustveil_Scout','Friendly_Village_Blacksmith','Grimbeard_the_Ironclad',
    'Hooded_Paw_Guardian','Mustached_Explorer','Patchwork_Scout','Shadow_Scout','The_Frightened_Escapee',
    'Urban_Explorer','Urban_Wanderer') then raise exception 'skin invalida'; end if;
  update perfis set personagem = novo where id = auth.uid();
end $$;

create or replace function public.staff_imortal(ligado boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode('imortal') then raise exception 'sem permissao'; end if;
  update perfis set imortal = ligado where id = auth.uid();
end $$;

-- ------------------------------------------------------------ ações do próprio jogador
-- a pena só diminui enquanto o jogador está online (no máximo 20 s por chamada)
create or replace function public.cumprir_pena() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; passou integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.pena_seg <= 0 then return 0; end if;
  passou := least(20, greatest(0, floor(extract(epoch from (now() - coalesce(p.pena_marca, now()))))))::integer;
  update perfis set pena_seg = greatest(0, pena_seg - passou), pena_marca = now() where id = auth.uid()
    returning pena_seg into passou;
  return passou;
end $$;

-- salário do moderador: uma vez a cada 24 horas, ao entrar no jogo
create or replace function public.receber_salario() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.cargo <> 'moderador' or p.salario <= 0 or p.banido then return 0; end if;
  if p.salario_pago_em is not null and p.salario_pago_em > now() - interval '24 hours' then return 0; end if;
  update perfis set moedas = moedas + p.salario, salario_pago_em = now() where id = auth.uid();
  return p.salario;
end $$;

-- ------------------------------------------------------------ permissões das funções
do $$
declare f text;
begin
  foreach f in array array[
    'pode(text)', 'cargo_de(uuid)', 'pode_agir_em(uuid)', 'registrar(uuid, text, jsonb)',
    'admin_moedas(uuid, integer)', 'admin_banir(uuid, text)', 'admin_desbanir(uuid)', 'admin_algemar(uuid, boolean)',
    'admin_prender(uuid, integer)', 'admin_teleporte(uuid, real, real)', 'admin_definir_cargo(uuid, text, jsonb, integer)',
    'staff_skin(text)', 'staff_imortal(boolean)', 'cumprir_pena()', 'receber_salario()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
-- 'registrar' é interna: ninguém chama direto
revoke execute on function public.registrar(uuid, text, jsonb) from authenticated;

-- ------------------------------------------------------------ tempo real para perfis e comandos
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'perfis') then
    alter publication supabase_realtime add table public.perfis;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'comandos') then
    alter publication supabase_realtime add table public.comandos;
  end if;
end $$;
