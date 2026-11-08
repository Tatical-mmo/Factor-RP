-- Fator RP - várias moradias: cada jogador pode ter até 3 (casa, apartamento ou terreno, em qualquer combinação).
-- Cada moradia tem o seu baú. Vender agora é feito direto na porta, sem precisar do baú.

alter table public.casas drop constraint if exists casas_dono_key;
create index if not exists casas_dono_idx on public.casas (dono);

-- moradia do jogador pelo id (erro se não for dele)
create or replace function public.moradia(p_casa integer) returns public.casas
language plpgsql stable security definer set search_path = public as $$
declare c casas%rowtype;
begin
  select * into c from casas where id = p_casa and dono = auth.uid();
  if c.id is null then raise exception 'essa moradia nao e sua'; end if;
  return c;
end $$;

create or replace function public.comprar_casa(p_casa integer) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c casas%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if (select count(*) from casas where dono = p.id) >= 3 then raise exception 'limite de 3 moradias'; end if;
  select * into c from casas where id = p_casa for update;
  if c.id is null then raise exception 'casa invalida'; end if;
  if c.dono is not null then raise exception 'casa ja vendida'; end if;
  if p.moedas < c.preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - c.preco where id = p.id;
  update casas set dono = p.id where id = c.id;
end $$;

drop function if exists public.guardar_no_bau(text, integer);
drop function if exists public.retirar_do_bau(text, integer);
drop function if exists public.vender_casa();
drop function if exists public.construir_casa(text);

create or replace function public.guardar_no_bau(p_casa integer, p_item text, p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c casas%rowtype; novo integer;
begin
  c := moradia(p_casa);
  if p_qtd < 1 or p_qtd > 200 then raise exception 'quantidade invalida'; end if;
  perform dar_item(auth.uid(), p_item, -p_qtd);
  insert into bau (casa, item, qtd) values (c.id, p_item, p_qtd)
  on conflict (casa, item) do update set qtd = bau.qtd + p_qtd returning qtd into novo;
  if novo > 200 then raise exception 'bau cheio'; end if;
  return novo;
end $$;

create or replace function public.retirar_do_bau(p_casa integer, p_item text, p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c casas%rowtype; n integer;
begin
  c := moradia(p_casa);
  if p_qtd < 1 then raise exception 'quantidade invalida'; end if;
  update bau set qtd = qtd - p_qtd where casa = c.id and item = p_item and qtd >= p_qtd;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'itens insuficientes'; end if;
  return dar_item(auth.uid(), p_item, p_qtd);
end $$;

-- vender: casa devolve 20.000; apartamento 8.000; terreno 6.000 mais metade da construção.
-- O que estava no baú volta para a mochila.
create or replace function public.vender_casa(p_casa integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c casas%rowtype; b record; valor integer;
begin
  c := moradia(p_casa);
  for b in select item, qtd from bau where casa = c.id and qtd > 0 loop
    perform dar_item(auth.uid(), b.item, b.qtd);
  end loop;
  delete from bau where casa = c.id;
  valor := case c.tipo when 'apto' then 8000 when 'terreno' then 6000 + coalesce(preco_modelo(c.modelo), 0) / 2 else 20000 end;
  update casas set dono = null, modelo = null where id = c.id;
  update perfis set moedas = moedas + valor where id = auth.uid();
  return valor;
end $$;

create or replace function public.construir_casa(p_casa integer, p_modelo text) returns void
language plpgsql security definer set search_path = public as $$
declare c casas%rowtype; preco integer;
begin
  c := moradia(p_casa);
  if c.tipo <> 'terreno' then raise exception 'isso nao e um terreno'; end if;
  preco := preco_modelo(p_modelo);
  if preco is null then raise exception 'modelo invalido'; end if;
  if c.modelo = p_modelo then raise exception 'essa casa ja esta construida'; end if;
  update perfis set moedas = moedas - preco where id = auth.uid() and moedas >= preco;
  if not found then raise exception 'moedas insuficientes'; end if;
  update casas set modelo = p_modelo where id = c.id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['comprar_casa(integer)', 'guardar_no_bau(integer, text, integer)', 'retirar_do_bau(integer, text, integer)',
                           'vender_casa(integer)', 'construir_casa(integer, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.moradia(integer) from public, anon, authenticated';
end $$;
