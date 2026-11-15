-- 90 · Personagens limitados novos (12, do Meshy) no lugar dos 18 de evento antigos. Rode depois do 89.
--   · Os limitados só vêm por presente do administrador ou pela vitrine aberta por tempo limitado (painel do admin).
--   · O administrador usa todos de graça e presenteia quantas vezes quiser (sem perder o dele).
--   · Quem tinha comprado um de evento antigo recebe o preço de volta; quem usava um antigo passa para um grátis.

do $$
declare velhos text[] := array['Veteran_Gamekeeper', 'Molten_Dread_Knight', 'Runebound_Wolfguard', 'Anubis_Sentinel', 'Armored_Crocodile_Commando', 'Bonebound_Reaper', 'Grizzled_Vanguard', 'Ironbraid_Warden', 'Raccoon_Ranger', 'Crimson_Samurai', 'Iron_Vanguard', 'Ironclad_Sentinel', 'Azure_Vanguard', 'Inferno_Warden', 'Rustguard_Automaton', 'Ironhide_Armadillo', 'Elven_Warden', 'Tidebreaker_Sentinel'];
        gratis text[] := array['Jovem_Cidade', 'Moca_Academia', 'Moca_Trancas', 'Torcedor', 'Moradora', 'Pai_Familia', 'Surfista', 'Gaucha', 'Rapaz_Bairro', 'Nipo', 'Moletom', 'Dona_Salao'];
begin
  update public.perfis p set moedas = p.moedas + c.total
    from (select pc.jogador, sum(ev.preco) total from public.personagens_comprados pc join public.personagens_evento ev on ev.id = pc.personagem
           where pc.personagem = any (velhos) group by pc.jogador) c
   where c.jogador = p.id;
  delete from public.personagens_comprados where personagem = any (velhos);
  update public.perfis set personagem = gratis[1 + (abs(hashtext(id::text)) % array_length(gratis, 1))] where personagem = any (velhos);
  delete from public.personagens_evento where id = any (velhos);
end $$;

insert into public.personagens_evento (id, nome, preco) values
  ('Patrocinador', 'Patrocinador', 90000),
  ('Dona_Empresa', 'Dona da Empresa', 70000),
  ('Soldado', 'Soldado', 50000),
  ('Soldada', 'Soldada', 50000),
  ('Maloqueiro', 'Maloqueiro', 45000),
  ('Maloqueira', 'Maloqueira', 45000),
  ('Empresario', 'Empresário', 70000),
  ('Medica', 'Médica', 55000),
  ('Medico', 'Médico', 55000),
  ('Dona_Morro', 'Dona do Morro', 85000),
  ('Mascarado', 'Mascarado do Morro', 80000),
  ('Dono_Morro', 'Dono do Morro', 90000)
on conflict (id) do update set nome = excluded.nome, preco = excluded.preco;

notify pgrst, 'reload schema';
