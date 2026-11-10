// Ferrovia: duas linhas (Norte → Vila Serra, Sul → Porto Sul), cada uma com via de ida e de volta
// ligadas por laços nas pontas. Os trens andam pelo relógio do servidor, então todos os jogadores
// veem o mesmo trem no mesmo lugar sem precisar de rede.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as mundo from './mundo.js';

const PARADA = 25, VIAGEM = 50, ACEL = 10;      // segundos
const CICLO = 2 * (PARADA + VIAGEM);
const TRILHO = 0.45;                            // altura do topo do trilho
const PISO = 1.2;                               // piso do vagão acima do trilho
const ALT_PLAT = 1.05;
const CARROS = [{ tipo: 'loco', len: 17 }, { tipo: 'vagao', len: 15 }, { tipo: 'vagao', len: 15 }, { tipo: 'vagao', len: 15 }];
const VAO = 0.6;
const VAGAS = [];   // posições em pé dentro de cada vagão
for (const z of [-4, -2.4, -0.8, 0.8, 2.4, 4]) VAGAS.push([0, z]);
for (const [x, z] of [[-0.7, -6.1], [0.7, -6.1], [-0.7, 6.1], [0.7, 6.1]]) VAGAS.push([x, z]);
export const VAGAS_POR_TREM = VAGAS.length * 3;

let ctx = null;
export const linhas = [];

// ---------------------------------------------------------------- traçado
function tracado(s) {
  const pts = []; let x = -24, z = -140 * 1, a = 0;
  const reta = (len) => { const n = Math.ceil(len); for (let k = 1; k <= n; k++) { const d = len * k / n; pts.push([x + Math.cos(a) * d, z + Math.sin(a) * d]); } x += Math.cos(a) * len; z += Math.sin(a) * len; };
  const arco = (R, th) => {
    const sg = Math.sign(th), cx = x + sg * R * -Math.sin(a), cz = z + sg * R * Math.cos(a), f0 = a - sg * Math.PI / 2;
    const n = Math.ceil(R * Math.abs(th));
    for (let k = 1; k <= n; k++) { const f = f0 + sg * Math.abs(th) * k / n; pts.push([cx + R * Math.cos(f), cz + R * Math.sin(f)]); }
    const f = f0 + th; x = cx + R * Math.cos(f); z = cz + R * Math.sin(f); a += th;
  };
  pts.push([x, z]);
  reta(48); arco(20, -Math.PI); arco(20, Math.PI / 2); reta(660);
  arco(20, Math.PI / 2); arco(20, -Math.PI); reta(48);
  arco(20, -Math.PI); arco(20, Math.PI / 2); reta(660);
  arco(20, Math.PI / 2); arco(20, -Math.PI);
  pts.pop();                                        // o último ponto repete o primeiro
  if (s > 0) for (const p of pts) p[1] = -p[1];
  // reamostra a cada 0,5 m para achar posições pelo comprimento
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(bx - ax, bz - az)); }
  const L = cum[pts.length], M = Math.floor(L / 0.5), X = new Float32Array(M), Z = new Float32Array(M);
  let j = 0;
  for (let k = 0; k < M; k++) {
    const d = k * L / M;
    while (cum[j + 1] < d) j++;
    const [ax, az] = pts[j], [bx, bz] = pts[(j + 1) % pts.length], f = (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
    X[k] = ax + (bx - ax) * f; Z[k] = az + (bz - az) * f;
  }
  return { L, M, X, Z, pts };
}
function pos(l, s, out) {
  const f = ((s % l.L) + l.L) % l.L / l.L * l.M, i = Math.floor(f) % l.M, k = (i + 1) % l.M, t = f - Math.floor(f);
  out[0] = l.X[i] + (l.X[k] - l.X[i]) * t; out[1] = l.Z[i] + (l.Z[k] - l.Z[i]) * t; return out;
}
function sMaisPerto(l, x, z) { let m = 0, dm = Infinity; for (let i = 0; i < l.M; i++) { const d = (l.X[i] - x) ** 2 + (l.Z[i] - z) ** 2; if (d < dm) { dm = d; m = i; } } return m / l.M * l.L; }

