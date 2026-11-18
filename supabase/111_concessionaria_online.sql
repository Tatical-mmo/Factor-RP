-- 111: Concessionária online (celular e computador da empresa).
-- Mesmos carros da loja, 15% mais caros; o carro novo aparece no estacionamento mais perto do jogador.
-- Rode depois do 110.

create or replace function public.comprar_carro_online(p_modelo text, p_cor text, p_x real, p_z real, p_ang real) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; preco integer; n integer; novo bigint;
begin
  if p_modelo = 'helicoptero' then raise exception 'helicoptero so na loja'; end if;
  preco := ceil(preco_carro(p_modelo) * 1.15);
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if preco is null or p_modelo = 'presidencial' then raise exception 'modelo invalido'; end if;
  if p_x is null or p_z is null or abs(p_x) > 4000 or abs(p_z) > 4000 then raise exception 'local de entrega invalido'; end if;
  if coalesce(p_cor, '') !~ '^#[0-9a-fA-F]{6}$' then p_cor := '#c0392b'; end if;
  select count(*) into n from carros where dono = p.id and modelo <> 'presidencial';
  if n >= 10 then raise exception 'limite de 10 carros'; end if;
  if p.moedas < preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - preco where id = p.id;
  insert into carros (dono, modelo, cor, x, z, ang) values (p.id, p_modelo, p_cor, p_x, p_z, coalesce(p_ang, 0))
    returning id into novo;
  return novo;
end $$;
grant execute on function public.comprar_carro_online(text, text, real, real, real) to authenticated;
notify pgrst, 'reload schema';
