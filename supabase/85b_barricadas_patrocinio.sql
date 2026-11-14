-- 85b (parte 2 de 3) · Barricadas dos clãs, patrocinadores, loja deles e radar da PRF. Rode depois do 85a.

-- ------------------------------------------------------------ barricadas dos clãs
create table if not exists public.barricadas (
  id     bigint generated always as identity primary key,
  cla    bigint not null references public.clas (id) on delete cascade,
  x      real not null,
  z      real not null,
  ang    real not null default 0,
  vida   integer not null default 100 check (vida between 0 and 100),
  criada timestamptz not null default now()
);
do $$
begin
  alter table public.barricadas enable row level security;
  drop policy if exists ler on public.barricadas;
  create policy ler on public.barricadas for select to authenticated using (true);
  revoke all on public.barricadas from anon, authenticated;
  grant select on public.barricadas to authenticated;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'barricadas') then
    alter publication supabase_realtime add table public.barricadas;
  end if;
end $$;

create or replace function public.comprar_barricada(p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; n integer := greatest(1, least(10, coalesce(p_qtd, 1)));
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla'; end if;
  if p.moedas < 2000 * n then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 2000 * n where id = p.id;
  return dar_item(p.id, 'barricada', n);
end $$;

-- coloca onde o jogador está (até 6 por clã; somem depois de 3 h)
create or replace function public.colocar_barricada(p_x real, p_z real, p_ang real) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v_cla bigint; novo bigint;
begin
  p := jogador_livre();
  select cla into v_cla from membros_cla where jogador = p.id;
  if v_cla is null then raise exception 'so membros de cla'; end if;
  if p.barricada_em is not null and p.barricada_em > now() - interval '3 seconds' then raise exception 'aguarde'; end if;
  delete from barricadas where criada < now() - interval '3 hours';
  if (select count(*) from barricadas where cla = v_cla) >= 6 then raise exception 'seu cla ja tem 6 barricadas'; end if;
  perform dar_item(p.id, 'barricada', -1);
  update perfis set barricada_em = now() where id = p.id;
  insert into barricadas (cla, x, z, ang) values (v_cla, p_x, p_z, p_ang) returning id into novo;
  return novo;
end $$;

create or replace function public.recolher_barricada(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_cla bigint; b barricadas%rowtype;
begin
  select cla into v_cla from membros_cla where jogador = auth.uid();
  select * into b from barricadas where id = p_id for update;
  if b.id is null or b.cla is distinct from v_cla then raise exception 'essa barricada nao e do seu cla'; end if;
  delete from barricadas where id = b.id;
  if b.vida >= 50 then perform dar_item(auth.uid(), 'barricada', 1); end if;
end $$;

-- dano (Caveirão empurrando ou granada): no máximo 40 por vez, uma vez a cada 0,4 s por jogador
create or replace function public.danificar_barricada(p_id bigint, p_dano integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.barricada_em is not null and p.barricada_em > now() - interval '400 milliseconds' then return null; end if;
  update perfis set barricada_em = now() where id = p.id;
  update barricadas set vida = greatest(0, vida - greatest(1, least(40, coalesce(p_dano, 10)))) where id = p_id returning vida into v;
  if v is not null and v <= 0 then delete from barricadas where id = p_id; end if;
  return coalesce(v, 0);
end $$;

-- ------------------------------------------------------------ patrocinadores, loja deles e radar da PRF
create table if not exists public.patrocinio_estoque (
  dono  uuid not null references public.perfis (id) on delete cascade,
  item  text not null check (item in ('espingarda', 'fuzil', 'granada')),
  qtd   integer not null default 0 check (qtd >= 0),
  preco integer not null default 20000 check (preco between 100 and 5000000),
  primary key (dono, item)
);
create table if not exists public.movimentos_ilicitos (
  id      bigint generated always as identity primary key,
  jogador uuid not null references public.perfis (id) on delete cascade,
  tipo    text not null,
  valor   integer not null,
  x real, z real,
  em      timestamptz not null default now(),
  investigado boolean not null default false
);
do $$
begin
  alter table public.patrocinio_estoque enable row level security;
  drop policy if exists ler on public.patrocinio_estoque;
  create policy ler on public.patrocinio_estoque for select to authenticated using (true);
  alter table public.movimentos_ilicitos enable row level security;   -- só pelas funções
end $$;

create or replace function public.anotar_ilicito(uid uuid, p_tipo text, p_valor integer) returns void
language sql security definer set search_path = public as $$
  insert into movimentos_ilicitos (jogador, tipo, valor, x, z) select uid, p_tipo, p_valor, pos_x, pos_z from perfis where id = uid;
$$;

create or replace function public.tornar_patrocinador() returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.patrocinador then return; end if;
  if p.policial or p.prf or p.profissao = 'exercito' then raise exception 'servidor publico nao pode ser patrocinador'; end if;
  if p.moedas < 1000000 then raise exception 'precisa de 1.000.000 de moedas'; end if;
  update perfis set moedas = moedas - 100000, patrocinador = true where id = p.id;
end $$;

create or replace function public.patrocinar_cla(p_cla bigint, p_valor integer) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if not p.patrocinador then raise exception 'so patrocinadores'; end if;
  if p_valor is null or p_valor < 1000 then raise exception 'minimo de 1000'; end if;
  if p.moedas < p_valor then raise exception 'moedas insuficientes'; end if;
  if not exists (select 1 from clas where id = p_cla) then raise exception 'cla invalido'; end if;
  update perfis set moedas = moedas - p_valor where id = p.id;
  update clas set caixa = caixa + p_valor where id = p_cla;
  perform avisar((select lider from clas where id = p_cla), format('💰 Seu clã recebeu um patrocínio de %s.', p_valor));
  perform anotar_ilicito(p.id, 'patrocinio de cla', p_valor);
end $$;

-- fabricar: espingarda 8.000, fuzil 15.000, granada 2.000 (cada)
create or replace function public.fabricar_armas(p_item text, p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; custo integer; n integer := greatest(1, least(50, coalesce(p_qtd, 1))); total integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if not p.patrocinador then raise exception 'so patrocinadores'; end if;
  custo := case p_item when 'espingarda' then 8000 when 'fuzil' then 15000 when 'granada' then 2000 end;
  if custo is null then raise exception 'item invalido'; end if;
  if p.moedas < custo * n then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - custo * n where id = p.id;
  insert into patrocinio_estoque (dono, item, qtd, preco) values (p.id, p_item, n, custo * 2)
    on conflict (dono, item) do update set qtd = patrocinio_estoque.qtd + n returning qtd into total;
  perform anotar_ilicito(p.id, 'fabricou ' || p_item, custo * n);
  return total;
end $$;

create or replace function public.preco_patrocinio(p_item text, p_preco integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_preco is null or p_preco < 100 or p_preco > 5000000 then raise exception 'preco entre 100 e 5000000'; end if;
  update patrocinio_estoque set preco = p_preco where dono = auth.uid() and item = p_item;
  if not found then raise exception 'fabrique primeiro'; end if;
end $$;

-- comprar na loja de um patrocinador: só membros de clã
create or replace function public.comprar_patrocinio(p_dono uuid, p_item text, p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e patrocinio_estoque%rowtype; n integer := greatest(1, least(20, coalesce(p_qtd, 1)));
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla compram'; end if;
  if p_dono = p.id then raise exception 'o estoque e seu'; end if;
  select * into e from patrocinio_estoque where dono = p_dono and item = p_item for update;
  if e.dono is null or e.qtd < n then raise exception 'estoque insuficiente'; end if;
  if p.moedas < e.preco * n then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - e.preco * n where id = p.id;
  update perfis set moedas = moedas + e.preco * n where id = p_dono;
  update patrocinio_estoque set qtd = qtd - n where dono = p_dono and item = p_item;
  perform dar_item(p.id, p_item, n);
  perform avisar(p_dono, format('%s comprou %s %s na sua loja.', p.nome, n, p_item));
  perform anotar_ilicito(p_dono, 'vendeu ' || p_item, e.preco * n);
  return n;
end $$;

-- lojas abertas (com nome do patrocinador)
create or replace function public.lojas_patrocinio() returns table (dono uuid, nome text, item text, qtd integer, preco integer)
language sql stable security definer set search_path = public as $$
  select e.dono, p.nome, e.item, e.qtd, e.preco from patrocinio_estoque e join perfis p on p.id = e.dono
  where e.qtd > 0 and p.patrocinador and not p.banido order by p.nome, e.item;
$$;

-- radar da PRF: as movimentações das últimas 24 h, sem o nome, com a região aproximada
create or replace function public.radar_ilicito() returns table (id bigint, tipo text, valor integer, x real, z real, em timestamptz, investigado boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis where perfis.id = auth.uid() and (prf or cargo = 'admin')) then raise exception 'so a prf'; end if;
  return query select m.id, m.tipo, m.valor, (round(m.x / 60) * 60)::real, (round(m.z / 60) * 60)::real, m.em, m.investigado
    from movimentos_ilicitos m where m.em > now() - interval '24 hours' order by m.em desc limit 40;
end $$;

-- investigar: 65% de chance de achar o responsável; achado, ele vira procurado (+2 estrelas e 5.000 de recompensa)
create or replace function public.investigar_ilicito(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m movimentos_ilicitos%rowtype; alvo perfis%rowtype;
begin
  p := jogador_livre();
  if not (p.prf or p.cargo = 'admin') then raise exception 'so a prf'; end if;
  select * into m from movimentos_ilicitos where id = p_id for update;
  if m.id is null then raise exception 'movimentacao invalida'; end if;
  if m.investigado then raise exception 'ja investigada'; end if;
  update movimentos_ilicitos set investigado = true where id = m.id;
  if random() > 0.65 then return null; end if;
  select * into alvo from perfis where id = m.jogador for update;
  update perfis set crimes = least(5, crimes + 2), recompensa = recompensa + 5000 where id = alvo.id;
  update perfis set moedas = moedas + 500 where id = p.id;
  perform avisar(alvo.id, '🚨 A PRF rastreou suas movimentações ilícitas no radar: você agora é PROCURADO!');
  return alvo.nome;
end $$;


do $$
declare f text;
begin
  foreach f in array array['comprar_barricada(integer)', 'colocar_barricada(real, real, real)', 'recolher_barricada(bigint)', 'danificar_barricada(bigint, integer)', 'tornar_patrocinador()', 'patrocinar_cla(bigint, integer)', 'fabricar_armas(text, integer)', 'preco_patrocinio(text, integer)', 'comprar_patrocinio(uuid, text, integer)', 'lojas_patrocinio()', 'radar_ilicito()', 'investigar_ilicito(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.anotar_ilicito(uuid, text, integer) from public, anon, authenticated;
end $$;
