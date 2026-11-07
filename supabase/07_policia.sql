-- Fator RP - etapa 6: polícia (serviço, salário, prisão de procurados, fiança e perdão).
-- Cole tudo numa consulta limpa e toque em Run.

-- entrar em serviço na delegacia: não pode ter crimes nem pena pendente
create or replace function public.entrar_policia() returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  p := jogador_livre();
  if p.crimes > 0 then raise exception 'quem tem crimes nao entra na policia'; end if;
  if p.cargo <> 'jogador' then raise exception 'a equipe nao entra na policia'; end if;
  update perfis set policial = true, servico_desde = now(), policia_pago = now() where id = p.id;
end $$;

-- sair de serviço paga o tempo que faltava
create or replace function public.sair_policia() returns integer
language plpgsql security definer set search_path = public as $$
declare pago integer;
begin
  pago := receber_salario_policia();
  update perfis set policial = false, servico_desde = null, policia_pago = null where id = auth.uid();
  return pago;
end $$;

-- salário: 100 moedas a cada 3 minutos de serviço (no máximo 30 min acumulados por chamada)
create or replace function public.receber_salario_policia() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; blocos integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if not p.policial or p.policia_pago is null then return 0; end if;
  blocos := least(10, floor(extract(epoch from (now() - p.policia_pago)) / 180))::integer;
  if blocos <= 0 then return 0; end if;
  update perfis set moedas = moedas + blocos * 100,
    policia_pago = greatest(p.policia_pago, now() - interval '30 minutes') + make_interval(secs => blocos * 180)
  where id = p.id;
  return blocos * 100;
end $$;

-- policial algema e prende um procurado: pena de 7 min dobrando por crime; fiança 2.000 por crime; +800 de bônus
create or replace function public.prender_suspeito(p_alvo uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare pol perfis%rowtype; a perfis%rowtype; minutos integer;
begin
  select * into pol from perfis where id = auth.uid() for update;
  if not pol.policial or pol.banido or pol.algemado or pol.pena_seg > 0 then raise exception 'voce nao esta em servico'; end if;
  select * into a from perfis where id = p_alvo for update;
  if a.id is null or a.id = pol.id then raise exception 'jogador nao encontrado'; end if;
  if a.cargo <> 'jogador' then raise exception 'a equipe nao pode ser presa'; end if;
  if a.crimes <= 0 then raise exception 'esse jogador nao e procurado'; end if;
  if a.pena_seg > 0 then raise exception 'ja esta preso'; end if;
  minutos := least(1440, 7 * power(2, least(a.crimes, 9) - 1))::integer;
  -- a prisão "zera" a ficha: depois de cumprir ou pagar a fiança, está perdoado
  update perfis set pena_seg = minutos * 60, pena_marca = now(), fianca = 2000 * a.crimes, crimes = 0, algemado = false,
    policial = false where id = a.id;
  update perfis set moedas = moedas + 800 where id = pol.id;
  perform avisar(a.id, format('Você foi preso por %s. Pena: %s min. Fiança: %s moedas.', pol.nome, minutos, 2000 * a.crimes));
  return minutos;
end $$;

-- pagar fiança: sai da cadeia na hora
create or replace function public.pagar_fianca() returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.pena_seg <= 0 then raise exception 'voce nao esta preso'; end if;
  if p.moedas < p.fianca then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - p.fianca, fianca = 0, pena_seg = 0, pena_marca = null where id = p.id;
end $$;

-- a fiança some quando a pena acaba
create or replace function public.cumprir_pena() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; passou integer;
begin
  select * into p from perfis where id = auth.uid() for update;
  if p.pena_seg <= 0 then return 0; end if;
  passou := least(20, greatest(0, floor(extract(epoch from (now() - coalesce(p.pena_marca, now()))))))::integer;
  update perfis set pena_seg = greatest(0, pena_seg - passou), pena_marca = now() where id = auth.uid()
    returning pena_seg into passou;
  if passou = 0 then update perfis set fianca = 0 where id = auth.uid(); end if;
  return passou;
end $$;

-- administrador (ou moderador com poder de prender) perdoa sem mandar para a cadeia
create or replace function public.admin_perdoar(alvo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode('prender') then raise exception 'sem permissao'; end if;
  if not pode_agir_em(alvo) then raise exception 'voce nao pode prender esse jogador'; end if;
  update perfis set crimes = 0 where id = alvo;
  perform registrar(alvo, 'perdoar');
end $$;

-- quando a equipe solta alguém, a fiança também zera
create or replace function public.admin_prender(alvo uuid, minutos integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode('prender') then raise exception 'sem permissao'; end if;
  if not pode_agir_em(alvo) then raise exception 'voce nao pode prender esse jogador'; end if;
  if minutos > 0 and cargo_de(alvo) <> 'jogador' then raise exception 'a equipe nao pode ser presa'; end if;
  if minutos < 0 or minutos > 1440 then raise exception 'tempo invalido'; end if;
  update perfis set pena_seg = minutos * 60, pena_marca = now(), algemado = false,
    fianca = case when minutos > 0 then fianca else 0 end, policial = case when minutos > 0 then false else policial end
  where id = alvo;
  perform registrar(alvo, case when minutos > 0 then 'prender' else 'soltar' end, jsonb_build_object('minutos', minutos));
end $$;

do $$
declare f text;
begin
  foreach f in array array['entrar_policia()', 'sair_policia()', 'receber_salario_policia()', 'prender_suspeito(uuid)',
                           'pagar_fianca()', 'cumprir_pena()', 'admin_perdoar(uuid)', 'admin_prender(uuid, integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
