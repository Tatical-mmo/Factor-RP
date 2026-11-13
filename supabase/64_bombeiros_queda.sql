-- 64 · Bombeiros apagam de verdade (também a queda de avião/helicóptero).
-- Fogo de queda é mais difícil: avião 30 jatos, helicóptero 20 (casa/empresa continuam 10).
-- Os caminhões NPC vão tirando vida do fogo com o tempo (igual para todos, calculado pelo servidor):
--   queda: começa a baixar 45 s depois e apaga em 150 s · casa/empresa: de 80 s até 180 s (com a taxa de sempre).
-- Um bombeiro jogador que ajuda apaga bem antes e ganha os +400.

alter table public.incendios add column if not exists vida_max integer not null default 10;

-- vida que sobra considerando os caminhões NPC (o cliente faz a mesma conta para desenhar o fogo)
create or replace function public.vida_incendio(f public.incendios) returns integer
language sql stable set search_path = public as $$
  select greatest(0, least(f.vida, ceil(f.vida_max * (1 - least(1, greatest(0,
           (extract(epoch from now() - f.inicio) - case when f.tipo = 'queda' then 45 else 80 end)
           / case when f.tipo = 'queda' then 105 else 100 end))))::integer));
$$;

create or replace function public.incendio_queda(p_x real, p_z real, p_nome text) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; novo bigint; v integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null then raise exception 'sem perfil'; end if;
  if p.queda_em is not null and p.queda_em > now() - interval '45 seconds' then return null; end if;   -- uma por queda
  update perfis set queda_em = now() where id = p.id;
  v := case when coalesce(p_nome, '') ilike '%avi%' then 30 else 20 end;
  insert into incendios (tipo, alvo, nome, x, z, vida, vida_max)
    values ('queda', 0, left(coalesce(nullif(p_nome, ''), 'Queda de aeronave'), 40),
            greatest(-1400, least(1400, p_x)), greatest(-1400, least(1400, p_z)), v, v)
    returning id into novo;
  return novo;
end $$;

-- um jato de água (no máximo 1 por segundo), somado ao que os caminhões NPC já apagaram
create or replace function public.apagar_incendio(p_incendio bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; f incendios%rowtype; dono_alvo uuid; v integer;
begin
  p := jogador_livre();
  select * into f from incendios where id = p_incendio for update;
  if f.id is null or f.status <> 'ativo' then raise exception 'o fogo ja foi apagado'; end if;
  if f.tipo = 'empresa' then select dono into dono_alvo from empresas where id = f.alvo;
  elsif f.tipo = 'casa' then select dono into dono_alvo from casas where id = f.alvo; end if;
  if p.profissao is distinct from 'bombeiro' and (dono_alvo is null or dono_alvo is distinct from p.id) then
    raise exception 'so bombeiros ou o dono apagam';
  end if;
  v := vida_incendio(f);
  if p.ultimo_jato is not null and p.ultimo_jato > now() - interval '800 milliseconds' then return v; end if;
  update perfis set ultimo_jato = now() where id = p.id;
  v := greatest(0, v - 1);
  update incendios set vida = v where id = f.id;
  if v > 0 then return v; end if;
  update incendios set status = 'apagado', apagado_por = p.id where id = f.id;
  if p.profissao = 'bombeiro' and dono_alvo is distinct from p.id then update perfis set moedas = moedas + 400 where id = p.id; end if;
  if dono_alvo is not null and dono_alvo <> p.id then perform avisar(dono_alvo, format('🚒 %s apagou o fogo na %s.', p.nome, f.nome)); end if;
  return 0;
end $$;

-- os caminhões NPC terminaram: qualquer um pode avisar, o servidor confere o tempo
create or replace function public.npc_apagar(p_incendio bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare f incendios%rowtype;
begin
  if auth.uid() is null then raise exception 'sem permissao'; end if;
  select * into f from incendios where id = p_incendio for update;
  if f.id is null or f.status <> 'ativo' then return true; end if;
  if f.tipo = 'queda' then
    if vida_incendio(f) > 0 then return false; end if;
    update incendios set status = 'apagado', apagado_por = null where id = f.id;
    return true;
  end if;
  perform processar_incendios();   -- casa/empresa: a prefeitura apaga e cobra a taxa (3 min)
  return (select status <> 'ativo' from incendios where id = f.id);
end $$;

do $$
declare f text;
begin
  foreach f in array array['incendio_queda(real, real, text)', 'apagar_incendio(bigint)', 'npc_apagar(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.vida_incendio(public.incendios) from public, anon;
end $$;
