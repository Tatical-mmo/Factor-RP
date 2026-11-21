-- 137 · Viação Expresso Fator (20e): empresa de ônibus rodoviário no pátio a leste da Rodoviária da Metrópole.
--  · Para trabalhar: cadastro no escritório do pátio, com pelo menos 5 h de carreira de motorista de ônibus (o admin muda).
--  · O motorista pega um ônibus de uma vaga do pátio (ele some do pátio para todos), busca os passageiros numa cidade,
--    leva até outra sem paradas, recebe o pagamento e devolve o ônibus vazio na mesma vaga.
--  · A empresa também vende os ônibus (vão para os veículos do jogador). Salário, preços, experiência e quais
--    ônibus ficam em cada vaga: o admin ajusta no painel (aba Eu).
-- Rode depois do 136.

-- os 4 modelos novos podem ser carros de jogador
alter table public.carros drop constraint if exists carros_modelo_check;
alter table public.carros add constraint carros_modelo_check
  check (modelo in ('popular', 'suv', 'esportivo', 'presidencial', 'helicoptero', 'classico', 'saveiro', 'saveiro_som',
                    'onibus_rod_dourado', 'onibus_rod_vermelho', 'onibus_rod_branco', 'onibus_rod_amarelo'));

create table if not exists public.viacao_config (
  id          integer primary key default 1 check (id = 1),
  salario     integer not null default 2500,                 -- por viagem completa
  exp_min     integer not null default 300,                  -- minutos de carreira de motorista de ônibus
  precos      jsonb not null default '{"onibus_rod_dourado": 420000, "onibus_rod_vermelho": 360000, "onibus_rod_branco": 300000, "onibus_rod_amarelo": 400000}'::jsonb,
  vagas       jsonb not null default '["onibus_rod_dourado", "onibus_rod_amarelo", "onibus_rod_vermelho", "onibus_rod_branco", "onibus_rod_dourado", "onibus_rod_amarelo", "onibus_rod_vermelho"]'::jsonb   -- modelo em cada uma das 7 vagas ('' = vazia)
);
insert into public.viacao_config (id) values (1) on conflict (id) do nothing;
alter table public.viacao_config enable row level security;
revoke all on public.viacao_config from anon, authenticated;

create table if not exists public.viacao_motoristas (
  jogador uuid primary key references public.perfis (id) on delete cascade,
  desde   timestamptz not null default now(),
  viagens integer not null default 0
);
alter table public.viacao_motoristas enable row level security;
revoke all on public.viacao_motoristas from anon, authenticated;

-- ônibus fora do pátio (em viagem): vaga, motorista e a viagem
create table if not exists public.viacao_uso (
  vaga     integer primary key,
  jogador  uuid not null unique references public.perfis (id) on delete cascade,
  modelo   text not null,
  origem   integer not null,      -- 0 Metrópole, 1 Vila Serra, 2 Porto Sul
  destino  integer not null,
  pass     integer not null,
  fase     text not null default 'buscar' check (fase in ('buscar', 'levar', 'voltar')),
  desde    timestamptz not null default now()
);
alter table public.viacao_uso enable row level security;
revoke all on public.viacao_uso from anon, authenticated;

-- pontos de embarque (o mesmo do jogo) e o pátio (para conferir onde o motorista está)
create or replace function public.viacao_ponto(i integer, out x real, out z real) language sql immutable as $$
  select (array[135, 69, 69])[i + 1]::real, (array[-230, -931, 931])[i + 1]::real;
$$;
create or replace function public.viacao_vaga(i integer, out x real, out z real) language sql immutable as $$
  select (292 + i * 3.85)::real, (-254)::real;
$$;
create or replace function public.viacao_limpar() returns void language sql security definer set search_path = public as $$
  delete from viacao_uso where desde < now() - interval '90 minutes';   -- abandonado: volta para o pátio
$$;

