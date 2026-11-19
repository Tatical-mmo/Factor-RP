-- 125: armas laser do laboratório, venda de armadura e desertores. Rode depois do 124.
--  · Laser azul, roxo, vermelho e de energia: autorizados (e o General Supremo) pegam no laboratório da Área 51.
--    Só funcionam com a armadura vestida (o jogo confere). Pente de 10 tiros e 10 s de recarga automática.
--  · Vender a armadura a outro jogador é crime (+1) e aparece no radar das corporações. Se quem vendeu for
--    militar, policial, PRF ou BOPE, vira DESERTOR: perde o posto, é expulso do Exército e as corporações o
--    enxergam como desertor até o administrador perdoar.

insert into public.precos (item, nome, compra, venda, fome) values
  ('laser_azul', 'Laser azul', null, null, 0), ('laser_roxo', 'Laser roxo', null, null, 0),
  ('laser_vermelho', 'Laser vermelho', null, null, 0), ('laser_energia', 'Laser de energia', null, null, 0)
on conflict (item) do nothing;

alter table public.perfis add column if not exists desertor boolean not null default false;

create table if not exists public.armadura_ofertas (
  vendedor uuid primary key references public.perfis (id) on delete cascade,
  comprador uuid not null references public.perfis (id) on delete cascade,
  preco integer not null check (preco between 0 and 100000000),
  em timestamptz not null default now()
);
do $$
begin
  alter table public.armadura_ofertas enable row level security;
  drop policy if exists "partes leem" on public.armadura_ofertas;
  create policy "partes leem" on public.armadura_ofertas for select using (auth.uid() in (vendedor, comprador));
  revoke all on public.armadura_ofertas from anon, authenticated;
  grant select on public.armadura_ofertas to authenticated;
end $$;

create or replace function public.pegar_laser(p_item text) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.cargo <> 'admin' and not p.lab_autorizado then raise exception 'sem autorizacao do laboratorio'; end if;
  if p_item not in ('laser_azul', 'laser_roxo', 'laser_vermelho', 'laser_energia') then raise exception 'item invalido'; end if;
  if exists (select 1 from inventario where dono = p.id and item = p_item and qtd > 0) then raise exception 'voce ja tem essa arma'; end if;
  perform dar_item(p.id, p_item, 1);
  perform registrar(p.id, 'pegou_laser', jsonb_build_object('item', p_item));
  return p_item;
end $$;

-- o dono oferece a armadura a um jogador (vale 10 minutos)
create or replace function public.ofertar_armadura(p_comprador uuid, p_preco integer) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if not exists (select 1 from armaduras where dono = p.id) then raise exception 'voce nao tem armadura'; end if;
  if p_comprador = p.id then raise exception 'escolha outro jogador'; end if;
  if exists (select 1 from armaduras where dono = p_comprador) then raise exception 'esse jogador ja tem armadura'; end if;
  insert into armadura_ofertas (vendedor, comprador, preco) values (p.id, p_comprador, greatest(0, coalesce(p_preco, 0)))
    on conflict (vendedor) do update set comprador = excluded.comprador, preco = excluded.preco, em = now();
  insert into comandos (alvo, autor, tipo, dados) values (p_comprador, p.id, 'aviso', jsonb_build_object('texto',
    format('🤖 %s quer te vender uma armadura por %s moedas. Aceite no 🎯 Tático em até 10 min (comprar é negócio do mercado negro).', p.nome, to_char(greatest(0, coalesce(p_preco, 0)), 'FM999G999G999'))));
end $$;

-- o comprador aceita: paga, leva a armadura; a venda é crime e quem é de corporação vira desertor
create or replace function public.aceitar_armadura(p_vendedor uuid) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; o armadura_ofertas%rowtype; v perfis%rowtype; des boolean;
begin
  p := jogador_livre();
  select * into o from armadura_ofertas where vendedor = p_vendedor for update;
  if o.vendedor is null or o.comprador <> p.id or o.em < now() - interval '10 minutes' then raise exception 'oferta expirada'; end if;
  if exists (select 1 from armaduras where dono = p.id) then raise exception 'voce ja tem uma armadura'; end if;
  if not exists (select 1 from armaduras where dono = o.vendedor) then raise exception 'o vendedor nao tem mais a armadura'; end if;
  update perfis set moedas = moedas - o.preco where id = p.id and moedas >= o.preco;
  if not found then raise exception 'moedas insuficientes'; end if;
  select * into v from perfis where id = o.vendedor for update;
  des := v.profissao = 'exercito' or v.policial or v.prf or v.bope;
  update armaduras set dono = p.id where dono = o.vendedor;
  delete from armadura_ofertas where vendedor = o.vendedor;
  update perfis set moedas = moedas + o.preco, crimes = crimes + case when des then 2 else 1 end,
    desertor = desertor or des,
    expulso_exercito = expulso_exercito or (v.profissao = 'exercito'),
    profissao = case when des and v.profissao = 'exercito' then null else profissao end,
    policial = case when des then false else policial end, prf = case when des then false else prf end, bope = case when des then false else bope end
   where id = o.vendedor;
  perform anotar_ilicito(o.vendedor, case when des then 'venda de armadura (DESERTOR)' else 'venda de armadura do laboratório' end, o.preco);
  perform registrar(o.vendedor, 'vendeu_armadura', jsonb_build_object('comprador', p.id, 'preco', o.preco, 'desertor', des));
  return case when des then 'desertor' else 'ok' end;
end $$;

-- vendas de armadura nas últimas 24 h: militares, Polícia, PRF, BOPE e o administrador veem
create or replace function public.vendas_armadura() returns table (tipo text, valor integer, em timestamptz, quem text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis where id = auth.uid() and (profissao = 'exercito' or policial or prf or bope or cargo = 'admin')) then raise exception 'so as corporacoes'; end if;
  return query select m.tipo, m.valor, m.em, f.nome from movimentos_ilicitos m join perfis f on f.id = m.jogador
    where m.tipo like 'venda de armadura%' and m.em > now() - interval '24 hours' order by m.em desc limit 20;
end $$;

create or replace function public.perdoar_desertor(p_alvo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(cargo_de(auth.uid()), '') <> 'admin' then raise exception 'so o general supremo'; end if;
  update perfis set desertor = false, expulso_exercito = false where id = p_alvo;
  perform registrar(auth.uid(), 'perdoou_desertor', jsonb_build_object('alvo', p_alvo));
end $$;

revoke all on function public.pegar_laser(text), public.ofertar_armadura(uuid, integer), public.aceitar_armadura(uuid), public.vendas_armadura(), public.perdoar_desertor(uuid) from public, anon;
grant execute on function public.pegar_laser(text), public.ofertar_armadura(uuid, integer), public.aceitar_armadura(uuid), public.vendas_armadura(), public.perdoar_desertor(uuid) to authenticated;
notify pgrst, 'reload schema';
