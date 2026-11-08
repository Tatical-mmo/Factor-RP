-- Fator RP - carros mais caros e bombeiros NPC.
-- Carros: Popular 40.000, SUV 95.000, Esportivo 180.000 (a venda devolve metade).
-- Incêndios: se nenhum jogador apagar em 3 minutos, o caminhão dos bombeiros da prefeitura (NPC) apaga.
-- O dono do imóvel paga a taxa dos bombeiros (até 300) para o cofre da prefeitura. Nada mais queima.

create or replace function public.preco_carro(m text) returns integer language sql immutable as $$
  select case m when 'popular' then 40000 when 'suv' then 95000 when 'esportivo' then 180000 end;
$$;

create or replace function public.processar_incendios() returns void
language plpgsql security definer set search_path = public as $$
declare f incendios%rowtype; taxa integer; v_dono uuid; alvo record;
begin
  -- bombeiros NPC apagam o fogo de 3 minutos e cobram a taxa do dono
  for f in select * from incendios where status = 'ativo' and inicio < now() - interval '3 minutes' for update skip locked loop
    update incendios set status = 'apagado', apagado_por = null where id = f.id;
    if f.tipo = 'empresa' then
      update empresas set caixa = caixa - least(300, caixa) where id = f.alvo returning dono into v_dono;
    else
      select c.dono into v_dono from casas c where c.id = f.alvo;
      if v_dono is not null then update perfis set moedas = moedas - least(300, moedas) where id = v_dono; end if;
    end if;
    update prefeitura set cofre = cofre + 300 where id = 1;
    if v_dono is not null then perform avisar(v_dono, format('🚒 Os bombeiros da prefeitura apagaram o fogo na %s. Taxa: 300.', f.nome)); end if;
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
  perform avisar(alvo.dono, format('🔥 FOGO na %s! Apague você mesmo ou chame os bombeiros (sem ninguém, a prefeitura apaga em 3 min e cobra 300).', alvo.nome));
end $$;
