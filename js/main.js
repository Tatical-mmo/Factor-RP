import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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
    v.rotation.x = -Math.PI / 2; v.position.set(ruaC(i), 0.021, 0); v.receiveShadow = true; scene.add(v);
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
  instancias(new THREE.PlaneGeometry(0.22, 2.2), tinta, tracos, 0.03);
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
  instancias(new THREE.PlaneGeometry(1, 1), tinta, zebra, 0.031);

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
    for (const [dx, dz, sx, sz] of [[QB / 2 - 0.15, 0, 0.3, QB], [-(QB / 2 - 0.15), 0, 0.3, QB], [0, QB / 2 - 0.15, QB, 0.3], [0, -(QB / 2 - 0.15), QB, 0.3]]) {
      m.compose(new THREE.Vector3(x + dx, 0.1, z + dz), new THREE.Quaternion(), new THREE.Vector3(sx, 0.21, sz)); meioFio.setMatrixAt(k++, m);
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

const CORES_MAPA = { delegacia: '#4f7bd8', loja: '#e05a4f', empresa: '#9aa0a8', transportadora: '#e39b3a', casa: '#8c5a3c', base_cla: '#c43b3b' };

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
    // centro de cada lote
    const c = L / 2;
    const lote = { SO: [x - c, z + c], SE: [x + c, z + c], NE: [x + c, z - c], NO: [x - c, z - c] };
    for (const q of ['SO', 'SE', 'NE', 'NO']) {
      const tipo = lotes[q]; const [lx, lz] = lote[q];
      if (tipo === 'arvores') { colocarArvore(lx - 4 + rng() * 2, lz - 3 + rng() * 2); colocarArvore(lx + 4 - rng() * 2, lz + 3 - rng() * 2, 0.9); continue; }
      if (tipo === 'patio_caixas') {
        const b = clonar('bancada'); b.position.set(lx, 0.18, lz); b.rotation.y = Math.PI / 2; scene.add(b); b.updateMatrixWorld(true); addColisorCaixa(b, 0.1);
        for (let k = 0; k < 5; k++) colocarCaixa(lx - 5 + k * 2.4, lz + 4.5 + (k % 2) * 1.2, rng());
        continue;
      }
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
  colocarVeiculo('caminhao_danificado', BASE_X - 14, ruaC(2) + 12, 0.6);
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
  if (clipes.carry_walk) clipes.carregar_parado = sub(clipes.carry_walk, 'carregar_parado', 4, 9, 30);
  if (clipes.pickup) clipes.pegar = sub(clipes.pickup, 'pegar', 21, 72, 30);
  return clipes;
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
  algemado: false, pena: 0, algemas: null, sincPena: 10,
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
  if (pertoContratante()) { aviso('Contratante: "Ainda não tenho cargas para você. Volte quando as transportadoras abrirem."', 4); return; }
  if (jogador.carregando) { pegarOuSoltar(null); return; }
  const c = caixaProxima();
  if (c) { if (jogador.armado) { aviso('Guarde a arma para carregar caixas.'); return; } pegarOuSoltar(c); }
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
  rede.escutarMeuPerfil(perfil.id, { perfil: aplicarPerfil, comando: aoComando });
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
    + `<span class="online">● ${online} online</span>${conectado ? '' : ' <small>(conectando…)</small>'}<br><button id="btSair">Sair da conta</button>`;
  $('btSair').onclick = async () => { await salvarAgora(); await rede.sair(); location.reload(); };
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
    if (a.cx && !r.caixa) { r.caixa = clonar('caixa'); r.caixa.scale.setScalar(0.72); scene.add(r.caixa); }
    if (!a.cx && r.caixa) { scene.remove(r.caixa); r.caixa = null; }
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
  const est = { id: j.perfil.id, x: r2(j.pos.x), y: r2(j.pos.y), z: r2(j.pos.z), r: r2(j.yaw), a: j.avatar.nomeAtual || 'idle', ar: j.armado ? 1 : 0, cx: j.carregando ? 1 : 0, al: j.algemado ? 1 : 0 };
  const u = ultimoEnvio;
  const mudou = !u || Math.abs(u.x - est.x) > 0.03 || Math.abs(u.z - est.z) > 0.03 || Math.abs(u.r - est.r) > 0.05 || u.a !== est.a || u.ar !== est.ar || u.cx !== est.cx || u.al !== est.al;
  if (!mudou && tempoKeepAlive > 0) return;
  conexao.enviar('pos', est); ultimoEnvio = est; tempoKeepAlive = 3;
}

async function salvarAgora() {
  if (!jogador.perfil || !jogador.avatar) return;
  try { await rede.salvarPosicao(jogador.perfil.id, Math.round(jogador.pos.x * 10) / 10, Math.round(jogador.pos.z * 10) / 10); } catch { /* tenta de novo depois */ }
}

// ================================================================= MUDANÇAS VINDAS DO BANCO
const LOCAIS = [];
function montarLocais() {
  LOCAIS.length = 0;
  if (contratante) LOCAIS.push({ nome: 'Praça do Contratante', x: contratante.x + 5, z: contratante.z + 5 });
  if (cadeia) LOCAIS.push({ nome: 'Delegacia', x: cadeia.x + 4, z: cadeia.z + 4 });
  LOCAIS.push({ nome: 'Transportadora', x: quadC(2) + 9, z: ruaC(2) + 2.5 });
  LOCAIS.push({ nome: 'Avenida Central', x: 0, z: ruaC(2) });
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
  let dica = '';
  if (pertoContratante()) dica = TOQUE ? 'Toque em Falar' : 'E para falar com o Contratante';
  else if (jogador.carregando) dica = TOQUE ? 'Toque em Soltar' : 'E para soltar a caixa';
  else if (caixaProxima() && !jogador.armado) dica = TOQUE ? 'Toque em Pegar' : 'E para pegar a caixa';
  const el = $('dica'); el.textContent = dica; el.classList.toggle('oculto', !dica || TOQUE);
  if (TOQUE) $('btAcao').textContent = pertoContratante() ? 'Falar' : jogador.carregando ? 'Soltar' : 'Pegar';
  const bl = $('bloqueio');
  if (jogador.perfil?.banido) { /* mensagem já exibida */ }
  else if (jogador.pena > 0) { bl.textContent = `Preso: ${formatarTempo(jogador.pena)}`; bl.classList.remove('oculto'); }
  else if (jogador.algemado) { bl.textContent = 'Algemado'; bl.classList.remove('oculto'); }
  else bl.classList.add('oculto');
  if (avisoTimer > 0) { avisoTimer -= dt; if (avisoTimer <= 0) $('aviso').style.opacity = 0; }
  atualizarPlacas();
  if (contratante?.excl) contratante.excl.position.y = 3.0 + Math.sin(performance.now() / 300) * 0.12;
}

function quadro() {
  const dt = Math.min(relogio.getDelta(), 0.05);
  atualizarJogador(dt);
  atualizarCaminhao(dt);
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
