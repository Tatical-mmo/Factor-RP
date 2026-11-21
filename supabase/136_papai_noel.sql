-- 136 · Papai Noel (19zw). Rode depois do 132.
--  · De 20 a 25 de dezembro (horário de Brasília) o Papai Noel aparece num lugar da ilha e muda de lugar a cada 2 h.
--    Todos veem só o círculo de busca no minimapa; perto, o radar do jogo mostra onde ele está.
--  · Quem encontra escolhe 1 presente do catálogo (personagens, moedas e itens). 1 presente por jogador por Natal.
--  · O admin pode antecipar o evento para testar (os presentes pegos no teste não contam para o Natal de verdade)
--    e escolhe, ticando, o que entra no catálogo.

create table if not exists public.natal_config (
  id          integer primary key default 1 check (id = 1),
  teste_ate   timestamptz,                                  -- evento antecipado pelo admin até esta hora
  catalogo    jsonb not null default '[]'::jsonb,           -- ["p:Agente_Secreta", "m:5000", "i:chocolate", ...]
  pontos      jsonb not null default '[]'::jsonb,           -- lugares possíveis (segredo): [[x, z], ...]
  semente     integer not null default floor(random() * 1000)::integer
);
alter table public.natal_config enable row level security;   -- sem leitura direta: só pelas funções
revoke all on public.natal_config from anon, authenticated;
insert into public.natal_config (id, catalogo, pontos) values (1,
  '["m:1000", "m:5000", "m:10000", "m:25000"]'::jsonb,
  '[[286, 162], [-3, 85], [209, 547], [-47, -1195], [40, 941], [619, -504], [-381, 285], [-135, -171], [141, -1200], [-61, 430], [536, 498], [-612, -58], [-633, -545], [-476, 105], [-499, -331], [-537, 271], [-367, 47], [-375, -597], [540, 252], [-400, 433], [241, 120], [317, 419], [-266, -1125], [44, -1062], [488, -69], [-248, -1086], [-236, 355], [106, -555], [-117, -216]]'::jsonb)
on conflict (id) do nothing;

create table if not exists public.natal_presentes (
  jogador   uuid not null references public.perfis (id) on delete cascade,
  ano       integer not null,
  teste     boolean not null default false,
  escolha   text not null,
  pego_em   timestamptz not null default now(),
  primary key (jogador, ano, teste)
);
alter table public.natal_presentes enable row level security;
revoke all on public.natal_presentes from anon, authenticated;

-- está no Natal de verdade (20 a 25/12 em Brasília)?
create or replace function public.natal_no_calendario() returns boolean
language sql stable as $$
  select extract(month from now() at time zone 'America/Sao_Paulo') = 12
     and extract(day from now() at time zone 'America/Sao_Paulo') between 20 and 25;
$$;

