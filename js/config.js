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

// Robôs: só administrador, moderadores e polícia (não aparecem na escolha)
export const ROBOS = ['Rusty_Scout_Bot', 'Rustbolt_Sentinel'];

export const MODELOS = [
  'caminhao', 'caminhao_danificado', 'viatura', 'van_policia', 'caixa', 'arma_paintball', 'algemas',
  'bancada', 'base_cla', 'loja', 'delegacia', 'transportadora', 'casa', 'empresa', 'arvore', 'poste',
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
  ['E', 'pegar / soltar caixa, falar'],
  ['F', 'soco'],
  ['Q', 'sacar / guardar arma'],
  ['Clique (armado)', 'atirar'],
  ['Z / X', 'girar câmera'],
  ['Roda do mouse', 'zoom'],
];
