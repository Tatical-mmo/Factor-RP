-- 152: armas laser de evento (22b): Laser laranja, amarelo e roxo de evento. Qualquer jogador usa (sem armadura),
-- dano e alcance do fuzil, munição que recarrega sozinha como os lasers. Só dá para comprar quando o administrador
-- abre a vitrine (painel › Eu › Armas de evento), como os personagens de evento. Rode depois do 151.
insert into public.precos (item, nome, compra, venda, fome) values
  ('laser_ev_laranja', 'Laser laranja (evento)', null, null, 0), ('laser_ev_amarelo', 'Laser amarelo (evento)', null, null, 0),
  ('laser_ev_roxo', 'Laser roxo (evento)', null, null, 0)
on conflict (item) do nothing;

create table if not exists public.armas_evento (
  id text primary key references public.precos(item),
  nome text not null,
  preco integer not null check (preco > 0),
  liberado_ate timestamptz
);
insert into public.armas_evento (id, nome, preco) values
  ('laser_ev_laranja', 'Laser laranja', 60000), ('laser_ev_amarelo', 'Laser amarelo', 60000), ('laser_ev_roxo', 'Laser roxo', 70000)
on conflict (id) do nothing;
do $$ begin
  alter table public.armas_evento enable row level security;
  drop policy if exists "leitura publica" on public.armas_evento;
  create policy "leitura publica" on public.armas_evento for select using (true);
  revoke all on public.armas_evento from anon, authenticated;
  grant select on public.armas_evento to anon, authenticated;
end $$;

create or replace function public.comprar_arma_evento(p_item text) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a armas_evento%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  select * into a from armas_evento where id = p_item;
  if a.id is null then raise exception 'item invalido'; end if;
  if a.liberado_ate is null or a.liberado_ate < now() then raise exception 'fora do evento'; end if;
  if exists (select 1 from inventario where dono = p.id and item = p_item and qtd > 0) then raise exception 'voce ja tem essa arma'; end if;
  if p.moedas < a.preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - a.preco where id = p.id;
  perform dar_item(p.id, p_item, 1);
  perform registrar(p.id, 'comprou_arma_evento', jsonb_build_object('item', p_item, 'preco', a.preco));
  return p_item;
end $$;

create or replace function public.admin_liberar_armas_evento(p_ids text[], p_minutos integer) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if p_minutos is null or p_minutos not between 0 and 10080 then raise exception 'tempo invalido'; end if;
  update armas_evento set liberado_ate = case when p_minutos = 0 then null else now() + make_interval(mins => p_minutos) end
    where p_ids is null or cardinality(p_ids) = 0 or id = any(p_ids);
  get diagnostics n = row_count;
  if p_minutos > 0 then
    perform avisar_todos(format('🔫 EVENTO: %s arma%s laser à venda na Loja (Armas de evento) por %s!', n, case when n = 1 then '' else 's' end,
      case when p_minutos >= 60 then format('%s h', round(p_minutos / 60.0, 1)) else format('%s min', p_minutos) end));
  end if;
  perform registrar(null, 'evento_armas', jsonb_build_object('minutos', p_minutos, 'quantas', n));
  return n;
end $$;

create or replace function public.admin_presentear_arma(p_jogador uuid, p_item text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if not exists (select 1 from armas_evento where id = p_item) then raise exception 'item invalido'; end if;
  if not exists (select 1 from inventario where dono = p_jogador and item = p_item and qtd > 0) then perform dar_item(p_jogador, p_item, 1); end if;
  perform avisar(p_jogador, format('🎁 Você ganhou o %s! Equipe pelo 🎯 Tático.', (select nome from armas_evento where id = p_item)));
end $$;

do $$ declare f text; begin
  foreach f in array array['comprar_arma_evento(text)', 'admin_liberar_armas_evento(text[],integer)', 'admin_presentear_arma(uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
