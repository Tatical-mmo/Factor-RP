// Céu de verdade para quem olha para cima (câmeras 3D): estrelas e lua à noite, nuvens que mudam com o tempo
// (brancas no tempo limpo, cinzas na chuva, escuras na tempestade, claras na neve) e o raio desenhado no relâmpago.
// Tudo acompanha a câmera e ignora a neblina; na câmera de cima (isométrica) fica escondido.
import * as THREE from 'three';

let grupo = null, estrelas = null, lua = null, nuvens = null, matNuvem = null, raios = [];
const NUVENS = 34, BOLAS = 9, RAIO_N = 560, CEU = 600;   // a câmera enxerga até 700 m
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const nuv = [];   // { x, z, y, esc, bolas: [[dx, dy, dz, r]] }
let rnd = 7;
const aleat = () => { rnd = (rnd * 16807) % 2147483647; return (rnd - 1) / 2147483646; };

export function iniciar(scene) {
  grupo = new THREE.Group(); scene.add(grupo);
  // estrelas: pontos numa cúpula grande
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = aleat() * Math.PI * 2, y = 0.08 + aleat() * 0.92, r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * CEU, y * CEU, Math.sin(a) * r * CEU], i * 3);
  }
  const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  estrelas = new THREE.Points(ge, new THREE.PointsMaterial({ color: '#ffffff', size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  estrelas.frustumCulled = false; estrelas.renderOrder = -2; grupo.add(estrelas);
  // lua
  lua = new THREE.Mesh(new THREE.CircleGeometry(22, 32), new THREE.MeshBasicMaterial({ color: '#f3efdc', transparent: true, opacity: 0, fog: false, depthWrite: false }));
  lua.renderOrder = -1; grupo.add(lua);
  // nuvens: várias bolas achatadas por nuvem (uma malha só)
  matNuvem = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
  nuvens = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7), matNuvem, NUVENS * BOLAS);
  nuvens.frustumCulled = false; nuvens.renderOrder = -1; grupo.add(nuvens);
  for (let k = 0; k < NUVENS; k++) {
    const bolas = [];
    // nuvem fofa: base larga e quase reta, e "couve-flor" mais alta no meio (bolas menores nas pontas)
    const comp = 40 + aleat() * 40, larg = 18 + aleat() * 16;
    for (let b = 0; b < BOLAS; b++) {
      const u = (b / (BOLAS - 1)) * 2 - 1, meio = 1 - Math.abs(u);
      bolas.push([u * comp / 2 + (aleat() - 0.5) * 8, meio * (6 + aleat() * 10), (aleat() - 0.5) * larg, 7 + meio * 11 + aleat() * 5]);
    }
    nuv.push({ x: (aleat() - 0.5) * 2 * RAIO_N, z: (aleat() - 0.5) * 2 * RAIO_N, y: 170 + aleat() * 60, esc: 0.7 + aleat() * 0.7, bolas, liga: aleat() });
  }
}

// relâmpago: um raio em zigue-zague do céu até o chão. Na câmera 3D cai na frente de quem olha.
// É um tubo de verdade (com brilho em volta): linha fina some na tela do celular.
export function raio(centro, alturaChao, cam) {
  if (!grupo) return;
  let a = Math.random() * Math.PI * 2;
  if (cam?.isPerspectiveCamera) { cam.getWorldDirection(_p); a = Math.atan2(_p.z, _p.x) + (Math.random() - 0.5) * 1.1; }
  const d = 120 + Math.random() * 220, x = centro.x + Math.cos(a) * d, z = centro.z + Math.sin(a) * d;
  const pts = [], y0 = 230, y1 = alturaChao(x, z);
  let px = x + (Math.random() - 0.5) * 40, pz = z + (Math.random() - 0.5) * 40;
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector3(px, y0 + (y1 - y0) * t, pz)); px += (x - px) * 0.25 + (Math.random() - 0.5) * 16; pz += (z - pz) * 0.25 + (Math.random() - 0.5) * 16; }
  const linhas = [[pts, 0.9]];
  for (let g = 0; g < 3; g++) {   // galhos
    const i0 = 2 + Math.floor(Math.random() * 7), p = pts[i0].clone(), br = [p.clone()];
    for (let i = 0; i < 5; i++) { p.x += (Math.random() - 0.5) * 26; p.z += (Math.random() - 0.5) * 26; p.y -= 10 + Math.random() * 10; br.push(p.clone()); }
    linhas.push([br, 0.5]);
  }
  for (const [l, r] of linhas) {
    const cam3 = new THREE.CurvePath(); for (let i = 1; i < l.length; i++) cam3.add(new THREE.LineCurve3(l[i - 1], l[i]));
    for (const [esp, cor, op] of [[r, '#f4f8ff', 1], [r * 4, '#9fc4ff', 0.35]]) {
      const o = new THREE.Mesh(new THREE.TubeGeometry(cam3, (l.length - 1) * 2, esp, 5, false),
        new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: op, fog: false, toneMapped: false, depthWrite: false }));
      o.frustumCulled = false; o.userData.op = op; grupo.add(o); raios.push({ o, t: 0 });
    }
  }
}

