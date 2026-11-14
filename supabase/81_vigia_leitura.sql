-- 81 · Correção da vigia (anti-trapaça do 74a). Rode depois do 80.
-- Problema: o PostgREST roda as funções STABLE (consultas) numa transação só de leitura, mesmo quando o
-- jogo chama por POST (/rpc). A vigia só pulava GET/HEAD e tentava gravar o contador de ritmo, dando
-- "cannot execute INSERT in a read-only transaction". Isso quebrava, entre outras:
--   alistamentos_pendentes (guarita: aprovar alistados), admin_carreiras (painel: promover em qualquer emprego),
--   membros_exercito (General Supremo: promoções), minhas_carreiras, ficha_militar, meus_amigos, ranking…
-- Agora a vigia pula a parte que grava sempre que a transação for só de leitura (assinatura continua conferida).

create or replace function public.vigia() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cfg seguranca%rowtype; h json; metodo text; caminho text; r ritmo%rowtype; seg timestamptz;
begin
  if uid is null then return; end if;                       -- antes do login
  select * into cfg from seguranca where id = 1;
  if cfg.id is null or not cfg.ligado then return; end if;
  metodo := coalesce(current_setting('request.method', true), '');
  caminho := coalesce(current_setting('request.path', true), '');
  if cfg.exigir_assinatura then
    begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
    if coalesce(h ->> 'x-fator', '') <> all (cfg.assinaturas) then raise exception 'atualize o jogo'; end if;
  end if;
  if metodo = 'GET' or metodo = 'HEAD' then return; end if;
  -- consulta (função STABLE): o PostgREST abre a transação só de leitura, então não dá para gravar o ritmo
  if current_setting('transaction_read_only', true) = 'on' then return; end if;
  if exists (select 1 from perfis where id = uid and banido) then raise exception 'conta banida'; end if;
  seg := date_trunc('second', clock_timestamp());
  insert into ritmo as rt (jogador, janela, n) values (uid, seg, 1)
    on conflict (jogador) do update set n = case when rt.janela = excluded.janela then rt.n + 1 else 1 end, janela = excluded.janela
    returning * into r;
  if r.n = cfg.max_por_segundo + 1 then perform registrar_falta(uid, 'pedidos rápidos demais', jsonb_build_object('caminho', caminho), 1); end if;
  if r.n > cfg.max_por_segundo * 2 then raise exception 'devagar'; end if;
end $$;

notify pgrst, 'reload config';
