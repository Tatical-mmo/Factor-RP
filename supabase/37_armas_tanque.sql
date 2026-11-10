-- Fator RP - armas das corporações, arma militar dos clãs, arma pesada do Exército, tanque e disciplina militar.
-- Ficha militar: toda morte causada por militar fica registrada; quem tem patente maior vê e pode expulsar do Exército.
-- Arma pesada: só com autorização de Tenente para cima (ou do General Supremo), só em serviço; matar sem
-- autorização (vítima sem crimes e sem caçada) tira a autorização na hora.
-- Tanque: a bola dele explode carros; o carro volta para o dono 30 s depois.
-- Rode depois do 36.

alter table public.perfis add column if not exists expulso_exercito boolean not null default false;
alter table public.perfis add column if not exists arma_militar boolean not null default false;
alter table public.perfis add column if not exists arma_pesada_ate timestamptz;
alter table public.carros add column if not exists destruido_ate timestamptz;

create table if not exists public.mortes_militares (
  id         bigint generated always as identity primary key,
  militar    uuid not null references public.perfis (id) on delete cascade,
  vitima     uuid references public.perfis (id) on delete set null,
  autorizada boolean not null,
  criada_em  timestamptz not null default now()
);
alter table public.mortes_militares enable row level security;
revoke all on public.mortes_militares from anon, authenticated;

create or replace function public.nivel_exercito(p uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case when (select cargo from perfis where id = p) = 'admin' then 99
    else coalesce((select (patente('exercito', minutos) ->> 'nivel')::integer from carreiras where jogador = p and carreira = 'exercito'), 0) end;
$$;

-- quem foi expulso não volta sozinho
create or replace function public.entrar_profissao(p_profissao text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p_profissao not in ('medico', 'bombeiro', 'jornalista', 'exercito') then raise exception 'profissao invalida'; end if;
  if p.policial or p.prf then raise exception 'saia da policia antes'; end if;
  if p.crimes > 0 then raise exception 'procurado nao pode trabalhar no servico publico'; end if;
  if p_profissao = 'exercito' and p.expulso_exercito then raise exception 'voce foi expulso do exercito'; end if;
  update perfis set profissao = p_profissao, profissao_desde = now() where id = p.id;
end $$;

-- ficha militar: militares abaixo de mim, com mortes (e quantas sem autorização), arma pesada e expulsos
create or replace function public.ficha_militar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare eu integer := nivel_exercito(auth.uid());
begin
  if eu < 2 or not ((select profissao from perfis where id = auth.uid()) = 'exercito' or eu = 99) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x order by (x ->> 'nivel')::integer desc) from (
    select jsonb_build_object('id', p.id, 'jogador', p.nome, 'nivel', nivel_exercito(p.id), 'patente', patente('exercito', coalesce(c.minutos, 0)) ->> 'nome',
      'expulso', p.expulso_exercito, 'pesada', coalesce(p.arma_pesada_ate > now(), false),
      'mortes', (select count(*) from mortes_militares m where m.militar = p.id),
      'sem_ordem', (select count(*) from mortes_militares m where m.militar = p.id and not m.autorizada),
      'ultimas', (select coalesce(jsonb_agg(jsonb_build_object('vitima', v.nome, 'quando', m.criada_em, 'autorizada', m.autorizada) order by m.criada_em desc), '[]'::jsonb)
                  from (select * from mortes_militares where militar = p.id order by criada_em desc limit 5) m left join perfis v on v.id = m.vitima)) as x
    from perfis p left join carreiras c on c.jogador = p.id and c.carreira = 'exercito'
    where (p.profissao = 'exercito' or p.expulso_exercito) and p.cargo <> 'admin' and nivel_exercito(p.id) < eu) t), '[]'::jsonb);
end $$;

