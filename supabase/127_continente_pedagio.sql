-- 127: pedágio da PRF na Ponte do Continente (20a). O dinheiro vai para o cofre do Governo do Estado
-- (que o governador vai usar quando a eleição estadual entrar). PRF, polícia, militares e serviços passam de graça
-- (o jogo nem cobra). Rode depois do 126.
create table if not exists public.estado_cofre (id integer primary key default 1 check (id = 1), saldo bigint not null default 0);
insert into public.estado_cofre (id) values (1) on conflict do nothing;
do $$
begin
  alter table public.estado_cofre enable row level security;
  drop policy if exists "leitura publica" on public.estado_cofre;
  create policy "leitura publica" on public.estado_cofre for select using (true);
  revoke all on public.estado_cofre from anon, authenticated;
  grant select on public.estado_cofre to anon, authenticated;
end $$;

create or replace function public.pagar_pedagio() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  update perfis set moedas = moedas - 30 where id = p.id and moedas >= 30;
  if not found then raise exception 'moedas insuficientes'; end if;
  update estado_cofre set saldo = saldo + 30 where id = 1;
  return 30;
end $$;
revoke all on function public.pagar_pedagio() from public, anon;
grant execute on function public.pagar_pedagio() to authenticated;
notify pgrst, 'reload schema';
