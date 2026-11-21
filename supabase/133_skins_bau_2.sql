-- 133: mais cinco personagens "só no baú" (caça ao tesouro ou presente do admin). Rode depois do 132.
insert into public.personagens_evento (id, nome, preco) values
  ('Ciborgue_Futuro', 'Ciborgue do Futuro', 999999), ('Dragao_Azul', 'Filhote de Dragão Azul', 999999),
  ('Rapaz_Jaqueta', 'Rapaz de Jaqueta', 999999), ('Urbano_Tranquilo', 'Urbano Tranquilo', 999999), ('Forca_Estilo', 'Força com Estilo', 999999)
on conflict (id) do update set nome = excluded.nome;
-- a vitrine nunca abre para os limitados "só de presente / só no baú"
create or replace function public.peste_sem_vitrine() returns trigger language plpgsql as $$
begin
  if new.id in ('Doutor_Peste', 'Agente_Secreta', 'Sentinela_Obsidiana', 'Torcedor_Organizado', 'Intruso_Mascarado', 'Androide_Moletom', 'Bandido_Balaclava',
                'Ciborgue_Futuro', 'Dragao_Azul', 'Rapaz_Jaqueta', 'Urbano_Tranquilo', 'Forca_Estilo')
  then new.liberado_ate := null; end if;
  return new;
end $$;
update public.personagens_evento set liberado_ate = null where id in ('Ciborgue_Futuro', 'Dragao_Azul', 'Rapaz_Jaqueta', 'Urbano_Tranquilo', 'Forca_Estilo');
notify pgrst, 'reload schema';
