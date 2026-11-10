-- Fator RP - Exército: quartel em Porto Sul (na mata a leste da cidade), carreira com patentes e salário.
-- Regras iguais às da polícia e da PRF (ficha limpa para entrar, turno a cada minuto, patente sobe com as horas),
-- com uma exceção: a equipe pode entrar, e o administrador é sempre o General Supremo.
-- Rode depois do 31a.

alter table public.perfis drop constraint if exists perfis_profissao_ok;
alter table public.perfis add constraint perfis_profissao_ok check (profissao in ('medico', 'bombeiro', 'jornalista', 'exercito'));
alter table public.carreiras drop constraint if exists carreiras_carreira_check;
alter table public.carreiras add constraint carreiras_carreira_check check (carreira in ('policia', 'prf', 'medico', 'bombeiro', 'jornalista', 'exercito'));

create or replace function public.entrar_profissao(p_profissao text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p_profissao not in ('medico', 'bombeiro', 'jornalista', 'exercito') then raise exception 'profissao invalida'; end if;
  if p.policial or p.prf then raise exception 'saia da policia antes'; end if;
  if p.crimes > 0 then raise exception 'procurado nao pode trabalhar no servico publico'; end if;
  update perfis set profissao = p_profissao, profissao_desde = now() where id = p.id;
end $$;

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
    ('jornalista', 0, 'Estagiário', 1.0), ('jornalista', 120, 'Repórter', 1.4), ('jornalista', 360, 'Repórter Sênior', 2.0), ('jornalista', 900, 'Editor', 2.8), ('jornalista', 1800, 'Editor-chefe', 4.0),
    ('exercito', 0, 'Recruta', 1.0), ('exercito', 60, 'Soldado', 1.2), ('exercito', 180, 'Cabo', 1.4), ('exercito', 360, '3º Sargento', 1.6),
    ('exercito', 600, '2º Sargento', 1.8), ('exercito', 900, '1º Sargento', 2.0), ('exercito', 1320, 'Subtenente', 2.2), ('exercito', 1800, 'Tenente', 2.5),
    ('exercito', 2400, 'Capitão', 2.8), ('exercito', 3200, 'Major', 3.2), ('exercito', 4200, 'Tenente-Coronel', 3.6), ('exercito', 5400, 'Coronel', 4.0),
    ('exercito', 7200, 'General', 4.5)
  ) t(c, m, n, x) where c = p_carreira order by m;
$$;

create or replace function public.salario_base(p_carreira text) returns numeric
language sql stable security definer set search_path = public as $$
  select case p_carreira when 'policia' then coalesce((select salario_policia from prefeitura where id = 1), 100) / 3.0
    when 'prf' then 40 when 'medico' then 30 when 'bombeiro' then 30 when 'jornalista' then 24 when 'exercito' then 35 else 0 end;
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
    return antes || jsonb_build_object('carreira', car, 'minutos', m, 'pago', 0)
      || case when car = 'exercito' and p.cargo = 'admin' then jsonb_build_object('nome', 'General Supremo', 'proximo', null, 'falta', null) else '{}'::jsonb end;
  end if;
  -- doutor, supervisor e diretor: o turno só conta dentro do hospital
  if car = 'medico' and (antes ->> 'nivel')::integer >= 3 and (abs(p_x + 135) > 45 or abs(p_z - 135) > 45) then
    return antes || jsonb_build_object('carreira', car, 'minutos', m, 'pago', 0, 'fora', true);
  end if;
  update carreiras set minutos = minutos + 1 where jogador = p.id and carreira = car returning minutos into m;
  pago := round(salario_base(car) * (antes ->> 'mult')::numeric);
  update perfis set moedas = moedas + pago, turno_em = now() where id = p.id;
  depois := patente(car, m);
  if car = 'exercito' and p.cargo = 'admin' then depois := depois || jsonb_build_object('nome', 'General Supremo', 'proximo', null, 'falta', null); antes := antes || jsonb_build_object('nome', 'General Supremo', 'proximo', null, 'falta', null); end if;   -- admin: General Supremo
  return depois || jsonb_build_object('carreira', car, 'minutos', m, 'pago', pago, 'subiu', (depois ->> 'nivel') <> (antes ->> 'nivel'));
end $$;

create or replace function public.minhas_carreiras() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(patente(c.carreira, c.minutos) || jsonb_build_object('carreira', c.carreira, 'minutos', c.minutos)
    || case when c.carreira = 'exercito' and (select cargo from perfis where id = auth.uid()) = 'admin' then jsonb_build_object('nome', 'General Supremo', 'proximo', null, 'falta', null) else '{}'::jsonb end), '[]'::jsonb)
    from carreiras c where c.jogador = auth.uid();
$$;

