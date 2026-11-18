-- 113: Contatos do celular (mensagens privadas entre amigos) e reboque automático.
-- Mensagens: só entre amigos aceitos; quem bloqueou não recebe; ficam 7 dias.
-- Reboque: carro comprado parado 30 min na rua vai para o estacionamento mais perto (qualquer jogador on-line
-- dispara; o banco confere os 30 min) e o dono recebe o aviso.
-- Rode depois do 112.

create table if not exists public.mensagens_privadas (
  id    bigint generated always as identity primary key,
  de    uuid not null references public.perfis (id) on delete cascade,
  para  uuid not null references public.perfis (id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 300),
  em    timestamptz not null default now(),
  lida  boolean not null default false
);
create index if not exists mensagens_privadas_para on public.mensagens_privadas (para, lida);
create index if not exists mensagens_privadas_par on public.mensagens_privadas (de, para, em);
alter table public.mensagens_privadas enable row level security;
drop policy if exists "so os dois leem" on public.mensagens_privadas;
create policy "so os dois leem" on public.mensagens_privadas for select using (auth.uid() in (de, para));

create or replace function public.enviar_mensagem(p_para uuid, p_texto text) returns bigint
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); t text := btrim(coalesce(p_texto, '')); novo bigint;
begin
  if eu is null then raise exception 'faca login'; end if;
  if t = '' then raise exception 'mensagem vazia'; end if;
  if char_length(t) > 300 then t := left(t, 300); end if;
  if not exists (select 1 from amizades where aceita and ((de = eu and para = p_para) or (de = p_para and para = eu))) then raise exception 'so para amigos'; end if;
  if exists (select 1 from bloqueios where dono = p_para and alvo = eu) then raise exception 'esse jogador nao recebe suas mensagens'; end if;
  if exists (select 1 from mensagens_privadas where de = eu and em > now() - interval '1 second') then raise exception 'devagar'; end if;
  delete from mensagens_privadas where ((de = eu and para = p_para) or (de = p_para and para = eu)) and em < now() - interval '7 days';
  insert into mensagens_privadas (de, para, texto) values (eu, p_para, t) returning id into novo;
  return novo;
end $$;

-- últimas 60 mensagens da conversa (em ordem) e marca as recebidas como lidas
create or replace function public.conversa(p_outro uuid) returns table (id bigint, de uuid, texto text, em timestamptz)
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid();
begin
  update mensagens_privadas m set lida = true where m.para = eu and m.de = p_outro and not m.lida;
  return query select x.id, x.de, x.texto, x.em from (
    select m.id, m.de, m.texto, m.em from mensagens_privadas m
     where (m.de = eu and m.para = p_outro) or (m.de = p_outro and m.para = eu)
     order by m.em desc limit 60) x order by x.em;
end $$;

create or replace function public.nao_lidas() returns table (de uuid, n integer)
language sql stable security definer set search_path = public as $$
  select m.de, count(*)::integer from mensagens_privadas m where m.para = auth.uid() and not m.lida group by m.de;
$$;

-- reboque
alter table public.carros add column if not exists parado_em timestamptz not null default now();
alter table public.carros add column if not exists no_patio boolean not null default false;
create or replace function public.carro_parado_em() returns trigger
language plpgsql as $$
begin
  if (new.x, new.z) is distinct from (old.x, old.z) then
    new.parado_em := now();
    if new.no_patio is not distinct from old.no_patio then new.no_patio := false; end if;
  end if;
  return new;
end $$;
drop trigger if exists carros_parado_em on public.carros;
create trigger carros_parado_em before update on public.carros for each row execute function public.carro_parado_em();

create or replace function public.rebocar_carro(p_carro bigint, p_x real, p_z real, p_ang real) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_dono uuid; v_modelo text;
begin
  if auth.uid() is null then raise exception 'faca login'; end if;
  update carros set x = greatest(-1000, least(1100, p_x)), z = greatest(-1528, least(1112, p_z)), ang = coalesce(p_ang, 0), no_patio = true
   where id = p_carro and not no_patio and parado_em < now() - interval '30 minutes' and ladrao is null and not queimado
     and modelo not in ('helicoptero', 'presidencial') and (oficina_ate is null or oficina_ate < now())
         and (destruido_ate is null or destruido_ate < now())
  returning dono, modelo into v_dono, v_modelo;
  if not found then return false; end if;
  perform avisar(v_dono, '🚛 Seu carro ficou 30 min parado na rua e foi rebocado para o estacionamento mais perto (grátis). Veja no 📱 Mecânico → 📍 Onde está.');
  return true;
end $$;

do $$
declare f text;
begin
  foreach f in array array['enviar_mensagem(uuid, text)', 'conversa(uuid)', 'nao_lidas()', 'rebocar_carro(bigint, real, real, real)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
