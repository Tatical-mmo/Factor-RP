-- Fator RP - helicóptero executivo à venda (o item mais caro do jogo) e caçada do Exército.
-- Helicóptero: 1.500.000 na concessionária, voa e pousa onde o dono quiser (conta no limite de 3 veículos).
-- Caçada: um militar de patente alta (Tenente para cima, ou o General Supremo) autoriza os soldados NPC
-- a caçar um procurado por 10 minutos. Jipes e soldados vão atrás dele e prendem quando alcançam.
-- Rode depois do 34c.

alter table public.carros drop constraint if exists carros_modelo_check;
alter table public.carros add constraint carros_modelo_check check (modelo in ('popular', 'suv', 'esportivo', 'presidencial', 'helicoptero'));

create or replace function public.preco_carro(m text) returns integer language sql immutable as $$
  select case m when 'popular' then 40000 when 'suv' then 95000 when 'esportivo' then 180000 when 'helicoptero' then 1500000 end;
$$;

-- estacionar: agora vale também nas cidades vizinhas e na mata em volta delas
create or replace function public.estacionar_carro(p_carro bigint, p_x real, p_z real, p_ang real) returns void
language plpgsql security definer set search_path = public as $$
begin
  if abs(p_z) > 700 then
    p_x := greatest(-300, least(300, p_x)); p_z := sign(p_z) * greatest(900, least(1170, abs(p_z)));
  else
    p_x := greatest(-430, least(430, p_x)); p_z := greatest(-430, least(430, p_z));
  end if;
  update carros set x = p_x, z = p_z, ang = p_ang
    where id = p_carro and ((dono = auth.uid() and ladrao is null) or ladrao = auth.uid());
  if not found then raise exception 'esse carro nao e seu'; end if;
end $$;

-- ---------------------------------------------------------------- caçada do Exército
create table if not exists public.cacadas (
  alvo  uuid primary key references public.perfis (id) on delete cascade,
  autor uuid references public.perfis (id) on delete set null,
  ate   timestamptz not null
);
do $$
begin
  alter table public.cacadas enable row level security;
  drop policy if exists "leitura publica" on public.cacadas;
  create policy "leitura publica" on public.cacadas for select using (true);
  revoke all on public.cacadas from anon, authenticated;
  grant select on public.cacadas to anon, authenticated;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cacadas') then
    alter publication supabase_realtime add table public.cacadas;
  end if;
end $$;

-- comandante: militar com patente de Tenente (nível 8) para cima, ou o administrador no Exército
create or replace function public.comandante_exercito(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = p and profissao = 'exercito' and not banido
    and (cargo = 'admin' or coalesce((select (patente('exercito', minutos) ->> 'nivel')::integer from carreiras where jogador = p and carreira = 'exercito'), 0) >= 8));
$$;

create or replace function public.ordenar_cacada(p_alvo uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare a perfis%rowtype; eu perfis%rowtype; ate_ timestamptz := now() + interval '10 minutes';
begin
  eu := jogador_livre();
  if not comandante_exercito(eu.id) then raise exception 'so tenente para cima autoriza a cacada'; end if;
  select * into a from perfis where id = p_alvo;
  if a.id is null or a.crimes <= 0 then raise exception 'ele nao e procurado'; end if;
  if a.cargo <> 'jogador' then raise exception 'a equipe nao e cacada'; end if;
  insert into cacadas (alvo, autor, ate) values (p_alvo, eu.id, ate_) on conflict (alvo) do update set autor = excluded.autor, ate = excluded.ate;
  insert into comandos (alvo, autor, tipo, dados) values (p_alvo, eu.id, 'aviso',
    jsonb_build_object('texto', format('🎖️ O Exército recebeu ordem de %s para te caçar! Soldados e jipes estão a caminho.', eu.nome)));
  return ate_;
end $$;

create or replace function public.cancelar_cacada(p_alvo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not comandante_exercito(auth.uid()) then raise exception 'so tenente para cima autoriza a cacada'; end if;
  delete from cacadas where alvo = p_alvo;
end $$;

-- o caçado foi alcançado pelos soldados: vai preso (mesma pena da polícia robô) e a caçada acaba
create or replace function public.preso_pelo_exercito() returns integer
language plpgsql security definer set search_path = public as $$
declare m integer;
begin
  if not exists (select 1 from cacadas where alvo = auth.uid() and ate > now()) then return 0; end if;
  m := preso_por_robo();
  delete from cacadas where alvo = auth.uid();
  return m;
end $$;

do $$
declare f text;
begin
  foreach f in array array['ordenar_cacada(uuid)', 'cancelar_cacada(uuid)', 'preso_pelo_exercito()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.comandante_exercito(uuid) from public, anon, authenticated;
end $$;
