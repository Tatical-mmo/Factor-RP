-- 134: mais um personagem "só no baú" (caça ao tesouro ou presente do admin). Rode depois do 133.
insert into public.personagens_evento (id, nome, preco) values ('Cara_Regata', 'Cara de Regata', 999999)
on conflict (id) do update set nome = excluded.nome;
create or replace function public.peste_sem_vitrine() returns trigger language plpgsql as $$
begin
  if new.id in ('Doutor_Peste', 'Agente_Secreta', 'Sentinela_Obsidiana', 'Torcedor_Organizado', 'Intruso_Mascarado', 'Androide_Moletom', 'Bandido_Balaclava',
                'Ciborgue_Futuro', 'Dragao_Azul', 'Rapaz_Jaqueta', 'Urbano_Tranquilo', 'Forca_Estilo', 'Cara_Regata')
  then new.liberado_ate := null; end if;
  return new;
end $$;
update public.personagens_evento set liberado_ate = null where id = 'Cara_Regata';
notify pgrst, 'reload schema';
