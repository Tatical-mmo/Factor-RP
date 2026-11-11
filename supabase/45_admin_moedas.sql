-- Fator RP - o administrador dá (ou tira) qualquer valor em moedas, sem o limite de 10 milhões por vez.
-- Moderadores continuam com o limite de 10 milhões. O saldo máximo de um jogador é 2.147.483.647 moedas.
-- Rode depois do 44a.

create or replace function public.admin_moedas(alvo uuid, valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare novo integer; admin boolean := cargo_de(auth.uid()) = 'admin';
begin
  if not pode('moedas') then raise exception 'sem permissao'; end if;
  if alvo = auth.uid() then
    if not admin then raise exception 'moderador nao muda as proprias moedas'; end if;
  elsif not pode_agir_em(alvo) then raise exception 'voce nao pode mudar as moedas desse jogador'; end if;
  if not admin and abs(valor::bigint) > 10000000 then raise exception 'valor muito alto'; end if;
  update perfis set moedas = least(2147483647::bigint, greatest(0::bigint, moedas::bigint + valor))::integer where id = alvo returning moedas into novo;
  if novo is null then raise exception 'jogador nao encontrado'; end if;
  perform registrar(alvo, 'moedas', jsonb_build_object('valor', valor, 'saldo', novo));
  return novo;
end $$;
