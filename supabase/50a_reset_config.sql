-- Fator RP - (1) reset do mapa mais completo e (2) configurações do administrador: polícia robô e crimes de NPC.
-- (1) O reset agora também libera casas do esgoto, cofres dos clãs, assaltos ao cargueiro, Lixeiros e a residência
--     oficial, e devolve quantas coisas mudou (para o admin conferir). Cada parte que não existir no banco é pulada.
-- (2) Quantos policiais robô andam na rua (0 a 20) e se os NPCs cometem crimes (ligado/desligado + chance por ciclo
--     de 2 minutos). Polícia, PRF e Exército em serviço prendem o ladrão NPC (+300).
-- Rode depois do 49.

-- executa um comando só se a tabela existir (bancos que pularam alguma etapa não quebram o reset)
create or replace function public.se_existe(p_tabela text, p_sql text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
  if to_regclass('public.' || p_tabela) is null then return 0; end if;
  execute p_sql; get diagnostics n = row_count; return n;
end $$;
revoke all on function public.se_existe(text, text) from public, anon, authenticated;

-- atualiza só as colunas que existem na tabela (bancos que pularam alguma etapa não quebram o reset)
create or replace function public.zerar_colunas(p_tabela text, p_pares text[], p_filtro text default 'true') returns integer
language plpgsql security definer set search_path = public as $$
declare sets text[] := '{}'; par text; col text; n integer := 0;
begin
  if to_regclass('public.' || p_tabela) is null then return 0; end if;
  foreach par in array p_pares loop
    col := trim(split_part(par, '=', 1));
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_tabela and column_name = col) then
      sets := sets || par;
    end if;
  end loop;
  if cardinality(sets) = 0 then return 0; end if;
  execute format('update public.%I set %s where %s', p_tabela, array_to_string(sets, ', '), p_filtro);
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.zerar_colunas(text, text[], text) from public, anon, authenticated;

-- personagem antigo/removido de algum jogador não pode travar o reset
create or replace function public.validar_personagem() returns trigger
language plpgsql as $$
begin
  if current_setting('fator.reset', true) = 'on' then return new; end if;
  if new.personagem not in (
    'Autumn_Traveler','Bandaged_Trailblazer','Bandit_Brave','Curly_Wanderer','Desert_Scout_Ava',
    'Desert_Warden','Dustbound_Scout','Dustveil_Scout','Friendly_Village_Blacksmith','Grimbeard_the_Ironclad',
    'Hooded_Paw_Guardian','Mustached_Explorer','Patchwork_Scout','Shadow_Scout','The_Frightened_Escapee',
    'Urban_Explorer','Urban_Wanderer'
  ) and not exists (select 1 from public.personagens_evento where id = new.personagem) and new.cargo = 'jogador' then
    raise exception 'personagem invalido';
  end if;
  return new;
end $$;

