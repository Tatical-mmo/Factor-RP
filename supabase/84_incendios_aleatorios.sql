-- 84 · Incêndios em qualquer lugar do mapa. Rode depois do 83.
-- Antes o fogo só começava em empresas e casas com dono. Agora também pega em:
--   rua (lixo e entulho nas ruas da metrópole), mata (Vila Serra e Porto Sul) e favela (qualquer casa dos morros).
-- Até 3 focos ao mesmo tempo, no máximo 1 novo a cada 4 minutos. Todos veem o mesmo fogo no mesmo lugar
-- (o jogo recebe o aviso do banco na hora, sem esperar a próxima leitura).

alter table public.incendios drop constraint if exists incendios_tipo_check;
alter table public.incendios add constraint incendios_tipo_check check (tipo in ('empresa', 'casa', 'queda', 'veiculo', 'rua', 'mata', 'favela'));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'incendios') then
    alter publication supabase_realtime add table public.incendios;
  end if;
end $$;

create or replace function public.processar_incendios() returns void
language plpgsql security definer set search_path = public as $$
declare f incendios%rowtype; v_dono uuid; alvo record; sorte real; i integer; j integer; x real; z real; s integer;
begin
  -- bombeiros NPC apagam o fogo de 3 minutos; quem tem dono (empresa, casa, casa da favela) paga a taxa
  for f in select * from incendios where status = 'ativo' and inicio < now() - interval '3 minutes' and tipo not in ('queda', 'veiculo') for update skip locked loop
    update incendios set status = 'apagado', apagado_por = null where id = f.id;
    v_dono := null;
    if f.tipo = 'empresa' then
      update empresas set caixa = caixa - least(300, caixa) where id = f.alvo returning dono into v_dono;
    elsif f.tipo in ('casa', 'favela') then
      select c.dono into v_dono from casas c where c.id = f.alvo;
      if v_dono is not null then update perfis set moedas = moedas - least(300, moedas) where id = v_dono; end if;
    end if;
    update prefeitura set cofre = cofre + 300 where id = 1;
    if v_dono is not null then perform avisar(v_dono, format('🚒 Os bombeiros da prefeitura apagaram o fogo na %s. Taxa: 300.', f.nome)); end if;
  end loop;
  -- novo foco
  if (select count(*) from incendios where status = 'ativo' and tipo not in ('queda', 'veiculo')) >= 3 then return; end if;
  if exists (select 1 from incendios where inicio > now() - interval '4 minutes' and tipo not in ('queda', 'veiculo')) then return; end if;
  if random() > 0.45 then return; end if;
  sorte := random();
  if sorte < 0.3 then   -- empresa ou casa com dono (como antes)
    if random() < 0.6 then
      select 'empresa' as tipo, e.id as alvo, e.nome, l.x, l.z, e.dono into alvo
        from unidades u join lotes l on l.id = u.lote join empresas e on e.id = u.empresa
       where not exists (select 1 from incendios k where k.status = 'ativo' and k.tipo = 'empresa' and k.alvo = e.id)
       order by random() limit 1;
    end if;
    if alvo is null then
      select 'casa' as tipo, c.id::bigint as alvo, coalesce(c.rotulo, 'Casa') as nome, c.x, c.z, c.dono into alvo
        from casas c where c.dono is not null and c.pai is null and c.tipo <> 'favela'
         and not exists (select 1 from incendios k where k.status = 'ativo' and k.tipo = 'casa' and k.alvo = c.id)
       order by random() limit 1;
    end if;
  end if;
  if alvo is null and sorte < 0.5 then   -- casa da favela (qualquer uma, com ou sem dono)
    select 'favela' as tipo, c.id::bigint as alvo, coalesce(c.rotulo, 'casa da favela') as nome, c.x, c.z, c.dono into alvo
      from casas c where c.tipo = 'favela'
       and not exists (select 1 from incendios k where k.status = 'ativo' and k.tipo = 'favela' and k.alvo = c.id)
     order by random() limit 1;
  end if;
  if alvo is null and sorte < 0.72 then   -- rua da metrópole: lixo e entulho na beira da rua
    loop
      i := floor(random() * 16)::integer - 6; j := floor(random() * 16)::integer - 6;
      exit when i <> 2 and not (i in (-1, 5) and abs(-81 + 54 * j) < 60);
    end loop;
    if random() < 0.5 then x := -108 + 54 * i + (case when random() < 0.5 then -3.8 else 3.8 end); z := -81 + 54 * j + (random() - 0.5) * 30;
    else z := -108 + 54 * i + (case when random() < 0.5 then -3.8 else 3.8 end); x := -81 + 54 * j + (random() - 0.5) * 30; end if;
    select 'rua' as tipo, 0::bigint as alvo,
      'rua da ' || case when x < -160 then 'Zona Oeste' when x > 160 then 'Zona Leste' when z < -160 then 'Zona Norte' when z > 160 then 'Zona Sul' else 'região central' end as nome,
      x, z, null::uuid as dono into alvo;
  end if;
  if alvo is null then   -- mata: atrás de Vila Serra ou a oeste de Porto Sul
    if random() < 0.65 then
      x := (case when random() < 0.5 then -1 else 1 end) * (160 + random() * 120); z := -(1120 + random() * 200);
      select 'mata' as tipo, 0::bigint as alvo, 'mata de Vila Serra' as nome, x, z, null::uuid as dono into alvo;
    else
      x := -120 - random() * 70; z := 960 + random() * 130;
      select 'mata' as tipo, 0::bigint as alvo, 'mata de Porto Sul' as nome, x, z, null::uuid as dono into alvo;
    end if;
  end if;
  insert into incendios (tipo, alvo, nome, x, z) values (alvo.tipo, alvo.alvo, alvo.nome, alvo.x, alvo.z);
  if alvo.dono is not null then
    perform avisar(alvo.dono, format('🔥 FOGO na %s! Apague você mesmo ou chame os bombeiros (sem ninguém, a prefeitura apaga em 3 min e cobra 300).', alvo.nome));
  end if;
end $$;

-- apagar: casa da favela também pode ser apagada pelo dono
create or replace function public.apagar_incendio(p_incendio bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; f incendios%rowtype; dono_alvo uuid; v integer;
begin
  p := jogador_livre();
  select * into f from incendios where id = p_incendio for update;
  if f.id is null or f.status <> 'ativo' then raise exception 'o fogo ja foi apagado'; end if;
  if f.tipo = 'empresa' then select dono into dono_alvo from empresas where id = f.alvo;
  elsif f.tipo in ('casa', 'favela') then select dono into dono_alvo from casas where id = f.alvo; end if;
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

do $$
begin
  revoke all on function public.apagar_incendio(bigint) from public, anon;
  grant execute on function public.apagar_incendio(bigint) to authenticated;
end $$;
