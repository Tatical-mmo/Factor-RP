-- Fator RP - hospital e bombeiros.
-- Quem morre fica ferido por 20 s: um médico em serviço pode socorrer (o ferido levanta ali mesmo e o
-- médico ganha 250). Sem socorro, a pessoa acorda no hospital e paga a conta (até 100, vai para o cofre
-- da prefeitura). No balcão do hospital dá para se tratar (150, vida cheia).
-- Incêndios aparecem sozinhos em empresas e casas. Bombeiro em serviço apaga com 10 jatos (1 por segundo)
-- e ganha 400. O dono também pode apagar o próprio imóvel (sem pagamento). Fogo que dura 8 minutos queima:
-- a empresa perde 5% do caixa (até 5.000) e o dono da casa paga 500 de reforma.

alter table public.perfis add column if not exists profissao      text;
alter table public.perfis add column if not exists profissao_desde timestamptz;
alter table public.perfis add column if not exists socorrido_em   timestamptz;
alter table public.perfis add column if not exists ultimo_jato    timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfis_profissao_ok') then
    alter table public.perfis add constraint perfis_profissao_ok check (profissao in ('medico', 'bombeiro'));
  end if;
end $$;

create table if not exists public.incendios (
  id     bigint generated always as identity primary key,
  tipo   text not null check (tipo in ('empresa', 'casa')),
  alvo   bigint not null,
  nome   text not null,
  x      real not null,
  z      real not null,
  vida   integer not null default 10,
  inicio timestamptz not null default now(),
  status text not null default 'ativo' check (status in ('ativo', 'apagado', 'queimou')),
  apagado_por uuid
);
create index if not exists incendios_status on public.incendios (status);
do $$
begin
  alter table public.incendios enable row level security;
  drop policy if exists "leitura publica" on public.incendios;
  create policy "leitura publica" on public.incendios for select using (true);
  revoke all on public.incendios from anon, authenticated;
  grant select on public.incendios to anon, authenticated;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'incendios') then
    alter publication supabase_realtime add table public.incendios;
  end if;
end $$;

-- ------------------------------------------------------------ profissões
create or replace function public.entrar_profissao(p_profissao text) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p_profissao not in ('medico', 'bombeiro') then raise exception 'profissao invalida'; end if;
  if p.policial or p.prf then raise exception 'saia da policia antes'; end if;
  if p.crimes > 0 then raise exception 'procurado nao pode trabalhar no servico publico'; end if;
  update perfis set profissao = p_profissao, profissao_desde = now() where id = p.id;
end $$;

create or replace function public.sair_profissao() returns void
language sql security definer set search_path = public as $$
  update perfis set profissao = null, profissao_desde = null where id = auth.uid();
$$;

