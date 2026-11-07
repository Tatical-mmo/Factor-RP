-- Fator RP - empresas v2 (parte 3 de 4): pedidos, entrega à mão, caminhões, produção dos robôs e missões.

create or replace function public.criar_pedido(p_fabrica bigint, p_transportadora bigint, p_qtd integer, p_frete integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare f empresas%rowtype; t empresas%rowtype; valor integer; novo bigint; proprio boolean;
begin
  f := do_dono(p_fabrica);
  if not f.fabrica then raise exception 'sua empresa nao e desse tipo'; end if;
  select * into t from empresas where id = p_transportadora and (transporte or (nivel >= 3 and id = f.id));
  if t.id is null then raise exception 'transportadora invalida'; end if;
  if p_qtd < 1 or p_qtd > 200 then raise exception 'quantidade invalida'; end if;
  select valor_caixa into valor from mercado where produto = f.produto;
  proprio := t.dono = f.dono;
  if proprio then p_frete := 0; end if;
  if p_frete < 0 or p_frete > valor then raise exception 'frete invalido'; end if;
  update empresas set estoque = estoque - p_qtd where id = f.id and estoque >= p_qtd;
  if not found then raise exception 'estoque insuficiente'; end if;
  -- se a transportadora também é do dono, o pedido já nasce aceito
  insert into pedidos (fabrica, transportadora, destino, produto, qtd, valor_caixa, frete_caixa, status)
    values (f.id, t.id, 'loja', f.produto, p_qtd, valor, p_frete, case when proprio then 'aceito' else 'aberto' end) returning id into novo;
  if not proprio then perform avisar(t.dono, format('Novo pedido de frete da %s: %s caixas, %s moedas por caixa.', f.nome, p_qtd, p_frete)); end if;
  return novo;
end $$;

create or replace function public.responder_pedido(p_pedido bigint, aceitar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t empresas%rowtype; pd pedidos%rowtype;
begin
  select * into pd from pedidos where id = p_pedido for update;
  if pd.id is null then raise exception 'pedido indisponivel'; end if;
  t := do_dono(pd.transportadora);
  if pd.status <> 'aberto' then raise exception 'pedido indisponivel'; end if;
  if aceitar then
    update pedidos set status = 'aceito' where id = pd.id;
  else
    update pedidos set status = 'cancelado' where id = pd.id;
    update empresas set estoque = estoque + pd.qtd where id = pd.fabrica;
    if pd.missao is not null then
      update missoes set status = case when expira_em > now() then 'aberta' else 'expirada' end, pedido = null where id = pd.missao;
    end if;
  end if;
  perform avisar((select dono from empresas where id = pd.fabrica),
    format('A %s %s seu pedido de %s caixas.', t.nome, case when aceitar then 'aceitou' else 'recusou' end, pd.qtd));
end $$;

create or replace function public.cancelar_pedido(p_pedido bigint) returns void
language plpgsql security definer set search_path = public as $$
declare f empresas%rowtype; pd pedidos%rowtype; sobra integer;
begin
  select * into pd from pedidos where id = p_pedido for update;
  if pd.id is null then raise exception 'pedido indisponivel'; end if;
  f := do_dono(pd.fabrica);
  if pd.status not in ('aberto', 'aceito') then raise exception 'pedido indisponivel'; end if;
  if pd.em_transito > 0 then raise exception 'ha caixas a caminho'; end if;
  sobra := pd.qtd - pd.entregues;
  update pedidos set status = case when pd.entregues > 0 then 'concluido' else 'cancelado' end,
    qtd = case when pd.entregues > 0 then pd.entregues else qtd end where id = pd.id;
  update empresas set estoque = estoque + sobra where id = f.id;
  if pd.missao is not null and pd.entregues = 0 then
    update missoes set status = case when expira_em > now() then 'aberta' else 'expirada' end, pedido = null where id = pd.missao;
  end if;
end $$;

-- entrega à mão: dono ou funcionário da transportadora do pedido
create or replace function public.retirar_caixa(p_pedido bigint) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; pd pedidos%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.carga_pedido is not null then
    if p.carga_em > now() - interval '10 minutes' then raise exception 'voce ja esta carregando uma caixa'; end if;
    update pedidos set em_transito = greatest(0, em_transito - 1) where id = p.carga_pedido;
  end if;
  select * into pd from pedidos where id = p_pedido and status = 'aceito' for update;
  if pd.id is null then raise exception 'pedido indisponivel'; end if;
  if not trabalha_em(pd.transportadora) then raise exception 'voce nao trabalha em uma transportadora'; end if;
  if pd.entregues + pd.em_transito >= pd.qtd then raise exception 'todas as caixas ja foram retiradas'; end if;
  update pedidos set em_transito = em_transito + 1 where id = pd.id;
  update perfis set carga_pedido = pd.id, carga_em = now() where id = p.id;
  return pd.produto;
end $$;

-- caminhões: transportadoras e grupos; fábricas também a partir do nível 3
create or replace function public.comprar_caminhao(p_empresa bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; novo bigint;
begin
  e := do_dono(p_empresa);
  if not e.transporte and e.nivel < 3 then raise exception 'so transportadoras ou empresas nivel 3 compram caminhao'; end if;
  if (select count(*) from caminhoes where empresa = e.id) >= limite(e.nivel, 'caminhoes') then raise exception 'limite de caminhoes'; end if;
  update empresas set caixa = caixa - 15000 where id = e.id and caixa >= 15000;
  if not found then raise exception 'caixa insuficiente'; end if;
  insert into caminhoes (empresa) values (e.id) returning id into novo;
  return novo;
end $$;

create or replace function public.despachar_caminhao(p_caminhao bigint, p_pedido bigint) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t empresas%rowtype; c caminhoes%rowtype; pd pedidos%rowtype; lt lotes%rowtype; lf lotes%rowtype; d destinos%rowtype;
        v_carga integer; cap integer; d1 real; d2 real; d3 real; ch timestamptz;
begin
  perform processar_caminhoes();
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null then raise exception 'caminhao invalido'; end if;
  t := do_dono(c.empresa);
  if c.status <> 'parado' then raise exception 'caminhao em viagem'; end if;
  select * into pd from pedidos where id = p_pedido and status = 'aceito' for update;
  if pd.id is null or pd.transportadora <> t.id then raise exception 'pedido indisponivel'; end if;
  -- cada robô carregador soma 5 caixas à capacidade (máximo 60)
  cap := least(60, 20 + 5 * robos_ativos(t));
  v_carga := least(cap, pd.qtd - pd.entregues - pd.em_transito);
  if v_carga <= 0 then raise exception 'todas as caixas ja foram retiradas'; end if;
  lt := lote_base(t.id);
  lf := lote_fabrica(pd.fabrica);
  select * into d from destinos where id = pd.destino;
  d1 := duracao(lt.x, lt.z, lf.x, lf.z);
  d2 := duracao(lf.x, lf.z, d.x, d.z);
  d3 := duracao(d.x, d.z, lt.x, lt.z);
  ch := now() + make_interval(secs => d1 + 8 + d2);
  update pedidos set em_transito = em_transito + v_carga where id = pd.id;
  update caminhoes set status = 'em_rota', pedido = pd.id, carga = v_carga, partida = now(), chegada = ch,
    retorno = ch + make_interval(secs => 5 + d3),
    rota = jsonb_build_object('t', jsonb_build_array(lt.x, lt.z), 'f', jsonb_build_array(lf.x, lf.z), 'd', jsonb_build_array(d.x, d.z),
                              'd1', d1, 'd2', d2, 'd3', d3, 'carga', 8, 'descarga', 5, 'produto', pd.produto)
  where id = c.id;
  return ch;
end $$;

-- robôs das fábricas embalam 1 caixa a cada 90 s (acumula no máximo 4 h)
create or replace function public.produzir_robos() returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; ativos integer; seg double precision; n integer;
begin
  for e in select * from empresas where fabrica for update skip locked loop
    ativos := robos_ativos(e);
    if ativos <= 0 then
      update empresas set producao_marca = now() where id = e.id;
      continue;
    end if;
    seg := least(4 * 3600, extract(epoch from (now() - e.producao_marca)));
    n := floor(ativos * seg / 90);
    if n > 0 then
      update empresas set estoque = estoque + n,
        producao_marca = greatest(e.producao_marca, now() - interval '4 hours') + make_interval(secs => n * 90.0 / ativos)
      where id = e.id;
    end if;
  end loop;
end $$;

create or replace function public.processar_caminhoes() returns integer
language plpgsql security definer set search_path = public as $$
declare c caminhoes%rowtype; n integer := 0;
begin
  for c in select * from caminhoes where status = 'em_rota' and chegada <= now() for update skip locked loop
    if c.pedido is not null then perform registrar_entrega(c.pedido, c.carga); end if;
    update caminhoes set status = 'voltando', carga = 0 where id = c.id;
    n := n + 1;
  end loop;
  update caminhoes set status = 'parado', pedido = null, partida = null, chegada = null, retorno = null, rota = null
    where status = 'voltando' and retorno <= now();
  perform produzir_robos();
  return n;
end $$;

create or replace function public.aceitar_missao(p_missao bigint, p_fabrica bigint, p_transportadora bigint, p_frete integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare f empresas%rowtype; t empresas%rowtype; m missoes%rowtype; novo bigint; proprio boolean;
begin
  f := do_dono(p_fabrica);
  if not f.fabrica then raise exception 'sua empresa nao e desse tipo'; end if;
  select * into m from missoes where id = p_missao for update;
  if m.id is null or m.status <> 'aberta' or m.expira_em <= now() then raise exception 'missao indisponivel'; end if;
  if m.produto <> f.produto then raise exception 'sua fabrica nao produz esse item'; end if;
  select * into t from empresas where id = p_transportadora and (transporte or (nivel >= 3 and id = f.id));
  if t.id is null then raise exception 'transportadora invalida'; end if;
  proprio := t.dono = f.dono;
  if proprio then p_frete := 0; end if;
  if p_frete < 0 or p_frete > m.valor_caixa then raise exception 'frete invalido'; end if;
  update empresas set estoque = estoque - m.qtd where id = f.id and estoque >= m.qtd;
  if not found then raise exception 'estoque insuficiente'; end if;
  insert into pedidos (fabrica, transportadora, destino, missao, produto, qtd, valor_caixa, frete_caixa, status)
    values (f.id, t.id, 'contratante', m.id, m.produto, m.qtd, m.valor_caixa, p_frete, case when proprio then 'aceito' else 'aberto' end)
    returning id into novo;
  update missoes set status = 'aceita', pedido = novo where id = m.id;
  if not proprio then perform avisar(t.dono, format('Missão do Contratante via %s: %s caixas, %s moedas de frete por caixa.', f.nome, m.qtd, p_frete)); end if;
  return novo;
end $$;
