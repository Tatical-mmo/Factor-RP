-- Fator RP - cidades vizinhas vivas: encomendas entre cidades (levadas à mão, de trem) e parafusos.
-- Agências: 'centro' (nas estações Norte e Sul da metrópole), 'serra' (Vila Serra) e 'porto' (Porto Sul).
-- A encomenda vale mais quanto mais longe; tem 20 minutos para ser entregue.

insert into public.precos (item, nome, compra, venda, fome) values ('parafuso', 'Parafusos', 80, 30, 0)
on conflict (item) do update set nome = excluded.nome, compra = excluded.compra, venda = excluded.venda;

create table if not exists public.encomendas (
  jogador   uuid primary key references public.perfis (id) on delete cascade,
  origem    text not null check (origem in ('centro', 'serra', 'porto')),
  destino   text not null check (destino in ('centro', 'serra', 'porto')),
  valor     integer not null,
  criada_em timestamptz not null default now()
);
alter table public.encomendas enable row level security;
drop policy if exists "ve a propria" on public.encomendas;
create policy "ve a propria" on public.encomendas for select to authenticated using (jogador = auth.uid());
revoke all on public.encomendas from anon, authenticated;
grant select on public.encomendas to authenticated;

create or replace function public.valor_encomenda(a text, b text) returns integer language sql immutable as $$
  select case when a = b then 0 when 'centro' in (a, b) then 400 else 700 end;
$$;

create or replace function public.pegar_encomenda(p_origem text) returns public.encomendas
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e encomendas%rowtype; dest text;
begin
  p := jogador_livre();
  if p_origem not in ('centro', 'serra', 'porto') then raise exception 'agencia invalida'; end if;
  delete from encomendas where jogador = p.id and criada_em < now() - interval '20 minutes';
  if exists (select 1 from encomendas where jogador = p.id) then raise exception 'voce ja leva uma encomenda'; end if;
  dest := (array_remove(array['centro', 'serra', 'porto'], p_origem))[1 + floor(random() * 2)::integer];
  insert into encomendas (jogador, origem, destino, valor) values (p.id, p_origem, dest, valor_encomenda(p_origem, dest))
    returning * into e;
  return e;
end $$;

create or replace function public.entregar_encomenda(p_destino text) returns integer
language plpgsql security definer set search_path = public as $$
declare e encomendas%rowtype;
begin
  select * into e from encomendas where jogador = auth.uid() for update;
  if e.jogador is null then raise exception 'voce nao leva encomenda'; end if;
  if e.criada_em < now() - interval '20 minutes' then delete from encomendas where jogador = e.jogador; raise exception 'prazo da encomenda venceu'; end if;
  if e.destino <> p_destino then raise exception 'essa encomenda e para outra cidade'; end if;
  delete from encomendas where jogador = e.jogador;
  update perfis set moedas = moedas + e.valor where id = e.jogador;
  return e.valor;
end $$;

create or replace function public.desistir_encomenda() returns void
language sql security definer set search_path = public as $$ delete from encomendas where jogador = auth.uid(); $$;

-- oficina de Porto Sul: 3 sucatas viram 2 parafusos (a cada 8 s)
create or replace function public.fazer_parafusos() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.ultima_tarefa is not null and p.ultima_tarefa > now() - interval '8 seconds' then
    raise exception 'aguarde % s', ceil(extract(epoch from (p.ultima_tarefa + interval '8 seconds' - now())));
  end if;
  perform dar_item(p.id, 'sucata', -3);
  update perfis set ultima_tarefa = now() where id = p.id;
  return dar_item(p.id, 'parafuso', 2);
end $$;

do $$
declare f text;
begin
  foreach f in array array['pegar_encomenda(text)', 'entregar_encomenda(text)', 'desistir_encomenda()', 'fazer_parafusos()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
