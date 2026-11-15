-- 92 · O administrador pode pôr fogo em veículo largado mesmo sem clã (para testar). O resto continua igual.
create or replace function public.incendiar_veiculo(p_ref text, p_x real, p_z real, p_nome text, p_porte integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; novo bigint; v integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial or p.prf then raise exception 'policial nao incendeia'; end if;
  if p.cargo is distinct from 'admin' and not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla'; end if;
  if p.incendiou_em is not null and p.incendiou_em > now() - interval '45 seconds' then raise exception 'aguarde para incendiar'; end if;
  if coalesce(p_ref, '') !~ '^[a-z]{2,5}:[0-9a-z._-]{1,40}$' then raise exception 'veiculo invalido'; end if;
  if exists (select 1 from incendios where ref = p_ref and status = 'ativo') then raise exception 'ja esta pegando fogo'; end if;
  v := case when p_porte >= 2 then 24 else 12 end;
  update perfis set incendiou_em = now(), crimes = crimes + 1 where id = p.id;
  insert into incendios (tipo, alvo, nome, x, z, vida, vida_max, ref, porte)
    values ('veiculo', 0, left(coalesce(nullif(p_nome, ''), 'Veículo'), 40),
            greatest(-1400, least(1400, p_x)), greatest(-1400, least(1400, p_z)), v, v, p_ref, case when p_porte >= 2 then 2 else 1 end)
    returning id into novo;
  return novo;
end $$;
