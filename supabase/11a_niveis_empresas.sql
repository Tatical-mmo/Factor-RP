-- Fator RP - níveis 1 a 15 (parte 1 de 3): empresas.
-- Para chegar nos níveis 5, 10 e 15 o dono precisa ter um Desbloqueio Corporativo na mochila
-- (vendido na loja). Rode as partes 11a, 11b e 11c em ordem, cada uma numa consulta limpa.

insert into public.precos (item, nome, compra, venda, fome) values ('desbloqueio', 'Desbloqueio Corporativo', 50000, null, 0)
on conflict (item) do update set nome = excluded.nome, compra = excluded.compra, venda = excluded.venda;

alter table public.empresas drop constraint if exists empresas_nivel_v2;
alter table public.empresas drop constraint if exists empresas_nivel_15;
alter table public.empresas add constraint empresas_nivel_15 check (nivel between 1 and 15);
alter table public.empresas drop constraint if exists empresas_produto_check;
alter table public.empresas drop constraint if exists empresas_produto_v3;
alter table public.empresas add constraint empresas_produto_v3 check (produto is null or produto in ('chocolate', 'remedio', 'robo'));

-- limites por nível
create or replace function public.limite(p_nivel integer, item text) returns integer
language sql immutable as $$
  select case item
    when 'robos'        then (array[2, 4, 8, 10, 12, 14, 16, 18, 20, 24, 27, 30, 34, 38, 50])[p_nivel]
    when 'funcionarios' then (array[5, 10, 20, 22, 25, 27, 30, 32, 35, 40, 42, 45, 48, 52, 60])[p_nivel]
    when 'caminhoes'    then (array[2, 3, 5, 5, 6, 6, 7, 8, 8, 10, 11, 12, 13, 14, 18])[p_nivel]
    when 'unidades'     then case when p_nivel >= 15 then 5 when p_nivel >= 10 then 2 else 1 end   -- matriz + filiais
    when 'evoluir'      then case when p_nivel >= 15 then null else 25000 * p_nivel * (p_nivel + 1) / 2 end
    when 'producao'     then 100 + (p_nivel - 1) * 15                                              -- % de velocidade
  end;
$$;

-- tira 1 item da mochila de um jogador (erro se não tiver)
create or replace function public.gastar_item(p_dono uuid, p_item text, p_msg text) returns void
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  select qtd into n from inventario where dono = p_dono and item = p_item for update;
  if coalesce(n, 0) < 1 then raise exception '%', p_msg; end if;
  if n = 1 then delete from inventario where dono = p_dono and item = p_item;
  else update inventario set qtd = qtd - 1 where dono = p_dono and item = p_item; end if;
end $$;

create or replace function public.evoluir_empresa(p_empresa bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; custo integer;
begin
  e := do_dono(p_empresa);
  if e.nivel >= 15 then raise exception 'nivel maximo'; end if;
  custo := limite(e.nivel, 'evoluir');
  if (e.nivel + 1) % 5 = 0 then perform gastar_item(auth.uid(), 'desbloqueio', 'precisa de desbloqueio corporativo'); end if;
  update empresas set caixa = caixa - custo, nivel = nivel + 1 where id = e.id and caixa >= custo;
  if not found then raise exception 'caixa insuficiente'; end if;
  return e.nivel + 1;
end $$;

-- caminhões: transportadoras têm a frota toda; fábricas (nível 3+) têm metade
create or replace function public.comprar_caminhao(p_empresa bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; novo bigint; lim integer;
begin
  e := do_dono(p_empresa);
  if not e.transporte and e.nivel < 3 then raise exception 'so transportadoras ou empresas nivel 3 compram caminhao'; end if;
  lim := limite(e.nivel, 'caminhoes');
  if not e.transporte then lim := ceil(lim / 2.0); end if;
  if (select count(*) from caminhoes where empresa = e.id) >= lim then raise exception 'limite de caminhoes'; end if;
  update empresas set caixa = caixa - 15000 where id = e.id and caixa >= 15000;
  if not found then raise exception 'caixa insuficiente'; end if;
  insert into caminhoes (empresa) values (e.id) returning id into novo;
  return novo;
end $$;

-- filiais: no nível 10 a empresa pode ter 2 lotes; no 15, a matriz e mais 4 filiais
create or replace function public.abrir_filial(p_empresa bigint, p_lote integer, p_funcao text) returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; l lotes%rowtype;
begin
  e := do_dono(p_empresa);
  if (select count(*) from unidades where empresa = e.id) >= limite(e.nivel, 'unidades') then raise exception 'limite de filiais'; end if;
  if p_funcao not in ('fabrica', 'transportadora') or (p_funcao = 'fabrica' and not e.fabrica) or (p_funcao = 'transportadora' and not e.transporte)
    then raise exception 'tipo invalido'; end if;
  select * into l from lotes where id = p_lote;
  if l.id is null then raise exception 'lote invalido'; end if;
  if exists (select 1 from unidades where lote = p_lote) then raise exception 'lote ja vendido'; end if;
  update empresas set caixa = caixa - l.preco where id = e.id and caixa >= l.preco;
  if not found then raise exception 'caixa insuficiente'; end if;
  insert into unidades (lote, empresa, funcao) values (p_lote, e.id, p_funcao);
end $$;

-- linha de produção: cada robô embala 1 caixa a cada 90 s (robôs: 1 robô a cada 20 min),
-- mais rápido conforme o nível (até 310% no nível 15). Acumula no máximo 4 h.
create or replace function public.produzir_robos() returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; ativos integer; seg double precision; n integer; passo double precision;
begin
  for e in select * from empresas where fabrica for update skip locked loop
    ativos := robos_ativos(e);
    if ativos <= 0 then
      update empresas set producao_marca = now() where id = e.id;
      continue;
    end if;
    passo := (case when e.produto = 'robo' then 1200 else 90 end) * 100.0 / limite(e.nivel, 'producao') / ativos;
    seg := least(4 * 3600, extract(epoch from (now() - e.producao_marca)));
    n := floor(seg / passo);
    if n > 0 then
      update empresas set estoque = estoque + n,
        producao_marca = greatest(e.producao_marca, now() - interval '4 hours') + make_interval(secs => n * passo)
      where id = e.id;
    end if;
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array['evoluir_empresa(bigint)', 'comprar_caminhao(bigint)', 'abrir_filial(bigint, integer, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['gastar_item(uuid, text, text)', 'produzir_robos()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
