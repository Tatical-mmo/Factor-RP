-- Fator RP - ranking e metas do dia (parte 2 de 2): as ações do jogo passam a contar para as metas.

create or replace function public.coletar_sucata() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; atual integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p.algemado or p.pena_seg > 0 then raise exception 'voce esta preso'; end if;
  if p.ultima_coleta is not null and p.ultima_coleta > now() - make_interval(secs => regra('intervalo_coleta')) then
    raise exception 'aguarde % s', ceil(extract(epoch from (p.ultima_coleta + make_interval(secs => regra('intervalo_coleta')) - now())));
  end if;
  select coalesce(qtd, 0) into atual from inventario where dono = p.id and item = 'sucata';
  if coalesce(atual, 0) >= regra('limite_sucata') then raise exception 'mochila cheia de sucata'; end if;
  update perfis set ultima_coleta = now() where id = p.id;
  perform meta(p.id, 'sucata', 1);
  return dar_item(p.id, 'sucata', 1);
end $$;

create or replace function public.entregar_pacote() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; pago integer := regra('pagamento_entrega');
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p.embalando is null then raise exception 'nenhuma caixa embalada'; end if;
  if p.embalando_em > now() - make_interval(secs => regra('tempo_minimo_levar')) then raise exception 'entrega rapida demais'; end if;
  if p.ultima_entrega is not null and p.ultima_entrega > now() - make_interval(secs => regra('intervalo_entrega')) then
    raise exception 'aguarde % s', ceil(extract(epoch from (p.ultima_entrega + make_interval(secs => regra('intervalo_entrega')) - now())));
  end if;
  update perfis set moedas = moedas + pago, ultima_entrega = now(), embalando = null, embalando_em = null where id = p.id;
  perform meta(p.id, 'entrega', 1);
  return pago;
end $$;

create or replace function public.vender(nome_item text, quantidade integer) returns integer
language plpgsql security definer set search_path = public as $$
declare preco integer; p perfis%rowtype;
begin
  if quantidade < 1 or quantidade > 100 then raise exception 'quantidade invalida'; end if;
  select venda into preco from precos where item = nome_item;
  if preco is null then raise exception 'a loja nao compra esse item'; end if;
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  perform dar_item(p.id, nome_item, -quantidade);
  update perfis set moedas = moedas + preco * quantidade where id = p.id;
  perform meta(p.id, 'venda', preco * quantidade);
  return preco * quantidade;
end $$;

create or replace function public.entregar_caixa() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; pd pedidos%rowtype; t empresas%rowtype; pago integer := 0;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.carga_pedido is null then raise exception 'voce nao esta carregando caixa de pedido'; end if;
  if p.carga_em > now() - interval '15 seconds' then raise exception 'entrega rapida demais'; end if;
  select * into pd from pedidos where id = p.carga_pedido for update;
  update perfis set carga_pedido = null, carga_em = null where id = p.id;
  if pd.id is null or pd.status <> 'aceito' then return 0; end if;
  perform registrar_entrega(pd.id, 1);
  perform meta(p.id, 'entrega', 1);
  select * into t from empresas where id = pd.transportadora;
  if t.dono <> p.id and t.pagamento > 0 then
    pago := least(t.pagamento, t.caixa);
    update empresas set caixa = caixa - pago where id = t.id;
    update perfis set moedas = moedas + pago where id = p.id;
  end if;
  return pago;
end $$;

create or replace function public.embalar_fabrica(p_empresa bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e empresas%rowtype; pago integer := 0;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  select * into e from empresas where id = p_empresa;
  if e.id is null or not e.fabrica or not trabalha_em(e.id) then raise exception 'voce nao trabalha em uma fabrica'; end if;
  if e.produto = 'robo' or eh_veiculo(e.produto) then raise exception 'isso e montado pela linha de producao'; end if;
  if p.ultima_tarefa is not null and p.ultima_tarefa > now() - interval '25 seconds' then
    raise exception 'aguarde % s', ceil(extract(epoch from (p.ultima_tarefa + interval '25 seconds' - now())));
  end if;
  if e.dono <> p.id and e.pagamento > 0 then
    update empresas set caixa = caixa - pagamento where id = e.id and caixa >= pagamento;
    if not found then raise exception 'a empresa esta sem caixa para pagar'; end if;
    pago := e.pagamento;
    update perfis set moedas = moedas + pago where id = p.id;
  end if;
  update empresas set estoque = estoque + 1 where id = e.id;
  perform meta(p.id, 'trabalho', 1);
  update perfis set ultima_tarefa = now() where id = p.id;
  return pago;
end $$;

create or replace function public.entregar_encomenda(p_destino text) returns integer
language plpgsql security definer set search_path = public as $$
declare e encomendas%rowtype;
begin
  select * into e from encomendas where jogador = auth.uid() for update;
  if e.jogador is null then raise exception 'voce nao leva encomenda'; end if;
  if e.criada_em < now() - interval '20 minutes' then delete from encomendas where jogador = e.jogador; raise exception 'prazo da encomenda venceu'; end if;
  if e.destino <> p_destino then raise exception 'essa encomenda e para outra cidade'; end if;
  delete from encomendas where jogador = e.jogador;
  update perfis set moedas = moedas + e.valor where id = e.jogador;
  perform meta(e.jogador, 'encomenda', 1);
  return e.valor;
end $$;

create or replace function public.fazer_parafusos() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.ultima_tarefa is not null and p.ultima_tarefa > now() - interval '8 seconds' then
    raise exception 'aguarde % s', ceil(extract(epoch from (p.ultima_tarefa + interval '8 seconds' - now())));
  end if;
  perform dar_item(p.id, 'sucata', -3);
  update perfis set ultima_tarefa = now() where id = p.id;
  perform meta(p.id, 'parafuso', 2);
  return dar_item(p.id, 'parafuso', 2);
end $$;

do $$
declare f text;
begin
  foreach f in array array['coletar_sucata()', 'entregar_pacote()', 'vender(text, integer)', 'entregar_caixa()',
                           'embalar_fabrica(bigint)', 'entregar_encomenda(text)', 'fazer_parafusos()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
