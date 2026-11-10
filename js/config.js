// Configuração geral do jogo (etapa 1: cidade + personagem)

export const PERSONAGENS = [
  { id: 'Autumn_Traveler', nome: 'Viajante de Outono' },
  { id: 'Bandaged_Trailblazer', nome: 'Desbravador' },
  { id: 'Bandit_Brave', nome: 'Bandido Valente' },
  { id: 'Curly_Wanderer', nome: 'Andarilha Cacheada' },
  { id: 'Desert_Scout_Ava', nome: 'Ava, a Batedora' },
  { id: 'Desert_Warden', nome: 'Guardião do Deserto' },
  { id: 'Dustbound_Scout', nome: 'Batedor da Poeira' },
  { id: 'Dustveil_Scout', nome: 'Batedora Velada' },
  { id: 'Friendly_Village_Blacksmith', nome: 'Ferreiro' },
  { id: 'Grimbeard_the_Ironclad', nome: 'Barba de Ferro' },
  { id: 'Hooded_Paw_Guardian', nome: 'Guardião Encapuzado' },
  { id: 'Mustached_Explorer', nome: 'Explorador Bigodudo' },
  { id: 'Patchwork_Scout', nome: 'Batedor Remendado' },
  { id: 'Shadow_Scout', nome: 'Batedor das Sombras' },
  { id: 'The_Frightened_Escapee', nome: 'Fugitivo Assustado' },
  { id: 'Urban_Explorer', nome: 'Explorador Urbano' },
  { id: 'Urban_Wanderer', nome: 'Andarilho Urbano' },
];

// personagens de evento: só à venda quando o administrador abre a vitrine (preço e prazo vêm do banco)
export const PERSONAGENS_EVENTO = [
  { id: 'Veteran_Gamekeeper', nome: 'Veterano Guarda-Caça' }, { id: 'Molten_Dread_Knight', nome: 'Cavaleiro de Lava' },
  { id: 'Runebound_Wolfguard', nome: 'Guarda-Lobo Rúnico' }, { id: 'Anubis_Sentinel', nome: 'Sentinela de Anúbis' },
  { id: 'Armored_Crocodile_Commando', nome: 'Comando Crocodilo' }, { id: 'Bonebound_Reaper', nome: 'Ceifador de Ossos' },
  { id: 'Grizzled_Vanguard', nome: 'Veterano da Vanguarda' }, { id: 'Ironbraid_Warden', nome: 'Guardiã Trança de Ferro' },
  { id: 'Raccoon_Ranger', nome: 'Guaxinim Patrulheiro' }, { id: 'Crimson_Samurai', nome: 'Samurai Carmesim' },
  { id: 'Iron_Vanguard', nome: 'Vanguarda de Ferro' }, { id: 'Ironclad_Sentinel', nome: 'Sentinela Blindada' },
  { id: 'Azure_Vanguard', nome: 'Vanguarda Celeste' }, { id: 'Inferno_Warden', nome: 'Guardião do Inferno' },
  { id: 'Rustguard_Automaton', nome: 'Autômato Enferrujado' }, { id: 'Ironhide_Armadillo', nome: 'Tatu Couraçado' },
  { id: 'Elven_Warden', nome: 'Guardiã Élfica' }, { id: 'Tidebreaker_Sentinel', nome: 'Sentinela Quebra-Mar' },
];

// grátis ao criar a conta; os outros custam 8.000 na loja de personagens (mesma lista do banco)
export const PERSONAGENS_GRATIS = ['Autumn_Traveler', 'Bandaged_Trailblazer', 'Curly_Wanderer', 'Desert_Scout_Ava',
  'Mustached_Explorer', 'Patchwork_Scout', 'Urban_Explorer', 'Urban_Wanderer'];
export const PRECO_PERSONAGEM = 8000, PRECO_NOME = 1000;

// Robôs: só administrador, moderadores e polícia (não aparecem na escolha)
export const ROBOS = ['Rusty_Scout_Bot', 'Rustbolt_Sentinel'];

export const MODELOS = [
  'caminhao', 'caminhao_danificado', 'viatura', 'van_policia', 'caixa', 'arma_paintball', 'algemas',
  'bancada', 'base_cla', 'loja', 'delegacia', 'transportadora', 'casa', 'empresa', 'arvore', 'poste',
  'van', 'helicoptero', 'carro_popular', 'carro_suv', 'carro_esportivo', 'carro_presidencial', 'robo_motorista', 'ambulancia', 'caminhao_bombeiros',
  'exercito_jipe', 'exercito_caminhao', 'helicoptero_exercito', 'helicoptero_executivo', 'trem', 'arvore_comum', 'arvore_pinheiro', 'arvore_palmeira',
];

// Cidade central: grade de quarteirões
export const CIDADE = {
  quarteiroes: 4,      // 4 x 4
  quarteirao: 44,      // metros
  rua: 10,             // largura da rua
  calcada: 3,
};

export const RUAS_HORIZONTAIS = ['Rua das Docas', 'Rua do Comércio', 'Avenida Central', 'Rua da Sucata', 'Rua do Porto'];
export const RUAS_VERTICAIS = ['Rua dos Clãs', 'Rua das Fábricas', 'Avenida dos Caminhoneiros', 'Rua do Mercado', 'Rua da Paz'];

