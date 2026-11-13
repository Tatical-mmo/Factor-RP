-- 66a · PRF: diário de gastos do prefeito (computador da PRF) e gastos legais do cofre.
-- Tudo o que o prefeito faz com o dinheiro e com o governo fica registrado. Transferências do cofre e atos sobre
-- territórios aparecem com o destino em SIGILO BANCÁRIO: só a quebra do sigilo (66b) revela para quem foi.
-- Gastos legais: obra pública, evento na praça e bônus para os servidores em serviço.
create table if not exists public.gastos_prefeito (
  id        bigint generated always as identity primary key,
  mandato   integer not null,
  prefeito  uuid not null,
  tipo      text not null,
  descricao text not null,
  valor     integer not null default 0,
  sigiloso  boolean not null default false,
  destino   text,
  ilegal    boolean not null default false,
  criado    timestamptz not null default now()
);
create index if not exists gastos_prefeito_mandato on public.gastos_prefeito (mandato, id);
do $$ begin
  alter table public.gastos_prefeito enable row level security;
  revoke all on public.gastos_prefeito from anon, authenticated;
end $$;

create or replace function public.registrar_gasto(p_tipo text, p_desc text, p_valor integer, p_sigilo boolean, p_destino text, p_ilegal boolean)
returns void language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype;
begin
  select * into pf from prefeitura where id = 1;
  if pf.prefeito is null then return; end if;
  insert into gastos_prefeito (mandato, prefeito, tipo, descricao, valor, sigiloso, destino, ilegal)
    values (pf.mandato, pf.prefeito, p_tipo, p_desc, coalesce(p_valor, 0), p_sigilo, p_destino, p_ilegal);
end $$;

-- o que muda na prefeitura pelas mãos do prefeito entra no diário sozinho
create or replace function public.diario_prefeitura() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.prefeito is null or auth.uid() is distinct from new.prefeito then return new; end if;
  if new.salario_ciclo is distinct from old.salario_ciclo and new.salario_ciclo >= 0 then
    perform registrar_gasto('salario', 'Salário do prefeito', coalesce((select valor from salarios where chave = 'prefeito'), 9500), false, null, false);
  end if;
  if new.salario_policia is distinct from old.salario_policia then
    perform registrar_gasto('policia', format('Salário da polícia: %s → %s a cada 3 min', old.salario_policia, new.salario_policia), 0, false, null, false);
  end if;
  if new.seguranca1 is distinct from old.seguranca1 or new.seguranca2 is distinct from old.seguranca2 then
    perform registrar_gasto('seguranca', format('Seguranças: %s',
      coalesce(nullif(concat_ws(', ', (select nome from perfis where id = new.seguranca1), (select nome from perfis where id = new.seguranca2)), ''), 'nenhum')), 0, false, null, false);
  end if;
  if new.cofre < old.cofre and coalesce(current_setting('fator.gasto', true), '') = '' then
    perform registrar_gasto('cofre', 'Saída do cofre', old.cofre - new.cofre, false, null, false);
  end if;
  return new;
end $$;
drop trigger if exists diario_prefeitura on public.prefeitura;
create trigger diario_prefeitura after update on public.prefeitura for each row execute function public.diario_prefeitura();

-- favores ilegais (como antes), agora com o registro sigiloso
create or replace function public.favor_verba(p_cla bigint, p_valor integer) returns void
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype;
begin
  select * into pf from prefeitura where id = 1 for update;
  if pf.prefeito is distinct from auth.uid() then raise exception 'voce nao e o prefeito'; end if;
  if p_valor < 1 or p_valor > pf.cofre then raise exception 'valor maior que o cofre'; end if;
  if not exists (select 1 from clas where id = p_cla) then raise exception 'cla invalido'; end if;
  perform set_config('fator.gasto', '1', true);
  update prefeitura set cofre = cofre - p_valor where id = 1;
  update clas set caixa = caixa + p_valor where id = p_cla;
  insert into favores (mandato, prefeito, cla, tipo, valor) values (pf.mandato, pf.prefeito, p_cla, 'verba', p_valor);
  perform registrar_gasto('transferencia', 'Transferência do cofre', p_valor, true, format('Clã %s (caixa do clã)', (select nome from clas where id = p_cla)), true);
end $$;
create or replace function public.favor_territorio(p_territorio text, p_cla bigint) returns void
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; nome_t text;
begin
  select * into pf from prefeitura where id = 1;
  if pf.prefeito is distinct from auth.uid() then raise exception 'voce nao e o prefeito'; end if;
  if not exists (select 1 from clas where id = p_cla) then raise exception 'cla invalido'; end if;
  update territorios set dono_cla = p_cla, defesa = 0, renda_marca = now(), capturado_em = now(), captura_cla = null, captura_inicio = null where id = p_territorio
    returning nome into nome_t;
  if not found then raise exception 'territorio invalido'; end if;
  insert into favores (mandato, prefeito, cla, tipo) values (pf.mandato, pf.prefeito, p_cla, 'territorio');
  perform registrar_gasto('territorio', format('Ato administrativo: %s', coalesce(nome_t, p_territorio)), 0, true, format('Clã %s', (select nome from clas where id = p_cla)), true);
end $$;

-- gastos legais do cofre: obra, evento ou bônus aos servidores em serviço (polícia, PRF, médicos e bombeiros)
create or replace function public.prefeito_gasto(p_tipo text, p_valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; n integer; cada integer; destino text;
begin
  select * into pf from prefeitura where id = 1 for update;
  if pf.prefeito is distinct from auth.uid() then raise exception 'voce nao e o prefeito'; end if;
  if p_valor is null or p_valor < 100 or p_valor > pf.cofre then raise exception 'valor de 100 ate o que tem no cofre'; end if;
  perform set_config('fator.gasto', '1', true);
  if p_tipo = 'bonus' then
    select count(*) into n from perfis where policial or prf or profissao in ('medico', 'bombeiro');
    if n = 0 then raise exception 'nenhum servidor em servico agora'; end if;
    cada := p_valor / n;
    update perfis set moedas = moedas + cada where policial or prf or profissao in ('medico', 'bombeiro');
    update prefeitura set cofre = cofre - cada * n where id = 1;
    destino := format('Bônus para %s servidores em serviço (%s cada)', n, cada);
    perform registrar_gasto('transferencia', 'Transferência do cofre', cada * n, true, destino, false);
    return cada;
  elsif p_tipo in ('obra', 'evento') then
    update prefeitura set cofre = cofre - p_valor where id = 1;
    destino := case p_tipo when 'obra' then 'Construtora da cidade (obra pública)' else 'Produtora de eventos (evento na praça)' end;
    perform registrar_gasto('transferencia', 'Transferência do cofre', p_valor, true, destino, false);
    return p_valor;
  end if;
  raise exception 'tipo invalido';
end $$;

do $$
declare f text;
begin
  foreach f in array array['favor_verba(bigint, integer)', 'favor_territorio(text, bigint)', 'prefeito_gasto(text, integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.registrar_gasto(text, text, integer, boolean, text, boolean) from public, anon, authenticated;
  revoke all on function public.diario_prefeitura() from public, anon, authenticated;
end $$;
