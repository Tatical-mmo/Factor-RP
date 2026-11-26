-- Fator RP - 160: economia das fábricas.
-- 1) Estoque da cidade: a tabela mercado passa a guardar quantas caixas a cidade tem de cada produto.
--    A transportadora entrega -> a cidade paga a fábrica e a caixa entra no estoque (1 caixa = 1 unidade).
--    A loja só vende o que tem no estoque; o hospital gasta 1 remédio por tratamento; os moradores consomem um pouco por hora.
-- 2) Preço que varia: estoque vazio paga até 1,6x o valor base por caixa; estoque cheio paga 0,4x e a cidade para de comprar.
-- 3) Quadro de encomendas: jogador ou clã encomenda, as fábricas dão lances por 10 min, o menor preço leva e entrega por frete.
-- 4) Produtos novos: hambúrguer e refeição completa.

-- ------------------------------------------------------------ 1) estoque da cidade
alter table public.mercado add column if not exists valor_base integer;
alter table public.mercado add column if not exists estoque integer not null default 0;
alter table public.mercado add column if not exists capacidade integer not null default 400;
alter table public.mercado add column if not exists consumo_hora integer not null default 10;
alter table public.mercado add column if not exists atualizado_em timestamptz not null default now();

-- primeira vez: guarda o valor base e põe um estoque inicial
update public.mercado set valor_base = valor_caixa,
  estoque = case produto when 'chocolate' then 150 when 'remedio' then 80 else 50 end,
  capacidade = case produto when 'chocolate' then 400 when 'remedio' then 300 else 300 end,
  consumo_hora = case produto when 'chocolate' then 12 when 'remedio' then 6 else 8 end
where valor_base is null;

insert into public.mercado (produto, valor_caixa, valor_base, estoque, capacidade, consumo_hora) values
  ('hamburguer', 80, 80, 60, 300, 10),
  ('refeicao', 140, 140, 40, 200, 6)
on conflict (produto) do nothing;

-- preço por caixa calculado do estoque: 1,6x (vazio) até 0,4x (cheio)
create or replace function public.mercado_preco() returns trigger
language plpgsql as $$
begin
  if new.valor_base is not null then
    new.valor_caixa := greatest(1, round(new.valor_base * (1.6 - 1.2 * least(1.0, greatest(0, new.estoque)::numeric / greatest(1, new.capacidade)))));
  end if;
  return new;
end $$;
drop trigger if exists mercado_preco on public.mercado;
create trigger mercado_preco before insert or update on public.mercado for each row execute function public.mercado_preco();
update public.mercado set estoque = estoque;

-- os moradores (NPCs) consomem um pouco por hora; calculado quando alguém olha ou mexe no estoque
create or replace function public.atualizar_cidade() returns void
language plpgsql security definer set search_path = public as $$
declare m mercado%rowtype; n integer;
begin
  for m in select * from mercado where consumo_hora > 0 and atualizado_em < now() - interval '1 minute' for update skip locked loop
    n := floor(extract(epoch from (now() - m.atualizado_em)) * m.consumo_hora / 3600.0);
    if n < 1 then continue; end if;
    if m.estoque - n <= 0 then
      update mercado set estoque = 0, atualizado_em = now() where produto = m.produto;
    else
      update mercado set estoque = estoque - n, atualizado_em = atualizado_em + make_interval(secs => n * 3600.0 / m.consumo_hora) where produto = m.produto;
    end if;
  end loop;
end $$;

-- caixas a caminho da cidade (pedidos normais ainda não entregues)
create or replace function public.caixas_a_caminho(p_produto text) returns integer
language plpgsql stable security definer set search_path = public as $$
begin
  return (select coalesce(sum(qtd - entregues), 0)::int from pedidos
          where produto = p_produto and status in ('aberto', 'aceito') and missao is null and encomenda_id is null);
end $$;

