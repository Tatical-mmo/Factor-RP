-- 82 · Favelas (Morro da Serra e Morro do Porto). Rode depois do 81.
-- 8 lotes de empresa novos (na rua de baixo de cada morro) e as duas bases de clã no alto dos morros.
-- As casas das favelas são do cenário: já existem e ninguém constrói nelas.

insert into public.lotes (id, preco, x, z) values
  (25, 20000, -137, -1111), (26, 20000, -115, -1111), (27, 20000, 115, -1111), (28, 20000, 137, -1111),
  (29, 20000, 915, 941), (30, 20000, 937, 941), (31, 20000, 959, 941), (32, 20000, 981, 941)
on conflict (id) do update set preco = excluded.preco, x = excluded.x, z = excluded.z;

insert into public.territorios (id, nome, x, z) values
  ('morro_serra', 'Morro da Serra', 0, -1362),
  ('morro_porto', 'Morro do Porto', 1050, 1085)
on conflict (id) do update set nome = excluded.nome, x = excluded.x, z = excluded.z;
