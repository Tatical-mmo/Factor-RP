-- Fator RP - loja de personagens: 8 personagens grátis, os outros 9 custam 8.000; trocar o nome custa 1.000.
-- Quem já escolheu um personagem pago ao criar a conta continua com ele (fica como comprado).

create or replace function public.personagem_gratis(p text) returns boolean language sql immutable as $$
  select p in ('Autumn_Traveler', 'Bandaged_Trailblazer', 'Curly_Wanderer', 'Desert_Scout_Ava',
               'Mustached_Explorer', 'Patchwork_Scout', 'Urban_Explorer', 'Urban_Wanderer');
$$;

create table if not exists public.personagens_comprados (
  jogador    uuid not null references public.perfis (id) on delete cascade,
  personagem text not null,
  comprado_em timestamptz not null default now(),
  primary key (jogador, personagem)
);
alter table public.personagens_comprados enable row level security;
drop policy if exists "ve os proprios" on public.personagens_comprados;
create policy "ve os proprios" on public.personagens_comprados for select to authenticated using (jogador = auth.uid());
revoke all on public.personagens_comprados from anon, authenticated;
grant select on public.personagens_comprados to authenticated;

insert into public.personagens_comprados (jogador, personagem)
  select id, personagem from public.perfis where not personagem_gratis(personagem)
on conflict do nothing;

-- conta nova só começa com personagem grátis
create or replace function public.perfil_novo_gratis() returns trigger
language plpgsql as $$
begin
  if new.cargo = 'jogador' and not personagem_gratis(new.personagem) then raise exception 'personagem pago: escolha um gratis'; end if;
  return new;
end $$;
drop trigger if exists perfis_novo_gratis on public.perfis;
create trigger perfis_novo_gratis before insert on public.perfis for each row execute function public.perfil_novo_gratis();

create or replace function public.comprar_personagem(p_personagem text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  if personagem_gratis(p_personagem) then raise exception 'esse personagem e gratis'; end if;
  if exists (select 1 from personagens_comprados where jogador = p.id and personagem = p_personagem) then raise exception 'voce ja tem esse personagem'; end if;
  if p.moedas < 8000 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 8000, personagem = p_personagem where id = p.id;   -- o gatilho confere se o personagem existe
  insert into personagens_comprados (jogador, personagem) values (p.id, p_personagem);
end $$;

create or replace function public.usar_personagem(p_personagem text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not personagem_gratis(p_personagem)
     and not exists (select 1 from personagens_comprados where jogador = auth.uid() and personagem = p_personagem) then
    raise exception 'compre esse personagem primeiro';
  end if;
  update perfis set personagem = p_personagem where id = auth.uid();
end $$;

create or replace function public.trocar_nome(p_nome text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null or p.banido then raise exception 'sem permissao'; end if;
  p_nome := btrim(p_nome);
  if p_nome !~ '^[[:alnum:] _.-]{3,16}$' then raise exception 'nome invalido'; end if;
  if lower(p_nome) = lower(p.nome) then raise exception 'esse ja e o seu nome'; end if;
  if exists (select 1 from perfis where lower(nome) = lower(p_nome)) then raise exception 'nome em uso'; end if;
  if p.moedas < 1000 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 1000, nome = p_nome where id = p.id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['comprar_personagem(text)', 'usar_personagem(text)', 'trocar_nome(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