-- tabela de preços e estoque para a tela (loja, empresa, quadro)
create or replace function public.estoque_cidade() returns table (produto text, valor_caixa integer, valor_base integer, estoque integer, capacidade integer, a_caminho integer)
language plpgsql security definer set search_path = public as $$
begin
  perform atualizar_cidade();
  return query select m.produto, m.valor_caixa, m.valor_base, m.estoque, m.capacidade, caixas_a_caminho(m.produto) from mercado m order by m.valor_base;
end $$;

-- ------------------------------------------------------------ 4) produtos novos
insert into public.precos (item, nome, compra, venda, fome) values
  ('hamburguer', 'Hambúrguer', 250, null, 100),
  ('refeicao', 'Refeição completa (almoço + refresco)', 450, null, 100)
on conflict (item) do update set nome = excluded.nome, compra = excluded.compra, venda = excluded.venda, fome = excluded.fome;

alter table public.perfis add column if not exists refeicao_ate timestamptz;

alter table public.empresas drop constraint if exists empresas_produto_v4;
alter table public.empresas drop constraint if exists empresas_produto_v5;
alter table public.empresas add constraint empresas_produto_v5 check (produto is null or produto in
  ('chocolate', 'remedio', 'robo', 'caminhao', 'van', 'helicoptero', 'hamburguer', 'refeicao'));

create or replace function public.comprar_lote(p_lote integer, p_nome text, p_tipo text, p_produto text) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; l lotes%rowtype; nova bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if (select count(*) from empresas where dono = p.id) >= 5 then raise exception 'limite de empresas'; end if;
  select * into l from lotes where id = p_lote;
  if l.id is null then raise exception 'lote invalido'; end if;
  if exists (select 1 from unidades where lote = p_lote) then raise exception 'lote ja vendido'; end if;
  if p_tipo not in ('fabrica', 'transportadora') then raise exception 'tipo invalido'; end if;
  if p_tipo = 'fabrica' and coalesce(p_produto, '') not in ('chocolate', 'remedio', 'hamburguer', 'refeicao', 'robo', 'caminhao', 'van', 'helicoptero') then raise exception 'produto invalido'; end if;
  if p_nome !~ '^[[:alnum:] _.&-]{3,24}$' then raise exception 'nome invalido'; end if;
  if exists (select 1 from empresas where lower(nome) = lower(p_nome)) then raise exception 'nome de empresa em uso'; end if;
  if p.moedas < l.preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - l.preco where id = p.id;
  insert into empresas (nome, tipo, dono, lote, produto, fabrica, transporte)
    values (p_nome, p_tipo, p.id, p_lote, case when p_tipo = 'fabrica' then p_produto end, p_tipo = 'fabrica', p_tipo = 'transportadora')
    returning id into nova;
  insert into unidades (lote, empresa, funcao) values (p_lote, nova, p_tipo);
  return nova;
end $$;

-- hambúrguer leva 150 s e refeição 240 s por funcionário NPC (chocolate e remédio seguem 90 s)
create or replace function public.produzir_robos() returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; ativos integer; seg double precision; n integer; passo double precision;
begin
  for e in select * from empresas where fabrica for update skip locked loop
    ativos := robos_ativos(e);
    if ativos <= 0 then
      if e.producao_marca < now() - interval '10 minutes' then update empresas set producao_marca = now() - interval '5 minutes' where id = e.id; end if;
      continue;
    end if;
    passo := (case when e.produto = 'robo' then 1200 when eh_veiculo(e.produto) then veiculo(e.produto, 'producao')
                   when e.produto = 'hamburguer' then 150 when e.produto = 'refeicao' then 240 else 90 end)
             * 100.0 / limite(e.nivel, 'producao') / ativos;
    seg := least(4 * 3600, extract(epoch from (now() - e.producao_marca)));
    n := floor(seg / passo);
    if n > 0 then
      update empresas set estoque = estoque + n,
        producao_marca = greatest(e.producao_marca, now() - interval '4 hours') + make_interval(secs => n * passo)
      where id = e.id;
    end if;
  end loop;
end $$;
revoke all on function public.produzir_robos() from public, anon, authenticated;