// noite: 0 (dia) a 1 (noite); tempo: 'limpo' | 'chuva' | 'tempestade' | 'neve'; forca: 0..1; ativo: câmera 3D
export function atualizar(dt, cam, noite, tempo, forca, ativo, sol) {
  if (!grupo) return;
  grupo.visible = ativo;
  for (let i = raios.length - 1; i >= 0; i--) { const r = raios[i]; r.t += dt; r.o.material.opacity = r.o.userData.op * (r.t < 0.1 ? 1 : r.t < 0.17 ? 0.15 : r.t < 0.3 ? 1 : Math.max(0, 1 - (r.t - 0.3) * 3.5)); if (r.t > 0.6) { grupo.remove(r.o); r.o.geometry.dispose(); r.o.material.dispose(); raios.splice(i, 1); } }
  if (!ativo) return;
  const c = cam.position, fechado = tempo === 'limpo' ? 0 : forca;
  estrelas.position.copy(c); estrelas.material.opacity = Math.max(0, noite - 0.25) / 0.75 * (1 - fechado * 0.95);
  // lua: do lado oposto do sol (ou num canto do céu)
  _p.set(-(sol?.x ?? 0.4), Math.max(0.35, Math.abs(sol?.y ?? 0.6)), -(sol?.z ?? 0.3)).normalize();
  lua.position.copy(c).addScaledVector(_p, CEU - 40); lua.lookAt(c); lua.material.opacity = Math.max(0, noite - 0.3) / 0.7 * (1 - fechado * 0.9);
  // nuvens: quantas aparecem e a cor dependem do tempo; elas andam devagar com o vento e acompanham quem olha
  const cobertura = tempo === 'limpo' ? 0.3 : 0.3 + 0.7 * forca;
  const cor = tempo === 'tempestade' ? 0.28 : tempo === 'chuva' ? 0.52 : tempo === 'neve' ? 0.8 : 1;
  const luz = 0.25 + 0.75 * (1 - noite);
  matNuvem.color.setScalar(cor * luz); matNuvem.opacity = 0.55 + 0.4 * (tempo === 'limpo' ? 0 : forca);
  let i = 0;
  for (const n of nuv) {
    n.x += dt * 2.2; if (n.x - c.x > RAIO_N) n.x -= 2 * RAIO_N; if (n.x - c.x < -RAIO_N) n.x += 2 * RAIO_N; if (n.z - c.z > RAIO_N) n.z -= 2 * RAIO_N; if (n.z - c.z < -RAIO_N) n.z += 2 * RAIO_N;
    const vis = n.liga < cobertura;
    for (const [dx, dy, dz, r] of n.bolas) {
      const e = vis ? r * n.esc * (tempo === 'tempestade' ? 1.4 : 1) : 0.0001;
      _m.compose(_p.set(n.x + dx * n.esc, n.y + dy, n.z + dz * n.esc), _q, _s.set(e * 1.1, e * 0.8, e)); nuvens.setMatrixAt(i++, _m);
    }
  }
  nuvens.instanceMatrix.needsUpdate = true;
}
