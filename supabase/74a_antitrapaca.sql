-- 74a · Anti-trapaça: faltas, ban automático, armadilhas, limite de ritmo e assinatura do jogo.
-- Toda chamada ao banco passa pela função vigia() (pre-request do PostgREST):
--   · sem a assinatura do jogo no cabeçalho (x-fator) → recusada ("atualize o jogo"), quando ligada em seguranca;
--   · mais de 30 pedidos por segundo → falta; mais de 60 → recusado;
--   · conta banida → só leitura.
-- Armadilhas: funções com nome tentador que o jogo nunca chama → quem chama é banido na hora.
-- 3 pontos de falta em 10 minutos = ban automático (admin nunca é banido por isso). Tudo fica registrado em faltas.
-- PARA DESLIGAR TUDO (emergência): alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';

create table if not exists public.seguranca (
  id integer primary key default 1 check (id = 1),
  ligado boolean not null default true,
  exigir_assinatura boolean not null default false,   -- ligue com o 74b depois que a versão nova estiver no ar
  assinaturas text[] not null default array['fr-7c41e9a2'],
  max_por_segundo integer not null default 30
);
insert into public.seguranca (id) values (1) on conflict do nothing;

create table if not exists public.faltas (
  id      bigint generated always as identity primary key,
  jogador uuid not null references public.perfis (id) on delete cascade,
  motivo  text not null,
  detalhe jsonb,
  peso    integer not null default 1,
  em      timestamptz not null default now()
);
create index if not exists faltas_jogador_em on public.faltas (jogador, em);
create unlogged table if not exists public.ritmo (jogador uuid primary key, janela timestamptz not null, n integer not null default 0);

alter table public.seguranca enable row level security;
alter table public.faltas    enable row level security;
alter table public.ritmo     enable row level security;
drop policy if exists faltas_admin on public.faltas;
create policy faltas_admin on public.faltas for select to authenticated
  using (exists (select 1 from perfis a where a.id = auth.uid() and a.cargo = 'admin'));
revoke all on public.seguranca, public.ritmo from anon, authenticated;

-- anota a falta; com 3 pontos em 10 minutos, bane (admin nunca)
create or replace function public.registrar_falta(uid uuid, p_motivo text, p_detalhe jsonb, p_peso integer) returns void
language plpgsql security definer set search_path = public as $$
declare soma integer; adm boolean;
begin
  if uid is null then return; end if;
  -- a mesma falta de peso baixo só conta uma vez a cada 2 minutos (não pune quem só travou a internet)
  if p_peso < 3 and exists (select 1 from faltas where jogador = uid and motivo = p_motivo and em > now() - interval '2 minutes') then return; end if;
  insert into faltas (jogador, motivo, detalhe, peso) values (uid, left(p_motivo, 120), p_detalhe, p_peso);
  select cargo = 'admin' into adm from perfis where id = uid;
  if coalesce(adm, false) then return; end if;
  select coalesce(sum(peso), 0) into soma from faltas where jogador = uid and em > now() - interval '10 minutes';
  if soma >= 3 then
    update perfis set banido = true, banido_motivo = left('Anti-trapaça: ' || p_motivo, 200), algemado = false where id = uid and not banido;
  end if;
end $$;

-- roda antes de cada pedido ao banco
create or replace function public.vigia() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cfg seguranca%rowtype; h json; metodo text; caminho text; r ritmo%rowtype; seg timestamptz;
begin
  if uid is null then return; end if;                       -- antes do login
  select * into cfg from seguranca where id = 1;
  if cfg.id is null or not cfg.ligado then return; end if;
  metodo := coalesce(current_setting('request.method', true), '');
  caminho := coalesce(current_setting('request.path', true), '');
  if cfg.exigir_assinatura then
    begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
    if coalesce(h ->> 'x-fator', '') <> all (cfg.assinaturas) then raise exception 'atualize o jogo'; end if;
  end if;
  if metodo = 'GET' or metodo = 'HEAD' then return; end if;   -- leitura: transação só de leitura, nada a gravar
  if exists (select 1 from perfis where id = uid and banido) then raise exception 'conta banida'; end if;
  seg := date_trunc('second', clock_timestamp());
  insert into ritmo as rt (jogador, janela, n) values (uid, seg, 1)
    on conflict (jogador) do update set n = case when rt.janela = excluded.janela then rt.n + 1 else 1 end, janela = excluded.janela
    returning * into r;
  if r.n = cfg.max_por_segundo + 1 then perform registrar_falta(uid, 'pedidos rápidos demais', jsonb_build_object('caminho', caminho), 1); end if;
  if r.n > cfg.max_por_segundo * 2 then raise exception 'devagar'; end if;
end $$;

-- armadilhas (o jogo nunca chama): quem chama é banido na hora. Não dão erro, para o ban não ser desfeito.
create or replace function public.admin_dar_moedas(p_valor integer) returns integer language plpgsql security definer set search_path = public as $$
begin perform registrar_falta(auth.uid(), 'armadilha: admin_dar_moedas', jsonb_build_object('valor', p_valor), 3); return 0; end $$;
create or replace function public.admin_definir_cargo(p_cargo text) returns text language plpgsql security definer set search_path = public as $$
begin perform registrar_falta(auth.uid(), 'armadilha: admin_definir_cargo', jsonb_build_object('cargo', p_cargo), 3); return 'ok'; end $$;
create or replace function public.liberar_vip() returns boolean language plpgsql security definer set search_path = public as $$
begin perform registrar_falta(auth.uid(), 'armadilha: liberar_vip', null, 3); return true; end $$;
create or replace function public.dar_item_gratis(p_item text, p_qtd integer) returns integer language plpgsql security definer set search_path = public as $$
begin perform registrar_falta(auth.uid(), 'armadilha: dar_item_gratis', jsonb_build_object('item', p_item, 'qtd', p_qtd), 3); return 0; end $$;
create or replace function public.zerar_pena() returns boolean language plpgsql security definer set search_path = public as $$
begin perform registrar_falta(auth.uid(), 'armadilha: zerar_pena', null, 3); return true; end $$;
create or replace function public.modo_imortal(p_ligar boolean) returns boolean language plpgsql security definer set search_path = public as $$
begin perform registrar_falta(auth.uid(), 'armadilha: modo_imortal', null, 3); return true; end $$;

-- o admin perdoa (apaga as faltas e desbane)
create or replace function public.perdoar_faltas(p_jogador uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis where id = auth.uid() and cargo = 'admin') then raise exception 'sem permissao'; end if;
  delete from faltas where jogador = p_jogador;
  update perfis set banido = false, banido_motivo = null where id = p_jogador and banido_motivo like 'Anti-trapaça:%';
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_dar_moedas(integer)', 'admin_definir_cargo(text)', 'liberar_vip()', 'dar_item_gratis(text, integer)',
                           'zerar_pena()', 'modo_imortal(boolean)', 'perdoar_faltas(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.registrar_falta(uuid, text, jsonb, integer) from public, anon, authenticated;
  revoke all on function public.vigia() from public, anon;
  grant execute on function public.vigia() to authenticated, anon;   -- o PostgREST precisa chamar
end $$;

-- liga a vigia em todos os pedidos
alter role authenticator set pgrst.db_pre_request = 'public.vigia';
notify pgrst, 'reload config';
