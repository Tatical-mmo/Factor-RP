-- 100 · Cada jogador pode ter até 10 carros (antes eram 3). Vender continua igual (devolve a metade).
create or replace function public.comprar_carro(p_modelo text, p_cor text) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; preco integer := preco_carro(p_modelo); n integer; novo bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if preco is null then raise exception 'modelo invalido'; end if;
  if coalesce(p_cor, '') !~ '^#[0-9a-fA-F]{6}$' then p_cor := '#c0392b'; end if;
  select count(*) into n from carros where dono = p.id and modelo <> 'presidencial';
  if n >= 10 then raise exception 'limite de 10 carros'; end if;
  if p.moedas < preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - preco where id = p.id;
  insert into carros (dono, modelo, cor, x, z, ang) values (p.id, p_modelo, p_cor, 120 + (n % 5) * 7 + (random() * 2)::real, -119, 0)
    returning id into novo;
  return novo;
end $$;
notify pgrst, 'reload schema';
