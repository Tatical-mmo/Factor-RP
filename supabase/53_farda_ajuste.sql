-- 53 · Ajuste da farda pelo administrador (tamanho e posição do colete e do capacete/boné de cada corporação)
-- O admin ajusta olhando o próprio personagem e salva: vale para todos os jogadores.
alter table public.config_jogo add column if not exists farda jsonb not null default '{}'::jsonb;

create or replace function public.admin_farda(p_farda jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if p_farda is null or jsonb_typeof(p_farda) <> 'object' or length(p_farda::text) > 8000 then raise exception 'ajuste invalido'; end if;
  update config_jogo set farda = p_farda, atualizado = now() where id = 1;
  if to_regprocedure('public.registrar(uuid,text,jsonb)') is not null then
    perform registrar(null, 'farda', jsonb_build_object('tamanho', length(p_farda::text)));
  end if;
end $$;
revoke all on function public.admin_farda(jsonb) from public, anon;
grant execute on function public.admin_farda(jsonb) to authenticated;
