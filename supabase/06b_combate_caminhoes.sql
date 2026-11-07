-- Fator RP - etapa 5 (parte 2 de 2): caminhão com vida e escolta, remédio e permissões.

-- despachar agora tem escolta opcional (viatura com robôs, 400 do caixa): o caminhão aguenta mais golpes
drop function if exists public.despachar_caminhao(bigint, bigint);
create or replace function public.despachar_caminhao(p_caminhao bigint, p_pedido bigint, p_escolta boolean default false) returns timestamptz
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
  cap := least(60, 20 + 5 * robos_ativos(t));
  v_carga := least(cap, pd.qtd - pd.entregues - pd.em_transito);
  if v_carga <= 0 then raise exception 'todas as caixas ja foram retiradas'; end if;
  if p_escolta then
    update empresas set caixa = caixa - 400 where id = t.id and caixa >= 400;
    if not found then raise exception 'caixa insuficiente'; end if;
  end if;
  lt := lote_base(t.id);
  lf := lote_fabrica(pd.fabrica);
  select * into d from destinos where id = pd.destino;
  d1 := duracao(lt.x, lt.z, lf.x, lf.z);
  d2 := duracao(lf.x, lf.z, d.x, d.z);
  d3 := duracao(d.x, d.z, lt.x, lt.z);
  ch := now() + make_interval(secs => d1 + 8 + d2);
  update pedidos set em_transito = em_transito + v_carga where id = pd.id;
  update caminhoes set status = 'em_rota', pedido = pd.id, carga = v_carga, partida = now(), chegada = ch,
    retorno = ch + make_interval(secs => 5 + d3), roubado = false, escolta = p_escolta,
    vida = 100 + 60 * robos_ativos(t) + case when p_escolta then 200 else 0 end,
    rota = jsonb_build_object('t', jsonb_build_array(lt.x, lt.z), 'f', jsonb_build_array(lf.x, lf.z), 'd', jsonb_build_array(d.x, d.z),
                              'd1', d1, 'd2', d2, 'd3', d3, 'carga', 8, 'descarga', 5, 'produto', pd.produto)
  where id = c.id;
  return ch;
end $$;

create or replace function public.processar_caminhoes() returns integer
language plpgsql security definer set search_path = public as $$
declare c caminhoes%rowtype; n integer := 0;
begin
  for c in select * from caminhoes where status = 'em_rota' and not roubado and chegada <= now() for update skip locked loop
    if c.pedido is not null then perform registrar_entrega(c.pedido, c.carga); end if;
    update caminhoes set status = 'voltando', carga = 0 where id = c.id;
    n := n + 1;
  end loop;
  update caminhoes set status = 'parado', pedido = null, partida = null, chegada = null, retorno = null, rota = null,
    roubado = false, escolta = false, vida = 100
    where status = 'voltando' and retorno <= now();
  perform produzir_robos();
  return n;
end $$;

-- remédio: gasta 1 da mochila (a cura acontece no jogo)
create or replace function public.usar_remedio() returns integer
language plpgsql security definer set search_path = public as $$
begin
  return dar_item(auth.uid(), 'remedio', -1);
end $$;

do $$
declare f text;
begin
  foreach f in array array['registrar_agressao(uuid)', 'morrer(uuid)', 'atacar_caminhao(bigint)',
                           'despachar_caminhao(bigint, bigint, boolean)', 'processar_caminhoes()', 'usar_remedio()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
