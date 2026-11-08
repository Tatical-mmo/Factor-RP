-- Fator RP - administrador define o nível de uma empresa ou clã (para testar o visual de cada fase).

create or replace function public.admin_nivel_empresa(p_empresa bigint, p_nivel integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if cargo_de(auth.uid()) <> 'admin' then raise exception 'sem permissao'; end if;
  if p_nivel < 1 or p_nivel > 15 then raise exception 'nivel entre 1 e 15'; end if;
  update empresas set nivel = p_nivel where id = p_empresa;
  if not found then raise exception 'empresa nao encontrada'; end if;
  perform registrar(null, 'nivel_empresa', jsonb_build_object('empresa', p_empresa, 'nivel', p_nivel));
end $$;

create or replace function public.admin_nivel_cla(p_cla bigint, p_nivel integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if cargo_de(auth.uid()) <> 'admin' then raise exception 'sem permissao'; end if;
  if p_nivel < 1 or p_nivel > 15 then raise exception 'nivel entre 1 e 15'; end if;
  update clas set nivel = p_nivel where id = p_cla;
  if not found then raise exception 'cla nao encontrado'; end if;
  perform registrar(null, 'nivel_cla', jsonb_build_object('cla', p_cla, 'nivel', p_nivel));
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_nivel_empresa(bigint, integer)', 'admin_nivel_cla(bigint, integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
