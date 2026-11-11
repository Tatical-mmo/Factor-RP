-- Fator RP - Lixeiros: a sociedade secreta do esgoto.
-- Só entra quem achar o bueiro certo (um dos 16 da cidade, sorteado e secreto) e pagar 5.000.
-- Membros entram e saem por qualquer bueiro. No esgoto: adicional de insalubridade por minuto (tabela de
-- salários do admin), coleta de lixo, contrabando entre bueiros, informações secretas (e denúncia anônima
-- à polícia) e resgate de procurados. Casas subterrâneas baratas (não evoluem).
-- Ser lixeiro não conta como emprego (é uma sociedade). Rode depois do 43.

alter table public.perfis add column if not exists lixeiro boolean not null default false;
alter table public.perfis add column if not exists lixeiro_pago timestamptz;
alter table public.perfis add column if not exists lixeiro_coleta timestamptz;
alter table public.perfis add column if not exists lixeiro_missao jsonb;
alter table public.perfis add column if not exists lixeiro_dica timestamptz;
alter table public.perfis add column if not exists lixeiro_resgate timestamptz;

create table if not exists public.esgoto_config (id integer primary key default 1 check (id = 1), bueiro_secreto integer not null);
insert into public.esgoto_config (id, bueiro_secreto) values (1, floor(random() * 16)::int) on conflict (id) do nothing;
do $$ begin alter table public.esgoto_config enable row level security; revoke all on public.esgoto_config from anon, authenticated; end $$;

create table if not exists public.casas_esgoto (
  id     integer primary key check (id between 1 and 8),
  dono   uuid unique references public.perfis (id) on delete set null,
  desde  timestamptz
);
insert into public.casas_esgoto (id) select g from generate_series(1, 8) g on conflict (id) do nothing;
do $$
begin
  alter table public.casas_esgoto enable row level security;
  drop policy if exists "leitura publica" on public.casas_esgoto;
  create policy "leitura publica" on public.casas_esgoto for select using (true);
  revoke all on public.casas_esgoto from anon, authenticated;
  grant select on public.casas_esgoto to anon, authenticated;
end $$;

insert into public.salarios (chave, rotulo, valor, ordem) values ('lixeiro', 'Lixeiros: insalubridade no esgoto (por minuto)', 35, 8)
on conflict (chave) do nothing;

create or replace function public.eu_lixeiro() returns perfis
language plpgsql stable security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if not p.lixeiro then raise exception 'so lixeiros'; end if;
  return p;
end $$;

-- é este o bueiro secreto? (não cobra nada)
create or replace function public.bueiro_secreto(p_bueiro integer) returns boolean
language sql stable security definer set search_path = public as $$
  select p_bueiro = (select bueiro_secreto from esgoto_config where id = 1);
$$;

create or replace function public.lixeiro_entrar(p_bueiro integer) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.lixeiro then return; end if;
  if not bueiro_secreto(p_bueiro) then raise exception 'bueiro trancado'; end if;
  update perfis set moedas = moedas - 5000, lixeiro = true where id = p.id and moedas >= 5000;
  if not found then raise exception 'moedas insuficientes'; end if;
end $$;

create or replace function public.lixeiro_sair() returns void
language sql security definer set search_path = public as $$
  update perfis set lixeiro = false, lixeiro_missao = null where id = auth.uid();
  update casas_esgoto set dono = null, desde = null where dono = auth.uid();
$$;

-- adicional de insalubridade: chamado a cada minuto pelo jogo enquanto o lixeiro está no esgoto
create or replace function public.lixeiro_insalubridade() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v integer := coalesce((select valor from salarios where chave = 'lixeiro'), 35);
begin
  p := eu_lixeiro();
  if p.lixeiro_pago is not null and p.lixeiro_pago > now() - interval '55 seconds' then return 0; end if;
  update perfis set moedas = moedas + v, lixeiro_pago = now() where id = p.id;
  return v;
end $$;

create or replace function public.lixeiro_coletar() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := eu_lixeiro();
  if p.lixeiro_coleta is not null and p.lixeiro_coleta > now() - interval '10 seconds' then raise exception 'devagar'; end if;
  update perfis set moedas = moedas + 120, lixeiro_coleta = now() where id = p.id;
  return 120;
end $$;

-- contrabando: pega o pacote no quadro e sai pelo bueiro sorteado, em até 10 min, sem a polícia ver
create or replace function public.lixeiro_contrabando() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; d integer;
begin
  p := eu_lixeiro();
  if p.lixeiro_missao is not null and (p.lixeiro_missao ->> 'ate')::timestamptz > now() then return (p.lixeiro_missao ->> 'destino')::int; end if;
  d := floor(random() * 16)::int;
  update perfis set lixeiro_missao = jsonb_build_object('destino', d, 'inicio', now(), 'ate', now() + interval '10 minutes') where id = p.id;
  return d;
