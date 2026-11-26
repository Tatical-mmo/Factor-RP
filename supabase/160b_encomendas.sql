-- Fator RP - 160b (parte 2 de 4): quadro de encomendas (tabelas e lances). Rode depois do 160a.

-- ------------------------------------------------------------ 3) quadro de encomendas
create table if not exists public.encomendas_cidade (
  id         bigint generated always as identity primary key,
  comprador  uuid not null references public.perfis (id) on delete cascade,
  cla        bigint references public.clas (id) on delete set null,
  produto    text not null references public.mercado (produto),
  qtd        integer not null check (qtd between 1 and 200),
  preco_max  integer not null check (preco_max > 0),
  deposito   integer not null default 0 check (deposito >= 0),   -- dinheiro guardado (devolvido no que sobrar)
  status     text not null default 'leilao' check (status in ('leilao', 'aguardando', 'entregando', 'concluida', 'expirada', 'cancelada')),
  vencedor   bigint references public.empresas (id) on delete set null,
  preco      integer,
  entregues  integer not null default 0,
  pedido     bigint,
  fecha_em   timestamptz not null default now() + interval '10 minutes',
  prazo      timestamptz not null default now() + interval '24 hours 10 minutes',
  criado_em  timestamptz not null default now()
);
create index if not exists encomendas_cidade_status on public.encomendas_cidade (status);
create table if not exists public.lances_encomenda (
  encomenda_id bigint not null references public.encomendas_cidade (id) on delete cascade,
  empresa   bigint not null references public.empresas (id) on delete cascade,
  preco     integer not null check (preco > 0),
  criado_em timestamptz not null default now(),
  primary key (encomenda_id, empresa)
);
alter table public.pedidos add column if not exists encomenda_id bigint references public.encomendas_cidade (id) on delete set null;
do $$
begin
  alter table public.encomendas_cidade enable row level security;
  alter table public.lances_encomenda enable row level security;
  revoke all on public.encomendas_cidade from anon, authenticated;
  revoke all on public.lances_encomenda from anon, authenticated;
end $$;

