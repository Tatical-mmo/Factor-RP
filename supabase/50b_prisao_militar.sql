-- Fator RP - prisão militar: militares que mataram inocentes ou cometeram crimes ficam presos no quartel.
-- Quem prende: militar de patente maior que a do preso, ou o administrador (General Supremo). De 1 a 120 minutos.
-- 0 minutos solta. Rode depois do 50a (o 50a usa a coluna criada aqui no reset; rode os dois).

alter table public.perfis add column if not exists prisao_militar_ate timestamptz;

create or replace function public.prender_militar(p_jogador uuid, p_minutos integer) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare alvo perfis%rowtype; ate timestamptz;
begin
  select * into alvo from perfis where id = p_jogador;
  if alvo.id is null or alvo.profissao is distinct from 'exercito' then raise exception 'ele nao esta no exercito'; end if;
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' and nivel_exercito(auth.uid()) <= nivel_exercito(p_jogador) then
    raise exception 'so patente maior prende';
  end if;
  if p_minutos < 0 or p_minutos > 120 then raise exception 'tempo invalido'; end if;
  ate := case when p_minutos = 0 then null else now() + make_interval(mins => p_minutos) end;
  update perfis set prisao_militar_ate = ate, arma_pesada_ate = case when ate is null then arma_pesada_ate end where id = p_jogador;
  insert into comandos (alvo, autor, tipo, dados) values (p_jogador, auth.uid(), 'aviso', jsonb_build_object('texto',
    case when ate is null then '🎖️ Você foi liberado da prisão militar.' else format('⛓️ Você foi mandado para a PRISÃO MILITAR por %s min.', p_minutos) end));
  perform registrar(p_jogador, 'prisao_militar', jsonb_build_object('minutos', p_minutos));
  return ate;
end $$;

revoke all on function public.prender_militar(uuid, integer) from public, anon;
grant execute on function public.prender_militar(uuid, integer) to authenticated;
