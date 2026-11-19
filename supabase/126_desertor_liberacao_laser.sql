-- 126: desertor barrado nas corporações e dano das armas laser ajustável pelo administrador. Rode depois do 125.
--  · Desertor não entra na Polícia, PRF, BOPE nem no Exército, a menos que um oficial de patente alta daquela
--    corporação libere a entrada (vale 24 h). Polícia/BOPE: Tenente para cima; PRF: Inspetor para cima;
--    Exército: Tenente para cima. Mesmo liberado, a ficha continua mostrando DESERTOR até o admin perdoar.
--  · O dano de cada arma laser fica numa tabela que o admin muda no painel do laboratório.

create table if not exists public.desertor_liberacoes (
  jogador uuid not null references public.perfis (id) on delete cascade,
  corp text not null check (corp in ('policia', 'prf', 'bope', 'exercito')),
  ate timestamptz not null, por uuid,
  primary key (jogador, corp)
);
alter table public.desertor_liberacoes enable row level security;
revoke all on public.desertor_liberacoes from anon, authenticated;

-- barra a entrada do desertor sem liberação (vale para qualquer função que coloca alguém na corporação)
create or replace function public.barrar_desertor() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not new.desertor then return new; end if;
  if new.bope and not coalesce(old.bope, false) then c := 'bope';
  elsif new.policial and not coalesce(old.policial, false) then c := 'policia';
  elsif new.prf and not coalesce(old.prf, false) then c := 'prf';
  elsif new.profissao = 'exercito' and old.profissao is distinct from 'exercito' then c := 'exercito';
  else return new; end if;
  if not exists (select 1 from desertor_liberacoes l where l.jogador = new.id and l.corp = c and l.ate > now()) then
    raise exception 'desertor sem liberacao';
  end if;
  return new;
end $$;
drop trigger if exists barrar_desertor on public.perfis;
create trigger barrar_desertor before update of policial, prf, bope, profissao on public.perfis
  for each row execute function public.barrar_desertor();

-- oficial de patente alta libera a entrada de um desertor na própria corporação (24 h)
create or replace function public.liberar_desertor(p_alvo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c text; car text; minimo integer; m integer;
begin
  p := jogador_livre();
  if p.cargo = 'admin' then raise exception 'o admin perdoa direto'; end if;
  if p.policial and p.bope then c := 'bope'; car := 'policia'; minimo := 1320;
  elsif p.policial then c := 'policia'; car := 'policia'; minimo := 1320;
  elsif p.prf then c := 'prf'; car := 'prf'; minimo := 480;
  elsif p.profissao = 'exercito' then c := 'exercito'; car := 'exercito'; minimo := 1800;
  else raise exception 'so oficiais das corporacoes'; end if;
  select minutos into m from carreiras where jogador = p.id and carreira = car;
  if coalesce(m, 0) < minimo then raise exception 'patente baixa para liberar'; end if;
  if not exists (select 1 from perfis where id = p_alvo and desertor) then raise exception 'nao e desertor'; end if;
  insert into desertor_liberacoes (jogador, corp, ate, por) values (p_alvo, c, now() + interval '24 hours', p.id)
    on conflict (jogador, corp) do update set ate = excluded.ate, por = excluded.por;
  if c = 'exercito' then update perfis set expulso_exercito = false where id = p_alvo; end if;
  insert into comandos (alvo, autor, tipo, dados) values (p_alvo, p.id, 'aviso', jsonb_build_object('texto',
    format('🚨 %s liberou sua entrada (%s) por 24 h. Sua ficha continua marcada como desertor até o administrador perdoar.', p.nome, c)));
  perform registrar(p.id, 'liberou_desertor', jsonb_build_object('alvo', p_alvo, 'corp', c));
  return c;
end $$;

create table if not exists public.laser_config (item text primary key, dano integer not null check (dano between 5 and 120));
insert into public.laser_config (item, dano) values ('laser_azul', 30), ('laser_roxo', 34), ('laser_vermelho', 40), ('laser_energia', 36)
  on conflict (item) do nothing;
do $$
begin
  alter table public.laser_config enable row level security;
  drop policy if exists "leitura publica" on public.laser_config;
  create policy "leitura publica" on public.laser_config for select using (true);
  revoke all on public.laser_config from anon, authenticated;
  grant select on public.laser_config to anon, authenticated;
end $$;
create or replace function public.definir_dano_laser(p_item text, p_dano integer) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(cargo_de(auth.uid()), '') <> 'admin' then raise exception 'so o general supremo'; end if;
  update laser_config set dano = greatest(5, least(120, p_dano)) where item = p_item;
  if not found then raise exception 'item invalido'; end if;
  return greatest(5, least(120, p_dano));
end $$;

revoke all on function public.liberar_desertor(uuid), public.definir_dano_laser(text, integer) from public, anon;
grant execute on function public.liberar_desertor(uuid), public.definir_dano_laser(text, integer) to authenticated;
notify pgrst, 'reload schema';
