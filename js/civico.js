// Prefeitura, concessionária, outdoors e modelos de carro (tudo feito por código).
import * as THREE from 'three';

let ctx = null;
export const PREFEITURA = { x: -135, z: -135, porta: { x: -135, z: -120.5 }, prf: { x: -146, z: -115 } };
export const CONCESSIONARIA = { x: 135, z: -135, balcao: { x: 135, z: -127.5 } };
export const CARROS = {
  popular: { nome: 'Popular', preco: 12000, vel: 15 },
  suv: { nome: 'SUV', preco: 30000, vel: 17 },
  esportivo: { nome: 'Esportivo', preco: 55000, vel: 24 },
  presidencial: { nome: 'Presidencial', preco: 0, vel: 20 },
};
export const CORES_CARRO = ['#c0392b', '#2c3e50', '#ecf0f1', '#f1c40f', '#2980b9', '#16a085', '#8e44ad', '#1f1f1f', '#d35400'];

const mat = (cor, ex = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.6, ...ex });
function bloco(g, m, w, h, d, x, y, z) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o;
}

export function iniciar(contexto) { ctx = contexto; }

// prefeitura neoclássica: salão, colunas, frontão, cúpula e bandeiras
export function montarPrefeitura() {
  const g = new THREE.Group(); g.position.set(PREFEITURA.x, 0.18, PREFEITURA.z);
  const branco = mat('#f1ece0', { roughness: 0.5 }), creme = mat('#e3d6b8'), cupula = mat('#b9c7cf', { metalness: 0.4, roughness: 0.35 });
  const vidro = mat('#2b3d4f', { roughness: 0.1, metalness: 0.5, emissive: '#ffcf7a', emissiveIntensity: 0 });
  bloco(g, creme, 34, 11, 22, 0, 5.5, -4);
  bloco(g, branco, 35, 0.6, 23, 0, 11.3, -4);
  for (let k = 0; k < 8; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 9.5, 14), branco); c.position.set(-12.6 + k * 3.6, 5.2, 9.3); c.castShadow = true; g.add(c); }
  bloco(g, branco, 30, 1.0, 5, 0, 10.4, 9.3);
  const fr = new THREE.Shape(); fr.moveTo(-15, 0); fr.lineTo(15, 0); fr.lineTo(0, 3.6); fr.lineTo(-15, 0);
  const fron = new THREE.Mesh(new THREE.ExtrudeGeometry(fr, { depth: 1, bevelEnabled: false }), branco); fron.position.set(0, 10.9, 11.3); fron.castShadow = true; g.add(fron);
  for (let k = 0; k < 3; k++) bloco(g, branco, 30 - k * 0.01, 0.3, 2.2 - k * 0.6, 0, 0.15 + k * 0.3, 12.6 - k * 0.6);
  for (let a = 0; a < 2; a++) for (let k = 0; k < 7; k++) bloco(g, vidro, 2, 3, 0.08, -13 + k * 4.3, 3 + a * 4.3, 6.96);
  bloco(g, mat('#5a3d22'), 3.2, 5, 0.1, 0, 2.5, 7.0);
  const tambor = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 3, 24), branco); tambor.position.set(0, 13.1, -4); tambor.castShadow = true; g.add(tambor);
  const dom = new THREE.Mesh(new THREE.SphereGeometry(5.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cupula); dom.position.set(0, 14.6, -4); dom.castShadow = true; g.add(dom);
  const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 8), mat('#d8d8d8', { metalness: 0.6 })); mastro.position.set(0, 22.6, -4); g.add(mastro);
  for (const [sx, cor] of [[-7, '#2f9e5b'], [7, '#f2c230']]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 8, 8), mat('#d8d8d8', { metalness: 0.6 })); m.position.set(sx, 4, 14); g.add(m);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), mat(cor, { side: THREE.DoubleSide })); b.position.set(sx + 1.25, 7.2, 14); g.add(b);
  }
  ctx.scene.add(g);
  ctx.janelas.push(vidro);
  const t1 = ctx.textoSprite('PREFEITURA', { escala: 1.4, fundo: 'rgba(30,50,80,.92)', cor: '#ffe7a8' }); t1.position.set(PREFEITURA.x, 17, PREFEITURA.z + 6); ctx.scene.add(t1);
  ctx.colisores.push({ tipo: 'caixa', x0: PREFEITURA.x - 17, x1: PREFEITURA.x + 17, z0: PREFEITURA.z - 15, z1: PREFEITURA.z + 11 });
  ctx.balcao(PREFEITURA.prf.x, PREFEITURA.prf.z, '#1f3f7a', 'PRF · Polícia Eleitoral', 'Entre em serviço e investigue');
}

