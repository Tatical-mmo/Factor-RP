// Configuração geral do jogo (etapa 1: cidade + personagem)

export const PERSONAGENS = [   // personagens do Meshy: as animações vêm dos arquivos animacoes_*.glb
  { id: 'Jovem_Cidade', nome: 'Jovem da Cidade' },
  { id: 'Moca_Academia', nome: 'Moça da Academia' },
  { id: 'Grandalhao', nome: 'Grandalhão' },
  { id: 'Moca_Trancas', nome: 'Moça das Tranças' },
  { id: 'Torcedor', nome: 'Torcedor da Seleção' },
  { id: 'Moradora', nome: 'Moradora da Vila' },
  { id: 'Pai_Familia', nome: 'Pai de Família' },
  { id: 'Vovo', nome: 'Vovô do Xadrez' },
  { id: 'Mecanico', nome: 'Mecânico' },
  { id: 'Executiva', nome: 'Executiva' },
  { id: 'Fisiculturista', nome: 'Fisiculturista' },
  { id: 'Enfermeiro', nome: 'Enfermeiro' },
  { id: 'Executivo', nome: 'Executivo' },
  { id: 'Enfermeira', nome: 'Enfermeira' },
  { id: 'MC_Funk', nome: 'MC do Funk' },
  { id: 'Seu_Tonho', nome: 'Senhor da Venda' },
  { id: 'Surfista', nome: 'Surfista' },
  { id: 'Gaucha', nome: 'Gaúcha' },
  { id: 'Rapaz_Bairro', nome: 'Rapaz do Bairro' },
  { id: 'Ruiva', nome: 'Ruiva' },
  { id: 'Barbudo', nome: 'Barbudo do Sul' },
  { id: 'Playboy', nome: 'Playboy' },
  { id: 'Gaucho', nome: 'Gaúcho' },
  { id: 'Nipo', nome: 'Nipo-brasileiro' },
  { id: 'Moletom', nome: 'Rapaz do Moletom' },
  { id: 'Nordestino', nome: 'Nordestino' },
  { id: 'Dona_Salao', nome: 'Dona do Salão' },
];

// personagens de evento: só à venda quando o administrador abre a vitrine (preço e prazo vêm do banco)
export const PERSONAGENS_EVENTO = [   // limitados (Meshy): só o admin dá de presente ou abre a vitrine por um tempo
  { id: 'Patrocinador', nome: 'Patrocinador' },
  { id: 'Dona_Empresa', nome: 'Dona da Empresa' },
  { id: 'Soldado', nome: 'Soldado' },
  { id: 'Soldada', nome: 'Soldada' },
  { id: 'Maloqueiro', nome: 'Maloqueiro' },
  { id: 'Maloqueira', nome: 'Maloqueira' },
  { id: 'Empresario', nome: 'Empresário' },
  { id: 'Medica', nome: 'Médica' },
  { id: 'Medico', nome: 'Médico' },
  { id: 'Dona_Morro', nome: 'Dona do Morro' },
  { id: 'Mascarado', nome: 'Mascarado do Morro' },
  { id: 'Dono_Morro', nome: 'Dono do Morro' },
];

// grátis ao criar a conta; os outros custam 8.000 na loja de personagens (mesma lista do banco)
export const PERSONAGENS_GRATIS = ['Jovem_Cidade', 'Moca_Academia', 'Moca_Trancas', 'Torcedor', 'Moradora', 'Pai_Familia', 'Surfista', 'Gaucha', 'Rapaz_Bairro', 'Nipo', 'Moletom', 'Dona_Salao'];
export const PRECO_PERSONAGEM = 8000, PRECO_NOME = 1000;

// Robôs: só administrador, moderadores e polícia (não aparecem na escolha)
export const ROBOS = ['Rusty_Scout_Bot', 'Rustbolt_Sentinel'];

