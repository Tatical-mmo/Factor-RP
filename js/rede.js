// Rede: contas, perfis (Supabase) e tempo real (Supabase Realtime)
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://uqiiztzdkjyewhdikabd.supabase.co';
export const SUPABASE_CHAVE = 'sb_publishable_diSzJqF0E4FLIALaI5UQLg_JUGJehS3';

export const sb = createClient(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 20 } },
});

const ERROS = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'User already registered': 'Esse e-mail já tem conta. Use Entrar.',
  'Email not confirmed': 'Confirme o e-mail antes de entrar (veja sua caixa de entrada).',
  'Password should be at least 6 characters.': 'A senha precisa ter pelo menos 6 caracteres.',
};
function traduzir(e) {
  if (!e) return '';
  for (const [k, v] of Object.entries(ERROS)) if (e.message?.startsWith(k)) return v;
  if (e.code === '23505') return 'Esse nome já está em uso. Escolha outro.';
  if (e.message?.includes('rate limit')) return 'Muitas tentativas. Espere um pouco e tente de novo.';
  return e.message || String(e);
}

export async function sessaoAtual() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
export async function entrar(email, senha) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(traduzir(error));
  return data.session;
}
export async function cadastrar(email, senha) {
  const { data, error } = await sb.auth.signUp({ email, password: senha });
  if (error) throw new Error(traduzir(error));
  if (!data.session) throw new Error('Conta criada! Confirme pelo link enviado ao seu e-mail e depois toque em Entrar.');
  return data.session;
}
export async function sair() { await sb.auth.signOut(); }

export async function carregarPerfil(id) {
  const { data, error } = await sb.from('perfis').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(traduzir(error));
  return data;
}
export async function criarPerfil(id, nome, personagem) {
  const { data, error } = await sb.from('perfis').insert({ id, nome, personagem }).select().single();
  if (error) throw new Error(traduzir(error));
  return data;
}
export async function salvarPosicao(id, x, z, fome) {
  const dados = { pos_x: x, pos_z: z, visto_em: new Date().toISOString() };
  if (typeof fome === 'number') dados.fome = Math.max(0, Math.min(100, Math.round(fome * 10) / 10));
  await sb.from('perfis').update(dados).eq('id', id);
}

// ---------------------------------------------------------------- tempo real
// Um canal para a cidade inteira: presença (quem está online) e mensagens de posição/ações.
export function conectarCidade(perfil, eventos) {
  const canal = sb.channel('cidade', {
    config: { presence: { key: perfil.id }, broadcast: { self: false, ack: false } },
  });
  canal.on('presence', { event: 'sync' }, () => {
    const estado = canal.presenceState();
    const lista = {};
    for (const [id, metas] of Object.entries(estado)) if (metas[0]) lista[id] = metas[0];
    eventos.presenca?.(lista);
  });
  canal.on('broadcast', { event: 'pos' }, ({ payload }) => eventos.pos?.(payload));
  canal.on('broadcast', { event: 'tiro' }, ({ payload }) => eventos.tiro?.(payload));
  canal.on('broadcast', { event: 'dano' }, ({ payload }) => eventos.dano?.(payload));
  canal.on('broadcast', { event: 'atropelo' }, ({ payload }) => eventos.atropelo?.(payload));
  canal.on('broadcast', { event: 'chat' }, ({ payload }) => eventos.chat?.(payload));
  canal.on('broadcast', { event: 'explosao' }, ({ payload }) => eventos.explosao?.(payload));
  canal.on('broadcast', { event: 'voz' }, ({ payload }) => eventos.voz?.(payload));
  canal.on('broadcast', { event: 'gesto' }, ({ payload }) => eventos.gesto?.(payload));
  canal.on('broadcast', { event: 'clima' }, ({ payload }) => eventos.clima?.(payload));
  canal.on('broadcast', { event: 'assalto' }, ({ payload }) => eventos.assalto?.(payload));
  canal.on('broadcast', { event: 'algemaNpc' }, ({ payload }) => eventos.algemaNpc?.(payload));
  canal.on('broadcast', { event: 'bueiro' }, ({ payload }) => eventos.bueiro?.(payload));
  canal.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await canal.track(eventos.meta ? eventos.meta() : { nome: perfil.nome, personagem: perfil.personagem, cargo: perfil.cargo });
      eventos.conectado?.(true);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      eventos.conectado?.(false);
    }
  });
  return {
    enviar(evento, payload) { canal.send({ type: 'broadcast', event: evento, payload }); },
    rastrear(meta) { return canal.track(meta); },
    fechar() { sb.removeChannel(canal); },
  };
}

// ---------------------------------------------------------------- escuta do próprio perfil e de comandos
export function escutarMeuPerfil(id, eventos) {
  const canal = sb.channel('eu-' + id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'perfis', filter: `id=eq.${id}` }, (p) => eventos.perfil?.(p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comandos', filter: `alvo=eq.${id}` }, (p) => eventos.comando?.(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario', filter: `dono=eq.${id}` }, () => eventos.inventario?.())
    .subscribe();
  return () => sb.removeChannel(canal);
}

