-- Fator RP - etapa 7 (parte 2 de 2): territórios (captura, defesa com robôs, renda) e casas.

create table if not exists public.territorios (
  id            text primary key,
  nome          text not null,
  x             real not null,
  z             real not null,
  dono_cla      bigint references public.clas (id) on delete set null,
  defesa        integer not null default 0 check (defesa >= 0),
  capturado_em  timestamptz,
  renda_marca   timestamptz not null default now(),
  captura_cla   bigint,
  captura_inicio timestamptz
);
insert into public.territorios (id, nome, x, z) values ('leste', 'Território Leste', 155, 0), ('oeste', 'Território Oeste', -155, 0)
on conflict (id) do update set nome = excluded.nome, x = excluded.x, z = excluded.z;

create table if not exists public.casas (
  id    integer primary key,
  x     real not null,      -- porta da casa
  z     real not null,
  preco integer not null default 35000,
  dono  uuid unique references public.perfis (id) on delete set null
);
insert into public.casas (id, x, z) values
  (1, -58, -90.5), (2, -4, -90.5), (3, 50, -90.5), (4, 104, -90.5), (5, -58, -36.5), (6, 104, -36.5),
  (7, -58, 17.5), (8, 104, 17.5), (9, -58, 71.5), (10, -4, 71.5), (11, 50, 71.5), (12, 104, 71.5)
on conflict (id) do update set x = excluded.x, z = excluded.z;

