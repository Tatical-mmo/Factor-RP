// Metrópole em volta do centro, horizonte de prédios e as cidades vizinhas (Vila Serra e Porto Sul).
// Tudo é gerado por código e desenhado com InstancedMesh para rodar leve no celular.
import * as THREE from 'three';
import { CIDADE } from './config.js';

const { quarteiroes: N, quarteirao: QB, rua: RW, calcada: CW } = CIDADE;
export const PASSO = QB + RW;
const TOTAL = N * QB + (N + 1) * RW, METADE = TOTAL / 2;
export const ruaC = (i) => -METADE + RW / 2 + i * PASSO;
export const quadC = (i) => -METADE + RW + QB / 2 + i * PASSO;
export const LIM = ruaC(10) - 2;              // 430: até onde se anda na metrópole
const BORDA = ruaC(10) + RW / 2;              // 437
export const CORREDOR = ruaC(3) - RW / 2;     // 49: meia largura da faixa da ferrovia
const MI = -6, MA = 9;                        // índices dos quarteirões da metrópole
const SI = -10, SA = 13;                      // índices do horizonte de prédios
export const FIM_HORIZONTE = quadC(SA) + QB / 2;   // ~643

// as cidades vizinhas ficam no fim de cada linha de trem
export const CIDADES = [
  { id: 'norte', nome: 'Vila Serra', s: -1 },
  { id: 'sul', nome: 'Porto Sul', s: 1 },
];
const CID = { ruas: [945, 999, 1053, 1107], colunas: [-81, -27, 27, 81], blocos: [972, 1026, 1080], xs: [-54, 0, 54] };
export const CIDADE_Z = { min: 922.2, max: 1110, x: 84 };

let ctx = null;
let s0 = 90210;
const rnd = () => (s0 = (s0 * 16807) % 2147483647) / 2147483647;
const entre = (a, b) => a + rnd() * (b - a);
const escolher = (a) => a[Math.floor(rnd() * a.length)];

const edificios = [];      // { x, z, w, d, h, y, cor, tipo, rot, telha, det:[] }
const detalhes = [];       // caixas no telhado: { ed, dx, dz, w, h, d }
const arvores = [];        // [x, z, escala]
const calcadas = [];       // [x, z, w, d, y]
const gramados = [];       // [x, z, w, d]
const ruas = [];           // [x, z, w, d, vertical]
const extras = [];         // retângulos só para o minimapa: { x0, x1, z0, z1, cor }
const pisos = [];          // { x0, x1, z0, z1, h, rampa?: { eixo, de, ate, h0, h1 } }
const blocosMetro = new Set();
const grade = new Map(), gradeEd = new Map(); const CEL = 27;

// ---------------------------------------------------------------- colisão e altura
const chaves = (x0, z0, x1, z1) => {
  const r = [];
  for (let i = Math.floor(x0 / CEL); i <= Math.floor(x1 / CEL); i++) for (let j = Math.floor(z0 / CEL); j <= Math.floor(z1 / CEL); j++) r.push(i + ',' + j);
  return r;
};
export function addCol(c) {
  const [x0, z0, x1, z1] = c.tipo === 'circ' ? [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r] : [c.x0, c.z0, c.x1, c.z1];
  for (const k of chaves(x0, z0, x1, z1)) { if (!grade.has(k)) grade.set(k, []); grade.get(k).push(c); }
}
export function addPiso(p) { pisos.push(p); }
export function colidir(p, raio, resolverLista) {
  const vistos = new Set();
  for (const k of chaves(p.x - raio, p.z - raio, p.x + raio, p.z + raio)) {
    const l = grade.get(k); if (!l) continue;
    const novos = l.filter((c) => !vistos.has(c)); novos.forEach((c) => vistos.add(c));
    resolverLista(novos, p, raio);
  }
}
export function altura(x, z) {
  for (let k = pisos.length - 1; k >= 0; k--) {
    const p = pisos[k];
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
    if (!p.rampa) return p.h;
    const r = p.rampa, v = r.eixo === 'z' ? z : x;
    return THREE.MathUtils.lerp(r.h0, r.h1, THREE.MathUtils.clamp((v - r.de) / (r.ate - r.de), 0, 1));
  }
  const i = Math.round((x - quadC(0)) / PASSO), j = Math.round((z - quadC(0)) / PASSO);
  if (blocosMetro.has(i + ',' + j) && Math.abs(x - quadC(i)) < QB / 2 && Math.abs(z - quadC(j)) < QB / 2) return 0.18;
  return null;
}
// mantém o jogador nas áreas andáveis (a ferrovia só se cruza de trem)
export function limitar(p) {
  if (p.x > 1500) return;                                   // interiores das casas
  if (Math.abs(p.z) > 700) {
    const s = Math.sign(p.z);
    p.x = THREE.MathUtils.clamp(p.x, -CIDADE_Z.x, CIDADE_Z.x);
    const a = Math.abs(THREE.MathUtils.clamp(Math.abs(p.z), CIDADE_Z.min, CIDADE_Z.max));
    p.z = s * a; return;
  }
  p.x = THREE.MathUtils.clamp(p.x, -LIM, LIM); p.z = THREE.MathUtils.clamp(p.z, -LIM, LIM);
}

// ---------------------------------------------------------------- materiais
export const UNI = { uNoite: { value: 0 }, uTerreo: { value: null } };
function materialMundo(params, modo, esc = [4, 3.5]) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNoite = UNI.uNoite; sh.uniforms.uTerreo = UNI.uTerreo;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying float vTopo; varying float vAlt; varying float vLoja;
${modo === 'fachada' ? 'attribute float aLoja;' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
  {
    mat4 mM = modelMatrix;
    #ifdef USE_INSTANCING
    mM = modelMatrix * instanceMatrix;
    #endif
    vec4 wp = mM * vec4(transformed, 1.0);
    vec3 wn = normalize(mat3(mM) * objectNormal);
    vTopo = step(0.5, wn.y);
    vAlt = wp.y;
    vLoja = ${modo === 'fachada' ? 'aLoja' : '0.0'};
    #ifdef USE_MAP
    vMapUv = ${modo === 'fachada' ? '(abs(wn.x) > 0.5 ? vec2(wp.z, wp.y) : vec2(wp.x, wp.y))' : 'wp.xz'} / vec2(${esc[0].toFixed(2)}, ${esc[1].toFixed(2)});
    #endif
  }`);
    if (modo === 'fachada') {
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vTopo; varying float vAlt; varying float vLoja;
uniform float uNoite; uniform sampler2D uTerreo;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  if (vTopo > 0.5) diffuseColor.rgb = vec3(0.33, 0.32, 0.31);
  // térreo com vitrines nos prédios
  float terreoF = (1.0 - vTopo) * vLoja * step(vAlt, 3.55);
  vec4 terreoTex = vec4(0.0);
  if (terreoF > 0.5) {
    terreoTex = texture2D(uTerreo, vMapUv);
    vec3 tinta = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
    tinta = mix(vec3(1.0), vColor, 0.45);
    #endif
    diffuseColor.rgb = terreoTex.rgb * tinta;
  }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    // à noite parte das janelas acende (cada janela sorteia a sua)
    vec4 base = terreoF > 0.5 ? terreoTex : sampledDiffuseColor;
    float jan = smoothstep(0.04, 0.12, base.b - base.r) * (1.0 - vTopo);
    float h = fract(sin(dot(floor(vMapUv), vec2(12.9898, 78.233))) * 43758.5453);
    float acesa = terreoF > 0.5 ? 1.0 : step(0.45, h);
    vec3 cor = mix(vec3(1.0, 0.76, 0.42), vec3(0.72, 0.84, 1.0), step(0.86, h));
    totalEmissiveRadiance += jan * acesa * uNoite * cor * (terreoF > 0.5 ? 1.3 : 1.05);
  }`);
    }
  };
  m.customProgramCacheKey = () => `mundo2-${modo}-${esc.join('x')}`;
  return m;
}