// ---------------------------------------------------------------- horário
function perfil(t, d) {
  const v = d / (VIAGEM - ACEL), a = v / ACEL;
  if (t < ACEL) return 0.5 * a * t * t;
  if (t < VIAGEM - ACEL) return 0.5 * v * ACEL + v * (t - ACEL);
  const r = VIAGEM - t; return d - 0.5 * a * r * r;
}
const fase = (l, k, t) => (((t + l.fase + k * CICLO / 2) % CICLO) + CICLO) % CICLO;
function estado(l, k, t) {
  const p = fase(l, k, t);
  if (p < PARADA) return { s: l.s0, parado: 'centro', resta: PARADA - p };
  if (p < PARADA + VIAGEM) return { s: l.s0 + perfil(p - PARADA, l.d1), parado: null, vai: 'destino', chega: PARADA + VIAGEM - p };
  if (p < 2 * PARADA + VIAGEM) return { s: l.s1, parado: 'destino', resta: 2 * PARADA + VIAGEM - p };
  return { s: l.s1 + perfil(p - 2 * PARADA - VIAGEM, l.L - l.d1), parado: null, vai: 'centro', chega: CICLO - p };
}
function proximaChegada(l, lado, t) {
  let m = Infinity;
  for (let k = 0; k < 2; k++) { const p = fase(l, k, t), alvo = lado === 'centro' ? 0 : PARADA + VIAGEM; m = Math.min(m, (((alvo - p) % CICLO) + CICLO) % CICLO); }
  return m;
}

