-- Fator RP - navios da Marinha: patrulha automática ou tripulados. Rode depois do 78.
-- Sem piloto, cada navio segue a rota de patrulha (calculada pelo relógio, igual para todos).
-- Quem assume o leme manda a posição; ao largar, o servidor guarda onde o navio ficou e ele volta sozinho para a rota.
-- Pilotam: Marinha, Tenente para cima (destróieres) e Capitão para cima (porta-aviões); o General Supremo sempre.

create table if not exists public.navios (
  id     text primary key check (id in ('porta', 'd1', 'd2')),
  piloto uuid references public.perfis (id) on delete set null,
  modo   text not null default 'patrulha' check (modo in ('patrulha', 'pilotado', 'retorno')),
  x real, z real, ang real,
  t      timestamptz not null default now()
);
insert into public.navios (id) values ('porta'), ('d1'), ('d2') on conflict (id) do nothing;
alter table public.navios enable row level security;
drop policy if exists ler on public.navios;
create policy ler on public.navios for select to authenticated using (true);
grant select on public.navios to authenticated;

create or replace function public.pode_pilotar_navio(p_uid uuid, p_navio text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = p_uid and cargo = 'admin')
      or exists (select 1 from perfis p join carreiras c on c.jogador = p.id and c.carreira = 'exercito'
                 where p.id = p_uid and p.profissao = 'exercito' and p.forca = 'marinha'
                   and c.minutos >= case when p_navio = 'porta' then 2400 else 1800 end);
$$;

-- assume o leme (se ninguém estiver pilotando, ou se o piloto sumiu há mais de 40 s)
create or replace function public.assumir_navio(p_navio text, p_x real, p_z real, p_ang real) returns void
language plpgsql security definer set search_path = public as $$
declare n navios%rowtype;
begin
  if not pode_pilotar_navio(auth.uid(), p_navio) then raise exception 'navio so marinha'; end if;
  select * into n from navios where id = p_navio for update;
  if not found then raise exception 'navio invalido'; end if;
  if n.piloto is not null and n.piloto <> auth.uid() and n.modo = 'pilotado' and n.t > now() - interval '40 seconds' then raise exception 'navio ja tem piloto'; end if;
  update navios set piloto = auth.uid(), modo = 'pilotado', x = p_x, z = p_z, ang = p_ang, t = now() where id = p_navio;
end $$;

create or replace function public.mover_navio(p_navio text, p_x real, p_z real, p_ang real) returns void
language plpgsql security definer set search_path = public as $$
begin
  if abs(p_x) > 1150 or p_z < 1100 or p_z > 1950 then raise exception 'navio fora do mar'; end if;
  update navios set x = p_x, z = p_z, ang = p_ang, t = now() where id = p_navio and piloto = auth.uid() and modo = 'pilotado';
end $$;

-- larga o leme: o navio volta sozinho para a rota a partir dali
create or replace function public.largar_navio(p_navio text, p_x real, p_z real, p_ang real) returns void
language plpgsql security definer set search_path = public as $$
begin
  update navios set piloto = null, modo = 'retorno', x = p_x, z = p_z, ang = p_ang, t = now()
   where id = p_navio and (piloto = auth.uid() or exists (select 1 from perfis where id = auth.uid() and cargo = 'admin'));
end $$;

do $$
declare f text;
begin
  foreach f in array array['pode_pilotar_navio(uuid, text)', 'assumir_navio(text, real, real, real)', 'mover_navio(text, real, real, real)', 'largar_navio(text, real, real, real)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
