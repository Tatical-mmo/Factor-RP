-- 114: oficinas dos jogadores. 8 terrenos fixos no mapa (placa "à venda"); o jogador compra um por 150.000
-- (um por jogador), dá o nome, define os preços (70% a 200% da tabela, por serviço) e fica com o lucro:
-- cada serviço paga as peças (50% da tabela) e o resto entra no caixa da oficina.
-- Evolução: nível 1 (pintura e motor 1, carro fica 2 min), nível 2 (+ motor 2 e blindagem, 1 min) por 100.000,
-- nível 3 (+ motor 3, serviço na hora, galpão premium) por 250.000.
-- Rode depois do 113.

create table if not exists public.oficinas_jogadores (
  terreno    smallint primary key check (terreno between 1 and 8),
  dono       uuid not null unique references public.perfis (id) on delete cascade,
  nome       text not null check (char_length(nome) between 3 and 24),
  nivel      smallint not null default 1 check (nivel between 1 and 3),
  caixa      integer not null default 0 check (caixa >= 0),
  pct_pintura   smallint not null default 100 check (pct_pintura between 70 and 200),
  pct_motor     smallint not null default 100 check (pct_motor between 70 and 200),
  pct_blindagem smallint not null default 100 check (pct_blindagem between 70 and 200),
  servicos   integer not null default 0,
  criada_em  timestamptz not null default now()
);
alter table public.oficinas_jogadores enable row level security;
drop policy if exists "leitura publica" on public.oficinas_jogadores;
create policy "leitura publica" on public.oficinas_jogadores for select using (true);
do $$ begin
  begin alter publication supabase_realtime add table public.oficinas_jogadores; exception when others then null; end;
end $$;

create or replace function public.comprar_oficina(p_terreno integer, p_nome text) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; n text := btrim(coalesce(p_nome, ''));
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p_terreno not between 1 and 8 then raise exception 'terreno invalido'; end if;
  if exists (select 1 from oficinas_jogadores where terreno = p_terreno) then raise exception 'terreno ja vendido'; end if;
  if exists (select 1 from oficinas_jogadores where dono = p.id) then raise exception 'voce ja tem uma oficina'; end if;
  if n !~ '^[[:alnum:] _.&''-]{3,24}$' then raise exception 'nome invalido'; end if;
  if exists (select 1 from oficinas_jogadores where lower(nome) = lower(n)) then raise exception 'nome de oficina em uso'; end if;
  if p.moedas < 150000 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 150000 where id = p.id;
  insert into oficinas_jogadores (terreno, dono, nome) values (p_terreno, p.id, n);
  return p_terreno;
end $$;

create or replace function public.evoluir_oficina() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; o oficinas_jogadores%rowtype; custo integer;
begin
  p := jogador_livre();
  select * into o from oficinas_jogadores where dono = p.id for update;
  if o.terreno is null then raise exception 'voce nao tem oficina'; end if;
  if o.nivel >= 3 then raise exception 'oficina no nivel maximo'; end if;
  custo := case o.nivel when 1 then 100000 else 250000 end;
  update perfis set moedas = moedas - custo where id = p.id and moedas >= custo;
  if not found then raise exception 'moedas insuficientes'; end if;
  update oficinas_jogadores set nivel = nivel + 1 where terreno = o.terreno;
  return o.nivel + 1;
end $$;

