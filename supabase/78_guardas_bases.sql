-- Fator RP - quantidade de soldados vigiando cada base, no controle do General Supremo (admin). Rode depois do 77.
-- 0 a 60 por base. Todos os jogadores veem o mesmo número (o jogo lê ao chegar perto e a cada minuto).

create table if not exists public.guardas_bases (
  base     text primary key check (base in ('a51', 'quartel', 'aerea', 'naval')),
  guardas  integer not null check (guardas between 0 and 60),
  mudado   timestamptz not null default now()
);
insert into public.guardas_bases (base, guardas) values ('a51', 28), ('quartel', 16), ('aerea', 16), ('naval', 16) on conflict (base) do nothing;
alter table public.guardas_bases enable row level security;
drop policy if exists ler on public.guardas_bases;
create policy ler on public.guardas_bases for select to authenticated using (true);
grant select on public.guardas_bases to authenticated;

create or replace function public.definir_guardas(p_base text, p_guardas integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis where id = auth.uid() and cargo = 'admin') then raise exception 'so o general supremo'; end if;
  if p_guardas < 0 or p_guardas > 60 then raise exception 'entre 0 e 60 soldados'; end if;
  update guardas_bases set guardas = p_guardas, mudado = now() where base = p_base;
  if not found then raise exception 'base invalida'; end if;
end $$;
revoke all on function public.definir_guardas(text, integer) from public, anon;
grant execute on function public.definir_guardas(text, integer) to authenticated;
