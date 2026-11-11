-- Fator RP - QG do clã (parte 2 de 2): assalto ao cargueiro do Porto Sul.
-- Um membro planeja na mesa do QG. O assalto dura 15 min e o navio tem 6 contêineres.
-- Arrombar um contêiner dá 1 "Carga do cargueiro" na mochila e deixa o jogador procurado (+2 crimes).
-- Entregue a carga no cofre do QG: 6.000 para o caixa do clã e 1.500 para quem entregou, por carga.
-- Preso com carga na mochila: a polícia confisca. Um assalto por vez na cidade; cada clã a cada 2 horas.
-- Rode depois do 41a.

create table if not exists public.assaltos_navio (
  id      bigint generated always as identity primary key,
  cla     bigint not null references public.clas (id) on delete cascade,
  inicio  timestamptz not null default now(),
  fim     timestamptz not null,
  abertos integer[] not null default '{}'
);
do $$
begin
  alter table public.assaltos_navio enable row level security;
  drop policy if exists "leitura publica" on public.assaltos_navio;
  create policy "leitura publica" on public.assaltos_navio for select using (true);
  revoke all on public.assaltos_navio from anon, authenticated;
  grant select on public.assaltos_navio to anon, authenticated;
end $$;

-- assalto em andamento (para todos: a polícia também vê)
create or replace function public.assalto_navio_atual() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'cla', a.cla, 'cla_nome', c.nome, 'cor', c.cor, 'inicio', a.inicio, 'fim', a.fim, 'abertos', a.abertos)
  from assaltos_navio a join clas c on c.id = a.cla where a.fim > now() order by a.id desc limit 1;
$$;

create or replace function public.cla_assalto_iniciar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; ult timestamptz;
begin
  c := meu_cla();
  if c.id is null then raise exception 'voce nao esta em um cla'; end if;
  if qg_do_meu_cla() is null then raise exception 'seu cla nao tem base'; end if;
  if (select pena_seg > 0 or algemado from perfis where id = auth.uid()) then raise exception 'voce esta preso'; end if;
  perform pg_advisory_xact_lock(424242);
  if exists (select 1 from assaltos_navio where fim > now()) then raise exception 'cargueiro ja esta sendo assaltado'; end if;
  select max(inicio) into ult from assaltos_navio where cla = c.id;
  if ult is not null and ult > now() - interval '2 hours' then raise exception 'aguarde para outro assalto'; end if;
  insert into assaltos_navio (cla, fim) values (c.id, now() + interval '15 minutes');
  return assalto_navio_atual();
end $$;

-- p_k: contêiner 0 a 5. Só depois de 20 s do início (tempo de chegar ao navio).
create or replace function public.cla_assalto_arrombar(p_k integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; a assaltos_navio%rowtype;
begin
  c := meu_cla();
  if c.id is null then raise exception 'voce nao esta em um cla'; end if;
  if p_k is null or p_k < 0 or p_k > 5 then raise exception 'conteiner invalido'; end if;
  if (select pena_seg > 0 or algemado from perfis where id = auth.uid()) then raise exception 'voce esta preso'; end if;
  select * into a from assaltos_navio where cla = c.id and fim > now() order by id desc limit 1 for update;
  if a.id is null then raise exception 'nenhum assalto do seu cla'; end if;
  if now() < a.inicio + interval '20 seconds' then raise exception 'cedo demais'; end if;
  if p_k = any (a.abertos) then raise exception 'conteiner ja aberto'; end if;
  update assaltos_navio set abertos = abertos || p_k where id = a.id;
  update perfis set crimes = crimes + 2 where id = auth.uid();
  return dar_item(auth.uid(), 'carga_navio', 1);
end $$;

create or replace function public.cla_assalto_entregar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; q integer;
begin
  c := meu_cla();
  if c.id is null then raise exception 'voce nao esta em um cla'; end if;
  if qg_do_meu_cla() is null then raise exception 'seu cla nao tem base'; end if;
  select qtd into q from inventario where dono = auth.uid() and item = 'carga_navio' for update;
  if coalesce(q, 0) < 1 then raise exception 'sem carga'; end if;
  delete from inventario where dono = auth.uid() and item = 'carga_navio';
  update clas set caixa = caixa + 6000 * q where id = c.id;
  update perfis set moedas = moedas + 1500 * q where id = auth.uid();
  return jsonb_build_object('cargas', q, 'cla', 6000 * q, 'voce', 1500 * q);
end $$;

-- preso com a carga: a polícia confisca
create or replace function public.confiscar_carga_navio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pena_seg > 0 and coalesce(old.pena_seg, 0) = 0 then
    delete from inventario where dono = new.id and item = 'carga_navio';
  end if;
  return new;
end $$;
drop trigger if exists confiscar_carga_navio on public.perfis;
create trigger confiscar_carga_navio after update of pena_seg on public.perfis
  for each row execute function public.confiscar_carga_navio();

do $$
declare f text;
begin
  foreach f in array array['assalto_navio_atual()', 'cla_assalto_iniciar()', 'cla_assalto_arrombar(integer)', 'cla_assalto_entregar()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke execute on function public.confiscar_carga_navio() from public, anon, authenticated;
end $$;
