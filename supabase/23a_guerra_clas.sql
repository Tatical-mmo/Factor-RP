-- Fator RP - guerra de clãs com hora marcada.
-- O líder declara guerra a outro clã, marca o horário (10 a 120 min depois) e aposta moedas do caixa.
-- O líder do outro clã aceita (pagando a mesma aposta) ou recusa. A guerra dura 15 minutos:
-- cada abate de um membro do clã inimigo vale 1 ponto e NÃO conta como crime.
-- Quem fizer mais pontos leva as duas apostas; empate devolve as apostas.

create table if not exists public.guerras (
  id         bigint generated always as identity primary key,
  desafiante bigint not null references public.clas (id) on delete cascade,
  desafiado  bigint not null references public.clas (id) on delete cascade,
  aposta     integer not null default 0 check (aposta >= 0),
  inicio     timestamptz not null,
  fim        timestamptz not null,
  status     text not null default 'proposta' check (status in ('proposta', 'aceita', 'encerrada', 'recusada', 'cancelada')),
  pontos_a   integer not null default 0,
  pontos_b   integer not null default 0,
  vencedor   bigint,
  criada_em  timestamptz not null default now()
);
create index if not exists guerras_status on public.guerras (status);

do $$
begin
  alter table public.guerras enable row level security;
  drop policy if exists "leitura publica" on public.guerras;
  create policy "leitura publica" on public.guerras for select using (true);
  revoke all on public.guerras from anon, authenticated;
  grant select on public.guerras to anon, authenticated;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'guerras') then
    alter publication supabase_realtime add table public.guerras;
  end if;
end $$;

-- avisa todos os membros de um clã
create or replace function public.avisar_cla(p_cla bigint, texto text) returns void
language sql security definer set search_path = public as $$
  insert into comandos (alvo, autor, tipo, dados) select jogador, auth.uid(), 'aviso', jsonb_build_object('texto', texto) from membros_cla where cla = p_cla;
$$;

