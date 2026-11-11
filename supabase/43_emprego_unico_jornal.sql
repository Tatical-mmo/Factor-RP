-- Fator RP - (1) um emprego por jogador e (2) matérias do jornal com foto, personagem e destaque.
-- (1) Emprego = Polícia em serviço, PRF, Hospital, Bombeiros, Jornal, Exército ou funcionário de empresa.
--     Ser dono de empresa não conta como emprego. A equipe (moderadores e administrador) não tem essa regra.
--     Clã: cada jogador já só pode estar em um clã.
-- (2) Foto tirada no jogo (guardada à parte, para a lista de matérias continuar leve), retrato de um
--     personagem, selo (URGENTE, EXCLUSIVO...), cor de destaque e manchete grande.
-- Rode depois do 42.

-- ---------------------------------------------------------------- (1) um emprego só
create or replace function public.trabalha_em_empresa(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros m join empresas e on e.id = m.empresa where m.jogador = p and e.dono is distinct from p);
$$;

create or replace function public.checar_emprego_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare antes integer; depois integer; emp integer;
begin
  if new.cargo <> 'jogador' then return new; end if;
  emp := trabalha_em_empresa(new.id)::int;
  antes := coalesce(old.policial, false)::int + coalesce(old.prf, false)::int + (old.profissao is not null)::int + emp;
  depois := coalesce(new.policial, false)::int + coalesce(new.prf, false)::int + (new.profissao is not null)::int + emp;
  if depois > 1 and depois > antes then raise exception 'voce ja tem um emprego'; end if;
  return new;
end $$;
drop trigger if exists checar_emprego_perfil on public.perfis;
create trigger checar_emprego_perfil before update of policial, prf, profissao on public.perfis
  for each row execute function public.checar_emprego_perfil();

create or replace function public.checar_emprego_empresa() returns trigger
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = new.jogador;
  if p.cargo <> 'jogador' or (select dono from empresas where id = new.empresa) = new.jogador then return new; end if;
  if p.policial or p.prf or p.profissao is not null then raise exception 'voce ja tem um emprego'; end if;
  return new;
end $$;
drop trigger if exists checar_emprego_empresa on public.membros;
create trigger checar_emprego_empresa before insert or update of jogador on public.membros
  for each row execute function public.checar_emprego_empresa();

-- ---------------------------------------------------------------- (2) matérias mais chamativas
alter table public.materias add column if not exists personagem text check (personagem is null or personagem ~ '^[A-Za-z0-9_]{2,60}$');
alter table public.materias add column if not exists selo text check (selo is null or selo in ('URGENTE', 'EXCLUSIVO', 'AO VIVO', 'ENTREVISTA', 'POLÍCIA', 'ESPORTE', 'POLÍTICA'));
alter table public.materias add column if not exists cor text check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$');
alter table public.materias add column if not exists destaque boolean not null default false;
alter table public.materias add column if not exists tem_foto boolean not null default false;

create table if not exists public.materia_fotos (
  materia bigint primary key references public.materias (id) on delete cascade,
  foto    text not null check (foto ~ '^data:image/jpeg;base64,' and char_length(foto) <= 160000)
);
do $$
begin
  alter table public.materia_fotos enable row level security;
  drop policy if exists "publicadas" on public.materia_fotos;
  create policy "publicadas" on public.materia_fotos for select using (exists (select 1 from materias m where m.id = materia and m.publicar_em <= now()));
  revoke all on public.materia_fotos from anon, authenticated;
  grant select on public.materia_fotos to anon, authenticated;
end $$;

-- p_foto: null mantém a foto atual; '' tira a foto
create or replace function public.salvar_materia2(p_id bigint, p_titulo text, p_texto text, p_imagem text, p_publicar_em timestamptz,
  p_foto text, p_personagem text, p_selo text, p_cor text, p_destaque boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare id_ok bigint;
begin
  id_ok := salvar_materia(p_id, p_titulo, p_texto, p_imagem, p_publicar_em);
  update materias set personagem = nullif(p_personagem, ''), selo = nullif(p_selo, ''), cor = nullif(p_cor, ''), destaque = coalesce(p_destaque, false) where id = id_ok;
  if p_foto = '' then
    delete from materia_fotos where materia = id_ok; update materias set tem_foto = false where id = id_ok;
  elsif p_foto is not null then
    insert into materia_fotos (materia, foto) values (id_ok, p_foto) on conflict (materia) do update set foto = excluded.foto;
    update materias set tem_foto = true where id = id_ok;
  end if;
  return id_ok;
end $$;

-- jornalistas veem a foto das agendadas também
create or replace function public.foto_materia(p_id bigint) returns text
language sql stable security definer set search_path = public as $$
  select f.foto from materia_fotos f join materias m on m.id = f.materia
  where f.materia = p_id and (m.publicar_em <= now() or pode_editar_jornal());
$$;

do $$
declare f text;
begin
  foreach f in array array['salvar_materia2(bigint, text, text, text, timestamptz, text, text, text, text, boolean)', 'foto_materia(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.checar_emprego_perfil() from public, anon, authenticated;
  revoke all on function public.checar_emprego_empresa() from public, anon, authenticated;
end $$;
