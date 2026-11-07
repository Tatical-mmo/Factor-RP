import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FERRO_VELHOS, FABRICAS, PRODUTOS, FOME_POR_SEGUNDO, LOTES_VENDA, DESTINOS } from './config.js';
import { iniciarEmpresa, abrirCompra, abrirMissoes, atualizar as atualizarJanelaEmpresa } from './empresa.js';
import { iniciarLoja, abrir as abrirJanela, recarregarInventario } from './loja.js';
import { PERSONAGENS, ROBOS, MODELOS, CIDADE, RUAS_HORIZONTAIS, RUAS_VERTICAIS, QUARTEIROES_ESPECIAIS, VELOCIDADE, CONTROLES_PC } from './config.js';

const $ = (id) => document.getElementById(id);
const TOQUE = window.matchMedia('(pointer: coarse)').matches;

import * as rede from './rede.js';
import { iniciarPainel, atualizarBotao } from './painel.js';

// ================================================================= CONTA E PERFIL
let escolhido = null;
let sessao = null;
const msgLogin = (t, ok = false) => { const m = $('msgLogin'); m.textContent = t; m.classList.toggle('ok', ok); };

function mostrar(id) {
  for (const t of ['login', 'escolha', 'barraEscolha', 'carregando']) $(t).classList.toggle('oculto', !(id === t || (id === 'escolha' && t === 'barraEscolha')));
}

async function aposLogin(s) {
  sessao = s;
  msgLogin('Carregando perfil…', true);
  const perfil = await rede.carregarPerfil(s.user.id);
  if (perfil?.banido) {
    await rede.sair(); mostrar('login');
    msgLogin('Esta conta foi banida.' + (perfil.banido_motivo ? ' Motivo: ' + perfil.banido_motivo : ''));
    return;
  }
  if (perfil) comecar(perfil);
  else { mostrar('escolha'); validar(); }
}

function montarLogin() {
  const acao = async (fn) => {
    const email = $('email').value.trim(), senha = $('senha').value;
    if (!email || !senha) { msgLogin('Preencha e-mail e senha.'); return; }
    $('btEntrar').disabled = $('btCriar').disabled = true; msgLogin('Aguarde…', true);
    try { await aposLogin(await fn(email, senha)); }
    catch (e) { msgLogin(e.message, e.message.startsWith('Conta criada')); }
    finally { $('btEntrar').disabled = $('btCriar').disabled = false; }
  };
  $('btEntrar').onclick = () => acao(rede.entrar);
  $('btCriar').onclick = () => acao(rede.cadastrar);
  $('senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') acao(rede.entrar); });
}

function montarEscolha() {
  const grade = $('grade');
  for (const p of PERSONAGENS) {
    const c = document.createElement('div');
    c.className = 'carta';
    c.innerHTML = `<img src="assets/miniaturas/${p.id}.webp" alt="" loading="lazy"><div>${p.nome}</div>`;
    c.onclick = () => { escolhido = p.id; document.querySelectorAll('.carta').forEach(e => e.classList.remove('sel')); c.classList.add('sel'); validar(); };
    grade.appendChild(c);
  }
  $('nome').addEventListener('input', validar);
  $('nome').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('entrar').disabled) criar(); });
  $('entrar').onclick = criar;
}
function nomeValido(n) { return /^[\p{L}\p{N} _.-]{3,16}$/u.test(n); }
function validar() {
  const n = $('nome').value.trim();
  let erro = '';
  if (n && !nomeValido(n)) erro = 'Use de 3 a 16 letras, números, espaço, ponto, hífen ou _.';
  else if (n && !escolhido) erro = 'Escolha um personagem.';
  $('erroNome').textContent = erro;
  $('entrar').disabled = !(escolhido && nomeValido(n));
}
async function criar() {
  $('entrar').disabled = true; $('erroNome').textContent = 'Criando…';
  try { comecar(await rede.criarPerfil(sessao.user.id, $('nome').value.trim(), escolhido)); }
  catch (e) { $('erroNome').textContent = e.message; validar(); $('erroNome').textContent = e.message; }
}
function comecar(perfil) {
  mostrar('carregando');
  iniciarJogo(perfil).catch((e) => { console.error(e); $('progressoTxt').textContent = 'Erro ao carregar: ' + e.message; });
}

montarLogin();
montarEscolha();
rede.sessaoAtual().then((s) => { if (s) aposLogin(s).catch((e) => { mostrar('login'); msgLogin(e.message); }); });

// ================================================================= MOTOR
const canvas = $('jogo');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !TOQUE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOQUE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9c8de');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const hemi = new THREE.HemisphereLight('#dfeeff', '#8a7457', 1.3);
scene.add(hemi);
const sol = new THREE.DirectionalLight('#fff2dc', 2.1);
sol.castShadow = true;
sol.shadow.mapSize.set(TOQUE ? 1024 : 2048, TOQUE ? 1024 : 2048);
const SOMBRA = 34;
Object.assign(sol.shadow.camera, { left: -SOMBRA, right: SOMBRA, top: SOMBRA, bottom: -SOMBRA, near: 1, far: 160 });
sol.shadow.bias = -0.0004;
sol.shadow.normalBias = 0.03;
scene.add(sol, sol.target);
const SOL_DIR = new THREE.Vector3(-0.55, 1, 0.35).normalize();

// Câmera isométrica
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
let zoom = TOQUE ? 26 : 30;            // altura visível em metros
let anguloCam = 0;                      // 0..3 (90° cada)
let anguloCamSuave = 0;
const alvoCam = new THREE.Vector3();
function ajustarCamera() {
  const a = window.innerWidth / window.innerHeight;
  camera.left = -zoom * a / 2; camera.right = zoom * a / 2; camera.top = zoom / 2; camera.bottom = -zoom / 2;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); ajustarCamera(); });
ajustarCamera();
function offsetCamera(ang) {
  const a = Math.PI / 4 + ang * Math.PI / 2;
  return new THREE.Vector3(Math.sin(a) * Math.SQRT2, 1, Math.cos(a) * Math.SQRT2).normalize();
}

// ---------------------------------------------------------------- carregamento
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, carregados, total) => {
  const p = Math.round(carregados / total * 100);
  $('progresso').style.width = p + '%'; $('progressoTxt').textContent = p + '%';
};
const loader = new GLTFLoader(manager);
const cacheGLTF = new Map();
function carregarGLB(url) {
  if (!cacheGLTF.has(url)) cacheGLTF.set(url, loader.loadAsync(url));
  return cacheGLTF.get(url);
}

const modelos = {};   // nome -> Object3D original (para clonar)
function prepararEstatico(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      if (o.material) { o.material.envMapIntensity = 0.8; }
    }
  });
  return obj;
}
function clonar(nome, sombra = true) {
  const c = modelos[nome].clone(true);
  if (!sombra) c.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return c;
}

// ================================================================= CIDADE
const { quarteiroes: N, quarteirao: QB, rua: RW, calcada: CW } = CIDADE;
const TOTAL = N * QB + (N + 1) * RW;
const METADE = TOTAL / 2;
const ruaC = (i) => -METADE + RW / 2 + i * (QB + RW);
const quadC = (i) => -METADE + RW + QB / 2 + i * (QB + RW);
const BASE_X = METADE + 42;

const colisores = [];      // {tipo:'caixa', x0,x1,z0,z1} | {tipo:'circ', x,z,r}
const predios = [];        // {obj, caixa:Box3, mats:[]}
const caixasSoltas = [];   // caixas que podem ser pegas
const itensMapa = [];      // para o minimapa
const rng = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

function materialChao(cor, rugosidade = 0.95) { return new THREE.MeshStandardMaterial({ color: cor, roughness: rugosidade, metalness: 0 }); }

function montarChao() {
  const terra = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), materialChao('#bda783'));
  terra.rotation.x = -Math.PI / 2; terra.receiveShadow = true; scene.add(terra);

  const asfaltoTex = texturaCanvas(256, (g, t) => {
    g.fillStyle = '#41454d'; g.fillRect(0, 0, t, t);
    ruido(g, t, 9000, 0.06, 1.6);
    g.strokeStyle = 'rgba(25,27,31,.45)'; g.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) { g.beginPath(); let x = Math.random() * t, y = Math.random() * t; g.moveTo(x, y); for (let n = 0; n < 6; n++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  });
  const calcTex = texturaCanvas(256, (g, t) => {
    const n = 4, l = t / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 200 + Math.floor(Math.random() * 14); g.fillStyle = `rgb(${v + 6},${v},${v - 12})`; g.fillRect(i * l, j * l, l, l);
    }
    ruido(g, t, 3000, 0.05, 1.2);
    g.strokeStyle = 'rgba(120,112,98,.55)'; g.lineWidth = 2;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * l, 0); g.lineTo(i * l, t); g.moveTo(0, i * l); g.lineTo(t, i * l); g.stroke(); }
  });
  const gramaTex = texturaCanvas(256, (g, t) => { g.fillStyle = '#7aa357'; g.fillRect(0, 0, t, t); ruido(g, t, 12000, 0.1, 2, [40, 70, 20]); });
  const pateoTex = texturaCanvas(256, (g, t) => { g.fillStyle = '#ab9c82'; g.fillRect(0, 0, t, t); ruido(g, t, 9000, 0.08, 1.8, [70, 55, 35]); });
  const comp = TOTAL;
  const matTex = (tex, rx, ry, rug = 0.92) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new THREE.MeshStandardMaterial({ map: t, roughness: rug, metalness: 0 }); };
  const asfH = matTex(asfaltoTex, comp / 7, RW / 7, 0.88), asfV = matTex(asfaltoTex, RW / 7, comp / 7, 0.88);
  for (let i = 0; i <= N; i++) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(comp, RW), asfH);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.02, ruaC(i)); h.receiveShadow = true; scene.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(RW, comp), asfV);
    v.rotation.x = -Math.PI / 2; v.position.set(ruaC(i), 0.026, 0); v.receiveShadow = true; scene.add(v);
  }
  // estradas de terra até as bases de clã
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(BASE_X - METADE, RW * 0.8), matTex(pateoTex, (BASE_X - METADE) / 8, 1));
    e.rotation.x = -Math.PI / 2; e.position.set(s * (METADE + (BASE_X - METADE) / 2), 0.015, ruaC(2)); e.receiveShadow = true; scene.add(e);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), um = new THREE.Vector3(1, 1, 1);
  const instancias = (geo, mat, lista, y) => {
    const im = new THREE.InstancedMesh(geo, mat, lista.length);
    lista.forEach(([x, z, rot, sx = 1, sz = 1], k) => {
      e.set(-Math.PI / 2, 0, rot); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sz, 1)); im.setMatrixAt(k, m);
    });
    im.receiveShadow = true; scene.add(im); return im;
  };
  const tinta = new THREE.MeshStandardMaterial({ color: '#efe7cf', roughness: 0.7 });
  // faixas tracejadas
  const tracos = [];
  for (let i = 0; i <= N; i++) {
    for (let t = -METADE + 1.5; t < METADE; t += 4.5) {
      let cruz = false;
      for (let j = 0; j <= N; j++) if (Math.abs(t - ruaC(j)) < RW / 2 + 3.8) cruz = true;
      if (!cruz) tracos.push([t, ruaC(i), Math.PI / 2], [ruaC(i), t, 0]);
    }
  }
  instancias(new THREE.PlaneGeometry(0.22, 2.2), tinta, tracos, 0.034);
  // faixas de pedestre
  const zebra = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const X = ruaC(i), Z = ruaC(j);
    for (const s of [-1, 1]) {
      const px = X + s * (RW / 2 + 1.7), pz = Z + s * (RW / 2 + 1.7);
      for (let w = -RW / 2 + 0.8; w <= RW / 2 - 0.7; w += 0.95) {
        if (Math.abs(px) < METADE) zebra.push([px, Z + w, Math.PI / 2, 0.45, 2.6]);
        if (Math.abs(pz) < METADE) zebra.push([X + w, pz, 0, 0.45, 2.6]);
      }
    }
  }
  instancias(new THREE.PlaneGeometry(1, 1), tinta, zebra, 0.036);

  // quarteirões: calçada + meio-fio + miolo
  const calc = matTex(calcTex, QB / 3, QB / 3);
  const grama = matTex(gramaTex, 6, 6, 1), pateo = matTex(pateoTex, 5, 5, 1);
  const meioFio = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#97928a', roughness: 0.85 }), N * N * 4);
  let k = 0;
  for (let cx = 0; cx < N; cx++) for (let cz = 0; cz < N; cz++) {
    const x = quadC(cx), z = quadC(cz);
    const esp = QUARTEIROES_ESPECIAIS[`${cx},${cz}`] || {};
    const borda = new THREE.Mesh(new THREE.BoxGeometry(QB, 0.18, QB), calc);
    borda.position.set(x, 0.09, z); borda.receiveShadow = true; scene.add(borda);
    const miolo = new THREE.Mesh(new THREE.PlaneGeometry(QB - CW * 2, QB - CW * 2), esp.parque ? grama : pateo);
    miolo.rotation.x = -Math.PI / 2; miolo.position.set(x, 0.185, z); miolo.receiveShadow = true; scene.add(miolo);
    // o meio-fio sai 1 cm para fora da calçada e os lados não se sobrepõem nos cantos (evita o pisca)
    const f = QB / 2 - 0.14;
    for (const [dx, dz, sx, sz] of [[f, 0, 0.3, QB - 0.62], [-f, 0, 0.3, QB - 0.62], [0, f, QB + 0.02, 0.3], [0, -f, QB + 0.02, 0.3]]) {
      m.compose(new THREE.Vector3(x + dx, 0.11, z + dz), new THREE.Quaternion(), new THREE.Vector3(sx, 0.2, sz)); meioFio.setMatrixAt(k++, m);
    }
  }
  meioFio.receiveShadow = true; meioFio.castShadow = true; scene.add(meioFio);
}