// Lotes de cada quarteirão: SO (sudoeste), SE (sudeste), NE (nordeste), NO (noroeste = pátio)
// Os quarteirões centrais têm uso fixo; os de fora são residenciais.
export const QUARTEIROES_ESPECIAIS = {
  '1,1': { SO: 'delegacia', SE: 'loja', NE: 'casa', NO: 'patio_policia' },
  '2,1': { SO: 'empresa', SE: 'transportadora', NE: 'casa', NO: 'patio_caixas' },
  '1,2': { parque: true },
  '2,2': { SO: 'casa', SE: 'loja', NE: 'empresa', NO: 'patio_caixas' },
};

export const VELOCIDADE = { andar: 1.9, correr: 4.6, carregando: 1.7, armado: 1.8 };

export const CONTROLES_PC = [
  ['W A S D', 'andar'],
  ['Shift', 'correr'],
  ['Clique no chão', 'ir até o ponto'],
  ['E', 'agir (pegar, embalar, entregar, coletar, loja)'],
  ['M', 'mochila'],
  ['F perto de caminhão', 'atacar a carga'],
  ['F', 'soco'],
  ['Q', 'sacar / guardar arma'],
  ['Clique (armado)', 'atirar'],
  ['Z / X', 'girar câmera'],
  ['Roda do mouse', 'zoom'],
];

// Etapa 3: trabalho e produção
export const FERRO_VELHOS = ['0,3', '3,0'];                         // quarteirões com ferro-velho no lote NO
export const FABRICAS = { '2,1': 'chocolate', '2,2': 'remedio' };   // bancada de cada empresa
export const PRODUTOS = {
  chocolate: { nome: 'Chocolate', cor: '#c98b5e', codigo: 2 },
  remedio: { nome: 'Remédio', cor: '#eef3ff', codigo: 3 },
  robo: { nome: 'Robô', cor: '#9aa4ae', codigo: 1 },
  van: { nome: 'Van', cor: '#f2f2ee', codigo: 1 },
  caminhao: { nome: 'Caminhão', cor: '#e39b3a', codigo: 1 },
  helicoptero: { nome: 'Helicóptero', cor: '#23395b', codigo: 1 },
};
export const FOME_POR_SEGUNDO = 100 / 3600;   // esvazia em 1 hora

// Etapa 4: logística. Mesmas coordenadas da tabela public.lotes / public.destinos no banco.
export const LOTES_VENDA = [
  { id: 1, q: '0,0', lote: 'SE', portao: { x: -71.5, z: -58.0 } },
  { id: 2, q: '1,0', lote: 'SO', portao: { x: -36.5, z: -58.0 } },
  { id: 3, q: '2,0', lote: 'SE', portao: { x: 36.5, z: -58.0 } },
  { id: 4, q: '3,1', lote: 'SO', portao: { x: 71.5, z: -4.0 } },
  { id: 5, q: '0,1', lote: 'SE', portao: { x: -71.5, z: -4.0 } },
  { id: 6, q: '0,2', lote: 'SO', portao: { x: -90.5, z: 50.0 } },
  { id: 7, q: '3,2', lote: 'SE', portao: { x: 90.5, z: 50.0 } },
  { id: 8, q: '1,3', lote: 'SO', portao: { x: -36.5, z: 104.0 } },
  { id: 9, q: '2,3', lote: 'SE', portao: { x: 36.5, z: 104.0 } },
  { id: 10, q: '3,3', lote: 'SO', portao: { x: 71.5, z: 104.0 } },
  { id: 11, q: '0,0', lote: 'SO', portao: { x: -90.5, z: -58 } },
  { id: 12, q: '1,0', lote: 'SE', portao: { x: -17.5, z: -58 } },
  { id: 13, q: '2,0', lote: 'SO', portao: { x: 17.5, z: -58 } },
  { id: 14, q: '3,0', lote: 'SO', portao: { x: 71.5, z: -58 } },
  { id: 15, q: '3,0', lote: 'SE', portao: { x: 90.5, z: -58 } },
  { id: 16, q: '0,1', lote: 'SO', portao: { x: -90.5, z: -4 } },
  { id: 17, q: '3,1', lote: 'SE', portao: { x: 90.5, z: -4 } },
  { id: 18, q: '0,2', lote: 'SE', portao: { x: -71.5, z: 50 } },
  { id: 19, q: '3,2', lote: 'SO', portao: { x: 71.5, z: 50 } },
  { id: 20, q: '0,3', lote: 'SO', portao: { x: -90.5, z: 104 } },
  { id: 21, q: '0,3', lote: 'SE', portao: { x: -71.5, z: 104 } },
  { id: 22, q: '1,3', lote: 'SE', portao: { x: -17.5, z: 104 } },
  { id: 23, q: '2,3', lote: 'SO', portao: { x: 17.5, z: 104 } },
  { id: 24, q: '3,3', lote: 'SE', portao: { x: 90.5, z: 104 } },
];
export const DESTINOS = {
  loja: { nome: 'Mercado (Loja da Rua do Comércio)', x: -17.5, z: -4 },
  contratante: { nome: 'Praça do Contratante', x: -4, z: 27 },
};
export const CAPACIDADE_CAMINHAO = 20;
export const PRECO_CAMINHAO = 15000;
