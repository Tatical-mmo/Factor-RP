-- Fator RP - o General Supremo (administrador) comanda o Exército mesmo sem estar alistado:
-- pode autorizar caçadas direto. Rode depois do 34d.
create or replace function public.comandante_exercito(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = p and not banido and (cargo = 'admin'
    or (profissao = 'exercito' and coalesce((select (patente('exercito', minutos) ->> 'nivel')::integer from carreiras where jogador = p and carreira = 'exercito'), 0) >= 8)));
$$;
revoke all on function public.comandante_exercito(uuid) from public, anon, authenticated;
