-- 93c · Obras públicas: CRAS, Varredores de rua e Câmara dos Vereadores (rode depois do 93b).
-- • O prefeito escolhe um dos 3 terrenos perto da prefeitura e o que construir. Pago pelo cofre = patrimônio da
--   PREFEITURA; pago com o dinheiro dele = patrimônio DELE. Patrimônio da prefeitura só o ADM demole.
-- • A obra leva alguns ciclos (os pedreiros NPC só trabalham de dia). Pronta, o programa começa a rodar sozinho,
--   pago pelo cofre a cada ciclo. Sem dinheiro no cofre, o programa fica sem pagar naquele ciclo.
-- • O prefeito de um mandato seguinte pode DESCONTINUAR o programa (placa "Programa descontinuado") ou retomá-lo.
-- • Tudo entra no diário da prefeitura: computador da PRF e pauta do jornal.
create table if not exists public.obras (
  id           bigint generated always as identity primary key,
  terreno      integer not null unique check (terreno between 1 and 3),
  tipo         text not null check (tipo in ('cras', 'varredores', 'camara')),
  x            real not null,
  z            real not null,
  status       text not null default 'construindo' check (status in ('construindo', 'ativa', 'descontinuada')),
  inicio_ciclo integer not null,
  pronta_ciclo integer not null,
  pago_ciclo   integer not null default 0,
  custo        integer not null,
  publica      boolean not null default true,
  dono         uuid references public.perfis (id) on delete set null,
  mandato      integer not null,
  prefeito     uuid,
  criado       timestamptz not null default now()
);
create unique index if not exists obras_tipo on public.obras (tipo);
alter table public.prefeitura add column if not exists valor_cras integer not null default 500;
alter table public.prefeitura add column if not exists salario_vereador integer not null default 1500;

