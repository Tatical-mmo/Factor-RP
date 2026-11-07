-- Fator RP - etapa 2: perfis dos jogadores
-- Cole tudo no Supabase em SQL Editor > New query e toque em Run.

create table if not exists public.perfis (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null check (char_length(nome) between 3 and 16),
  personagem  text not null,
  moedas      integer not null default 500 check (moedas >= 0),
  cargo       text not null default 'jogador' check (cargo in ('jogador', 'moderador', 'admin')),
  pos_x       real not null default 0,
  pos_z       real not null default 27,
  criado_em   timestamptz not null default now(),
  visto_em    timestamptz not null default now()
);

-- nome único sem diferenciar maiúsculas
create unique index if not exists perfis_nome_unico on public.perfis (lower(nome));

alter table public.perfis enable row level security;

drop policy if exists "todos leem perfis" on public.perfis;
create policy "todos leem perfis" on public.perfis
  for select using (true);

drop policy if exists "cria o proprio perfil" on public.perfis;
create policy "cria o proprio perfil" on public.perfis
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "atualiza o proprio perfil" on public.perfis;
create policy "atualiza o proprio perfil" on public.perfis
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- O jogador só pode escolher nome e personagem ao criar,
-- e só pode atualizar a própria posição. Moedas e cargo ficam protegidos.
revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to anon, authenticated;
grant insert (id, nome, personagem) on public.perfis to authenticated;
grant update (pos_x, pos_z, visto_em) on public.perfis to authenticated;

-- personagens permitidos (robôs ficam de fora)
create or replace function public.validar_personagem() returns trigger
language plpgsql as $$
begin
  if new.personagem not in (
    'Autumn_Traveler','Bandaged_Trailblazer','Bandit_Brave','Curly_Wanderer','Desert_Scout_Ava',
    'Desert_Warden','Dustbound_Scout','Dustveil_Scout','Friendly_Village_Blacksmith','Grimbeard_the_Ironclad',
    'Hooded_Paw_Guardian','Mustached_Explorer','Patchwork_Scout','Shadow_Scout','The_Frightened_Escapee',
    'Urban_Explorer','Urban_Wanderer'
  ) and new.cargo = 'jogador' then
    raise exception 'personagem invalido';
  end if;
  return new;
end $$;

drop trigger if exists perfis_validar_personagem on public.perfis;
create trigger perfis_validar_personagem before insert or update on public.perfis
  for each row execute function public.validar_personagem();