-- comer: a refeição completa também deixa a fome cair pela metade por 20 min
create or replace function public.consumir(nome_item text) returns real
language plpgsql security definer set search_path = public as $$
declare enche integer; nova real;
begin
  select fome into enche from precos where item = nome_item;
  if coalesce(enche, 0) <= 0 then raise exception 'isso nao se come'; end if;
  perform dar_item(auth.uid(), nome_item, -1);
  update perfis set fome = least(100, fome + enche),
    refeicao_ate = case when nome_item = 'refeicao' then now() + interval '20 minutes' else refeicao_ate end
  where id = auth.uid() returning fome into nova;
  return nova;
end $$;

-- ------------------------------------------------------------ 3) quadro de encomendas
create table if not exists public.encomendas_cidade (
  id         bigint generated always as identity primary key,
  comprador  uuid not null references public.perfis (id) on delete cascade,
  cla        bigint references public.clas (id) on delete set null,
  produto    text not null references public.mercado (produto),
  qtd        integer not null check (qtd between 1 and 200),
  preco_max  integer not null check (preco_max > 0),
  deposito   integer not null default 0 check (deposito >= 0),   -- dinheiro guardado (devolvido no que sobrar)
  status     text not null default 'leilao' check (status in ('leilao', 'aguardando', 'entregando', 'concluida', 'expirada', 'cancelada')),
  vencedor   bigint references public.empresas (id) on delete set null,
  preco      integer,
  entregues  integer not null default 0,
  pedido     bigint,
  fecha_em   timestamptz not null default now() + interval '10 minutes',
  prazo      timestamptz not null default now() + interval '24 hours 10 minutes',
  criado_em  timestamptz not null default now()
);
create index if not exists encomendas_cidade_status on public.encomendas_cidade (status);
create table if not exists public.lances_encomenda (
  encomenda_id bigint not null references public.encomendas_cidade (id) on delete cascade,
  empresa   bigint not null references public.empresas (id) on delete cascade,
  preco     integer not null check (preco > 0),
  criado_em timestamptz not null default now(),
  primary key (encomenda_id, empresa)
);
alter table public.pedidos add column if not exists encomenda_id bigint references public.encomendas_cidade (id) on delete set null;
do $$
begin
  alter table public.encomendas_cidade enable row level security;
  alter table public.lances_encomenda enable row level security;
  revoke all on public.encomendas_cidade from anon, authenticated;
  revoke all on public.lances_encomenda from anon, authenticated;
end $$;

