-- 149: celular de verdade (3 modelos) e a rede social Papo Reto (22a). Rode depois do 148.
-- Celular: o primeiro é grátis (o jogador escolhe), os outros custam 2.500 na Loja de celulares do próprio celular.
-- Papo Reto: perfil do PERSONAGEM (nome, @usuário, idade inventada, bio, foto), posts com foto e legenda. Cada post
-- é "para todos" ou "só seguidores", e o dono escolhe quem comenta (todos, seguidores ou ninguém).
-- As fotos ficam no bucket público "papo" (pasta com o id do jogador, até 600 KB, jpg/webp).

alter table public.perfis add column if not exists celular text;
alter table public.perfis add column if not exists celulares text[] not null default '{}';
alter table public.perfis drop constraint if exists perfis_celular_check;
alter table public.perfis add constraint perfis_celular_check check (celular is null or celular in ('vision', 'shield', 'crest'));

create or replace function public.escolher_celular(p_modelo text) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p_modelo not in ('vision', 'shield', 'crest') then raise exception 'modelo invalido'; end if;
  if p.celular is null and cardinality(p.celulares) = 0 then   -- o primeiro é de graça
    update perfis set celular = p_modelo, celulares = array[p_modelo] where id = p.id; return p_modelo;
  end if;
  if not (p_modelo = any(p.celulares)) then raise exception 'compre esse celular na loja'; end if;
  update perfis set celular = p_modelo where id = p.id; return p_modelo;
end $$;

create or replace function public.comprar_celular(p_modelo text) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p_modelo not in ('vision', 'shield', 'crest') then raise exception 'modelo invalido'; end if;
  if p_modelo = any(p.celulares) then raise exception 'voce ja tem esse celular'; end if;
  if p.moedas < 2500 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 2500, celular = p_modelo, celulares = array_append(celulares, p_modelo) where id = p.id;
  return p_modelo;
end $$;

-- ---------------------------------------------------------------- Papo Reto
create table if not exists public.papo_perfis (
  id uuid primary key references public.perfis(id) on delete cascade,
  usuario text not null unique check (usuario ~ '^[a-z0-9._]{3,20}$'),
  nome text not null check (char_length(nome) between 2 and 30),
  idade integer not null check (idade between 12 and 99),
  bio text not null default '' check (char_length(bio) <= 150),
  foto text,
  criado timestamptz not null default now()
);
create table if not exists public.papo_posts (
  id bigserial primary key,
  autor uuid not null references public.papo_perfis(id) on delete cascade,
  foto text not null,
  legenda text not null default '' check (char_length(legenda) <= 220),
  local text not null default '' check (char_length(local) <= 40),
  publico boolean not null default true,
  comentarios text not null default 'todos' check (comentarios in ('todos', 'seguidores', 'ninguem')),
  criado timestamptz not null default now()
);
create index if not exists papo_posts_criado on public.papo_posts (criado desc);
create index if not exists papo_posts_autor on public.papo_posts (autor, criado desc);
create table if not exists public.papo_seguir (
  seguidor uuid not null references public.papo_perfis(id) on delete cascade,
  seguido uuid not null references public.papo_perfis(id) on delete cascade,
  criado timestamptz not null default now(),
  primary key (seguidor, seguido), check (seguidor <> seguido)
);
create index if not exists papo_seguir_seguido on public.papo_seguir (seguido);
create table if not exists public.papo_curtidas (
  post bigint not null references public.papo_posts(id) on delete cascade,
  quem uuid not null references public.papo_perfis(id) on delete cascade,
  primary key (post, quem)
);
create table if not exists public.papo_comentarios (
  id bigserial primary key,
  post bigint not null references public.papo_posts(id) on delete cascade,
  autor uuid not null references public.papo_perfis(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 200),
  criado timestamptz not null default now()
);
create index if not exists papo_comentarios_post on public.papo_comentarios (post, criado);
-- tudo passa pelas funções abaixo (ninguém lê ou escreve direto nas tabelas)
alter table public.papo_perfis enable row level security;
alter table public.papo_posts enable row level security;
alter table public.papo_seguir enable row level security;
alter table public.papo_curtidas enable row level security;
alter table public.papo_comentarios enable row level security;

create or replace function public.papo_url_ok(p_url text, p_dono uuid) returns boolean
language sql immutable as $$ select p_url ~ ('^https://[a-z0-9.-]+/storage/v1/object/public/papo/' || p_dono::text || '/[0-9]+\.(jpg|webp)$') $$;

