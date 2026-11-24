-- 147: personagens limitados pequenos "Capivara Artilheira", "Gatinho Hip Hop", "Macaco Mochileiro" e
-- "Cachorro de Moletom", e o "Vanguarda Azul" (tamanho normal) (vitrine do admin por tempo limitado, como os outros de evento).
-- Rode depois do 146.
insert into public.personagens_evento (id, nome, preco) values
  ('Capivara_Artilheira', 'Capivara Artilheira', 75000),
  ('Gatinho_HipHop', 'Gatinho Hip Hop', 75000),
  ('Macaco_Mochileiro', 'Macaco Mochileiro', 75000),
  ('Cachorro_Moletom', 'Cachorro de Moletom', 75000),
  ('Vanguarda_Azul', 'Vanguarda Azul', 80000)
on conflict (id) do update set nome = excluded.nome;
notify pgrst, 'reload schema';