// concessionária: vitrine de vidro com três carros em exposição
export function montarConcessionaria() {
  const g = new THREE.Group(); g.position.set(CONCESSIONARIA.x, 0.18, CONCESSIONARIA.z);
  const vidro = new THREE.MeshStandardMaterial({ color: '#9fc0d8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false });
  bloco(g, mat('#d9dde2'), 28, 0.15, 18, 0, 0.08, -5);
  bloco(g, mat('#2b2f36'), 28.4, 0.6, 18.4, 0, 6.3, -5);
  bloco(g, mat('#c0392b'), 28.5, 1.1, 0.3, 0, 5.6, 4.2);
  for (const [w, d, x, z] of [[28, 0.1, 0, 4], [0.1, 18, -14, -5], [0.1, 18, 14, -5]]) bloco(g, vidro, w, 5.6, d, x, 2.9, z);
  bloco(g, mat('#e9e6df'), 28, 6, 0.3, 0, 3, -14);
  ['popular', 'suv', 'esportivo'].forEach((m, k) => { const c = modeloCarro(m, CORES_CARRO[k * 3 % CORES_CARRO.length]); c.position.set(-8 + k * 8, 0.15, -4); c.rotation.y = 0.5; g.add(c); });
  ctx.scene.add(g);
  const t = ctx.textoSprite('CONCESSIONÁRIA', { escala: 1.2, fundo: 'rgba(160,30,30,.92)' }); t.position.set(CONCESSIONARIA.x, 8.2, CONCESSIONARIA.z + 2); ctx.scene.add(t);
  ctx.colisores.push({ tipo: 'caixa', x0: CONCESSIONARIA.x - 14, x1: CONCESSIONARIA.x + 14, z0: CONCESSIONARIA.z - 14, z1: CONCESSIONARIA.z + 4 });
  ctx.balcao(CONCESSIONARIA.balcao.x, CONCESSIONARIA.balcao.z, '#c0392b', 'Vendas de carros', 'Popular, SUV e Esportivo');
}

// carros: frente em +Z, chão em y = 0
const cacheCarro = new Map();
export function modeloCarro(modelo, cor) {
  const chave = modelo + cor;
  if (cacheCarro.has(chave)) return cacheCarro.get(chave).clone();
  const g = new THREE.Group();
  const pint = mat(cor, { roughness: 0.25, metalness: 0.55 }), vidro = mat('#1b2633', { roughness: 0.1, metalness: 0.6 }), pneu = mat('#161616', { roughness: 0.9 });
  const luz = mat('#fff6d0', { emissive: '#fff1c8', emissiveIntensity: 1.4 }), lanterna = mat('#c81e1e', { emissive: '#c81e1e', emissiveIntensity: 0.8 });
  const dims = { popular: [1.7, 0.6, 3.9, 1.5, 0.55, 2.0, 0.34], suv: [1.95, 0.85, 4.6, 1.8, 0.75, 2.7, 0.42], esportivo: [1.95, 0.5, 4.5, 1.6, 0.42, 1.8, 0.36], presidencial: [2.0, 0.7, 6.4, 1.85, 0.62, 3.6, 0.4] }[modelo];
  const [w, h, l, cw, ch, cl, r] = dims;
  bloco(g, pint, w, h, l, 0, r + h / 2 + 0.1, 0);
  bloco(g, vidro, cw, ch, cl, 0, r + h + ch / 2 + 0.08, modelo === 'esportivo' ? -0.3 : -0.2);
  bloco(g, pint, cw * 0.98, 0.08, cl * 0.9, 0, r + h + ch + 0.1, modelo === 'esportivo' ? -0.3 : -0.2);
  for (const sx of [-w / 2 + 0.25, w / 2 - 0.25]) {
    bloco(g, luz, 0.4, 0.14, 0.05, sx, r + h * 0.7, l / 2 + 0.01);
    bloco(g, lanterna, 0.4, 0.14, 0.05, sx, r + h * 0.7, -l / 2 - 0.01);
    for (const sz of [-l / 2 + 0.75, l / 2 - 0.75]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.26, 14).rotateZ(Math.PI / 2), pneu); p.position.set(sx + Math.sign(sx) * 0.05, r, sz); p.castShadow = true; g.add(p); }
  }
  if (modelo === 'esportivo') { bloco(g, mat('#111'), w, 0.06, 0.4, 0, r + h + 0.45, -l / 2 + 0.25); for (const sx of [-0.7, 0.7]) bloco(g, mat('#111'), 0.08, 0.35, 0.08, sx, r + h + 0.25, -l / 2 + 0.25); }
  if (modelo === 'presidencial') for (const sx of [-0.85, 0.85]) {
    bloco(g, mat('#cfcfcf', { metalness: 0.7 }), 0.04, 0.5, 0.04, sx, r + h + 0.35, l / 2 - 0.4);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), mat(sx < 0 ? '#2f9e5b' : '#f2c230', { side: THREE.DoubleSide })); b.position.set(sx, r + h + 0.5, l / 2 - 0.6); b.rotation.y = Math.PI / 2; g.add(b);
  }
  cacheCarro.set(chave, g);
  return g.clone();
}

