-- Fator RP - empregos: mural de vagas, salário por minuto e bater ponto.
-- O dono abre vagas (quantidade, função e salário por minuto). Qualquer jogador sem emprego se candidata
-- no mural e já entra contratado. Funcionário que fica perto de um prédio da empresa "bate ponto"
-- a cada minuto: recebe o salário do caixa da empresa. Operário de fábrica também produz 1 caixa por minuto.

alter table public.membros add column if not exists funcao   text not null default 'motorista';
alter table public.membros add column if not exists salario  integer not null default 0;
alter table public.membros add column if not exists ponto_em timestamptz;
alter table public.membros add column if not exists minutos  integer not null default 0;
alter table public.empresas add column if not exists vagas         integer not null default 0;
alter table public.empresas add column if not exists vaga_funcao   text not null default 'operario';
alter table public.empresas add column if not exists vaga_salario  integer not null default 20;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'membros_funcao_ok') then
    alter table public.membros add constraint membros_funcao_ok check (funcao in ('operario', 'motorista', 'seguranca', 'gerente'));
    alter table public.membros add constraint membros_salario_ok check (salario between 0 and 200);
    alter table public.empresas add constraint empresas_vagas_ok check (vagas between 0 and 60);
    alter table public.empresas add constraint empresas_vaga_funcao_ok check (vaga_funcao in ('operario', 'motorista', 'seguranca', 'gerente'));
    alter table public.empresas add constraint empresas_vaga_salario_ok check (vaga_salario between 5 and 200);
  end if;
end $$;

-- dono publica (ou fecha, com p_vagas = 0) as vagas da empresa
create or replace function public.abrir_vagas(p_empresa bigint, p_vagas integer, p_funcao text, p_salario integer) returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; ocupadas integer;
begin
  e := do_dono(p_empresa);
  if p_funcao not in ('operario', 'motorista', 'seguranca', 'gerente') then raise exception 'funcao invalida'; end if;
  if p_salario is null or p_salario < 5 or p_salario > 200 then raise exception 'salario invalido (5 a 200 por minuto)'; end if;
  select count(*) into ocupadas from membros where empresa = e.id;
  if p_vagas is null or p_vagas < 0 or ocupadas + p_vagas > limite(e.nivel, 'funcionarios') then raise exception 'limite de funcionarios'; end if;
  if p_funcao = 'operario' and not e.fabrica then raise exception 'operario so em fabrica'; end if;
  update empresas set vagas = p_vagas, vaga_funcao = p_funcao, vaga_salario = p_salario where id = e.id;
end $$;

-- dono muda a função e o salário de um funcionário
create or replace function public.ajustar_funcionario(p_empresa bigint, p_jogador uuid, p_funcao text, p_salario integer) returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype;
begin
  e := do_dono(p_empresa);
  if p_funcao not in ('operario', 'motorista', 'seguranca', 'gerente') then raise exception 'funcao invalida'; end if;
  if p_funcao = 'operario' and not e.fabrica then raise exception 'operario so em fabrica'; end if;
  if p_salario is null or p_salario < 0 or p_salario > 200 then raise exception 'salario invalido (0 a 200 por minuto)'; end if;
  update membros set funcao = p_funcao, salario = p_salario where jogador = p_jogador and empresa = e.id and jogador <> e.dono;
  if not found then raise exception 'jogador nao e seu funcionario'; end if;
  perform avisar(p_jogador, format('Seu cargo na %s agora é %s, com salário de %s por minuto.', e.nome, p_funcao, p_salario));
end $$;

-- jogador se candidata a uma vaga do mural
create or replace function public.candidatar_vaga(p_empresa bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e empresas%rowtype;
begin
  p := jogador_livre();
  if p.cargo <> 'jogador' then raise exception 'a equipe nao se candidata'; end if;
  if exists (select 1 from membros where jogador = p.id) then raise exception 'saia da empresa atual antes'; end if;
  select * into e from empresas where id = p_empresa for update;
  if e.id is null or e.vagas < 1 then raise exception 'vaga preenchida'; end if;
  if e.dono = p.id then raise exception 'a empresa e sua'; end if;
  if (select count(*) from membros where empresa = e.id) >= limite(e.nivel, 'funcionarios') then raise exception 'limite de funcionarios'; end if;
  update empresas set vagas = vagas - 1 where id = e.id;
  insert into membros (jogador, empresa, funcao, salario) values (p.id, e.id, e.vaga_funcao, e.vaga_salario);
  perform avisar(e.dono, format('%s foi contratado pelo mural de vagas como %s.', p.nome, e.vaga_funcao));
end $$;

-- bater ponto: chamado a cada minuto pelo jogo enquanto o funcionário está perto da empresa
create or replace function public.bater_ponto(p_x real, p_z real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m membros%rowtype; e empresas%rowtype; perto boolean; pago integer := 0; caixas integer := 0;
begin
  p := jogador_livre();
  select * into m from membros where jogador = p.id for update;
  if m.jogador is null then raise exception 'voce nao tem emprego'; end if;
  select * into e from empresas where id = m.empresa for update;
  if e.dono = p.id then raise exception 'o dono nao bate ponto'; end if;
  select exists (select 1 from unidades u join lotes l on l.id = u.lote where u.empresa = e.id
                 and abs(l.x - p_x) < 26 and abs(l.z - p_z) < 26) into perto;
  if not perto then raise exception 'va ate um predio da empresa'; end if;
  if m.ponto_em is not null and m.ponto_em > now() - interval '55 seconds' then
    return jsonb_build_object('pago', 0, 'caixas', 0, 'espera', ceil(extract(epoch from (m.ponto_em + interval '55 seconds' - now()))));
  end if;
  pago := least(m.salario, e.caixa);
  if m.funcao = 'operario' and e.fabrica then caixas := 1; end if;
  update empresas set caixa = caixa - pago, estoque = estoque + caixas where id = e.id;
  update perfis set moedas = moedas + pago where id = p.id;
  update membros set ponto_em = now(), minutos = minutos + 1 where jogador = p.id;
  if pago < m.salario then perform avisar(p.id, format('A %s está sem caixa para pagar seu salário.', e.nome)); end if;
  return jsonb_build_object('pago', pago, 'caixas', caixas, 'espera', 0);
end $$;

-- mural: empresas com vagas abertas
create or replace function public.mural_vagas() returns table (empresa bigint, nome text, nivel integer, vagas integer, funcao text, salario integer, dono text, fabrica boolean, caixa_ok boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome, e.nivel, e.vagas, e.vaga_funcao, e.vaga_salario, pf.nome, e.fabrica, e.caixa >= e.vaga_salario * 60
    from empresas e join perfis pf on pf.id = e.dono
   where e.vagas > 0 order by e.vaga_salario desc, e.nivel desc limit 40;
$$;

do $$
declare f text;
begin
  foreach f in array array['abrir_vagas(bigint, integer, text, integer)', 'ajustar_funcionario(bigint, uuid, text, integer)',
                           'candidatar_vaga(bigint)', 'bater_ponto(real, real)', 'mural_vagas()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
