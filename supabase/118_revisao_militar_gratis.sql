-- 118: revisão das aeronaves militares é de graça para os militares (Exército e Aeronáutica) e o admin.
-- O helicóptero do Exército (chave 'exercito') revisa sem pagar; o mecânico jogador continua ganhando 300.
-- Rode depois do 117.
create or replace function public.revisar_heli(p_chave text, p_mecanico boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; h helis_revisao%rowtype;
begin
  p := jogador_livre();
  select * into h from helis_revisao where chave = p_chave for update;
  if h.chave is null or h.voos = 0 then raise exception 'aviao ja revisado'; end if;
  if p_mecanico then
    if p.profissao is distinct from 'mecanico' and p.cargo <> 'admin' then raise exception 'so mecanicos'; end if;
    if h.revisado_em is not null and h.revisado_em > now() - interval '30 seconds' then raise exception 'espere um pouco'; end if;
    update helis_revisao set voos = 0, revisado_em = now(), revisado_por = p.nome where chave = h.chave;
    update perfis set moedas = moedas + 300 where id = p.id;
    return 300;
  end if;
  if (h.chave = 'exercito' or h.chave like 'aeronautica%') and (p.profissao = 'exercito' or p.cargo = 'admin') then
    update helis_revisao set voos = 0, revisado_em = now(), revisado_por = 'Mecânico do Exército' where chave = h.chave;
    return 0;   -- de graça
  end if;
  if p.moedas < 5000 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 5000 where id = p.id;
  update prefeitura set cofre = cofre + 2500 where id = 1;
  update helis_revisao set voos = 0, revisado_em = now(), revisado_por = 'Mecânico do hangar' where chave = h.chave;
  return 5000;
end $$;
grant execute on function public.revisar_heli(text, boolean) to authenticated;
notify pgrst, 'reload schema';