// outdoors: duas colunas e uma placa com o anúncio desenhado num canvas
const outdoors = new Map();
function texturaOutdoor(o) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const livre = !o.ate || Date.parse(o.ate) < Date.now();
  const cand = o.tipo === 'candidato';
  const gr = g.createLinearGradient(0, 0, 512, 256);
  if (livre) { gr.addColorStop(0, '#3a3f48'); gr.addColorStop(1, '#22262d'); } else if (cand) { gr.addColorStop(0, '#1f4f9a'); gr.addColorStop(1, '#0f2a57'); } else { gr.addColorStop(0, '#c0392b'); gr.addColorStop(1, '#7a1f17'); }
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 8; g.strokeRect(8, 8, 496, 240);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const caber = (t, max, tam) => { let s = tam; do { g.font = `bold ${s}px sans-serif`; s -= 2; } while (g.measureText(t).width > max && s > 16); };
  if (livre) {
    caber('ANUNCIE AQUI', 470, 56); g.fillText('ANUNCIE AQUI', 256, 100);
    g.font = '28px sans-serif'; g.fillStyle = '#ffe7a8'; g.fillText('40 moedas por minuto · Prefeitura', 256, 170);
  } else {
    if (cand) { g.font = 'bold 30px sans-serif'; g.fillStyle = '#ffe7a8'; g.fillText('ELEIÇÃO PARA PREFEITO', 256, 50); g.fillStyle = '#fff'; }
    caber(o.titulo || '', 470, 60); g.fillText(o.titulo || '', 256, cand ? 120 : 105);
    if (o.texto) { caber(o.texto, 470, 34); g.fillStyle = '#f2f2f2'; g.fillText(o.texto, 256, cand ? 190 : 180); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export function atualizarOutdoors(lista) {
  for (const o of lista) {
    const livre = !o.ate || Date.parse(o.ate) < Date.now();
    const chave = livre ? 'livre' : `${o.titulo}|${o.texto}|${o.tipo}`;
    let v = outdoors.get(o.id);
    if (!v) {
      const g = new THREE.Group(), y = ctx.altura(o.x, o.z);
      g.position.set(o.x, y, o.z);
      for (const sx of [-2.2, 2.2]) bloco(g, mat('#3a3d42', { metalness: 0.5 }), 0.25, 3.2, 0.25, sx, 1.6, 0);
      const placa = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.15 }));
      placa.position.set(0, 4.8, 0); g.add(placa);
      bloco(g, mat('#2b2f36'), 6.7, 0.2, 0.4, 0, 3.15, 0);
      ctx.scene.add(g);
      ctx.colisores.push({ tipo: 'circ', x: o.x - 2.2, z: o.z, r: 0.3 }, { tipo: 'circ', x: o.x + 2.2, z: o.z, r: 0.3 });
      v = { g, placa, chave: null }; outdoors.set(o.id, v);
    }
    if (v.chave === chave) continue;
    v.chave = chave;
    v.placa.material.map?.dispose();
    const tex = texturaOutdoor(o); v.placa.material.map = tex; v.placa.material.emissiveMap = tex; v.placa.material.needsUpdate = true;
  }
}
export function brilhoOutdoors(noite) { for (const v of outdoors.values()) v.placa.material.emissiveIntensity = 0.15 + noite * 0.6; }
