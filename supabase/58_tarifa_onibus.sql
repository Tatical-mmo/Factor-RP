-- 58 · Tarifa dos ônibus (passageiro): 5 moedas por embarque, vai para o cofre da prefeitura.
create or replace function public.tarifa_onibus() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null then raise exception 'sem permissao'; end if;
  if p.moedas < 5 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 5 where id = p.id;
  update prefeitura set cofre = cofre + 5 where id = 1;
  return 5;
end $$;
grant execute on function public.tarifa_onibus() to authenticated;
