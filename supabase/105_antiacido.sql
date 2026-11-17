-- 105 · Anti-ácido do Exército, depósito do BOPE, estoques começando vazios, caminhões das transportadoras com multa e
-- cofre do Exército. Rode depois do 104 (precisa do 72a, 72b, 85a, 86 e 87 já rodados).
--   · Anti-ácido: bebida (suplemento). Por 7 minutos a fome cai no máximo 3% (o jogo faz a conta). Não enche a barrinha.
--   · Depósitos de rações: Polícia, PRF, BOPE e Bombeiros; até 10.000 jujubas e 10.000 anti-ácidos cada. Todos começam vazios.
--   · Pedido, despacho, licitação, sequestro e comprador ilegal: iguais às jujubas, cada pedido é de um produto.
--   · Licitação: a transportadora precisa ter 5 caminhões. Ao despachar, o quartel chama um caminhão livre da empresa do
--     contrato. Se nenhum estiver livre (todos em outra entrega), a empresa paga 20.000 de multa (por caminhão), que vai
--     para o cofre do Exército, e o Exército manda com caminhão próprio.
--   · Cofre do Exército: Coronel para cima (ou o admin) usa para recompensar soldados exemplares.

insert into public.precos (item, nome, compra, venda, fome) values ('antiacido', 'Anti-ácido (suplemento do Exército)', null, null, 0)
  on conflict (item) do nothing;
alter table public.perfis add column if not exists antiacido_ate   timestamptz;
alter table public.perfis add column if not exists antiacido_pegou timestamptz;

-- depósitos: coluna do anti-ácido e o BOPE
alter table public.jujuba_armazens add column if not exists antiacido integer not null default 0;
alter table public.jujuba_armazens drop constraint if exists jujuba_armazens_antiacido_check;
alter table public.jujuba_armazens add constraint jujuba_armazens_antiacido_check check (antiacido between 0 and 10000);
alter table public.jujuba_armazens drop constraint if exists jujuba_armazens_corp_check;
alter table public.jujuba_armazens add constraint jujuba_armazens_corp_check check (corp in ('policia', 'prf', 'bombeiros', 'bope'));
insert into public.jujuba_armazens (corp, estoque) values ('bope', 0) on conflict do nothing;
-- todos começam vazios (só na primeira vez que este arquivo roda)
alter table public.jujuba_config add column if not exists zerou_105 boolean not null default false;
update public.jujuba_armazens set estoque = 0, antiacido = 0 where exists (select 1 from public.jujuba_config where id = 1 and not zerou_105);
update public.jujuba_config set zerou_105 = true where id = 1;

alter table public.jujuba_pedidos add column if not exists produto text not null default 'jujuba';
alter table public.jujuba_pedidos drop constraint if exists jujuba_pedidos_produto_check;
alter table public.jujuba_pedidos add constraint jujuba_pedidos_produto_check check (produto in ('jujuba', 'antiacido'));
alter table public.jujuba_viagens add column if not exists produto text not null default 'jujuba';
alter table public.jujuba_viagens add column if not exists caminhao bigint references public.caminhoes (id) on delete set null;
alter table public.jujuba_mercado add column if not exists antiacido integer not null default 0;