// ---------------------------------------------------------------- modelos do trem (geometrias juntadas por material)
function construtor() {
  const partes = {};
  const add = (chave, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
    g.translate(x, y, z); (partes[chave] ||= []).push(g);
  };
  const caixa = (chave, w, h, d, x, y, z) => add(chave, new THREE.BoxGeometry(w, h, d), x, y, z);
  const montar = (mats) => {
    const grupo = new THREE.Group();
    for (const [k, lista] of Object.entries(partes)) {
      for (const g of lista) { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
      const m = new THREE.Mesh(mergeGeometries(lista), mats[k]);
      m.castShadow = k !== 'vidro' && k !== 'luz'; m.receiveShadow = true; m.userData.parte = k;
      grupo.add(m);
    }
    return grupo;
  };
  return { add, caixa, montar };
}
function materiaisTrem() {
  return {
    branco: new THREE.MeshStandardMaterial({ color: '#f1f2ee', roughness: 0.32, metalness: 0.25 }),
    vermelho: new THREE.MeshStandardMaterial({ color: '#c8282e', roughness: 0.38, metalness: 0.2 }),
    escuro: new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.6, metalness: 0.3 }),
    metal: new THREE.MeshStandardMaterial({ color: '#7b8087', roughness: 0.35, metalness: 0.8 }),
    vidro: new THREE.MeshStandardMaterial({ color: '#9cc3dc', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.32, depthWrite: false }),
    parabrisa: new THREE.MeshStandardMaterial({ color: '#16202b', roughness: 0.08, metalness: 0.6 }),
    teto: new THREE.MeshStandardMaterial({ color: '#c3c8cd', roughness: 0.45, metalness: 0.35 }),
    luz: new THREE.MeshStandardMaterial({ color: '#fff7e2', emissive: '#fff1cf', emissiveIntensity: 1.1 }),
    farol: new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff4c8', emissiveIntensity: 2.4 }),
    assento: new THREE.MeshStandardMaterial({ color: '#2c5aa0', roughness: 0.7 }),
    piso: new THREE.MeshStandardMaterial({ color: '#70757d', roughness: 0.8 }),
    madeira: new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.7 }),
  };
}
const W = 3.3, HW = W / 2;
function truques(b, len) {
  b.caixa('escuro', 2.9, 0.45, len - 0.6, 0, 0.95, 0);
  for (const bz of [-(len / 2 - 2.6), len / 2 - 2.6]) {
    b.caixa('escuro', 2.3, 0.4, 2.8, 0, 0.62, bz);
    for (const sx of [-0.74, 0.74]) for (const dz of [-0.95, 0.95]) b.add('metal', new THREE.CylinderGeometry(0.45, 0.45, 0.16, 14), sx, 0.45, bz + dz, 0, 0, Math.PI / 2);
  }
}
function modeloVagao(mats) {
  const b = construtor(), len = 15, bj = 2.15, tj = 3.25, tt = 3.75;
  truques(b, len);
  b.caixa('piso', W, 0.12, len, 0, PISO - 0.06, 0);
  for (const s of [-1, 1]) {
    b.caixa('branco', 0.1, bj - 0.9, len, s * HW, (bj + 0.9) / 2, 0);
    b.caixa('vermelho', 0.12, 0.24, len, s * HW, 1.55, 0);
    b.caixa('vidro', 0.04, tj - bj, len - 0.3, s * (HW - 0.02), (tj + bj) / 2, 0);
    for (let k = 0; k <= 7; k++) b.caixa('branco', 0.12, tj - bj, 0.22, s * HW, (tj + bj) / 2, -len / 2 + 0.15 + k * (len - 0.3) / 7);
    b.caixa('branco', 0.1, tt - tj, len, s * HW, (tt + tj) / 2, 0);
    b.caixa('vermelho', 0.12, 0.08, len, s * HW, tj + 0.12, 0);
    for (const dz of [-(len / 2 - 1.3), len / 2 - 1.3]) { b.caixa('vermelho', 0.14, 2.05, 1.25, s * (HW + 0.01), PISO + 1.02, dz); b.caixa('parabrisa', 0.15, 0.7, 0.6, s * (HW + 0.02), PISO + 1.55, dz); }
  }
  for (const s of [-1, 1]) { b.caixa('branco', W, tt - 0.9, 0.1, 0, (tt + 0.9) / 2, s * (len / 2 - 0.05)); b.caixa('escuro', 2.0, 2.35, 0.4, 0, PISO + 1.15, s * (len / 2 + 0.18)); }
  // interior: bancos 2 + 2, corredor no meio
  for (const z of [-4.8, -3.2, -1.6, 0, 1.6, 3.2, 4.8]) for (const sx of [-1.05, 1.05]) {
    b.caixa('escuro', 0.9, 0.36, 0.42, sx, PISO + 0.18, z);
    b.caixa('assento', 1.0, 0.16, 0.56, sx, PISO + 0.44, z);
    b.caixa('assento', 1.0, 0.72, 0.12, sx, PISO + 0.86, z - 0.3);
  }
  for (const [x, z] of [[-0.55, -6.1], [0.55, -6.1], [-0.55, 6.1], [0.55, 6.1]]) b.add('metal', new THREE.CylinderGeometry(0.035, 0.035, 2.4, 8), x, PISO + 1.2, z);
  // teto arredondado (some quando você está dentro, para enxergar o vagão por dentro)
  const f = new THREE.Shape(); f.moveTo(-HW - 0.05, 0); f.absellipse(0, 0, HW + 0.05, 0.5, Math.PI, 0, true); f.lineTo(-HW - 0.05, 0);
  b.add('teto', new THREE.ExtrudeGeometry(f, { depth: len, bevelEnabled: false, curveSegments: 12 }), 0, tt, -len / 2);
  b.caixa('luz', 0.32, 0.04, len - 1.2, 0, tt - 0.02, 0);
  return b.montar(mats);
}
function modeloLoco(mats) {
  const b = construtor(), len = 17;
  truques(b, len);
  const p = new THREE.Shape();
  p.moveTo(-8.5, 0.9); p.lineTo(8.3, 0.9);
  p.quadraticCurveTo(8.7, 1.9, 7.6, 2.6);
  p.quadraticCurveTo(6.3, 3.6, 4.4, 3.85);
  p.lineTo(-8.5, 3.85); p.lineTo(-8.5, 0.9);
  const corpo = new THREE.ExtrudeGeometry(p, { depth: W - 0.24, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 3, curveSegments: 16 });
  corpo.translate(0, 0, -(W - 0.24) / 2); corpo.rotateY(-Math.PI / 2);
  b.add('branco', corpo);
  for (const s of [-1, 1]) {
    b.caixa('vermelho', 0.08, 0.26, 14.6, s * (HW + 0.02), 1.55, -1.1);
    b.caixa('vermelho', 0.08, 0.08, 12.6, s * (HW + 0.02), 3.36, -2.1);
    b.caixa('parabrisa', 0.08, 0.75, 1.5, s * (HW + 0.03), 2.85, 4.1);
    for (let k = 0; k < 5; k++) b.caixa('escuro', 0.06, 0.5, 1.1, s * (HW + 0.03), 2.6, -7 + k * 2.2);
  }
  b.add('parabrisa', new THREE.BoxGeometry(2.7, 0.06, 2.84), 0, 3.3, 6.34, Math.atan2(1.15, 2.6));
  b.caixa('vermelho', 2.9, 0.5, 0.5, 0, 1.15, 8.1);
  for (const sx of [-1, 1]) b.add('farol', new THREE.CylinderGeometry(0.17, 0.17, 0.1, 12), sx * 0.95, 1.6, 8.42, Math.PI / 2);
  // pantógrafo e equipamentos no teto
  b.caixa('escuro', 1.4, 0.18, 1.6, 0, 4.06, -4);
  b.caixa('metal', 0.08, 0.08, 1.95, 0, 4.85, -4.45, 0);
  b.add('metal', new THREE.BoxGeometry(0.07, 0.07, 1.9), 0, 4.55, -4.3, 0.75);
  b.add('metal', new THREE.BoxGeometry(0.07, 0.07, 1.9), 0, 5.25, -4.3, -0.75);
  b.caixa('metal', 1.8, 0.06, 0.12, 0, 5.98, -4.3);
  b.caixa('teto', 2.2, 0.35, 3.2, 0, 4.05, -0.5);
  b.caixa('escuro', 2.0, 2.35, 0.4, 0, PISO + 1.15, -len / 2 - 0.18);
  return b.montar(mats);
}

