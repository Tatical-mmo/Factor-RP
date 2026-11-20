-- 129: Prefeitos de Barra Amarela e de Oyster River (cidades novas). Rode depois do 128.
--  · Cada cidade tem o seu prefeito, eleito no painel em frente à prefeitura dela. Mandato e campanha seguem o
--    mesmo relógio do Governo: 20 ciclos, campanha nos últimos 4 (cidade sem prefeito: campanha aberta, e o mais
--    votado assume na virada do ciclo).
--  · Candidatura: 5.000 (vai para o cofre do Estado). Ficha suja não se candidata. Cada jogador só pode ser
--    candidato numa cidade por mandato e vota uma vez em cada cidade.
--  · Salário pago pelo cofre do Estado, por ciclo jogado: Oyster River até 8.000, Barra Amarela até 6.000.

create table if not exists public.prefeituras_cid (
  cidade text primary key check (cidade in ('barra', 'oyster')),
  mandato integer not null default -1,
  prefeito uuid references public.perfis (id) on delete set null,
  posse timestamptz, vaga_ciclo integer not null default -1, salario_ciclo integer not null default -1, motivo text
);
insert into public.prefeituras_cid (cidade) values ('barra'), ('oyster') on conflict do nothing;
create table if not exists public.candidatos_cid (
  cidade text not null, mandato integer not null, jogador uuid not null references public.perfis (id) on delete cascade,
  slogan text not null default '', votos integer not null default 0, inscrito_em timestamptz not null default now(),
  primary key (cidade, mandato, jogador)
);
create table if not exists public.votos_cid (
  cidade text not null, mandato integer not null, eleitor uuid not null references public.perfis (id) on delete cascade, candidato uuid not null,
  primary key (cidade, mandato, eleitor)
);
do $$
begin
  alter table public.prefeituras_cid enable row level security;
  drop policy if exists "leitura publica" on public.prefeituras_cid;
  create policy "leitura publica" on public.prefeituras_cid for select using (true);
  alter table public.candidatos_cid enable row level security;
  drop policy if exists "leitura publica" on public.candidatos_cid;
  create policy "leitura publica" on public.candidatos_cid for select using (true);
  alter table public.votos_cid enable row level security;
  drop policy if exists "meu voto" on public.votos_cid;
  create policy "meu voto" on public.votos_cid for select using (eleitor = auth.uid());
  revoke all on public.prefeituras_cid, public.candidatos_cid, public.votos_cid from anon, authenticated;
  grant select on public.prefeituras_cid, public.candidatos_cid, public.votos_cid to authenticated;
  grant select on public.prefeituras_cid, public.candidatos_cid to anon;
end $$;

create or replace function public.nome_cidade(p_cidade text) returns text
language sql immutable as $$ select case p_cidade when 'barra' then 'Barra Amarela' when 'oyster' then 'Oyster River' end; $$;

create or replace function public.campanha_cid(p_cidade text) returns integer
language sql stable as $$
  select case when ciclo_atual() % 20 >= 16 then mandato_atual() + 1
              when (select prefeito from prefeituras_cid where cidade = p_cidade) is null then mandato_atual() end;
$$;