-- vê o post: é meu, é público ou eu sigo o autor
create or replace function public.papo_ve(p_post papo_posts, p_eu uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_post.autor = p_eu or p_post.publico or exists (select 1 from papo_seguir where seguidor = p_eu and seguido = p_post.autor)
$$;

create or replace function public.papo_salvar_perfil(p_usuario text, p_nome text, p_idade integer, p_bio text, p_foto text) returns void
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid();
begin
  if eu is null or exists (select 1 from perfis where id = eu and banido) then raise exception 'sem permissao'; end if;
  if not exists (select 1 from perfis where id = eu and celular is not null) then raise exception 'escolha um celular primeiro'; end if;
  p_usuario := lower(trim(both '@' from trim(p_usuario)));
  if p_foto is not null and not papo_url_ok(p_foto, eu) then raise exception 'foto invalida'; end if;
  if exists (select 1 from papo_perfis where usuario = p_usuario and id <> eu) then raise exception 'esse @usuario ja existe'; end if;
  insert into papo_perfis (id, usuario, nome, idade, bio, foto) values (eu, p_usuario, trim(p_nome), p_idade, trim(coalesce(p_bio, '')), p_foto)
  on conflict (id) do update set usuario = excluded.usuario, nome = excluded.nome, idade = excluded.idade, bio = excluded.bio,
    foto = coalesce(excluded.foto, papo_perfis.foto);
end $$;

create or replace function public.papo_postar(p_foto text, p_legenda text, p_local text, p_publico boolean, p_comentarios text) returns bigint
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); novo bigint;
begin
  if not exists (select 1 from papo_perfis where id = eu) then raise exception 'crie seu perfil no Papo Reto'; end if;
  if exists (select 1 from perfis where id = eu and banido) then raise exception 'sem permissao'; end if;
  if not papo_url_ok(p_foto, eu) then raise exception 'foto invalida'; end if;
  if (select count(*) from papo_posts where autor = eu and criado > now() - interval '1 hour') >= 12 then raise exception 'muitos posts: espere um pouco'; end if;
  insert into papo_posts (autor, foto, legenda, local, publico, comentarios)
    values (eu, p_foto, left(trim(coalesce(p_legenda, '')), 220), left(coalesce(p_local, ''), 40), coalesce(p_publico, true), coalesce(nullif(p_comentarios, ''), 'todos'))
    returning id into novo;
  return novo;
end $$;

create or replace function public.papo_apagar(p_post bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from papo_posts where id = p_post and (autor = auth.uid() or exists (select 1 from perfis where id = auth.uid() and cargo in ('admin', 'moderador')));
  if not found then raise exception 'sem permissao'; end if;
end $$;

-- linhas de post com o autor e as contagens (usada pelo feed e pelo perfil)
create or replace function public.papo_json(p papo_posts, eu uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'foto', p.foto, 'legenda', p.legenda, 'local', p.local, 'publico', p.publico, 'comentarios', p.comentarios,
    'criado', p.criado, 'autor', p.autor, 'usuario', a.usuario, 'nome', a.nome, 'avatar', a.foto,
    'curtidas', (select count(*) from papo_curtidas where post = p.id), 'curti', exists (select 1 from papo_curtidas where post = p.id and quem = eu),
    'ncom', (select count(*) from papo_comentarios where post = p.id),
    'pode_comentar', p.autor = eu or p.comentarios = 'todos' or (p.comentarios = 'seguidores' and exists (select 1 from papo_seguir where seguidor = eu and seguido = p.autor)))
  from papo_perfis a where a.id = p.autor
$$;

-- feed: 'seguindo' (de quem eu sigo e os meus) ou 'todos' (os públicos de todo mundo); 20 por vez, antes de p_antes
create or replace function public.papo_feed(p_modo text, p_antes bigint default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(papo_json(p, auth.uid()) order by p.id desc), '[]'::jsonb) from (
    select * from papo_posts p
    where (p_antes is null or p.id < p_antes) and papo_ve(p, auth.uid())
      and (p_modo = 'todos' and (p.publico or p.autor = auth.uid())
           or p_modo <> 'todos' and (p.autor = auth.uid() or exists (select 1 from papo_seguir where seguidor = auth.uid() and seguido = p.autor)))
    order by p.id desc limit 20) p
$$;

-- perfil de alguém (por @usuário; vazio = o meu)
create or replace function public.papo_perfil(p_usuario text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a papo_perfis%rowtype; eu uuid := auth.uid();
begin
  if coalesce(p_usuario, '') = '' then select * into a from papo_perfis where id = eu;
  else select * into a from papo_perfis where usuario = lower(trim(both '@' from p_usuario)); end if;
  if a.id is null then return null; end if;
  return jsonb_build_object('id', a.id, 'usuario', a.usuario, 'nome', a.nome, 'idade', a.idade, 'bio', a.bio, 'foto', a.foto, 'eu', a.id = eu,
    'seguidores', (select count(*) from papo_seguir where seguido = a.id), 'seguindo', (select count(*) from papo_seguir where seguidor = a.id),
    'sigo', exists (select 1 from papo_seguir where seguidor = eu and seguido = a.id),
    'nposts', (select count(*) from papo_posts where autor = a.id),
    'posts', coalesce((select jsonb_agg(papo_json(p, eu) order by p.id desc) from (select * from papo_posts p where autor = a.id and papo_ve(p, eu) order by id desc limit 30) p), '[]'::jsonb));
end $$;

create or replace function public.papo_buscar(p_texto text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('usuario', usuario, 'nome', nome, 'foto', foto)), '[]'::jsonb) from (
    select usuario, nome, foto from papo_perfis
    where usuario like '%' || lower(trim(both '@' from coalesce(p_texto, ''))) || '%' or nome ilike '%' || coalesce(p_texto, '') || '%'
    order by criado desc limit 20) x
$$;

create or replace function public.papo_seguir(p_usuario text, p_sim boolean) returns void
language plpgsql security definer set search_path = public as $$
declare alvo uuid; eu uuid := auth.uid();
begin
  if not exists (select 1 from papo_perfis where id = eu) then raise exception 'crie seu perfil no Papo Reto'; end if;
  select id into alvo from papo_perfis where usuario = lower(trim(both '@' from p_usuario));
  if alvo is null or alvo = eu then raise exception 'perfil invalido'; end if;
  if p_sim then
    insert into papo_seguir (seguidor, seguido) values (eu, alvo) on conflict do nothing;
    if found then perform avisar(alvo, format('💬 Papo Reto: @%s começou a seguir você.', (select usuario from papo_perfis where id = eu))); end if;
  else delete from papo_seguir where seguidor = eu and seguido = alvo; end if;
end $$;

create or replace function public.papo_curtir(p_post bigint, p_sim boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); p papo_posts%rowtype;
begin
  if not exists (select 1 from papo_perfis where id = eu) then raise exception 'crie seu perfil no Papo Reto'; end if;
  select * into p from papo_posts where id = p_post;
  if p.id is null or not papo_ve(p, eu) then raise exception 'post nao encontrado'; end if;
  if p_sim then insert into papo_curtidas (post, quem) values (p_post, eu) on conflict do nothing;
  else delete from papo_curtidas where post = p_post and quem = eu; end if;
  return (select count(*) from papo_curtidas where post = p_post);
end $$;

create or replace function public.papo_comentarios(p_post bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p papo_posts%rowtype;
begin
  select * into p from papo_posts where id = p_post;
  if p.id is null or not papo_ve(p, auth.uid()) then raise exception 'post nao encontrado'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'texto', c.texto, 'criado', c.criado, 'usuario', a.usuario, 'avatar', a.foto, 'meu', c.autor = auth.uid()) order by c.id)
    from (select * from papo_comentarios where post = p_post order by id desc limit 60) c join papo_perfis a on a.id = c.autor), '[]'::jsonb);
