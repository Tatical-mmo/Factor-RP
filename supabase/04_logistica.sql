-- Fator RP - etapa 4: empresas dos jogadores, funcionários, pedidos de frete, caminhões e missões
-- Cole tudo no Supabase em SQL Editor > New query e toque em Run.

-- ------------------------------------------------------------ lotes e destinos (mesmas coordenadas do jogo)
create table if not exists public.lotes (
  id    integer primary key,
  preco integer not null check (preco > 0),
  x     real not null,              -- portão do lote, na beira da rua
  z     real not null
);
insert into public.lotes (id, preco, x, z) values
  (1, 20000, -71.5, -58.0),
  (2, 20000, -36.5, -58.0),
  (3, 20000, 36.5, -58.0),
  (4, 20000, 71.5, -4.0),
  (5, 20000, -71.5, -4.0),
  (6, 20000, -90.5, 50.0),
  (7, 20000, 90.5, 50.0),
  (8, 20000, -36.5, 104.0),
  (9, 20000, 36.5, 104.0),
  (10, 20000, 71.5, 104.0)
on conflict (id) do update set preco = excluded.preco, x = excluded.x, z = excluded.z;

create table if not exists public.destinos (
  id   text primary key,
  nome text not null,
  x    real not null,
  z    real not null
);
insert into public.destinos (id, nome, x, z) values
  ('loja', 'Mercado', -17.5, -4),
  ('contratante', 'Praça do Contratante', -4, 27)
on conflict (id) do update set nome = excluded.nome, x = excluded.x, z = excluded.z;

-- quanto o mercado paga por caixa entregue
create table if not exists public.mercado (
  produto     text primary key,
  valor_caixa integer not null check (valor_caixa > 0)
);
insert into public.mercado (produto, valor_caixa) values ('chocolate', 32), ('remedio', 60)
on conflict (produto) do update set valor_caixa = excluded.valor_caixa;

-- ------------------------------------------------------------ empresas
create table if not exists public.empresas (
  id        bigint generated always as identity primary key,
  nome      text not null check (char_length(nome) between 3 and 24),
  tipo      text not null check (tipo in ('fabrica', 'transportadora')),
  dono      uuid not null references public.perfis (id) on delete cascade,
  lote      integer not null unique references public.lotes (id),
  produto   text check (produto in ('chocolate', 'remedio')),
  caixa     integer not null default 0 check (caixa >= 0),
  pagamento integer not null default 10 check (pagamento between 0 and 500),
  estoque   integer not null default 0 check (estoque >= 0),
  criado_em timestamptz not null default now(),
  check ((tipo = 'fabrica') = (produto is not null))
);
create unique index if not exists empresas_nome_unico on public.empresas (lower(nome));

-- cada jogador trabalha em uma empresa por vez (o dono também é membro)
create table if not exists public.membros (
  jogador uuid primary key references public.perfis (id) on delete cascade,
  empresa bigint not null references public.empresas (id) on delete cascade,
  desde   timestamptz not null default now()
);

create table if not exists public.pedidos (
  id             bigint generated always as identity primary key,
  fabrica        bigint not null references public.empresas (id) on delete cascade,
  transportadora bigint not null references public.empresas (id) on delete cascade,
  destino        text not null references public.destinos (id),
  missao         bigint,
  produto        text not null,
  qtd            integer not null check (qtd between 1 and 200),
  entregues      integer not null default 0 check (entregues >= 0),
  em_transito    integer not null default 0 check (em_transito >= 0),
  valor_caixa    integer not null check (valor_caixa > 0),
  frete_caixa    integer not null check (frete_caixa >= 0),
  status         text not null default 'aberto' check (status in ('aberto', 'aceito', 'concluido', 'cancelado')),
  criado_em      timestamptz not null default now(),
  check (frete_caixa <= valor_caixa),
  check (entregues + em_transito <= qtd)
);

create table if not exists public.caminhoes (
  id          bigint generated always as identity primary key,
  empresa     bigint not null references public.empresas (id) on delete cascade,
  status      text not null default 'parado' check (status in ('parado', 'em_rota', 'voltando')),
  pedido      bigint references public.pedidos (id) on delete set null,
  carga       integer not null default 0,
  partida     timestamptz,
  chegada     timestamptz,
  retorno     timestamptz,
  rota        jsonb,
  comprado_em timestamptz not null default now()
);

