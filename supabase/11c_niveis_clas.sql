-- Fator RP - níveis 1 a 15 (parte 3 de 3): clãs.
-- O líder evolui o clã com o caixa do clã. Nos níveis 5, 10 e 15 precisa de um
-- Desbloqueio Corporativo na mochila do líder. Cada nível libera mais membros e robôs.

alter table public.clas add column if not exists nivel integer not null default 1;
alter table public.clas drop constraint if exists clas_nivel_15;
alter table public.clas add constraint clas_nivel_15 check (nivel between 1 and 15);

create or replace function public.limite_cla(p_nivel integer, item text) returns integer
language sql immutable as $$
  select case item
    when 'membros' then 15 + (p_nivel - 1) * 3                 -- 15 a 57
    when 'robos'   then 20 + (p_nivel - 1) * 5                 -- 20 a 90
    when 'evoluir' then case when p_nivel >= 15 then null else 15000 * p_nivel * (p_nivel + 1) / 2 end
  end;
$$;

create or replace function public.cla_evoluir() returns integer
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; custo integer;
begin
  c := cla_do_lider();
  if c.nivel >= 15 then raise exception 'nivel maximo'; end if;
  custo := limite_cla(c.nivel, 'evoluir');
  if (c.nivel + 1) % 5 = 0 then perform gastar_item(auth.uid(), 'desbloqueio', 'precisa de desbloqueio corporativo'); end if;
  update clas set caixa = caixa - custo, nivel = nivel + 1 where id = c.id and caixa >= custo;
  if not found then raise exception 'caixa insuficiente'; end if;
  return c.nivel + 1;
end $$;

create or replace function public.cla_adicionar(p_nome text) returns void
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; alvo perfis%rowtype;
begin
  c := cla_do_lider();
  select * into alvo from perfis where lower(nome) = lower(p_nome);
  if alvo.id is null then raise exception 'jogador nao encontrado'; end if;
  if alvo.policial then raise exception 'policial nao entra em cla'; end if;
  if exists (select 1 from membros_cla where jogador = alvo.id) then raise exception 'jogador ja esta em um cla'; end if;
  if (select count(*) from membros_cla where cla = c.id) >= limite_cla(c.nivel, 'membros') then raise exception 'limite de membros'; end if;
  insert into membros_cla (jogador, cla) values (alvo.id, c.id);
  perform avisar(alvo.id, format('Você entrou no clã %s.', c.nome));
end $$;

-- robôs de combate: compra das fábricas de robôs (8.000) ou de fora (12.000)
create or replace function public.cla_comprar_robo() returns integer
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; total integer; preco integer;
begin
  perform produzir_robos();
  c := cla_do_lider();
  total := c.robos + coalesce((select sum(defesa) from territorios where dono_cla = c.id), 0);
  if total >= limite_cla(c.nivel, 'robos') then raise exception 'limite de robos'; end if;
  preco := preco_robo(null);
  update clas set caixa = caixa - preco, robos = robos + 1 where id = c.id and caixa >= preco;
  if not found then raise exception 'caixa insuficiente'; end if;
  perform entregar_robo(null, preco);
  return c.robos + 1;
end $$;

do $$
declare f text;
begin
  foreach f in array array['cla_evoluir()', 'cla_adicionar(text)', 'cla_comprar_robo()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
