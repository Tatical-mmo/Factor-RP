// Serviços da cidade em tempo real: incêndios (fogo, fumaça e jatos d'água), ponto do emprego,
// placar da guerra de clãs e o processamento periódico (guerras e focos de incêndio).
import * as THREE from 'three';
import * as rede from './rede.js';
import * as civico from './civico.js';
import { ruaC, caminhoRuas } from './mundo.js';

let ctx = null;
let incendios = [], tempoFogo = 2, tempoProc = 20, tempoPonto = 45, esperaPonto = 0, tempoGuerra = 3;
let guerras = [], hud = null, apagando = null;
const vistos = new Set(), focos = new Map(), jatos = [];
const matAgua = new THREE.MeshBasicMaterial({ color: '#cfeaff', transparent: true, opacity: 0.6, depthWrite: false });
const geoGota = new THREE.SphereGeometry(0.08, 6, 4);
// ---- jato contínuo (21o): um tubo d'água em arco do bico até o fogo (fino no bico, abrindo em leque no fim), com
// listras de água correndo, névoa onde bate e gotas soltas. No helicóptero vira uma cortina caindo do balde.
const SEG = 28, LADOS = 10;
let jatoMalha = null, nevoas = [], tNevoa = 0;
function texturaFluxo() {
  const W = 64, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, W, H);   // água contínua (meio transparente) com fios mais claros por cima
  for (let i = 0; i < 90; i++) {   // fios d'água compridos, claros, em alturas e larguras diferentes
    const x = Math.random() * W, y = Math.random() * H, l = 30 + Math.random() * 90, w = 1 + Math.random() * 3, a = 0.35 + Math.random() * 0.65;
    const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x, y, w, l); if (y + l > H) g.fillRect(x, y - H, w, l);
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3); return t;
}
function texturaNevoa() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(235,245,255,0.35)'); gr.addColorStop(1, 'rgba(235,245,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
}
function montarJato() {
  const pos = new Float32Array((SEG + 1) * LADOS * 3), uv = new Float32Array((SEG + 1) * LADOS * 2), idx = [];
  for (let i = 0; i <= SEG; i++) for (let k = 0; k < LADOS; k++) { uv[(i * LADOS + k) * 2] = k / (LADOS - 1); uv[(i * LADOS + k) * 2 + 1] = i / SEG; }
  for (let i = 0; i < SEG; i++) for (let k = 0; k < LADOS; k++) { const a = i * LADOS + k, b = i * LADOS + (k + 1) % LADOS, c = a + LADOS, d = b + LADOS; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ color: '#e6f5ff', emissive: '#1b3a52', emissiveIntensity: 0.35, roughness: 0.12, metalness: 0, envMapIntensity: 1.6, transparent: true, opacity: 0.9, alphaMap: texturaFluxo(), depthWrite: false, side: THREE.DoubleSide });
  jatoMalha = new THREE.Mesh(geo, mat); jatoMalha.frustumCulled = false; jatoMalha.renderOrder = 3; jatoMalha.visible = false; ctx.scene.add(jatoMalha);
  const mn = new THREE.SpriteMaterial({ map: texturaNevoa(), color: '#eef6ff', transparent: true, opacity: 0, depthWrite: false });
  for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(mn.clone()); s.visible = false; s.userData = { vida: Math.random(), x: 0, z: 0 }; ctx.scene.add(s); nevoas.push(s); }
}
const _o = new THREE.Vector3(), _f = new THREE.Vector3(), _c = new THREE.Vector3(), _pt = new THREE.Vector3(), _tg = new THREE.Vector3(), _n1 = new THREE.Vector3(), _n2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function origemJatoAgora() {
  const j = ctx.jogador(), doAlto = ctx.origemJato?.(), alcance = ctx.alcanceJato?.() || 10;
  if (doAlto) return { o: _o.copy(doAlto), alto: true };
  if (alcance > 10) return { o: _o.set(j.pos.x, j.pos.y + 3.6, j.pos.z), alto: false };
  return { o: _o.set(j.pos.x + Math.sin(j.yaw || 0) * 0.5, j.pos.y + 1.3, j.pos.z + Math.cos(j.yaw || 0) * 0.5), alto: false };
}
function atualizarJatoContinuo(dt) {
  const f = apagando && incendios.find((x) => x.id === apagando.id);
  if (!jatoMalha) { if (!f) return; montarJato(); }
  jatoMalha.visible = !!f;
  for (const s of nevoas) if (!f) s.visible = false;
  if (!f) return;
  const { o, alto } = origemJatoAgora(), hf = ctx.altura(f.x, f.z) + (alto ? 0 : 1.1);
  _f.set(f.x, hf, f.z);
  const dist = Math.hypot(f.x - o.x, f.z - o.z);
  // arco: o ponto de controle sobe (mangueira) ou fica logo abaixo do balde (helicóptero: a água cai quase reta)
  if (alto) _c.set((o.x * 3 + f.x) / 4, o.y - 2, (o.z * 3 + f.z) / 4); else _c.set((o.x + f.x) / 2, Math.max(o.y, hf) + dist * 0.22, (o.z + f.z) / 2);
  const P = jatoMalha.geometry.attributes.position, arr = P.array, t0 = performance.now() / 1000;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    _pt.set(a * o.x + b * _c.x + c * _f.x, a * o.y + b * _c.y + c * _f.y, a * o.z + b * _c.z + c * _f.z);
    _tg.set(2 * (1 - t) * (_c.x - o.x) + 2 * t * (_f.x - _c.x), 2 * (1 - t) * (_c.y - o.y) + 2 * t * (_f.y - _c.y), 2 * (1 - t) * (_c.z - o.z) + 2 * t * (_f.z - _c.z)).normalize();
    _n1.crossVectors(_tg, _up); if (_n1.lengthSq() < 1e-4) _n1.set(1, 0, 0); _n1.normalize(); _n2.crossVectors(_n1, _tg).normalize();
    // fino no bico, abre no fim; uma ondulação leve deixa o jato "vivo"
    const r = (alto ? 0.35 + t * 1.6 : 0.1 + t * t * 0.8) * (1 + 0.12 * Math.sin(t0 * 23 + i * 1.7));
    for (let k = 0; k < LADOS; k++) {
      const ang = k / LADOS * Math.PI * 2, cx = Math.cos(ang) * r, cy = Math.sin(ang) * r * (alto ? 1 : 0.8), q = (i * LADOS + k) * 3;
      arr[q] = _pt.x + _n1.x * cx + _n2.x * cy; arr[q + 1] = _pt.y + _n1.y * cx + _n2.y * cy; arr[q + 2] = _pt.z + _n1.z * cx + _n2.z * cy;
    }
  }
  P.needsUpdate = true; jatoMalha.geometry.computeVertexNormals();
  jatoMalha.material.alphaMap.offset.y -= dt * (alto ? 1.6 : 2.6);   // a água correndo do bico para o fogo
  // névoa onde a água bate (sobe e se espalha); pingos soltos saindo do jato
  for (const s of nevoas) {
    const u = s.userData; u.vida += dt / (alto ? 1.4 : 1.0);
    if (u.vida >= 1) { u.vida = 0; const a = Math.random() * Math.PI * 2, rr = Math.random() * (alto ? 2.2 : 1.2); u.x = Math.cos(a) * rr; u.z = Math.sin(a) * rr; }
    const v = u.vida; s.visible = true; s.position.set(f.x + u.x * (1 + v), ctx.altura(f.x, f.z) + 0.4 + v * (alto ? 2.5 : 1.6), f.z + u.z * (1 + v));
    const e = (alto ? 2.2 : 1.3) + v * (alto ? 3 : 2); s.scale.set(e, e, 1); s.material.opacity = Math.sin(v * Math.PI) * (alto ? 0.5 : 0.42);
  }
  if ((tNevoa -= dt) <= 0) { tNevoa = 0.06; esguichar(f, alto ? o.clone().setY(o.y - 1) : o.clone(), 2); }
}
let texMancha = null;
function mancha() {     // ponto suave (centro claro, borda transparente) para chamas, brilho e fumaça
  if (texMancha) return texMancha;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  texMancha = new THREE.CanvasTexture(c); return texMancha;
}
const COR_CHAMA = [new THREE.Color('#fff4b0'), new THREE.Color('#ffb21f'), new THREE.Color('#ff5a10'), new THREE.Color('#9a1800')];
function corChama(u, alvo) {   // u de 0 (base, quente) a 1 (topo, frio)
  const k = Math.min(2.999, u * 3), i = Math.floor(k);
  return alvo.copy(COR_CHAMA[i]).lerp(COR_CHAMA[i + 1], k - i);
}

