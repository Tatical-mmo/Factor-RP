-- Fator RP - carro novo na concessionária: Clássico V8 (o carro mais caro: 1.000.000 moedas).
-- Conta no limite de 3 veículos por jogador, como os outros. Vender devolve a metade, como os outros.
-- Rode depois do 60.

alter table public.carros drop constraint if exists carros_modelo_check;
alter table public.carros add constraint carros_modelo_check
  check (modelo in ('popular', 'suv', 'esportivo', 'presidencial', 'helicoptero', 'classico'));

create or replace function public.preco_carro(m text) returns integer language sql immutable as $$
  select case m when 'popular' then 40000 when 'suv' then 95000 when 'esportivo' then 180000
                when 'classico' then 1000000 when 'helicoptero' then 1500000 end;
$$;
