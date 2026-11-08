-- Fator RP - vans e helicópteros (parte 1 de 2): tipos de veículo, fábricas de veículos e compra.
--   van:         rápida e barata, leva pouco (10 + 2 por robô, máx. 20).
--   caminhão:    o de sempre (20 + 5 por robô, máx. 60). Frota: transportadoras, ou fábricas nível 3+.
--   helicóptero: voa em linha reta, muito rápido, não pode ser roubado (15 + 3 por robô, máx. 30). Nível 10+.
-- Fábricas de veículos (produto caminhão, van ou helicóptero) vendem mais barato que o sistema
-- e o dinheiro vai para o caixa delas. Rode 16a e depois 16b.

alter table public.caminhoes add column if not exists tipo text not null default 'caminhao';
alter table public.caminhoes drop constraint if exists caminhoes_tipo_v1;
alter table public.caminhoes add constraint caminhoes_tipo_v1 check (tipo in ('caminhao', 'van', 'helicoptero'));
alter table public.empresas drop constraint if exists empresas_produto_v3;
alter table public.empresas drop constraint if exists empresas_produto_v4;
alter table public.empresas add constraint empresas_produto_v4 check (produto is null or produto in ('chocolate', 'remedio', 'robo', 'caminhao', 'van', 'helicoptero'));

-- ficha de cada veículo
create or replace function public.veiculo(p_tipo text, item text) returns real
language sql immutable as $$
  select (case p_tipo
    when 'van'         then jsonb_build_object('sistema', 9000,  'fabrica', 7200,  'cap', 10, 'robo', 2, 'max', 20, 'tempo', 0.65, 'vida', 60,  'producao', 1500, 'nivel', 1)
    when 'helicoptero' then jsonb_build_object('sistema', 75000, 'fabrica', 60000, 'cap', 15, 'robo', 3, 'max', 30, 'tempo', 0.35, 'vida', 0,   'producao', 7200, 'nivel', 10)
    else                    jsonb_build_object('sistema', 15000, 'fabrica', 12000, 'cap', 20, 'robo', 5, 'max', 60, 'tempo', 1.0,  'vida', 100, 'producao', 2400, 'nivel', 1)
  end ->> item)::real;
$$;
create or replace function public.eh_veiculo(p text) returns boolean language sql immutable as $$ select p in ('caminhao', 'van', 'helicoptero'); $$;

-- preço do próximo veículo (fábrica de jogador com estoque ou sistema)
create or replace function public.preco_veiculo(p_empresa bigint, p_tipo text) returns integer
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from empresas where produto = p_tipo and estoque > 0 and id is distinct from p_empresa)
    then veiculo(p_tipo, 'fabrica') else veiculo(p_tipo, 'sistema') end::integer;
$$;

create or replace function public.comprar_veiculo(p_empresa bigint, p_tipo text) returns bigint
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; novo bigint; lim integer; preco integer; f bigint;
begin
  perform produzir_robos();
  e := do_dono(p_empresa);
  if not eh_veiculo(p_tipo) then raise exception 'veiculo invalido'; end if;
  if not e.transporte and e.nivel < 3 then raise exception 'so transportadoras ou empresas nivel 3 tem frota'; end if;
  if e.nivel < veiculo(p_tipo, 'nivel') then raise exception 'helicoptero so a partir do nivel 10'; end if;
  lim := limite(e.nivel, 'caminhoes');
  if not e.transporte then lim := ceil(lim / 2.0); end if;
  if (select count(*) from caminhoes where empresa = e.id) >= lim then raise exception 'limite de veiculos'; end if;
  preco := preco_veiculo(e.id, p_tipo);
  update empresas set caixa = caixa - preco where id = e.id and caixa >= preco;
  if not found then raise exception 'caixa insuficiente'; end if;
  if preco = veiculo(p_tipo, 'fabrica')::integer then
    select id into f from empresas where produto = p_tipo and estoque > 0 and id <> e.id order by estoque desc limit 1 for update skip locked;
    if f is not null then update empresas set estoque = estoque - 1, caixa = caixa + preco where id = f; end if;
  end if;
  insert into caminhoes (empresa, tipo) values (e.id, p_tipo) returning id into novo;
  return novo;
end $$;
create or replace function public.comprar_caminhao(p_empresa bigint) returns bigint
language sql security definer set search_path = public as $$ select comprar_veiculo(p_empresa, 'caminhao'); $$;

-- produção: caixas a cada 90 s; robôs a cada 20 min; vans 25 min; caminhões 40 min; helicópteros 2 h (por robô, mais rápido por nível)
create or replace function public.produzir_robos() returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; ativos integer; seg double precision; n integer; passo double precision;
begin
  for e in select * from empresas where fabrica for update skip locked loop
    ativos := robos_ativos(e);
    if ativos <= 0 then update empresas set producao_marca = now() where id = e.id; continue; end if;
    passo := (case when e.produto = 'robo' then 1200 when eh_veiculo(e.produto) then veiculo(e.produto, 'producao') else 90 end)
             * 100.0 / limite(e.nivel, 'producao') / ativos;
    seg := least(4 * 3600, extract(epoch from (now() - e.producao_marca)));
    n := floor(seg / passo);
    if n > 0 then
      update empresas set estoque = estoque + n,
        producao_marca = greatest(e.producao_marca, now() - interval '4 hours') + make_interval(secs => n * passo)
      where id = e.id;
    end if;
  end loop;
end $$;

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
  if p_tipo = 'fabrica' and coalesce(p_produto, '') not in ('chocolate', 'remedio', 'robo', 'caminhao', 'van', 'helicoptero') then raise exception 'produto invalido'; end if;
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

-- robôs e veículos saem da linha de produção, não são embalados nem vão em pedidos
create or replace function public.pedido_sem_robo() returns trigger
language plpgsql as $$
begin
  if new.produto = 'robo' or eh_veiculo(new.produto) then raise exception 'esse produto e vendido direto pela fabrica'; end if;
  return new;
end $$;

do $$
declare f text;
begin
  foreach f in array array['comprar_veiculo(bigint, text)', 'comprar_caminhao(bigint)', 'preco_veiculo(bigint, text)', 'comprar_lote(integer, text, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
