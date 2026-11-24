-- 150: Papo Reto — denúncia de post (aparece em Denúncias no painel da equipe) e aviso de curtida (22b).
-- Rode depois do 149.
create table if not exists public.papo_denuncias (
  id bigserial primary key,
  post bigint not null references public.papo_posts(id) on delete cascade,
  autor uuid not null references public.perfis(id) on delete cascade,
  motivo text not null check (motivo in ('ofensa', 'nudez', 'violencia', 'spam', 'outro')),
  criada timestamptz not null default now(),
  resolvida boolean not null default false,
  unique (post, autor)
);
create index if not exists papo_denuncias_abertas on public.papo_denuncias (resolvida, criada desc);
alter table public.papo_denuncias enable row level security;
-- curtida avisa o dono só na primeira vez (curtir e descurtir várias vezes não manda vários avisos)
create table if not exists public.papo_curtiu_aviso (post bigint not null references public.papo_posts(id) on delete cascade, quem uuid not null, primary key (post, quem));
alter table public.papo_curtiu_aviso enable row level security;

create or replace function public.papo_denunciar(p_post bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare p papo_posts%rowtype;
begin
  if auth.uid() is null then raise exception 'sem permissao'; end if;
  select * into p from papo_posts where id = p_post;
  if p.id is null or not papo_ve(p, auth.uid()) then raise exception 'post nao encontrado'; end if;
  if p.autor = auth.uid() then raise exception 'post invalido'; end if;
  if (select count(*) from papo_denuncias where autor = auth.uid() and criada > now() - interval '1 hour') >= 10 then raise exception 'muitas denuncias'; end if;
  insert into papo_denuncias (post, autor, motivo) values (p_post, auth.uid(), p_motivo)
    on conflict (post, autor) do update set motivo = excluded.motivo, criada = now(), resolvida = false;
end $$;

create or replace function public.papo_curtir(p_post bigint, p_sim boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); p papo_posts%rowtype;
begin
  if not exists (select 1 from papo_perfis where id = eu) then raise exception 'crie seu perfil no Papo Reto'; end if;
  select * into p from papo_posts where id = p_post;
  if p.id is null or not papo_ve(p, eu) then raise exception 'post nao encontrado'; end if;
  if p_sim then
    insert into papo_curtidas (post, quem) values (p_post, eu) on conflict do nothing;
    if p.autor <> eu then
      insert into papo_curtiu_aviso (post, quem) values (p_post, eu) on conflict do nothing;
      if found then perform avisar(p.autor, format('🔥 Papo Reto: @%s curtiu o seu post.', (select usuario from papo_perfis where id = eu))); end if;
    end if;
  else delete from papo_curtidas where post = p_post and quem = eu; end if;
  return (select count(*) from papo_curtidas where post = p_post);
end $$;

-- painel: posts denunciados (um por post, com os motivos e quantas denúncias)
create or replace function public.admin_papo_denuncias() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) not in ('admin', 'moderador') then raise exception 'sem permissao'; end if;
  return coalesce((select jsonb_agg(x order by x->>'ultima' desc) from (
    select jsonb_build_object('post', p.id, 'foto', p.foto, 'legenda', p.legenda, 'usuario', a.usuario, 'autor', p.autor, 'autor_nome', pf.nome,
      'vezes', count(*), 'motivos', jsonb_agg(distinct d.motivo), 'ultima', max(d.criada)) x
    from papo_denuncias d join papo_posts p on p.id = d.post join papo_perfis a on a.id = p.autor join perfis pf on pf.id = p.autor
    where not d.resolvida group by p.id, a.usuario, pf.nome) q), '[]'::jsonb);
end $$;
create or replace function public.admin_papo_resolver(p_post bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) not in ('admin', 'moderador') then raise exception 'sem permissao'; end if;
  update papo_denuncias set resolvida = true where post = p_post;
end $$;

do $$ declare f text; begin
  foreach f in array array['papo_denunciar(bigint,text)', 'papo_curtir(bigint,boolean)', 'admin_papo_denuncias()', 'admin_papo_resolver(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
