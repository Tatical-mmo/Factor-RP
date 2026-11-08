-- Fator RP - prefeitura (parte 2 de 3): PRF e crime eleitoral.
-- O prefeito pode favorecer clãs (repasse de verba ou entrega de território), mas é crime eleitoral.
-- A PRF investiga na prefeitura; se achar prova, o prefeito é cassado e fica procurado (a PRF ou a polícia prende).

alter table public.perfis add column if not exists prf boolean not null default false;
alter table public.perfis add column if not exists prf_pago timestamptz;
alter table public.perfis add column if not exists prf_ultima timestamptz;
alter table public.perfis add column if not exists eleitoral boolean not null default false;

create table if not exists public.favores (
  id         bigint generated always as identity primary key,
  mandato    integer not null,
  prefeito   uuid not null,
  cla        bigint,
  tipo       text not null,
  valor      integer not null default 0,
  criado_em  timestamptz not null default now(),
  descoberto boolean not null default false
);
alter table public.favores enable row level security;
revoke all on public.favores from anon, authenticated;     -- ninguém lê: só a investigação da PRF

-- favores ilegais do prefeito
create or replace function public.favor_verba(p_cla bigint, p_valor integer) returns void
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype;
begin
  select * into pf from prefeitura where id = 1 for update;
  if pf.prefeito is distinct from auth.uid() then raise exception 'voce nao e o prefeito'; end if;
  if p_valor < 1 or p_valor > pf.cofre then raise exception 'valor maior que o cofre'; end if;
  if not exists (select 1 from clas where id = p_cla) then raise exception 'cla invalido'; end if;
  update prefeitura set cofre = cofre - p_valor where id = 1;
  update clas set caixa = caixa + p_valor where id = p_cla;
  insert into favores (mandato, prefeito, cla, tipo, valor) values (pf.mandato, pf.prefeito, p_cla, 'verba', p_valor);
end $$;
create or replace function public.favor_territorio(p_territorio text, p_cla bigint) returns void
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype;
begin
  select * into pf from prefeitura where id = 1;
  if pf.prefeito is distinct from auth.uid() then raise exception 'voce nao e o prefeito'; end if;
  if not exists (select 1 from clas where id = p_cla) then raise exception 'cla invalido'; end if;
  update territorios set dono_cla = p_cla, defesa = 0, renda_marca = now(), capturado_em = now(), captura_cla = null, captura_inicio = null where id = p_territorio;
  if not found then raise exception 'territorio invalido'; end if;
  insert into favores (mandato, prefeito, cla, tipo) values (pf.mandato, pf.prefeito, p_cla, 'territorio');
end $$;

-- PRF: serviço próprio (não obedece ao prefeito), 120 a cada 3 min
create or replace function public.entrar_prf() returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.crimes > 0 then raise exception 'quem tem crimes nao entra na PRF'; end if;
  if p.cargo <> 'jogador' then raise exception 'a equipe nao entra na PRF'; end if;
  if p.policial then raise exception 'saia da policia primeiro'; end if;
  if exists (select 1 from membros_cla where jogador = p.id) then raise exception 'saia do cla para entrar na PRF'; end if;
  if (select prefeito from prefeitura where id = 1) = p.id then raise exception 'o prefeito nao entra na PRF'; end if;
  update perfis set prf = true, prf_pago = now() where id = p.id;
end $$;
create or replace function public.salario_prf() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; blocos integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if not p.prf or p.prf_pago is null then return 0; end if;
  blocos := least(10, floor(extract(epoch from (now() - p.prf_pago)) / 180))::integer;
  if blocos <= 0 then return 0; end if;
  update perfis set moedas = moedas + blocos * 120, prf_pago = greatest(p.prf_pago, now() - interval '30 minutes') + make_interval(secs => blocos * 180) where id = p.id;
  return blocos * 120;
end $$;
create or replace function public.sair_prf() returns integer
language plpgsql security definer set search_path = public as $$
declare pago integer;
begin
  pago := salario_prf();
  update perfis set prf = false, prf_pago = null where id = auth.uid();
  return pago;
end $$;

-- investigar documentos na prefeitura: a cada 90 s; 35% de achar prova se houver crime
create or replace function public.prf_investigar() returns text
language plpgsql security definer set search_path = public as $$
declare a perfis%rowtype; pf prefeitura%rowtype; n integer;
begin
  select * into a from perfis where id = auth.uid() for update;
  if not a.prf then raise exception 'so agentes da PRF em servico'; end if;
  if a.prf_ultima is not null and a.prf_ultima > now() - interval '90 seconds' then
    raise exception 'aguarde % s', ceil(extract(epoch from (a.prf_ultima + interval '90 seconds' - now())));
  end if;
  update perfis set prf_ultima = now() where id = a.id;
  select * into pf from prefeitura where id = 1 for update;
  if pf.prefeito is null then return 'sem prefeito'; end if;
  select count(*) into n from favores where prefeito = pf.prefeito and mandato = pf.mandato and not descoberto;
  if n = 0 or random() > 0.35 then return 'nada'; end if;
  update favores set descoberto = true where prefeito = pf.prefeito and mandato = pf.mandato;
  perform deixar_cargo(pf.prefeito);
  update prefeitura set prefeito = null, vaga_ciclo = ciclo_atual(), motivo = 'cassado por crime eleitoral' where id = 1;
  update perfis set crimes = crimes + 3, eleitoral = true where id = pf.prefeito;
  update perfis set moedas = moedas + 3000 where id = a.id;
  perform avisar(pf.prefeito, 'A PRF provou CRIME ELEITORAL: você perdeu o mandato e está procurado!');
  return 'cassado';
end $$;

-- prender quem foi pego em crime eleitoral (+2.000 para o agente)
create or replace function public.prf_prender(p_alvo uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare ag perfis%rowtype; a perfis%rowtype; minutos integer;
begin
  select * into ag from perfis where id = auth.uid() for update;
  if not ag.prf or ag.algemado or ag.pena_seg > 0 then raise exception 'voce nao esta em servico'; end if;
  select * into a from perfis where id = p_alvo for update;
  if a.id is null or not a.eleitoral or a.crimes <= 0 then raise exception 'esse jogador nao e procurado pela PRF'; end if;
  if a.pena_seg > 0 then raise exception 'ja esta preso'; end if;
  minutos := least(1440, 7 * power(2, least(a.crimes, 9) - 1))::integer;
  update perfis set pena_seg = minutos * 60, pena_marca = now(), fianca = 2000 * a.crimes, crimes = 0, algemado = false, eleitoral = false where id = a.id;
  update perfis set moedas = moedas + 2000 where id = ag.id;
  perform avisar(a.id, format('Você foi preso pela PRF (%s) por crime eleitoral. Pena: %s min.', ag.nome, minutos));
  return minutos;
end $$;

do $$
declare f text;
begin
  foreach f in array array['favor_verba(bigint, integer)', 'favor_territorio(text, bigint)', 'entrar_prf()', 'salario_prf()', 'sair_prf()',
    'prf_investigar()', 'prf_prender(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
