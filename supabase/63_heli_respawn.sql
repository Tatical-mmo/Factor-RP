-- 63 · Revisão dos helicópteros (a cada 7 voos) e tempo para renascer no hospital (ajustável pelo admin).
-- Rode depois do 62b.

-- ---------------------------------------------------------------- helicópteros: um contador por helicóptero
-- chave: 'carro:<id>' (helicóptero comprado) ou 'exercito' (o do Quartel)
create table if not exists public.helis_revisao (
  chave       text primary key check (chave ~ '^(carro:[0-9]{1,12}|exercito)$'),
  voos        integer not null default 0,
  ultimo_voo  timestamptz,
  revisado_em timestamptz,
  revisado_por text
);
alter table public.helis_revisao enable row level security;
drop policy if exists "leitura publica" on public.helis_revisao;
create policy "leitura publica" on public.helis_revisao for select using (true);
revoke all on public.helis_revisao from anon, authenticated;
grant select on public.helis_revisao to anon, authenticated;

-- decolou: mais um voo (no máximo um a cada 30 s por helicóptero)
create or replace function public.voo_heli(p_chave text) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  if auth.uid() is null then raise exception 'sem perfil'; end if;
  if p_chave !~ '^(carro:[0-9]{1,12}|exercito)$' then raise exception 'helicoptero invalido'; end if;
  insert into helis_revisao (chave, voos, ultimo_voo) values (p_chave, 1, now())
  on conflict (chave) do update set voos = helis_revisao.voos + 1, ultimo_voo = now()
    where helis_revisao.ultimo_voo is null or helis_revisao.ultimo_voo < now() - interval '30 seconds'
  returning voos into v;
  if v is null then select voos into v from helis_revisao where chave = p_chave; end if;
  return coalesce(v, 0);
end $$;

-- revisão: mecânico NPC do hangar (5.000, pago por quem pede) ou jogador mecânico (+300)
create or replace function public.revisar_heli(p_chave text, p_mecanico boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; h helis_revisao%rowtype;
begin
  p := jogador_livre();
  select * into h from helis_revisao where chave = p_chave for update;
  if h.chave is null or h.voos = 0 then raise exception 'aviao ja revisado'; end if;
  if p_mecanico then
    if p.profissao is distinct from 'mecanico' and p.cargo <> 'admin' then raise exception 'so mecanicos'; end if;
    if h.revisado_em is not null and h.revisado_em > now() - interval '30 seconds' then raise exception 'espere um pouco'; end if;
    update helis_revisao set voos = 0, revisado_em = now(), revisado_por = p.nome where chave = h.chave;
    update perfis set moedas = moedas + 300 where id = p.id;
    return 300;
  end if;
  if p.moedas < 5000 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 5000 where id = p.id;
  update prefeitura set cofre = cofre + 2500 where id = 1;
  update helis_revisao set voos = 0, revisado_em = now(), revisado_por = 'Mecânico do hangar' where chave = h.chave;
  return 5000;
end $$;

-- ---------------------------------------------------------------- tempo para renascer no hospital
alter table public.config_jogo add column if not exists respawn_seg integer not null default 90;
alter table public.config_jogo drop constraint if exists config_jogo_respawn_ok;
alter table public.config_jogo add constraint config_jogo_respawn_ok check (respawn_seg between 15 and 300);

create or replace function public.admin_respawn(p_seg integer) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer := greatest(15, least(300, coalesce(p_seg, 90)));
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  update config_jogo set respawn_seg = v, atualizado = now() where id = 1;
  return v;
end $$;

-- conta do hospital: vale para mortes dos últimos 15 minutos (o tempo de renascer pode ser maior que 2 minutos)
create or replace function public.alta_hospital() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; conta integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null then raise exception 'sem permissao'; end if;
  if p.ultima_morte is null or p.ultima_morte < now() - interval '15 minutes' then return 0; end if;
  if p.socorrido_em is not null and p.socorrido_em >= p.ultima_morte then return 0; end if;
  conta := least(100, p.moedas);
  update perfis set moedas = moedas - conta, socorrido_em = now() where id = p.id;
  update prefeitura set cofre = cofre + conta where id = 1;
  return conta;
end $$;

do $$
declare f text;
begin
  foreach f in array array['voo_heli(text)', 'revisar_heli(text, boolean)', 'admin_respawn(integer)', 'alta_hospital()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