let MAT = null;
function criarMateriais() {
  const T = ctx.texturaCanvas, R = ctx.ruido;
  const fachada = T(128, (g, t) => {
    g.fillStyle = '#f3efe6'; g.fillRect(0, 0, t, t); R(g, t, 1400, 0.05, 1.2);
    const gx = t * 0.2, gy = t * 0.22, gw = t * 0.6, gh = t * 0.52;
    g.fillStyle = '#d6cfc1'; g.fillRect(gx - 5, gy - 5, gw + 10, gh + 10);
    const gr = g.createLinearGradient(0, gy, 0, gy + gh); gr.addColorStop(0, '#46637e'); gr.addColorStop(1, '#1c2a38');
    g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
    g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.moveTo(gx, gy + gh * 0.65); g.lineTo(gx + gw * 0.42, gy); g.lineTo(gx + gw * 0.6, gy); g.lineTo(gx, gy + gh); g.fill();
    g.fillStyle = '#c9c0ae'; g.fillRect(gx, gy + gh * 0.48, gw, 3);
    g.fillStyle = '#bdb4a2'; g.fillRect(gx - 7, gy + gh + 3, gw + 14, 6);
    g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(0, t - 4, t, 4);
  });
  const calcada = T(512, desenharCalcada);
  UNI.uTerreo.value = T(128, (g, t) => {
    g.fillStyle = '#e6e1d8'; g.fillRect(0, 0, t, t);
    g.fillStyle = '#3a3f46'; g.fillRect(0, 0, t, t * 0.16);                 // faixa do letreiro
    g.fillStyle = '#d8d1c4'; g.fillRect(0, t * 0.16, t, 4);
    const gr = g.createLinearGradient(0, t * 0.22, 0, t * 0.94); gr.addColorStop(0, '#5b7d99'); gr.addColorStop(1, '#22323f');
    g.fillStyle = gr; g.fillRect(t * 0.06, t * 0.22, t * 0.88, t * 0.72);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(t * 0.06, t * 0.7); g.lineTo(t * 0.4, t * 0.22); g.lineTo(t * 0.55, t * 0.22); g.lineTo(t * 0.06, t * 0.9); g.fill();
    g.fillStyle = '#c9c2b4'; g.fillRect(t * 0.48, t * 0.22, 5, t * 0.72);   // montante
    g.fillStyle = '#9c968c'; g.fillRect(0, t * 0.94, t, t * 0.06);           // rodapé
  });
  const ondas = T(256, (g, t) => {
    const img = g.createImageData(t, t);
    const alt = (x, y) => Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2) * 0.5 + Math.sin(y * 0.19 + x * 0.05) * 0.35 + Math.sin((x + y) * 0.31) * 0.15;
    for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) {
      const dx = alt(x + 1, y) - alt(x - 1, y), dy = alt(x, y + 1) - alt(x, y - 1), i = (y * t + x) * 4;
      img.data[i] = 128 + dx * 90; img.data[i + 1] = 128 + dy * 90; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  ondas.colorSpace = THREE.NoColorSpace; ondas.repeat.set(60, 25);
  const grama = T(512, (g, t) => desenharGrama(g, t));
  const campo = T(512, (g, t) => desenharGrama(g, t, [132, 168, 92]));
  const asfalto = T(256, (g, t) => {
    g.fillStyle = '#41454d'; g.fillRect(0, 0, t, t); R(g, t, 9000, 0.06, 1.6);
  });
  MAT = {
    fachada: materialMundo({ map: fachada, roughness: 0.85, metalness: 0.05 }, 'fachada'),
    calcada: materialMundo({ map: calcada, roughness: 0.92 }, 'topo', [3.2, 3.2]),
    grama: materialMundo({ map: grama, roughness: 1 }, 'topo', [9, 9]),
    campo: materialMundo({ map: campo, roughness: 1 }, 'topo', [16, 16]),
    asfalto: materialMundo({ map: asfalto, roughness: 0.88 }, 'topo', [7, 7]),
    telha: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
    detalhe: new THREE.MeshStandardMaterial({ color: '#9da3a8', roughness: 0.7, metalness: 0.2 }),
    tronco: new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.9 }),
    copa: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true, vertexColors: true }),
    chaoHorizonte: new THREE.MeshStandardMaterial({ color: '#5b5e64', roughness: 0.95 }),
    agua: new THREE.MeshStandardMaterial({ color: '#3e7ea6', roughness: 0.12, metalness: 0.25, normalMap: ondas, normalScale: new THREE.Vector2(0.6, 0.6) }),
    concreto: new THREE.MeshStandardMaterial({ color: '#b9b3a7', roughness: 0.9 }),
    morro: new THREE.MeshStandardMaterial({ color: '#7d8f63', roughness: 1, flatShading: true }),
  };
  return MAT;
}
export const materiais = () => MAT;


