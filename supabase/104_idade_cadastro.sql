-- 104: data de nascimento pedida a todos (na primeira entrada) e jogo ajustado à idade.
--   Menor de 16: o modo protegido já começa LIGADO, sem PIN (chat de texto e voz desligados).
--   Para liberar, um responsável confirma no ☰ Modo protegido (fica registrado quando).
--   O resto continua igual ao 103 (PIN dos pais, 5 erros = 15 min, só a equipe corrige a data).
-- Rode depois do 103.

alter table public.dados_privados add column if not exists liberado_responsavel_em timestamptz;

create or replace function public.meus_dados_privados() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d dados_privados;
begin
  if auth.uid() is null then raise exception 'sem login'; end if;
  select * into d from dados_privados where id = auth.uid();
  return jsonb_build_object('idade', case when d.nascimento is null then null else extract(year from age(current_date, d.nascimento))::int end,
    'protegido', coalesce(d.protegido, false), 'tem_pin', d.pin is not null);
end $$;

create or replace function public.definir_nascimento(p_data date) returns int
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); idade int;
begin
  if eu is null then raise exception 'sem login'; end if;
  if p_data is null or p_data < date '1900-01-01' or p_data > current_date - interval '3 years' then raise exception 'data de nascimento invalida'; end if;
  if exists (select 1 from dados_privados where id = eu and nascimento is not null) then
    if (select nascimento from dados_privados where id = eu) <> p_data then raise exception 'data de nascimento ja informada'; end if;
    return extract(year from age(current_date, p_data))::int;
  end if;
  idade := extract(year from age(current_date, p_data))::int;
  insert into dados_privados (id, nascimento, protegido) values (eu, p_data, idade < 16)
    on conflict (id) do update set nascimento = excluded.nascimento, protegido = dados_privados.protegido or excluded.protegido;
  return idade;
end $$;

-- menor de 16 com a proteção automática (sem PIN): o responsável libera chat e voz
create or replace function public.liberar_protecao_responsavel() returns void
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid();
begin
  if eu is null then raise exception 'sem login'; end if;
  update dados_privados set protegido = false, liberado_responsavel_em = now() where id = eu and protegido and pin is null;
  if not found then raise exception 'use o pin para desligar'; end if;
end $$;

revoke all on function public.liberar_protecao_responsavel() from public, anon;
grant execute on function public.liberar_protecao_responsavel() to authenticated;
notify pgrst, 'reload schema';