create table if not exists public.missoes (
  id          bigint generated always as identity primary key,
  produto     text not null,
  qtd         integer not null,
  valor_caixa integer not null,
  expira_em   timestamptz not null,
  status      text not null default 'aberta' check (status in ('aberta', 'aceita', 'concluida', 'expirada')),
  pedido      bigint references public.pedidos (id) on delete set null,
  criado_em   timestamptz not null default now()
);

alter table public.perfis
  add column if not exists ultima_tarefa timestamptz,
  add column if not exists carga_pedido  bigint,
  add column if not exists carga_em      timestamptz;

-- tudo é público para leitura (prédios, caminhões e pedidos aparecem no mapa); escrita só pelas funções
do $$
declare t text;
begin
  foreach t in array array['lotes', 'destinos', 'mercado', 'empresas', 'membros', 'pedidos', 'caminhoes', 'missoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('create policy "leitura publica" on public.%I for select using (true)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- ------------------------------------------------------------ apoio
create or replace function public.minha_empresa() returns public.empresas
language sql stable security definer set search_path = public as $$
  select e.* from membros m join empresas e on e.id = m.empresa where m.jogador = auth.uid();
$$;

create or replace function public.avisar(alvo uuid, texto text) returns void
language sql security definer set search_path = public as $$
  insert into comandos (alvo, autor, tipo, dados) values (alvo, auth.uid(), 'aviso', jsonb_build_object('texto', texto));
$$;

create or replace function public.empresa_do_dono(p_tipo text default null) returns public.empresas
language plpgsql stable security definer set search_path = public as $$
declare e empresas%rowtype;
begin
  select * into e from empresas where dono = auth.uid();
  if e.id is null then raise exception 'voce nao e dono de empresa'; end if;
  if p_tipo is not null and e.tipo <> p_tipo then raise exception 'sua empresa nao e desse tipo'; end if;
  return e;
end $$;

create or replace function public.jogador_livre() returns perfis
language plpgsql stable security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = auth.uid();
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p.algemado or p.pena_seg > 0 then raise exception 'voce esta preso'; end if;
  return p;
end $$;

-- duração de uma perna da viagem: distância em L pelas ruas a 8 m/s, mínimo 6 s
create or replace function public.duracao(ax real, az real, bx real, bz real) returns real
language sql immutable as $$ select greatest(6, (abs(ax - bx) + abs(az - bz)) / 8.0 + 3)::real; $$;

-- ------------------------------------------------------------ comprar lote e fundar empresa
create or replace function public.comprar_lote(p_lote integer, p_nome text, p_tipo text, p_produto text) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; l lotes%rowtype; nova bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if exists (select 1 from membros where jogador = p.id) then raise exception 'saia da empresa atual antes'; end if;
  select * into l from lotes where id = p_lote;
  if l.id is null then raise exception 'lote invalido'; end if;
  if exists (select 1 from empresas where lote = p_lote) then raise exception 'lote ja vendido'; end if;
  if p_tipo not in ('fabrica', 'transportadora') then raise exception 'tipo invalido'; end if;
  if p_tipo = 'fabrica' and coalesce(p_produto, '') not in ('chocolate', 'remedio') then raise exception 'produto invalido'; end if;
  if p_nome !~ '^[[:alnum:] _.&-]{3,24}$' then raise exception 'nome invalido'; end if;
  if exists (select 1 from empresas where lower(nome) = lower(p_nome)) then raise exception 'nome de empresa em uso'; end if;
  if p.moedas < l.preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - l.preco where id = p.id;
  insert into empresas (nome, tipo, dono, lote, produto)
    values (p_nome, p_tipo, p.id, p_lote, case when p_tipo = 'fabrica' then p_produto end)
    returning id into nova;
  insert into membros (jogador, empresa) values (p.id, nova);
  return nova;
end $$;

-- ------------------------------------------------------------ caixa da empresa e pagamento por tarefa
create or replace function public.empresa_depositar(valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; novo integer;
begin
  e := empresa_do_dono();
  if valor < 1 then raise exception 'valor invalido'; end if;
  update perfis set moedas = moedas - valor where id = auth.uid() and moedas >= valor;
  if not found then raise exception 'moedas insuficientes'; end if;
  update empresas set caixa = caixa + valor where id = e.id returning caixa into novo;
  return novo;
end $$;

create or replace function public.empresa_sacar(valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; novo integer;
begin
  e := empresa_do_dono();
  if valor < 1 then raise exception 'valor invalido'; end if;
  update empresas set caixa = caixa - valor where id = e.id and caixa >= valor returning caixa into novo;
  if novo is null then raise exception 'caixa insuficiente'; end if;
  update perfis set moedas = moedas + valor where id = auth.uid();
  return novo;
end $$;

create or replace function public.empresa_pagamento(valor integer) returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype;
begin
  e := empresa_do_dono();
  if valor < 0 or valor > 500 then raise exception 'valor invalido'; end if;
  update empresas set pagamento = valor where id = e.id;
end $$;

-- ------------------------------------------------------------ funcionários
create or replace function public.contratar(p_nome text) returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; alvo perfis%rowtype;
begin
  e := empresa_do_dono();
  select * into alvo from perfis where lower(nome) = lower(p_nome);
  if alvo.id is null then raise exception 'jogador nao encontrado'; end if;
  if alvo.banido then raise exception 'jogador banido'; end if;
  if exists (select 1 from membros where jogador = alvo.id) then raise exception 'jogador ja trabalha em uma empresa'; end if;
  if (select count(*) from membros where empresa = e.id) >= 20 then raise exception 'limite de funcionarios'; end if;
  insert into membros (jogador, empresa) values (alvo.id, e.id);
  perform avisar(alvo.id, format('Você foi contratado pela %s. Paga %s moedas por tarefa.', e.nome, e.pagamento));
end $$;

create or replace function public.demitir(p_jogador uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype;
begin
  e := empresa_do_dono();
  if p_jogador = auth.uid() then raise exception 'o dono nao pode se demitir'; end if;
  delete from membros where jogador = p_jogador and empresa = e.id;
  if not found then raise exception 'jogador nao e seu funcionario'; end if;
  perform avisar(p_jogador, format('Você foi demitido da %s.', e.nome));
end $$;

create or replace function public.sair_empresa() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from empresas where dono = auth.uid()) then raise exception 'o dono nao pode sair da propria empresa'; end if;
  delete from membros where jogador = auth.uid();
end $$;

-- ------------------------------------------------------------ fábrica: embalar (vai para o estoque)
create or replace function public.embalar_fabrica() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e empresas%rowtype; pago integer := 0;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  e := minha_empresa();
  if e.id is null or e.tipo <> 'fabrica' then raise exception 'voce nao trabalha em uma fabrica'; end if;
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

-- ------------------------------------------------------------ pedidos de frete
create or replace function public.criar_pedido(p_transportadora bigint, p_qtd integer, p_frete integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare f empresas%rowtype; t empresas%rowtype; valor integer; novo bigint;
begin
  f := empresa_do_dono('fabrica');
  select * into t from empresas where id = p_transportadora and tipo = 'transportadora';
  if t.id is null then raise exception 'transportadora invalida'; end if;
  if p_qtd < 1 or p_qtd > 200 then raise exception 'quantidade invalida'; end if;
  select valor_caixa into valor from mercado where produto = f.produto;
  if p_frete < 0 or p_frete > valor then raise exception 'frete invalido'; end if;
  update empresas set estoque = estoque - p_qtd where id = f.id and estoque >= p_qtd;
  if not found then raise exception 'estoque insuficiente'; end if;
  insert into pedidos (fabrica, transportadora, destino, produto, qtd, valor_caixa, frete_caixa)
    values (f.id, t.id, 'loja', f.produto, p_qtd, valor, p_frete) returning id into novo;
  perform avisar(t.dono, format('Novo pedido de frete da %s: %s caixas, %s moedas por caixa.', f.nome, p_qtd, p_frete));
  return novo;
end $$;

create or replace function public.responder_pedido(p_pedido bigint, aceitar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t empresas%rowtype; pd pedidos%rowtype;
begin
  t := empresa_do_dono('transportadora');
  select * into pd from pedidos where id = p_pedido and transportadora = t.id for update;
  if pd.id is null or pd.status <> 'aberto' then raise exception 'pedido indisponivel'; end if;
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
  f := empresa_do_dono('fabrica');
  select * into pd from pedidos where id = p_pedido and fabrica = f.id for update;
  if pd.id is null or pd.status not in ('aberto', 'aceito') then raise exception 'pedido indisponivel'; end if;
  if pd.em_transito > 0 then raise exception 'ha caixas a caminho'; end if;
  sobra := pd.qtd - pd.entregues;
  update pedidos set status = case when pd.entregues > 0 then 'concluido' else 'cancelado' end, qtd = case when pd.entregues > 0 then pd.entregues else qtd end where id = pd.id;
  update empresas set estoque = estoque + sobra where id = f.id;
  if pd.missao is not null and pd.entregues = 0 then
    update missoes set status = case when expira_em > now() then 'aberta' else 'expirada' end, pedido = null where id = pd.missao;
  end if;
end $$;

-- registra caixas entregues: paga fábrica e transportadora; fecha o pedido quando completo
create or replace function public.registrar_entrega(p_pedido bigint, n integer) returns void
language plpgsql security definer set search_path = public as $$
declare pd pedidos%rowtype;
begin
  update pedidos set entregues = entregues + n, em_transito = em_transito - n where id = p_pedido returning * into pd;
  update empresas set caixa = caixa + (pd.valor_caixa - pd.frete_caixa) * n where id = pd.fabrica;
  update empresas set caixa = caixa + pd.frete_caixa * n where id = pd.transportadora;
  if pd.entregues >= pd.qtd then
    update pedidos set status = 'concluido' where id = pd.id;
    if pd.missao is not null then update missoes set status = 'concluida' where id = pd.missao; end if;
    perform avisar((select dono from empresas where id = pd.fabrica), format('Pedido de %s caixas entregue por completo.', pd.qtd));
  end if;
end $$;

-- ------------------------------------------------------------ entrega à mão (sem caminhão)
create or replace function public.retirar_caixa(p_pedido bigint) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e empresas%rowtype; pd pedidos%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  e := minha_empresa();
  if e.id is null or e.tipo <> 'transportadora' then raise exception 'voce nao trabalha em uma transportadora'; end if;
  -- carga esquecida há mais de 10 minutos volta para o pedido
  if p.carga_pedido is not null then
    if p.carga_em > now() - interval '10 minutes' then raise exception 'voce ja esta carregando uma caixa'; end if;
    update pedidos set em_transito = greatest(0, em_transito - 1) where id = p.carga_pedido;
  end if;
  select * into pd from pedidos where id = p_pedido and transportadora = e.id and status = 'aceito' for update;
  if pd.id is null then raise exception 'pedido indisponivel'; end if;
  if pd.entregues + pd.em_transito >= pd.qtd then raise exception 'todas as caixas ja foram retiradas'; end if;
  update pedidos set em_transito = em_transito + 1 where id = pd.id;
  update perfis set carga_pedido = pd.id, carga_em = now() where id = p.id;
  return pd.produto;
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
  select * into t from empresas where id = pd.transportadora;
  if t.dono <> p.id and t.pagamento > 0 then
    pago := least(t.pagamento, t.caixa);
    update empresas set caixa = caixa - pago where id = t.id;
    update perfis set moedas = moedas + pago where id = p.id;
  end if;
  return pago;
end $$;

create or replace function public.desistir_caixa() returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.carga_pedido is null then return; end if;
  update pedidos set em_transito = greatest(0, em_transito - 1) where id = p.carga_pedido;
  update perfis set carga_pedido = null, carga_em = null where id = p.id;
end $$;

-- ------------------------------------------------------------ caminhões
create or replace function public.comprar_caminhao() returns bigint
language plpgsql security definer set search_path = public as $$
declare t empresas%rowtype; novo bigint;
begin
  t := empresa_do_dono('transportadora');
  if (select count(*) from caminhoes where empresa = t.id) >= 5 then raise exception 'limite de caminhoes'; end if;
  update empresas set caixa = caixa - 15000 where id = t.id and caixa >= 15000;
  if not found then raise exception 'caixa insuficiente'; end if;
  insert into caminhoes (empresa) values (t.id) returning id into novo;
  return novo;
end $$;

create or replace function public.despachar_caminhao(p_caminhao bigint, p_pedido bigint) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t empresas%rowtype; c caminhoes%rowtype; pd pedidos%rowtype; lt lotes%rowtype; lf lotes%rowtype; d destinos%rowtype;
        v_carga integer; d1 real; d2 real; d3 real; ch timestamptz;
begin
  t := empresa_do_dono('transportadora');
  perform processar_caminhoes();
  select * into c from caminhoes where id = p_caminhao and empresa = t.id for update;
  if c.id is null then raise exception 'caminhao invalido'; end if;
  if c.status <> 'parado' then raise exception 'caminhao em viagem'; end if;
  select * into pd from pedidos where id = p_pedido and transportadora = t.id and status = 'aceito' for update;
  if pd.id is null then raise exception 'pedido indisponivel'; end if;
  v_carga := least(20, pd.qtd - pd.entregues - pd.em_transito);
  if v_carga <= 0 then raise exception 'todas as caixas ja foram retiradas'; end if;
  select * into lt from lotes where id = t.lote;
  select * into lf from lotes where id = (select lote from empresas where id = pd.fabrica);
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

-- conclui viagens cujo horário já passou (qualquer jogador pode chamar; o banco decide)
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
  return n;
end $$;

-- ------------------------------------------------------------ missões do Contratante
create or replace function public.garantir_missoes() returns void
language plpgsql security definer set search_path = public as $$
declare abertas integer; prod text; v integer;
begin
  update missoes set status = 'expirada' where status = 'aberta' and expira_em <= now();
  select count(*) into abertas from missoes where status = 'aberta';
  while abertas < 3 loop
    prod := (array['chocolate', 'remedio'])[1 + floor(random() * 2)::int];
    select valor_caixa * 2 into v from mercado where produto = prod;
    insert into missoes (produto, qtd, valor_caixa, expira_em)
      values (prod, 5 + floor(random() * 11)::int, v, now() + interval '40 minutes');
    abertas := abertas + 1;
  end loop;
end $$;

create or replace function public.listar_missoes() returns setof public.missoes
language plpgsql security definer set search_path = public as $$
begin
  perform garantir_missoes();
  return query select * from missoes where status = 'aberta' order by expira_em;
end $$;

create or replace function public.aceitar_missao(p_missao bigint, p_transportadora bigint, p_frete integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare f empresas%rowtype; t empresas%rowtype; m missoes%rowtype; novo bigint;
begin
  f := empresa_do_dono('fabrica');
  select * into m from missoes where id = p_missao for update;
  if m.id is null or m.status <> 'aberta' or m.expira_em <= now() then raise exception 'missao indisponivel'; end if;
  if m.produto <> f.produto then raise exception 'sua fabrica nao produz esse item'; end if;
  select * into t from empresas where id = p_transportadora and tipo = 'transportadora';
  if t.id is null then raise exception 'transportadora invalida'; end if;
  if p_frete < 0 or p_frete > m.valor_caixa then raise exception 'frete invalido'; end if;
  update empresas set estoque = estoque - m.qtd where id = f.id and estoque >= m.qtd;
  if not found then raise exception 'estoque insuficiente'; end if;
  insert into pedidos (fabrica, transportadora, destino, missao, produto, qtd, valor_caixa, frete_caixa)
    values (f.id, t.id, 'contratante', m.id, m.produto, m.qtd, m.valor_caixa, p_frete) returning id into novo;
  update missoes set status = 'aceita', pedido = novo where id = m.id;
  perform avisar(t.dono, format('Missão do Contratante via %s: %s caixas, %s moedas de frete por caixa.', f.nome, m.qtd, p_frete));
  return novo;
end $$;

-- hora do servidor (para os caminhões andarem igual em todos os aparelhos)
create or replace function public.agora() returns timestamptz language sql stable as $$ select now(); $$;

-- ------------------------------------------------------------ permissões
do $$
declare f text;
begin
  foreach f in array array[
    'comprar_lote(integer, text, text, text)', 'empresa_depositar(integer)', 'empresa_sacar(integer)', 'empresa_pagamento(integer)',
    'contratar(text)', 'demitir(uuid)', 'sair_empresa()', 'embalar_fabrica()', 'criar_pedido(bigint, integer, integer)',
    'responder_pedido(bigint, boolean)', 'cancelar_pedido(bigint)', 'retirar_caixa(bigint)', 'entregar_caixa()', 'desistir_caixa()',
    'comprar_caminhao()', 'despachar_caminhao(bigint, bigint)', 'processar_caminhoes()', 'listar_missoes()',
    'aceitar_missao(bigint, bigint, integer)', 'agora()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['minha_empresa()', 'avisar(uuid, text)', 'empresa_do_dono(text)', 'jogador_livre()',
                           'registrar_entrega(bigint, integer)', 'garantir_missoes()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- tempo real: prédios, caminhões, pedidos e equipe aparecem na hora
do $$
declare t text;
begin
  foreach t in array array['empresas', 'membros', 'pedidos', 'caminhoes', 'missoes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
