-- Fator RP - roubar os carros estacionados nas ruas da cidade (é crime: +1 nas estrelas de procurado).
-- O carro volta sozinho para a vaga de origem depois de 5 minutos parado (isso o jogo controla).
-- Rode depois do 47.

alter table public.perfis add column if not exists roubo_rua_em timestamptz;

create or replace function public.roubar_carro_rua() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.roubo_rua_em is not null and p.roubo_rua_em > now() - interval '8 seconds' then raise exception 'devagar'; end if;
  if p.policial or p.prf then raise exception 'policial nao rouba carro'; end if;
  update perfis set crimes = crimes + 1, roubo_rua_em = now() where id = p.id;
  return p.crimes + 1;
end $$;
revoke all on function public.roubar_carro_rua() from public, anon;
grant execute on function public.roubar_carro_rua() to authenticated;
