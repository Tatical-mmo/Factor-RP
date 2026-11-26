-- Fator RP - 160c (parte 3 de 4): quadro de encomendas (envio e listagem). Rode depois do 160b.

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

