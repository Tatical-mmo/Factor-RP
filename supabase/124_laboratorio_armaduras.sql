-- 124: laboratório de armaduras na Área 51 (tecnologia alienígena do Exército) e o Doutor da Peste.
--  · O General Supremo (admin) autoriza jogadores no painel do laboratório. Autorizado pode entrar na Área 51
--    (sem ser abatido) e pegar UM exemplar de armadura. Ela fica guardada com ele, como um carro.
--  · Armadura destruída não volta: é preciso pegar outra no laboratório. O admin pega quantas quiser.
--  · Doutor da Peste: nova aparência do Bruxo e personagem limitado que só o admin usa e presenteia (nunca à venda).
-- Rode depois do 123.

alter table public.perfis add column if not exists lab_autorizado boolean not null default false;

create table if not exists public.armaduras (
  dono       uuid primary key references public.perfis (id) on delete cascade,
  modelo     text not null check (modelo in ('vilkron', 'veloster', 'prisma', 'reformulado', 'sentinel', 'predador')),
  blindagem  real not null default 1 check (blindagem between 0 and 1),
  criada     timestamptz not null default now()
);
do $$
begin
  alter table public.armaduras enable row level security;
  drop policy if exists "leitura publica" on public.armaduras;
  create policy "leitura publica" on public.armaduras for select using (true);
  revoke all on public.armaduras from anon, authenticated;
  grant select on public.armaduras to anon, authenticated;
end $$;

create or replace function public.lab_autorizar(p_alvo uuid, p_sim boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(cargo_de(auth.uid()), '') <> 'admin' then raise exception 'so o general supremo'; end if;
  update perfis set lab_autorizado = coalesce(p_sim, false) where id = p_alvo;
  if not found then raise exception 'jogador nao encontrado'; end if;
  perform registrar(auth.uid(), case when p_sim then 'lab_autorizou' else 'lab_desautorizou' end, jsonb_build_object('alvo', p_alvo));
  return coalesce(p_sim, false);
end $$;

create or replace function public.pegar_armadura(p_modelo text) returns text
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.cargo <> 'admin' and not p.lab_autorizado then raise exception 'sem autorizacao do laboratorio'; end if;
  if p_modelo not in ('vilkron', 'veloster', 'prisma', 'reformulado', 'sentinel', 'predador') then raise exception 'armadura invalida'; end if;
  if p.cargo <> 'admin' and exists (select 1 from armaduras where dono = p.id) then raise exception 'voce ja tem uma armadura'; end if;
  insert into armaduras (dono, modelo, blindagem) values (p.id, p_modelo, 1)
    on conflict (dono) do update set modelo = excluded.modelo, blindagem = 1, criada = now();
  perform registrar(p.id, 'pegou_armadura', jsonb_build_object('modelo', p_modelo));
  return p_modelo;
end $$;

-- guarda quanto de blindagem sobrou (o jogo manda de tempos em tempos e ao guardar)
create or replace function public.salvar_armadura(p_blindagem real) returns void
language plpgsql security definer set search_path = public as $$
begin
  update armaduras set blindagem = greatest(0, least(1, coalesce(p_blindagem, 0))) where dono = auth.uid();
end $$;

-- armadura destruída (ou ejetada): some de vez
create or replace function public.perder_armadura() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from armaduras where dono = auth.uid();
end $$;

revoke all on function public.lab_autorizar(uuid, boolean), public.pegar_armadura(text), public.salvar_armadura(real), public.perder_armadura() from public, anon;
grant execute on function public.lab_autorizar(uuid, boolean), public.pegar_armadura(text), public.salvar_armadura(real), public.perder_armadura() to authenticated;

-- Doutor da Peste: limitado só de presente (a vitrine nunca abre para ele)
insert into public.personagens_evento (id, nome, preco) values ('Doutor_Peste', 'Doutor da Peste', 999999)
  on conflict (id) do update set nome = excluded.nome;
update public.personagens_evento set liberado_ate = null where id = 'Doutor_Peste';
create or replace function public.peste_sem_vitrine() returns trigger language plpgsql as $$
begin
  if new.id = 'Doutor_Peste' then new.liberado_ate := null; end if;
  return new;
end $$;
drop trigger if exists peste_sem_vitrine on public.personagens_evento;
create trigger peste_sem_vitrine before insert or update on public.personagens_evento for each row execute function public.peste_sem_vitrine();

notify pgrst, 'reload schema';
