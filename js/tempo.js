// 22z4: efeitos do tempo mais realistas
//  - neve que acumula de verdade em tudo que fica virado para cima (rua, calçada, grama, telhados, copas, carros),
//    com marcas escuras de pneu nas ruas; derrete aos poucos quando o tempo abre (vale em todos os gráficos);
//  - chuva: reflexos compridos das luzes no asfalto molhado (postes, faróis e lanternas), do gráfico Alto para cima.
//    As gotas escorrendo na tela ficam no visual.js (pós-processamento).
import * as THREE from 'three';

let ctx = null;
export const UNEVE = { value: 0 };   // 0 = sem neve, 1 = tudo coberto

// ---------------------------------------------------------------- neve acumulada (injeção no shader dos materiais)
const NEVE_FRAG_TOPO = `
uniform float uNeve;
#ifdef NEVE_RUA
varying float vTrilha;
#endif
float nvH(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float nvR(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(nvH(i), nvH(i + vec2(1.0, 0.0)), f.x), mix(nvH(i + vec2(0.0, 1.0)), nvH(i + vec2(1.0, 1.0)), f.x), f.y); }`;
const NEVE_FRAG = (pbr) => `
  if (uNeve > 0.001) {
    vec3 nW = inverseTransformDirection(normal, viewMatrix);
    vec3 vNvP = cameraPosition + (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;   // posição no mundo sem varying a mais (celular tem limite)
    float rug = nvR(vNvP.xz * 0.31) * 0.62 + nvR(vNvP.xz * 1.9) * 0.38;
    float cobre = clamp(uNeve * 1.7 - rug * 0.7, 0.0, 1.0);
    float kN = smoothstep(0.42, 0.82, nW.y) * smoothstep(0.0, 0.3, cobre);
    #ifdef NEVE_RUA
    if (vTrilha < 50.0) {   // pneus: duas trilhas em cada mão (rua de 10 m, mão a mão), onde a neve some e o asfalto fica molhado
      float a = abs(vTrilha) + (nvR(vNvP.xz * 2.3) - 0.5) * 0.18;
      float tr = 1.0 - smoothstep(0.3, 0.7, min(abs(a - 1.6), abs(a - 3.4)));
      kN *= 0.82 * (1.0 - 0.85 * tr);
      diffuseColor.rgb *= 1.0 - 0.35 * tr * uNeve;   // trilha: lama de neve molhada
    }
    #endif
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.97), kN);
    ${pbr ? 'roughnessFactor = mix(roughnessFactor, 0.88, kN); metalnessFactor = mix(metalnessFactor, 0.0, kN);' : ''}
  }`;