do $$
declare t text;
begin
  foreach t in array array['territorios', 'casas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('create policy "leitura publica" on public.%I for select using (true)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- renda: o clã dono recebe 400 por hora por território (calculado quando alguém chama)
create or replace function public.processar_territorios() returns void
language plpgsql security definer set search_path = public as $$
declare t territorios%rowtype; blocos integer;
begin
  for t in select * from territorios for update skip locked loop
    if t.dono_cla is null then update territorios set renda_marca = now() where id = t.id; continue; end if;
    blocos := least(40, floor(extract(epoch from (now() - t.renda_marca)) / 360))::integer;
    if blocos > 0 then
      update clas set caixa = caixa + blocos * 40 where id = t.dono_cla;
      update territorios set renda_marca = renda_marca + make_interval(secs => blocos * 360) where id = t.id;
    end if;
  end loop;
end $$;

-- captura manual: o clã fica dentro do território por 60 s + 20 s por robô defensor
create or replace function public.iniciar_captura(p_territorio text) returns integer
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; t territorios%rowtype;
begin
  perform jogador_livre();
  c := meu_cla();
  if c.id is null then raise exception 'voce nao esta em um cla'; end if;
  select * into t from territorios where id = p_territorio for update;
  if t.id is null then raise exception 'territorio invalido'; end if;
  if t.dono_cla = c.id then raise exception 'o territorio ja e do seu cla'; end if;
  if t.capturado_em > now() - interval '3 minutes' then raise exception 'territorio recem capturado'; end if;
  if t.captura_cla is distinct from c.id or t.captura_inicio < now() - interval '5 minutes' then
    update territorios set captura_cla = c.id, captura_inicio = now() where id = t.id;
  end if;
  return 60 + 20 * t.defesa;
end $$;

create or replace function public.concluir_captura(p_territorio text) returns void
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; t territorios%rowtype;
begin
  perform jogador_livre();
  c := meu_cla();
  select * into t from territorios where id = p_territorio for update;
  if c.id is null or t.captura_cla is distinct from c.id then raise exception 'captura nao iniciada'; end if;
  if t.captura_inicio > now() - make_interval(secs => 60 + 20 * t.defesa) then raise exception 'captura incompleta'; end if;
  perform processar_territorios();
  update territorios set dono_cla = c.id, defesa = 0, capturado_em = now(), renda_marca = now(), captura_cla = null, captura_inicio = null
    where id = t.id;
  if t.dono_cla is not null then perform avisar((select lider from clas where id = t.dono_cla), format('Seu clã perdeu o %s para o %s!', t.nome, c.nome)); end if;
end $$;

-- ataque automático com robôs (para quando o clã inimigo está offline)
create or replace function public.atacar_territorio(p_territorio text, p_robos integer) returns text
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; t territorios%rowtype; ataque real; def real; perdas integer;
begin
  c := cla_do_lider();
  select * into t from territorios where id = p_territorio for update;
  if t.id is null then raise exception 'territorio invalido'; end if;
  if t.dono_cla = c.id then raise exception 'o territorio ja e do seu cla'; end if;
  if t.capturado_em > now() - interval '3 minutes' then raise exception 'territorio recem capturado'; end if;
  if p_robos < 1 or p_robos > c.robos then raise exception 'robos insuficientes'; end if;
  ataque := p_robos * (0.8 + random() * 0.4);
  def := t.defesa * 1.3;
  if ataque > def then
    perdas := least(p_robos - 1, ceil(t.defesa * 0.7)::integer);
    perform processar_territorios();
    update clas set robos = robos - p_robos where id = c.id;
    update territorios set dono_cla = c.id, defesa = p_robos - perdas, capturado_em = now(), renda_marca = now(),
      captura_cla = null, captura_inicio = null where id = t.id;
    if t.dono_cla is not null then perform avisar((select lider from clas where id = t.dono_cla), format('Robôs do %s tomaram o %s!', c.nome, t.nome)); end if;
    return format('vitoria:%s', p_robos - perdas);
  end if;
  update clas set robos = robos - p_robos where id = c.id;
  update territorios set defesa = greatest(0, defesa - floor(p_robos * 0.5)::integer) where id = t.id;
  return 'derrota';
end $$;

-- o líder põe robôs do clã para defender (ou recolhe)
create or replace function public.defender_territorio(p_territorio text, p_robos integer) returns void
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; t territorios%rowtype;
begin
  c := cla_do_lider();
  select * into t from territorios where id = p_territorio and dono_cla = c.id for update;
  if t.id is null then raise exception 'o territorio nao e do seu cla'; end if;
  if p_robos > 0 and p_robos > c.robos then raise exception 'robos insuficientes'; end if;
  if p_robos < 0 and -p_robos > t.defesa then raise exception 'robos insuficientes'; end if;
  update clas set robos = robos - p_robos where id = c.id;
  update territorios set defesa = defesa + p_robos where id = t.id;
end $$;

-- ------------------------------------------------------------ casas (35.000, uma por jogador)
create or replace function public.comprar_casa(p_casa integer) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c casas%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if exists (select 1 from casas where dono = p.id) then raise exception 'voce ja tem uma casa'; end if;
  select * into c from casas where id = p_casa for update;
  if c.id is null then raise exception 'casa invalida'; end if;
  if c.dono is not null then raise exception 'casa ja vendida'; end if;
  if p.moedas < c.preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - c.preco where id = p.id;
  update casas set dono = p.id where id = c.id;
end $$;

-- policial não pode estar em clã
create or replace function public.entrar_policia() returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.crimes > 0 then raise exception 'quem tem crimes nao entra na policia'; end if;
  if p.cargo <> 'jogador' then raise exception 'a equipe nao entra na policia'; end if;
  if exists (select 1 from membros_cla where jogador = p.id) then raise exception 'saia do cla para entrar na policia'; end if;
  update perfis set policial = true, servico_desde = now(), policia_pago = now() where id = p.id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['criar_cla(text, text)', 'cla_adicionar(text)', 'cla_expulsar(uuid)', 'cla_sair()', 'cla_depositar(integer)',
    'cla_sacar(integer)', 'cla_comprar_robo()', 'cla_retirar(text, integer)', 'cla_vender(text, integer)', 'processar_territorios()',
    'iniciar_captura(text)', 'concluir_captura(text)', 'atacar_territorio(text, integer)', 'defender_territorio(text, integer)',
    'comprar_casa(integer)', 'entrar_policia()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['meu_cla()', 'cla_do_lider()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
