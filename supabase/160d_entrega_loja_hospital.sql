-- Fator RP - 160d (parte 4 de 4): entrega, frete, loja, hospital e permissões. Rode por último.

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
