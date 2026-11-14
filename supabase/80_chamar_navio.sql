-- Fator RP - chamar um navio de volta ao cais (Comando Naval). Rode depois do 79.
-- Quem pode pilotar aquele navio (Marinha: Tenente+ destróier, Capitão+ porta-aviões; General Supremo) chama.
-- O navio sai da patrulha, vem em linha reta até o cais e espera atracado o próximo ciclo da patrulha.

create or replace function public.chamar_navio(p_navio text, p_x real, p_z real, p_ang real) returns void
language plpgsql security definer set search_path = public as $$
declare n navios%rowtype;
begin
  if not pode_pilotar_navio(auth.uid(), p_navio) then raise exception 'navio so marinha'; end if;
  if abs(p_x) > 1150 or p_z < 1100 or p_z > 1950 then raise exception 'navio fora do mar'; end if;
  select * into n from navios where id = p_navio for update;
  if not found then raise exception 'navio invalido'; end if;
  if n.modo = 'pilotado' and n.piloto is not null and n.t > now() - interval '40 seconds' then raise exception 'navio ja tem piloto'; end if;
  update navios set piloto = null, modo = 'retorno', x = p_x, z = p_z, ang = p_ang, t = now() where id = p_navio;
end $$;
revoke all on function public.chamar_navio(text, real, real, real) from public, anon;
grant execute on function public.chamar_navio(text, real, real, real) to authenticated;
