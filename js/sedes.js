// Prédios das empresas por fase de nível (5, 10 e 15), feitos por código.
//  5–9:  galpão com docas (os caminhões entram de ré)
// 10–14: complexo industrial: docas extras, escritório no telhado, chaminés e linha de produção
//  15:   sede gigante: torre de vidro sobre o galpão, 4 docas e linha de produção dupla
// O lote tem 19 x 19 m; a frente (rua) fica em +Z e o pátio dos caminhões atrás (−Z).
// Quando existe o modelo 3D da fase (empresa_f1..f3), ele substitui o prédio; docas, pátio e heliporto continuam por código.
import * as THREE from 'three';

const XL = -9.3, XR = 6.1;            // largura útil (à direita fica o corredor dos caminhões)
const FRENTE = 9.1;
export const fase = (nivel) => (nivel >= 15 ? 3 : nivel >= 10 ? 2 : nivel >= 5 ? 1 : 0);
export const docasDaFase = (f) => [0, 2, 3, 4][f];

let ctx = null, M = null;
const vivas = new Set();

function caixaUV(w, h, d, esc = 3) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / esc, uv.getY(i) * dims[f][1] / esc); }
  return g;
}
function materiais() {
  if (M) return M;
  const T = ctx.texturaCanvas;
  const zinco = T(128, (g, t) => { g.fillStyle = '#d3d7db'; g.fillRect(0, 0, t, t); for (let x = 0; x < t; x += 16) { g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(x, 0, 5, t); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x + 7, 0, 3, t); } });
  const porta = T(128, (g, t) => { g.fillStyle = '#5d636b'; g.fillRect(0, 0, t, t); for (let y = 0; y < t; y += 10) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y, t, 2); } });
  const vidro = T(128, (g, t) => {
    const gr = g.createLinearGradient(0, 0, t, t); gr.addColorStop(0, '#6f93b3'); gr.addColorStop(1, '#2a425a');
    g.fillStyle = gr; g.fillRect(0, 0, t, t);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(0, t * 0.8); g.lineTo(t * 0.6, 0); g.lineTo(t * 0.8, 0); g.lineTo(0, t); g.fill();
    g.strokeStyle = '#c9d2da'; g.lineWidth = 5; g.strokeRect(0, 0, t, t);
  });
  const listra = T(64, (g, t) => { for (let i = -t; i < t * 2; i += 16) { g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 8, 0); g.lineTo(i + 8 - t, t); g.lineTo(i - t, t); g.fill(); } g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#1d1d1d'; g.fillRect(0, 0, t, t); });
  const heli = T(128, (g, t) => { g.fillStyle = '#2b2f36'; g.fillRect(0, 0, t, t); g.strokeStyle = '#f2c230'; g.lineWidth = 6; g.beginPath(); g.arc(t / 2, t / 2, t * 0.4, 0, 7); g.stroke(); g.fillStyle = '#fff'; g.font = `bold ${t * 0.5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', t / 2, t / 2 + 4); });
  const fumaca = T(64, (g, t) => { g.clearRect(0, 0, t, t); const gr = g.createRadialGradient(t / 2, t / 2, 0, t / 2, t / 2, t / 2); gr.addColorStop(0, 'rgba(235,235,235,.85)'); gr.addColorStop(1, 'rgba(235,235,235,0)'); g.fillStyle = gr; g.fillRect(0, 0, t, t); });
  M = {
    zinco: new THREE.MeshStandardMaterial({ map: zinco, roughness: 0.55, metalness: 0.45 }),
    porta: new THREE.MeshStandardMaterial({ map: porta, roughness: 0.6, metalness: 0.4 }),
    vidro: new THREE.MeshStandardMaterial({ map: vidro, roughness: 0.08, metalness: 0.55, color: '#ffffff' }),
    vitrine: new THREE.MeshStandardMaterial({ color: '#9fc0d8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false }),
    concreto: new THREE.MeshStandardMaterial({ color: '#b5afa4', roughness: 0.9 }),
    escuro: new THREE.MeshStandardMaterial({ color: '#25282d', roughness: 0.7 }),
    listra: new THREE.MeshStandardMaterial({ map: listra, roughness: 0.7 }),
    borracha: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 }),
    luz: new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffe2a8', emissiveIntensity: 1.4 }),
    piso: new THREE.MeshStandardMaterial({ color: '#8e9196', roughness: 0.8 }),
    esteira: new THREE.MeshStandardMaterial({ color: '#2d3036', roughness: 0.5, metalness: 0.4 }),
    metal: new THREE.MeshStandardMaterial({ color: '#9aa1a8', roughness: 0.35, metalness: 0.8 }),
    braco: new THREE.MeshStandardMaterial({ color: '#e8862a', roughness: 0.45, metalness: 0.3 }),
    heli: new THREE.MeshStandardMaterial({ map: heli, roughness: 0.8 }),
    vermelho: new THREE.MeshStandardMaterial({ color: '#ff3030', emissive: '#ff2020', emissiveIntensity: 2 }),
    fumaca: new THREE.SpriteMaterial({ map: fumaca, transparent: true, depthWrite: false }),
  };
  return M;
}
export function corDaEmpresa(id) { return new THREE.Color().setHSL(((id * 67) % 360) / 360, 0.55, 0.45); }

function caixa(g, mat, w, h, d, x, y, z, uv = 0) {
  const m = new THREE.Mesh(uv ? caixaUV(w, h, d, uv) : new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}

// braço robótico simples que gira e abaixa
function bracoRobo(g, x, y, z) {
  const base = new THREE.Group(); base.position.set(x, y, z); g.add(base);
  caixa(base, M.escuro, 0.8, 0.3, 0.8, 0, 0.15, 0);
  const giro = new THREE.Group(); giro.position.y = 0.3; base.add(giro);
  caixa(giro, M.braco, 0.35, 1.3, 0.35, 0, 0.65, 0);
  const ombro = new THREE.Group(); ombro.position.y = 1.3; giro.add(ombro);
  caixa(ombro, M.braco, 0.28, 0.28, 1.4, 0, 0, 0.6);
  caixa(ombro, M.metal, 0.18, 0.5, 0.18, 0, -0.25, 1.25);
  const fase0 = Math.random() * 6;
  return (t) => { giro.rotation.y = Math.sin(t * 1.3 + fase0) * 1.1; ombro.rotation.x = 0.35 + Math.sin(t * 2.6 + fase0) * 0.25; };
}
// esteira com caixas andando
function esteira(g, x0, x1, z, y, cor) {
  const len = x1 - x0, cx = (x0 + x1) / 2;
  caixa(g, M.esteira, len, 0.12, 1.0, cx, y, z);
  for (let x = x0 + 0.4; x < x1; x += 1.6) caixa(g, M.metal, 0.12, y - 0.06, 0.12, x, (y - 0.06) / 2, z + 0.42), caixa(g, M.metal, 0.12, y - 0.06, 0.12, x, (y - 0.06) / 2, z - 0.42);
  const matC = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.7 });
  const itens = [];
  for (let k = 0; k < Math.floor(len / 1.4); k++) { const c = caixa(g, matC, 0.55, 0.45, 0.55, x0, y + 0.29, z); itens.push(c); }
  return (t) => itens.forEach((c, k) => { c.position.x = x0 + 0.3 + (((t * 1.1 + k * (len / itens.length)) % (len - 0.6)) + len) % (len - 0.6); });
}
function chamine(g, x, z, base, h) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, h, 12), M.concreto); c.position.set(x, base + h / 2, z); c.castShadow = true; g.add(c);
  caixa(g, M.vermelho, 0.95, 0.25, 0.95, x, base + h - 0.6, z).material = M.listra;
  const puffs = [];
  for (let k = 0; k < 6; k++) { const s = new THREE.Sprite(M.fumaca.clone()); s.position.set(x, base + h, z); g.add(s); puffs.push(s); }
  return (t) => puffs.forEach((s, k) => {
    const f = ((t * 0.22 + k / puffs.length) % 1);
    s.position.set(x + f * 2.5, base + h + f * 7, z - f * 1.2); s.scale.setScalar(1 + f * 3.5); s.material.opacity = 0.8 * (1 - f);
  });
}

export function construir({ x, z, nivel, fabrica, id, corProduto, helis = 0, nome = '' }) {
  materiais();
  const f = fase(nivel), n = docasDaFase(f), cor = corDaEmpresa(id);
  const g = new THREE.Group(); g.position.set(x, 0.18, z);
  const D = f === 1 ? 9 : 10, W = XR - XL, cx = (XL + XR) / 2;
  let H = f === 1 ? 7 : f === 2 ? 8 : 9;
  const zw = FRENTE - D;                         // parede de trás (docas)
  const anima = [];
  const tr = !fabrica && ctx.modelo?.(`transp_f${f}`), ab = fabrica && f === 1 && ctx.modelo?.('fabrica_aberta');   // fábrica 5–9: frente aberta com a produção à mostra
  const glb = f >= 1 && (tr || ab || ctx.modelo?.(`empresa_f${f}`));
  if (glb) return construirGlb({ g, glb, f, n, W, D, cx, zw, x, z, cor, helis, anima, alt: ab ? 0.585 : (tr ? ALT_TR : ALT_GLB)[f], nome });
  // galpão: chão, paredes de zinco, telhado e faixa da cor da empresa
  caixa(g, M.piso, W, 0.1, D, cx, 0.05, zw + D / 2);
  caixa(g, M.zinco, W, H, 0.25, cx, H / 2, zw + 0.12, 3);                          // fundo
  caixa(g, M.zinco, 0.25, H, D, XL + 0.12, H / 2, zw + D / 2, 3);                  // lado esquerdo
  caixa(g, M.zinco, 0.25, H, D, XR - 0.12, H / 2, zw + D / 2, 3);                  // lado direito
  caixa(g, M.concreto, W + 0.4, 0.35, D + 0.4, cx, H + 0.17, zw + D / 2);           // telhado
  const faixaMat = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.5, metalness: 0.2 });
  caixa(g, faixaMat, W + 0.45, 0.6, D + 0.45, cx, H - 0.6, zw + D / 2);
  if (fabrica) {
    // frente de vidro para ver a linha de produção
    caixa(g, M.vitrine, W - 0.5, H - 1.2, 0.08, cx, (H - 1.2) / 2, FRENTE - 0.1);
    for (let xx = XL + 0.2; xx <= XR; xx += W / 6) caixa(g, M.escuro, 0.18, H - 1.2, 0.2, xx, (H - 1.2) / 2, FRENTE - 0.1);
    caixa(g, M.escuro, W, 0.25, 0.25, cx, H - 1.2, FRENTE - 0.1);
    const linhas = f === 3 ? [FRENTE - 2.0, FRENTE - 4.6] : [FRENTE - 2.2];
    for (const zl of linhas) {
      anima.push(esteira(g, XL + 1, XR - 1, zl, 0.9, corProduto));
      const nb = f === 1 ? 1 : 2;
      for (let k = 0; k < nb; k++) anima.push(bracoRobo(g, XL + 3 + k * (W - 6) / Math.max(1, nb - 1 || 1), 0.1, zl - 1.5));
    }
    for (let k = 0; k < 3; k++) caixa(g, M.luz, 2.2, 0.08, 0.3, XL + 3 + k * 4.5, H - 0.25, FRENTE - 3);
  } else {
    // transportadora: frente fechada com janelas do escritório e portão
    caixa(g, M.zinco, W, H, 0.25, cx, H / 2, FRENTE - 0.12, 3);
    for (let k = 0; k < 4; k++) caixa(g, M.vidro, 2.2, 1.4, 0.1, XL + 2 + k * 3.6, H - 2.4, FRENTE + 0.02);
    caixa(g, M.porta, 4, 3.4, 0.1, cx + 3, 1.7, FRENTE + 0.02);
  }
  // docas no fundo: plataforma, porta de enrolar, borrachas, faixa e luz
  const docas = [];
  for (let k = 0; k < n; k++) {
    const dx = XL + W * (k + 0.5) / n;
    caixa(g, M.concreto, 3.4, 1.1, 1.2, dx, 0.55, zw - 0.6);
    caixa(g, M.listra, 3.4, 0.14, 0.06, dx, 1.04, zw - 1.22);
    caixa(g, M.borracha, 3.4, 3.7, 0.2, dx, 2.95, zw - 0.05);
    caixa(g, M.porta, 2.9, 3.0, 0.12, dx, 2.65, zw - 0.17);
    for (const s of [-1, 1]) caixa(g, M.borracha, 0.3, 0.45, 0.3, dx + s * 1.2, 0.85, zw - 1.3);
    caixa(g, M.luz, 0.5, 0.14, 0.3, dx, 4.6, zw - 0.25);
    docas.push({ x: x + dx, z: z + zw - 1.2 - 3.75 });
  }
  if (f >= 2) {
    // escritório de vidro no telhado
    const ow = f === 3 ? 0 : 9.5;
    if (ow) { caixa(g, M.vidro, ow, 5, 4.2, XL + 0.3 + ow / 2, H + 0.35 + 2.5, FRENTE - 2.3, 3); caixa(g, faixaMat, ow + 0.2, 0.4, 4.4, XL + 0.3 + ow / 2, H + 5.05, FRENTE - 2.3); }
    // com heliporto, as chaminés vão para o lado esquerdo do telhado
    if (fabrica) for (let k = 0; k < (f === 3 ? 3 : 2); k++) anima.push(chamine(g, helis ? XL + 1.6 + k * 2.2 : XR - 1.6 - k * 2.2, zw + 1.8, H + 0.35, 6 + k * 1.5));
  }
  let topo = H + 0.35;
  if (f === 3) {
    // torre de vidro de 34 m sobre o galpão, com coroa colorida, heliponto e antena
    const tw = 8.4, th = 34, tx = XL + 0.2 + tw / 2, tz = FRENTE - tw / 2 - 0.1, b = H + 0.35;
    caixa(g, M.vidro, tw, th, tw, tx, b + th / 2, tz, 3);
    for (let y = b + 3.5; y < b + th; y += 3.5) caixa(g, M.escuro, tw + 0.08, 0.12, tw + 0.08, tx, y, tz);
    caixa(g, faixaMat, tw + 0.3, 2.2, tw + 0.3, tx, b + th - 1, tz);
    const heli = new THREE.Mesh(new THREE.PlaneGeometry(tw - 0.6, tw - 0.6).rotateX(-Math.PI / 2), M.heli); heli.position.set(tx, b + th + 0.06, tz); g.add(heli);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 7, 6), M.metal); ant.position.set(tx + tw / 2 - 0.6, b + th + 3.5, tz - tw / 2 + 0.6); g.add(ant);
    caixa(g, M.vermelho, 0.25, 0.25, 0.25, tx + tw / 2 - 0.6, b + th + 7.1, tz - tw / 2 + 0.6);
    topo = b + th;
  }
  // heliporto no telhado (lado direito) para quem tem helicóptero: até 2 plataformas
  const heliportos = [];
  for (let k = 0; k < Math.min(2, helis); k++) {
    const hx = XR - 2.9, hz = zw + 2.7 + k * 4.7, hy = H + 0.35;
    caixa(g, M.escuro, 4.6, 0.12, 4.6, hx, hy + 0.06, hz);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2), M.heli); pad.position.set(hx, hy + 0.13, hz); g.add(pad);
    for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) caixa(g, M.luz, 0.18, 0.12, 0.18, hx + dx, hy + 0.18, hz + dz);
    heliportos.push({ x: x + hx, z: z + hz, y: 0.18 + hy + 0.15 });
  }
  ctx.scene.add(g); g.updateMatrixWorld(true);
  const reg = { anima, vivo: true }; vivas.add(reg);
  const mats = []; g.traverse((o) => { if (o.isMesh && o.material !== M.vitrine) { o.material = o.material.clone(); mats.push(o.material); } });
  return {
    grupo: g, mats, docas, heliportos, altura: H, topo,
    caixa: new THREE.Box3(new THREE.Vector3(x + XL, 0, z + zw - 1.2), new THREE.Vector3(x + XR, topo, z + FRENTE)),
    remover: () => { reg.vivo = false; vivas.delete(reg); ctx.scene.remove(g); },
  };
}
// prédio da fase em 3D (GLB normalizado: caixa de 1 x 1 x 1, frente em +Z), esticado para o lote
const ALT_GLB = { 1: 0.48, 2: 0.594, 3: 1.261 * 1.6 }, ALT_TR = { 1: 0.517, 2: 0.417, 3: 0.82 * 1.6 };
// placa da fachada com o nome da empresa sobre a cor dela
function placaNome(nome, cor) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const t = c.getContext('2d');
  t.fillStyle = `#${cor.getHexString()}`; t.fillRect(0, 0, 512, 96); t.strokeStyle = 'rgba(255,255,255,.8)'; t.lineWidth = 6; t.strokeRect(3, 3, 506, 90);
  t.fillStyle = '#fff'; t.font = 'bold 54px system-ui'; t.textAlign = 'center'; t.textBaseline = 'middle'; t.fillText(String(nome || '').toUpperCase(), 256, 52, 480);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25 });
}
function construirGlb({ g, glb, f, n, W, D, cx, zw, x, z, cor, helis, anima, alt: altRel, nome }) {
  caixa(g, M.piso, W, 0.1, D, cx, 0.05, zw + D / 2);
  const m = glb.clone(true), alt = W * altRel;
  m.position.set(cx, 0, zw + D / 2); m.scale.set(W, alt, D); m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); g.add(m);
  caixa(g, placaNome(nome, cor), W * 0.62, 1.15, 0.12, cx, Math.min(alt - 1, 5.2), FRENTE + 0.1);   // placa com o nome e a cor da empresa
  // docas no fundo
  const docas = [];
  for (let k = 0; k < n; k++) {
    const dx = XL + W * (k + 0.5) / n;
    caixa(g, M.concreto, 3.4, 1.1, 1.2, dx, 0.55, zw - 0.6);
    caixa(g, M.listra, 3.4, 0.14, 0.06, dx, 1.04, zw - 1.22);
    caixa(g, M.borracha, 3.4, 3.7, 0.2, dx, 2.95, zw - 0.05);
    caixa(g, M.porta, 2.9, 3.0, 0.12, dx, 2.65, zw - 0.17);
    caixa(g, M.luz, 0.5, 0.14, 0.3, dx, 4.6, zw - 0.25);
    docas.push({ x: x + dx, z: z + zw - 1.2 - 3.75 });
  }
  // altura do telhado onde fica o heliporto (o modelo pode ter alturas diferentes): raio de cima para baixo
  g.position.set(x, 0.18, z); g.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), teto = (lx, lz) => { rc.set(new THREE.Vector3(x + lx, 300, z + lz), new THREE.Vector3(0, -1, 0)); const h = rc.intersectObject(m, true)[0]; return h ? h.point.y - 0.18 : alt; };
  const heliportos = [];
  for (let k = 0; k < Math.min(2, helis); k++) {
    const hx = XR - 2.9, hz = zw + 2.7 + k * 4.7, hy = teto(hx, hz);
    caixa(g, M.escuro, 4.6, 0.12, 4.6, hx, hy + 0.06, hz);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2), M.heli); pad.position.set(hx, hy + 0.13, hz); g.add(pad);
    heliportos.push({ x: x + hx, z: z + hz, y: 0.18 + hy + 0.15 });
  }
  ctx.scene.add(g); g.updateMatrixWorld(true);
  const reg = { anima, vivo: true }; vivas.add(reg);
  const mats = []; g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); mats.push(o.material); } });
  return {
    grupo: g, mats, docas, heliportos, altura: Math.min(alt, 9), topo: alt,
    caixa: new THREE.Box3(new THREE.Vector3(x + XL, 0, z + zw - 1.2), new THREE.Vector3(x + XR, alt, z + FRENTE)),
    remover: () => { reg.vivo = false; vivas.delete(reg); ctx.scene.remove(g); },
  };
}
let t0 = 0;
export function atualizar(dt) { t0 += dt; for (const r of vivas) for (const a of r.anima) a(t0); }
export function iniciar(contexto) { ctx = contexto; }
