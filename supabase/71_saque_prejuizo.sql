-- 71 · Saque em qualquer lugar e prejuízo do veículo queimado.
-- Saque: a carga do veículo sequestrado é descarregada onde o ladrão parar (vai para o estoque do clã ou a mochila).
-- Prejuízo: veículo de empresa que queimou (fogo de mais de 90 s) volta para a garagem, mas a empresa paga 8.000 de conserto.

create or replace function public.descarregar_roubo(p_caminhao bigint, p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c caminhoes%rowtype; cla_id bigint; item text;
begin
  p := jogador_livre();
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null or c.status <> 'dirigido' or c.motorista is distinct from p.id or not c.sequestrado then raise exception 'voce nao esta nesse veiculo'; end if;
  if c.carga <= 0 then raise exception 'o veiculo esta vazio'; end if;
  select cla into cla_id from membros_cla where jogador = p.id;
  item := coalesce(c.rota ->> 'produto', 'chocolate');
  if cla_id is not null then
    execute format('update clas set %I = %I + $1 where id = $2', item, item) using c.carga, cla_id;
  else
    perform dar_item(p.id, item, c.carga);
  end if;
  perform veiculo_na_garagem(c.id);
  perform avisar((select dono from empresas where id = c.empresa), format('O ladrão %s saqueou a carga roubada. O robô voltou com o veículo para a garagem.', p.nome));
  return c.carga;
end $$;


create or replace function public.processar_caminhoes() returns integer
language plpgsql security definer set search_path = public as $$
declare c caminhoes%rowtype; n integer := 0; v_dono uuid;
begin
  for c in select * from caminhoes where status = 'em_rota' and not roubado and chegada <= now() for update skip locked loop
    if c.pedido is not null then perform registrar_entrega(c.pedido, c.carga); end if;
    update caminhoes set status = 'voltando', carga = 0 where id = c.id;
    n := n + 1;
  end loop;
  update caminhoes set status = 'parado', pedido = null, partida = null, chegada = null, retorno = null, rota = null,
    roubado = false, escolta = false, vida = 100
    where status = 'voltando' and retorno <= now();
  for c in select * from caminhoes where status = 'dirigido'
             and (coalesce(ativo_em, now() - interval '1 hour') < now() - case when sequestrado then interval '7 minutes' else interval '5 minutes' end
                  or bloqueio_em <= now()) for update skip locked loop
    perform veiculo_na_garagem(c.id);
    if c.sequestrado then
      select dono into v_dono from empresas where id = c.empresa;
      -- queimou (fogo neste veículo há mais de 90 s, nos últimos 30 min): conserto por conta da empresa
      if exists (select 1 from incendios i where i.ref = 'cam:' || c.id and i.tipo = 'veiculo'
                   and i.inicio between now() - interval '30 minutes' and now() - interval '90 seconds') then
        update empresas set caixa = caixa - least(8000, greatest(caixa, 0)) where id = c.empresa;
        perform avisar(v_dono, 'Seu veículo roubado foi incendiado e voltou queimado para a garagem. Conserto: 8.000 do caixa da empresa.');
      else
        perform avisar(v_dono, 'Seu veículo roubado voltou para a garagem.');
      end if;
    end if;
  end loop;
  perform produzir_robos();
  return n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['descarregar_roubo(bigint, real, real)', 'processar_caminhoes()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