end $$;

create or replace function public.lixeiro_entregar(p_bueiro integer, p_visto boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m jsonb;
begin
  p := eu_lixeiro(); m := p.lixeiro_missao;
  if m is null or (m ->> 'ate')::timestamptz < now() then raise exception 'sem pacote'; end if;
  if (m ->> 'destino')::int <> p_bueiro then raise exception 'bueiro errado'; end if;
  if (m ->> 'inicio')::timestamptz > now() - interval '30 seconds' then raise exception 'devagar'; end if;
  if p_visto then
    update perfis set lixeiro_missao = null, crimes = crimes + 1 where id = p.id;
    return 0;
  end if;
  update perfis set lixeiro_missao = null, moedas = moedas + 1500 where id = p.id;
  return 1500;
end $$;

-- o que se ouve nos túneis: procurados vistos nos últimos 10 min e assalto ao cargueiro
create or replace function public.lixeiro_informacoes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform eu_lixeiro();
  return jsonb_build_object(
    'procurados', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'crimes', crimes, 'recompensa', recompensa, 'x', pos_x, 'z', pos_z) order by crimes desc)
      from perfis where crimes > 0 and cargo = 'jogador' and coalesce(pena_seg, 0) = 0 and visto_em > now() - interval '10 minutes'), '[]'::jsonb),
    'assalto', assalto_navio_atual());
end $$;

-- denúncia anônima: avisa os policiais em serviço onde o procurado foi visto (400, a cada 5 min)
create or replace function public.lixeiro_denunciar(p_alvo uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a perfis%rowtype;
begin
  p := eu_lixeiro();
  if p.lixeiro_dica is not null and p.lixeiro_dica > now() - interval '5 minutes' then raise exception 'aguarde para outra denuncia'; end if;
  select * into a from perfis where id = p_alvo;
  if a.id is null or a.crimes < 1 or a.id = p.id then raise exception 'jogador invalido'; end if;
  insert into comandos (alvo, autor, tipo, dados)
    select id, null, 'aviso', jsonb_build_object('texto', format('🐀 Denúncia anônima: %s (procurado) foi visto perto de x %s, z %s.', a.nome, round(a.pos_x), round(a.pos_z)))
    from perfis where (policial or prf) and visto_em > now() - interval '10 minutes';
  update perfis set moedas = moedas + 400, lixeiro_dica = now() where id = p.id;
  return 400;
end $$;

-- resgate: o lixeiro levou um procurado pelo esgoto e ele saiu longe de onde entrou
create or replace function public.lixeiro_resgate(p_convidado uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := eu_lixeiro();
  if p.lixeiro_resgate is not null and p.lixeiro_resgate > now() - interval '3 minutes' then raise exception 'devagar'; end if;
  if not exists (select 1 from perfis where id = p_convidado and crimes > 0 and id <> p.id) then raise exception 'jogador invalido'; end if;
  update perfis set moedas = moedas + 800, lixeiro_resgate = now() where id = p.id;
  return 800;
end $$;

-- casas subterrâneas: 8.000, uma por jogador, não evoluem
create or replace function public.comprar_casa_esgoto(p_id integer) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := eu_lixeiro();
  if exists (select 1 from casas_esgoto where dono = p.id) then raise exception 'voce ja tem casa no esgoto'; end if;
  update casas_esgoto set dono = p.id, desde = now() where id = p_id and dono is null;
  if not found then raise exception 'casa ocupada'; end if;
  update perfis set moedas = moedas - 8000 where id = p.id and moedas >= 8000;
  if not found then raise exception 'moedas insuficientes'; end if;
end $$;
create or replace function public.vender_casa_esgoto() returns integer
language plpgsql security definer set search_path = public as $$
begin
  update casas_esgoto set dono = null, desde = null where dono = auth.uid();
  if not found then raise exception 'voce nao tem casa no esgoto'; end if;
  update perfis set moedas = moedas + 4000 where id = auth.uid();
  return 4000;
end $$;

do $$
declare f text;
begin
  foreach f in array array['bueiro_secreto(integer)', 'lixeiro_entrar(integer)', 'lixeiro_sair()', 'lixeiro_insalubridade()', 'lixeiro_coletar()', 'lixeiro_contrabando()',
    'lixeiro_entregar(integer, boolean)', 'lixeiro_informacoes()', 'lixeiro_denunciar(uuid)', 'lixeiro_resgate(uuid)', 'comprar_casa_esgoto(integer)', 'vender_casa_esgoto()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.eu_lixeiro() from public, anon, authenticated;
end $$;
