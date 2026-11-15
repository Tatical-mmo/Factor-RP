-- 93b · Prefeitura: orçamento público, adicional de salário, doação a jogador e apreensão pela PRF (rode depois do 93a).
-- • Cada mandato com prefeito recebe o orçamento público no cofre na posse (padrão 500.000; o ADM muda no painel).
-- • O prefeito paga do cofre um adicional de 0 a 100% no salário de Polícia, BOPE, PRF, Bombeiros e Hospital.
-- • Doação do cofre a um jogador: legal para quem não é de clã; para membro de clã ou para o próprio prefeito é CRIME.
--   Tudo cai no computador da PRF (em sigilo bancário) e na redação do jornal.
-- • Na prisão do (ex-)prefeito com crime provado, a PRF apreende o dinheiro desviado e divide entre os agentes em serviço.
alter table public.config_jogo add column if not exists orcamento_mandato integer not null default 500000;
alter table public.prefeitura add column if not exists orcamento_mandato integer;
alter table public.prefeitura add column if not exists adicional jsonb not null default '{}'::jsonb;
alter table public.gastos_prefeito add column if not exists beneficiario uuid;
alter table public.gastos_prefeito add column if not exists apreendido boolean not null default false;

-- registro no diário mesmo sem prefeito no cargo (programas pagos sozinhos)
create or replace function public.registrar_mov(p_tipo text, p_desc text, p_valor integer, p_sigilo boolean, p_destino text, p_ilegal boolean, p_benef uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; novo bigint;
begin
  select * into pf from prefeitura where id = 1;
  insert into gastos_prefeito (mandato, prefeito, tipo, descricao, valor, sigiloso, destino, ilegal, beneficiario)
    values (pf.mandato, coalesce(pf.prefeito, '00000000-0000-0000-0000-000000000000'::uuid), p_tipo, p_desc, coalesce(p_valor, 0), p_sigilo, p_destino, p_ilegal, p_benef)
    returning id into novo;
  return novo;
end $$;

-- orçamento: cai no cofre uma vez por mandato, quando há prefeito no cargo (eleito, extraordinário ou nomeado)
create or replace function public.orcamento_posse() returns trigger
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  if new.prefeito is not null and coalesce(new.orcamento_mandato, -1) < new.mandato then
    v := coalesce((select orcamento_mandato from config_jogo where id = 1), 500000);
    new.cofre := new.cofre + v; new.orcamento_mandato := new.mandato;
    insert into gastos_prefeito (mandato, prefeito, tipo, descricao, valor, sigiloso, destino, ilegal)
      values (new.mandato, new.prefeito, 'orcamento', 'Orçamento público do mandato depositado no cofre', v, false, 'Cofre da prefeitura', false);
  end if;
  return new;
end $$;
drop trigger if exists orcamento_posse on public.prefeitura;
create trigger orcamento_posse before update on public.prefeitura for each row execute function public.orcamento_posse();
-- o prefeito que já está no cargo recebe o orçamento deste mandato agora
update public.prefeitura set cofre = cofre where id = 1;

create or replace function public.admin_orcamento(p_valor integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exige_admin();
  if p_valor is null or p_valor < 0 or p_valor > 100000000 then raise exception 'valor invalido'; end if;
  update config_jogo set orcamento_mandato = p_valor, atualizado = now() where id = 1;
end $$;

-- adicional de salário pago pelo cofre
create or replace function public.definir_adicional(p_carreira text, p_pct integer) returns void
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; antes integer; nome_ text;
begin
  select * into pf from prefeitura where id = 1 for update;
  if pf.prefeito is distinct from auth.uid() then raise exception 'voce nao e o prefeito'; end if;
  if p_carreira not in ('policia', 'bope', 'prf', 'bombeiro', 'medico') then raise exception 'carreira invalida'; end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then raise exception 'adicional de 0 a 100 por cento'; end if;
  antes := coalesce((pf.adicional ->> p_carreira)::integer, 0);
  if antes = p_pct then return; end if;
  update prefeitura set adicional = adicional || jsonb_build_object(p_carreira, p_pct) where id = 1;
  nome_ := case p_carreira when 'policia' then 'Polícia' when 'bope' then 'BOPE' when 'prf' then 'PRF' when 'bombeiro' then 'Bombeiros' else 'Hospital' end;
  perform registrar_mov('adicional', format('Adicional de salário · %s: %s%% → %s%% (pago pelo cofre)', nome_, antes, p_pct), 0, false, null, false);
end $$;

-- turno: igual ao de antes + o adicional da prefeitura (só se o cofre tiver dinheiro)
create or replace function public.bater_turno(p_x real, p_z real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; car text; antes jsonb; depois jsonb; m integer; pago integer; extra integer := 0; pct integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null then raise exception 'sem permissao'; end if;
  car := case when p.policial then 'policia' when p.prf then 'prf' else p.profissao end;
  if car is null then return null; end if;
  insert into carreiras (jogador, carreira) values (p.id, car) on conflict do nothing;
  select minutos into m from carreiras where jogador = p.id and carreira = car;
  antes := patente(car, m);
  if p.turno_em is not null and p.turno_em > now() - interval '55 seconds' then
    return antes || jsonb_build_object('carreira', car, 'minutos', m, 'pago', 0)
      || case when car = 'exercito' and p.cargo = 'admin' then jsonb_build_object('nome', 'General Supremo', 'proximo', null, 'falta', null) else '{}'::jsonb end;
  end if;
  if car = 'medico' and (antes ->> 'nivel')::integer >= 3 and (abs(p_x + 135) > 45 or abs(p_z - 135) > 45) then
    return antes || jsonb_build_object('carreira', car, 'minutos', m, 'pago', 0, 'fora', true);
  end if;
  update carreiras set minutos = minutos + 1 where jogador = p.id and carreira = car returning minutos into m;
  pago := round(salario_base(car) * (antes ->> 'mult')::numeric);
  pct := coalesce((select (adicional ->> case when car = 'policia' and p.bope then 'bope' else car end)::integer from prefeitura where id = 1), 0);
  if pct > 0 and car in ('policia', 'prf', 'bombeiro', 'medico') then
    extra := round(pago * pct / 100.0);
    perform set_config('fator.gasto', '1', true);
    update prefeitura set cofre = cofre - extra where id = 1 and cofre >= extra;
    if not found then extra := 0; end if;
  end if;
  update perfis set moedas = moedas + pago + extra, turno_em = now() where id = p.id;
  depois := patente(car, m);
  if car = 'exercito' and p.cargo = 'admin' then depois := depois || jsonb_build_object('nome', 'General Supremo', 'proximo', null, 'falta', null); antes := antes || jsonb_build_object('nome', 'General Supremo', 'proximo', null, 'falta', null); end if;
  return depois || jsonb_build_object('carreira', car, 'minutos', m, 'pago', pago + extra, 'adicional', extra, 'subiu', (depois ->> 'nivel') <> (antes ->> 'nivel'));
end $$;

-- doação do cofre para um jogador
create or replace function public.doar_verba(p_nome text, p_valor integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; b perfis%rowtype; cla_ text; ilegal boolean; destino text;
begin
  select * into pf from prefeitura where id = 1 for update;
  if pf.prefeito is distinct from auth.uid() then raise exception 'voce nao e o prefeito'; end if;
  if p_valor is null or p_valor < 1 or p_valor > pf.cofre then raise exception 'valor maior que o cofre'; end if;
  select * into b from perfis where lower(nome) = lower(trim(p_nome)) and not banido limit 1;
  if b.id is null then raise exception 'jogador nao encontrado'; end if;
  select c.nome into cla_ from membros_cla m join clas c on c.id = m.cla where m.jogador = b.id limit 1;
  ilegal := b.id = pf.prefeito or cla_ is not null;
  destino := format('Jogador %s%s', b.nome, case when b.id = pf.prefeito then ' (o próprio prefeito)' when cla_ is not null then format(' (membro do clã %s)', cla_) else '' end);
  perform set_config('fator.gasto', '1', true);
  update prefeitura set cofre = cofre - p_valor where id = 1;
  update perfis set moedas = moedas + p_valor where id = b.id;
  perform registrar_mov('transferencia', 'Doação do cofre a um jogador', p_valor, true, destino, ilegal, b.id);
  if b.id <> pf.prefeito then perform avisar(b.id, format('🏛️ A prefeitura te transferiu %s moedas.', p_valor)); end if;
  return jsonb_build_object('nome', b.nome, 'valor', p_valor);
end $$;

-- prisão pela PRF: na prisão do (ex-)prefeito com crime provado, o dinheiro desviado é apreendido e dividido
create or replace function public.prf_prender(p_alvo uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare ag perfis%rowtype; a perfis%rowtype; minutos integer; desviado integer; apreende integer := 0; n integer; cada integer;
begin
  select * into ag from perfis where id = auth.uid() for update;
  if not ag.prf or ag.algemado or ag.pena_seg > 0 then raise exception 'voce nao esta em servico'; end if;
  select * into a from perfis where id = p_alvo for update;
  if a.id is null or not a.eleitoral or a.crimes <= 0 then raise exception 'esse jogador nao e procurado pela PRF'; end if;
  if a.pena_seg > 0 then raise exception 'ja esta preso'; end if;
  minutos := least(1440, 7 * power(2, least(a.crimes, 9) - 1))::integer;
  update perfis set pena_seg = minutos * 60, pena_marca = now(), fianca = 2000 * a.crimes, crimes = 0, algemado = false, eleitoral = false where id = a.id;
  update perfis set moedas = moedas + 2000 where id = ag.id;
  -- apreensão: o que ele desviou (crime já provado pela quebra do sigilo e ainda não apreendido), até o que ele tem
  select coalesce(sum(g.valor), 0) into desviado from gastos_prefeito g
    where g.prefeito = a.id and g.ilegal and not g.apreendido and exists (select 1 from pedidos_sigilo s where s.gasto = g.id and s.revelado);
  if desviado > 0 then
    apreende := least(desviado, greatest(a.moedas, 0));
    update gastos_prefeito g set apreendido = true
      where g.prefeito = a.id and g.ilegal and exists (select 1 from pedidos_sigilo s where s.gasto = g.id and s.revelado);
    select count(*) into n from perfis where prf and not banido and pena_seg <= 0;
    if apreende > 0 and n > 0 then
      cada := apreende / n; apreende := cada * n;
      update perfis set moedas = moedas - apreende where id = a.id;
      update perfis set moedas = moedas + cada where prf and not banido and pena_seg <= 0;
      perform registrar_mov('apreensao', format('PRF apreendeu %s de %s e dividiu entre %s agentes', apreende, a.nome, n), apreende, false, format('%s agentes da PRF (%s cada)', n, cada), false);
      perform avisar(id, format('🛡️ Apreensão da PRF: %s moedas desviadas por %s, %s para cada agente em serviço.', apreende, a.nome, cada)) from perfis where prf and not banido and pena_seg <= 0;
    end if;
  end if;
  perform avisar(a.id, format('Você foi preso pela PRF (%s) por crime eleitoral. Pena: %s min.%s', ag.nome, minutos,
    case when apreende > 0 then format(' A PRF apreendeu %s moedas desviadas.', apreende) else '' end));
  return minutos;
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_orcamento(integer)', 'definir_adicional(text, integer)', 'doar_verba(text, integer)', 'prf_prender(uuid)', 'bater_turno(real, real)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.registrar_mov(text, text, integer, boolean, text, boolean, uuid) from public, anon, authenticated;
  revoke all on function public.orcamento_posse() from public, anon, authenticated;
end $$;
