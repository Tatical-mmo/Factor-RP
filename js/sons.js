/* global fetch */
// Sons do jogo (Web Audio): efeitos únicos com volume pela distância e sons contínuos (sirenes,
// helicóptero, trem) cujo volume o jogo ajusta a cada quadro. O áudio só começa depois do primeiro
// toque/clique (regra dos navegadores). Botão 🔊 liga e desliga.

const ARQUIVOS = ['sirene_bombeiros', 'sirene_ambulancia', 'sirene_policia', 'helicoptero_baixo', 'helicoptero_alto',
  'buzina_trem', 'trem_andando', 'robo_conversando', 'tiro'];
const CONTINUOS = ['sirene_bombeiros', 'sirene_ambulancia', 'sirene_policia', 'helicoptero_baixo', 'helicoptero_alto', 'trem_andando'];
let ac = null, mestre = null, ligado = true;
const buffers = {}, lacos = {}, desejado = {};
try { ligado = localStorage.getItem('fatorSom') !== '0'; } catch { /* sem armazenamento */ }

function iniciarAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  ac = new C(); mestre = ac.createGain(); mestre.gain.value = ligado ? 0.8 : 0; mestre.connect(ac.destination);
  for (const n of ARQUIVOS) {
    fetch(`assets/sons/${n}.mp3`).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((buf) => {
      buffers[n] = buf;
      if (CONTINUOS.includes(n)) {
        const src = ac.createBufferSource(), g = ac.createGain();
        src.buffer = buf; src.loop = true; g.gain.value = 0; src.connect(g); g.connect(mestre); src.start(0, Math.random() * buf.duration);
        lacos[n] = g;
      }
    }).catch(() => {});
  }
}
export function preparar() {
  const ativar = () => iniciarAudio();
  window.addEventListener('pointerdown', ativar, { passive: true });
  window.addEventListener('keydown', ativar);
}
export const estaLigado = () => ligado;
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
// sons contínuos: o jogo diz o volume desejado de cada um neste quadro; aplicado com suavidade
export function continuo(nome, vol) { desejado[nome] = Math.max(desejado[nome] || 0, vol); }
export function atualizar() {
  if (!ac) return;
  for (const n of CONTINUOS) {
    const g = lacos[n]; if (!g) continue;
    const alvo = Math.min(1, desejado[n] || 0);
    g.gain.setTargetAtTime(alvo, ac.currentTime, 0.25);
    desejado[n] = 0;
  }
}
export const perto = (d, raio) => Math.max(0, 1 - d / raio);