export function iniciar(contexto) {
  ctx = contexto;
  hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:30;background:rgba(120,20,20,.92);color:#fff;padding:5px 12px;border-radius:10px;font:600 13px system-ui;display:none;pointer-events:none;white-space:nowrap';
  document.body.appendChild(hud);
}

export const listaIncendios = () => incendios;
// vida que sobra: os caminhões NPC vão apagando com o tempo (mesma conta do servidor, vida_incendio)
// queda de aeronave: baixa de 45 s até 150 s · casa/empresa: de 80 s até 180 s
// veículo: baixa de 40 s até 150 s
const desdeFogo = (f) => (ctx.agora() - Date.parse(f.inicio)) / 1000;
export function vidaFogo(f) {
  const desde = desdeFogo(f), max = f.vida_max || 10;
  const [ini, dur] = f.tipo === 'queda' ? [45, 105] : f.tipo === 'veiculo' ? [40, 110] : [80, 100];
  const k = Math.min(1, Math.max(0, (desde - ini) / dur));
  return Math.max(0, Math.min(f.vida, Math.ceil(max * (1 - k))));
}
// fogo de veículo nos primeiros 20 s: ainda pequeno, qualquer um abafa
export const fogoNoComeco = (f) => f.tipo === 'veiculo' && desdeFogo(f) < 20;
// o quanto o fogo do veículo já cresceu (0 = chama pequena, 1 = veículo todo em chamas, ~90 s)
export const crescimentoFogo = (f) => (f.tipo === 'veiculo' ? Math.min(1, 0.12 + desdeFogo(f) / 90) : 1);
// caminhões que saem para cada fogo: avião 3, helicóptero 2, ônibus/caminhão 2, casa/empresa/carro 1 (avião e veículo saem antes)
const caminhoesDoFogo = (f) => (f.tipo === 'veiculo' ? (f.porte >= 2 ? 2 : 1) : f.tipo !== 'queda' ? 1 : /avi/i.test(f.nome) ? 3 : 2);
const saidaDoFogo = (f) => (f.tipo === 'queda' ? 15 : f.tipo === 'veiculo' ? 10 : 60);
// caminhão da ronda que foi atender (some da ronda até voltar)
export function rondasOcupadas() { const r = new Set(); for (const n of npcs.values()) if (n.ronda !== undefined) r.add(n.ronda); return r; }
export const guerrasAtivas = () => guerras;

