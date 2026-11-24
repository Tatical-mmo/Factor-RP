-- 155: medidas das lanternas desenhadas dos ônibus (22e). Rode depois do 154.
-- Cada modelo de ônibus guarda a lanterna que usa (desenho) e onde ela fica: altura, lateral, fundo, largura,
-- tamanho e ângulo da quina. Todos leem; só o administrador muda (aba Lanternas no painel do admin).
create table if not exists public.lanternas_onibus (
  modelo text primary key,
  cfg jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.lanternas_onibus enable row level security;
drop policy if exists lanternas_ler on public.lanternas_onibus;
create policy lanternas_ler on public.lanternas_onibus for select to authenticated using (true);
grant select on public.lanternas_onibus to authenticated;

create or replace function public.admin_salvar_lanterna(p_modelo text, p_cfg jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select cargo from perfis where id = auth.uid()) is distinct from 'admin' then raise exception 'so o administrador'; end if;
  if p_modelo !~ '^[a-z0-9_]{2,40}$' then raise exception 'modelo invalido'; end if;
  if p_cfg is null then delete from lanternas_onibus where modelo = p_modelo; return; end if;
  if jsonb_typeof(p_cfg) <> 'object' or length(p_cfg::text) > 2000 then raise exception 'medida invalida'; end if;
  insert into lanternas_onibus (modelo, cfg) values (p_modelo, p_cfg)
    on conflict (modelo) do update set cfg = excluded.cfg, atualizado_em = now();
end $$;

revoke all on function public.admin_salvar_lanterna(text, jsonb) from public, anon;
grant execute on function public.admin_salvar_lanterna(text, jsonb) to authenticated;
notify pgrst, 'reload schema';
