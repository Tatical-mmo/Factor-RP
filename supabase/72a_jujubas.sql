-- 72a · Jujubas (ração militar): efeito, armazéns das corporações, pedidos e licitação do transporte.
-- Efeito (5 min): +10% de velocidade, soco mais forte e +20% de vida aos poucos (o jogo faz a conta; aqui só a validade).
-- Polícia, PRF e Bombeiros: armazém de até 10.000. Cada membro pega 5 por vez (espera de 5 min).
-- Estoque baixo: qualquer membro pede reposição; o Exército vê tudo e despacha (72b).
-- Licitação: transportadoras nível 5+ dão lance; ganha o menor. O valor é pago na hora (sai do sistema).
-- O contrato vale 5 caminhões; depois abre outra licitação. Cada caminhão paga o valor atual (50.000, o admin muda).

insert into public.precos (item, nome, compra, venda, fome) values ('jujuba', 'Jujuba (ração militar)', null, null, 0)
  on conflict (item) do nothing;
alter table public.perfis add column if not exists jujuba_ate   timestamptz;
alter table public.perfis add column if not exists jujuba_pegou timestamptz;

create table if not exists public.jujuba_armazens (
  corp    text primary key check (corp in ('policia', 'prf', 'bombeiros')),
  estoque integer not null default 10000 check (estoque between 0 and 10000)
);
insert into public.jujuba_armazens (corp) values ('policia'), ('prf'), ('bombeiros') on conflict do nothing;

create table if not exists public.jujuba_config (
  id integer primary key default 1 check (id = 1),
  valor_caminhao integer not null default 50000,
  mudou_em timestamptz not null default now()
);
insert into public.jujuba_config (id) values (1) on conflict do nothing;

create table if not exists public.jujuba_pedidos (
  id        bigint generated always as identity primary key,
  corp      text not null references public.jujuba_armazens (corp),
  status    text not null default 'aberto' check (status in ('aberto', 'despachado', 'entregue')),
  pedido_por uuid references public.perfis (id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.licitacoes (
  id       bigint generated always as identity primary key,
  status   text not null default 'aberta' check (status in ('aberta', 'vigente', 'encerrada')),
  abre_em  timestamptz not null default now(),
  fecha_em timestamptz not null default now() + interval '10 minutes',
  empresa  bigint references public.empresas (id) on delete set null,
  valor    integer,
  entregas integer not null default 0
);
create table if not exists public.licitacao_lances (
  licitacao bigint not null references public.licitacoes (id) on delete cascade,
  empresa   bigint not null references public.empresas (id) on delete cascade,
  valor     integer not null check (valor between 10000 and 5000000),
  em        timestamptz not null default now(),
  primary key (licitacao, empresa)
);

do $$
declare t text;
begin
  foreach t in array array['jujuba_armazens', 'jujuba_config', 'jujuba_pedidos', 'licitacoes', 'licitacao_lances'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ler on public.%I', t);
    execute format('create policy ler on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- a corporação de quem está em serviço (null = nenhuma)
create or replace function public.corp_de(p perfis) returns text
language sql stable set search_path = public as $$
  select case when p.prf then 'prf' when p.policial then 'policia' when p.profissao = 'bombeiro' then 'bombeiros' end;
$$;

create or replace function public.pegar_jujubas() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c text; n integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  c := corp_de(p);
  if c is null then raise exception 'so policia prf e bombeiros'; end if;
  if p.jujuba_pegou is not null and p.jujuba_pegou > now() - interval '5 minutes' then raise exception 'aguarde para pegar jujubas'; end if;
  select least(5, estoque) into n from jujuba_armazens where corp = c for update;
  if coalesce(n, 0) <= 0 then raise exception 'armazem vazio'; end if;
  update jujuba_armazens set estoque = estoque - n where corp = c;
  update perfis set jujuba_pegou = now() where id = p.id;
  perform dar_item(p.id, 'jujuba', n);
  return n;
end $$;

create or replace function public.usar_jujuba() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; ate timestamptz;
begin
  p := jogador_livre();
  if p.jujuba_ate is not null and p.jujuba_ate > now() then raise exception 'a racao ainda esta fazendo efeito'; end if;
  perform dar_item(p.id, 'jujuba', -1);
  ate := now() + interval '5 minutes';
  update perfis set jujuba_ate = ate where id = p.id;
  return ate;
end $$;

create or replace function public.pedir_jujubas() returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c text; novo bigint;
begin
  p := jogador_livre();
  c := corp_de(p);
  if c is null then raise exception 'so policia prf e bombeiros'; end if;
  if exists (select 1 from jujuba_pedidos where corp = c and status in ('aberto', 'despachado')) then raise exception 'ja existe um pedido'; end if;
  if (select estoque from jujuba_armazens where corp = c) >= 10000 then raise exception 'armazem cheio'; end if;
  insert into jujuba_pedidos (corp, pedido_por) values (c, p.id) returning id into novo;
  return novo;
end $$;

-- lance na licitação (dono de transportadora nível 5+); se não houver licitação aberta, abre uma
create or replace function public.dar_lance(p_empresa bigint, p_valor integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e empresas%rowtype; l licitacoes%rowtype;
begin
  p := jogador_livre();
  select * into e from empresas where id = p_empresa;
  if e.id is null or e.dono <> p.id then raise exception 'empresa invalida'; end if;
  if e.tipo <> 'transportadora' then raise exception 'so transportadoras'; end if;
  if e.nivel < 5 then raise exception 'precisa nivel 5'; end if;
  if p_valor not between 10000 and 5000000 then raise exception 'lance invalido'; end if;
  select * into l from licitacoes where status = 'aberta' order by id desc limit 1;
  if l.id is null then
    if exists (select 1 from licitacoes where status = 'vigente') then raise exception 'contrato em andamento'; end if;
    insert into licitacoes default values returning * into l;
  end if;
  insert into licitacao_lances (licitacao, empresa, valor) values (l.id, e.id, p_valor)
    on conflict (licitacao, empresa) do update set valor = excluded.valor, em = now();
  return l.id;
end $$;

-- administrador muda o valor pago por caminhão (aparece na placa do quartel)
create or replace function public.valor_caminhao_jujuba(p_valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = auth.uid();
  if p.cargo <> 'admin' then raise exception 'sem permissao'; end if;
  if p_valor not between 1000 and 1000000 then raise exception 'valor invalido'; end if;
  update jujuba_config set valor_caminhao = p_valor, mudou_em = now() where id = 1;
  return p_valor;
end $$;

do $$
declare f text;
begin
  foreach f in array array['pegar_jujubas()', 'usar_jujuba()', 'pedir_jujubas()', 'dar_lance(bigint, integer)', 'valor_caminhao_jujuba(integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.corp_de(perfis) from public, anon;
end $$;