create or replace function public.precos_oficina(p_pintura integer, p_motor integer, p_blindagem integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if least(p_pintura, p_motor, p_blindagem) < 70 or greatest(p_pintura, p_motor, p_blindagem) > 200 then raise exception 'precos de 70 a 200 por cento'; end if;
  update oficinas_jogadores set pct_pintura = p_pintura, pct_motor = p_motor, pct_blindagem = p_blindagem where dono = auth.uid();
  if not found then raise exception 'voce nao tem oficina'; end if;
end $$;

create or replace function public.sacar_oficina(p_valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  if p_valor is null or p_valor < 1 then raise exception 'valor invalido'; end if;
  update oficinas_jogadores set caixa = caixa - p_valor where dono = auth.uid() and caixa >= p_valor returning caixa into v;
  if not found then raise exception 'caixa insuficiente'; end if;
  update perfis set moedas = moedas + p_valor where id = auth.uid();
  return v;
end $$;

-- vende a oficina de volta (metade do que custou o terreno e as evoluções) e leva o caixa
create or replace function public.vender_oficina() returns integer
language plpgsql security definer set search_path = public as $$
declare o oficinas_jogadores%rowtype; v integer;
begin
  select * into o from oficinas_jogadores where dono = auth.uid() for update;
  if o.terreno is null then raise exception 'voce nao tem oficina'; end if;
  v := (150000 + case when o.nivel >= 2 then 100000 else 0 end + case when o.nivel >= 3 then 250000 else 0 end) / 2 + o.caixa;
  delete from oficinas_jogadores where terreno = o.terreno;
  update perfis set moedas = moedas + v where id = auth.uid();
  return v;
end $$;

-- serviço: 'ze' e 'premium' (oficinas da cidade, 110) ou 'j1'..'j8' (oficina de jogador)
create or replace function public.oficina_servico(p_carro bigint, p_oficina text, p_servico text, p_cor text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c carros%rowtype; o oficinas_jogadores%rowtype; base integer; mult real; preco integer; espera interval;
begin
  p := jogador_livre();
  select * into c from carros where id = p_carro and dono = p.id for update;
  if c.id is null then raise exception 'esse carro nao e seu'; end if;
  if c.ladrao is not null then raise exception 'o carro foi roubado: use o bloqueio'; end if;
  if c.destruido_ate is not null and c.destruido_ate > now() then raise exception 'o carro foi destruido: espere'; end if;
  if c.oficina_ate is not null and c.oficina_ate > now() then raise exception 'o carro ja esta na oficina'; end if;
  if p_oficina like 'j_' then
    select * into o from oficinas_jogadores where terreno = substr(p_oficina, 2)::smallint for update;
    if o.terreno is null then raise exception 'oficina invalida'; end if;
    if p_servico = 'blindagem' and o.nivel < 2 then raise exception 'servico exige oficina nivel 2'; end if;
    if p_servico = 'motor' and c.motor + 1 > o.nivel then raise exception 'esse motor exige oficina de nivel maior'; end if;
    mult := (case p_servico when 'pintura' then o.pct_pintura when 'motor' then o.pct_motor else o.pct_blindagem end) / 100.0;
    espera := case o.nivel when 1 then interval '2 minutes' when 2 then interval '1 minute' else null end;
  else
    mult := case p_oficina when 'ze' then 1.0 when 'premium' then 1.3 else null end;
    if mult is null then raise exception 'oficina invalida'; end if;
    espera := case when p_oficina = 'ze' then interval '2 minutes' else null end;
  end if;
  if p_servico = 'pintura' then
    if p_cor is null or p_cor !~ '^#[0-9a-fA-F]{6}$' then raise exception 'cor invalida'; end if;
    base := 2000;
  elsif p_servico = 'motor' then
    if c.motor >= 3 then raise exception 'o motor ja esta no maximo'; end if;
    base := (array[8000, 20000, 45000])[c.motor + 1];
  elsif p_servico = 'blindagem' then
    if c.blindado and c.blind_hp > 0 then raise exception 'o carro ja e blindado'; end if;
    base := case when c.blindado then 15000 else 30000 end;
  else raise exception 'servico invalido'; end if;
  preco := round(base * mult)::integer;
  update perfis set moedas = moedas - preco where id = p.id and moedas >= preco;
  if not found then raise exception 'moedas insuficientes'; end if;
  if o.terreno is not null then   -- peças: metade da tabela; o resto é lucro da oficina
    update oficinas_jogadores set caixa = caixa + greatest(0, preco - base / 2), servicos = servicos + 1 where terreno = o.terreno;
  end if;
  update carros set
    cor = case when p_servico = 'pintura' then lower(p_cor) else cor end,
    motor = case when p_servico = 'motor' then motor + 1 else motor end,
    blindado = blindado or p_servico = 'blindagem',
    blind_hp = case when p_servico = 'blindagem' then 1 else blind_hp end,
    oficina_ate = case when espera is null then null else now() + espera end
  where id = c.id returning * into c;
  return jsonb_build_object('preco', preco, 'pronto', c.oficina_ate, 'motor', c.motor, 'blindado', c.blindado, 'cor', c.cor);
end $$;

do $$
declare f text;
begin
  foreach f in array array['comprar_oficina(integer, text)', 'evoluir_oficina()', 'precos_oficina(integer, integer, integer)', 'sacar_oficina(integer)',
                           'vender_oficina()', 'oficina_servico(bigint, text, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
