-- 66b · PRF: computador e quebra do sigilo bancário (rode depois do 66a).
-- O agente em serviço vê o diário de gastos do prefeito. Num lançamento sigiloso ele pede a quebra do sigilo:
-- a Justiça leva 3 minutos (ele precisa continuar em serviço) e cada agente faz 1 pedido a cada 10 minutos.
-- Se o destino for um clã, é a prova: o prefeito é cassado e fica procurado (+3.000 para o agente).
-- O "Investigar documentos" (35% de sorte) deixa de existir.
create table if not exists public.pedidos_sigilo (
  id       bigint generated always as identity primary key,
  gasto    bigint not null references public.gastos_prefeito (id) on delete cascade,
  agente   uuid not null references public.perfis (id) on delete cascade,
  criado   timestamptz not null default now(),
  pronto   timestamptz not null,
  revelado boolean not null default false
);
do $$ begin
  alter table public.pedidos_sigilo enable row level security;
  revoke all on public.pedidos_sigilo from anon, authenticated;
end $$;

create or replace function public.prf_em_servico() returns perfis
language plpgsql security definer set search_path = public as $$
declare a perfis%rowtype;
begin
  select * into a from perfis where id = auth.uid();
  if a.id is null or not a.prf or a.algemado or a.pena_seg > 0 then raise exception 'so agentes da PRF em servico'; end if;
  return a;
end $$;

-- a tela do computador: gastos do mandato atual e do anterior (sigilosos sem destino, a não ser os já revelados)
create or replace function public.prf_computador() returns jsonb
language plpgsql security definer set search_path = public as $$
declare a perfis%rowtype; pf prefeitura%rowtype;
begin
  a := prf_em_servico();
  select * into pf from prefeitura where id = 1;
  return jsonb_build_object(
    'prefeito', (select nome from perfis where id = pf.prefeito), 'cofre', pf.cofre,
    'proximo_pedido', (select max(criado) + interval '10 minutes' from pedidos_sigilo where agente = a.id),
    'gastos', coalesce((select jsonb_agg(x order by x.id desc) from (
      select g.id, g.mandato, g.tipo, g.descricao, g.valor, g.sigiloso, g.criado, (select nome from perfis where id = g.prefeito) as quem,
             case when not g.sigiloso or exists (select 1 from pedidos_sigilo s where s.gasto = g.id and s.revelado) then g.destino end as destino,
             (select jsonb_build_object('id', s.id, 'pronto', s.pronto, 'meu', s.agente = a.id) from pedidos_sigilo s
               where s.gasto = g.id and not s.revelado order by s.id desc limit 1) as pedido
        from gastos_prefeito g where g.mandato >= pf.mandato - 1 order by g.id desc limit 60) x), '[]'::jsonb));
end $$;

create or replace function public.prf_pedir_sigilo(p_gasto bigint) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare a perfis%rowtype; g gastos_prefeito%rowtype; ult timestamptz; novo timestamptz;
begin
  a := prf_em_servico();
  select * into g from gastos_prefeito where id = p_gasto;
  if g.id is null or not g.sigiloso then raise exception 'esse lancamento nao e sigiloso'; end if;
  if exists (select 1 from pedidos_sigilo where gasto = g.id and revelado) then raise exception 'o sigilo ja foi quebrado'; end if;
  if exists (select 1 from pedidos_sigilo where gasto = g.id and not revelado) then raise exception 'ja existe um pedido para esse lancamento'; end if;
  select max(criado) into ult from pedidos_sigilo where agente = a.id;
  if ult is not null and ult > now() - interval '10 minutes' then
    raise exception 'novo pedido em % min', ceil(extract(epoch from (ult + interval '10 minutes' - now())) / 60);
  end if;
  novo := now() + interval '3 minutes';
  insert into pedidos_sigilo (gasto, agente, pronto) values (g.id, a.id, novo);
  return novo;
end $$;

-- resultado da Justiça: revela o destino; destino de clã = prova (cassação e procurado)
create or replace function public.prf_ver_sigilo(p_pedido bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a perfis%rowtype; s pedidos_sigilo%rowtype; g gastos_prefeito%rowtype; pf prefeitura%rowtype; r text := 'legal';
begin
  a := prf_em_servico();
  select * into s from pedidos_sigilo where id = p_pedido for update;
  if s.id is null or s.agente <> a.id then raise exception 'pedido invalido'; end if;
  if s.pronto > now() then raise exception 'a Justica ainda esta analisando (% s)', ceil(extract(epoch from (s.pronto - now()))); end if;
  if a.prf_pago is null or a.prf_pago > s.criado then   -- saiu de serviço no meio: o pedido caiu
    delete from pedidos_sigilo where id = s.id;
    raise exception 'voce saiu de servico durante a analise: o pedido caiu';
  end if;
  update pedidos_sigilo set revelado = true where id = s.id;
  select * into g from gastos_prefeito where id = s.gasto;
  if g.ilegal then
    select * into pf from prefeitura where id = 1 for update;
    update favores set descoberto = true where prefeito = g.prefeito and mandato = g.mandato;
    if pf.prefeito = g.prefeito then
      perform deixar_cargo(pf.prefeito);
      update prefeitura set prefeito = null, vaga_ciclo = ciclo_atual(), motivo = 'cassado por crime eleitoral' where id = 1;
      r := 'cassado';
    else r := 'ex-prefeito'; end if;
    if not exists (select 1 from pedidos_sigilo p join gastos_prefeito x on x.id = p.gasto
                    where p.revelado and x.ilegal and x.prefeito = g.prefeito and x.mandato = g.mandato and p.id <> s.id) then
      update perfis set crimes = crimes + 3, eleitoral = true where id = g.prefeito;
      update perfis set moedas = moedas + 3000 where id = a.id;
      perform avisar(g.prefeito, 'A PRF quebrou o sigilo bancário e provou CRIME ELEITORAL: você está procurado!');
    else r := 'ja provado'; end if;
  end if;
  return jsonb_build_object('resultado', r, 'destino', g.destino, 'descricao', g.descricao, 'valor', g.valor);
end $$;

create or replace function public.prf_investigar() returns text
language plpgsql security definer set search_path = public as $$
begin raise exception 'use o computador da PRF (quebra do sigilo bancario)'; end $$;

do $$
declare f text;
begin
  foreach f in array array['prf_computador()', 'prf_pedir_sigilo(bigint)', 'prf_ver_sigilo(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.prf_em_servico() from public, anon, authenticated;
end $$;