create or replace function public.admin_resetar_mundo(p_partes text[], p_confirma text) returns text
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; n integer; res text[] := '{}';   -- partes que não existirem no banco são puladas
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if p_confirma is distinct from 'RESETAR' then raise exception 'digite RESETAR para confirmar'; end if;
  if p_partes is null or cardinality(p_partes) = 0 then raise exception 'escolha o que resetar'; end if;
  perform set_config('fator.reset', 'on', true);   -- personagem inválido de algum jogador não barra o reset
  if 'moradia' = any(p_partes) then
    begin   -- cada parte separada: se uma falhar, as outras continuam e o admin vê o motivo
      perform se_existe('bau', 'delete from bau where true');
      delete from casas where tipo = 'unidade';
      n := zerar_colunas('casas', array['dono = null', 'inquilino = null', 'pago_ate = null', 'aluguel = null', 'a_venda = false', 'modelo = null', 'nivel = 1'], 'tipo <> ''oficial''');
      res := res || format('%s casas liberadas', n);
      perform se_existe('casas_esgoto', 'update casas_esgoto set dono = null, desde = null where dono is not null');
    exception when others then res := res || format('⚠️ moradia falhou: %s', sqlerrm);
    end;
  end if;
  if 'empresas' = any(p_partes) then
    begin   -- cada parte separada: se uma falhar, as outras continuam e o admin vê o motivo
      delete from empresas where true; get diagnostics n = row_count; res := res || format('%s empresas apagadas', n);
      delete from membros where true;
      perform se_existe('missoes', 'delete from missoes where true'); perform se_existe('ofertas', 'delete from ofertas where true');
      perform se_existe('negocios', 'delete from negocios where true'); perform se_existe('lojas_assaltadas', 'delete from lojas_assaltadas where true');
      n := se_existe('carros', 'delete from carros where modelo <> ''presidencial'''); res := res || format('%s carros apagados', n);
    exception when others then res := res || format('⚠️ empresas falhou: %s', sqlerrm);
    end;
  end if;
  if 'clas' = any(p_partes) then
    begin   -- cada parte separada: se uma falhar, as outras continuam e o admin vê o motivo
      perform se_existe('favores', 'delete from favores where true'); perform se_existe('assaltos_navio', 'delete from assaltos_navio where true');
      delete from clas where true; get diagnostics n = row_count; res := res || format('%s clãs apagados', n);
      perform zerar_colunas('territorios', array['dono_cla = null', 'captura_cla = null', 'captura_inicio = null', 'capturado_em = null']);
    exception when others then res := res || format('⚠️ clas falhou: %s', sqlerrm);
    end;
  end if;
  if 'jogadores' = any(p_partes) then
    begin   -- cada parte separada: se uma falhar, as outras continuam e o admin vê o motivo
      n := zerar_colunas('perfis', array['moedas = 500', 'crimes = 0', 'pena_seg = 0', 'pena_marca = null', 'algemado = false',
        'algemado_por = null', 'fianca = 0', 'fome = 100', 'policial = false', 'prf = false', 'eleitoral = false', 'profissao = null',
        'profissao_desde = null', 'matancas = 0', 'recompensa = 0', 'cerco_ate = null', 'pos_x = 0', 'pos_z = 27', 'turno_em = null',
        'pd_morte = null', 'pd_por = null', 'arma_militar = false', 'lixeiro = false', 'lixeiro_missao = null',
        'prisao_militar_ate = null', 'cativeiro = null', 'cativeiro_ate = null', 'cativeiro_cla = null']);
      res := res || format('%s jogadores zerados', n);
      perform se_existe('inventario', 'delete from inventario where true'); perform se_existe('carreiras', 'delete from carreiras where true'); perform se_existe('contas_banco', 'delete from contas_banco where true');
      perform se_existe('metas', 'delete from metas where true'); perform se_existe('encomendas', 'delete from encomendas where true'); perform se_existe('personagens_comprados', 'delete from personagens_comprados where true');
      perform se_existe('agressoes', 'delete from agressoes where true'); perform se_existe('cacadas', 'delete from cacadas where true');
    exception when others then res := res || format('⚠️ jogadores falhou: %s', sqlerrm);
    end;
  end if;
  if 'prefeitura' = any(p_partes) then
    begin   -- cada parte separada: se uma falhar, as outras continuam e o admin vê o motivo
      select * into pf from prefeitura where id = 1;
      if pf.prefeito is not null and to_regprocedure('public.deixar_cargo(uuid)') is not null then perform deixar_cargo(pf.prefeito); end if;
      perform zerar_colunas('prefeitura', array['prefeito = null', 'posse = null', 'vaga_ciclo = ciclo_atual()', 'salario_ciclo = -1',
        'cofre = 0', 'motivo = ''mapa resetado''', 'eleicao_ate = null', 'seguranca1 = null', 'seguranca2 = null'], 'id = 1');
      perform zerar_colunas('casas', array['dono = null', 'inquilino = null'], 'tipo = ''oficial''');
      perform se_existe('votos', 'delete from votos where true'); perform se_existe('candidatos', 'delete from candidatos where true'); perform se_existe('noticias', 'delete from noticias where true');
      perform se_existe('ocorrencias', 'delete from ocorrencias where true'); perform se_existe('assaltos', 'delete from assaltos where true'); perform se_existe('incendios', 'delete from incendios where true');
      perform se_existe('outdoors', 'update outdoors set anunciante = null, titulo = null, texto = null, tipo = null, ate = null where true');
      res := res || 'prefeitura zerada'::text;
    exception when others then res := res || format('⚠️ prefeitura falhou: %s', sqlerrm);
    end;
  end if;
  perform registrar(null, 'reset_mapa', jsonb_build_object('partes', p_partes, 'resultado', res));
  perform avisar_todos('🧹 O mapa foi resetado pela administração. Bom começo a todos!');
  return array_to_string(res, ' · ');
