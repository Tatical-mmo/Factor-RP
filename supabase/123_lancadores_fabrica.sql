-- 123: RPG e bazuca fabricados no Exército e levados de caminhão até a Base Aérea (arsenal antiaéreo).
--  · O Exército despacha lotes pela Central de rações (1 lote = 4 RPG, 4 bazucas e 40 foguetes). O caminhão da
--    transportadora do contrato passa no Quartel, carrega, leva até a Base Aérea e volta; sem contrato, vai o do Exército.
--  · Militares em serviço pegam lançador e foguetes no Arsenal sem autorização, enquanto houver estoque.
--  · O contrabandista não vende mais lançadores. Clã que sequestra o caminhão e entrega ao Seu Tonho ganha um saque:
--    cada membro do clã pega 1 RPG e 2 foguetes (até acabar o lote, por 10 minutos); o resto vira dinheiro.
--  · Militar que fere inocente (sem crime, sem recompensa, não invasor): 1ª e 2ª vez perde uma patente; 3ª é expulso.
-- Rode depois do 122.

create table if not exists public.lancadores_estoque (
  id integer primary key default 1 check (id = 1),
  rpg integer not null default 4, bazuca integer not null default 4, foguete integer not null default 40
);
insert into public.lancadores_estoque (id) values (1) on conflict do nothing;
do $$
begin
  alter table public.lancadores_estoque enable row level security;
  drop policy if exists "leitura publica" on public.lancadores_estoque;
  create policy "leitura publica" on public.lancadores_estoque for select using (true);
  revoke all on public.lancadores_estoque from anon, authenticated;
  grant select on public.lancadores_estoque to anon, authenticated;
end $$;

create table if not exists public.lancador_saques (
  viagem bigint primary key, cla bigint not null, restantes integer not null, ate timestamptz not null
);
create table if not exists public.lancador_saque_pegos (viagem bigint not null, jogador uuid not null, primary key (viagem, jogador));
do $$
begin
  alter table public.lancador_saques enable row level security;
  drop policy if exists "leitura publica" on public.lancador_saques;
  create policy "leitura publica" on public.lancador_saques for select using (true);
  revoke all on public.lancador_saques from anon, authenticated;
  grant select on public.lancador_saques to anon, authenticated;
  alter table public.lancador_saque_pegos enable row level security;
  revoke all on public.lancador_saque_pegos from anon, authenticated;
end $$;

alter table public.perfis add column if not exists faltas_inocente integer not null default 0;
alter table public.perfis add column if not exists falta_inocente_em timestamptz;

-- despachar um lote de lançadores para a Base Aérea
create or replace function public.despachar_lancadores(p_segundos real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; l licitacoes%rowtype; valor integer; cam bigint; seg real; ch timestamptz; v_dono uuid; e lancadores_estoque%rowtype;
begin
  p := jogador_livre();
  if p.profissao is distinct from 'exercito' and p.cargo <> 'admin' then raise exception 'so o exercito'; end if;
  if exists (select 1 from jujuba_viagens where produto = 'lancador' and status = 'em_rota') then raise exception 'ja tem lote a caminho'; end if;
  select * into e from lancadores_estoque where id = 1;
  if e.rpg >= 36 and e.bazuca >= 36 then raise exception 'arsenal cheio'; end if;
  select valor_caminhao into valor from jujuba_config where id = 1;
  seg := greatest(40, least(420, coalesce(p_segundos, 120))); ch := now() + make_interval(secs => seg);
  perform processar_caminhoes();
  select * into l from licitacoes where status = 'vigente' order by id desc limit 1 for update;
  if l.id is not null then
    select c.id into cam from caminhoes c
     where c.empresa = l.empresa and c.tipo = 'caminhao' and c.status = 'parado' and not c.roubado
     order by c.id limit 1 for update skip locked;
    select dono into v_dono from empresas where id = l.empresa;
    if cam is null then
      update empresas set caixa = caixa - least(20000, greatest(caixa, 0)) where id = l.empresa;
      update exercito_cofre set saldo = saldo + 20000 where id = 1;
      perform avisar(v_dono, '🎖️ O Exército chamou um caminhão do contrato e nenhum estava livre: multa de 20.000 (vai para o cofre do Exército).');
    else
      update caminhoes set status = 'em_rota', pedido = null, carga = 0, partida = now(), chegada = ch, retorno = ch + make_interval(secs => seg), rota = null where id = cam;
      update empresas set caixa = caixa + valor where id = l.empresa;
      update licitacoes set entregas = entregas + 1, status = case when entregas + 1 >= 5 then 'encerrada' else status end where id = l.id;
    end if;
  end if;
  insert into jujuba_viagens (pedido, corp, empresa, qtd, chegada, produto, caminhao)
    values (null, 'aerea', case when cam is not null then l.empresa end, 1, ch, 'lancador', cam);
  return 1;
end $$;

-- relógio das rações (igual ao do 105) com a entrega do lote de lançadores no arsenal
create or replace function public.processar_jujubas() returns void
language plpgsql security definer set search_path = public as $$
declare v jujuba_viagens%rowtype; l licitacoes%rowtype; ganhou record;
begin
  if auth.uid() is null then raise exception 'sem permissao'; end if;
  for v in select * from jujuba_viagens where status = 'em_rota' and chegada <= now() for update skip locked loop
    update jujuba_viagens set status = 'entregue' where id = v.id;
    if v.produto = 'lancador' then
      update lancadores_estoque set rpg = least(40, rpg + 4 * v.qtd), bazuca = least(40, bazuca + 4 * v.qtd), foguete = least(400, foguete + 40 * v.qtd) where id = 1;
    elsif v.qtd > 0 then
      if v.produto = 'antiacido' then update jujuba_armazens set antiacido = least(10000, antiacido + v.qtd) where corp = v.corp;
      else update jujuba_armazens set estoque = least(10000, estoque + v.qtd) where corp = v.corp; end if;
    end if;
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
      format('🎖️ Sua transportadora ganhou a licitação das rações do Exército! Contrato de %s já está no caixa. Vale 5 caminhões: deixe 5 livres, ou paga 20.000 de multa por chamada sem caminhão.', ganhou.valor));
  end if;
