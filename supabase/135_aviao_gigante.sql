-- 135 · Avião gigante (20u): entra na frota dos pilotos do Aeroporto da Metrópole (id 4) e a revisão custa 14.000.
alter table public.avioes_frota drop constraint if exists avioes_frota_porte_check;
alter table public.avioes_frota add constraint avioes_frota_porte_check check (porte in ('pequeno', 'medio', 'grande', 'gigante'));
insert into public.avioes_frota (id, porte) values (4, 'gigante') on conflict (id) do nothing;

create or replace function public.revisar_aviao(p_aviao integer, p_mecanico boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; a avioes_frota%rowtype; preco integer;
begin
  p := jogador_livre();
  select * into a from avioes_frota where id = p_aviao for update;
  if a.id is null then raise exception 'aviao invalido'; end if;
  if a.voos = 0 then raise exception 'aviao ja revisado'; end if;
  if p_mecanico then
    if p.profissao is distinct from 'mecanico' and p.cargo <> 'admin' then raise exception 'so mecanicos'; end if;
    if a.revisado_em is not null and a.revisado_em > now() - interval '30 seconds' then raise exception 'espere um pouco'; end if;
    update avioes_frota set voos = 0, revisado_em = now(), revisado_por = p.nome where id = a.id;
    update perfis set moedas = moedas + 300 where id = p.id;
    return 300;
  end if;
  preco := case a.porte when 'pequeno' then 2000 when 'medio' then 4000 when 'gigante' then 14000 else 8000 end;
  if p.moedas < preco then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - preco where id = p.id;
  update prefeitura set cofre = cofre + preco / 2 where id = 1;
  update avioes_frota set voos = 0, revisado_em = now(), revisado_por = 'Mecânico do hangar' where id = a.id;
  return preco;
end $$;
revoke all on function public.revisar_aviao(integer, boolean) from public, anon;
grant execute on function public.revisar_aviao(integer, boolean) to authenticated;
