-- 85 · Polícia e armas, patrocinadores, Saveiro com som e equipe invisível. Rode depois do 84.
--   · Armas airsoft: espingarda e fuzil; granadas; barricadas dos clãs.
--   · BOPE (policiais de 3º Sargento para cima) com Caveirão e kit de armas do armazém da corporação.
--   · Forças Armadas pegam as armas no Arsenal; o Exército manda kits de armas para Polícia e PRF de caminhão (com as jujubas ou sozinho).
--   · Patrocinadores (jogadores ricos): patrocinam clãs, fabricam armas e granadas e vendem na loja deles.
--     Cada movimentação aparece no radar da PRF, que investiga e pode deixar o patrocinador procurado.
--   · Saveiro e Saveiro com som na concessionária (o som fica registrado para a moderação).
--   · Moderadores (com o poder) e o administrador ficam invisíveis.

-- ------------------------------------------------------------ itens novos (a loja comum não vende)
insert into public.precos (item, nome, compra, venda, fome) values
  ('espingarda', 'Espingarda airsoft', null, null, 0),
  ('fuzil', 'Fuzil airsoft', null, null, 0),
  ('granada', 'Granada de airsoft', null, null, 0),
  ('barricada', 'Barricada', null, null, 0)
on conflict (item) do update set nome = excluded.nome;

alter table public.perfis add column if not exists bope boolean not null default false;
alter table public.perfis add column if not exists invisivel boolean not null default false;
alter table public.perfis add column if not exists patrocinador boolean not null default false;
alter table public.perfis add column if not exists kit_em timestamptz;
alter table public.perfis add column if not exists granada_em timestamptz;
alter table public.perfis add column if not exists barricada_em timestamptz;

-- ------------------------------------------------------------ BOPE
create or replace function public.entrar_bope() returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; nv integer;
begin
  p := jogador_livre();
  if p.cargo <> 'admin' then
    if not p.policial then raise exception 'so policiais entram no bope'; end if;
    if p.crimes > 0 then raise exception 'procurado nao pode trabalhar no servico publico'; end if;
    select (patente('policia', coalesce(minutos, 0)) ->> 'nivel')::integer into nv from carreiras where jogador = p.id and carreira = 'policia';
    if coalesce(nv, 1) < 3 then raise exception 'o bope aceita de 3o sargento para cima'; end if;
  end if;
  update perfis set bope = true where id = p.id;
end $$;
create or replace function public.sair_bope() returns void
language sql security definer set search_path = public as $$ update perfis set bope = false where id = auth.uid(); $$;

-- ------------------------------------------------------------ armamento das corporações (abastecido pelo Exército)
create table if not exists public.armamento_armazens (
  corp text primary key check (corp in ('policia', 'prf')),
  espingarda integer not null default 10 check (espingarda >= 0),
  fuzil integer not null default 10 check (fuzil >= 0),
  granada integer not null default 30 check (granada >= 0)
);
insert into public.armamento_armazens (corp) values ('policia'), ('prf') on conflict do nothing;
do $$
begin
  alter table public.armamento_armazens enable row level security;
  drop policy if exists ler on public.armamento_armazens;
  create policy ler on public.armamento_armazens for select to authenticated using (true);
end $$;

