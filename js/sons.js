/* global fetch */
// Sons do jogo (Web Audio): efeitos únicos com volume pela distância e sons contínuos (sirenes,
// helicóptero, trem, motores, cidade, passarinhos e o tempo) cujo volume o jogo ajusta a cada quadro.
// O áudio só começa depois do primeiro toque/clique (regra dos navegadores). Botão 🔊 liga e desliga.
// Os sons longos (cidade e tempo) só são baixados quando vão tocar pela primeira vez.

const ARQUIVOS = ['sirene_bombeiros', 'sirene_ambulancia', 'sirene_policia', 'helicoptero_baixo', 'helicoptero_alto',
  'buzina_trem', 'trem_andando', 'robo_conversando', 'tiro', 'laser',
  'carro_partida', 'passaros', 'explosao_carro', 'explosao_grande', 'explosao_longe', 'explosao_agua', 'corvos', 'apagado', 'em_cana', 'soco1', 'soco2', 'soco_metal',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((i) => [`passo_duro_${i}`, `passo_grama_${i}`])];   // 20g: passos um a um (sorteados), não mais um laço
const SOB_DEMANDA = ['onibus_viagem', 'cidade_ambiente', 'cidade_noite', 'noite_cidades', 'chuva', 'tempestade', 'nevasca', 'aviao_fora', 'aviao_dentro', 'aviao_pequeno', 'aviao_medio', 'onibus_grande', 'onibus_pequeno',
  // motores novos (laços de marcha lenta e de rotação alta), baixados quando tocam pela primeira vez
  ...['classico', 'popular', 'esportivo', 'presidencial', 'suv', 'jipe', 'van', 'caminhao', 'onibus', 'onibusN', 'caminhaoN', 'moto250', 'moto650', 'aviaoG', 'aviaoGG', 'aviaoM', 'aviaoP'].flatMap((p) => [`${p}_lenta`, `${p}_alto`])];   // 20z: onibusN/caminhaoN = sons novos
const CONTINUOS = ['sirene_bombeiros', 'sirene_ambulancia', 'sirene_policia', 'helicoptero_baixo', 'helicoptero_alto', 'trem_andando',
  'passaros', ...SOB_DEMANDA];
let ac = null, mestre = null, ligado = true;
const esperando = {}, buffers = {}, lacos = {}, desejado = {}, taxa = {}, pedidos = new Set();
try { ligado = localStorage.getItem('fatorSom') !== '0'; } catch { /* sem armazenamento */ }

