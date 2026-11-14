// Óvni do Exército (fica escondido no hangar da Área 51): disco metálico com cúpula, anel de luzes que gira,
// luzes piscando por baixo e um halo fraco. Se existir assets/modelos/ovni.glb, o casco vem dele e as luzes
// são postas por cima. Os materiais das luzes são compartilhados: animar uma vez anima todos os óvnis.
import * as THREE from 'three';

const N_LUZES = 16, RAIO = 5.6;
let M = null;
function materiais() {
  if (M) return M;
  const brilho = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, fog: false });
  M = {
    casco: new THREE.MeshStandardMaterial({ color: '#b9c0c8', roughness: 0.28, metalness: 0.85 }),
    escuro: new THREE.MeshStandardMaterial({ color: '#4a5058', roughness: 0.4, metalness: 0.8 }),
    cupula: new THREE.MeshStandardMaterial({ color: '#2a4a5a', roughness: 0.05, metalness: 0.4, emissive: '#3df2ff', emissiveIntensity: 0.25, transparent: true, opacity: 0.85 }),
    anel: [brilho('#ff3b3b'), brilho('#3bff6a'), brilho('#3b8bff'), brilho('#ffe23b')],
    baixo: brilho('#9cf6ff'),
    nucleo: brilho('#d8fbff'),
    halo: new THREE.MeshBasicMaterial({ color: '#7ff6ff', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false }),
    feixe: new THREE.MeshBasicMaterial({ color: '#c9fbff', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false }),
  };
  return M;
}

export function criarOvni(glb) {
  const m = materiais(), g = new THREE.Group(); g.name = 'ovni';
  if (glb) {   // casco do modelo 3D, ajustado para ~12 m de diâmetro
    const c = glb.clone(true), b = new THREE.Box3().setFromObject(c), s = 12 / Math.max(0.01, b.max.x - b.min.x, b.max.z - b.min.z);
    c.scale.setScalar(s); c.position.y = -b.min.y * s + 0.4; g.add(c);
  } else {
    const perfil = [[0, 0.5], [2.2, 0.55], [4.8, 0.9], [6, 1.35], [6.05, 1.5], [4.8, 1.9], [2.6, 2.25], [0, 2.3]].map(([r, y]) => new THREE.Vector2(r, y));
    const disco = new THREE.Mesh(new THREE.LatheGeometry(perfil, 48), m.casco); disco.castShadow = true; g.add(disco);
    const aro = new THREE.Mesh(new THREE.TorusGeometry(6.02, 0.12, 8, 64), m.escuro); aro.rotation.x = Math.PI / 2; aro.position.y = 1.42; g.add(aro);
    const cup = new THREE.Mesh(new THREE.SphereGeometry(2.3, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.cupula); cup.position.y = 2.25; cup.scale.y = 0.75; g.add(cup);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.4, 32), m.escuro); base.position.y = 0.35; g.add(base);
    for (let k = 0; k < 3; k++) {   // trem de pouso
      const a = k * Math.PI * 2 / 3, p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.9, 8), m.escuro);
      p.position.set(Math.cos(a) * 3.2, 0.45, Math.sin(a) * 3.2); g.add(p);
      const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.08, 12), m.escuro); pe.position.set(p.position.x, 0.04, p.position.z); g.add(pe);
    }
  }
  // anel de luzes coloridas (gira) e luzes de baixo (piscam)
  const giro = new THREE.Group(); giro.name = 'ovniGiro'; giro.position.y = 1.42; g.add(giro);
  const bola = new THREE.SphereGeometry(0.26, 10, 8);
  for (let k = 0; k < N_LUZES; k++) { const a = k / N_LUZES * Math.PI * 2, l = new THREE.Mesh(bola, m.anel[k % m.anel.length]); l.position.set(Math.cos(a) * (RAIO + 0.5), 0, Math.sin(a) * (RAIO + 0.5)); giro.add(l); }
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), m.baixo); l.position.set(Math.cos(a) * 3.6, 0.62, Math.sin(a) * 3.6); g.add(l); }
  const nuc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 24), m.nucleo); nuc.rotation.x = Math.PI / 2; nuc.position.y = 0.14; g.add(nuc);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(8.2, 24, 12), m.halo); halo.position.y = 1.3; halo.scale.y = 0.42; halo.name = 'ovniHalo'; g.add(halo);
  g.userData.ovni = true;
  return g;
}

// anima todas as luzes de uma vez (materiais compartilhados) e gira o anel de cada óvni da lista
export function animar(t, lista, noite) {
  const m = materiais();
  m.anel.forEach((x, i) => { const v = 0.35 + 0.65 * Math.max(0, Math.sin(t * 6 + i * 1.6)); x.color.setRGB(...COR[i].map((c) => c * v)); });
  const pisca = (t * 1.7) % 1 < 0.5 ? 1 : 0.25; m.baixo.color.setScalar(pisca).multiply(_azul);
  m.nucleo.color.setRGB(0.6 + 0.4 * Math.sin(t * 3), 0.95, 1);
  m.halo.opacity = 0.05 + 0.13 * noite;
  m.cupula.emissiveIntensity = 0.2 + 0.5 * noite;
  for (const o of lista) { const gi = o.getObjectByName?.('ovniGiro'); if (gi) gi.rotation.y = t * 1.4; }
}
const COR = [[1, 0.23, 0.23], [0.23, 1, 0.42], [0.23, 0.55, 1], [1, 0.89, 0.23]];
const _azul = new THREE.Color('#9cf6ff');

// feixe de abdução: cone de luz do óvni até o chão (altura h), com anel no chão
export function feixe(h) {
  const m = materiais(), g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 3.4, h, 28, 1, true), m.feixe); cone.position.y = -h / 2; g.add(cone);
  const anel = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 32), m.feixe); anel.rotation.x = -Math.PI / 2; anel.position.y = -h + 0.05; g.add(anel);
  g.userData.cone = cone;
  return g;
}
export function animarFeixe(g, t) { g.userData.cone.rotation.y = t * 2; materiais().feixe.opacity = 0.24 + 0.12 * Math.sin(t * 9); }
