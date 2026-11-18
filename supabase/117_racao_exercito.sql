-- 117: militares do Exército em serviço também pegam rações (jujubas e anti-ácido) no Quartel.
-- Saem direto da produção do Exército (não gastam o depósito das corporações); 5 de cada vez, com a mesma espera
-- de 5 min por produto. Rode depois do 116.
create or replace function public.pegar_racao(p_produto text) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c text; n integer; exercito boolean;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  c := corp_racao(p);
  exercito := c is null and (p.profissao = 'exercito' or p.cargo = 'admin');
  if c is null and not exercito then raise exception 'so policia prf bope bombeiros e exercito'; end if;
  if p_produto = 'antiacido' then
    if p.antiacido_pegou is not null and p.antiacido_pegou > now() - interval '5 minutes' then raise exception 'aguarde para pegar anti-acido'; end if;
    if exercito then n := 5;
    else
      select least(5, antiacido) into n from jujuba_armazens where corp = c for update;
      if coalesce(n, 0) <= 0 then raise exception 'deposito sem anti-acido'; end if;
      update jujuba_armazens set antiacido = antiacido - n where corp = c;
    end if;
    update perfis set antiacido_pegou = now() where id = p.id;
  elsif p_produto = 'jujuba' then
    if p.jujuba_pegou is not null and p.jujuba_pegou > now() - interval '5 minutes' then raise exception 'aguarde para pegar jujubas'; end if;
    if exercito then n := 5;
    else
      select least(5, estoque) into n from jujuba_armazens where corp = c for update;
      if coalesce(n, 0) <= 0 then raise exception 'armazem vazio'; end if;
      update jujuba_armazens set estoque = estoque - n where corp = c;
    end if;
    update perfis set jujuba_pegou = now() where id = p.id;
  else raise exception 'produto invalido'; end if;
  perform dar_item(p.id, p_produto, n);
  return n;
end $$;
grant execute on function public.pegar_racao(text) to authenticated;
notify pgrst, 'reload schema';
