-- Fator RP - roubo de carros de jogador.
-- Qualquer jogador pode arrombar um carro parado de outro (é crime) e sair dirigindo.
-- O dono vê o carro como ROUBADO na janela 🚗 Veículos e pode Bloquear: em 20 s o carro trava,
-- o ladrão é jogado para fora e o carro volta para o dono. Policial que acha o carro roubado devolve (+300).
-- O carro presidencial não pode ser roubado.

alter table public.carros add column if not exists ladrao      uuid references public.perfis (id) on delete set null;
alter table public.carros add column if not exists bloqueio_em timestamptz;

create or replace function public.roubar_carro(p_carro bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c carros%rowtype;
begin
  p := jogador_livre();
  if p.policial or p.prf then raise exception 'policial nao rouba carro'; end if;
  select * into c from carros where id = p_carro for update;
  if c.id is null or c.modelo = 'presidencial' then raise exception 'esse carro nao pode ser roubado'; end if;
  if c.dono = p.id then raise exception 'o carro e seu'; end if;
  if c.ladrao is not null and c.ladrao <> p.id then raise exception 'esse carro ja foi roubado'; end if;
  update carros set ladrao = p.id, bloqueio_em = null where id = c.id;
  update perfis set crimes = crimes + 1 where id = p.id;
  perform avisar(c.dono, format('🚨 Seu carro foi ROUBADO por %s! Use Bloquear na janela 🚗 Veículos.', p.nome));
end $$;

-- estacionar: o dono (sem ladrão) ou o ladrão
create or replace function public.estacionar_carro(p_carro bigint, p_x real, p_z real, p_ang real) returns void
language plpgsql security definer set search_path = public as $$
begin
  update carros set x = greatest(-430, least(430, p_x)), z = greatest(-430, least(430, p_z)), ang = p_ang
    where id = p_carro and ((dono = auth.uid() and ladrao is null) or ladrao = auth.uid());
  if not found then raise exception 'esse carro nao e seu'; end if;
end $$;

create or replace function public.bloquear_carro(p_carro bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare c carros%rowtype;
begin
  select * into c from carros where id = p_carro and dono = auth.uid() for update;
  if c.id is null then raise exception 'esse carro nao e seu'; end if;
  if c.ladrao is null then raise exception 'o carro nao esta roubado'; end if;
  if c.bloqueio_em is null then
    update carros set bloqueio_em = now() + interval '20 seconds' where id = c.id returning * into c;
    insert into comandos (alvo, autor, tipo, dados) values (c.ladrao, auth.uid(), 'bloqueio_carro', jsonb_build_object('carro', c.id, 'segundos', 20));
  end if;
  return greatest(0, ceil(extract(epoch from (c.bloqueio_em - now()))))::integer;
end $$;

-- devolve o carro ao dono: depois do bloqueio (dono ou ladrão chamam) ou na hora por um policial (+300)
create or replace function public.liberar_carro(p_carro bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; c carros%rowtype;
begin
  select * into p from perfis where id = auth.uid();
  select * into c from carros where id = p_carro for update;
  if c.id is null or c.ladrao is null then return 0; end if;
  if p.policial or p.prf then
    if p.id = c.ladrao then raise exception 'sem permissao'; end if;
    update carros set ladrao = null, bloqueio_em = null where id = c.id;
    update perfis set moedas = moedas + 300 where id = p.id;
    perform avisar(c.dono, format('🚓 %s recuperou seu carro roubado.', p.nome));
    return 300;
  end if;
  if p.id not in (c.dono, c.ladrao) or c.bloqueio_em is null or c.bloqueio_em > now() then return 0; end if;
  update carros set ladrao = null, bloqueio_em = null where id = c.id;
  perform avisar(c.dono, '🔒 O bloqueio travou seu carro. Ele é seu de novo.');
  return 1;
end $$;

do $$
declare f text;
begin
  foreach f in array array['roubar_carro(bigint)', 'estacionar_carro(bigint, real, real, real)', 'bloquear_carro(bigint)', 'liberar_carro(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
