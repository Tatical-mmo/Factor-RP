-- Fator RP - personagens de evento (18 novos, mais caros). Só dá para comprar quando o administrador libera
-- a vitrine por um tempo. O administrador também pode presentear um jogador e usa todos de graça.
-- Rode depois do 17.

create table if not exists public.personagens_evento (
  id           text primary key,
  nome         text not null,
  preco        integer not null check (preco > 0),
  liberado_ate timestamptz
);
insert into public.personagens_evento (id, nome, preco) values
  ('Veteran_Gamekeeper', 'Veterano Guarda-Caça', 45000), ('Molten_Dread_Knight', 'Cavaleiro de Lava', 80000),
  ('Runebound_Wolfguard', 'Guarda-Lobo Rúnico', 70000), ('Anubis_Sentinel', 'Sentinela de Anúbis', 90000),
  ('Armored_Crocodile_Commando', 'Comando Crocodilo', 75000), ('Bonebound_Reaper', 'Ceifador de Ossos', 90000),
  ('Grizzled_Vanguard', 'Veterano da Vanguarda', 50000), ('Ironbraid_Warden', 'Guardiã Trança de Ferro', 55000),
  ('Raccoon_Ranger', 'Guaxinim Patrulheiro', 60000), ('Crimson_Samurai', 'Samurai Carmesim', 85000),
  ('Iron_Vanguard', 'Vanguarda de Ferro', 55000), ('Ironclad_Sentinel', 'Sentinela Blindada', 55000),
  ('Azure_Vanguard', 'Vanguarda Celeste', 70000), ('Inferno_Warden', 'Guardião do Inferno', 85000),
  ('Rustguard_Automaton', 'Autômato Enferrujado', 65000), ('Ironhide_Armadillo', 'Tatu Couraçado', 70000),
  ('Elven_Warden', 'Guardiã Élfica', 60000), ('Tidebreaker_Sentinel', 'Sentinela Quebra-Mar', 75000)
on conflict (id) do update set nome = excluded.nome, preco = excluded.preco;
do $$
begin
  alter table public.personagens_evento enable row level security;
  drop policy if exists "leitura publica" on public.personagens_evento;
  create policy "leitura publica" on public.personagens_evento for select using (true);
  revoke all on public.personagens_evento from anon, authenticated;
  grant select on public.personagens_evento to anon, authenticated;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'personagens_evento') then
    alter publication supabase_realtime add table public.personagens_evento;
  end if;
end $$;

-- os de evento passam a valer como personagem (a compra/presente é que libera o uso)
create or replace function public.validar_personagem() returns trigger
language plpgsql as $$
begin
  if new.personagem not in (
    'Autumn_Traveler','Bandaged_Trailblazer','Bandit_Brave','Curly_Wanderer','Desert_Scout_Ava',
    'Desert_Warden','Dustbound_Scout','Dustveil_Scout','Friendly_Village_Blacksmith','Grimbeard_the_Ironclad',
    'Hooded_Paw_Guardian','Mustached_Explorer','Patchwork_Scout','Shadow_Scout','The_Frightened_Escapee',
    'Urban_Explorer','Urban_Wanderer'
  ) and not exists (select 1 from public.personagens_evento where id = new.personagem) and new.cargo = 'jogador' then
    raise exception 'personagem invalido';
  end if;
  return new;
end $$;

create or replace function public.comprar_personagem(p_personagem text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; ev personagens_evento%rowtype; preco integer := 8000;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if personagem_gratis(p_personagem) then raise exception 'esse personagem e gratis'; end if;
  if exists (select 1 from personagens_comprados where jogador = p.id and personagem = p_personagem) then raise exception 'voce ja tem esse personagem'; end if;
  select * into ev from personagens_evento where id = p_personagem;
  if ev.id is not null then
    if ev.liberado_ate is null or ev.liberado_ate < now() then raise exception 'personagem de evento fora da vitrine'; end if;
    preco := ev.preco;
  end if;
  if p.moedas < preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - preco, personagem = p_personagem where id = p.id;
  insert into personagens_comprados (jogador, personagem) values (p.id, p_personagem);
end $$;

-- a equipe troca de skin de graça; o administrador também usa os de evento
create or replace function public.staff_skin(novo text) returns void
language plpgsql security definer set search_path = public as $$
declare c text := coalesce(cargo_de(auth.uid()), 'jogador');
begin
  if c = 'jogador' then raise exception 'so a equipe troca de skin de graca'; end if;
  if novo not in ('Rusty_Scout_Bot','Rustbolt_Sentinel',
    'Autumn_Traveler','Bandaged_Trailblazer','Bandit_Brave','Curly_Wanderer','Desert_Scout_Ava',
    'Desert_Warden','Dustbound_Scout','Dustveil_Scout','Friendly_Village_Blacksmith','Grimbeard_the_Ironclad',
    'Hooded_Paw_Guardian','Mustached_Explorer','Patchwork_Scout','Shadow_Scout','The_Frightened_Escapee',
    'Urban_Explorer','Urban_Wanderer')
    and not (c = 'admin' and exists (select 1 from personagens_evento where id = novo)) then raise exception 'skin invalida'; end if;
  update perfis set personagem = novo where id = auth.uid();
end $$;

-- abrir a vitrine do evento (p_ids vazio = todos) por alguns minutos; 0 minutos fecha
create or replace function public.admin_liberar_evento(p_ids text[], p_minutos integer) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if p_minutos is null or p_minutos not between 0 and 10080 then raise exception 'tempo invalido'; end if;
  update personagens_evento set liberado_ate = case when p_minutos = 0 then null else now() + make_interval(mins => p_minutos) end
    where p_ids is null or cardinality(p_ids) = 0 or id = any(p_ids);
  get diagnostics n = row_count;
  if p_minutos > 0 then
    perform avisar_todos(format('✨ EVENTO: %s personage%s especia%s à venda na loja (Personagem e nome) por %s!', n,
      case when n = 1 then 'm' else 'ns' end, case when n = 1 then 'l' else 'is' end,
      case when p_minutos >= 60 then format('%s h', round(p_minutos / 60.0, 1)) else format('%s min', p_minutos) end));
  end if;
  perform registrar(null, 'evento_personagens', jsonb_build_object('minutos', p_minutos, 'quantos', n));
  return n;
end $$;

create or replace function public.admin_presentear_personagem(p_jogador uuid, p_personagem text) returns void
language plpgsql security definer set search_path = public as $$
declare ev personagens_evento%rowtype;
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  select * into ev from personagens_evento where id = p_personagem;
  if ev.id is null then raise exception 'personagem invalido'; end if;
  if not exists (select 1 from perfis where id = p_jogador) then raise exception 'jogador invalido'; end if;
  insert into personagens_comprados (jogador, personagem) values (p_jogador, p_personagem) on conflict do nothing;
  insert into comandos (alvo, autor, tipo, dados) values (p_jogador, auth.uid(), 'aviso',
    jsonb_build_object('texto', format('🎁 Você ganhou o personagem %s! Use em Loja › Personagem e nome.', ev.nome)));
  perform registrar(p_jogador, 'presente_personagem', jsonb_build_object('personagem', ev.nome));
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_liberar_evento(text[], integer)', 'admin_presentear_personagem(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
