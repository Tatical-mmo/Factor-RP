-- 121: as fardas já vêm com o colete; o colete balístico avulso agora é vendido pelo contrabandista
-- do Morro da Serra: 8.000 moedas, qualquer jogador pode comprar e não é crime. Rode depois do 120.
create or replace function public.comprar_colete() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  update perfis set moedas = moedas - 8000 where id = p.id and moedas >= 8000;
  if not found then raise exception 'moedas insuficientes'; end if;
  return 8000;
end $$;
revoke all on function public.comprar_colete() from public, anon;
grant execute on function public.comprar_colete() to authenticated;
notify pgrst, 'reload schema';