// ---------------------------------------------------------------- painel (todas verificadas no banco)
async function rpc(nome, args = {}) {
  const { data, error } = await sb.rpc(nome, args);
  if (error) throw new Error(traduzirRpc(error.message));
  return data;
}
function traduzirRpc(m) {
  const t = {
    'sem permissao': 'Você não tem esse poder.',
    'chances invalidas': 'As chances somadas não podem passar de 100%.',
    'seu cla nao tem base': 'Seu clã precisa ser dono da Base Leste ou Oeste.',
    'cargueiro ja esta sendo assaltado': 'O cargueiro já está sendo assaltado por outro clã.',
    'aguarde para outro assalto': 'Seu clã já assaltou o cargueiro há pouco. Espere 2 horas entre um assalto e outro.',
    'nenhum assalto do seu cla': 'Não há assalto do seu clã em andamento. Planeje na mesa do QG.',
    'cedo demais': 'Calma! Espere alguns segundos depois de começar o assalto.',
    'conteiner ja aberto': 'Esse contêiner já foi arrombado.',
    'sem carga': 'Você não tem carga do cargueiro.',
    'so lixeiros': 'Só membros da sociedade.',
    'bueiro trancado': 'A tampa não abre.',
    'devagar': 'Calma, espere um pouco.',
    'sem pacote': 'Você não está levando nenhum pacote.',
    'bueiro errado': 'Não é este o bueiro da entrega.',
    'aguarde para outra denuncia': 'Espere 5 minutos para outra denúncia.',
    'voce ja tem casa no esgoto': 'Você já tem uma casa no esgoto.',
    'casa ocupada': 'Essa casa já tem dono.',
    'voce nao tem casa no esgoto': 'Você não tem casa no esgoto.',
    'voce ja tem um emprego': 'Você já tem um emprego. Saia do atual antes (cada jogador só pode ter um).',
    'ja esta algemado': 'Esse jogador já está algemado (ou preso).',
    'alguem precisa cortar por voce': 'Outra pessoa precisa cortar as suas algemas.',
    'voce esta algemado': 'Você está algemado.',
    'jogador nao esta algemado': 'Esse jogador não está algemado.',
    'so o prefeito': 'Só o prefeito pode fazer isso.',
    'voce nao pode banir esse jogador': 'Você não pode banir esse jogador.',
    'voce nao pode desbanir esse jogador': 'Você não pode desbanir esse jogador.',
    'voce nao pode algemar esse jogador': 'Você não pode algemar esse jogador.',
    'voce nao pode prender esse jogador': 'Você não pode prender esse jogador.',
    'voce nao pode mover esse jogador': 'Você não pode mover esse jogador.',
    'voce nao pode mudar as moedas desse jogador': 'Você não pode mudar as moedas desse jogador.',
    'moderador nao muda as proprias moedas': 'Moderador não pode mudar as próprias moedas.',
    'algemas nao funcionam na equipe': 'Algemas não funcionam em moderadores nem no administrador.',
    'a equipe nao pode ser presa': 'Moderadores e o administrador não podem ser presos.',
    'so o administrador pode fazer isso': 'Só o administrador pode fazer isso.',
    'voce nao pode mudar o proprio cargo': 'Você não pode mudar o próprio cargo.',
    'nao e possivel mudar outro administrador': 'Não é possível mudar outro administrador.',
    'so a equipe troca de skin de graca': 'Só a equipe troca de skin de graça.',
    'tempo invalido': 'Tempo inválido (0 a 1440 minutos).',
    'valor muito alto': 'Valor muito alto.',
    'jogador nao encontrado': 'Jogador não encontrado.',
    'voce esta preso': 'Você não pode fazer isso preso ou algemado.',
    'mochila cheia de sucata': 'Sua mochila já está cheia de sucata. Venda na loja.',
    'mochila cheia': 'Sua mochila está cheia desse item.',
    'nenhuma caixa embalada': 'Essa caixa não foi embalada por você.',
    'entrega rapida demais': 'Entrega rápida demais. Tente de novo em instantes.',
    'moedas insuficientes': 'Moedas insuficientes.',
    'itens insuficientes': 'Você não tem itens suficientes.',
    'a loja nao vende esse item': 'A loja não vende esse item.',
    'a loja nao compra esse item': 'A loja não compra esse item.',
    'isso nao se come': 'Isso não se come.',
    'quantidade invalida': 'Quantidade inválida.',
    'produto invalido': 'Produto inválido.',
    'saia da empresa atual antes': 'Saia da empresa em que trabalha antes de fundar outra.',
    'lote invalido': 'Lote inválido.',
    'lote ja vendido': 'Esse lote já foi vendido.',
    'tipo invalido': 'Tipo de empresa inválido.',
    'nome invalido': 'Nome inválido (3 a 24 letras, números, espaço, . & -).',
    'nome de empresa em uso': 'Já existe uma empresa com esse nome.',
    'voce nao e dono de empresa': 'Você não é dono de empresa.',
    'sua empresa nao e desse tipo': 'Sua empresa não é desse tipo.',
    'valor invalido': 'Valor inválido.',
    'caixa insuficiente': 'O caixa da empresa não tem saldo suficiente.',
    'jogador banido': 'Esse jogador está banido.',
    'jogador ja trabalha em uma empresa': 'Esse jogador já trabalha em uma empresa.',
    'limite de funcionarios': 'Limite de 20 funcionários.',
    'o dono nao pode se demitir': 'O dono não pode se demitir.',
    'cla nao encontrado': 'Clã não encontrado.',
    'veiculo invalido': 'Veículo inválido.',
    'so o administrador': 'Só o administrador.',
    'a arma ja foi pega': 'A arma dourada já foi pega.',
    'chegue mais perto': 'Chegue mais perto.',
    'voce nao tem a arma dourada': 'Você não tem a arma dourada.',
    'tiro invalido': 'Tiro inválido.',
    'voce nao pode adicionar a si mesmo': 'Você não pode adicionar a si mesmo.',
    'pedido ja existe': 'Vocês já são amigos ou o pedido já foi feito.',
    'policial nao rouba carro': 'Policial não rouba carro.',
    'esse carro nao pode ser roubado': 'Esse carro não pode ser roubado.',
    'o carro e seu': 'O carro é seu.',
    'esse carro ja foi roubado': 'Esse carro já foi roubado.',
    'o carro nao esta roubado': 'O carro não está roubado.',
    'so jornalistas em servico': 'Só jornalistas em serviço.',
    'esse acontecimento ja passou': 'Esse acontecimento já passou.',
    'outro jornalista ja fez essa reportagem': 'Outro jornalista já fez essa reportagem.',
    'o veiculo foi roubado: use o bloqueio': 'O veículo foi roubado: use o Bloqueio.',
    'o veiculo esta ocupado': 'O veículo está ocupado (em entrega ou com alguém).',
    'o veiculo nao esta na rua': 'O veículo não está na rua.',
    'o veiculo nao esta roubado': 'O veículo não está roubado.',
    'alguem esta dirigindo': 'Alguém está dirigindo esse veículo.',
    'esse veiculo nao e seu': 'Esse veículo não é seu.',
    'voce nao esta nesse veiculo': 'Você não está nesse veículo.',
    'o veiculo esta vazio': 'O veículo está vazio.',
    'descarregue num territorio do seu cla ou na sua casa': 'Descarregue num território do seu clã ou na sua casa.',
    'helicoptero fora de alcance': 'Helicóptero só pode ser atacado no chão (enquanto carrega na fábrica).',
    'escolha outro cla': 'Escolha outro clã.',
    'horario invalido (10 a 120 min)': 'Horário inválido: de 10 a 120 minutos.',
    'aposta invalida': 'Aposta inválida.',
    'um dos clas ja tem guerra marcada': 'Um dos clãs já tem guerra marcada.',
    'caixa do cla insuficiente': 'O caixa do clã não tem o valor da aposta.',
    'guerra invalida': 'Essa guerra não está mais disponível.',
    'o prazo para responder acabou': 'O prazo para responder acabou.',
    'so da para cancelar antes do aceite': 'Só dá para cancelar antes do aceite.',
    'funcao invalida': 'Função inválida.',
    'salario invalido (5 a 200 por minuto)': 'Salário inválido: de 5 a 200 por minuto.',
    'salario invalido (0 a 200 por minuto)': 'Salário inválido: de 0 a 200 por minuto.',
    'operario so em fabrica': 'Operário só existe em empresa com fábrica.',
    'a equipe nao se candidata': 'A equipe não se candidata a vagas.',
    'ele ja e o prefeito': 'Ele já é o prefeito.',
    'a prefeitura ja esta vaga': 'A prefeitura já está vaga.',
    'escolha de 1 a 6 ciclos': 'Escolha de 1 a 6 ciclos.',
    'a eleicao normal ja esta perto': 'A eleição normal já está aberta ou perto de abrir (últimos 4 ciclos do mandato).',
    'ja tem eleicao em andamento': 'Já tem uma eleição extraordinária em andamento.',
    'nao ha eleicao extraordinaria': 'Não há eleição extraordinária em andamento.',
    'jogador invalido': 'Jogador inválido.',
    'so tenente para cima autoriza a cacada': 'Só militares de Tenente para cima autorizam a caçada.',
    'ele nao e procurado': 'Ele não é procurado.',
    'a equipe nao e cacada': 'A equipe não pode ser caçada.',
    'ele nao esta no exercito': 'Ele não está no Exército.',
    'patente invalida': 'Patente inválida.',
    'so jornalistas': 'Só jornalistas (e o administrador) escrevem no jornal.',
    'titulo curto': 'O título precisa de pelo menos 3 letras.',
    'link da imagem invalido': 'O link da imagem precisa começar com https://',
    'materia nao existe': 'Essa matéria não existe mais.',
    'ele nao e moderador': 'Ele não é moderador.',
    'voce foi expulso do exercito': 'Você foi expulso do Exército. Só um superior pode retirar a expulsão.',
    'so patente maior': 'Só quem tem patente maior (Tenente para cima) pode fazer isso.',
    'so membros de cla compram': 'O contrabandista só vende para membros de clã.',
    'voce ja tem a arma militar': 'Você já tem a arma militar.',
    'so o exercito': 'Só o Exército pode fazer isso.',
    'personagem de evento fora da vitrine': 'Esse personagem de evento não está à venda agora. Fique de olho nos avisos!',
    'digite RESETAR para confirmar': 'Digite RESETAR (em maiúsculas) para confirmar.',
    'escolha o que resetar': 'Marque pelo menos uma parte para resetar.',
    'vaga preenchida': 'Essa vaga já foi preenchida.',
    'a empresa e sua': 'Essa empresa é sua.',
    'voce nao tem emprego': 'Você não tem emprego.',
    'o dono nao bate ponto': 'O dono não bate ponto.',
    'va ate um predio da empresa': 'Vá até um prédio da empresa para bater ponto.',
    'saldo insuficiente': 'Saldo insuficiente na poupança.',
    'a equipe nao pega emprestimo': 'A equipe não pega empréstimo.',
    'emprestimo de 500 a 20.000': 'Empréstimo de 500 a 20.000.',
    'pague o emprestimo atual antes': 'Pague o empréstimo atual antes.',
    'voce nao tem divida': 'Você não tem dívida.',
    'profissao invalida': 'Profissão inválida.',
    'saia da policia antes': 'Saia da polícia ou da PRF antes.',
    'procurado nao pode trabalhar no servico publico': 'Procurado não trabalha no serviço público.',
    'so medicos em servico': 'Só médicos em serviço.',
    'voce nao pode se socorrer': 'Você não pode se socorrer.',
    'essa pessoa nao esta ferida': 'Essa pessoa não está ferida.',
    'ja foi socorrida': 'Já foi socorrida.',
    'o fogo ja foi apagado': 'O fogo já foi apagado.',
    'so bombeiros ou o dono apagam': 'Só bombeiros em serviço ou o dono apagam esse fogo.',
    'jogador nao e seu funcionario': 'Esse jogador não é seu funcionário.',
    'o dono nao pode sair da propria empresa': 'O dono não pode sair da própria empresa.',
    'voce nao trabalha em uma fabrica': 'Você não trabalha nesta fábrica.',
    'a empresa esta sem caixa para pagar': 'A empresa está sem caixa para pagar. Avise o dono.',
    'transportadora invalida': 'Transportadora inválida.',
    'frete invalido': 'Frete inválido (de 0 até o valor da caixa).',
    'estoque insuficiente': 'Estoque insuficiente.',
    'pedido indisponivel': 'Esse pedido não está mais disponível.',
    'ha caixas a caminho': 'Há caixas a caminho; espere chegarem.',
    'voce nao trabalha em uma transportadora': 'Você não trabalha em uma transportadora.',
    'voce ja esta carregando uma caixa': 'Você já está carregando uma caixa.',
    'todas as caixas ja foram retiradas': 'Todas as caixas desse pedido já saíram.',
    'voce nao esta carregando caixa de pedido': 'Você não está carregando caixa de pedido.',
    'limite de caminhoes': 'Limite de 5 caminhões por empresa.',
    'caminhao invalido': 'Caminhão inválido.',
    'caminhao em viagem': 'Esse caminhão está em viagem.',
    'missao indisponivel': 'Essa missão não está mais disponível.',
    'sua fabrica nao produz esse item': 'Sua fábrica não produz esse item.',
    'voce nao e dono dessa empresa': 'Você não é dono dessa empresa.',
    'limite de empresas': 'Limite de 5 empresas por dono.',
    'o dono ja trabalha na empresa': 'O dono já trabalha na empresa.',
    'nivel maximo': 'A empresa já está no nível máximo.',
    'limite de robos': 'Limite de robôs deste nível. Evolua a empresa para ter mais.',
    'so transportadoras ou empresas nivel 3 compram caminhao': 'Só transportadoras, grupos ou empresas nível 3 compram caminhão.',
    'escolha duas empresas diferentes': 'Escolha duas empresas diferentes.',
    'fabricas de produtos diferentes': 'Não dá para fundir fábricas de produtos diferentes.',
    'termine os pedidos da empresa absorvida antes': 'Termine ou cancele os pedidos da empresa absorvida antes.',
    'ha caminhoes em viagem': 'Há caminhões em viagem; espere voltarem.',
    'policial nao rouba carga': 'Policial não rouba carga.',
    'caminhao sem carga': 'Esse caminhão não está levando carga.',
    'esse caminhao e seu': 'Esse caminhão é seu.',
    'quem tem crimes nao entra na policia': 'Quem está procurado não entra na polícia.',
    'a equipe nao entra na policia': 'A equipe não entra na polícia.',
    'saia do cla para entrar na policia': 'Saia do clã para entrar na polícia.',
    'voce nao esta em servico': 'Você não está em serviço.',
    'esse jogador nao e procurado': 'Esse jogador não é procurado.',
    'ja esta preso': 'Já está preso.',
    'voce nao esta preso': 'Você não está preso.',
    'policial nao entra em cla': 'Policial não entra em clã.',
    'voce ja esta em um cla': 'Você já está em um clã.',
    'nome de cla em uso': 'Já existe um clã com esse nome.',
    'voce nao e lider de cla': 'Só o líder do clã pode fazer isso.',
    'jogador ja esta em um cla': 'Esse jogador já está em um clã.',
    'limite de membros': 'Limite de 15 membros.',
    'o lider nao pode se expulsar': 'O líder não pode se expulsar.',
    'jogador nao e do seu cla': 'Esse jogador não é do seu clã.',
    'voce nao esta em um cla': 'Você não está em um clã.',
    'territorio invalido': 'Território inválido.',
    'o territorio ja e do seu cla': 'O território já é do seu clã.',
    'territorio recem capturado': 'Território recém-capturado; espere 3 minutos.',
    'captura nao iniciada': 'A captura não foi iniciada.',
    'captura incompleta': 'Ainda falta tempo para capturar.',
    'robos insuficientes': 'Robôs insuficientes.',
    'o territorio nao e do seu cla': 'O território não é do seu clã.',
    'voce ja tem uma casa': 'Você já tem uma casa.',
    'casa invalida': 'Casa inválida.',
    'casa ja vendida': 'Essa casa já tem dono.',
    'voce nao tem casa': 'Você não tem casa.',
    'bau cheio': 'O baú está cheio (200 de cada item).',
  };
  const espera = /^aguarde (\d+) s$/.exec(m);
  if (espera) return `Aguarde ${espera[1]} s.`;
  return t[m] || m;
}
export const lixeiros = {
  secreto: (k) => rpc('bueiro_secreto', { p_bueiro: k }),
  entrar: (k) => rpc('lixeiro_entrar', { p_bueiro: k }),
  sair: () => rpc('lixeiro_sair'),
  insalubridade: () => rpc('lixeiro_insalubridade'),
  coletar: () => rpc('lixeiro_coletar'),
  contrabando: () => rpc('lixeiro_contrabando'),
  entregar: (k, visto) => rpc('lixeiro_entregar', { p_bueiro: k, p_visto: !!visto }),
  informacoes: () => rpc('lixeiro_informacoes'),
  denunciar: (alvo) => rpc('lixeiro_denunciar', { p_alvo: alvo }),
  resgate: (id) => rpc('lixeiro_resgate', { p_convidado: id }),
  casas: () => sel(sb.from('casas_esgoto').select('id,dono,dono_perfil:perfis!casas_esgoto_dono_fkey(nome)').order('id')),
  comprarCasa: (id) => rpc('comprar_casa_esgoto', { p_id: id }),
  venderCasa: () => rpc('vender_casa_esgoto'),
};
export const algemas = {
  algemar: (alvo) => rpc('algemar', { p_alvo: alvo }),
  soltar: (alvo) => rpc('soltar_algemas', { p_alvo: alvo }),
  cortar: (alvo) => rpc('cortar_algemas', { p_alvo: alvo }),
  comprarAlicate: () => rpc('comprar_alicate'),
  seguranca: (slot, nome) => rpc('prefeito_seguranca', { p_slot: slot, p_nome: nome }),
};
export const qg = {
  cofre: () => rpc('cla_cofre'),
  guardar: (item, qtd) => rpc('cla_guardar', { p_item: item, p_qtd: qtd }),
  retirar: (item, qtd) => rpc('cla_cofre_retirar', { p_item: item, p_qtd: qtd }),
  sacar: (valor) => rpc('cla_cofre_sacar', { valor }),
  autorizar: (jogador, sim) => rpc('cla_autorizar_cofre', { p_jogador: jogador, p_sim: sim }),
  assaltoAtual: () => rpc('assalto_navio_atual'),
  iniciarAssalto: () => rpc('cla_assalto_iniciar'),
  arrombar: (k) => rpc('cla_assalto_arrombar', { p_k: k }),
  entregar: () => rpc('cla_assalto_entregar'),
};
export const clima = {
  async ler() { const { data, error } = await sb.from('clima').select('*').eq('id', 1).maybeSingle(); if (error) throw error; return data; },
  agora: (tipo, minutos) => rpc('admin_clima_agora', { p_tipo: tipo, p_minutos: minutos }),
  auto: (auto, chuva, tempestade, neve) => rpc('admin_clima_auto', { p_auto: auto, p_chuva: chuva, p_tempestade: tempestade, p_neve: neve }),
};

