-- 120: RPG (persegue o calor do motor) e bazuca (trava e vai reta) contra aeronaves.
-- Militares: pegam no Arsenal com a mesma autorização da arma pesada (Tenente+ ou General Supremo), a cada 10 min,
-- com 4 foguetes. Clãs: compram só o RPG e foguetes com o contrabandista (é crime).
-- Itens: 'rpg', 'bazuca', 'foguete'. Rode depois do 119.
insert into public.precos (item, nome, compra, venda, fome) values
  ('rpg', 'RPG', null, null, 0), ('bazuca', 'Bazuca anti-aérea', null, null, 0), ('foguete', 'Foguete', null, null, 0)
  on conflict (item) do nothing;
alter table public.perfis add column if not exists lancador_em timestamptz;
alter table public.perfis add column if not exists foguete_em timestamptz;

create or replace function public.pegar_lancador(p_item text) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; tem integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p_item not in ('rpg', 'bazuca') then raise exception 'item invalido'; end if;
  if p.cargo <> 'admin' then
    if p.profissao is distinct from 'exercito' then raise exception 'so as forcas armadas'; end if;
    if p.arma_pesada_ate is null or p.arma_pesada_ate < now() then raise exception 'precisa de autorizacao'; end if;
    if p.lancador_em is not null and p.lancador_em > now() - interval '10 minutes' then raise exception 'aguarde para pegar o lancador'; end if;
  end if;
  select coalesce(sum(qtd), 0) into tem from inventario where dono = p.id and item = p_item;
  if tem = 0 then perform dar_item(p.id, p_item, 1); end if;
  select coalesce(sum(qtd), 0) into tem from inventario where dono = p.id and item = 'foguete';
  if tem < 4 then perform dar_item(p.id, 'foguete', 4 - tem); end if;
  update perfis set lancador_em = now() where id = p.id;
  return case p_item when 'rpg' then 'RPG e foguetes' else 'bazuca e foguetes' end;
end $$;

-- contrabandista: RPG (90.000, já vem com 2 foguetes) e foguetes avulsos (6.000 cada). Só membros de clã; +1 crime.
create or replace function public.comprar_rpg() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla compram'; end if;
  if exists (select 1 from inventario where dono = p.id and item = 'rpg' and qtd > 0) then raise exception 'voce ja tem o rpg'; end if;
  update perfis set moedas = moedas - 90000, crimes = crimes + 1 where id = p.id and moedas >= 90000;
  if not found then raise exception 'moedas insuficientes'; end if;
  perform dar_item(p.id, 'rpg', 1); perform dar_item(p.id, 'foguete', 2);
  return 90000;
end $$;

create or replace function public.comprar_foguetes(p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; custo integer;
begin
  p := jogador_livre();
  if not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla compram'; end if;
  if p_qtd not between 1 and 5 then raise exception 'quantidade invalida'; end if;
  custo := 6000 * p_qtd;
  update perfis set moedas = moedas - custo, crimes = crimes + 1 where id = p.id and moedas >= custo;
  if not found then raise exception 'moedas insuficientes'; end if;
  return dar_item(p.id, 'foguete', p_qtd);
end $$;

-- disparo: gasta um foguete (no máximo um a cada 1,5 s)
create or replace function public.usar_foguete() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; resta integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.foguete_em is not null and p.foguete_em > now() - interval '1.5 seconds' then raise exception 'aguarde'; end if;
  resta := dar_item(p.id, 'foguete', -1);
  update perfis set foguete_em = now() where id = p.id;
  return resta;
end $$;

revoke all on function public.pegar_lancador(text), public.comprar_rpg(), public.comprar_foguetes(integer), public.usar_foguete() from public, anon;
grant execute on function public.pegar_lancador(text), public.comprar_rpg(), public.comprar_foguetes(integer), public.usar_foguete() to authenticated;
notify pgrst, 'reload schema';
