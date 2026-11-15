-- 93a · Hospital: remédio caro na loja, almoxarifado e medicação gratuita.
-- • A loja passa a vender o remédio por 3.000 (antes 300): vale mais a pena ir ao hospital.
-- • Almoxarifado (anexo do hospital, só funcionários): o médico em serviço pega até 20 remédios.
-- • Do 2º nível da carreira (Enfermeiro) em diante, o médico em serviço medica jogadores DE GRAÇA dentro do hospital
--   (+50 de vida) e ganha a comissão por medicação que o ADM define (padrão 150).
update public.precos set compra = 3000 where item = 'remedio';

alter table public.perfis add column if not exists remedios_hosp integer not null default 0;
alter table public.config_jogo add column if not exists comissao_remedio integer not null default 150;

create table if not exists public.medicacoes (
  id       bigint generated always as identity primary key,
  medico   uuid not null references public.perfis (id) on delete cascade,
  paciente uuid not null references public.perfis (id) on delete cascade,
  comissao integer not null default 0,
  criado   timestamptz not null default now()
);
create index if not exists medicacoes_paciente on public.medicacoes (paciente, criado desc);
do $$ begin
  alter table public.medicacoes enable row level security;
  revoke all on public.medicacoes from anon, authenticated;
end $$;

-- dentro do terreno do hospital (o mesmo quadrado do turno dos doutores)
create or replace function public.no_hospital(p_x real, p_z real) returns boolean
language sql immutable as $$ select abs(p_x + 135) <= 45 and abs(p_z - 135) <= 45; $$;

-- almoxarifado: anexo a leste do hospital (x -119,3..-114,3, z 135,5..144,5; porta virada para a frente)
create or replace function public.almox_pegar(p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.profissao is distinct from 'medico' then raise exception 'so funcionarios do hospital em servico'; end if;
  if p_x < -124 or p_x > -112 or p_z < 133 or p_z > 147 then raise exception 'va ate o almoxarifado do hospital'; end if;
  if p.remedios_hosp >= 20 then raise exception 'voce ja esta com 20 remedios'; end if;
  update perfis set remedios_hosp = 20 where id = p.id;
  return 20;
end $$;

create or replace function public.medicar(p_alvo uuid, p_x real, p_z real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a perfis%rowtype; m integer; niv integer; com integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.profissao is distinct from 'medico' then raise exception 'so medicos em servico'; end if;
  select minutos into m from carreiras where jogador = p.id and carreira = 'medico';
  niv := coalesce((patente('medico', coalesce(m, 0)) ->> 'nivel')::integer, 1);
  if niv < 2 then raise exception 'socorrista ainda nao medica: so do nivel enfermeiro em diante'; end if;
  if not no_hospital(p_x, p_z) then raise exception 'a medicacao gratuita e so dentro do hospital'; end if;
  if p.remedios_hosp <= 0 then raise exception 'acabaram seus remedios: pegue mais no almoxarifado'; end if;
  select * into a from perfis where id = p_alvo;
  if a.id is null or a.banido then raise exception 'jogador invalido'; end if;
  if a.id = p.id then raise exception 'voce nao pode medicar a si mesmo'; end if;
  if exists (select 1 from medicacoes where paciente = a.id and criado > now() - interval '60 seconds') then raise exception 'esse paciente acabou de ser medicado'; end if;
  com := coalesce((select comissao_remedio from config_jogo where id = 1), 150);
  update perfis set remedios_hosp = remedios_hosp - 1, moedas = moedas + com where id = p.id;
  insert into medicacoes (medico, paciente, comissao) values (p.id, a.id, com);
  insert into comandos (alvo, autor, tipo, dados) values (a.id, p.id, 'medicado', jsonb_build_object('medico', p.nome));
  return jsonb_build_object('comissao', com, 'restam', p.remedios_hosp - 1, 'nome', a.nome);
end $$;

create or replace function public.admin_comissao_remedio(p_valor integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exige_admin();
  if p_valor is null or p_valor < 0 or p_valor > 100000 then raise exception 'valor invalido'; end if;
  update config_jogo set comissao_remedio = p_valor, atualizado = now() where id = 1;
end $$;

do $$
declare f text;
begin
  foreach f in array array['almox_pegar(real, real)', 'medicar(uuid, real, real)', 'admin_comissao_remedio(integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