function texturaCanvas(tam, desenhar) {
  const c = document.createElement('canvas'); c.width = c.height = tam;
  desenhar(c.getContext('2d'), tam);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function ruido(g, t, n, forca, tam, cor = null) {
  for (let i = 0; i < n; i++) {
    const claro = Math.random() < 0.5;
    g.fillStyle = cor ? `rgba(${cor[0]},${cor[1]},${cor[2]},${Math.random() * forca * 2})` : (claro ? `rgba(255,255,255,${Math.random() * forca})` : `rgba(0,0,0,${Math.random() * forca})`);
    g.fillRect(Math.random() * t, Math.random() * t, tam, tam);
  }
}

// Placas de nome (sprites)
function textoSprite(texto, { cor = '#ffffff', fundo = 'rgba(20,24,34,.78)', tam = 34, escala = 1 } = {}) {
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  ctx.font = `700 ${tam}px system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(texto).width) + 28, h = tam + 20;
  c.width = w; c.height = h;
  ctx.font = `700 ${tam}px system-ui, sans-serif`;
  if (fundo) { ctx.fillStyle = fundo; const r = h / 2; ctx.beginPath(); ctx.roundRect(0, 0, w, h, r); ctx.fill(); }
  ctx.fillStyle = cor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(texto, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  const k = 0.022 * escala; s.scale.set(w * k, h * k, 1); s.renderOrder = 5;
  return s;
}

const placas = [];
function montarPlacasRuas() {
  const poste = new THREE.MeshStandardMaterial({ color: '#2e3238', roughness: 0.6, metalness: 0.4 });
  const geo = new THREE.CylinderGeometry(0.05, 0.05, 2.7, 8);
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const X = ruaC(i), Z = ruaC(j);
    // esquina do quarteirão mais próximo do centro (sempre dentro da cidade)
    const sx = i < N / 2 ? 1 : -1, sz = j < N / 2 ? 1 : -1;
    const px = X + sx * (RW / 2 + 0.7), pz = Z + sz * (RW / 2 + 0.7);
    const p = new THREE.Mesh(geo, poste); p.position.set(px, 0.18 + 1.35, pz); p.castShadow = true; scene.add(p);
    colisores.push({ tipo: 'circ', x: px, z: pz, r: 0.12 });
    const a = textoSprite(RUAS_HORIZONTAIS[j], { escala: 0.5, fundo: '#1f6b3a' }); a.position.set(px, 3.15, pz); scene.add(a);
    const b = textoSprite(RUAS_VERTICAIS[i], { escala: 0.5, fundo: '#1f6b3a' }); b.position.set(px, 2.72, pz); scene.add(b);
    placas.push(a, b);
  }
}
function atualizarPlacas() {
  for (const s of placas) {
    const d = Math.hypot(s.position.x - jogador.pos.x, s.position.z - jogador.pos.z);
    s.material.opacity = THREE.MathUtils.clamp((d - 2.5) / 3, 0.15, 1);
  }
}

function addColisorCaixa(obj, encolher = 0.6) {
  const b = new THREE.Box3().setFromObject(obj);
  colisores.push({ tipo: 'caixa', x0: b.min.x + encolher, x1: b.max.x - encolher, z0: b.min.z + encolher, z1: b.max.z - encolher });
  return b;
}

const CORES_MAPA = { ferro_velho: '#7a4a2a', delegacia: '#4f7bd8', loja: '#e05a4f', empresa: '#9aa0a8', transportadora: '#e39b3a', casa: '#8c5a3c', base_cla: '#c43b3b' };

function colocarPredio(nome, x, z, rotY) {
  const obj = clonar(nome);
  obj.rotation.y = rotY; obj.position.set(x, 0.18, z);
  // materiais próprios para poder deixar transparente quando cobrir o jogador
  const mats = [];
  obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); mats.push(o.material); } });
  scene.add(obj); obj.updateMatrixWorld(true);
  const caixa = addColisorCaixa(obj, 0.8);
  predios.push({ obj, caixa, mats, opac: 1 });
  itensMapa.push({ tipo: nome, x0: caixa.min.x, x1: caixa.max.x, z0: caixa.min.z, z1: caixa.max.z });
  return obj;
}

function colocarArvore(x, z, s = 1) {
  const a = clonar('arvore'); a.position.set(x, 0.18, z); a.rotation.y = rng() * Math.PI * 2; a.scale.setScalar(s * (0.85 + rng() * 0.3));
  scene.add(a); colisores.push({ tipo: 'circ', x, z, r: 0.7 * s });
}
function colocarPoste(x, z, rot) {
  const p = clonar('poste'); p.position.set(x, 0.18, z); p.rotation.y = rot; scene.add(p);
  colisores.push({ tipo: 'circ', x, z, r: 0.3 });
}
function colocarCaixa(x, z, rot = 0) {
  const c = clonar('caixa'); c.scale.setScalar(0.72); c.position.set(x, 0.18, z); c.rotation.y = rot; scene.add(c);
  caixasSoltas.push(c); return c;
}
function colocarVeiculo(nome, x, z, rot) {
  const v = clonar(nome); v.position.set(x, 0.02, z); v.rotation.y = rot; scene.add(v); v.updateMatrixWorld(true);
  addColisorCaixa(v, 0.35); return v;
}

let contratante = null;
const pontos = { bancadas: [], docas: [], lojas: [], sucata: [], lotes: [], bancadasEmp: [], depositos: [] };
function pontoProximo(lista, raio) {
  let melhor = null, dm = raio;
  for (const p of lista) { const d = Math.hypot(p.x - jogador.pos.x, p.z - jogador.pos.z); if (d < dm) { dm = d; melhor = p; } }
  return melhor;
}

function criarFerroVelho(x, z) {
  const cores = ['#7a4a2a', '#8c5a32', '#5b5f66', '#6e3b22', '#9a9184', '#4a4f57'];
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const montes = [[x - 3, z - 2], [x + 3.5, z + 2.5]];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const [mx, mz] of montes) {
    const n = 46;
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.45 }), n);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 2.6;
      const h = (2.6 - r) * 0.7 + rng() * 0.3;
      e.set(rng() * 3, rng() * 3, rng() * 3); q.setFromEuler(e);
      m.compose(new THREE.Vector3(mx + Math.cos(a) * r, 0.18 + h * 0.6, mz + Math.sin(a) * r), q,
        new THREE.Vector3(0.3 + rng() * 0.9, 0.12 + rng() * 0.4, 0.3 + rng() * 0.7));
      inst.setMatrixAt(i, m); inst.setColorAt(i, new THREE.Color(cores[Math.floor(rng() * cores.length)]));
    }
    inst.castShadow = true; inst.receiveShadow = true; scene.add(inst);
    colisores.push({ tipo: 'circ', x: mx, z: mz, r: 2.2 });
    pontos.sucata.push({ x: mx, z: mz });
  }
  const pl = textoSprite('Ferro-velho', { escala: 0.8, fundo: 'rgba(90,50,20,.9)' }); pl.position.set(x, 3, z); scene.add(pl);
  itensMapa.push({ tipo: 'ferro_velho', x0: x - 7, x1: x + 7, z0: z - 6, z1: z + 6 });
}

// caixa com produto (cor da fita indica o tipo)
const matCaixas = {};
function criarCaixa(tipo) {
  const c = clonar('caixa'); c.scale.setScalar(0.72); c.userData.tipo = tipo || null;
  if (tipo && PRODUTOS[tipo]) {
    if (!matCaixas[tipo]) matCaixas[tipo] = new Map();
    c.traverse((o) => {
      if (!o.isMesh) return;
      const cache = matCaixas[tipo];
      if (!cache.has(o.material)) { const mm = o.material.clone(); mm.color.set(PRODUTOS[tipo].cor); cache.set(o.material, mm); }
      o.material = cache.get(o.material);
    });
  }
  scene.add(c);
  return c;
}
const codigoCaixa = (c) => !c ? 0 : (PRODUTOS[c.userData.tipo]?.codigo || 1);
const tipoDoCodigo = (n) => Object.keys(PRODUTOS).find((k) => PRODUTOS[k].codigo === n) || null;
let cadeia = null;
const RAIO_CADEIA = 2.2;
function criarCadeia(caixaDelegacia) {
  cadeia = { x: caixaDelegacia.max.x + 3.2, z: (caixaDelegacia.min.z + caixaDelegacia.max.z) / 2 };
  const mat = new THREE.MeshStandardMaterial({ color: '#30353d', metalness: 0.7, roughness: 0.4 });
  const barra = new THREE.CylinderGeometry(0.045, 0.045, 2.6, 6);
  const grade = new THREE.InstancedMesh(barra, mat, 40);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2;
    m.makeTranslation(cadeia.x + Math.cos(a) * (RAIO_CADEIA + 0.3), 0.18 + 1.3, cadeia.z + Math.sin(a) * (RAIO_CADEIA + 0.3)); grade.setMatrixAt(i, m);
  }
  grade.castShadow = true; scene.add(grade);
  const aro = new THREE.Mesh(new THREE.TorusGeometry(RAIO_CADEIA + 0.3, 0.06, 6, 48), mat);
  aro.rotation.x = Math.PI / 2; aro.position.set(cadeia.x, 2.75, cadeia.z); scene.add(aro);
  const placa = textoSprite('Cadeia', { escala: 0.7, cor: '#ffb4a8' }); placa.position.set(cadeia.x, 3.3, cadeia.z); scene.add(placa);
}

function montarQuarteiroes() {
  const L = (QB - CW * 2) / 2;           // tamanho do lote (19 m)
  for (let cx = 0; cx < N; cx++) for (let cz = 0; cz < N; cz++) {
    const x = quadC(cx), z = quadC(cz);
    const esp = QUARTEIROES_ESPECIAIS[`${cx},${cz}`];
    // postes nas esquinas da calçada
    const d = QB / 2 - 2.4;
    colocarPoste(x - d, z + d, 0); colocarPoste(x + d, z - d, Math.PI / 2);

    if (esp && esp.parque) {
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * Math.PI * 2; colocarArvore(x + Math.cos(a) * 13, z + Math.sin(a) * 13, 1.05);
      }
      contratante = { x, z };
      continue;
    }
    const lotes = esp || { SO: 'casa', SE: 'casa', NE: rng() < 0.6 ? 'casa' : 'arvores', NO: 'arvores' };
    if (!esp && FERRO_VELHOS.includes(`${cx},${cz}`)) lotes.NO = 'ferro_velho';
    // centro de cada lote
    const c = L / 2;
    const lote = { SO: [x - c, z + c], SE: [x + c, z + c], NE: [x + c, z - c], NO: [x - c, z - c] };
    for (const q of ['SO', 'SE', 'NE', 'NO']) {
      if (LOTES_VENDA.some((l) => l.q === `${cx},${cz}` && l.lote === q)) continue;   // lote à venda (etapa 4)
      const tipo = lotes[q]; const [lx, lz] = lote[q];
      if (tipo === 'arvores') { colocarArvore(lx - 4 + rng() * 2, lz - 3 + rng() * 2); colocarArvore(lx + 4 - rng() * 2, lz + 3 - rng() * 2, 0.9); continue; }
      if (tipo === 'patio_caixas') {
        const b = clonar('bancada'); b.position.set(lx, 0.18, lz); b.rotation.y = Math.PI / 2; scene.add(b); b.updateMatrixWorld(true); addColisorCaixa(b, 0.1);
        for (let k = 0; k < 5; k++) colocarCaixa(lx - 5 + k * 2.4, lz + 4.5 + (k % 2) * 1.2, rng());
        const produto = FABRICAS[`${cx},${cz}`];
        if (produto) {
          pontos.bancadas.push({ x: lx, z: lz, produto });
          const pl = textoSprite(`Bancada: ${PRODUTOS[produto].nome}`, { escala: 0.6, fundo: 'rgba(60,40,15,.85)', cor: '#ffd9a0' });
          pl.position.set(lx, 2.3, lz); scene.add(pl);
        }
        continue;
      }
      if (tipo === 'ferro_velho') { criarFerroVelho(lx, lz); continue; }
      if (tipo === 'patio_policia') {
        colocarVeiculo('viatura', lx - 3, lz + 1, Math.PI / 2);
        colocarVeiculo('van_policia', lx + 4.5, lz + 1, Math.PI / 2);
        continue;
      }
      // frentes viradas para a câmera (sul = +Z, leste = +X)
      const rot = q === 'NE' ? Math.PI / 2 : 0;
      const obj = colocarPredio(tipo, lx, lz, rot);
      // encosta a frente na calçada
      const b = new THREE.Box3().setFromObject(obj);
      if (rot === 0) obj.position.z += (lz + L / 2 - 0.4) - b.max.z;
      else obj.position.x += (lx + L / 2 - 0.4) - b.max.x;
      obj.updateMatrixWorld(true);
      // atualiza colisor e mapa do prédio deslocado
      const p = predios[predios.length - 1]; colisores.splice(colisores.length - 1, 1);
      p.caixa = addColisorCaixa(obj, 0.8);
      Object.assign(itensMapa[itensMapa.length - 1], { x0: p.caixa.min.x, x1: p.caixa.max.x, z0: p.caixa.min.z, z1: p.caixa.max.z });
      if (tipo === 'delegacia') criarCadeia(p.caixa);
      if (tipo === 'transportadora' || tipo === 'loja') {
        const frente = rot === 0
          ? { x: (p.caixa.min.x + p.caixa.max.x) / 2, z: p.caixa.max.z + 1.3 }
          : { x: p.caixa.max.x + 1.3, z: (p.caixa.min.z + p.caixa.max.z) / 2 };
        if (tipo === 'loja') {
          pontos.lojas.push(frente);
          const pl = textoSprite('Loja', { escala: 0.8, fundo: 'rgba(140,30,30,.85)' }); pl.position.set(frente.x, 2.6, frente.z); scene.add(pl);
        } else {
          pontos.docas.push(frente);
          const faixa = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.6), new THREE.MeshStandardMaterial({ color: '#e3b23c', roughness: 0.8, transparent: true, opacity: 0.85 }));
          faixa.rotation.x = -Math.PI / 2; faixa.rotation.z = rot; faixa.position.set(frente.x, 0.19, frente.z); faixa.receiveShadow = true; scene.add(faixa);
          const pl = textoSprite('Doca de entrega', { escala: 0.7, fundo: 'rgba(120,80,10,.9)' }); pl.position.set(frente.x, 2.4, frente.z); scene.add(pl);
        }
      }
    }
  }
  // veículos estacionados
  colocarVeiculo('caminhao', quadC(2) + 9, ruaC(2) - 2.6, Math.PI / 2);
  // bases de clã fora da cidade
  for (const s of [-1, 1]) {
    colocarPredio('base_cla', s * BASE_X, ruaC(2), s > 0 ? -Math.PI / 2 : Math.PI / 2);
    const anel = new THREE.Mesh(new THREE.RingGeometry(23, 24, 64), new THREE.MeshBasicMaterial({ color: s > 0 ? '#d24b4b' : '#4b7bd2', transparent: true, opacity: 0.55 }));
    anel.rotation.x = -Math.PI / 2; anel.position.set(s * BASE_X, 0.04, ruaC(2)); scene.add(anel);
    const placa = textoSprite('Território livre', { escala: 1.1, cor: '#ffd9a0' }); placa.position.set(s * BASE_X, 13, ruaC(2)); scene.add(placa);
    itensMapa.push({ tipo: 'territorio', x: s * BASE_X, z: ruaC(2), r: 24 });
  }
  // o caminhão danificado só aparece quando uma carga for roubada (etapa 5)
  // árvores espalhadas fora da cidade
  for (let k = 0; k < 18; k++) {
    const a = rng() * Math.PI * 2, r = METADE + 15 + rng() * 60;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(z - ruaC(2)) < 30 && Math.abs(x) > METADE) continue;
    colocarArvore(x, z, 1.1);
  }
}

// ================================================================= PERSONAGENS
const NOMES_LOCOMOCAO = ['idle', 'idle_long', 'walk', 'run', 'carry_walk', 'walk_shoot'];
function prepararClipes(anims) {
  const clipes = {};
  for (const c of anims) clipes[c.name] = c;
  // anima no lugar (o deslocamento é feito pelo código)
  for (const n of NOMES_LOCOMOCAO) {
    const c = clipes[n]; if (!c) continue;
    for (const t of c.tracks) {
      if (t.name.endsWith('Hips.position')) {
        const v = t.values; const x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
      }
    }
  }
  const sub = THREE.AnimationUtils.subclip;
  if (clipes.shoot) clipes.mirar = sub(clipes.shoot, 'mirar', 78, 117, 30);
  // parado segurando: braços e tronco congelados na pose de carregar, pernas da animação parada
  if (clipes.carry_walk && clipes.idle) clipes.carregar_parado = poseSuperior(clipes.idle, clipes.carry_walk, 0.2, 'carregar_parado');
  if (clipes.pickup) clipes.pegar = sub(clipes.pickup, 'pegar', 21, 72, 30);
  return clipes;
}

const OSSOS_SUPERIORES = /Spine|Neck|Head|Shoulder|Arm|Hand/;
function poseSuperior(base, fonte, t, nome) {
  const tracks = base.tracks.map((tr) => {
    const osso = tr.name.split('.')[0];
    if (tr.name.endsWith('.quaternion') && OSSOS_SUPERIORES.test(osso)) {
      const src = fonte.tracks.find((x) => x.name === tr.name);
      if (src) {
        const v = Array.from(src.createInterpolant().evaluate(t));
        return new THREE.QuaternionKeyframeTrack(tr.name, [0, base.duration], [...v, ...v]);
      }
    }
    return tr.clone();
  });
  return new THREE.AnimationClip(nome, base.duration, tracks);
}

class Avatar {
  constructor(modelo, clipes) {
    this.raiz = new THREE.Group();
    this.modelo = modelo; this.raiz.add(modelo);
    modelo.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
    this.clipes = clipes;
    this.mixer = new THREE.AnimationMixer(modelo);
    this.acoes = {};
    this.atual = null; this.nomeAtual = '';
    this.maoD = modelo.getObjectByName('mixamorigRightHand');
    this.maoE = modelo.getObjectByName('mixamorigLeftHand');
  }
  acao(nome) {
    if (!this.acoes[nome]) this.acoes[nome] = this.mixer.clipAction(this.clipes[nome]);
    return this.acoes[nome];
  }
  tocar(nome, { fade = 0.2, umaVez = false, velocidade = 1 } = {}) {
    if (!this.clipes[nome]) return;
    if (this.nomeAtual === nome && !umaVez) { this.atual.setEffectiveTimeScale(velocidade); return; }
    const prox = this.acao(nome);
    prox.reset();
    prox.setLoop(umaVez ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    prox.clampWhenFinished = umaVez;
    prox.setEffectiveTimeScale(velocidade).setEffectiveWeight(1).fadeIn(fade).play();
    if (this.atual && this.atual !== prox) this.atual.fadeOut(fade);
    this.atual = prox; this.nomeAtual = nome;
  }
  // segura a arma: calcula o encaixe na mão a partir da pose de mira
  encaixarArma(arma) {
    const a = this.acao('mirar'); a.reset().play(); this.mixer.setTime(0.6);
    this.raiz.updateMatrixWorld(true);
    const pm = new THREE.Vector3().setFromMatrixPosition(this.maoD.matrixWorld);
    const pe = new THREE.Vector3().setFromMatrixPosition(this.maoE.matrixWorld);
    const meio = pm.clone().lerp(pe, 0.35);
    const pega = new THREE.Vector3(0, 0.1, -0.11);                // empunhadura no espaço da arma
    const desejada = new THREE.Matrix4().compose(meio.sub(pega), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    const local = this.maoD.matrixWorld.clone().invert().multiply(desejada);
    arma.matrixAutoUpdate = false; arma.matrix.copy(local);
    this.maoD.add(arma);
    a.stop(); this.mixer.stopAllAction(); this.atual = null; this.nomeAtual = '';
  }
}

async function criarAvatar(pasta, id) {
  const gltf = await carregarGLB(`assets/${pasta}/${id}.glb`);
  const modelo = SkeletonUtils.clone(gltf.scene);
  if (!gltf.userData.clipes) gltf.userData.clipes = prepararClipes(gltf.animations);
  return new Avatar(modelo, gltf.userData.clipes);
}

// ================================================================= JOGADOR
const jogador = {
  avatar: null, nome: '', pos: new THREE.Vector3(), yaw: 0, raio: 0.38,
  trava: 0, armado: false, carregando: null, eventos: [], recarga: 0, alvo: null, soco: 0,
  arma: null, etiqueta: null, perfil: null,
  algemado: false, pena: 0, algemas: null, sincPena: 10, fome: 100,
};

function resolverColisao(p, raio) {
  for (const c of colisores) {
    if (c.tipo === 'caixa') {
      const qx = Math.max(c.x0, Math.min(p.x, c.x1)), qz = Math.max(c.z0, Math.min(p.z, c.z1));
      const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
      if (d2 < raio * raio) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = qx + dx / d * raio; p.z = qz + dz / d * raio; }
        else { // dentro: empurra pelo lado mais próximo
          const op = [[p.x - c.x0, -1, 0], [c.x1 - p.x, 1, 0], [p.z - c.z0, 0, -1], [c.z1 - p.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
          if (op[1]) p.x = op[1] < 0 ? c.x0 - raio : c.x1 + raio; else p.z = op[2] < 0 ? c.z0 - raio : c.z1 + raio;
        }
      }
    } else {
      const dx = p.x - c.x, dz = p.z - c.z, r = raio + c.r, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = c.x + dx / d * r; p.z = c.z + dz / d * r; }
    }
  }
  // caminhão em movimento
  if (caminhaoMovel) {
    const dx = p.x - caminhaoMovel.obj.position.x, dz = p.z - caminhaoMovel.obj.position.z, r = raio + 2.3, d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = caminhaoMovel.obj.position.x + dx / d * r; p.z = caminhaoMovel.obj.position.z + dz / d * r; }
  }
  for (const c of caminhoes.values()) {
    const q = c.obj.position, dx = p.x - q.x, dz = p.z - q.z, rr = raio + 2.2, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = q.x + dx / d * rr; p.z = q.z + dz / d * rr; }
  }
  for (const r of remotos.values()) {
    if (!r.av?.raiz.visible) continue;
    const q = r.av.raiz.position, dx = p.x - q.x, dz = p.z - q.z, rr = raio * 2, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = q.x + dx / d * rr; p.z = q.z + dz / d * rr; }
  }
  const lim = BASE_X + 40; p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
}

function alturaChao(x, z) {
  // calçadas e quarteirões ficam 18 cm acima da rua
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (Math.abs(x - quadC(i)) < QB / 2 && Math.abs(z - quadC(j)) < QB / 2) return 0.18;
  }
  return 0;
}

// ================================================================= ENTRADA
const teclas = new Set();
const joy = { ativo: false, x: 0, y: 0, id: null };
window.addEventListener('keydown', (e) => {
  const foco = document.activeElement;
  if (foco && (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA')) return;
  const k = e.key.toLowerCase(); teclas.add(k);
  if (!jogador.avatar || e.repeat) return;
  if (k === 'e') acaoContexto();
  if (k === 'f') socar();
  if (k === 'q') alternarArma();
  if (k === 'z') girarCamera(-1);
  if (k === 'x') girarCamera(1);
  if (k === 'm') abrirJanela('mochila');
});
window.addEventListener('keyup', (e) => teclas.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => teclas.clear());
window.addEventListener('wheel', (e) => { zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 1.1 : 0.9), 12, 70); ajustarCamera(); }, { passive: true });

// toque / clique no mundo
const raycaster = new THREE.Raycaster();
const planoChao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pontoNoChao(cx, cy) {
  const ndc = new THREE.Vector2(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(planoChao, p) ? p : null;
}
const ponteiros = new Map(); let pinca = null;
canvas.addEventListener('pointerdown', (e) => {
  ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
  if (ponteiros.size === 2) {
    const [a, b] = [...ponteiros.values()]; pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!ponteiros.has(e.pointerId)) return;
  ponteiros.set(e.pointerId, { ...ponteiros.get(e.pointerId), x: e.clientX, y: e.clientY });
  if (pinca && ponteiros.size === 2) {
    const [a, b] = [...ponteiros.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoom = THREE.MathUtils.clamp(pinca.z * pinca.d / Math.max(d, 1), 12, 70); ajustarCamera();
  }
});
function soltarPonteiro(e) {
  const p = ponteiros.get(e.pointerId); ponteiros.delete(e.pointerId);
  if (pinca) { if (ponteiros.size === 0) pinca = null; return; }
  if (!p || !jogador.avatar || e.type === 'pointercancel') return;
  if (performance.now() - p.t > 450) return;      // segurou: não é toque
  const alvo = pontoNoChao(e.clientX, e.clientY); if (!alvo) return;
  if (jogador.armado && e.pointerType === 'mouse') atirar(alvo);
  else jogador.alvo = alvo;
}
canvas.addEventListener('pointerup', soltarPonteiro);
canvas.addEventListener('pointercancel', soltarPonteiro);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// joystick
function configurarJoystick() {
  const base = $('joy'), bola = base.querySelector('i');
  const raio = 52;
  const mover = (e) => {
    const r = base.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy); if (d > raio) { dx = dx / d * raio; dy = dy / d * raio; }
    joy.x = dx / raio; joy.y = -dy / raio;
    bola.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  base.addEventListener('pointerdown', (e) => { joy.ativo = true; joy.id = e.pointerId; base.setPointerCapture(e.pointerId); jogador.alvo = null; mover(e); });
  base.addEventListener('pointermove', (e) => { if (joy.ativo && e.pointerId === joy.id) mover(e); });
  const fim = (e) => { if (e.pointerId !== joy.id) return; joy.ativo = false; joy.x = joy.y = 0; bola.style.transform = ''; };
  base.addEventListener('pointerup', fim); base.addEventListener('pointercancel', fim);
  const toque = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
  toque('btAcao', acaoContexto); toque('btSoco', socar); toque('btArma', alternarArma);
  toque('btTiro', () => atirar(null)); toque('btGiraE', () => girarCamera(-1)); toque('btGiraD', () => girarCamera(1));
}

function girarCamera(s) { anguloCam += s; }

// ================================================================= AÇÕES
let avisoTimer = 0;
function aviso(txt, seg = 2.6) { const a = $('aviso'); a.textContent = txt; a.style.opacity = 1; avisoTimer = seg; }

function caixaProxima() {
  let melhor = null, dm = 1.6;
  for (const c of caixasSoltas) { const d = Math.hypot(c.position.x - jogador.pos.x, c.position.z - jogador.pos.z); if (d < dm) { dm = d; melhor = c; } }
  return melhor;
}
function pertoContratante() { return contratante && Math.hypot(contratante.x - jogador.pos.x, contratante.z - jogador.pos.z) < 3.4; }

function livre() {
  if (jogador.algemado) { aviso('Você está algemado.'); return false; }
  if (jogador.pena > 0) { aviso('Você está preso.'); return false; }
  return true;
}

function acaoContexto() {
  if (jogador.trava > 0 || !livre()) return;
  if (jogador.carregando?.userData.pedido) { acaoCaixaPedido(); return; }
  if (pertoContratante()) { abrirMissoes(); return; }
  if (pontoProximo(pontos.lojas, 3.2)) { abrirJanela('loja'); return; }
  if (jogador.carregando) {
    if (pontoProximo(pontos.docas, 3.4)) { entregar(); return; }
    pegarOuSoltar(null); return;
  }
  const c = caixaProxima();
  if (c) { if (jogador.armado) { aviso('Guarde a arma para carregar caixas.'); return; } pegarOuSoltar(c); return; }
  const b = pontoProximo(pontos.bancadas, 2.6);
  if (b) { if (jogador.armado) { aviso('Guarde a arma para trabalhar.'); return; } embalar(b); return; }
  const be = pontoProximo(pontos.bancadasEmp, 2.6);
  if (be) { if (jogador.armado) { aviso('Guarde a arma para trabalhar.'); return; } embalarFabrica(be); return; }
  const dep = pontoProximo(pontos.depositos, 3);
  if (dep) { retirarDoDeposito(dep); return; }
  const lt = pontoProximo(pontos.lotes, 4);
  if (lt) { abrirCompra(lt.lote); return; }
  if (pontoProximo(pontos.sucata, 4)) { if (jogador.armado) { aviso('Guarde a arma para trabalhar.'); return; } coletar(); }
}

// ---------------------------------------------------------------- trabalho (etapa 3)
let ocupado = false;     // evita chamar o banco duas vezes seguidas
function virarPara(x, z) { jogador.yaw = Math.atan2(x - jogador.pos.x, z - jogador.pos.z); }

async function embalar(bancada) {
  if (ocupado) return; ocupado = true;
  try {
    await rede.economia.iniciarEmbalagem(bancada.produto);
    virarPara(bancada.x, bancada.z); jogador.alvo = null;
    jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 0.6, fade: 0.15 });
    jogador.trava = 2.8;
    jogador.eventos.push({ t: 2.7, fn: () => {
      jogador.carregando = criarCaixa(bancada.produto);
      aviso(`Caixa de ${PRODUTOS[bancada.produto].nome.toLowerCase()} embalada! Leve até a doca da transportadora.`, 3.5);
    } });
  } catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}

async function entregar() {
  const caixa = jogador.carregando;
  if (!caixa.userData.tipo) { aviso('Essa caixa está vazia. Embale uma caixa na bancada de uma empresa.', 3.5); return; }
  if (ocupado) return; ocupado = true;
  try {
    const pago = await rede.economia.entregarPacote();
    jogador.carregando = null; scene.remove(caixa);
    aviso(`Entrega feita! +${pago} moedas`);
  } catch (e) { aviso(e.message, 3.5); }
  finally { ocupado = false; }
}

async function coletar() {
  if (ocupado) return; ocupado = true;
  try {
    const qtd = await rede.economia.coletarSucata();
    const p = pontoProximo(pontos.sucata, 4); if (p) virarPara(p.x, p.z);
    jogador.alvo = null;
    jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 1.5, fade: 0.15 });
    jogador.trava = 1.1;
    aviso(`+1 sucata (${qtd} na mochila)`);
    recarregarInventario();
  } catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}

function pegarOuSoltar(caixa) {
  const av = jogador.avatar; const dur = 1.7 / 1.5;
  jogador.alvo = null;
  if (caixa) jogador.yaw = Math.atan2(caixa.position.x - jogador.pos.x, caixa.position.z - jogador.pos.z);
  av.tocar('pegar', { umaVez: true, velocidade: 1.5, fade: 0.15 });
  jogador.trava = dur;
  jogador.eventos.push({ t: dur * 0.6, fn: () => {
    if (caixa) {
      const i = caixasSoltas.indexOf(caixa); if (i >= 0) caixasSoltas.splice(i, 1);
      jogador.carregando = caixa;
    } else if (jogador.carregando) {
      const c = jogador.carregando; jogador.carregando = null;
      const f = new THREE.Vector3(Math.sin(jogador.yaw), 0, Math.cos(jogador.yaw));
      c.position.set(jogador.pos.x + f.x * 0.75, alturaChao(jogador.pos.x + f.x * 0.75, jogador.pos.z + f.z * 0.75), jogador.pos.z + f.z * 0.75);
      c.rotation.set(0, jogador.yaw, 0); caixasSoltas.push(c);
    }
  } });
}

function socar() {
  if (jogador.trava > 0 || jogador.carregando || !livre()) return;
  jogador.alvo = null;
  jogador.soco = (jogador.soco + 1) % 2;
  jogador.avatar.tocar(jogador.soco ? 'punch_right' : 'punch_left', { umaVez: true, velocidade: 1.7, fade: 0.08 });
  jogador.trava = 0.72;
}

function alternarArma() {
  if (jogador.trava > 0) return;
  if (!jogador.armado && !livre()) return;
  if (jogador.carregando) { aviso('Solte a caixa antes de sacar a arma.'); return; }
  jogador.armado = !jogador.armado;
  jogador.arma.visible = jogador.armado;
  $('btTiro').classList.toggle('oculto', !jogador.armado);
  $('btArma').classList.toggle('ativo', jogador.armado);
  jogador.trava = 0.2;
}

// tiros de paintball
const bolas = []; const manchas = [];
const geoBola = new THREE.SphereGeometry(0.07, 10, 8);
const geoMancha = new THREE.CircleGeometry(0.35, 14);
const CORES_TINTA = ['#ff3e6c', '#35d07f', '#3ea8ff', '#ffd23e', '#b05cff', '#ff8a2a'];
function atirar(alvo) {
  if (!jogador.armado || jogador.trava > 0 || jogador.recarga > 0 || !livre()) return;
  jogador.alvo = null;
  if (alvo) jogador.yaw = Math.atan2(alvo.x - jogador.pos.x, alvo.z - jogador.pos.z);
  jogador.avatar.raiz.rotation.y = jogador.yaw;
  jogador.avatar.raiz.updateMatrixWorld(true);
  const boca = jogador.arma.localToWorld(new THREE.Vector3(0, 0.22, 0.3));
  const dir = new THREE.Vector3(Math.sin(jogador.yaw), 0, Math.cos(jogador.yaw));
  const cor = CORES_TINTA[Math.floor(Math.random() * CORES_TINTA.length)];
  const v = dir.multiplyScalar(24).add(new THREE.Vector3(0, 1.2, 0));
  criarBola(boca, v, cor);
  const r2 = (n) => Math.round(n * 100) / 100;
  conexao?.enviar('tiro', { x: r2(boca.x), y: r2(boca.y), z: r2(boca.z), vx: r2(v.x), vy: r2(v.y), vz: r2(v.z), c: cor });
  jogador.recarga = 0.28;
}
function criarBola(pos, vel, cor) {
  const m = new THREE.Mesh(geoBola, new THREE.MeshStandardMaterial({ color: cor, roughness: 0.3 }));
  m.position.copy(pos); scene.add(m);
  bolas.push({ m, v: vel.clone(), vida: 1.4, cor });
}
function manchar(p, normal, cor) {
  const m = new THREE.Mesh(geoMancha, new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.copy(p).addScaledVector(normal, 0.03); m.lookAt(p.clone().add(normal)); m.scale.setScalar(0.7 + Math.random() * 0.6);
  scene.add(m); manchas.push(m);
  if (manchas.length > 80) { const v = manchas.shift(); scene.remove(v); v.material.dispose(); }
}
function atualizarBolas(dt) {
  for (let i = bolas.length - 1; i >= 0; i--) {
    const b = bolas[i]; b.vida -= dt; b.v.y -= 9.8 * dt;
    const ant = b.m.position.clone(); b.m.position.addScaledVector(b.v, dt);
    let fim = false;
    for (const c of colisores) {
      if (c.tipo !== 'caixa') continue;
      const p = b.m.position;
      if (p.x > c.x0 - 0.2 && p.x < c.x1 + 0.2 && p.z > c.z0 - 0.2 && p.z < c.z1 + 0.2 && p.y < 7) {
        const n = Math.abs(ant.x - (c.x0 + c.x1) / 2) / (c.x1 - c.x0) > Math.abs(ant.z - (c.z0 + c.z1) / 2) / (c.z1 - c.z0)
          ? new THREE.Vector3(Math.sign(ant.x - (c.x0 + c.x1) / 2), 0, 0) : new THREE.Vector3(0, 0, Math.sign(ant.z - (c.z0 + c.z1) / 2));
        manchar(ant, n, b.cor); fim = true; break;
      }
    }
    const chao = alturaChao(b.m.position.x, b.m.position.z);
    if (!fim && (b.m.position.y <= chao + 0.02 || b.vida <= 0)) { manchar(new THREE.Vector3(b.m.position.x, chao + 0.01, b.m.position.z), new THREE.Vector3(0, 1, 0), b.cor); fim = true; }
    if (fim) { scene.remove(b.m); b.m.material.dispose(); bolas.splice(i, 1); }
  }
}

// ================================================================= NPCs E TRÂNSITO
const npcs = [];
async function criarNPCs(excluir) {
  const opcoes = PERSONAGENS.map(p => p.id).filter(id => id !== excluir).sort(() => Math.random() - 0.5).slice(0, 4);
  const quads = [[0, 1], [3, 2], [1, 0], [2, 3]];
  for (let k = 0; k < opcoes.length; k++) {
    try {
      const av = await criarAvatar('personagens', opcoes[k]);
      const [qx, qz] = quads[k]; const cx = quadC(qx), cz = quadC(qz), d = QB / 2 - 1.1;
      const rota = [[cx - d, cz - d], [cx + d, cz - d], [cx + d, cz + d], [cx - d, cz + d]];
      if (k % 2) rota.reverse();
      av.raiz.position.set(rota[0][0], 0.18, rota[0][1]);
      scene.add(av.raiz); av.tocar('walk', { velocidade: 0.85 });
      npcs.push({ av, rota, i: 1, vel: 1.5 });
    } catch (e) { console.warn('NPC não carregou', e); }
  }
}
function atualizarNPCs(dt) {
  for (const n of npcs) {
    const [tx, tz] = n.rota[n.i]; const p = n.av.raiz.position;
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.3) { n.i = (n.i + 1) % n.rota.length; continue; }
    p.x += dx / d * n.vel * dt; p.z += dz / d * n.vel * dt;
    n.av.raiz.rotation.y = suavizarAngulo(n.av.raiz.rotation.y, Math.atan2(dx, dz), dt * 6);
    n.av.mixer.update(dt);
  }
}

let caminhaoMovel = null;
function criarCaminhaoMovel() {
  const obj = clonar('caminhao'); scene.add(obj);
  const cantos = [[ruaC(1), ruaC(1)], [ruaC(3), ruaC(1)], [ruaC(3), ruaC(3)], [ruaC(1), ruaC(3)]];
  const faixa = 2.5, rota = [];
  for (let i = 0; i < 4; i++) {
    const a = cantos[i], b = cantos[(i + 1) % 4];
    const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]);
    const dirX = -dz * faixa, dirZ = dx * faixa;          // mão direita
    rota.push([a[0] + dirX + dx * 6, a[1] + dirZ + dz * 6], [b[0] + dirX - dx * 6, b[1] + dirZ - dz * 6]);
  }
  obj.position.set(rota[0][0], 0.02, rota[0][1]);
  caminhaoMovel = { obj, rota, i: 1, vel: 0 };
}
function atualizarCaminhao(dt) {
  const c = caminhaoMovel; if (!c) return;
  const [tx, tz] = c.rota[c.i]; const p = c.obj.position;
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 0.6) { c.i = (c.i + 1) % c.rota.length; return; }
  // para se o jogador estiver na frente
  const fx = Math.sin(c.obj.rotation.y), fz = Math.cos(c.obj.rotation.y);
  const jx = jogador.pos.x - p.x, jz = jogador.pos.z - p.z;
  const frente = jx * fx + jz * fz, lado = Math.abs(jx * fz - jz * fx);
  const bloqueado = frente > 0 && frente < 7 && lado < 2;
  const curva = c.i % 2 === 0;            // trecho de esquina
  const alvoVel = bloqueado ? 0 : (curva ? 3 : 8);
  c.vel += THREE.MathUtils.clamp(alvoVel - c.vel, -10 * dt, 3 * dt);
  c.obj.rotation.y = suavizarAngulo(c.obj.rotation.y, Math.atan2(dx, dz), dt * (curva ? 2.2 : 3));
  p.x += fx * c.vel * dt; p.z += fz * c.vel * dt;
}

function suavizarAngulo(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

// ================================================================= MINIMAPA
let fundoMapa = null;
const MAPA_ALCANCE = BASE_X + 30;
function mapaXY(x, z, w) { return [(x / MAPA_ALCANCE * 0.5 + 0.5) * w, (z / MAPA_ALCANCE * 0.5 + 0.5) * w]; }
function desenharFundoMapa() {
  const w = 300; fundoMapa = document.createElement('canvas'); fundoMapa.width = fundoMapa.height = w;
  const g = fundoMapa.getContext('2d');
  g.fillStyle = '#b8a27f'; g.fillRect(0, 0, w, w);
  const s = w / (MAPA_ALCANCE * 2);
  g.fillStyle = '#d8d1c3';
  const [ax, az] = mapaXY(-METADE, -METADE, w); g.fillRect(ax, az, TOTAL * s, TOTAL * s);
  g.fillStyle = '#4a4e57';
  for (let i = 0; i <= N; i++) {
    const [x0, z0] = mapaXY(-METADE, ruaC(i) - RW / 2, w); g.fillRect(x0, z0, TOTAL * s, RW * s);
    const [x1, z1] = mapaXY(ruaC(i) - RW / 2, -METADE, w); g.fillRect(x1, z1, RW * s, TOTAL * s);
  }
  const [px, pz] = mapaXY(quadC(1) - QB / 2 + CW, quadC(2) - QB / 2 + CW, w); g.fillStyle = '#7fa45a'; g.fillRect(px, pz, (QB - 2 * CW) * s, (QB - 2 * CW) * s);
  for (const it of itensMapa) {
    if (it.tipo === 'territorio') {
      const [x, z] = mapaXY(it.x, it.z, w); g.strokeStyle = it.x > 0 ? '#d24b4b' : '#4b7bd2'; g.lineWidth = 3; g.beginPath(); g.arc(x, z, it.r * s, 0, 7); g.stroke(); continue;
    }
    const [x0, z0] = mapaXY(it.x0, it.z0, w); g.fillStyle = CORES_MAPA[it.tipo] || '#888';
    g.fillRect(x0, z0, (it.x1 - it.x0) * s, (it.z1 - it.z0) * s);
  }
  if (contratante) { const [x, z] = mapaXY(contratante.x, contratante.z, w); g.fillStyle = '#ffd23e'; g.beginPath(); g.arc(x, z, 6, 0, 7); g.fill(); }
}
function desenharMapa() {
  const c = $('mapa'), g = c.getContext('2d'), w = c.width;
  g.drawImage(fundoMapa, 0, 0);
  const desenhar = (x, z, cor, r) => { const [mx, mz] = mapaXY(x, z, w); g.fillStyle = cor; g.beginPath(); g.arc(mx, mz, r, 0, 7); g.fill(); };
  for (const n of npcs) desenhar(n.av.raiz.position.x, n.av.raiz.position.z, '#ffffffaa', 3.5);
  for (const r of remotos.values()) if (r.av?.raiz.visible) desenhar(r.av.raiz.position.x, r.av.raiz.position.z, '#4fa3ff', 5);
  if (caminhaoMovel) desenhar(caminhaoMovel.obj.position.x, caminhaoMovel.obj.position.z, '#e39b3a', 5);
  const [mx, mz] = mapaXY(jogador.pos.x, jogador.pos.z, w);
  g.save(); g.translate(mx, mz); g.rotate(-jogador.yaw + Math.PI);
  g.fillStyle = '#5cc28a'; g.strokeStyle = '#0b1a10'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath(); g.fill(); g.stroke(); g.restore();
}

function nomeDaRua(x, z) {
  let h = null, v = null;
  for (let i = 0; i <= N; i++) {
    if (Math.abs(z - ruaC(i)) < RW / 2 + 2 && Math.abs(x) < METADE + 2) h = RUAS_HORIZONTAIS[i];
    if (Math.abs(x - ruaC(i)) < RW / 2 + 2 && Math.abs(z) < METADE + 2) v = RUAS_VERTICAIS[i];
  }
  if (h && v) return `Esquina da ${h} com ${v}`;
  if (h || v) return h || v;
  if (Math.abs(x) > METADE + 15) return x > 0 ? 'Território Leste' : 'Território Oeste';
  if (Math.abs(x) > METADE || Math.abs(z) > METADE) return 'Arredores da cidade';
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (Math.abs(x - quadC(i)) < QB / 2 && Math.abs(z - quadC(j)) < QB / 2) {
      return QUARTEIROES_ESPECIAIS[`${i},${j}`]?.parque ? 'Praça do Contratante' : `Calçada da ${RUAS_HORIZONTAIS[j + 1]}`;
    }
  }
  return '';
}

// ================================================================= INÍCIO
async function iniciarJogo(perfil) {
  const { nome, personagem: id } = perfil;
  jogador.perfil = perfil;
  $('carregando').classList.remove('oculto');
  montarChao();
  const carregamentos = MODELOS.map(async (m) => { modelos[m] = prepararEstatico((await carregarGLB(`assets/modelos/${m}.glb`)).scene); });
  const pastaJogador = ROBOS.includes(id) ? 'robos' : 'personagens';
  const avatarP = criarAvatar(pastaJogador, id);
  const roboP = criarAvatar('robos', 'Rusty_Scout_Bot');
  await Promise.all(carregamentos);
  montarQuarteiroes();
  montarPlacasRuas();
  criarCaminhaoMovel();

  // jogador
  const av = await avatarP;
  jogador.avatar = av; jogador.nome = nome;
  const arma = clonar('arma_paintball');
  av.encaixarArma(arma); arma.visible = false; jogador.arma = arma;
  jogador.pos.set(perfil.pos_x ?? 0, 0, perfil.pos_z ?? quadC(2));
  jogador.pena = perfil.pena_seg || 0;
  jogador.fome = typeof perfil.fome === 'number' ? perfil.fome : 100;
  if (jogador.pena > 0 && cadeia) jogador.pos.set(cadeia.x, 0, cadeia.z);
  resolverColisao(jogador.pos, jogador.raio);
  jogador.pos.y = alturaChao(jogador.pos.x, jogador.pos.z);
  jogador.yaw = Math.PI;
  alvoCam.set(jogador.pos.x, 0.9, jogador.pos.z);
  scene.add(av.raiz);
  jogador.etiqueta = textoSprite(nome, { escala: 0.8, cor: '#f2a33a' }); jogador.etiqueta.position.y = 2.15; av.raiz.add(jogador.etiqueta);
  av.tocar('idle');
  jogador.algemado = !!perfil.algemado; mostrarAlgemas(jogador.algemado);

  // Contratante (robô NPC na praça)
  const robo = await roboP;
  robo.raiz.position.set(contratante.x, 0.18, contratante.z + 2); robo.raiz.rotation.y = Math.PI / 4;
  scene.add(robo.raiz); robo.tocar('idle_long');
  const rotulo = textoSprite('Contratante', { escala: 0.9, cor: '#ffd23e' }); rotulo.position.y = 2.25; robo.raiz.add(rotulo);
  const excl = textoSprite('!', { escala: 1.6, cor: '#20160a', fundo: '#ffd23e' }); excl.position.y = 3.0; robo.raiz.add(excl);
  contratante.avatar = robo; contratante.excl = excl;
  colisores.push({ tipo: 'circ', x: contratante.x, z: contratante.z + 2, r: 0.5 });

  desenharFundoMapa();
  montarLocais();
  atualizarInfo();
  if (TOQUE) { $('toque').classList.remove('oculto'); configurarJoystick(); $('btTiro').classList.add('oculto'); }
  else { $('ajuda').innerHTML = CONTROLES_PC.map(([k, t]) => `<kbd>${k}</kbd> ${t}`).join('<br>'); $('ajuda').classList.remove('oculto'); }
  $('hud').classList.remove('oculto');
  $('carregando').classList.add('oculto');
  aviso(`Bem-vindo à cidade, ${nome}!`);
  criarNPCs(id);
  conectarMultiplayer(perfil);
  rede.escutarMeuPerfil(perfil.id, { perfil: aplicarPerfil, comando: aoComando, inventario: recarregarInventario });
  iniciarLoja({ perfil: () => jogador.perfil, fome: () => jogador.fome, definirFome: (f) => { jogador.fome = f; desenharFome(); } });
  iniciarEmpresa({ perfil: () => jogador.perfil, agora: agoraServidor, definirMinhaEmpresa: (id) => { minhaEmpresa = id; } });
  iniciarLogistica();
  iniciarPainel({
    perfil: () => jogador.perfil,
    online: () => [...remotos.entries()].map(([id, r]) => ({ id, nome: r.meta.nome })),
    posicaoDe: (id) => { const r = remotos.get(id); return r?.av?.raiz.visible ? r.av.raiz.position : (r?.alvo || null); },
    minhaPosicao: () => jogador.pos,
    teleportar,
    locais: () => LOCAIS,
  });
  if (perfil.cargo === 'moderador') rede.receberSalario().then((v) => { if (v > 0) aviso(`Salário de moderador: +${v} moedas`); }).catch(() => {});
  if (jogador.pena > 0) aviso(`Você está preso. Faltam ${formatarTempo(jogador.pena)}.`, 4);
  relogio.start();
  renderer.setAnimationLoop(quadro);
}

function atualizarInfo() {
  const p = jogador.perfil;
  const tags = (p.cargo !== 'jogador' ? `<i class="tagc ${p.cargo}">${p.cargo}</i>` : '') + (p.imortal ? '<i class="tagc imortal">imortal</i>' : '');
  $('info').innerHTML = `<b>${escapar(p.nome)}</b>${tags}<br>Moedas: ${p.moedas.toLocaleString('pt-BR')}<br>`
    + `Fome <span class="fome" id="barFome"><i></i></span><br>`
    + `<span class="online">● ${online} online</span>${conectado ? '' : ' <small>(conectando…)</small>'}<br><button id="btSair">Sair da conta</button>`;
  $('btSair').onclick = async () => { await salvarAgora(); await rede.sair(); location.reload(); };
  desenharFome();
}

// ================================================================= MULTIPLAYER
const remotos = new Map();     // id -> { meta, av, arma, alvo, anim, caixa }
let conexao = null, online = 1, conectado = false;
let envioTimer = 0, ultimoEnvio = null, tempoKeepAlive = 0, tempoSalvar = 15;
const ANIM_UMA_VEZ = { pegar: 1.5, punch_left: 1.7, punch_right: 1.7 };
const ANIM_VEL = { walk_shoot: 1.25 };

function conectarMultiplayer(perfil) {
  conexao = rede.conectarCidade(perfil, {
    conectado: (ok) => { conectado = ok; atualizarInfo(); if (ok) ultimoEnvio = null; },
    presenca: (lista) => {
      online = Object.keys(lista).length || 1;
      for (const [id, meta] of Object.entries(lista)) {
        if (id === perfil.id) continue;
        const r = remotos.get(id);
        if (r && (r.meta.personagem !== meta.personagem || r.meta.cargo !== meta.cargo || r.meta.nome !== meta.nome)) {
          const alvo = r.alvo; removerRemoto(id); adicionarRemoto(id, meta).then(() => { const n = remotos.get(id); if (n && alvo && !n.alvo) n.alvo = alvo; });
        } else if (!r) adicionarRemoto(id, meta);
      }
      for (const id of [...remotos.keys()]) if (!lista[id]) removerRemoto(id);
      atualizarInfo();
    },
    pos: (p) => { const r = remotos.get(p.id); if (r) r.alvo = p; },
    tiro: (t) => criarBola(new THREE.Vector3(t.x, t.y, t.z), new THREE.Vector3(t.vx, t.vy, t.vz), t.c),
  });
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvarAgora(); });
  window.addEventListener('pagehide', salvarAgora);
}

async function adicionarRemoto(id, meta) {
  const r = { meta, av: null, arma: null, alvo: null, anim: '', caixa: null };
  remotos.set(id, r);
  try {
    const pasta = ROBOS.includes(meta.personagem) ? 'robos' : 'personagens';
    const av = await criarAvatar(pasta, meta.personagem);
    if (remotos.get(id) !== r) return;          // saiu enquanto carregava
    const arma = clonar('arma_paintball'); av.encaixarArma(arma); arma.visible = false;
    const et = textoSprite(meta.nome, { escala: 0.8, cor: meta.cargo === 'admin' ? '#ff6b6b' : meta.cargo === 'moderador' ? '#7fb8ff' : '#ffffff' });
    et.position.y = 2.15; av.raiz.add(et);
    av.raiz.visible = false; scene.add(av.raiz); av.tocar('idle');
    r.av = av; r.arma = arma;
  } catch (e) { console.warn('jogador remoto não carregou', e); }
}

function removerRemoto(id) {
  const r = remotos.get(id); remotos.delete(id);
  if (!r) return;
  if (r.av) scene.remove(r.av.raiz);
  if (r.caixa) scene.remove(r.caixa);
  if (r.algemas) scene.remove(r.algemas);
}

function atualizarRemotos(dt) {
  for (const r of remotos.values()) {
    if (!r.av || !r.alvo) continue;
    const raiz = r.av.raiz, a = r.alvo;
    if (!raiz.visible || Math.hypot(a.x - raiz.position.x, a.z - raiz.position.z) > 8) { raiz.position.set(a.x, a.y, a.z); raiz.visible = true; }
    const k = Math.min(1, dt * 10);
    raiz.position.x += (a.x - raiz.position.x) * k; raiz.position.y += (a.y - raiz.position.y) * k; raiz.position.z += (a.z - raiz.position.z) * k;
    raiz.rotation.y = suavizarAngulo(raiz.rotation.y, a.r, dt * 12);
    if (a.a !== r.anim) {
      r.anim = a.a;
      const umaVez = a.a in ANIM_UMA_VEZ;
      r.av.tocar(a.a, { umaVez, velocidade: ANIM_UMA_VEZ[a.a] || ANIM_VEL[a.a] || 1, fade: umaVez ? 0.1 : 0.2 });
    }
    r.arma.visible = !!a.ar;
    if (r.caixa && codigoCaixa(r.caixa) !== (a.cx || 0)) { scene.remove(r.caixa); r.caixa = null; }
    if (a.cx && !r.caixa) r.caixa = criarCaixa(tipoDoCodigo(a.cx));
    r.av.mixer.update(dt);
    raiz.updateMatrixWorld(true);
    if (r.caixa) posicionarCaixa(r.av, r.caixa, raiz.rotation.y);
    if (a.al && !r.algemas) { r.algemas = clonar('algemas'); r.algemas.scale.setScalar(1.4); scene.add(r.algemas); }
    if (!a.al && r.algemas) { scene.remove(r.algemas); r.algemas = null; }
    if (r.algemas) posicionarAlgemas(r.av, r.algemas, raiz.rotation.y);
  }
}

function enviarEstado(dt) {
  if (!conexao || !conectado) return;
  envioTimer -= dt; tempoKeepAlive -= dt;
  if (envioTimer > 0) return;
  envioTimer = 0.15;
  const j = jogador, r2 = (v) => Math.round(v * 100) / 100;
  const est = { id: j.perfil.id, x: r2(j.pos.x), y: r2(j.pos.y), z: r2(j.pos.z), r: r2(j.yaw), a: j.avatar.nomeAtual || 'idle', ar: j.armado ? 1 : 0, cx: codigoCaixa(j.carregando), al: j.algemado ? 1 : 0 };
  const u = ultimoEnvio;
  const mudou = !u || Math.abs(u.x - est.x) > 0.03 || Math.abs(u.z - est.z) > 0.03 || Math.abs(u.r - est.r) > 0.05 || u.a !== est.a || u.ar !== est.ar || u.cx !== est.cx || u.al !== est.al;
  if (!mudou && tempoKeepAlive > 0) return;
  conexao.enviar('pos', est); ultimoEnvio = est; tempoKeepAlive = 3;
}

async function salvarAgora() {
  if (!jogador.perfil || !jogador.avatar) return;
  try { await rede.salvarPosicao(jogador.perfil.id, Math.round(jogador.pos.x * 10) / 10, Math.round(jogador.pos.z * 10) / 10, jogador.fome); } catch { /* tenta de novo depois */ }
}

// ================================================================= LOGÍSTICA (etapa 4)
const empresas = new Map();        // id -> linha da tabela empresas
const visuaisLote = new Map();     // lote -> { objs: [], predio }
const caminhoes = new Map();       // id -> { obj, d, rotaCache }
let minhaEmpresa = null;           // empresa onde trabalho
let offsetServidor = 0;            // ms entre o relógio do servidor e o do aparelho
const agoraServidor = () => Date.now() + offsetServidor;
const LOTE_L = (QB - CW * 2) / 2;  // 19 m

function centroLote(l) {
  const [cx, cz] = l.q.split(',').map(Number);
  const c = LOTE_L / 2, x = quadC(cx), z = quadC(cz);
  return { x: l.lote === 'SO' ? x - c : x + c, z: l.lote === 'NE' || l.lote === 'NO' ? z - c : z + c };
}

function limparLote(id) {
  const v = visuaisLote.get(id); if (!v) return;
  for (const o of v.objs) scene.remove(o);
  if (v.predio) {
    const i = predios.indexOf(v.predio); if (i >= 0) predios.splice(i, 1);
  }
  for (const c of v.colisores || []) { const i = colisores.indexOf(c); if (i >= 0) colisores.splice(i, 1); }
  for (const it of v.mapa || []) { const i = itensMapa.indexOf(it); if (i >= 0) itensMapa.splice(i, 1); }
  for (const k of ['lotes', 'bancadasEmp', 'depositos']) pontos[k] = pontos[k].filter((p) => p.lote !== id);
  visuaisLote.delete(id);
}

function desenharLote(l) {
  limparLote(l.id);
  const e = [...empresas.values()].find((x) => x.lote === l.id);
  const { x, z } = centroLote(l);
  const v = { objs: [], colisores: [], mapa: [] };
  visuaisLote.set(l.id, v);
  if (!e) {
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(LOTE_L - 1, LOTE_L - 1), new THREE.MeshStandardMaterial({ color: '#9b8766', roughness: 1 }));
    chao.rotation.x = -Math.PI / 2; chao.position.set(x, 0.19, z); chao.receiveShadow = true; scene.add(chao); v.objs.push(chao);
    const placa = textoSprite('Lote à venda · 20.000', { escala: 0.75, fundo: 'rgba(30,90,50,.9)' }); placa.position.set(x, 2.4, z + 6.5); scene.add(placa); v.objs.push(placa);
    pontos.lotes.push({ x, z: z + 7.5, lote: l.id });
    return;
  }
  const modelo = e.tipo === 'fabrica' ? 'empresa' : 'transportadora';
  const obj = colocarPredio(modelo, x, z, 0);
  const b0 = new THREE.Box3().setFromObject(obj);
  obj.position.z += (z + LOTE_L / 2 - 0.4) - b0.max.z; obj.updateMatrixWorld(true);
  // colocarPredio registrou colisor e mapa com a posição antiga: refaz
  const pr = predios[predios.length - 1];
  colisores.splice(colisores.length - 1, 1); itensMapa.splice(itensMapa.length - 1, 1);
  pr.caixa = addColisorCaixa(obj, 0.8);
  const it = { tipo: modelo, x0: pr.caixa.min.x, x1: pr.caixa.max.x, z0: pr.caixa.min.z, z1: pr.caixa.max.z };
  itensMapa.push(it);
  v.objs.push(obj); v.predio = pr; v.colisores.push(colisores[colisores.length - 1]); v.mapa.push(it);
  const nome = textoSprite(e.nome, { escala: 1, cor: '#ffd9a0', fundo: 'rgba(20,24,34,.85)' });
  nome.position.set(x, pr.caixa.max.y + 1.2, z); scene.add(nome); v.objs.push(nome);
  if (e.tipo === 'fabrica') {
    const bx = x - LOTE_L / 2 + 1.3, bz = z + 4;
    const banc = clonar('bancada'); banc.position.set(bx, 0.18, bz); scene.add(banc); banc.updateMatrixWorld(true);
    v.objs.push(banc); v.colisores.push(addColisorCaixa(banc, 0.1) && colisores[colisores.length - 1]);
    pontos.bancadasEmp.push({ x: bx, z: bz, empresa: e.id, lote: l.id });
    const est = textoSprite(`${PRODUTOS[e.produto].nome} · estoque ${e.estoque}`, { escala: 0.6, fundo: 'rgba(60,40,15,.85)', cor: '#ffd9a0' });
    est.position.set(bx, 2.4, bz); scene.add(est); v.objs.push(est);
    pontos.depositos.push({ x: l.portao.x, z: l.portao.z - 1.8, empresa: e.id, lote: l.id });
    const dep = textoSprite('Depósito', { escala: 0.55, fundo: 'rgba(120,80,10,.9)' }); dep.position.set(l.portao.x, 2.2, l.portao.z - 1.8); scene.add(dep); v.objs.push(dep);
  } else {
    const faixa = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), new THREE.MeshStandardMaterial({ color: '#e3b23c', roughness: 0.8, transparent: true, opacity: 0.85 }));
    faixa.rotation.x = -Math.PI / 2; faixa.position.set(l.portao.x, 0.19, l.portao.z - 1.6); scene.add(faixa); v.objs.push(faixa);
  }
}

function redesenharLotes() { for (const l of LOTES_VENDA) desenharLote(l); desenharFundoMapa(); }

// ---------------------------------------------------------------- caminhões dos jogadores
// rota pela grade de ruas: sai do ponto, entra na rua mais próxima, segue em L pelos cruzamentos
function rotaGrade(a, b) {
  const R = []; for (let i = 0; i <= N; i++) R.push(ruaC(i));
  const prox = (v) => R.reduce((m, r) => (Math.abs(r - v) < Math.abs(m - v) ? r : m), R[0]);
  const entrar = (p) => {
    const rz = prox(p.z), rx = prox(p.x);
    return Math.abs(p.z - rz) <= Math.abs(p.x - rx)
      ? { x: THREE.MathUtils.clamp(p.x, -METADE, METADE), z: rz, h: true }
      : { x: rx, z: THREE.MathUtils.clamp(p.z, -METADE, METADE), h: false };
  };
  const ea = entrar(a), eb = entrar(b);
  let meio;
  if (ea.h && eb.h) meio = ea.z === eb.z ? [] : (() => { const x = prox((ea.x + eb.x) / 2); return [{ x, z: ea.z }, { x, z: eb.z }]; })();
  else if (!ea.h && !eb.h) meio = ea.x === eb.x ? [] : (() => { const z = prox((ea.z + eb.z) / 2); return [{ x: ea.x, z }, { x: eb.x, z }]; })();
  else if (ea.h) meio = [{ x: eb.x, z: ea.z }];
  else meio = [{ x: ea.x, z: eb.z }];
  const out = [];
  for (const p of [a, ea, ...meio, eb, b]) { const u = out[out.length - 1]; if (!u || Math.hypot(u.x - p.x, u.z - p.z) > 0.05) out.push({ x: p.x, z: p.z }); }
  // mão direita: desloca o caminho 2,4 m para a direita (com esquinas em meia-esquadria)
  const W = 2.4;
  const normal = (p, q) => { const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz) || 1; return { x: -dz / d, z: dx / d }; };
  return out.map((p, i) => {
    const nIn = i > 0 ? normal(out[i - 1], p) : null, nOut = i < out.length - 1 ? normal(p, out[i + 1]) : null;
    const n1 = nIn || nOut, n2 = nOut || nIn;
    let mx = n1.x + n2.x, mz = n1.z + n2.z; const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) return { x: p.x + n1.x * W, z: p.z + n1.z * W };
    mx /= ml; mz /= ml;
    const k = W / Math.max(0.5, mx * n1.x + mz * n1.z);
    return { x: p.x + mx * k, z: p.z + mz * k };
  });
}
function ponto(pts, f) {
  let total = 0; const seg = [];
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z); seg.push(l); total += l; }
  let alvo = THREE.MathUtils.clamp(f, 0, 1) * total;
  for (let i = 0; i < seg.length; i++) {
    if (alvo <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? Math.min(1, alvo / seg[i]) : 1;
      const a = pts[i], b = pts[i + 1];
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, ang: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    alvo -= seg[i];
  }
  const u = pts[pts.length - 1]; return { x: u.x, z: u.z, ang: 0 };
}
function pernas(c) {
  const r = c.d.rota; if (!r) return null;
  if (c.rotaCache?.id === c.d.partida) return c.rotaCache.pernas;
  const T = { x: r.t[0], z: r.t[1] }, F = { x: r.f[0], z: r.f[1] }, D = { x: r.d[0], z: r.d[1] };
  const p = [
    { pts: rotaGrade(T, F), dur: r.d1 }, { parado: true, dur: r.carga },
    { pts: rotaGrade(F, D), dur: r.d2 }, { parado: true, dur: r.descarga },
    { pts: rotaGrade(D, T), dur: r.d3 },
  ];
  c.rotaCache = { id: c.d.partida, pernas: p };
  return p;
}
function posicaoEstacionado(c) {
  const e = empresas.get(c.d.empresa); const l = e && LOTES_VENDA.find((x) => x.id === e.lote); if (!l) return null;
  const meus = [...caminhoes.values()].filter((k) => k.d.empresa === c.d.empresa && k.d.status === 'parado').map((k) => k.d.id).sort((a, b) => a - b);
  const i = Math.max(0, meus.indexOf(c.d.id));
  return { x: l.portao.x - 6 + i * 7.5, z: l.portao.z + 2.6, ang: Math.PI / 2 };
}
function sincronizarCaminhao(d) {
  let c = caminhoes.get(d.id);
  if (!c) { const obj = clonar('caminhao'); scene.add(obj); c = { obj, d }; caminhoes.set(d.id, c); }
  c.d = d;
}
let ultimoProcessar = 0;
function atualizarCaminhoes(dt) {
  const agora = agoraServidor();
  let atrasado = false;
  for (const c of caminhoes.values()) {
    let alvo = null;
    if (c.d.status !== 'parado' && c.d.partida) {
      const p = pernas(c);
      let t = (agora - Date.parse(c.d.partida)) / 1000, anterior = null;
      for (const perna of p || []) {
        if (t <= perna.dur) {
          if (perna.parado) { const u = anterior.pts; alvo = { ...ponto(u, 1), parado: true }; }
          else alvo = ponto(perna.pts, t / perna.dur);
          break;
        }
        if (!perna.parado) anterior = perna;
        t -= perna.dur;
      }
      if (!alvo && p) { const u = p[p.length - 1].pts; alvo = { ...u[u.length - 1], ang: c.obj.rotation.y }; }
      if ((c.d.status === 'em_rota' && agora > Date.parse(c.d.chegada) + 1500) || (c.d.status === 'voltando' && agora > Date.parse(c.d.retorno) + 1500)) atrasado = true;
    }
    if (!alvo) alvo = posicaoEstacionado(c);
    if (!alvo) continue;
    if (!c.posicionado) { c.obj.position.set(alvo.x, 0.02, alvo.z); c.obj.rotation.y = alvo.ang || 0; c.posicionado = true; }
    c.obj.position.x += (alvo.x - c.obj.position.x) * Math.min(1, dt * 8);
    c.obj.position.z += (alvo.z - c.obj.position.z) * Math.min(1, dt * 8);
    if (alvo.ang !== undefined) c.obj.rotation.y = suavizarAngulo(c.obj.rotation.y, alvo.ang, dt * 6);
  }
  // viagens vencidas: pede ao banco para concluir (qualquer jogador pode; o banco decide)
  if (atrasado && performance.now() - ultimoProcessar > 8000) {
    ultimoProcessar = performance.now();
    rede.logistica.processar().catch(() => {});
  }
}

async function iniciarLogistica() {
  try {
    const t0 = Date.now(); const srv = await rede.logistica.agora(); const t1 = Date.now();
    offsetServidor = Date.parse(srv) - (t0 + t1) / 2;
  } catch { offsetServidor = 0; }
  try {
    const [lista, frota, minha] = await Promise.all([rede.listarEmpresas(), rede.listarCaminhoes(), rede.minhaEmpresaId(jogador.perfil.id)]);
    for (const e of lista) empresas.set(e.id, e);
    for (const c of frota) sincronizarCaminhao(c);
    minhaEmpresa = minha;
  } catch (e) { console.warn('logística', e); }
  redesenharLotes();
  rede.escutarLogistica({
    empresa: ({ eventType, new: n }) => {
      if (eventType === 'DELETE') return;
      const antes = empresas.get(n.id);
      empresas.set(n.id, { ...antes, ...n });
      if (!antes || antes.estoque !== n.estoque || antes.nome !== n.nome) {
        const l = LOTES_VENDA.find((x) => x.id === n.lote); if (l) { desenharLote(l); if (!antes) desenharFundoMapa(); }
      }
      atualizarJanelaEmpresa();
    },
    caminhao: ({ eventType, new: n, old: o }) => {
      if (eventType === 'DELETE') { const c = caminhoes.get(o.id); if (c) { scene.remove(c.obj); caminhoes.delete(o.id); } return; }
      sincronizarCaminhao(n);
    },
    membro: ({ eventType, new: n, old: o }) => {
      if (eventType === 'DELETE' && o.jogador === jogador.perfil.id) minhaEmpresa = null;
      else if (n?.jogador === jogador.perfil.id) minhaEmpresa = n.empresa;
      atualizarJanelaEmpresa();
    },
    pedido: () => atualizarJanelaEmpresa(),
  });
}

// ---------------------------------------------------------------- tarefas das empresas dos jogadores
async function embalarFabrica(b) {
  if (minhaEmpresa !== b.empresa) { aviso(`Bancada da ${empresas.get(b.empresa)?.nome || 'empresa'}. Peça emprego ao dono para trabalhar aqui.`, 3.5); return; }
  if (ocupado) return; ocupado = true;
  try {
    const pago = await rede.logistica.embalar();
    virarPara(b.x, b.z); jogador.alvo = null;
    jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 0.6, fade: 0.15 });
    jogador.trava = 2.8;
    jogador.eventos.push({ t: 2.7, fn: () => aviso(pago > 0 ? `Caixa no estoque! +${pago} moedas` : 'Caixa embalada e guardada no estoque.') });
  } catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}

async function retirarDoDeposito(dep) {
  if (ocupado) return; ocupado = true;
  try {
    const minha = empresas.get(minhaEmpresa);
    if (!minha || minha.tipo !== 'transportadora') { aviso('Só funcionários de transportadora retiram cargas aqui.'); return; }
    const aceitos = await rede.pedidosAceitosDe(minha.id);
    const pd = aceitos.find((p) => p.fabrica === dep.empresa && p.qtd - p.entregues - p.em_transito > 0);
    if (!pd) { aviso('Sua transportadora não tem pedido aceito desta fábrica.', 3.5); return; }
    const produto = await rede.logistica.retirar(pd.id);
    virarPara(dep.x, dep.z); jogador.alvo = null;
    jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 1.5, fade: 0.15 });
    jogador.trava = 1.1;
    jogador.eventos.push({ t: 0.7, fn: () => {
      const cx = criarCaixa(produto); cx.userData.pedido = { id: pd.id, destino: pd.destino };
      jogador.carregando = cx;
      aviso(`Leve a caixa até: ${DESTINOS[pd.destino]?.nome || pd.destino}.`, 4);
    } });
  } catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}

function pertoDestino(dest) {
  const d = DESTINOS[dest]; if (!d) return false;
  if (dest === 'loja') return Math.hypot(d.x - jogador.pos.x, d.z - jogador.pos.z) < 6 || !!pontoProximo(pontos.lojas.filter((l) => Math.hypot(l.x - d.x, l.z - d.z) < 8), 3.5);
  return Math.hypot(d.x - jogador.pos.x, d.z - jogador.pos.z) < 6 || pertoContratante();
}

let confirmaDesistir = 0;
async function acaoCaixaPedido() {
  const cx = jogador.carregando, pd = cx.userData.pedido;
  if (pertoDestino(pd.destino)) {
    if (ocupado) return; ocupado = true;
    try {
      const pago = await rede.logistica.entregar();
      jogador.carregando = null; scene.remove(cx);
      aviso(pago > 0 ? `Carga entregue! +${pago} moedas` : 'Carga entregue!');
    } catch (e) { aviso(e.message, 3.5); }
    finally { ocupado = false; }
    return;
  }
  if (performance.now() - confirmaDesistir < 3000) {
    confirmaDesistir = 0;
    try { await rede.logistica.desistir(); } catch { /* volta sozinha em 10 min */ }
    jogador.carregando = null; scene.remove(cx);
    aviso('Você largou a carga; ela voltou para o pedido.');
    return;
  }
  confirmaDesistir = performance.now();
  aviso(`Leve até: ${DESTINOS[pd.destino]?.nome}. Aperte de novo para largar a carga.`, 3);
}

// ================================================================= MUDANÇAS VINDAS DO BANCO
const LOCAIS = [];
function montarLocais() {
  LOCAIS.length = 0;
  if (contratante) LOCAIS.push({ nome: 'Praça do Contratante', x: contratante.x + 5, z: contratante.z + 5 });
  if (cadeia) LOCAIS.push({ nome: 'Delegacia', x: cadeia.x + 4, z: cadeia.z + 4 });
  LOCAIS.push({ nome: 'Transportadora', x: quadC(2) + 9, z: ruaC(2) + 2.5 });
  LOCAIS.push({ nome: 'Avenida Central', x: 0, z: ruaC(2) });
  if (pontos.lojas[0]) LOCAIS.push({ nome: 'Loja', x: pontos.lojas[0].x, z: pontos.lojas[0].z + 1.5 });
  if (pontos.sucata[0]) LOCAIS.push({ nome: 'Ferro-velho', x: pontos.sucata[0].x + 3.5, z: pontos.sucata[0].z + 3.5 });
  if (pontos.bancadas[0]) LOCAIS.push({ nome: 'Bancada (chocolate)', x: pontos.bancadas[0].x, z: pontos.bancadas[0].z + 2.5 });
  LOCAIS.push({ nome: 'Base Leste', x: BASE_X - 26, z: ruaC(2) });
  LOCAIS.push({ nome: 'Base Oeste', x: -BASE_X + 26, z: ruaC(2) });
}

function teleportar(x, z) {
  if (jogador.pena > 0 && cadeia) { x = cadeia.x; z = cadeia.z; }
  jogador.pos.set(x, alturaChao(x, z), z);
  resolverColisao(jogador.pos, jogador.raio);
  jogador.alvo = null;
  alvoCam.set(jogador.pos.x, 0.9, jogador.pos.z);
  ultimoEnvio = null;
}

function aoComando(c) {
  if (c.tipo === 'teleporte' && c.dados) { teleportar(Number(c.dados.x), Number(c.dados.z)); aviso('Você foi teleportado pela equipe.'); }
  if (c.tipo === 'aviso' && c.dados?.texto) { aviso(c.dados.texto, 5); atualizarJanelaEmpresa(); }
}

function solto() {
  jogador.pena = 0;
  aviso('Você cumpriu a pena e está livre.');
  if (cadeia) teleportar(cadeia.x + 4.5, cadeia.z);
}

let trocandoAvatar = false;
async function trocarAvatar(personagem) {
  if (trocandoAvatar) return; trocandoAvatar = true;
  try {
    const novo = await criarAvatar(ROBOS.includes(personagem) ? 'robos' : 'personagens', personagem);
    const arma = clonar('arma_paintball'); novo.encaixarArma(arma); arma.visible = jogador.armado;
    const velho = jogador.avatar;
    scene.remove(velho.raiz); velho.raiz.remove(jogador.etiqueta);
    novo.raiz.add(jogador.etiqueta);
    novo.raiz.position.copy(jogador.pos); novo.raiz.rotation.y = jogador.yaw;
    scene.add(novo.raiz); novo.tocar('idle');
    jogador.avatar = novo; jogador.arma = arma;
  } finally { trocandoAvatar = false; }
}

function aplicarPerfil(novo) {
  const antigo = jogador.perfil;
  jogador.perfil = { ...antigo, ...novo };
  if (novo.banido) {
    renderer.setAnimationLoop(null); conexao?.fechar();
    $('bloqueio').textContent = 'Você foi banido.' + (novo.banido_motivo ? ' Motivo: ' + novo.banido_motivo : '');
    $('bloqueio').classList.remove('oculto');
    setTimeout(async () => { await rede.sair(); location.reload(); }, 5000);
    return;
  }
  if (novo.personagem !== antigo.personagem) trocarAvatar(novo.personagem);
  if (novo.personagem !== antigo.personagem || novo.cargo !== antigo.cargo || novo.nome !== antigo.nome) {
    conexao?.rastrear({ nome: novo.nome, personagem: novo.personagem, cargo: novo.cargo });
  }
  if (novo.algemado !== antigo.algemado) {
    jogador.algemado = novo.algemado; mostrarAlgemas(novo.algemado);
    if (novo.algemado) {
      if (jogador.armado) alternarArmaForcado(false);
      aviso('Você foi algemado.');
    } else aviso('As algemas foram retiradas.');
  }
  if (novo.pena_seg > 0 && !(antigo.pena_seg > 0)) {
    jogador.pena = novo.pena_seg; jogador.sincPena = 10;
    if (jogador.armado) alternarArmaForcado(false);
    if (cadeia) teleportar(cadeia.x, cadeia.z);
    aviso(`Você foi preso por ${formatarTempo(novo.pena_seg)}.`, 4);
  } else if (!(novo.pena_seg > 0) && jogador.pena > 0) solto();
  if (typeof novo.fome === 'number' && novo.fome > jogador.fome + 1) { jogador.fome = novo.fome; desenharFome(); }
  if (novo.moedas !== antigo.moedas) {
    const dif = novo.moedas - antigo.moedas;
    aviso(`${dif > 0 ? '+' : ''}${dif.toLocaleString('pt-BR')} moedas`);
  }
  atualizarInfo(); atualizarBotao();
}
function alternarArmaForcado(ligado) {
  jogador.armado = ligado; jogador.arma.visible = ligado;
  $('btTiro').classList.toggle('oculto', !ligado || !TOQUE); $('btArma').classList.toggle('ativo', ligado);
}
function formatarTempo(seg) { seg = Math.ceil(seg); return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`; }

function escapar(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ================================================================= LAÇO PRINCIPAL
const relogio = new THREE.Clock();
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
let tempoMapa = 0;

function atualizarJogador(dt) {
  const j = jogador, av = j.avatar;
  for (let i = j.eventos.length - 1; i >= 0; i--) { j.eventos[i].t -= dt; if (j.eventos[i].t <= 0) { j.eventos[i].fn(); j.eventos.splice(i, 1); } }
  j.recarga = Math.max(0, j.recarga - dt);

  // direção de entrada relativa à câmera
  const off = offsetCamera(anguloCamSuave);
  const frente = new THREE.Vector3(-off.x, 0, -off.z).normalize();
  const direita = new THREE.Vector3(-frente.z, 0, frente.x);
  let ix = 0, iy = 0;
  if (teclas.has('w') || teclas.has('arrowup')) iy += 1;
  if (teclas.has('s') || teclas.has('arrowdown')) iy -= 1;
  if (teclas.has('d') || teclas.has('arrowright')) ix += 1;
  if (teclas.has('a') || teclas.has('arrowleft')) ix -= 1;
  if (joy.ativo) { ix = joy.x; iy = joy.y; }
  if (j.algemado) { ix = 0; iy = 0; j.alvo = null; }
  const dir = new THREE.Vector3().addScaledVector(direita, ix).addScaledVector(frente, iy);
  let forca = Math.min(1, dir.length());
  if (forca > 0.01) { dir.normalize(); j.alvo = null; }
  else if (j.alvo) {
    dir.set(j.alvo.x - j.pos.x, 0, j.alvo.z - j.pos.z);
    const d = dir.length();
    if (d < 0.25) { j.alvo = null; forca = 0; } else { dir.normalize(); forca = 1; }
  }
  const correr = !j.carregando && !j.armado && (teclas.has('shift') || (joy.ativo && forca > 0.92) || (j.alvo && j.pos.distanceTo(j.alvo) > 12));

  if (j.trava > 0) {
    j.trava -= dt;
  } else {
    let vel = 0;
    if (forca > 0.15) {
      vel = j.carregando ? VELOCIDADE.carregando : j.armado ? VELOCIDADE.armado : correr ? VELOCIDADE.correr : VELOCIDADE.andar;
      if (joy.ativo && !correr) vel *= THREE.MathUtils.clamp(forca * 1.3, 0.5, 1);
      if (j.fome <= 0) vel *= 0.6;
      j.yaw = suavizarAngulo(j.yaw, Math.atan2(dir.x, dir.z), dt * 12);
      j.pos.x += dir.x * vel * dt; j.pos.z += dir.z * vel * dt;
      resolverColisao(j.pos, j.raio);
    }
    // animação conforme o estado
    if (vel > 0) {
      if (j.carregando) av.tocar('carry_walk', { velocidade: 1 });
      else if (j.armado) av.tocar('walk_shoot', { velocidade: 1.25 });
      else if (correr) av.tocar('run', { velocidade: 1 });
      else av.tocar('walk', { velocidade: vel / VELOCIDADE.andar });
    } else {
      if (j.carregando || j.algemado) av.tocar('carregar_parado');
      else if (j.armado) av.tocar('mirar');
      else av.tocar('idle');
    }
  }
  resolverColisao(j.pos, j.raio);
  if (j.pena > 0 && cadeia) {
    const dx = j.pos.x - cadeia.x, dz = j.pos.z - cadeia.z, d = Math.hypot(dx, dz);
    if (d > RAIO_CADEIA) { j.pos.x = cadeia.x + dx / d * RAIO_CADEIA; j.pos.z = cadeia.z + dz / d * RAIO_CADEIA; }
    j.pena = Math.max(0, j.pena - dt);
    j.sincPena -= dt;
    if (j.sincPena <= 0) {
      j.sincPena = 10;
      rede.cumprirPena().then((r) => { if (typeof r === 'number') { j.pena = r; if (r <= 0) solto(); } }).catch(() => {});
    }
  }
  j.pos.y = THREE.MathUtils.lerp(j.pos.y, alturaChao(j.pos.x, j.pos.z), Math.min(1, dt * 12));
  av.raiz.position.copy(j.pos);
  av.raiz.rotation.y = j.yaw;
  av.mixer.update(dt);
  av.raiz.updateMatrixWorld(true);

  // caixa entre as mãos
  if (j.carregando) posicionarCaixa(av, j.carregando, j.yaw);
  if (j.algemas) posicionarAlgemas(av, j.algemas, j.yaw);
}

function posicionarAlgemas(av, obj, yaw) {
  tmpA.setFromMatrixPosition(av.maoD.matrixWorld); tmpB.setFromMatrixPosition(av.maoE.matrixWorld);
  obj.position.copy(tmpA.add(tmpB).multiplyScalar(0.5)); obj.position.y -= 0.02;
  obj.rotation.set(0, yaw + Math.PI / 2, 0);
}
function mostrarAlgemas(ligado) {
  if (ligado && !jogador.algemas) { jogador.algemas = clonar('algemas'); jogador.algemas.scale.setScalar(1.4); scene.add(jogador.algemas); }
  if (!ligado && jogador.algemas) { scene.remove(jogador.algemas); jogador.algemas = null; }
}

function posicionarCaixa(av, caixa, yaw) {
  tmpA.setFromMatrixPosition(av.maoD.matrixWorld); tmpB.setFromMatrixPosition(av.maoE.matrixWorld);
  const meio = tmpA.add(tmpB).multiplyScalar(0.5);
  caixa.position.set(meio.x + Math.sin(yaw) * 0.06, meio.y - 0.15, meio.z + Math.cos(yaw) * 0.06);
  caixa.rotation.set(0, yaw, 0);
}

function atualizarCamera(dt) {
  anguloCamSuave += (anguloCam - anguloCamSuave) * Math.min(1, dt * 8);
  alvoCam.lerp(new THREE.Vector3(jogador.pos.x, 0.9, jogador.pos.z), Math.min(1, dt * 6));
  const off = offsetCamera(anguloCamSuave);
  camera.position.copy(alvoCam).addScaledVector(off, 150);
  camera.lookAt(alvoCam);
  sol.position.copy(alvoCam).addScaledVector(SOL_DIR, 80);
  sol.target.position.copy(alvoCam);
  // prédios na frente do jogador ficam transparentes
  const origem = camera.position.clone();
  const cabeca = new THREE.Vector3(jogador.pos.x, jogador.pos.y + 1.2, jogador.pos.z);
  const ray = new THREE.Ray(origem, cabeca.clone().sub(origem).normalize());
  const dist = origem.distanceTo(cabeca);
  const hit = new THREE.Vector3();
  for (const p of predios) {
    const tapa = ray.intersectBox(p.caixa, hit) && origem.distanceTo(hit) < dist - 0.5;
    const alvo = tapa ? 0.3 : 1;
    if (Math.abs(p.opac - alvo) > 0.01) {
      p.opac += (alvo - p.opac) * Math.min(1, dt * 8);
      for (const m of p.mats) { m.transparent = p.opac < 0.99; m.opacity = p.opac; m.depthWrite = p.opac > 0.99; }
    }
  }
}

function atualizarHUD(dt) {
  tempoMapa -= dt;
  if (tempoMapa <= 0) { tempoMapa = 0.1; desenharMapa(); $('rua').textContent = nomeDaRua(jogador.pos.x, jogador.pos.z) || '—'; }
  const [dica, botao] = contexto();
  const el = $('dica'); el.textContent = dica ? `E: ${dica}` : ''; el.classList.toggle('oculto', !dica || TOQUE);
  if (TOQUE) { $('btAcao').textContent = botao || 'Pegar'; $('btAcao').classList.toggle('ativo', !!dica); }
  atualizarFome(dt);
  const bl = $('bloqueio');
  if (jogador.perfil?.banido) { /* mensagem já exibida */ }
  else if (jogador.pena > 0) { bl.textContent = `Preso: ${formatarTempo(jogador.pena)}`; bl.classList.remove('oculto'); }
  else if (jogador.algemado) { bl.textContent = 'Algemado'; bl.classList.remove('oculto'); }
  else bl.classList.add('oculto');
  if (avisoTimer > 0) { avisoTimer -= dt; if (avisoTimer <= 0) $('aviso').style.opacity = 0; }
  atualizarPlacas();
  if (contratante?.excl) contratante.excl.position.y = 3.0 + Math.sin(performance.now() / 300) * 0.12;
}

// texto da dica e do botão de ação conforme o que está perto
function contexto() {
  const pd = jogador.carregando?.userData.pedido;
  if (pd) return pertoDestino(pd.destino) ? ['entregar a carga', 'Entregar'] : [`levar a carga até: ${DESTINOS[pd.destino]?.nome}`, 'Largar'];
  if (pertoContratante()) return ['ver missões do Contratante', 'Falar'];
  if (pontoProximo(pontos.lojas, 3.2)) return ['abrir a loja', 'Loja'];
  if (jogador.carregando) {
    if (pontoProximo(pontos.docas, 3.4)) return jogador.carregando.userData.tipo ? ['entregar a caixa', 'Entregar'] : ['caixa vazia: embale na bancada', 'Soltar'];
    return ['soltar a caixa', 'Soltar'];
  }
  if (jogador.armado) return ['', ''];
  if (caixaProxima()) return ['pegar a caixa', 'Pegar'];
  const b = pontoProximo(pontos.bancadas, 2.6);
  if (b) return [`embalar ${PRODUTOS[b.produto].nome.toLowerCase()}`, 'Embalar'];
  if (pontoProximo(pontos.sucata, 4)) return ['coletar sucata', 'Coletar'];
  const be = pontoProximo(pontos.bancadasEmp, 2.6);
  if (be) return [`embalar na ${empresas.get(be.empresa)?.nome || 'fábrica'}`, 'Embalar'];
  const dep = pontoProximo(pontos.depositos, 3);
  if (dep) return [`retirar carga da ${empresas.get(dep.empresa)?.nome || 'fábrica'}`, 'Retirar'];
  if (pontoProximo(pontos.lotes, 4)) return ['comprar este lote', 'Comprar'];
  return ['', ''];
}

// ---------------------------------------------------------------- fome
let avisoFome = false;
function atualizarFome(dt) {
  jogador.fome = Math.max(0, jogador.fome - FOME_POR_SEGUNDO * dt);
  if (jogador.fome <= 0 && !avisoFome) { avisoFome = true; aviso('Você está com fome e mais lento. Coma algo da mochila.', 4); }
  if (jogador.fome > 5) avisoFome = false;
  tempoInfo -= dt; if (tempoInfo <= 0) { tempoInfo = 1; desenharFome(); }
}
let tempoInfo = 1;
function desenharFome() {
  const b = $('barFome'); if (!b) return;
  b.firstChild.style.width = jogador.fome.toFixed(0) + '%';
  b.classList.toggle('vazia', jogador.fome < 15);
  b.title = `Fome ${Math.round(jogador.fome)}%`;
}

function quadro() {
  const dt = Math.min(relogio.getDelta(), 0.05);
  atualizarJogador(dt);
  atualizarCaminhao(dt);
  atualizarCaminhoes(dt);
  atualizarNPCs(dt);
  atualizarRemotos(dt);
  enviarEstado(dt);
  tempoSalvar -= dt; if (tempoSalvar <= 0) { tempoSalvar = 15; salvarAgora(); }
  if (contratante?.avatar) contratante.avatar.mixer.update(dt);
  atualizarBolas(dt);
  atualizarCamera(dt);
  atualizarHUD(dt);
  renderer.render(scene, camera);
}