-- ------------------------------------------------------------ hospital
create or replace function public.socorrer(p_alvo uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v perfis%rowtype;
begin
  p := jogador_livre();
  if p.profissao is distinct from 'medico' then raise exception 'so medicos em servico'; end if;
  if p_alvo = p.id then raise exception 'voce nao pode se socorrer'; end if;
  select * into v from perfis where id = p_alvo for update;
  if v.id is null or v.ultima_morte is null or v.ultima_morte < now() - interval '25 seconds' then raise exception 'essa pessoa nao esta ferida'; end if;
  if v.socorrido_em is not null and v.socorrido_em >= v.ultima_morte then raise exception 'ja foi socorrida'; end if;
  update perfis set socorrido_em = now() where id = v.id;
  update perfis set moedas = moedas + 250 where id = p.id;
  insert into comandos (alvo, autor, tipo, dados) values (v.id, p.id, 'socorro', jsonb_build_object('medico', p.nome));
  return 250;
end $$;

-- acordar no hospital: paga a conta (até 100) para o cofre da prefeitura
create or replace function public.alta_hospital() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; conta integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.id is null then raise exception 'sem permissao'; end if;
  if p.ultima_morte is null or p.ultima_morte < now() - interval '2 minutes' then return 0; end if;
  if p.socorrido_em is not null and p.socorrido_em >= p.ultima_morte then return 0; end if;
  conta := least(100, p.moedas);
  update perfis set moedas = moedas - conta, socorrido_em = now() where id = p.id;
  update prefeitura set cofre = cofre + conta where id = 1;
  return conta;
end $$;

create or replace function public.tratar_hospital() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.moedas < 150 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 150 where id = p.id;
  update prefeitura set cofre = cofre + 150 where id = 1;
  return 150;
end $$;

-- ------------------------------------------------------------ incêndios
create or replace function public.processar_incendios() returns void
language plpgsql security definer set search_path = public as $$
declare f incendios%rowtype; perda integer; v_dono uuid; alvo record;
begin
  -- fogo de 8 minutos queima
  for f in select * from incendios where status = 'ativo' and inicio < now() - interval '8 minutes' for update skip locked loop
    update incendios set status = 'queimou' where id = f.id;
    if f.tipo = 'empresa' then
      update empresas set caixa = caixa - least(5000, caixa / 20) where id = f.alvo returning dono into v_dono;
      perform avisar(v_dono, format('🔥 O fogo destruiu parte da %s: a empresa perdeu 5%% do caixa.', f.nome));
    else
      select c.dono into v_dono from casas c where c.id = f.alvo;
      if v_dono is not null then
        perda := least(500, (select moedas from perfis where id = v_dono));
        update perfis set moedas = moedas - perda where id = v_dono;
        perform avisar(v_dono, format('🔥 Sua casa pegou fogo: a reforma custou %s.', perda));
      end if;
    end if;
  end loop;
  -- novo foco: no máximo 2 ao mesmo tempo, e no máximo 1 a cada 5 minutos
  if (select count(*) from incendios where status = 'ativo') >= 2 then return; end if;
  if exists (select 1 from incendios where inicio > now() - interval '5 minutes') then return; end if;
  if random() > 0.4 then return; end if;
  if random() < 0.6 then
    select 'empresa' as tipo, e.id as alvo, e.nome, l.x, l.z, e.dono into alvo
      from unidades u join lotes l on l.id = u.lote join empresas e on e.id = u.empresa
     where not exists (select 1 from incendios i where i.status = 'ativo' and i.tipo = 'empresa' and i.alvo = e.id)
     order by random() limit 1;
  end if;
  if alvo is null then
    select 'casa' as tipo, c.id::bigint as alvo, coalesce(c.rotulo, 'Casa') as nome, c.x, c.z, c.dono into alvo
      from casas c where c.dono is not null and c.pai is null
       and not exists (select 1 from incendios i where i.status = 'ativo' and i.tipo = 'casa' and i.alvo = c.id)
     order by random() limit 1;
  end if;
  if alvo is null then return; end if;
  insert into incendios (tipo, alvo, nome, x, z) values (alvo.tipo, alvo.alvo, alvo.nome, alvo.x, alvo.z);
  perform avisar(alvo.dono, format('🔥 FOGO na %s! Chame os bombeiros ou apague você mesmo.', alvo.nome));
end $$;

-- um jato de água (no máximo 1 por segundo); o 10º apaga
create or replace function public.apagar_incendio(p_incendio bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; f incendios%rowtype; dono_alvo uuid;
begin
  p := jogador_livre();
  select * into f from incendios where id = p_incendio for update;
  if f.id is null or f.status <> 'ativo' then raise exception 'o fogo ja foi apagado'; end if;
  if f.tipo = 'empresa' then select dono into dono_alvo from empresas where id = f.alvo;
  else select dono into dono_alvo from casas where id = f.alvo; end if;
  if p.profissao is distinct from 'bombeiro' and dono_alvo is distinct from p.id then raise exception 'so bombeiros ou o dono apagam'; end if;
  if p.ultimo_jato is not null and p.ultimo_jato > now() - interval '800 milliseconds' then return f.vida; end if;
  update perfis set ultimo_jato = now() where id = p.id;
  update incendios set vida = vida - 1 where id = f.id returning * into f;
  if f.vida > 0 then return f.vida; end if;
  update incendios set status = 'apagado', apagado_por = p.id where id = f.id;
  if p.profissao = 'bombeiro' and dono_alvo is distinct from p.id then update perfis set moedas = moedas + 400 where id = p.id; end if;
  if dono_alvo is not null and dono_alvo <> p.id then perform avisar(dono_alvo, format('🚒 %s apagou o fogo na %s.', p.nome, f.nome)); end if;
  return 0;
end $$;

do $$
declare f text;
begin
  foreach f in array array['entrar_profissao(text)', 'sair_profissao()', 'socorrer(uuid)', 'alta_hospital()', 'tratar_hospital()',
                           'processar_incendios()', 'apagar_incendio(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
