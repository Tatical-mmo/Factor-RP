-- Fator RP - o administrador vê qual é o bueiro secreto dos Lixeiros e pode sortear outro.
-- Rode depois do 45.

create or replace function public.admin_bueiro_secreto() returns integer
language plpgsql stable security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'sem permissao'; end if;
  return (select bueiro_secreto from esgoto_config where id = 1);
end $$;

create or replace function public.admin_sortear_bueiro() returns integer
language plpgsql security definer set search_path = public as $$
declare atual integer := (select bueiro_secreto from esgoto_config where id = 1); novo integer;
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'sem permissao'; end if;
  novo := (atual + 1 + floor(random() * 15)::int) % 16;   -- sempre um diferente do atual
  update esgoto_config set bueiro_secreto = novo where id = 1;
  return novo;
end $$;

revoke all on function public.admin_bueiro_secreto() from public, anon;
revoke all on function public.admin_sortear_bueiro() from public, anon;
grant execute on function public.admin_bueiro_secreto() to authenticated;
grant execute on function public.admin_sortear_bueiro() to authenticated;
