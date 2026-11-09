-- Fator RP - carreiras com patentes: polícia, PRF, médico, bombeiro e jornalista.
-- Cada minuto em serviço conta para a carreira (o jogo "bate o turno" a cada minuto) e paga o salário
-- do cargo. A patente sobe com as horas trabalhadas e o salário sobe junto.
-- Médico: Doutor, Supervisor e Diretor trabalham dentro do hospital (o turno só conta lá).
-- Polícia: o salário base continua sendo o definido pelo prefeito (multiplicado pela patente).

create table if not exists public.carreiras (
  jogador  uuid not null references public.perfis (id) on delete cascade,
  carreira text not null check (carreira in ('policia', 'prf', 'medico', 'bombeiro', 'jornalista')),
  minutos  integer not null default 0,
  primary key (jogador, carreira)
);
do $$
begin
  alter table public.carreiras enable row level security;
  drop policy if exists "leitura publica" on public.carreiras;
  create policy "leitura publica" on public.carreiras for select using (true);
  revoke all on public.carreiras from anon, authenticated;
  grant select on public.carreiras to anon, authenticated;
end $$;
alter table public.perfis add column if not exists turno_em timestamptz;

-- tabela de cargos: minutos mínimos, nome e multiplicador do salário
create or replace function public.cargos_carreira(p_carreira text) returns table (nivel integer, minimo integer, nome text, mult numeric)
language sql immutable as $$
  select row_number() over ()::integer, m, n, x from (values
    ('policia', 0, 'Soldado', 1.0), ('policia', 60, 'Cabo', 1.2), ('policia', 180, '3º Sargento', 1.4), ('policia', 360, '2º Sargento', 1.6),
    ('policia', 600, '1º Sargento', 1.8), ('policia', 900, 'Subtenente', 2.0), ('policia', 1320, 'Tenente', 2.3), ('policia', 1800, 'Capitão', 2.6),
    ('policia', 2400, 'Major', 3.0), ('policia', 3200, 'Tenente-Coronel', 3.5), ('policia', 4200, 'Coronel', 4.0),
    ('prf', 0, 'Agente', 1.0), ('prf', 120, 'Agente Especial', 1.4), ('prf', 480, 'Inspetor', 2.0), ('prf', 1200, 'Superintendente', 3.0),
    ('medico', 0, 'Socorrista', 1.0), ('medico', 120, 'Enfermeiro', 1.4), ('medico', 360, 'Doutor', 2.0), ('medico', 900, 'Supervisor', 2.8), ('medico', 1800, 'Diretor', 4.0),
    ('bombeiro', 0, 'Recruta', 1.0), ('bombeiro', 60, 'Bombeiro', 1.2), ('bombeiro', 180, 'Cabo', 1.5), ('bombeiro', 420, 'Sargento', 1.9),
    ('bombeiro', 840, 'Tenente', 2.4), ('bombeiro', 1500, 'Capitão', 3.0), ('bombeiro', 2400, 'Comandante', 4.0),
    ('jornalista', 0, 'Estagiário', 1.0), ('jornalista', 120, 'Repórter', 1.4), ('jornalista', 360, 'Repórter Sênior', 2.0), ('jornalista', 900, 'Editor', 2.8), ('jornalista', 1800, 'Editor-chefe', 4.0)
  ) t(c, m, n, x) where c = p_carreira order by m;
$$;

create or replace function public.patente(p_carreira text, p_minutos integer) returns jsonb
language sql stable as $$
  with t as (select * from cargos_carreira(p_carreira))
  select jsonb_build_object('nivel', a.nivel, 'nome', a.nome, 'mult', a.mult,
    'proximo', (select nome from t where minimo > p_minutos order by minimo limit 1),
    'falta', (select minimo - p_minutos from t where minimo > p_minutos order by minimo limit 1))
  from t a where a.minimo <= p_minutos order by a.minimo desc limit 1;
$$;

-- salário base por minuto de cada carreira
create or replace function public.salario_base(p_carreira text) returns numeric
language sql stable security definer set search_path = public as $$
  select case p_carreira when 'policia' then coalesce((select salario_policia from prefeitura where id = 1), 100) / 3.0
    when 'prf' then 40 when 'medico' then 30 when 'bombeiro' then 30 when 'jornalista' then 24 else 0 end;
$$;

-- turno: chamado a cada minuto pelo jogo de quem está em serviço
create or replace function public.bater_turno(p_x real, p_z real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; car text; antes jsonb; depois jsonb; m integer; pago integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null then raise exception 'sem permissao'; end if;
  car := case when p.policial then 'policia' when p.prf then 'prf' else p.profissao end;
  if car is null then return null; end if;
  insert into carreiras (jogador, carreira) values (p.id, car) on conflict do nothing;
  select minutos into m from carreiras where jogador = p.id and carreira = car;
  antes := patente(car, m);
  if p.turno_em is not null and p.turno_em > now() - interval '55 seconds' then
    return antes || jsonb_build_object('carreira', car, 'minutos', m, 'pago', 0);
  end if;
  -- doutor, supervisor e diretor: o turno só conta dentro do hospital
  if car = 'medico' and (antes ->> 'nivel')::integer >= 3 and (abs(p_x + 135) > 45 or abs(p_z - 135) > 45) then
    return antes || jsonb_build_object('carreira', car, 'minutos', m, 'pago', 0, 'fora', true);
  end if;
  update carreiras set minutos = minutos + 1 where jogador = p.id and carreira = car returning minutos into m;
  pago := round(salario_base(car) * (antes ->> 'mult')::numeric);
  update perfis set moedas = moedas + pago, turno_em = now() where id = p.id;
  depois := patente(car, m);
  return depois || jsonb_build_object('carreira', car, 'minutos', m, 'pago', pago, 'subiu', (depois ->> 'nivel') <> (antes ->> 'nivel'));
end $$;

create or replace function public.minhas_carreiras() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(patente(c.carreira, c.minutos) || jsonb_build_object('carreira', c.carreira, 'minutos', c.minutos)), '[]'::jsonb)
    from carreiras c where c.jogador = auth.uid();
$$;

-- o salário antigo da polícia e da PRF (a cada 3 min) passa a ser pago pelo turno
create or replace function public.receber_salario_policia() returns integer language sql as $$ select 0; $$;
create or replace function public.salario_prf() returns integer language sql as $$ select 0; $$;

do $$
declare f text;
begin
  foreach f in array array['bater_turno(real, real)', 'minhas_carreiras()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
