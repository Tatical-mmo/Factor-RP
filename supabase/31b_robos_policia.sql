-- Fator RP - polícia robô vista por todos.
-- 12 policiais a pé e 4 viaturas patrulham a cidade num trajeto fixo pelo relógio do servidor (todos veem
-- o mesmo). Quando um robô persegue, cerca uma casa ou é derrubado, o jogo de quem está envolvido grava o
-- estado aqui e todos os outros jogadores veem a mesma cena.

create table if not exists public.robos_policia (
  id         integer primary key,
  tipo       text not null check (tipo in ('pe', 'viatura')),
  estado     text not null default 'patrulha' check (estado in ('patrulha', 'perseguindo', 'cerco', 'caido')),
  alvo       uuid,
  x          real,
  z          real,
  ang        real,
  ate        timestamptz,
  atualizado timestamptz not null default now()
);
insert into public.robos_policia (id, tipo) select g, case when g <= 12 then 'pe' else 'viatura' end from generate_series(1, 16) g
  on conflict (id) do nothing;
do $$
begin
  alter table public.robos_policia enable row level security;
  drop policy if exists "leitura publica" on public.robos_policia;
  create policy "leitura publica" on public.robos_policia for select using (true);
  revoke all on public.robos_policia from anon, authenticated;
  grant select on public.robos_policia to anon, authenticated;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'robos_policia') then
    alter publication supabase_realtime add table public.robos_policia;
  end if;
end $$;

create or replace function public.robo_atualizar(p_id integer, p_estado text, p_alvo uuid, p_x real, p_z real, p_ang real, p_segundos integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sem permissao'; end if;
  if p_estado not in ('patrulha', 'perseguindo', 'cerco', 'caido') then raise exception 'estado invalido'; end if;
  update robos_policia set estado = p_estado, alvo = case when p_estado = 'patrulha' then null else p_alvo end,
    x = p_x, z = p_z, ang = p_ang, ate = case when p_segundos > 0 then now() + make_interval(secs => least(p_segundos, 1920)) end, atualizado = now()
  where id = p_id;
end $$;

do $$
begin
  revoke all on function public.robo_atualizar(integer, text, uuid, real, real, real, integer) from public, anon;
  grant execute on function public.robo_atualizar(integer, text, uuid, real, real, real, integer) to authenticated;
end $$;