create or replace function public.processar_cidades() returns void
language plpgsql security definer set search_path = public as $$
declare c prefeituras_cid%rowtype; m integer := mandato_atual(); vencedor uuid;
begin
  for c in select * from prefeituras_cid order by cidade for update loop
    vencedor := null;
    if c.mandato < m then
      select jogador into vencedor from candidatos_cid where cidade = c.cidade and mandato = m order by votos desc, inscrito_em limit 1;
      update prefeituras_cid set mandato = m, prefeito = vencedor, posse = now(), salario_ciclo = -1, vaga_ciclo = ciclo_atual(),
        motivo = case when vencedor is null then 'sem candidatos' end where cidade = c.cidade;
    elsif c.prefeito is null and ciclo_atual() > c.vaga_ciclo and ciclo_atual() % 20 < 16 then
      select jogador into vencedor from candidatos_cid where cidade = c.cidade and mandato = m and votos > 0 order by votos desc, inscrito_em limit 1;
      if vencedor is not null then update prefeituras_cid set prefeito = vencedor, posse = now(), salario_ciclo = -1, motivo = null where cidade = c.cidade; end if;
    end if;
    if vencedor is not null then
      perform avisar(vencedor, format('Você é o novo PREFEITO de %s! Mandato de 20 ciclos. O salário sai no painel da prefeitura da cidade.', nome_cidade(c.cidade)));
      perform avisar_todos(format('🏛️ %s é o novo Prefeito de %s!', (select nome from perfis where id = vencedor), nome_cidade(c.cidade)));
    end if;
  end loop;
end $$;

create or replace function public.candidatar_prefeito_cid(p_cidade text, p_slogan text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m integer;
begin
  if p_cidade not in ('barra', 'oyster') then raise exception 'cidade invalida'; end if;
  perform processar_cidades();
  p := jogador_livre();
  m := campanha_cid(p_cidade);
  if m is null then raise exception 'a campanha ainda nao abriu'; end if;
  if p.crimes > 0 then raise exception 'ficha suja: quem tem crimes nao se candidata'; end if;
  if exists (select 1 from candidatos_cid where mandato = m and jogador = p.id) then raise exception 'voce ja e candidato'; end if;
  update perfis set moedas = moedas - 5000 where id = p.id and moedas >= 5000;
  if not found then raise exception 'moedas insuficientes'; end if;
  update estado_cofre set saldo = saldo + 5000 where id = 1;
  insert into candidatos_cid (cidade, mandato, jogador, slogan) values (p_cidade, m, p.id, left(coalesce(btrim(p_slogan), ''), 60));
end $$;

create or replace function public.votar_prefeito_cid(p_cidade text, p_candidato uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m integer;
begin
  p := jogador_livre();
  m := campanha_cid(p_cidade);
  if m is null then raise exception 'a campanha ainda nao abriu'; end if;
  if not exists (select 1 from candidatos_cid where cidade = p_cidade and mandato = m and jogador = p_candidato) then raise exception 'candidato invalido'; end if;
  if exists (select 1 from votos_cid where cidade = p_cidade and mandato = m and eleitor = p.id) then raise exception 'voce ja votou'; end if;
  insert into votos_cid (cidade, mandato, eleitor, candidato) values (p_cidade, m, p.id, p_candidato);
  update candidatos_cid set votos = votos + 1 where cidade = p_cidade and mandato = m and jogador = p_candidato;
end $$;

create or replace function public.salario_prefeito_cid(p_cidade text) returns integer
language plpgsql security definer set search_path = public as $$
declare c prefeituras_cid%rowtype; v integer;
begin
  perform processar_cidades();
  select * into c from prefeituras_cid where cidade = p_cidade for update;
  if not found or c.prefeito is distinct from auth.uid() or c.salario_ciclo >= ciclo_atual() then return 0; end if;
  select least(case p_cidade when 'oyster' then 8000 else 6000 end, saldo)::integer into v from estado_cofre where id = 1 for update;
  update prefeituras_cid set salario_ciclo = ciclo_atual() where cidade = p_cidade;
  if v <= 0 then return 0; end if;
  update estado_cofre set saldo = saldo - v where id = 1;
  update perfis set moedas = moedas + v where id = auth.uid();
  return v;
end $$;

revoke all on function public.processar_cidades(), public.candidatar_prefeito_cid(text, text), public.votar_prefeito_cid(text, uuid), public.salario_prefeito_cid(text) from public, anon;
grant execute on function public.processar_cidades(), public.candidatar_prefeito_cid(text, text), public.votar_prefeito_cid(text, uuid), public.salario_prefeito_cid(text) to authenticated;
notify pgrst, 'reload schema';
