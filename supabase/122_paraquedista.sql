-- 122: especialização de Paraquedista no quartel. Só militares do Exército de Cabo para cima
-- (2 patentes acima de Recruta = 180 minutos de carreira). Com ela o jogador veste a farda de
-- Paraquedista e pode saltar de carona. Rode depois do 121.
alter table public.perfis add column if not exists paraquedista boolean not null default false;

create or replace function public.especializar_paraquedista() returns boolean
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; m integer;
begin
  p := jogador_livre();
  if p.cargo <> 'admin' then
    if p.profissao is distinct from 'exercito' then raise exception 'so militares do exercito'; end if;
    select minutos into m from carreiras where jogador = p.id and carreira = 'exercito';
    if coalesce(m, 0) < 180 then raise exception 'so de cabo para cima'; end if;
  end if;
  update perfis set paraquedista = true where id = p.id;
  return true;
end $$;
revoke all on function public.especializar_paraquedista() from public, anon;
grant execute on function public.especializar_paraquedista() to authenticated;
notify pgrst, 'reload schema';
