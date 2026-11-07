-- Fator RP - empresas v2 (parte 4 de 4): fusão de empresas e permissões.

-- junta a empresa "absorvida" na "principal" (as duas do mesmo dono)
-- fábrica + transportadora vira um grupo que produz e transporta
create or replace function public.fundir_empresas(p_principal bigint, p_absorvida bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a empresas%rowtype; b empresas%rowtype; vagas integer;
begin
  perform processar_caminhoes();
  if p_principal = p_absorvida then raise exception 'escolha duas empresas diferentes'; end if;
  a := do_dono(p_principal);
  b := do_dono(p_absorvida);
  select * into a from empresas where id = a.id for update;
  select * into b from empresas where id = b.id for update;
  if a.fabrica and b.fabrica and a.produto <> b.produto then raise exception 'fabricas de produtos diferentes'; end if;
  if exists (select 1 from pedidos where (fabrica = b.id or transportadora = b.id) and status in ('aberto', 'aceito')) then
    raise exception 'termine os pedidos da empresa absorvida antes';
  end if;
  if exists (select 1 from caminhoes where empresa = b.id and status <> 'parado') then raise exception 'ha caminhoes em viagem'; end if;
  -- funcionários: passam para a principal até o limite do nível; os demais ficam livres
  vagas := limite(greatest(a.nivel, b.nivel), 'funcionarios') - (select count(*) from membros where empresa = a.id);
  delete from membros where empresa = b.id and jogador not in (
    select jogador from membros where empresa = b.id order by desde limit greatest(0, vagas));
  update membros set empresa = a.id where empresa = b.id;
  update unidades set empresa = a.id where empresa = b.id;
  update caminhoes set empresa = a.id where empresa = b.id;
  update empresas set
    caixa = a.caixa + b.caixa,
    estoque = a.estoque + b.estoque,
    nivel = greatest(a.nivel, b.nivel),
    robos = a.robos + b.robos,
    robos_alugados = case when coalesce(a.aluguel_ate, now()) > now() then a.robos_alugados else 0 end
                   + case when coalesce(b.aluguel_ate, now()) > now() then b.robos_alugados else 0 end,
    aluguel_ate = greatest(a.aluguel_ate, b.aluguel_ate),
    fabrica = a.fabrica or b.fabrica,
    transporte = a.transporte or b.transporte,
    produto = coalesce(a.produto, b.produto),
    tipo = case when (a.fabrica or b.fabrica) and (a.transporte or b.transporte) then 'grupo'
                when a.fabrica or b.fabrica then 'fabrica' else 'transportadora' end
  where id = a.id;
  update pedidos set fabrica = a.id where fabrica = b.id;
  update pedidos set transportadora = a.id where transportadora = b.id;
  delete from empresas where id = b.id;
end $$;

-- ------------------------------------------------------------ permissões
do $$
declare f text;
begin
  foreach f in array array[
    'comprar_lote(integer, text, text, text)', 'empresa_depositar(bigint, integer)', 'empresa_sacar(bigint, integer)',
    'empresa_pagamento(bigint, integer)', 'contratar(bigint, text)', 'demitir(bigint, uuid)', 'sair_empresa()',
    'embalar_fabrica(bigint)', 'evoluir_empresa(bigint)', 'comprar_robo(bigint)', 'alugar_robo(bigint)',
    'criar_pedido(bigint, bigint, integer, integer)', 'responder_pedido(bigint, boolean)', 'cancelar_pedido(bigint)',
    'retirar_caixa(bigint)', 'entregar_caixa()', 'desistir_caixa()', 'comprar_caminhao(bigint)',
    'despachar_caminhao(bigint, bigint)', 'processar_caminhoes()', 'listar_missoes()',
    'aceitar_missao(bigint, bigint, bigint, integer)', 'fundir_empresas(bigint, bigint)', 'agora()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['do_dono(bigint)', 'trabalha_em(bigint)', 'lote_base(bigint)', 'lote_fabrica(bigint)',
                           'produzir_robos()', 'avisar(uuid, text)', 'jogador_livre()', 'registrar_entrega(bigint, integer)',
                           'garantir_missoes()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
