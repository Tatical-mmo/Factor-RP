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
const NG = toque ? 900 : 1600, NF = toque ? 700 : 1200, NP = 90;
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
  flocos = new THREE.Points(gf, new THREE.PointsMaterial({ color: '#ffffff', size: toque ? 3 : 3.5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
  flocos.frustumCulled = false; flocos.visible = false; flocos.userData.fase = fase; ctx.scene.add(flocos);
  // poças (brilhantes) e montinhos de neve (foscos)
  const disco = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  pocas = new THREE.InstancedMesh(disco, new THREE.MeshStandardMaterial({ color: '#3c4a58', roughness: 0.04, metalness: 0.75, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), NP);
  neveChao = new THREE.InstancedMesh(disco, new THREE.MeshStandardMaterial({ color: '#f3f7ff', roughness: 0.95, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), NP * 2);
  for (const m of [pocas, neveChao]) { m.frustumCulled = false; m.visible = false; m.renderOrder = 1; ctx.scene.add(m); }
}

// onde fica uma poça: perto do jogador, em pontos fixos de uma grade (para não "andar" com ele)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
function espalhar(px, pz) {
  centroChao = { x: px, z: pz };
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
      _m.compose(_p.set(x, y, z), _q, _s.set(r * (1 + h2 * 0.8), 1, r)); pocas.setMatrixAt(np++, _m);
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
  const esc = f * ({ chuva: 0.42, tempestade: 0.6, neve: 0.3 }[tipo] || 0);
  if (esc > 0) {
    luzes.sol.intensity *= 1 - esc * 0.85;
    luzes.hemi.intensity *= 1 - esc * 0.45;
    luzes.cena.environmentIntensity *= 1 - esc * 0.5;
    luzes.cena.background.lerp(neve ? COR_NEVE : COR_CHUVA, esc * 1.1);
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
    const vy = (forte ? 34 : 24) * dt, vx = (forte ? 6 : 2.5) * dt, mostrar = Math.floor(NG * (forte ? 1 : 0.55) * f);
    gotas.geometry.setDrawRange(0, mostrar * 2);
    gotas.material.opacity = (forte ? 0.55 : 0.42) * Math.min(1, f * 1.5);
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
  if (f > 0.15) { esperaChao = 3; tipoChao = neve ? 'neve' : 'chuva'; chao = Math.min(1, chao + dt / (neve ? 25 : 15)); }
  else if (chao > 0) { esperaChao -= dt; if (esperaChao <= 0) chao = Math.max(0, chao - dt / 1.2); }
  const m = tipoChao === 'neve' ? neveChao : pocas, outro = m === pocas ? neveChao : pocas;
  outro.visible = false;
  m.visible = chao > 0.01 && !centro.dentro;
  if (m.visible) {
    if (!centroChao || Math.hypot(centro.x - centroChao.x, centro.z - centroChao.z) > 16) espalhar(centro.x, centro.z);
    m.material.opacity = (m === pocas ? 0.62 : 0.92) * chao;
  } else centroChao = null;

  // sons do tempo
  sons.continuo('chuva', tipo === 'chuva' ? 0.55 * f : 0);
  sons.continuo('tempestade', tipo === 'tempestade' ? 0.7 * f : 0);
  sons.continuo('nevasca', neve ? 0.55 * f : 0);
}
const COR_CHUVA = new THREE.Color('#5a6470'), COR_NEVE = new THREE.Color('#c8d2dc'), COR_CLARAO = new THREE.Color('#e8eeff');
function relampago() { clarao = 0.42; }
export const fatorTempo = () => (tipo === 'limpo' ? 0 : forca);
