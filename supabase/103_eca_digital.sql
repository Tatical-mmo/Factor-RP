-- 103: proteções do ECA Digital (Lei 15.211/2025) e LGPD.
-- Dados privados de cada jogador numa tabela SEPARADA (a tabela perfis é lida por todos):
--   nascimento: pedido só quando o jogador abre "💖 Apoie o jogo" (a doação é só para maiores de 18). Gravado uma vez;
--               depois só a equipe muda (se a pessoa errou, pede pelo suporte).
--   modo protegido: os pais ligam com um PIN (4 a 8 números) e o chat de texto, a voz e as mensagens privadas somem.
--               Para desligar precisa do mesmo PIN; 5 erros seguidos travam por 15 minutos.
-- Rode depois do 102.

create table if not exists public.dados_privados (
  id            uuid primary key references public.perfis (id) on delete cascade,
  nascimento    date,
  protegido     boolean not null default false,
  pin           text,
  erros_pin     int not null default 0,
  travado_ate   timestamptz
);
alter table public.dados_privados enable row level security;
revoke all on public.dados_privados from anon, authenticated;

-- os meus dados (só a idade e se o modo protegido está ligado: o PIN nunca sai do banco)
create or replace function public.meus_dados_privados() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d dados_privados;
begin
  if auth.uid() is null then raise exception 'sem login'; end if;
  select * into d from dados_privados where id = auth.uid();
  return jsonb_build_object('idade', case when d.nascimento is null then null else extract(year from age(current_date, d.nascimento))::int end,
    'protegido', coalesce(d.protegido, false));
end $$;

create or replace function public.definir_nascimento(p_data date) returns int
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid();
begin
  if eu is null then raise exception 'sem login'; end if;
  if p_data is null or p_data < date '1900-01-01' or p_data > current_date - interval '3 years' then raise exception 'data de nascimento invalida'; end if;
  insert into dados_privados (id, nascimento) values (eu, p_data)
    on conflict (id) do update set nascimento = coalesce(dados_privados.nascimento, excluded.nascimento);
  if (select nascimento from dados_privados where id = eu) <> p_data then raise exception 'data de nascimento ja informada'; end if;
  return extract(year from age(current_date, p_data))::int;
end $$;

drop function if exists public.modo_protegido(boolean, text);
-- devolve 'ligado', 'desligado', 'pin_errado' ou 'travado' (sem erro no PIN errado: senão a contagem de erros desfaria junto)
create or replace function public.modo_protegido(p_ligar boolean, p_pin text) returns text
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); d dados_privados; h text;
begin
  if eu is null then raise exception 'sem login'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then raise exception 'o pin deve ter de 4 a 8 numeros'; end if;
  h := encode(sha256(convert_to(eu::text || ':' || p_pin, 'UTF8')), 'hex');
  insert into dados_privados (id) values (eu) on conflict (id) do nothing;
  select * into d from dados_privados where id = eu for update;
  if p_ligar then
    if d.protegido then return 'ligado'; end if;
    update dados_privados set protegido = true, pin = h, erros_pin = 0, travado_ate = null where id = eu;
    return 'ligado';
  end if;
  if not d.protegido then return 'desligado'; end if;
  if d.travado_ate is not null and d.travado_ate > now() then return 'travado'; end if;
  if d.pin is distinct from h then
    update dados_privados set erros_pin = erros_pin + 1, travado_ate = case when erros_pin + 1 >= 5 then now() + interval '15 minutes' else null end where id = eu;
    return case when d.erros_pin + 1 >= 5 then 'travado' else 'pin_errado' end;
  end if;
  update dados_privados set protegido = false, pin = null, erros_pin = 0, travado_ate = null where id = eu;
  return 'desligado';
end $$;

-- equipe: corrige a data de nascimento (pedido pelo suporte) ou desliga o modo protegido (pais que esqueceram o PIN)
create or replace function public.admin_dados_privados(p_alvo uuid, p_nascimento date, p_desligar_protegido boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) <> 'admin' then raise exception 'sem permissao'; end if;
  insert into dados_privados (id) values (p_alvo) on conflict (id) do nothing;
  update dados_privados set nascimento = coalesce(p_nascimento, nascimento),
    protegido = case when p_desligar_protegido then false else protegido end,
    pin = case when p_desligar_protegido then null else pin end where id = p_alvo;
end $$;

revoke all on function public.meus_dados_privados(), public.definir_nascimento(date), public.modo_protegido(boolean, text),
  public.admin_dados_privados(uuid, date, boolean) from public, anon;
grant execute on function public.meus_dados_privados(), public.definir_nascimento(date), public.modo_protegido(boolean, text),
  public.admin_dados_privados(uuid, date, boolean) to authenticated;

-- denúncia de mensagem do chat: o texto vai junto como prova (até 400 letras, como antes)
notify pgrst, 'reload schema';
