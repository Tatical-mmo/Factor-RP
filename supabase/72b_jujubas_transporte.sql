-- 72b · Jujubas: o Exército despacha caminhões, a transportadora do contrato recebe, e o comprador ilegal de Vila Serra.
-- Cada caminhão leva até 5.000 jujubas do Quartel (Porto Sul) até a corporação; chega na hora marcada (igual para todos).
-- Sequestrado por clã: não dá para descarregar no clã (trava); só vender ao comprador ilegal (9 por jujuba).
-- Largado e parado por 7 min, a carga se perde e o pedido volta a ficar aberto. O comprador revende aos clãs por 500.

create table if not exists public.jujuba_viagens (
  id       bigint generated always as identity primary key,
  pedido   bigint references public.jujuba_pedidos (id) on delete set null,
  corp     text not null,
  empresa  bigint references public.empresas (id) on delete set null,
  qtd      integer not null check (qtd between 1 and 5000),
  partida  timestamptz not null default now(),
  chegada  timestamptz not null,
  status   text not null default 'em_rota' check (status in ('em_rota', 'entregue', 'sequestrada', 'vendida', 'perdida')),
  motorista uuid references public.perfis (id) on delete set null,
  cla      bigint,
  x real, z real, ang real, largado boolean not null default false,
  ativo_em timestamptz
);
create table if not exists public.jujuba_mercado (id integer primary key default 1 check (id = 1), estoque integer not null default 0);
insert into public.jujuba_mercado (id) values (1) on conflict do nothing;
do $$
declare t text;
begin
  foreach t in array array['jujuba_viagens', 'jujuba_mercado'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ler on public.%I', t);
    execute format('create policy ler on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- o Exército despacha: 'faltante' (o que falta, em caminhões de até 5.000) ou 'cheio' (um caminhão de 5.000)
create or replace function public.despachar_jujubas(p_pedido bigint, p_modo text, p_segundos real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; pd jujuba_pedidos%rowtype; falta integer; leva integer; n integer := 0; l licitacoes%rowtype; valor integer;
begin
  p := jogador_livre();
  if p.profissao is distinct from 'exercito' and p.cargo <> 'admin' then raise exception 'so o exercito'; end if;
  select * into pd from jujuba_pedidos where id = p_pedido for update;
  if pd.id is null or pd.status <> 'aberto' then raise exception 'pedido ja atendido'; end if;
  select 10000 - a.estoque - coalesce((select sum(v.qtd) from jujuba_viagens v where v.corp = a.corp and v.status = 'em_rota'), 0)
    into falta from jujuba_armazens a where a.corp = pd.corp;
  if falta <= 0 then update jujuba_pedidos set status = 'entregue' where id = pd.id; return 0; end if;
  if p_modo = 'cheio' then falta := least(falta, 5000); end if;
  select valor_caminhao into valor from jujuba_config where id = 1;
  while falta > 0 loop
    leva := least(5000, falta); falta := falta - leva;
    select * into l from licitacoes where status = 'vigente' order by id desc limit 1 for update;
    insert into jujuba_viagens (pedido, corp, empresa, qtd, chegada)
      values (pd.id, pd.corp, l.empresa, leva, now() + make_interval(secs => greatest(40, least(420, coalesce(p_segundos, 120)))));
    if l.id is not null then   -- a transportadora do contrato recebe por caminhão
      update empresas set caixa = caixa + valor where id = l.empresa;
      update licitacoes set entregas = entregas + 1, status = case when entregas + 1 >= 5 then 'encerrada' else status end where id = l.id;
    end if;
    n := n + 1;
  end loop;
  update jujuba_pedidos set status = 'despachado' where id = pd.id;
  return n;
end $$;

-- relógio do sistema (qualquer um chama a cada ~15 s): chegadas, cargas perdidas e licitação
create or replace function public.processar_jujubas() returns void
language plpgsql security definer set search_path = public as $$
declare v jujuba_viagens%rowtype; l licitacoes%rowtype; ganhou record;
begin
  if auth.uid() is null then raise exception 'sem permissao'; end if;
  for v in select * from jujuba_viagens where status = 'em_rota' and chegada <= now() for update skip locked loop
    update jujuba_viagens set status = 'entregue' where id = v.id;
    update jujuba_armazens set estoque = least(10000, estoque + v.qtd) where corp = v.corp;
    update jujuba_pedidos set status = 'entregue' where id = v.pedido
      and not exists (select 1 from jujuba_viagens x where x.pedido = v.pedido and x.status = 'em_rota' and x.id <> v.id);
  end loop;
  for v in select * from jujuba_viagens where status = 'sequestrada' and coalesce(ativo_em, partida) < now() - interval '7 minutes' for update skip locked loop
    update jujuba_viagens set status = 'perdida' where id = v.id;
  end loop;
  select * into l from licitacoes where status in ('aberta', 'vigente') order by id desc limit 1 for update;
  if l.id is null then insert into licitacoes default values; return; end if;
  if l.status = 'aberta' and l.fecha_em <= now() then
    select empresa, valor into ganhou from licitacao_lances where licitacao = l.id order by valor, em limit 1;
    if ganhou.empresa is null then update licitacoes set fecha_em = now() + interval '10 minutes' where id = l.id; return; end if;
    update licitacoes set status = 'vigente', empresa = ganhou.empresa, valor = ganhou.valor where id = l.id;
    update empresas set caixa = caixa + ganhou.valor where id = ganhou.empresa;
    perform avisar((select dono from empresas where id = ganhou.empresa),
      format('🎖️ Sua transportadora ganhou a licitação das rações do Exército! Contrato de %s já está no caixa. Vale 5 caminhões.', ganhou.valor));
  end if;
end $$;

-- sequestro do caminhão de rações (membro de clã armado, na frente dele)
create or replace function public.sequestrar_jujubas(p_viagem bigint, p_x real, p_z real, p_ang real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v jujuba_viagens%rowtype; v_cla bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial or p.prf or p.profissao in ('exercito', 'bombeiro') then raise exception 'policial nao sequestra'; end if;
  select cla into v_cla from membros_cla where jogador = p.id;
  if v_cla is null then raise exception 'so membros de cla'; end if;
  if p.sequestrou_em is not null and p.sequestrou_em > now() - interval '60 seconds' then raise exception 'aguarde para sequestrar'; end if;
  select * into v from jujuba_viagens where id = p_viagem for update;
  if v.id is null or v.status <> 'em_rota' then raise exception 'esse veiculo nao esta em entrega'; end if;
  update jujuba_viagens set status = 'sequestrada', motorista = p.id, cla = v_cla, x = p_x, z = p_z, ang = p_ang, largado = false, ativo_em = now() where id = v.id;
  update jujuba_pedidos set status = 'aberto' where id = v.pedido;   -- o Exército pode mandar outro
  update perfis set crimes = crimes + 1, sequestrou_em = now() where id = p.id;
  return v.qtd;
end $$;

create or replace function public.mover_jujubas(p_viagem bigint, p_x real, p_z real, p_ang real, p_largado boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update jujuba_viagens set x = p_x, z = p_z, ang = p_ang, largado = coalesce(p_largado, false), ativo_em = now()
   where id = p_viagem and status = 'sequestrada' and motorista = auth.uid();
  return found;
end $$;

-- pegar de novo o caminhão largado (mesmo clã)
create or replace function public.pegar_jujubas_seq(p_viagem bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v jujuba_viagens%rowtype;
begin
  p := jogador_livre();
  select * into v from jujuba_viagens where id = p_viagem for update;
  if v.id is null or v.status <> 'sequestrada' then raise exception 'esse veiculo ja foi embora'; end if;
  if not v.largado then raise exception 'alguem esta dirigindo'; end if;
  if v.cla is distinct from (select cla from membros_cla where jogador = p.id) then raise exception 'so o cla que sequestrou'; end if;
  update jujuba_viagens set motorista = p.id, largado = false, ativo_em = now() where id = v.id;
  return v.qtd;
end $$;

-- vender a carga ao comprador ilegal (armazém ao lado da loja de Vila Serra): 9 moedas por jujuba
create or replace function public.vender_jujubas(p_viagem bigint, p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v jujuba_viagens%rowtype; valor integer;
begin
  p := jogador_livre();
  select * into v from jujuba_viagens where id = p_viagem for update;
  if v.id is null or v.status <> 'sequestrada' or v.motorista is distinct from p.id then raise exception 'voce nao esta nesse veiculo'; end if;
  if abs(p_x - 64) > 30 or abs(p_z + 972) > 30 then raise exception 'longe do comprador'; end if;
  valor := v.qtd * 9;
  update jujuba_viagens set status = 'vendida' where id = v.id;
  update jujuba_mercado set estoque = estoque + v.qtd where id = 1;
  update perfis set moedas = moedas + valor where id = p.id;
  return valor;
end $$;

-- clã compra do comprador ilegal: 500 por jujuba
create or replace function public.comprar_jujubas(p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla'; end if;
  if p.policial or p.prf or p.profissao = 'exercito' then raise exception 'loja fechada'; end if;
  if p_qtd not between 1 and 50 then raise exception 'quantidade invalida'; end if;
  select estoque into m from jujuba_mercado where id = 1 for update;
  if m < p_qtd then raise exception 'o comprador nao tem tudo isso'; end if;
  if p.moedas < p_qtd * 500 then raise exception 'moedas insuficientes'; end if;
  update jujuba_mercado set estoque = estoque - p_qtd where id = 1;
  update perfis set moedas = moedas - p_qtd * 500 where id = p.id;
  perform dar_item(p.id, 'jujuba', p_qtd);
  return p_qtd;
end $$;

do $$
declare f text;
begin
  foreach f in array array['despachar_jujubas(bigint, text, real)', 'processar_jujubas()', 'sequestrar_jujubas(bigint, real, real, real)',
                           'mover_jujubas(bigint, real, real, real, boolean)', 'pegar_jujubas_seq(bigint)', 'vender_jujubas(bigint, real, real)', 'comprar_jujubas(integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
