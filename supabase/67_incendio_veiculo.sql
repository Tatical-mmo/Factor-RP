-- 67 · Fogo em veículo (etapa 1 do pacote de crimes de clã).
-- Começa com uma chama pequena que vai crescendo até queimar o veículo inteiro (~90 s).
-- Nos primeiros 20 s qualquer jogador perto abafa (cada abafada tira 4 de vida); depois só os bombeiros.
-- Caminhões NPC: 1 para carro/van, 2 para ônibus/caminhão; vão apagando de 40 s até 150 s (igual para todos).
-- Quem põe fogo: membro de clã, fora de veículo, no máximo 1 a cada 45 s; conta como crime (fica procurado).

alter table public.incendios drop constraint if exists incendios_tipo_check;
alter table public.incendios add constraint incendios_tipo_check check (tipo in ('empresa', 'casa', 'queda', 'veiculo'));
alter table public.incendios add column if not exists ref   text;       -- qual veículo ('rua:12', 'seq:5' …)
alter table public.incendios add column if not exists porte smallint not null default 1;   -- 1 carro/van · 2 ônibus/caminhão
alter table public.perfis    add column if not exists incendiou_em timestamptz;
create index if not exists incendios_ref on public.incendios (ref) where status = 'ativo';

-- vida que sobra com os caminhões NPC (o cliente faz a mesma conta, em servicos.js vidaFogo)
create or replace function public.vida_incendio(f public.incendios) returns integer
language sql stable set search_path = public as $$
  select greatest(0, least(f.vida, ceil(f.vida_max * (1 - least(1, greatest(0,
           (extract(epoch from now() - f.inicio) - case f.tipo when 'queda' then 45 when 'veiculo' then 40 else 80 end)
           / case f.tipo when 'queda' then 105 when 'veiculo' then 110 else 100 end))))::integer));
$$;

create or replace function public.incendiar_veiculo(p_ref text, p_x real, p_z real, p_nome text, p_porte integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; novo bigint; v integer;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial or p.prf then raise exception 'policial nao incendeia'; end if;
  if not exists (select 1 from membros_cla where jogador = p.id) then raise exception 'so membros de cla'; end if;
  if p.incendiou_em is not null and p.incendiou_em > now() - interval '45 seconds' then raise exception 'aguarde para incendiar'; end if;
  if coalesce(p_ref, '') !~ '^[a-z]{2,5}:[0-9a-z._-]{1,40}$' then raise exception 'veiculo invalido'; end if;
  if exists (select 1 from incendios where ref = p_ref and status = 'ativo') then raise exception 'ja esta pegando fogo'; end if;
  v := case when p_porte >= 2 then 24 else 12 end;
  update perfis set incendiou_em = now(), crimes = crimes + 1 where id = p.id;
  insert into incendios (tipo, alvo, nome, x, z, vida, vida_max, ref, porte)
    values ('veiculo', 0, left(coalesce(nullif(p_nome, ''), 'Veículo'), 40),
            greatest(-1400, least(1400, p_x)), greatest(-1400, least(1400, p_z)), v, v, p_ref, case when p_porte >= 2 then 2 else 1 end)
    returning id into novo;
  return novo;
end $$;

-- apagar: bombeiro (jato, -1) ou o dono como antes; no fogo de veículo, qualquer um abafa nos primeiros 20 s (-4)
create or replace function public.apagar_incendio(p_incendio bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; f incendios%rowtype; dono_alvo uuid; v integer; inicio_fogo boolean;
begin
  p := jogador_livre();
  select * into f from incendios where id = p_incendio for update;
  if f.id is null or f.status <> 'ativo' then raise exception 'o fogo ja foi apagado'; end if;
  if f.tipo = 'empresa' then select dono into dono_alvo from empresas where id = f.alvo;
  elsif f.tipo = 'casa' then select dono into dono_alvo from casas where id = f.alvo; end if;
  inicio_fogo := f.tipo = 'veiculo' and f.inicio > now() - interval '20 seconds';
  if p.profissao is distinct from 'bombeiro' and not inicio_fogo and (dono_alvo is null or dono_alvo is distinct from p.id) then
    raise exception '%', case when f.tipo = 'veiculo' then 'fogo grande so bombeiros' else 'so bombeiros ou o dono apagam' end;
  end if;
  v := vida_incendio(f);
  if p.ultimo_jato is not null and p.ultimo_jato > now() - interval '800 milliseconds' then return v; end if;
  update perfis set ultimo_jato = now() where id = p.id;
  v := greatest(0, v - case when inicio_fogo and p.profissao is distinct from 'bombeiro' then 4 else 1 end);
  update incendios set vida = v where id = f.id;
  if v > 0 then return v; end if;
  update incendios set status = 'apagado', apagado_por = p.id where id = f.id;
  if p.profissao = 'bombeiro' and dono_alvo is distinct from p.id then update perfis set moedas = moedas + 400 where id = p.id; end if;
  if dono_alvo is not null and dono_alvo <> p.id then perform avisar(dono_alvo, format('🚒 %s apagou o fogo na %s.', p.nome, f.nome)); end if;
  return 0;
end $$;

-- os caminhões NPC terminaram: queda e veículo pelo tempo; casa/empresa pela prefeitura
create or replace function public.npc_apagar(p_incendio bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare f incendios%rowtype;
begin
  if auth.uid() is null then raise exception 'sem permissao'; end if;
  select * into f from incendios where id = p_incendio for update;
  if f.id is null or f.status <> 'ativo' then return true; end if;
  if f.tipo in ('queda', 'veiculo') then
    if vida_incendio(f) > 0 then return false; end if;
    update incendios set status = 'apagado', apagado_por = null where id = f.id;
    return true;
  end if;
  perform processar_incendios();
  return (select status <> 'ativo' from incendios where id = f.id);
end $$;

do $$
declare f text;
begin
  foreach f in array array['incendiar_veiculo(text, real, real, text, integer)', 'apagar_incendio(bigint)', 'npc_apagar(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.vida_incendio(public.incendios) from public, anon;
end $$;