// nomes dos clãs em guerra com o meu clã agora (para a etiqueta INIMIGO)
export function clasInimigos(meuCla, clas) {
  const r = new Set(), agora = ctx.agora();
  for (const g of guerras) {
    if (g.status !== 'aceita' || agora < Date.parse(g.inicio) || agora > Date.parse(g.fim)) continue;
    const outro = g.desafiante === meuCla ? g.desafiado : g.desafiado === meuCla ? g.desafiante : null;
    if (outro) { const c = clas.find((x) => x.id === outro); if (c) r.add(c.nome); }
  }
  return r;
}

function criarFoco(f) {
  const g = new THREE.Group(), tex = mancha();
  const chamas = [], fumacas = [];
  for (let k = 0; k < 46; k++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#ffb21f', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.userData = { vida: Math.random(), dur: 0.55 + Math.random() * 0.6, x0: 0, z0: 0, sobe: 0 };
    g.add(m); chamas.push(m);
  }
  for (let k = 0; k < 16; k++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#2b2b2b', transparent: true, opacity: 0, depthWrite: false }));
    m.userData = { vida: k / 16, dur: 4 + Math.random() * 1.5, dx: (Math.random() - 0.5) * 2, dz: (Math.random() - 0.5) * 2 };
    g.add(m); fumacas.push(m);
  }
  // gráfico ultra: brasas (faíscas que sobem dançando) e o miolo bem quente (branco-amarelado) no pé do fogo
  const brasas = [], miolo = [];
  for (let k = 0; k < 34; k++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#ffcf6a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.userData = { vida: Math.random(), dur: 1.6 + Math.random() * 1.8, x0: 0, z0: 0, sobe: 0, fase: Math.random() * 6 }; m.visible = false; g.add(m); brasas.push(m);
  }
  for (let k = 0; k < 14; k++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#fff3c0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.userData = { vida: Math.random(), dur: 0.35 + Math.random() * 0.3, x0: 0, z0: 0 }; m.visible = false; g.add(m); miolo.push(m);
  }
  // brilho alaranjado no chão e marca de queimado
  const brilho = new THREE.Mesh(new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, color: '#ff6a1a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  brilho.position.y = 0.06; g.add(brilho);
  const queimado = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1a1410', transparent: true, opacity: 0.6, depthWrite: false }));
  queimado.position.y = 0.04; g.add(queimado);
  const placa = ctx.textoSprite(`🔥 FOGO · ${f.nome}`, { escala: 0.8, fundo: 'rgba(190,60,10,.92)' }); placa.position.y = f.tipo === 'veiculo' ? 5.5 : 8; g.add(placa);
  if (f.tipo === 'veiculo') { const k = f.porte >= 2 ? 0.75 : 0.45; brilho.scale.setScalar(k); queimado.scale.setScalar(k * 1.3); }
  g.position.set(f.x, ctx.altura(f.x, f.z), f.z);
  ctx.scene.add(g);
  return { g, chamas, fumacas, brilho, brasas, miolo };
}

const corTmp = new THREE.Color();
const pedidoNpc = new Map();
function atualizarFocos(dt) {
  const t = performance.now() / 1000, ativos = new Set();
  // os caminhões NPC terminaram: o fogo some e o servidor confere (no máximo um pedido a cada 5 s por fogo)
  for (const f of incendios) if (vidaFogo(f) <= 0 && !(t < (pedidoNpc.get(f.id) || 0))) {
    pedidoNpc.set(f.id, t + 5);
    rede.saude.npcApagar(f.id).then((ok) => { if (ok) incendios = incendios.filter((x) => x.id !== f.id); }).catch(() => {});
  }
  for (const f of incendios) {
    ativos.add(f.id);
    let o = focos.get(f.id);
    if (!o) { o = criarFoco(f); focos.set(f.id, o); }
    const cresce = crescimentoFogo(f), forca = f.tipo === 'veiculo' ? Math.max(0.12, cresce * Math.min(1, vidaFogo(f) / (f.vida_max || 12) + 0.15)) * (f.porte >= 2 ? 1.15 : 0.85) : 0.3 + 0.7 * vidaFogo(f) / 10;
    const raio = (f.tipo === 'veiculo' ? (f.porte >= 2 ? 3.2 : 1.6) : 2.4) * forca;
    for (let k = 0; k < o.chamas.length; k++) o.chamas[k].visible = f.tipo !== 'veiculo' || k < 6 + cresce * (o.chamas.length - 6);
    for (const c of o.chamas) {
      const u = c.userData; u.vida += dt / u.dur;
      if (u.vida >= 1) { u.vida = 0; const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * raio; u.x0 = Math.cos(a) * r; u.z0 = Math.sin(a) * r; u.sobe = (3 + Math.random() * 3) * forca; }
      const v = u.vida;
      c.position.set(u.x0 * (1 - v * 0.6) + Math.sin(t * 3 + u.x0) * 0.2, 0.3 + v * u.sobe * u.dur * 1.4, u.z0 * (1 - v * 0.6));
      const esc = (1.9 - v * 1.5) * (0.6 + forca * 0.6); c.scale.set(esc, esc * 1.35, 1);
      c.material.color.copy(corChama(v, corTmp)); c.material.opacity = Math.min(1, (1 - v) * 1.6) * 0.9;
    }
    for (const sm of o.fumacas) {
      const u = sm.userData; u.vida += dt / u.dur; if (u.vida >= 1) u.vida = 0;
      const v = u.vida;
      sm.position.set(u.dx * (0.5 + v * 2) + Math.sin(t * 0.7 + u.dx) * 0.6, 2.5 + v * 13 * (0.5 + forca * 0.5), u.dz * (0.5 + v * 2));
      const esc = (2 + v * 6) * (0.5 + forca * 0.5); sm.scale.set(esc, esc, 1);
      sm.material.opacity = Math.sin(v * Math.PI) * 0.5 * (0.4 + forca * 0.6);
    }
    o.brilho.material.opacity = (0.35 + 0.25 * Math.sin(t * 11) * Math.sin(t * 7.3)) * forca + 0.1;
    const ultra = ctx.ultra?.();
    for (const b of o.brasas) {
      b.visible = !!ultra; if (!ultra) continue;
      const u = b.userData; u.vida += dt / u.dur;
      if (u.vida >= 1) { u.vida = 0; const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * raio; u.x0 = Math.cos(a) * r; u.z0 = Math.sin(a) * r; u.sobe = (5 + Math.random() * 7) * (0.5 + forca * 0.5); }
      const v = u.vida; b.position.set(u.x0 + Math.sin(t * 2.3 + u.fase) * 0.7 * v, 0.5 + v * u.sobe, u.z0 + Math.cos(t * 1.9 + u.fase) * 0.7 * v);
      const e = 0.14 * (1 - v * 0.6); b.scale.set(e, e, 1); b.material.opacity = Math.min(1, (1 - v) * 2) * (0.6 + 0.4 * Math.sin(t * 20 + u.fase));
    }
    for (const c of o.miolo) {
      c.visible = !!ultra; if (!ultra) continue;
      const u = c.userData; u.vida += dt / u.dur;
      if (u.vida >= 1) { u.vida = 0; const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * raio * 0.55; u.x0 = Math.cos(a) * r; u.z0 = Math.sin(a) * r; }
      const v = u.vida; c.position.set(u.x0, 0.25 + v * 1.4 * forca, u.z0);
      const e = (1.3 - v) * (0.5 + forca * 0.5); c.scale.set(e, e * 1.2, 1); c.material.opacity = (1 - v) * 0.8;
    }
    if (ultra) for (const sm of o.fumacas) sm.material.opacity = Math.min(0.75, sm.material.opacity * 1.35);   // fumaça mais densa
  }
  luzDoFogo(dt, t);
  for (const [id, o] of focos) if (!ativos.has(id)) { ctx.scene.remove(o.g); o.g.traverse((x) => x.material?.dispose?.()); focos.delete(id); }
  // jatos d'água
  atualizarJatoContinuo(dt);
  for (let i = jatos.length - 1; i >= 0; i--) {
    const jt = jatos[i]; jt.vida -= dt; jt.v.y -= 9.8 * dt; jt.m.position.addScaledVector(jt.v, dt);
    if (jt.vida <= 0) { ctx.scene.remove(jt.m); jatos.splice(i, 1); }
  }
}

// gráfico ultra: o fogo mais perto ilumina em volta (uma luz laranja que treme); fica sempre na cena e só apaga, para não
// recompilar os materiais
let luzFogo = null;
function luzDoFogo(dt, t) {
  const ultra = ctx.ultra?.();
  if (!ultra) { if (luzFogo) luzFogo.visible = false; return; }
  if (!luzFogo) { luzFogo = new THREE.PointLight('#ff7a2a', 0, 26, 1.5); ctx.scene.add(luzFogo); }
  luzFogo.visible = true;
  const p = ctx.jogador().pos; let m = null, dm = 140;
  for (const f of incendios) { const d = Math.hypot(f.x - p.x, f.z - p.z); if (d < dm) { dm = d; m = f; } }
  if (!m) { luzFogo.intensity = 0; return; }
  luzFogo.position.set(m.x, ctx.altura(m.x, m.z) + 2.2, m.z);
  luzFogo.intensity = (m.tipo === 'veiculo' ? 18 : 30) * (0.8 + 0.2 * Math.sin(t * 13) * Math.sin(t * 7.7) + 0.08 * Math.sin(t * 31));
}
function esguichar(f, origem = null, n = 14) {
  const p = origem || ctx.jogador().pos, h = origem ? origem.y : p.y + 1.3;
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(geoGota, matAgua); m.position.set(p.x, h, p.z);
    const tempo = 0.55 + Math.random() * 0.2 + (origem ? 0.3 : 0), dx = f.x - p.x + (Math.random() - 0.5) * 2, dz = f.z - p.z + (Math.random() - 0.5) * 2;
    ctx.scene.add(m);
    jatos.push({ m, vida: tempo, v: new THREE.Vector3(dx / tempo, 4.9 * tempo - (h - ctx.altura(f.x, f.z) - 1) / tempo, dz / tempo) });
  }
}