create or replace function public.declarar_guerra(p_cla bigint, p_minutos integer, p_aposta integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; alvo clas%rowtype; nova bigint;
begin
  c := cla_do_lider();
  select * into c from clas where id = c.id for update;
  select * into alvo from clas where id = p_cla;
  if alvo.id is null then raise exception 'cla nao encontrado'; end if;
  if alvo.id = c.id then raise exception 'escolha outro cla'; end if;
  if p_minutos is null or p_minutos < 10 or p_minutos > 120 then raise exception 'horario invalido (10 a 120 min)'; end if;
  if p_aposta is null or p_aposta < 0 or p_aposta > 1000000 then raise exception 'aposta invalida'; end if;
  if exists (select 1 from guerras where status in ('proposta', 'aceita')
             and (desafiante in (c.id, alvo.id) or desafiado in (c.id, alvo.id))) then
    raise exception 'um dos clas ja tem guerra marcada';
  end if;
  if c.caixa < p_aposta then raise exception 'caixa do cla insuficiente'; end if;
  update clas set caixa = caixa - p_aposta where id = c.id;
  insert into guerras (desafiante, desafiado, aposta, inicio, fim)
    values (c.id, alvo.id, p_aposta, now() + make_interval(mins => p_minutos), now() + make_interval(mins => p_minutos + 15))
    returning id into nova;
  perform avisar_cla(alvo.id, format('⚔️ O clã %s declarou guerra ao seu clã! Aposta de %s. O líder precisa aceitar.', c.nome, p_aposta));
  return nova;
end $$;

create or replace function public.responder_guerra(p_guerra bigint, p_aceitar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; g guerras%rowtype; a clas%rowtype;
begin
  c := cla_do_lider();
  select * into g from guerras where id = p_guerra for update;
  if g.id is null or g.desafiado <> c.id or g.status <> 'proposta' then raise exception 'guerra invalida'; end if;
  if g.inicio <= now() then raise exception 'o prazo para responder acabou'; end if;
  select * into a from clas where id = g.desafiante;
  if not p_aceitar then
    update guerras set status = 'recusada' where id = g.id;
    update clas set caixa = caixa + g.aposta where id = g.desafiante;
    perform avisar_cla(g.desafiante, format('O clã %s recusou a guerra. A aposta voltou ao caixa.', c.nome));
    return;
  end if;
  select * into c from clas where id = c.id for update;
  if c.caixa < g.aposta then raise exception 'caixa do cla insuficiente'; end if;
  update clas set caixa = caixa - g.aposta where id = c.id;
  update guerras set status = 'aceita' where id = g.id;
  perform avisar_cla(g.desafiante, format('⚔️ O clã %s ACEITOU a guerra! Começa às %s.', c.nome, to_char(g.inicio at time zone 'America/Sao_Paulo', 'HH24:MI')));
  perform avisar_cla(c.id, format('⚔️ Guerra contra %s marcada para %s.', a.nome, to_char(g.inicio at time zone 'America/Sao_Paulo', 'HH24:MI')));
end $$;

create or replace function public.cancelar_guerra(p_guerra bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; g guerras%rowtype;
begin
  c := cla_do_lider();
  select * into g from guerras where id = p_guerra for update;
  if g.id is null or g.desafiante <> c.id or g.status <> 'proposta' then raise exception 'so da para cancelar antes do aceite'; end if;
  update guerras set status = 'cancelada' where id = g.id;
  update clas set caixa = caixa + g.aposta where id = c.id;
end $$;

-- qualquer jogador pode chamar: fecha propostas vencidas e guerras terminadas
create or replace function public.processar_guerras() returns void
language plpgsql security definer set search_path = public as $$
declare g guerras%rowtype; ven bigint; nome_v text;
begin
  for g in select * from guerras where status = 'proposta' and inicio <= now() for update skip locked loop
    update guerras set status = 'cancelada' where id = g.id;
    update clas set caixa = caixa + g.aposta where id = g.desafiante;
    perform avisar_cla(g.desafiante, 'A guerra não foi aceita a tempo. A aposta voltou ao caixa.');
  end loop;
  for g in select * from guerras where status = 'aceita' and fim <= now() for update skip locked loop
    ven := case when g.pontos_a > g.pontos_b then g.desafiante when g.pontos_b > g.pontos_a then g.desafiado end;
    update guerras set status = 'encerrada', vencedor = ven where id = g.id;
    if ven is null then
      update clas set caixa = caixa + g.aposta where id in (g.desafiante, g.desafiado);
      perform avisar_cla(g.desafiante, format('A guerra terminou empatada (%s × %s). Apostas devolvidas.', g.pontos_a, g.pontos_b));
      perform avisar_cla(g.desafiado, format('A guerra terminou empatada (%s × %s). Apostas devolvidas.', g.pontos_a, g.pontos_b));
    else
      update clas set caixa = caixa + g.aposta * 2 where id = ven returning nome into nome_v;
      perform avisar_cla(g.desafiante, format('🏆 Fim da guerra: %s venceu (%s × %s).', nome_v, g.pontos_a, g.pontos_b));
      perform avisar_cla(g.desafiado, format('🏆 Fim da guerra: %s venceu (%s × %s).', nome_v, g.pontos_a, g.pontos_b));
    end if;
  end loop;
end $$;

-- guerra em andamento entre o clã do assassino e o da vítima (ou null)
create or replace function public.guerra_entre(p_a uuid, p_b uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select g.id from guerras g
    join membros_cla ma on ma.jogador = p_a join membros_cla mb on mb.jogador = p_b
   where g.status = 'aceita' and now() between g.inicio and g.fim
     and ((g.desafiante = ma.cla and g.desafiado = mb.cla) or (g.desafiante = mb.cla and g.desafiado = ma.cla))
   limit 1;
$$;

-- morte: igual à anterior, mas abate de inimigo durante a guerra vale ponto e não é crime
create or replace function public.morrer(p_assassino uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v perfis%rowtype; k perfis%rowtype; perda integer := 0; defesa boolean; gid bigint; g guerras%rowtype; kc bigint;
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
    update perfis set crimes = crimes + 1, policial = false, servico_desde = null where id = k.id;
    perform avisar(k.id, 'Você matou um inocente e agora está PROCURADO pela polícia.');
  end if;
  delete from agressoes where (atacante = v.id and alvo = k.id) or (atacante = k.id and alvo = v.id);
  return perda;
end $$;

do $$
declare f text;
begin
  foreach f in array array['declarar_guerra(bigint, integer, integer)', 'responder_guerra(bigint, boolean)', 'cancelar_guerra(bigint)', 'processar_guerras()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.avisar_cla(bigint, text) from public, anon, authenticated;
  revoke all on function public.guerra_entre(uuid, uuid) from public, anon, authenticated;
end $$;
