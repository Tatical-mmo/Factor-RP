-- Correção: territórios sem dono não são mais regravados a cada 15 s.
-- Essa gravação disparava atualizações em tempo real que apagavam o que se digitava na janela de clãs.
create or replace function public.processar_territorios() returns void
language plpgsql security definer set search_path = public as $$
declare t territorios%rowtype; blocos integer;
begin
  for t in select * from territorios where dono_cla is not null for update skip locked loop
    blocos := least(40, floor(extract(epoch from (now() - t.renda_marca)) / 360))::integer;
    if blocos > 0 then
      update clas set caixa = caixa + blocos * 40 where id = t.dono_cla;
      update territorios set renda_marca = renda_marca + make_interval(secs => blocos * 360) where id = t.id;
    end if;
  end loop;
end $$;
