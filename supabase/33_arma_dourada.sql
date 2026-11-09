-- Fator RP - ARMA DOURADA (PD), arma de evento.
-- O administrador esconde a arma num lugar da cidade. Quem achar pega: são só 2 balas e depois ela some.
-- Quem morre por ela não é socorrido: 7 s depois acorda no cemitério. Administrador e moderadores são imunes.
-- Prefeito atingido perde o mandato na hora. Cada acerto vale 5 crimes para o atirador (mais que qualquer outra arma).
-- Se quem está com a arma morrer, ela cai no chão onde ele estava.

create table if not exists public.arma_pd (
  id         integer primary key default 1 check (id = 1),
  ativa      boolean not null default false,
  x          real,
  z          real,
  dono       uuid references public.perfis (id) on delete set null,
  balas      integer not null default 0,
  atirador   uuid,
  disparo_em timestamptz,
  atualizado timestamptz not null default now()
);
insert into public.arma_pd (id) values (1) on conflict do nothing;
alter table public.perfis add column if not exists pd_morte timestamptz;
alter table public.perfis add column if not exists pd_por   uuid;
do $$
begin
  alter table public.arma_pd enable row level security;
  drop policy if exists "leitura publica" on public.arma_pd;
  create policy "leitura publica" on public.arma_pd for select using (true);
  revoke all on public.arma_pd from anon, authenticated;
  grant select on public.arma_pd to anon, authenticated;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'arma_pd') then
    alter publication supabase_realtime add table public.arma_pd;
  end if;
end $$;

create or replace function public.esconder_arma_pd(p_x real, p_z real) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  update arma_pd set ativa = true, x = p_x, z = p_z, dono = null, balas = 2, atirador = null, disparo_em = null, atualizado = now() where id = 1;
  perform avisar_todos('✨ EVENTO: uma ARMA DOURADA foi escondida em algum lugar da cidade. Quem achar, tem 2 balas…');
end $$;

create or replace function public.pegar_arma_pd(p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a arma_pd%rowtype;
begin
  p := jogador_livre();
  select * into a from arma_pd where id = 1 for update;
  if not a.ativa or a.dono is not null then raise exception 'a arma ja foi pega'; end if;
  if abs(a.x - p_x) > 5 or abs(a.z - p_z) > 5 then raise exception 'chegue mais perto'; end if;
  update arma_pd set dono = p.id, atualizado = now() where id = 1;
  return a.balas;
end $$;

-- um tiro: gasta uma bala; na última a arma some
create or replace function public.disparar_pd() returns integer
language plpgsql security definer set search_path = public as $$
declare a arma_pd%rowtype;
begin
  select * into a from arma_pd where id = 1 for update;
  if not a.ativa or a.dono is distinct from auth.uid() or a.balas <= 0 then raise exception 'voce nao tem a arma dourada'; end if;
  update arma_pd set balas = balas - 1, atirador = auth.uid(), disparo_em = now(), atualizado = now(),
    ativa = balas - 1 > 0, dono = case when balas - 1 > 0 then dono end
  where id = 1;
  return a.balas - 1;
end $$;

-- acerto: confere o tiro recente do atirador; imunidade da equipe; prefeito perde o mandato
create or replace function public.acertar_pd(p_alvo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare a arma_pd%rowtype; v perfis%rowtype; k perfis%rowtype;
begin
  select * into a from arma_pd where id = 1 for update;
  if a.atirador is distinct from auth.uid() or a.disparo_em is null or a.disparo_em < now() - interval '4 seconds' then raise exception 'tiro invalido'; end if;
  update arma_pd set disparo_em = null where id = 1;          -- uma bala, um acerto
  select * into v from perfis where id = p_alvo for update;
  if v.id is null or v.id = auth.uid() then raise exception 'tiro invalido'; end if;
  if v.cargo in ('admin', 'moderador') then return 'imune'; end if;
  select * into k from perfis where id = auth.uid() for update;
  update perfis set pd_morte = now(), pd_por = k.id where id = v.id;
  update perfis set crimes = crimes + 5, policial = false, prf = false, servico_desde = null where id = k.id;
  if (select prefeito from prefeitura where id = 1) = v.id then
    perform deixar_cargo(v.id);
    update prefeitura set prefeito = null, vaga_ciclo = ciclo_atual(), motivo = 'morto pela arma dourada' where id = 1;
    perform avisar_todos(format('☠️ O prefeito %s foi atingido pela ARMA DOURADA e perdeu o mandato! A polícia procura %s.', v.nome, k.nome));
  else
    perform avisar_todos(format('☠️ %s foi atingido pela ARMA DOURADA. A polícia procura %s.', v.nome, k.nome));
  end if;
  return 'morto';
end $$;

-- quem está com a arma morreu: ela cai no chão
create or replace function public.soltar_arma_pd(p_x real, p_z real) returns void
language sql security definer set search_path = public as $$
  update arma_pd set dono = null, x = p_x, z = p_z, atualizado = now() where id = 1 and ativa and dono = auth.uid();
$$;

do $$
declare f text;
begin
  foreach f in array array['esconder_arma_pd(real, real)', 'pegar_arma_pd(real, real)', 'disparar_pd()', 'acertar_pd(uuid)', 'soltar_arma_pd(real, real)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
