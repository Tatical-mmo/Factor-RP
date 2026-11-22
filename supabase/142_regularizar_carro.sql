-- 142: carro roubado de outro jogador vira do ladrão no mecânico, pagando 50% do preço da concessionária.
-- O antigo dono perde o carro e recebe um aviso. Respeita o limite de 3 carros. Rode depois do 141.
alter table public.carros add column if not exists bloqueio_em timestamptz;
create or replace function public.regularizar_carro(p_carro bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c carros%rowtype; preco integer; n integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  select * into c from carros where id = p_carro for update;
  if c.id is null or c.ladrao is distinct from p.id or c.dono = p.id then raise exception 'esse carro nao esta com voce'; end if;
  preco := ceil(coalesce(preco_carro(c.modelo), 0) * 0.5);
  if c.modelo = 'presidencial' or preco <= 0 then raise exception 'esse carro nao pode ser regularizado'; end if;
  select count(*) into n from carros where dono = p.id and modelo <> 'presidencial';
  if n >= 3 then raise exception 'limite de 3 carros'; end if;
  if p.moedas < preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - preco where id = p.id;
  update carros set dono = p.id, ladrao = null, bloqueio_em = null where id = c.id;
  perform avisar(c.dono, format('🔧 Seu carro foi regularizado por %s numa oficina e não é mais seu.', p.nome));
  return preco;
end $$;
grant execute on function public.regularizar_carro(bigint) to authenticated;
notify pgrst, 'reload schema';