function montarTrens(l, mats, modelos) {
  const offs = []; let frente = (CARROS.reduce((a, c) => a + c.len, 0) + VAO * (CARROS.length - 1)) / 2;
  for (const c of CARROS) { offs.push(frente - c.len / 2); frente -= c.len + VAO; }
  l.trens = [0, 1].map(() => ({
    carros: CARROS.map((c, i) => {
      const g = modelos[c.tipo].clone(); ctx.scene.add(g);
      // modelo 3D por fora; o feito por código (com o interior) aparece só para quem está dentro do trem
      let ext = null;
      if (modelos.glb) { ext = modelos.glb.clone(); ext.scale.set(0.66, 0.8, c.len / 15); ctx.scene.add(ext); g.visible = false; }
      return { g, ext, len: c.len, off: offs[i], b: c.len / 2 - 2.6, tipo: c.tipo, x: 0, z: 0, yaw: 0 };
    }),
    est: null, tetoOculto: false,
  }));
}

// ---------------------------------------------------------------- via, estação e postes
function faixaAoLongo(l, perfilVia, mat, passo = 2) {
  const n = Math.floor(l.L / passo), np = perfilVia.length, pos3 = [], idx = [];
  const a = [0, 0], b = [0, 0];
  for (let k = 0; k < n; k++) {
    const s = k * l.L / n; pos(l, s - 0.5, a); pos(l, s + 0.5, b);
    let tx = b[0] - a[0], tz = b[1] - a[1]; const m = Math.hypot(tx, tz) || 1; tx /= m; tz /= m;
    const nx = -tz, nz = tx; pos(l, s, a);
    for (const [lat, y] of perfilVia) pos3.push(a[0] + nx * lat, y, a[1] + nz * lat);
  }
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    for (let p = 0; p < np - 1; p++) { const i0 = k * np + p, i1 = k * np + p + 1, j0 = k2 * np + p, j1 = k2 * np + p + 1; idx.push(i0, j0, i1, i1, j0, j1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos3, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; ctx.scene.add(m); return m;
}
function montarVia(l) {
  const brita = new THREE.MeshStandardMaterial({ color: '#8d8579', roughness: 1, side: THREE.DoubleSide });
  const aco = new THREE.MeshStandardMaterial({ color: '#8e9298', roughness: 0.3, metalness: 0.85, side: THREE.DoubleSide });
  faixaAoLongo(l, [[-2.5, 0.01], [-1.7, 0.25], [1.7, 0.25], [2.5, 0.01]], brita);
  for (const s of [-1, 1]) faixaAoLongo(l, [[s * 0.78, 0.33], [s * 0.78, TRILHO], [s * 0.68, TRILHO], [s * 0.68, 0.33]], aco, 1);
  // dormentes
  const n = Math.floor(l.L / 0.65), dorm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 0.09, 0.24), new THREE.MeshStandardMaterial({ color: '#5d4b3a', roughness: 0.9 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), e = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), a = [0, 0], b = [0, 0];
  for (let k = 0; k < n; k++) {
    const s = k * l.L / n; pos(l, s - 0.5, a); pos(l, s + 0.5, b);
    q.setFromAxisAngle(up, Math.atan2(b[0] - a[0], b[1] - a[1])); pos(l, s, a);
    m.compose(v.set(a[0], 0.29, a[1]), q, e); dorm.setMatrixAt(k, m);
  }
  dorm.receiveShadow = true; ctx.scene.add(dorm);
  // postes e fios da rede aérea nas retas
  const sg = l.sinal, poste = new THREE.MeshStandardMaterial({ color: '#6c7178', roughness: 0.5, metalness: 0.6 });
  const fio = new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.5 });
  const lista = []; for (let z = 200; z <= 860; z += 44) lista.push(z);
  const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 6.8, 8).translate(0, 3.4, 0), poste, lista.length * 2);
  const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(5.4, 0.12, 0.12), poste, lista.length * 2);
  lista.forEach((z, k) => {
    for (const sx of [-1, 1]) {
      m.compose(v.set(sx * 8.4, 0, sg * z), q.identity(), e.set(1, 1, 1)); pm.setMatrixAt(k * 2 + (sx > 0), m);
      m.compose(v.set(sx * 5.9, 6.5, sg * z), q.identity(), e.set(1, 1, 1)); bm.setMatrixAt(k * 2 + (sx > 0), m);
    }
  });
  pm.castShadow = true; ctx.scene.add(pm, bm);
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 660), fio); f.position.set(sx * 4, 6.0, sg * 530); ctx.scene.add(f); }
}