end $$;

create or replace function public.papo_comentar(p_post bigint, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); p papo_posts%rowtype;
begin
  if not exists (select 1 from papo_perfis where id = eu) then raise exception 'crie seu perfil no Papo Reto'; end if;
  if exists (select 1 from perfis where id = eu and banido) then raise exception 'sem permissao'; end if;
  select * into p from papo_posts where id = p_post;
  if p.id is null or not papo_ve(p, eu) then raise exception 'post nao encontrado'; end if;
  if not (p.autor = eu or p.comentarios = 'todos' or p.comentarios = 'seguidores' and exists (select 1 from papo_seguir where seguidor = eu and seguido = p.autor)) then
    raise exception 'comentarios fechados nesse post'; end if;
  if (select count(*) from papo_comentarios where autor = eu and criado > now() - interval '1 minute') >= 6 then raise exception 'calma: espere um pouco para comentar'; end if;
  insert into papo_comentarios (post, autor, texto) values (p_post, eu, left(trim(p_texto), 200));
  if p.autor <> eu then perform avisar(p.autor, format('💬 Papo Reto: @%s comentou no seu post.', (select usuario from papo_perfis where id = eu))); end if;
end $$;

create or replace function public.papo_apagar_comentario(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from papo_comentarios c where c.id = p_id and (c.autor = auth.uid() or exists (select 1 from papo_posts p where p.id = c.post and p.autor = auth.uid())
    or exists (select 1 from perfis where id = auth.uid() and cargo in ('admin', 'moderador')));
  if not found then raise exception 'sem permissao'; end if;
end $$;

do $$ declare f text; begin
  foreach f in array array['escolher_celular(text)', 'comprar_celular(text)', 'papo_salvar_perfil(text,text,integer,text,text)', 'papo_postar(text,text,text,boolean,text)',
    'papo_apagar(bigint)', 'papo_feed(text,bigint)', 'papo_perfil(text)', 'papo_buscar(text)', 'papo_seguir(text,boolean)', 'papo_curtir(bigint,boolean)',
    'papo_comentarios(bigint)', 'papo_comentar(bigint,text)', 'papo_apagar_comentario(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.papo_json(papo_posts, uuid) from public, anon, authenticated;
revoke all on function public.papo_ve(papo_posts, uuid) from public, anon, authenticated;

-- fotos: bucket público, cada um só envia na própria pasta
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('papo', 'papo', true, 614400, array['image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 614400, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists papo_ler on storage.objects;
create policy papo_ler on storage.objects for select using (bucket_id = 'papo');
drop policy if exists papo_enviar on storage.objects;
create policy papo_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'papo' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists papo_apagar_foto on storage.objects;
create policy papo_apagar_foto on storage.objects for delete to authenticated
  using (bucket_id = 'papo' and ((storage.foldername(name))[1] = auth.uid()::text
         or exists (select 1 from public.perfis a where a.id = auth.uid() and a.cargo in ('admin', 'moderador'))));
notify pgrst, 'reload schema';
