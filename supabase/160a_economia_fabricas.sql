-- Fator RP - 160a (parte 1 de 4): estoque da cidade, preço que varia e produtos novos. Rode antes do 160b.
-- Fator RP - 160: economia das fábricas.
-- 1) Estoque da cidade: a tabela mercado passa a guardar quantas caixas a cidade tem de cada produto.
--    A transportadora entrega -> a cidade paga a fábrica e a caixa entra no estoque (1 caixa = 1 unidade).
--    A loja só vende o que tem no estoque; o hospital gasta 1 remédio por tratamento; os moradores consomem um pouco por hora.
-- 2) Preço que varia: estoque vazio paga até 1,6x o valor base por caixa; estoque cheio paga 0,4x e a cidade para de comprar.
-- 3) Quadro de encomendas: jogador ou clã encomenda, as fábricas dão lances por 10 min, o menor preço leva e entrega por frete.
-- 4) Produtos novos: hambúrguer e refeição completa.

-- ------------------------------------------------------------ 1) estoque da cidade
alter table public.mercado add column if not exists valor_base integer;
alter table public.mercado add column if not exists estoque integer not null default 0;
alter table public.mercado add column if not exists capacidade integer not null default 400;
alter table public.mercado add column if not exists consumo_hora integer not null default 10;
alter table public.mercado add column if not exists atualizado_em timestamptz not null default now();

-- primeira vez: guarda o valor base e põe um estoque inicial
update public.mercado set valor_base = valor_caixa,
  estoque = case produto when 'chocolate' then 150 when 'remedio' then 80 else 50 end,
  capacidade = case produto when 'chocolate' then 400 when 'remedio' then 300 else 300 end,
  consumo_hora = case produto when 'chocolate' then 12 when 'remedio' then 6 else 8 end
where valor_base is null;

insert into public.mercado (produto, valor_caixa, valor_base, estoque, capacidade, consumo_hora) values
  ('hamburguer', 80, 80, 60, 300, 10),
  ('refeicao', 140, 140, 40, 200, 6)
on conflict (produto) do nothing;

-- preço por caixa calculado do estoque: 1,6x (vazio) até 0,4x (cheio)
create or replace function public.mercado_preco() returns trigger
language plpgsql as $$
begin
  if new.valor_base is not null then
    new.valor_caixa := greatest(1, round(new.valor_base * (1.6 - 1.2 * least(1.0, greatest(0, new.estoque)::numeric / greatest(1, new.capacidade)))));
  end if;
  return new;
end $$;
drop trigger if exists mercado_preco on public.mercado;
create trigger mercado_preco before insert or update on public.mercado for each row execute function public.mercado_preco();
update public.mercado set estoque = estoque;

-- os moradores (NPCs) consomem um pouco por hora; calculado quando alguém olha ou mexe no estoque
create or replace function public.atualizar_cidade() returns void
language plpgsql security definer set search_path = public as $$
declare m mercado%rowtype; n integer;
begin
  for m in select * from mercado where consumo_hora > 0 and atualizado_em < now() - interval '1 minute' for update skip locked loop
    n := floor(extract(epoch from (now() - m.atualizado_em)) * m.consumo_hora / 3600.0);
    if n < 1 then continue; end if;
    if m.estoque - n <= 0 then
      update mercado set estoque = 0, atualizado_em = now() where produto = m.produto;
    else
      update mercado set estoque = estoque - n, atualizado_em = atualizado_em + make_interval(secs => n * 3600.0 / m.consumo_hora) where produto = m.produto;
    end if;
  end loop;
end $$;

-- caixas a caminho da cidade (pedidos normais ainda não entregues)
create or replace function public.caixas_a_caminho(p_produto text) returns integer
language plpgsql stable security definer set search_path = public as $$
begin
  return (select coalesce(sum(qtd - entregues), 0)::int from pedidos
          where produto = p_produto and status in ('aberto', 'aceito') and missao is null and encomenda_id is null);
end $$;

-- tabela de preços e estoque para a tela (loja, empresa, quadro)
create or replace function public.estoque_cidade() returns table (produto text, valor_caixa integer, valor_base integer, estoque integer, capacidade integer, a_caminho integer)
language plpgsql security definer set search_path = public as $$
begin
  perform atualizar_cidade();
  return query select m.produto, m.valor_caixa, m.valor_base, m.estoque, m.capacidade, caixas_a_caminho(m.produto) from mercado m order by m.valor_base;
end $$;

-- ------------------------------------------------------------ 4) produtos novos
insert into public.precos (item, nome, compra, venda, fome) values
  ('hamburguer', 'Hambúrguer', 250, null, 100),
  ('refeicao', 'Refeição completa (almoço + refresco)', 450, null, 100)
on conflict (item) do update set nome = excluded.nome, compra = excluded.compra, venda = excluded.venda, fome = excluded.fome;

alter table public.perfis add column if not exists refeicao_ate timestamptz;

alter table public.empresas drop constraint if exists empresas_produto_v4;
alter table public.empresas drop constraint if exists empresas_produto_v5;
alter table public.empresas add constraint empresas_produto_v5 check (produto is null or produto in
  ('chocolate', 'remedio', 'robo', 'caminhao', 'van', 'helicoptero', 'hamburguer', 'refeicao'));

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
  if p_tipo = 'fabrica' and coalesce(p_produto, '') not in ('chocolate', 'remedio', 'hamburguer', 'refeicao', 'robo', 'caminhao', 'van', 'helicoptero') then raise exception 'produto invalido'; end if;
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

-- hambúrguer leva 150 s e refeição 240 s por funcionário NPC (chocolate e remédio seguem 90 s)
create or replace function public.produzir_robos() returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; ativos integer; seg double precision; n integer; passo double precision;
begin
  for e in select * from empresas where fabrica for update skip locked loop
    ativos := robos_ativos(e);
    if ativos <= 0 then
      if e.producao_marca < now() - interval '10 minutes' then update empresas set producao_marca = now() - interval '5 minutes' where id = e.id; end if;
      continue;
    end if;
    passo := (case when e.produto = 'robo' then 1200 when eh_veiculo(e.produto) then veiculo(e.produto, 'producao')
                   when e.produto = 'hamburguer' then 150 when e.produto = 'refeicao' then 240 else 90 end)
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
revoke all on function public.produzir_robos() from public, anon, authenticated;

-- comer: a refeição completa também deixa a fome cair pela metade por 20 min
create or replace function public.consumir(nome_item text) returns real
language plpgsql security definer set search_path = public as $$
declare enche integer; nova real;
begin
  select fome into enche from precos where item = nome_item;
  if coalesce(enche, 0) <= 0 then raise exception 'isso nao se come'; end if;
  perform dar_item(auth.uid(), nome_item, -1);
  update perfis set fome = least(100, fome + enche),
    refeicao_ate = case when nome_item = 'refeicao' then now() + interval '20 minutes' else refeicao_ate end
  where id = auth.uid() returning fome into nova;
  return nova;
end $$;

