-- 97 · O Bruxo e a pedra preciosa (evento, igual à arma dourada).
-- O administrador esconde a pedra onde está. Quem achar invoca o Bruxo, que aparece na frente dele e concede UM desejo:
--   • pássaro: vira pássaro durante um ciclo (32 min), quando quiser (botão Extra), ótimo para fugir;
--   • perdão: perdoa todos os crimes;
--   • dinheiro: de 1.000.000 até 10.000.000 (a sorte decide);
--   • arma: a arma dourada (amarela), com 2 balas.
-- O Bruxo não pode ser morto. Depois do pedido ele some.
alter table public.perfis add column if not exists passaro_ate timestamptz;

create table if not exists public.pedra_bruxo (
  id         integer primary key default 1 check (id = 1),
  ativa      boolean not null default false,
  x          real,
  z          real,
  dono       uuid references public.perfis (id) on delete set null,
  achada_em  timestamptz,
  atualizado timestamptz not null default now()
);
insert into public.pedra_bruxo (id) values (1) on conflict do nothing;
do $$
begin
  alter table public.pedra_bruxo enable row level security;
  drop policy if exists "leitura publica" on public.pedra_bruxo;
  create policy "leitura publica" on public.pedra_bruxo for select using (true);
  revoke all on public.pedra_bruxo from anon, authenticated;
  grant select on public.pedra_bruxo to anon, authenticated;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pedra_bruxo') then
    alter publication supabase_realtime add table public.pedra_bruxo;
  end if;
end $$;

create or replace function public.esconder_pedra_bruxo(p_x real, p_z real) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  update pedra_bruxo set ativa = true, x = p_x, z = p_z, dono = null, achada_em = null, atualizado = now() where id = 1;
  perform avisar_todos('💎 EVENTO: uma PEDRA PRECIOSA foi escondida na cidade. Quem achar invoca o BRUXO e ganha um desejo…');
end $$;

-- achou: a pedra vira do jogador e o Bruxo aparece na frente dele (p_bx, p_bz)
create or replace function public.pegar_pedra_bruxo(p_x real, p_z real, p_bx real, p_bz real) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a pedra_bruxo%rowtype;
begin
  p := jogador_livre();
  select * into a from pedra_bruxo where id = 1 for update;
  if not a.ativa or a.dono is not null then raise exception 'a pedra ja foi achada'; end if;
  if abs(a.x - p_x) > 5 or abs(a.z - p_z) > 5 or abs(p_bx - p_x) > 6 or abs(p_bz - p_z) > 6 then raise exception 'chegue mais perto'; end if;
  update pedra_bruxo set dono = p.id, x = p_bx, z = p_bz, achada_em = now(), atualizado = now() where id = 1;
end $$;

create or replace function public.bruxo_desejo(p_escolha text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a pedra_bruxo%rowtype; v integer; r jsonb;
begin
  select * into p from perfis where id = auth.uid() for update;
  select * into a from pedra_bruxo where id = 1 for update;
  if p.id is null or not a.ativa or a.dono is distinct from p.id then raise exception 'o bruxo nao atende voce'; end if;
  if p_escolha = 'passaro' then
    update perfis set passaro_ate = now() + interval '32 minutes' where id = p.id;
    r := jsonb_build_object('passaro_ate', now() + interval '32 minutes');
  elsif p_escolha = 'perdao' then
    update perfis set crimes = 0, eleitoral = false, recompensa = 0, fianca = 0 where id = p.id;
    r := jsonb_build_object('crimes', p.crimes);
  elsif p_escolha = 'dinheiro' then
    v := 1000000 + floor(random() * 9000001)::integer;
    update perfis set moedas = least(2147483647::bigint, moedas::bigint + v)::integer where id = p.id;
    r := jsonb_build_object('valor', v);
  elsif p_escolha = 'arma' then
    update arma_pd set ativa = true, dono = p.id, balas = 2, x = null, z = null, atirador = null, disparo_em = null, atualizado = now() where id = 1;
    r := jsonb_build_object('balas', 2);
  else raise exception 'desejo invalido'; end if;
  update pedra_bruxo set ativa = false, dono = null, atualizado = now() where id = 1;
  perform avisar_todos('🧙 O BRUXO apareceu, concedeu um desejo e sumiu na fumaça…');
  return r || jsonb_build_object('escolha', p_escolha);
end $$;

do $$
declare f text;
begin
  foreach f in array array['esconder_pedra_bruxo(real, real)', 'pegar_pedra_bruxo(real, real, real, real)', 'bruxo_desejo(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
