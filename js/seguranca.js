// Proteções do ECA Digital (Lei 15.211/2025) e da LGPD:
//  - filtro do chat: telefone, e-mail, links, redes sociais, endereço, CEP, CPF e Pix não passam (evita aliciamento);
//    palavrões viram ***. Vale para o que eu mando e para o que eu recebo (quem mexer no código não fura o filtro na tela dos outros).
//  - modo protegido: os pais ligam com um PIN; some o chat de texto (inclusive o privado de amigos) e a voz.
//  - denúncia direto na mensagem do chat (o texto vai junto como prova para a equipe).
//  - 💖 Apoie o jogo: doação voluntária, sem nenhuma recompensa no jogo, e só abre para maiores de 18 anos.
import * as rede from './rede.js';

export const CLASSIFICACAO = { idade: 16, motivos: 'violência, armas e crimes de faz de conta' };
export const APOIO_URL = '';   // GitHub Sponsors oculto (cadastro não concluído); para voltar: 'https://github.com/sponsors/Tatical-mmo'
export const APOIO_PIX = '60ceaecb-7c62-4786-95f0-2d958af022d3';   // chave aleatória (não mostra CPF, e-mail nem telefone)

let ctx = null, dados = { idade: null, protegido: false, tem_pin: false }, carregado = false, carregando = null;
export function iniciar(c) { ctx = c; carregando = carregar(); }
export async function carregar() {
  try { const d = await rede.seguranca.meus(); if (d) dados = d; carregado = true; } catch { /* sem o SQL 103: segue sem proteção extra */ }
  ctx?.aoMudar?.();
}
export const protegido = () => !!dados.protegido;
export const pronto = () => carregado;

// ---------------------------------------------------------------- idade (pedida uma vez, na primeira entrada)
// Ajusta o jogo à idade: menor de 16 já começa com o modo protegido (sem chat e sem voz) até um responsável liberar;
// menor de 18 não abre o 💖 Apoie. Devolve uma promessa que termina quando a pessoa respondeu (ou se não precisa).
export async function pedirIdadeSePreciso() {
  await carregando;
  if (!carregado || dados.idade != null) return;
  await new Promise((fim) => {
    const c = janela('🎂 Sua data de nascimento', `
      <p class="dica">Para deixar o jogo adequado à sua idade, informe sua data de nascimento. É pedida <b>só uma vez</b>, fica guardada
      em segredo e <b>não aparece para ninguém</b>.</p>
      <div class="botoes"><input id="segNasc" type="date" style="flex:1"><button id="segNascOk">Confirmar</button></div>
      <p class="dica" id="segMsg"></p>
      <p class="dica" style="opacity:.8">Menores de 16 anos começam com o chat e a voz desligados; um responsável pode liberar depois em
      ☰ › Modo protegido. Classificação indicativa: não recomendado para menores de 16 anos.</p>`);
    const x = document.getElementById('segFechar'); if (x) x.style.display = 'none';   // obrigatório
    c.querySelector('#segNascOk').onclick = async () => {
      const v = c.querySelector('#segNasc').value, m = c.querySelector('#segMsg');
      if (!v) { m.textContent = 'Escolha a data.'; m.style.color = '#ff8a80'; return; }
      try {
        dados.idade = await rede.seguranca.nascimento(v);
        await carregar();
        if (x) x.style.display = ''; fecharJanela();
        if (dados.idade < 16) ctx?.aviso('🛡️ Para a sua segurança, o chat e a voz começam desligados. Um responsável pode liberar em ☰ › Modo protegido.', 7);
        fim();
      } catch (e) { m.textContent = e.message; m.style.color = '#ff8a80'; }
    };
  });
}

// ---------------------------------------------------------------- filtro do chat
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const normal = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[013457@$]/g, (c) => LEET[c] || c);
const PALAVROES = ['porra', 'caralho', 'krl', 'merda', 'puta', 'puto', 'putaria', 'fdp', 'pqp', 'vsf', 'vtnc', 'tnc', 'foder', 'fuder', 'fode', 'fodase', 'foda', 'fudido',
  'buceta', 'boceta', 'xoxota', 'pau no cu', 'cu', 'cuzao', 'arrombado', 'arrombada', 'viado', 'viadinho', 'corno', 'otario', 'otaria', 'desgracado',
  'desgracada', 'cacete', 'piranha', 'vagabunda', 'vagabundo', 'bosta', 'retardado', 'retardada', 'baitola', 'sapatao', 'rapariga', 'punheta', 'siririca', 'piroca'];
