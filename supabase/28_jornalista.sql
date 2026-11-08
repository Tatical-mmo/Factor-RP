-- Fator RP - profissão jornalista e o Jornal da Cidade.
-- O jornalista em serviço vai até um acontecimento (incêndio, ocorrência policial ou alguém ferido),
-- faz a reportagem e ganha 200. A manchete aparece para todos no Jornal da Cidade.
-- Cada acontecimento rende só uma reportagem (o primeiro jornalista que chegar).

alter table public.perfis drop constraint if exists perfis_profissao_ok;
alter table public.perfis add constraint perfis_profissao_ok check (profissao in ('medico', 'bombeiro', 'jornalista'));

create or replace function public.entrar_profissao(p_profissao text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p_profissao not in ('medico', 'bombeiro', 'jornalista') then raise exception 'profissao invalida'; end if;
  if p.policial or p.prf then raise exception 'saia da policia antes'; end if;
  if p.crimes > 0 then raise exception 'procurado nao pode trabalhar no servico publico'; end if;
  update perfis set profissao = p_profissao, profissao_desde = now() where id = p.id;
end $$;

create table if not exists public.noticias (
  id         bigint generated always as identity primary key,
  autor      uuid references public.perfis (id) on delete set null,
  autor_nome text not null,
  tipo       text not null check (tipo in ('incendio', 'ocorrencia', 'ferido')),
  ref        text not null,
  titulo     text not null check (char_length(titulo) between 5 and 120),
  x          real,
  z          real,
  criada_em  timestamptz not null default now()
);
create unique index if not exists noticias_ref on public.noticias (tipo, ref);
do $$
begin
  alter table public.noticias enable row level security;
  drop policy if exists "leitura publica" on public.noticias;
  create policy "leitura publica" on public.noticias for select using (true);
  revoke all on public.noticias from anon, authenticated;
  grant select on public.noticias to anon, authenticated;
end $$;

-- reportagem: o jogo confere a distância; o banco confere se o acontecimento existe e se ainda não virou notícia
create or replace function public.publicar_noticia(p_tipo text, p_ref text, p_titulo text, p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; ok boolean;
begin
  p := jogador_livre();
  if p.profissao is distinct from 'jornalista' then raise exception 'so jornalistas em servico'; end if;
  ok := case p_tipo
    when 'incendio' then exists (select 1 from incendios where id::text = p_ref and status = 'ativo')
    when 'ocorrencia' then exists (select 1 from ocorrencias where id::text = p_ref and criada_em > now() - interval '15 minutes')
    when 'ferido' then exists (select 1 from perfis where id::text = split_part(p_ref, ':', 1) and ultima_morte > now() - interval '2 minutes' and id <> p.id)
    else false end;
  if not ok then raise exception 'esse acontecimento ja passou'; end if;
  insert into noticias (autor, autor_nome, tipo, ref, titulo, x, z) values (p.id, p.nome, p_tipo, p_ref, left(p_titulo, 120), p_x, p_z)
    on conflict (tipo, ref) do nothing;
  if not found then raise exception 'outro jornalista ja fez essa reportagem'; end if;
  update perfis set moedas = moedas + 200 where id = p.id;
  delete from noticias where id in (select id from noticias order by id desc offset 60);
  return 200;
end $$;

do $$
begin
  revoke all on function public.publicar_noticia(text, text, text, real, real) from public, anon;
  grant execute on function public.publicar_noticia(text, text, text, real, real) to authenticated;
end $$;
