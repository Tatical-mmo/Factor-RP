-- Fator RP - prefeitura (parte 3 de 3): outdoors, salário da polícia, residência oficial e carros.
-- Carros: popular 12.000, SUV 30.000, esportivo 55.000 (até 3 por jogador). O presidencial é do prefeito.

-- outdoors: 40 moedas por minuto (10 min a 4 h), para candidatos ou empresas; o dinheiro vai para o cofre
create or replace function public.alugar_outdoor(p_outdoor integer, p_minutos integer, p_tipo text, p_empresa bigint, p_texto text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; o outdoors%rowtype; v_titulo text; custo integer; fim timestamptz;
begin
  p := jogador_livre();
  select * into o from outdoors where id = p_outdoor for update;
  if o.id is null then raise exception 'outdoor invalido'; end if;
  if p_minutos < 10 or p_minutos > 240 then raise exception 'de 10 a 240 minutos'; end if;
  if o.ate > now() and o.anunciante is distinct from p.id then raise exception 'outdoor ocupado'; end if;
  if p_tipo = 'candidato' then
    if not exists (select 1 from candidatos where mandato = mandato_em_campanha() and jogador = p.id) then raise exception 'so candidatos em campanha'; end if;
    v_titulo := 'Vote em ' || p.nome;
  elsif p_tipo = 'empresa' then
    select nome into v_titulo from empresas where id = p_empresa and dono = p.id;
    if v_titulo is null then raise exception 'empresa invalida'; end if;
  else raise exception 'tipo invalido'; end if;
  custo := 40 * p_minutos;
  update perfis set moedas = moedas - custo where id = p.id and moedas >= custo;
  if not found then raise exception 'moedas insuficientes'; end if;
  update prefeitura set cofre = cofre + custo where id = 1;
  fim := greatest(coalesce(o.ate, now()), now()) + make_interval(mins => p_minutos);
  update outdoors set anunciante = p.id, titulo = v_titulo, texto = left(coalesce(btrim(p_texto), ''), 50), tipo = p_tipo, ate = fim where id = o.id;
  return fim;
end $$;


-- o prefeito controla o salário da polícia (de 50 a 250 a cada 3 min de serviço)
create or replace function public.definir_salario_policia(p_valor integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select prefeito from prefeitura where id = 1) is distinct from auth.uid() then raise exception 'voce nao e o prefeito'; end if;
  if p_valor < 50 or p_valor > 250 then raise exception 'salario entre 50 e 250'; end if;
  update prefeitura set salario_policia = p_valor where id = 1;
end $$;
create or replace function public.receber_salario_policia() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; blocos integer; valor integer := (select salario_policia from prefeitura where id = 1);
begin
  select * into p from perfis where id = auth.uid() for update;
  if not p.policial or p.policia_pago is null then return 0; end if;
  blocos := least(10, floor(extract(epoch from (now() - p.policia_pago)) / 180))::integer;
  if blocos <= 0 then return 0; end if;
  update perfis set moedas = moedas + blocos * valor,
    policia_pago = greatest(p.policia_pago, now() - interval '30 minutes') + make_interval(secs => blocos * 180)
  where id = p.id;
  return blocos * valor;
end $$;


create or replace function public.comprar_casa(p_casa integer) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c casas%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if total_moradias(p.id) >= 3 then raise exception 'limite de 3 moradias'; end if;
  select * into c from casas where id = p_casa for update;
  if c.id is null or c.tipo in ('unidade', 'oficial') then raise exception 'casa invalida'; end if;
  if c.dono is not null then raise exception 'casa ja vendida'; end if;
  if p.moedas < c.preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - c.preco where id = p.id;
  update casas set dono = p.id where id = c.id;
end $$;

create or replace function public.vender_casa(p_casa integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c casas%rowtype; valor integer; k integer;
begin
  select * into c from casas where id = p_casa and dono = auth.uid() for update;
  if c.id is null then raise exception 'essa moradia nao e sua'; end if;
  if c.tipo = 'oficial' then raise exception 'a residencia oficial e do cargo: para sair, renuncie'; end if;
  if c.tipo = 'terreno' and exists (select 1 from casas where pai = c.id and (dono is not null or (inquilino is not null and pago_ate > now()))) then
    raise exception 'ha apartamentos vendidos ou alugados neste predio';
  end if;
  perform devolver_bau(c.id, auth.uid());
  if c.tipo = 'unidade' then
    valor := c.preco / 2;                                        -- unidade comprada volta para o prédio
    update casas set dono = null, a_venda = false, preco = 0 where id = c.id;
  else
    valor := case c.tipo when 'apto' then 8000 when 'terreno' then 6000 + coalesce(preco_modelo(c.modelo), 0) / 2 else 20000 end;
    if c.tipo = 'terreno' then for k in 1..c.nivel - 1 loop valor := valor + imovel(k, 'evoluir') / 2; end loop; end if;
    delete from casas where pai = c.id;
    update casas set dono = null, modelo = null, nivel = 1 where id = c.id;
  end if;
  update perfis set moedas = moedas + valor where id = auth.uid();
  return valor;
end $$;


insert into public.carros (dono, modelo, cor, x, z, ang)
  select null, 'presidencial', '#111111', -150, -119, 0 where not exists (select 1 from carros where modelo = 'presidencial');

alter table public.carros enable row level security;
drop policy if exists "leitura publica" on public.carros;
create policy "leitura publica" on public.carros for select using (true);
revoke all on public.carros from anon, authenticated;
grant select on public.carros to anon, authenticated;

create or replace function public.preco_carro(m text) returns integer language sql immutable as $$
  select case m when 'popular' then 12000 when 'suv' then 30000 when 'esportivo' then 55000 end;
$$;

create or replace function public.comprar_carro(p_modelo text, p_cor text) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; preco integer := preco_carro(p_modelo); n integer; novo bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if preco is null then raise exception 'modelo invalido'; end if;
  if coalesce(p_cor, '') !~ '^#[0-9a-fA-F]{6}$' then p_cor := '#c0392b'; end if;
  select count(*) into n from carros where dono = p.id and modelo <> 'presidencial';
  if n >= 3 then raise exception 'limite de 3 carros'; end if;
  if p.moedas < preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - preco where id = p.id;
  insert into carros (dono, modelo, cor, x, z, ang) values (p.id, p_modelo, p_cor, 120 + (n % 5) * 7 + (random() * 2)::real, -119, 0)
    returning id into novo;
  return novo;
end $$;

-- estaciona onde o jogador desceu (dentro da metrópole)
create or replace function public.estacionar_carro(p_carro bigint, p_x real, p_z real, p_ang real) returns void
language plpgsql security definer set search_path = public as $$
begin
  update carros set x = greatest(-430, least(430, p_x)), z = greatest(-430, least(430, p_z)), ang = p_ang
    where id = p_carro and dono = auth.uid();
  if not found then raise exception 'esse carro nao e seu'; end if;
end $$;

create or replace function public.vender_carro(p_carro bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare c carros%rowtype; valor integer;
begin
  select * into c from carros where id = p_carro and dono = auth.uid() for update;
  if c.id is null or c.modelo = 'presidencial' then raise exception 'esse carro nao e seu'; end if;
  valor := preco_carro(c.modelo) / 2;
  delete from carros where id = c.id;
  update perfis set moedas = moedas + valor where id = auth.uid();
  return valor;
end $$;

do $$
declare f text;
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'carros') then
    alter publication supabase_realtime add table public.carros;
  end if;
  foreach f in array array['alugar_outdoor(integer, integer, text, bigint, text)', 'definir_salario_policia(integer)', 'receber_salario_policia()',
    'comprar_casa(integer)', 'vender_casa(integer)', 'comprar_carro(text, text)', 'estacionar_carro(bigint, real, real, real)', 'vender_carro(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
