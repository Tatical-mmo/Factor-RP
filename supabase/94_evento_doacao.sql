-- 94 · Evento de doação do administrador: o mesmo valor para vários jogadores de uma vez.
-- Quem recebe: 'online' (jogando nos últimos 5 minutos), 'todos' (todas as contas não banidas) ou 'lista' (nomes separados por vírgula).
-- Cada um recebe um aviso; o evento fica no registro do painel.
create or replace function public.admin_evento_doacao(p_quem text, p_valor integer, p_nomes text default null, p_titulo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n integer := 0; faltou text[] := '{}'; nm text; tit text := coalesce(nullif(trim(p_titulo), ''), 'Evento do ADM'); ids uuid[];
begin
  if cargo_de(auth.uid()) is distinct from 'admin' then raise exception 'sem permissao'; end if;
  if p_valor is null or p_valor < 1 or p_valor > 10000000 then raise exception 'valor de 1 a 10.000.000 por jogador'; end if;
  if p_quem = 'online' then
    select array_agg(id) into ids from perfis where not banido and visto_em > now() - interval '5 minutes';
  elsif p_quem = 'todos' then
    select array_agg(id) into ids from perfis where not banido;
  elsif p_quem = 'lista' then
    foreach nm in array string_to_array(coalesce(p_nomes, ''), ',') loop
      nm := trim(nm); if nm = '' then continue; end if;
      if exists (select 1 from perfis where lower(nome) = lower(nm) and not banido) then
        ids := ids || (select id from perfis where lower(nome) = lower(nm) and not banido limit 1);
      else faltou := faltou || nm; end if;
    end loop;
  else raise exception 'escolha quem recebe'; end if;
  ids := array(select distinct unnest(coalesce(ids, '{}')));
  n := coalesce(array_length(ids, 1), 0);
  if n = 0 then raise exception 'nenhum jogador para receber'; end if;
  update perfis set moedas = least(2147483647::bigint, moedas::bigint + p_valor)::integer where id = any(ids);
  perform avisar(x, format('🎁 %s: você ganhou %s moedas!', left(tit, 60), to_char(p_valor, 'FM999G999G999'))) from unnest(ids) x;
  perform registrar(auth.uid(), 'evento_doacao', jsonb_build_object('quem', p_quem, 'valor', p_valor, 'jogadores', n, 'titulo', tit));
  return jsonb_build_object('jogadores', n, 'total', n::bigint * p_valor, 'faltou', faltou);
end $$;
do $$ begin
  revoke all on function public.admin_evento_doacao(text, integer, text, text) from public, anon;
  grant execute on function public.admin_evento_doacao(text, integer, text, text) to authenticated;
end $$;
