-- 56 · Transporte: novas profissões (motorista de ônibus, piloto e controlador de voo) e pagamento das voltas de ônibus.
alter table public.perfis drop constraint if exists perfis_profissao_ok;
alter table public.perfis add constraint perfis_profissao_ok
  check (profissao in ('medico', 'bombeiro', 'jornalista', 'exercito', 'motorista', 'piloto', 'controlador'));
alter table public.perfis add column if not exists onibus_pago_em timestamptz;

create or replace function public.entrar_profissao(p_profissao text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p_profissao not in ('medico', 'bombeiro', 'jornalista', 'exercito', 'motorista', 'piloto', 'controlador') then raise exception 'profissao invalida'; end if;
  if p.policial or p.prf then raise exception 'saia da policia antes'; end if;
  if p.crimes > 0 then raise exception 'procurado nao pode trabalhar no servico publico'; end if;
  if p_profissao = 'exercito' and p.expulso_exercito then raise exception 'voce foi expulso do exercito'; end if;
  update perfis set profissao = p_profissao, profissao_desde = now() where id = p.id;
end $$;

-- carreiras (mesmos cargos de antes + as três novas)
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
    ('exercito', 7200, 'General', 4.5),
    ('motorista', 0, 'Motorista', 1.0), ('motorista', 120, 'Motorista Sênior', 1.4), ('motorista', 420, 'Fiscal de Linha', 2.0), ('motorista', 1200, 'Supervisor', 2.8),
    ('piloto', 0, 'Copiloto', 1.0), ('piloto', 180, 'Piloto', 1.5), ('piloto', 600, 'Comandante', 2.2), ('piloto', 1500, 'Comandante Sênior', 3.0),
    ('controlador', 0, 'Controlador Trainee', 1.0), ('controlador', 180, 'Controlador', 1.5), ('controlador', 600, 'Supervisor de Torre', 2.2)
  ) t(c, m, n, x) where c = p_carreira order by m;
$$;

insert into public.salarios (chave, rotulo, valor, ordem) values
  ('motorista', 'Ônibus (por minuto)', 18, 8), ('piloto', 'Piloto (por minuto)', 30, 9), ('controlador', 'Torre de controle (por minuto)', 26, 10)
on conflict (chave) do nothing;

-- uma volta completa da linha: 12 por passageiro e +150 se cumpriu os horários (no máximo uma volta a cada 80 s)
create or replace function public.pagar_onibus(p_passageiros integer, p_pontual boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.profissao is distinct from 'motorista' and p.cargo <> 'admin' then raise exception 'so motoristas de onibus'; end if;
  if p.onibus_pago_em is not null and p.onibus_pago_em > now() - interval '80 seconds' then raise exception 'volta rapida demais'; end if;
  v := least(greatest(coalesce(p_passageiros, 0), 0), 30) * 12 + case when p_pontual then 150 else 0 end;
  update perfis set moedas = moedas + v, onibus_pago_em = now() where id = p.id;
  return v;
end $$;
revoke all on function public.pagar_onibus(integer, boolean) from public, anon;
grant execute on function public.pagar_onibus(integer, boolean) to authenticated;