export const MODELOS = [
  'caveirao', 'viatura_civil', 'viatura_prf', 'saveiro', 'saveiro_som', 'arma_espingarda', 'arma_fuzil',
  'caminhao', 'caminhao_danificado', 'ovni', 'caca_leve', 'caca_furtivo', 'asa_furtiva', 'missil', 'porta_avioes', 'destroier', 'missil_cruzeiro', 'viatura', 'van_policia', 'caixa', 'arma_paintball', 'algemas',
  'bancada', 'base_cla', 'loja', 'delegacia', 'transportadora', 'casa', 'empresa', 'arvore', 'poste',
  'carro_classico', 'roda_classico', 'roda_carro', 'roda_esporte', 'roda_suv', 'roda_pesado', 'roda_militar',
  'van', 'helicoptero', 'carro_popular', 'carro_suv', 'carro_esportivo', 'carro_presidencial', 'robo_motorista', 'ambulancia', 'caminhao_bombeiros',
  'exercito_jipe', 'exercito_caminhao', 'helicoptero_exercito', 'helicoptero_executivo', 'trem', 'navio', 'arvore_comum', 'arvore_pinheiro', 'arvore_palmeira',
  'tanque', 'onibus_amarelo', 'onibus_branco', 'onibus_laranja', 'onibus_brasilsul', 'onibus_viacao', 'caminhao_lixo', 'prop_arvore', 'prop_pinheiro', 'empresa_f0', 'empresa_f1', 'empresa_f2', 'empresa_f3', 'transp_f0', 'transp_f1', 'transp_f2', 'transp_f3', 'fabrica_aberta', 'aero_torre', 'aero_quiosque', 'rodo_cidade', 'obra_cras', 'predio_prefeitura', 'predio_prf', 'npc_bruxo', 'ave_corvo', 'ave_pombo', 'obra_camara', 'obra_varredores', 'aero_terminal', 'aero_hangar', 'aviao_pequeno', 'aviao_medio', 'aviao_grande', 'arma_policia', 'arma_prf', 'arma_exercito', 'arma_militar', 'arma_grande_porte',
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
  ['Espaço', 'pular (por cima de obstáculos; muro baixo: agarra e passa)'],
  ['R', 'render-se (em confronto com a polícia)'],
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
  // favelas: lotes na rua de baixo de cada morro (centro próprio em "c")
  { id: 25, c: { x: -137, z: -1124.5 }, portao: { x: -137, z: -1111 } },
  { id: 26, c: { x: -115, z: -1124.5 }, portao: { x: -115, z: -1111 } },
  { id: 27, c: { x: 115, z: -1124.5 }, portao: { x: 115, z: -1111 } },
  { id: 28, c: { x: 137, z: -1124.5 }, portao: { x: 137, z: -1111 } },
  { id: 29, c: { x: 915, z: 927.5 }, portao: { x: 915, z: 941 } },
  { id: 30, c: { x: 937, z: 927.5 }, portao: { x: 937, z: 941 } },
  { id: 31, c: { x: 959, z: 927.5 }, portao: { x: 959, z: 941 } },
  { id: 32, c: { x: 981, z: 927.5 }, portao: { x: 981, z: 941 } },
];
export const DESTINOS = {
  loja: { nome: 'Mercado (Loja da Rua do Comércio)', x: -17.5, z: -4 },
  contratante: { nome: 'Praça do Contratante', x: -4, z: 27 },
};
export const CAPACIDADE_CAMINHAO = 20;
export const PRECO_CAMINHAO = 15000;

// máscaras (acessório na cabeça): compradas na loja, usadas pela mochila; o admin ajusta cada uma no editor da farda
export const MASCARAS = [
  { id: 'mascara_camisa_cinza', nome: 'Camisa enrolada (cinza)', tipo: 'cabeca' },
  { id: 'mascara_camisa_vermelha', nome: 'Camisa enrolada (vermelha)', tipo: 'cabeca' },
  { id: 'mascara_bandana', nome: 'Bandana', tipo: 'boca' },
  { id: 'mascara_balaclava', nome: 'Balaclava preta', tipo: 'cabeca' },
  { id: 'mascara_lenco', nome: 'Lenço do deserto', tipo: 'cabeca' },
  { id: 'mascara_estrela', nome: 'Máscara da estrela', tipo: 'rosto' },
  { id: 'mascara_caveira', nome: 'Máscara da caveira', tipo: 'rosto' },
  { id: 'mascara_camuflada', nome: 'Máscara camuflada', tipo: 'rosto' },
  { id: 'mascara_onca', nome: 'Máscara de onça', tipo: 'rosto' },
  { id: 'mascara_coroa', nome: 'Máscara da coroa (dourada)', tipo: 'rosto' },
];