-- BOPE pega o kit no armazém da Polícia: 1 espingarda e 1 fuzil (se não tiver) e granadas até 3. A cada 10 min.
create or replace function public.pegar_kit_bope() returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a armamento_armazens%rowtype; tem integer; levou text := '';
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if not ((p.policial and p.bope) or p.cargo = 'admin') then raise exception 'so o bope'; end if;
  if p.kit_em is not null and p.kit_em > now() - interval '10 minutes' then raise exception 'aguarde para pegar o kit de novo'; end if;
  select * into a from armamento_armazens where corp = 'policia' for update;
  select coalesce(sum(qtd), 0) into tem from inventario where dono = p.id and item = 'espingarda';
  if tem = 0 and a.espingarda > 0 then perform dar_item(p.id, 'espingarda', 1); a.espingarda := a.espingarda - 1; levou := levou || 'espingarda '; end if;
  select coalesce(sum(qtd), 0) into tem from inventario where dono = p.id and item = 'fuzil';
  if tem = 0 and a.fuzil > 0 then perform dar_item(p.id, 'fuzil', 1); a.fuzil := a.fuzil - 1; levou := levou || 'fuzil '; end if;
  select coalesce(sum(qtd), 0) into tem from inventario where dono = p.id and item = 'granada';
  if tem < 3 and a.granada > 0 then perform dar_item(p.id, 'granada', least(3 - tem, a.granada)); levou := levou || 'granadas'; a.granada := a.granada - least(3 - tem, a.granada); end if;
  if levou = '' then raise exception 'armazem vazio ou voce ja esta equipado'; end if;
  update armamento_armazens set espingarda = a.espingarda, fuzil = a.fuzil, granada = a.granada where corp = 'policia';
  update perfis set kit_em = now() where id = p.id;
  return trim(levou);
end $$;

-- Forças Armadas (Exército, Marinha e Aeronáutica) pegam no Arsenal: espingarda, fuzil e até 6 granadas. A cada 10 min.
create or replace function public.pegar_armas_arsenal() returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; tem integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.profissao is distinct from 'exercito' and p.cargo <> 'admin' then raise exception 'so as forcas armadas'; end if;
  if p.kit_em is not null and p.kit_em > now() - interval '10 minutes' then raise exception 'aguarde para pegar o kit de novo'; end if;
  select coalesce(sum(qtd), 0) into tem from inventario where dono = p.id and item = 'espingarda'; if tem = 0 then perform dar_item(p.id, 'espingarda', 1); end if;
  select coalesce(sum(qtd), 0) into tem from inventario where dono = p.id and item = 'fuzil'; if tem = 0 then perform dar_item(p.id, 'fuzil', 1); end if;
  select coalesce(sum(qtd), 0) into tem from inventario where dono = p.id and item = 'granada'; if tem < 6 then perform dar_item(p.id, 'granada', 6 - tem); end if;
  update perfis set kit_em = now() where id = p.id;
  return 'espingarda, fuzil e granadas';
end $$;

-- granada: gasta uma (no máximo uma a cada 2 s)
create or replace function public.usar_granada() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; resta integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.granada_em is not null and p.granada_em > now() - interval '2 seconds' then raise exception 'aguarde'; end if;
  resta := dar_item(p.id, 'granada', -1);
  update perfis set granada_em = now() where id = p.id;
  return resta;
end $$;

-- ------------------------------------------------------------ kit de armas no caminhão do Exército (com as jujubas ou sozinho)
alter table public.jujuba_viagens add column if not exists kit integer not null default 0;
alter table public.jujuba_viagens drop constraint if exists jujuba_viagens_qtd_check;
alter table public.jujuba_viagens add constraint jujuba_viagens_qtd_check check (qtd between 0 and 5000);

