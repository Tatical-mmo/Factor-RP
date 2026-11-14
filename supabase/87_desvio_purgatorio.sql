-- 87 · Armas desviadas para o Seu Tonho, licitação no jornal, arma dourada com purgatório e troca de nome.
-- Rode depois do 86.
--   · Caminhão com kit de armas do Exército sequestrado e vendido ao Seu Tonho: as armas vão para o estoque dele.
--     Ele vende cada arma por 70.000 (granada 7.000) a membros de clã. A arma desviada tem só 80 balas e depois é descartada.
--   · Licitação das rações: a abertura sai como manchete no jornal; ao fechar, sai qual empresa ganhou (sem valores nem critérios).
--   · Arma dourada: quem morre fica 5 min no purgatório; o jornal publica a nota de falecimento (nome e cemitério).
--     O administrador pode reviver qualquer um e oferecer a segunda chance no purgatório: reviver na hora ou com outro
--     nome (+2.000.000, uma vez por nome, sem somar com o dinheiro do nome antigo). O nome antigo vai para a lápide e
--     ninguém mais usa; só o dono reavê, morrendo de novo pela arma dourada.

-- ============================================================ armas desviadas (Seu Tonho)
create table if not exists public.tonho_estoque (
  item  text primary key check (item in ('espingarda', 'fuzil', 'granada')),
  qtd   integer not null default 0 check (qtd >= 0),
  preco integer not null check (preco > 0)
);
insert into public.tonho_estoque (item, preco) values ('espingarda', 70000), ('fuzil', 70000), ('granada', 7000) on conflict do nothing;
create table if not exists public.armas_desviadas (
  id        bigint generated always as identity primary key,
  dono      uuid not null references public.perfis (id) on delete cascade,
  item      text not null check (item in ('espingarda', 'fuzil')),
  balas     integer not null default 80 check (balas between 0 and 80),
  criada_em timestamptz not null default now()
);
do $$
begin
  alter table public.tonho_estoque enable row level security;
  drop policy if exists ler on public.tonho_estoque;
  create policy ler on public.tonho_estoque for select to authenticated using (true);
  revoke all on public.tonho_estoque from anon, authenticated;
  grant select on public.tonho_estoque to authenticated;
  alter table public.armas_desviadas enable row level security;
  drop policy if exists minhas on public.armas_desviadas;
  create policy minhas on public.armas_desviadas for select to authenticated using (dono = auth.uid());
  revoke all on public.armas_desviadas from anon, authenticated;
  grant select on public.armas_desviadas to authenticated;
end $$;