export const painel = {
  nomearPrefeito: (id) => rpc('admin_nomear_prefeito', { p_jogador: id }),
  afastarPrefeito: () => rpc('admin_afastar_prefeito'),
  convocarEleicao: (ciclos) => rpc('admin_convocar_eleicao', { p_ciclos: ciclos }),
  cancelarEleicao: () => rpc('admin_cancelar_eleicao'),
  resetarMundo: (partes, conf) => rpc('admin_resetar_mundo', { p_partes: partes, p_confirma: conf }),
  salarios: () => rpc('admin_salarios'),
  definirSalario: (chave, valor) => rpc('admin_definir_salario', { p_chave: chave, p_valor: valor }),
  salarioModerador: (id, valor) => rpc('admin_salario_moderador', { p_alvo: id, p_valor: valor }),
  moedas: (alvo, valor) => rpc('admin_moedas', { alvo, valor }),
  bueiroSecreto: () => rpc('admin_bueiro_secreto'),
  sortearBueiro: () => rpc('admin_sortear_bueiro'),
  banir: (alvo, motivo) => rpc('admin_banir', { alvo, motivo }),
  desbanir: (alvo) => rpc('admin_desbanir', { alvo }),
  algemar: (alvo, ligado) => rpc('admin_algemar', { alvo, ligado }),
  prender: (alvo, minutos) => rpc('admin_prender', { alvo, minutos }),
  teleporte: (alvo, x, z) => rpc('admin_teleporte', { alvo, x, z }),
  definirCargo: (alvo, novo_cargo, novos_poderes, novo_salario) => rpc('admin_definir_cargo', { alvo, novo_cargo, novos_poderes, novo_salario }),
  skin: (novo) => rpc('staff_skin', { novo }),
  imortal: (ligado) => rpc('staff_imortal', { ligado }),
  nivelEmpresa: (empresa, nivel) => rpc('admin_nivel_empresa', { p_empresa: empresa, p_nivel: nivel }),
  nivelCla: (cla, nivel) => rpc('admin_nivel_cla', { p_cla: cla, p_nivel: nivel }),
};
export const cumprirPena = () => rpc('cumprir_pena');
export const prefeitura = {
  estado: async () => (await sel(sb.from('prefeitura').select('*, prefeito_perfil:perfis!prefeitura_prefeito_fkey(nome), seg1:perfis!prefeitura_seguranca1_fkey(nome), seg2:perfis!prefeitura_seguranca2_fkey(nome)').eq('id', 1).maybeSingle())),
  campanha: () => rpc('mandato_em_campanha'),
  candidatos: (m) => sel(sb.from('candidatos').select('*, perfil:perfis!candidatos_jogador_fkey(nome)').eq('mandato', m).order('votos', { ascending: false })),
  meuVoto: async (m) => (await sel(sb.from('votos').select('candidato').eq('mandato', m).maybeSingle()))?.candidato || null,
  candidatar: (slogan) => rpc('candidatar', { p_slogan: slogan }),
  votar: (id) => rpc('votar', { p_candidato: id }),
  salario: () => rpc('salario_prefeito'),
  renunciar: () => rpc('renunciar'),
  salarioPolicia: (v) => rpc('definir_salario_policia', { p_valor: v }),
  processar: () => rpc('processar_prefeitura'),
  verba: (cla, valor) => rpc('favor_verba', { p_cla: cla, p_valor: valor }),
  territorio: (t, cla) => rpc('favor_territorio', { p_territorio: t, p_cla: cla }),
  outdoors: () => sel(sb.from('outdoors').select('*').order('id')),
  alugarOutdoor: (id, min, tipo, empresa, texto) => rpc('alugar_outdoor', { p_outdoor: id, p_minutos: min, p_tipo: tipo, p_empresa: empresa, p_texto: texto }),
};
export const prf = {
  entrar: () => rpc('entrar_prf'),
  sair: () => rpc('sair_prf'),
  salario: () => rpc('salario_prf'),
  investigar: () => rpc('prf_investigar'),
  prender: (alvo) => rpc('prf_prender', { p_alvo: alvo }),
};
export const carros = {
  listar: () => sel(sb.from('carros').select('*').order('id')),
  comprar: (modelo, cor) => rpc('comprar_carro', { p_modelo: modelo, p_cor: cor }),
  estacionar: (id, x, z, ang) => rpc('estacionar_carro', { p_carro: id, p_x: x, p_z: z, p_ang: ang }),
  vender: (id) => rpc('vender_carro', { p_carro: id }),
  roubar: (id) => rpc('roubar_carro', { p_carro: id }),
  bloquear: (id) => rpc('bloquear_carro', { p_carro: id }),
  liberar: (id) => rpc('liberar_carro', { p_carro: id }),
};
export const carreiras = {
  turno: (x, z) => rpc('bater_turno', { p_x: x, p_z: z }),
  minhas: () => rpc('minhas_carreiras'),
};
export const robos = {
  listar: () => sel(sb.from('robos_policia').select('*')),
  atualizar: (id, estado, alvo, x, z, ang, seg) => rpc('robo_atualizar', { p_id: id, p_estado: estado, p_alvo: alvo, p_x: x, p_z: z, p_ang: ang, p_segundos: Math.round(seg || 0) }),
};
export const mercado = {
  resumo: () => rpc('resumo_mercado'),
  ofertas: (item) => sel(sb.from('ofertas').select('*, vendedor_perfil:perfis!ofertas_vendedor_fkey(nome)').eq('item', item).order('preco').limit(30)),
  minhas: (id) => sel(sb.from('ofertas').select('*').eq('vendedor', id).order('id')),
  criar: (item, qtd, preco) => rpc('criar_oferta', { p_item: item, p_qtd: qtd, p_preco: preco }),
  cancelar: (id) => rpc('cancelar_oferta', { p_oferta: id }),
  comprar: (id, qtd) => rpc('comprar_oferta', { p_oferta: id, p_qtd: qtd }),
};
export const crime = {
  iniciar: (loja, x, z) => rpc('iniciar_assalto', { p_loja: loja, p_x: x, p_z: z }),
  concluir: () => rpc('concluir_assalto'),
  cancelar: () => rpc('cancelar_assalto'),
  abertas: () => sel(sb.from('ocorrencias').select('*').eq('status', 'aberta').gt('criada_em', new Date(Date.now() - 15 * 60000).toISOString()).order('id', { ascending: false }).limit(20)),
  atender: (id) => rpc('atender_ocorrencia', { p_ocorrencia: id }),
  agredirNpc: () => rpc('agredir_policia_npc'),
};
export const guerra = {
  listar: () => sel(sb.from('guerras').select('*').in('status', ['proposta', 'aceita']).order('inicio')),
  historico: (cla) => sel(sb.from('guerras').select('*').or(`desafiante.eq.${cla},desafiado.eq.${cla}`).in('status', ['encerrada', 'recusada', 'cancelada']).order('id', { ascending: false }).limit(5)),
  declarar: (cla, min, aposta) => rpc('declarar_guerra', { p_cla: cla, p_minutos: min, p_aposta: aposta }),
  responder: (id, sim) => rpc('responder_guerra', { p_guerra: id, p_aceitar: sim }),
  cancelar: (id) => rpc('cancelar_guerra', { p_guerra: id }),
  processar: () => rpc('processar_guerras'),
};
export const empregos = {
  mural: () => rpc('mural_vagas'),
  meu: (id) => sel(sb.from('membros').select('*, emp:empresas!membros_empresa_fkey(nome, dono)').eq('jogador', id).maybeSingle()),
  candidatar: (empresa) => rpc('candidatar_vaga', { p_empresa: empresa }),
  abrirVagas: (empresa, vagas, funcao, salario) => rpc('abrir_vagas', { p_empresa: empresa, p_vagas: vagas, p_funcao: funcao, p_salario: salario }),
  ajustar: (empresa, jogador, funcao, salario) => rpc('ajustar_funcionario', { p_empresa: empresa, p_jogador: jogador, p_funcao: funcao, p_salario: salario }),
  ponto: (x, z) => rpc('bater_ponto', { p_x: x, p_z: z }),
};
export const veiculos = {
  entrar: (id, x, z, ang) => rpc('entrar_veiculo', { p_caminhao: id, p_x: x, p_z: z, p_ang: ang }),
  mover: (id, x, z, ang) => rpc('mover_veiculo', { p_caminhao: id, p_x: x, p_z: z, p_ang: ang }),
  sair: (id, x, z, ang) => rpc('sair_veiculo', { p_caminhao: id, p_x: x, p_z: z, p_ang: ang }),
  descarregar: (id, x, z) => rpc('descarregar_roubo', { p_caminhao: id, p_x: x, p_z: z }),
  chamar: (id, x, z) => rpc('chamar_veiculo', { p_caminhao: id, p_x: x, p_z: z }),
  recolher: (id) => rpc('recolher_veiculo', { p_caminhao: id }),
  bloquear: (id) => rpc('bloquear_veiculo', { p_caminhao: id }),
};
export const jornal = {
  publicar: (tipo, ref, titulo, x, z) => rpc('publicar_noticia', { p_tipo: tipo, p_ref: ref, p_titulo: titulo, p_x: x, p_z: z }),
  ultimas: () => sel(sb.from('noticias').select('*').order('id', { ascending: false }).limit(12)),
  materias: () => sel(sb.from('materias').select('id,autor_nome,titulo,texto,imagem,publicar_em,criada_em,editada_em,editor_nome,personagem,selo,cor,destaque,tem_foto').order('publicar_em', { ascending: false }).limit(20)),
  foto: (id) => rpc('foto_materia', { p_id: id }),
  salvar2: (id, titulo, texto, imagem, quando, foto, personagem, selo, cor, destaque) => rpc('salvar_materia2', { p_id: id || null, p_titulo: titulo, p_texto: texto, p_imagem: imagem || null, p_publicar_em: quando || null,
    p_foto: foto, p_personagem: personagem || null, p_selo: selo || null, p_cor: cor || null, p_destaque: !!destaque }),
  redacao: () => rpc('materias_redacao'),
  salvar: (id, titulo, texto, imagem, quando) => rpc('salvar_materia', { p_id: id || null, p_titulo: titulo, p_texto: texto, p_imagem: imagem || null, p_publicar_em: quando || null }),
  apagar: (id) => rpc('apagar_materia', { p_id: id }),
};
export const exercito = {
  procurados: () => sel(sb.from('perfis').select('id,nome,crimes,recompensa').gt('crimes', 0).eq('cargo', 'jogador')
    .gt('visto_em', new Date(Date.now() - 10 * 60000).toISOString()).order('crimes', { ascending: false }).limit(20)),
  cacadas: () => sel(sb.from('cacadas').select('*').gt('ate', new Date().toISOString())),
  minha: async (id) => (await sel(sb.from('cacadas').select('*').eq('alvo', id).maybeSingle())),
  ordenar: (alvo) => rpc('ordenar_cacada', { p_alvo: alvo }),
  cancelar: (alvo) => rpc('cancelar_cacada', { p_alvo: alvo }),
  preso: () => rpc('preso_pelo_exercito'),
  membros: () => rpc('membros_exercito'),
  promover: (id, nivel) => rpc('admin_promover_exercito', { p_jogador: id, p_nivel: nivel }),
  ficha: () => rpc('ficha_militar'),
  expulsar: (id, sim) => rpc('expulsar_exercito', { p_alvo: id, p_expulsar: sim }),
  armaPesada: (id, horas) => rpc('autorizar_arma_pesada', { p_alvo: id, p_horas: horas }),
  morteMilitar: (id) => rpc('registrar_morte_militar', { p_militar: id }),
  comprarArmaMilitar: () => rpc('comprar_arma_militar'),
  explodirCarro: (id) => rpc('explodir_carro', { p_carro: id }),
};
export const pd = {
  estado: () => sel(sb.from('arma_pd').select('*').eq('id', 1).maybeSingle()),
  esconder: (x, z) => rpc('esconder_arma_pd', { p_x: x, p_z: z }),
  pegar: (x, z) => rpc('pegar_arma_pd', { p_x: x, p_z: z }),
  disparar: () => rpc('disparar_pd'),
  acertar: (alvo) => rpc('acertar_pd', { p_alvo: alvo }),
  soltar: (x, z) => rpc('soltar_arma_pd', { p_x: x, p_z: z }),
};
export const amigos = {
  listar: () => rpc('meus_amigos'),
  pedir: (nome) => rpc('pedir_amizade', { p_nome: nome }),
  responder: (de, sim) => rpc('responder_amizade', { p_de: de, p_aceitar: sim }),
  desfazer: (id) => rpc('desfazer_amizade', { p_outro: id }),
};
export const recompensas = {
  procurados: () => rpc('mais_procurados'),
  presoPorRobo: () => rpc('preso_por_robo'),
  cercar: (x, z) => rpc('cercar_casa', { p_x: x, p_z: z }),
  fimCerco: () => rpc('fim_cerco'),
};
export const banco = {
  estado: () => rpc('banco_estado'),
  depositar: (v) => rpc('banco_depositar', { p_valor: v }),
  sacar: (v) => rpc('banco_sacar', { p_valor: v }),
  emprestimo: (v) => rpc('banco_emprestimo', { p_valor: v }),
  pagar: (v) => rpc('banco_pagar', { p_valor: v }),
};
export const saude = {
  entrar: (prof) => rpc('entrar_profissao', { p_profissao: prof }),
  sair: () => rpc('sair_profissao'),
  socorrer: (alvo) => rpc('socorrer', { p_alvo: alvo }),
  alta: () => rpc('alta_hospital'),
  tratar: () => rpc('tratar_hospital'),
  incendios: () => sel(sb.from('incendios').select('*').eq('status', 'ativo').order('id')),
  processar: () => rpc('processar_incendios'),
  apagar: (id) => rpc('apagar_incendio', { p_incendio: id }),
};
export const metas = {
  minhas: () => rpc('minhas_metas'),
  resgatar: (tipo) => rpc('resgatar_meta', { p_tipo: tipo }),
  ranking: () => rpc('ranking'),
};
export const encomendas = {
  pegar: (origem) => rpc('pegar_encomenda', { p_origem: origem }),
  entregar: (destino) => rpc('entregar_encomenda', { p_destino: destino }),
  desistir: () => rpc('desistir_encomenda'),
  parafusos: () => rpc('fazer_parafusos'),
  minha: async () => (await sel(sb.from('encomendas').select('*').maybeSingle())),
};
export const personagens = {
  comprar: (p) => rpc('comprar_personagem', { p_personagem: p }),
  usar: (p) => rpc('usar_personagem', { p_personagem: p }),
  trocarNome: (nome) => rpc('trocar_nome', { p_nome: nome }),
  comprados: async (id) => (await sel(sb.from('personagens_comprados').select('personagem').eq('jogador', id))).map((r) => r.personagem),
  evento: () => sel(sb.from('personagens_evento').select('*')),
  liberarEvento: (ids, minutos) => rpc('admin_liberar_evento', { p_ids: ids, p_minutos: minutos }),
  presentear: (jogador, id) => rpc('admin_presentear_personagem', { p_jogador: jogador, p_personagem: id }),
};
export const receberSalario = () => rpc('receber_salario');

