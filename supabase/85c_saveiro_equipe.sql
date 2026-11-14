-- 85c (parte 3 de 3) · Saveiro e Saveiro com som, carros estacionam na ilha toda e equipe invisível. Rode depois do 85b.

-- ------------------------------------------------------------ Saveiro (concessionária) e o som
alter table public.carros drop constraint if exists carros_modelo_check;
alter table public.carros add constraint carros_modelo_check
  check (modelo in ('popular', 'suv', 'esportivo', 'presidencial', 'helicoptero', 'classico', 'saveiro', 'saveiro_som'));
create or replace function public.preco_carro(m text) returns integer language sql immutable as $$
  select case m when 'popular' then 40000 when 'suv' then 95000 when 'esportivo' then 180000
                when 'classico' then 1000000 when 'helicoptero' then 1500000
                when 'saveiro' then 55000 when 'saveiro_som' then 150000 end;
$$;
-- estacionar: agora vale a ilha inteira (favelas, cidades vizinhas), não só a metrópole
create or replace function public.estacionar_carro(p_carro bigint, p_x real, p_z real, p_ang real) returns void
language plpgsql security definer set search_path = public as $$
begin
  update carros set x = greatest(-1000, least(1100, p_x)), z = greatest(-1528, least(1112, p_z)), ang = p_ang
    where id = p_carro and dono = auth.uid();
  if not found then raise exception 'esse carro nao e seu'; end if;
end $$;

create table if not exists public.som_saveiro (
  id      bigint generated always as identity primary key,
  jogador uuid not null references public.perfis (id) on delete cascade,
  url     text not null,
  texto   text,
  em      timestamptz not null default now()
);
do $$
begin
  alter table public.som_saveiro enable row level security;
  drop policy if exists equipe on public.som_saveiro;
  create policy equipe on public.som_saveiro for select to authenticated
    using (exists (select 1 from perfis a where a.id = auth.uid() and a.cargo in ('admin', 'moderador')));
end $$;
create or replace function public.registrar_som(p_url text, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if not exists (select 1 from carros where dono = p.id and modelo = 'saveiro_som') then raise exception 'precisa de uma saveiro com som'; end if;
  if p_url is null or p_url !~ '^https://' or char_length(p_url) > 400 then raise exception 'link invalido (use https)'; end if;
  insert into som_saveiro (jogador, url, texto) values (p.id, p_url, left(p_texto, 60));
end $$;
create or replace function public.sons_recentes() returns table (id bigint, jogador uuid, nome text, url text, texto text, em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis a where a.id = auth.uid() and a.cargo in ('admin', 'moderador')) then raise exception 'sem permissao'; end if;
  return query select s.id, s.jogador, p.nome, s.url, s.texto, s.em from som_saveiro s join perfis p on p.id = s.jogador order by s.em desc limit 40;
end $$;

-- ------------------------------------------------------------ equipe invisível
create or replace function public.staff_invisivel(ligado boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode('invisivel') then raise exception 'sem permissao'; end if;
  update perfis set invisivel = ligado where id = auth.uid();
end $$;


do $$
declare f text;
begin
  foreach f in array array['estacionar_carro(bigint, real, real, real)', 'registrar_som(text, text)', 'sons_recentes()', 'staff_invisivel(boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