-- vender a carga sequestrada ao Seu Tonho: rações como antes; kit de armas vai para o estoque dele
-- (paga 10.000 por arma e 1.000 por granada)
create or replace function public.vender_jujubas(p_viagem bigint, p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v jujuba_viagens%rowtype; valor integer; dist real;
begin
  p := jogador_livre();
  select * into v from jujuba_viagens where id = p_viagem for update;
  if v.id is null or v.status <> 'sequestrada' or v.motorista is distinct from p.id then raise exception 'voce nao esta nesse veiculo'; end if;
  if abs(p_x - 64) > 30 or abs(p_z + 972) > 30 then raise exception 'longe do comprador'; end if;
  dist := sqrt(power(coalesce(v.seq_x, 64) - 64, 2) + power(coalesce(v.seq_z, -972) + 972, 2));
  if v.seq_em is not null and extract(epoch from now() - v.seq_em) < dist / 30 then
    perform registrar_falta(p.id, 'carga de rações teletransportada', jsonb_build_object('viagem', v.id, 'metros', round(dist), 'segundos', round(extract(epoch from now() - v.seq_em))), 2);
    return 0;
  end if;
  valor := v.qtd * 9;
  if coalesce(v.kit, 0) > 0 then
    update tonho_estoque set qtd = least(500, qtd + 10 * v.kit) where item in ('espingarda', 'fuzil');
    update tonho_estoque set qtd = least(1500, qtd + 30 * v.kit) where item = 'granada';
    valor := valor + v.kit * (20 * 10000 + 30 * 1000);
  end if;
  update jujuba_viagens set status = 'vendida' where id = v.id;
  if v.qtd > 0 then update jujuba_mercado set estoque = estoque + v.qtd where id = 1; end if;
  update perfis set moedas = moedas + valor where id = p.id;
  return valor;
end $$;

-- comprar do Seu Tonho (só membros de clã): arma desviada com 80 balas, ou granada
create or replace function public.comprar_tonho(p_item text) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e tonho_estoque%rowtype; novo bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla'; end if;
  select * into e from tonho_estoque where item = p_item for update;
  if e.item is null then raise exception 'item invalido'; end if;
  if e.qtd < 1 then raise exception 'seu tonho esta sem estoque'; end if;
  if p.moedas < e.preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - e.preco where id = p.id;
  update tonho_estoque set qtd = qtd - 1 where item = p_item;
  if p_item = 'granada' then perform dar_item(p.id, 'granada', 1); return 0; end if;
  insert into armas_desviadas (dono, item) values (p.id, p_item) returning id into novo;
  return novo;
end $$;

-- balas gastas (o jogo manda de tempos em tempos); acabou, a arma é descartada
create or replace function public.gastar_desviada(p_id bigint, p_n integer) returns integer
language plpgsql security definer set search_path = public as $$
declare r integer;
begin
  update armas_desviadas set balas = greatest(0, balas - greatest(0, least(coalesce(p_n, 0), 40)))
   where id = p_id and dono = auth.uid() returning balas into r;
  if r is null then return 0; end if;
  if r <= 0 then delete from armas_desviadas where id = p_id; end if;
  return r;
end $$;

-- ============================================================ licitação no jornal (manchete automática)
create or replace function public.materia_automatica(p_titulo text, p_texto text, p_selo text, p_cor text) returns void
language sql security definer set search_path = public as $$
  insert into materias (autor, autor_nome, titulo, texto, selo, cor, destaque)
  values (null, 'Redação Fator RP', left(p_titulo, 90), left(coalesce(p_texto, ''), 600), p_selo, p_cor, true);
$$;
revoke all on function public.materia_automatica(text, text, text, text) from public, anon, authenticated;

create or replace function public.licitacao_no_jornal() returns trigger
language plpgsql security definer set search_path = public as $$
declare nome text;
begin
  if tg_op = 'INSERT' then
    perform materia_automatica('📄 Exército abre licitação para o transporte de rações',
      'O Exército abriu a licitação do transporte de rações. Transportadoras de nível 5 ou mais podem participar na central do Exército, no quartel de Porto Sul.',
      'POLÍTICA', '#2c3e50');
  elsif new.status = 'vigente' and old.status = 'aberta' and new.empresa is not null then
    select e.nome into nome from empresas e where e.id = new.empresa;
    perform materia_automatica(format('🏆 %s vence a licitação das rações do Exército', coalesce(nome, 'Transportadora')),
      'O Exército anunciou a transportadora que vai levar as rações. Valores e critérios não foram divulgados.',
      'POLÍTICA', '#2c3e50');
  end if;
  return new;
end $$;
drop trigger if exists licitacao_jornal on public.licitacoes;
create trigger licitacao_jornal after insert or update of status on public.licitacoes for each row execute function public.licitacao_no_jornal();

-- ============================================================ arma dourada: purgatório, segunda chance e nomes mortos
alter table public.perfis add column if not exists ceu_ate timestamptz;
create table if not exists public.nomes_mortos (
  nome    text not null,
  dono    uuid references public.perfis (id) on delete cascade,
  moedas  bigint not null default 0,
  morto_em timestamptz not null default now()
);
create unique index if not exists nomes_mortos_nome on public.nomes_mortos (lower(nome));
create table if not exists public.nomes_bonus (nome text primary key);   -- nomes que já ganharam os 2.000.000 (lower)
create table if not exists public.ceu_ofertas (
  alvo  uuid primary key references public.perfis (id) on delete cascade,
  admin uuid references public.perfis (id) on delete set null,
  em    timestamptz not null default now()
);
do $$
begin
  alter table public.nomes_mortos enable row level security;
  revoke all on public.nomes_mortos from anon, authenticated;
  alter table public.nomes_bonus enable row level security;
  revoke all on public.nomes_bonus from anon, authenticated;
  alter table public.ceu_ofertas enable row level security;
  revoke all on public.ceu_ofertas from anon, authenticated;
end $$;

-- nome de quem morreu não volta (nem na criação da conta, nem trocando de nome); só o dono reavê pelo purgatório
create or replace function public.nome_de_morto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and lower(new.nome) = lower(old.nome) then return new; end if;
  if exists (select 1 from nomes_mortos where lower(nome) = lower(new.nome) and dono is distinct from new.id) then
    raise exception 'esse nome e de um jogador que morreu';
  end if;
  return new;
end $$;
drop trigger if exists perfis_nome_morto on public.perfis;
create trigger perfis_nome_morto before insert or update of nome on public.perfis for each row execute function public.nome_de_morto();

create or replace function public.trocar_nome(p_nome text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  p_nome := btrim(p_nome);
  if p_nome !~ '^[[:alnum:] _.-]{3,16}$' then raise exception 'nome invalido'; end if;
  if lower(p_nome) = lower(p.nome) then raise exception 'esse ja e o seu nome'; end if;
  if exists (select 1 from perfis where lower(nome) = lower(p_nome)) then raise exception 'nome em uso'; end if;
  if exists (select 1 from nomes_mortos where lower(nome) = lower(p_nome)) then raise exception 'esse nome e de um jogador que morreu'; end if;
  if p.moedas < 1000 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 1000, nome = p_nome where id = p.id;
end $$;

-- acerto da arma dourada: igual ao de antes + 5 min de purgatório e nota de falecimento no jornal
create or replace function public.acertar_pd(p_alvo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare a arma_pd%rowtype; v perfis%rowtype; k perfis%rowtype;
begin
  select * into a from arma_pd where id = 1 for update;
  if a.atirador is distinct from auth.uid() or a.disparo_em is null or a.disparo_em < now() - interval '4 seconds' then raise exception 'tiro invalido'; end if;
  update arma_pd set disparo_em = null where id = 1;
  select * into v from perfis where id = p_alvo for update;
  if v.id is null or v.id = auth.uid() then raise exception 'tiro invalido'; end if;
  if v.cargo in ('admin', 'moderador') then return 'imune'; end if;
  select * into k from perfis where id = auth.uid() for update;
  update perfis set pd_morte = now(), pd_por = k.id, ceu_ate = now() + interval '5 minutes' where id = v.id;
  update perfis set crimes = crimes + 5, policial = false, prf = false, servico_desde = null where id = k.id;
  if (select prefeito from prefeitura where id = 1) = v.id then
    perform deixar_cargo(v.id);
    update prefeitura set prefeito = null, vaga_ciclo = ciclo_atual(), motivo = 'morto pela arma dourada' where id = 1;
    perform avisar_todos(format('☠️ O prefeito %s foi atingido pela ARMA DOURADA e perdeu o mandato! A polícia procura %s.', v.nome, k.nome));
  else
    perform avisar_todos(format('☠️ %s foi atingido pela ARMA DOURADA. A polícia procura %s.', v.nome, k.nome));
  end if;
  perform materia_automatica(format('🕊️ Nota de falecimento: %s', v.nome),
    format('Faleceu hoje %s, atingido pela arma dourada. O sepultamento será no Cemitério Municipal. Nossos sentimentos à família e aos amigos.', v.nome),
    null, '#2c3e50');
  return 'morto';
end $$;

-- administrador: revive qualquer um (no purgatório ou caído) e oferece a segunda chance no purgatório
create or replace function public.admin_reviver(p_alvo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis where id = auth.uid() and cargo = 'admin') then raise exception 'so o administrador'; end if;
  update perfis set ceu_ate = null where id = p_alvo;
  delete from ceu_ofertas where alvo = p_alvo;
  insert into comandos (alvo, autor, tipo, dados) values (p_alvo, auth.uid(), 'reviver', '{}'::jsonb);
end $$;
create or replace function public.oferecer_segunda_chance(p_alvo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a perfis%rowtype;
begin
  select * into a from perfis where id = auth.uid();
  if a.cargo is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if not exists (select 1 from perfis where id = p_alvo and ceu_ate is not null) then raise exception 'ele nao esta no purgatorio'; end if;
  insert into ceu_ofertas (alvo, admin) values (p_alvo, a.id) on conflict (alvo) do update set admin = excluded.admin, em = now();
  insert into comandos (alvo, autor, tipo, dados) values (p_alvo, a.id, 'ceu_oferta', jsonb_build_object('nome', a.nome));
end $$;

-- sair do purgatório: esperou os 5 min, aceitou a segunda chance (na hora ou com outro nome) ou reaveu um nome antigo
create or replace function public.sair_do_ceu(p_modo text, p_nome text) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m nomes_mortos%rowtype; oferta boolean; novo bigint;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p.ceu_ate is null then return p.nome; end if;
  oferta := exists (select 1 from ceu_ofertas where alvo = p.id and em > now() - interval '15 minutes');
  if p_modo = 'esperar' then
    if now() < p.ceu_ate then raise exception 'o portao ainda nao abriu'; end if;
  elsif p_modo = 'reviver' then
    if not oferta then raise exception 'sem segunda chance'; end if;
  elsif p_modo = 'novo_nome' then
    if not oferta then raise exception 'sem segunda chance'; end if;
    p_nome := btrim(coalesce(p_nome, ''));
    if p_nome !~ '^[[:alnum:] _.-]{3,16}$' then raise exception 'nome invalido'; end if;
    if exists (select 1 from perfis where lower(nome) = lower(p_nome)) then raise exception 'nome em uso'; end if;
    if exists (select 1 from nomes_mortos where lower(nome) = lower(p_nome)) then raise exception 'esse nome e de um jogador que morreu'; end if;
    insert into nomes_mortos (nome, dono, moedas) values (p.nome, p.id, p.moedas)
      on conflict (lower(nome)) do update set dono = excluded.dono, moedas = excluded.moedas, morto_em = now();
    novo := case when exists (select 1 from nomes_bonus where nome = lower(p_nome)) then 0 else 2000000 end;
    insert into nomes_bonus (nome) values (lower(p_nome)) on conflict do nothing;
    update perfis set nome = p_nome, moedas = novo where id = p.id;
  elsif p_modo = 'nome_antigo' then
    select * into m from nomes_mortos where lower(nome) = lower(btrim(coalesce(p_nome, ''))) and dono = p.id;
    if m.nome is null then raise exception 'esse nome nao e seu'; end if;
    delete from nomes_mortos where lower(nome) = lower(m.nome);
    insert into nomes_mortos (nome, dono, moedas) values (p.nome, p.id, p.moedas)
      on conflict (lower(nome)) do update set dono = excluded.dono, moedas = excluded.moedas, morto_em = now();
    update perfis set nome = m.nome, moedas = m.moedas where id = p.id;
  else
    raise exception 'opcao invalida';
  end if;
  update perfis set ceu_ate = null where id = p.id;
  delete from ceu_ofertas where alvo = p.id;
  return (select nome from perfis where id = p.id);
end $$;

-- lápide do cemitério: os nomes que morreram (sem dinheiro nem dono); e os meus, para reaver no purgatório
create or replace function public.lista_nomes_mortos() returns table (nome text, morto_em timestamptz, meu boolean)
language sql stable security definer set search_path = public as $$
  select n.nome, n.morto_em, n.dono = auth.uid() from nomes_mortos n order by n.morto_em desc limit 200;
$$;

do $$
declare f text;
begin
  foreach f in array array['comprar_tonho(text)', 'gastar_desviada(bigint, integer)', 'vender_jujubas(bigint, real, real)', 'trocar_nome(text)',
    'acertar_pd(uuid)', 'admin_reviver(uuid)', 'oferecer_segunda_chance(uuid)', 'sair_do_ceu(text, text)', 'lista_nomes_mortos()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
