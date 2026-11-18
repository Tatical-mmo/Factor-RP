-- 116: na fusão de empresas a logo da empresa absorvida era apagada junto com ela. Agora, quando os caminhões
-- passam para a empresa principal e ela ainda não tem logo, a logo vai junto (com o mesmo status).
-- Rode depois do 115. A logo de uma fusão já feita não volta: escolha de novo na aba 🎨 Logo do grupo.
create or replace function public.logo_segue_caminhao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.empresa is distinct from old.empresa and old.empresa is not null and new.empresa is not null
     and not exists (select 1 from empresa_logos where empresa = new.empresa)
     and exists (select 1 from empresa_logos where empresa = old.empresa) then
    insert into empresa_logos (empresa, tipo, url, pronta, cor, status, enviado_em, avaliado_por, motivo)
      select new.empresa, tipo, url, pronta, cor, status, enviado_em, avaliado_por, motivo from empresa_logos where empresa = old.empresa
      on conflict (empresa) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists caminhao_leva_logo on public.caminhoes;
create trigger caminhao_leva_logo after update of empresa on public.caminhoes for each row execute function public.logo_segue_caminhao();
notify pgrst, 'reload schema';