function estacao(l, lado) {
  const sg = l.sinal, T = ctx.textoSprite;
  const zt = lado === 'centro' ? 140 : 920;           // linha do trilho
  const dir = lado === 'centro' ? 1 : -1;            // a plataforma fica do lado da cidade (centro: |z| menor)
  const zp0 = zt - dir * 2.05, zp1 = zt - dir * 8.0; // borda junto ao trem e borda de trás
  const rz0 = zp1, rz1 = zp1 - dir * 6;              // rampa
  const zmin = (a, b) => Math.min(sg * a, sg * b), zmax = (a, b) => Math.max(sg * a, sg * b);
  const plat = { x0: -30, x1: 30, z0: zmin(zp0, zp1), z1: zmax(zp0, zp1) };
  mundo.addPiso({ ...plat, h: ALT_PLAT });
  mundo.addPiso({ x0: -30, x1: 30, z0: zmin(rz0, rz1), z1: zmax(rz0, rz1), h: 0, rampa: { eixo: 'z', de: sg * rz1, ate: sg * rz0, h0: 0.12, h1: ALT_PLAT } });
  const conc = new THREE.MeshStandardMaterial({ color: '#cbc4b6', roughness: 0.9 });
  const bloco = new THREE.Mesh(new THREE.BoxGeometry(60, ALT_PLAT, 5.95), conc);
  bloco.position.set(0, ALT_PLAT / 2, sg * (zp0 + zp1) / 2); bloco.receiveShadow = true; bloco.castShadow = true; ctx.scene.add(bloco);
  const faixa = new THREE.Mesh(new THREE.PlaneGeometry(60, 0.45).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e8c33a', roughness: 0.7 }));
  faixa.position.set(0, ALT_PLAT + 0.005, sg * (zp0 - dir * 0.5)); ctx.scene.add(faixa);
  const comp = 6, ang = Math.atan2(ALT_PLAT - 0.12, comp);
  const rampa = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, Math.hypot(comp, ALT_PLAT)), conc);
  rampa.position.set(0, (ALT_PLAT + 0.12) / 2 - 0.08, sg * (rz0 + rz1) / 2); rampa.rotation.x = -sg * dir * ang; rampa.receiveShadow = true; ctx.scene.add(rampa);
  // cobertura
  const verde = new THREE.MeshStandardMaterial({ color: '#2f6f5e', roughness: 0.6, metalness: 0.2 });
  const pil = new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.5 });
  const zc = sg * (zp0 + zp1) / 2 - sg * dir * 0.8;
  for (let x = -25; x <= 25; x += 10) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.6, 10), pil); c.position.set(x, ALT_PLAT + 1.8, zc); c.castShadow = true; ctx.scene.add(c);
    mundo.addCol({ tipo: 'circ', x, z: zc, r: 0.25 });
    const banco = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.6), new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.7 }));
    banco.position.set(x + 4.5, ALT_PLAT + 0.23, zc - sg * dir * 1.4); banco.castShadow = true; ctx.scene.add(banco);
  }
  const cob = new THREE.Mesh(new THREE.BoxGeometry(62, 0.22, 7.4), verde); cob.position.set(0, ALT_PLAT + 3.7, zc); cob.castShadow = true; ctx.scene.add(cob);
  const borda = new THREE.Mesh(new THREE.BoxGeometry(62.2, 0.35, 0.18), pil); borda.position.set(0, ALT_PLAT + 3.55, zc + sg * dir * 3.7); ctx.scene.add(borda);
  const nome = nomeParada(l, lado);
  const p1 = T(nome, { escala: 1.2, fundo: 'rgba(20,70,58,.92)' }); p1.position.set(0, ALT_PLAT + 5.1, zc); ctx.scene.add(p1);
  const p2 = T(`${l.nome} → ${nomeParada(l, lado === 'centro' ? 'destino' : 'centro')}`, { escala: 0.65, fundo: 'rgba(200,40,46,.9)' });
  p2.position.set(0, ALT_PLAT + 4.3, zc); ctx.scene.add(p2);
  // prédio da estação na praça
  const zh = lado === 'centro' ? sg * 119.5 : sg * 931;
  for (const x of [-40, 40]) mundo.predio(x, zh, 14, 10, 8, { y: 0.12, cor: '#c9a27a', det: false });
  if (lado === 'centro') { mundo.addPiso({ x0: -mundo.CORREDOR, x1: mundo.CORREDOR, z0: zmin(113, rz1), z1: zmax(113, rz1), h: 0.12 }); }
  const praca = new THREE.Mesh(new THREE.BoxGeometry(mundo.CORREDOR * 2, 0.12, Math.abs(rz1 - (lado === 'centro' ? 113 : 940))), new THREE.MeshStandardMaterial({ color: '#d4cdbf', roughness: 0.9 }));
  if (lado === 'centro') { praca.position.set(0, 0.06, sg * (113 + rz1) / 2); praca.receiveShadow = true; ctx.scene.add(praca); }
  return { ...plat, zSaida: sg * (zp0 + zp1) / 2 - sg * dir * 1.5, lado, nome };
}

