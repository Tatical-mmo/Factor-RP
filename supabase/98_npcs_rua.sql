-- 98 · Quantos moradores (NPCs) andam nas calçadas: o administrador escolhe de 0 a 40 (padrão 4).
alter table public.config_jogo add column if not exists npc_rua integer not null default 4;
do $$ begin
  alter table public.config_jogo drop constraint if exists config_jogo_npc_rua_check;
  alter table public.config_jogo add constraint config_jogo_npc_rua_check check (npc_rua between 0 and 40);
end $$;
create or replace function public.admin_npc_rua(p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
begin
  perform exige_admin();
  if p_qtd is null or p_qtd < 0 or p_qtd > 40 then raise exception 'de 0 a 40 moradores'; end if;
  update config_jogo set npc_rua = p_qtd, atualizado = now() where id = 1;
  return p_qtd;
end $$;
do $$ begin
  revoke all on function public.admin_npc_rua(integer) from public, anon;
  grant execute on function public.admin_npc_rua(integer) to authenticated;
end $$;