-- cofre do Exército
create table if not exists public.exercito_cofre (id integer primary key default 1 check (id = 1), saldo bigint not null default 0);
insert into public.exercito_cofre (id) values (1) on conflict do nothing;
create table if not exists public.exercito_recompensas (
  id bigint generated always as identity primary key,
  por uuid references public.perfis (id) on delete set null,
  para uuid references public.perfis (id) on delete set null,
  valor integer not null, motivo text, em timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['exercito_cofre', 'exercito_recompensas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ler on public.%I', t);
    execute format('create policy ler on public.%I for select to authenticated using (true)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- depósito de quem está em serviço: BOPE tem o seu; os outros como antes
create or replace function public.corp_racao(p perfis) returns text
language sql stable set search_path = public as $$
  select case when p.bope then 'bope' else corp_de(p) end;
$$;

-- pegar 5 do depósito (cada produto com a sua espera de 5 min)
create or replace function public.pegar_racao(p_produto text) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c text; n integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  c := corp_racao(p);
  if c is null then raise exception 'so policia prf bope e bombeiros'; end if;
  if p_produto = 'antiacido' then
    if p.antiacido_pegou is not null and p.antiacido_pegou > now() - interval '5 minutes' then raise exception 'aguarde para pegar anti-acido'; end if;
    select least(5, antiacido) into n from jujuba_armazens where corp = c for update;
    if coalesce(n, 0) <= 0 then raise exception 'deposito sem anti-acido'; end if;
    update jujuba_armazens set antiacido = antiacido - n where corp = c;
    update perfis set antiacido_pegou = now() where id = p.id;
  elsif p_produto = 'jujuba' then
    if p.jujuba_pegou is not null and p.jujuba_pegou > now() - interval '5 minutes' then raise exception 'aguarde para pegar jujubas'; end if;
    select least(5, estoque) into n from jujuba_armazens where corp = c for update;
    if coalesce(n, 0) <= 0 then raise exception 'armazem vazio'; end if;
    update jujuba_armazens set estoque = estoque - n where corp = c;
    update perfis set jujuba_pegou = now() where id = p.id;
  else raise exception 'produto invalido'; end if;
  perform dar_item(p.id, p_produto, n);
  return n;
end $$;
create or replace function public.pegar_jujubas() returns integer
language sql security definer set search_path = public as $$ select pegar_racao('jujuba'); $$;

-- tomar o anti-ácido: 7 minutos de efeito (tomar de novo renova)
create or replace function public.usar_antiacido() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; ate timestamptz;
begin
  p := jogador_livre();
  perform dar_item(p.id, 'antiacido', -1);
  ate := now() + interval '7 minutes';
  update perfis set antiacido_ate = ate where id = p.id;
  return ate;
end $$;

-- pedir reposição de um produto ao Exército
create or replace function public.pedir_racao(p_produto text) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c text; novo bigint; tem integer;
begin
  p := jogador_livre();
  c := corp_racao(p);
  if c is null then raise exception 'so policia prf bope e bombeiros'; end if;
  if p_produto not in ('jujuba', 'antiacido') then raise exception 'produto invalido'; end if;
  if exists (select 1 from jujuba_pedidos where corp = c and produto = p_produto and status in ('aberto', 'despachado')) then raise exception 'ja existe um pedido'; end if;
  select case when p_produto = 'antiacido' then antiacido else estoque end into tem from jujuba_armazens where corp = c;
  if tem >= 10000 then raise exception 'armazem cheio'; end if;
  insert into jujuba_pedidos (corp, pedido_por, produto) values (c, p.id, p_produto) returning id into novo;
  return novo;
end $$;
create or replace function public.pedir_jujubas() returns bigint
language sql security definer set search_path = public as $$ select pedir_racao('jujuba'); $$;

-- lance: a transportadora precisa ter 5 caminhões (o contrato exige 5 disponíveis)
create or replace function public.dar_lance(p_empresa bigint, p_valor integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e empresas%rowtype; l licitacoes%rowtype;
begin
  p := jogador_livre();
  select * into e from empresas where id = p_empresa;
  if e.id is null or e.dono <> p.id then raise exception 'empresa invalida'; end if;
  if e.tipo <> 'transportadora' then raise exception 'so transportadoras'; end if;
  if e.nivel < 5 then raise exception 'precisa nivel 5'; end if;
  if (select count(*) from caminhoes where empresa = e.id and tipo = 'caminhao') < 5 then raise exception 'a licitacao exige 5 caminhoes'; end if;
  if p_valor not between 10000 and 5000000 then raise exception 'lance invalido'; end if;
  select * into l from licitacoes where status = 'aberta' order by id desc limit 1;
  if l.id is null then
    if exists (select 1 from licitacoes where status = 'vigente') then raise exception 'contrato em andamento'; end if;
    insert into licitacoes default values returning * into l;
  end if;
  insert into licitacao_lances (licitacao, empresa, valor) values (l.id, e.id, p_valor)
    on conflict (licitacao, empresa) do update set valor = excluded.valor, em = now();
  return l.id;
end $$;

-- o Exército despacha (cada pedido é de um produto). Cada caminhão: chama um caminhão livre da transportadora do
-- contrato (ele fica ocupado até voltar); sem caminhão livre, multa de 20.000 para o cofre do Exército e vai o do Exército
create or replace function public.despachar_jujubas(p_pedido bigint, p_modo text, p_segundos real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; pd jujuba_pedidos%rowtype; falta integer; leva integer; n integer := 0; l licitacoes%rowtype; valor integer;
        cam bigint; seg real; ch timestamptz; v_dono uuid;
begin
  p := jogador_livre();
  if p.profissao is distinct from 'exercito' and p.cargo <> 'admin' then raise exception 'so o exercito'; end if;
  select * into pd from jujuba_pedidos where id = p_pedido for update;
  if pd.id is null or pd.status <> 'aberto' then raise exception 'pedido ja atendido'; end if;
  select 10000 - (case when pd.produto = 'antiacido' then a.antiacido else a.estoque end)
         - coalesce((select sum(v.qtd) from jujuba_viagens v where v.corp = a.corp and v.produto = pd.produto and v.status = 'em_rota'), 0)
    into falta from jujuba_armazens a where a.corp = pd.corp;
  if falta <= 0 then update jujuba_pedidos set status = 'entregue' where id = pd.id; return 0; end if;
  if p_modo = 'cheio' then falta := least(falta, 5000); end if;
  select valor_caminhao into valor from jujuba_config where id = 1;
  seg := greatest(40, least(420, coalesce(p_segundos, 120))); ch := now() + make_interval(secs => seg);
  perform processar_caminhoes();
  while falta > 0 loop
    leva := least(5000, falta); falta := falta - leva; cam := null;
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
        -- o caminhão da empresa fica a serviço do Exército até voltar (ida + volta)
        update caminhoes set status = 'em_rota', pedido = null, carga = 0, partida = now(), chegada = ch, retorno = ch + make_interval(secs => seg), rota = null where id = cam;
        update empresas set caixa = caixa + valor where id = l.empresa;
        update licitacoes set entregas = entregas + 1, status = case when entregas + 1 >= 5 then 'encerrada' else status end where id = l.id;
      end if;
    end if;
    insert into jujuba_viagens (pedido, corp, empresa, qtd, chegada, produto, caminhao)
      values (pd.id, pd.corp, case when cam is not null then l.empresa end, leva, ch, pd.produto, cam);
    n := n + 1;
  end loop;
  update jujuba_pedidos set status = 'despachado' where id = pd.id;
  return n;
end $$;

-- relógio das rações: entrega no depósito certo (jujuba ou anti-ácido) e o kit de armas
create or replace function public.processar_jujubas() returns void
language plpgsql security definer set search_path = public as $$
declare v jujuba_viagens%rowtype; l licitacoes%rowtype; ganhou record;
begin
  if auth.uid() is null then raise exception 'sem permissao'; end if;
  for v in select * from jujuba_viagens where status = 'em_rota' and chegada <= now() for update skip locked loop
    update jujuba_viagens set status = 'entregue' where id = v.id;
    if v.qtd > 0 then
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

-- vender a carga ao comprador ilegal: igual ao de antes, e o anti-ácido vai para o estoque dele de anti-ácido
create or replace function public.vender_jujubas(p_viagem bigint, p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v jujuba_viagens%rowtype; valor integer; dist real;
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

-- clã compra anti-ácido do comprador ilegal: 500 cada
create or replace function public.comprar_antiacido(p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla'; end if;
  if p.policial or p.prf or p.profissao = 'exercito' then raise exception 'loja fechada'; end if;
  if p_qtd not between 1 and 50 then raise exception 'quantidade invalida'; end if;
  select antiacido into m from jujuba_mercado where id = 1 for update;
  if m < p_qtd then raise exception 'o comprador nao tem tudo isso'; end if;
  if p.moedas < p_qtd * 500 then raise exception 'moedas insuficientes'; end if;
  update jujuba_mercado set antiacido = antiacido - p_qtd where id = 1;
  update perfis set moedas = moedas - p_qtd * 500 where id = p.id;
  perform dar_item(p.id, 'antiacido', p_qtd);
  return p_qtd;
end $$;

-- recompensa do cofre do Exército (Coronel para cima, ou o admin) a um soldado exemplar
create or replace function public.recompensar_militar(p_nome text, p_valor integer, p_motivo text) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a perfis%rowtype; s bigint;
begin
  p := jogador_livre();
  if p.cargo is distinct from 'admin' and (p.profissao is distinct from 'exercito'
     or coalesce((select minutos from carreiras where jogador = p.id and carreira = 'exercito'), 0) < 5400) then
    raise exception 'so coronel ou acima';
  end if;
  if p_valor is null or p_valor < 100 or p_valor > 1000000 then raise exception 'valor de 100 a 1.000.000'; end if;
  select * into a from perfis where lower(nome) = lower(trim(p_nome)) limit 1;
  if a.id is null then raise exception 'jogador nao encontrado'; end if;
  if a.profissao is distinct from 'exercito' then raise exception 'so soldados do exercito'; end if;
  if a.id = p.id then raise exception 'nao pode se recompensar'; end if;
  select saldo into s from exercito_cofre where id = 1 for update;
  if s < p_valor then raise exception 'cofre sem saldo'; end if;
  update exercito_cofre set saldo = saldo - p_valor where id = 1;
  update perfis set moedas = least(2147483647::bigint, moedas::bigint + p_valor)::integer where id = a.id;
  insert into exercito_recompensas (por, para, valor, motivo) values (p.id, a.id, p_valor, left(coalesce(p_motivo, ''), 120));
  perform avisar(a.id, format('🎖️ Recompensa do Exército: %s moedas. Motivo: %s', to_char(p_valor, 'FM999G999G999'), left(coalesce(nullif(trim(p_motivo), ''), 'conduta exemplar'), 120)));
  return p_valor;
end $$;

do $$
declare f text;
begin
  foreach f in array array['pegar_racao(text)', 'pegar_jujubas()', 'usar_antiacido()', 'pedir_racao(text)', 'pedir_jujubas()', 'dar_lance(bigint, integer)',
                           'despachar_jujubas(bigint, text, real)', 'processar_jujubas()', 'vender_jujubas(bigint, real, real)', 'comprar_antiacido(integer)',
                           'recompensar_militar(text, integer, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.corp_racao(perfis) from public, anon;
end $$;
