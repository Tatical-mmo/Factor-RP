-- 88 · Lista de personagens no banco (tabela), para trocar e acrescentar personagens sem reescrever as funções.
-- Rode depois do 87. Já entra o primeiro personagem novo: Jovem da Cidade (grátis).

create table if not exists public.personagens_jogo (
  id     text primary key check (id ~ '^[A-Za-z0-9_]{2,60}$'),
  gratis boolean not null default false,
  ativo  boolean not null default true    -- false: some da escolha, mas quem já usa continua com ele
);
insert into public.personagens_jogo (id, gratis) values
  ('Autumn_Traveler', true), ('Bandaged_Trailblazer', true), ('Bandit_Brave', false), ('Curly_Wanderer', true),
  ('Desert_Scout_Ava', true), ('Desert_Warden', false), ('Dustbound_Scout', false), ('Dustveil_Scout', false),
  ('Friendly_Village_Blacksmith', false), ('Grimbeard_the_Ironclad', false), ('Hooded_Paw_Guardian', false),
  ('Mustached_Explorer', true), ('Patchwork_Scout', true), ('Shadow_Scout', false), ('The_Frightened_Escapee', false),
  ('Urban_Explorer', true), ('Urban_Wanderer', true),
  ('Jovem_Cidade', true)
on conflict (id) do nothing;
do $$
begin
  alter table public.personagens_jogo enable row level security;
  drop policy if exists ler on public.personagens_jogo;
  create policy ler on public.personagens_jogo for select using (true);
  revoke all on public.personagens_jogo from anon, authenticated;
  grant select on public.personagens_jogo to anon, authenticated;
end $$;

create or replace function public.personagem_gratis(p text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from personagens_jogo where id = p and gratis);
$$;

create or replace function public.validar_personagem() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fator.reset', true) = 'on' then return new; end if;
  if new.cargo = 'jogador' and tg_op = 'UPDATE' and new.personagem is not distinct from old.personagem then return new; end if;
  if not exists (select 1 from personagens_jogo where id = new.personagem)
     and not exists (select 1 from personagens_evento where id = new.personagem) and new.cargo = 'jogador' then
    raise exception 'personagem invalido';
  end if;
  return new;
end $$;

create or replace function public.staff_skin(novo text) returns void
language plpgsql security definer set search_path = public as $$
declare c text := coalesce(cargo_de(auth.uid()), 'jogador');
begin
  if c = 'jogador' then raise exception 'so a equipe troca de skin de graca'; end if;
  if novo not in ('Rusty_Scout_Bot', 'Rustbolt_Sentinel') and not exists (select 1 from personagens_jogo where id = novo)
    and not (c = 'admin' and exists (select 1 from personagens_evento where id = novo)) then raise exception 'skin invalida'; end if;
  update perfis set personagem = novo where id = auth.uid();
end $$;

notify pgrst, 'reload schema';
