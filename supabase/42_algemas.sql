-- Fator RP - algemas para quem trabalha na segurança.
-- Algemam: Polícia, PRF, Exército, o prefeito, até 2 seguranças nomeados pelo prefeito, moderadores e o administrador.
-- O algemado fica passivo (não ataca, não age); quem algemou pode "Segurar" e levar ele junto.
-- Tiram as algemas: quem algemou, moderadores e o administrador. Qualquer um com um alicate de corte
-- (vendido pelo contrabandista, não é crime) também liberta. A equipe não pode ser algemada.
-- Rode depois do 41b.

alter table public.perfis add column if not exists algemado_por uuid references public.perfis (id) on delete set null;
alter table public.prefeitura add column if not exists seguranca1 uuid references public.perfis (id) on delete set null;
alter table public.prefeitura add column if not exists seguranca2 uuid references public.perfis (id) on delete set null;

insert into public.precos (item, nome, compra, venda, fome) values ('alicate', 'Alicate de corte', null, 600, 0)
on conflict (item) do update set nome = excluded.nome, compra = null, venda = excluded.venda;

-- algemas tiradas por qualquer caminho (prisão, painel...) apagam quem algemou
create or replace function public.limpar_algemado_por() returns trigger
language plpgsql as $$
begin
  if not new.algemado then new.algemado_por := null; end if;
  return new;
end $$;
drop trigger if exists limpar_algemado_por on public.perfis;
create trigger limpar_algemado_por before update of algemado on public.perfis
  for each row execute function public.limpar_algemado_por();

create or replace function public.pode_algemar() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfis p, prefeitura f
    where p.id = auth.uid() and f.id = 1 and not p.banido and not p.algemado and coalesce(p.pena_seg, 0) = 0
      and (p.cargo in ('admin', 'moderador') or p.policial or p.prf or p.profissao = 'exercito'
           or f.prefeito = p.id or f.seguranca1 = p.id or f.seguranca2 = p.id));
$$;

create or replace function public.algemar(p_alvo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode_algemar() then raise exception 'sem permissao'; end if;
  if p_alvo is null or p_alvo = auth.uid() then raise exception 'jogador invalido'; end if;
  if cargo_de(p_alvo) <> 'jogador' then raise exception 'algemas nao funcionam na equipe'; end if;
  update perfis set algemado = true, algemado_por = auth.uid() where id = p_alvo and not algemado and coalesce(pena_seg, 0) = 0;
  if not found then raise exception 'ja esta algemado'; end if;
end $$;

create or replace function public.soltar_algemas(p_alvo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare equipe boolean := (select cargo in ('admin', 'moderador') from perfis where id = auth.uid());
begin
  update perfis set algemado = false where id = p_alvo and algemado and (algemado_por = auth.uid() or equipe);
  if not found then raise exception 'sem permissao'; end if;
end $$;

create or replace function public.cortar_algemas(p_alvo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_alvo = auth.uid() then raise exception 'alguem precisa cortar por voce'; end if;
  if (select algemado from perfis where id = auth.uid()) then raise exception 'voce esta algemado'; end if;
  if not exists (select 1 from perfis where id = p_alvo and algemado) then raise exception 'jogador nao esta algemado'; end if;
  perform dar_item(auth.uid(), 'alicate', -1);
  update perfis set algemado = false where id = p_alvo;
end $$;

create or replace function public.comprar_alicate() returns integer
language plpgsql security definer set search_path = public as $$
begin
  update perfis set moedas = moedas - 2500 where id = auth.uid() and moedas >= 2500 and not banido;
  if not found then raise exception 'moedas insuficientes'; end if;
  return dar_item(auth.uid(), 'alicate', 1);
end $$;

-- o prefeito nomeia até 2 seguranças pelo nome (nome vazio tira)
create or replace function public.prefeito_seguranca(p_slot integer, p_nome text) returns text
language plpgsql security definer set search_path = public as $$
declare alvo uuid; nome_ok text;
begin
  if (select prefeito from prefeitura where id = 1) is distinct from auth.uid() then raise exception 'so o prefeito'; end if;
  if p_slot not in (1, 2) then raise exception 'vaga invalida'; end if;
  if coalesce(trim(p_nome), '') <> '' then
    select id, nome into alvo, nome_ok from perfis where lower(nome) = lower(trim(p_nome)) and not banido limit 1;
    if alvo is null then raise exception 'jogador nao encontrado'; end if;
    if alvo = auth.uid() then raise exception 'jogador invalido'; end if;
  end if;
  if p_slot = 1 then update prefeitura set seguranca1 = alvo where id = 1; else update prefeitura set seguranca2 = alvo where id = 1; end if;
  return nome_ok;
end $$;

-- painel: quem algema pelo painel também fica como "quem algemou"
create or replace function public.admin_algemar(alvo uuid, ligado boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode('algemar') and (select cargo from perfis where id = auth.uid()) not in ('admin', 'moderador') then raise exception 'sem permissao'; end if;
  if not pode_agir_em(alvo) then raise exception 'voce nao pode algemar esse jogador'; end if;
  if ligado and cargo_de(alvo) <> 'jogador' then raise exception 'algemas nao funcionam na equipe'; end if;
  update perfis set algemado = ligado, algemado_por = case when ligado then auth.uid() end where id = alvo;
  perform registrar(alvo, case when ligado then 'algemar' else 'soltar_algemas' end);
end $$;

do $$
declare f text;
begin
  foreach f in array array['pode_algemar()', 'algemar(uuid)', 'soltar_algemas(uuid)', 'cortar_algemas(uuid)', 'comprar_alicate()', 'prefeito_seguranca(integer, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke execute on function public.limpar_algemado_por() from public, anon, authenticated;
end $$;
