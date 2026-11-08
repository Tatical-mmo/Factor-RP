-- Correção: a produção não regrava mais as fábricas sem robôs a cada minuto.
-- Essas gravações redesenhavam a janela da empresa sem parar (a tela de evolução pulava para o topo).

create or replace function public.produzir_robos() returns void
language plpgsql security definer set search_path = public as $$
declare e empresas%rowtype; ativos integer; seg double precision; n integer; passo double precision;
begin
  for e in select * from empresas where fabrica for update skip locked loop
    ativos := robos_ativos(e);
    if ativos <= 0 then
      -- sem robôs: só acerta a marca de vez em quando (no máximo 10 min de produção acumulada ao comprar o primeiro robô)
      if e.producao_marca < now() - interval '10 minutes' then update empresas set producao_marca = now() - interval '5 minutes' where id = e.id; end if;
      continue;
    end if;
    passo := (case when e.produto = 'robo' then 1200 when eh_veiculo(e.produto) then veiculo(e.produto, 'producao') else 90 end)
             * 100.0 / limite(e.nivel, 'producao') / ativos;
    seg := least(4 * 3600, extract(epoch from (now() - e.producao_marca)));
    n := floor(seg / passo);
    if n > 0 then
      update empresas set estoque = estoque + n,
        producao_marca = greatest(e.producao_marca, now() - interval '4 hours') + make_interval(secs => n * passo)
      where id = e.id;
    end if;
  end loop;
end $$;
revoke all on function public.produzir_robos() from public, anon, authenticated;
