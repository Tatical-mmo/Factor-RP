-- Fator RP - General Supremo promove militares e o administrador reseta o mapa (menu secreto do painel).
-- Promover: o administrador escolhe a patente de quem já está no Exército (as horas de carreira vão para o mínimo daquela patente).
-- Resetar: apaga o que os jogadores construíram, por partes. As contas continuam; a equipe mantém o cargo.
-- Rode depois do 34d.

-- militares (para a tela do General Supremo)
create or replace function public.membros_exercito() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'jogador', p.nome, 'minutos', coalesce(c.minutos, 0),
      'patente', patente('exercito', coalesce(c.minutos, 0)) ->> 'nome', 'nivel', (patente('exercito', coalesce(c.minutos, 0)) ->> 'nivel')::integer)
      order by coalesce(c.minutos, 0) desc)
    from perfis p left join carreiras c on c.jogador = p.id and c.carreira = 'exercito'
    where p.profissao = 'exercito' and p.cargo <> 'admin'), '[]'::jsonb);
end $$;

create or replace function public.admin_promover_exercito(p_jogador uuid, p_nivel integer) returns text
language plpgsql security definer set search_path = public as $$
declare alvo perfis%rowtype; cargo_ record;
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  select * into alvo from perfis where id = p_jogador;
  if alvo.id is null or alvo.profissao is distinct from 'exercito' then raise exception 'ele nao esta no exercito'; end if;
  select * into cargo_ from cargos_carreira('exercito') where nivel = p_nivel;
  if cargo_.nome is null then raise exception 'patente invalida'; end if;
  insert into carreiras (jogador, carreira, minutos) values (p_jogador, 'exercito', cargo_.minimo)
    on conflict (jogador, carreira) do update set minutos = excluded.minutos;
  insert into comandos (alvo, autor, tipo, dados) values (p_jogador, auth.uid(), 'aviso',
    jsonb_build_object('texto', format('🎖️ O General Supremo te nomeou %s do Exército!', cargo_.nome)));
  perform registrar(p_jogador, 'patente', jsonb_build_object('patente', cargo_.nome));
  return cargo_.nome;
end $$;

-- reset do mapa: p_partes = moradia, empresas, clas, jogadores, prefeitura (qualquer combinação); p_confirma = 'RESETAR'
create or replace function public.admin_resetar_mundo(p_partes text[], p_confirma text) returns text
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype;
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if p_confirma is distinct from 'RESETAR' then raise exception 'digite RESETAR para confirmar'; end if;
  if p_partes is null or cardinality(p_partes) = 0 then raise exception 'escolha o que resetar'; end if;
  if 'moradia' = any(p_partes) then
    delete from bau;
    delete from casas where tipo = 'unidade';
    update casas set dono = null, inquilino = null, pago_ate = null, aluguel = null, a_venda = false, modelo = null, nivel = 1 where tipo <> 'oficial';
  end if;
  if 'empresas' = any(p_partes) then
    delete from empresas;                                   -- leva junto membros, pedidos, caminhões e unidades
    delete from missoes; delete from ofertas; delete from negocios; delete from lojas_assaltadas;
    delete from carros where modelo <> 'presidencial';
  end if;
  if 'clas' = any(p_partes) then
    delete from favores;
    delete from clas;                                       -- leva junto membros e guerras
    update territorios set dono_cla = null, captura_cla = null, captura_inicio = null, capturado_em = null;
  end if;
  if 'jogadores' = any(p_partes) then
    update perfis set moedas = 500, crimes = 0, pena_seg = 0, pena_marca = null, algemado = false, fianca = 0, fome = 100,
      policial = false, prf = false, eleitoral = false, profissao = null, profissao_desde = null, matancas = 0, recompensa = 0,
      cerco_ate = null, pos_x = 0, pos_z = 27, turno_em = null, pd_morte = null, pd_por = null;
    delete from inventario; delete from carreiras; delete from contas_banco; delete from metas; delete from encomendas;
    delete from personagens_comprados; delete from agressoes; delete from cacadas;
  end if;
  if 'prefeitura' = any(p_partes) then
    select * into pf from prefeitura where id = 1;
    perform deixar_cargo(pf.prefeito);
    update prefeitura set prefeito = null, posse = null, vaga_ciclo = ciclo_atual(), salario_ciclo = -1, cofre = 0, motivo = 'mapa resetado', eleicao_ate = null where id = 1;
    delete from votos; delete from candidatos; delete from noticias; delete from ocorrencias; delete from assaltos; delete from incendios;
    update outdoors set anunciante = null, titulo = null, texto = null, tipo = null, ate = null;
  end if;
  perform registrar(null, 'reset_mapa', jsonb_build_object('partes', p_partes));
  perform avisar_todos('🧹 O mapa foi resetado pela administração. Bom começo a todos!');
  return array_to_string(p_partes, ', ');
end $$;

do $$
declare f text;
begin
  foreach f in array array['membros_exercito()', 'admin_promover_exercito(uuid, integer)', 'admin_resetar_mundo(text[], text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
