-- Fator RP - amigos (para o chat privado).
-- O chat em si não é salvo em lugar nenhum: as mensagens passam ao vivo e somem.
-- Aqui ficam só os pedidos de amizade e as amizades aceitas.

create table if not exists public.amizades (
  de       uuid not null references public.perfis (id) on delete cascade,
  para     uuid not null references public.perfis (id) on delete cascade,
  aceita   boolean not null default false,
  criada_em timestamptz not null default now(),
  primary key (de, para),
  check (de <> para)
);
do $$
begin
  alter table public.amizades enable row level security;
  drop policy if exists "proprias" on public.amizades;
  create policy "proprias" on public.amizades for select using (auth.uid() in (de, para));
  revoke all on public.amizades from anon, authenticated;
  grant select on public.amizades to authenticated;
end $$;

create or replace function public.pedir_amizade(p_nome text) returns text
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); outro perfis%rowtype;
begin
  if eu is null then raise exception 'sem permissao'; end if;
  select * into outro from perfis where lower(nome) = lower(trim(p_nome));
  if outro.id is null then raise exception 'jogador nao encontrado'; end if;
  if outro.id = eu then raise exception 'voce nao pode adicionar a si mesmo'; end if;
  if exists (select 1 from amizades where de = eu and para = outro.id) or exists (select 1 from amizades where de = outro.id and para = eu and aceita) then
    raise exception 'pedido ja existe';
  end if;
  -- se ele já tinha pedido, vira amizade na hora
  if exists (select 1 from amizades where de = outro.id and para = eu) then
    update amizades set aceita = true where de = outro.id and para = eu;
    perform avisar(outro.id, format('👥 Você e %s agora são amigos.', (select nome from perfis where id = eu)));
    return 'aceita';
  end if;
  insert into amizades (de, para) values (eu, outro.id);
  perform avisar(outro.id, format('👥 %s quer ser seu amigo. Abra 👥 Amigos para aceitar.', (select nome from perfis where id = eu)));
  return 'pedido';
end $$;

create or replace function public.responder_amizade(p_de uuid, p_aceitar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_aceitar then
    update amizades set aceita = true where de = p_de and para = auth.uid();
    if found then perform avisar(p_de, format('👥 %s aceitou sua amizade.', (select nome from perfis where id = auth.uid()))); end if;
  else
    delete from amizades where de = p_de and para = auth.uid();
  end if;
end $$;

create or replace function public.desfazer_amizade(p_outro uuid) returns void
language sql security definer set search_path = public as $$
  delete from amizades where (de = auth.uid() and para = p_outro) or (de = p_outro and para = auth.uid());
$$;

create or replace function public.meus_amigos() returns table (id uuid, nome text, aceita boolean, pediu_eu boolean)
language sql stable security definer set search_path = public as $$
  select case when a.de = auth.uid() then a.para else a.de end, p.nome, a.aceita, a.de = auth.uid()
    from amizades a join perfis p on p.id = case when a.de = auth.uid() then a.para else a.de end
   where auth.uid() in (a.de, a.para) order by a.aceita desc, p.nome;
$$;

do $$
declare f text;
begin
  foreach f in array array['pedir_amizade(text)', 'responder_amizade(uuid, boolean)', 'desfazer_amizade(uuid)', 'meus_amigos()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