export function fogoProximo(raio = ctx?.alcanceJato?.() ? ctx.alcanceJato() - 1 : 9) {
  const p = ctx.jogador().pos;
  let melhor = null, dm = raio;
  for (const f of incendios) { const d = Math.hypot(f.x - p.x, f.z - p.z); if (d < dm) { dm = d; melhor = f; } }
  return melhor;
}
export const estaApagando = () => !!apagando;
export const recarregarFogo = () => carregarFogo();

// segura o jato: 1 por segundo enquanto estiver perto, até apagar
export function apagar(f) {
  if (apagando) { apagando = null; ctx.aviso('Você parou de jogar água.'); return; }
  apagando = { id: f.id, t: 0 };
  ctx.aviso('Jogando água no fogo… fique perto.', 2);
}
async function passoApagar(dt) {
  if (!apagando) return;
  apagando.t -= dt;
  if (apagando.t > 0) return;
  apagando.t = 1;
  const f = incendios.find((x) => x.id === apagando.id);
  const j = ctx.jogador();
  const alcance = ctx.alcanceJato?.() || 10;
  if (!f || j.morto || Math.hypot(f.x - j.pos.x, f.z - j.pos.z) > alcance) { apagando = null; return; }
  const doAlto = ctx.origemJato?.();   // helicóptero: a água cai lá de cima
  esguichar(f, doAlto || (alcance > 10 ? new THREE.Vector3(j.pos.x, j.pos.y + 3.6, j.pos.z) : null), doAlto ? 30 : alcance > 10 ? 22 : 14);
  try {
    const v = await rede.saude.apagar(f.id);
    f.vida = v;
    if (v <= 0) {
      apagando = null; incendios = incendios.filter((x) => x.id !== f.id);
      ctx.aviso(ctx.perfil()?.profissao === 'bombeiro' ? '🚒 Fogo apagado! +400 moedas' : f.tipo === 'veiculo' ? '🧯 Você abafou o fogo a tempo!' : '🚒 Fogo apagado!', 4);
      if (ctx.rastreio()?.nome?.startsWith('🔥')) ctx.rastrear(null);
    } else ctx.aviso(f.tipo === 'veiculo' && ctx.perfil()?.profissao !== 'bombeiro' ? `Abafando… falta pouco (${v})` : `Apagando… ${v} jatos restantes`, 1.2);
  } catch (e) { apagando = null; ctx.aviso(e.message); }
}

