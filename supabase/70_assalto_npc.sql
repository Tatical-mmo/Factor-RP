-- 70 · Assalto a pedestre NPC (etapa 5 dos crimes de clã).
-- Armado e perto de um pedestre NPC: Assaltar. Ele entrega de 50 a 300 moedas e foge; conta como crime.
-- No máximo 1 assalto a cada 3 minutos por jogador.

alter table public.perfis add column if not exists assaltou_npc_em timestamptz;

create or replace function public.assaltar_npc() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial or p.prf then raise exception 'policial nao assalta'; end if;
  if p.assaltou_npc_em is not null and p.assaltou_npc_em > now() - interval '3 minutes' then raise exception 'aguarde para assaltar'; end if;
  v := 50 + floor(random() * 251)::integer;
  update perfis set moedas = moedas + v, crimes = crimes + 1, assaltou_npc_em = now() where id = p.id;
  return v;
end $$;

revoke all on function public.assaltar_npc() from public, anon;
grant execute on function public.assaltar_npc() to authenticated;
