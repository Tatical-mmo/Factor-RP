-- 141: personagens de evento "Soldado do Deserto", "Operador Tático", "Vigia das Sombras" e "Operador Antigás"
-- (só no baú da caça ao tesouro ou presente do admin). Rode depois do 140.
insert into public.personagens_evento (id, nome, preco) values
  ('Soldado_Deserto', 'Soldado do Deserto', 999999),
  ('Operador_Tatico', 'Operador Tático', 999999),
  ('Vigia_Sombras', 'Vigia das Sombras', 999999),
  ('Operador_Antigas', 'Operador Antigás', 999999)
on conflict (id) do update set nome = excluded.nome;
create or replace function public.peste_sem_vitrine() returns trigger language plpgsql as $$
begin
  if new.id in ('Doutor_Peste', 'Agente_Secreta', 'Sentinela_Obsidiana', 'Torcedor_Organizado', 'Intruso_Mascarado', 'Androide_Moletom', 'Bandido_Balaclava',
                'Ciborgue_Futuro', 'Dragao_Azul', 'Rapaz_Jaqueta', 'Urbano_Tranquilo', 'Forca_Estilo', 'Cara_Regata', 'Soldado_Experiente', 'Parceiro_Bairro',
                'Soldado_Deserto', 'Operador_Tatico', 'Vigia_Sombras', 'Operador_Antigas')
  then new.liberado_ate := null; end if;
  return new;
end $$;
update public.personagens_evento set liberado_ate = null where id in ('Soldado_Deserto', 'Operador_Tatico', 'Vigia_Sombras', 'Operador_Antigas');
notify pgrst, 'reload schema';
