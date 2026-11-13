-- 73 · Veículo em chamas explode e espalha o fogo; carro de jogador queimado precisa de conserto.
-- Explode se ninguém apagar: carro/van aos 75 s de fogo, ônibus/caminhão aos 100 s (se ainda tiver 40% do fogo).
-- Veículos parados a até 8 m pegam fogo também (o servidor confere distância e horário). Carro de jogador que pega
-- fogo fica inutilizável até o dono pagar 5.000 de conserto (na concessionária).

alter table public.incendios add column if not exists explodiu_em timestamptz;
alter table public.carros    add column if not exists queimado boolean not null default false;

create or replace function public.explodir_incendio(p_incendio bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare f incendios%rowtype;
begin
  if auth.uid() is null then raise exception 'sem permissao'; end if;
  select * into f from incendios where id = p_incendio for update;
  if f.id is null or f.tipo <> 'veiculo' then return false; end if;
  if f.explodiu_em is not null then return true; end if;
  if f.status <> 'ativo' then return false; end if;
  if now() < f.inicio + (case when f.porte >= 2 then interval '100 seconds' else interval '75 seconds' end) then return false; end if;
  if vida_incendio(f) < ceil(f.vida_max * 0.4) then return false; end if;   -- os bombeiros já tinham baixado o fogo
  update incendios set explodiu_em = now() where id = f.id;
  return true;
end $$;

-- fogo pulando para um veículo parado perto da explosão
create or replace function public.propagar_fogo(p_origem bigint, p_ref text, p_x real, p_z real, p_nome text, p_porte integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare f incendios%rowtype; c carros%rowtype; v integer; novo bigint;
begin
  if auth.uid() is null then raise exception 'sem permissao'; end if;
  select * into f from incendios where id = p_origem;
  if f.id is null or f.explodiu_em is null or f.explodiu_em < now() - interval '90 seconds' then raise exception 'sem explosao'; end if;
  if sqrt(power(f.x - p_x, 2) + power(f.z - p_z, 2)) > 9 then raise exception 'longe da explosao'; end if;
  if coalesce(p_ref, '') !~ '^[a-z]{2,5}:[0-9a-z._-]{1,40}$' then raise exception 'veiculo invalido'; end if;
  if exists (select 1 from incendios where ref = p_ref and status = 'ativo') then return null; end if;
  if p_ref like 'car:%' then
    select * into c from carros where id = substring(p_ref from 5)::bigint for update;
    if c.id is null or abs(c.x - p_x) > 4 or abs(c.z - p_z) > 4 then raise exception 'veiculo invalido'; end if;
    update carros set queimado = true where id = c.id;
    perform avisar(c.dono, '🔥 Uma explosão incendiou o seu carro! Ele precisa de conserto (5.000) na concessionária.');
  end if;
  v := case when p_porte >= 2 then 24 else 12 end;
  insert into incendios (tipo, alvo, nome, x, z, vida, vida_max, ref, porte)
    values ('veiculo', 0, left(coalesce(nullif(p_nome, ''), 'Veículo'), 40), p_x, p_z, v, v, p_ref, case when p_porte >= 2 then 2 else 1 end)
    returning id into novo;
  return novo;
end $$;

create or replace function public.consertar_carro(p_carro bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c carros%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  select * into c from carros where id = p_carro for update;
  if c.id is null or c.dono <> p.id then raise exception 'esse carro nao e seu'; end if;
  if not c.queimado then raise exception 'o carro nao precisa de conserto'; end if;
  if exists (select 1 from incendios where ref = 'car:' || c.id and status = 'ativo') then raise exception 'ja esta pegando fogo'; end if;
  if p.moedas < 5000 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 5000 where id = p.id;
  update carros set queimado = false where id = c.id;
  return 5000;
end $$;

do $$
declare f text;
begin
  foreach f in array array['explodir_incendio(bigint)', 'propagar_fogo(bigint, text, real, real, text, integer)', 'consertar_carro(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