create or replace function public.despachar_kit(p_corp text, p_pedido bigint, p_segundos real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v bigint;
begin
  p := jogador_livre();
  if p.profissao is distinct from 'exercito' and p.cargo <> 'admin' then raise exception 'so o exercito'; end if;
  if p_corp not in ('policia', 'prf') then raise exception 'so policia e prf recebem armas'; end if;
  if p_pedido is not null then
    perform despachar_jujubas(p_pedido, 'cheio', p_segundos);
    select id into v from jujuba_viagens where pedido = p_pedido and status = 'em_rota' order by id desc limit 1;
    if v is null then raise exception 'pedido invalido'; end if;
    update jujuba_viagens set kit = 1 where id = v;
  else
    insert into jujuba_viagens (pedido, corp, qtd, chegada, kit)
      values (null, p_corp, 0, now() + make_interval(secs => greatest(40, least(420, coalesce(p_segundos, 120)))), 1);
  end if;
  return 1;
end $$;

-- relógio das rações: igual ao de antes, e o kit de armas entra no armamento da corporação
create or replace function public.processar_jujubas() returns void
language plpgsql security definer set search_path = public as $$
declare v jujuba_viagens%rowtype; l licitacoes%rowtype; ganhou record;
begin
  if auth.uid() is null then raise exception 'sem permissao'; end if;
  for v in select * from jujuba_viagens where status = 'em_rota' and chegada <= now() for update skip locked loop
    update jujuba_viagens set status = 'entregue' where id = v.id;
    if v.qtd > 0 then update jujuba_armazens set estoque = least(10000, estoque + v.qtd) where corp = v.corp; end if;
    if v.kit > 0 then
      update armamento_armazens set espingarda = least(40, espingarda + 10 * v.kit), fuzil = least(40, fuzil + 10 * v.kit), granada = least(120, granada + 30 * v.kit) where corp = v.corp;
    end if;
    if v.pedido is not null then
      update jujuba_pedidos set status = 'entregue' where id = v.pedido
        and not exists (select 1 from jujuba_viagens x where x.pedido = v.pedido and x.status = 'em_rota' and x.id <> v.id);
    end if;
  end loop;
  for v in select * from jujuba_viagens where status = 'sequestrada' and coalesce(ativo_em, partida) < now() - interval '7 minutes' for update skip locked loop
    update jujuba_viagens set status = 'perdida' where id = v.id;
  end loop;
  select * into l from licitacoes where status in ('aberta', 'vigente') order by id desc limit 1 for update;
  if l.id is null then insert into licitacoes default values; return; end if;
  if l.status = 'aberta' and l.fecha_em <= now() then
    select empresa, valor into ganhou from licitacao_lances where licitacao = l.id order by valor, em limit 1;
    if ganhou.empresa is null then update licitacoes set fecha_em = now() + interval '10 minutes' where id = l.id; return; end if;
    update licitacoes set status = 'vigente', empresa = ganhou.empresa, valor = ganhou.valor where id = l.id;
    update empresas set caixa = caixa + ganhou.valor where id = ganhou.empresa;
    perform avisar((select dono from empresas where id = ganhou.empresa),
      format('🎖️ Sua transportadora ganhou a licitação das rações do Exército! Contrato de %s já está no caixa. Vale 5 caminhões.', ganhou.valor));
  end if;
end $$;

-- ------------------------------------------------------------ barricadas dos clãs
create table if not exists public.barricadas (
  id     bigint generated always as identity primary key,
  cla    bigint not null references public.clas (id) on delete cascade,
  x      real not null,
  z      real not null,
  ang    real not null default 0,
  vida   integer not null default 100 check (vida between 0 and 100),
  criada timestamptz not null default now()
);
do $$
begin
  alter table public.barricadas enable row level security;
  drop policy if exists ler on public.barricadas;
  create policy ler on public.barricadas for select to authenticated using (true);
  revoke all on public.barricadas from anon, authenticated;
  grant select on public.barricadas to authenticated;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'barricadas') then
    alter publication supabase_realtime add table public.barricadas;
  end if;
end $$;

