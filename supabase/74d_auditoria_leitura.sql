-- 74d · Auditoria SÓ DE LEITURA (não muda nada). Rode no SQL Editor do Supabase e mande o resultado.
-- Cada linha é um ponto para conferir; o ideal é a coluna "situacao" vir vazia (sem linhas) nos itens 1 a 4.

-- 1) tabelas sem RLS (qualquer um com a chave pública poderia mexer)
select '1 tabela sem RLS' as item, c.relname as nome, '' as detalhe
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
-- 2) regras que deixam o jogador gravar direto numa tabela (tirando o próprio perfil)
select '2 regra de escrita', tablename, policyname || ' (' || cmd || ')'
  from pg_policies where schemaname = 'public' and cmd <> 'SELECT' and tablename <> 'perfis'
union all
-- 3) permissões de escrita direta dadas a anon/authenticated (tirando posição/fome do próprio perfil)
select '3 escrita direta', table_name, grantee || ': ' || privilege_type || coalesce(' (' || column_name || ')', '')
  from information_schema.column_privileges
 where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE')
   and not (table_name = 'perfis' and column_name in ('pos_x', 'pos_z', 'visto_em', 'fome', 'id', 'nome', 'personagem'))
union all
-- 4) funções que quem não fez login (anon) consegue chamar
select '4 funcao aberta a anon', p.proname, pg_get_function_identity_arguments(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') and p.prokind = 'f'
   and p.proname not in ('vigia')
union all
-- 5) vigia ligada?
select '5 vigia (pre-request)', coalesce((select cfg from pg_db_role_setting s join pg_roles r on r.oid = s.setrole, unnest(s.setconfig) cfg
                                          where r.rolname = 'authenticator' and cfg like 'pgrst.db_pre_request%' limit 1), 'DESLIGADA'), ''
union all
select '6 seguranca', 'ligado=' || ligado || ' assinatura=' || exigir_assinatura, 'max/s=' || max_por_segundo from public.seguranca
order by 1, 2;
