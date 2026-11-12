-- 62a · Segurança na aviação: paraquedas, foco de incêndio onde um avião/helicóptero cai e revisão da frota.
-- Rode depois do 61. Depois rode o 62b (profissão de mecânico).

-- ---------------------------------------------------------------- paraquedas (5.000 no balcão do aeroporto)
insert into public.precos (item, nome, compra, venda, fome) values ('paraquedas', 'Paraquedas', null, null, 0)
on conflict (item) do update set nome = excluded.nome;

create or replace function public.comprar_paraquedas() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.moedas < 5000 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 5000 where id = p.id;
  return dar_item(p.id, 'paraquedas', 1);
end $$;

create or replace function public.usar_paraquedas() returns integer
language plpgsql security definer set search_path = public as $$
begin
  return dar_item(auth.uid(), 'paraquedas', -1);
end $$;

-- ---------------------------------------------------------------- incêndio da queda (os bombeiros apagam)
alter table public.incendios drop constraint if exists incendios_tipo_check;
alter table public.incendios add constraint incendios_tipo_check check (tipo in ('empresa', 'casa', 'queda'));
alter table public.perfis add column if not exists queda_em timestamptz;

create or replace function public.incendio_queda(p_x real, p_z real, p_nome text) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; novo bigint;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null then raise exception 'sem perfil'; end if;
  if p.queda_em is not null and p.queda_em > now() - interval '45 seconds' then return null; end if;   -- uma por queda
  update perfis set queda_em = now() where id = p.id;
  insert into incendios (tipo, alvo, nome, x, z)
    values ('queda', 0, left(coalesce(nullif(p_nome, ''), 'Queda de aeronave'), 40),
            greatest(-1400, least(1400, p_x)), greatest(-1400, least(1400, p_z)))
    returning id into novo;
  return novo;
end $$;

-- ---------------------------------------------------------------- revisão da frota (a cada 3 voos)
create table if not exists public.avioes_frota (
  id          integer primary key,
  porte       text not null check (porte in ('pequeno', 'medio', 'grande')),
  voos        integer not null default 0,
  ultimo_voo  timestamptz,
  revisado_em timestamptz,
  revisado_por text
);
insert into public.avioes_frota (id, porte) values (0, 'grande'), (1, 'medio'), (2, 'pequeno'), (3, 'pequeno')
on conflict (id) do nothing;
alter table public.avioes_frota enable row level security;
drop policy if exists "leitura publica" on public.avioes_frota;
create policy "leitura publica" on public.avioes_frota for select using (true);
revoke all on public.avioes_frota from anon, authenticated;
grant select on public.avioes_frota to anon, authenticated;

-- decolou com um avião da frota: conta mais um voo (no máximo um a cada 30 s por avião)
create or replace function public.voo_frota(p_aviao integer) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  if auth.uid() is null then raise exception 'sem perfil'; end if;
  update avioes_frota set voos = voos + 1, ultimo_voo = now()
   where id = p_aviao and (ultimo_voo is null or ultimo_voo < now() - interval '30 seconds')
   returning voos into v;
  if v is null then select voos into v from avioes_frota where id = p_aviao; end if;
  return coalesce(v, 0);
end $$;

-- revisão: pelo mecânico NPC (o piloto paga 2.000 / 4.000 / 8.000) ou por um jogador mecânico (ganha 300)
create or replace function public.revisar_aviao(p_aviao integer, p_mecanico boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a avioes_frota%rowtype; preco integer;
begin
  p := jogador_livre();
  select * into a from avioes_frota where id = p_aviao for update;
  if a.id is null then raise exception 'aviao invalido'; end if;
  if a.voos = 0 then raise exception 'aviao ja revisado'; end if;
  if p_mecanico then
    if p.profissao is distinct from 'mecanico' and p.cargo <> 'admin' then raise exception 'so mecanicos'; end if;
    if a.revisado_em is not null and a.revisado_em > now() - interval '30 seconds' then raise exception 'espere um pouco'; end if;
    update avioes_frota set voos = 0, revisado_em = now(), revisado_por = p.nome where id = a.id;
    update perfis set moedas = moedas + 300 where id = p.id;
    return 300;
  end if;
  preco := case a.porte when 'pequeno' then 2000 when 'medio' then 4000 else 8000 end;
  if p.moedas < preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - preco where id = p.id;
  update prefeitura set cofre = cofre + preco / 2 where id = 1;
  update avioes_frota set voos = 0, revisado_em = now(), revisado_por = 'Mecânico do hangar' where id = a.id;
  return preco;
end $$;

do $$
declare f text;
begin
  foreach f in array array['comprar_paraquedas()', 'usar_paraquedas()', 'incendio_queda(real, real, text)', 'voo_frota(integer)', 'revisar_aviao(integer, boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'avioes_frota') then
    alter publication supabase_realtime add table public.avioes_frota;
  end if;
exception when others then null; end $$;