const PROTO_KEY = THREE.Material.prototype.customProgramCacheKey;
function nevarMaterial(m) {
  m.userData.neve = true;
  const pbr = !!m.isMeshStandardMaterial, rua = !!m.userData.asfalto;
  const antes = m.onBeforeCompile, chave = m.customProgramCacheKey;
  const k0 = chave === PROTO_KEY ? String(antes) : null;   // a chave padrão do three é o texto do onBeforeCompile: guarda a de antes
  m.onBeforeCompile = function (sh, r) {
    antes?.call(this, sh, r);
    sh.uniforms.uNeve = UNEVE;
    if (rua) sh.defines = { ...(sh.defines || {}), NEVE_RUA: '' };
    if (rua) sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying float vTrilha;`).replace('#include <project_vertex>', `#include <project_vertex>
  {
    mat4 nvM = modelMatrix;
    #ifdef USE_INSTANCING
    nvM = modelMatrix * instanceMatrix;
    #endif
    float nsx = length(nvM[0].xyz), nsz = length(nvM[2].xyz);
    vTrilha = max(nsx, nsz) < 1.5 ? 99.0 : (nsx > nsz ? (0.5 - uv.y) * nsz : (uv.x - 0.5) * nsx);
  }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + NEVE_FRAG_TOPO)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + NEVE_FRAG(pbr));
  };
  m.customProgramCacheKey = () => (k0 !== null ? k0 : chave.call(m)) + '|neve2' + (rua ? 'R' : '');
  m.needsUpdate = true;
}
function podeNevar(o, m) {
  if (!m || m.userData.neve || m.userData.semNeve || m.transparent || m.isShaderMaterial || m.isRawShaderMaterial) return false;
  if (!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return false;
  return !o.isSkinnedMesh && !o.isPoints && !o.isLine && !o.isSprite;
}
// passa pela cena e prepara os materiais novos (os que já têm não recompilam de novo)
function prepararCena() {
  ctx.scene.traverse((o) => {
    if (!o.isMesh || o.userData.semNeve) return;
    for (const m of [].concat(o.material)) if (podeNevar(o, m)) nevarMaterial(m);
  });
}

// ---------------------------------------------------------------- reflexos das luzes no chão molhado
const NR = 44;
let reflexos = null, candidatos = [], tCand = 0;
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
const COR_POSTE = new THREE.Color('#ffb25c'), COR_FAROL = new THREE.Color('#fff0d2'), COR_LANT = new THREE.Color('#ff2a18');
function texturaReflexo() {
  const W = 32, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H);
  let sd = 9; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const faixas = Array.from({ length: H }, () => 0.55 + rnd() * 0.45);   // a água ondulada quebra o reflexo em faixas
  for (let y = 0; y < H; y++) {
    const v = 1 - y / H;   // 0 = perto da câmera, 1 = lá na luz
    const ao = Math.pow(v, 1.4) * Math.min(1, (1 - v) / 0.06) * (0.35 + 0.65 * faixas[y] * faixas[Math.max(0, y - 1)]);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W - 0.5, larg = 0.18 + 0.14 * (1 - v), a = Math.exp(-(u * u) / (2 * larg * larg)) * ao, i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * Math.min(1, a));
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function montarReflexos() {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: texturaReflexo(), fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  mat.userData.semNeve = true;
  reflexos = new THREE.InstancedMesh(geo, mat, NR); reflexos.count = 0; reflexos.frustumCulled = false; reflexos.renderOrder = 3; reflexos.visible = false;
  reflexos.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NR * 3), 3);
  ctx.scene.add(reflexos);
}
function escolherCandidatos(cam) {
  const l = [], cx = cam.x, cz = cam.z;
  for (const [x, z, y] of ctx.postes()) { const d = Math.abs(x - cx) + Math.abs(z - cz); if (d < 110) l.push([x, y, z, 0, d]); }
  l.sort((a, b) => a[4] - b[4]); candidatos = l.slice(0, 26);
}
function atualizarReflexos(dt, cam, molhado, noite) {
  if ((tCand -= dt) <= 0) { tCand = 0.5; escolherCandidatos(cam); }
  const luzes = noite > 0.05 ? candidatos.map((c) => c.slice(0, 4)) : [];   // poste só acende de noite
  ctx.luzesVeiculos?.((x, y, z, tipo, fx, fz) => {
    if (luzes.length >= 70 || Math.abs(x - cam.x) + Math.abs(z - cam.z) > 90) return;
    // 22z7: o reflexo do farol/lanterna só aparece de quem está na frente da luz (farol) ou atrás (lanterna); de lado some
    const dx = cam.x - x, dz = cam.z - z, d = Math.hypot(dx, dz) || 1, olha = (dx * (fx || 0) + dz * (fz || 0)) / (d * (Math.hypot(fx || 0, fz || 0) || 1));
    const k = Math.min(1, Math.max(0, (olha - 0.45) / 0.4));
    if (k > 0.02) luzes.push([x, y, z, tipo === 0 ? 1 : 2, 0, k]);
  });
  // da mais perto para a mais longe (as mais perto aparecem mais)
  for (const L of luzes) L[4] = Math.hypot(L[0] - cam.x, L[2] - cam.z);
  luzes.sort((a, b) => a[4] - b[4]);
  let n = 0;
  for (const [x, y, z, tipo, d0, kv] of luzes) {
    if (n >= NR) break;
    if (d0 < 3) continue;
    // no asfalto molhado (áspero) a luz vira uma faixa comprida que sai do pé da luz e vem na direção de quem olha
    const dx = x - cam.x, dz = z - cam.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    const comp = Math.min(28, Math.max(2, d * 0.62)) * (0.5 + 0.5 * molhado), larg = (tipo === 0 ? 0.7 : 0.38) + d * 0.02;
    const fx = x + ux * 0.4, fz = z + uz * 0.4, mx = fx - ux * comp / 2, mz = fz - uz * comp / 2;
    if (!ctx.naRua(mx, mz) || !ctx.naRua(fx - ux * comp * 0.9, fz - uz * comp * 0.9)) continue;   // 22z7: grama não espelha
    _q.setFromAxisAngle(_y, Math.atan2(-ux, -uz));   // a ponta forte da textura (em cima) fica no pé da luz
    _m.compose(_p.set(mx, ctx.alturaChao(mx, mz) + 0.05, mz), _q, _s.set(larg, 1, comp));
    reflexos.setMatrixAt(n, _m);
    const forca = 1.8 * molhado * (tipo === 0 ? 1.1 * noite : (tipo === 1 ? 1.0 : 0.8) * (kv ?? 1) * (0.3 + 0.7 * noite)) * Math.min(1, 1.5 - d0 / 80);   // de dia o reflexo do farol é fraco
    _c.copy(tipo === 0 ? COR_POSTE : tipo === 1 ? COR_FAROL : COR_LANT).multiplyScalar(Math.max(0, forca));
    reflexos.setColorAt(n, _c); n++;
  }
  reflexos.count = n; reflexos.visible = n > 0;
  reflexos.instanceMatrix.needsUpdate = true; reflexos.instanceColor.needsUpdate = true;
}

// ----------------------------------------------------------------
export function iniciar(c) { ctx = c; montarReflexos(); prepararCena(); }
let tScan = 0, neveAtual = 0;
// alvoNeve: 0..1 (vem do clima: o quanto o chão já está coberto)
export function atualizar(dt, { cam, molhado, noite, alvoNeve, dentro, qualidade }) {
  if (!ctx) return;
  if ((tScan -= dt) <= 0) { tScan = 2.5; prepararCena(); }   // veículos e coisas que entraram depois
  neveAtual += (alvoNeve - neveAtual) * Math.min(1, dt * (alvoNeve > neveAtual ? 0.6 : 0.25));
  UNEVE.value = dentro ? 0 : neveAtual < 0.005 ? 0 : neveAtual;   // dentro de casa o chão não tem neve
  const comReflexo = !dentro && molhado > 0.06 && /^(alto|ultra)$/.test(qualidade);
  if (comReflexo) atualizarReflexos(dt, cam, molhado, noite); else if (reflexos.visible) { reflexos.visible = false; reflexos.count = 0; }
}
export const neve = () => neveAtual;