-- onde ele está agora (muda a cada 2 h); o círculo de busca fica deslocado de um jeito que não entrega o ponto
create or replace function public.natal_lugar(out x real, out z real, out cx real, out cz real, out troca_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare c natal_config%rowtype; n integer; slot bigint; i integer; a real; r real;
begin
  select * into c from natal_config where id = 1;
  n := jsonb_array_length(coalesce(c.pontos, '[]'::jsonb));
  if n = 0 then return; end if;
  slot := floor(extract(epoch from now()) / 7200);
  i := ((slot * 7919 + c.semente) % n)::integer;
  x := (c.pontos->i->>0)::real; z := (c.pontos->i->>1)::real;
  a := ((slot * 131 + c.semente) % 360) * pi() / 180; r := 30 + ((slot * 17 + c.semente) % 60);
  cx := x + cos(a) * r; cz := z + sin(a) * r;
  troca_em := to_timestamp((slot + 1) * 7200);
end $$;
revoke all on function public.natal_lugar() from public, anon, authenticated;

create or replace function public.natal_estado() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c natal_config%rowtype; l record; cal boolean := natal_no_calendario(); tst boolean; v_ano integer := extract(year from now() at time zone 'America/Sao_Paulo');
begin
  select * into c from natal_config where id = 1;
  tst := not cal and c.teste_ate is not null and c.teste_ate > now();
  if not (cal or tst) then return jsonb_build_object('ativo', false, 'teste_ate', c.teste_ate); end if;
  select * into l from natal_lugar();
  if l.x is null then return jsonb_build_object('ativo', false); end if;
  return jsonb_build_object('ativo', true, 'teste', tst, 'teste_ate', c.teste_ate, 'cx', l.cx, 'cz', l.cz, 'raio', 140, 'troca_em', l.troca_em,
    'catalogo', c.catalogo,
    'ja_peguei', (select escolha from natal_presentes where jogador = auth.uid() and natal_presentes.ano = v_ano and teste = tst));
end $$;

-- radar: perto (60 m) devolve onde ele está
create or replace function public.natal_radar(p_x real, p_z real) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e jsonb := natal_estado(); l record; d real;
begin
  if not coalesce((e->>'ativo')::boolean, false) then return null; end if;
  select * into l from natal_lugar();
  d := sqrt((l.x - p_x) ^ 2 + (l.z - p_z) ^ 2);
  if d > 80 then return jsonb_build_object('longe', true); end if;
  return jsonb_build_object('d', round(d / 5) * 5) || case when d <= 60 then jsonb_build_object('x', l.x, 'z', l.z) else '{}'::jsonb end;
end $$;

-- pegar o presente: perto dele (8 m), uma vez por Natal (o teste conta à parte)
create or replace function public.natal_pegar(p_escolha text, p_x real, p_z real) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e jsonb := natal_estado(); l record; tst boolean; v_ano integer := extract(year from now() at time zone 'America/Sao_Paulo');
  tipo text := split_part(p_escolha, ':', 1); val text := substr(p_escolha, length(split_part(p_escolha, ':', 1)) + 2); m integer;
begin
  p := jogador_livre();
  if not coalesce((e->>'ativo')::boolean, false) then raise exception 'o papai noel ja foi embora'; end if;
  tst := coalesce((e->>'teste')::boolean, false);
  select * into l from natal_lugar();
  if sqrt((l.x - p_x) ^ 2 + (l.z - p_z) ^ 2) > 8 then raise exception 'chegue mais perto do papai noel'; end if;
  if not (e->'catalogo') ? p_escolha then raise exception 'presente fora do catalogo'; end if;
  if exists (select 1 from natal_presentes where jogador = p.id and natal_presentes.ano = v_ano and teste = tst) then raise exception 'voce ja ganhou seu presente neste natal'; end if;
  if tipo = 'm' then
    m := least(100000, greatest(0, val::integer));
    update perfis set moedas = moedas + m where id = p.id;
  elsif tipo = 'i' then
    if not exists (select 1 from precos where item = val) then raise exception 'presente fora do catalogo'; end if;
    insert into inventario (dono, item, qtd) values (p.id, val, 3) on conflict (dono, item) do update set qtd = inventario.qtd + 3;
  elsif tipo = 'p' then
    insert into personagens_comprados (jogador, personagem) values (p.id, val) on conflict do nothing;
  else raise exception 'presente fora do catalogo'; end if;
  insert into natal_presentes (jogador, ano, teste, escolha) values (p.id, v_ano, tst, p_escolha);
  perform registrar(p.id, 'presente_natal', jsonb_build_object('escolha', p_escolha, 'teste', tst));
  return p_escolha;
end $$;

-- admin: catálogo ticado, lugares possíveis e teste (antecipar / encerrar / liberar de novo o presente de teste)
create or replace function public.admin_natal(p_catalogo jsonb, p_pontos jsonb, p_teste_min integer) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if p_catalogo is not null then
    if jsonb_typeof(p_catalogo) <> 'array' or jsonb_array_length(p_catalogo) = 0 then raise exception 'catalogo vazio'; end if;
    update natal_config set catalogo = p_catalogo where id = 1;
  end if;
  if p_pontos is not null and jsonb_typeof(p_pontos) = 'array' and jsonb_array_length(p_pontos) >= 5 then
    update natal_config set pontos = p_pontos where id = 1;
  end if;
  if p_teste_min is not null then
    if p_teste_min <= 0 then update natal_config set teste_ate = null where id = 1;
    else
      update natal_config set teste_ate = now() + make_interval(mins => least(p_teste_min, 10080)) where id = 1;
      delete from natal_presentes where teste;   -- novo teste: todos podem pegar o presente de teste de novo
    end if;
  end if;
  return natal_estado();
end $$;

-- admin: onde ele está agora (para conferir / ir até lá)
create or replace function public.admin_natal_onde() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l record;
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  select * into l from natal_lugar();
  return jsonb_build_object('x', l.x, 'z', l.z, 'troca_em', l.troca_em, 'catalogo', (select catalogo from natal_config where id = 1));
end $$;

do $$
declare f text;
begin
  foreach f in array array['natal_estado()', 'natal_radar(real, real)', 'natal_pegar(text, real, real)', 'admin_natal(jsonb, jsonb, integer)', 'admin_natal_onde()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
