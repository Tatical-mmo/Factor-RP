-- 22w: viaturas da polícia (via:) e caminhões de bombeiros indo para uma chamada (serv:) também furam pneu.
-- Só muda a lista de veículos aceitos; o resto da função é a mesma da 154.
create or replace function public.furar_pneu_npc(p_ref text, p_roda integer, p_x real, p_z real, p_ang real) returns public.npc_panes
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; r npc_panes%rowtype; m integer; n integer; v integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if p_ref !~ '^(van|bomb|bus|rua|via|serv):[A-Za-z0-9._-]{1,24}$' then raise exception 'veiculo invalido'; end if;
  if p_roda < 0 or p_roda > 7 then raise exception 'roda invalida'; end if;
  if p.furou_npc_em is not null and p.furou_npc_em > now() - interval '0.3 seconds' then raise exception 'aguarde'; end if;
  update perfis set furou_npc_em = now() where id = p.id;
  select * into r from npc_panes where ref = p_ref for update;
  if r.ref is not null and r.patio_ate is not null and r.fim_em <= now() and r.patio_ate > now() then raise exception 'veiculo no patio'; end if;
  if r.ref is null or coalesce(r.patio_ate, r.fim_em) <= now() then   -- pane nova
    delete from npc_panes where ref = p_ref;
    insert into npc_panes (ref, mask, x, z, ang, fim_em)
      values (p_ref, 1 << p_roda, p_x, p_z, coalesce(p_ang, 0),
              now() + case when p_ref like 'rua:%' then interval '10 minutes' else interval '100 seconds' end)
      returning * into r;
    return r;
  end if;
  if r.guincho then return r; end if;   -- o guincho já foi chamado
  m := r.mask | (1 << p_roda);
  if m = r.mask then return r; end if;
  n := (select count(*) from generate_series(0, 7) b where (m >> b) & 1 = 1);
  if n >= 2 and p_ref not like 'rua:%' then   -- dois pneus: chama o guincho (o tempo conta de agora)
    select g into v from generate_series(0, 7) g
      where g not in (select vaga from npc_panes where vaga is not null and patio_ate > now()) order by g limit 1;
    update npc_panes set mask = m, guincho = true, vaga = v, fim_em = now() + interval '75 seconds',
      patio_ate = case when v is null then now() + interval '75 seconds' else now() + interval '75 seconds' + interval '64 minutes' end
      where ref = p_ref returning * into r;
  else
    update npc_panes set mask = m where ref = p_ref returning * into r;
  end if;
  return r;
end $$;
