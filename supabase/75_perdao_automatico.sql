-- Fator RP - perdão automático de crimes (estrelas). Rode depois do 74d.
-- Os crimes viram estrelas, no máximo 5. Só conta o tempo em que o jogador está online
-- (o jogo chama perdao_tick a cada 30 s; um intervalo maior que 50 s não vale).
-- Até 3 estrelas: some 1 a cada 5 min. Acima de 3: cada estrela extra leva 20 min.
-- O relógio para enquanto a polícia persegue ou cerca, e enquanto o jogador está preso ou algemado.
-- Crime novo zera o relógio. A recompensa (🎯) não é mexida.

alter table public.perfis add column if not exists crimes_credito integer not null default 0;   -- segundos já cumpridos para a próxima estrela
alter table public.perfis add column if not exists crimes_tick timestamptz;                     -- último tique do relógio

-- trava em 5 estrelas e zera o relógio a cada crime novo
create or replace function public.trava_estrelas() returns trigger
language plpgsql as $$
begin
  if new.crimes > 5 then new.crimes := 5; end if;
  if tg_op = 'INSERT' then return new; end if;
  if new.crimes > old.crimes then new.crimes_credito := 0; new.crimes_tick := now(); end if;
  if new.crimes = 0 then new.crimes_credito := 0; end if;
  return new;
end $$;
drop trigger if exists perfis_trava_estrelas on public.perfis;
create trigger perfis_trava_estrelas before insert or update of crimes on public.perfis
  for each row execute function public.trava_estrelas();

update public.perfis set crimes = 5 where crimes > 5;

create or replace function public.perdao_tick(p_perseguido boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p perfis%rowtype; delta real; pausa boolean; cred integer; c integer; custo integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if not found or p.crimes <= 0 then return jsonb_build_object('crimes', 0, 'falta', 0, 'pausa', false); end if;
  delta := extract(epoch from now() - coalesce(p.crimes_tick, now()));
  pausa := coalesce(p_perseguido, false) or coalesce(p.pena_seg, 0) > 0 or coalesce(p.algemado, false)
    or (p.cerco_ate is not null and p.cerco_ate > now());
  cred := p.crimes_credito;
  if delta > 0 and delta <= 50 and not pausa then cred := cred + floor(delta)::integer; end if;   -- offline ou tique perdido: não conta
  c := least(p.crimes, 5);
  loop
    exit when c = 0;
    custo := case when c > 3 then 1200 else 300 end;
    exit when cred < custo;
    cred := cred - custo; c := c - 1;
  end loop;
  if c = 0 then cred := 0; end if;
  update perfis set crimes = c, crimes_credito = cred, crimes_tick = now() where id = p.id;
  return jsonb_build_object('crimes', c, 'falta', case when c > 0 then (case when c > 3 then 1200 else 300 end) - cred else 0 end, 'pausa', pausa);
end $$;

revoke all on function public.perdao_tick(boolean) from public, anon;
grant execute on function public.perdao_tick(boolean) to authenticated;
revoke all on function public.trava_estrelas() from public, anon, authenticated;
