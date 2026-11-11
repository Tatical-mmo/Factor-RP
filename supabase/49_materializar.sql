-- Fator RP - materializar o carro ou veículo particular do lado do dono, na hora, por 150 moedas.
-- Também: carros podem ficar estacionados nas ruas novas do horizonte (até 640 m do centro).
-- Rode depois do 48.

create or replace function public.estacionar_carro(p_carro bigint, p_x real, p_z real, p_ang real) returns void
language plpgsql security definer set search_path = public as $$
begin
  if abs(p_z) > 700 then
    p_x := greatest(-300, least(300, p_x)); p_z := sign(p_z) * greatest(900, least(1170, abs(p_z)));
  else
    p_x := greatest(-640, least(640, p_x)); p_z := greatest(-640, least(640, p_z));
  end if;
  update carros set x = p_x, z = p_z, ang = p_ang
    where id = p_carro and ((dono = auth.uid() and ladrao is null) or ladrao = auth.uid());
  if not found then raise exception 'esse carro nao e seu'; end if;
end $$;

create or replace function public.materializar_carro(p_carro bigint, p_x real, p_z real, p_ang real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c carros%rowtype;
begin
  p := jogador_livre();
  select * into c from carros where id = p_carro and dono = p.id for update;
  if c.id is null then raise exception 'esse carro nao e seu'; end if;
  if c.ladrao is not null then raise exception 'o carro foi roubado: use o bloqueio'; end if;
  if c.destruido_ate is not null and c.destruido_ate > now() then raise exception 'o carro foi destruido: espere'; end if;
  update perfis set moedas = moedas - 150 where id = p.id and moedas >= 150;
  if not found then raise exception 'moedas insuficientes'; end if;
  perform estacionar_carro(p_carro, p_x, p_z, p_ang);
  return p.moedas - 150;
end $$;

create or replace function public.materializar_veiculo(p_caminhao bigint, p_x real, p_z real, p_ang real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c caminhoes%rowtype;
begin
  p := jogador_livre();
  c := veiculo_do_dono(p_caminhao);
  if c.sequestrado then raise exception 'o veiculo foi roubado: use o bloqueio'; end if;
  if not (c.status = 'parado' or (c.status = 'dirigido' and c.motorista is null)) then raise exception 'o veiculo esta ocupado'; end if;
  update perfis set moedas = moedas - 150 where id = p.id and moedas >= 150;
  if not found then raise exception 'moedas insuficientes'; end if;
  update caminhoes set status = 'dirigido', motorista = null, pos_x = p_x, pos_z = p_z, ang = coalesce(p_ang, 0), ativo_em = now() where id = c.id;
  return p.moedas - 150;
end $$;

do $$
declare f text;
begin
  foreach f in array array['materializar_carro(bigint, real, real, real)', 'materializar_veiculo(bigint, real, real, real)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