-- devolve dinheiro do depósito ao jogador ou ao caixa do clã
create or replace function public.devolver_encomenda(e encomendas_cidade, valor integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if valor <= 0 then return; end if;
  update encomendas_cidade set deposito = greatest(0, deposito - valor) where id = e.id;
  if e.cla is not null and exists (select 1 from clas where id = e.cla) then update clas set caixa = caixa + valor where id = e.cla;
  else update perfis set moedas = moedas + valor where id = e.comprador; end if;
end $$;

-- fecha leilões vencidos e devolve encomendas que passaram do prazo (chamado ao abrir o quadro e nas ações)
create or replace function public.fechar_encomendas() returns void
language plpgsql security definer set search_path = public as $$
declare e encomendas_cidade%rowtype; l lances_encomenda%rowtype; dono_v uuid;
begin
  for e in select * from encomendas_cidade where status = 'leilao' and fecha_em <= now() for update skip locked loop
    select * into l from lances_encomenda where encomenda_id = e.id order by preco, criado_em limit 1;
    if l.encomenda_id is null then
      perform devolver_encomenda(e, e.deposito);
      update encomendas_cidade set status = 'expirada' where id = e.id;
      perform avisar(e.comprador, format('Sua encomenda de %s %s não recebeu lances. Dinheiro devolvido.', e.qtd, (select nome from precos where item = e.produto)));
    else
      update encomendas_cidade set status = 'aguardando', vencedor = l.empresa, preco = l.preco where id = e.id;
      perform devolver_encomenda(e, e.deposito - l.preco * e.qtd);
      select dono into dono_v from empresas where id = l.empresa;
      perform avisar(dono_v, format('Sua fábrica venceu a encomenda #%s: %s caixas a %s cada. Envie pelo quadro de encomendas em até 24 h.', e.id, e.qtd, l.preco));
      perform avisar(e.comprador, format('Encomenda #%s fechada a %s por unidade. A fábrica tem 24 h para entregar.', e.id, l.preco));
    end if;
  end loop;
  for e in select * from encomendas_cidade where status in ('aguardando', 'entregando') and prazo <= now() for update skip locked loop
    perform devolver_encomenda(e, (e.qtd - e.entregues) * e.preco);
    update encomendas_cidade set status = case when e.entregues > 0 then 'concluida' else 'expirada' end where id = e.id;
    perform avisar(e.comprador, format('Encomenda #%s passou do prazo: %s de %s entregues, o resto foi devolvido.', e.id, e.entregues, e.qtd));
  end loop;
end $$;

create or replace function public.criar_encomenda(p_produto text, p_qtd integer, p_preco_max integer, p_cla boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c clas%rowtype; base integer; total integer; novo bigint; d uuid;
begin
  p := jogador_livre();
  select valor_base into base from mercado where produto = p_produto;
  if base is null then raise exception 'produto invalido'; end if;
  if p_qtd < 1 or p_qtd > 200 then raise exception 'quantidade invalida'; end if;
  if p_preco_max < 1 or p_preco_max > base * 4 then raise exception 'preco invalido'; end if;
  if (select count(*) from encomendas_cidade where comprador = p.id and status in ('leilao', 'aguardando', 'entregando')) >= 5 then raise exception 'limite de encomendas'; end if;
  total := p_qtd * p_preco_max;
  if p_cla then
    c := cla_do_lider();
    update clas set caixa = caixa - total where id = c.id and caixa >= total;
    if not found then raise exception 'caixa do cla sem saldo'; end if;
  else
    update perfis set moedas = moedas - total where id = p.id and moedas >= total;
    if not found then raise exception 'moedas insuficientes'; end if;
  end if;
  insert into encomendas_cidade (comprador, cla, produto, qtd, preco_max, deposito)
    values (p.id, case when p_cla then c.id end, p_produto, p_qtd, p_preco_max, total) returning id into novo;
  for d in select distinct dono from empresas where fabrica and produto = p_produto and dono <> p.id loop
    perform avisar(d, format('Nova encomenda #%s no quadro: %s caixas de %s, até %s por unidade. Lances por 10 min.', novo, p_qtd, (select nome from precos where item = p_produto), p_preco_max));
  end loop;
  return novo;
end $$;

create or replace function public.cancelar_encomenda(p_encomenda bigint) returns void
language plpgsql security definer set search_path = public as $$
declare e encomendas_cidade%rowtype;
begin
  perform jogador_livre();
  select * into e from encomendas_cidade where id = p_encomenda for update;
  if e.id is null or e.comprador <> auth.uid() then raise exception 'encomenda indisponivel'; end if;
  if e.status <> 'leilao' then raise exception 'so da para cancelar antes de fechar'; end if;
  if exists (select 1 from lances_encomenda where encomenda_id = e.id) then raise exception 'ja tem lances'; end if;
  perform devolver_encomenda(e, e.deposito);
  update encomendas_cidade set status = 'cancelada' where id = e.id;
end $$;

create or replace function public.lance_encomenda(p_encomenda bigint, p_empresa bigint, p_preco integer) returns void
language plpgsql security definer set search_path = public as $$
declare f empresas%rowtype; e encomendas_cidade%rowtype; dono_a uuid;
begin
  perform jogador_livre();
  perform fechar_encomendas();
  f := do_dono(p_empresa);
  select * into e from encomendas_cidade where id = p_encomenda for update;
  if e.id is null or e.status <> 'leilao' or e.fecha_em <= now() then raise exception 'leilao encerrado'; end if;
  if not f.fabrica or f.produto is distinct from e.produto then raise exception 'sua fabrica nao faz esse produto'; end if;
  if e.comprador = f.dono then raise exception 'nao pode dar lance na propria encomenda'; end if;
  if p_preco < 1 or p_preco > e.preco_max then raise exception 'lance fora do limite'; end if;
  -- quem tinha o menor lance fica sabendo que foi superado
  select x.dono into dono_a from lances_encomenda l join empresas x on x.id = l.empresa
    where l.encomenda_id = e.id and l.empresa <> f.id order by l.preco, l.criado_em limit 1;
  insert into lances_encomenda (encomenda_id, empresa, preco) values (e.id, f.id, p_preco)
  on conflict (encomenda_id, empresa) do update set preco = excluded.preco, criado_em = now();
  if dono_a is not null and dono_a <> f.dono and not exists (select 1 from lances_encomenda l join empresas x on x.id = l.empresa
      where l.encomenda_id = e.id and x.dono = dono_a and l.preco <= p_preco) then
    perform avisar(dono_a, format('Seu lance na encomenda #%s foi superado (%s por unidade).', e.id, p_preco));
  end if;
end $$;

