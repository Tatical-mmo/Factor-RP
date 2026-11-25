// Mudança de tempo: limpo, chuva, tempestade e neve. Igual para todos os jogadores.
// O administrador escolhe o tempo na hora (por X minutos) ou deixa automático: a cada ciclo do dia (32 min)
// o sorteio é feito pelo número do ciclo, então todos os celulares chegam ao mesmo resultado sem conversar.
// Chuva: fica mais escuro e aparecem poças. Tempestade: ainda mais escuro, chuva mais forte e relâmpagos que
// clareiam o mapa logo antes do trovão. Neve: flocos caindo e montinhos de neve pelo chão.
// Poças e neve somem 3 s depois que o tempo abre.
import * as THREE from 'three';
import * as sons from './sons.js';

// segundos em que há trovão no áudio da tempestade (o relâmpago vem um pouco antes)
const TROVOES = [7.3, 11.2, 19.8, 33.8, 53.6, 70.2, 75.5, 84.7, 107.4, 130.9, 153.0, 172.2, 194.6, 206.9, 217.5, 231.9];
const ANTES = 0.55;
const TIPOS = { limpo: 0, chuva: 1, tempestade: 2, neve: 3 };
export const NOMES = { limpo: '☀️ Tempo limpo', chuva: '🌧️ Chuva', tempestade: '⛈️ Tempestade', neve: '❄️ Neve' };

let ctx = null, cfg = { auto: true, chance_chuva: 30, chance_tempestade: 15, chance_neve: 0, manual: null, manual_ate: null };
let tipo = 'limpo', forca = 0, chao = 0, esperaChao = 0, tipoChao = 'chuva', clarao = 0, ultimoPos = null, proxRelampago = 6;
let gotas = null, flocos = null, pocas = null, neveChao = null, centroChao = null;
const toque = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const NG = toque ? 1400 : 2200, NF = toque ? 1100 : 1800, NP = 90;   // 22z4: chuva e neve mais cheias
const CAIXA = { x: 46, y: 30, z: 46 };

export function definirConfig(c) { if (c) cfg = { ...cfg, ...c }; }
export const config = () => cfg;
export const atual = () => tipo;