create or replace function public.viacao_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c viacao_config%rowtype; u viacao_uso%rowtype; min integer;
begin
  perform viacao_limpar();
  select * into c from viacao_config where id = 1;
  select * into u from viacao_uso where jogador = auth.uid();
  select coalesce(minutos, 0) into min from carreiras where jogador = auth.uid() and carreira = 'motorista';
  return jsonb_build_object('salario', c.salario, 'exp_min', c.exp_min, 'precos', c.precos, 'vagas', c.vagas,
    'em_uso', (select coalesce(jsonb_agg(vaga), '[]'::jsonb) from viacao_uso),
    'motorista', exists (select 1 from viacao_motoristas where jogador = auth.uid()),
    'viagens', (select viagens from viacao_motoristas where jogador = auth.uid()),
    'minutos', coalesce(min, 0),
    'minha', case when u.vaga is null then null else to_jsonb(u) - 'jogador' end);
end $$;

create or replace function public.viacao_cadastrar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c viacao_config%rowtype; min integer;
begin
  p := jogador_livre();
  select * into c from viacao_config where id = 1;
  select coalesce(minutos, 0) into min from carreiras where jogador = p.id and carreira = 'motorista';
  if coalesce(min, 0) < c.exp_min and p.cargo <> 'admin' then raise exception 'pouca experiencia de motorista'; end if;
  insert into viacao_motoristas (jogador) values (p.id) on conflict do nothing;
  return viacao_estado();
end $$;

create or replace function public.viacao_sair() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from viacao_uso where jogador = auth.uid();
  delete from viacao_motoristas where jogador = auth.uid();
end $$;

