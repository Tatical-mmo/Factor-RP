-- Fator RP - moradia: apartamentos, terrenos residenciais e mais territórios para os clãs.
-- Cada jogador continua com uma moradia só (casa, apartamento ou terreno).

alter table public.casas add column if not exists tipo text not null default 'casa';
alter table public.casas add column if not exists rotulo text;
alter table public.casas add column if not exists modelo text;
alter table public.casas drop constraint if exists casas_tipo_v1;
alter table public.casas add constraint casas_tipo_v1 check (tipo in ('casa', 'apto', 'terreno'));
alter table public.casas drop constraint if exists casas_modelo_v1;
alter table public.casas add constraint casas_modelo_v1 check (modelo is null or modelo in ('simples', 'sobrado', 'mansao'));

-- 2 prédios com 10 apartamentos cada (a porta é a mesma para o prédio todo)
insert into public.casas (id, x, z, preco, tipo, rotulo) values
  (101, -81, -123.5, 15000, 'apto', 'Edifício Aurora · Apto 101'),
  (102, -81, -123.5, 15000, 'apto', 'Edifício Aurora · Apto 102'),
  (103, -81, -123.5, 15000, 'apto', 'Edifício Aurora · Apto 201'),
  (104, -81, -123.5, 15000, 'apto', 'Edifício Aurora · Apto 202'),
  (105, -81, -123.5, 15000, 'apto', 'Edifício Aurora · Apto 301'),
  (106, -81, -123.5, 15000, 'apto', 'Edifício Aurora · Apto 302'),
  (107, -81, -123.5, 15000, 'apto', 'Edifício Aurora · Apto 401'),
  (108, -81, -123.5, 15000, 'apto', 'Edifício Aurora · Apto 402'),
  (109, -81, -123.5, 15000, 'apto', 'Edifício Aurora · Apto 501'),
  (110, -81, -123.5, 15000, 'apto', 'Edifício Aurora · Apto 502'),
  (111, 81, 123.5, 15000, 'apto', 'Edifício Horizonte · Apto 101'),
  (112, 81, 123.5, 15000, 'apto', 'Edifício Horizonte · Apto 102'),
  (113, 81, 123.5, 15000, 'apto', 'Edifício Horizonte · Apto 201'),
  (114, 81, 123.5, 15000, 'apto', 'Edifício Horizonte · Apto 202'),
  (115, 81, 123.5, 15000, 'apto', 'Edifício Horizonte · Apto 301'),
  (116, 81, 123.5, 15000, 'apto', 'Edifício Horizonte · Apto 302'),
  (117, 81, 123.5, 15000, 'apto', 'Edifício Horizonte · Apto 401'),
  (118, 81, 123.5, 15000, 'apto', 'Edifício Horizonte · Apto 402'),
  (119, 81, 123.5, 15000, 'apto', 'Edifício Horizonte · Apto 501'),
  (120, 81, 123.5, 15000, 'apto', 'Edifício Horizonte · Apto 502')
on conflict (id) do update set x = excluded.x, z = excluded.z, preco = excluded.preco, tipo = excluded.tipo, rotulo = excluded.rotulo;

-- 16 terrenos em 4 loteamentos ao lado do centro
insert into public.casas (id, x, z, preco, tipo, rotulo) values
  (201, -144.5, -101.5, 12000, 'terreno', 'Terreno 1'),
  (202, -144.5, -60.5, 12000, 'terreno', 'Terreno 2'),
  (203, -125.5, -101.5, 12000, 'terreno', 'Terreno 3'),
  (204, -125.5, -60.5, 12000, 'terreno', 'Terreno 4'),
  (205, 125.5, -101.5, 12000, 'terreno', 'Terreno 5'),
  (206, 125.5, -60.5, 12000, 'terreno', 'Terreno 6'),
  (207, 144.5, -101.5, 12000, 'terreno', 'Terreno 7'),
  (208, 144.5, -60.5, 12000, 'terreno', 'Terreno 8'),
  (209, -144.5, 60.5, 12000, 'terreno', 'Terreno 9'),
  (210, -144.5, 101.5, 12000, 'terreno', 'Terreno 10'),
  (211, -125.5, 60.5, 12000, 'terreno', 'Terreno 11'),
  (212, -125.5, 101.5, 12000, 'terreno', 'Terreno 12'),
  (213, 125.5, 60.5, 12000, 'terreno', 'Terreno 13'),
  (214, 125.5, 101.5, 12000, 'terreno', 'Terreno 14'),
  (215, 144.5, 60.5, 12000, 'terreno', 'Terreno 15'),
  (216, 144.5, 101.5, 12000, 'terreno', 'Terreno 16')
on conflict (id) do update set x = excluded.x, z = excluded.z, preco = excluded.preco, tipo = excluded.tipo, rotulo = excluded.rotulo;

-- construir no terreno: casa simples 20.000, sobrado 45.000 ou mansão 90.000 (trocar de modelo paga o novo)
create or replace function public.preco_modelo(p_modelo text) returns integer
language sql immutable as $$
  select case p_modelo when 'simples' then 20000 when 'sobrado' then 45000 when 'mansao' then 90000 end;
$$;
create or replace function public.construir_casa(p_modelo text) returns void
language plpgsql security definer set search_path = public as $$
declare c casas%rowtype; preco integer;
begin
  c := minha_casa();
  if c.id is null or c.tipo <> 'terreno' then raise exception 'voce nao tem terreno'; end if;
  preco := preco_modelo(p_modelo);
  if preco is null then raise exception 'modelo invalido'; end if;
  if c.modelo = p_modelo then raise exception 'essa casa ja esta construida'; end if;
  update perfis set moedas = moedas - preco where id = auth.uid() and moedas >= preco;
  if not found then raise exception 'moedas insuficientes'; end if;
  update casas set modelo = p_modelo where id = c.id;
end $$;

-- vender: casa devolve 20.000; apartamento 8.000; terreno 6.000 mais metade da construção
create or replace function public.vender_casa() returns integer
language plpgsql security definer set search_path = public as $$
declare c casas%rowtype; b record; valor integer;
begin
  c := minha_casa();
  if c.id is null then raise exception 'voce nao tem casa'; end if;
  for b in select item, qtd from bau where casa = c.id and qtd > 0 loop
    perform dar_item(auth.uid(), b.item, b.qtd);
  end loop;
  delete from bau where casa = c.id;
  valor := case c.tipo when 'apto' then 8000 when 'terreno' then 6000 + coalesce(preco_modelo(c.modelo), 0) / 2 else 20000 end;
  update casas set dono = null, modelo = null where id = c.id;
  update perfis set moedas = moedas + valor where id = auth.uid();
  return valor;
end $$;

-- mais territórios: duas praças na metrópole e um em cada cidade vizinha
insert into public.territorios (id, nome, x, z) values
  ('norte', 'Praça Norte', -297, -297), ('sul', 'Praça Sul', 297, 297),
  ('serra', 'Vila Serra', -54, -1080), ('porto', 'Porto Sul', -54, 1080)
on conflict (id) do update set nome = excluded.nome, x = excluded.x, z = excluded.z;

do $$
declare f text;
begin
  foreach f in array array['construir_casa(text)', 'vender_casa()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
