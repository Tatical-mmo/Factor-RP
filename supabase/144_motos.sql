-- 144: motos (250 cc e 650 cc na concessionária) e personagens de evento "Renegado Neon", "Sentinela Neon" e
-- "Sentinela Brasa" (só no baú da caça ao tesouro ou presente do admin). Rode depois do 143.
alter table public.carros drop constraint if exists carros_modelo_check;
alter table public.carros add constraint carros_modelo_check
  check (modelo in ('popular', 'suv', 'esportivo', 'presidencial', 'helicoptero', 'classico', 'saveiro', 'saveiro_som',
                    'onibus_rod_dourado', 'onibus_rod_vermelho', 'onibus_rod_branco', 'onibus_rod_amarelo', 'moto_250', 'moto_650'));
create or replace function public.preco_carro(m text) returns integer language sql immutable as $$
  select case m when 'popular' then 40000 when 'suv' then 95000 when 'esportivo' then 180000
                when 'classico' then 1000000 when 'helicoptero' then 1500000
                when 'saveiro' then 55000 when 'saveiro_som' then 150000
                when 'moto_250' then 18000 when 'moto_650' then 85000 end;
$$;
insert into public.personagens_evento (id, nome, preco) values
  ('Renegado_Neon', 'Renegado Neon', 999999),
  ('Sentinela_Neon', 'Sentinela Neon', 999999),
  ('Sentinela_Brasa', 'Sentinela Brasa', 999999)
on conflict (id) do update set nome = excluded.nome;
create or replace function public.peste_sem_vitrine() returns trigger language plpgsql as $$
begin
  if new.id in ('Doutor_Peste', 'Agente_Secreta', 'Sentinela_Obsidiana', 'Torcedor_Organizado', 'Intruso_Mascarado', 'Androide_Moletom', 'Bandido_Balaclava',
                'Ciborgue_Futuro', 'Dragao_Azul', 'Rapaz_Jaqueta', 'Urbano_Tranquilo', 'Forca_Estilo', 'Cara_Regata', 'Soldado_Experiente', 'Parceiro_Bairro',
                'Soldado_Deserto', 'Operador_Tatico', 'Vigia_Sombras', 'Operador_Antigas', 'Renegado_Neon', 'Sentinela_Neon', 'Sentinela_Brasa')
  then new.liberado_ate := null; end if;
  return new;
end $$;
update public.personagens_evento set liberado_ate = null where id in ('Renegado_Neon', 'Sentinela_Neon', 'Sentinela_Brasa');
notify pgrst, 'reload schema';