const RE_PALAVRAO = new RegExp(`(^|[^a-z])(${PALAVROES.map((p) => p.replace(/ /g, '\\s+')).join('|')})(?=$|[^a-z])`, 'g');
const CONTATO = [
  /\b(https?:\/\/|www\.)\S+/i,                                                          // link
  /\b[\w-]{2,}\s*(\.|ponto)\s*(com|net|org|gg|io|me|tv|ly|app|xyz|site|online|link|info)(\s*(\.|ponto)\s*br)?\b/i,   // site.com / site ponto com
  /\b[\w.+-]+\s*(@|arroba)\s*[\w-]+\s*(\.|ponto)\s*\w+/i,                                 // e-mail
  /(^|\s)@[\w.]{3,}/,                                                                    // @perfil
  /\b(whats|whatsapp|wpp|zap|zapzap|insta|instagram|telegram|discord|tiktok|tik tok|snapchat|facebook|twitter|kwai|threads|onlyfans|cpf)\b/i,
  /\b(meu|seu|teu|me passa|passa|manda) (numero|telefone|cel|celular|endereco|zap|whats|pix|chave pix)\b/i,
  /\bonde (voce|vc|tu|cê|ce) mora\b/i,
  /\b(chave|meu|seu|teu|manda o|manda um|faz um|me faz um) pix\b/i,
  /\b(rua|r\.|av\.?|avenida|travessa|tv\.|alameda|rodovia|estrada|condominio|bairro)\s+[a-z].{0,40}\d/i,   // endereço com número
  /\b\d{5}\s*-?\s*\d{3}\b/,                                                              // CEP
];
function temTelefone(t) {
  for (const m of t.matchAll(/[+(]?\d[\d\s().\-/]{5,}\d/g)) if ((m[0].match(/\d/g) || []).length >= 8) return true;   // 8 ou mais dígitos juntos
  return false;
}
// devolve o texto (palavrões viram ***) e se tinha contato pessoal (aí a mensagem não deve ser mandada)
export function filtrar(texto) {
  const t = String(texto || ''), n = normal(t);
  const contato = temTelefone(t) || CONTATO.some((re) => re.test(n));
  let saida = '', i = 0;
  for (const m of n.matchAll(RE_PALAVRAO)) {   // mesmas posições do texto original (a normalização não muda o tamanho)
    const ini = m.index + m[1].length, fim = ini + m[2].length;
    saida += t.slice(i, ini) + '*'.repeat(Math.max(3, fim - ini)); i = fim;
  }
  saida += t.slice(i);
  return { texto: saida, contato };
}

// ---------------------------------------------------------------- janela própria
function janela(titulo, html) {
  let el = document.getElementById('segJanela');
  if (!el) {
    el = document.createElement('div'); el.id = 'segJanela'; el.className = 'modal oculto';
    el.innerHTML = '<div class="topo"><b id="segTitulo"></b><button id="segFechar" aria-label="Fechar">✕</button></div><div id="segConteudo" class="conteudo"></div>';
    document.body.appendChild(el); document.getElementById('segFechar').onclick = () => el.classList.add('oculto');
  }
  document.getElementById('segTitulo').textContent = titulo;
  const c = document.getElementById('segConteudo'); c.innerHTML = html;
  el.classList.remove('oculto');
  return c;
}
const fecharJanela = () => document.getElementById('segJanela')?.classList.add('oculto');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------------------------------------------------------- modo protegido (supervisão dos pais)
export function abrirProtegido() {
  const on = protegido();
  if (on && !dados.tem_pin) {   // ligado sozinho por ser menor de 16: o responsável libera
    const c = janela('🛡️ Modo protegido', `
      <p class="dica">O chat de texto e a voz estão <b>desligados</b> porque a idade informada é menor de 16 anos.</p>
      <p class="dica"><b>Pais ou responsáveis:</b> se vocês autorizam o uso do chat e da voz, confirmem abaixo. O jogo bloqueia telefone,
      endereço, links e redes sociais nas mensagens, e dá para denunciar e bloquear qualquer jogador. Depois, se quiserem, podem ligar o
      modo protegido de novo com um PIN só de vocês.</p>
      <label class="dica" style="display:flex;gap:8px;align-items:flex-start"><input id="segAut" type="checkbox" style="width:auto;margin-top:3px">
      <span>Sou pai, mãe ou responsável por este jogador e autorizo o chat e a voz.</span></label>
      <div class="botoes"><button id="segLiberar" style="flex:1">🔓 Liberar chat e voz</button></div>
      <p class="dica" id="segMsg"></p>`);
    c.querySelector('#segLiberar').onclick = async () => {
      const m = c.querySelector('#segMsg');
      if (!c.querySelector('#segAut').checked) { m.textContent = 'Marque a autorização do responsável.'; m.style.color = '#ff8a80'; return; }
      try { await rede.seguranca.liberarResponsavel(); await carregar(); ctx?.aviso('🔓 Chat e voz liberados pelo responsável.', 4); fecharJanela(); }
      catch (e) { m.textContent = e.message; m.style.color = '#ff8a80'; }
    };
    return;
  }
  const c = janela('🛡️ Modo protegido', `
    <p class="dica">Para pais e responsáveis. Com o modo protegido <b>ligado</b>, somem neste perfil:</p>
    <ul class="dica" style="margin:0 0 8px 18px"><li>o chat de texto (inclusive o privado com amigos);</li><li>o chat de voz.</li></ul>
    <p class="dica">Vale em qualquer aparelho em que a conta entrar. Para desligar, é preciso o mesmo PIN.
    ${on ? '<b style="color:#7ee08a">Está LIGADO agora.</b>' : '<b>Está desligado agora.</b>'}</p>
    <div class="botoes"><input id="segPin" type="password" inputmode="numeric" maxlength="8" placeholder="PIN (4 a 8 números)" autocomplete="off" style="flex:1">
    <button id="segPinOk">${on ? '🔓 Desligar' : '🔒 Ligar'}</button></div>
    <p class="dica" id="segMsg"></p>
    <p class="dica" style="opacity:.8">Esqueceu o PIN? A equipe do jogo pode desligar: escreva para approtaos@gmail.com com o nome do personagem.</p>`);
  const msg = (t, ok = true) => { const m = c.querySelector('#segMsg'); m.textContent = t; m.style.color = ok ? '#7ee08a' : '#ff8a80'; };
  c.querySelector('#segPinOk').onclick = async () => {
    const pin = c.querySelector('#segPin').value.trim();
    if (!/^\d{4,8}$/.test(pin)) { msg('O PIN deve ter de 4 a 8 números.', false); return; }
    try {
      const r = await rede.seguranca.protegido(!on, pin);
      if (r === 'pin_errado') { msg('PIN errado.', false); return; }
      if (r === 'travado') { msg('Muitas tentativas erradas: espere 15 minutos.', false); return; }
      dados.protegido = r === 'ligado'; dados.tem_pin = dados.protegido; ctx?.aoMudar?.();
      ctx?.aviso(dados.protegido ? '🛡️ Modo protegido ligado: chat e voz desligados neste perfil.' : '🔓 Modo protegido desligado.', 4);
      fecharJanela();
    } catch (e) { msg(/modo_protegido|schema cache|does not exist/i.test(e.message || '') ? 'Falta rodar o SQL 103 no Supabase.' : e.message, false); }
  };
}

// ---------------------------------------------------------------- 💖 apoio (doação), só para maiores de 18
export function abrirApoio() {
  if (dados.idade == null) {
    const c = janela('💖 Apoie o jogo', `
      <p class="dica">Esta área é <b>só para maiores de 18 anos</b>. Informe sua data de nascimento (só uma vez; ela fica guardada em
      segredo e não aparece para ninguém).</p>
      <div class="botoes"><input id="segNasc" type="date" style="flex:1"><button id="segNascOk">Continuar</button></div>
      <p class="dica" id="segMsg"></p>`);
    c.querySelector('#segNascOk').onclick = async () => {
      const v = c.querySelector('#segNasc').value, m = c.querySelector('#segMsg');
      if (!v) { m.textContent = 'Escolha a data.'; return; }
      try { dados.idade = await rede.seguranca.nascimento(v); await carregar(); abrirApoio(); } catch (e) { m.textContent = /definir_nascimento|schema cache|does not exist/i.test(e.message || '') ? 'Falta rodar o SQL 103 no Supabase.' : e.message; m.style.color = '#ff8a80'; }
    };
    return;
  }
  if (dados.idade < 18) {
    janela('💖 Apoie o jogo', '<p class="dica">Esta área é só para maiores de 18 anos. Obrigado por jogar! 😊</p>');
    return;
  }
  janela('💖 Apoie o jogo', `
    <p class="dica">O Fator RP é feito por uma pessoa só, nas horas vagas. Se você gosta do jogo e quiser ajudar a pagar os servidores e as
    melhorias, pode fazer uma <b>doação voluntária</b>.</p>
    <p class="aviso-item">⚠️ É uma <b>doação para a melhoria do jogo</b>: <b>não dá nenhuma recompensa</b> dentro do jogo (nem moedas, nem itens,
    nem vantagens). Doar ou não doar não muda nada na sua conta.</p>
    <div class="sub">Pix (qualquer valor)</div>
    <div class="botoes"><input id="segPix" readonly value="${esc(APOIO_PIX)}" style="flex:1;font-size:12px"><button id="segPixCopiar">📋 Copiar</button></div>
    <p class="dica" style="opacity:.8">Abra o app do seu banco, escolha Pix › Pagar com chave e cole a chave aleatória.</p>
    ${APOIO_URL ? `<div class="sub">Ou pelo GitHub</div>
    <div class="botoes"><a href="${esc(APOIO_URL)}" target="_blank" rel="noopener" style="flex:1"><button style="width:100%">💖 Página de apoio no GitHub Sponsors</button></a></div>` : ''}
    <p class="dica" style="opacity:.8">O pagamento é feito fora do jogo. Obrigado!</p>`);
  const cp = document.getElementById('segPixCopiar');
  if (cp) cp.onclick = () => {
    const ok = () => ctx?.aviso('📋 Chave Pix copiada. Obrigado pelo apoio!', 3);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(APOIO_PIX).then(ok, () => { document.getElementById('segPix').select(); ok(); });
    else { const i = document.getElementById('segPix'); i.select(); try { document.execCommand('copy'); } catch { /* copia manual */ } ok(); }
  };
}

// ---------------------------------------------------------------- tocar numa mensagem do chat
const MOTIVOS = [['ofensa', '🤬 Ofensa ou xingamento'], ['assedio', '😰 Assédio, ameaça ou pedido de contato'], ['nome', '🪪 Nome impróprio'], ['outro', '❓ Outro']];
export function menuMensagem(m) {
  if (!ctx || !m?.de) return;
  ctx.escolher(`💬 ${esc(m.nome)}`, `“${esc(m.texto)}”`, [
    { rotulo: '🚩 Denunciar esta mensagem', fn: () => ctx.escolher('🚩 Denunciar mensagem', 'Qual o problema? A mensagem vai junto para a equipe.', MOTIVOS.map(([k, t]) => ({
      rotulo: t, fn: () => rede.conta.denunciar(m.de, k, `Mensagem no chat${m.privado ? ' (privado)' : ''}: "${String(m.original || m.texto).slice(0, 360)}"`)
        .then(() => ctx.aviso('🚩 Denúncia enviada. A equipe vai analisar. Obrigado!', 4)).catch((e) => ctx.aviso(e.message, 4)),
    }))) },
    { rotulo: '🚫 Bloquear (some do meu chat e da minha voz)', fn: () => ctx.bloquear(m.de, m.nome) },
  ]);
}
