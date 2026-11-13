-- 74c · Correções da auditoria.
-- 1) registrar() (log do painel) podia ser chamada por qualquer jogador: agora só por dentro do banco.
--    Reforço: dar_item, avisar, devolver veículo e outras funções internas ficam fechadas de vez.
-- 2) 17 funções do jogo ainda aceitavam chamada de quem não fez login (anon): agora só jogadores logados.
-- 3) Venda da carga de rações: o servidor confere se deu tempo de levar o caminhão do lugar do sequestro até o
--    comprador (no máximo 30 m/s). Quem "teleporta" leva falta e a venda é recusada.

revoke all on function public.registrar(uuid, text, jsonb) from public, anon, authenticated;

-- funções internas (dar itens, avisar, devolver veículo…) nunca devem ser chamadas de fora: reforço do bloqueio
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any (array['dar_item', 'avisar', 'avisar_todos', 'veiculo_na_garagem',
              'registrar_entrega', 'produzir_robos', 'deixar_cargo', 'registrar_falta']) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.f);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any (array['admin_clima_agora', 'admin_clima_auto', 'algemar', 'assalto_navio_atual',
              'cla_assalto_arrombar', 'cla_assalto_entregar', 'cla_assalto_iniciar', 'cla_autorizar_cofre', 'cla_cofre', 'cla_cofre_retirar',
              'cla_cofre_sacar', 'cla_guardar', 'comprar_alicate', 'cortar_algemas', 'prefeito_seguranca', 'soltar_algemas', 'tarifa_onibus']) loop
    execute format('revoke all on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;

alter table public.jujuba_viagens add column if not exists seq_em timestamptz;
alter table public.jujuba_viagens add column if not exists seq_x real;
alter table public.jujuba_viagens add column if not exists seq_z real;

create or replace function public.sequestrar_jujubas(p_viagem bigint, p_x real, p_z real, p_ang real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v jujuba_viagens%rowtype; v_cla bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial or p.prf or p.profissao in ('exercito', 'bombeiro') then raise exception 'policial nao sequestra'; end if;
  select cla into v_cla from membros_cla where jogador = p.id;
  if v_cla is null then raise exception 'so membros de cla'; end if;
  if p.sequestrou_em is not null and p.sequestrou_em > now() - interval '60 seconds' then raise exception 'aguarde para sequestrar'; end if;
  select * into v from jujuba_viagens where id = p_viagem for update;
  if v.id is null or v.status <> 'em_rota' then raise exception 'esse veiculo nao esta em entrega'; end if;
  update jujuba_viagens set status = 'sequestrada', motorista = p.id, cla = v_cla, x = p_x, z = p_z, ang = p_ang, largado = false, ativo_em = now(),
    seq_em = now(), seq_x = p_x, seq_z = p_z where id = v.id;
  update jujuba_pedidos set status = 'aberto' where id = v.pedido;
  update perfis set crimes = crimes + 1, sequestrou_em = now() where id = p.id;
  return v.qtd;
end $$;

create or replace function public.vender_jujubas(p_viagem bigint, p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v jujuba_viagens%rowtype; valor integer; dist real;
begin
  p := jogador_livre();
  select * into v from jujuba_viagens where id = p_viagem for update;
  if v.id is null or v.status <> 'sequestrada' or v.motorista is distinct from p.id then raise exception 'voce nao esta nesse veiculo'; end if;
  if abs(p_x - 64) > 30 or abs(p_z + 972) > 30 then raise exception 'longe do comprador'; end if;
  dist := sqrt(power(coalesce(v.seq_x, 64) - 64, 2) + power(coalesce(v.seq_z, -972) + 972, 2));
  if v.seq_em is not null and extract(epoch from now() - v.seq_em) < dist / 30 then
    perform registrar_falta(p.id, 'carga de rações teletransportada', jsonb_build_object('viagem', v.id, 'metros', round(dist), 'segundos', round(extract(epoch from now() - v.seq_em))), 2);
    return 0;   -- sem erro: a falta fica registrada
  end if;
  valor := v.qtd * 9;
  update jujuba_viagens set status = 'vendida' where id = v.id;
  update jujuba_mercado set estoque = estoque + v.qtd where id = 1;
  update perfis set moedas = moedas + valor where id = p.id;
  return valor;
end $$;

do $$
declare f text;
begin
  foreach f in array array['sequestrar_jujubas(bigint, real, real, real)', 'vender_jujubas(bigint, real, real)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
