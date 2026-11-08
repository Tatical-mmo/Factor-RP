-- Fator RP - vans e helicópteros (parte 2 de 2): despacho por tipo, helicóptero imune a roubo.

create or replace function public.despachar_caminhao(p_caminhao bigint, p_pedido bigint, p_escolta boolean default false) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t empresas%rowtype; c caminhoes%rowtype; pd pedidos%rowtype; lt lotes%rowtype; lf lotes%rowtype; d destinos%rowtype;
        v_carga integer; cap integer; d1 real; d2 real; d3 real; ch timestamptz; voa boolean; f real; r integer;
begin
  perform processar_caminhoes();
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null then raise exception 'caminhao invalido'; end if;
  t := do_dono(c.empresa);
  if c.status <> 'parado' then raise exception 'caminhao em viagem'; end if;
  select * into pd from pedidos where id = p_pedido and status = 'aceito' for update;
  if pd.id is null or pd.transportadora <> t.id then raise exception 'pedido indisponivel'; end if;
  r := robos_ativos(t);
  cap := least(veiculo(c.tipo, 'max'), veiculo(c.tipo, 'cap') + veiculo(c.tipo, 'robo') * r)::integer;
  v_carga := least(cap, pd.qtd - pd.entregues - pd.em_transito);
  if v_carga <= 0 then raise exception 'todas as caixas ja foram retiradas'; end if;
  voa := c.tipo = 'helicoptero';
  if voa then p_escolta := false; end if;
  if p_escolta then
    update empresas set caixa = caixa - 400 where id = t.id and caixa >= 400;
    if not found then raise exception 'caixa insuficiente'; end if;
  end if;
  lt := lote_base(t.id);
  lf := lote_fabrica(pd.fabrica);
  select * into d from destinos where id = pd.destino;
  f := veiculo(c.tipo, 'tempo');
  if voa then
    -- em linha reta, sem ruas
    d1 := greatest(6, sqrt((lt.x - lf.x) ^ 2 + (lt.z - lf.z) ^ 2) / 22 + 4);
    d2 := greatest(6, sqrt((lf.x - d.x) ^ 2 + (lf.z - d.z) ^ 2) / 22 + 4);
    d3 := greatest(6, sqrt((d.x - lt.x) ^ 2 + (d.z - lt.z) ^ 2) / 22 + 4);
  else
    d1 := duracao(lt.x, lt.z, lf.x, lf.z) * f;
    d2 := duracao(lf.x, lf.z, d.x, d.z) * f;
    d3 := duracao(d.x, d.z, lt.x, lt.z) * f;
  end if;
  ch := now() + make_interval(secs => d1 + 8 + d2);
  update pedidos set em_transito = em_transito + v_carga where id = pd.id;
  update caminhoes set status = 'em_rota', pedido = pd.id, carga = v_carga, partida = now(), chegada = ch,
    retorno = ch + make_interval(secs => 5 + d3), roubado = false, escolta = p_escolta,
    vida = case when voa then 100 else veiculo(c.tipo, 'vida')::integer + (case when c.tipo = 'van' then 30 else 60 end) * r + case when p_escolta then 200 else 0 end end,
    rota = jsonb_build_object('t', jsonb_build_array(lt.x, lt.z), 'f', jsonb_build_array(lf.x, lf.z), 'd', jsonb_build_array(d.x, d.z),
                              'd1', d1, 'd2', d2, 'd3', d3, 'carga', 8, 'descarga', 5, 'produto', pd.produto, 'voa', voa)
  where id = c.id;
  return ch;
end $$;

create or replace function public.atacar_caminhao(p_caminhao bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c caminhoes%rowtype; cla_id bigint; item text;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial then raise exception 'policial nao rouba carga'; end if;
  if p.ultimo_ataque is not null and p.ultimo_ataque > now() - interval '900 milliseconds' then return -1; end if;
  update perfis set ultimo_ataque = now() where id = p.id;
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null or c.status <> 'em_rota' or c.roubado or c.carga <= 0 then raise exception 'caminhao sem carga'; end if;
  if c.tipo = 'helicoptero' then raise exception 'helicoptero fora de alcance'; end if;
  if exists (select 1 from empresas where id = c.empresa and dono = p.id) then raise exception 'esse caminhao e seu'; end if;
  update caminhoes set vida = greatest(0, vida - 10) where id = c.id returning * into c;
  if c.vida > 0 then return c.vida; end if;
  item := c.rota ->> 'produto';
  select cla into cla_id from membros_cla where jogador = p.id;
  if cla_id is not null then
    execute format('update clas set %I = %I + $1 where id = $2', item, item) using c.carga, cla_id;
  else
    perform dar_item(p.id, item, c.carga);
  end if;
  update pedidos set em_transito = em_transito - c.carga, qtd = qtd - c.carga where id = c.pedido and qtd - c.carga >= 1;
  if not found then update pedidos set em_transito = 0, status = 'cancelado' where id = c.pedido; end if;
  update pedidos set status = 'concluido' where id = c.pedido and entregues >= qtd and status = 'aceito';
  update caminhoes set roubado = true, carga = 0, status = 'voltando', retorno = now() + interval '25 seconds' where id = c.id;
  update perfis set crimes = crimes + 1 where id = p.id;
  perform avisar((select dono from empresas where id = c.empresa), format('Um veículo seu foi ROUBADO por %s!', p.nome));
  perform avisar(p.id, format('Você roubou %s caixas de %s. Agora está procurado pela polícia.', c.carga, item));
  return 0;
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
  update perfis set ultima_tarefa = now() where id = p.id;
  return pago;
end $$;

do $$
declare f text;
begin
  foreach f in array array['despachar_caminhao(bigint, bigint, boolean)', 'atacar_caminhao(bigint)', 'embalar_fabrica(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
