-- Fator RP - administrador e a prefeitura: nomear prefeito, afastar prefeito e convocar eleição extraordinária.
-- Eleição extraordinária: abre a campanha agora por 1 a 6 ciclos (32 min cada). No fim, o mais votado assume
-- até o fim do mandato atual. Sem votos, nada muda. Rode depois do 21a.

alter table public.prefeitura add column if not exists eleicao_ate timestamptz;

-- para qual mandato a campanha está aberta agora (null = fechada)
create or replace function public.mandato_em_campanha() returns integer
language sql stable security definer set search_path = public as $$
  select case when ciclo_atual() % 20 >= 16 then mandato_atual() + 1
              when (select eleicao_ate from prefeitura where id = 1) > now() then mandato_atual()
              when (select prefeito from prefeitura where id = 1) is null then mandato_atual() end;
$$;

create or replace function public.processar_prefeitura() returns void
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; m integer := mandato_atual(); vencedor uuid;
begin
  select * into pf from prefeitura where id = 1 for update;
  if pf.mandato < m then
    perform deixar_cargo(pf.prefeito);
    select jogador into vencedor from candidatos where mandato = m order by votos desc, inscrito_em limit 1;
    update prefeitura set mandato = m, prefeito = vencedor, posse = now(), salario_ciclo = -1, vaga_ciclo = ciclo_atual(), eleicao_ate = null,
      motivo = case when vencedor is null then 'sem candidatos' end where id = 1;
    if vencedor is not null then perform assumir_cargo(vencedor); end if;
  elsif pf.eleicao_ate is not null then
    if now() < pf.eleicao_ate then return; end if;            -- eleição extraordinária ainda em andamento
    select jogador into vencedor from candidatos where mandato = m and votos > 0 order by votos desc, inscrito_em limit 1;
    update prefeitura set eleicao_ate = null where id = 1;
    if vencedor is null then
      perform avisar_todos('🗳️ A eleição extraordinária terminou sem votos. A prefeitura continua como estava.');
    elsif vencedor is distinct from pf.prefeito then
      perform deixar_cargo(pf.prefeito);
      update prefeitura set prefeito = vencedor, posse = now(), salario_ciclo = -1, motivo = 'eleição extraordinária' where id = 1;
      perform assumir_cargo(vencedor);
      perform avisar_todos(format('🗳️ Eleição extraordinária: %s é o novo prefeito!', (select nome from perfis where id = vencedor)));
    else
      perform avisar_todos(format('🗳️ Eleição extraordinária: %s continua prefeito!', (select nome from perfis where id = vencedor)));
    end if;
  elsif pf.prefeito is null and ciclo_atual() > pf.vaga_ciclo and ciclo_atual() % 20 < 16 then
    select jogador into vencedor from candidatos where mandato = m and votos > 0 order by votos desc, inscrito_em limit 1;
    if vencedor is not null then
      update prefeitura set prefeito = vencedor, posse = now(), salario_ciclo = -1, motivo = null where id = 1;
      perform assumir_cargo(vencedor);
    end if;
  end if;
end $$;

create or replace function public.exige_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid() and not banido) is distinct from 'admin' then raise exception 'so o administrador'; end if;
end $$;

-- nomear: quem estiver no cargo sai; o nomeado fica até o fim do mandato (ou até uma eleição extraordinária)
create or replace function public.admin_nomear_prefeito(p_jogador uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; nome_ text;
begin
  perform exige_admin();
  perform processar_prefeitura();
  select nome into nome_ from perfis where id = p_jogador and not banido;
  if nome_ is null then raise exception 'jogador invalido'; end if;
  select * into pf from prefeitura where id = 1 for update;
  if pf.prefeito = p_jogador then raise exception 'ele ja e o prefeito'; end if;
  perform deixar_cargo(pf.prefeito);
  update prefeitura set prefeito = p_jogador, posse = now(), salario_ciclo = -1, eleicao_ate = null, motivo = 'nomeado pela administração' where id = 1;
  perform assumir_cargo(p_jogador);
  perform registrar(p_jogador, 'prefeito_nomeado');
  perform avisar_todos(format('🏛️ A administração nomeou %s como prefeito.', nome_));
end $$;

-- afastar: a prefeitura fica vaga e a campanha abre sozinha (o mais votado assume na virada do ciclo)
create or replace function public.admin_afastar_prefeito() returns void
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype;
begin
  perform exige_admin();
  select * into pf from prefeitura where id = 1 for update;
  if pf.prefeito is null then raise exception 'a prefeitura ja esta vaga'; end if;
  perform deixar_cargo(pf.prefeito);
  update prefeitura set prefeito = null, vaga_ciclo = ciclo_atual(), motivo = 'afastado pela administração' where id = 1;
  perform registrar(pf.prefeito, 'prefeito_afastado');
  perform avisar_todos('🏛️ A administração afastou o prefeito. A prefeitura está vaga e a campanha está aberta.');
end $$;

-- convocar eleição extraordinária por 1 a 6 ciclos (não pode encostar na campanha normal dos últimos 4 ciclos)
create or replace function public.admin_convocar_eleicao(p_ciclos integer) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; ate timestamptz; m integer;
begin
  perform exige_admin();
  perform processar_prefeitura();
  if p_ciclos is null or p_ciclos not between 1 and 6 then raise exception 'escolha de 1 a 6 ciclos'; end if;
  if ciclo_atual() % 20 + p_ciclos >= 16 then raise exception 'a eleicao normal ja esta perto'; end if;
  select * into pf from prefeitura where id = 1 for update;
  if pf.eleicao_ate > now() then raise exception 'ja tem eleicao em andamento'; end if;
  m := mandato_atual();
  -- com prefeito no cargo, os votos antigos deste mandato já valeram: começa do zero
  if pf.prefeito is not null then
    delete from votos where mandato = m;
    delete from candidatos where mandato = m;
  end if;
  ate := now() + make_interval(mins => p_ciclos * 32);
  update prefeitura set eleicao_ate = ate where id = 1;
  perform registrar(null, 'eleicao_convocada', jsonb_build_object('ciclos', p_ciclos));
  perform avisar_todos(format('🗳️ ELEIÇÃO EXTRAORDINÁRIA convocada! Candidate-se e vote na Prefeitura (aba Eleição) nos próximos %s min.', p_ciclos * 32));
  return ate;
end $$;

create or replace function public.admin_cancelar_eleicao() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exige_admin();
  update prefeitura set eleicao_ate = null where id = 1 and eleicao_ate > now();
  if not found then raise exception 'nao ha eleicao extraordinaria'; end if;
  perform avisar_todos('🗳️ A eleição extraordinária foi cancelada pela administração.');
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_nomear_prefeito(uuid)', 'admin_afastar_prefeito()', 'admin_convocar_eleicao(integer)', 'admin_cancelar_eleicao()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.exige_admin() from public, anon, authenticated;
end $$;
