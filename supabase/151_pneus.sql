-- 151: pneu furado a tiro (22b). Cada bit de carros.pneus é uma roda murcha (na ordem das rodas do modelo).
-- Quem atira num carro parado fura (o servidor confere se o carro está ali); quem dirige recebe o tiro e fura o
-- próprio. Trocar os pneus: 200 por pneu, na Concessionária (lista "Seus carros"). Consertar o carro queimado
-- também troca os pneus. Rode depois do 150.
alter table public.carros add column if not exists pneus smallint not null default 0;
alter table public.perfis add column if not exists furou_em timestamptz;

create or replace function public.furar_pneu(p_carro bigint, p_roda integer, p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c carros%rowtype; m integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p_roda < 0 or p_roda > 7 then raise exception 'roda invalida'; end if;
  select * into c from carros where id = p_carro for update;
  if c.id is null or c.modelo = 'presidencial' then raise exception 'veiculo invalido'; end if;
  if c.dono <> p.id then   -- carro dos outros: tem que estar onde o tiro acertou, e no máximo 4 pneus a cada 2 s
    if abs(c.x - p_x) > 8 or abs(c.z - p_z) > 8 then raise exception 'veiculo invalido'; end if;
    if p.furou_em is not null and p.furou_em > now() - interval '0.4 seconds' then raise exception 'aguarde'; end if;
    update perfis set furou_em = now() where id = p.id;
  end if;
  m := c.pneus | (1 << p_roda);
  update carros set pneus = m where id = c.id;
  return m;
end $$;

create or replace function public.trocar_pneus(p_carro bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c carros%rowtype; n integer; preco integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  select * into c from carros where id = p_carro for update;
  if c.id is null or c.dono <> p.id then raise exception 'esse carro nao e seu'; end if;
  n := (select count(*) from generate_series(0, 7) b where (c.pneus >> b) & 1 = 1);
  if n = 0 then raise exception 'os pneus estao bons'; end if;
  preco := n * 200;
  if p.moedas < preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - preco where id = p.id;
  update carros set pneus = 0 where id = c.id;
  return preco;
end $$;

-- consertar o carro queimado já vem com pneus novos
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
  update carros set queimado = false, pneus = 0 where id = c.id;
  return 5000;
end $$;

do $$ declare f text; begin
  foreach f in array array['furar_pneu(bigint,integer,real,real)', 'trocar_pneus(bigint)', 'consertar_carro(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
