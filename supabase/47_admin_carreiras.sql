-- Fator RP - o administrador põe qualquer jogador em qualquer emprego público e promove em qualquer carreira.
-- Empregos públicos: Polícia, PRF, Hospital (médico), Bombeiros, Jornal e Exército. Empresas particulares ficam de fora
-- (quem é funcionário de empresa precisa sair dela antes: a regra de um emprego por jogador continua valendo).
-- A patente fica guardada mesmo fora do serviço: quando ele entrar na carreira, já começa nela.
-- Rode depois do 46.

create or replace function public.admin_carreiras(p_jogador uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  select * into p from perfis where id = p_jogador;
  if p.id is null then raise exception 'jogador invalido'; end if;
  return jsonb_build_object(
    'emprego', case when p.policial then 'policia' when p.prf then 'prf' else p.profissao end,
    'empresa', trabalha_em_empresa(p.id),
    'carreiras', (select jsonb_agg(jsonb_build_object('carreira', k, 'minutos', coalesce(c.minutos, 0),
        'nivel', (patente(k, coalesce(c.minutos, 0)) ->> 'nivel')::int,
        'cargos', (select jsonb_agg(jsonb_build_object('nivel', t.nivel, 'nome', t.nome) order by t.nivel) from cargos_carreira(k) t)) order by o)
      from unnest(array['policia', 'prf', 'medico', 'bombeiro', 'jornalista', 'exercito']) with ordinality as u(k, o)
      left join carreiras c on c.jogador = p.id and c.carreira = u.k));
end $$;

create or replace function public.admin_promover(p_jogador uuid, p_carreira text, p_nivel integer) returns text
language plpgsql security definer set search_path = public as $$
declare cargo_ record; nomes jsonb := '{"policia":"Polícia","prf":"PRF","medico":"Hospital","bombeiro":"Bombeiros","jornalista":"Jornal","exercito":"Exército"}';
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if not (nomes ? p_carreira) then raise exception 'carreira invalida'; end if;
  if not exists (select 1 from perfis where id = p_jogador) then raise exception 'jogador invalido'; end if;
  select * into cargo_ from cargos_carreira(p_carreira) where nivel = p_nivel;
  if cargo_.nome is null then raise exception 'patente invalida'; end if;
  insert into carreiras (jogador, carreira, minutos) values (p_jogador, p_carreira, cargo_.minimo)
    on conflict (jogador, carreira) do update set minutos = excluded.minutos;
  insert into comandos (alvo, autor, tipo, dados) values (p_jogador, auth.uid(), 'aviso',
    jsonb_build_object('texto', format('🎖️ O administrador te promoveu a %s (%s)!', cargo_.nome, nomes ->> p_carreira)));
  perform registrar(p_jogador, 'patente', jsonb_build_object('carreira', p_carreira, 'patente', cargo_.nome));
  return cargo_.nome;
end $$;

-- p_emprego: policia, prf, medico, bombeiro, jornalista, exercito ou nenhum
create or replace function public.admin_definir_emprego(p_jogador uuid, p_emprego text) returns void
language plpgsql security definer set search_path = public as $$
declare nomes jsonb := '{"policia":"Polícia","prf":"PRF","medico":"Hospital","bombeiro":"Bombeiros","jornalista":"Jornal","exercito":"Exército","nenhum":""}';
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if not (nomes ? p_emprego) then raise exception 'carreira invalida'; end if;
  if not exists (select 1 from perfis where id = p_jogador) then raise exception 'jogador invalido'; end if;
  if p_emprego <> 'nenhum' and trabalha_em_empresa(p_jogador) then raise exception 'ele trabalha em empresa'; end if;
  -- primeiro tira de tudo, depois coloca no novo (a regra de um emprego confere a empresa particular)
  update perfis set policial = false, prf = false, profissao = null, profissao_desde = null where id = p_jogador;
  if p_emprego = 'policia' then update perfis set policial = true, servico_desde = now(), policia_pago = now() where id = p_jogador;
  elsif p_emprego = 'prf' then update perfis set prf = true, prf_pago = now() where id = p_jogador;
  elsif p_emprego <> 'nenhum' then
    update perfis set profissao = p_emprego, profissao_desde = now(), expulso_exercito = case when p_emprego = 'exercito' then false else expulso_exercito end where id = p_jogador;
  end if;
  if p_emprego <> 'nenhum' then
    insert into carreiras (jogador, carreira) values (p_jogador, p_emprego) on conflict do nothing;
    insert into comandos (alvo, autor, tipo, dados) values (p_jogador, auth.uid(), 'aviso',
      jsonb_build_object('texto', format('💼 O administrador te colocou no emprego: %s.', nomes ->> p_emprego)));
  end if;
  perform registrar(p_jogador, 'emprego', jsonb_build_object('emprego', p_emprego));
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_carreiras(uuid)', 'admin_promover(uuid, text, integer)', 'admin_definir_emprego(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
