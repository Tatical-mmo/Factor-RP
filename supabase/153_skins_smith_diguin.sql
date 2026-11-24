-- 153: personagens limitados Smith, Samy, Jeff, Taty e Diguin (tamanho normal; vitrine do admin por tempo
-- limitado, como os outros de evento). Rode depois do 152.
insert into public.personagens_evento (id, nome, preco) values
  ('Smith', 'Smith', 80000), ('Samy', 'Samy', 80000), ('Jeff', 'Jeff', 80000), ('Taty', 'Taty', 80000), ('Diguin', 'Diguin', 80000)
on conflict (id) do update set nome = excluded.nome;
notify pgrst, 'reload schema';
