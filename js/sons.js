/* global fetch */
// Sons do jogo (Web Audio): efeitos únicos com volume pela distância e sons contínuos (sirenes,
// helicóptero, trem, motores, cidade, passarinhos e o tempo) cujo volume o jogo ajusta a cada quadro.
// O áudio só começa depois do primeiro toque/clique (regra dos navegadores). Botão 🔊 liga e desliga.
// Os sons longos (cidade e tempo) só são baixados quando vão tocar pela primeira vez.

const ARQUIVOS = ['sirene_bombeiros', 'sirene_ambulancia', 'sirene_policia', 'helicoptero_baixo', 'helicoptero_alto',
  'buzina_trem', 'trem_andando', 'robo_conversando', 'tiro',
  'carro_geral', 'carro_esportivo', 'motor_jipe', 'caminhao_andando', 'van', 'carro_partida', 'passaros'];
const SOB_DEMANDA = ['cidade_ambiente', 'chuva', 'tempestade', 'nevasca', 'aviao_fora', 'aviao_dentro', 'aviao_pequeno', 'aviao_medio', 'onibus_grande', 'onibus_pequeno'];
const CONTINUOS = ['sirene_bombeiros', 'sirene_ambulancia', 'sirene_policia', 'helicoptero_baixo', 'helicoptero_alto', 'trem_andando',
  'carro_geral', 'carro_esportivo', 'motor_jipe', 'caminhao_andando', 'van', 'passaros', ...SOB_DEMANDA];
let ac = null, mestre = null, ligado = true;
const buffers = {}, lacos = {}, desejado = {}, taxa = {}, pedidos = new Set();
try { ligado = localStorage.getItem('fatorSom') !== '0'; } catch { /* sem armazenamento */ }

function carregar(n) {
  if (pedidos.has(n)) return; pedidos.add(n);
  fetch(`assets/sons/${n}.mp3`).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((buf) => {
    buffers[n] = buf;
    if (CONTINUOS.includes(n)) {
      const src = ac.createBufferSource(), g = ac.createGain(), ini = Math.random() * buf.duration;
      src.buffer = buf; src.loop = true; g.gain.value = 0; src.connect(g); g.connect(mestre); src.start(0, ini);
      lacos[n] = { g, src, ini, t0: ac.currentTime, rate: 1, pos: ini, tPos: ac.currentTime };
    }
  }).catch(() => { pedidos.delete(n); });
}
function iniciarAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  ac = new C(); mestre = ac.createGain(); mestre.gain.value = ligado ? 0.8 : 0; mestre.connect(ac.destination);
  for (const n of ARQUIVOS) carregar(n);
}
export function preparar() {
  const ativar = () => iniciarAudio();
  window.addEventListener('pointerdown', ativar, { passive: true });
  window.addEventListener('keydown', ativar);
}
export const estaLigado = () => ligado;
export const pronto = (nome) => !!(ac && ligado && lacos[nome]);
export function alternar() {
  ligado = !ligado;
  try { localStorage.setItem('fatorSom', ligado ? '1' : '0'); } catch { /* sem armazenamento */ }
  iniciarAudio();
  if (mestre) mestre.gain.value = ligado ? 0.8 : 0;
  return ligado;
}
// efeito único; dist em metros (som some a partir de "raio")
export function tocar(nome, { vol = 1, dist = 0, raio = 60, velocidade = 1 } = {}) {
  if (!ac || !buffers[nome] || !ligado) return;
  const v = vol * Math.max(0, 1 - dist / raio); if (v < 0.02) return;
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = buffers[nome]; src.playbackRate.value = velocidade; g.gain.value = v;
  src.connect(g); g.connect(mestre); src.start();
}
// sons contínuos: o jogo diz o volume desejado de cada um neste quadro (e, se quiser, a velocidade de reprodução,
// que muda o tom do motor); aplicado com suavidade
export function continuo(nome, vol, velocidade) {
  if (vol > (desejado[nome] || 0)) { desejado[nome] = vol; if (velocidade) taxa[nome] = velocidade; }
  if (vol > 0.01 && ac && SOB_DEMANDA.includes(nome)) carregar(nome);
}
export function atualizar() {
  if (!ac) return;
  for (const n of CONTINUOS) {
    const l = lacos[n]; if (!l) continue;
    const alvo = Math.min(1, desejado[n] || 0);
    l.g.gain.setTargetAtTime(alvo, ac.currentTime, 0.25);
    const r = taxa[n] || 1;
    if (Math.abs(r - l.rate) > 0.01) {   // guarda a posição para saber em que ponto do áudio estamos
      l.pos += (ac.currentTime - l.tPos) * l.rate; l.tPos = ac.currentTime; l.rate = r;
      l.src.playbackRate.setTargetAtTime(r, ac.currentTime, 0.15);
    }
    desejado[n] = 0; taxa[n] = 0;
  }
}
// em que segundo do áudio contínuo estamos (para sincronizar o relâmpago com o trovão)
export function posicao(nome) {
  const l = lacos[nome]; if (!l || !ac) return null;
  const p = l.pos + (ac.currentTime - l.tPos) * l.rate;
  return ((p % l.src.buffer.duration) + l.src.buffer.duration) % l.src.buffer.duration;
}
export const perto = (d, raio) => Math.max(0, 1 - d / raio);