end $$;

-- vender a carga ao Seu Tonho (igual ao do 105); lote de lançadores: 50.000 e abre o saque para o clã
create or replace function public.vender_jujubas(p_viagem bigint, p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v jujuba_viagens%rowtype; valor integer; dist real; meu_cla bigint;
begin
  p := jogador_livre();
  select * into v from jujuba_viagens where id = p_viagem for update;
  if v.id is null or v.status <> 'sequestrada' or v.motorista is distinct from p.id then raise exception 'voce nao esta nesse veiculo'; end if;
  if abs(p_x - 64) > 30 or abs(p_z + 972) > 30 then raise exception 'longe do comprador'; end if;
  dist := sqrt(power(coalesce(v.seq_x, 64) - 64, 2) + power(coalesce(v.seq_z, -972) + 972, 2));
  if v.seq_em is not null and extract(epoch from now() - v.seq_em) < dist / 30 then
    perform registrar_falta(p.id, 'carga de rações teletransportada', jsonb_build_object('viagem', v.id, 'metros', round(dist), 'segundos', round(extract(epoch from now() - v.seq_em))), 2);
    return 0;
  end if;
  if v.produto = 'lancador' then
    valor := 50000 * v.qtd;
    select cla into meu_cla from membros_cla where jogador = p.id;
    if meu_cla is not null then
      insert into lancador_saques (viagem, cla, restantes, ate) values (v.id, meu_cla, 8 * v.qtd, now() + interval '10 minutes')
        on conflict (viagem) do nothing;
    end if;
    update jujuba_viagens set status = 'vendida' where id = v.id;
    update perfis set moedas = moedas + valor where id = p.id;
    return valor;
  end if;
  valor := v.qtd * 9;
  if coalesce(v.kit, 0) > 0 then
    update tonho_estoque set qtd = least(500, qtd + 10 * v.kit) where item in ('espingarda', 'fuzil');
    update tonho_estoque set qtd = least(1500, qtd + 30 * v.kit) where item = 'granada';
    valor := valor + v.kit * (20 * 10000 + 30 * 1000);
  end if;
  update jujuba_viagens set status = 'vendida' where id = v.id;
  if v.qtd > 0 then
    if v.produto = 'antiacido' then update jujuba_mercado set antiacido = antiacido + v.qtd where id = 1;
    else update jujuba_mercado set estoque = estoque + v.qtd where id = 1; end if;
  end if;
  update perfis set moedas = moedas + valor where id = p.id;
  return valor;
end $$;

-- membro do clã pega a sua parte do saque no Seu Tonho: 1 RPG (se ainda não tiver) e 2 foguetes, uma vez por saque
create or replace function public.pegar_saque_lancador(p_x real, p_z real) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; meu_cla bigint; s lancador_saques%rowtype;
begin
  p := jogador_livre();
  if abs(p_x - 64) > 30 or abs(p_z + 972) > 30 then raise exception 'longe do comprador'; end if;
  select cla into meu_cla from membros_cla where jogador = p.id;
  if meu_cla is null then raise exception 'so membros de cla'; end if;
  select * into s from lancador_saques x where x.cla = meu_cla and x.ate > now() and x.restantes > 0
    and not exists (select 1 from lancador_saque_pegos g where g.viagem = x.viagem and g.jogador = p.id)
    order by x.ate limit 1 for update;
  if s.viagem is null then raise exception 'nenhum saque para voce'; end if;
  update lancador_saques set restantes = restantes - 1 where viagem = s.viagem;
  insert into lancador_saque_pegos (viagem, jogador) values (s.viagem, p.id);
  if not exists (select 1 from inventario where dono = p.id and item = 'rpg' and qtd > 0) then perform dar_item(p.id, 'rpg', 1); end if;
  perform dar_item(p.id, 'foguete', 2);
  return 'RPG e 2 foguetes';
end $$;

-- arsenal: militar em serviço pega o lançador e completa 4 foguetes, sem autorização, enquanto houver estoque
create or replace function public.pegar_lancador(p_item text) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; tem integer; e lancadores_estoque%rowtype; falta integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p_item not in ('rpg', 'bazuca') then raise exception 'item invalido'; end if;
  if p.cargo <> 'admin' then
    if p.profissao is distinct from 'exercito' then raise exception 'so as forcas armadas'; end if;
    if p.lancador_em is not null and p.lancador_em > now() - interval '2 minutes' then raise exception 'aguarde para pegar o lancador'; end if;
  end if;
  select * into e from lancadores_estoque where id = 1 for update;
  select coalesce(sum(qtd), 0) into tem from inventario where dono = p.id and item = p_item;
  if tem = 0 then
    if p.cargo <> 'admin' then
      if (case when p_item = 'rpg' then e.rpg else e.bazuca end) <= 0 then raise exception 'arsenal sem lancador'; end if;
      if p_item = 'rpg' then update lancadores_estoque set rpg = rpg - 1 where id = 1; else update lancadores_estoque set bazuca = bazuca - 1 where id = 1; end if;
    end if;
    perform dar_item(p.id, p_item, 1);
  end if;
  select coalesce(sum(qtd), 0) into tem from inventario where dono = p.id and item = 'foguete';
  falta := greatest(0, 4 - tem);
  if p.cargo <> 'admin' then falta := least(falta, e.foguete); update lancadores_estoque set foguete = foguete - falta where id = 1; end if;
  if falta > 0 then perform dar_item(p.id, 'foguete', falta); end if;
  update perfis set lancador_em = now() where id = p.id;
  return case p_item when 'rpg' then 'RPG e foguetes' else 'bazuca e foguetes' end;
end $$;

-- o contrabandista parou de vender lançadores (agora só sequestrando o caminhão do Exército)
create or replace function public.comprar_rpg() returns integer
language plpgsql security definer set search_path = public as $$ begin raise exception 'o contrabandista nao vende mais lancadores'; end $$;
create or replace function public.comprar_foguetes(p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$ begin raise exception 'o contrabandista nao vende mais lancadores'; end $$;

-- militar feriu jogador inocente: 1ª e 2ª vez perde uma patente; na 3ª é expulso do Exército.
-- Um ataque (rajada) conta uma vez só a cada 2 minutos.
create or replace function public.militar_feriu_inocente(p_alvo uuid, p_invasor boolean) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a perfis%rowtype; m integer; nv integer; novo record; n integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.profissao is distinct from 'exercito' or p.cargo = 'admin' then return null; end if;
  if coalesce(p_invasor, false) or p_alvo = p.id then return null; end if;
  select * into a from perfis where id = p_alvo;
  if a.id is null or coalesce(a.crimes, 0) > 0 or coalesce(a.recompensa, 0) > 0 then return null; end if;
  if p.falta_inocente_em is not null and p.falta_inocente_em > now() - interval '2 minutes' then return null; end if;
  n := p.faltas_inocente + 1;
  if n >= 3 then
    update perfis set faltas_inocente = 0, falta_inocente_em = now(), expulso_exercito = true, arma_pesada_ate = null, profissao = null where id = p.id;
    insert into comandos (alvo, autor, tipo, dados) values (p.id, p.id, 'aviso', jsonb_build_object('texto', '🎖️ Você foi EXPULSO do Exército: feriu inocentes pela 3ª vez.'));
    perform registrar(p.id, 'expulso_exercito', jsonb_build_object('motivo', 'feriu inocente 3 vezes', 'alvo', p_alvo));
    return 'expulso';
  end if;
  update perfis set faltas_inocente = n, falta_inocente_em = now() where id = p.id;
  select minutos into m from carreiras where jogador = p.id and carreira = 'exercito' for update;
  select coalesce(max(c.nivel), 1) into nv from cargos_carreira('exercito') c where c.minimo <= coalesce(m, 0);
  if nv > 1 then
    select * into novo from cargos_carreira('exercito') c where c.nivel = nv - 1;
    update carreiras set minutos = novo.minimo where jogador = p.id and carreira = 'exercito';
    perform registrar(p.id, 'rebaixado_exercito', jsonb_build_object('motivo', 'feriu inocente', 'alvo', p_alvo, 'para', novo.nome));
    return 'rebaixado:' || novo.nome || ':' || n;
  end if;
  perform registrar(p.id, 'falta_exercito', jsonb_build_object('motivo', 'feriu inocente', 'alvo', p_alvo));
  return 'aviso:' || n;
end $$;

revoke all on function public.despachar_lancadores(real), public.pegar_saque_lancador(real, real), public.militar_feriu_inocente(uuid, boolean) from public, anon;
grant execute on function public.despachar_lancadores(real), public.pegar_saque_lancador(real, real), public.militar_feriu_inocente(uuid, boolean) to authenticated;
notify pgrst, 'reload schema';
