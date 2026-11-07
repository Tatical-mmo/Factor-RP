-- Fator RP - empresas v2 (parte 2 de 4): fundar, caixa, funcionários, embalar, evoluir e robôs.

create or replace function public.comprar_lote(p_lote integer, p_nome text, p_tipo text, p_produto text) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; l lotes%rowtype; nova bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if (select count(*) from empresas where dono = p.id) >= 5 then raise exception 'limite de empresas'; end if;
  select * into l from lotes where id = p_lote;
  if l.id is null then raise exception 'lote invalido'; end if;
  if exists (select 1 from unidades where lote = p_lote) then raise exception 'lote ja vendido'; end if;
  if p_tipo not in ('fabrica', 'transportadora') then raise exception 'tipo invalido'; end if;
  if p_tipo = 'fabrica' and coalesce(p_produto, '') not in ('chocolate', 'remedio') then raise exception 'produto invalido'; end if;
  if p_nome !~ '^[[:alnum:] _.&-]{3,24}$' then raise exception 'nome invalido'; end if;
  if exists (select 1 from empresas where lower(nome) = lower(p_nome)) then raise exception 'nome de empresa em uso'; end if;
  if p.moedas < l.preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - l.preco where id = p.id;
  insert into empresas (nome, tipo, dono, lote, produto, fabrica, transporte)
    values (p_nome, p_tipo, p.id, p_lote, case when p_tipo = 'fabrica' then p_produto end, p_tipo = 'fabrica', p_tipo = 'transportadora')
    returning id into nova;
  insert into unidades (lote, empresa, funcao) values (p_lote, nova, p_tipo);
  return nova;
end $$;

create or replace function public.empresa_depositar(p_empresa bigint, valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; novo integer;
begin
  e := do_dono(p_empresa);
  if valor < 1 then raise exception 'valor invalido'; end if;
  update perfis set moedas = moedas - valor where id = auth.uid() and moedas >= valor;
  if not found then raise exception 'moedas insuficientes'; end if;
  update empresas set caixa = caixa + valor where id = e.id returning caixa into novo;
  return novo;
end $$;

create or replace function public.empresa_sacar(p_empresa bigint, valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; novo integer;
begin
  e := do_dono(p_empresa);
  if valor < 1 then raise exception 'valor invalido'; end if;
  update empresas set caixa = caixa - valor where id = e.id and caixa >= valor returning caixa into novo;
  if novo is null then raise exception 'caixa insuficiente'; end if;
  update perfis set moedas = moedas + valor where id = auth.uid();
  return novo;
end $$;

create or replace function public.empresa_pagamento(p_empresa bigint, valor integer) returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype;
begin
  e := do_dono(p_empresa);
  if valor < 0 or valor > 500 then raise exception 'valor invalido'; end if;
  update empresas set pagamento = valor where id = e.id;
end $$;

create or replace function public.contratar(p_empresa bigint, p_nome text) returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; alvo perfis%rowtype;
begin
  e := do_dono(p_empresa);
  select * into alvo from perfis where lower(nome) = lower(p_nome);
  if alvo.id is null then raise exception 'jogador nao encontrado'; end if;
  if alvo.banido then raise exception 'jogador banido'; end if;
  if alvo.id = e.dono then raise exception 'o dono ja trabalha na empresa'; end if;
  if exists (select 1 from membros where jogador = alvo.id) then raise exception 'jogador ja trabalha em uma empresa'; end if;
  if (select count(*) from membros where empresa = e.id) >= limite(e.nivel, 'funcionarios') then raise exception 'limite de funcionarios'; end if;
  insert into membros (jogador, empresa) values (alvo.id, e.id);
  perform avisar(alvo.id, format('Você foi contratado pela %s. Paga %s moedas por tarefa.', e.nome, e.pagamento));
end $$;

create or replace function public.demitir(p_empresa bigint, p_jogador uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype;
begin
  e := do_dono(p_empresa);
  delete from membros where jogador = p_jogador and empresa = e.id;
  if not found then raise exception 'jogador nao e seu funcionario'; end if;
  perform avisar(p_jogador, format('Você foi demitido da %s.', e.nome));
end $$;

create or replace function public.sair_empresa() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from membros where jogador = auth.uid();
end $$;

-- embalar na bancada de uma fábrica: dono ou funcionário dela
create or replace function public.embalar_fabrica(p_empresa bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; e empresas%rowtype; pago integer := 0;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  select * into e from empresas where id = p_empresa;
  if e.id is null or not e.fabrica or not trabalha_em(e.id) then raise exception 'voce nao trabalha em uma fabrica'; end if;
  if p.ultima_tarefa is not null and p.ultima_tarefa > now() - interval '25 seconds' then
    raise exception 'aguarde % s', ceil(extract(epoch from (p.ultima_tarefa + interval '25 seconds' - now())));
  end if;
  if e.dono <> p.id and e.pagamento > 0 then
    update empresas set caixa = caixa - pagamento where id = e.id and caixa >= pagamento;
    if not found then raise exception 'a empresa esta sem caixa para pagar'; end if;
    pago := e.pagamento;
    update perfis set moedas = moedas + pago where id = p.id;
  end if;
  update empresas set estoque = estoque + 1 where id = e.id;
  update perfis set ultima_tarefa = now() where id = p.id;
  return pago;
end $$;

-- evoluir: nível 2 custa 30.000 e nível 3 custa 60.000, do caixa da empresa
create or replace function public.evoluir_empresa(p_empresa bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; custo integer;
begin
  e := do_dono(p_empresa);
  if e.nivel >= 3 then raise exception 'nivel maximo'; end if;
  custo := limite(e.nivel, 'evoluir');
  update empresas set caixa = caixa - custo, nivel = nivel + 1 where id = e.id and caixa >= custo;
  if not found then raise exception 'caixa insuficiente'; end if;
  return e.nivel + 1;
end $$;

-- robôs: comprar (8.000) ou alugar (1.200 por 24 h), dentro do limite do nível
create or replace function public.comprar_robo(p_empresa bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype;
begin
  perform produzir_robos();
  e := do_dono(p_empresa);
  if robos_ativos(e) >= limite(e.nivel, 'robos') then raise exception 'limite de robos'; end if;
  update empresas set caixa = caixa - 8000, robos = robos + 1 where id = e.id and caixa >= 8000;
  if not found then raise exception 'caixa insuficiente'; end if;
  return e.robos + 1;
end $$;

create or replace function public.alugar_robo(p_empresa bigint) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; ate timestamptz;
begin
  perform produzir_robos();
  e := do_dono(p_empresa);
  if e.aluguel_ate is null or e.aluguel_ate <= now() then
    update empresas set robos_alugados = 0 where id = e.id;
    e.robos_alugados := 0; e.aluguel_ate := null;
  end if;
  if robos_ativos(e) >= limite(e.nivel, 'robos') then raise exception 'limite de robos'; end if;
  update empresas set caixa = caixa - 1200, robos_alugados = robos_alugados + 1, aluguel_ate = now() + interval '24 hours'
    where id = e.id and caixa >= 1200 returning aluguel_ate into ate;
  if ate is null then raise exception 'caixa insuficiente'; end if;
  return ate;
end $$;
