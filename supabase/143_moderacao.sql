-- 143: moderação — congelar jogador (estátua), ban por aparelho, controle do admin sobre invisível / nome escondido
-- Pode rodar mais de uma vez.

-- ------------------------------------------------------------ colunas novas no perfil
alter table public.perfis add column if not exists congelado boolean not null default false;
alter table public.perfis add column if not exists congelado_x real;
alter table public.perfis add column if not exists congelado_z real;
alter table public.perfis add column if not exists visivel_forcado integer not null default 0;

-- sem a permissão de invisível (ou rebaixado a jogador) o modo invisível desliga sozinho
create or replace function public.invisivel_sem_permissao() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.invisivel and new.cargo <> 'admin'
     and not (new.cargo = 'moderador' and coalesce((new.poderes ->> 'invisivel')::boolean, false)) then
    new.invisivel := false;
  end if;
  return new;
end $$;
drop trigger if exists invisivel_sem_permissao on public.perfis;
create trigger invisivel_sem_permissao before update on public.perfis
  for each row execute function public.invisivel_sem_permissao();

-- ------------------------------------------------------------ admin força o moderador a ficar visível (corpo e nome)
create or replace function public.admin_forcar_visivel(alvo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if cargo_de(auth.uid()) <> 'admin' then raise exception 'sem permissao'; end if;
  update perfis set invisivel = false, visivel_forcado = visivel_forcado + 1 where id = alvo;
  perform registrar(alvo, 'forcar_visivel');
end $$;

-- ------------------------------------------------------------ congelar (vira estátua para todos)
create or replace function public.admin_congelar(alvo uuid, ligado boolean, px real default null, pz real default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode('banir') then raise exception 'sem permissao'; end if;
  if not pode_agir_em(alvo) then raise exception 'voce nao pode congelar esse jogador'; end if;
  if ligado and cargo_de(alvo) = 'admin' then raise exception 'voce nao pode congelar esse jogador'; end if;
  update perfis set congelado = ligado,
    congelado_x = case when ligado then coalesce(px, pos_x) end,
    congelado_z = case when ligado then coalesce(pz, pos_z) end
  where id = alvo;
  perform registrar(alvo, case when ligado then 'congelar' else 'descongelar' end);
end $$;

-- ------------------------------------------------------------ aparelhos (código guardado no celular) e IP
create table if not exists public.aparelhos (
  conta     uuid not null references public.perfis(id) on delete cascade,
  aparelho  text not null,
  ip        text,
  visto_em  timestamptz not null default now(),
  primary key (conta, aparelho)
);
create index if not exists aparelhos_aparelho on public.aparelhos (aparelho);
create index if not exists aparelhos_ip on public.aparelhos (ip);

create table if not exists public.aparelhos_banidos (
  aparelho  text primary key,
  conta     uuid,
  em        timestamptz not null default now()
);
alter table public.aparelhos enable row level security;
alter table public.aparelhos_banidos enable row level security;
revoke all on public.aparelhos, public.aparelhos_banidos from anon, authenticated;   -- ninguém lê direto

-- chamado logo depois do login: grava aparelho + IP e diz se o aparelho está banido
create or replace function public.checar_aparelho(p_aparelho text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_ip text; v_ban boolean;
begin
  if auth.uid() is null or coalesce(length(p_aparelho), 0) < 8 or length(p_aparelho) > 80 then return false; end if;
  begin
    v_ip := trim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1));
  exception when others then v_ip := null; end;
  if v_ip = '' then v_ip := null; end if;
  select exists (select 1 from aparelhos_banidos where aparelho = p_aparelho) into v_ban;
  if exists (select 1 from perfis where id = auth.uid()) then
    insert into aparelhos (conta, aparelho, ip, visto_em) values (auth.uid(), p_aparelho, v_ip, now())
      on conflict (conta, aparelho) do update set ip = coalesce(excluded.ip, aparelhos.ip), visto_em = now();
  end if;
  return v_ban;
end $$;

-- banido (por qualquer caminho: painel, averiguar, anti-trapaça) → bane os aparelhos dele; desbanido → libera
create or replace function public.ban_aparelhos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.banido and not coalesce(old.banido, false) then
    insert into aparelhos_banidos (aparelho, conta)
      select aparelho, new.id from aparelhos where conta = new.id
      on conflict (aparelho) do nothing;
    new.congelado := false;
  elsif not new.banido and coalesce(old.banido, false) then
    delete from aparelhos_banidos where conta = new.id;
  end if;
  return new;
end $$;
drop trigger if exists ban_aparelhos on public.perfis;
create trigger ban_aparelhos before update of banido on public.perfis
  for each row execute function public.ban_aparelhos();

-- contas que usaram o mesmo aparelho ou o mesmo IP (pista para o admin)
create or replace function public.admin_contas_ligadas(alvo uuid)
returns table (id uuid, nome text, banido boolean, via text)
language plpgsql security definer set search_path = public as $$
begin
  if not pode('banir') then raise exception 'sem permissao'; end if;
  return query
    select p.id, p.nome, p.banido,
      case when bool_or(a2.aparelho = a1.aparelho) then 'aparelho' else 'IP' end
    from aparelhos a1
    join aparelhos a2 on a2.conta <> a1.conta and (a2.aparelho = a1.aparelho or (a1.ip is not null and a2.ip = a1.ip))
    join perfis p on p.id = a2.conta
    where a1.conta = alvo
    group by p.id, p.nome, p.banido
    order by 4, p.nome
    limit 30;
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_forcar_visivel(uuid)', 'admin_congelar(uuid, boolean, real, real)', 'checar_aparelho(text)', 'admin_contas_ligadas(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.ban_aparelhos() from public, anon, authenticated;
  revoke all on function public.invisivel_sem_permissao() from public, anon, authenticated;
end $$;