// número "aleatório" que é o mesmo em todos os aparelhos
function hash(n, k) { let h = (n * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export function tempoEm(seg, ciclo) {
  if (cfg.manual && cfg.manual_ate && Date.parse(cfg.manual_ate) / 1000 > seg) return cfg.manual;
  if (!cfg.auto) return 'limpo';
  const n = Math.floor(seg / ciclo), f = seg / ciclo - n;
  const r = hash(n, 1) * 100, c1 = cfg.chance_chuva, c2 = c1 + cfg.chance_tempestade, c3 = c2 + cfg.chance_neve;
  const t = r < c1 ? 'chuva' : r < c2 ? 'tempestade' : r < c3 ? 'neve' : 'limpo';
  const ini = 0.08 + hash(n, 2) * 0.5, dur = 0.25 + hash(n, 3) * 0.15;     // 8 a 13 min dentro do ciclo
  return f >= ini && f < ini + dur ? t : 'limpo';
}

export function iniciar(c) {
  ctx = c;
  // chuva: riscos
  const pg = new Float32Array(NG * 6), vel = new Float32Array(NG);
  for (let i = 0; i < NG; i++) { const x = (Math.random() - 0.5) * CAIXA.x * 2, y = Math.random() * CAIXA.y, z = (Math.random() - 0.5) * CAIXA.z * 2; pg.set([x, y, z, x, y - 0.9, z], i * 6); vel[i] = 0.85 + Math.random() * 0.3; }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(pg, 3));
  gotas = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: '#b9cde0', transparent: true, opacity: 0, depthWrite: false }));
  gotas.frustumCulled = false; gotas.visible = false; gotas.userData.vel = vel; ctx.scene.add(gotas);
  // neve: pontos
  const pf = new Float32Array(NF * 3), fase = new Float32Array(NF);
  for (let i = 0; i < NF; i++) { pf.set([(Math.random() - 0.5) * CAIXA.x * 2, Math.random() * CAIXA.y, (Math.random() - 0.5) * CAIXA.z * 2], i * 3); fase[i] = Math.random() * 6.28; }
  const gf = new THREE.BufferGeometry(); gf.setAttribute('position', new THREE.BufferAttribute(pf, 3));
  // 22z4: floco redondo e macio (antes era um quadradinho), maior perto da câmera
  const cf = document.createElement('canvas'); cf.width = cf.height = 32; { const g = cf.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); }
  flocos = new THREE.Points(gf, new THREE.PointsMaterial({ color: '#ffffff', map: new THREE.CanvasTexture(cf), size: 0.3, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false }));
  flocos.frustumCulled = false; flocos.visible = false; flocos.userData.fase = fase; ctx.scene.add(flocos);
  // poças (brilhantes) e montinhos de neve (foscos)
  const disco = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  pocas = new THREE.InstancedMesh(disco, new THREE.MeshStandardMaterial({ color: '#3c4a58', roughness: 0.04, metalness: 0.75, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), NP);
  neveChao = new THREE.InstancedMesh(disco, new THREE.MeshStandardMaterial({ color: '#f3f7ff', roughness: 0.95, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), NP * 2);
  for (const m of [pocas, neveChao]) { m.frustumCulled = false; m.visible = false; m.renderOrder = 1; ctx.scene.add(m); }
}

// ---- poças de verdade no gráfico ultra (21o): água parada que espelha o céu (Fresnel: de longe/rasante reflete muito,
// olhando de cima dá para ver o asfalto escuro), borda que some aos poucos (sem disco recortado) e gotas de chuva
// fazendo anéis que se abrem na superfície (duas camadas de ondinhas girando em sentidos opostos).
let matPocaSimples = null, matPocaUltra = null;
function texturaAneis(n, seed) {
  const W = 256, cv = document.createElement('canvas'); cv.width = cv.height = W; const g = cv.getContext('2d'), d = g.createImageData(W, W);
  const h = new Float32Array(W * W), gotasR = [];
  for (let i = 0; i < n; i++) gotasR.push([hash(seed, i) * W, hash(i, seed + 3) * W, 6 + hash(seed + i, 7) * 26]);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (const [cx, cy, r] of gotasR) { let dx = Math.abs(x - cx), dy = Math.abs(y - cy); dx = Math.min(dx, W - dx); dy = Math.min(dy, W - dy); const dd = Math.hypot(dx, dy); if (dd < r + 6) v += Math.cos((dd - r) * 0.9) * Math.exp(-((dd - r) ** 2) / 18) * (1 - r / 40); }
    h[y * W + x] = v;
  }
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const hx = h[y * W + (x + 1) % W] - h[y * W + (x + W - 1) % W], hy = h[((y + 1) % W) * W + x] - h[((y + W - 1) % W) * W + x];
    const nx = -hx * 1.4, ny = -hy * 1.4, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * W + x) * 4;
    d.data[i] = (nx / l * 0.5 + 0.5) * 255; d.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; d.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t;
}
function texturaBorda() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 20, 64, 64, 63); gr.addColorStop(0, '#fff'); gr.addColorStop(0.62, '#fff'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv);
}
export function aguaUltra(sim) {
  if (!pocas) return;
  matPocaSimples ||= pocas.material;
  if (sim && !matPocaUltra) {
    matPocaUltra = new THREE.MeshPhysicalMaterial({ color: '#141a20', roughness: 0.02, metalness: 0, ior: 1.333, specularIntensity: 0.9, envMapIntensity: 1.4,
      normalMap: texturaAneis(26, 1), normalScale: new THREE.Vector2(0.55, 0.55), clearcoat: 1, clearcoatRoughness: 0, clearcoatNormalMap: texturaAneis(34, 2), clearcoatNormalScale: new THREE.Vector2(0.35, 0.35),
      alphaMap: texturaBorda(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    matPocaUltra.normalMap.repeat.set(2, 2); matPocaUltra.clearcoatNormalMap.repeat.set(3, 3);
    matPocaUltra.userData.ultra = true;
  }
  const quer = sim ? matPocaUltra : matPocaSimples;
  if (pocas.material !== quer) { quer.opacity = pocas.material.opacity; pocas.material = quer; }
}
function animarPocas(dt) {
  const m = pocas.material; if (!m.normalMap) return;
  m.normalMap.rotation += dt * 0.25; m.normalMap.offset.x += dt * 0.03;   // anéis andando (as duas camadas para lados opostos)
  m.clearcoatNormalMap.rotation -= dt * 0.35; m.clearcoatNormalMap.offset.y += dt * 0.05;
  m.normalMap.center.set(0.5, 0.5); m.clearcoatNormalMap.center.set(0.5, 0.5);
}
const listaPocas = [];   // [x, z, raio] das poças de chuva em volta do jogador
// tem poça d'água aqui? (para o espirro de quem pisa ou passa de carro)
export function pocaEm(x, z) {
  if (!pocas?.visible || tipoChao !== 'chuva' || chao < 0.3) return false;
  for (const [px, pz, r] of listaPocas) if (Math.abs(x - px) < r && Math.abs(z - pz) < r && Math.hypot(x - px, z - pz) < r) return true;
  return false;
}
// onde fica uma poça: perto do jogador, em pontos fixos de uma grade (para não "andar" com ele)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
function espalhar(px, pz) {
  centroChao = { x: px, z: pz }; listaPocas.length = 0;
  const G = 8, R = 9, gx = Math.round(px / G), gz = Math.round(pz / G);
  let np = 0, nn = 0;
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    const cx = gx + i, cz = gz + j, h1 = hash(cx * 7919 + cz, 11), h2 = hash(cx, cz + 5), h3 = hash(cz, cx + 9);
    const x = (cx + h2 - 0.5) * G, z = (cz + h3 - 0.5) * G;
    if (Math.hypot(x - px, z - pz) > R * G) continue;
    const y = ctx.alturaChao(x, z) + 0.03, ang = hash(cx, cz) * 6.28;
    _q.setFromAxisAngle(_y, ang);
    if (np < NP && h1 < 0.32 && ctx.naRua(x, z)) {
      const r = 0.7 + hash(cx + 3, cz) * 1.6;
      _m.compose(_p.set(x, y, z), _q, _s.set(r * (1 + h2 * 0.8), 1, r)); pocas.setMatrixAt(np++, _m); listaPocas.push([x, z, r * (1 + h2 * 0.4)]);
    }
    if (nn < NP * 2 && h1 < 0.55) {
      const r = 0.8 + hash(cx + 7, cz) * 2.2;
      _m.compose(_p.set(x, y + 0.01, z), _q, _s.set(r * (1 + h3 * 0.7), 1, r)); neveChao.setMatrixAt(nn++, _m);
    }
  }
  pocas.count = np; neveChao.count = nn;
  pocas.instanceMatrix.needsUpdate = true; neveChao.instanceMatrix.needsUpdate = true;
}

// chamado depois do céu do dia/noite: escurece, faz cair chuva/neve, relâmpagos e sons
export function atualizar(dt, seg, ciclo, centro, luzes) {
  if (!ctx) return;
  const quer = tempoEm(seg, ciclo);
  // troca de tempo: primeiro some o atual, depois entra o novo
  if (quer !== tipo) { forca = Math.max(0, forca - dt / 5); if (forca <= 0) { tipo = quer; ctx.mudou?.(tipo); } }
  else if (tipo !== 'limpo') forca = Math.min(1, forca + dt / 6);
  const f = tipo === 'limpo' ? 0 : forca;
  const chuva = tipo === 'chuva' || tipo === 'tempestade', neve = tipo === 'neve';

  // escurecer
  const esc = f * ({ chuva: 0.42, tempestade: 0.6, neve: 0.38 }[tipo] || 0);
  if (esc > 0 && !centro?.dentro) {   // dentro de prédio a luz é a das lâmpadas: chuva não escurece
    luzes.sol.intensity *= 1 - esc * 0.85;
    luzes.hemi.intensity *= 1 - esc * 0.45;
    luzes.cena.environmentIntensity *= 1 - esc * 0.5;
    { const bg = luzes.cena.background, lum = bg.r * 0.3 + bg.g * 0.55 + bg.b * 0.15; _alvo.copy(neve ? COR_NEVE : COR_CHUVA).multiplyScalar(Math.min(1, Math.max(0.1, lum * 2.4))); bg.lerp(_alvo, esc * 1.1); }   // 22z4: de noite o céu da chuva fica escuro (antes clareava para cinza)
  }
  // relâmpago: clareia logo antes de cada trovão do áudio
  if (tipo === 'tempestade' && f > 0.3) {
    const pos = sons.pronto('tempestade') ? sons.posicao('tempestade') : null;
    if (pos !== null) {
      if (ultimoPos !== null) for (const t of TROVOES) { const a = t - ANTES; if ((ultimoPos < a && pos >= a) || (ultimoPos > pos && (a >= ultimoPos || a < pos))) relampago(); }
      ultimoPos = pos;
    } else { proxRelampago -= dt; if (proxRelampago <= 0) { proxRelampago = 8 + Math.random() * 14; relampago(); } }
  } else ultimoPos = null;
  if (clarao > 0) {
    clarao = Math.max(0, clarao - dt);
    const k = clarao > 0.32 ? 1 : clarao > 0.24 ? 0.25 : clarao > 0.12 ? 0.85 : clarao / 0.12 * 0.5;
    luzes.hemi.intensity += 2.6 * k; luzes.cena.environmentIntensity += 0.9 * k;
    luzes.cena.background.lerp(COR_CLARAO, 0.7 * k);
  }

  // partículas em volta da câmera
  gotas.visible = chuva && f > 0.01 && !centro.dentro; flocos.visible = neve && f > 0.01 && !centro.dentro;
  if (gotas.visible) {
    const forte = tipo === 'tempestade', a = gotas.geometry.attributes.position.array, v = gotas.userData.vel;
    const vy = (forte ? 34 : 24) * dt, vx = (forte ? 6 : 2.5) * dt, mostrar = Math.floor(NG * (forte ? 1 : 0.65) * f);
    gotas.geometry.setDrawRange(0, mostrar * 2);
    gotas.material.opacity = (forte ? 0.6 : 0.48) * Math.min(1, f * 1.5);
    gotas.position.set(centro.x, centro.y, centro.z);
    for (let i = 0; i < mostrar; i++) {
      const o = i * 6; let y = a[o + 1] - vy * v[i], x = a[o] + vx * v[i];
      if (y < -4) { y = CAIXA.y - 4 + Math.random() * 3; x = (Math.random() - 0.5) * CAIXA.x * 2; a[o + 2] = a[o + 5] = (Math.random() - 0.5) * CAIXA.z * 2; }
      a[o] = x; a[o + 1] = y; a[o + 3] = x - (forte ? 0.16 : 0.07); a[o + 4] = y - (forte ? 1.1 : 0.8);
    }
    gotas.geometry.attributes.position.needsUpdate = true;
  }
  if (flocos.visible) {
    const a = flocos.geometry.attributes.position.array, fa = flocos.userData.fase, t = seg;
    flocos.material.opacity = 0.9 * Math.min(1, f * 1.5);
    flocos.position.set(centro.x, centro.y, centro.z);
    for (let i = 0; i < NF; i++) {
      const o = i * 3; a[o + 1] -= (2 + (i % 5) * 0.35) * dt; a[o] += Math.sin(t * 0.9 + fa[i]) * 0.8 * dt; a[o + 2] += Math.cos(t * 0.7 + fa[i]) * 0.5 * dt;
      if (a[o + 1] < -4) { a[o + 1] = CAIXA.y - 4 + Math.random() * 3; a[o] = (Math.random() - 0.5) * CAIXA.x * 2; a[o + 2] = (Math.random() - 0.5) * CAIXA.z * 2; }
    }
    flocos.geometry.attributes.position.needsUpdate = true;
  }

  // poças e neve no chão: aparecem com o tempo e somem 3 s depois que ele abre
  if (f > 0.15) { esperaChao = 3; tipoChao = neve ? 'neve' : 'chuva'; chao = Math.min(1, chao + dt / (neve ? 60 : 15)); }   // 22z4: a neve vai cobrindo em ~1 min
  else if (chao > 0) { esperaChao -= dt; if (esperaChao <= 0) chao = Math.max(0, chao - dt / (tipoChao === 'neve' ? 45 : 1.2)); }   // a neve derrete devagar
  const m = tipoChao === 'neve' ? neveChao : pocas, outro = m === pocas ? neveChao : pocas;
  outro.visible = false;
  m.visible = chao > 0.01 && !centro.dentro && m !== neveChao;   // 22z4: a neve agora acumula no próprio chão (tempo.js): sem os montinhos soltos
  if (m.visible) {
    if (!centroChao || Math.hypot(centro.x - centroChao.x, centro.z - centroChao.z) > 16) espalhar(centro.x, centro.z);
    m.material.opacity = (m === pocas ? (pocas.material.userData.ultra ? 0.95 : 0.62) : 0.92) * chao;
    if (m === pocas && pocas.material.userData.ultra) animarPocas(dt);
  } else centroChao = null;

  // sons do tempo
  sons.continuo('chuva', tipo === 'chuva' ? 0.55 * f : 0);
  sons.continuo('tempestade', tipo === 'tempestade' ? 0.7 * f : 0);
  sons.continuo('nevasca', neve ? 0.55 * f : 0);
}
const _alvo = new THREE.Color(), COR_CHUVA = new THREE.Color('#5a6470'), COR_NEVE = new THREE.Color('#c8d2dc'), COR_CLARAO = new THREE.Color('#e8eeff');
let aoRelampago = null;
export const ouvirRelampago = (fn) => { aoRelampago = fn; };
function relampago() { clarao = 0.42; aoRelampago?.(); }
export const fatorTempo = () => (tipo === 'limpo' ? 0 : forca);
export const neveNoChao = () => (tipoChao === 'neve' ? chao : 0);   // 22z4: o quanto a neve já cobriu (0..1)
