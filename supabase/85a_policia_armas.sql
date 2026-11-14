-- 85a (parte 1 de 3) · Polícia e armas, patrocinadores, Saveiro com som e equipe invisível. Rode depois do 84.
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


do $$
declare f text;
begin
  foreach f in array array['entrar_bope()', 'sair_bope()', 'pegar_kit_bope()', 'pegar_armas_arsenal()', 'usar_granada()', 'despachar_kit(text, bigint, real)', 'processar_jujubas()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
