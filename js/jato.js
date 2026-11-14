// Caças da Base Aérea (feitos por código). Se existir o GLB (caca_leve, caca_furtivo, asa_furtiva), o casco vem
// dele, ajustado ao tamanho do jogo. Frente = +z, rodas no chão (y = 0). Também o míssil e o rastro de fumaça.
import * as THREE from 'three';

export const JATOS = {
  caca_leve: { nome: 'Caça leve', comp: 14, vdec: 34, vmax: 95, giro: 0.9, misseis: 4, raio: 5 },
  caca_furtivo: { nome: 'Caça furtivo', comp: 18, vdec: 38, vmax: 120, giro: 0.75, misseis: 6, raio: 6 },
  asa_furtiva: { nome: 'Asa furtiva', comp: 20, vdec: 32, vmax: 80, giro: 0.45, misseis: 0, raio: 10, invisivel: true },
};
let M = null;
function mats() {
  if (M) return M;
  const m = (c, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.55, ...x });
  M = { cinza: m('#8a939b'), escuro: m('#3a3f45', { roughness: 0.7 }), preto: m('#24272b', { roughness: 0.85, metalness: 0.3 }),
    vidro: m('#1b2a38', { roughness: 0.05, metalness: 0.8, emissive: '#0c1a26' }), bocal: m('#5a4a3a', { emissive: '#3a1a08' }),
    pneu: m('#141414', { roughness: 0.9, metalness: 0 }), branco: m('#e8e8e8', { roughness: 0.4 }),
    fogo: new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false, transparent: true, opacity: 0.85 }) };
  return M;
}
const caixa = (g, w, h, d, x, y, z, mat, r = [0, 0, 0]) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.rotation.set(...r); o.castShadow = true; g.add(o); return o; };
// asa plana (forma em planta) extrudada fino
function asa(g, pts, esp, y, mat) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: esp, bevelEnabled: false }); geo.rotateX(Math.PI / 2); geo.translate(0, y + esp / 2, 0);
  const o = new THREE.Mesh(geo, mat); o.castShadow = true; g.add(o); return o;
}
function trem(g, pts, y) {
  const m = mats();
  for (const [x, z] of pts) { caixa(g, 0.12, y, 0.12, x, y / 2 + 0.25, z, m.escuro); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12), m.pneu); r.rotation.z = Math.PI / 2; r.position.set(x, 0.32, z); g.add(r); }
}
function cacaLeve() {
  const g = new THREE.Group(), m = mats();
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 11, 14), m.cinza); corpo.rotation.x = Math.PI / 2; corpo.position.set(0, 1.9, -0.5); corpo.castShadow = true; g.add(corpo);
  const nariz = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3.2, 14), m.cinza); nariz.rotation.x = Math.PI / 2; nariz.position.set(0, 1.9, 6.6); g.add(nariz);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), m.vidro); cab.scale.set(1, 0.8, 2.4); cab.position.set(0, 2.6, 3.4); g.add(cab);
  asa(g, [[-0.6, 2.5], [-5, -2.5], [-5, -3.6], [5, -3.6], [5, -2.5], [0.6, 2.5]], 0.18, 1.7, m.cinza);
  asa(g, [[-0.4, 4.9], [-1.6, 4.0], [1.6, 4.0], [0.4, 4.9]], 0.1, 2.0, m.cinza);                      // canards
  caixa(g, 0.16, 2.6, 2.6, 0, 3.3, -4.6, m.cinza, [-0.35, 0, 0]);                                      // deriva
  const bocal = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.9, 14, 1, true), m.bocal); bocal.rotation.x = Math.PI / 2; bocal.position.set(0, 1.9, -6.3); g.add(bocal);
  const chama = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 10), m.fogo); chama.rotation.x = -Math.PI / 2; chama.position.set(0, 1.9, -7.8); chama.name = 'chama'; g.add(chama);
  trem(g, [[0, 4.3], [-1.3, -1.6], [1.3, -1.6]], 1.4);
  return g;
}
function cacaFurtivo() {
  const g = new THREE.Group(), m = mats();
  caixa(g, 2.6, 1.2, 13, 0, 1.9, -0.5, m.escuro);
  const nariz = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4, 4), m.escuro); nariz.rotation.set(Math.PI / 2, 0, Math.PI / 4); nariz.scale.set(1.2, 1, 0.6); nariz.position.set(0, 1.9, 8); g.add(nariz);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), m.vidro); cab.scale.set(1, 0.75, 2.6); cab.position.set(0, 2.65, 4.6); g.add(cab);
  asa(g, [[-1.3, 3.2], [-6.8, -2.6], [-6.8, -4.2], [6.8, -4.2], [6.8, -2.6], [1.3, 3.2]], 0.2, 1.75, m.escuro);
  asa(g, [[-1.3, -4.6], [-3.6, -6.6], [-3.6, -7.4], [3.6, -7.4], [3.6, -6.6], [1.3, -4.6]], 0.15, 1.8, m.escuro);   // estabilizadores
  for (const s of [-1, 1]) caixa(g, 0.15, 2.4, 2.4, s * 1.4, 3.2, -5.2, m.escuro, [-0.3, 0, s * 0.45]);           // derivas em V
  for (const s of [-1, 1]) { caixa(g, 1.1, 0.9, 0.5, s * 0.75, 1.9, -7.2, m.bocal); const ch = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.6, 8), m.fogo); ch.rotation.x = -Math.PI / 2; ch.position.set(s * 0.75, 1.9, -8.8); ch.name = 'chama'; g.add(ch); }
  trem(g, [[0, 5.5], [-1.6, -2], [1.6, -2]], 1.4);
  return g;
}
function asaFurtiva() {
  const g = new THREE.Group(), m = mats();
  // asa voadora em forma de "W" atrás (bordo de fuga serrilhado), 30 m de envergadura no jogo
  asa(g, [[0, 9], [-15, -3], [-15, -4.4], [-11, -6.5], [-7.5, -3.6], [-3.8, -6.5], [0, -3.8], [3.8, -6.5], [7.5, -3.6], [11, -6.5], [15, -4.4], [15, -3]], 0.5, 1.9, m.preto);
  const meio = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), m.preto); meio.scale.set(3.2, 0.9, 7); meio.position.set(0, 2.4, 1.2); g.add(meio);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.9), m.vidro); cab.position.set(0, 3.15, 5.2); cab.rotation.x = -0.35; g.add(cab);
  for (const s of [-1, 1]) caixa(g, 1.4, 0.5, 2.2, s * 3.6, 2.7, 0.6, m.escuro);                                // entradas de ar
  trem(g, [[0, 6], [-3.5, -1], [3.5, -1]], 1.5);
  return g;
}
export function criarJato(tipo, glb) {
  const J = JATOS[tipo], g = new THREE.Group(); g.name = 'jato';
  if (glb) {
    const c = glb.clone(true), b = new THREE.Box3().setFromObject(c), s = J.comp / Math.max(0.01, b.max.z - b.min.z);
    c.scale.setScalar(s); c.position.set(-(b.min.x + b.max.x) / 2 * s, -b.min.y * s, -(b.min.z + b.max.z) / 2 * s); g.add(c);
  } else g.add(tipo === 'caca_furtivo' ? cacaFurtivo() : tipo === 'asa_furtiva' ? asaFurtiva() : cacaLeve());
  g.userData.jato = tipo;
  return g;
}
// pós-combustão: a chama cresce com a velocidade
export function chamas(g, k) { g.traverse((o) => { if (o.name === 'chama') { o.visible = k > 0.05; o.scale.set(1, 0.4 + k * 1.2, 1); } }); }

