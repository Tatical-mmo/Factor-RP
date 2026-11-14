-- 86 · BOPE: entrada por indicação e prisão depois de ser abatido. Rode depois do 85c.
--   · Para entrar no BOPE o policial precisa ser indicado pelo General Supremo (administrador) ou por alguém de
--     patente alta: Polícia de Tenente para cima, PRF de Inspetor para cima, Forças Armadas de Tenente para cima.
--   · Quem é abatido pelo BOPE (robôs ou jogadores) volta e é preso. O policial do BOPE que abateu ganha +500.

create table if not exists public.bope_indicacoes (
  alvo  uuid primary key references public.perfis (id) on delete cascade,
  por   uuid references public.perfis (id) on delete set null,
  em    timestamptz not null default now()
);
do $$
begin
  alter table public.bope_indicacoes enable row level security;
  drop policy if exists ler on public.bope_indicacoes;
  create policy ler on public.bope_indicacoes for select to authenticated using (true);
  revoke all on public.bope_indicacoes from anon, authenticated;
  grant select on public.bope_indicacoes to authenticated;
end $$;

-- pode indicar: administrador ou patente alta na Polícia, PRF ou Forças Armadas
create or replace function public.pode_indicar_bope(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = p_id and cargo = 'admin')
      or exists (select 1 from carreiras c where c.jogador = p_id and (
           (c.carreira = 'policia' and c.minutos >= 1320)
        or (c.carreira = 'prf' and c.minutos >= 480)
        or (c.carreira in ('exercito', 'marinha', 'aeronautica') and c.minutos >= 1800)));
$$;

create or replace function public.indicar_bope(p_alvo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a perfis%rowtype;
begin
  p := jogador_livre();
  if not pode_indicar_bope(p.id) then raise exception 'so patente alta indica para o bope'; end if;
  select * into a from perfis where id = p_alvo;
  if a.id is null then raise exception 'jogador nao encontrado'; end if;
  if a.id = p.id and p.cargo <> 'admin' then raise exception 'nao pode indicar a si mesmo'; end if;
  insert into bope_indicacoes (alvo, por) values (a.id, p.id) on conflict (alvo) do update set por = excluded.por, em = now();
  perform avisar(a.id, format('💀 %s indicou você para o BOPE. Vá ao painel Tático (🎯) para entrar.', p.nome));
  return a.nome;
end $$;

-- entrar: policial em serviço, sem crimes e indicado (o administrador entra direto)
create or replace function public.entrar_bope() returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.cargo <> 'admin' then
    if not p.policial then raise exception 'so policiais entram no bope'; end if;
    if p.crimes > 0 then raise exception 'procurado nao pode trabalhar no servico publico'; end if;
    if not exists (select 1 from bope_indicacoes where alvo = p.id) then raise exception 'precisa de indicacao para o bope'; end if;
  end if;
  update perfis set bope = true where id = p.id;
end $$;

-- abatido pelo BOPE e socorrido (ou acordou no hospital): vai preso. Chamado pelo jogo do próprio abatido.
create or replace function public.preso_pelo_bope(p_policial uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare a perfis%rowtype; k perfis%rowtype; minutos integer;
begin
  select * into a from perfis where id = auth.uid() for update;
  if a.id is null or a.cargo <> 'jogador' or a.crimes <= 0 or a.pena_seg > 0 then return 0; end if;
  minutos := least(1440, 7 * power(2, least(a.crimes, 9) - 1))::integer;
  update perfis set pena_seg = minutos * 60, pena_marca = now(), fianca = 2000 * a.crimes, crimes = 0, algemado = false, policial = false,
    cerco_ate = null where id = a.id;
  if p_policial is not null and p_policial <> a.id then
    select * into k from perfis where id = p_policial;
    if k.id is not null and k.bope and k.policial then
      update perfis set moedas = moedas + 500 where id = k.id;
      perform avisar(k.id, format('💀 %s, abatido por você, foi socorrido e preso. +500.', a.nome));
    end if;
  end if;
  return minutos;
end $$;

do $$
declare f text;
begin
  foreach f in array array['indicar_bope(uuid)', 'entrar_bope()', 'preso_pelo_bope(uuid)', 'pode_indicar_bope(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
