-- Fator RP - casas por dentro: baú do dono e venda da casa.
-- Cole tudo numa consulta limpa e toque em Run.

create table if not exists public.bau (
  casa integer not null references public.casas (id) on delete cascade,
  item text not null references public.precos (item),
  qtd  integer not null check (qtd >= 0),
  primary key (casa, item)
);
alter table public.bau enable row level security;
drop policy if exists "dono ve o bau" on public.bau;
create policy "dono ve o bau" on public.bau for select to authenticated
  using (exists (select 1 from public.casas c where c.id = casa and c.dono = auth.uid()));
revoke all on public.bau from anon, authenticated;
grant select on public.bau to authenticated;

create or replace function public.minha_casa() returns public.casas
language sql stable security definer set search_path = public as $$
  select * from casas where dono = auth.uid();
$$;

-- guardar: tira da mochila e põe no baú (até 200 de cada item)
create or replace function public.guardar_no_bau(p_item text, p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c casas%rowtype; novo integer;
begin
  c := minha_casa();
  if c.id is null then raise exception 'voce nao tem casa'; end if;
  if p_qtd < 1 or p_qtd > 200 then raise exception 'quantidade invalida'; end if;
  perform dar_item(auth.uid(), p_item, -p_qtd);
  insert into bau (casa, item, qtd) values (c.id, p_item, p_qtd)
  on conflict (casa, item) do update set qtd = bau.qtd + p_qtd returning qtd into novo;
  if novo > 200 then raise exception 'bau cheio'; end if;
  return novo;
end $$;

-- retirar: tira do baú e põe na mochila
create or replace function public.retirar_do_bau(p_item text, p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c casas%rowtype; n integer;
begin
  c := minha_casa();
  if c.id is null then raise exception 'voce nao tem casa'; end if;
  if p_qtd < 1 then raise exception 'quantidade invalida'; end if;
  update bau set qtd = qtd - p_qtd where casa = c.id and item = p_item and qtd >= p_qtd;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'itens insuficientes'; end if;
  return dar_item(auth.uid(), p_item, p_qtd);
end $$;

-- vender a casa: devolve 20.000 e o baú volta para a mochila
create or replace function public.vender_casa() returns integer
language plpgsql security definer set search_path = public as $$
declare c casas%rowtype; b record;
begin
  c := minha_casa();
  if c.id is null then raise exception 'voce nao tem casa'; end if;
  for b in select item, qtd from bau where casa = c.id and qtd > 0 loop
    perform dar_item(auth.uid(), b.item, b.qtd);
  end loop;
  delete from bau where casa = c.id;
  update casas set dono = null where id = c.id;
  update perfis set moedas = moedas + 20000 where id = auth.uid();
  return 20000;
end $$;

do $$
declare f text;
begin
  foreach f in array array['guardar_no_bau(text, integer)', 'retirar_do_bau(text, integer)', 'vender_casa()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.minha_casa() from public, anon, authenticated';
end $$;