-- devolve dinheiro do depósito ao jogador ou ao caixa do clã
create or replace function public.devolver_encomenda(e encomendas_cidade, valor integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if valor <= 0 then return; end if;
  update encomendas_cidade set deposito = greatest(0, deposito - valor) where id = e.id;
  if e.cla is not null and exists (select 1 from clas where id = e.cla) then update clas set caixa = caixa + valor where id = e.cla;
  else update perfis set moedas = moedas + valor where id = e.comprador; end if;
end $$;

-- fecha leilões vencidos e devolve encomendas que passaram do prazo (chamado ao abrir o quadro e nas ações)
create or replace function public.fechar_encomendas() returns void
language plpgsql security definer set search_path = public as $$
declare e encomendas_cidade%rowtype; l lances_encomenda%rowtype; dono_v uuid;
begin
  for e in select * from encomendas_cidade where status = 'leilao' and fecha_em <= now() for update skip locked loop
    select * into l from lances_encomenda where encomenda_id = e.id order by preco, criado_em limit 1;
    if l.encomenda_id is null then
      perform devolver_encomenda(e, e.deposito);
      update encomendas_cidade set status = 'expirada' where id = e.id;
      perform avisar(e.comprador, format('Sua encomenda de %s %s não recebeu lances. Dinheiro devolvido.', e.qtd, (select nome from precos where item = e.produto)));
    else
      update encomendas_cidade set status = 'aguardando', vencedor = l.empresa, preco = l.preco where id = e.id;
      perform devolver_encomenda(e, e.deposito - l.preco * e.qtd);
      select dono into dono_v from empresas where id = l.empresa;
      perform avisar(dono_v, format('Sua fábrica venceu a encomenda #%s: %s caixas a %s cada. Envie pelo quadro de encomendas em até 24 h.', e.id, e.qtd, l.preco));
      perform avisar(e.comprador, format('Encomenda #%s fechada a %s por unidade. A fábrica tem 24 h para entregar.', e.id, l.preco));
    end if;
  end loop;
  for e in select * from encomendas_cidade where status in ('aguardando', 'entregando') and prazo <= now() for update skip locked loop
    perform devolver_encomenda(e, (e.qtd - e.entregues) * e.preco);
    update encomendas_cidade set status = case when e.entregues > 0 then 'concluida' else 'expirada' end where id = e.id;
    perform avisar(e.comprador, format('Encomenda #%s passou do prazo: %s de %s entregues, o resto foi devolvido.', e.id, e.entregues, e.qtd));
  end loop;
end $$;

create or replace function public.criar_encomenda(p_produto text, p_qtd integer, p_preco_max integer, p_cla boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c clas%rowtype; base integer; total integer; novo bigint; d uuid;
begin
  p := jogador_livre();
  select valor_base into base from mercado where produto = p_produto;
  if base is null then raise exception 'produto invalido'; end if;
  if p_qtd < 1 or p_qtd > 200 then raise exception 'quantidade invalida'; end if;
  if p_preco_max < 1 or p_preco_max > base * 4 then raise exception 'preco invalido'; end if;
  if (select count(*) from encomendas_cidade where comprador = p.id and status in ('leilao', 'aguardando', 'entregando')) >= 5 then raise exception 'limite de encomendas'; end if;
  total := p_qtd * p_preco_max;
  if p_cla then
    c := cla_do_lider();
    update clas set caixa = caixa - total where id = c.id and caixa >= total;
    if not found then raise exception 'caixa do cla sem saldo'; end if;
  else
    update perfis set moedas = moedas - total where id = p.id and moedas >= total;
    if not found then raise exception 'moedas insuficientes'; end if;
  end if;
  insert into encomendas_cidade (comprador, cla, produto, qtd, preco_max, deposito)
    values (p.id, case when p_cla then c.id end, p_produto, p_qtd, p_preco_max, total) returning id into novo;
  for d in select distinct dono from empresas where fabrica and produto = p_produto and dono <> p.id loop
    perform avisar(d, format('Nova encomenda #%s no quadro: %s caixas de %s, até %s por unidade. Lances por 10 min.', novo, p_qtd, (select nome from precos where item = p_produto), p_preco_max));
  end loop;
  return novo;
end $$;

create or replace function public.cancelar_encomenda(p_encomenda bigint) returns void
language plpgsql security definer set search_path = public as $$
declare e encomendas_cidade%rowtype;
begin
  perform jogador_livre();
  select * into e from encomendas_cidade where id = p_encomenda for update;
  if e.id is null or e.comprador <> auth.uid() then raise exception 'encomenda indisponivel'; end if;
  if e.status <> 'leilao' then raise exception 'so da para cancelar antes de fechar'; end if;
  if exists (select 1 from lances_encomenda where encomenda_id = e.id) then raise exception 'ja tem lances'; end if;
  perform devolver_encomenda(e, e.deposito);
  update encomendas_cidade set status = 'cancelada' where id = e.id;
end $$;

create or replace function public.lance_encomenda(p_encomenda bigint, p_empresa bigint, p_preco integer) returns void
language plpgsql security definer set search_path = public as $$
declare f empresas%rowtype; e encomendas_cidade%rowtype; dono_a uuid;
begin
  perform jogador_livre();
  perform fechar_encomendas();
  f := do_dono(p_empresa);
  select * into e from encomendas_cidade where id = p_encomenda for update;
  if e.id is null or e.status <> 'leilao' or e.fecha_em <= now() then raise exception 'leilao encerrado'; end if;
  if not f.fabrica or f.produto is distinct from e.produto then raise exception 'sua fabrica nao faz esse produto'; end if;
  if e.comprador = f.dono then raise exception 'nao pode dar lance na propria encomenda'; end if;
  if p_preco < 1 or p_preco > e.preco_max then raise exception 'lance fora do limite'; end if;
  -- quem tinha o menor lance fica sabendo que foi superado
  select x.dono into dono_a from lances_encomenda l join empresas x on x.id = l.empresa
    where l.encomenda_id = e.id and l.empresa <> f.id order by l.preco, l.criado_em limit 1;
  insert into lances_encomenda (encomenda_id, empresa, preco) values (e.id, f.id, p_preco)
  on conflict (encomenda_id, empresa) do update set preco = excluded.preco, criado_em = now();
  if dono_a is not null and dono_a <> f.dono and not exists (select 1 from lances_encomenda l join empresas x on x.id = l.empresa
      where l.encomenda_id = e.id and x.dono = dono_a and l.preco <= p_preco) then
    perform avisar(dono_a, format('Seu lance na encomenda #%s foi superado (%s por unidade).', e.id, p_preco));
  end if;
end $$;

-- a fábrica vencedora manda a encomenda por uma transportadora (vira um pedido de frete normal)
create or replace function public.enviar_encomenda(p_encomenda bigint, p_transportadora bigint, p_frete integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare e encomendas_cidade%rowtype; f empresas%rowtype; t empresas%rowtype; falta integer; proprio boolean; novo bigint;
begin
  perform jogador_livre();
  perform fechar_encomendas();
  select * into e from encomendas_cidade where id = p_encomenda for update;
  if e.id is null or e.vencedor is null then raise exception 'encomenda indisponivel'; end if;
  f := do_dono(e.vencedor);
  if e.status <> 'aguardando' then raise exception 'encomenda ja enviada'; end if;
  select * into t from empresas where id = p_transportadora and (transporte or (nivel >= 3 and id = f.id));
  if t.id is null then raise exception 'transportadora invalida'; end if;
  falta := e.qtd - e.entregues;
  proprio := t.dono = f.dono;
  if proprio then p_frete := 0; end if;
  if p_frete < 0 or p_frete > e.preco then raise exception 'frete invalido'; end if;
  update empresas set estoque = estoque - falta where id = f.id and estoque >= falta;
  if not found then raise exception 'estoque insuficiente'; end if;
  insert into pedidos (fabrica, transportadora, destino, produto, qtd, valor_caixa, frete_caixa, status, encomenda_id)
    values (f.id, t.id, 'loja', e.produto, falta, e.preco, p_frete, case when proprio then 'aceito' else 'aberto' end, e.id) returning id into novo;
  update encomendas_cidade set status = 'entregando', pedido = novo where id = e.id;
  if not proprio then perform avisar(t.dono, format('Novo pedido de frete da %s (encomenda #%s): %s caixas, %s moedas por caixa.', f.nome, e.id, falta, p_frete)); end if;
  return novo;
end $$;

-- se o pedido da encomenda for cancelado/recusado, a encomenda volta a esperar envio
create or replace function public.encomenda_pedido_cancelado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.encomenda_id is not null and new.status in ('cancelado', 'concluido') and old.status in ('aberto', 'aceito') then
    update encomendas_cidade set status = 'aguardando', pedido = null
    where id = new.encomenda_id and status = 'entregando' and pedido = new.id and entregues < qtd;
  end if;
  return new;
end $$;
drop trigger if exists encomenda_pedido_cancelado on public.pedidos;
create trigger encomenda_pedido_cancelado after update of status on public.pedidos for each row execute function public.encomenda_pedido_cancelado();

-- o quadro: encomendas abertas, as minhas e as que minhas fábricas venceram
create or replace function public.quadro_encomendas() returns jsonb
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid();
begin
  perform fechar_encomendas();
  return coalesce((select jsonb_agg(x order by x.criado_em desc) from (
    select e.id, e.produto, e.qtd, e.preco_max, e.status, e.preco, e.entregues, e.fecha_em, e.prazo, e.criado_em, e.vencedor,
      e.comprador = eu as minha, e.cla is not null as do_cla,
      (select nome from perfis where id = e.comprador) as comprador_nome,
      (select nome from clas where id = e.cla) as cla_nome,
      (select nome from empresas where id = e.vencedor) as vencedor_nome,
      (select dono from empresas where id = e.vencedor) = eu as venci,
      (select min(preco) from lances_encomenda where encomenda_id = e.id) as menor_lance,
      (select count(*) from lances_encomenda where encomenda_id = e.id) as lances,
      (select min(l.preco) from lances_encomenda l join empresas x on x.id = l.empresa where l.encomenda_id = e.id and x.dono = eu) as meu_lance
    from encomendas_cidade e
    where e.status = 'leilao'
       or (e.comprador = eu and e.criado_em > now() - interval '3 days')
       or (e.status in ('aguardando', 'entregando') and (select dono from empresas where id = e.vencedor) = eu)
    order by e.criado_em desc limit 60) x), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------ entrega: estoque da cidade ou encomenda
create or replace function public.registrar_entrega(p_pedido bigint, n integer) returns void
language plpgsql security definer set search_path = public as $$
declare pd pedidos%rowtype; e encomendas_cidade%rowtype;
begin
  update pedidos set entregues = entregues + n, em_transito = em_transito - n where id = p_pedido returning * into pd;
  update empresas set caixa = caixa + (pd.valor_caixa - pd.frete_caixa) * n where id = pd.fabrica;
  update empresas set caixa = caixa + pd.frete_caixa * n where id = pd.transportadora;
  if pd.encomenda_id is not null then
    select * into e from encomendas_cidade where id = pd.encomenda_id for update;
  end if;
  if e.id is not null and e.status in ('entregando', 'aguardando') then
    -- encomenda: o dinheiro sai do depósito e os itens vão para a mochila do comprador ou para o cofre do clã
    update encomendas_cidade set entregues = entregues + n, deposito = greatest(0, deposito - pd.valor_caixa * n),
      status = case when entregues + n >= qtd then 'concluida' else status end where id = e.id;
    if e.cla is not null and exists (select 1 from clas where id = e.cla) then
      insert into cofre_cla (cla, item, qtd) values (e.cla, e.produto, n)
      on conflict (cla, item) do update set qtd = cofre_cla.qtd + n;
    else
      perform dar_item(e.comprador, e.produto, n);
    end if;
    if e.entregues + n >= e.qtd then
      perform avisar(e.comprador, format('Encomenda #%s entregue: %s %s %s.', e.id, e.qtd, (select nome from precos where item = e.produto),
        case when e.cla is not null then 'no cofre do clã' else 'na sua mochila' end));
    end if;
  elsif pd.missao is null then
    -- entrega normal: a cidade paga a fábrica (já pago acima) e guarda as caixas
    update mercado set estoque = estoque + n where produto = pd.produto;
  end if;
  if pd.entregues >= pd.qtd then
    update pedidos set status = 'concluido' where id = pd.id;
    if pd.missao is not null then update missoes set status = 'concluida' where id = pd.missao; end if;
    perform avisar((select dono from empresas where id = pd.fabrica), format('Pedido de %s caixas entregue por completo.', pd.qtd));
  end if;
end $$;

-- ------------------------------------------------------------ 2) frete para a cidade: preço do momento, para quando o estoque enche
create or replace function public.criar_pedido(p_fabrica bigint, p_transportadora bigint, p_qtd integer, p_frete integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare f empresas%rowtype; t empresas%rowtype; m mercado%rowtype; novo bigint; proprio boolean; vaga integer;
begin
  f := do_dono(p_fabrica);
  if not f.fabrica then raise exception 'sua empresa nao e desse tipo'; end if;
  select * into t from empresas where id = p_transportadora and (transporte or (nivel >= 3 and id = f.id));
  if t.id is null then raise exception 'transportadora invalida'; end if;
  if p_qtd < 1 or p_qtd > 200 then raise exception 'quantidade invalida'; end if;
  perform atualizar_cidade();
  select * into m from mercado where produto = f.produto;
  if m.produto is null then raise exception 'esse produto e vendido direto pela fabrica'; end if;
  vaga := m.capacidade - m.estoque - caixas_a_caminho(f.produto);
  if vaga <= 0 then raise exception 'estoque da cidade cheio'; end if;
  if p_qtd > vaga then raise exception 'a cidade so compra mais % caixas agora', vaga; end if;
  proprio := t.dono = f.dono;
  if proprio then p_frete := 0; end if;
  if p_frete < 0 or p_frete > m.valor_caixa then raise exception 'frete invalido'; end if;
  update empresas set estoque = estoque - p_qtd where id = f.id and estoque >= p_qtd;
  if not found then raise exception 'estoque insuficiente'; end if;
  insert into pedidos (fabrica, transportadora, destino, produto, qtd, valor_caixa, frete_caixa, status)
    values (f.id, t.id, 'loja', f.produto, p_qtd, m.valor_caixa, p_frete, case when proprio then 'aceito' else 'aberto' end) returning id into novo;
  if not proprio then perform avisar(t.dono, format('Novo pedido de frete da %s: %s caixas, %s moedas por caixa.', f.nome, p_qtd, p_frete)); end if;
  return novo;
end $$;

-- ------------------------------------------------------------ loja: só vende o que a cidade tem
create or replace function public.comprar(nome_item text, quantidade integer) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; preco integer; atual integer; m mercado%rowtype;
begin
  if quantidade < 1 or quantidade > 20 then raise exception 'quantidade invalida'; end if;
  select compra into preco from precos where item = nome_item;
  if preco is null then raise exception 'a loja nao vende esse item'; end if;
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p.moedas < preco * quantidade then raise exception 'moedas insuficientes'; end if;
  select coalesce(qtd, 0) into atual from inventario where dono = p.id and item = nome_item;
  if coalesce(atual, 0) + quantidade > regra('limite_item') then raise exception 'mochila cheia'; end if;
  if exists (select 1 from mercado where produto = nome_item) then
    perform atualizar_cidade();
    select * into m from mercado where produto = nome_item for update;
    if m.estoque <= 0 then raise exception 'em falta na cidade'; end if;
    if m.estoque < quantidade then raise exception 'a loja so tem % em estoque', m.estoque; end if;
    update mercado set estoque = estoque - quantidade where produto = nome_item;
  end if;
  update perfis set moedas = moedas - preco * quantidade where id = p.id;
  perform dar_item(p.id, nome_item, quantidade);
end $$;

-- ------------------------------------------------------------ hospital: 1 remédio do estoque por tratamento
-- devolve quanto de vida curou: 100 (com remédio, 150 moedas) ou 30 (sem remédio na cidade, 50 moedas)
create or replace function public.tratar_hospital() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; tem boolean; conta integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  perform atualizar_cidade();
  update mercado set estoque = estoque - 1 where produto = 'remedio' and estoque > 0;
  tem := found;
  conta := case when tem then 150 else 50 end;
  if p.moedas < conta then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - conta where id = p.id;
  update prefeitura set cofre = cofre + conta where id = 1;
  return case when tem then 100 else 30 end;
end $$;

-- ------------------------------------------------------------ permissões
do $$
declare f text;
begin
  foreach f in array array['estoque_cidade()', 'quadro_encomendas()', 'criar_encomenda(text, integer, integer, boolean)',
                           'cancelar_encomenda(bigint)', 'lance_encomenda(bigint, bigint, integer)', 'enviar_encomenda(bigint, bigint, integer)',
                           'comprar(text, integer)', 'consumir(text)', 'tratar_hospital()', 'criar_pedido(bigint, bigint, integer, integer)',
                           'comprar_lote(integer, text, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['atualizar_cidade()', 'caixas_a_caminho(text)', 'fechar_encomendas()', 'devolver_encomenda(encomendas_cidade, integer)',
                           'registrar_entrega(bigint, integer)', 'mercado_preco()', 'encomenda_pedido_cancelado()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