// 20u: o avião gigante toca o som do grande duas vezes (uma cópia do laço, começando noutro ponto e num tom um
// pouquinho diferente), para soar como mais motores
const APELIDO = { aviaoGG_lenta: 'aviaoG_lenta', aviaoGG_alto: 'aviaoG_alto', toque_celular: 'toque_celular_v2', caminhaoN_alto: 'onibusN_alto', caminhaoN_partida: 'onibusN_partida', moto250_partida: 'moto_partida', moto650_partida: 'moto_partida' };   // 20z: o caminhão usa a partida e o andar do ônibus (mais graves)   // 20l: toque com som de alto-falante de celular
function carregar(n) {
  if (pedidos.has(n)) return; pedidos.add(n);
  fetch(n.startsWith('vz_') ? `assets/sons/vozes/${n.slice(3)}.mp3?v=1` : `assets/sons/${APELIDO[n] || n}.mp3`).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((buf) => {
    buffers[n] = buf;
    const e = esperando[n]; delete esperando[n];   // efeito pedido antes de baixar: toca se ainda for a hora
    if (e && performance.now() - e.t < 1500) tocar(n, e.op);
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
// 20j: toque do celular. O jogo diz o volume a cada quadro (1 = o seu celular; mais baixo = o de alguém perto);
// começa do início quando passa a tocar e para quando ninguém perto está recebendo ligação
let toqueCel = null, toqueVol = 0;
export function toqueCelular(vol) { toqueVol = Math.max(toqueVol, vol); }
function atualizarToque() {
  const v = toqueVol; toqueVol = 0;
  if (v > 0.01 && !buffers.toque_celular) { carregar('toque_celular'); return; }
  if (v > 0.01 && !toqueCel) {
    const src = ac.createBufferSource(), g = ac.createGain(); src.buffer = buffers.toque_celular; src.loop = true; g.gain.value = v;
    src.connect(g); g.connect(mestre); src.start(); toqueCel = { src, g, zero: 0 };
  } else if (toqueCel) {
    toqueCel.g.gain.setTargetAtTime(v, ac.currentTime, 0.08);
    toqueCel.zero = v > 0.01 ? 0 : toqueCel.zero + 1;
    if (toqueCel.zero > 20) { try { toqueCel.src.stop(); } catch { /* já parou */ } toqueCel = null; }
  }
}
export const tocaDoJogo = () => !!(ac && ligado);
// 20u: "tic" do acerto (gerado na hora, curtinho e baixo; só quem atirou ouve)
let tTic = 0;
export function ticAcerto() {
  if (!ac || !ligado || ac.currentTime - tTic < 0.05) return; tTic = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = 'triangle'; o.frequency.setValueAtTime(2100, t); o.frequency.exponentialRampToValueAtTime(1300, t + 0.05);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g); g.connect(mestre); o.start(t); o.stop(t + 0.08);
}
// som da tela de APAGADO / EM CANA: toca cheio e abaixa o resto do jogo por alguns segundos
export function tocarTela(nome, seg = 3.5) {
  if (!ac || !ligado) return;
  if (!buffers[nome]) { carregar(nome); return; }
  const src = ac.createBufferSource(), g = ac.createGain(), t = ac.currentTime;
  src.buffer = buffers[nome]; g.gain.value = 1; src.connect(g); g.connect(ac.destination); src.start();
  mestre.gain.cancelScheduledValues(t); mestre.gain.setValueAtTime(mestre.gain.value, t);
  mestre.gain.linearRampToValueAtTime(0.18, t + 0.3); mestre.gain.setValueAtTime(0.18, t + seg); mestre.gain.linearRampToValueAtTime(ligado ? 0.8 : 0, t + seg + 1.2);
}
// 21e: narração (tutorial): uma fala por vez, interrompível; abaixa os outros sons enquanto fala
let narr = null, narrQuer = null;
export function narrar(nome) {
  pararNarracao(); narrQuer = nome;
  if (!ac) iniciarAudio();
  if (!ac || !ligado) return;
  const n = 'vz_' + nome;
  if (!buffers[n]) { carregar(n); const t0 = performance.now(); const espera = () => { if (narrQuer !== nome) return; if (buffers[n]) narrar(nome); else if (performance.now() - t0 < 8000) setTimeout(espera, 150); }; setTimeout(espera, 150); return; }
  const src = ac.createBufferSource(), g = ac.createGain(), t = ac.currentTime;
  src.buffer = buffers[n]; g.gain.value = 1; src.connect(g); g.connect(ac.destination); src.start();
  mestre.gain.cancelScheduledValues(t); mestre.gain.setValueAtTime(mestre.gain.value, t); mestre.gain.linearRampToValueAtTime(ligado ? 0.25 : 0, t + 0.3);
  src.onended = () => { if (narr?.src === src) pararNarracao(); };
  narr = { src, g };
}
export function pararNarracao() {
  narrQuer = null;
  if (!narr) return;
  const { src } = narr; narr = null;
  try { src.onended = null; src.stop(); } catch { /* já parou */ }
  if (ac) { const t = ac.currentTime; mestre.gain.cancelScheduledValues(t); mestre.gain.setValueAtTime(mestre.gain.value, t); mestre.gain.linearRampToValueAtTime(ligado ? 0.8 : 0, t + 0.6); }
}
// efeito único; dist em metros (som some a partir de "raio")
export function tocar(nome, { vol = 1, dist = 0, raio = 60, velocidade = 1 } = {}) {
  if (!ac || !ligado) return;
  if (!buffers[nome]) { carregar(nome); esperando[nome] = { t: performance.now(), op: { vol, dist, raio, velocidade } }; return; }   // partidas e roncos são baixados na primeira vez
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
  atualizarZumbido(); atualizarToque();
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
// "clique" do rádio (chiado curto + bipe), gerado na hora: sem arquivo
export function radio() {
  if (!ac || !ligado) return;
  const t = ac.currentTime, n = Math.floor(ac.sampleRate * 0.12), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) * 0.35;
  const ru = ac.createBufferSource(), fr = ac.createBiquadFilter(), g = ac.createGain();
  ru.buffer = buf; fr.type = 'bandpass'; fr.frequency.value = 1800; fr.Q.value = 0.8; g.gain.value = 0.25;
  ru.connect(fr); fr.connect(g); g.connect(mestre); ru.start(t);
  const o = ac.createOscillator(), go = ac.createGain(); o.type = 'square'; o.frequency.value = 1250;
  go.gain.setValueAtTime(0.0001, t + 0.1); go.gain.exponentialRampToValueAtTime(0.06, t + 0.11); go.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(go); go.connect(mestre); o.start(t + 0.1); o.stop(t + 0.22);
}

// óvni: zumbido grave que pulsa (gerado na hora, sem arquivo). O jogo pede o volume a cada quadro.
let zum = null, zumVol = 0;
// sirenes de alarme antiaéreo (20q): uma voz por sirene, sintetizada (uivo que sobe e desce). O jogo ajusta o volume e o
// atraso de cada uma pela distância (o som anda ~340 m/s: a mais longe chega depois e mais fraca, como um eco)
let alarme = null;
export function alarmeLigar(n) {
  if (!ac || alarme) return;
  const t = ac.currentTime, filtro = ac.createBiquadFilter(), saida = ac.createGain();
  filtro.type = 'lowpass'; filtro.frequency.value = 1900; filtro.Q.value = 0.7; saida.gain.value = 1; filtro.connect(saida); saida.connect(mestre);
  const vozes = [];
  for (let i = 0; i < n; i++) {
    const g = ac.createGain(), atraso = ac.createDelay(4), lfo = ac.createOscillator(), prof = ac.createGain();
    g.gain.value = 0; atraso.delayTime.value = 0; g.connect(atraso); atraso.connect(filtro);
    lfo.type = 'sine'; lfo.frequency.value = 0.075 + Math.random() * 0.012; prof.gain.value = 230; lfo.connect(prof);   // cada motor gira num ritmo um pouco diferente
    const oscs = [['sawtooth', 0], ['square', 4]].map(([tipo, det]) => { const o = ac.createOscillator(); o.type = tipo; o.frequency.value = 480; o.detune.value = det; prof.connect(o.frequency); const go = ac.createGain(); go.gain.value = tipo === 'square' ? 0.35 : 0.6; o.connect(go); go.connect(g); o.start(t); return o; });
    lfo.start(t, Math.random() * 3);
    vozes.push({ g, atraso, lfo, oscs });
  }
  alarme = { vozes, saida };
}
export function alarmeVol(i, vol, atrasoSeg) {
  const v = alarme?.vozes[i]; if (!v) return;
  const t = ac.currentTime; v.g.gain.setTargetAtTime(Math.max(0, vol), t, 0.4); v.atraso.delayTime.setTargetAtTime(Math.min(3.9, Math.max(0, atrasoSeg)), t, 0.6);
}
export function alarmeDesligar() {
  if (!alarme) return; const a = alarme; alarme = null; const t = ac.currentTime;
  a.saida.gain.setTargetAtTime(0, t, 0.8);
  setTimeout(() => { for (const v of a.vozes) { for (const o of v.oscs) { try { o.stop(); } catch { /* já parou */ } } try { v.lfo.stop(); } catch { /* já parou */ } } a.saida.disconnect(); }, 4500);
}
// tiro batendo em armadura (20m): "tlim" metálico sintetizado (dois tons agudos que somem rápido + um estalo de ruído)
export function metal({ vol = 1, dist = 0, raio = 45 } = {}) {
  if (!ac || !ligado || ac.state !== 'running') return;
  const v = vol * Math.max(0, 1 - dist / raio); if (v < 0.02) return;
  const t = ac.currentTime, g = ac.createGain(); g.connect(mestre);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  const f0 = 2300 + Math.random() * 900;
  for (const f of [f0, f0 * 1.51]) { const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.92, t + 0.3); o.connect(g); o.start(t); o.stop(t + 0.36); }
  const n = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.04), ac.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ac.createBufferSource(), gn = ac.createGain(); src.buffer = n; gn.gain.value = 0.25 * v; src.connect(gn); gn.connect(mestre); src.start(t);
}
export function zumbido(vol) { zumVol = Math.max(zumVol, vol); }
function atualizarZumbido() {
  if (!ac) return;
  if (!zum && zumVol > 0.01) {
    const o1 = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain(), f = ac.createBiquadFilter();
    o1.type = 'sawtooth'; o1.frequency.value = 62; o2.type = 'sine'; o2.frequency.value = 124.7; lfo.frequency.value = 3.2; lg.gain.value = 14;
    lfo.connect(lg); lg.connect(o1.frequency); f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(mestre); o1.start(); o2.start(); lfo.start();
    zum = { g };
  }
  if (zum) zum.g.gain.setTargetAtTime(Math.min(0.5, zumVol) * 0.5, ac.currentTime, 0.3);
  zumVol = 0;
}
// feixe de abdução: varredura subindo com chiado
export function abducao() {
  if (!ac || !ligado) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(1400, t + 4.5);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.4); g.gain.setValueAtTime(0.22, t + 4); g.gain.exponentialRampToValueAtTime(0.0001, t + 5.2);
  o.connect(g); g.connect(mestre); o.start(t); o.stop(t + 5.3);
}
