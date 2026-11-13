-- 69 · Sequestro de caminhão e van das empresas (etapa 2, parte 2, e saque da etapa 3).
-- Membro de clã armado, na frente do veículo em entrega: Sequestrar. O robô motorista desce e foge, quem sequestrou
-- assume a direção na hora (sem precisar bater até zerar a vida). Com carga, o saque é o Descarregar de sempre
-- (território do clã ou casa). Largado e parado por 7 minutos (antes eram 5), o veículo volta para a garagem do dono.

create or replace function public.sequestrar_veiculo_empresa(p_caminhao bigint, p_x real, p_z real, p_ang real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c caminhoes%rowtype; item text;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial or p.prf then raise exception 'policial nao sequestra'; end if;
  if not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla'; end if;
  if p.sequestrou_em is not null and p.sequestrou_em > now() - interval '60 seconds' then raise exception 'aguarde para sequestrar'; end if;
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null or c.status <> 'em_rota' or c.roubado or c.tipo = 'helicoptero' then raise exception 'esse veiculo nao esta em entrega'; end if;
  if exists (select 1 from empresas where id = c.empresa and dono = p.id) then raise exception 'esse caminhao e seu'; end if;
  item := coalesce(c.rota ->> 'produto', 'carga');
  if c.carga > 0 then   -- o pedido perde as caixas
    update pedidos set em_transito = em_transito - c.carga, qtd = qtd - c.carga where id = c.pedido and qtd - c.carga >= 1;
    if not found then update pedidos set em_transito = 0, status = 'cancelado' where id = c.pedido; end if;
    update pedidos set status = 'concluido' where id = c.pedido and entregues >= qtd and status = 'aceito';
  end if;
  update caminhoes set status = 'dirigido', motorista = p.id, sequestrado = true, roubado = true, escolta = false, pedido = null,
    pos_x = coalesce(p_x, pos_x), pos_z = coalesce(p_z, pos_z), ang = coalesce(p_ang, 0), ativo_em = now()
  where id = c.id;
  update perfis set crimes = crimes + 1, sequestrou_em = now() where id = p.id;
  perform avisar((select dono from empresas where id = c.empresa), format('🚨 Um veículo seu foi SEQUESTRADO por %s! Largado e parado por 7 min, ele volta para você.', p.nome));
  return c.carga;
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
  -- parado sem ninguém mexer: 7 min se foi sequestrado, 5 min nos outros casos
  for c in select * from caminhoes where status = 'dirigido'
             and (coalesce(ativo_em, now() - interval '1 hour') < now() - case when sequestrado then interval '7 minutes' else interval '5 minutes' end
                  or bloqueio_em <= now()) for update skip locked loop
    perform veiculo_na_garagem(c.id);
    if c.sequestrado then perform avisar((select dono from empresas where id = c.empresa), 'Seu veículo roubado voltou para a garagem.'); end if;
  end loop;
  perform produzir_robos();
  return n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['sequestrar_veiculo_empresa(bigint, real, real, real)', 'processar_caminhoes()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
