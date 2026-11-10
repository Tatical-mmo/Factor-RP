-- Fator RP - tabela de salários que o administrador vê e muda no painel.
-- Carreiras: valor base por minuto em serviço (multiplicado pela patente). Polícia: o valor é o mesmo que o
-- prefeito define (salário da polícia ÷ 3 por minuto). Prefeito: por ciclo jogado. Moderadores: por dia, cada um.
-- Rode depois do 34c.

create table if not exists public.salarios (
  chave  text primary key,
  rotulo text not null,
  valor  integer not null check (valor >= 0),
  ordem  integer not null default 0
);
insert into public.salarios (chave, rotulo, valor, ordem) values
  ('prf', 'PRF (por minuto)', 40, 2), ('medico', 'Hospital (por minuto)', 30, 3), ('bombeiro', 'Bombeiros (por minuto)', 30, 4),
  ('jornalista', 'Jornal (por minuto)', 24, 5), ('exercito', 'Exército (por minuto)', 35, 6), ('prefeito', 'Prefeito (por ciclo de 32 min)', 9500, 7)
on conflict (chave) do nothing;
do $$
begin
  alter table public.salarios enable row level security;
  drop policy if exists "leitura publica" on public.salarios;
  create policy "leitura publica" on public.salarios for select using (true);
  revoke all on public.salarios from anon, authenticated;
  grant select on public.salarios to anon, authenticated;
end $$;

create or replace function public.salario_base(p_carreira text) returns numeric
language sql stable security definer set search_path = public as $$
  select case when p_carreira = 'policia' then coalesce((select salario_policia from prefeitura where id = 1), 100) / 3.0
    else coalesce((select valor from salarios where chave = p_carreira), 0) end;
$$;

create or replace function public.salario_prefeito() returns integer
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; v integer := coalesce((select valor from salarios where chave = 'prefeito'), 9500);
begin
  perform processar_prefeitura();
  select * into pf from prefeitura where id = 1 for update;
  if pf.prefeito is distinct from auth.uid() or pf.salario_ciclo >= ciclo_atual() then return 0; end if;
  update prefeitura set salario_ciclo = ciclo_atual() where id = 1;
  update perfis set moedas = moedas + v where id = auth.uid();
  return v;
end $$;

-- tudo de uma vez para a tela do painel
create or replace function public.admin_salarios() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  return jsonb_build_object(
    'policia', (select salario_policia from prefeitura where id = 1),
    'tabela', (select coalesce(jsonb_agg(jsonb_build_object('chave', chave, 'rotulo', rotulo, 'valor', valor) order by ordem), '[]'::jsonb) from salarios),
    'moderadores', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'salario', salario) order by nome), '[]'::jsonb) from perfis where cargo = 'moderador'));
end $$;

create or replace function public.admin_definir_salario(p_chave text, p_valor integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if p_valor is null or p_valor < 0 or p_valor > 1000000 then raise exception 'valor invalido'; end if;
  if p_chave = 'policia' then
    update prefeitura set salario_policia = greatest(50, least(250, p_valor)) where id = 1;
  else
    update salarios set valor = p_valor where chave = p_chave;
    if not found then raise exception 'salario invalido'; end if;
  end if;
  perform registrar(null, 'salario', jsonb_build_object('chave', p_chave, 'valor', p_valor));
end $$;

create or replace function public.admin_salario_moderador(p_alvo uuid, p_valor integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if p_valor is null or p_valor < 0 or p_valor > 1000000 then raise exception 'valor invalido'; end if;
  update perfis set salario = p_valor where id = p_alvo and cargo = 'moderador';
  if not found then raise exception 'ele nao e moderador'; end if;
  perform registrar(p_alvo, 'salario', jsonb_build_object('valor', p_valor));
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_salarios()', 'admin_definir_salario(text, integer)', 'admin_salario_moderador(uuid, integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
