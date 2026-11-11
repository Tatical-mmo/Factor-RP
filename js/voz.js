// Chat de voz grátis: o áudio vai direto de um jogador para o outro (WebRTC, ponto a ponto).
// O canal da cidade (Supabase) só leva o "aperto de mão" da conexão (oferta e resposta).
// Modos: desligado, perto (quem está a até 40 m, volume pela distância) e clã (membros do clã online, em qualquer lugar).
// Fala apertando e segurando o botão 🎙️ (no PC, a tecla V).

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
const RAIO = 40, RAIO_SAI = 55, MAX_PARES = 8;

let ctx = null, modo = 'off', microfone = null, falando = false, tempo = 0;
const pares = new Map();   // id -> { pc, audio, criado }

export function iniciar(c) {
  ctx = c;
  try { modo = localStorage.getItem('fator_voz') || 'off'; } catch { modo = 'off'; }
  if (modo !== 'off') ligarMicrofone().catch(() => { modo = 'off'; });
}
export const modoAtual = () => modo;
export const estaFalando = () => falando;

async function ligarMicrofone() {
  if (microfone) return microfone;
  microfone = await window.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  for (const t of microfone.getAudioTracks()) t.enabled = falando;
  return microfone;
}

// troca o modo: desligado → perto → clã → desligado
export async function alternar() {
  const prox = modo === 'off' ? 'perto' : modo === 'perto' ? 'cla' : 'off';
  if (prox !== 'off') {
    try { await ligarMicrofone(); } catch { ctx.aviso('Sem acesso ao microfone. Permita o microfone no navegador para usar a voz.', 4); return modo; }
  }
  modo = prox;
  try { localStorage.setItem('fator_voz', modo); } catch { /* sem armazenamento */ }
  for (const id of [...pares.keys()]) fechar(id);
  if (modo === 'off' && microfone) { for (const t of microfone.getTracks()) t.stop(); microfone = null; }
  tempo = 0;
  return modo;
}

export function falar(sim) {
  falando = !!sim && modo !== 'off';
  if (microfone) for (const t of microfone.getAudioTracks()) t.enabled = falando;
}

// quem deve estar conectado agora
function desejados() {
  const eu = ctx.eu(), lista = [];
  if (!eu || modo === 'off') return lista;
  for (const r of ctx.outros()) {
    if (modo === 'cla') { if (eu.cla && r.cla === eu.cla) lista.push({ id: r.id, d: Math.hypot(r.x - eu.x, r.z - eu.z) }); }
    else { const d = Math.hypot(r.x - eu.x, r.z - eu.z); if (d < (pares.has(r.id) ? RAIO_SAI : RAIO)) lista.push({ id: r.id, d }); }
  }
  return lista.sort((a, b) => a.d - b.d).slice(0, MAX_PARES);
}

export function atualizar(dt) {
  if (!ctx) return;
  tempo -= dt;
  if (tempo <= 0) {
    tempo = 1.5;
    const quero = new Set(desejados().map((x) => x.id)), eu = ctx.eu();
    for (const id of [...pares.keys()]) if (!quero.has(id)) fechar(id);
    // quem tem o id "menor" chama; o outro só responde (evita os dois chamarem ao mesmo tempo)
    for (const id of quero) if (!pares.has(id) && eu && eu.id < id) chamar(id);
  }
  // volume pela distância no modo perto
  const eu = ctx.eu(); if (!eu) return;
  for (const [id, p] of pares) {
    if (!p.audio) continue;
    if (modo === 'perto') { const r = ctx.outros().find((x) => x.id === id); p.audio.volume = r ? Math.max(0, Math.min(1, 1 - Math.hypot(r.x - eu.x, r.z - eu.z) / RAIO_SAI)) : 0; }
    else p.audio.volume = 1;
  }
}

function novoPar(id) {
  const pc = new window.RTCPeerConnection({ iceServers: ICE });
  const p = { pc, audio: null, criado: Date.now() };
  if (microfone) for (const t of microfone.getAudioTracks()) pc.addTrack(t, microfone);
  else pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = (e) => {
    if (!p.audio) { p.audio = document.createElement('audio'); p.audio.autoplay = true; p.audio.playsInline = true; document.body.appendChild(p.audio); }
    p.audio.srcObject = e.streams[0] || new window.MediaStream([e.track]);
    p.audio.play?.().catch(() => {});
  };
  pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) fechar(id); };
  pares.set(id, p);
  return p;
}
// espera juntar os caminhos de rede (no máximo 2,5 s) e manda tudo de uma vez: menos mensagens no canal
function juntarIce(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((ok) => {
    const fim = () => { pc.removeEventListener('icegatheringstatechange', ver); ok(); };
    const ver = () => { if (pc.iceGatheringState === 'complete') fim(); };
    pc.addEventListener('icegatheringstatechange', ver); setTimeout(fim, 2500);
  });
}
async function chamar(id) {
  const p = novoPar(id);
  try {
    await p.pc.setLocalDescription(await p.pc.createOffer());
    await juntarIce(p.pc);
    ctx.enviar('voz', { de: ctx.eu().id, para: id, tipo: 'oferta', sdp: p.pc.localDescription.sdp, modo });
  } catch { fechar(id); }
}
export async function receber(m) {
  const eu = ctx?.eu(); if (!eu || m.para !== eu.id) return;
  if (m.tipo === 'fim') { fechar(m.de); return; }
  if (modo === 'off' || (m.modo && m.modo !== modo)) { ctx.enviar('voz', { de: eu.id, para: m.de, tipo: 'fim' }); return; }
  try {
    if (m.tipo === 'oferta') {
      if (pares.has(m.de)) fechar(m.de);
      const p = novoPar(m.de);
      await p.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      await p.pc.setLocalDescription(await p.pc.createAnswer());
      await juntarIce(p.pc);
      ctx.enviar('voz', { de: eu.id, para: m.de, tipo: 'resposta', sdp: p.pc.localDescription.sdp });
    } else if (m.tipo === 'resposta') {
      const p = pares.get(m.de); if (p && p.pc.signalingState === 'have-local-offer') await p.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
    }
  } catch { fechar(m.de); }
}
function fechar(id) {
  const p = pares.get(id); if (!p) return;
  pares.delete(id);
  try { p.pc.close(); } catch { /* já fechado */ }
  if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
}
export const conectados = () => [...pares.values()].filter((p) => p.pc.connectionState === 'connected').length;
