-- 22p: a Viação Expresso Fator embarca na baia 11 da mega rodoviária da Metrópole (o terminal antigo saiu).
-- Só muda o ponto de embarque/desembarque da Metrópole; Vila Serra e Porto Sul continuam iguais.
create or replace function public.viacao_ponto(i integer, out x real, out z real) language sql immutable as $$
  select (array[194, 69, 69])[i + 1]::real, (array[-244, -931, 931])[i + 1]::real;
$$;