// ---------------------------------------------------------------- API
export function nomeParada(l, lado) { return lado === 'centro' ? (l.sinal < 0 ? 'Estação Norte' : 'Estação Sul') : `Estação ${l.destino}`; }
export function montar(contexto) {
  ctx = contexto;
  const mats = materiaisTrem();
  const modelos = { loco: modeloLoco(mats), vagao: modeloVagao(mats), glb: ctx.modelo?.('trem') || null };
  for (const [i, c] of [{ nome: 'Linha Norte', destino: 'Vila Serra', sinal: -1 }, { nome: 'Linha Sul', destino: 'Porto Sul', sinal: 1 }].entries()) {
    const t = tracado(c.sinal);
    const l = { ...c, ...t, id: i, fase: i * 37.5 };
    l.s0 = sMaisPerto(l, 0, c.sinal * 140); l.s1 = sMaisPerto(l, 0, c.sinal * 920);
    l.d1 = ((l.s1 - l.s0) % l.L + l.L) % l.L;
    montarVia(l);
    l.plataformas = { centro: estacao(l, 'centro'), destino: estacao(l, 'destino') };
    montarTrens(l, mats, modelos);
    linhas.push(l);
  }
}

const _a = [0, 0], _b = [0, 0];
export function atualizar(t) {
  for (const l of linhas) l.trens.forEach((tr, k) => {
    tr.est = estado(l, k, t);
    for (const c of tr.carros) {
      pos(l, tr.est.s + c.off + c.b, _a); pos(l, tr.est.s + c.off - c.b, _b);
      c.x = (_a[0] + _b[0]) / 2; c.z = (_a[1] + _b[1]) / 2; c.yaw = Math.atan2(_a[0] - _b[0], _a[1] - _b[1]);
      c.g.position.set(c.x, TRILHO, c.z); c.g.rotation.y = c.yaw;
      if (c.ext) { c.ext.position.set(c.x, TRILHO - 0.3, c.z); c.ext.rotation.y = c.yaw; }
    }
  });
}
export function ocultarTeto(li, k, oculto) {
  const tr = linhas[li]?.trens[k]; if (!tr || tr.tetoOculto === oculto) return;
  tr.tetoOculto = oculto;
  for (const c of tr.carros) if (c.ext) { c.ext.visible = !oculto; c.g.visible = oculto; }
  for (const c of tr.carros) if (c.tipo === 'vagao') c.g.traverse((o) => { if (o.userData.parte === 'teto' || o.userData.parte === 'luz') o.visible = !oculto; });
}
// posição de uma vaga (em pé dentro do vagão)
export function vaga(li, k, v) {
  const tr = linhas[li]?.trens[k]; if (!tr) return null;
  const c = tr.carros[1 + Math.floor(v / VAGAS.length) % 3], [lx, lz] = VAGAS[v % VAGAS.length];
  const co = Math.cos(c.yaw), si = Math.sin(c.yaw);
  return { x: c.x + lx * co + lz * si, y: TRILHO + PISO, z: c.z - lx * si + lz * co, yaw: c.yaw + (lz > 5 || lz < -5 ? (lz > 0 ? 0 : Math.PI) : Math.PI / 2) };
}
export function estadoDe(li, k) { return linhas[li]?.trens[k]?.est || null; }
// plataforma em que o jogador está e o trem parado nela
export function plataformaEm(x, z) {
  for (const l of linhas) for (const lado of ['centro', 'destino']) {
    const p = l.plataformas[lado];
    if (x > p.x0 - 1 && x < p.x1 + 1 && z > p.z0 - 1.2 && z < p.z1 + 1.2) {
      const k = l.trens.findIndex((tr) => tr.est?.parado === lado);
      return { linha: l, lado, plat: p, trem: k >= 0 ? k : null, resta: k >= 0 ? l.trens[k].est.resta : 0 };
    }
  }
  return null;
}
export function proxima(l, lado, t) { return proximaChegada(l, lado, t); }
export function pontoDeSaida(li, lado, x) {
  const p = linhas[li].plataformas[lado];
  return { x: THREE.MathUtils.clamp(x, p.x0 + 1.5, p.x1 - 1.5), z: p.zSaida };
}
// empurra o jogador para fora dos vagões (quem anda pelos trilhos)
export function empurrar(p, raio) {
  for (const l of linhas) for (const tr of l.trens) for (const c of tr.carros) {
    const dx = p.x - c.x, dz = p.z - c.z; if (dx * dx + dz * dz > 120) continue;
    const co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    const lx = dx * co - dz * si, lz = dx * si + dz * co, hx = HW + 0.1 + raio, hz = c.len / 2 + raio;
    if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
    const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
    let nx = lx, nz = lz;
    if (px < pz) nx = Math.sign(lx || 1) * hx; else nz = Math.sign(lz || 1) * hz;
    p.x = c.x + nx * co + nz * si; p.z = c.z - nx * si + nz * co;
  }
}
// trem andando passa por cima de quem está no trilho
export function atropela(p, raio) {
  for (const l of linhas) for (const tr of l.trens) {
    if (!tr.est || tr.est.parado !== null) continue;
    for (const c of tr.carros) {
      const dx = p.x - c.x, dz = p.z - c.z; if (dx * dx + dz * dz > 120) continue;
      const co = Math.cos(c.yaw), si = Math.sin(c.yaw), lx = dx * co - dz * si, lz = dx * si + dz * co;
      if (Math.abs(lx) < HW + raio && Math.abs(lz) < c.len / 2 + raio) return true;
    }
  }
  return false;
}
// trens em movimento (para o som): posição de cada um que não está parado na estação
export function andando() { const r = []; for (const l of linhas) for (const tr of l.trens) if (tr.est && tr.est.parado === null) { const c = tr.carros[1]; r.push({ x: c.x, z: c.z, li: l.id, k: l.trens.indexOf(tr) }); } return r; }
export function marcadores() { const r = []; for (const l of linhas) for (const tr of l.trens) { const c = tr.carros[1]; r.push([c.x, c.z, c.yaw]); } return r; }
export function desenharMapa(g) {
  g.strokeStyle = '#5a4632'; g.lineWidth = 3;
  for (const l of linhas) {
    g.beginPath(); l.pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath(); g.stroke();
    g.fillStyle = '#e0d7c3';
    for (const p of Object.values(l.plataformas)) g.fillRect(p.x0, p.z0, p.x1 - p.x0, p.z1 - p.z0);
  }
}
