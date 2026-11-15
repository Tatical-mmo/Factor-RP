-- 89 · Troca dos personagens: entram os 27 novos (Meshy) e saem os 17 antigos (provisórios). Rode depois do 88.
--   · Quem usava um antigo passa para um novo grátis (escolhido pela conta, sempre o mesmo).
--   · Quem tinha comprado personagem antigo recebe as 8.000 moedas de volta por personagem.
--   · Personagem desativado (ativo = false) não pode mais ser escolhido nem comprado.

insert into public.personagens_jogo (id, gratis) values
  ('Jovem_Cidade', true),
  ('Moca_Academia', true),
  ('Grandalhao', false),
  ('Moca_Trancas', true),
  ('Torcedor', true),
  ('Moradora', true),
  ('Pai_Familia', true),
  ('Vovo', false),
  ('Mecanico', false),
  ('Executiva', false),
  ('Fisiculturista', false),
  ('Enfermeiro', false),
  ('Executivo', false),
  ('Enfermeira', false),
  ('MC_Funk', false),
  ('Seu_Tonho', false),
  ('Surfista', true),
  ('Gaucha', true),
  ('Rapaz_Bairro', true),
  ('Ruiva', false),
  ('Barbudo', false),
  ('Playboy', false),
  ('Gaucho', false),
  ('Nipo', true),
  ('Moletom', true),
  ('Nordestino', false),
  ('Dona_Salao', true)
on conflict (id) do update set gratis = excluded.gratis, ativo = true;

do $$
declare velhos text[] := array['Autumn_Traveler', 'Bandaged_Trailblazer', 'Bandit_Brave', 'Curly_Wanderer', 'Desert_Scout_Ava', 'Desert_Warden', 'Dustbound_Scout', 'Dustveil_Scout', 'Friendly_Village_Blacksmith', 'Grimbeard_the_Ironclad', 'Hooded_Paw_Guardian', 'Mustached_Explorer', 'Patchwork_Scout', 'Shadow_Scout', 'The_Frightened_Escapee', 'Urban_Explorer', 'Urban_Wanderer'];
        gratis text[] := array['Jovem_Cidade', 'Moca_Academia', 'Moca_Trancas', 'Torcedor', 'Moradora', 'Pai_Familia', 'Surfista', 'Gaucha', 'Rapaz_Bairro', 'Nipo', 'Moletom', 'Dona_Salao'];
begin
  -- devolve o que foi pago pelos antigos
  update public.perfis p set moedas = p.moedas + 8000 * c.n
    from (select jogador, count(*) n from public.personagens_comprados where personagem = any (velhos) group by jogador) c
   where c.jogador = p.id;
  delete from public.personagens_comprados where personagem = any (velhos);
  -- quem usava um antigo ganha um novo grátis
  update public.perfis set personagem = gratis[1 + (abs(hashtext(id::text)) % array_length(gratis, 1))]
   where personagem = any (velhos);
  delete from public.personagens_jogo where id = any (velhos);
end $$;

-- personagem só entra se estiver ativo (quem já usa continua com ele)
create or replace function public.validar_personagem() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fator.reset', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' and new.personagem is not distinct from old.personagem then return new; end if;
  if new.cargo = 'jogador'
     and not exists (select 1 from personagens_jogo where id = new.personagem and ativo)
     and not exists (select 1 from personagens_evento where id = new.personagem) then
    raise exception 'personagem invalido';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