export async function buscarJogadores(texto) {
  let q = sb.from('perfis').select('id,nome,cargo,personagem,moedas,banido,banido_motivo,algemado,pena_seg,poderes,salario,visto_em').order('nome').limit(40);
  if (texto) q = q.ilike('nome', `%${texto.replace(/[%_]/g, '')}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}
export async function listarEquipe() {
  const { data, error } = await sb.from('perfis').select('id,nome,cargo,poderes,salario').neq('cargo', 'jogador').order('nome');
  if (error) throw new Error(error.message);
  return data;
}
export async function historico() {
  const { data, error } = await sb.from('registro_admin').select('acao,detalhes,criado_em,autor:perfis!registro_admin_autor_fkey(nome),alvo:perfis!registro_admin_alvo_fkey(nome)').order('criado_em', { ascending: false }).limit(40);
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------- economia (etapa 3)
export const economia = {
  coletarSucata: () => rpc('coletar_sucata'),
  iniciarEmbalagem: (produto) => rpc('iniciar_embalagem', { produto }),
  entregarPacote: () => rpc('entregar_pacote'),
  comprar: (item, qtd) => rpc('comprar', { nome_item: item, quantidade: qtd }),
  vender: (item, qtd) => rpc('vender', { nome_item: item, quantidade: qtd }),
  consumir: (item) => rpc('consumir', { nome_item: item }),
};
export async function carregarPrecos() {
  const { data, error } = await sb.from('precos').select('*').order('item');
  if (error) throw new Error(error.message);
  return data;
}
export async function carregarInventario(id) {
  const { data, error } = await sb.from('inventario').select('item,qtd').eq('dono', id);
  if (error) throw new Error(error.message);
  const inv = {}; for (const r of data) inv[r.item] = r.qtd;
  return inv;
}

// ---------------------------------------------------------------- logística (etapa 4)
export const logistica = {
  comprarLote: (lote, nome, tipo, produto) => rpc('comprar_lote', { p_lote: lote, p_nome: nome, p_tipo: tipo, p_produto: produto }),
  depositar: (empresa, valor) => rpc('empresa_depositar', { p_empresa: empresa, valor }),
  sacar: (empresa, valor) => rpc('empresa_sacar', { p_empresa: empresa, valor }),
  pagamento: (empresa, valor) => rpc('empresa_pagamento', { p_empresa: empresa, valor }),
  contratar: (empresa, nome) => rpc('contratar', { p_empresa: empresa, p_nome: nome }),
  demitir: (empresa, jogador) => rpc('demitir', { p_empresa: empresa, p_jogador: jogador }),
  sair: () => rpc('sair_empresa'),
  embalar: (empresa) => rpc('embalar_fabrica', { p_empresa: empresa }),
  evoluir: (empresa) => rpc('evoluir_empresa', { p_empresa: empresa }),
  comprarRobo: (empresa) => rpc('comprar_robo', { p_empresa: empresa }),
  alugarRobo: (empresa) => rpc('alugar_robo', { p_empresa: empresa }),
  fundir: (principal, absorvida) => rpc('fundir_empresas', { p_principal: principal, p_absorvida: absorvida }),
  criarPedido: (fabrica, transportadora, qtd, frete) => rpc('criar_pedido', { p_fabrica: fabrica, p_transportadora: transportadora, p_qtd: qtd, p_frete: frete }),
  responder: (pedido, aceitar) => rpc('responder_pedido', { p_pedido: pedido, aceitar }),
  cancelar: (pedido) => rpc('cancelar_pedido', { p_pedido: pedido }),
  retirar: (pedido) => rpc('retirar_caixa', { p_pedido: pedido }),
  entregar: () => rpc('entregar_caixa'),
  desistir: () => rpc('desistir_caixa'),
  comprarCaminhao: (empresa) => rpc('comprar_caminhao', { p_empresa: empresa }),
  comprarVeiculo: (empresa, tipo) => rpc('comprar_veiculo', { p_empresa: empresa, p_tipo: tipo }),
  precoVeiculo: (empresa, tipo) => rpc('preco_veiculo', { p_empresa: empresa, p_tipo: tipo }),
  despachar: (caminhao, pedido, escolta = false) => rpc('despachar_caminhao', { p_caminhao: caminhao, p_pedido: pedido, p_escolta: escolta }),
  processar: () => rpc('processar_caminhoes'),
  missoes: () => rpc('listar_missoes'),
  aceitarMissao: (missao, fabrica, transportadora, frete) => rpc('aceitar_missao', { p_missao: missao, p_fabrica: fabrica, p_transportadora: transportadora, p_frete: frete }),
  agora: () => rpc('agora'),
  abrirFilial: (empresa, lote, funcao) => rpc('abrir_filial', { p_empresa: empresa, p_lote: lote, p_funcao: funcao }),
};
export const precoRobo = (empresa = null) => rpc('preco_robo', { p_excluir: empresa });
export const mercadoRobos = () => rpc('mercado_robos');
async function sel(q) { const { data, error } = await q; if (error) throw new Error(error.message); return data; }
export const listarEmpresas = () => sel(sb.from('empresas').select('*, dono_perfil:perfis!empresas_dono_fkey(nome)').order('id'));
export const listarCaminhoes = () => sel(sb.from('caminhoes').select('*').order('id'));
export const listarUnidades = () => sel(sb.from('unidades').select('*'));
export const listarMercado = () => sel(sb.from('mercado').select('*'));
export async function minhaEmpresaId(id) {
  const d = await sel(sb.from('membros').select('empresa').eq('jogador', id).maybeSingle());
  return d?.empresa ?? null;
}
export const membrosDe = (empresa) => sel(sb.from('membros').select('jogador, desde, funcao, salario, minutos, ponto_em, perfil:perfis!membros_jogador_fkey(nome)').eq('empresa', empresa).order('desde'));
export const pedidosDe = (empresa) => sel(sb.from('pedidos')
  .select('*, fab:empresas!pedidos_fabrica_fkey(nome,lote), tra:empresas!pedidos_transportadora_fkey(nome)')
  .or(`fabrica.eq.${empresa},transportadora.eq.${empresa}`).order('id', { ascending: false }).limit(30));
export const pedidosAceitosDe = (transportadora) => sel(sb.from('pedidos').select('*, fab:empresas!pedidos_fabrica_fkey(nome,lote)')
  .eq('transportadora', transportadora).eq('status', 'aceito').order('id'));

// mudanças públicas: prédios, caminhões, equipe e pedidos
export function escutarLogistica(eventos) {
  const canal = sb.channel('logistica')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'empresas' }, (p) => eventos.empresa?.(p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'caminhoes' }, (p) => eventos.caminhao?.(p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'membros' }, (p) => eventos.membro?.(p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (p) => eventos.pedido?.(p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'unidades' }, (p) => eventos.unidade?.(p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'territorios' }, (p) => eventos.territorio?.(p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'casas' }, (p) => eventos.casa?.(p))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'robos_policia' }, (p) => eventos.robo?.(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'arma_pd' }, (p) => eventos.armaPd?.(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clas' }, (p) => eventos.cla?.(p))
    .subscribe();
  return () => sb.removeChannel(canal);
}

// ---------------------------------------------------------------- combate, polícia, clãs e casas (etapas 5 a 7)
export const combate = {
  agressao: (alvo) => rpc('registrar_agressao', { p_alvo: alvo }),
  morrer: (assassino) => rpc('morrer', { p_assassino: assassino }),
  atacarCaminhao: (id, x, z, ang) => rpc('atacar_caminhao', { p_caminhao: id, p_x: x, p_z: z, p_ang: ang }),
  usarRemedio: () => rpc('usar_remedio'),
};
export const policia = {
  entrar: () => rpc('entrar_policia'),
  sair: () => rpc('sair_policia'),
  salario: () => rpc('receber_salario_policia'),
  prender: (alvo) => rpc('prender_suspeito', { p_alvo: alvo }),
  fianca: () => rpc('pagar_fianca'),
};
export const cla = {
  evoluir: () => rpc('cla_evoluir'),
  criar: (nome, cor) => rpc('criar_cla', { p_nome: nome, p_cor: cor }),
  adicionar: (nome) => rpc('cla_adicionar', { p_nome: nome }),
  expulsar: (jogador) => rpc('cla_expulsar', { p_jogador: jogador }),
  sair: () => rpc('cla_sair'),
  depositar: (valor) => rpc('cla_depositar', { valor }),
  sacar: (valor) => rpc('cla_sacar', { valor }),
  comprarRobo: () => rpc('cla_comprar_robo'),
  retirar: (item, qtd) => rpc('cla_retirar', { p_item: item, p_qtd: qtd }),
  vender: (item, qtd) => rpc('cla_vender', { p_item: item, p_qtd: qtd }),
  iniciarCaptura: (t) => rpc('iniciar_captura', { p_territorio: t }),
  concluirCaptura: (t) => rpc('concluir_captura', { p_territorio: t }),
  atacar: (t, robos) => rpc('atacar_territorio', { p_territorio: t, p_robos: robos }),
  defender: (t, robos) => rpc('defender_territorio', { p_territorio: t, p_robos: robos }),
  processar: () => rpc('processar_territorios'),
};
export const casas = {
  comprar: (id) => rpc('comprar_casa', { p_casa: id }),
  guardar: (casa, item, qtd) => rpc('guardar_no_bau', { p_casa: casa, p_item: item, p_qtd: qtd }),
  retirar: (casa, item, qtd) => rpc('retirar_do_bau', { p_casa: casa, p_item: item, p_qtd: qtd }),
  vender: (casa) => rpc('vender_casa', { p_casa: casa }),
  construir: (casa, modelo) => rpc('construir_casa', { p_casa: casa, p_modelo: modelo }),
  evoluir: (casa) => rpc('evoluir_imovel', { p_casa: casa }),
  definirUnidade: (u, aluguel, preco) => rpc('definir_unidade', { p_unidade: u, p_aluguel: aluguel, p_preco: preco }),
  alugar: (u) => rpc('alugar_unidade', { p_unidade: u }),
  comprarUnidade: (u) => rpc('comprar_unidade', { p_unidade: u }),
  sairAluguel: (u) => rpc('sair_aluguel', { p_unidade: u }),
  processarAlugueis: () => rpc('processar_alugueis'),
};
export async function listarBau(casa) {
  const d = await sel(sb.from('bau').select('item, qtd').eq('casa', casa));
  const b = {}; for (const r of d) b[r.item] = r.qtd; return b;
}
export const perdoar = (alvo) => rpc('admin_perdoar', { alvo });
export const procuradosTodos = () => sel(sb.from('perfis').select('id,nome,crimes,recompensa,pena_seg').or('crimes.gt.0,recompensa.gt.0').order('crimes', { ascending: false }).limit(40));
export const listarClas = () => sel(sb.from('clas').select('*, lider_perfil:perfis!clas_lider_fkey(nome)').order('id'));
export const membrosDoCla = (id) => sel(sb.from('membros_cla').select('jogador, desde, perfil:perfis!membros_cla_jogador_fkey(nome)').eq('cla', id).order('desde'));
export async function meuClaId(id) { const d = await sel(sb.from('membros_cla').select('cla').eq('jogador', id).maybeSingle()); return d?.cla ?? null; }
export const listarTerritorios = () => sel(sb.from('territorios').select('*').order('id'));
export const listarCasas = () => sel(sb.from('casas').select('id, x, z, preco, dono, tipo, rotulo, modelo, pai, nivel, inquilino, aluguel, pago_ate, a_venda, dono_perfil:perfis!casas_dono_fkey(nome), inquilino_perfil:perfis!casas_inquilino_fkey(nome)').order('id'));
