-- Fator RP - QG do clã (parte 1 de 2): cofre do clã.
-- Só entra no QG quem é do clã dono da base (Território Leste ou Oeste).
-- Cofre: qualquer membro guarda itens da mochila e deposita moedas; o líder e quem ele autorizar retiram.
-- Rode depois do 40.

alter table public.membros_cla add column if not exists cofre boolean not null default false;

create table if not exists public.cofre_cla (
  cla  bigint not null references public.clas (id) on delete cascade,
  item text not null references public.precos (item),
  qtd  integer not null check (qtd >= 0),
  primary key (cla, item)
);
do $$
begin
  alter table public.cofre_cla enable row level security;
  revoke all on public.cofre_cla from anon, authenticated;
end $$;

-- a carga roubada do cargueiro (não se vende na loja: só se entrega no QG)
insert into public.precos (item, nome, compra, venda, fome) values ('carga_navio', 'Carga do cargueiro', null, null, 0)
on conflict (item) do update set nome = excluded.nome, compra = null, venda = null;

-- o clã do jogador é dono de uma base?
create or replace function public.qg_do_meu_cla() returns text
language sql stable security definer set search_path = public as $$
  select t.id from territorios t join membros_cla m on m.cla = t.dono_cla
  where m.jogador = auth.uid() and t.id in ('leste', 'oeste') order by t.id limit 1;
$$;

create or replace function public.pode_cofre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros_cla m join clas c on c.id = m.cla
                 where m.jogador = auth.uid() and (c.lider = auth.uid() or m.cofre));
$$;

-- tudo o que a tela do cofre mostra
create or replace function public.cla_cofre() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clas%rowtype;
begin
  c := meu_cla();
  if c.id is null then raise exception 'voce nao esta em um cla'; end if;
  return jsonb_build_object(
    'caixa', c.caixa, 'lider', c.lider = auth.uid(), 'retirar', pode_cofre(), 'qg', qg_do_meu_cla(),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('item', k.item, 'nome', p.nome, 'qtd', k.qtd) order by p.nome)
                       from cofre_cla k join precos p on p.item = k.item where k.cla = c.id and k.qtd > 0), '[]'::jsonb),
    'membros', case when c.lider = auth.uid() then coalesce((select jsonb_agg(jsonb_build_object('id', m.jogador, 'nome', f.nome, 'cofre', m.cofre) order by f.nome)
                       from membros_cla m join perfis f on f.id = m.jogador where m.cla = c.id and m.jogador <> c.lider), '[]'::jsonb) else '[]'::jsonb end);
end $$;

create or replace function public.cla_guardar(p_item text, p_qtd integer) returns void
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype;
begin
  c := meu_cla();
  if c.id is null then raise exception 'voce nao esta em um cla'; end if;
  if qg_do_meu_cla() is null then raise exception 'seu cla nao tem base'; end if;
  if p_qtd < 1 or p_item in ('carga_navio', 'desbloqueio') then raise exception 'quantidade invalida'; end if;
  perform dar_item(auth.uid(), p_item, -p_qtd);
  insert into cofre_cla (cla, item, qtd) values (c.id, p_item, p_qtd)
  on conflict (cla, item) do update set qtd = cofre_cla.qtd + p_qtd;
end $$;

create or replace function public.cla_cofre_retirar(p_item text, p_qtd integer) returns void
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype;
begin
  c := meu_cla();
  if c.id is null or not pode_cofre() then raise exception 'sem permissao'; end if;
  if p_qtd < 1 then raise exception 'quantidade invalida'; end if;
  update cofre_cla set qtd = qtd - p_qtd where cla = c.id and item = p_item and qtd >= p_qtd;
  if not found then raise exception 'itens insuficientes'; end if;
  perform dar_item(auth.uid(), p_item, p_qtd);
end $$;

create or replace function public.cla_cofre_sacar(valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; novo integer;
begin
  c := meu_cla();
  if c.id is null or not pode_cofre() then raise exception 'sem permissao'; end if;
  if valor < 1 then raise exception 'valor invalido'; end if;
  update clas set caixa = caixa - valor where id = c.id and caixa >= valor returning caixa into novo;
  if novo is null then raise exception 'caixa insuficiente'; end if;
  update perfis set moedas = moedas + valor where id = auth.uid();
  return novo;
end $$;

create or replace function public.cla_autorizar_cofre(p_jogador uuid, p_sim boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype;
begin
  c := cla_do_lider();
  update membros_cla set cofre = coalesce(p_sim, false) where jogador = p_jogador and cla = c.id;
  if not found then raise exception 'jogador invalido'; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['qg_do_meu_cla()', 'pode_cofre()', 'cla_cofre()', 'cla_guardar(text, integer)', 'cla_cofre_retirar(text, integer)',
                           'cla_cofre_sacar(integer)', 'cla_autorizar_cofre(uuid, boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