-- pega o ônibus da vaga (do lado dele) e recebe a viagem sorteada
create or replace function public.viacao_pegar(p_vaga integer, p_x real, p_z real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c viacao_config%rowtype; v record; mod text; o integer; d integer;
begin
  p := jogador_livre(); perform viacao_limpar();
  if not exists (select 1 from viacao_motoristas where jogador = p.id) then raise exception 'faca o cadastro no escritorio'; end if;
  if exists (select 1 from viacao_uso where jogador = p.id) then raise exception 'voce ja tem um onibus da viacao'; end if;
  select * into c from viacao_config where id = 1;
  if p_vaga < 0 or p_vaga >= jsonb_array_length(c.vagas) then raise exception 'vaga invalida'; end if;
  mod := c.vagas ->> p_vaga;
  if coalesce(mod, '') = '' then raise exception 'vaga vazia'; end if;
  if exists (select 1 from viacao_uso where vaga = p_vaga) then raise exception 'esse onibus esta em viagem'; end if;
  select * into v from viacao_vaga(p_vaga);
  if sqrt((v.x - p_x) ^ 2 + (v.z - p_z) ^ 2) > 12 then raise exception 'chegue perto do onibus'; end if;
  o := floor(random() * 3)::integer; d := (o + 1 + floor(random() * 2)::integer) % 3;
  insert into viacao_uso (vaga, jogador, modelo, origem, destino, pass) values (p_vaga, p.id, mod, o, d, 18 + floor(random() * 23)::integer);
  return viacao_estado();
end $$;

-- passageiros embarcam no ponto de origem
create or replace function public.viacao_embarcar(p_x real, p_z real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u viacao_uso%rowtype; pt record;
begin
  select * into u from viacao_uso where jogador = auth.uid() for update;
  if u.vaga is null or u.fase <> 'buscar' then raise exception 'nenhum embarque agora'; end if;
  select * into pt from viacao_ponto(u.origem);
  if sqrt((pt.x - p_x) ^ 2 + (pt.z - p_z) ^ 2) > 22 then raise exception 'pare no ponto de embarque'; end if;
  update viacao_uso set fase = 'levar' where vaga = u.vaga;
  return viacao_estado();
end $$;

-- chegou ao destino: desembarque e pagamento
create or replace function public.viacao_desembarcar(p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare u viacao_uso%rowtype; pt record; c viacao_config%rowtype;
begin
  select * into u from viacao_uso where jogador = auth.uid() for update;
  if u.vaga is null or u.fase <> 'levar' then raise exception 'nenhum desembarque agora'; end if;
  if u.desde > now() - interval '50 seconds' then raise exception 'viagem rapida demais'; end if;
  select * into pt from viacao_ponto(u.destino);
  if sqrt((pt.x - p_x) ^ 2 + (pt.z - p_z) ^ 2) > 22 then raise exception 'pare no ponto de desembarque'; end if;
  select * into c from viacao_config where id = 1;
  update viacao_uso set fase = 'voltar' where vaga = u.vaga;
  update perfis set moedas = moedas + c.salario where id = auth.uid();
  update viacao_motoristas set viagens = viagens + 1 where jogador = auth.uid();
  perform registrar(auth.uid(), 'viacao_viagem', jsonb_build_object('de', u.origem, 'para', u.destino, 'pass', u.pass, 'pago', c.salario));
  return c.salario;
end $$;

-- devolve o ônibus na mesma vaga (ou desiste da viagem: o ônibus volta sozinho, sem pagamento)
create or replace function public.viacao_devolver(p_x real, p_z real, p_desistir boolean) returns void
language plpgsql security definer set search_path = public as $$
declare u viacao_uso%rowtype; v record;
begin
  select * into u from viacao_uso where jogador = auth.uid() for update;
  if u.vaga is null then return; end if;
  if not p_desistir then
    select * into v from viacao_vaga(u.vaga);
    if sqrt((v.x - p_x) ^ 2 + (v.z - p_z) ^ 2) > 9 then raise exception 'estacione na vaga do onibus'; end if;
  end if;
  delete from viacao_uso where vaga = u.vaga;
end $$;

-- comprar um ônibus: vai para os veículos do jogador, na saída do pátio
create or replace function public.viacao_comprar(p_modelo text) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; preco integer; n integer; novo bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  select (precos ->> p_modelo)::integer into preco from viacao_config where id = 1;
  if preco is null or preco <= 0 then raise exception 'modelo invalido'; end if;
  select count(*) into n from carros where dono = p.id and modelo <> 'presidencial';
  if n >= 10 then raise exception 'limite de 10 carros'; end if;
  if p.moedas < preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - preco where id = p.id;
  insert into carros (dono, modelo, cor, x, z, ang) values (p.id, p_modelo, '#ffffff', 309, -213.5, -pi() / 2) returning id into novo;
  return novo;
end $$;

-- vender continua devolvendo a metade; ônibus da viação usam o preço da viação
create or replace function public.vender_carro(p_carro bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare c carros%rowtype; valor integer;
begin
  select * into c from carros where id = p_carro and dono = auth.uid() for update;
  if c.id is null or c.modelo = 'presidencial' then raise exception 'esse carro nao e seu'; end if;
  valor := coalesce(preco_carro(c.modelo), (select (precos ->> c.modelo)::integer from viacao_config where id = 1), 0) / 2;
  delete from carros where id = c.id;
  update perfis set moedas = moedas + valor where id = auth.uid();
  return valor;
end $$;

-- admin: salário, experiência mínima (minutos), preços e o modelo de cada vaga
create or replace function public.admin_viacao(p_cfg jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  update viacao_config set
    salario = coalesce(greatest(0, least(1000000, (p_cfg ->> 'salario')::integer)), salario),
    exp_min = coalesce(greatest(0, least(100000, (p_cfg ->> 'exp_min')::integer)), exp_min),
    precos  = case when jsonb_typeof(p_cfg -> 'precos') = 'object' then p_cfg -> 'precos' else precos end,
    vagas   = case when jsonb_typeof(p_cfg -> 'vagas') = 'array' and jsonb_array_length(p_cfg -> 'vagas') = 7 then p_cfg -> 'vagas' else vagas end
  where id = 1;
  return viacao_estado();
end $$;

do $$
declare f text;
begin
  foreach f in array array['viacao_estado()', 'viacao_cadastrar()', 'viacao_sair()', 'viacao_pegar(integer, real, real)', 'viacao_embarcar(real, real)',
    'viacao_desembarcar(real, real)', 'viacao_devolver(real, real, boolean)', 'viacao_comprar(text)', 'vender_carro(bigint)', 'admin_viacao(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.viacao_limpar() from public, anon, authenticated;
notify pgrst, 'reload schema';