function carregarFogo() {
  rede.saude.incendios().then((lista) => {
    incendios = lista;
    const bombeiro = ctx.perfil()?.profissao === 'bombeiro';
    const r = ctx.rastreio();   // fogo apagado (por alguém ou pela prefeitura): some do rastreio
    if (r?.nome?.startsWith('🔥') && !lista.some((f) => Math.hypot(f.x - r.x, f.z - r.z) < 1)) ctx.rastrear(null);
    for (const f of lista) {
      if (vistos.has(f.id)) continue;
      vistos.add(f.id);
      if (bombeiro) { ctx.aviso(`🔥 Incêndio na ${f.nome}! Vá até lá apagar (+400).`, 5); if (!ctx.rastreio()) ctx.rastrear({ nome: `🔥 ${f.nome}`, x: f.x, z: f.z }); }
      else if (f.tipo !== 'veiculo') {   // quem está perto também vê o aviso (o fogo aparece para todos no mesmo lugar)
        const p = ctx.jogador()?.pos, d = p ? Math.hypot(f.x - p.x, f.z - p.z) : Infinity;
        if (d < 220) ctx.aviso(`🔥 Fogo na ${f.nome}, a ${Math.round(d)} m de você!`, 4);
      }
    }
  }).catch(() => {});
}

function carregarGuerras() {
  rede.guerra.listar().then((l) => { guerras = l; ctx.guerrasMudaram?.(); }).catch(() => {});
}

function desenharHud() {
  const meu = ctx.meuCla(); const agora = ctx.agora();
  const g = meu && guerras.find((x) => x.status === 'aceita' && (x.desafiante === meu || x.desafiado === meu) && agora < Date.parse(x.fim) && agora > Date.parse(x.inicio) - 10 * 60000);
  if (!g) { hud.style.display = 'none'; return; }
  const nome = (id) => ctx.clas().find((c) => c.id === id)?.nome || '?';
  const ini = Date.parse(g.inicio), fim = Date.parse(g.fim);
  const s = Math.max(0, Math.round(((agora < ini ? ini : fim) - agora) / 1000));
  const rel = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  hud.textContent = agora < ini ? `⚔️ Guerra contra ${nome(g.desafiante === meu ? g.desafiado : g.desafiante)} começa em ${rel}`
    : `⚔️ ${nome(g.desafiante)} ${g.pontos_a} × ${g.pontos_b} ${nome(g.desafiado)} · ${rel}`;
  hud.style.display = 'block';
}

function baterPonto() {
  if (esperaPonto > 0) return;
  const j = ctx.jogador();
  if (j.morto || j.dentroCasa || j.trem) return;
  rede.empregos.ponto(j.pos.x, j.pos.z).then((r) => {
    if (r.pago > 0 || r.caixas > 0) ctx.aviso(`⏱️ Ponto batido: +${r.pago} de salário${r.caixas ? ' · +1 caixa produzida' : ''}`, 2.5);
  }).catch((e) => { if (/não tem emprego|dono não bate/.test(e.message)) esperaPonto = 300; });
}

