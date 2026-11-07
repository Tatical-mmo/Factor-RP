-- Fator RP - etapa 3: trabalho, produção, loja, mochila e fome
-- Cole tudo no Supabase em SQL Editor > New query e toque em Run.

-- ------------------------------------------------------------ colunas novas no perfil
alter table public.perfis
  add column if not exists fome            real not null default 100 check (fome >= 0 and fome <= 100),
  add column if not exists ultima_coleta   timestamptz,
  add column if not exists ultima_entrega  timestamptz,
  add column if not exists embalando       text,
  add column if not exists embalando_em    timestamptz;

-- a fome diminui no jogo e é salva junto com a posição
grant update (pos_x, pos_z, visto_em, fome) on public.perfis to authenticated;

-- ------------------------------------------------------------ preços da loja
create table if not exists public.precos (
  item   text primary key,
  nome   text not null,
  compra integer,          -- quanto o jogador paga na loja (null = a loja não vende)
  venda  integer,          -- quanto a loja paga ao jogador (null = a loja não compra)
  fome   integer not null default 0   -- quanto enche a barra de fome ao comer
);
insert into public.precos (item, nome, compra, venda, fome) values
  ('sucata',    'Sucata',    null, 15,  0),
  ('chocolate', 'Chocolate', 100,  40,  60),
  ('cereal',    'Cereal',    60,   20,  35),
  ('remedio',   'Remédio',   300,  120, 0)
on conflict (item) do update set nome = excluded.nome, compra = excluded.compra, venda = excluded.venda, fome = excluded.fome;

alter table public.precos enable row level security;
drop policy if exists "todos leem precos" on public.precos;
create policy "todos leem precos" on public.precos for select using (true);
revoke all on public.precos from anon, authenticated;
grant select on public.precos to anon, authenticated;

-- ------------------------------------------------------------ mochila (inventário)
create table if not exists public.inventario (
  dono uuid not null references public.perfis (id) on delete cascade,
  item text not null references public.precos (item),
  qtd  integer not null check (qtd >= 0),
  primary key (dono, item)
);
alter table public.inventario enable row level security;
drop policy if exists "ve a propria mochila" on public.inventario;
create policy "ve a propria mochila" on public.inventario for select to authenticated using (dono = auth.uid());
revoke all on public.inventario from anon, authenticated;
grant select on public.inventario to authenticated;

-- ------------------------------------------------------------ regras do trabalho
-- valores em um lugar só para ajustar a economia depois
create or replace function public.regra(nome text) returns integer
language sql immutable as $$
  select case nome
    when 'pagamento_entrega'   then 20    -- moedas por caixa entregue na doca
    when 'intervalo_entrega'   then 50    -- segundos mínimos entre entregas
    when 'tempo_minimo_levar'  then 12    -- segundos mínimos entre embalar e entregar
    when 'intervalo_coleta'    then 40    -- segundos mínimos entre coletas de sucata
    when 'limite_sucata'       then 20    -- máximo de sucata na mochila
    when 'limite_item'         then 50    -- máximo de cada item na mochila
  end;
$$;

create or replace function public.dar_item(uid uuid, nome_item text, quantidade integer) returns integer
language plpgsql security definer set search_path = public as $$
declare novo integer;
begin
  if quantidade < 0 then
    update inventario set qtd = qtd + quantidade
    where dono = uid and item = nome_item and qtd >= -quantidade
    returning qtd into novo;
    if novo is null then raise exception 'itens insuficientes'; end if;
    return novo;
  end if;
  insert into inventario (dono, item, qtd) values (uid, nome_item, quantidade)
  on conflict (dono, item) do update set qtd = inventario.qtd + quantidade
  returning qtd into novo;
  return novo;
end $$;

