-- 65a · Financiamento parcelado no banco (tabela Price), com níveis de crédito.
-- Uma parcela a cada 64 min, cobrada sozinha da poupança e depois da carteira. O jogador escolhe as parcelas:
-- mais parcelas = mais juros (+0,1% por parcela). Quem quita sem atrasar sobe de nível (mais limite, menos juros).
-- Parcela não paga: multa de 2%, INADIMPLENTE, o atraso cresce 3% a cada 64 min e o banco cobra da poupança
-- e de metade da carteira. Depois de acertar volta ao nível 1, com +2% de juros e precisa de 2 financiamentos
-- limpos por nível até o nível 3.
create table if not exists public.credito (
  jogador  uuid primary key references public.perfis (id) on delete cascade,
  nivel    integer not null default 1 check (nivel between 1 and 5),
  limpos   integer not null default 0,
  restrito boolean not null default false
);
create table if not exists public.financiamentos (
  id           bigint generated always as identity primary key,
  jogador      uuid not null references public.perfis (id) on delete cascade,
  valor        integer not null,
  n            integer not null,
  taxa         numeric not null,
  parcela      integer not null,
  pagas        integer not null default 0,
  proxima      timestamptz not null,
  atraso       integer not null default 0,
  atrasou      boolean not null default false,
  inadimplente boolean not null default false,
  status       text not null default 'ativo' check (status in ('ativo', 'quitado')),
  criado       timestamptz not null default now()
);
create unique index if not exists financiamentos_um_ativo on public.financiamentos (jogador) where status = 'ativo';
do $$ begin
  alter table public.credito enable row level security; alter table public.financiamentos enable row level security;
  revoke all on public.credito, public.financiamentos from anon, authenticated;
end $$;

-- condições de cada nível: limite, juros base (% por parcela) e máximo de parcelas
create or replace function public.fin_nivel(p_nivel integer) returns jsonb language sql immutable as $$
  select (array['{"limite":10000,"base":2.2,"max":10}', '{"limite":25000,"base":2.0,"max":12}', '{"limite":50000,"base":1.8,"max":20}',
                '{"limite":100000,"base":1.6,"max":24}', '{"limite":200000,"base":1.4,"max":30}'])[p_nivel]::jsonb;
$$;
create or replace function public.fin_taxa(p_nivel integer, p_n integer, p_restrito boolean) returns numeric language sql immutable as $$
  select round(((fin_nivel(p_nivel)->>'base')::numeric + 0.1 * (p_n - 2) + case when p_restrito then 2 else 0 end) / 100, 4);
$$;

-- tira até v da poupança e depois da carteira (no máximo "carteira_max" dela); devolve quanto conseguiu
create or replace function public.fin_tirar(p_jogador uuid, v integer, carteira_max integer) returns integer
language plpgsql security definer set search_path = public as $$
declare da_poup integer := 0; da_cart integer := 0;
begin
  if v <= 0 then return 0; end if;
  select least(v, saldo) into da_poup from contas_banco where jogador = p_jogador for update;
  da_poup := coalesce(da_poup, 0);
  if da_poup > 0 then update contas_banco set saldo = saldo - da_poup where jogador = p_jogador; end if;
  select least(v - da_poup, carteira_max, moedas) into da_cart from perfis where id = p_jogador for update;
  da_cart := greatest(0, coalesce(da_cart, 0));
  if da_cart > 0 then update perfis set moedas = moedas - da_cart where id = p_jogador; end if;
  return da_poup + da_cart;
end $$;

-- quitou: sobe de nível se não atrasou nenhuma parcela e durou pelo menos metade do prazo
create or replace function public.fin_quitou(f public.financiamentos) returns void
language plpgsql security definer set search_path = public as $$
declare c credito%rowtype; precisa integer;
begin
  update financiamentos set status = 'quitado', inadimplente = false where id = f.id;
  if f.atrasou then return; end if;
  if now() - f.criado < f.n * interval '32 minutes' then return; end if;   -- quitou cedo demais: não conta para subir
  select * into c from credito where jogador = f.jogador for update;
  precisa := case when c.restrito and c.nivel < 3 then 2 else 1 end;
  if c.limpos + 1 >= precisa then
    update credito set nivel = least(5, nivel + 1), limpos = 0, restrito = restrito and nivel + 1 < 3 where jogador = f.jogador;
  else update credito set limpos = limpos + 1 where jogador = f.jogador; end if;
end $$;

-- cobra as parcelas vencidas (a cada 64 min) e o atraso; chamado pelo jogo de minuto em minuto e no banco
create or replace function public.fin_cobrar(p_jogador uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f financiamentos%rowtype; pago integer; falta integer; voltas integer := 0;
begin
  perform banco_atualizar(p_jogador);   -- abre a conta se precisar
  select * into f from financiamentos where jogador = p_jogador and status = 'ativo' for update;
  if f.id is null then return; end if;
  while f.proxima <= now() and voltas < 60 loop
    voltas := voltas + 1;
    if f.inadimplente then f.atraso := least(f.valor * 3, ceil(f.atraso * 1.03)::integer); end if;   -- mora
    if f.pagas < f.n then
      f.pagas := f.pagas + 1;
      if f.inadimplente then f.atraso := f.atraso + f.parcela;
      else
        pago := fin_tirar(p_jogador, f.parcela, 2147483647);
        falta := f.parcela - pago;
        if falta > 0 then   -- não deu: multa de 2% e fica inadimplente
          f.atraso := ceil(falta * 1.02)::integer; f.inadimplente := true; f.atrasou := true;
          update credito set nivel = 1, limpos = 0, restrito = true where jogador = p_jogador;
          perform avisar(p_jogador, '🏦 Parcela do financiamento não paga: você está INADIMPLENTE. O atraso cresce 3% a cada 64 min.');
        end if;
      end if;
    end if;
    if f.inadimplente then   -- cobra o atraso: poupança e metade da carteira
      f.atraso := f.atraso - fin_tirar(p_jogador, f.atraso, (select moedas / 2 from perfis where id = p_jogador));
      if f.atraso <= 0 then f.atraso := 0; f.inadimplente := false; end if;
    end if;
    f.proxima := f.proxima + interval '64 minutes';
  end loop;
  update financiamentos set pagas = f.pagas, atraso = f.atraso, inadimplente = f.inadimplente, atrasou = f.atrasou, proxima = f.proxima where id = f.id;
  if f.pagas >= f.n and f.atraso = 0 then perform fin_quitou(f); end if;
end $$;

create or replace function public.fin_processar() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform fin_cobrar(auth.uid());
end $$;

do $$
declare f text;
begin
  foreach f in array array['fin_tirar(uuid, integer, integer)', 'fin_quitou(public.financiamentos)', 'fin_cobrar(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  revoke all on function public.fin_processar() from public, anon;
  grant execute on function public.fin_processar() to authenticated;
end $$;
