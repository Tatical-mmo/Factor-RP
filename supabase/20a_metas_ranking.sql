-- Fator RP - ranking e metas do dia (parte 1 de 2). Rode 20a e depois 20b.
-- Cada jogador recebe 3 metas por dia (horário de Brasília). Cumprir e resgatar paga moedas;
-- resgatar as 3 dá um bônus de 1.000.

create table if not exists public.metas (
  jogador    uuid not null references public.perfis (id) on delete cascade,
  dia        date not null,
  tipo       text not null,
  alvo       integer not null,
  progresso  integer not null default 0,
  recompensa integer not null,
  resgatada  boolean not null default false,
  primary key (jogador, dia, tipo)
);
alter table public.metas enable row level security;
drop policy if exists "ve as proprias" on public.metas;
create policy "ve as proprias" on public.metas for select to authenticated using (jogador = auth.uid());
revoke all on public.metas from anon, authenticated;
grant select on public.metas to authenticated;

create or replace function public.hoje() returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date; $$;

create or replace function public.gerar_metas(p uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t text; n integer := 0;
begin
  if exists (select 1 from metas where jogador = p and dia = hoje()) then return; end if;
  delete from metas where jogador = p and dia < hoje() - 7;
  for t in select x from unnest(array['sucata', 'entrega', 'trabalho', 'encomenda', 'parafuso', 'venda']) x order by random() limit 3 loop
    insert into metas (jogador, dia, tipo, alvo, recompensa) values (p, hoje(), t,
      case t when 'sucata' then 8 + floor(random() * 8) when 'entrega' then 3 + floor(random() * 4) when 'trabalho' then 5 + floor(random() * 6)
             when 'encomenda' then 1 + floor(random() * 2) when 'parafuso' then 6 + 2 * floor(random() * 4) else 300 + 100 * floor(random() * 6) end,
      case t when 'sucata' then 300 when 'entrega' then 500 when 'trabalho' then 500 when 'encomenda' then 600 when 'parafuso' then 400 else 300 end);
    n := n + 1;
  end loop;
end $$;

-- soma progresso (chamada pelas ações do jogo)
create or replace function public.meta(p uuid, p_tipo text, n integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform gerar_metas(p);
  update metas set progresso = least(alvo, progresso + n) where jogador = p and dia = hoje() and tipo = p_tipo and not resgatada;
end $$;

create or replace function public.minhas_metas() returns setof public.metas
language plpgsql security definer set search_path = public as $$
begin
  perform gerar_metas(auth.uid());
  return query select * from metas where jogador = auth.uid() and dia = hoje() order by tipo;
end $$;

create or replace function public.resgatar_meta(p_tipo text) returns integer
language plpgsql security definer set search_path = public as $$
declare m metas%rowtype; total integer;
begin
  select * into m from metas where jogador = auth.uid() and dia = hoje() and tipo = p_tipo for update;
  if m.jogador is null then raise exception 'meta invalida'; end if;
  if m.resgatada then raise exception 'meta ja resgatada'; end if;
  if m.progresso < m.alvo then raise exception 'meta ainda nao cumprida'; end if;
  update metas set resgatada = true where jogador = m.jogador and dia = m.dia and tipo = m.tipo;
  total := m.recompensa;
  if not exists (select 1 from metas where jogador = m.jogador and dia = m.dia and not resgatada) then total := total + 1000; end if;
  update perfis set moedas = moedas + total where id = m.jogador;
  return total;
end $$;

-- ranking: 10 mais ricos (sem a equipe), 10 maiores empresas e 10 maiores clãs, e a sua posição
create or replace function public.ranking() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ricos', (select coalesce(jsonb_agg(r), '[]') from (select nome, moedas from perfis where cargo = 'jogador' and not banido order by moedas desc, nome limit 10) r),
    'empresas', (select coalesce(jsonb_agg(r), '[]') from (select e.nome, e.nivel, e.caixa, p.nome as dono,
        (select count(*) from unidades u where u.empresa = e.id) as lotes
      from empresas e join perfis p on p.id = e.dono order by e.nivel desc, e.caixa desc limit 10) r),
    'clas', (select coalesce(jsonb_agg(r), '[]') from (select c.nome, c.cor, c.nivel,
        (select count(*) from territorios t where t.dono_cla = c.id) as territorios,
        (select count(*) from membros_cla m where m.cla = c.id) as membros
      from clas c order by c.nivel desc, territorios desc, c.caixa desc limit 10) r),
    'minha_posicao', (select 1 + count(*) from perfis where cargo = 'jogador' and not banido
                       and moedas > (select moedas from perfis where id = auth.uid()))
  );
$$;

do $$
declare f text;
begin
  foreach f in array array['minhas_metas()', 'resgatar_meta(text)', 'ranking()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['gerar_metas(uuid)', 'meta(uuid, text, integer)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
