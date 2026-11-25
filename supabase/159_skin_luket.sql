-- 159: personagem limitado Luket (tamanho normal; vitrine do admin por tempo limitado ou presente, como os outros
-- de evento). Quem veste ganha a tarja dourada "Luket" embaixo do nome (no jogo, sem nada no banco). Rode depois do 158.
insert into public.personagens_evento (id, nome, preco) values ('Luket', 'Luket', 80000)
on conflict (id) do update set nome = excluded.nome;
notify pgrst, 'reload schema';
