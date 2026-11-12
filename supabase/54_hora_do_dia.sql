-- 54 · Hora do dia controlada pelo admin: adiantar para qualquer hora (o ciclo continua dali) ou travar uma hora fixa.
-- Vale para todos os jogadores (eles leem a configuração a cada ~30 s).
alter table public.config_jogo add column if not exists hora_desloc integer not null default 0;   -- segundos somados ao relógio do ciclo
alter table public.config_jogo add column if not exists hora_fixa real;                            -- null = ciclo normal

create or replace function public.admin_hora(p_desloc integer, p_fixa real) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if p_fixa is not null and (p_fixa < 0 or p_fixa >= 24) then raise exception 'hora invalida'; end if;
  update config_jogo set hora_desloc = coalesce(p_desloc, 0) % 86400, hora_fixa = p_fixa, atualizado = now() where id = 1;
end $$;
revoke all on function public.admin_hora(integer, real) from public, anon;
grant execute on function public.admin_hora(integer, real) to authenticated;
