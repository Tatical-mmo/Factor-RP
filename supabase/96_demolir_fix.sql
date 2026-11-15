-- 96 · Correção: o Supabase não aceita DELETE sem WHERE (erro "DELETE requires a WHERE clause" ao demolir o CRAS).
create or replace function public.demolir_obra(p_obra bigint) returns void
language plpgsql security definer set search_path = public as $$
declare o obras%rowtype; adm boolean;
begin
  select * into o from obras where id = p_obra;
  if o.id is null then raise exception 'obra invalida'; end if;
  adm := exists (select 1 from perfis where id = auth.uid() and cargo = 'admin');
  if not adm and (o.publica or o.dono is distinct from auth.uid()) then raise exception 'patrimonio da prefeitura: so o administrador pode desfazer'; end if;
  delete from obras where id = o.id;
  if o.tipo = 'cras' then delete from cras_cadastros where true; end if;
  if o.tipo = 'camara' then update camara set fase = 'parada', fase_ate = 0 where id = 1; update vereadores set eleito = false where eleito; end if;
end $$;

create or replace function public.cras_fechar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'cras' and new.status = 'descontinuada' and old.status is distinct from 'descontinuada' then delete from cras_cadastros where true; end if;
  return new;
end $$;
