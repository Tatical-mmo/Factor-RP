-- 102: preferências do jogador guardadas na conta (gráfico, câmera, tutorial visto).
-- O navegador do celular às vezes apaga o armazenamento local; com isso o jogo lembra em qualquer aparelho.
alter table public.perfis add column if not exists prefs jsonb not null default '{}'::jsonb;
grant update (prefs) on public.perfis to authenticated;
notify pgrst, 'reload schema';
