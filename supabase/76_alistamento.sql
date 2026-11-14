-- Fator RP - alistamento no Exército com aprovação. Rode depois do 75.
-- O civil pede na guarita de alistamento (fora do portão do quartel). Um oficial do Exército
-- (Tenente para cima, 1800 min de carreira) ou o administrador aprova ou recusa. A equipe continua entrando direto.

create table if not exists public.alistamentos (
  id          bigint generated always as identity primary key,
  jogador     uuid not null references public.perfis (id) on delete cascade,
  nome        text not null,
  status      text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  criado      timestamptz not null default now(),
  decidido_por uuid references public.perfis (id) on delete set null,
  decidido_em timestamptz
);
create index if not exists alistamentos_pend on public.alistamentos (status, criado);
alter table public.alistamentos enable row level security;   -- só pelas funções abaixo

create or replace function public.oficial_exercito(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = p_uid and cargo = 'admin')
      or exists (select 1 from perfis p join carreiras c on c.jogador = p.id and c.carreira = 'exercito'
                 where p.id = p_uid and p.profissao = 'exercito' and c.minutos >= 1800);
$$;

-- o mesmo entrar_profissao do 62b, mas o Exército agora exige aprovação (a equipe entra direto)
create or replace function public.entrar_profissao(p_profissao text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p_profissao not in ('medico', 'bombeiro', 'jornalista', 'exercito', 'motorista', 'piloto', 'controlador', 'fiscal', 'gari', 'mecanico') then raise exception 'profissao invalida'; end if;
  if p.policial or p.prf then raise exception 'saia da policia antes'; end if;
  if p.crimes > 0 then raise exception 'procurado nao pode trabalhar no servico publico'; end if;
  if p_profissao = 'exercito' and p.expulso_exercito then raise exception 'voce foi expulso do exercito'; end if;
  if p_profissao = 'exercito' and p.cargo not in ('admin', 'moderador') then raise exception 'alistamento precisa de aprovacao'; end if;
  if p.cargo not in ('admin', 'moderador') then
    if p_profissao = 'medico' and not ('B' = any(p.habilitacoes)) then raise exception 'precisa da carteira B (autoescola)'; end if;
    if p_profissao in ('bombeiro', 'gari') and not ('C' = any(p.habilitacoes)) then raise exception 'precisa da carteira C (autoescola)'; end if;
    if p_profissao = 'motorista' and not ('D' = any(p.habilitacoes)) then raise exception 'precisa da carteira D (autoescola)'; end if;
    if p_profissao = 'piloto' and not ('AV' = any(p.habilitacoes)) then raise exception 'precisa do breve de piloto (autoescola)'; end if;
  end if;
  update perfis set profissao = p_profissao, profissao_desde = now() where id = p.id;
end $$;

create or replace function public.pedir_alistamento() returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.profissao = 'exercito' then raise exception 'voce ja e do exercito'; end if;
  if p.policial or p.prf then raise exception 'saia da policia antes'; end if;
  if p.crimes > 0 then raise exception 'procurado nao pode trabalhar no servico publico'; end if;
  if p.expulso_exercito then raise exception 'voce foi expulso do exercito'; end if;
  if exists (select 1 from alistamentos where jogador = p.id and status = 'pendente') then return 'pendente'; end if;
  if exists (select 1 from alistamentos where jogador = p.id and status = 'recusado' and decidido_em > now() - interval '30 minutes') then
    raise exception 'alistamento recusado: tente de novo mais tarde';
  end if;
  insert into alistamentos (jogador, nome) values (p.id, p.nome);
  return 'enviado';
end $$;

create or replace function public.meu_alistamento() returns text
language sql stable security definer set search_path = public as $$
  select status from alistamentos where jogador = auth.uid() order by id desc limit 1;
$$;

create or replace function public.alistamentos_pendentes() returns table (id bigint, nome text, criado timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not oficial_exercito(auth.uid()) then raise exception 'so oficiais do exercito'; end if;
  return query select a.id, a.nome, a.criado from alistamentos a where a.status = 'pendente' order by a.criado limit 30;
end $$;

create or replace function public.decidir_alistamento(p_id bigint, p_aprovar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a alistamentos%rowtype; c perfis%rowtype;
begin
  if not oficial_exercito(auth.uid()) then raise exception 'so oficiais do exercito'; end if;
  select * into a from alistamentos where alistamentos.id = p_id and status = 'pendente' for update;
  if not found then raise exception 'pedido invalido'; end if;
  select * into c from perfis where perfis.id = a.jogador;
  if p_aprovar and (c.crimes > 0 or c.policial or c.prf or c.expulso_exercito or c.profissao = 'exercito') then
    update alistamentos set status = 'recusado', decidido_por = auth.uid(), decidido_em = now() where alistamentos.id = p_id;
    raise exception 'o candidato nao pode entrar agora';
  end if;
  update alistamentos set status = case when p_aprovar then 'aprovado' else 'recusado' end, decidido_por = auth.uid(), decidido_em = now() where alistamentos.id = p_id;
  if p_aprovar then update perfis set profissao = 'exercito', profissao_desde = now() where perfis.id = a.jogador; end if;
  insert into comandos (alvo, autor, tipo, dados) values (a.jogador, auth.uid(), 'aviso', jsonb_build_object('texto',
    case when p_aprovar then '🎖️ Alistamento APROVADO! Bem-vindo ao Exército, Recruta.' else '❌ Seu alistamento no Exército foi recusado.' end));
end $$;

do $$
declare f text;
begin
  foreach f in array array['pedir_alistamento()', 'meu_alistamento()', 'alistamentos_pendentes()', 'decidir_alistamento(bigint, boolean)', 'oficial_exercito(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
