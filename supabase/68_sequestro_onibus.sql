-- 68 · Sequestro de ônibus (etapa 2 dos crimes de clã).
-- Membro de clã armado, na frente do ônibus, toca em Sequestrar: o motorista NPC e os passageiros descem e fogem,
-- e a saída some da linha para todos. Quem sequestrou dirige para onde quiser; largado, qualquer um do mesmo clã
-- pega de novo, e quem sequestrou pode pôr fogo (ref 'seq:<id>', porte 2). Sem ninguém mexer por 7 minutos, some.

create table if not exists public.onibus_sequestrados (
  id       bigint generated always as identity primary key,
  linha    integer not null,
  saida    bigint  not null,
  modelo   text    not null,
  cor      text    not null default '#ffffff',
  jogador  uuid    not null references public.perfis (id) on delete cascade,
  cla      bigint,
  x real not null, z real not null, ang real not null default 0,
  largado  boolean not null default false,
  status   text    not null default 'ativo' check (status in ('ativo', 'fim')),
  inicio   timestamptz not null default now(),
  ativo_em timestamptz not null default now()
);
create unique index if not exists onibus_seq_saida on public.onibus_sequestrados (linha, saida) where status = 'ativo';
alter table public.onibus_sequestrados enable row level security;
drop policy if exists onibus_seq_ler on public.onibus_sequestrados;
create policy onibus_seq_ler on public.onibus_sequestrados for select to authenticated using (true);
alter table public.perfis add column if not exists sequestrou_em timestamptz;

-- os ativos (os parados há mais de 7 min viram 'fim' aqui mesmo)
create or replace function public.onibus_sequestrados_ativos() returns setof public.onibus_sequestrados
language plpgsql security definer set search_path = public as $$
begin
  update onibus_sequestrados set status = 'fim' where status = 'ativo' and ativo_em < now() - interval '7 minutes';
  return query select * from onibus_sequestrados where status = 'ativo' order by id;
end $$;

create or replace function public.sequestrar_onibus(p_linha integer, p_saida bigint, p_modelo text, p_cor text, p_x real, p_z real, p_ang real) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v_cla bigint; novo bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial or p.prf then raise exception 'policial nao sequestra'; end if;
  select cla into v_cla from membros_cla where jogador = p.id;
  if v_cla is null then raise exception 'so membros de cla'; end if;
  if p.sequestrou_em is not null and p.sequestrou_em > now() - interval '60 seconds' then raise exception 'aguarde para sequestrar'; end if;
  if coalesce(p_modelo, '') !~ '^onibus[a-z0-9_]*$' then raise exception 'veiculo invalido'; end if;
  perform onibus_sequestrados_ativos();
  if exists (select 1 from onibus_sequestrados where linha = p_linha and saida = p_saida and status = 'ativo') then raise exception 'onibus ja sequestrado'; end if;
  if exists (select 1 from onibus_sequestrados where jogador = p.id and status = 'ativo' and not largado) then raise exception 'voce ja esta com um onibus'; end if;
  update perfis set sequestrou_em = now(), crimes = crimes + 1 where id = p.id;
  insert into onibus_sequestrados (linha, saida, modelo, cor, jogador, cla, x, z, ang)
    values (p_linha, p_saida, p_modelo, left(coalesce(p_cor, '#ffffff'), 9), p.id, v_cla,
            greatest(-1400, least(1400, p_x)), greatest(-1400, least(1400, p_z)), coalesce(p_ang, 0))
    returning id into novo;
  return novo;
end $$;

-- quem está dirigindo informa onde está (e se largou); conta como "mexeu" para os 7 minutos
create or replace function public.mover_onibus_sequestrado(p_id bigint, p_x real, p_z real, p_ang real, p_largado boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare s onibus_sequestrados%rowtype;
begin
  if auth.uid() is null then raise exception 'sem permissao'; end if;
  select * into s from onibus_sequestrados where id = p_id for update;
  if s.id is null or s.status <> 'ativo' then return false; end if;
  if s.jogador <> auth.uid() then raise exception 'esse onibus nao esta com voce'; end if;
  update onibus_sequestrados set x = greatest(-1400, least(1400, p_x)), z = greatest(-1400, least(1400, p_z)), ang = coalesce(p_ang, 0),
    largado = coalesce(p_largado, false), ativo_em = now() where id = p_id;
  return true;
end $$;

-- pegar de novo um ônibus largado: só gente do mesmo clã
create or replace function public.pegar_onibus_sequestrado(p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; s onibus_sequestrados%rowtype; v_cla bigint;
begin
  p := jogador_livre();
  select * into s from onibus_sequestrados where id = p_id for update;
  if s.id is null or s.status <> 'ativo' or s.ativo_em < now() - interval '7 minutes' then raise exception 'esse onibus ja foi embora'; end if;
  if not s.largado then raise exception 'alguem esta dirigindo'; end if;
  if exists (select 1 from incendios where ref = 'seq:' || s.id and status = 'ativo') then raise exception 'ja esta pegando fogo'; end if;
  select cla into v_cla from membros_cla where jogador = p.id;
  if v_cla is null or v_cla is distinct from s.cla then raise exception 'so o cla que sequestrou'; end if;
  update onibus_sequestrados set jogador = p.id, largado = false, ativo_em = now() where id = p_id;
  return true;
end $$;

do $$
declare f text;
begin
  foreach f in array array['onibus_sequestrados_ativos()', 'sequestrar_onibus(integer, bigint, text, text, real, real, real)',
                           'mover_onibus_sequestrado(bigint, real, real, real, boolean)', 'pegar_onibus_sequestrado(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
