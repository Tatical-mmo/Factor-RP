-- Fator RP - etapa 7 (parte 1 de 2): clãs (membros, caixa, estoque roubado, robôs).
-- Rode as partes em ordem, cada uma numa consulta limpa.

create or replace function public.meu_cla() returns public.clas
language sql stable security definer set search_path = public as $$
  select c.* from membros_cla m join clas c on c.id = m.cla where m.jogador = auth.uid();
$$;

create or replace function public.cla_do_lider() returns public.clas
language plpgsql stable security definer set search_path = public as $$
declare c clas%rowtype;
begin
  select * into c from clas where lider = auth.uid();
  if c.id is null then raise exception 'voce nao e lider de cla'; end if;
  return c;
end $$;

-- fundar clã: 5.000 moedas
create or replace function public.criar_cla(p_nome text, p_cor text) returns bigint
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; novo bigint;
begin
  p := jogador_livre();
  select * into p from perfis where id = p.id for update;
  if p.policial then raise exception 'policial nao entra em cla'; end if;
  if exists (select 1 from membros_cla where jogador = p.id) then raise exception 'voce ja esta em um cla'; end if;
  if p_nome !~ '^[[:alnum:] _.&-]{3,20}$' then raise exception 'nome invalido'; end if;
  if exists (select 1 from clas where lower(nome) = lower(p_nome)) then raise exception 'nome de cla em uso'; end if;
  if coalesce(p_cor, '') !~ '^#[0-9a-fA-F]{6}$' then p_cor := '#c43b3b'; end if;
  if p.moedas < 5000 then raise exception 'moedas insuficientes'; end if;
  update perfis set moedas = moedas - 5000 where id = p.id;
  insert into clas (nome, cor, lider) values (p_nome, p_cor, p.id) returning id into novo;
  insert into membros_cla (jogador, cla) values (p.id, novo);
  return novo;
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
  if (select count(*) from membros_cla where cla = c.id) >= 15 then raise exception 'limite de membros'; end if;
  insert into membros_cla (jogador, cla) values (alvo.id, c.id);
  perform avisar(alvo.id, format('Você entrou no clã %s.', c.nome));
end $$;

create or replace function public.cla_expulsar(p_jogador uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype;
begin
  c := cla_do_lider();
  if p_jogador = c.lider then raise exception 'o lider nao pode se expulsar'; end if;
  delete from membros_cla where jogador = p_jogador and cla = c.id;
  if not found then raise exception 'jogador nao e do seu cla'; end if;
  perform avisar(p_jogador, format('Você foi expulso do clã %s.', c.nome));
end $$;

-- sair: se o líder sai, o membro mais antigo assume; se ninguém sobra, o clã acaba
create or replace function public.cla_sair() returns void
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; novo uuid;
begin
  c := meu_cla();
  if c.id is null then return; end if;
  delete from membros_cla where jogador = auth.uid();
  if c.lider = auth.uid() then
    select jogador into novo from membros_cla where cla = c.id order by desde limit 1;
    if novo is null then delete from clas where id = c.id;
    else update clas set lider = novo where id = c.id; perform avisar(novo, format('Você agora lidera o clã %s.', c.nome));
    end if;
  end if;
end $$;

create or replace function public.cla_depositar(valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; novo integer;
begin
  c := meu_cla();
  if c.id is null then raise exception 'voce nao esta em um cla'; end if;
  if valor < 1 then raise exception 'valor invalido'; end if;
  update perfis set moedas = moedas - valor where id = auth.uid() and moedas >= valor;
  if not found then raise exception 'moedas insuficientes'; end if;
  update clas set caixa = caixa + valor where id = c.id returning caixa into novo;
  return novo;
end $$;

create or replace function public.cla_sacar(valor integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; novo integer;
begin
  c := cla_do_lider();
  if valor < 1 then raise exception 'valor invalido'; end if;
  update clas set caixa = caixa - valor where id = c.id and caixa >= valor returning caixa into novo;
  if novo is null then raise exception 'caixa insuficiente'; end if;
  update perfis set moedas = moedas + valor where id = auth.uid();
  return novo;
end $$;

-- robôs de combate do clã: 8.000 do caixa, até 20
create or replace function public.cla_comprar_robo() returns integer
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; total integer;
begin
  c := cla_do_lider();
  total := c.robos + coalesce((select sum(defesa) from territorios where dono_cla = c.id), 0);
  if total >= 20 then raise exception 'limite de robos'; end if;
  update clas set caixa = caixa - 8000, robos = robos + 1 where id = c.id and caixa >= 8000;
  if not found then raise exception 'caixa insuficiente'; end if;
  return c.robos + 1;
end $$;

-- estoque roubado: membros retiram para a mochila; o líder vende para o caixa do clã
create or replace function public.cla_retirar(p_item text, p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; n integer;
begin
  c := meu_cla();
  if c.id is null then raise exception 'voce nao esta em um cla'; end if;
  if p_item not in ('chocolate', 'remedio') or p_qtd < 1 then raise exception 'quantidade invalida'; end if;
  execute format('update clas set %I = %I - $1 where id = $2 and %I >= $1', p_item, p_item, p_item) using p_qtd, c.id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'itens insuficientes'; end if;
  return dar_item(auth.uid(), p_item, p_qtd);
end $$;

create or replace function public.cla_vender(p_item text, p_qtd integer) returns integer
language plpgsql security definer set search_path = public as $$
declare c clas%rowtype; preco integer; n integer;
begin
  c := cla_do_lider();
  if p_item not in ('chocolate', 'remedio') or p_qtd < 1 then raise exception 'quantidade invalida'; end if;
  select venda into preco from precos where item = p_item;
  execute format('update clas set %I = %I - $1, caixa = caixa + $1 * $3 where id = $2 and %I >= $1', p_item, p_item, p_item)
    using p_qtd, c.id, preco;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'itens insuficientes'; end if;
  return p_qtd * preco;
end $$;
