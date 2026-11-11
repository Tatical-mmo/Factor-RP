-- Fator RP - perdão de crimes pelo administrador e matérias do jornal (com agendamento e telões).
-- Perdão: zera crimes, recompensa, pena, algemas, crime eleitoral e caçada do jogador.
-- Matérias: jornalistas (e o administrador) escrevem, agendam, editam e apagam qualquer matéria.
-- Os jogadores leem no Jornal (☰), na banca e nos telões; as agendadas só aparecem na hora marcada.
-- Rode depois do 34d.

-- perdão completo; o administrador pode perdoar qualquer um, inclusive ele mesmo (moderadores seguem as regras de antes)
create or replace function public.admin_perdoar(alvo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare adm boolean := (select cargo from perfis where id = auth.uid()) = 'admin';
begin
  if not adm then
    if not pode('prender') then raise exception 'sem permissao'; end if;
    if not pode_agir_em(alvo) then raise exception 'voce nao pode prender esse jogador'; end if;
  end if;
  update perfis set crimes = 0, recompensa = 0, matancas = 0, pena_seg = 0, pena_marca = null, algemado = false, fianca = 0,
    eleitoral = false, cerco_ate = null where id = alvo;
  if not found then raise exception 'jogador invalido'; end if;
  delete from cacadas where cacadas.alvo = admin_perdoar.alvo;
  if alvo <> auth.uid() then
    insert into comandos (alvo, autor, tipo, dados) values (admin_perdoar.alvo, auth.uid(), 'aviso', jsonb_build_object('texto', '⚖️ A administração perdoou todos os seus crimes. Ficha limpa!'));
  end if;
  perform registrar(alvo, 'perdoar');
end $$;

create table if not exists public.materias (
  id          bigint generated always as identity primary key,
  autor       uuid references public.perfis (id) on delete set null,
  autor_nome  text not null,
  titulo      text not null check (char_length(titulo) between 3 and 90),
  texto       text not null default '' check (char_length(texto) <= 600),
  imagem      text check (imagem is null or imagem ~ '^https://'),
  publicar_em timestamptz not null default now(),
  criada_em   timestamptz not null default now(),
  editada_em  timestamptz,
  editor_nome text
);
create index if not exists materias_pub on public.materias (publicar_em desc);
do $$
begin
  alter table public.materias enable row level security;
  drop policy if exists "publicadas" on public.materias;
  create policy "publicadas" on public.materias for select using (publicar_em <= now());
  revoke all on public.materias from anon, authenticated;
  grant select on public.materias to anon, authenticated;
end $$;

create or replace function public.pode_editar_jornal() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and not banido and (profissao = 'jornalista' or cargo = 'admin'));
$$;

-- jornalistas veem também as agendadas
create or replace function public.materias_redacao() returns setof public.materias
language plpgsql stable security definer set search_path = public as $$
begin
  if not pode_editar_jornal() then raise exception 'so jornalistas'; end if;
  return query select * from materias order by publicar_em desc limit 40;
end $$;

-- criar (p_id null) ou editar qualquer matéria
create or replace function public.salvar_materia(p_id bigint, p_titulo text, p_texto text, p_imagem text, p_publicar_em timestamptz) returns bigint
language plpgsql security definer set search_path = public as $$
declare eu perfis%rowtype; novo bigint;
begin
  if not pode_editar_jornal() then raise exception 'so jornalistas'; end if;
  select * into eu from perfis where id = auth.uid();
  p_titulo := btrim(coalesce(p_titulo, '')); p_texto := btrim(coalesce(p_texto, '')); p_imagem := nullif(btrim(coalesce(p_imagem, '')), '');
  if char_length(p_titulo) < 3 then raise exception 'titulo curto'; end if;
  if p_imagem is not null and p_imagem !~ '^https://' then raise exception 'link da imagem invalido'; end if;
  p_publicar_em := greatest(coalesce(p_publicar_em, now()), now() - interval '1 minute');
  if p_id is null then
    insert into materias (autor, autor_nome, titulo, texto, imagem, publicar_em) values (eu.id, eu.nome, left(p_titulo, 90), left(p_texto, 600), p_imagem, p_publicar_em) returning id into novo;
    return novo;
  end if;
  update materias set titulo = left(p_titulo, 90), texto = left(p_texto, 600), imagem = p_imagem, publicar_em = p_publicar_em, editada_em = now(), editor_nome = eu.nome where id = p_id;
  if not found then raise exception 'materia nao existe'; end if;
  return p_id;
end $$;

create or replace function public.apagar_materia(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode_editar_jornal() then raise exception 'so jornalistas'; end if;
  delete from materias where id = p_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['materias_redacao()', 'salvar_materia(bigint, text, text, text, timestamptz)', 'apagar_materia(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.pode_editar_jornal() from public, anon, authenticated;
end $$;