create table if not exists public.cras_cadastros (
  jogador   uuid primary key references public.perfis (id) on delete cascade,
  criado    timestamptz not null default now()
);
-- Câmara: 1 ciclo de candidatura, 1 de votação e 40 de mandato (o dobro do prefeito). Os 10 mais votados assumem.
create table if not exists public.camara (
  id          integer primary key default 1 check (id = 1),
  legislatura integer not null default 0,
  fase        text not null default 'parada' check (fase in ('parada', 'candidatura', 'votacao', 'mandato')),
  fase_ate    integer not null default 0
);
insert into public.camara (id) values (1) on conflict (id) do nothing;
create table if not exists public.vereadores (
  legislatura integer not null,
  jogador     uuid not null references public.perfis (id) on delete cascade,
  votos       integer not null default 0,
  eleito      boolean not null default false,
  primary key (legislatura, jogador)
);
create table if not exists public.votos_camara (
  legislatura integer not null,
  eleitor     uuid not null references public.perfis (id) on delete cascade,
  candidato   uuid not null references public.perfis (id) on delete cascade,
  primary key (legislatura, eleitor)
);
do $$
declare t text;
begin
  foreach t in array array['obras', 'camara', 'vereadores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ler on public.%I', t);
    execute format('create policy ler on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
  foreach t in array array['cras_cadastros', 'votos_camara'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- terrenos (centro de quadra) e o catálogo
create or replace function public.terreno_obra(p integer) returns real[] language sql immutable as $$
  select case p when 1 then array[-189, -135]::real[] when 2 then array[-135, -189]::real[] when 3 then array[-81, -189]::real[] end;
$$;
create or replace function public.catalogo_obra(p_tipo text) returns jsonb language sql immutable as $$
  select case p_tipo
    when 'cras' then '{"nome":"CRAS","custo":80000,"ciclos":4}'::jsonb
    when 'varredores' then '{"nome":"Gabinete dos Varredores","custo":60000,"ciclos":4,"ciclo":3000}'::jsonb
    when 'camara' then '{"nome":"Câmara dos Vereadores","custo":150000,"ciclos":6}'::jsonb end;
$$;

create or replace function public.prefeito_construir(p_tipo text, p_terreno integer, p_proprio boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; p perfis%rowtype; cat jsonb; custo_ integer; t real[]; novo bigint;
begin
  select * into pf from prefeitura where id = 1 for update;
  if pf.prefeito is distinct from auth.uid() then raise exception 'voce nao e o prefeito'; end if;
  cat := catalogo_obra(p_tipo);
  if cat is null then raise exception 'obra invalida'; end if;
  t := terreno_obra(p_terreno);
  if t is null then raise exception 'terreno invalido'; end if;
  if exists (select 1 from obras where terreno = p_terreno) then raise exception 'esse terreno ja tem obra'; end if;
  if exists (select 1 from obras where tipo = p_tipo) then raise exception 'a cidade ja tem essa obra'; end if;
  custo_ := (cat ->> 'custo')::integer;
  if p_proprio then
    select * into p from perfis where id = pf.prefeito for update;
    if p.moedas < custo_ then raise exception 'voce nao tem % moedas', custo_; end if;
    update perfis set moedas = moedas - custo_ where id = p.id;
  else
    if pf.cofre < custo_ then raise exception 'o cofre nao tem % moedas', custo_; end if;
    perform set_config('fator.gasto', '1', true);
    update prefeitura set cofre = cofre - custo_ where id = 1;
  end if;
  insert into obras (terreno, tipo, x, z, inicio_ciclo, pronta_ciclo, custo, publica, dono, mandato, prefeito)
    values (p_terreno, p_tipo, t[1], t[2], ciclo_atual(), ciclo_atual() + (cat ->> 'ciclos')::integer, custo_, not p_proprio,
            case when p_proprio then pf.prefeito end, pf.mandato, pf.prefeito)
    returning id into novo;
  perform registrar_mov('obra', format('Obra: %s (%s)', cat ->> 'nome', case when p_proprio then 'paga com dinheiro do prefeito, patrimônio dele' else 'paga pelo cofre, patrimônio da prefeitura' end),
    custo_, false, case when p_proprio then 'Dinheiro do próprio prefeito' else 'Construtora (obra pública)' end, false);
  return jsonb_build_object('id', novo, 'nome', cat ->> 'nome', 'ciclos', (cat ->> 'ciclos')::integer);
end $$;

-- descontinuar / retomar (só um prefeito de outro mandato descontinua; quem descontinuou ou outro retoma)
create or replace function public.prefeito_programa(p_obra bigint, p_ativo boolean) returns text
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; o obras%rowtype; nome_ text;
begin
  select * into pf from prefeitura where id = 1;
  if pf.prefeito is distinct from auth.uid() then raise exception 'voce nao e o prefeito'; end if;
  select * into o from obras where id = p_obra for update;
  if o.id is null then raise exception 'obra invalida'; end if;
  if o.status = 'construindo' then raise exception 'a obra ainda nao terminou'; end if;
  if not o.publica and o.dono is distinct from pf.prefeito then raise exception 'esse predio e particular'; end if;
  nome_ := catalogo_obra(o.tipo) ->> 'nome';
  if not p_ativo then
    if o.status = 'descontinuada' then raise exception 'ja esta descontinuado'; end if;
    if o.mandato >= pf.mandato and o.publica then raise exception 'so o proximo prefeito pode descontinuar este programa'; end if;
    update obras set status = 'descontinuada' where id = o.id;
    if o.tipo = 'camara' then update camara set fase = 'parada', fase_ate = 0 where id = 1; update vereadores set eleito = false where eleito; end if;
    perform registrar_mov('programa', format('Programa descontinuado: %s', nome_), 0, false, null, false);
    return 'descontinuado';
  end if;
  if o.status = 'ativa' then raise exception 'ja esta funcionando'; end if;
  update obras set status = 'ativa', pago_ciclo = ciclo_atual() where id = o.id;
  perform registrar_mov('programa', format('Programa retomado: %s', nome_), 0, false, null, false);
  return 'retomado';
end $$;

create or replace function public.prefeito_valores_programa(p_cras integer, p_vereador integer) returns void
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype;
begin
  select * into pf from prefeitura where id = 1;
  if pf.prefeito is distinct from auth.uid() then raise exception 'voce nao e o prefeito'; end if;
  if p_cras < 100 or p_cras > 3000 then raise exception 'doacao do CRAS de 100 a 3.000 por pessoa'; end if;
  if p_vereador < 0 or p_vereador > 10000 then raise exception 'salario do vereador de 0 a 10.000 por ciclo'; end if;
  update prefeitura set valor_cras = p_cras, salario_vereador = p_vereador where id = 1;
  perform registrar_mov('programa', format('Valores: CRAS %s por pessoa · vereador %s por ciclo', p_cras, p_vereador), 0, false, null, false);
end $$;

-- o ADM demole qualquer obra (patrimônio público); o dono demole a particular dele
create or replace function public.demolir_obra(p_obra bigint) returns void
language plpgsql security definer set search_path = public as $$
declare o obras%rowtype; adm boolean;
begin
  select * into o from obras where id = p_obra;
  if o.id is null then raise exception 'obra invalida'; end if;
  adm := exists (select 1 from perfis where id = auth.uid() and cargo = 'admin');
  if not adm and (o.publica or o.dono is distinct from auth.uid()) then raise exception 'patrimonio da prefeitura: so o administrador pode desfazer'; end if;
  delete from obras where id = o.id;
  if o.tipo = 'cras' then delete from cras_cadastros; end if;
  if o.tipo = 'camara' then update camara set fase = 'parada', fase_ate = 0 where id = 1; update vereadores set eleito = false where eleito; end if;
end $$;

-- CRAS: cadastro do jogador
create or replace function public.cras_cadastrar() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if not exists (select 1 from obras where tipo = 'cras' and status = 'ativa') then raise exception 'o CRAS nao esta funcionando'; end if;
  insert into cras_cadastros (jogador) values (p.id) on conflict do nothing;
  if not found then raise exception 'voce ja esta cadastrado'; end if;
  return (select count(*) from cras_cadastros);
end $$;

-- Câmara: candidatura e voto
create or replace function public.camara_candidatar() returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c camara%rowtype;
begin
  p := jogador_livre();
  select * into c from camara where id = 1;
  if c.fase <> 'candidatura' then raise exception 'as candidaturas nao estao abertas'; end if;
  if p.crimes > 0 then raise exception 'precisa estar com a ficha limpa'; end if;
  insert into vereadores (legislatura, jogador) values (c.legislatura, p.id) on conflict do nothing;
  if not found then raise exception 'voce ja e candidato'; end if;
end $$;
create or replace function public.camara_votar(p_candidato uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c camara%rowtype;
begin
  p := jogador_livre();
  select * into c from camara where id = 1;
  if c.fase <> 'votacao' then raise exception 'a votacao nao esta aberta'; end if;
  if not exists (select 1 from vereadores where legislatura = c.legislatura and jogador = p_candidato) then raise exception 'candidato invalido'; end if;
  insert into votos_camara (legislatura, eleitor, candidato) values (c.legislatura, p.id, p_candidato) on conflict do nothing;
  if not found then raise exception 'voce ja votou'; end if;
  update vereadores set votos = votos + 1 where legislatura = c.legislatura and jogador = p_candidato;
end $$;

-- processamento (qualquer cliente chama; roda uma vez por ciclo por obra)
create or replace function public.processar_obras() returns void
language plpgsql security definer set search_path = public as $$
declare o obras%rowtype; agora integer := ciclo_atual(); pf prefeitura%rowtype; c camara%rowtype; v integer; n integer; r record;
begin
  update obras set status = 'ativa', pago_ciclo = agora where status = 'construindo' and pronta_ciclo <= agora;
  for o in select * from obras where status = 'ativa' and pago_ciclo < agora for update skip locked loop
    update obras set pago_ciclo = agora where id = o.id;
    select * into pf from prefeitura where id = 1 for update;
    perform set_config('fator.gasto', '1', true);
    if o.tipo = 'varredores' then
      v := 3000;
      if pf.cofre >= v then
        update prefeitura set cofre = cofre - v where id = 1;
        perform registrar_mov('programa', 'Varredores de rua: pagamento da empresa Limpa Rua (NPC)', v, false, 'Empresa Limpa Rua', false);
      end if;
    elsif o.tipo = 'cras' then
      n := 0;
      for r in select jogador from cras_cadastros order by random() limit 20 loop
        exit when pf.cofre - (n + 1) * pf.valor_cras < 0;
        update perfis set moedas = moedas + pf.valor_cras where id = r.jogador;
        perform avisar(r.jogador, format('🤝 CRAS: você foi sorteado e recebeu %s moedas da prefeitura.', pf.valor_cras));
        n := n + 1;
      end loop;
      if n > 0 then
        update prefeitura set cofre = cofre - n * pf.valor_cras where id = 1;
        perform registrar_mov('programa', format('CRAS: doação para %s cadastrados sorteados (%s cada)', n, pf.valor_cras), n * pf.valor_cras, false, format('%s jogadores do CRAS', n), false);
      end if;
    elsif o.tipo = 'camara' then
      select * into c from camara where id = 1 for update;
      if c.fase = 'parada' or (c.fase = 'mandato' and c.fase_ate <= agora) then
        update vereadores set eleito = false where eleito;
        update camara set legislatura = legislatura + 1, fase = 'candidatura', fase_ate = agora + 1 where id = 1;
      elsif c.fase = 'candidatura' and c.fase_ate <= agora then
        update camara set fase = 'votacao', fase_ate = agora + 1 where id = 1;
      elsif c.fase = 'votacao' and c.fase_ate <= agora then
        update vereadores set eleito = true where legislatura = c.legislatura and jogador in
          (select jogador from vereadores where legislatura = c.legislatura and votos > 0 order by votos desc, jogador limit 10);
        update camara set fase = 'mandato', fase_ate = agora + 40 where id = 1;
        perform avisar(jogador, '🏛️ Você foi eleito VEREADOR! Mandato de 40 ciclos, com salário pago pela prefeitura.') from vereadores where legislatura = c.legislatura and eleito;
      elsif c.fase = 'mandato' then
        select count(*) into n from vereadores where legislatura = c.legislatura and eleito;
        if n > 0 and pf.salario_vereador > 0 and pf.cofre >= n * pf.salario_vereador then
          update perfis set moedas = moedas + pf.salario_vereador where id in (select jogador from vereadores where legislatura = c.legislatura and eleito);
          update prefeitura set cofre = cofre - n * pf.salario_vereador where id = 1;
          perform registrar_mov('programa', format('Câmara: salário de %s vereadores (%s cada)', n, pf.salario_vereador), n * pf.salario_vereador, false, format('%s vereadores', n), false);
        end if;
      end if;
    end if;
  end loop;
end $$;

-- pauta do jornal: o que a prefeitura fez com o dinheiro público (sigilosos aparecem sem o destino)
create or replace function public.jornal_pauta() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.profissao is distinct from 'jornalista' and p.cargo is distinct from 'admin' then raise exception 'so jornalistas em servico'; end if;
  return coalesce((select jsonb_agg(x order by x.id desc) from (
    select g.id, g.tipo, g.descricao, g.valor, g.sigiloso, g.criado, (select nome from perfis where id = g.prefeito) as quem,
           case when not g.sigiloso or exists (select 1 from pedidos_sigilo s where s.gasto = g.id and s.revelado) then g.destino end as destino,
           exists (select 1 from noticias n where n.tipo = 'prefeitura' and n.ref = g.id::text) as reportado
      from gastos_prefeito g where g.criado > now() - interval '2 days' order by g.id desc limit 40) x), '[]'::jsonb);
end $$;

-- o jornalista pode reportar um lançamento da prefeitura (vale 200, como as outras reportagens)
do $$
declare k text;
begin
  for k in select conname from pg_constraint where conrelid = 'public.noticias'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%tipo%' loop
    execute format('alter table public.noticias drop constraint %I', k);
  end loop;
  alter table public.noticias add constraint noticias_tipo_check check (tipo in ('incendio', 'ocorrencia', 'ferido', 'prefeitura'));
end $$;
create or replace function public.publicar_noticia(p_tipo text, p_ref text, p_titulo text, p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; ok boolean;
begin
  p := jogador_livre();
  if p.profissao is distinct from 'jornalista' then raise exception 'so jornalistas em servico'; end if;
  ok := case p_tipo
    when 'incendio' then exists (select 1 from incendios where id::text = p_ref and status = 'ativo')
    when 'ocorrencia' then exists (select 1 from ocorrencias where id::text = p_ref and criada_em > now() - interval '15 minutes')
    when 'ferido' then exists (select 1 from perfis where id::text = split_part(p_ref, ':', 1) and ultima_morte > now() - interval '2 minutes' and id <> p.id)
    when 'prefeitura' then exists (select 1 from gastos_prefeito where id::text = p_ref and criado > now() - interval '2 days')
    else false end;
  if not ok then raise exception 'esse acontecimento ja passou'; end if;
  insert into noticias (autor, autor_nome, tipo, ref, titulo, x, z) values (p.id, p.nome, p_tipo, p_ref, left(p_titulo, 120), p_x, p_z)
    on conflict (tipo, ref) do nothing;
  if not found then raise exception 'outro jornalista ja fez essa reportagem'; end if;
  update perfis set moedas = moedas + 200 where id = p.id;
  delete from noticias where id in (select id from noticias order by id desc offset 60);
  return 200;
end $$;

do $$
declare f text;
begin
  foreach f in array array['prefeito_construir(text, integer, boolean)', 'prefeito_programa(bigint, boolean)', 'prefeito_valores_programa(integer, integer)',
    'demolir_obra(bigint)', 'cras_cadastrar()', 'camara_candidatar()', 'camara_votar(uuid)', 'processar_obras()', 'jornal_pauta()',
    'publicar_noticia(text, text, text, real, real)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
