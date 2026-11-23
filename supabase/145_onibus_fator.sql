-- 145: frota nova da Fator RP (21r). A Viação vende os mesmos ônibus das linhas: 3 urbanos e 7 rodoviários
-- (02, 04 e 06 são novos). Os preços que o dono já definiu continuam; os novos entram com um valor inicial.
-- Rode depois do 144.
alter table public.carros drop constraint if exists carros_modelo_check;
alter table public.carros add constraint carros_modelo_check
  check (modelo in ('popular', 'suv', 'esportivo', 'presidencial', 'helicoptero', 'classico', 'saveiro', 'saveiro_som',
                    'onibus_rod_dourado', 'onibus_rod_vermelho', 'onibus_rod_branco', 'onibus_rod_amarelo',
                    'onibus_rod_02', 'onibus_rod_04', 'onibus_rod_06',
                    'onibus_amarelo', 'onibus_branco', 'onibus_laranja', 'moto_250', 'moto_650'));
update public.viacao_config
   set precos = '{"onibus_amarelo": 250000, "onibus_branco": 250000, "onibus_laranja": 270000,
                  "onibus_rod_02": 430000, "onibus_rod_04": 430000, "onibus_rod_06": 520000}'::jsonb || precos
 where id = 1;
