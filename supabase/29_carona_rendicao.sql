-- Fator RP - carona com robô motorista e rendição no roubo.
-- Vans e caminhões não são mais dirigidos à mão: o robô motorista leva o dono aonde ele pedir.
-- No roubo, o ladrão rende o motorista, que leva a carga até o território do clã ou a casa dele.
-- Ao descarregar, o robô volta com o veículo para a garagem do dono.
-- Quem não tem território nem casa descarrega onde estiver (a carga vai para a mochila).

create or replace function public.descarregar_roubo(p_caminhao bigint, p_x real, p_z real) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c caminhoes%rowtype; cla_id bigint; item text; ok boolean; tem_lugar boolean;
begin
  p := jogador_livre();
  select * into c from caminhoes where id = p_caminhao for update;
  if c.id is null or c.status <> 'dirigido' or c.motorista is distinct from p.id or not c.sequestrado then raise exception 'voce nao esta nesse veiculo'; end if;
  if c.carga <= 0 then raise exception 'o veiculo esta vazio'; end if;
  select cla into cla_id from membros_cla where jogador = p.id;
  tem_lugar := exists (select 1 from territorios t where cla_id is not null and t.dono_cla = cla_id)
            or exists (select 1 from casas h where h.dono = p.id or h.inquilino = p.id);
  ok := not tem_lugar
     or exists (select 1 from territorios t where cla_id is not null and t.dono_cla = cla_id and abs(t.x - p_x) < 32 and abs(t.z - p_z) < 32)
     or exists (select 1 from casas h where (h.dono = p.id or h.inquilino = p.id) and abs(h.x - p_x) < 25 and abs(h.z - p_z) < 25);
  if not ok then raise exception 'descarregue num territorio do seu cla ou na sua casa'; end if;
  item := coalesce(c.rota ->> 'produto', 'chocolate');
  if cla_id is not null then
    execute format('update clas set %I = %I + $1 where id = $2', item, item) using c.carga, cla_id;
  else
    perform dar_item(p.id, item, c.carga);
  end if;
  perform veiculo_na_garagem(c.id);
  perform avisar((select dono from empresas where id = c.empresa), format('O ladrão %s descarregou a carga roubada. O robô voltou com o veículo para a garagem.', p.nome));
  return c.carga;
end $$;
