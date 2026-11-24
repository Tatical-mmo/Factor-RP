-- 154: pneu furado nos NPCs e o guincho (22d). Rode depois do 153.
-- Cada pane fica salva para todos verem o mesmo: o veículo encosta no meio-fio com o pisca-alerta e espera.
--  * 1 pneu: vem uma Saveiro com pneus na caçamba; o mecânico troca em 1 minuto (a pane dura 100 s).
--  * 2 ou mais: vem o guincho com o mecânico, os passageiros descem e o veículo é rebocado para o pátio do guincho
--    (75 s na rua). Fica no pátio por dois dias do jogo (64 min) e depois volta a rodar.
--  * carro estacionado na vaga (rua:): só fica com o pneu murcho por 10 minutos.
-- Também: o mecânico pelo celular para o seu carro (200 por pneu, troca na rua onde o carro está).
create table if not exists public.npc_panes (
  ref text primary key,
  mask smallint not null default 0,
  x real not null, z real not null, ang real not null default 0,
  guincho boolean not null default false,
  vaga smallint,
  criado_em timestamptz not null default now(),
  fim_em timestamptz not null,
  patio_ate timestamptz
);
alter table public.npc_panes enable row level security;
drop policy if exists npc_panes_ler on public.npc_panes;
create policy npc_panes_ler on public.npc_panes for select to authenticated using (true);
alter table public.perfis add column if not exists furou_npc_em timestamptz;

create or replace function public.furar_pneu_npc(p_ref text, p_roda integer, p_x real, p_z real, p_ang real) returns public.npc_panes
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; r npc_panes%rowtype; m integer; n integer; v integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p_ref !~ '^(van|bomb|bus|rua):[A-Za-z0-9._-]{1,24}$' then raise exception 'veiculo invalido'; end if;
  if p_roda < 0 or p_roda > 7 then raise exception 'roda invalida'; end if;
  if p.furou_npc_em is not null and p.furou_npc_em > now() - interval '0.3 seconds' then raise exception 'aguarde'; end if;
  update perfis set furou_npc_em = now() where id = p.id;
  select * into r from npc_panes where ref = p_ref for update;
  if r.ref is not null and r.patio_ate is not null and r.fim_em <= now() and r.patio_ate > now() then raise exception 'veiculo no patio'; end if;
  if r.ref is null or coalesce(r.patio_ate, r.fim_em) <= now() then   -- pane nova
    delete from npc_panes where ref = p_ref;
    insert into npc_panes (ref, mask, x, z, ang, fim_em)
      values (p_ref, 1 << p_roda, p_x, p_z, coalesce(p_ang, 0),
              now() + case when p_ref like 'rua:%' then interval '10 minutes' else interval '100 seconds' end)
      returning * into r;
    return r;
  end if;
  if r.guincho then return r; end if;   -- o guincho já foi chamado
  m := r.mask | (1 << p_roda);
  if m = r.mask then return r; end if;
  n := (select count(*) from generate_series(0, 7) b where (m >> b) & 1 = 1);
  if n >= 2 and p_ref not like 'rua:%' then   -- dois pneus: chama o guincho (o tempo conta de agora)
    select g into v from generate_series(0, 7) g
      where g not in (select vaga from npc_panes where vaga is not null and patio_ate > now()) order by g limit 1;
    update npc_panes set mask = m, guincho = true, vaga = v, fim_em = now() + interval '75 seconds',
      patio_ate = case when v is null then now() + interval '75 seconds' else now() + interval '75 seconds' + interval '64 minutes' end
      where ref = p_ref returning * into r;
  else
    update npc_panes set mask = m where ref = p_ref returning * into r;
  end if;
  return r;
end $$;

create or replace function public.npc_panes_ativas() returns setof public.npc_panes
language sql stable security definer set search_path = public as $$
  select * from npc_panes where coalesce(patio_ate, fim_em) > now();
$$;

-- mecânico pelo celular: troca os pneus do seu carro onde ele estiver (200 por pneu). O carro fica parado 1 minuto
-- enquanto o mecânico trabalha (o jogo mostra a Saveiro ou o guincho chegando).
create or replace function public.mecanico_pneus(p_carro bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c carros%rowtype; n integer; preco integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  select * into c from carros where id = p_carro for update;
  if c.id is null or c.dono <> p.id then raise exception 'esse carro nao e seu'; end if;
  if c.queimado then raise exception 'o carro esta queimado: leve na oficina'; end if;
  n := (select count(*) from generate_series(0, 7) b where (c.pneus >> b) & 1 = 1);
  if n = 0 then raise exception 'os pneus estao bons'; end if;
  preco := n * 200;
  if p.moedas < preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - preco where id = p.id;
  update carros set pneus = 0 where id = c.id;
  return preco;
end $$;

do $$ declare f text; begin
  foreach f in array array['furar_pneu_npc(text,integer,real,real,real)', 'npc_panes_ativas()', 'mecanico_pneus(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
