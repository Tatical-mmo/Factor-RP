-- 101 · O General Supremo (admin) lança o míssil de cruzeiro sem esperar a recarga de 10 min (a Marinha continua esperando).
create or replace function public.pedir_missil(p_x real, p_z real) returns jsonb
language plpgsql security definer set search_path = public as $$
declare adm boolean; v_nome text; ult timestamptz; novo bigint;
begin
  select cargo = 'admin', perfis.nome into adm, v_nome from perfis where id = auth.uid();
  if not coalesce(adm, false) and not general_marinha(auth.uid()) then raise exception 'so general da marinha'; end if;
  if abs(p_x) > 1400 or abs(p_z) > 1500 then raise exception 'alvo fora do mapa'; end if;
  select max(decidido_em) into ult from missil_pedidos where status = 'lancado';
  if not coalesce(adm, false) and ult is not null and ult > now() - interval '10 minutes' then raise exception 'missil recarregando'; end if;   -- o General Supremo não espera
  update missil_pedidos set status = 'vencido' where status = 'pendente' and criado < now() - interval '10 minutes';
  if adm then
    insert into missil_pedidos (autor, autor_nome, x, z, status, decidido_por, decidido_em) values (auth.uid(), v_nome, p_x, p_z, 'lancado', auth.uid(), now()) returning id into novo;
    return jsonb_build_object('status', 'lancado', 'id', novo);
  end if;
  if exists (select 1 from missil_pedidos where status = 'pendente') then raise exception 'ja tem pedido esperando'; end if;
  insert into missil_pedidos (autor, autor_nome, x, z) values (auth.uid(), v_nome, p_x, p_z) returning id into novo;
  insert into comandos (alvo, autor, tipo, dados) select perfis.id, auth.uid(), 'aviso', jsonb_build_object('texto', '🚀 ' || v_nome || ' pediu autorização para lançar um míssil de cruzeiro. Decida no ☰ › Míssil da Marinha.')
    from perfis where cargo = 'admin';
  return jsonb_build_object('status', 'pendente', 'id', novo);
end $$;
notify pgrst, 'reload schema';
