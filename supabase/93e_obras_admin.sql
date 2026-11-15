-- 93e · Administrador: terminar a obra na hora e avançar a fase da Câmara (para testar sem esperar os ciclos).
create or replace function public.admin_terminar_obra(p_obra bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exige_admin();
  update obras set pronta_ciclo = ciclo_atual(), status = 'ativa', pago_ciclo = ciclo_atual() - 1 where id = p_obra and status = 'construindo';
  if not found then raise exception 'essa obra nao esta em construcao'; end if;
  perform processar_obras();
end $$;
create or replace function public.admin_avancar_camara() returns text
language plpgsql security definer set search_path = public as $$
declare c camara%rowtype;
begin
  perform exige_admin();
  if not exists (select 1 from obras where tipo = 'camara' and status = 'ativa') then raise exception 'a camara nao esta funcionando'; end if;
  update camara set fase_ate = ciclo_atual() where id = 1;
  update obras set pago_ciclo = ciclo_atual() - 1 where tipo = 'camara';
  perform processar_obras();
  select * into c from camara where id = 1;
  return c.fase;
end $$;
do $$
declare f text;
begin
  foreach f in array array['admin_terminar_obra(bigint)', 'admin_avancar_camara()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
