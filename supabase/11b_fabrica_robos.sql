-- Fator RP - níveis 1 a 15 (parte 2 de 3): fábrica de robôs e mercado de robôs.
-- Uma fábrica pode produzir robôs. Empresas e clãs compram robôs das fábricas por 8.000
-- (o dinheiro vai para o caixa da fábrica). Se nenhuma fábrica tiver estoque, o robô vem
-- de fora por 12.000.

create or replace function public.comprar_lote(p_lote integer, p_nome text, p_tipo text, p_produto text) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; l lotes%rowtype; nova bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if (select count(*) from empresas where dono = p.id) >= 5 then raise exception 'limite de empresas'; end if;
  select * into l from lotes where id = p_lote;
  if l.id is null then raise exception 'lote invalido'; end if;
  if exists (select 1 from unidades where lote = p_lote) then raise exception 'lote ja vendido'; end if;
  if p_tipo not in ('fabrica', 'transportadora') then raise exception 'tipo invalido'; end if;
  if p_tipo = 'fabrica' and coalesce(p_produto, '') not in ('chocolate', 'remedio', 'robo') then raise exception 'produto invalido'; end if;
  if p_nome !~ '^[[:alnum:] _.&-]{3,24}$' then raise exception 'nome invalido'; end if;
  if exists (select 1 from empresas where lower(nome) = lower(p_nome)) then raise exception 'nome de empresa em uso'; end if;
  if p.moedas < l.preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - l.preco where id = p.id;
  insert into empresas (nome, tipo, dono, lote, produto, fabrica, transporte)
    values (p_nome, p_tipo, p.id, p_lote, case when p_tipo = 'fabrica' then p_produto end, p_tipo = 'fabrica', p_tipo = 'transportadora')
    returning id into nova;
  insert into unidades (lote, empresa, funcao) values (p_lote, nova, p_tipo);
  return nova;
end $$;

-- robôs são montados pelos robôs da fábrica, não embalados à mão
create or replace function public.embalar_fabrica(p_empresa bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e empresas%rowtype; pago integer := 0;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  select * into e from empresas where id = p_empresa;
  if e.id is null or not e.fabrica or not trabalha_em(e.id) then raise exception 'voce nao trabalha em uma fabrica'; end if;
  if e.produto = 'robo' then raise exception 'robos sao montados pela linha de producao'; end if;
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

-- robôs não viajam em caixas de caminhão
create or replace function public.pedido_sem_robo() returns trigger
language plpgsql as $$
begin
  if new.produto = 'robo' then raise exception 'robos sao vendidos direto pela fabrica'; end if;
  return new;
end $$;
drop trigger if exists pedido_sem_robo on public.pedidos;
create trigger pedido_sem_robo before insert on public.pedidos for each row execute function public.pedido_sem_robo();

-- preço do próximo robô para quem compra (sem mexer em nada)
create or replace function public.preco_robo(p_excluir bigint default null) returns integer
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from empresas where produto = 'robo' and estoque > 0 and id is distinct from p_excluir) then 8000 else 12000 end;
$$;

-- tira 1 robô do estoque de uma fábrica e paga a fábrica (se a compra foi pelo preço de fábrica)
create or replace function public.entregar_robo(p_excluir bigint, p_preco integer) returns void
language plpgsql security definer set search_path = public as $$
declare f bigint;
begin
  if p_preco <> 8000 then return; end if;
  select id into f from empresas where produto = 'robo' and estoque > 0 and id is distinct from p_excluir
    order by estoque desc limit 1 for update skip locked;
  if f is not null then update empresas set estoque = estoque - 1, caixa = caixa + 8000 where id = f; end if;
end $$;

create or replace function public.comprar_robo(p_empresa bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; preco integer;
begin
  perform produzir_robos();
  e := do_dono(p_empresa);
  if robos_ativos(e) >= limite(e.nivel, 'robos') then raise exception 'limite de robos'; end if;
  preco := preco_robo(e.id);
  update empresas set caixa = caixa - preco, robos = robos + 1 where id = e.id and caixa >= preco;
  if not found then raise exception 'caixa insuficiente'; end if;
  perform entregar_robo(e.id, preco);
  return e.robos + 1;
end $$;

-- estoque de robôs à venda (para mostrar no jogo)
create or replace function public.mercado_robos() returns table (fabrica text, estoque integer, preco integer)
language sql stable security definer set search_path = public as $$
  select nome, estoque, 8000 from empresas where produto = 'robo' order by estoque desc;
$$;

do $$
declare f text;
begin
  perform produzir_robos();
  foreach f in array array['comprar_lote(integer, text, text, text)', 'embalar_fabrica(bigint)', 'comprar_robo(bigint)', 'preco_robo(bigint)', 'mercado_robos()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.entregar_robo(bigint, integer) from public, anon, authenticated';
end $$;