create or replace function public.comprar_barricada(p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; n integer := greatest(1, least(10, coalesce(p_qtd, 1)));
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla'; end if;
  if p.moedas < 2000 * n then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 2000 * n where id = p.id;
  return dar_item(p.id, 'barricada', n);
end $$;

-- coloca onde o jogador está (até 6 por clã; somem depois de 3 h)
create or replace function public.colocar_barricada(p_x real, p_z real, p_ang real) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v_cla bigint; novo bigint;
begin
  p := jogador_livre();
  select cla into v_cla from membros_cla where jogador = p.id;
  if v_cla is null then raise exception 'so membros de cla'; end if;
  if p.barricada_em is not null and p.barricada_em > now() - interval '3 seconds' then raise exception 'aguarde'; end if;
  delete from barricadas where criada < now() - interval '3 hours';
  if (select count(*) from barricadas where cla = v_cla) >= 6 then raise exception 'seu cla ja tem 6 barricadas'; end if;
  perform dar_item(p.id, 'barricada', -1);
  update perfis set barricada_em = now() where id = p.id;
  insert into barricadas (cla, x, z, ang) values (v_cla, p_x, p_z, p_ang) returning id into novo;
  return novo;
end $$;

create or replace function public.recolher_barricada(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_cla bigint; b barricadas%rowtype;
begin
  select cla into v_cla from membros_cla where jogador = auth.uid();
  select * into b from barricadas where id = p_id for update;
  if b.id is null or b.cla is distinct from v_cla then raise exception 'essa barricada nao e do seu cla'; end if;
  delete from barricadas where id = b.id;
  if b.vida >= 50 then perform dar_item(auth.uid(), 'barricada', 1); end if;
end $$;

-- dano (Caveirão empurrando ou granada): no máximo 40 por vez, uma vez a cada 0,4 s por jogador
create or replace function public.danificar_barricada(p_id bigint, p_dano integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.barricada_em is not null and p.barricada_em > now() - interval '400 milliseconds' then return null; end if;
  update perfis set barricada_em = now() where id = p.id;
  update barricadas set vida = greatest(0, vida - greatest(1, least(40, coalesce(p_dano, 10)))) where id = p_id returning vida into v;
  if v is not null and v <= 0 then delete from barricadas where id = p_id; end if;
  return coalesce(v, 0);
end $$;

-- ------------------------------------------------------------ patrocinadores, loja deles e radar da PRF
create table if not exists public.patrocinio_estoque (
  dono  uuid not null references public.perfis (id) on delete cascade,
  item  text not null check (item in ('espingarda', 'fuzil', 'granada')),
  qtd   integer not null default 0 check (qtd >= 0),
  preco integer not null default 20000 check (preco between 100 and 5000000),
  primary key (dono, item)
);
create table if not exists public.movimentos_ilicitos (
  id      bigint generated always as identity primary key,
  jogador uuid not null references public.perfis (id) on delete cascade,
  tipo    text not null,
  valor   integer not null,
  x real, z real,
  em      timestamptz not null default now(),
  investigado boolean not null default false
);
do $$
begin
  alter table public.patrocinio_estoque enable row level security;
  drop policy if exists ler on public.patrocinio_estoque;
  create policy ler on public.patrocinio_estoque for select to authenticated using (true);
  alter table public.movimentos_ilicitos enable row level security;   -- só pelas funções
end $$;

create or replace function public.anotar_ilicito(uid uuid, p_tipo text, p_valor integer) returns void
language sql security definer set search_path = public as $$
  insert into movimentos_ilicitos (jogador, tipo, valor, x, z) select uid, p_tipo, p_valor, pos_x, pos_z from perfis where id = uid;
$$;

create or replace function public.tornar_patrocinador() returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.patrocinador then return; end if;
  if p.policial or p.prf or p.profissao = 'exercito' then raise exception 'servidor publico nao pode ser patrocinador'; end if;
  if p.moedas < 1000000 then raise exception 'precisa de 1.000.000 de moedas'; end if;
  update perfis set moedas = moedas - 100000, patrocinador = true where id = p.id;
end $$;

create or replace function public.patrocinar_cla(p_cla bigint, p_valor integer) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if not p.patrocinador then raise exception 'so patrocinadores'; end if;
  if p_valor is null or p_valor < 1000 then raise exception 'minimo de 1000'; end if;
  if p.moedas < p_valor then raise exception 'moedas insuficientes'; end if;
  if not exists (select 1 from clas where id = p_cla) then raise exception 'cla invalido'; end if;
  update perfis set moedas = moedas - p_valor where id = p.id;
  update clas set caixa = caixa + p_valor where id = p_cla;
  perform avisar((select lider from clas where id = p_cla), format('💰 Seu clã recebeu um patrocínio de %s.', p_valor));
  perform anotar_ilicito(p.id, 'patrocinio de cla', p_valor);
end $$;

-- fabricar: espingarda 8.000, fuzil 15.000, granada 2.000 (cada)
create or replace function public.fabricar_armas(p_item text, p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; custo integer; n integer := greatest(1, least(50, coalesce(p_qtd, 1))); total integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if not p.patrocinador then raise exception 'so patrocinadores'; end if;
  custo := case p_item when 'espingarda' then 8000 when 'fuzil' then 15000 when 'granada' then 2000 end;
  if custo is null then raise exception 'item invalido'; end if;
  if p.moedas < custo * n then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - custo * n where id = p.id;
  insert into patrocinio_estoque (dono, item, qtd, preco) values (p.id, p_item, n, custo * 2)
    on conflict (dono, item) do update set qtd = patrocinio_estoque.qtd + n returning qtd into total;
  perform anotar_ilicito(p.id, 'fabricou ' || p_item, custo * n);
  return total;
end $$;

create or replace function public.preco_patrocinio(p_item text, p_preco integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_preco is null or p_preco < 100 or p_preco > 5000000 then raise exception 'preco entre 100 e 5000000'; end if;
  update patrocinio_estoque set preco = p_preco where dono = auth.uid() and item = p_item;
  if not found then raise exception 'fabrique primeiro'; end if;
end $$;

-- comprar na loja de um patrocinador: só membros de clã
create or replace function public.comprar_patrocinio(p_dono uuid, p_item text, p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e patrocinio_estoque%rowtype; n integer := greatest(1, least(20, coalesce(p_qtd, 1)));
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla compram'; end if;
  if p_dono = p.id then raise exception 'o estoque e seu'; end if;
  select * into e from patrocinio_estoque where dono = p_dono and item = p_item for update;
  if e.dono is null or e.qtd < n then raise exception 'estoque insuficiente'; end if;
  if p.moedas < e.preco * n then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - e.preco * n where id = p.id;
  update perfis set moedas = moedas + e.preco * n where id = p_dono;
  update patrocinio_estoque set qtd = qtd - n where dono = p_dono and item = p_item;
  perform dar_item(p.id, p_item, n);
  perform avisar(p_dono, format('🛒 %s comprou %s %s na sua loja.', p.nome, n, p_item));
  perform anotar_ilicito(p_dono, 'vendeu ' || p_item, e.preco * n);
  return n;
end $$;

-- lojas abertas (com nome do patrocinador)
create or replace function public.lojas_patrocinio() returns table (dono uuid, nome text, item text, qtd integer, preco integer)
language sql stable security definer set search_path = public as $$
  select e.dono, p.nome, e.item, e.qtd, e.preco from patrocinio_estoque e join perfis p on p.id = e.dono
  where e.qtd > 0 and p.patrocinador and not p.banido order by p.nome, e.item;
$$;

-- radar da PRF: as movimentações das últimas 24 h, sem o nome, com a região aproximada
create or replace function public.radar_ilicito() returns table (id bigint, tipo text, valor integer, x real, z real, em timestamptz, investigado boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis where perfis.id = auth.uid() and (prf or cargo = 'admin')) then raise exception 'so a prf'; end if;
  return query select m.id, m.tipo, m.valor, (round(m.x / 60) * 60)::real, (round(m.z / 60) * 60)::real, m.em, m.investigado
    from movimentos_ilicitos m where m.em > now() - interval '24 hours' order by m.em desc limit 40;
end $$;

-- investigar: 65% de chance de achar o responsável; achado, ele vira procurado (+2 estrelas e 5.000 de recompensa)
create or replace function public.investigar_ilicito(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m movimentos_ilicitos%rowtype; alvo perfis%rowtype;
begin
  p := jogador_livre();
  if not (p.prf or p.cargo = 'admin') then raise exception 'so a prf'; end if;
  select * into m from movimentos_ilicitos where id = p_id for update;
  if m.id is null then raise exception 'movimentacao invalida'; end if;
  if m.investigado then raise exception 'ja investigada'; end if;
  update movimentos_ilicitos set investigado = true where id = m.id;
  if random() > 0.65 then return null; end if;
  select * into alvo from perfis where id = m.jogador for update;
  update perfis set crimes = least(5, crimes + 2), recompensa = recompensa + 5000 where id = alvo.id;
  update perfis set moedas = moedas + 500 where id = p.id;
  perform avisar(alvo.id, '🚨 A PRF rastreou suas movimentações ilícitas no radar: você agora é PROCURADO!');
  return alvo.nome;
end $$;

-- ------------------------------------------------------------ Saveiro (concessionária) e o som
alter table public.carros drop constraint if exists carros_modelo_check;
alter table public.carros add constraint carros_modelo_check
  check (modelo in ('popular', 'suv', 'esportivo', 'presidencial', 'helicoptero', 'classico', 'saveiro', 'saveiro_som'));
create or replace function public.preco_carro(m text) returns integer language sql immutable as $$
  select case m when 'popular' then 40000 when 'suv' then 95000 when 'esportivo' then 180000
                when 'classico' then 1000000 when 'helicoptero' then 1500000
                when 'saveiro' then 55000 when 'saveiro_som' then 150000 end;
$$;
-- estacionar: agora vale a ilha inteira (favelas, cidades vizinhas), não só a metrópole
create or replace function public.estacionar_carro(p_carro bigint, p_x real, p_z real, p_ang real) returns void
language plpgsql security definer set search_path = public as $$
begin
  update carros set x = greatest(-1000, least(1100, p_x)), z = greatest(-1528, least(1112, p_z)), ang = p_ang
    where id = p_carro and dono = auth.uid();
  if not found then raise exception 'esse carro nao e seu'; end if;
end $$;

create table if not exists public.som_saveiro (
  id      bigint generated always as identity primary key,
  jogador uuid not null references public.perfis (id) on delete cascade,
  url     text not null,
  texto   text,
  em      timestamptz not null default now()
);
do $$
begin
  alter table public.som_saveiro enable row level security;
  drop policy if exists equipe on public.som_saveiro;
  create policy equipe on public.som_saveiro for select to authenticated
    using (exists (select 1 from perfis a where a.id = auth.uid() and a.cargo in ('admin', 'moderador')));
end $$;
create or replace function public.registrar_som(p_url text, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if not exists (select 1 from carros where dono = p.id and modelo = 'saveiro_som') then raise exception 'precisa de uma saveiro com som'; end if;
  if p_url is null or p_url !~ '^https://' or char_length(p_url) > 400 then raise exception 'link invalido (use https)'; end if;
  insert into som_saveiro (jogador, url, texto) values (p.id, p_url, left(p_texto, 60));
end $$;
create or replace function public.sons_recentes() returns table (id bigint, jogador uuid, nome text, url text, texto text, em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis a where a.id = auth.uid() and a.cargo in ('admin', 'moderador')) then raise exception 'sem permissao'; end if;
  return query select s.id, s.jogador, p.nome, s.url, s.texto, s.em from som_saveiro s join perfis p on p.id = s.jogador order by s.em desc limit 40;
end $$;

-- ------------------------------------------------------------ equipe invisível
create or replace function public.staff_invisivel(ligado boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode('invisivel') then raise exception 'sem permissao'; end if;
  update perfis set invisivel = ligado where id = auth.uid();
end $$;

do $$
declare f text;
begin
  foreach f in array array['entrar_bope()', 'sair_bope()', 'pegar_kit_bope()', 'pegar_armas_arsenal()', 'usar_granada()', 'despachar_kit(text, bigint, real)',
    'processar_jujubas()', 'comprar_barricada(integer)', 'colocar_barricada(real, real, real)', 'recolher_barricada(bigint)', 'danificar_barricada(bigint, integer)',
    'tornar_patrocinador()', 'patrocinar_cla(bigint, integer)', 'fabricar_armas(text, integer)', 'preco_patrocinio(text, integer)', 'comprar_patrocinio(uuid, text, integer)',
    'lojas_patrocinio()', 'radar_ilicito()', 'investigar_ilicito(bigint)', 'estacionar_carro(bigint, real, real, real)', 'registrar_som(text, text)', 'sons_recentes()', 'staff_invisivel(boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.anotar_ilicito(uuid, text, integer) from public, anon, authenticated;
end $$;
