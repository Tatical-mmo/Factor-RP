-- 93d · Sequestros: o administrador (sem clã) também consegue sequestrar, para testar. Membro de clã continua igual.


create or replace function public.sequestrar_onibus(p_linha integer, p_saida bigint, p_modelo text, p_cor text, p_x real, p_z real, p_ang real) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v_cla bigint; novo bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial or p.prf then raise exception 'policial nao sequestra'; end if;
  select cla into v_cla from membros_cla where jogador = p.id;
  if v_cla is null and p.cargo is distinct from 'admin' then raise exception 'so membros de cla'; end if;
  if p.sequestrou_em is not null and p.sequestrou_em > now() - interval '60 seconds' then raise exception 'aguarde para sequestrar'; end if;
  if coalesce(p_modelo, '') !~ '^onibus[a-z0-9_]*$' then raise exception 'veiculo invalido'; end if;
  perform onibus_sequestrados_ativos();
  if exists (select 1 from onibus_sequestrados where linha = p_linha and saida = p_saida and status = 'ativo') then raise exception 'onibus ja sequestrado'; end if;
  if exists (select 1 from onibus_sequestrados where jogador = p.id and status = 'ativo' and not largado) then raise exception 'voce ja esta com um onibus'; end if;
  update perfis set sequestrou_em = now(), crimes = crimes + 1 where id = p.id;
  insert into onibus_sequestrados (linha, saida, modelo, cor, jogador, cla, x, z, ang)
    values (p_linha, p_saida, p_modelo, left(coalesce(p_cor, '#ffffff'), 9), p.id, v_cla,
            greatest(-1400, least(1400, p_x)), greatest(-1400, least(1400, p_z)), coalesce(p_ang, 0))
    returning id into novo;
  return novo;
end $$;

create or replace function public.sequestrar_jujubas(p_viagem bigint, p_x real, p_z real, p_ang real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v jujuba_viagens%rowtype; v_cla bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial or p.prf or p.profissao in ('exercito', 'bombeiro') then raise exception 'policial nao sequestra'; end if;
  select cla into v_cla from membros_cla where jogador = p.id;
  if v_cla is null and p.cargo is distinct from 'admin' then raise exception 'so membros de cla'; end if;
  if p.sequestrou_em is not null and p.sequestrou_em > now() - interval '60 seconds' then raise exception 'aguarde para sequestrar'; end if;
  select * into v from jujuba_viagens where id = p_viagem for update;
  if v.id is null or v.status <> 'em_rota' then raise exception 'esse veiculo nao esta em entrega'; end if;
  update jujuba_viagens set status = 'sequestrada', motorista = p.id, cla = v_cla, x = p_x, z = p_z, ang = p_ang, largado = false, ativo_em = now(),
    seq_em = now(), seq_x = p_x, seq_z = p_z where id = v.id;
  update jujuba_pedidos set status = 'aberto' where id = v.pedido;
  update perfis set crimes = crimes + 1, sequestrou_em = now() where id = p.id;
  return v.qtd;
end $$;

create or replace function public.sequestrar_veiculo_empresa(p_caminhao bigint, p_x real, p_z real, p_ang real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c caminhoes%rowtype; item text;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial or p.prf then raise exception 'policial nao sequestra'; end if;
  if p.cargo is distinct from 'admin' and not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla'; end if;
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