// ---------------------------------------------------------------- NPCs: caminhão dos bombeiros e ambulância
const npcs = new Map();     // chave -> { obj, pts, t0, vel, volta, ... }
function ruaMaisPerto(v) { let m = ruaC(0), d = Infinity; for (let i = -7; i <= 11; i++) { const c = ruaC(i); if (Math.abs(c - v) < d) { d = Math.abs(c - v); m = c; } } return m; }
// caminho pelas ruas (em L): sai para a rua, anda na horizontal, depois na vertical e entra no destino
// só pelas ruas de verdade (grafo do asfalto) e para no meio-fio mais perto do destino, sem entrar no terreno;
// sem ligação pelas ruas (rodovias), usa o caminho em L antigo
export function rotaRuas(a, b, parar = 0, faixa = 2.4) {
  const c = caminhoRuas(a, b);
  let base;
  if (c) base = c;
  else { const za = ruaMaisPerto(a.z), xb = ruaMaisPerto(b.x), zb = ruaMaisPerto(b.z); base = [{ x: a.x, z: a.z }, { x: a.x, z: za }, { x: xb, z: za }, { x: xb, z: zb }, { x: b.x, z: zb }, { x: b.x, z: b.z }]; }
  const pts = faixaDireita(base.filter((p, i, l) => i === 0 || Math.hypot(p.x - l[i - 1].x, p.z - l[i - 1].z) > 0.5), faixa);
  if (parar > 0 && pts.length > 1) {   // para um pouco antes do destino
    const u = pts[pts.length - 1], w = pts[pts.length - 2], d = Math.hypot(u.x - w.x, u.z - w.z);
    if (d > parar + 0.5) pts[pts.length - 1] = { x: u.x + (w.x - u.x) / d * parar, z: u.z + (w.z - u.z) / d * parar }; else pts.pop();
  }
  const lisos = arredondar(pts);
  let total = 0; for (let i = 1; i < lisos.length; i++) total += Math.hypot(lisos[i].x - lisos[i - 1].x, lisos[i].z - lisos[i - 1].z);
  return { pts: lisos, total };
}
// esquinas viram curva (até 8 m), para o veículo não girar "no canto"
function arredondar(pts, rmax = 8) {
  if (pts.length < 3) return pts;
  const r = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], p = pts[i], b = pts[i + 1], l1 = Math.hypot(p.x - a.x, p.z - a.z), l2 = Math.hypot(b.x - p.x, b.z - p.z);
    if (l1 < 0.01 || l2 < 0.01) { r.push(p); continue; }
    const d1 = { x: (p.x - a.x) / l1, z: (p.z - a.z) / l1 }, d2 = { x: (b.x - p.x) / l2, z: (b.z - p.z) / l2 };
    if (Math.abs(d1.x * d2.z - d1.z * d2.x) < 0.05 && d1.x * d2.x + d1.z * d2.z > 0) { r.push(p); continue; }
    const rr = Math.min(rmax, l1 * 0.45, l2 * 0.45), q0 = { x: p.x - d1.x * rr, z: p.z - d1.z * rr }, q2 = { x: p.x + d2.x * rr, z: p.z + d2.z * rr };
    for (let k = 0; k <= 6; k++) { const t = k / 6, u = 1 - t; r.push({ x: u * u * q0.x + 2 * u * t * p.x + t * t * q2.x, z: u * u * q0.z + 2 * u * t * p.z + t * t * q2.z }); }
  }
  r.push(pts[pts.length - 1]);
  return r;
}
// veículo guiado por robô anda na faixa da direita (não sobe na calçada nem anda no meio da rua)
export function faixaDireita(pts, o = 2.4) {
  if (pts.length < 3) return pts;
  const dir = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; };
  const dirTo = (d) => ({ x: -d.z, z: d.x });      // direita de quem anda na direção d
  const r = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = dirTo(dir(pts[i - 1], pts[i])), b = dirTo(dir(pts[i], pts[i + 1]));
    const dot = a.x * b.x + a.z * b.z;
    const off = dot > 0.9 ? a : { x: a.x + b.x, z: a.z + b.z };
    r.push({ x: pts[i].x + off.x * o, z: pts[i].z + off.z * o });
  }
  { const u = pts[pts.length - 1], d = dirTo(dir(pts[pts.length - 2], u)); r.push({ x: u.x + d.x * o, z: u.z + d.z * o }); }   // termina na faixa da direita
  return r;
}
export function pontoNaRota(r, s) {
  let resto = Math.max(0, s);
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], d = Math.hypot(b.x - a.x, b.z - a.z);
    if (resto <= d) { const f = d ? resto / d : 1; return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, ang: Math.atan2(b.x - a.x, b.z - a.z), fim: false }; }
    resto -= d;
  }
  const a = r.pts[r.pts.length - 2] || r.pts[0], b = r.pts[r.pts.length - 1];
  return { x: b.x, z: b.z, ang: Math.atan2(b.x - a.x, b.z - a.z), fim: true };
}
function novoNpc(chave, modelo, base, destino, atraso, vel, parar, ronda) {
  const obj = civico.modeloCarro(modelo, '#ffffff');
  obj.visible = false; ctx.scene.add(obj);
  obj.userData.sireneDe = modelo === 'ambulancia' ? 'sirene_ambulancia' : modelo === 'bombeiros' ? 'sirene_bombeiros' : null;
  const n = { obj, modelo, base, rota: rotaRuas(base, destino, parar), t0: performance.now() + atraso * 1000, vel, volta: null, chegou: false, atraso: 0, ronda };
  if (ronda !== undefined) { obj.position.set(base.x, ctx.altura(base.x, base.z), base.z); obj.rotation.y = base.ang || 0; }
  npcs.set(chave, n); return n;
}
function voltarNpc(chave) {
  const n = npcs.get(chave); if (!n || n.volta) return;
  const casa = n.ronda !== undefined ? ctx.posRonda?.(n.ronda) || n.base : n.base;
  n.volta = rotaRuas({ x: n.obj.position.x, z: n.obj.position.z }, casa); n.t1 = performance.now(); n.atraso = 0;
  if (!n.obj.visible) { ctx.scene.remove(n.obj); npcs.delete(chave); }
}
function atualizarNpcs(dt) {
  const agora = performance.now(), t = agora / 1000;
  for (const [chave, n] of npcs) {
    if (agora < n.t0) continue;
    if (n.destruidoAte && agora > n.destruidoAte) { ctx.scene.remove(n.obj); npcs.delete(chave); continue; }   // 22w: a carcaça é recolhida
    if (n.pausa) { n.atraso += dt; civico.atualizarSirenes(0, n.obj); continue; }   // 22w: parado (pneu furado ou destruído)
    // trânsito: espera quem estiver na frente (o atraso é recuperado depois, um pouco mais rápido)
    if (n.obj.visible && !n.chegou || n.volta) {
      const o = n.obj.position, bloq = n.obj.visible && (ctx.obstaculo?.(o.x, o.z, n.obj.rotation.y, n.obj) || (n.volta && ctx.sinal?.(o.x, o.z, n.obj.rotation.y)));   // voltando (sem sirene) respeita o sinal
      n.atraso = bloq ? Math.min(bloq.fogo ? 900 : ctx.vista?.(o.x, o.z) ? 600 : 30, n.atraso + dt) : Math.max(0, n.atraso - dt * 0.4);   // veículo em chamas: espera o tempo que for; à vista de quem joga, ninguém atravessa ninguém
    }
    const r = n.volta || n.rota; let s = ((agora - (n.volta ? n.t1 : n.t0)) / 1000 - n.atraso) * n.vel;
    // arrancada: sai devagar e vai ganhando velocidade (os pesados demoram mais); o que faltou vira atraso
    if (n.rotaAnt === r && n.sAnt !== undefined && s > n.sAnt && s - n.sAnt < 40 && dt > 0) {
      const v0 = n.v || 0, lim = n.sAnt + (v0 + civico.aceleracao(n.modelo, v0, n.vel) * dt) * dt;
      if (s > lim) { n.atraso += (s - lim) / n.vel; s = lim; }
      n.v = (s - n.sAnt) / dt;
    } else n.v = n.rotaAnt === r ? 0 : n.v ?? 0;
    n.sAnt = s; n.rotaAnt = r;
    const p = pontoNaRota(r, s);
    if (n.volta && p.fim) { ctx.scene.remove(n.obj); npcs.delete(chave); continue; }
    n.obj.visible = true;
    n.obj.position.set(p.x, ctx.altura(p.x, p.z), p.z);
    n.obj.rotation.y = suave(n.obj.rotation.y, p.ang, dt * 6);
    civico.atualizarSirenes(n.volta ? 0 : t, n.obj);
    if (!n.volta && p.fim && !n.chegou) { n.chegou = true; n.aoChegar?.(); }
  }
}
const suave = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * Math.min(1, k); };
// bombeiros NPC: o caminhão da ronda mais perto vai primeiro; os outros saem do quartel, um atrás do outro.
// Chegando, jogam água e o fogo vai baixando (vidaFogo) até apagar.
function npcsDeFogo(dt) {
  const agora = ctx.agora(), ativos = new Set();
  for (const f of incendios) {
    const desde = (agora - Date.parse(f.inicio)) / 1000, qtd = caminhoesDoFogo(f);
    for (let i = 0; i < qtd; i++) {
      const chave = `fogo${f.id}.${i}`; ativos.add(chave);
      if (desde < saidaDoFogo(f) + i * 4) continue;
      let n = npcs.get(chave);
      if (!n) {
        const r = i === 0 ? ctx.rondaPerto?.(f.x, f.z, rondasOcupadas()) : null;   // { i, x, z, ang }
        n = r ? novoNpc(chave, 'bombeiros', r, f, 0, 16, 9, r.i) : novoNpc(chave, 'bombeiros', civico.BOMBEIROS.vaga, f, 0, 16, 9 + (r === null && i === 0 ? 0 : i * 12));
      }
      if (n.chegou && !n.volta) {
        n.jato = (n.jato || 0) - dt;
        if (n.jato <= 0) { n.jato = 0.35; esguichar(f, new THREE.Vector3(n.obj.position.x, n.obj.position.y + 4, n.obj.position.z), 6); }
      }
    }
  }
  for (const chave of npcs.keys()) if (chave.startsWith('fogo') && !ativos.has(chave)) voltarNpc(chave);
}
// helicóptero NPC dos bombeiros: sai da laje do quartel quando tem incêndio (que não seja de veículo) e nenhum jogador
// está com ele; sobe, voa até o fogo, fica parado em cima jogando água e volta para a laje (pousa e fica lá)
let heliNpc = null;
const ALT_HELI = 24;
function heliDeFogo(dt) {
  const B = civico.BOMBEIROS, pad = B.heliVaga, base = B.heli;
  if (!heliNpc) {
    if (!pad || !base || !base.visible || ctx.jogador().carro?.mesh === base || Math.hypot(base.position.x - pad.x, base.position.z - pad.z) > 1) return;
    const agora = ctx.agora(), f = incendios.find((q) => q.tipo !== 'veiculo' && (agora - Date.parse(q.inicio)) / 1000 > saidaDoFogo(q) + 8);
    if (!f) return;
    const obj = civico.modeloCarro('helicoptero_bombeiros', '#d62020'); obj.position.copy(base.position); obj.rotation.y = base.rotation.y; ctx.scene.add(obj);
    base.visible = false;
    heliNpc = { obj, f, fase: 'sobe', t: 0, jato: 0, rotor: obj.getObjectByName('rotor') };
  }
  const h = heliNpc, o = h.obj.position, f = incendios.find((q) => q.id === h.f.id);
  h.t += dt; if (h.rotor) { h.rotor.rotation.y += dt * 28; civico.rotorRapido(h.rotor, true); } civico.girarCauda(h.obj, dt, 28);   // 22c: rotor de trás
  { const bd = h.obj.getObjectByName('balde'); if (bd) bd.visible = o.y > pad.y + 2.5; }
  const voar = (x, z, y, vel) => {   // anda em linha reta até (x, z) e ajusta a altura
    const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), passo = Math.min(d, vel * dt);
    if (d > 0.5) { o.x += dx / d * passo; o.z += dz / d * passo; h.obj.rotation.y = suave(h.obj.rotation.y, Math.atan2(dx, dz), dt * 2); }
    o.y += THREE.MathUtils.clamp(y - o.y, -5 * dt, 5 * dt);
    return d < 1 && Math.abs(y - o.y) < 0.5;
  };
  const altoEm = (x, z) => Math.max(pad.y, ctx.altura(x, z)) + ALT_HELI;
  if (h.fase === 'sobe') { if (voar(o.x, o.z, pad.y + ALT_HELI, 0) || !f) h.fase = f ? 'vai' : 'volta'; }
  else if (h.fase === 'vai') { if (!f) h.fase = 'volta'; else if (voar(f.x, f.z + 3, altoEm(f.x, f.z), 22)) { h.fase = 'apaga'; h.t = 0; } }
  else if (h.fase === 'apaga') {
    if (!f || h.t > 90) h.fase = 'volta';
    else { voar(f.x, f.z + 3, ctx.altura(f.x, f.z) + 18, 4); h.jato -= dt; if (h.jato <= 0) { h.jato = 0.4; esguichar(f, new THREE.Vector3(o.x, o.y - 0.6, o.z), 10); } }
  } else if (h.fase === 'volta') { if (voar(pad.x, pad.z, altoEm(pad.x, pad.z), 22)) h.fase = 'pousa'; }
  else if (h.fase === 'pousa' && voar(pad.x, pad.z, pad.y, 0)) {
    ctx.scene.remove(h.obj); heliNpc = null;
    base.position.set(pad.x, pad.y, pad.z); base.rotation.y = pad.ang; base.visible = true;
  }
}
// ambulância NPC: vai até o ferido e, ao chegar, chama aoChegar (o atendimento leva 2,5 s)
export function chamarAmbulancia(chave, alvo, aoChegar, atraso = 1.5) {
  const ex = npcs.get('amb' + chave);
  if (ex && !ex.volta) return null;
  if (ex) { ctx.scene.remove(ex.obj); npcs.delete('amb' + chave); }
  const n = novoNpc('amb' + chave, 'ambulancia', civico.HOSPITAL.vaga, alvo, atraso, 24, 4);
  // ao chegar: o socorrista desce, vai até o ferido, faz o salvamento e volta (sem ele no jogo: o jeito antigo)
  n.aoChegar = () => {
    if (ctx.socorrista) ctx.socorrista(n.obj, alvo, () => aoChegar?.(), () => voltarNpc('amb' + chave));
    else setTimeout(() => { aoChegar?.(); setTimeout(() => voltarNpc('amb' + chave), 2500); }, 2500);
  };
  return (n.rota.total / 24) + atraso + 2.5;     // segundos até o atendimento
}
export function cancelarAmbulancia(chave) { voltarNpc('amb' + chave); }
export function veiculosNpc() { const r = []; for (const n of npcs.values()) if (n.obj.visible) r.push(n.obj); return r; }
// 22w: os de serviço (bombeiros indo para um incêndio, ambulância) também furam pneu e explodem com foguete.
// Chave dos que podem: só letras, números e ponto (vira a ref "serv:<chave>" no banco).
export function npcsComChave() { const r = []; for (const [k, n] of npcs) if (n.obj.visible && !n.volta && /^[a-z0-9.]{1,24}$/.test(k)) r.push([k, n]); return r; }
export function npcDaChave(k) { return npcs.get(k) || null; }
// pane (pneu furado): para onde está e o horário espera; destruído (foguete): fica parado queimando e some depois
export function pausarNpc(k, on) { const n = npcs.get(k); if (n) n.pausa = !!on; }
export function destruirNpc(k, ms = 180000) { const n = npcs.get(k); if (!n) return; n.pausa = true; n.destruidoAte = performance.now() + ms; }

export function atualizar(dt) {
  if (!ctx) return;
  tempoFogo -= dt; tempoProc -= dt; tempoPonto -= dt; tempoGuerra -= dt; esperaPonto -= dt;
  if (tempoFogo <= 0) { tempoFogo = 8; carregarFogo(); }   // e na hora, quando o banco avisa (incendio)
  if (tempoGuerra <= 0) { tempoGuerra = 15; carregarGuerras(); }
  if (tempoProc <= 0) { tempoProc = 60; rede.saude.processar().catch(() => {}); rede.banco.cobrarFin().catch(() => {}); rede.guerra.processar().catch(() => {}); }
  if (tempoPonto <= 0) { tempoPonto = 60; baterPonto(); }
  atualizarFocos(dt);
  npcsDeFogo(dt);
  heliDeFogo(dt);
  atualizarNpcs(dt);
  passoApagar(dt);
  desenharHud();
}
export function recarregarGuerras() { tempoGuerra = 0.2; }
export function recomecarPonto() { esperaPonto = 0; tempoPonto = Math.min(tempoPonto, 5); }