end $$;

-- ---------------------------------------------------------------- configurações do jogo
create table if not exists public.config_jogo (
  id            integer primary key default 1 check (id = 1),
  policia_robo  integer not null default 12 check (policia_robo between 0 and 20),
  crimes_npc    boolean not null default false,
  chance_crime  integer not null default 30 check (chance_crime between 0 and 100),
  atualizado    timestamptz not null default now()
);
insert into public.config_jogo (id) values (1) on conflict (id) do nothing;
do $$
begin
  alter table public.config_jogo enable row level security;
  drop policy if exists "leitura publica" on public.config_jogo;
  create policy "leitura publica" on public.config_jogo for select using (true);
  revoke all on public.config_jogo from anon, authenticated;
  grant select on public.config_jogo to anon, authenticated;
end $$;
-- policiais robô extras (ids 21 a 28) para quando o admin aumentar
do $$
begin
  if to_regclass('public.robos_policia') is not null then   -- só existe se o 31b foi rodado
    insert into public.robos_policia (id, tipo) select g, 'pe' from generate_series(21, 28) g on conflict (id) do nothing;
  end if;
end $$;

create or replace function public.admin_config(p_policia integer, p_crimes boolean, p_chance integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  update config_jogo set policia_robo = greatest(0, least(20, coalesce(p_policia, 12))), crimes_npc = coalesce(p_crimes, false),
    chance_crime = greatest(0, least(100, coalesce(p_chance, 30))), atualizado = now() where id = 1;
  perform registrar(null, 'config', jsonb_build_object('policia', p_policia, 'crimes', p_crimes, 'chance', p_chance));
end $$;

-- ladrões NPC presos (um por ciclo de 2 min: o jogo inteiro sorteia o mesmo ladrão pelo número do ciclo)
create table if not exists public.bandidos_presos (
  ciclo integer primary key,
  por   uuid references public.perfis (id) on delete set null,
  em    timestamptz not null default now()
);
do $$
begin
  alter table public.bandidos_presos enable row level security;
  drop policy if exists "leitura publica" on public.bandidos_presos;
  create policy "leitura publica" on public.bandidos_presos for select using (true);
  revoke all on public.bandidos_presos from anon, authenticated;
  grant select on public.bandidos_presos to anon, authenticated;
end $$;

create or replace function public.prender_bandido(p_ciclo integer) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; agora_ciclo integer := floor(extract(epoch from now()) / 120)::int;
begin
  p := jogador_livre();
  if not (p.policial or p.prf or p.profissao = 'exercito' or p.cargo = 'admin') then raise exception 'so policia prf ou exercito'; end if;
  if not (select crimes_npc from config_jogo where id = 1) then raise exception 'crimes de npc desligados'; end if;
  if p_ciclo < agora_ciclo - 2 or p_ciclo > agora_ciclo then raise exception 'o ladrao ja fugiu'; end if;
  insert into bandidos_presos (ciclo, por) values (p_ciclo, p.id) on conflict do nothing;
  if not found then raise exception 'outro agente ja prendeu'; end if;
  update perfis set moedas = moedas + 300 where id = p.id;
  return 300;
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_config(integer, boolean, integer)', 'prender_bandido(integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
