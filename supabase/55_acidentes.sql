-- 55 · Acidentes: o carro do jogador explode depois de muitas batidas (ou de primeira se bater no trem).
-- Quem dirige (dono ou quem roubou) avisa o servidor; o carro some por 30 s e volta para o dono (como no tiro de tanque).
create or replace function public.acidente_carro(p_carro bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update carros set destruido_ate = now() + interval '30 seconds', ladrao = null
   where id = p_carro and modelo <> 'presidencial'
     and (dono = auth.uid() or ladrao = auth.uid())
     and (destruido_ate is null or destruido_ate < now());
end $$;
revoke all on function public.acidente_carro(bigint) from public, anon;
grant execute on function public.acidente_carro(bigint) to authenticated;
