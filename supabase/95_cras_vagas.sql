-- 95 · CRAS com vagas por mandato (rode depois do 93c).
-- • 20 vagas por mandato do prefeito. A atendente (NPC) do CRAS faz a inscrição; acabou, ela avisa que acabaram as vagas.
-- • Todo inscrito recebe a doação a cada ciclo enquanto durar o mandato. Mandato novo: as vagas zeram e abrem de novo.
-- • Programa descontinuado: as inscrições fecham (e somem) até alguém retomar o programa.
alter table public.cras_cadastros add column if not exists mandato integer;
update public.cras_cadastros set mandato = (select mandato from prefeitura where id = 1) where mandato is null;

create or replace function public.cras_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare pf prefeitura%rowtype; o obras%rowtype;
begin
  select * into pf from prefeitura where id = 1;
  select * into o from obras where tipo = 'cras';
  delete from cras_cadastros where mandato is distinct from pf.mandato;
  return jsonb_build_object(
    'existe', o.id is not null, 'status', o.status, 'vagas', 20,
    'inscritos', (select count(*) from cras_cadastros),
    'inscrito', exists (select 1 from cras_cadastros where jogador = auth.uid()),
    'valor', pf.valor_cras, 'mandato', pf.mandato);
end $$;

create or replace function public.cras_cadastrar() returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; pf prefeitura%rowtype; n integer;
begin
  p := jogador_livre();
  if not exists (select 1 from obras where tipo = 'cras' and status = 'ativa') then raise exception 'o cras nao esta funcionando'; end if;
  select * into pf from prefeitura where id = 1;
  delete from cras_cadastros where mandato is distinct from pf.mandato;
  if exists (select 1 from cras_cadastros where jogador = p.id) then raise exception 'voce ja esta cadastrado'; end if;
  perform 1 from cras_cadastros for update;   -- uma inscrição por vez (não passa de 20)
  select count(*) into n from cras_cadastros;
  if n >= 20 then raise exception 'acabaram as vagas do cras'; end if;
  insert into cras_cadastros (jogador, mandato) values (p.id, pf.mandato);
  return n + 1;
end $$;

-- descontinuar o CRAS fecha as inscrições
create or replace function public.cras_fechar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'cras' and new.status = 'descontinuada' and old.status is distinct from 'descontinuada' then delete from cras_cadastros; end if;
  return new;
end $$;
drop trigger if exists cras_fechar on public.obras;
create trigger cras_fechar after update on public.obras for each row execute function public.cras_fechar();

-- processamento: o CRAS paga todos os inscritos do mandato (até 20), não mais um sorteio
create or replace function public.processar_obras() returns void
language plpgsql security definer set search_path = public as $$
declare o obras%rowtype; agora integer := ciclo_atual(); pf prefeitura%rowtype; c camara%rowtype; v integer; n integer; r record;
begin
  update obras set status = 'ativa', pago_ciclo = agora where status = 'construindo' and pronta_ciclo <= agora;
  for o in select * from obras where status = 'ativa' and pago_ciclo < agora for update skip locked loop
    update obras set pago_ciclo = agora where id = o.id;
    select * into pf from prefeitura where id = 1 for update;
    perform set_config('fator.gasto', '1', true);
    if o.tipo = 'varredores' then
      v := 3000;
      if pf.cofre >= v then
        update prefeitura set cofre = cofre - v where id = 1;
        perform registrar_mov('programa', 'Varredores de rua: pagamento da empresa Limpa Rua (NPC)', v, false, 'Empresa Limpa Rua', false);
      end if;
    elsif o.tipo = 'cras' then
      delete from cras_cadastros where mandato is distinct from pf.mandato;
      n := 0;
      for r in select jogador from cras_cadastros order by criado limit 20 loop
        exit when pf.cofre - (n + 1) * pf.valor_cras < 0;
        update perfis set moedas = moedas + pf.valor_cras where id = r.jogador;
        perform avisar(r.jogador, format('🤝 CRAS: você recebeu %s moedas da prefeitura.', pf.valor_cras));
        n := n + 1;
      end loop;
      if n > 0 then
        update prefeitura set cofre = cofre - n * pf.valor_cras where id = 1;
        perform registrar_mov('programa', format('CRAS: doação para %s inscritos (%s cada)', n, pf.valor_cras), n * pf.valor_cras, false, format('%s jogadores do CRAS', n), false);
      end if;
    elsif o.tipo = 'camara' then
      select * into c from camara where id = 1 for update;
      if c.fase = 'parada' or (c.fase = 'mandato' and c.fase_ate <= agora) then
        update vereadores set eleito = false where eleito;
        update camara set legislatura = legislatura + 1, fase = 'candidatura', fase_ate = agora + 1 where id = 1;
      elsif c.fase = 'candidatura' and c.fase_ate <= agora then
        update camara set fase = 'votacao', fase_ate = agora + 1 where id = 1;
      elsif c.fase = 'votacao' and c.fase_ate <= agora then
        update vereadores set eleito = true where legislatura = c.legislatura and jogador in
          (select jogador from vereadores where legislatura = c.legislatura and votos > 0 order by votos desc, jogador limit 10);
        update camara set fase = 'mandato', fase_ate = agora + 40 where id = 1;
        perform avisar(jogador, '🏛️ Você foi eleito VEREADOR! Mandato de 40 ciclos, com salário pago pela prefeitura.') from vereadores where legislatura = c.legislatura and eleito;
      elsif c.fase = 'mandato' then
        select count(*) into n from vereadores where legislatura = c.legislatura and eleito;
        if n > 0 and pf.salario_vereador > 0 and pf.cofre >= n * pf.salario_vereador then
          update perfis set moedas = moedas + pf.salario_vereador where id in (select jogador from vereadores where legislatura = c.legislatura and eleito);
          update prefeitura set cofre = cofre - n * pf.salario_vereador where id = 1;
          perform registrar_mov('programa', format('Câmara: salário de %s vereadores (%s cada)', n, pf.salario_vereador), n * pf.salario_vereador, false, format('%s vereadores', n), false);
        end if;
      end if;
    end if;
  end loop;
end $$;

do $$
begin
  revoke all on function public.cras_estado() from public, anon;
  grant execute on function public.cras_estado() to authenticated;
  revoke all on function public.cras_cadastrar() from public, anon;
  grant execute on function public.cras_cadastrar() to authenticated;
  revoke all on function public.cras_fechar() from public, anon, authenticated;
end $$;
