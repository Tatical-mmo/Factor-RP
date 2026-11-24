-- 148: tiros e foguetes destroem veículos (21y). Quem dá o tiro final (ou o foguete) chama destruir_veiculo: o
-- veículo explode na hora pelo mesmo sistema de incêndio (carcaça, fogo que pula, bombeiros). Carro de jogador fica
-- queimado e precisa de conserto (5.000) como no incêndio; o dono recebe aviso. Rode depois do 147.
alter table public.perfis add column if not exists destruiu_veic_em timestamptz;
alter table public.perfis add column if not exists destruiu_veic_n integer not null default 0;

create or replace function public.destruir_veiculo(p_ref text, p_x real, p_z real, p_nome text, p_porte integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c carros%rowtype; novo bigint; v integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  -- no máximo 8 veículos a cada 10 s (um foguete pode pegar vários de uma vez)
  if p.destruiu_veic_em is null or p.destruiu_veic_em < now() - interval '10 seconds' then p.destruiu_veic_n := 0; p.destruiu_veic_em := now(); end if;
  if p.destruiu_veic_n >= 8 then raise exception 'aguarde'; end if;
  if coalesce(p_ref, '') !~ '^[a-z]{2,5}:[0-9a-z._-]{1,40}$' then raise exception 'veiculo invalido'; end if;
  if exists (select 1 from incendios where ref = p_ref and status = 'ativo') then return null; end if;
  if p_ref like 'car:%' then
    select * into c from carros where id = substring(p_ref from 5)::bigint for update;
    if c.id is null or c.modelo = 'presidencial' or abs(c.x - p_x) > 6 or abs(c.z - p_z) > 6 then raise exception 'veiculo invalido'; end if;
    update carros set queimado = true where id = c.id;
    if c.dono <> p.id then perform avisar(c.dono, '💥 O seu carro foi destruído a tiros! Ele precisa de conserto (5.000) na concessionária.'); end if;
  end if;
  update perfis set destruiu_veic_em = p.destruiu_veic_em, destruiu_veic_n = p.destruiu_veic_n + 1 where id = p.id;
  v := case when p_porte >= 2 then 24 else 12 end;
  insert into incendios (tipo, alvo, nome, x, z, vida, vida_max, ref, porte, explodiu_em)
    values ('veiculo', 0, left(coalesce(nullif(p_nome, ''), 'Veículo'), 40),
            greatest(-1400, least(1400, p_x)), greatest(-1400, least(1400, p_z)), v, v, p_ref, case when p_porte >= 2 then 2 else 1 end, now())
    returning id into novo;
  return novo;
end $$;
revoke all on function public.destruir_veiculo(text, real, real, text, integer) from public, anon;
grant execute on function public.destruir_veiculo(text, real, real, text, integer) to authenticated;
notify pgrst, 'reload schema';