// míssil: corpo branco, ponta cinza e fumaça
export function criarMissil(glb) {
  const g = new THREE.Group(), m = mats();
  if (glb) { const c = glb.clone(true), b = new THREE.Box3().setFromObject(c), s = 3.5 / Math.max(0.01, b.max.z - b.min.z); c.scale.setScalar(s); g.add(c); }
  else {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3, 8), m.branco); c.rotation.x = Math.PI / 2; g.add(c);
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 8), m.cinza); p.rotation.x = Math.PI / 2; p.position.z = 1.8; g.add(p);
    for (const a of [0, Math.PI / 2]) caixa(g, 0.9, 0.04, 0.4, 0, 0, -1.3, m.cinza, [0, 0, a]);
  }
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.2, 8), m.fogo); f.rotation.x = -Math.PI / 2; f.position.z = -2.1; g.add(f);
  return g;
}
const geoFum = new THREE.SphereGeometry(0.6, 8, 6);
const matFum = new THREE.MeshBasicMaterial({ color: '#d8d8d8', transparent: true, opacity: 0.5, depthWrite: false });
export function fumaca(scene, pos) { const o = new THREE.Mesh(geoFum, matFum.clone()); o.position.copy(pos); scene.add(o); return { o, t: 0 }; }
export function animarFumaca(scene, lista, dt) {
  for (let i = lista.length - 1; i >= 0; i--) { const f = lista[i]; f.t += dt; f.o.scale.setScalar(1 + f.t * 2.2); f.o.material.opacity = Math.max(0, 0.5 - f.t * 0.25); if (f.t > 2) { scene.remove(f.o); f.o.material.dispose(); lista.splice(i, 1); } }
}