create or replace function public.expulsar_exercito(p_alvo uuid, p_expulsar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if nivel_exercito(p_alvo) >= nivel_exercito(auth.uid()) or nivel_exercito(auth.uid()) < 8 then raise exception 'so patente maior'; end if;
  if p_expulsar then
    update perfis set expulso_exercito = true, arma_pesada_ate = null, profissao = case when profissao = 'exercito' then null else profissao end where id = p_alvo;
    insert into comandos (alvo, autor, tipo, dados) values (p_alvo, auth.uid(), 'aviso', jsonb_build_object('texto', '🎖️ Você foi EXPULSO do Exército por mau comportamento.'));
  else
    update perfis set expulso_exercito = false where id = p_alvo;
    insert into comandos (alvo, autor, tipo, dados) values (p_alvo, auth.uid(), 'aviso', jsonb_build_object('texto', '🎖️ Sua expulsão do Exército foi retirada. Você pode se alistar de novo.'));
  end if;
  perform registrar(p_alvo, case when p_expulsar then 'expulso_exercito' else 'readmitido_exercito' end);
end $$;

-- arma pesada: autorizar por algumas horas (0 = tirar)
create or replace function public.autorizar_arma_pesada(p_alvo uuid, p_horas integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if nivel_exercito(p_alvo) >= nivel_exercito(auth.uid()) or nivel_exercito(auth.uid()) < 8 then raise exception 'so patente maior'; end if;
  if (select profissao from perfis where id = p_alvo) is distinct from 'exercito' then raise exception 'ele nao esta no exercito'; end if;
  update perfis set arma_pesada_ate = case when p_horas > 0 then now() + make_interval(hours => least(p_horas, 24)) end where id = p_alvo;
  if p_horas > 0 then
    insert into comandos (alvo, autor, tipo, dados) values (p_alvo, auth.uid(), 'aviso', jsonb_build_object('texto', format('🎖️ Você está autorizado a usar a ARMA PESADA por %s h. Pegue no paiol do quartel.', least(p_horas, 24))));
  end if;
end $$;

-- a vítima avisa quem a matou; se foi militar, entra na ficha dele
create or replace function public.registrar_morte_militar(p_militar uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v perfis%rowtype; ok boolean;
begin
  select * into v from perfis where id = auth.uid();
  if v.id is null or p_militar is null or p_militar = v.id then return; end if;
  if (select profissao from perfis where id = p_militar) is distinct from 'exercito' then return; end if;
  if exists (select 1 from mortes_militares where militar = p_militar and vitima = v.id and criada_em > now() - interval '30 seconds') then return; end if;
  ok := v.crimes > 0 or exists (select 1 from cacadas where alvo = v.id and ate > now());
  insert into mortes_militares (militar, vitima, autorizada) values (p_militar, v.id, ok);
  if not ok then
    update perfis set arma_pesada_ate = null where id = p_militar and arma_pesada_ate is not null;
    insert into comandos (alvo, autor, tipo, dados) values (p_militar, v.id, 'aviso',
      jsonb_build_object('texto', format('🎖️ Você matou %s sem ordem. Isso foi para a sua ficha militar e você perdeu a arma pesada.', v.nome)));
  end if;
end $$;

-- arma militar dos clãs: vendida ilegalmente pelo contrabandista do Morro da Serra (só para membros de clã)
create or replace function public.comprar_arma_militar() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla compram'; end if;
  if p.arma_militar then raise exception 'voce ja tem a arma militar'; end if;
  update perfis set moedas = moedas - 60000, arma_militar = true, crimes = crimes + 1 where id = p.id and moedas >= 60000;
  if not found then raise exception 'moedas insuficientes'; end if;
  return 60000;
end $$;

-- tanque: a bola explode o carro; ele some por 30 s e volta para o dono (se tinha ladrão, perde)
create or replace function public.explodir_carro(p_carro bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not ((select profissao from perfis where id = auth.uid()) = 'exercito' or (select cargo from perfis where id = auth.uid()) = 'admin') then raise exception 'so o exercito'; end if;
  update carros set destruido_ate = now() + interval '30 seconds', ladrao = null where id = p_carro and modelo <> 'presidencial'
    and (destruido_ate is null or destruido_ate < now());
end $$;

do $$
declare f text;
begin
  foreach f in array array['ficha_militar()', 'expulsar_exercito(uuid, boolean)', 'autorizar_arma_pesada(uuid, integer)', 'registrar_morte_militar(uuid)',
                           'comprar_arma_militar()', 'explodir_carro(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.nivel_exercito(uuid) from public, anon, authenticated;
end $$;
