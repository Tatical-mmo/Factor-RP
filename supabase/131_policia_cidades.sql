-- 131: polícia robô nas cidades novas do continente. Rode depois do 130.
--  · Policiais a pé 201 a 212 (Barra Amarela 201–204, Oyster River 207–212) e viaturas 221 a 226
--    (Barra Amarela 221–222, Oyster River 224–226). Com a linha no banco, perseguição, cerco e "caído" ficam iguais para todos.
insert into public.robos_policia (id, tipo) select g, 'pe' from generate_series(201, 212) g on conflict (id) do nothing;
insert into public.robos_policia (id, tipo) select g, 'viatura' from generate_series(221, 226) g on conflict (id) do nothing;
notify pgrst, 'reload schema';