-- coleta de sucata no ferro-velho
create or replace function public.coletar_sucata() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; atual integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p.algemado or p.pena_seg > 0 then raise exception 'voce esta preso'; end if;
  if p.ultima_coleta is not null and p.ultima_coleta > now() - make_interval(secs => regra('intervalo_coleta')) then
    raise exception 'aguarde % s', ceil(extract(epoch from (p.ultima_coleta + make_interval(secs => regra('intervalo_coleta')) - now())));
  end if;
  select coalesce(qtd, 0) into atual from inventario where dono = p.id and item = 'sucata';
  if coalesce(atual, 0) >= regra('limite_sucata') then raise exception 'mochila cheia de sucata'; end if;
  update perfis set ultima_coleta = now() where id = p.id;
  return dar_item(p.id, 'sucata', 1);
end $$;

-- começa a embalar uma caixa na bancada da empresa
create or replace function public.iniciar_embalagem(produto text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  if produto not in ('chocolate', 'remedio') then raise exception 'produto invalido'; end if;
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p.algemado or p.pena_seg > 0 then raise exception 'voce esta preso'; end if;
  update perfis set embalando = produto, embalando_em = now() where id = p.id;
end $$;

-- entrega a caixa embalada na doca da transportadora
create or replace function public.entregar_pacote() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; pago integer := regra('pagamento_entrega');
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p.embalando is null then raise exception 'nenhuma caixa embalada'; end if;
  if p.embalando_em > now() - make_interval(secs => regra('tempo_minimo_levar')) then raise exception 'entrega rapida demais'; end if;
  if p.ultima_entrega is not null and p.ultima_entrega > now() - make_interval(secs => regra('intervalo_entrega')) then
    raise exception 'aguarde % s', ceil(extract(epoch from (p.ultima_entrega + make_interval(secs => regra('intervalo_entrega')) - now())));
  end if;
  update perfis set moedas = moedas + pago, ultima_entrega = now(), embalando = null, embalando_em = null where id = p.id;
  return pago;
end $$;

-- loja: comprar
create or replace function public.comprar(nome_item text, quantidade integer) returns void
language plpgsql security definer set search_path = public as $$
declare preco integer; p perfis%rowtype; atual integer;
begin
  if quantidade < 1 or quantidade > 20 then raise exception 'quantidade invalida'; end if;
  select compra into preco from precos where item = nome_item;
  if preco is null then raise exception 'a loja nao vende esse item'; end if;
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p.moedas < preco * quantidade then raise exception 'moedas insuficientes'; end if;
  select coalesce(qtd, 0) into atual from inventario where dono = p.id and item = nome_item;
  if coalesce(atual, 0) + quantidade > regra('limite_item') then raise exception 'mochila cheia'; end if;
  update perfis set moedas = moedas - preco * quantidade where id = p.id;
  perform dar_item(p.id, nome_item, quantidade);
end $$;

-- loja: vender
create or replace function public.vender(nome_item text, quantidade integer) returns integer
language plpgsql security definer set search_path = public as $$
declare preco integer; p perfis%rowtype;
begin
  if quantidade < 1 or quantidade > 100 then raise exception 'quantidade invalida'; end if;
  select venda into preco from precos where item = nome_item;
  if preco is null then raise exception 'a loja nao compra esse item'; end if;
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  perform dar_item(p.id, nome_item, -quantidade);
  update perfis set moedas = moedas + preco * quantidade where id = p.id;
  return preco * quantidade;
end $$;

-- comer da mochila
create or replace function public.consumir(nome_item text) returns real
language plpgsql security definer set search_path = public as $$
declare enche integer; nova real;
begin
  select fome into enche from precos where item = nome_item;
  if coalesce(enche, 0) <= 0 then raise exception 'isso nao se come'; end if;
  perform dar_item(auth.uid(), nome_item, -1);
  update perfis set fome = least(100, fome + enche) where id = auth.uid() returning fome into nova;
  return nova;
end $$;

-- ------------------------------------------------------------ permissões
do $$
declare f text;
begin
  foreach f in array array['coletar_sucata()', 'iniciar_embalagem(text)', 'entregar_pacote()',
                           'comprar(text, integer)', 'vender(text, integer)', 'consumir(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.dar_item(uuid, text, integer) from public, anon, authenticated';
  execute 'revoke all on function public.regra(text) from anon';
end $$;

-- mochila em tempo real
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'inventario') then
    alter publication supabase_realtime add table public.inventario;
  end if;
end $$;
