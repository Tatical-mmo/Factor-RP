-- Fator RP - empresas v2 (parte 1 de 4): várias empresas por dono, unidades, níveis, robôs e 14 lotes novos.
-- Rode as partes em ordem (1, 2, 3, 4), cada uma numa consulta limpa. Os dados atuais são preservados.

-- ------------------------------------------------------------ colunas novas
alter table public.empresas
  add column if not exists nivel          integer not null default 1,
  add column if not exists robos          integer not null default 0,
  add column if not exists robos_alugados integer not null default 0,
  add column if not exists aluguel_ate    timestamptz,
  add column if not exists producao_marca timestamptz not null default now(),
  add column if not exists fabrica        boolean not null default false,
  add column if not exists transporte     boolean not null default false;

update public.empresas set fabrica = (tipo = 'fabrica'), transporte = (tipo = 'transportadora')
  where not fabrica and not transporte;

-- regras antigas que impediam grupos (fábrica + transportadora) e várias unidades
alter table public.empresas drop constraint if exists empresas_tipo_check;
alter table public.empresas drop constraint if exists empresas_check;
alter table public.empresas drop constraint if exists empresas_lote_key;
alter table public.empresas alter column lote drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_tipo_v2') then
    alter table public.empresas add constraint empresas_tipo_v2 check (tipo in ('fabrica', 'transportadora', 'grupo'));
    alter table public.empresas add constraint empresas_produto_v2 check (fabrica = (produto is not null));
    alter table public.empresas add constraint empresas_nivel_v2 check (nivel between 1 and 3);
    alter table public.empresas add constraint empresas_robos_v2 check (robos >= 0 and robos_alugados >= 0);
    alter table public.empresas add constraint empresas_funcao_v2 check (fabrica or transporte);
  end if;
end $$;

-- ------------------------------------------------------------ unidades: cada lote ocupado por uma empresa
create table if not exists public.unidades (
  lote    integer primary key references public.lotes (id),
  empresa bigint not null references public.empresas (id) on delete cascade,
  funcao  text not null check (funcao in ('fabrica', 'transportadora'))
);
insert into public.unidades (lote, empresa, funcao)
  select lote, id, tipo from public.empresas where lote is not null and tipo in ('fabrica', 'transportadora')
on conflict (lote) do nothing;

-- o dono não é mais "funcionário": membros guarda só os empregados
delete from public.membros m using public.empresas e where e.id = m.empresa and e.dono = m.jogador;

-- ------------------------------------------------------------ 14 lotes novos
insert into public.lotes (id, preco, x, z) values
  (11, 20000, -90.5, -58), (12, 20000, -17.5, -58), (13, 20000, 17.5, -58), (14, 20000, 71.5, -58),
  (15, 20000, 90.5, -58), (16, 20000, -90.5, -4), (17, 20000, 90.5, -4), (18, 20000, -71.5, 50),
  (19, 20000, 71.5, 50), (20, 20000, -90.5, 104), (21, 20000, -71.5, 104), (22, 20000, -17.5, 104),
  (23, 20000, 17.5, 104), (24, 20000, 90.5, 104)
on conflict (id) do update set preco = excluded.preco, x = excluded.x, z = excluded.z;

alter table public.unidades enable row level security;
drop policy if exists "leitura publica" on public.unidades;
create policy "leitura publica" on public.unidades for select using (true);
revoke all on public.unidades from anon, authenticated;
grant select on public.unidades to anon, authenticated;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'unidades') then
    alter publication supabase_realtime add table public.unidades;
  end if;
end $$;

-- ------------------------------------------------------------ apoio
-- limites por nível: robôs, funcionários e caminhões
create or replace function public.limite(p_nivel integer, item text) returns integer
language sql immutable as $$
  select case item
    when 'robos'        then (array[2, 4, 8])[p_nivel]
    when 'funcionarios' then (array[5, 10, 20])[p_nivel]
    when 'caminhoes'    then (array[2, 3, 5])[p_nivel]
    when 'evoluir'      then (array[30000, 60000, null])[p_nivel]   -- custo para ir ao próximo nível
  end;
$$;

create or replace function public.robos_ativos(e public.empresas) returns integer
language sql stable as $$
  select e.robos + case when e.aluguel_ate > now() then e.robos_alugados else 0 end;
$$;

-- empresa do dono que chamou (erro se não for dele)
create or replace function public.do_dono(p_empresa bigint) returns public.empresas
language plpgsql stable security definer set search_path = public as $$
declare e empresas%rowtype;
begin
  select * into e from empresas where id = p_empresa;
  if e.id is null or e.dono <> auth.uid() then raise exception 'voce nao e dono dessa empresa'; end if;
  return e;
end $$;

-- quem chamou trabalha nessa empresa (dono ou funcionário)?
create or replace function public.trabalha_em(p_empresa bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from empresas where id = p_empresa and dono = auth.uid())
      or exists (select 1 from membros where empresa = p_empresa and jogador = auth.uid());
$$;

-- lote de onde saem os caminhões (de preferência uma unidade de transportadora)
create or replace function public.lote_base(p_empresa bigint) returns public.lotes
language sql stable security definer set search_path = public as $$
  select l.* from unidades u join lotes l on l.id = u.lote
  where u.empresa = p_empresa order by (u.funcao = 'transportadora') desc, u.lote limit 1;
$$;

-- lote de onde sai a mercadoria da fábrica
create or replace function public.lote_fabrica(p_empresa bigint) returns public.lotes
language sql stable security definer set search_path = public as $$
  select l.* from unidades u join lotes l on l.id = u.lote
  where u.empresa = p_empresa order by (u.funcao = 'fabrica') desc, u.lote limit 1;
$$;

-- as funções antigas (uma empresa por pessoa) saem; as novas recebem a empresa como parâmetro
drop function if exists public.empresa_depositar(integer);
drop function if exists public.empresa_sacar(integer);
drop function if exists public.empresa_pagamento(integer);
drop function if exists public.contratar(text);
drop function if exists public.demitir(uuid);
drop function if exists public.embalar_fabrica();
drop function if exists public.criar_pedido(bigint, integer, integer);
drop function if exists public.comprar_caminhao();
drop function if exists public.aceitar_missao(bigint, bigint, integer);
drop function if exists public.minha_empresa();
drop function if exists public.empresa_do_dono(text);
