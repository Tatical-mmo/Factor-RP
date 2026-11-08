-- Fator RP - imóveis que evoluem (parte 2 de 2): aluguel, venda de unidades e cobrança automática.
-- O aluguel é cobrado por dia (24 h). Se o inquilino não tiver moedas na renovação, ele sai
-- e o que estava no baú volta para a mochila dele.

create or replace function public.devolver_bau(p_casa integer, p_jogador uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  for b in select item, qtd from bau where casa = p_casa and qtd > 0 loop perform dar_item(p_jogador, b.item, b.qtd); end loop;
  delete from bau where casa = p_casa;
end $$;

create or replace function public.vender_casa(p_casa integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c casas%rowtype; valor integer; k integer;
begin
  select * into c from casas where id = p_casa and dono = auth.uid() for update;
  if c.id is null then raise exception 'essa moradia nao e sua'; end if;
  if c.tipo = 'terreno' and exists (select 1 from casas where pai = c.id and (dono is not null or (inquilino is not null and pago_ate > now()))) then
    raise exception 'ha apartamentos vendidos ou alugados neste predio';
  end if;
  perform devolver_bau(c.id, auth.uid());
  if c.tipo = 'unidade' then
    valor := c.preco / 2;                                        -- unidade comprada volta para o prédio
    update casas set dono = null, a_venda = false, preco = 0 where id = c.id;
  else
    valor := case c.tipo when 'apto' then 8000 when 'terreno' then 6000 + coalesce(preco_modelo(c.modelo), 0) / 2 else 20000 end;
    if c.tipo = 'terreno' then for k in 1..c.nivel - 1 loop valor := valor + imovel(k, 'evoluir') / 2; end loop; end if;
    delete from casas where pai = c.id;
    update casas set dono = null, modelo = null, nivel = 1 where id = c.id;
  end if;
  update perfis set moedas = moedas + valor where id = auth.uid();
  return valor;
end $$;

-- dono do prédio: aluguel por dia (null = não aluga) e preço de venda (null = não vende)
create or replace function public.definir_unidade(p_unidade integer, p_aluguel integer, p_preco integer) returns void
language plpgsql security definer set search_path = public as $$
declare u casas%rowtype;
begin
  select * into u from casas where id = p_unidade and tipo = 'unidade' for update;
  if u.id is null or not exists (select 1 from casas where id = u.pai and dono = auth.uid()) then raise exception 'essa unidade nao e sua'; end if;
  if u.dono is not null then raise exception 'unidade ja vendida'; end if;
  if p_aluguel is not null and (p_aluguel < 50 or p_aluguel > 50000) then raise exception 'aluguel entre 50 e 50000'; end if;
  if coalesce(p_preco, 0) > 0 and (p_preco < 1000 or p_preco > 2000000) then raise exception 'preco entre 1000 e 2000000'; end if;
  update casas set aluguel = p_aluguel, preco = coalesce(nullif(p_preco, 0), 0), a_venda = coalesce(p_preco, 0) > 0 where id = u.id;
end $$;

create or replace function public.alugar_unidade(p_unidade integer) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; u casas%rowtype; dono_predio uuid; ate timestamptz;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  select * into u from casas where id = p_unidade and tipo = 'unidade' for update;
  if u.id is null or u.dono is not null or u.aluguel is null then raise exception 'unidade nao esta para alugar'; end if;
  if u.inquilino is not null and u.pago_ate > now() then raise exception 'unidade ja alugada'; end if;
  select dono into dono_predio from casas where id = u.pai;
  if dono_predio is null then raise exception 'predio sem dono'; end if;
  if dono_predio = p.id then raise exception 'o predio e seu'; end if;
  if total_moradias(p.id) >= 3 then raise exception 'limite de 3 moradias'; end if;
  if p.moedas < u.aluguel then raise exception 'moedas insuficientes'; end if;
  if u.inquilino is not null then perform devolver_bau(u.id, u.inquilino); end if;
  update perfis set moedas = moedas - u.aluguel where id = p.id;
  update perfis set moedas = moedas + u.aluguel where id = dono_predio;
  update casas set inquilino = p.id, pago_ate = now() + interval '1 day' where id = u.id returning pago_ate into ate;
  perform avisar(dono_predio, format('%s alugou %s por %s/dia.', p.nome, u.rotulo, u.aluguel));
  return ate;
end $$;

create or replace function public.comprar_unidade(p_unidade integer) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; u casas%rowtype; dono_predio uuid;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  select * into u from casas where id = p_unidade and tipo = 'unidade' for update;
  if u.id is null or u.dono is not null or not u.a_venda then raise exception 'unidade nao esta a venda'; end if;
  if u.inquilino is not null and u.pago_ate > now() then raise exception 'unidade alugada'; end if;
  select dono into dono_predio from casas where id = u.pai;
  if dono_predio is null or dono_predio = p.id then raise exception 'unidade invalida'; end if;
  if total_moradias(p.id) >= 3 then raise exception 'limite de 3 moradias'; end if;
  if p.moedas < u.preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - u.preco where id = p.id;
  update perfis set moedas = moedas + u.preco where id = dono_predio;
  update casas set dono = p.id, a_venda = false, inquilino = null, pago_ate = null where id = u.id;
  perform avisar(dono_predio, format('%s comprou %s por %s.', p.nome, u.rotulo, u.preco));
end $$;

create or replace function public.sair_aluguel(p_unidade integer) returns void
language plpgsql security definer set search_path = public as $$
declare u casas%rowtype;
begin
  select * into u from casas where id = p_unidade and inquilino = auth.uid() for update;
  if u.id is null then raise exception 'voce nao aluga essa unidade'; end if;
  perform devolver_bau(u.id, auth.uid());
  update casas set inquilino = null, pago_ate = null where id = u.id;
end $$;

-- renova os aluguéis vencidos (qualquer jogador pode chamar; o banco decide)
create or replace function public.processar_alugueis() returns integer
language plpgsql security definer set search_path = public as $$
declare u casas%rowtype; dono_predio uuid; n integer := 0; pago integer;
begin
  for u in select * from casas where tipo = 'unidade' and inquilino is not null and pago_ate <= now() for update skip locked loop
    select dono into dono_predio from casas where id = u.pai;
    pago := 0;
    if u.aluguel is not null and dono_predio is not null and u.dono is null then
      update perfis set moedas = moedas - u.aluguel where id = u.inquilino and moedas >= u.aluguel;
      get diagnostics pago = row_count;
    end if;
    if pago > 0 then
      update perfis set moedas = moedas + u.aluguel where id = dono_predio;
      update casas set pago_ate = greatest(pago_ate, now()) + interval '1 day' where id = u.id;
    else
      perform devolver_bau(u.id, u.inquilino);
      perform avisar(u.inquilino, format('Seu aluguel em %s venceu e você saiu do apartamento.', u.rotulo));
      update casas set inquilino = null, pago_ate = null where id = u.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['vender_casa(integer)', 'definir_unidade(integer, integer, integer)', 'alugar_unidade(integer)',
                           'comprar_unidade(integer)', 'sair_aluguel(integer)', 'processar_alugueis()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.devolver_bau(integer, uuid) from public, anon, authenticated';
end $$;
