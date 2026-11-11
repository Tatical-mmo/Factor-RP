-- Fator RP - excluir a própria conta, denunciar e bloquear jogadores.
-- Excluir: apaga o login e todos os dados do jogador. Se ele lidera um clã, o membro mais antigo vira líder.
--   O administrador não pode se excluir por aqui.
-- Denunciar: motivo + detalhes; o administrador e os moderadores veem no painel (aba Denúncias) e resolvem.
-- Bloquear: o bloqueado some do seu chat e da sua voz (no seu aparelho).
-- Rode depois do 45b.

create or replace function public.excluir_minha_conta(p_confirmacao text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare eu uuid := auth.uid(); c record;
begin
  if eu is null then raise exception 'sem login'; end if;
  if p_confirmacao is distinct from 'EXCLUIR' then raise exception 'confirmacao invalida'; end if;
  if (select cargo from public.perfis where id = eu) = 'admin' then raise exception 'o administrador nao pode excluir a conta'; end if;
  for c in select id from public.clas where lider = eu loop
    update public.clas set lider = (select jogador from public.membros_cla where cla = c.id and jogador <> eu order by desde limit 1) where id = c.id
      and exists (select 1 from public.membros_cla where cla = c.id and jogador <> eu);
  end loop;
  delete from public.perfis where id = eu;
  delete from auth.users where id = eu;
end $$;

create table if not exists public.denuncias (
  id        bigint generated always as identity primary key,
  autor     uuid references public.perfis (id) on delete set null,
  alvo      uuid references public.perfis (id) on delete cascade,
  motivo    text not null check (motivo in ('ofensa', 'assedio', 'trapaca', 'nome', 'voz', 'outro')),
  detalhes  text check (char_length(detalhes) <= 400),
  criada_em timestamptz not null default now(),
  resolvida boolean not null default false,
  resolvida_por uuid references public.perfis (id) on delete set null
);
create index if not exists denuncias_abertas on public.denuncias (resolvida, criada_em desc);
create table if not exists public.bloqueios (
  dono uuid not null references public.perfis (id) on delete cascade,
  alvo uuid not null references public.perfis (id) on delete cascade,
  em   timestamptz not null default now(),
  primary key (dono, alvo)
);
do $$
begin
  alter table public.denuncias enable row level security;
  alter table public.bloqueios enable row level security;
  drop policy if exists "meus bloqueios" on public.bloqueios;
  create policy "meus bloqueios" on public.bloqueios for select using (dono = auth.uid());
  revoke all on public.denuncias from anon, authenticated;
  revoke all on public.bloqueios from anon, authenticated;
  grant select on public.bloqueios to authenticated;
end $$;

create or replace function public.denunciar(p_alvo uuid, p_motivo text, p_detalhes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_alvo = auth.uid() then raise exception 'jogador invalido'; end if;
  if not exists (select 1 from perfis where id = p_alvo) then raise exception 'jogador invalido'; end if;
  if (select count(*) from denuncias where autor = auth.uid() and criada_em > now() - interval '1 hour') >= 10 then raise exception 'muitas denuncias'; end if;
  insert into denuncias (autor, alvo, motivo, detalhes) values (auth.uid(), p_alvo, p_motivo, left(nullif(btrim(coalesce(p_detalhes, '')), ''), 400));
end $$;

create or replace function public.bloquear(p_alvo uuid, p_sim boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_alvo = auth.uid() then raise exception 'jogador invalido'; end if;
  if p_sim then insert into bloqueios (dono, alvo) values (auth.uid(), p_alvo) on conflict do nothing;
  else delete from bloqueios where dono = auth.uid() and alvo = p_alvo; end if;
end $$;

-- painel: denúncias abertas (equipe)
create or replace function public.admin_denuncias() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) not in ('admin', 'moderador') then raise exception 'sem permissao'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'motivo', d.motivo, 'detalhes', d.detalhes, 'criada_em', d.criada_em,
      'alvo', d.alvo, 'alvo_nome', a.nome, 'autor_nome', coalesce(u.nome, '(conta excluída)'),
      'vezes', (select count(*) from denuncias x where x.alvo = d.alvo and not x.resolvida)) order by d.criada_em desc)
    from denuncias d join perfis a on a.id = d.alvo left join perfis u on u.id = d.autor where not d.resolvida), '[]'::jsonb);
end $$;
create or replace function public.admin_resolver_denuncia(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) not in ('admin', 'moderador') then raise exception 'sem permissao'; end if;
  update denuncias set resolvida = true, resolvida_por = auth.uid() where id = p_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['excluir_minha_conta(text)', 'denunciar(uuid, text, text)', 'bloquear(uuid, boolean)', 'admin_denuncias()', 'admin_resolver_denuncia(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
