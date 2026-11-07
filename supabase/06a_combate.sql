-- Fator RP - etapa 5 (parte 1 de 2): combate, morte, marcação e roubo de carga.
-- Rode as partes em ordem, cada uma numa consulta limpa.

alter table public.perfis
  add column if not exists crimes        integer not null default 0 check (crimes >= 0),
  add column if not exists policial      boolean not null default false,
  add column if not exists servico_desde timestamptz,
  add column if not exists policia_pago  timestamptz,
  add column if not exists fianca        integer not null default 0 check (fianca >= 0),
  add column if not exists ultimo_ataque timestamptz,
  add column if not exists ultima_morte  timestamptz;

-- ------------------------------------------------------------ clãs (estrutura; regras na etapa 7)
create table if not exists public.clas (
  id        bigint generated always as identity primary key,
  nome      text not null check (char_length(nome) between 3 and 20),
  cor       text not null default '#c43b3b',
  lider     uuid not null references public.perfis (id) on delete cascade,
  caixa     integer not null default 0 check (caixa >= 0),
  robos     integer not null default 0 check (robos >= 0),
  chocolate integer not null default 0 check (chocolate >= 0),
  remedio   integer not null default 0 check (remedio >= 0),
  criado_em timestamptz not null default now()
);
create unique index if not exists clas_nome_unico on public.clas (lower(nome));
create table if not exists public.membros_cla (
  jogador uuid primary key references public.perfis (id) on delete cascade,
  cla     bigint not null references public.clas (id) on delete cascade,
  desde   timestamptz not null default now()
);

-- quem atacou quem (para saber se a morte foi em legítima defesa)
create table if not exists public.agressoes (
  atacante uuid not null references public.perfis (id) on delete cascade,
  alvo     uuid not null references public.perfis (id) on delete cascade,
  em       timestamptz not null default now(),
  primary key (atacante, alvo)
);

alter table public.caminhoes
  add column if not exists vida    integer not null default 100,
  add column if not exists escolta boolean not null default false,
  add column if not exists roubado boolean not null default false;

do $$
declare t text;
begin
  foreach t in array array['clas', 'membros_cla', 'agressoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('create policy "leitura publica" on public.%I for select using (true)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
  foreach t in array array['clas', 'membros_cla'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------ combate entre jogadores
-- o atacante registra o primeiro golpe em alguém (vale por 2 minutos)
create or replace function public.registrar_agressao(p_alvo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_alvo = auth.uid() then return; end if;
  insert into agressoes (atacante, alvo, em) values (auth.uid(), p_alvo, now())
  on conflict (atacante, alvo) do update set em = now();
end $$;

-- a vítima informa a própria morte; o banco decide moedas e marcação
create or replace function public.morrer(p_assassino uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v perfis%rowtype; k perfis%rowtype; perda integer := 0; defesa boolean;
begin
  select * into v from perfis where id = auth.uid() for update;
  if v.id is null then raise exception 'sem permissao'; end if;
  if v.ultima_morte is not null and v.ultima_morte > now() - interval '20 seconds' then return 0; end if;
  update perfis set ultima_morte = now(), carga_pedido = null, carga_em = null where id = v.id;
  if v.carga_pedido is not null then update pedidos set em_transito = greatest(0, em_transito - 1) where id = v.carga_pedido; end if;
  if p_assassino is null or p_assassino = v.id then return 0; end if;
  select * into k from perfis where id = p_assassino for update;
  if k.id is null then return 0; end if;
  -- até 100 moedas da vítima vão para quem matou
  perda := least(100, v.moedas);
  update perfis set moedas = moedas - perda where id = v.id;
  update perfis set moedas = moedas + perda where id = k.id;
  -- legítima defesa: a vítima atacou o assassino nos últimos 2 minutos, ou a vítima era procurada e o assassino é policial
  defesa := exists (select 1 from agressoes where atacante = v.id and alvo = k.id and em > now() - interval '2 minutes')
         or (k.policial and v.crimes > 0);
  if not defesa then
    -- policial que mata inocente vira fugitivo e perde o distintivo
    update perfis set crimes = crimes + 1, policial = false, servico_desde = null where id = k.id;
    perform avisar(k.id, 'Você matou um inocente e agora está PROCURADO pela polícia.');
  end if;
  delete from agressoes where (atacante = v.id and alvo = k.id) or (atacante = k.id and alvo = v.id);
  return perda;
end $$;

-- ------------------------------------------------------------ roubo de caminhão
-- cada golpe tira 10 de vida (no máximo 1 por segundo por jogador); quem zera a vida leva a carga
create or replace function public.atacar_caminhao(p_caminhao bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c caminhoes%rowtype; cla_id bigint; item text;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial then raise exception 'policial nao rouba carga'; end if;
  if p.ultimo_ataque is not null and p.ultimo_ataque > now() - interval '900 milliseconds' then return -1; end if;
  update perfis set ultimo_ataque = now() where id = p.id;
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null or c.status <> 'em_rota' or c.roubado or c.carga <= 0 then raise exception 'caminhao sem carga'; end if;
  if exists (select 1 from empresas where id = c.empresa and dono = p.id) then raise exception 'esse caminhao e seu'; end if;
  update caminhoes set vida = greatest(0, vida - 10) where id = c.id returning * into c;
  if c.vida > 0 then return c.vida; end if;
  -- roubado: a carga vai para o clã de quem roubou (ou para a mochila), o pedido perde as caixas
  item := c.rota ->> 'produto';
  select cla into cla_id from membros_cla where jogador = p.id;
  if cla_id is not null then
    execute format('update clas set %I = %I + $1 where id = $2', item, item) using c.carga, cla_id;
  else
    perform dar_item(p.id, item, c.carga);
  end if;
  update pedidos set em_transito = em_transito - c.carga, qtd = qtd - c.carga where id = c.pedido and qtd - c.carga >= 1;
  if not found then update pedidos set em_transito = 0, status = 'cancelado' where id = c.pedido; end if;
  update pedidos set status = 'concluido' where id = c.pedido and entregues >= qtd and status = 'aceito';
  update caminhoes set roubado = true, carga = 0, status = 'voltando', retorno = now() + interval '25 seconds' where id = c.id;
  update perfis set crimes = crimes + 1 where id = p.id;
  perform avisar((select dono from empresas where id = c.empresa), format('Um caminhão seu foi ROUBADO por %s!', p.nome));
  perform avisar(p.id, format('Você roubou %s caixas de %s. Agora está procurado pela polícia.', c.carga, item));
  return 0;
end $$;
