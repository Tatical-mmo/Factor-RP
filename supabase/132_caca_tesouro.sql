-- 132: caça ao tesouro (baú do administrador) e personagens "só no baú". Rode depois do 126 (as sirenes não precisam de SQL).
--  · Personagens novos (limitados, nunca à venda; chegam pelo baú ou de presente do admin): Agente Secreta, Sentinela de
--    Obsidiana, Torcedor Organizado, Intruso Mascarado, Androide de Moletom e Bandido de Balaclava.
--  · Baú: o admin monta o conteúdo (moedas, itens da mochila e personagens de qualquer tipo) e o sistema põe num lugar
--    do mapa. A posição exata não é pública: todos veem só o círculo de busca; perto (radar) o jogo pergunta ao banco.
--    O primeiro que abrir leva tudo. Um baú ativo por vez.

insert into public.personagens_evento (id, nome, preco) values
  ('Agente_Secreta', 'Agente Secreta', 999999), ('Sentinela_Obsidiana', 'Sentinela de Obsidiana', 999999),
  ('Torcedor_Organizado', 'Torcedor Organizado', 999999), ('Intruso_Mascarado', 'Intruso Mascarado', 999999),
  ('Androide_Moletom', 'Androide de Moletom', 999999), ('Bandido_Balaclava', 'Bandido de Balaclava', 999999)
on conflict (id) do update set nome = excluded.nome;
-- a vitrine nunca abre para os limitados "só de presente / só no baú"
create or replace function public.peste_sem_vitrine() returns trigger language plpgsql as $$
begin
  if new.id in ('Doutor_Peste', 'Agente_Secreta', 'Sentinela_Obsidiana', 'Torcedor_Organizado', 'Intruso_Mascarado', 'Androide_Moletom', 'Bandido_Balaclava')
  then new.liberado_ate := null; end if;
  return new;
end $$;
update public.personagens_evento set liberado_ate = null
  where id in ('Agente_Secreta', 'Sentinela_Obsidiana', 'Torcedor_Organizado', 'Intruso_Mascarado', 'Androide_Moletom', 'Bandido_Balaclava');

create table if not exists public.baus_tesouro (
  id          bigserial primary key,
  x           real not null, z real not null,            -- posição exata (segredo)
  cx          real not null, cz real not null,           -- centro do círculo de busca (público)
  raio        real not null default 120,
  recompensas jsonb not null default '{}'::jsonb,        -- {"moedas": 5000, "itens": {"chocolate": 3}, "personagens": ["Agente_Secreta"]}
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  aberto_por  uuid references public.perfis (id) on delete set null,
  aberto_em   timestamptz,
  cancelado   boolean not null default false
);
alter table public.baus_tesouro enable row level security;   -- sem política de leitura: só pelas funções abaixo
revoke all on public.baus_tesouro from anon, authenticated;

create or replace function public.admin_criar_bau(p_x real, p_z real, p_recompensas jsonb, p_minutos integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint; a real := random() * 2 * pi(); r real := 25 + random() * 70;
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if coalesce(p_minutos, 0) < 5 or p_minutos > 10080 then raise exception 'tempo invalido'; end if;
  if jsonb_typeof(coalesce(p_recompensas, 'null'::jsonb)) <> 'object' or p_recompensas = '{}'::jsonb then raise exception 'bau vazio'; end if;
  update baus_tesouro set cancelado = true where aberto_por is null and not cancelado;
  insert into baus_tesouro (x, z, cx, cz, raio, recompensas, expira_em)
    values (p_x, p_z, p_x + cos(a) * r, p_z + sin(a) * r, 120, p_recompensas, now() + make_interval(mins => p_minutos))
    returning id into v;
  perform registrar(auth.uid(), 'bau_tesouro', jsonb_build_object('bau', v));
  return v;
end $$;

create or replace function public.admin_cancelar_bau() returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  update baus_tesouro set cancelado = true where aberto_por is null and not cancelado;
end $$;

-- o baú da vez (o último criado): sem a posição exata
create or replace function public.bau_estado() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', b.id, 'cx', b.cx, 'cz', b.cz, 'raio', b.raio, 'recompensas', b.recompensas, 'expira_em', b.expira_em,
    'ativo', b.aberto_por is null and not b.cancelado and b.expira_em > now(), 'aberto_por', b.aberto_por,
    'aberto_nome', (select nome from perfis where id = b.aberto_por), 'aberto_em', b.aberto_em, 'cancelado', b.cancelado)
  from baus_tesouro b order by b.id desc limit 1;
$$;

-- radar: a distância (arredondada) até o baú; bem perto, a posição para o jogo desenhar o baú
create or replace function public.bau_radar(p_x real, p_z real) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b baus_tesouro%rowtype; d real;
begin
  select * into b from baus_tesouro order by id desc limit 1;
  if b.id is null or b.aberto_por is not null or b.cancelado or b.expira_em <= now() then return null; end if;
  d := sqrt((b.x - p_x) ^ 2 + (b.z - p_z) ^ 2);
  if d > 70 then return jsonb_build_object('id', b.id, 'longe', true); end if;
  return jsonb_build_object('id', b.id, 'd', round(d / 5) * 5) || case when d <= 45 then jsonb_build_object('x', b.x, 'z', b.z) else '{}'::jsonb end;
end $$;

-- abrir: o primeiro (a menos de 5 m) leva tudo
create or replace function public.abrir_bau(p_id bigint, p_x real, p_z real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; b baus_tesouro%rowtype; r jsonb; k text; q integer; pid text;
begin
  p := jogador_livre();
  select * into b from baus_tesouro where id = p_id for update;
  if b.id is null or b.cancelado or b.expira_em <= now() then raise exception 'o bau sumiu'; end if;
  if b.aberto_por is not null then raise exception 'alguem ja abriu o bau'; end if;
  if sqrt((b.x - p_x) ^ 2 + (b.z - p_z) ^ 2) > 5 then raise exception 'chegue mais perto'; end if;
  update baus_tesouro set aberto_por = p.id, aberto_em = now() where id = b.id;
  r := b.recompensas;
  if coalesce((r->>'moedas')::integer, 0) > 0 then update perfis set moedas = moedas + (r->>'moedas')::integer where id = p.id; end if;
  for k, q in select key, value::integer from jsonb_each_text(coalesce(r->'itens', '{}'::jsonb)) loop
    if q > 0 and exists (select 1 from precos where item = k) then
      insert into inventario (dono, item, qtd) values (p.id, k, q) on conflict (dono, item) do update set qtd = inventario.qtd + q;
    end if;
  end loop;
  for pid in select jsonb_array_elements_text(coalesce(r->'personagens', '[]'::jsonb)) loop
    insert into personagens_comprados (jogador, personagem) values (p.id, pid) on conflict do nothing;
  end loop;
  perform registrar(p.id, 'abriu_bau', jsonb_build_object('bau', b.id, 'recompensas', r));
  return r;
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_criar_bau(real, real, jsonb, integer)', 'admin_cancelar_bau()', 'bau_estado()', 'bau_radar(real, real)', 'abrir_bau(bigint, real, real)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
