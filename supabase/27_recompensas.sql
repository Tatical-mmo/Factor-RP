-- Fator RP - muito procurados, recompensas e cerco da polícia robô.
-- Cada 5 jogadores mortos sem ser preso (fora de guerra e sem legítima defesa) somam 10.000 de recompensa.
-- Quem tem recompensa aparece nos outdoors perto de onde está. Quem matar ou prender esse jogador leva
-- a recompensa (matar um procurado com recompensa não é crime). Ser preso zera a sequência.
-- Polícia robô: prende o procurado que alcançar (o próprio jogo do fugitivo avisa o banco) e, se ele se
-- esconder em casa durante a perseguição, fica esperando na porta por até 1 ciclo (32 min).

alter table public.perfis add column if not exists matancas   integer not null default 0;
alter table public.perfis add column if not exists recompensa integer not null default 0;
alter table public.perfis add column if not exists cerco_ate  timestamptz;
alter table public.perfis add column if not exists cerco_x    real;
alter table public.perfis add column if not exists cerco_z    real;

-- avisa quem jogou nos últimos 10 minutos
create or replace function public.avisar_todos(texto text) returns void
language sql security definer set search_path = public as $$
  insert into comandos (alvo, autor, tipo, dados) select id, auth.uid(), 'aviso', jsonb_build_object('texto', texto)
    from perfis where visto_em > now() - interval '10 minutes';
$$;

create or replace function public.morrer(p_assassino uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v perfis%rowtype; k perfis%rowtype; perda integer := 0; defesa boolean; gid bigint; g guerras%rowtype; kc bigint; premio integer;
begin
  select * into v from perfis where id = auth.uid() for update;
  if v.id is null then raise exception 'sem permissao'; end if;
  if v.ultima_morte is not null and v.ultima_morte > now() - interval '20 seconds' then return 0; end if;
  update perfis set ultima_morte = now(), carga_pedido = null, carga_em = null where id = v.id;
  if v.carga_pedido is not null then update pedidos set em_transito = greatest(0, em_transito - 1) where id = v.carga_pedido; end if;
  if p_assassino is null or p_assassino = v.id then return 0; end if;
  select * into k from perfis where id = p_assassino for update;
  if k.id is null then return 0; end if;
  perda := least(100, v.moedas);
  update perfis set moedas = moedas - perda where id = v.id;
  update perfis set moedas = moedas + perda where id = k.id;
  -- recompensa: quem neutraliza um muito procurado leva o prêmio (e não comete crime)
  if v.recompensa > 0 then
    premio := v.recompensa;
    update perfis set recompensa = 0, matancas = 0 where id = v.id;
    update perfis set moedas = moedas + premio where id = k.id;
    perform avisar_todos(format('🎯 %s neutralizou o procurado %s e levou %s de recompensa!', k.nome, v.nome, premio));
    delete from agressoes where (atacante = v.id and alvo = k.id) or (atacante = k.id and alvo = v.id);
    return perda;
  end if;
  gid := guerra_entre(k.id, v.id);
  if gid is not null then
    select * into g from guerras where id = gid for update;
    select cla into kc from membros_cla where jogador = k.id;
    if kc = g.desafiante then update guerras set pontos_a = pontos_a + 1 where id = gid;
    else update guerras set pontos_b = pontos_b + 1 where id = gid; end if;
    delete from agressoes where (atacante = v.id and alvo = k.id) or (atacante = k.id and alvo = v.id);
    return perda;
  end if;
  defesa := exists (select 1 from agressoes where atacante = v.id and alvo = k.id and em > now() - interval '2 minutes')
         or (k.policial and v.crimes > 0);
  if not defesa then
    update perfis set crimes = crimes + 1, policial = false, servico_desde = null, matancas = matancas + 1,
      recompensa = recompensa + case when (matancas + 1) % 5 = 0 then 10000 else 0 end
    where id = k.id returning * into k;
    if k.matancas % 5 = 0 then
      perform avisar_todos(format('🚨 %s agora é MUITO PROCURADO (%s mortes): recompensa de %s para quem matar ou prender!', k.nome, k.matancas, k.recompensa));
    else
      perform avisar(k.id, 'Você matou um inocente e agora está PROCURADO pela polícia.');
    end if;
  end if;
  delete from agressoes where (atacante = v.id and alvo = k.id) or (atacante = k.id and alvo = v.id);
  return perda;
end $$;

-- preso (por policial, PRF, equipe ou robô): zera a sequência; quem prendeu leva a recompensa
create or replace function public.prisao_recompensa() returns trigger
language plpgsql security definer set search_path = public as $$
declare quem perfis%rowtype;
begin
  if new.pena_seg > 0 and coalesce(old.pena_seg, 0) = 0 then
    if old.recompensa > 0 and auth.uid() is not null and auth.uid() <> new.id then
      select * into quem from perfis where id = auth.uid();
      if quem.id is not null then
        update perfis set moedas = moedas + old.recompensa where id = quem.id;
        perform avisar_todos(format('🎯 %s prendeu o procurado %s e levou %s de recompensa!', quem.nome, new.nome, old.recompensa));
      end if;
    end if;
    new.matancas := 0; new.recompensa := 0; new.cerco_ate := null;
  end if;
  return new;
end $$;
drop trigger if exists perfis_prisao_recompensa on public.perfis;
create trigger perfis_prisao_recompensa before update of pena_seg on public.perfis for each row execute function public.prisao_recompensa();

-- a polícia robô alcançou o fugitivo (chamado pelo jogo do próprio fugitivo)
create or replace function public.preso_por_robo() returns integer
language plpgsql security definer set search_path = public as $$
declare a perfis%rowtype; minutos integer;
begin
  select * into a from perfis where id = auth.uid() for update;
  if a.id is null or a.cargo <> 'jogador' or a.crimes <= 0 or a.pena_seg > 0 then return 0; end if;
  minutos := least(1440, 7 * power(2, least(a.crimes, 9) - 1))::integer;
  update perfis set pena_seg = minutos * 60, pena_marca = now(), fianca = 2000 * a.crimes, crimes = 0, algemado = false, policial = false,
    cerco_ate = null where id = a.id;
  return minutos;
end $$;

-- fugitivo entrou em casa durante a perseguição: o robô espera na porta (até 1 ciclo)
create or replace function public.cercar_casa(p_x real, p_z real) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare a perfis%rowtype;
begin
  select * into a from perfis where id = auth.uid() for update;
  if a.id is null or a.crimes <= 0 then return null; end if;
  if a.cerco_ate is not null and a.cerco_ate > now() then return a.cerco_ate; end if;
  update perfis set cerco_ate = now() + interval '1920 seconds', cerco_x = p_x, cerco_z = p_z where id = a.id returning cerco_ate into a.cerco_ate;
  return a.cerco_ate;
end $$;

create or replace function public.fim_cerco() returns void
language sql security definer set search_path = public as $$ update perfis set cerco_ate = null where id = auth.uid(); $$;

create or replace function public.mais_procurados() returns table (id uuid, nome text, recompensa integer, matancas integer, x real, z real, visto timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.recompensa, p.matancas, p.pos_x, p.pos_z, p.visto_em from perfis p
   where p.recompensa > 0 and p.pena_seg = 0 order by p.recompensa desc limit 5;
$$;

do $$
declare f text;
begin
  foreach f in array array['preso_por_robo()', 'cercar_casa(real, real)', 'fim_cerco()', 'mais_procurados()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.avisar_todos(text) from public, anon, authenticated;
end $$;
