// Rede: contas, perfis (Supabase) e tempo real (Supabase Realtime)
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://uqiiztzdkjyewhdikabd.supabase.co';
export const SUPABASE_CHAVE = 'sb_publishable_diSzJqF0E4FLIALaI5UQLg_JUGJehS3';

// assinatura do jogo: o banco recusa pedidos sem ela (veja supabase/74a e 74b). Troque aqui e na tabela seguranca juntos.
const ASSINATURA = 'fr-7c41e9a2';
export const sb = createClient(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: { headers: { 'x-fator': ASSINATURA } },
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
// recuperação de senha: manda o link por e-mail (volta para esta página) e troca a senha com a sessão do link
export async function recuperarSenha(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '?recuperar=1' });
  if (error && !/user not found/i.test(error.message)) throw new Error(traduzir(error));
}
export async function trocarSenha(senha) {
  const { data, error } = await sb.auth.updateUser({ password: senha });
  if (error) throw new Error(traduzir(error));
  return data;
}
export function aoRecuperarSenha(fn) { sb.auth.onAuthStateChange((ev, s) => { if (ev === 'PASSWORD_RECOVERY') fn(s); }); }

// 143: código do aparelho (fica no celular) — o ban pega o aparelho, não só a conta
export function codigoAparelho() {
  try {
    let c = localStorage.getItem('fator_aparelho');
    if (!c || c.length < 8) { c = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`); localStorage.setItem('fator_aparelho', c); }
    return c;
  } catch { return null; }
}
export async function aparelhoBanido() {
  const c = codigoAparelho(); if (!c) return false;
  try { const { data, error } = await sb.rpc('checar_aparelho', { p_aparelho: c }); return !error && data === true; } catch { return false; }
}
export async function congelados() {
  try { const { data } = await sb.from('perfis').select('id,congelado_x,congelado_z').eq('congelado', true).limit(50); return data || []; } catch { return []; }
}
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
export async function salvarPrefs(id, prefs) {   // gráfico, câmera, tutorial visto (coluna prefs: supabase/102_prefs.sql)
  const { error } = await sb.from('perfis').update({ prefs }).eq('id', id);
  if (error) throw error;
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
  canal.on('broadcast', { event: 'dm' }, ({ payload }) => eventos.dm?.(payload));
  canal.on('broadcast', { event: 'gesto' }, ({ payload }) => eventos.gesto?.(payload));
  canal.on('broadcast', { event: 'clima' }, ({ payload }) => eventos.clima?.(payload));
  canal.on('broadcast', { event: 'assalto' }, ({ payload }) => eventos.assalto?.(payload));
  canal.on('broadcast', { event: 'algemaNpc' }, ({ payload }) => eventos.algemaNpc?.(payload));
  canal.on('broadcast', { event: 'torre' }, ({ payload }) => eventos.torre?.(payload));
  canal.on('broadcast', { event: 'torreOk' }, ({ payload }) => eventos.torreOk?.(payload));
  canal.on('broadcast', { event: 'fiscal' }, ({ payload }) => eventos.fiscal?.(payload));
  canal.on('broadcast', { event: 'lixo' }, ({ payload }) => eventos.lixo?.(payload));
  canal.on('broadcast', { event: 'bueiro' }, ({ payload }) => eventos.bueiro?.(payload));
  canal.on('broadcast', { event: 'carroRua' }, ({ payload }) => eventos.carroRua?.(payload));
  canal.on('broadcast', { event: 'onibusSeq' }, ({ payload }) => eventos.onibusSeq?.(payload));
  canal.on('broadcast', { event: 'denuncia' }, ({ payload }) => eventos.denuncia?.(payload));
  canal.on('broadcast', { event: 'reset' }, ({ payload }) => eventos.reset?.(payload));
  canal.on('broadcast', { event: 'navio' }, ({ payload }) => eventos.navio?.(payload));
  canal.on('broadcast', { event: 'cruzeiro' }, ({ payload }) => eventos.cruzeiro?.(payload));
  canal.on('broadcast', { event: 'sirene' }, ({ payload }) => eventos.sirene?.(payload));
  canal.on('broadcast', { event: 'bau' }, ({ payload }) => eventos.bau?.(payload));
  canal.on('broadcast', { event: 'natal' }, ({ payload }) => eventos.natal?.(payload));
  canal.on('broadcast', { event: 'somSoco' }, ({ payload }) => eventos.somSoco?.(payload));
  canal.on('broadcast', { event: 'toqueCel' }, ({ payload }) => eventos.toqueCel?.(payload));
  canal.on('broadcast', { event: 'derrubar' }, ({ payload }) => eventos.derrubar?.(payload));
  canal.on('broadcast', { event: 'viacao' }, ({ payload }) => eventos.viacao?.(payload));
  canal.on('broadcast', { event: 'danoQueda' }, ({ payload }) => eventos.danoQueda?.(payload));
  canal.on('broadcast', { event: 'danoTiro' }, ({ payload }) => eventos.danoTiro?.(payload));
  canal.on('broadcast', { event: 'pneu' }, ({ payload }) => eventos.pneu?.(payload));   // 22b: pneu furado de um carro   // 21y: tiro no veículo que eu dirijo
  canal.on('broadcast', { event: 'missil' }, ({ payload }) => eventos.missil?.(payload));
  canal.on('broadcast', { event: 'congelar' }, ({ payload }) => eventos.congelar?.(payload));
  canal.on('broadcast', { event: 'travado' }, ({ payload }) => eventos.travado?.(payload));
  canal.on('broadcast', { event: 'missilAcerto' }, ({ payload }) => eventos.missilAcerto?.(payload));
  canal.on('broadcast', { event: 'abducao' }, ({ payload }) => eventos.abducao?.(payload));
  canal.on('broadcast', { event: 'abducaoRes' }, ({ payload }) => eventos.abducaoRes?.(payload));
  canal.on('broadcast', { event: 'ovniVisto' }, ({ payload }) => eventos.ovniVisto?.(payload));
  canal.on('broadcast', { event: 'ovniAbducao' }, ({ payload }) => eventos.ovniAbducao?.(payload));
  canal.on('broadcast', { event: 'ave' }, ({ payload }) => eventos.ave?.(payload));   // grasnado do corvo e do bando
  canal.on('broadcast', { event: 'tatica' }, ({ payload }) => eventos.tatica?.(payload));   // granadas, blindagem, troca de motorista
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
    'data de nascimento invalida': 'Data de nascimento inválida.',
    'data de nascimento ja informada': 'A data de nascimento já foi informada. Para corrigir, fale com a equipe.',
    'o pin deve ter de 4 a 8 numeros': 'O PIN deve ter de 4 a 8 números.',
    'so funcionarios do hospital em servico': 'Só funcionários do hospital em serviço.',
    'va ate o almoxarifado do hospital': 'Vá até a prateleira do almoxarifado do hospital.',
    'voce ja esta com 20 remedios': 'Sua maleta já está com 20 remédios.',
    'socorrista ainda nao medica: so do nivel enfermeiro em diante': 'Socorrista ainda não medica: só do nível Enfermeiro em diante.',
    'a medicacao gratuita e so dentro do hospital': 'A medicação gratuita é só dentro do hospital.',
    'acabaram seus remedios: pegue mais no almoxarifado': 'Seus remédios acabaram: pegue mais no almoxarifado (anexo leste do hospital).',
    'voce nao pode medicar a si mesmo': 'Você não pode se medicar.',
    'esse paciente acabou de ser medicado': 'Esse paciente acabou de ser medicado: espere 1 minuto.',
    'adicional de 0 a 100 por cento': 'O adicional vai de 0 a 100%.',
    'esse terreno ja tem obra': 'Esse terreno já tem obra.',
    'a pedra ja foi achada': 'Alguém já achou a pedra preciosa.',
    'alguem ja abriu o bau': 'Alguém já abriu o baú do tesouro.', 'o papai noel ja foi embora': 'O Papai Noel já foi embora.', 'pouca experiencia de motorista': 'A Viação só contrata quem já tem 5 h como motorista de ônibus (carreira na Rodoviária).', 'faca o cadastro no escritorio': 'Faça o cadastro no escritório da Viação primeiro.', 'voce ja tem um onibus da viacao': 'Você já está com um ônibus da Viação.', 'vaga vazia': 'Essa vaga está vazia.', 'esse onibus esta em viagem': 'Esse ônibus está em viagem.', 'chegue perto do onibus': 'Chegue perto do ônibus.', 'nenhum embarque agora': 'Não há embarque agora.', 'pare no ponto de embarque': 'Pare no ponto de embarque.', 'nenhum desembarque agora': 'Não há desembarque agora.', 'viagem rapida demais': 'Rápido demais: faça a viagem de verdade.', 'pare no ponto de desembarque': 'Pare no ponto de desembarque.', 'estacione na vaga do onibus': 'Estacione na vaga de onde o ônibus saiu.', 'chegue mais perto do papai noel': 'Chegue mais perto do Papai Noel.', 'presente fora do catalogo': 'Esse presente não está no catálogo do Papai Noel.', 'voce ja ganhou seu presente neste natal': 'Você já ganhou seu presente neste Natal. 🎅', 'catalogo vazio': 'Marque pelo menos um presente no catálogo.', 'o bau sumiu': 'O baú do tesouro não está mais lá.', 'bau vazio': 'Coloque alguma coisa dentro do baú.',
    'o bruxo nao atende voce': 'O Bruxo só atende quem achou a pedra.',
    'valor de 1 a 10.000.000 por jogador': 'O valor vai de 1 a 10.000.000 por jogador.',
    'escolha quem recebe': 'Escolha quem recebe.',
    'nenhum jogador para receber': 'Nenhum jogador para receber (ninguém online ou nomes não encontrados).',
    'essa obra nao esta em construcao': 'Essa obra não está em construção.',
    'a camara nao esta funcionando': 'A Câmara não está funcionando.',
    'a cidade ja tem essa obra': 'A cidade já tem essa obra.',
    'a obra ainda nao terminou': 'A obra ainda não terminou.',
    'esse predio e particular': 'Esse prédio é particular do prefeito que construiu.',
    'ja esta descontinuado': 'O programa já está descontinuado.',
    'so o proximo prefeito pode descontinuar este programa': 'Só o próximo prefeito pode descontinuar este programa.',
    'ja esta funcionando': 'O programa já está funcionando.',
    'patrimonio da prefeitura: so o administrador pode desfazer': 'Patrimônio da prefeitura: só o administrador pode desfazer.',
    'o cras nao esta funcionando': 'O CRAS não está funcionando.',
    'acabaram as vagas do cras': 'Infelizmente acabaram as vagas do CRAS neste mandato.',
    'voce ja esta cadastrado': 'Você já está cadastrado no CRAS.',
    'as candidaturas nao estao abertas': 'As candidaturas para vereador não estão abertas.',
    'precisa estar com a ficha limpa': 'Precisa estar com a ficha limpa.',
    'voce ja e candidato': 'Você já é candidato.',
    'a votacao nao esta aberta': 'A votação para vereador não está aberta.',
    'candidato invalido': 'Candidato inválido.',
    'voce ja votou': 'Você já votou.',
    'doacao do cras de 100 a 3.000 por pessoa': 'Doação do CRAS: de 100 a 3.000 por pessoa.',
    'salario do vereador de 0 a 10.000 por ciclo': 'Salário do vereador: de 0 a 10.000 por ciclo.',
    'so policiais entram no bope': 'Só policiais em serviço entram no BOPE.',
    'o bope aceita de 3o sargento para cima': 'O BOPE aceita policiais de 3º Sargento para cima.',
    'precisa de indicacao para o bope': 'Para entrar no BOPE é preciso ser indicado pelo General Supremo ou por um oficial (Polícia, PRF ou Forças Armadas).',
    'so patente alta indica para o bope': 'Só o General Supremo e oficiais de patente alta indicam para o BOPE.',
    'nao pode indicar a si mesmo': 'Você não pode se indicar.',
    'nome em uso': 'Esse nome já está em uso.',
    'seu tonho esta sem estoque': 'O Seu Tonho está sem estoque disso agora.',
    'esse nome e de um jogador que morreu': 'Esse nome é de um jogador que morreu (está na lápide). Escolha outro.',
    'o portao ainda nao abriu': 'O portão da segunda chance ainda não abriu.',
    'sem segunda chance': 'A segunda chance só vale se o administrador oferecer.',
    'esse nome nao e seu': 'Esse nome não é seu.',
    'ele nao esta no purgatorio': 'Esse jogador não está no purgatório.',
    'so o administrador': 'Só o administrador pode fazer isso.',
    'so o bope': 'Só o BOPE pega o kit de armas.',
    'aguarde para pegar o kit de novo': 'Você já pegou o kit há pouco. Espere 10 minutos.',
    'armazem vazio ou voce ja esta equipado': 'O armamento está vazio ou você já está equipado.',
    'so as forcas armadas': 'Só as Forças Armadas pegam armas no Arsenal.',
  'precisa de autorizacao': 'Precisa da autorização de um Tenente para cima (ou do General Supremo), a mesma da arma pesada.',
  'aguarde para pegar o lancador': 'O lançador sai a cada 2 minutos. Aguarde.',
  'sem autorizacao do laboratorio': 'Só jogadores autorizados pelo General Supremo pegam armadura.',
  'desertor sem liberacao': 'Desertor não entra na corporação sem a liberação de um oficial de patente alta (ou o perdão do administrador).',
  'patente baixa para liberar': 'Só oficial de patente alta libera desertor (Polícia/BOPE e Exército: Tenente para cima; PRF: Inspetor para cima).',
  'nao e desertor': 'Esse jogador não é desertor.',
  'so oficiais das corporacoes': 'Só oficiais da Polícia, PRF, BOPE ou Exército.',
  'o admin perdoa direto': 'O administrador perdoa direto no painel do laboratório.',
  'voce ja tem essa arma': 'Você já tem essa arma laser.',
  'oferta expirada': 'A oferta expirou (vale 10 minutos).',
  'esse jogador ja tem armadura': 'Esse jogador já tem uma armadura.',
  'voce nao tem armadura': 'Você não tem armadura.',
  'voce ja tem uma armadura': 'Você já tem uma armadura guardada. Outra só se ela for destruída.',
  'arsenal sem lancador': 'O arsenal está sem esse lançador. Peça um lote na Central de rações (vem de caminhão até a Base Aérea).',
  'ja tem lote a caminho': 'Já tem um lote de lançadores a caminho.',
  'arsenal cheio': 'O arsenal de lançadores está cheio.',
  'o contrabandista nao vende mais lancadores': 'O contrabandista não vende mais lançadores: agora só sequestrando o caminhão do Exército.',
  'nenhum saque para voce': 'Nenhum saque de lançadores para você agora (ou você já pegou a sua parte).',
  'voce ja tem o rpg': 'Você já tem um RPG.',
    'so policia e prf recebem armas': 'Só Polícia e PRF recebem kit de armas.',
    'so membros de cla': 'Só membros de clã.',
    'so membros de cla compram': 'Só membros de clã compram na loja dos patrocinadores.',
    'seu cla ja tem 6 barricadas': 'Seu clã já tem 6 barricadas na rua.',
    'essa barricada nao e do seu cla': 'Essa barricada não é do seu clã.',
    'precisa de 1.000.000 de moedas': 'Para ser patrocinador é preciso ter 1.000.000 de moedas (a inscrição custa 100.000).',
    'servidor publico nao pode ser patrocinador': 'Polícia, PRF e militares não podem ser patrocinadores.',
    'so patrocinadores': 'Só patrocinadores.',
    'minimo de 1000': 'O patrocínio mínimo é 1.000.',
    'fabrique primeiro': 'Fabrique esse item antes de definir o preço.',
    'estoque insuficiente': 'Estoque insuficiente.',
    'o estoque e seu': 'Esse estoque é seu.',
    'so a prf': 'Só a PRF usa o radar.',
    'ja investigada': 'Essa movimentação já foi investigada.',
    'precisa de uma saveiro com som': 'Você precisa ter uma Saveiro com som.',
    'link invalido (use https)': 'Link inválido: use um link https direto para o arquivo de música (MP3).',
    'chances invalidas': 'As chances somadas não podem passar de 100%.',
    'seu cla nao tem base': 'Seu clã precisa ser dono da Base Leste ou Oeste.',
    'cargueiro ja esta sendo assaltado': 'O cargueiro já está sendo assaltado por outro clã.',
    'aguarde para outro assalto': 'Seu clã já assaltou o cargueiro há pouco. Espere 2 horas entre um assalto e outro.',
    'nenhum assalto do seu cla': 'Não há assalto do seu clã em andamento. Planeje na mesa do QG.',
    'cedo demais': 'Calma! Espere alguns segundos depois de começar o assalto.',
    'conteiner ja aberto': 'Esse contêiner já foi arrombado.',
    'sem carga': 'Você não tem carga do cargueiro.',
    'confirmacao invalida': 'Digite EXCLUIR para confirmar.',
    'o administrador nao pode excluir a conta': 'O administrador não pode excluir a própria conta.',
    'muitas denuncias': 'Muitas denúncias em pouco tempo. Tente mais tarde.',
    'ele trabalha em empresa': 'Ele é funcionário de uma empresa particular. Ele precisa sair dela antes (um emprego por jogador).',
    'carreira invalida': 'Carreira inválida.',
    'o carro foi destruido: espere': 'O carro foi destruído: espere ele voltar.',
    'so policia prf ou exercito': 'Só Polícia, PRF ou Exército em serviço prendem.',
    'crimes de npc desligados': 'Os crimes de NPC estão desligados.',
    'o ladrao ja fugiu': 'O ladrão já fugiu.',
    'outro agente ja prendeu': 'Outro agente já prendeu esse ladrão.',
    'so patente maior prende': 'Só uma patente maior pode mandar para a prisão militar.',
    'so membros de cla': 'Só membros de clã fazem isso.',
    'esse veiculo nao esta em entrega': 'Esse veículo não está fazendo entrega.',
    'policial nao assalta': 'Policial em serviço não assalta.',
    'aguarde para assaltar': 'Espere uns minutos antes de assaltar outra pessoa.',
    'so policia prf e bombeiros': 'Só Polícia, PRF e Bombeiros em serviço usam esse armazém.',
    'so policia prf bope e bombeiros': 'Só Polícia, PRF, BOPE e Bombeiros em serviço.',
    'so policia prf bope bombeiros e exercito': 'Só Polícia, PRF, BOPE, Bombeiros e Exército em serviço.',
    'aguarde para pegar anti-acido': 'Espere 5 minutos para pegar mais anti-ácido.',
    'deposito sem anti-acido': 'O depósito está sem anti-ácido. Peça reposição ao Exército.',
    'a licitacao exige 5 caminhoes': 'A licitação exige 5 caminhões na transportadora.',
    'so coronel ou acima': 'Só Coronel para cima pode usar o cofre do Exército.',
    'cofre sem saldo': 'O cofre do Exército não tem esse valor.',
    'voce ja tem essa mascara': 'Você já tem essa máscara (cada uma é única).',
    'o carro ja esta na oficina': 'Esse carro já está na oficina.',
    'oficina invalida': 'Oficina inválida.',
    'servico invalido': 'Serviço inválido.',
    'o motor ja esta no maximo': 'O motor já está no máximo (nível 3).',
    'o carro ja e blindado': 'Esse carro já é blindado.',
    'so quem matou saqueia': 'Só quem matou pode saquear (e só por 90 s).',
    'aguarde para saquear': 'Espere um pouco para saquear de novo.',
    'caminhao ainda vazio': 'Esse caminhão ainda não carregou no Quartel: espere ele sair carregado.',
    'ja tem caminhao a caminho': 'Já tem um caminhão desse produto indo para lá.',
    'corporacao invalida': 'Corporação inválida.',
    'so o dono da empresa': 'Só o dono da empresa pode mudar a logo.',
    'envio de logo bloqueado': 'O envio de logo desta empresa está bloqueado pela moderação.',
    'imagem invalida': 'Imagem inválida.',
    'aguarde para enviar outra logo': 'Espere 5 minutos para enviar outra logo.',
    'logo invalida': 'Logo inválida.',
    'cor invalida': 'Cor inválida.',
    'logo nao esta em avaliacao': 'Essa logo não está mais em avaliação.',
    'nao pode votar na propria logo': 'Você não pode avaliar a logo da sua empresa.',
    'so administrador ou moderador': 'Só o administrador ou um moderador.',
    'jogador nao encontrado': 'Jogador não encontrado.',
    'so soldados do exercito': 'Só soldados do Exército recebem recompensa do cofre.',
    'nao pode se recompensar': 'Você não pode recompensar a si mesmo.',
    'valor de 100 a 1.000.000': 'Valor de 100 a 1.000.000.',
    'aguarde para pegar jujubas': 'Você já pegou rações há pouco. Espere 5 minutos.',
    'armazem vazio': 'O armazém está vazio: peça reposição ao Exército.',
    'a racao ainda esta fazendo efeito': 'A ração ainda está fazendo efeito.',
    'ja existe um pedido': 'Já existe um pedido de reposição em andamento.',
    'armazem cheio': 'O armazém já está cheio.',
    'empresa invalida': 'Escolha uma transportadora sua.',
    'esse carro nao e seu': 'Esse carro não é seu.',
    'o carro nao precisa de conserto': 'O carro não precisa de conserto.',
    'sem explosao': 'Não houve explosão.',
    'longe da explosao': 'Longe da explosão.',
    'atualize o jogo': 'Saiu uma versão nova do jogo: recarregue a página.',
    'conta banida': 'Esta conta foi banida.',
    'so transportadoras': 'Só transportadoras disputam a licitação.',
    'precisa nivel 5': 'A transportadora precisa ser nível 5 ou mais.',
    'lance invalido': 'Lance entre 10.000 e 5.000.000.',
    'contrato em andamento': 'Já há um contrato em andamento. A próxima licitação abre quando ele acabar.',
    'so o exercito': 'Só o Exército despacha as rações.',
    'pedido ja atendido': 'Esse pedido já foi atendido.',
    'longe do comprador': 'Leve o caminhão até o armazém do comprador em Vila Serra.',
    'o comprador nao tem tudo isso': 'O comprador não tem essa quantidade.',
    'loja fechada': 'A loja está fechada.',
    'quantidade invalida': 'Quantidade inválida.',
    'esse veiculo ja foi embora': 'Esse veículo já foi embora.',
    'policial nao sequestra': 'Policial em serviço não sequestra.',
    'aguarde para sequestrar': 'Espere um minuto antes de sequestrar outro veículo.',
    'onibus ja sequestrado': 'Esse ônibus já foi sequestrado.',
    'voce ja esta com um onibus': 'Você já está com um ônibus sequestrado.',
    'esse onibus ja foi embora': 'Esse ônibus já foi embora.',
    'so o cla que sequestrou': 'Só o clã que sequestrou pega esse ônibus.',
    'esse onibus nao esta com voce': 'Esse ônibus não está com você.',
    'aguarde para incendiar': 'Espere um pouco antes de pôr fogo em outro veículo.',
    'ja esta pegando fogo': 'Esse veículo já está pegando fogo.',
    'fogo grande so bombeiros': 'O fogo já cresceu: agora só os bombeiros apagam.',
    'policial nao incendeia': 'Policial em serviço não põe fogo em veículo.',
    'veiculo invalido': 'Veículo inválido.',
    'esconderijo invalido': 'Esconderijo inválido.',
    'ele e do seu cla': 'Ele é do seu clã.',
    'ele ja esta preso': 'Ele já está preso.',
    'ele nao esta preso': 'Ele não está mais preso.',
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
    'voce nao pode congelar esse jogador': 'Você não pode congelar esse jogador.',
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
    'voce esta preso': 'Você não pode fazer isso preso ou algemado.',
    'mochila cheia de sucata': 'Sua mochila já está cheia de sucata. Venda na loja.',
    'mochila cheia': 'Sua mochila está cheia desse item.',
    'nenhuma caixa embalada': 'Essa caixa não foi embalada por você.',
    'entrega rapida demais': 'Entrega rápida demais. Tente de novo em instantes.',
    'moedas insuficientes': 'Moedas insuficientes.',
    'fora do evento': 'Essa arma não está à venda agora (só durante o evento).',
    'os pneus estao bons': 'Os pneus desse carro estão bons.', 'roda invalida': 'Roda inválida.',
    'veiculo no patio': 'Esse veículo está no pátio do guincho.', 'o carro esta queimado: leve na oficina': 'O carro está queimado: leve na oficina.',
    'compre esse celular na loja': 'Compre esse celular na Loja de celulares.', 'voce ja tem esse celular': 'Você já tem esse celular.', 'modelo invalido': 'Modelo inválido.',
    'escolha um celular primeiro': 'Escolha o seu celular primeiro.', 'foto invalida': 'Foto inválida.', 'esse @usuario ja existe': 'Esse @usuário já existe. Escolha outro.',
    'crie seu perfil no Papo Reto': 'Crie o seu perfil no Papo Reto primeiro.', 'muitos posts: espere um pouco': 'Muitos posts seguidos: espere um pouco.',
    'perfil invalido': 'Perfil inválido.', 'post invalido': 'Você não pode denunciar o seu próprio post.', 'post nao encontrado': 'Post não encontrado.', 'comentarios fechados nesse post': 'Os comentários desse post estão fechados para você.',
    'calma: espere um pouco para comentar': 'Calma: espere um pouco para comentar de novo.',
    'esse carro nao esta com voce': 'Esse carro não está com você.', 'esse carro nao pode ser regularizado': 'Esse carro não pode ser regularizado.',
    'aviao ja revisado': 'Já está revisado.',
    'helicoptero invalido': 'Helicóptero inválido.',
    'so mecanicos': 'Só mecânicos fazem a revisão.',
    'aviao invalido': 'Avião inválido.',
    'espere um pouco': 'Espere um pouco.',
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
    'navio so marinha': 'Só a Marinha pilota: Tenente para cima nos destróieres e Capitão para cima no porta-aviões.',
    'navio ja tem piloto': 'Esse navio já tem alguém no leme.',
    'navio fora do mar': 'O navio não sai do mar.',
    'navio invalido': 'Navio inválido.',
    'entre 0 e 60 soldados': 'Escolha entre 0 e 60 soldados por base.',
    'base invalida': 'Base inválida.',
    'so general da marinha': 'Só um General da Marinha (ou o General Supremo) usa a Central de Mísseis.',
    'missil recarregando': 'O míssil de cruzeiro está recarregando: espere 10 min entre lançamentos.',
    'ja tem pedido esperando': 'Já tem um pedido de míssil esperando o General Supremo.',
    'alvo fora do mapa': 'Esse alvo está fora do mapa.',
    'so o general supremo': 'Só o General Supremo pode fazer isso.',
    'so militares do exercito': 'Só quem é das Forças Armadas pode ser transferido.',
    'alistamento precisa de aprovacao': 'O Exército exige aprovação: peça o alistamento na guarita do lado de fora do portão do quartel.',
    'voce ja e do exercito': 'Você já é do Exército.',
    'alistamento recusado: tente de novo mais tarde': 'Seu alistamento foi recusado há pouco. Tente de novo mais tarde.',
    'so oficiais do exercito': 'Só oficiais do Exército (Tenente para cima) aprovam alistamentos.',
    'o candidato nao pode entrar agora': 'O candidato não pode entrar agora (procurado, na polícia ou expulso).',
    'pedido invalido': 'Esse pedido já foi decidido.',
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
    'limite de 10 carros': 'Limite de 10 carros por jogador. Venda um para comprar outro.',
    'terreno ja vendido': 'Esse terreno já foi vendido.',
    'voce ja tem uma oficina': 'Você já tem uma oficina (uma por jogador).',
    'nome de oficina em uso': 'Já existe uma oficina com esse nome.',
    'voce nao tem oficina': 'Você não tem oficina.',
    'oficina no nivel maximo': 'A oficina já está no nível máximo.',
    'precos de 70 a 200 por cento': 'Os preços vão de 70% a 200% da tabela.',
    'servico exige oficina nivel 2': 'Essa oficina ainda não faz blindagem (precisa ser nível 2).',
    'esse motor exige oficina de nivel maior': 'Essa oficina ainda não faz esse motor (precisa de nível maior).',
    'so para amigos': 'Mensagem só para amigos. Adicione pelo menu 👥 Amigos.',
    'esse jogador nao recebe suas mensagens': 'Esse jogador não recebe suas mensagens.',
    'mensagem vazia': 'Escreva a mensagem.',
    'ja tem licitacao aberta': 'Já existe uma licitação aberta.',
    'nenhuma licitacao aberta': 'Não há licitação aberta.',
    'licitacao sem lances': 'Ninguém deu lance ainda: não dá para fechar.',
    'nenhum contrato vigente': 'Não há contrato vigente para quebrar.',
    'helicoptero so na loja': 'Helicóptero só se compra na Concessionária.',
    'local de entrega invalido': 'Estacionamento inválido para a entrega.',
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
export const roubarCarroRua = () => rpc('roubar_carro_rua');
export const onibusSeq = {
  ativos: () => rpc('onibus_sequestrados_ativos'),
  sequestrar: (linha, saida, modelo, cor, x, z, ang) => rpc('sequestrar_onibus', { p_linha: linha, p_saida: saida, p_modelo: modelo, p_cor: cor, p_x: x, p_z: z, p_ang: ang }),
  mover: (id, x, z, ang, largado) => rpc('mover_onibus_sequestrado', { p_id: id, p_x: x, p_z: z, p_ang: ang, p_largado: largado }),
  pegar: (id) => rpc('pegar_onibus_sequestrado', { p_id: id }),
};
export const assaltarNpc = () => rpc('assaltar_npc');
export const explodirIncendio = (id) => rpc('explodir_incendio', { p_incendio: id });
export const propagarFogo = (origem, ref, x, z, nome, porte) => rpc('propagar_fogo', { p_origem: origem, p_ref: ref, p_x: x, p_z: z, p_nome: nome, p_porte: porte });
export const consertarCarro = (id) => rpc('consertar_carro', { p_carro: id });
export const furarPneu = (id, roda, x, z) => rpc('furar_pneu', { p_carro: id, p_roda: roda, p_x: x, p_z: z });   // 22b
export const trocarPneus = (id) => rpc('trocar_pneus', { p_carro: id });
// 22e: lanternas desenhadas dos ônibus (medidas por modelo; só o admin salva)
export const lanternas = {
  listar: async () => { try { const { data } = await sb.from('lanternas_onibus').select('modelo,cfg'); return data || []; } catch { return []; } },
  salvar: (modelo, cfg) => rpc('admin_salvar_lanterna', { p_modelo: modelo, p_cfg: cfg }),
};
// 22d: pneu furado nos NPCs (encostam e esperam a Saveiro ou o guincho) e o mecânico do celular
export const pneuNpc = {
  furar: (ref, roda, x, z, ang) => rpc('furar_pneu_npc', { p_ref: ref, p_roda: roda, p_x: x, p_z: z, p_ang: ang }),
  ativas: () => rpc('npc_panes_ativas'),
  mecanico: (id) => rpc('mecanico_pneus', { p_carro: id }),
};
export const incendiarVeiculo = (ref, x, z, nome, porte) => rpc('incendiar_veiculo', { p_ref: ref, p_x: x, p_z: z, p_nome: nome, p_porte: porte });
export const destruirVeiculo = (ref, x, z, nome, porte) => rpc('destruir_veiculo', { p_ref: ref, p_x: x, p_z: z, p_nome: nome, p_porte: porte });   // 21y: tiro final ou foguete
export const cativeiro = {
  capturar: (alvo, local) => rpc('capturar_refem', { p_alvo: alvo, p_local: local }),
  libertar: (alvo) => rpc('libertar_refem', { p_alvo: alvo }),
};
export const conta = {
  excluir: () => rpc('excluir_minha_conta', { p_confirmacao: 'EXCLUIR' }),
  denunciar: (alvo, motivo, detalhes) => rpc('denunciar', { p_alvo: alvo, p_motivo: motivo, p_detalhes: detalhes || null }),
  bloquear: (alvo, sim) => rpc('bloquear', { p_alvo: alvo, p_sim: !!sim }),
  bloqueios: () => sel(sb.from('bloqueios').select('alvo,em,perfil:perfis!bloqueios_alvo_fkey(nome)')),
};
// proteções (ECA Digital): idade (só para o apoio/doação) e modo protegido dos pais (supabase/103_eca_digital.sql)
export const seguranca = {
  meus: () => rpc('meus_dados_privados'),
  nascimento: (d) => rpc('definir_nascimento', { p_data: d }),
  protegido: (ligar, pin) => rpc('modo_protegido', { p_ligar: !!ligar, p_pin: String(pin || '') }),
  liberarResponsavel: () => rpc('liberar_protecao_responsavel'),
};
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
  comprarColete: () => rpc('comprar_colete'),   // contrabandista: colete balístico (8.000)
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
export const configJogo = {
  async ler() { const { data, error } = await sb.from('config_jogo').select('*').eq('id', 1).maybeSingle(); if (error) throw error; return data; },
  salvar: (policia, crimes, chance) => rpc('admin_config', { p_policia: policia, p_crimes: crimes, p_chance: chance }),
  salvarRespawn: (seg) => rpc('admin_respawn', { p_seg: seg }),
  npcRua: (n) => rpc('admin_npc_rua', { p_qtd: n }),
  salvarFavela: (preco, aluguel) => rpc('admin_favela_precos', { p_preco: preco, p_aluguel: aluguel }),
  presos: async (desde) => (await sel(sb.from('bandidos_presos').select('ciclo').gte('ciclo', desde))) || [],
  prenderBandido: (ciclo) => rpc('prender_bandido', { p_ciclo: ciclo }),
  salvarFarda: (farda) => rpc('admin_farda', { p_farda: farda }),
  salvarHora: (desloc, fixa) => rpc('admin_hora', { p_desloc: desloc, p_fixa: fixa }),
};
export const clima = {
  async ler() { const { data, error } = await sb.from('clima').select('*').eq('id', 1).maybeSingle(); if (error) throw error; return data; },
  agora: (tipo, minutos) => rpc('admin_clima_agora', { p_tipo: tipo, p_minutos: minutos }),
  auto: (auto, chuva, tempestade, neve) => rpc('admin_clima_auto', { p_auto: auto, p_chuva: chuva, p_tempestade: tempestade, p_neve: neve }),
};

export const painel = {
  eventoDoacao: (quem, valor, nomes, titulo) => rpc('admin_evento_doacao', { p_quem: quem, p_valor: valor, p_nomes: nomes || null, p_titulo: titulo || null }),
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
  denuncias: () => rpc('admin_denuncias'),
  faltas: () => sel(sb.from('faltas').select('*, perfil:perfis!faltas_jogador_fkey(nome)').order('em', { ascending: false }).limit(80)),
  perdoarFaltas: (id) => rpc('perdoar_faltas', { p_jogador: id }),
  resolverDenuncia: (id) => rpc('admin_resolver_denuncia', { p_id: id }),
  papoDenuncias: () => rpc('admin_papo_denuncias'), papoResolver: (post) => rpc('admin_papo_resolver', { p_post: post }),   // 22b
  carreiras: (id) => rpc('admin_carreiras', { p_jogador: id }),
  promover: (id, carreira, nivel) => rpc('admin_promover', { p_jogador: id, p_carreira: carreira, p_nivel: nivel }),
  definirEmprego: (id, emprego) => rpc('admin_definir_emprego', { p_jogador: id, p_emprego: emprego }),
  banir: (alvo, motivo) => rpc('admin_banir', { alvo, motivo }),
  // 143: estátua, visível à força, contas no mesmo aparelho/IP
  congelar: (alvo, ligado, x, z) => rpc('admin_congelar', { alvo, ligado, px: x ?? null, pz: z ?? null }),
  forcarVisivel: (alvo) => rpc('admin_forcar_visivel', { alvo }),
  contasLigadas: (alvo) => rpc('admin_contas_ligadas', { alvo }),
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
  gasto: (tipo, v) => rpc('prefeito_gasto', { p_tipo: tipo, p_valor: v }),
  outdoors: () => sel(sb.from('outdoors').select('*').order('id')),
  alugarOutdoor: (id, min, tipo, empresa, texto) => rpc('alugar_outdoor', { p_outdoor: id, p_minutos: min, p_tipo: tipo, p_empresa: empresa, p_texto: texto }),
  adicional: (car, pct) => rpc('definir_adicional', { p_carreira: car, p_pct: pct }),
  doar: (nome, valor) => rpc('doar_verba', { p_nome: nome, p_valor: valor }),
  construir: (tipo, terreno, proprio) => rpc('prefeito_construir', { p_tipo: tipo, p_terreno: terreno, p_proprio: !!proprio }),
  programa: (id, ativo) => rpc('prefeito_programa', { p_obra: id, p_ativo: !!ativo }),
  valoresProgramas: (cras, vereador) => rpc('prefeito_valores_programa', { p_cras: cras, p_vereador: vereador }),
};
export const obras = {
  lista: () => sel(sb.from('obras').select('*').order('terreno')),
  processar: () => rpc('processar_obras'),
  demolir: (id) => rpc('demolir_obra', { p_obra: id }),
  terminar: (id) => rpc('admin_terminar_obra', { p_obra: id }),
  avancarCamara: () => rpc('admin_avancar_camara'),
  crasCadastrar: () => rpc('cras_cadastrar'),
  crasEstado: () => rpc('cras_estado'),
  camara: async () => (await sel(sb.from('camara').select('*').eq('id', 1).maybeSingle())),
  vereadores: (leg) => sel(sb.from('vereadores').select('*, perfil:perfis!vereadores_jogador_fkey(nome)').eq('legislatura', leg).order('votos', { ascending: false })),
  candidatar: () => rpc('camara_candidatar'),
  votar: (id) => rpc('camara_votar', { p_candidato: id }),
};
export const hospital = {
  pegar: (x, z) => rpc('almox_pegar', { p_x: x, p_z: z }),
  medicar: (alvo, x, z) => rpc('medicar', { p_alvo: alvo, p_x: x, p_z: z }),
  comissao: (v) => rpc('admin_comissao_remedio', { p_valor: v }),
  orcamento: (v) => rpc('admin_orcamento', { p_valor: v }),
};
export const prf = {
  entrar: () => rpc('entrar_prf'),
  sair: () => rpc('sair_prf'),
  salario: () => rpc('salario_prf'),
  investigar: () => rpc('prf_investigar'),
  computador: () => rpc('prf_computador'),
  pedirSigilo: (id) => rpc('prf_pedir_sigilo', { p_gasto: id }),
  verSigilo: (id) => rpc('prf_ver_sigilo', { p_pedido: id }),
  prender: (alvo) => rpc('prf_prender', { p_alvo: alvo }),
};
export const carros = {
  listar: () => sel(sb.from('carros').select('*').order('id')),
  comprar: (modelo, cor) => rpc('comprar_carro', { p_modelo: modelo, p_cor: cor }),
  comprarOnline: (modelo, cor, x, z, ang) => rpc('comprar_carro_online', { p_modelo: modelo, p_cor: cor, p_x: x, p_z: z, p_ang: ang }),
  estacionar: (id, x, z, ang) => rpc('estacionar_carro', { p_carro: id, p_x: x, p_z: z, p_ang: ang }),
  rebocar: (id, x, z, ang) => rpc('rebocar_carro', { p_carro: id, p_x: x, p_z: z, p_ang: ang }),
  acidente: (id) => rpc('acidente_carro', { p_carro: id }),
  materializar: (id, x, z, ang) => rpc('materializar_carro', { p_carro: id, p_x: x, p_z: z, p_ang: ang }),
  mecanico: (id, x, z) => rpc('chamar_mecanico', { p_carro: id, p_x: x, p_z: z }),
  vender: (id) => rpc('vender_carro', { p_carro: id }),
  roubar: (id) => rpc('roubar_carro', { p_carro: id }),
  bloquear: (id) => rpc('bloquear_carro', { p_carro: id }),
  liberar: (id) => rpc('liberar_carro', { p_carro: id }),
  regularizar: (id) => rpc('regularizar_carro', { p_carro: id }),   // 20z: roubado vira seu no mecânico (50%)
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
  perdaoTick: (perseguido) => rpc('perdao_tick', { p_perseguido: !!perseguido }),
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
  sequestrar: (id, x, z, ang) => rpc('sequestrar_veiculo_empresa', { p_caminhao: id, p_x: x, p_z: z, p_ang: ang }),
  chamar: (id, x, z) => rpc('chamar_veiculo', { p_caminhao: id, p_x: x, p_z: z }),
  materializar: (id, x, z, ang) => rpc('materializar_veiculo', { p_caminhao: id, p_x: x, p_z: z, p_ang: ang }),
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
  pauta: () => rpc('jornal_pauta'),
  salvar: (id, titulo, texto, imagem, quando) => rpc('salvar_materia', { p_id: id || null, p_titulo: titulo, p_texto: texto, p_imagem: imagem || null, p_publicar_em: quando || null }),
  apagar: (id) => rpc('apagar_materia', { p_id: id }),
};
export const navios = {
  lista: () => sel(sb.from('navios').select('id,piloto,modo,x,z,ang,t')),
  assumir: (id, x, z, ang) => rpc('assumir_navio', { p_navio: id, p_x: x, p_z: z, p_ang: ang }),
  mover: (id, x, z, ang) => rpc('mover_navio', { p_navio: id, p_x: x, p_z: z, p_ang: ang }),
  largar: (id, x, z, ang) => rpc('largar_navio', { p_navio: id, p_x: x, p_z: z, p_ang: ang }),
  chamar: (id, x, z, ang) => rpc('chamar_navio', { p_navio: id, p_x: x, p_z: z, p_ang: ang }),
};
export const guardas = {
  lista: () => sel(sb.from('guardas_bases').select('base,guardas')),
  definir: (base, n) => rpc('definir_guardas', { p_base: base, p_guardas: n }),
};
export const marinha = {
  pedirMissil: (x, z) => rpc('pedir_missil', { p_x: x, p_z: z }),
  pendente: () => rpc('missil_pendente'),
  decidir: (id, lancar) => rpc('decidir_missil', { p_id: id, p_lancar: !!lancar }),
  historico: () => rpc('missil_historico'),
  definirForca: (id, forca) => rpc('definir_forca', { p_jogador: id, p_forca: forca }),
  forcas: (ids) => ids.length ? sel(sb.from('perfis').select('id,forca').in('id', ids)) : Promise.resolve([]),
};
// laboratório da Área 51 (124): armaduras e autorização do General Supremo
export const lab = {
  minha: async () => { const u = (await sb.auth.getUser()).data.user; if (!u) return null; return (await sel(sb.from('armaduras').select('*').eq('dono', u.id)))[0] || null; },
  pegar: (modelo) => rpc('pegar_armadura', { p_modelo: modelo }),
  salvar: (f) => rpc('salvar_armadura', { p_blindagem: f }),
  perder: () => rpc('perder_armadura'),
  autorizar: (alvo, sim) => rpc('lab_autorizar', { p_alvo: alvo, p_sim: sim }),
  laser: (item) => rpc('pegar_laser', { p_item: item }),   // 125
  ofertar: (comprador, preco) => rpc('ofertar_armadura', { p_comprador: comprador, p_preco: preco }),
  aceitar: (vendedor) => rpc('aceitar_armadura', { p_vendedor: vendedor }),
  ofertas: () => sel(sb.from('armadura_ofertas').select('*')),
  vendas: () => rpc('vendas_armadura'),
  perdoar: (alvo) => rpc('perdoar_desertor', { p_alvo: alvo }),
  liberar: (alvo) => rpc('liberar_desertor', { p_alvo: alvo }),   // 126
  danos: () => sel(sb.from('laser_config').select('*')),
  definirDano: (item, dano) => rpc('definir_dano_laser', { p_item: item, p_dano: dano }),
};
export const exercito = {
  especializarParaquedista: () => rpc('especializar_paraquedista'),
  feriuInocente: (alvo, invasor) => rpc('militar_feriu_inocente', { p_alvo: alvo, p_invasor: invasor }),   // 19l: Cabo para cima
  pedirAlistamento: () => rpc('pedir_alistamento'),
  alistamentosPendentes: () => rpc('alistamentos_pendentes'),
  decidirAlistamento: (id, aprovar) => rpc('decidir_alistamento', { p_id: id, p_aprovar: !!aprovar }),
  prisao: (id, min) => rpc('prender_militar', { p_jogador: id, p_minutos: min }),
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
// caça ao tesouro (132): o baú do admin. A posição exata não é pública: o radar pergunta ao banco quando você chega perto
export const tesouro = {
  estado: () => rpc('bau_estado'),
  radar: (x, z) => rpc('bau_radar', { p_x: x, p_z: z }),
  abrir: (id, x, z) => rpc('abrir_bau', { p_id: id, p_x: x, p_z: z }),
  criar: (x, z, recompensas, minutos) => rpc('admin_criar_bau', { p_x: x, p_z: z, p_recompensas: recompensas, p_minutos: minutos }),
  cancelar: () => rpc('admin_cancelar_bau'),
  itens: () => sel(sb.from('precos').select('item, nome').order('nome')),
};
// 20w: Papai Noel (20 a 25/12; o admin antecipa para testar). A posição só vem pelo radar, de perto.
export const natal = {
  estado: () => rpc('natal_estado'),
  radar: (x, z) => rpc('natal_radar', { p_x: x, p_z: z }),
  pegar: (escolha, x, z) => rpc('natal_pegar', { p_escolha: escolha, p_x: x, p_z: z }),
  admin: (catalogo, pontos, testeMin) => rpc('admin_natal', { p_catalogo: catalogo, p_pontos: pontos, p_teste_min: testeMin }),
  onde: () => rpc('admin_natal_onde'),
};
// 20e: Viação Expresso Fator (ônibus rodoviário)
export const viacao = {
  estado: () => rpc('viacao_estado'),
  cadastrar: () => rpc('viacao_cadastrar'),
  sair: () => rpc('viacao_sair'),
  pegar: (vaga, x, z) => rpc('viacao_pegar', { p_vaga: vaga, p_x: x, p_z: z }),
  embarcar: (x, z) => rpc('viacao_embarcar', { p_x: x, p_z: z }),
  desembarcar: (x, z) => rpc('viacao_desembarcar', { p_x: x, p_z: z }),
  devolver: (x, z, desistir) => rpc('viacao_devolver', { p_x: x, p_z: z, p_desistir: !!desistir }),
  comprar: (modelo) => rpc('viacao_comprar', { p_modelo: modelo }),
  admin: (cfg) => rpc('admin_viacao', { p_cfg: cfg }),
};
export const bruxo = {
  estado: () => sel(sb.from('pedra_bruxo').select('*').eq('id', 1).maybeSingle()),
  esconder: (x, z) => rpc('esconder_pedra_bruxo', { p_x: x, p_z: z }),
  pegar: (x, z, bx, bz) => rpc('pegar_pedra_bruxo', { p_x: x, p_z: z, p_bx: bx, p_bz: bz }),
  desejo: (escolha) => rpc('bruxo_desejo', { p_escolha: escolha }),
};
export const contatos = {
  enviar: (para, texto) => rpc('enviar_mensagem', { p_para: para, p_texto: texto }),
  conversa: (outro) => rpc('conversa', { p_outro: outro }),
  naoLidas: () => rpc('nao_lidas'),
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
  financiamento: () => rpc('fin_estado'),
  financiar: (v, n) => rpc('fin_contratar', { p_valor: v, p_n: n }),
  pagarFin: (modo, v = 0) => rpc('fin_pagar', { p_modo: modo, p_valor: v }),
  cobrarFin: () => rpc('fin_processar'),
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
  npcApagar: (id) => rpc('npc_apagar', { p_incendio: id }),
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incendios' }, () => eventos.incendio?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'barricadas' }, () => eventos.barricada?.())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'arma_pd' }, (p) => eventos.armaPd?.(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedra_bruxo' }, (p) => eventos.pedra?.(p.new))
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
  alugarFavela: (id) => rpc('alugar_casa_favela', { p_casa: id }),
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
export const listarCasas = () => sel(sb.from('casas').select('id, x, z, preco, dono, tipo, rotulo, modelo, pai, nivel, inquilino, aluguel, pago_ate, a_venda, dono_perfil:perfis!casas_dono_fkey(nome), inquilino_perfil:perfis!casas_inquilino_fkey(nome)').or('tipo.neq.favela,dono.not.is.null,inquilino.not.is.null').order('id'));

export const autoescola = {
  iniciar: (cat) => rpc('iniciar_autoescola', { p_cat: cat }),
  concluir: (cat) => rpc('concluir_autoescola', { p_cat: cat }),
};
export const transporte = {
  pagarOnibus: (passageiros, pontual) => rpc('pagar_onibus', { p_passageiros: passageiros, p_pontual: pontual }),
  passagem: () => rpc('comprar_passagem'),
  pagarVoo: (porte) => rpc('pagar_voo', { p_porte: porte }),
  pagarTorre: () => rpc('pagar_torre'),
  tarifa: () => rpc('tarifa_onibus'),
  pagarFiscal: () => rpc('pagar_fiscal'),
  pagarColeta: (n) => rpc('pagar_coleta', { p_lixeiras: n }),
};
// aviação: paraquedas, foco de incêndio da queda e revisão da frota
export const aviacao = {
  comprarParaquedas: () => rpc('comprar_paraquedas'),
  usarParaquedas: () => rpc('usar_paraquedas'),
  incendioQueda: (x, z, nome) => rpc('incendio_queda', { p_x: x, p_z: z, p_nome: nome }),
  frota: () => sel(sb.from('avioes_frota').select('*').order('id')),
  voo: (aviao) => rpc('voo_frota', { p_aviao: aviao }),
  revisar: (aviao, mecanico) => rpc('revisar_aviao', { p_aviao: aviao, p_mecanico: !!mecanico }),
  helis: () => sel(sb.from('helis_revisao').select('*')),
  vooHeli: (chave) => rpc('voo_heli', { p_chave: chave }),
  revisarHeli: (chave, mecanico) => rpc('revisar_heli', { p_chave: chave, p_mecanico: !!mecanico }),
};

// ---------------------------------------------------------------- jujubas (ração militar), licitação e comprador ilegal
// logo das empresas na lona do baú (106): imagem própria (passa por avaliação) ou logo pronta do jogo
// 22a: celular (3 modelos) e a rede social Papo Reto (149)
export const armasEvento = {   // 22b: lasers de evento (152)
  listar: () => sel(sb.from('armas_evento').select('*').order('id')),
  comprar: (item) => rpc('comprar_arma_evento', { p_item: item }),
  liberar: (ids, minutos) => rpc('admin_liberar_armas_evento', { p_ids: ids, p_minutos: minutos }),
  presentear: (jogador, item) => rpc('admin_presentear_arma', { p_jogador: jogador, p_item: item }),
};
export const papo = {
  escolherCelular: (m) => rpc('escolher_celular', { p_modelo: m }),
  comprarCelular: (m) => rpc('comprar_celular', { p_modelo: m }),
  enviarFoto: async (blob) => {
    const eu = (await sb.auth.getUser()).data.user?.id; if (!eu) throw new Error('Faça login.');
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg', caminho = `${eu}/${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('papo').upload(caminho, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
    if (error) throw new Error(traduzir(error));
    return sb.storage.from('papo').getPublicUrl(caminho).data.publicUrl;
  },
  salvarPerfil: (usuario, nome, idade, bio, foto) => rpc('papo_salvar_perfil', { p_usuario: usuario, p_nome: nome, p_idade: idade, p_bio: bio, p_foto: foto || null }),
  postar: (foto, legenda, local, publico, comentarios) => rpc('papo_postar', { p_foto: foto, p_legenda: legenda, p_local: local, p_publico: publico, p_comentarios: comentarios }),
  apagar: (id) => rpc('papo_apagar', { p_post: id }),
  feed: (modo, antes) => rpc('papo_feed', { p_modo: modo, p_antes: antes ?? null }),
  perfil: (usuario) => rpc('papo_perfil', { p_usuario: usuario || null }),
  buscar: (t) => rpc('papo_buscar', { p_texto: t }),
  seguir: (usuario, sim) => rpc('papo_seguir', { p_usuario: usuario, p_sim: sim }),
  curtir: (id, sim) => rpc('papo_curtir', { p_post: id, p_sim: sim }),
  comentarios: (id) => rpc('papo_comentarios', { p_post: id }),
  comentar: (id, t) => rpc('papo_comentar', { p_post: id, p_texto: t }),
  apagarComentario: (id) => rpc('papo_apagar_comentario', { p_id: id }),
  denunciar: (id, motivo) => rpc('papo_denunciar', { p_post: id, p_motivo: motivo }),
};
// música da Saveiro com som enviada do celular (119): uma por jogador, a anterior é apagada
export const musicas = {
  enviar: async (arquivo) => {
    const eu = (await sb.auth.getUser()).data.user?.id; if (!eu) throw new Error('Faça login.');
    if (arquivo.size > 10 * 1024 * 1024) throw new Error('Música grande demais (máximo 10 MB).');
    const ext = (arquivo.name.match(/\.(mp3|m4a|aac|ogg|wav)$/i)?.[1] || 'mp3').toLowerCase();
    try { const { data } = await sb.storage.from('musicas').list(eu); if (data?.length) await sb.storage.from('musicas').remove(data.map((f) => `${eu}/${f.name}`)); } catch { /* sem anterior */ }
    const caminho = `${eu}/${Date.now()}.${ext}`;
    const tipo = arquivo.type || (ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : `audio/${ext}`);
    const { error } = await sb.storage.from('musicas').upload(caminho, arquivo, { contentType: tipo, upsert: false });
    if (error) throw new Error(error.message?.includes('row-level security') ? 'Só quem tem a Saveiro com som pode enviar música.' : /mime|type/i.test(error.message || '') ? 'Formato não aceito: use MP3.' : traduzir(error));
    return sb.storage.from('musicas').getPublicUrl(caminho).data.publicUrl;
  },
};
export const logos = {
  lista: () => sel(sb.from('empresa_logos').select('empresa, tipo, url, pronta, cor, status, motivo')),
  painel: () => rpc('logos_painel'),
  enviarImagem: async (empresa, blob) => {
    const caminho = `${empresa}/${Date.now()}.jpg`;
    const { error } = await sb.storage.from('logos').upload(caminho, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(error.message?.includes('row-level security') ? 'Só o dono da empresa pode enviar a logo.' : traduzir(error));
    const url = sb.storage.from('logos').getPublicUrl(caminho).data.publicUrl;
    return rpc('enviar_logo', { p_empresa: empresa, p_url: url });
  },
  pronta: (empresa, pronta, cor) => rpc('escolher_logo_pronta', { p_empresa: empresa, p_pronta: pronta, p_cor: cor }),
  tirar: (empresa) => rpc('tirar_logo', { p_empresa: empresa }),
  votar: (empresa, voto) => rpc('votar_logo', { p_empresa: empresa, p_voto: voto }),
  moderar: (empresa, acao, motivo = null) => rpc('moderar_logo', { p_empresa: empresa, p_acao: acao, p_motivo: motivo }),
};
// saque do morto (109): quem matou leva até 500 da carteira; NPC morto dá de 20 a 150
// oficinas autorizadas (110): pintura, motor e blindagem
export const oficinasJog = {
  listar: () => sel(sb.from('oficinas_jogadores').select('*').order('terreno')),
  comprar: (terreno, nome) => rpc('comprar_oficina', { p_terreno: terreno, p_nome: nome }),
  evoluir: () => rpc('evoluir_oficina'),
  precos: (pintura, motor, blindagem) => rpc('precos_oficina', { p_pintura: pintura, p_motor: motor, p_blindagem: blindagem }),
  sacar: (valor) => rpc('sacar_oficina', { p_valor: valor }),
  vender: () => rpc('vender_oficina'),
};
export const oficina = { servico: (carro, oficina, servico, cor = null) => rpc('oficina_servico', { p_carro: carro, p_oficina: oficina, p_servico: servico, p_cor: cor }) };
export const saque = {
  jogador: (id) => rpc('saquear_jogador', { p_vitima: id }),
  npc: () => rpc('saquear_npc'),
};
export const jujuba = {
  estado: async () => {
    const [armazens, pedidos, viagens, lic, cfg, mer] = await Promise.all([
      sel(sb.from('jujuba_armazens').select('*')),
      sel(sb.from('jujuba_pedidos').select('*').in('status', ['aberto', 'despachado']).order('id')),
      sel(sb.from('jujuba_viagens').select('*').in('status', ['em_rota', 'sequestrada']).order('id')),
      sel(sb.from('licitacoes').select('*').in('status', ['aberta', 'vigente']).order('id', { ascending: false }).limit(1)),
      sel(sb.from('jujuba_config').select('*')),
      sel(sb.from('jujuba_mercado').select('*')),
    ]);
    return { armazens, pedidos, viagens, licitacao: lic[0] || null, valor: cfg[0]?.valor_caminhao || 50000, mercado: mer[0]?.estoque || 0, mercadoAnti: mer[0]?.antiacido || 0 };
  },
  lances: (lic) => sel(sb.from('licitacao_lances').select('empresa, valor, em').eq('licitacao', lic).order('valor')),
  processar: () => rpc('processar_jujubas'),
  pegar: () => rpc('pegar_jujubas'),
  pegarRacao: (produto) => rpc('pegar_racao', { p_produto: produto }),
  enviarRacao: (corp, produto, modo, seg) => rpc('enviar_racao', { p_corp: corp, p_produto: produto, p_modo: modo, p_segundos: seg }),
  pedirRacao: (produto) => rpc('pedir_racao', { p_produto: produto }),
  usarAntiacido: () => rpc('usar_antiacido'),
  comprarAntiacido: (q) => rpc('comprar_antiacido', { p_qtd: q }),
  recompensar: (nome, valor, motivo) => rpc('recompensar_militar', { p_nome: nome, p_valor: valor, p_motivo: motivo }),
  cofre: async () => { try { return (await sel(sb.from('exercito_cofre').select('saldo')))[0]?.saldo || 0; } catch { return null; } },
  usar: () => rpc('usar_jujuba'),
  pedir: () => rpc('pedir_jujubas'),
  lance: (empresa, valor) => rpc('dar_lance', { p_empresa: empresa, p_valor: valor }),
  licitacaoPainel: () => rpc('licitacao_painel'),
  licitacaoComando: (acao) => rpc('licitacao_comando', { p_acao: acao }),
  valor: (v) => rpc('valor_caminhao_jujuba', { p_valor: v }),
  despachar: (pedido, modo, segundos) => rpc('despachar_jujubas', { p_pedido: pedido, p_modo: modo, p_segundos: segundos }),
  despacharLancadores: (segundos) => rpc('despachar_lancadores', { p_segundos: segundos }),
  lancadores: async () => { try { return (await sel(sb.from('lancadores_estoque').select('*')))[0] || null; } catch { return null; } },
  despacharKit: (corp, pedido, segundos) => rpc('despachar_kit', { p_corp: corp, p_pedido: pedido ?? null, p_segundos: segundos }),
  armamento: async () => { try { return await sel(sb.from('armamento_armazens').select('*')); } catch { return []; } },
  sequestrar: (id, x, z, ang) => rpc('sequestrar_jujubas', { p_viagem: id, p_x: x, p_z: z, p_ang: ang }),
  mover: (id, x, z, ang, largado) => rpc('mover_jujubas', { p_viagem: id, p_x: x, p_z: z, p_ang: ang, p_largado: largado }),
  pegarSeq: (id) => rpc('pegar_jujubas_seq', { p_viagem: id }),
  vender: (id, x, z) => rpc('vender_jujubas', { p_viagem: id, p_x: x, p_z: z }),
  comprar: (q) => rpc('comprar_jujubas', { p_qtd: q }),
};

// ---------------------------------------------------------------- polícia e armas, patrocinadores, Saveiro com som e equipe (85)
export const tatica = {
  entrarBope: () => rpc('entrar_bope'),
  sairBope: () => rpc('sair_bope'),
  kitBope: () => rpc('pegar_kit_bope'),
  armasArsenal: () => rpc('pegar_armas_arsenal'),
  pegarLancador: (item) => rpc('pegar_lancador', { p_item: item }),
  pegarSaque: (x, z) => rpc('pegar_saque_lancador', { p_x: x, p_z: z }),   // 123: saque de lançadores do clã no Seu Tonho
  comprarRpg: () => rpc('comprar_rpg'),
  comprarFoguetes: (qtd) => rpc('comprar_foguetes', { p_qtd: qtd }),
  usarFoguete: () => rpc('usar_foguete'),
  usarGranada: () => rpc('usar_granada'),
  barricadas: async () => { try { return await sel(sb.from('barricadas').select('*')); } catch { return []; } },
  comprarBarricada: (q) => rpc('comprar_barricada', { p_qtd: q }),
  colocarBarricada: (x, z, ang) => rpc('colocar_barricada', { p_x: x, p_z: z, p_ang: ang }),
  recolherBarricada: (id) => rpc('recolher_barricada', { p_id: id }),
  danificarBarricada: (id, dano) => rpc('danificar_barricada', { p_id: id, p_dano: dano }),
  tornarPatrocinador: () => rpc('tornar_patrocinador'),
  patrocinar: (cla, valor) => rpc('patrocinar_cla', { p_cla: cla, p_valor: valor }),
  fabricar: (item, qtd) => rpc('fabricar_armas', { p_item: item, p_qtd: qtd }),
  preco: (item, preco) => rpc('preco_patrocinio', { p_item: item, p_preco: preco }),
  meuEstoque: async (id) => { try { return await sel(sb.from('patrocinio_estoque').select('*').eq('dono', id)); } catch { return []; } },
  lojas: () => rpc('lojas_patrocinio'),
  comprar: (dono, item, qtd) => rpc('comprar_patrocinio', { p_dono: dono, p_item: item, p_qtd: qtd }),
  radar: () => rpc('radar_ilicito'),
  investigar: (id) => rpc('investigar_ilicito', { p_id: id }),
  registrarSom: (url, texto) => rpc('registrar_som', { p_url: url, p_texto: texto }),
  sonsRecentes: () => rpc('sons_recentes'),
  invisivel: (ligado) => rpc('staff_invisivel', { ligado }),
  // BOPE (86): indicação, prisão de quem foi abatido
  indicarBope: (alvo) => rpc('indicar_bope', { p_alvo: alvo }),
  podeIndicarBope: (id) => rpc('pode_indicar_bope', { p_id: id }),
  minhaIndicacao: async (id) => { try { return (await sel(sb.from('bope_indicacoes').select('*').eq('alvo', id)))[0] || null; } catch { return null; } },
  presoPeloBope: (policial) => rpc('preso_pelo_bope', { p_policial: policial || null }),
  // 87: armas desviadas (Seu Tonho), purgatório da arma dourada e nomes mortos
  tonhoEstoque: async () => { try { return await sel(sb.from('tonho_estoque').select('*')); } catch { return []; } },
  comprarTonho: (item) => rpc('comprar_tonho', { p_item: item }),
  minhasDesviadas: async (id) => { try { return await sel(sb.from('armas_desviadas').select('*').eq('dono', id).order('id')); } catch { return []; } },
  gastarDesviada: (id, n) => rpc('gastar_desviada', { p_id: id, p_n: n }),
  adminReviver: (alvo) => rpc('admin_reviver', { p_alvo: alvo }),
  oferecerChance: (alvo) => rpc('oferecer_segunda_chance', { p_alvo: alvo }),
  sairDoCeu: (modo, nome) => rpc('sair_do_ceu', { p_modo: modo, p_nome: nome || null }),
  nomesMortos: () => rpc('lista_nomes_mortos'),
};
