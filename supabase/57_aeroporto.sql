-- 57 · Aeroporto: passagens, voo pago ao piloto e autorizações da torre.
alter table public.perfis add column if not exists voo_pago_em timestamptz;
alter table public.perfis add column if not exists torre_pago_em timestamptz;

-- passagem dos voos regulares (NPC): 150, vai para o cofre da prefeitura
create or replace function public.comprar_passagem() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null then raise exception 'sem permissao'; end if;
  if p.moedas < 150 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 150 where id = p.id;
  update prefeitura set cofre = cofre + 150 where id = 1;
  return 150;
end $$;

-- voo completo (decolou num aeroporto e pousou em outro): pequeno 250, médio 400, grande 600; um a cada 60 s
create or replace function public.pagar_voo(p_porte text) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.profissao is distinct from 'piloto' and p.cargo <> 'admin' then raise exception 'so pilotos'; end if;
  if p.voo_pago_em is not null and p.voo_pago_em > now() - interval '60 seconds' then raise exception 'voo rapido demais'; end if;
  v := case p_porte when 'grande' then 600 when 'medio' then 400 else 250 end;
  update perfis set moedas = moedas + v, voo_pago_em = now() where id = p.id;
  return v;
end $$;

-- cada autorização de pouso ou decolagem dada pela torre: 40 (no máximo uma a cada 20 s)
create or replace function public.pagar_torre() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.profissao is distinct from 'controlador' and p.cargo <> 'admin' then raise exception 'so a torre'; end if;
  if p.torre_pago_em is not null and p.torre_pago_em > now() - interval '20 seconds' then return 0; end if;
  update perfis set moedas = moedas + 40, torre_pago_em = now() where id = p.id;
  return 40;
end $$;

do $$
declare f text;
begin
  foreach f in array array['comprar_passagem()', 'pagar_voo(text)', 'pagar_torre()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
