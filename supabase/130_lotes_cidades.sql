-- 130: terrenos para empresas nas cidades novas do continente. Rode depois do 129.
--  · Barra Amarela: 4 lotes (33 a 36), 15.000 cada. Oyster River: 8 lotes (37 a 44), 25.000 cada.
--  · Funcionam igual aos lotes da ilha (fábrica ou transportadora, níveis, filiais); os caminhões atravessam a ponte.

insert into public.lotes (id, preco, x, z) values
  (33, 15000, -1488, -2346.5),
  (34, 15000, -1468, -2346.5),
  (35, 15000, -1332, -2346.5),
  (36, 15000, -1312, -2346.5),
  (37, 25000, 463.5, -3775.5),
  (38, 25000, 488.5, -3775.5),
  (39, 25000, 463.5, -3711.5),
  (40, 25000, 488.5, -3711.5),
  (41, 25000, 911.5, -3775.5),
  (42, 25000, 936.5, -3775.5),
  (43, 25000, 911.5, -3711.5),
  (44, 25000, 936.5, -3711.5)
on conflict (id) do update set preco = excluded.preco, x = excluded.x, z = excluded.z;
notify pgrst, 'reload schema';
