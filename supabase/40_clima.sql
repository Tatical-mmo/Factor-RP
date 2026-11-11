-- Fator RP - mudança de tempo (chuva, tempestade e neve).
-- O administrador escolhe o tempo na hora (por quantos minutos) ou deixa automático: a cada ciclo de 32 min
-- o jogo sorteia, com as chances que ele definir, se vai ter chuva, tempestade ou neve naquele ciclo.
-- O sorteio é feito igual em todos os celulares (pelo número do ciclo), então todo mundo vê o mesmo tempo.
-- Rode depois do 39.

create table if not exists public.clima (
  id                integer primary key default 1 check (id = 1),
  auto              boolean not null default true,
  chance_chuva      integer not null default 30 check (chance_chuva between 0 and 100),
  chance_tempestade integer not null default 15 check (chance_tempestade between 0 and 100),
  chance_neve       integer not null default 0 check (chance_neve between 0 and 100),
  manual            text check (manual in ('limpo', 'chuva', 'tempestade', 'neve')),
  manual_ate        timestamptz,
  atualizado        timestamptz not null default now()
);
insert into public.clima (id) values (1) on conflict (id) do nothing;
do $$
begin
  alter table public.clima enable row level security;
  drop policy if exists "leitura publica" on public.clima;
  create policy "leitura publica" on public.clima for select using (true);
  revoke all on public.clima from anon, authenticated;
  grant select on public.clima to anon, authenticated;
end $$;

-- tempo agora: p_tipo = limpo, chuva, tempestade ou neve, por p_minutos (1 a 240). p_tipo nulo volta ao automático.
create or replace function public.admin_clima_agora(p_tipo text, p_minutos integer default 10) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'sem permissao'; end if;
  if p_tipo is null then
    update clima set manual = null, manual_ate = null, atualizado = now() where id = 1;
  else
    if p_tipo not in ('limpo', 'chuva', 'tempestade', 'neve') then raise exception 'tempo invalido'; end if;
    update clima set manual = p_tipo, manual_ate = now() + make_interval(mins => greatest(1, least(240, coalesce(p_minutos, 10)))), atualizado = now() where id = 1;
  end if;
  perform registrar(null, 'clima', jsonb_build_object('tipo', p_tipo, 'minutos', p_minutos));
end $$;

-- programação automática por ciclo
create or replace function public.admin_clima_auto(p_auto boolean, p_chuva integer, p_tempestade integer, p_neve integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'sem permissao'; end if;
  if least(p_chuva, p_tempestade, p_neve) < 0 or p_chuva + p_tempestade + p_neve > 100 then raise exception 'chances invalidas'; end if;
  update clima set auto = coalesce(p_auto, true), chance_chuva = p_chuva, chance_tempestade = p_tempestade, chance_neve = p_neve, atualizado = now() where id = 1;
  perform registrar(null, 'clima_auto', jsonb_build_object('auto', p_auto, 'chuva', p_chuva, 'tempestade', p_tempestade, 'neve', p_neve));
end $$;

revoke execute on function public.admin_clima_agora(text, integer) from public, anon;
revoke execute on function public.admin_clima_auto(boolean, integer, integer, integer) from public, anon;
grant execute on function public.admin_clima_agora(text, integer) to authenticated;
grant execute on function public.admin_clima_auto(boolean, integer, integer, integer) to authenticated;