// ---------------------------------------------------------------- texturas compartilhadas (centro e metrópole)
const _a = (a, b) => a + Math.random() * (b - a);
// Calçada de pavers retangulares em junta amarrada, com variação de cor, rejunte e desgaste.
export function desenharCalcada(g, t) {
  g.fillStyle = '#8f877a'; g.fillRect(0, 0, t, t);                       // rejunte
  const linhas = 8, alt = t / linhas, larg = t / 4, j = 2;
  for (let r = 0; r < linhas; r++) {
    const off = (r % 2) * larg / 2;
    for (let c = -1; c < 5; c++) {
      const x = c * larg + off, y = r * alt;
      const v = _a(186, 214), q = _a(-6, 6);
      g.fillStyle = `rgb(${v + 8 + q | 0},${v + q | 0},${v - 14 | 0})`;
      g.fillRect(x + j / 2, y + j / 2, larg - j, alt - j);
      g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x + j / 2, y + j / 2, larg - j, 2);          // borda clara
      g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(x + j / 2, y + alt - j / 2 - 2, larg - j, 2);      // borda escura
    }
  }
  for (let i = 0; i < 6000; i++) { g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${_a(0, 0.07)})` : `rgba(40,30,20,${_a(0, 0.08)})`; g.fillRect(_a(0, t), _a(0, t), 1.4, 1.4); }
  for (let i = 0; i < 7; i++) {                                           // manchas de uso
    const x = _a(0, t), y = _a(0, t), r = _a(10, 34), gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(70,60,50,${_a(0.05, 0.12)})`); gr.addColorStop(1, 'rgba(70,60,50,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
// Grama com manchas de tom, fiapos e florzinhas.
export function desenharGrama(g, t, base = [118, 160, 84]) {
  g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, t, t);
  for (let i = 0; i < 40; i++) {
    const x = _a(0, t), y = _a(0, t), r = _a(20, 70), d = _a(-22, 18), gr = g.createRadialGradient(x, y, 0, x, y, r);
    const c = `${base[0] + d | 0},${base[1] + d * 1.1 | 0},${base[2] + d * 0.6 | 0}`;
    gr.addColorStop(0, `rgba(${c},.55)`); gr.addColorStop(1, `rgba(${c},0)`);
    for (const ox of [-t, 0, t]) for (const oy of [-t, 0, t]) { g.save(); g.translate(ox, oy); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  g.lineWidth = 1;
  for (let i = 0; i < 9000; i++) {
    const x = _a(0, t), y = _a(0, t), l = _a(1.5, 4), d = _a(-40, 40);
    g.strokeStyle = `rgba(${base[0] + d | 0},${base[1] + d + 15 | 0},${base[2] + d * 0.5 | 0},${_a(0.25, 0.6)})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + _a(-1, 1), y - l); g.stroke();
  }
  const flores = ['#f4f1e8', '#f2d34a', '#e8a6c8', '#c9b6f0'];
  for (let i = 0; i < 70; i++) { g.fillStyle = flores[i % 4]; g.fillRect(_a(0, t), _a(0, t), 2, 2); }
}

// Copa de árvore: vários blocos de icosaedro juntos, mais escura embaixo (cor por vértice × cor da instância).
function geoCopa(blocos) {
  const pos = [], cor = [];
  for (const [x, y, z, r] of blocos) {
    const g = new THREE.IcosahedronGeometry(r, 1); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // deforma um pouco para não parecer bola perfeita
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), k = 1 + Math.sin(px * 3.1 + pz * 2.3 + py * 1.7) * 0.08;
      const X = x + px * k, Y = y + py * k, Z = z + pz * k; pos.push(X, Y, Z);
      const sombra = THREE.MathUtils.clamp(0.55 + (Y + 1.4) / 3.6 * 0.5, 0.55, 1.05); cor.push(sombra, sombra, sombra * 0.95);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  g.computeVertexNormals(); return g;
}
function geoPinheiro() {
  const pos = [], cor = [];
  for (const [y, r, h] of [[0.4, 1.35, 1.9], [1.3, 1.05, 1.6], [2.1, 0.72, 1.35]]) {
    const g = new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0).toNonIndexed(); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const Y = p.getY(i); pos.push(p.getX(i), Y, p.getZ(i)); const s = THREE.MathUtils.clamp(0.55 + Y / 3.8 * 0.5, 0.55, 1.05); cor.push(s, s, s); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  g.computeVertexNormals(); return g;
}

// ---------------------------------------------------------------- peças
const CORES_PREDIO = ['#efe6d2', '#e4cfb0', '#d9b48f', '#c98f6a', '#bfc5c9', '#a9b8c8', '#e8d9a8', '#d7a39a', '#b7c4a3', '#f1f1ee', '#c7b9a6'];
const CORES_CASA = ['#f2e3c6', '#e9c9a8', '#cfe0e8', '#e7d2e0', '#f4efe4', '#d8e4c4', '#f0d39b'];
const CORES_TELHA = ['#a5502f', '#8c3f2a', '#9c5a3c', '#6b5145', '#4f5a63'];

export function predio(x, z, w, d, h, { y = 0.18, cor = escolher(CORES_PREDIO), colide = true, det = true, loja = true } = {}) {
  const i = edificios.length;
  edificios.push({ x, z, w, d, h, y, cor, tipo: 'predio', det: [], loja });
  if (colide) addCol({ tipo: 'caixa', x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  for (const k of chaves(x - w / 2, z - d / 2, x + w / 2, z + d / 2)) { if (!gradeEd.has(k)) gradeEd.set(k, []); gradeEd.get(k).push(i); }
  if (det && w > 8) {
    const n = Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) { edificios[i].det.push(detalhes.length); detalhes.push({ ed: i, dx: entre(-w / 3, w / 3), dz: entre(-d / 3, d / 3), w: entre(1.4, 3), h: entre(0.8, 2.2), d: entre(1.4, 3) }); }
  }
  return i;
}
function casa(x, z, w, d, andares, rot, y = 0.18) {
  const i = predio(x, z, w, d, andares * 3.2, { y, cor: escolher(CORES_CASA), det: false, loja: false });
  Object.assign(edificios[i], { tipo: 'casa', rot, telha: escolher(CORES_TELHA) });
  return i;
}
export function arvore(x, z, s = 1, colide = true) { arvores.push([x, z, s]); if (colide) addCol({ tipo: 'circ', x, z, r: 0.5 * s }); }
function rua(x, z, w, d) { ruas.push([x, z, w, d, d > w]); }

// um quarteirão de 44 m: calçada e o que tem em cima
function quadra(bx, bz, estilo, faixa = [2, 6], y = 0.18) {
  calcadas.push([bx, bz, QB, QB, y]);
  const meio = QB - CW * 2, L = meio / 2;
  if (estilo === 'parque') {
    gramados.push([bx, bz, meio, meio]);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + rnd() * 0.3; arvore(bx + Math.cos(a) * entre(9, 15), bz + Math.sin(a) * entre(9, 15), entre(0.9, 1.3)); }
    arvore(bx, bz, 1.5);
    return;
  }
  if (estilo === 'torre') {
    const w = entre(26, 34), d = entre(26, 34);
    predio(bx, bz, w, d, Math.round(entre(10, 16)) * 3.5, { y });
    return;
  }
  if (estilo === 'casas') {
    const passo = meio / 3;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      const cx = bx - meio / 2 + passo * (a + 0.5), cz = bz - meio / 2 + passo * (b + 0.5);
      if (a === 1 && b === 1) { arvore(cx, cz, 1.2); continue; }
      const w = entre(7, 9.5), d = entre(7, 9.5);
      casa(cx, cz, w, d, rnd() < 0.3 ? 2 : 1, rnd() < 0.5 ? 0 : Math.PI / 2, y);
      if (rnd() < 0.5) arvore(cx + (rnd() < 0.5 ? -1 : 1) * (passo / 2 - 1.2), cz + (rnd() < 0.5 ? -1 : 1) * (passo / 2 - 1.2), 0.8);
    }
    return;
  }
  if (estilo === 'galpoes') {
    for (const s of [-1, 1]) predio(bx, bz + s * L / 1.05, meio - 2, L * 0.85, entre(6.5, 9), { y, cor: escolher(['#b9c2c9', '#9fb0bf', '#c9b79c', '#a7a39b']), loja: false });
    return;
  }
  // 'predios': quatro lotes encostados na calçada
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = entre(12, 17.5), d = entre(12, 17.5);
    const cx = bx + sx * (L / 2) + sx * ((L - w) / 2 - 0.4), cz = bz + sz * (L / 2) + sz * ((L - d) / 2 - 0.4);
    predio(cx, cz, w, d, Math.round(entre(faixa[0], faixa[1])) * 3.5, { y });
  }
}

// quarteirões com uso especial: prédios de apartamentos, loteamentos de terrenos e praças de território
const RESERVA = {
  '0,-1': { tipo: 'residencial', frente: 1, cor: '#d9c7b0' }, '3,4': { tipo: 'residencial', frente: -1, cor: '#c7d3dd' },
  '-1,0': { tipo: 'loteamento' }, '4,0': { tipo: 'loteamento' }, '-1,3': { tipo: 'loteamento' }, '4,3': { tipo: 'loteamento' },
  '-4,-4': { tipo: 'praca' }, '7,7': { tipo: 'praca' },
  '-1,-1': { tipo: 'vazio' }, '4,-1': { tipo: 'vazio' },          // prefeitura e concessionária
  '3,-1': { tipo: 'vazio' }, '-1,4': { tipo: 'vazio' }, '0,4': { tipo: 'vazio' },   // banco, hospital e bombeiros
  '4,4': { tipo: 'vazio' },                                         // cemitério
};
const extrasMesh = [];
function quadraEspecial(bx, bz, r) {
  calcadas.push([bx, bz, QB, QB, 0.18]);
  if (r.tipo === 'residencial') {
    const zc = bz - r.frente * 2;
    predio(bx, zc, 30, 24, 35, { cor: r.cor, loja: false });
    // marquise e portaria
    extrasMesh.push({ geo: [12, 0.3, 3], cor: '#2f3a44', pos: [bx, 3.6, zc + r.frente * 13.4] });
    extrasMesh.push({ geo: [5, 3.2, 0.2], cor: '#7fa6c2', pos: [bx, 1.8, zc + r.frente * 12.05], vidro: true });
    for (const sx of [-1, 1]) arvore(bx + sx * 9, zc + r.frente * 15.5, 0.8);
    return;
  }
  if (r.tipo === 'vazio') {   // prédio público: calçada com árvores nos cantos
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) arvore(bx + sx * 19.5, bz + sz * 19.5, 0.9);
    return;
  }
  if (r.tipo === 'loteamento') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gramados.push([bx + sx * 9.5, bz + sz * 9.5, 17.6, 17.6]);
    return;
  }
  // praça do território: piso livre no meio, árvores só nos cantos
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) arvore(bx + sx * 17.5, bz + sz * 17.5, 1.1);
}

function celulaMetro(i, j) {
  if (i >= 0 && i < N && j >= 0 && j < N) return false;                              // centro
  if ((i === -2 || i === -1 || i === N || i === N + 1) && (j === 1 || j === 2)) return false;   // territórios dos clãs
  if ((i === 1 || i === 2) && (j < 0 || j >= N)) return false;                       // corredor da ferrovia
  return true;
}

// ---------------------------------------------------------------- geração
function gerarMetropole() {
  for (let i = MI; i <= MA; i++) for (let j = MI; j <= MA; j++) {
    if (!celulaMetro(i, j)) continue;
    const x = quadC(i), z = quadC(j); blocosMetro.add(i + ',' + j);
    const res = RESERVA[i + ',' + j];
    if (res) { quadraEspecial(x, z, res); continue; }
    const d = Math.max(Math.abs(x), Math.abs(z)), r = rnd();
    let estilo = 'predios';
    if (r < 0.11) estilo = 'parque';
    else if (d > 300 && r < 0.62) estilo = 'casas';
    else if (d < 260 && r > 0.86) estilo = 'torre';
    quadra(x, z, estilo, d < 230 ? [2, 7] : [2, 5]);
  }
  // ruas: continuação das do centro e as novas
  const segs = (a, b, cortes) => {          // intervalo [a,b] menos os cortes
    let r = [[a, b]];
    for (const [c0, c1] of cortes) r = r.flatMap(([x0, x1]) => (c1 <= x0 || c0 >= x1 ? [[x0, x1]] : [[x0, c0], [c1, x1]].filter(([p, q]) => q - p > 1)));
    return r;
  };
  const terr = [METADE, -ruaC(-2) - RW / 2];      // 113 .. 211 em cada lado
  for (let i = MI; i <= MA + 1; i++) {
    const c = ruaC(i), noCentro = i >= 0 && i <= N;
    // horizontal (z = c)
    let cortes = noCentro ? [[-METADE, METADE]] : [[-CORREDOR, CORREDOR]];
    if (i === 2) cortes = cortes.concat([[-terr[1] - 5, -terr[0]], [terr[0], terr[1] + 5]]);
    for (const [a, b] of segs(-BORDA, BORDA, cortes)) rua((a + b) / 2, c, b - a, RW);
    // vertical (x = c)
    if (i === 2) continue;                        // a avenida do meio não atravessa a ferrovia
    let cv = noCentro ? [[-METADE, METADE]] : [];
    if (i === -1 || i === N + 1) cv = cv.concat([[ruaC(1), ruaC(3)]]);
    for (const [a, b] of segs(-BORDA, BORDA, cv)) rua(c, (a + b) / 2, RW, b - a);
  }
}

function gerarHorizonte() {
  for (let i = SI; i <= SA; i++) for (let j = SI; j <= SA; j++) {
    if (i >= MI && i <= MA && j >= MI && j <= MA) continue;
    if (i === 1 || i === 2) continue;                               // corredor da ferrovia
    const x = quadC(i), z = quadC(j);
    if (rnd() < 0.45) predio(x, z, entre(24, 36), entre(24, 36), Math.round(entre(8, 24)) * 3.5, { y: 0, colide: false });
    else for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) predio(x + sx * 11, z + sz * 11, entre(14, 18), entre(14, 18), Math.round(entre(5, 17)) * 3.5, { y: 0, colide: false });
  }
}

function gerarCidade(cid) {
  const s = cid.s;
  // ruas
  for (const z of CID.ruas) rua(0, s * z, 172, RW);
  for (const x of CID.colunas) rua(x, s * (CID.ruas[0] + CID.ruas[3]) / 2, RW, CID.ruas[3] - CID.ruas[0] + RW);
  // praça da estação
  calcadas.push([0, s * 934, 172, 12, 0.12]);
  pisos.push({ x0: -86, x1: 86, z0: s > 0 ? 928 : -940, z1: s > 0 ? 940 : -928, h: 0.12 });
  for (const bz of CID.blocos) for (const bx of CID.xs) {
    const x = bx, z = s * bz;
    pisos.push({ x0: x - QB / 2, x1: x + QB / 2, z0: z - QB / 2, z1: z + QB / 2, h: 0.18 });
    if (bx === 0 && bz === 1026) { quadra(x, z, 'parque'); continue; }
    if (bx === -54 && bz === 1080) { quadraEspecial(x, z, { tipo: 'praca' }); continue; }   // território da cidade
    if (bx === 54 && bz === 972) { calcadas.push([x, z, QB, QB, 0.18]); cid.loja = { x: x - 6, z: z + (s > 0 ? -3 : 3) }; arvore(x + 12, z - 10); arvore(x + 12, z + 10); continue; }
    if (cid.id === 'norte') quadra(x, z, rnd() < 0.75 ? 'casas' : 'predios', [1, 3]);
    else quadra(x, z, bz === 1080 ? 'galpoes' : (rnd() < 0.5 ? 'predios' : 'casas'), [2, 4]);
  }
  // em volta: mata, morros ou o mar
  for (let k = 0; k < 160; k++) {
    const x = entre(-260, 260), z = s * entre(900, 1240);
    if (Math.abs(x) < 95 && Math.abs(z) < 1118) continue;
    if (cid.id === 'sul' && Math.abs(z) > 1112) continue;
    if (Math.abs(x) < 50 && Math.abs(z) < 935) continue;
    arvore(x, z, entre(0.9, 1.6), false);
  }
}

// ---------------------------------------------------------------- malhas
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Vector3(), _c = new THREE.Color();
let malhaPredios = null, malhaTelhas = null, malhaDet = null;
const idxTelha = new Map();

function geoTelhado() {
  // prisma de 1 x 1 x 1: cumeeira ao longo de X, base em y = 0
  const p = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
  ];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
}
function matrizPredio(e, h = e.h) { _m.compose(_v.set(e.x, e.y, e.z), _q.identity(), _e.set(e.w, Math.max(0.01, h), e.d)); return _m; }
function matrizTelha(e, visivel = true) {
  _q.setFromAxisAngle(_e.set(0, 1, 0), e.rot);
  const [a, b] = e.rot ? [e.d + 0.7, e.w + 0.7] : [e.w + 0.7, e.d + 0.7];
  _m.compose(_v.set(e.x, e.y + e.h, e.z), _q, _e.set(a, visivel ? 2.6 : 0.01, b)); return _m;
}
function matrizDet(dt, visivel = true) {
  const e = edificios[dt.ed];
  _m.compose(_v.set(e.x + dt.dx, e.y + e.h, e.z + dt.dz), _q.identity(), _e.set(dt.w, visivel ? dt.h : 0.01, dt.d)); return _m;
}

function montarMalhas() {
  const { scene } = ctx;
  for (const e of extrasMesh) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...e.geo), e.vidro ? new THREE.MeshStandardMaterial({ color: e.cor, roughness: 0.1, metalness: 0.4 }) : new THREE.MeshStandardMaterial({ color: e.cor, roughness: 0.6 }));
    m.position.set(...e.pos); m.castShadow = true; scene.add(m);
  }
  const caixaBase = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const geoPredio = caixaBase.clone();
  geoPredio.setAttribute('aLoja', new THREE.InstancedBufferAttribute(new Float32Array(edificios.map((e) => (e.tipo === 'predio' && e.loja !== false ? 1 : 0))), 1));
  malhaPredios = new THREE.InstancedMesh(geoPredio, MAT.fachada, edificios.length);
  edificios.forEach((e, i) => { malhaPredios.setMatrixAt(i, matrizPredio(e)); malhaPredios.setColorAt(i, _c.set(e.cor)); });
  malhaPredios.castShadow = true; malhaPredios.receiveShadow = true; scene.add(malhaPredios);

  const casas = edificios.map((e, i) => [e, i]).filter(([e]) => e.tipo === 'casa');
  malhaTelhas = new THREE.InstancedMesh(geoTelhado(), MAT.telha, Math.max(1, casas.length));
  casas.forEach(([e, i], k) => { idxTelha.set(i, k); malhaTelhas.setMatrixAt(k, matrizTelha(e)); malhaTelhas.setColorAt(k, _c.set(e.telha)); });
  malhaTelhas.castShadow = true; malhaTelhas.receiveShadow = true; scene.add(malhaTelhas);

  malhaDet = new THREE.InstancedMesh(caixaBase, MAT.detalhe, Math.max(1, detalhes.length));
  detalhes.forEach((d, k) => malhaDet.setMatrixAt(k, matrizDet(d)));
  malhaDet.castShadow = true; scene.add(malhaDet);

  // calçadas
  const calc = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), MAT.calcada, calcadas.length);
  calcadas.forEach(([x, z, w, d, y], k) => { _m.compose(_v.set(x, y / 2, z), _q.identity(), _e.set(w, y, d)); calc.setMatrixAt(k, _m); });
  calc.receiveShadow = true; scene.add(calc);
  // gramados
  const planoChao = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const gram = new THREE.InstancedMesh(planoChao, MAT.grama, Math.max(1, gramados.length));
  gramados.forEach(([x, z, w, d], k) => { _m.compose(_v.set(x, 0.185, z), _q.identity(), _e.set(w, 1, d)); gram.setMatrixAt(k, _m); });
  gram.receiveShadow = true; scene.add(gram);
  // ruas
  for (const vert of [false, true]) {
    const lista = ruas.filter((r) => r[4] === vert);
    const im = new THREE.InstancedMesh(planoChao, MAT.asfalto, lista.length);
    lista.forEach(([x, z, w, d], k) => { _m.compose(_v.set(x, vert ? 0.016 : 0.012, z), _q.identity(), _e.set(w, 1, d)); im.setMatrixAt(k, _m); });
    im.receiveShadow = true; scene.add(im);
  }
  // árvores
  const pinheiro = (x, z) => ((Math.abs(x * 7.3 + z * 3.1) | 0) % 5) === 0;
  const folhosas = arvores.filter(([x, z]) => !pinheiro(x, z)), pinheiros = arvores.filter(([x, z]) => pinheiro(x, z));
  const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.24, 2.0, 7).translate(0, 1.0, 0), MAT.tronco, arvores.length);
  const copa = new THREE.InstancedMesh(geoCopa([[0, 0, 0, 1.25], [0.75, -0.25, 0.3, 0.9], [-0.7, -0.15, -0.35, 0.95], [0.2, 0.55, -0.45, 0.85], [-0.25, -0.35, 0.7, 0.8]]), MAT.copa, Math.max(1, folhosas.length));
  const pinho = new THREE.InstancedMesh(geoPinheiro(), MAT.copa, Math.max(1, pinheiros.length));
  copa.count = folhosas.length; pinho.count = pinheiros.length;
  const verdes = ['#5a8a3c', '#679a42', '#4b7d36', '#78a34a', '#5f8a3a', '#6e9a3e'];
  const escuros = ['#3f6b38', '#355f33', '#47753c'];
  let kf = 0, kp = 0;
  arvores.forEach(([x, z, s], k) => {
    const y = altura(x, z) ?? 0, var1 = 0.88 + ((x * 31 + z * 17) % 1 + 1) % 1 * 0.3, sc = s * var1;
    const giro = (x * 13 + z * 7) % 6.28;
    _q.setFromAxisAngle(_e.set(0, 1, 0), giro);
    if (pinheiro(x, z)) {
      _m.compose(_v.set(x, y, z), _q, _e.set(sc * 0.8, sc * 0.7, sc * 0.8)); tronco.setMatrixAt(k, _m);
      _m.compose(_v.set(x, y + 0.6 * sc, z), _q, _e.set(sc, sc * 1.1, sc)); pinho.setMatrixAt(kp, _m);
      pinho.setColorAt(kp++, _c.set(escuros[k % escuros.length]));
    } else {
      _m.compose(_v.set(x, y, z), _q, _e.set(sc, sc, sc)); tronco.setMatrixAt(k, _m);
      _m.compose(_v.set(x, y + 2.55 * sc, z), _q, _e.set(sc * 1.05, sc * 1.0, sc * 1.05)); copa.setMatrixAt(kf, _m);
      copa.setColorAt(kf++, _c.set(verdes[k % verdes.length]));
    }
  });
  pinho.castShadow = true; pinho.receiveShadow = true; if (pinheiros.length) scene.add(pinho);
  tronco.castShadow = true; copa.castShadow = true; copa.receiveShadow = true; scene.add(tronco); if (folhosas.length) scene.add(copa);
}

function plano(x, z, w, d, y, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
  m.position.set(x, y, z); m.receiveShadow = true; ctx.scene.add(m); return m;
}

function montarChaos() {
  // chão escuro sob o horizonte de prédios
  const H = FIM_HORIZONTE + 2;
  for (const s of [-1, 1]) {
    for (const [a, b] of [[-H, -CORREDOR], [CORREDOR, H]]) plano((a + b) / 2, s * (BORDA + H) / 2, b - a, H - BORDA, 0.006, MAT.chaoHorizonte);
    plano(s * (BORDA + H) / 2, 0, H - BORDA, BORDA * 2, 0.006, MAT.chaoHorizonte);
  }
  // faixa verde da ferrovia dentro da metrópole e campos até as cidades
  for (const s of [-1, 1]) {
    plano(0, s * (METADE + H) / 2, CORREDOR * 2, H - METADE, 0.008, MAT.grama);
    plano(0, s * (H + 1300) / 2, 2000, 1300 - H, 0.004, MAT.campo);
  }
  // muro baixo no limite da metrópole, cortado pelos trilhos
  const cerca = new THREE.MeshStandardMaterial({ color: '#4c5a48', roughness: 0.8 });
  for (const s of [-1, 1]) for (const [a, b] of [[-CORREDOR, -10], [10, CORREDOR]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, 1.4, 0.3), cerca); m.position.set((a + b) / 2, 0.7, s * (BORDA - 2)); m.castShadow = true; ctx.scene.add(m);
  }
  // morros atrás de Vila Serra
  const cone = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  const morros = [];
  for (let k = 0; k < 26; k++) morros.push([entre(-700, 700), -entre(1180, 1420), entre(70, 170), entre(45, 120)]);
  for (let k = 0; k < 14; k++) { const s = rnd() < 0.5 ? -1 : 1; morros.push([s * entre(320, 700), s * 0 + (rnd() < 0.5 ? -1 : 1) * entre(700, 900), entre(60, 130), entre(25, 60)]); }
  const im = new THREE.InstancedMesh(cone, MAT.morro, morros.length);
  morros.forEach(([x, z, r, h], k) => { _m.compose(_v.set(x, 0, z), _q.identity(), _e.set(r, h, r)); im.setMatrixAt(k, _m); im.setColorAt(k, _c.set(escolher(['#7d8f63', '#6f8259', '#8a9a6c', '#76866a']))); });
  im.receiveShadow = true; ctx.scene.add(im);
  // o mar de Porto Sul, cais, píer e um navio
  plano(0, 1112 + 400, 2200, 800, 0.03, MAT.agua);
  extras.push({ x0: -1100, x1: 1100, z0: 1113, z1: 1900, cor: '#3e7ea6' });
  const cais = new THREE.Mesh(new THREE.BoxGeometry(200, 0.8, 1.2), MAT.concreto); cais.position.set(0, 0.2, 1113); ctx.scene.add(cais);
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 70), MAT.concreto); pier.position.set(48, 0.25, 1148); pier.receiveShadow = true; ctx.scene.add(pier);
  const casco = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 62), new THREE.MeshStandardMaterial({ color: '#7d2a24', roughness: 0.6 })); casco.position.set(66, 1.5, 1160); casco.castShadow = true; ctx.scene.add(casco);
  const ponte = new THREE.Mesh(new THREE.BoxGeometry(11, 6, 10), new THREE.MeshStandardMaterial({ color: '#efefea', roughness: 0.5 })); ponte.position.set(66, 7, 1182); ponte.castShadow = true; ctx.scene.add(ponte);
  const conts = ['#c43b3b', '#3b6fd2', '#2f9e5b', '#c98a1c', '#8a3bc4', '#3b9ec4'];
  for (let k = 0; k < 14; k++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 6), new THREE.MeshStandardMaterial({ color: conts[k % conts.length], roughness: 0.7 }));
    c.position.set(66 + (k % 3 - 1) * 3.2, 5.3 + Math.floor(k / 9) * 2.6, 1140 + Math.floor((k % 9) / 3) * 7); c.castShadow = true; ctx.scene.add(c);
  }
}

// ---------------------------------------------------------------- prédios que tapam o jogador ficam cortados
const cortados = new Set();
const _ray = new THREE.Ray(), _box = new THREE.Box3();
let tempoOclusao = 0;
function definirCorte(i, cortar) {
  const e = edificios[i];
  malhaPredios.setMatrixAt(i, matrizPredio(e, cortar ? Math.min(e.h, 2.2) : e.h));
  if (idxTelha.has(i)) malhaTelhas.setMatrixAt(idxTelha.get(i), matrizTelha(e, !cortar));
  for (const k of e.det) malhaDet.setMatrixAt(k, matrizDet(detalhes[k], !cortar));
}
export function atualizarOclusao(dt, pos, dirCamera) {
  tempoOclusao -= dt; if (tempoOclusao > 0 || !malhaPredios) return;
  tempoOclusao = 0.15;
  _ray.origin.set(pos.x, pos.y + 1.1, pos.z); _ray.direction.copy(dirCamera);
  const agora = new Set();
  if (pos.x < 1500) {
    const vistos = new Set();
    for (const k of chaves(pos.x - 130, pos.z - 130, pos.x + 130, pos.z + 130)) {
      for (const i of gradeEd.get(k) || []) {
        if (vistos.has(i)) continue; vistos.add(i);
        const e = edificios[i];
        _box.min.set(e.x - e.w / 2, e.y, e.z - e.d / 2); _box.max.set(e.x + e.w / 2, e.y + e.h + (e.tipo === 'casa' ? 2.6 : 2.2), e.z + e.d / 2);
        if (_ray.intersectsBox(_box)) agora.add(i);
      }
    }
  }
  let mudou = false;
  for (const i of cortados) if (!agora.has(i)) { definirCorte(i, false); cortados.delete(i); mudou = true; }
  for (const i of agora) if (!cortados.has(i)) { definirCorte(i, true); cortados.add(i); mudou = true; }
  if (mudou) { malhaPredios.instanceMatrix.needsUpdate = true; malhaTelhas.instanceMatrix.needsUpdate = true; malhaDet.instanceMatrix.needsUpdate = true; }
}

// ---------------------------------------------------------------- minimapa (em metros; o chamador já aplicou a escala)
export function desenharMapa(g) {
  g.fillStyle = '#6d7076'; g.fillRect(-FIM_HORIZONTE, -FIM_HORIZONTE, FIM_HORIZONTE * 2, FIM_HORIZONTE * 2);
  g.fillStyle = '#b8a27f'; g.fillRect(-BORDA, -BORDA, BORDA * 2, BORDA * 2);
  g.fillStyle = '#8fb06a';
  for (const s of [-1, 1]) g.fillRect(-CORREDOR, s > 0 ? METADE : -FIM_HORIZONTE, CORREDOR * 2, FIM_HORIZONTE - METADE);
  g.fillStyle = '#86a95c';
  for (const s of [-1, 1]) g.fillRect(-1100, s > 0 ? FIM_HORIZONTE : -1300, 2200, 1300 - FIM_HORIZONTE);
  for (const e of extras) { g.fillStyle = e.cor; g.fillRect(e.x0, e.z0, e.x1 - e.x0, e.z1 - e.z0); }
  g.fillStyle = '#d8d1c3'; for (const [x, z, w, d] of calcadas) g.fillRect(x - w / 2, z - d / 2, w, d);
  g.fillStyle = '#7fa45a'; for (const [x, z, w, d] of gramados) g.fillRect(x - w / 2, z - d / 2, w, d);
  g.fillStyle = '#4a4e57'; for (const [x, z, w, d] of ruas) g.fillRect(x - w / 2, z - d / 2, w, d);
  for (const e of edificios) { g.fillStyle = e.tipo === 'casa' ? '#b3876a' : e.y === 0 ? '#55585e' : '#9b968d'; g.fillRect(e.x - e.w / 2, e.z - e.d / 2, e.w, e.d); }
}

export function montar(contexto) {
  ctx = contexto;
  criarMateriais();
  gerarMetropole();
  gerarHorizonte();
  for (const c of CIDADES) gerarCidade(c);
  // árvores ao longo da faixa da ferrovia
  for (const s of [-1, 1]) for (let k = 0; k < 120; k++) {
    const x = (rnd() < 0.5 ? -1 : 1) * entre(13, CORREDOR - 3), z = s * entre(215, 835);
    if (Math.abs(z) > BORDA - 4 && Math.abs(z) < BORDA + 2) continue;
    arvore(x, z, entre(0.9, 1.4), Math.abs(z) < BORDA);
  }
  for (let k = 0; k < 220; k++) {
    const s = rnd() < 0.5 ? -1 : 1, x = entre(-900, 900), z = s * entre(FIM_HORIZONTE + 10, 890);
    if (Math.abs(x) < 30 || (Math.abs(x) < 55 && Math.abs(z) > 825)) continue;
    arvore(x, z, entre(1, 1.8), false);
  }
  montarChaos();
}
// chamado depois que a ferrovia acrescentou os prédios dela
// ---------------------------------------------------------------- mobiliário urbano: meio-fio, faixas, postes e carros
const pocas = [];                 // luz dos postes no chão (aparece à noite)
export function poca(x, z, r = 5) { pocas.push([x, z, r]); }
let matCabeca = null, matPoca = null;

function cruzamentos(r) {
  // centros das ruas que cruzam esta
  const [x, z, , , vert] = r, lista = [];
  for (const o of ruas) {
    if (o[4] === vert) continue;
    const [ox, oz, ow, od] = o;
    if (vert) { if (x >= ox - ow / 2 - 1 && x <= ox + ow / 2 + 1) lista.push(oz); }
    else if (z >= oz - od / 2 - 1 && z <= oz + od / 2 + 1) lista.push(ox);
  }
  return lista;
}
function montarMobiliario() {
  const { scene } = ctx;
  // meio-fio em volta das calçadas
  const fios = [];
  for (const [x, z, w, d, y] of calcadas) {
    if (y < 0.15) continue;
    fios.push([x, z - d / 2 + 0.15, w, 0.3, y], [x, z + d / 2 - 0.15, w, 0.3, y], [x - w / 2 + 0.15, z, 0.3, d, y], [x + w / 2 - 0.15, z, 0.3, d, y]);
  }
  const mf = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#a19b90', roughness: 0.85 }), fios.length);
  fios.forEach(([x, z, w, d, y], k) => { _m.compose(_v.set(x, (y + 0.03) / 2, z), _q.identity(), _e.set(w, y + 0.03, d)); mf.setMatrixAt(k, _m); });
  mf.receiveShadow = true; scene.add(mf);

  const faixas = [], postes = [], carros = [];
  for (const r of ruas) {
    const [x, z, w, d, vert] = r, cr = cruzamentos(r);
    const a = vert ? z - d / 2 : x - w / 2, b = vert ? z + d / 2 : x + w / 2, c = vert ? x : z;
    const longe = (t, m) => cr.every((q) => Math.abs(q - t) > m);
    const ponto = (t, lat) => (vert ? [c + lat, t] : [t, c + lat]);
    for (let t = a + 4; t < b - 2; t += 6) if (longe(t, RW / 2 + 2)) faixas.push([...ponto(t, 0), vert]);
    let lado = 1;
    for (let t = a + 8; t < b - 6; t += 27) {
      if (!longe(t, RW / 2 + 3)) continue;
      const [px, pz] = ponto(t, lado * (RW / 2 + 0.9));
      postes.push([px, pz, vert ? (lado > 0 ? -Math.PI / 2 : Math.PI / 2) : (lado > 0 ? Math.PI : 0)]);
      const [qx, qz] = ponto(t, lado * (RW / 2 - 1.6)); poca(qx, qz, 5.5);
      lado = -lado;
    }
    for (let t = a + 6; t < b - 6; t += 6.5) {
      if (rnd() > 0.3 || !longe(t, RW / 2 + 5)) continue;
      const lat = (rnd() < 0.5 ? -1 : 1) * (RW / 2 - 1.15);
      const [px, pz] = ponto(t, lat);
      carros.push([px, pz, vert ? (lat > 0 ? 0 : Math.PI) : (lat > 0 ? Math.PI / 2 : -Math.PI / 2)]);
    }
  }
  // faixas tracejadas
  const fx = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ece4c8', roughness: 0.8 }), faixas.length);
  faixas.forEach(([x, z, vert], k) => { _m.compose(_v.set(x, 0.022, z), _q.identity(), _e.set(vert ? 0.22 : 3, 1, vert ? 3 : 0.22)); fx.setMatrixAt(k, _m); });
  fx.receiveShadow = true; scene.add(fx);
  // postes
  const matPoste = new THREE.MeshStandardMaterial({ color: '#33383f', roughness: 0.5, metalness: 0.5 });
  matCabeca = new THREE.MeshStandardMaterial({ color: '#f4efe0', emissive: '#ffd89a', emissiveIntensity: 0, roughness: 0.4 });
  const haste = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.11, 5.2, 7).translate(0, 2.6, 0), matPoste, postes.length);
  const braco = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 1.7).translate(0, 5.1, 0.8), matPoste, postes.length);
  const cabeca = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.16, 0.7).translate(0, 5.0, 1.55), matCabeca, postes.length);
  postes.forEach(([x, z, rot], k) => {
    _q.setFromAxisAngle(_e.set(0, 1, 0), rot); _m.compose(_v.set(x, 0.18, z), _q, _e.set(1, 1, 1));
    haste.setMatrixAt(k, _m); braco.setMatrixAt(k, _m); cabeca.setMatrixAt(k, _m);
    addCol({ tipo: 'circ', x, z, r: 0.2 });
  });
  haste.castShadow = true; scene.add(haste, braco, cabeca);
  // luz dos postes no chão
  const tl = ctx.texturaCanvas(128, (g, t) => {
    g.clearRect(0, 0, t, t);
    const gr = g.createRadialGradient(t / 2, t / 2, 0, t / 2, t / 2, t / 2);
    gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(0.45, 'rgba(255,190,120,.45)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, t, t);
  });
  tl.wrapS = tl.wrapT = THREE.ClampToEdgeWrapping;
  matPoca = new THREE.MeshBasicMaterial({ map: tl, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const pc = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), matPoca, pocas.length);
  pocas.forEach(([x, z, r], k) => { _m.compose(_v.set(x, 0.21, z), _q.identity(), _e.set(r * 2, 1, r * 2)); pc.setMatrixAt(k, _m); });
  pc.renderOrder = 2; pc.visible = false; scene.add(pc); matPoca.userData.malha = pc;
  // carros estacionados: caixinhas leves para todos; os mais perto do jogador trocam pelo modelo 3D
  const coresCarro = ['#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#2980b9', '#16a085', '#f1c40f', '#8e44ad', '#d35400', '#1f1f1f', '#bdc3c7'];
  const corpo = new THREE.BoxGeometry(1.8, 0.62, 4.2).translate(0, 0.62, 0);
  const cabine = new THREE.BoxGeometry(1.58, 0.58, 2.1).translate(0, 1.2, -0.25);
  const rodaG = []; for (const sx of [-0.86, 0.86]) for (const sz of [-1.35, 1.35]) rodaG.push(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12).rotateZ(Math.PI / 2).translate(sx, 0.34, sz).toNonIndexed());
  const rodas = mergeSimples(rodaG);
  const ic = new THREE.InstancedMesh(corpo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.45 }), carros.length);
  const iv = new THREE.InstancedMesh(cabine, new THREE.MeshStandardMaterial({ color: '#1d2730', roughness: 0.1, metalness: 0.6 }), carros.length);
  const ir = new THREE.InstancedMesh(rodas, new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.8 }), carros.length);
  carros.forEach(([x, z, rot], k) => {
    carros[k] = { x, z, rot, cor: escolher(coresCarro), tipo: (k * 7 + 3) % 3, perto: false };
    _q.setFromAxisAngle(_e.set(0, 1, 0), rot); _m.compose(_v.set(x, 0.02, z), _q, _e.set(1, 1, 1));
    ic.setMatrixAt(k, _m); iv.setMatrixAt(k, _m); ir.setMatrixAt(k, _m); ic.setColorAt(k, _c.set(carros[k].cor));
    const vert = Math.abs(Math.sin(rot)) < 0.5;
    addCol({ tipo: 'caixa', x0: x - (vert ? 0.95 : 2.15), x1: x + (vert ? 0.95 : 2.15), z0: z - (vert ? 2.15 : 0.95), z1: z + (vert ? 2.15 : 0.95) });
  });
  for (const m of [ic, iv, ir]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  const MAX = window.matchMedia?.('(pointer: coarse)').matches ? 8 : 16;
  const glb = ['carro_popular', 'carro_suv', 'carro_esportivo'].map((n) => {
    const base = ctx.modelo?.(n); if (!base) return null;
    let malha = null; base.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(base.matrixWorld).invert();
    base.traverse((o) => { if (o.isMesh && !malha) malha = o; });
    if (!malha) return null;
    const geo = malha.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, malha.matrixWorld));
    const mat = [].concat(malha.material)[0].clone(); mat.color = new THREE.Color('#ffffff');
    const im = new THREE.InstancedMesh(geo, mat, MAX); im.count = 0; im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
    return im;
  });
  estacionados = { carros, caixas: [ic, iv, ir], glb, max: MAX, t: 0 };
}
let estacionados = null;
// troca as caixinhas perto do jogador pelos modelos 3D (chamado algumas vezes por segundo)
export function carrosPerto(px, pz, dt) {
  const E = estacionados; if (!E || !E.glb.some(Boolean)) return;
  if ((E.t -= dt) > 0) return; E.t = 0.4;
  const perto = E.carros.map((c, k) => [Math.hypot(c.x - px, c.z - pz), k]).filter(([d]) => d < 70).sort((a, b) => a[0] - b[0]).slice(0, E.max * 2);
  const conta = E.glb.map(() => 0), novo = new Set();
  for (const [, k] of perto) {
    const c = E.carros[k], im = E.glb[c.tipo]; if (!im || conta[c.tipo] >= E.max) continue;
    _q.setFromAxisAngle(_e.set(0, 1, 0), c.rot); _m.compose(_v.set(c.x, 0.02, c.z), _q, _e.set(1, 1, 1));
    im.setMatrixAt(conta[c.tipo], _m); im.setColorAt(conta[c.tipo], _c.set('#ffffff').lerp(new THREE.Color(c.cor), 0.45)); conta[c.tipo]++;
    novo.add(k);
  }
  E.glb.forEach((im, i) => { if (!im) return; im.count = conta[i]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
  // esconde (escala 0) as caixinhas que viraram modelo e mostra de volta as que saíram
  let mudou = false;
  E.carros.forEach((c, k) => {
    const p = novo.has(k); if (p === c.perto) return; c.perto = p; mudou = true;
    _q.setFromAxisAngle(_e.set(0, 1, 0), c.rot); _m.compose(_v.set(c.x, 0.02, c.z), _q, p ? _e.set(0, 0, 0) : _e.set(1, 1, 1));
    for (const m of E.caixas) m.setMatrixAt(k, _m);
  });
  if (mudou) for (const m of E.caixas) m.instanceMatrix.needsUpdate = true;
}
function mergeSimples(lista) {
  let n = 0; for (const g of lista) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of lista) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(pos, 3)); r.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return r;
}

// noite: 0 = dia claro, 1 = noite fechada
export function definirNoite(n) {
  UNI.uNoite.value = n;
  if (matCabeca) matCabeca.emissiveIntensity = n * 2.2;
  if (matPoca) { matPoca.opacity = n * 0.6; matPoca.userData.malha.visible = n > 0.02; }
}
export function atualizar(dt) {
  if (MAT?.agua.normalMap) { MAT.agua.normalMap.offset.x += dt * 0.004; MAT.agua.normalMap.offset.y += dt * 0.0025; }
}

export function finalizar() { montarMobiliario(); montarMalhas(); }
