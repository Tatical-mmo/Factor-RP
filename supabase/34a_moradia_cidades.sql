-- Fator RP - moradia nas cidades vizinhas (Vila Serra e Porto Sul).
-- Cada cidade ganha 1 prédio com 10 apartamentos e 8 terrenos (2 loteamentos), que evoluem igual aos do centro
-- (casa -> casa ampliada -> condomínio -> prédio pequeno -> prédio grande). Mais barato que no centro.
-- Pode rodar sozinho; não mexe em nada que já existe.

-- Vila Serra (norte): prédio "Edifício Serra" na quadra da estação
insert into public.casas (id, x, z, preco, tipo, rotulo) values
  (121, 0, -960.5, 11000, 'apto', 'Edifício Serra · Apto 101'),
  (122, 0, -960.5, 11000, 'apto', 'Edifício Serra · Apto 102'),
  (123, 0, -960.5, 11000, 'apto', 'Edifício Serra · Apto 201'),
  (124, 0, -960.5, 11000, 'apto', 'Edifício Serra · Apto 202'),
  (125, 0, -960.5, 11000, 'apto', 'Edifício Serra · Apto 301'),
  (126, 0, -960.5, 11000, 'apto', 'Edifício Serra · Apto 302'),
  (127, 0, -960.5, 11000, 'apto', 'Edifício Serra · Apto 401'),
  (128, 0, -960.5, 11000, 'apto', 'Edifício Serra · Apto 402'),
  (129, 0, -960.5, 11000, 'apto', 'Edifício Serra · Apto 501'),
  (130, 0, -960.5, 11000, 'apto', 'Edifício Serra · Apto 502'),
-- Porto Sul (sul): "Edifício Maré"
  (131, 0, 960.5, 11000, 'apto', 'Edifício Maré · Apto 101'),
  (132, 0, 960.5, 11000, 'apto', 'Edifício Maré · Apto 102'),
  (133, 0, 960.5, 11000, 'apto', 'Edifício Maré · Apto 201'),
  (134, 0, 960.5, 11000, 'apto', 'Edifício Maré · Apto 202'),
  (135, 0, 960.5, 11000, 'apto', 'Edifício Maré · Apto 301'),
  (136, 0, 960.5, 11000, 'apto', 'Edifício Maré · Apto 302'),
  (137, 0, 960.5, 11000, 'apto', 'Edifício Maré · Apto 401'),
  (138, 0, 960.5, 11000, 'apto', 'Edifício Maré · Apto 402'),
  (139, 0, 960.5, 11000, 'apto', 'Edifício Maré · Apto 501'),
  (140, 0, 960.5, 11000, 'apto', 'Edifício Maré · Apto 502')
on conflict (id) do update set x = excluded.x, z = excluded.z, tipo = excluded.tipo, rotulo = excluded.rotulo;

-- terrenos: 2 loteamentos por cidade (a porta fica na calçada, de frente para a rua)
insert into public.casas (id, x, z, preco, tipo, rotulo) values
  (221, -63.5, -951.5, 9000, 'terreno', 'Terreno Serra 1'),
  (222, -44.5, -951.5, 9000, 'terreno', 'Terreno Serra 2'),
  (223, -63.5, -992.5, 9000, 'terreno', 'Terreno Serra 3'),
  (224, -44.5, -992.5, 9000, 'terreno', 'Terreno Serra 4'),
  (225, 44.5, -1059.5, 9000, 'terreno', 'Terreno Serra 5'),
  (226, 63.5, -1059.5, 9000, 'terreno', 'Terreno Serra 6'),
  (227, 44.5, -1100.5, 9000, 'terreno', 'Terreno Serra 7'),
  (228, 63.5, -1100.5, 9000, 'terreno', 'Terreno Serra 8'),
  (229, -63.5, 951.5, 9000, 'terreno', 'Terreno Porto 1'),
  (230, -44.5, 951.5, 9000, 'terreno', 'Terreno Porto 2'),
  (231, -63.5, 992.5, 9000, 'terreno', 'Terreno Porto 3'),
  (232, -44.5, 992.5, 9000, 'terreno', 'Terreno Porto 4'),
  (233, 44.5, 1059.5, 9000, 'terreno', 'Terreno Porto 5'),
  (234, 63.5, 1059.5, 9000, 'terreno', 'Terreno Porto 6'),
  (235, 44.5, 1100.5, 9000, 'terreno', 'Terreno Porto 7'),
  (236, 63.5, 1100.5, 9000, 'terreno', 'Terreno Porto 8')
on conflict (id) do update set x = excluded.x, z = excluded.z, tipo = excluded.tipo, rotulo = excluded.rotulo;
