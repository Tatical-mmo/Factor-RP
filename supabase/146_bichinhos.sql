-- 146: personagens limitados pequenos "Lobo Arlequim" e "Guaxinim Tropical" (vitrine do admin por tempo limitado,
-- como os outros de evento). Rode depois do 145.
insert into public.personagens_evento (id, nome, preco) values
  ('Lobo_Arlequim', 'Lobo Arlequim', 75000),
  ('Guaxinim_Tropical', 'Guaxinim Tropical', 75000)
on conflict (id) do update set nome = excluded.nome;
notify pgrst, 'reload schema';
