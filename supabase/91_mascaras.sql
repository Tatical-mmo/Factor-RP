-- 91 · Máscaras: vendidas na loja e usadas pela mochila (todo mundo vê). Rode depois do 90.
-- Os preços ficam na tabela precos (o administrador muda direto nela). A loja não compra máscara de volta;
-- dá para vender para outro jogador no mercado.
insert into public.precos (item, nome, compra, venda, fome) values
  ('mascara_camisa_cinza', 'Máscara: camisa enrolada (cinza)', 1500, null, 0),
  ('mascara_camisa_vermelha', 'Máscara: camisa enrolada (vermelha)', 1500, null, 0),
  ('mascara_bandana', 'Máscara: bandana', 1000, null, 0),
  ('mascara_balaclava', 'Máscara: balaclava preta', 2500, null, 0),
  ('mascara_lenco', 'Máscara: lenço do deserto', 2000, null, 0),
  ('mascara_estrela', 'Máscara da estrela', 8000, null, 0),
  ('mascara_caveira', 'Máscara da caveira', 8000, null, 0),
  ('mascara_camuflada', 'Máscara camuflada', 8000, null, 0),
  ('mascara_onca', 'Máscara de onça', 12000, null, 0),
  ('mascara_coroa', 'Máscara da coroa (dourada)', 20000, null, 0)
on conflict (item) do update set nome = excluded.nome, compra = excluded.compra, venda = excluded.venda;
notify pgrst, 'reload schema';
