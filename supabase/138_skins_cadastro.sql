-- 138: confere o cadastro de todas as skins que o jogo mostra (corrige "skin inválida" no painel da equipe).
-- Só acrescenta o que faltar: não apaga nada e não muda preço, grátis ou vitrine das que já existem. Pode rodar mais de uma vez.

insert into public.personagens_jogo (id, gratis) values
  ('Jovem_Cidade', true),
  ('Moca_Academia', true),
  ('Grandalhao', false),
  ('Moca_Trancas', true),
  ('Torcedor', true),
  ('Moradora', true),
  ('Pai_Familia', true),
  ('Vovo', false),
  ('Mecanico', false),
  ('Executiva', false),
  ('Fisiculturista', false),
  ('Enfermeiro', false),
  ('Executivo', false),
  ('Enfermeira', false),
  ('MC_Funk', false),
  ('Seu_Tonho', false),
  ('Surfista', true),
  ('Gaucha', true),
  ('Rapaz_Bairro', true),
  ('Ruiva', false),
  ('Barbudo', false),
  ('Playboy', false),
  ('Gaucho', false),
  ('Nipo', true),
  ('Moletom', true),
  ('Nordestino', false),
  ('Dona_Salao', true)
on conflict (id) do nothing;

insert into public.personagens_evento (id, nome, preco) values
  ('Patrocinador', 'Patrocinador', 999999),
  ('Dona_Empresa', 'Dona da Empresa', 999999),
  ('Soldado', 'Soldado', 999999),
  ('Soldada', 'Soldada', 999999),
  ('Maloqueiro', 'Maloqueiro', 999999),
  ('Maloqueira', 'Maloqueira', 999999),
  ('Empresario', 'Empresário', 999999),
  ('Medica', 'Médica', 999999),
  ('Medico', 'Médico', 999999),
  ('Dona_Morro', 'Dona do Morro', 999999),
  ('Mascarado', 'Mascarado do Morro', 999999),
  ('Dono_Morro', 'Dono do Morro', 999999),
  ('Doutor_Peste', 'Doutor da Peste', 999999),
  ('Agente_Secreta', 'Agente Secreta', 999999),
  ('Sentinela_Obsidiana', 'Sentinela de Obsidiana', 999999),
  ('Torcedor_Organizado', 'Torcedor Organizado', 999999),
  ('Intruso_Mascarado', 'Intruso Mascarado', 999999),
  ('Androide_Moletom', 'Androide de Moletom', 999999),
  ('Bandido_Balaclava', 'Bandido de Balaclava', 999999),
  ('Ciborgue_Futuro', 'Ciborgue do Futuro', 999999),
  ('Dragao_Azul', 'Filhote de Dragão Azul', 999999),
  ('Rapaz_Jaqueta', 'Rapaz de Jaqueta', 999999),
  ('Urbano_Tranquilo', 'Urbano Tranquilo', 999999),
  ('Forca_Estilo', 'Força com Estilo', 999999),
  ('Cara_Regata', 'Cara de Regata', 999999)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
