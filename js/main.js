import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FERRO_VELHOS, FABRICAS, PRODUTOS, FOME_POR_SEGUNDO, LOTES_VENDA, DESTINOS } from './config.js';
import { iniciarCla, atualizarCla } from './cla.js';
import { iniciarEmpresa, abrirCompra, abrirMissoes, atualizar as atualizarJanelaEmpresa } from './empresa.js';
import { iniciarLoja, abrir as abrirJanela, recarregarInventario } from './loja.js';
import { PERSONAGENS, PERSONAGENS_GRATIS, ROBOS, MODELOS, CIDADE, RUAS_HORIZONTAIS, RUAS_VERTICAIS, QUARTEIROES_ESPECIAIS, VELOCIDADE, CONTROLES_PC } from './config.js';

const $ = (id) => document.getElementById(id);
const TOQUE = window.matchMedia('(pointer: coarse)').matches;

import * as rede from './rede.js';
import * as mundo from './mundo.js';
import * as ferrovia from './ferrovia.js';
import * as sedes from './sedes.js';
import { iniciarConquistas } from './conquistas.js';
import { nivelTexto } from './empresa.js';
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
    const gratis = PERSONAGENS_GRATIS.includes(p.id);
    c.innerHTML = `<img src="assets/miniaturas/${p.id}.webp" alt="" loading="lazy"><div>${p.nome}</div>${gratis ? '' : '<small class="trava">🔒 8.000 na loja</small>'}`;
    if (!gratis) { c.classList.add('bloqueada'); grade.appendChild(c); continue; }
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

// ---------------------------------------------------------------- dia e noite (igual para todos, pelo relógio do servidor)
const CICLO_DIA = 32 * 60;                   // um dia do jogo = 32 minutos (22 de dia, 10 de noite)
const HORA_FIXA = (location.search.match(/[?&]hora=(\d+(?:\.\d+)?)/) || [])[1];   // ?hora=22 para testar
const CEU = {
  dia: new THREE.Color('#a9c8de'), noite: new THREE.Color('#0d1730'), tarde: new THREE.Color('#e8a27a'),
  sol: new THREE.Color('#fff2dc'), solTarde: new THREE.Color('#ffae6a'), lua: new THREE.Color('#9fb4ff'),
  hemiDia: new THREE.Color('#dfeeff'), hemiNoite: new THREE.Color('#4a5f92'), chaoDia: new THREE.Color('#8a7457'), chaoNoite: new THREE.Color('#2a2833'),
};
let horaAtual = 12;
function horaDoJogo(t) {
  if (HORA_FIXA !== undefined) return Number(HORA_FIXA) % 24;
  const f = ((t / CICLO_DIA) % 1 + 1) % 1;
  return f < 0.7 ? 6 + f / 0.7 * 12 : (18 + (f - 0.7) / 0.3 * 12) % 24;
}
function atualizarCeu(t) {
  const h = horaDoJogo(t); horaAtual = h;
  const ang = (h - 6) / 12 * Math.PI, elev = Math.sin(ang);
  const S = THREE.MathUtils.smoothstep;
  const dia = S(elev, -0.12, 0.22), tarde = dia * (1 - S(elev, 0.05, 0.45));
  if (dia > 0.02) SOL_DIR.set(Math.cos(ang) * 0.9, Math.max(0.2, elev), 0.35).normalize();
  else SOL_DIR.set(0.45, 1, -0.4).normalize();              // luz da lua
  sol.color.copy(CEU.lua).lerp(CEU.sol, dia).lerp(CEU.solTarde, tarde * 0.75);
  sol.intensity = 0.3 + 1.8 * dia;
  hemi.intensity = 0.4 + 0.9 * dia;
  hemi.color.copy(CEU.hemiNoite).lerp(CEU.hemiDia, dia);
  hemi.groundColor.copy(CEU.chaoNoite).lerp(CEU.chaoDia, dia);
  scene.environmentIntensity = 0.12 + 0.43 * dia;
  scene.background.copy(CEU.noite).lerp(CEU.dia, dia).lerp(CEU.tarde, tarde * 0.5);
  const noite = 1 - S(elev, -0.02, 0.3);
  mundo.definirNoite(noite);
  for (const m of luzesCasas) m.emissiveIntensity = noite * 1.1;
}
const textoHora = () => `${String(Math.floor(horaAtual)).padStart(2, '0')}:${String(Math.floor((horaAtual % 1) * 60)).padStart(2, '0')}`;

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
  const terra = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1300), materialChao('#bda783'));
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
  mundo.poca(x, z, 5);
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
  pontos.delegacia = { x: (caixaDelegacia.min.x + caixaDelegacia.max.x) / 2, z: caixaDelegacia.max.z + 1.3 };
  const pd = textoSprite('Delegacia · serviço policial', { escala: 0.65, fundo: 'rgba(30,70,160,.92)' }); pd.position.set(pontos.delegacia.x, 2.6, pontos.delegacia.z); scene.add(pd);
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
    const lotes = esp || { SO: 'casa', SE: 'casa', NE: 'casa', NO: 'arvores' };
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
    // o anel e a placa do território vêm do banco (dono e defesa), em carregarCidadeSocial
    itensMapa.push({ tipo: 'territorio', x: s * BASE_X, z: ruaC(2), r: 24 });
  }
  // o caminhão danificado só aparece quando uma carga for roubada (etapa 5)
}
// loja nas cidades vizinhas (frente virada para +Z)
function colocarLojaExtra(x, z) {
  colocarPredio('loja', x, z, 0);
  const p = predios[predios.length - 1];
  const frente = { x: (p.caixa.min.x + p.caixa.max.x) / 2, z: p.caixa.max.z + 1.3 };
  pontos.lojas.push(frente);
  const pl = textoSprite('Loja', { escala: 0.8, fundo: 'rgba(140,30,30,.85)' }); pl.position.set(frente.x, 2.6, frente.z); scene.add(pl);
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
  vida: 100, morto: false, ultimoAgressor: null, agredidos: new Map(), cla: null, claInfo: null, casa: null, statusPol: null,
};

function resolverColisao(p, raio) {
  colidirLista(colisores, p, raio);
  mundo.colidir(p, raio, colidirLista);
  if (!jogador.trem) ferrovia.empurrar(p, raio);
  resolverMoveis(p, raio);
  mundo.limitar(p);
}
function colidirLista(lista, p, raio) {
  for (const c of lista) {
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
}
function resolverMoveis(p, raio) {
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
}

function alturaChao(x, z) {
  const h = mundo.altura(x, z); if (h !== null) return h;
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
  if (jogador.morto) return false;
  if (jogador.trem) { aviso('Você está no trem.'); return false; }
  if (jogador.algemado) { aviso('Você está algemado.'); return false; }
  if (jogador.pena > 0) { aviso('Você está preso.'); return false; }
  return true;
}

function acaoContexto() {
  if (jogador.trem) {
    const est = ferrovia.estadoDe(jogador.trem.li, jogador.trem.k);
    if (est?.parado === jogador.trem.origem) desembarcar(jogador.trem.origem); else aviso(contexto()[0]);
    return;
  }
  if (jogador.trava > 0 || !livre()) return;
  if (jogador.carregando?.userData.pedido) { acaoCaixaPedido(); return; }
  if (jogador.carregando?.userData.encomenda && !jogador.trem && !ferrovia.plataformaEm(jogador.pos.x, jogador.pos.z)) { acaoEncomenda(); return; }
  if (jogador.dentroCasa) {
    if (pontoInterior('porta', 1.8)) sairDeCasa();
    else if (pontoInterior('cama', 2)) descansar();
    else if (pontoInterior('bau', 1.8)) abrirJanela('bau');
    return;
  }
  const pl = ferrovia.plataformaEm(jogador.pos.x, jogador.pos.z);
  if (pl && pl.trem !== null && pl.resta > 2) { embarcar(pl); return; }
  if (pl) { aviso(contexto()[0]); return; }
  if (jogador.perfil.policial) { const alvo = procuradoProximo(2.4); if (alvo) { prenderProcurado(alvo); return; } }
  if (pertoDelegacia()) { alternarServico(); return; }
  if (pertoContratante()) { abrirMissoes(); return; }
  const ag = agenciaProxima(); if (ag && !jogador.carregando) { pegarEncomenda(ag); return; }
  if (pertoOficina()) { fazerParafusos(); return; }
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
  const casa = casaProxima(3.2);
  if (casa) { acaoCasa(casa); return; }
  if (pontoProximo(pontos.sucata, 4)) { if (jogador.armado) { aviso('Guarde a arma para trabalhar.'); return; } coletar(); }
}

// ---------------------------------------------------------------- encomendas entre cidades e oficina de parafusos
const NOMES_AGENCIA = { centro: 'a Metrópole', serra: 'Vila Serra', porto: 'Porto Sul' };
const AGENCIAS = [
  { id: 'centro', x: -20, z: -118 }, { id: 'centro', x: -20, z: 118 },
  { id: 'serra', x: -60, z: -934 }, { id: 'porto', x: -60, z: 934 },
];
const OFICINA = { x: 62, z: 934 };
function agenciaProxima() { return AGENCIAS.find((a) => Math.hypot(a.x - jogador.pos.x, a.z - jogador.pos.z) < 3.4) || null; }
function pertoOficina() { return Math.hypot(OFICINA.x - jogador.pos.x, OFICINA.z - jogador.pos.z) < 3.2; }
function balcao(x, z, cor, texto, sub) {
  const g = new THREE.Group(); g.position.set(x, alturaChao(x, z), z);
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
  const b = (mat, w, h, d, px, py, pz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(px, py, pz); o.castShadow = true; o.receiveShadow = true; g.add(o); };
  b(m('#e9e2d4'), 2.6, 1.1, 1.0, 0, 0.55, 0); b(m(cor), 2.8, 0.12, 1.2, 0, 1.16, 0);
  for (const sx of [-1.25, 1.25]) b(m('#5a5f66'), 0.1, 2.6, 0.1, sx, 1.3, -0.45);
  b(m(cor), 3.0, 0.15, 1.6, 0, 2.65, -0.1);
  scene.add(g);
  const p1 = textoSprite(texto, { escala: 0.75, fundo: 'rgba(20,24,34,.88)', cor: '#ffd9a0' }); p1.position.set(x, 3.6, z); scene.add(p1);
  if (sub) { const p2 = textoSprite(sub, { escala: 0.5, fundo: cor }); p2.position.set(x, 3.05, z); scene.add(p2); }
  colisores.push({ tipo: 'caixa', x0: x - 1.3, x1: x + 1.3, z0: z - 0.5, z1: z + 0.5 });
}
function montarAgencias() {
  for (const a of AGENCIAS) balcao(a.x, a.z, '#2f6f5e', 'Agência de Encomendas', a.id === 'centro' ? 'Leve para Vila Serra ou Porto Sul' : 'Leve para outra cidade');
  balcao(OFICINA.x, OFICINA.z, '#8a5a2a', 'Oficina de Parafusos', '3 sucatas = 2 parafusos');
}
function carregarEncomenda(e) {
  if (jogador.carregando) { scene.remove(jogador.carregando); jogador.carregando = null; }
  const cx = criarCaixa(null); cx.userData.encomenda = e;
  jogador.carregando = cx; scene.add(cx);
}
async function pegarEncomenda(ag) {
  if (ocupado) return; ocupado = true;
  try {
    const e = await rede.encomendas.pegar(ag.id);
    jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 1.5, fade: 0.15 }); jogador.trava = 1.1; jogador.alvo = null;
    jogador.eventos.push({ t: 0.7, fn: () => carregarEncomenda(e) });
    aviso(`Encomenda para ${NOMES_AGENCIA[e.destino]}: ${e.valor} moedas na entrega. Prazo: 20 min. Pegue o trem!`, 5);
    rastrear({ nome: `Agência ${({ centro: 'da Metrópole', serra: 'de Vila Serra', porto: 'de Porto Sul' })[e.destino]}`, ...AGENCIAS.find((a) => a.id === e.destino) });
  } catch (err) { aviso(err.message); }
  finally { ocupado = false; }
}
let confirmaEncomenda = 0;
async function acaoEncomenda() {
  const cx = jogador.carregando, e = cx.userData.encomenda, ag = agenciaProxima();
  if (ag?.id === e.destino) {
    if (ocupado) return; ocupado = true;
    try { const v = await rede.encomendas.entregar(ag.id); scene.remove(cx); jogador.carregando = null; aviso(`Encomenda entregue! +${v} moedas`); rastrear(null); }
    catch (err) { aviso(err.message); if (/venceu/.test(err.message)) { scene.remove(cx); jogador.carregando = null; } }
    finally { ocupado = false; }
    return;
  }
  if (performance.now() - confirmaEncomenda < 3000) {
    confirmaEncomenda = 0;
    try { await rede.encomendas.desistir(); } catch { /* some sozinha */ }
    scene.remove(cx); jogador.carregando = null; aviso('Você desistiu da encomenda.'); return;
  }
  confirmaEncomenda = performance.now();
  aviso(`Leve até a agência de ${NOMES_AGENCIA[e.destino]}. Aperte de novo para desistir.`, 3);
}
async function fazerParafusos() {
  if (ocupado) return; ocupado = true;
  try { const n = await rede.encomendas.parafusos(); jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 1.2, fade: 0.15 }); jogador.trava = 1; aviso(`+2 parafusos (você tem ${n}). Venda na loja.`); recarregarInventario(); }
  catch (err) { aviso(err.message === 'itens insuficientes' ? 'Precisa de 3 sucatas (colete no ferro-velho).' : err.message); }
  finally { ocupado = false; }
}

// ---------------------------------------------------------------- trem
function embarcar(pl) {
  if (jogador.carregando && !jogador.carregando.userData.encomenda) { aviso('Largue a caixa antes de embarcar.'); return; }
  if (jogador.armado) alternarArma();
  const l = pl.linha;
  jogador.trem = { li: l.id, k: pl.trem, v: Math.floor(Math.random() * ferrovia.VAGAS_POR_TREM), origem: pl.lado, destino: pl.lado === 'centro' ? 'destino' : 'centro' };
  jogador.alvo = null;
  ferrovia.ocultarTeto(l.id, pl.trem, true);
  aviso(`Você embarcou. Próxima parada: ${ferrovia.nomeParada(l, jogador.trem.destino)}.`, 3);
}
function desembarcar(lado) {
  const t = jogador.trem; if (!t) return;
  const w = ferrovia.vaga(t.li, t.k, t.v);
  ferrovia.ocultarTeto(t.li, t.k, false);
  jogador.trem = null;
  const p = ferrovia.pontoDeSaida(t.li, lado, w ? w.x : 0);
  jogador.pos.set(p.x, alturaChao(p.x, p.z), p.z);
  // vira para o lado da cidade
  jogador.yaw = (lado === 'centro') === (p.z < 0) ? 0 : Math.PI;
  if (lado === t.destino) aviso(`Você chegou: ${ferrovia.nomeParada(ferrovia.linhas[t.li], lado)}.`, 3);
}
function seguirTrem() {
  const t = jogador.trem, est = ferrovia.estadoDe(t.li, t.k);
  if (est?.parado === t.destino) { desembarcar(t.destino); return false; }
  const w = ferrovia.vaga(t.li, t.k, t.v);
  if (!w) { jogador.trem = null; return false; }
  jogador.pos.set(w.x, w.y, w.z); jogador.yaw = w.yaw;
  return true;
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
  jogador.eventos.push({ t: 0.3, fn: golpeSoco });
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
  criarBola(boca, v, cor, true);
  const r2 = (n) => Math.round(n * 100) / 100;
  conexao?.enviar('tiro', { x: r2(boca.x), y: r2(boca.y), z: r2(boca.z), vx: r2(v.x), vy: r2(v.y), vz: r2(v.z), c: cor });
  jogador.recarga = 0.28;
}
function criarBola(pos, vel, cor, minha = false) {
  const m = new THREE.Mesh(geoBola, new THREE.MeshStandardMaterial({ color: cor, roughness: 0.3 }));
  m.position.copy(pos); scene.add(m);
  bolas.push({ m, v: vel.clone(), vida: 1.4, cor, minha });
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
    if (b.minha) fim = acertoDaBola(b);
    if (!fim) for (const c of colisores) {
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
const MAPA_ESC = 1.2, MAPA_R = 110;             // pixels por metro no fundo; raio visível em metros
const REGIOES_MAPA = [
  { x0: -mundo.FIM_HORIZONTE, z0: -mundo.FIM_HORIZONTE, x1: mundo.FIM_HORIZONTE, z1: mundo.FIM_HORIZONTE },
  { x0: -170, z0: -1190, x1: 170, z1: -810 },
  { x0: -170, z0: 810, x1: 170, z1: 1190 },
];
let fundosMapa = [];
function regiaoMapa(x, z) { return REGIOES_MAPA.findIndex((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1); }
function desenharFundoMapa() {
  fundosMapa = REGIOES_MAPA.map((r) => {
    const c = document.createElement('canvas');
    c.width = Math.ceil((r.x1 - r.x0) * MAPA_ESC); c.height = Math.ceil((r.z1 - r.z0) * MAPA_ESC);
    const g = c.getContext('2d');
    g.setTransform(MAPA_ESC, 0, 0, MAPA_ESC, -r.x0 * MAPA_ESC, -r.z0 * MAPA_ESC);
    g.fillStyle = '#86a95c'; g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    mundo.desenharMapa(g);
    ferrovia.desenharMapa(g);
    desenharCentroNoMapa(g);
    return c;
  });
}
function desenharCentroNoMapa(g) {
  g.fillStyle = '#d8d1c3'; g.fillRect(-METADE, -METADE, TOTAL, TOTAL);
  g.fillStyle = '#4a4e57';
  for (let i = 0; i <= N; i++) { g.fillRect(-METADE, ruaC(i) - RW / 2, TOTAL, RW); g.fillRect(ruaC(i) - RW / 2, -METADE, RW, TOTAL); }
  g.fillStyle = '#7fa45a'; g.fillRect(quadC(1) - QB / 2 + CW, quadC(2) - QB / 2 + CW, QB - 2 * CW, QB - 2 * CW);
  for (const it of itensMapa) {
    if (it.tipo === 'territorio') { g.strokeStyle = it.x > 0 ? '#d24b4b' : '#4b7bd2'; g.lineWidth = 3; g.beginPath(); g.arc(it.x, it.z, it.r, 0, 7); g.stroke(); continue; }
    g.fillStyle = CORES_MAPA[it.tipo] || '#888'; g.fillRect(it.x0, it.z0, it.x1 - it.x0, it.z1 - it.z0);
  }
  if (contratante) { g.fillStyle = '#ffd23e'; g.beginPath(); g.arc(contratante.x, contratante.z, 5, 0, 7); g.fill(); }
}
// ---------------------------------------------------------------- mapa grande e rastreio
const NOMES_REGIAO = ['Metrópole', 'Vila Serra', 'Porto Sul'];
let rastreio = null, regiaoMapaG = 0, beacon = null;
function alvosRastreio() {
  const eu = jogador.perfil?.id, r = [];
  for (const [lote, u] of unidades) {
    const e = empresas.get(u.empresa); if (!e || (e.dono !== eu && e.id !== emprego)) continue;
    const l = LOTES_VENDA.find((x) => x.id === lote); if (!l) continue;
    r.push({ icone: '🏭', nome: e.nome, x: l.portao.x, z: l.portao.z - 1.5 });
  }
  for (const d of casasLista) if (moraEm(d)) r.push({ icone: '🏠', nome: d.rotulo || 'Sua casa', x: d.x, z: d.z });
  if (jogador.cla) for (const v of territorios.values()) if (v.d.dono_cla === jogador.cla) r.push({ icone: '🚩', nome: v.d.nome, x: v.d.x, z: v.d.z });
  for (const l of ferrovia.linhas) for (const lado of ['centro', 'destino']) { const p = l.plataformas[lado]; r.push({ icone: '🚆', nome: p.nome, x: 0, z: p.zSaida }); }
  if (contratante) r.push({ icone: '📋', nome: 'Contratante', x: contratante.x, z: contratante.z });
  for (const a of AGENCIAS) r.push({ icone: '📦', nome: `Agência ${a.id === 'centro' ? (a.z < 0 ? 'Norte' : 'Sul') : NOMES_AGENCIA[a.id]}`, x: a.x, z: a.z });
  r.push({ icone: '🔩', nome: 'Oficina de Parafusos', x: OFICINA.x, z: OFICINA.z });
  return r;
}
function rastrear(alvo) {
  rastreio = alvo;
  if (beacon) { scene.remove(beacon); beacon = null; }
  if (alvo) {
    beacon = new THREE.Group();
    const feixe = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd23e', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    feixe.position.y = 20; beacon.add(feixe);
    const anel = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 32), new THREE.MeshBasicMaterial({ color: '#ffd23e', transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    anel.rotation.x = -Math.PI / 2; anel.position.y = 0.3; beacon.add(anel);
    beacon.position.set(alvo.x, 0, alvo.z); scene.add(beacon);
    aviso(`Rastreando: ${alvo.nome}`);
  }
  $('rastreio').classList.toggle('oculto', !alvo);
}
// quando o destino fica em outra cidade, o caminho passa pela estação
function proximoPasso() {
  if (!rastreio) return null;
  const rp = regiaoMapa(jogador.pos.x, jogador.pos.z), ra = regiaoMapa(rastreio.x, rastreio.z);
  if (rp === ra || rp < 0) return rastreio;
  const linha = (ra === 1 || rp === 1) ? ferrovia.linhas[0] : ferrovia.linhas[1];
  const lado = rp === 0 ? 'centro' : 'destino', p = linha.plataformas[lado];
  return { x: 0, z: p.zSaida, nome: `${p.nome} (trem para ${ra === 0 ? 'a Metrópole' : NOMES_REGIAO[ra]})`, estacao: true };
}
function atualizarRastreio(dt) {
  if (!rastreio) return;
  const passo = proximoPasso(), d = Math.hypot(passo.x - jogador.pos.x, passo.z - jogador.pos.z);
  if (beacon) {
    beacon.position.set(passo.x, alturaChao(passo.x, passo.z), passo.z);
    beacon.children[0].material.opacity = 0.22 + Math.sin(performance.now() / 300) * 0.08;
    beacon.visible = regiaoMapa(passo.x, passo.z) === regiaoMapa(jogador.pos.x, jogador.pos.z);
  }
  atualizarRastreio.t = (atualizarRastreio.t || 0) - dt;
  if (atualizarRastreio.t <= 0) {
    atualizarRastreio.t = 0.3;
    $('rastreio').innerHTML = `📍 ${passo.estacao ? 'Vá até ' : ''}<b>${passo.nome}</b> · ${Math.round(d)} m <small>(toque para parar)</small>`;
  }
  if (!passo.estacao && d < 5) { aviso(`Você chegou: ${rastreio.nome}`); rastrear(null); }
}
function abrirMapaGrande() {
  regiaoMapaG = Math.max(0, regiaoMapa(jogador.pos.x, jogador.pos.z));
  $('mapaJanela').classList.remove('oculto');
  desenharMapaGrande();
}
function desenharMapaGrande() {
  const abas = $('mapaAbas');
  abas.innerHTML = NOMES_REGIAO.map((n, i) => `<button data-reg="${i}" class="${i === regiaoMapaG ? 'sel' : ''}">${n}</button>`).join('');
  abas.querySelectorAll('[data-reg]').forEach((b) => { b.onclick = () => { regiaoMapaG = Number(b.dataset.reg); desenharMapaGrande(); }; });
  const c = $('mapaG'), g = c.getContext('2d'), w = c.width, r = REGIOES_MAPA[regiaoMapaG];
  g.fillStyle = '#86a95c'; g.fillRect(0, 0, w, w);
  const lado = Math.max(r.x1 - r.x0, r.z1 - r.z0), esc = w / lado, ox = (r.x0 + r.x1) / 2 - lado / 2, oz = (r.z0 + r.z1) / 2 - lado / 2;
  if (fundosMapa[regiaoMapaG]) g.drawImage(fundosMapa[regiaoMapaG], ((r.x1 - r.x0) - lado) / 2 > 0 ? 0 : 0, 0, fundosMapa[regiaoMapaG].width, fundosMapa[regiaoMapaG].height, (r.x0 - ox) * esc, (r.z0 - oz) * esc, (r.x1 - r.x0) * esc, (r.z1 - r.z0) * esc);
  const tela = (x, z) => [(x - ox) * esc, (z - oz) * esc];
  const ponto = (x, z, cor, raio, txt) => {
    const [mx, mz] = tela(x, z); if (mx < 0 || mz < 0 || mx > w || mz > w) return;
    g.fillStyle = cor; g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.arc(mx, mz, raio, 0, 7); g.fill(); g.stroke();
    if (txt) { g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 4; g.strokeText(txt, mx, mz - raio - 6); g.fillText(txt, mx, mz - raio - 6); }
  };
  const alvos = alvosRastreio();
  for (const a of alvos) ponto(a.x, a.z, '#f2f2f2', 7, a.icone);
  if (rastreio) ponto(rastreio.x, rastreio.z, '#ffd23e', 10, '📍');
  ponto(jogador.pos.x, jogador.pos.z, '#5cc28a', 9, 'Você');
  c.onpointerdown = (ev) => {
    const b = c.getBoundingClientRect(), mx = (ev.clientX - b.left) / b.width * w, mz = (ev.clientY - b.top) / b.height * w;
    rastrear({ nome: 'Ponto marcado', x: mx / esc + ox, z: mz / esc + oz }); desenharMapaGrande();
  };
  const lista = $('mapaAlvos');
  lista.innerHTML = alvos.map((a, i) => `<button data-alvo="${i}" class="${rastreio && rastreio.nome === a.nome ? 'sel' : ''}">${a.icone} ${a.nome}</button>`).join('')
    + (rastreio ? '<button data-parar="1">✕ Parar rastreio</button>' : '');
  lista.querySelectorAll('[data-alvo]').forEach((b) => { b.onclick = () => { rastrear(alvos[Number(b.dataset.alvo)]); $('mapaJanela').classList.add('oculto'); }; });
  const pr = lista.querySelector('[data-parar]'); if (pr) pr.onclick = () => { rastrear(null); desenharMapaGrande(); };
}

function desenharMapa() {
  const c = $('mapa'), g = c.getContext('2d'), w = c.width;
  const px = jogador.pos.x, pz = jogador.pos.z, ri = regiaoMapa(px, pz);
  g.fillStyle = '#86a95c'; g.fillRect(0, 0, w, w);
  if (ri >= 0 && fundosMapa[ri]) {
    // recorta a janela dentro do fundo (alguns navegadores não desenham se ela sair da borda)
    const r = REGIOES_MAPA[ri], f = fundosMapa[ri], k = w / (MAPA_R * 2 * MAPA_ESC);
    let sx = (px - MAPA_R - r.x0) * MAPA_ESC, sy = (pz - MAPA_R - r.z0) * MAPA_ESC, sw = MAPA_R * 2 * MAPA_ESC, sh = sw, dx = 0, dy = 0;
    if (sx < 0) { dx = -sx * k; sw += sx; sx = 0; } if (sy < 0) { dy = -sy * k; sh += sy; sy = 0; }
    sw = Math.min(sw, f.width - sx); sh = Math.min(sh, f.height - sy);
    if (sw > 1 && sh > 1) g.drawImage(f, sx, sy, sw, sh, dx, dy, sw * k, sh * k);
  }
  const desenhar = (x, z, cor, raio) => {
    const mx = ((x - px) / MAPA_R * 0.5 + 0.5) * w, mz = ((z - pz) / MAPA_R * 0.5 + 0.5) * w;
    if (mx < -8 || mz < -8 || mx > w + 8 || mz > w + 8) return;
    g.fillStyle = cor; g.beginPath(); g.arc(mx, mz, raio, 0, 7); g.fill();
  };
  for (const n of npcs) desenhar(n.av.raiz.position.x, n.av.raiz.position.z, '#ffffffaa', 3.5);
  for (const r of remotos.values()) if (r.av?.raiz.visible) desenhar(r.av.raiz.position.x, r.av.raiz.position.z, '#4fa3ff', 5);
  if (caminhaoMovel) desenhar(caminhaoMovel.obj.position.x, caminhaoMovel.obj.position.z, '#e39b3a', 5);
  for (const [x, z] of ferrovia.marcadores()) desenhar(x, z, '#c8282e', 7);
  const passo = proximoPasso();
  if (passo) {
    // destino: ponto dourado ou seta na borda quando estiver longe
    let mx = ((passo.x - px) / MAPA_R * 0.5 + 0.5) * w, mz = ((passo.z - pz) / MAPA_R * 0.5 + 0.5) * w;
    const dentro = mx > 8 && mz > 8 && mx < w - 8 && mz < w - 8;
    if (dentro) { g.fillStyle = '#ffd23e'; g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.arc(mx, mz, 8, 0, 7); g.fill(); g.stroke(); }
    else {
      const a = Math.atan2(mz - w / 2, mx - w / 2), rr = w / 2 - 14; mx = w / 2 + Math.cos(a) * rr; mz = w / 2 + Math.sin(a) * rr;
      g.save(); g.translate(mx, mz); g.rotate(a); g.fillStyle = '#ffd23e'; g.strokeStyle = '#111'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -9); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  }
  g.save(); g.translate(w / 2, w / 2); g.rotate(-jogador.yaw + Math.PI);
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
  if (x > 1500) return 'Sua casa';
  const pl = ferrovia.plataformaEm(x, z); if (pl) return pl.plat.nome;
  if (Math.abs(z) > 700) return z < 0 ? 'Vila Serra' : 'Porto Sul';
  if (Math.abs(x) < mundo.CORREDOR && Math.abs(z) > METADE) return Math.abs(z) < 200 ? (z < 0 ? 'Estação Norte' : 'Estação Sul') : 'Ferrovia';
  if (Math.abs(x) > METADE && Math.abs(x) < 216 && Math.abs(z) < 54) return x > 0 ? 'Território Leste' : 'Território Oeste';
  if (z < -METADE) return 'Zona Norte';
  if (z > METADE) return 'Zona Sul';
  if (Math.abs(x) > METADE) return x > 0 ? 'Zona Leste' : 'Zona Oeste';
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
  const skin = perfil.policial ? SKIN_POLICIA : id;
  const avatarP = criarAvatar(ROBOS.includes(skin) ? 'robos' : pastaJogador, skin);
  const roboP = criarAvatar('robos', 'Rusty_Scout_Bot');
  await Promise.all(carregamentos);
  montarQuarteiroes();
  montarPlacasRuas();
  sedes.iniciar({ scene, texturaCanvas });
  mundo.montar({ scene, texturaCanvas, ruido, textoSprite });
  ferrovia.montar({ scene, textoSprite });
  mundo.finalizar();
  for (const c of mundo.CIDADES) if (c.loja) colocarLojaExtra(c.loja.x, c.loja.z);
  montarAgencias();
  criarCaminhaoMovel();

  // jogador
  const av = await avatarP;
  jogador.avatar = av; jogador.nome = nome;
  const arma = clonar('arma_paintball');
  av.encaixarArma(arma); arma.visible = false; jogador.arma = arma;
  jogador.pos.set(perfil.pos_x ?? 0, 0, perfil.pos_z ?? quadC(2));
  if (jogador.pos.x > 1500) jogador.pos.set(contratante.x + 6, 0, contratante.z + 6);
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
  // encomenda em andamento continua na mão depois de entrar de novo
  rede.encomendas.minha().then((e) => { if (e && Date.parse(e.criada_em) > Date.now() - 20 * 60000) carregarEncomenda(e); }).catch(() => {});
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
  iniciarLoja({ perfil: () => jogador.perfil, fome: () => jogador.fome, definirFome: (f) => { jogador.fome = f; desenharFome(); }, curar: usarRemedio, vida: () => jogador.vida,
    casaId: () => jogador.dentroCasa || null,
    meuTerreno: () => { const d = casasMundo.get(portaAberta)?.d; return d?.tipo === 'terreno' && d.dono === jogador.perfil.id ? d : null; },
    portaAtual: () => { const d = casasMundo.get(portaAberta)?.d; return moraEm(d) ? d : null; },
    predioAberto: () => casasMundo.get(portaAberta)?.d || null,
    unidadesDe: (pai) => casasLista.filter((u) => u.pai === pai).sort((a, b) => a.id - b.id),
    agora: agoraServidor,
    entrarMoradia: (d) => entrarEmCasa(d),
    casaVendida: () => { tempoSocial = 0; if (jogador.dentroCasa) sairDeCasa(); } });
  iniciarEmpresa({
    perfil: () => jogador.perfil, agora: agoraServidor,
    definirEmprego: (id) => { emprego = id; },
    lotesOcupados: () => unidades.size,
    lotesDe: (id) => [...unidades.entries()].filter(([, u]) => u.empresa === id).map(([l]) => l),
    recarregar: () => { tempoLogistica = 0; },
  });
  iniciarLogistica();
  iniciarConquistas({
    perfil: () => jogador.perfil, aviso,
    dados: () => ({
      perfil: jogador.perfil,
      empresas: [...empresas.values()].filter((e) => e.dono === jogador.perfil.id),
      helis: [...empresas.values()].filter((e) => e.dono === jogador.perfil.id).reduce((a, e) => a + (helisPorEmpresa.get(e.id) || 0), 0),
      moradias: casasLista.filter((d) => moraEm(d)),
      cla: jogador.cla ? clasCache.get(jogador.cla) : null,
      territorios: jogador.cla ? [...territorios.values()].filter((v) => v.d.dono_cla === jogador.cla).length : 0,
    }),
  });
  $('mapa').addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); abrirMapaGrande(); });
  $('fecharMapa').onclick = () => $('mapaJanela').classList.add('oculto');
  $('rastreio').addEventListener('pointerdown', (ev) => { ev.preventDefault(); rastrear(null); });
  iniciarCla({ perfil: () => jogador.perfil, recarregar: () => { tempoSocial = 0; }, definirCla: (id, info) => { jogador.cla = id; if ((info?.nome || null) !== (jogador.claInfo?.nome || null)) { jogador.claInfo = info; conexao?.rastrear(metaPresenca()); } } });
  carregarCidadeSocial().catch(() => {});
  criarPoliciaNPC();
  $('btFianca').onclick = async () => { try { await rede.policia.fianca(); aviso('Fiança paga. Você está livre.'); } catch (e) { aviso(e.message); } };
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
    + `Vida <span class="vida" id="barVida"><i></i></span> Fome <span class="fome" id="barFome"><i></i></span><br>`
    + (p.policial ? '<span style="color:#7fb8ff">● Em serviço (polícia)</span><br>' : '') + (p.crimes > 0 ? `<span style="color:#ff6b6b">● PROCURADO (${p.crimes})</span><br>` : '')
    + `<span class="online">● ${online} online</span>${conectado ? '' : ' <small>(conectando…)</small>'}<br><button id="btSair">Sair da conta</button>`;
  $('btSair').onclick = async () => { await salvarAgora(); await rede.sair(); location.reload(); };
  desenharFome();
}

// ================================================================= MULTIPLAYER
const remotos = new Map();     // id -> { meta, av, arma, alvo, anim, caixa }
let conexao = null, online = 1, conectado = false;
let envioTimer = 0, ultimoEnvio = null, tempoKeepAlive = 0, tempoSalvar = 15;
const ANIM_UMA_VEZ = { pegar: 1.5, punch_left: 1.7, punch_right: 1.7, hit: 1.4, death: 1 };
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
        else if (r.meta.crimes !== meta.crimes || r.meta.policial !== meta.policial || r.meta.cla !== meta.cla) { r.meta = meta; etiquetaStatus(r); }
      }
      for (const id of [...remotos.keys()]) if (!lista[id]) removerRemoto(id);
      atualizarInfo();
    },
    pos: (p) => { const r = remotos.get(p.id); if (r) r.alvo = p; },
    tiro: (t) => criarBola(new THREE.Vector3(t.x, t.y, t.z), new THREE.Vector3(t.vx, t.vy, t.vz), t.c),
    dano: (d) => receberDano(d),
    meta: () => metaPresenca(),
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
    r.av = av; r.arma = arma; etiquetaStatus(r);
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
    if (a.tr) {   // dentro do trem: a posição vem do horário, igual para todos
      const [li, k, v] = String(a.tr).split('.').map(Number), w = ferrovia.vaga(li, k, v);
      if (w) {
        raiz.position.set(w.x, w.y, w.z); raiz.rotation.y = w.yaw; raiz.visible = true;
        if (r.anim !== 'idle') { r.anim = 'idle'; r.av.tocar('idle', { fade: 0.2 }); }
        r.arma.visible = false; r.av.mixer.update(dt); continue;
      }
    }
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
  const est = { id: j.perfil.id, x: r2(j.pos.x), y: r2(j.pos.y), z: r2(j.pos.z), r: r2(j.yaw), a: j.avatar.nomeAtual || 'idle', ar: j.armado ? 1 : 0, cx: codigoCaixa(j.carregando), al: j.algemado ? 1 : 0, tr: j.trem ? `${j.trem.li}.${j.trem.k}.${j.trem.v}` : 0 };
  const u = ultimoEnvio;
  const mudou = !u || Math.abs(u.x - est.x) > 0.03 || Math.abs(u.z - est.z) > 0.03 || Math.abs(u.r - est.r) > 0.05 || u.a !== est.a || u.ar !== est.ar || u.cx !== est.cx || u.al !== est.al || u.tr !== est.tr;
  if (!mudou && tempoKeepAlive > 0) return;
  conexao.enviar('pos', est); ultimoEnvio = est; tempoKeepAlive = 3;
}

async function salvarAgora() {
  if (!jogador.perfil || !jogador.avatar) return;
  const c = jogador.dentroCasa ? casasMundo.get(jogador.dentroCasa)?.d : null;
  let x = c ? c.x + 2 : jogador.pos.x, z = c ? c.z : jogador.pos.z;
  if (jogador.trem) { const p = ferrovia.pontoDeSaida(jogador.trem.li, jogador.trem.origem, 0); x = p.x; z = p.z; }
  try { await rede.salvarPosicao(jogador.perfil.id, Math.round(x * 10) / 10, Math.round(z * 10) / 10, jogador.fome); } catch { /* tenta de novo depois */ }
}

// ================================================================= LOGÍSTICA (etapa 4)
const empresas = new Map();        // id -> linha da tabela empresas
const unidades = new Map();        // lote -> { empresa, funcao }
const visuaisLote = new Map();     // lote -> { objs: [], predio }
const caminhoes = new Map();       // id -> { obj, d, rotaCache }
const robosMundo = [];             // robôs trabalhando ao lado dos prédios
let emprego = null;                // empresa onde sou funcionário
const trabalhoEm = (id) => empresas.get(id)?.dono === jogador.perfil.id || emprego === id;
const robosAtivos = (e) => e.robos + (e.aluguel_ate && Date.parse(e.aluguel_ate) > agoraServidor() ? e.robos_alugados : 0);
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
  v.sede?.remover();
  if (v.predio) { const i = predios.indexOf(v.predio); if (i >= 0) predios.splice(i, 1); }
  for (const c of v.colisores || []) { const i = colisores.indexOf(c); if (i >= 0) colisores.splice(i, 1); }
  for (const it of v.mapa || []) { const i = itensMapa.indexOf(it); if (i >= 0) itensMapa.splice(i, 1); }
  for (const k of ['lotes', 'bancadasEmp', 'depositos']) pontos[k] = pontos[k].filter((p) => p.lote !== id);
  for (let i = robosMundo.length - 1; i >= 0; i--) if (robosMundo[i].lote === id) { scene.remove(robosMundo[i].av.raiz); robosMundo.splice(i, 1); }
  v.removido = true;
  visuaisLote.delete(id);
}

function desenharLote(l) {
  limparLote(l.id);
  const u = unidades.get(l.id);
  const e = u && empresas.get(u.empresa);
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
  const fabrica = u.funcao === 'fabrica';
  const modelo = fabrica ? 'empresa' : 'transportadora';
  if (sedes.fase(e.nivel) >= 1) { desenharSede(l, e, u, v, fabrica, modelo); return; }
  const obj = colocarPredio(modelo, x, z, 0);
  // prédio um pouco menor para sobrar pátio atrás (estacionamento) e corredor na lateral
  obj.scale.setScalar(0.85 * (1 + (e.nivel - 1) * 0.04)); obj.updateMatrixWorld(true);
  const b0 = new THREE.Box3().setFromObject(obj);
  obj.position.z += (z + LOTE_L / 2 - 0.4) - b0.max.z; obj.updateMatrixWorld(true);
  // colocarPredio registrou colisor e mapa com a posição antiga: refaz
  const pr = predios[predios.length - 1];
  colisores.splice(colisores.length - 1, 1); itensMapa.splice(itensMapa.length - 1, 1);
  pr.caixa = addColisorCaixa(obj, 0.8);
  const it = { tipo: modelo, x0: pr.caixa.min.x, x1: pr.caixa.max.x, z0: pr.caixa.min.z, z1: pr.caixa.max.z };
  itensMapa.push(it);
  v.objs.push(obj); v.predio = pr; v.colisores.push(colisores[colisores.length - 1]); v.mapa.push(it);
  const nome = textoSprite(`${e.nome} · ${nivelTexto(e.nivel)}`, { escala: 1, cor: '#ffd9a0', fundo: 'rgba(20,24,34,.85)' });
  nome.position.set(x, pr.caixa.max.y + 1.2, z); scene.add(nome); v.objs.push(nome);
  extrasDoLote(l, e, v, fabrica, x - LOTE_L / 2 + 1.1, z + 4);
  enfeitesNivel(x, z, e, v);
}
// níveis 2 a 4: bandeiras (2), cerca e vagas pintadas (3), contêineres e holofotes (4)
function enfeitesNivel(x, z, e, v) {
  const cor = sedes.corDaEmpresa(e.id), g = new THREE.Group(), H = LOTE_L / 2;
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...extra });
  const bloco = (m, w, h, d, px, py, pz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  if (e.nivel >= 2) {
    for (const sx of [-1, 1]) {
      const px = x + sx * (H - 0.6), pz = z + H - 0.6;
      bloco(mat('#d8d8d8', { metalness: 0.6, roughness: 0.3 }), 0.12, 6, 0.12, px, 3.18, pz);
      const b = bloco(mat(cor, { side: THREE.DoubleSide }), 1.8, 1.1, 0.04, px + 0.9 * -sx, 5.5, pz); b.castShadow = false;
    }
  }
  if (e.nivel >= 3) {
    const cerca = mat('#5a6068', { metalness: 0.5 });
    bloco(cerca, LOTE_L - 0.4, 1.3, 0.08, x, 0.83, z - H + 0.2);
    bloco(cerca, 0.08, 1.3, 10, x - H + 0.2, 0.83, z - H + 5.2);
    const faixa = mat('#f2f2ea');
    for (let k = 0; k < 4; k++) { const f = bloco(faixa, 0.15, 0.02, 2.6, x - 7 + k * 3.6, 0.2, z - H + 3.3); f.castShadow = false; }
  }
  if (e.nivel >= 4) {
    const cores = [cor.getStyle(), '#c43b3b', '#3b6fd2'];
    for (let k = 0; k < 3; k++) bloco(mat(cores[k], { roughness: 0.7 }), 1.7, 1.7, 3.6, x - H + 1.2, 1.03 + (k === 2 ? 1.7 : 0), z - H + 2.4 + (k === 1 ? 3.7 : 0));
    const poste = mat('#33383f', { metalness: 0.5 });
    bloco(poste, 0.15, 7, 0.15, x + H - 0.5, 3.68, z - H + 0.5);
    bloco(mat('#fff3d6', { emissive: '#ffe2a8', emissiveIntensity: 1.2 }), 0.9, 0.35, 0.5, x + H - 0.9, 7.1, z - H + 0.8);
  }
  if (!g.children.length) return;
  scene.add(g); v.objs.push(g);
}
// prédio por fase (níveis 5, 10 e 15): galpão com docas, complexo industrial ou sede gigante
function desenharSede(l, e, u, v, fabrica, modelo) {
  const { x, z } = centroLote(l);
  const principal = Math.min(...[...unidades.entries()].filter(([, k]) => k.empresa === e.id).map(([lote]) => lote)) === l.id;
  const sd = sedes.construir({ x, z, nivel: e.nivel, fabrica, id: e.id, corProduto: PRODUTOS[e.produto]?.cor || '#c9a06a', helis: principal ? helisPorEmpresa.get(e.id) || 0 : 0 });
  v.sede = sd; v.docas = sd.docas; v.heliportos = sd.heliportos;
  const pr = { obj: sd.grupo, caixa: sd.caixa, mats: sd.mats, opac: 1 };
  predios.push(pr); v.predio = pr;
  const col = { tipo: 'caixa', x0: sd.caixa.min.x + 0.2, x1: sd.caixa.max.x - 0.2, z0: sd.caixa.min.z + 0.2, z1: sd.caixa.max.z - 0.2 };
  colisores.push(col); v.colisores.push(col);
  const it = { tipo: modelo, x0: sd.caixa.min.x, x1: sd.caixa.max.x, z0: sd.caixa.min.z, z1: sd.caixa.max.z };
  itensMapa.push(it); v.mapa.push(it);
  const nome = textoSprite(`${e.nome} · ${nivelTexto(e.nivel)}`, { escala: 1.1, cor: '#ffd9a0', fundo: 'rgba(20,24,34,.88)' });
  nome.position.set(x, Math.min(sd.topo, sd.altura + 6) + 1.4, z + 3); scene.add(nome); v.objs.push(nome);
  extrasDoLote(l, e, v, fabrica, x - 6, z + LOTE_L / 2 + 1.4);
}
// bancada, estoque, depósito e robôs andando (igual em todas as fases)
function extrasDoLote(l, e, v, fabrica, bx, bz) {
  if (fabrica) {
    const banc = clonar('bancada'); banc.position.set(bx, 0.18, bz); scene.add(banc); banc.updateMatrixWorld(true);
    addColisorCaixa(banc, 0.1); v.objs.push(banc); v.colisores.push(colisores[colisores.length - 1]);
    pontos.bancadasEmp.push({ x: bx + 1.2, z: bz, empresa: e.id, lote: l.id });
    const est = textoSprite(`${PRODUTOS[e.produto].nome} · estoque ${e.estoque}`, { escala: 0.6, fundo: 'rgba(60,40,15,.85)', cor: '#ffd9a0' });
    est.position.set(bx, 2.4, bz); scene.add(est); v.objs.push(est);
    pontos.depositos.push({ x: l.portao.x, z: l.portao.z - 1.8, empresa: e.id, lote: l.id });
    const dep = textoSprite('Depósito', { escala: 0.55, fundo: 'rgba(120,80,10,.9)' }); dep.position.set(l.portao.x, 2.2, l.portao.z - 1.8); scene.add(dep); v.objs.push(dep);
  } else {
    const faixa = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), new THREE.MeshStandardMaterial({ color: '#e3b23c', roughness: 0.8, transparent: true, opacity: 0.85 }));
    faixa.rotation.x = -Math.PI / 2; faixa.position.set(l.portao.x, 0.19, l.portao.z - 1.6); scene.add(faixa); v.objs.push(faixa);
  }
  // robôs trabalhando (até 2 visíveis por unidade)
  const n = Math.min(2, robosAtivos(e));
  for (let i = 0; i < n; i++) {
    const rota = fabrica ? [[bx + 1.4, bz - 1 + i], [l.portao.x + 2 - i * 3, l.portao.z - 2.2]] : [[l.portao.x - 3 + i * 4, l.portao.z - 2.5], [l.portao.x - 3 + i * 4, l.portao.z - 2.5]];
    criarAvatar('robos', fabrica ? 'Rusty_Scout_Bot' : 'Rustbolt_Sentinel').then((av) => {
      if (v.removido) return;
      av.raiz.position.set(rota[0][0], 0.18, rota[0][1]); av.raiz.scale.setScalar(0.85);
      scene.add(av.raiz);
      av.tocar(fabrica ? 'carry_walk' : 'idle_long');
      robosMundo.push({ av, rota, i: 1, lote: l.id, anda: fabrica });
    }).catch(() => {});
  }
}


// ---------------------------------------------------------------- interior das casas (só o dono entra)
const interiores = new Map();    // casa -> { base, pontos }
const SALA = { w: 12, d: 10 };
function criarInterior(casaId) {
  if (interiores.has(casaId)) return interiores.get(casaId);
  const bx = 2000 + interiores.size * 40, bz = 0;          // cada interior numa vaga própria, longe da cidade
  const g = new THREE.Group(); g.position.set(bx, 0, bz); scene.add(g);
  const mat = (cor, r = 0.8) => new THREE.MeshStandardMaterial({ color: cor, roughness: r });
  const caixa = (w, h, d, cor, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(cor)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const piso = texturaCanvas(256, (gx, t) => { for (let i = 0; i < 8; i++) { gx.fillStyle = i % 2 ? '#8a5a35' : '#7d5030'; gx.fillRect(0, i * t / 8, t, t / 8); } ruido(gx, t, 3000, 0.08, 1.4); });
  piso.repeat.set(3, 2.5);
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(SALA.w, SALA.d), new THREE.MeshStandardMaterial({ map: piso, roughness: 0.85 }));
  chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; g.add(chao);
  // só as paredes do fundo e da esquerda, para a câmera enxergar dentro
  caixa(SALA.w, 3.2, 0.25, '#d9c9a8', 0, 1.6, -SALA.d / 2);
  caixa(0.25, 3.2, SALA.d, '#cdbb98', -SALA.w / 2, 1.6, 0);
  caixa(SALA.w, 0.15, 0.3, '#6b4a2e', 0, 0.08, -SALA.d / 2 + 0.2);
  // cama
  caixa(2.2, 0.45, 3.2, '#6b4a2e', -4.4, 0.23, -3.1);
  caixa(2.0, 0.25, 2.9, '#e8e2d6', -4.4, 0.57, -3.0);
  caixa(2.0, 0.28, 1.2, '#3f6fb0', -4.4, 0.62, -2.2);
  caixa(1.4, 0.22, 0.6, '#f5f2ea', -4.4, 0.78, -4.1);
  // baú
  caixa(1.6, 0.8, 0.9, '#7a4a22', 4.2, 0.4, -4.2);
  caixa(1.7, 0.12, 1.0, '#5a361a', 4.2, 0.86, -4.2);
  caixa(0.25, 0.25, 0.05, '#d8b04a', 4.2, 0.55, -3.73);
  // mesa e tapete
  caixa(2.2, 0.08, 1.3, '#8a5a35', 0.8, 0.9, -0.5); for (const [x, z] of [[-0.2, -1], [1.8, -1], [-0.2, 0], [1.8, 0]]) caixa(0.1, 0.9, 0.1, '#5a361a', x, 0.45, z);
  const tapete = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), mat('#9b3d3d', 1)); tapete.rotation.x = -Math.PI / 2; tapete.position.set(0.8, 0.01, 1.2); g.add(tapete);
  // porta de saída
  caixa(1.4, 0.05, 1.0, '#3b2a1a', 5, 0.03, 4.3);
  const luz = new THREE.PointLight('#ffd9a0', 6, 14, 1.6); luz.position.set(0, 2.8, 0); g.add(luz);
  const placa = (txt, x, z, y = 2) => { const sp = textoSprite(txt, { escala: 0.55 }); sp.position.set(x, y, z); g.add(sp); };
  placa('Cama · descansar', -4.4, -3, 1.7); placa('Baú', 4.2, -4.2, 1.6); placa('Sair', 5, 4.3, 1.4);
  const i = { base: { x: bx, z: bz }, pontos: {
    cama: { x: bx - 2.9, z: bz - 3 }, bau: { x: bx + 4.2, z: bz - 3.2 }, porta: { x: bx + 5, z: bz + 4.3 } } };
  interiores.set(casaId, i);
  return i;
}
function entrarEmCasa(c) {
  const i = criarInterior(c.id);
  jogador.dentroCasa = c.id;
  if (jogador.carregando) { scene.remove(jogador.carregando); jogador.carregando = null; }
  teleportar(i.base.x + 4, i.base.z + 3);
  aviso('Bem-vindo à sua casa. Use a cama para recuperar a vida.', 3);
}
function sairDeCasa() {
  const c = casasMundo.get(jogador.dentroCasa)?.d;
  jogador.dentroCasa = null;
  if (c) teleportar(c.x + 2, c.z); else teleportar(contratante.x + 6, contratante.z + 6);
}
function pontoInterior(nome, raio) {
  if (!jogador.dentroCasa) return false;
  const p = interiores.get(jogador.dentroCasa)?.pontos[nome];
  return !!p && Math.hypot(p.x - jogador.pos.x, p.z - jogador.pos.z) < raio;
}
function descansar() {
  jogador.alvo = null; jogador.trava = 3;
  jogador.avatar.tocar('idle_long', { fade: 0.3 });
  aviso('Descansando…', 3);
  jogador.eventos.push({ t: 3, fn: () => { jogador.vida = 100; desenharFome(); aviso('Vida recuperada!'); } });
}
function limitarInterior(p) {
  const i = interiores.get(jogador.dentroCasa); if (!i) return;
  p.x = THREE.MathUtils.clamp(p.x, i.base.x - SALA.w / 2 + 0.5, i.base.x + SALA.w / 2 - 0.5);
  p.z = THREE.MathUtils.clamp(p.z, i.base.z - SALA.d / 2 + 0.5, i.base.z + SALA.d / 2 - 0.5);
  // não atravessa cama, baú e mesa
  for (const [x0, x1, z0, z1] of [[-5.5, -3.3, -4.8, -1.4], [3.4, 5.0, -4.8, -3.7], [-0.3, 1.9, -1.2, 0.2]]) {
    const ax = i.base.x + x0, bx = i.base.x + x1, az = i.base.z + z0, bz = i.base.z + z1;
    if (p.x > ax && p.x < bx && p.z > az && p.z < bz) {
      const op = [[p.x - ax, 'x', ax], [bx - p.x, 'x', bx], [p.z - az, 'z', az], [bz - p.z, 'z', bz]].sort((a, b) => a[0] - b[0])[0];
      p[op[1]] = op[2];
    }
  }
}

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
  if (r.voa) {
    // helicóptero: linha reta, decola e pousa no heliporto
    const H = c.heliporto || { ...T, y: 0.02 };
    const p = [
      { pts: [H, F], dur: r.d1, y0: H.y, y1: 0.02 }, { parado: true, dur: r.carga },
      { pts: [F, D], dur: r.d2, y0: 0.02, y1: 0.02 }, { parado: true, dur: r.descarga },
      { pts: [D, H], dur: r.d3, y0: 0.02, y1: H.y },
    ];
    c.rotaCache = { id: c.d.partida, pernas: p };
    return p;
  }
  const p = [
    { pts: rotaGrade(T, F), dur: r.d1 }, { parado: true, dur: r.carga },
    { pts: rotaGrade(F, D), dur: r.d2 }, { parado: true, dur: r.descarga },
    { pts: rotaGrade(D, T), dur: r.d3 },
  ];
  c.rotaCache = { id: c.d.partida, pernas: p };
  return p;
}
// vagas da empresa: 4 no pátio atrás de cada prédio (entrada pelo corredor lateral) e 2 na faixa da frente do lote
function vagasDaEmpresa(id) {
  const lotes = [...unidades.entries()].filter(([, u]) => u.empresa === id)
    .sort((a, b) => (b[1].funcao === 'transportadora') - (a[1].funcao === 'transportadora') || a[0] - b[0]);
  const fundo = [], frente = [];
  for (const [loteId] of lotes) {
    const l = LOTES_VENDA.find((x) => x.id === loteId); if (!l) continue;
    const { x, z } = centroLote(l), zb = z - LOTE_L / 2;
    const corredor = x + LOTE_L / 2 - 1.6, rua = l.portao.z + 2.6;
    const docas = visuaisLote.get(loteId)?.docas;
    if (docas?.length) {
      // docas: o caminhão entra de ré e sai de frente (carregado)
      const patio = zb + 2.2;
      for (const d of docas) {
        const desvio = Math.min(d.x + 4.5, corredor);
        const entrada = [{ x: corredor, z: rua }, { x: corredor, z: patio }];
        if (desvio < corredor - 0.5) entrada.push({ x: desvio, z: patio });
        entrada.push({ x: d.x, z: d.z - 1.6, re: true }, { x: d.x, z: d.z, re: true });
        fundo.push({ x: d.x, z: d.z, ang: Math.PI, fundo: true, entrada, saida: [{ x: d.x, z: patio }, { x: corredor, z: patio }, { x: corredor, z: rua }], corredor, rua });
      }
      continue;
    }
    for (const [dx, dz] of [[-4, 1.8], [3.2, 1.8], [-4, 4.6], [3.2, 4.6]]) fundo.push({ x: x + dx, z: zb + dz, ang: Math.PI / 2, fundo: true, corredor, rua });
    for (const dx of [-4.5, 3.5]) frente.push({ x: x + dx, z: rua, ang: Math.PI / 2, fundo: false, corredor, rua });
  }
  return [...fundo, ...frente];
}
function heliportosDaEmpresa(id) {
  const r = [];
  for (const [lote, u] of unidades) if (u.empresa === id) for (const h of visuaisLote.get(lote)?.heliportos || []) r.push({ x: h.x, z: h.z, y: h.y, ang: 0 });
  return r;
}
function posicaoEstacionado(c) {
  const heli = c.d.tipo === 'helicoptero';
  const vagas = heli ? heliportosDaEmpresa(c.d.empresa) : vagasDaEmpresa(c.d.empresa); if (!vagas.length) return heli ? { garagem: true } : null;
  const meus = [...caminhoes.values()].filter((k) => k.d.empresa === c.d.empresa && k.d.status === 'parado' && (k.d.tipo === 'helicoptero') === heli).map((k) => k.d.id).sort((a, b) => a - b);
  const i = Math.max(0, meus.indexOf(c.d.id));
  if (i >= vagas.length) return { garagem: true };          // sem vaga livre: fica guardado (não aparece)
  return vagas[i];
}
// manobra: segue uma lista de pontos a 6 m/s (entrar e sair do pátio pelo corredor)
function andarManobra(c, dt) {
  const m = c.manobra, alvo = m.pts[m.i], p = c.obj.position;
  const dx = alvo.x - p.x, dz = alvo.z - p.z, d = Math.hypot(dx, dz), passo = (alvo.re ? 3 : 6) * dt;
  if (d <= passo) { p.x = alvo.x; p.z = alvo.z; m.i++; if (m.i >= m.pts.length) { c.naFundo = m.fimFundo; c.manobra = null; } return; }
  p.x += dx / d * passo; p.z += dz / d * passo;
  // de ré: a frente aponta para o lado contrário do movimento
  c.obj.rotation.y = suavizarAngulo(c.obj.rotation.y, alvo.re ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz), dt * 6);
}

function atualizarRobos(dt) {
  for (const r of robosMundo) {
    if (r.anda) {
      const [tx, tz] = r.rota[r.i]; const p = r.av.raiz.position;
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.3) r.i = (r.i + 1) % r.rota.length;
      else { p.x += dx / d * 1.3 * dt; p.z += dz / d * 1.3 * dt; r.av.raiz.rotation.y = suavizarAngulo(r.av.raiz.rotation.y, Math.atan2(dx, dz), dt * 6); }
    }
    r.av.mixer.update(dt);
  }
}
// van e helicóptero feitos por código (frente em +Z, como o caminhão)
const modelosVeiculo = {};
function modeloVeiculo(tipo) {
  if (modelosVeiculo[tipo]) return modelosVeiculo[tipo].clone(true);
  const g = new THREE.Group();
  const m = (cor, ex = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.45, metalness: 0.3, ...ex });
  const caixa = (mat, w, h, d, x, y, z, pai = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.castShadow = true; pai.add(o); return o; };
  const vidro = m('#1b2633', { roughness: 0.1, metalness: 0.6 }), pneu = m('#1a1a1a', { roughness: 0.9, metalness: 0 });
  if (tipo === 'van') {
    const corpo = m('#f2f2ee');
    caixa(corpo, 2.0, 2.0, 3.6, 0, 1.45, -0.5); caixa(corpo, 2.0, 1.2, 1.3, 0, 1.05, 1.9);
    caixa(vidro, 1.9, 0.75, 0.6, 0, 2.0, 1.25).rotation.x = -0.5;
    for (const s of [-1, 1]) { caixa(vidro, 0.05, 0.6, 0.9, s * 1.01, 1.95, 0.9); caixa(m('#e39b3a'), 0.05, 0.35, 4.7, s * 1.02, 1.0, 0.05); }
    for (const sx of [-0.9, 0.9]) for (const sz of [-1.5, 1.6]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 14).rotateZ(Math.PI / 2), pneu); r.position.set(sx, 0.38, sz); g.add(r); }
    caixa(m('#fff6d0', { emissive: '#fff1c8', emissiveIntensity: 1.5 }), 1.6, 0.18, 0.05, 0, 1.1, 2.56);
  } else {
    const corpo = m('#23395b'), faixa = m('#f2f2ee');
    const fus = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), corpo); fus.scale.set(1.25, 1.15, 2.3); fus.position.set(0, 1.55, 0.3); fus.castShadow = true; g.add(fus);
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), vidro); cab.scale.set(1.1, 1.0, 1.4); cab.rotation.x = Math.PI / 2.2; cab.position.set(0, 1.75, 1.5); g.add(cab);
    caixa(faixa, 2.55, 0.25, 3.2, 0, 1.25, 0.2);
    const cauda = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.4, 4.6, 10).rotateX(Math.PI / 2), corpo); cauda.position.set(0, 1.9, -3.6); cauda.castShadow = true; g.add(cauda);
    caixa(corpo, 0.12, 1.3, 0.9, 0, 2.5, -5.6); caixa(faixa, 1.6, 0.1, 0.6, 0, 2.1, -5.5);
    const rotorCauda = new THREE.Group(); rotorCauda.position.set(0.2, 2.5, -5.7); g.add(rotorCauda);
    caixa(m('#333'), 0.05, 1.3, 0.12, 0, 0, 0, rotorCauda);
    for (const s of [-1, 1]) { caixa(m('#3a3d42'), 0.1, 0.1, 3.4, s * 0.95, 0.1, 0.3); for (const dz of [-0.7, 1.2]) caixa(m('#3a3d42'), 0.08, 0.6, 0.08, s * 0.85, 0.42, dz); }
    caixa(m('#3a3d42'), 0.4, 0.5, 0.4, 0, 2.85, 0.3);
    const rotor = new THREE.Group(); rotor.position.set(0, 3.15, 0.3); g.add(rotor);
    for (const a of [0, Math.PI / 2]) { const pa = caixa(m('#2b2b2b'), 0.32, 0.06, 7.6, 0, 0, 0, rotor); pa.rotation.y = a; }
    g.userData.rotor = rotor; g.userData.rotorCauda = rotorCauda;
  }
  modelosVeiculo[tipo] = g;
  return modeloVeiculo(tipo);
}
function criarVeiculo(tipo, danificado) {
  if (tipo === 'van' || tipo === 'helicoptero') {
    const o = modeloVeiculo(tipo);
    o.userData.rotor = o.children.find((k) => k.isGroup && k.position.y > 3); o.userData.rotorCauda = o.children.find((k) => k.isGroup && k.position.z < -5);
    return o;
  }
  return clonar(danificado ? 'caminhao_danificado' : 'caminhao');
}
function sincronizarCaminhao(d) {
  let c = caminhoes.get(d.id);
  if (!c) { const obj = criarVeiculo(d.tipo); scene.add(obj); c = { obj, d, roubadoVisual: false }; caminhoes.set(d.id, c); }
  c.d = d;
  // caminhão roubado volta amassado; a escolta (viatura) acompanha a viagem
  if (!!d.roubado !== c.roubadoVisual && (d.tipo || 'caminhao') === 'caminhao') {
    const novo = clonar(d.roubado ? 'caminhao_danificado' : 'caminhao');
    novo.position.copy(c.obj.position); novo.rotation.copy(c.obj.rotation);
    scene.remove(c.obj); scene.add(novo); c.obj = novo; c.roubadoVisual = !!d.roubado;
  }
  const escolta = d.escolta && d.status !== 'parado';
  if (escolta && !c.escolta) { c.escolta = clonar('viatura'); c.escolta.position.copy(c.obj.position); scene.add(c.escolta); }
  if (!escolta && c.escolta) { scene.remove(c.escolta); c.escolta = null; }
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
          if (perna.parado) { const u = anterior.pts; alvo = { ...ponto(u, 1), parado: true, y: 0.02 }; }
          else {
            const f = t / perna.dur; alvo = ponto(perna.pts, f);
            if (perna.y0 !== undefined) {   // voo: sobe, cruza a 24 m e desce
              const sobe = THREE.MathUtils.smoothstep(f, 0, 0.18), desce = 1 - THREE.MathUtils.smoothstep(f, 0.82, 1);
              alvo.y = THREE.MathUtils.lerp(perna.y0, perna.y1, f) + 24 * Math.min(sobe, desce);
            }
          }
          break;
        }
        if (!perna.parado) anterior = perna;
        t -= perna.dur;
      }
      if (!alvo && p) { const u = p[p.length - 1].pts; alvo = { ...u[u.length - 1], ang: c.obj.rotation.y }; }
      if ((c.d.status === 'em_rota' && agora > Date.parse(c.d.chegada) + 1500) || (c.d.status === 'voltando' && agora > Date.parse(c.d.retorno) + 1500)) atrasado = true;
    }
    const estacionado = !alvo;
    if (!alvo) alvo = posicaoEstacionado(c);
    if (!alvo) continue;
    if (alvo.garagem) { c.obj.visible = false; if (c.escolta) c.escolta.visible = false; c.posicionado = false; c.manobra = null; continue; }
    c.obj.visible = true; if (c.escolta) c.escolta.visible = true;
    if (!c.posicionado) { c.obj.position.set(alvo.x, alvo.y ?? 0.02, alvo.z); c.obj.rotation.y = alvo.ang || 0; c.posicionado = true; c.naFundo = !!alvo.fundo; c.vaga = alvo; }
    if (c.d.tipo === 'helicoptero') {
      // hélices giram em voo e devagar no chão; altura segue a rota
      const voando = !estacionado && !alvo.parado, ro = c.obj.userData;
      if (estacionado) c.heliporto = alvo;
      c.obj.position.y += ((alvo.y ?? 0.02) - c.obj.position.y) * Math.min(1, dt * (voando ? 20 : 6));
      if (ro.rotor) ro.rotor.rotation.y += dt * (voando ? 28 : 3);
      if (ro.rotorCauda) ro.rotorCauda.rotation.x += dt * (voando ? 40 : 4);
    }
    if (estacionado) c.vaga = alvo;
    // saindo do pátio para viajar: corredor lateral até a rua
    if (!estacionado && c.naFundo && !c.manobra && c.vaga) {
      c.manobra = { i: 0, fimFundo: false, pts: c.vaga.saida || [{ x: c.vaga.corredor, z: c.vaga.z }, { x: c.vaga.corredor, z: c.vaga.rua }] };
    }
    // voltando para a vaga do pátio: entra pelo corredor
    if (estacionado && alvo.fundo && !c.naFundo && !c.manobra && Math.hypot(alvo.x - c.obj.position.x, alvo.z - c.obj.position.z) > 1) {
      c.manobra = { i: 0, fimFundo: true, pts: alvo.entrada || [{ x: alvo.corredor, z: alvo.rua }, { x: alvo.corredor, z: alvo.z }, { x: alvo.x, z: alvo.z }] };
    }
    if (c.manobra) { andarManobra(c, dt); continue; }
    c.obj.position.x += (alvo.x - c.obj.position.x) * Math.min(1, dt * 8);
    c.obj.position.z += (alvo.z - c.obj.position.z) * Math.min(1, dt * 8);
    if (alvo.ang !== undefined) c.obj.rotation.y = suavizarAngulo(c.obj.rotation.y, alvo.ang, dt * 6);
    if (c.escolta) {
      const ry = c.obj.rotation.y, ex = c.obj.position.x - Math.sin(ry) * 7.5, ez = c.obj.position.z - Math.cos(ry) * 7.5;
      c.escolta.position.x += (ex - c.escolta.position.x) * Math.min(1, dt * 4); c.escolta.position.z += (ez - c.escolta.position.z) * Math.min(1, dt * 4);
      c.escolta.rotation.y = suavizarAngulo(c.escolta.rotation.y, ry, dt * 4);
    }
  }
  // viagens vencidas: pede ao banco para concluir (qualquer jogador pode; o banco decide)
  if (atrasado && performance.now() - ultimoProcessar > 8000) {
    ultimoProcessar = performance.now();
    rede.logistica.processar().catch(() => {});
  }
}

const helisPorEmpresa = new Map();
async function carregarLogistica() {
  const [lista, frota, unis, emp] = await Promise.all([rede.listarEmpresas(), rede.listarCaminhoes(), rede.listarUnidades(), rede.minhaEmpresaId(jogador.perfil.id)]);
  emprego = emp;
  // lotes que mudaram (dono, nome, nível, robôs, estoque) são redesenhados
  const assinatura = (lote) => { const u = unidades.get(lote); const e = u && empresas.get(u.empresa);
    return u ? `${u.empresa}|${u.funcao}|${e?.nome}|${e?.nivel}|${e?.estoque}|${e && robosAtivos(e)}|${helisPorEmpresa.get(u.empresa) || 0}` : ''; };
  const antes = new Map(LOTES_VENDA.map((l) => [l.id, visuaisLote.has(l.id) ? assinatura(l.id) : null]));
  helisPorEmpresa.clear(); for (const k of frota) if (k.tipo === 'helicoptero') helisPorEmpresa.set(k.empresa, (helisPorEmpresa.get(k.empresa) || 0) + 1);
  empresas.clear(); for (const e of lista) empresas.set(e.id, e);
  unidades.clear(); for (const u of unis) unidades.set(u.lote, u);
  let mudou = false;
  for (const l of LOTES_VENDA) if (antes.get(l.id) !== assinatura(l.id)) { desenharLote(l); mudou = true; }
  if (mudou) desenharFundoMapa();
  const ids = new Set(frota.map((c) => c.id));
  for (const [id, c] of caminhoes) if (!ids.has(id)) { scene.remove(c.obj); if (c.escolta) scene.remove(c.escolta); caminhoes.delete(id); }
  for (const c of frota) sincronizarCaminhao(c);
}

let tempoLogistica = 0, tempoProcessar = 60;
function atualizarLogistica(dt) {
  tempoLogistica -= dt; tempoProcessar -= dt;
  if (tempoLogistica <= 0) { tempoLogistica = 10; carregarLogistica().catch(() => {}); }
  // mantém robôs produzindo e viagens fechando mesmo sem ninguém abrir a empresa
  if (tempoProcessar <= 0) { tempoProcessar = 60; rede.logistica.processar().catch(() => {}); }
}

async function iniciarLogistica() {
  try {
    const t0 = Date.now(); const srv = await rede.logistica.agora(); const t1 = Date.now();
    offsetServidor = Date.parse(srv) - (t0 + t1) / 2;
  } catch { offsetServidor = 0; }
  try { await carregarLogistica(); } catch (e) { console.warn('logística', e); for (const l of LOTES_VENDA) desenharLote(l); }
  const recarregar = () => { tempoLogistica = Math.min(tempoLogistica, 0.3); };
  rede.escutarLogistica({
    empresa: () => { recarregar(); atualizarJanelaEmpresa(); },
    unidade: () => recarregar(),
    caminhao: ({ eventType, new: n }) => { if (eventType !== 'DELETE') sincronizarCaminhao(n); else recarregar(); },
    membro: () => { recarregar(); atualizarJanelaEmpresa(); },
    pedido: () => atualizarJanelaEmpresa(),
    territorio: () => { tempoSocial = Math.min(tempoSocial, 0.3); atualizarCla(); },
    casa: () => { tempoSocial = Math.min(tempoSocial, 0.3); },
    cla: () => { tempoSocial = Math.min(tempoSocial, 0.3); atualizarCla(); },
  });
}

// ---------------------------------------------------------------- tarefas das empresas dos jogadores
async function embalarFabrica(b) {
  if (!trabalhoEm(b.empresa)) { aviso(`Bancada da ${empresas.get(b.empresa)?.nome || 'empresa'}. Peça emprego ao dono para trabalhar aqui.`, 3.5); return; }
  if (ocupado) return; ocupado = true;
  try {
    const pago = await rede.logistica.embalar(b.empresa);
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
    // empresas em que posso levar carga: as minhas com frota e a do meu emprego
    const candidatas = [...empresas.values()].filter((e) => (e.dono === jogador.perfil.id && (e.transporte || e.nivel >= 3)) || (e.id === emprego && e.transporte));
    if (!candidatas.length) { aviso('Só quem trabalha em transportadora retira cargas aqui.'); return; }
    let pd = null;
    for (const e of candidatas) {
      const aceitos = await rede.pedidosAceitosDe(e.id);
      pd = aceitos.find((p) => p.fabrica === dep.empresa && p.qtd - p.entregues - p.em_transito > 0);
      if (pd) break;
    }
    if (!pd) { aviso('Não há pedido aceito desta fábrica para a sua transportadora.', 3.5); return; }
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

// ================================================================= COMBATE (etapa 5)
const SKIN_POLICIA = 'Rustbolt_Sentinel';
const skinAtual = () => (jogador.perfil?.policial ? SKIN_POLICIA : jogador.perfil?.personagem);
function metaPresenca() {
  const p = jogador.perfil;
  return { nome: p.nome, personagem: skinAtual(), cargo: p.cargo, crimes: p.crimes || 0, policial: !!p.policial, cla: jogador.claInfo?.nome || null };
}
// etiqueta acima do nome: procurado, polícia ou clã
function etiquetaStatus(r) {
  if (!r.av) return;
  if (r.status) { r.av.raiz.remove(r.status); r.status = null; }
  const m = r.meta;
  const txt = m.crimes > 0 ? `PROCURADO ${'★'.repeat(Math.min(5, m.crimes))}` : m.policial ? 'POLÍCIA' : m.cla ? `[${m.cla}]` : null;
  if (!txt) return;
  r.status = textoSprite(txt, { escala: 0.6, cor: '#ffffff', fundo: m.crimes > 0 ? 'rgba(170,30,30,.92)' : m.policial ? 'rgba(30,70,160,.92)' : 'rgba(40,40,40,.85)' });
  r.status.position.y = 2.6; r.av.raiz.add(r.status);
}

function aplicarDanoRemoto(id, valor) {
  conexao?.enviar('dano', { alvo: id, v: valor, de: jogador.perfil.id });
  const ultimo = jogador.agredidos.get(id) || 0;
  if (performance.now() - ultimo > 60000) { jogador.agredidos.set(id, performance.now()); rede.combate.agressao(id).catch(() => {}); }
}
function golpeSoco() {
  const f = new THREE.Vector3(Math.sin(jogador.yaw), 0, Math.cos(jogador.yaw));
  for (const [id, r] of remotos) {
    if (!r.av?.raiz.visible) continue;
    const d = new THREE.Vector3().subVectors(r.av.raiz.position, jogador.pos); d.y = 0;
    const dist = d.length();
    if (dist < 1.7 && dist > 0.01 && d.normalize().dot(f) > 0.5) { aplicarDanoRemoto(id, 10); return; }
  }
  const c = caminhaoProximo(3.4);
  if (c) atacarCaminhao(c);
}
function acertoDaBola(b) {
  const p = b.m.position;
  for (const [id, r] of remotos) {
    if (!r.av?.raiz.visible) continue;
    const q = r.av.raiz.position;
    if (Math.hypot(p.x - q.x, p.z - q.z) < 0.5 && p.y > q.y + 0.1 && p.y < q.y + 1.9) {
      aplicarDanoRemoto(id, 20); manchar(p.clone(), new THREE.Vector3(0, 1, 0), b.cor); return true;
    }
  }
  for (const c of caminhoes.values()) {
    if (c.d.status !== 'em_rota' || c.d.roubado) continue;
    if (Math.hypot(p.x - c.obj.position.x, p.z - c.obj.position.z) < 2.3 && p.y < 3.5) {
      atacarCaminhao(c); manchar(p.clone(), new THREE.Vector3(0, 1, 0), b.cor); return true;
    }
  }
  return false;
}
function caminhaoProximo(raio) {
  let melhor = null, dm = raio;
  for (const c of caminhoes.values()) {
    if (c.d.status !== 'em_rota' || c.d.roubado || c.d.tipo === 'helicoptero') continue;
    const d = Math.hypot(c.obj.position.x - jogador.pos.x, c.obj.position.z - jogador.pos.z);
    if (d < dm) { dm = d; melhor = c; }
  }
  return melhor;
}
let ultimoAtaqueCaminhao = 0;
async function atacarCaminhao(c) {
  if (performance.now() - ultimoAtaqueCaminhao < 950) return;
  ultimoAtaqueCaminhao = performance.now();
  try {
    const vida = await rede.combate.atacarCaminhao(c.d.id);
    if (vida > 0) aviso(`Caminhão: ${vida} de vida`, 1.2);
    else if (vida === 0) { aviso('Carga roubada!', 3); tempoLogistica = 0; }
  } catch (e) { aviso(e.message); }
}

function receberDano(d) {
  if (d.alvo !== jogador.perfil?.id || jogador.morto || !jogador.avatar) return;
  if (jogador.perfil.imortal || jogador.pena > 0) return;
  const r = remotos.get(d.de);
  if (!r?.av || r.av.raiz.position.distanceTo(jogador.pos) > 30) return;     // golpe de longe demais: ignora
  const v = Math.max(0, Math.min(25, Number(d.v) || 0));
  jogador.vida -= v; jogador.ultimoAgressor = d.de;
  desenharFome();
  if (jogador.vida <= 0) { morrerLocal(); return; }
  if (jogador.trava <= 0) { jogador.avatar.tocar('hit', { umaVez: true, velocidade: 1.4, fade: 0.08 }); jogador.trava = 0.45; }
}

async function morrerLocal() {
  const j = jogador; j.morto = true; j.vida = 0; j.alvo = null;
  if (j.armado) alternarArmaForcado(false);
  if (j.carregando) { scene.remove(j.carregando); j.carregando = null; }
  j.avatar.tocar('death', { umaVez: true, velocidade: 1, fade: 0.1 });
  j.trava = 5;
  const quem = remotos.get(j.ultimoAgressor)?.meta.nome;
  try {
    const perdeu = await rede.combate.morrer(j.ultimoAgressor || null);
    aviso(`Você morreu${quem ? ' para ' + quem : ''}.${perdeu ? ` Perdeu ${perdeu} moedas.` : ''} Renascendo…`, 4.5);
  } catch { aviso('Você morreu. Renascendo…', 4.5); }
  setTimeout(renascer, 5000);
}
function renascer() {
  const j = jogador;
  const destino = j.casa ? { x: j.casa.x + 2, z: j.casa.z } : { x: contratante.x + 6, z: contratante.z + 6 };
  teleportar(destino.x, destino.z);
  j.vida = 100; j.morto = false; j.trava = 0; j.ultimoAgressor = null;
  j.avatar.tocar('idle', { fade: 0.3 }); desenharFome();
  aviso(j.casa ? 'Você renasceu em casa.' : 'Você renasceu na praça.');
}

async function usarRemedio() {
  if (jogador.vida >= 100) { aviso('Sua vida já está cheia.'); return false; }
  await rede.combate.usarRemedio();
  jogador.vida = Math.min(100, jogador.vida + 50); desenharFome();
  return true;
}

// ================================================================= POLÍCIA (etapa 6)
async function criarPoliciaNPC() {
  if (!cadeia) return;
  const d = QB / 2 - 1.1, cx = quadC(1), cz = quadC(1);
  const rotas = [[[cx - d, cz + d], [cx + d, cz + d], [cx + d, cz - d], [cx - d, cz - d]], [[cx + d, cz - d], [cx + d, cz + d], [cx - d, cz + d], [cx - d, cz - d]]];
  for (const rota of rotas) {
    try {
      const av = await criarAvatar('robos', SKIN_POLICIA);
      av.raiz.position.set(rota[0][0], 0.18, rota[0][1]); scene.add(av.raiz); av.tocar('walk', { velocidade: 0.85 });
      const et = textoSprite('Polícia', { escala: 0.6, fundo: 'rgba(30,70,160,.92)' }); et.position.y = 2.2; av.raiz.add(et);
      npcs.push({ av, rota, i: 1, vel: 1.5 });
    } catch { /* sem policiais NPC */ }
  }
}
function pertoDelegacia() { return pontos.delegacia && Math.hypot(pontos.delegacia.x - jogador.pos.x, pontos.delegacia.z - jogador.pos.z) < 3.2; }
async function alternarServico() {
  if (ocupado) return; ocupado = true;
  try {
    if (jogador.perfil.policial) { const pago = await rede.policia.sair(); aviso(`Fim do expediente.${pago ? ` +${pago} moedas` : ''}`); }
    else await rede.policia.entrar();
  } catch (e) { aviso(e.message, 3.5); }
  finally { ocupado = false; }
}
function procuradoProximo(raio) {
  let melhor = null, dm = raio;
  for (const [id, r] of remotos) {
    if (!r.av?.raiz.visible || !(r.meta.crimes > 0)) continue;
    const d = r.av.raiz.position.distanceTo(jogador.pos);
    if (d < dm) { dm = d; melhor = { id, r }; }
  }
  return melhor;
}
async function prenderProcurado(alvo) {
  if (ocupado) return; ocupado = true;
  try {
    virarPara(alvo.r.av.raiz.position.x, alvo.r.av.raiz.position.z);
    jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 2, fade: 0.1 }); jogador.trava = 0.9;
    const min = await rede.policia.prender(alvo.id);
    aviso(`${alvo.r.meta.nome} foi algemado e preso por ${min} min. +800 moedas`, 4);
  } catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}
let tempoSalarioPolicia = 180;
function atualizarPolicia(dt) {
  if (jogador.perfil?.policial) {
    tempoSalarioPolicia -= dt;
    if (tempoSalarioPolicia <= 0) { tempoSalarioPolicia = 180; rede.policia.salario().then((v) => { if (v > 0) aviso(`Salário da polícia: +${v} moedas`); }).catch(() => {}); }
  }
  const f = $('btFianca');
  const preso = jogador.pena > 0 && jogador.perfil?.fianca > 0;
  f.classList.toggle('oculto', !preso);
  if (preso) f.textContent = `Pagar fiança (${jogador.perfil.fianca.toLocaleString('pt-BR')})`;
}

// ================================================================= TERRITÓRIOS E CASAS (etapa 7)
const territorios = new Map();   // id -> { d, anel, placa }
const casasMundo = new Map();    // id -> { d, placa }
let captura = null;              // { id, fim }
function corDoCla(id) { return clasCache.get(id)?.cor || '#888888'; }
const clasCache = new Map();
// ---------------------------------------------------------------- base do clã cresce com o nível: muralha (5), torres (10), fortaleza (15)
function removerFortaleza(v) {
  if (!v.forte) return;
  scene.remove(v.forte.g);
  for (const c of v.forte.cols) { const i = colisores.indexOf(c); if (i >= 0) colisores.splice(i, 1); }
  v.forte = null;
}
function montarFortaleza(v, t, nivel, cor) {
  const g = new THREE.Group(), cols = [], R = 18.5, f = nivel >= 15 ? 3 : nivel >= 10 ? 2 : 1;
  const pedra = new THREE.MeshStandardMaterial({ color: '#8d8a83', roughness: 0.9 });
  const corM = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.6 });
  const H = f === 3 ? 4.2 : 2.6;
  const portao = Math.atan2(0, -Math.sign(t.x));               // o portão fica virado para a cidade
  const N = 12;
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
    if (Math.abs(Math.atan2(Math.sin(am - portao), Math.cos(am - portao))) < 0.3) continue;
    const x0 = Math.cos(a0) * R, z0 = Math.sin(a0) * R, x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R, len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len + 0.3, H, 0.9), pedra);
    m.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); m.castShadow = true; m.receiveShadow = true; g.add(m);
    const faixa = new THREE.Mesh(new THREE.BoxGeometry(len + 0.32, 0.35, 0.95), corM); faixa.position.set(m.position.x, H - 0.2, m.position.z); faixa.rotation.y = m.rotation.y; g.add(faixa);
    if (f === 3) for (let q = -len / 2 + 0.6; q < len / 2; q += 1.4) {
      const ameia = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1), pedra);
      ameia.position.set(m.position.x + Math.cos(-m.rotation.y) * q, H + 0.35, m.position.z + Math.sin(-m.rotation.y) * q); ameia.rotation.y = m.rotation.y; ameia.castShadow = true; g.add(ameia);
    }
    for (let q = 0; q <= 1; q += 0.1) cols.push({ tipo: 'circ', x: t.x + x0 + (x1 - x0) * q, z: t.z + z0 + (z1 - z0) * q, r: 0.65 });
  }
  if (f >= 2) {
    const nt = f === 3 ? 8 : 4;
    for (let k = 0; k < nt; k++) {
      const a = portao + Math.PI / nt + (k / nt) * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R, th = f === 3 ? 9 : 6.5;
      const torre = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, th, 10), pedra); torre.position.set(x, th / 2, z); torre.castShadow = true; g.add(torre);
      const teto = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.4, 10), corM); teto.position.set(x, th + 1.2, z); teto.castShadow = true; g.add(teto);
      cols.push({ tipo: 'circ', x: t.x + x, z: t.z + z, r: 1.5 });
    }
  }
  if (f === 3) {
    // mastro com a bandeira do clã no centro
    const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 16, 8), new THREE.MeshStandardMaterial({ color: '#d8d8d8', metalness: 0.6, roughness: 0.3 }));
    mastro.position.set(-Math.sign(t.x) * 8, 8, 8); g.add(mastro);
    const band = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshStandardMaterial({ color: cor, side: THREE.DoubleSide, roughness: 0.7 }));
    band.position.set(mastro.position.x + 2, 14.6, 8); g.add(band);
  }
  g.position.set(t.x, 0, t.z); scene.add(g);
  colisores.push(...cols);
  v.forte = { g, cols };
}
async function carregarCidadeSocial() {
  const [ts, cs, clas, meuCla] = await Promise.all([rede.listarTerritorios(), rede.listarCasas(), rede.listarClas(), rede.meuClaId(jogador.perfil.id)]);
  clasCache.clear(); for (const c of clas) clasCache.set(c.id, c);
  const info = clasCache.get(meuCla) || null;
  if ((info?.nome || null) !== (jogador.claInfo?.nome || null)) { jogador.claInfo = info; conexao?.rastrear(metaPresenca()); }
  jogador.cla = meuCla; jogador.claInfo = info;
  for (const t of ts) {
    let v = territorios.get(t.id);
    const nome = t.dono_cla ? clasCache.get(t.dono_cla)?.nome || 'clã' : null;
    const nivelCla = t.dono_cla ? clasCache.get(t.dono_cla)?.nivel || 1 : 0;
    const chave = `${t.dono_cla}|${t.defesa}|${nome}|${nivelCla}`;
    if (v && v.chave === chave) { v.d = t; continue; }
    if (v) { scene.remove(v.placa); removerFortaleza(v); }
    else {
      const anel = new THREE.Mesh(new THREE.RingGeometry(23, 24, 64), new THREE.MeshBasicMaterial({ color: '#888888', transparent: true, opacity: 0.6 }));
      anel.rotation.x = -Math.PI / 2; anel.position.set(t.x, 0.05, t.z); scene.add(anel);
      v = { anel }; territorios.set(t.id, v);
      if (!itensMapa.some((it) => it.tipo === 'territorio' && it.x === t.x && it.z === t.z)) { itensMapa.push({ tipo: 'territorio', x: t.x, z: t.z, r: 23 }); tempoFundoMapa = 0.5; }
    }
    v.d = t; v.chave = chave;
    v.anel.material.color.set(t.dono_cla ? corDoCla(t.dono_cla) : '#888888');
    v.placa = textoSprite(nome ? `${t.nome}: ${nome}${t.defesa ? ` · ${t.defesa} robôs` : ''}` : `${t.nome}: livre`, { escala: 1.05, cor: '#ffd9a0' });
    v.placa.position.set(t.x, 13.5, t.z); scene.add(v.placa);
    if (t.dono_cla && nivelCla >= 5) montarFortaleza(v, t, nivelCla, corDoCla(t.dono_cla));
  }
  const eu = jogador.perfil.id, agoraMs = agoraServidor();
  const ativo = (u) => u.inquilino && Date.parse(u.pago_ate) > agoraMs;
  const livresDe = (pai) => cs.filter((u) => u.pai === pai && !u.dono && !ativo(u) && (u.aluguel || u.a_venda)).length;
  for (const c of cs) {
    let v = casasMundo.get(c.id);
    const chave = `${c.dono}|${c.dono_perfil?.nome}|${c.modelo}|${c.nivel}|${c.tipo === 'terreno' ? livresDe(c.id) : ''}`;
    if (v && v.chave === chave) { v.d = c; continue; }
    if (v) { if (v.placa) scene.remove(v.placa); removerCasaTerreno(v); }
    v = { d: c, chave }; casasMundo.set(c.id, v);
    const minha = c.dono === eu, tipo = c.tipo || 'casa';
    if (tipo === 'apto' || tipo === 'unidade') continue;          // o prédio tem uma placa só
    let texto, fundo = c.dono ? (minha ? 'rgba(30,110,60,.92)' : 'rgba(40,40,40,.85)') : 'rgba(30,90,50,.9)';
    const ESTAGIO = ['', 'Casa', 'Casa', 'Condomínio', 'Residencial', 'Torre residencial'];
    if (tipo === 'terreno' && c.dono && (c.nivel || 1) >= 3) {
      const l = livresDe(c.id);
      texto = `${ESTAGIO[c.nivel]} de ${minha ? 'você' : c.dono_perfil?.nome || '?'}${l ? ` · ${l} apto${l > 1 ? 's' : ''} livre${l > 1 ? 's' : ''}` : ''}`;
      fundo = minha ? 'rgba(30,110,60,.92)' : l ? 'rgba(30,60,90,.9)' : 'rgba(40,40,40,.85)';
    } else if (tipo === 'terreno') texto = !c.dono ? `${c.rotulo} à venda · ${num(c.preco)}` : minha ? (c.modelo ? 'Sua casa' : 'Seu terreno · construa aqui') : `${c.modelo ? 'Casa' : 'Terreno'} de ${c.dono_perfil?.nome || '?'}`;
    else texto = c.dono ? (minha ? 'Sua casa' : `Casa de ${c.dono_perfil?.nome || '?'}`) : 'Casa à venda · 35.000';
    v.placa = textoSprite(texto, { escala: 0.6, fundo });
    v.placa.position.set(c.x + 0.5, tipo === 'terreno' ? 3 + ((c.nivel || 1) >= 3 ? 1.5 : 0) : 2.4, c.z); scene.add(v.placa);
    if (tipo === 'terreno' && c.modelo) desenharCasaTerreno(v);
  }
  // uma placa por prédio de apartamentos
  const torres = new Map();
  for (const c of cs) if (c.tipo === 'apto') { const k = `${c.x},${c.z}`; if (!torres.has(k)) torres.set(k, []); torres.get(k).push(c); }
  for (const [k, lista] of torres) {
    const meu = lista.find((c) => c.dono === eu), livres = lista.filter((c) => !c.dono).length;
    const predio = lista[0].rotulo?.split(' · ')[0] || 'Edifício';
    const texto = meu ? `${predio} · seu apto ${meu.rotulo.split('Apto ')[1] || ''}` : livres ? `${predio} · ${livres} aptos livres · ${num(lista[0].preco)}` : `${predio} · lotado`;
    const t = placasTorre.get(k);
    if (t?.texto === texto) continue;
    if (t) scene.remove(t.placa);
    const placa = textoSprite(texto, { escala: 0.7, fundo: meu ? 'rgba(30,110,60,.92)' : 'rgba(30,60,90,.9)' });
    placa.position.set(lista[0].x, 4.6, lista[0].z); scene.add(placa);
    placasTorre.set(k, { placa, texto });
  }
  const minha = cs.find((c) => c.dono === eu);
  jogador.casa = minha ? { x: minha.x, z: minha.z } : null;
  jogador.moradias = cs.filter((c) => c.dono === eu || (c.inquilino === eu && ativo(c))).length;
  casasLista = cs;
}
let portaAberta = null, casasLista = [];
const moraEm = (d) => d && (d.dono === jogador.perfil.id || (d.inquilino === jogador.perfil.id && Date.parse(d.pago_ate) > agoraServidor()));
const placasTorre = new Map();
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
// casa construída num terreno (simples, sobrado ou mansão), de frente para a rua
function removerCasaTerreno(v) {
  if (!v.casa) return;
  scene.remove(v.casa.g);
  const i = predios.indexOf(v.casa.pr); if (i >= 0) predios.splice(i, 1);
  for (const c of v.casa.cols) { const k = colisores.indexOf(c); if (k >= 0) colisores.splice(k, 1); }
  v.casa = null;
}
function desenharCasaTerreno(v) {
  const c = v.d, sz = Math.sign(c.z - (c.z > 0 ? 81 : -81)) || 1;       // lado da rua
  const cx = c.x, cz = c.z - sz * 11;                                   // centro do lote (19 x 19)
  const g = new THREE.Group(), cols = [];
  const cores = { simples: ['#f0dfc0', '#a5502f'], sobrado: ['#d6e4ee', '#4f5a63'], mansao: ['#f7f4ec', '#3d3a36'] }[c.modelo];
  const parede = new THREE.MeshStandardMaterial({ color: cores[0], roughness: 0.8 });
  const telha = new THREE.MeshStandardMaterial({ color: cores[1], roughness: 0.7 });
  const vidro = new THREE.MeshStandardMaterial({ color: '#2b3d4f', roughness: 0.1, metalness: 0.5, emissive: '#ffcf7a', emissiveIntensity: 0 });
  const madeira = new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.7 });
  const bloco = (mat, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const telhado = (w, d, y, x = 0, z = 0) => {
    const geo = new THREE.CylinderGeometry(0, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
    const m = new THREE.Mesh(geo, telha); m.scale.set(w + 0.8, 2.4, d + 0.8); m.position.set(x, y + 1.2, z); m.castShadow = true; g.add(m);
  };
  const janelas = (w, d, y, x = 0, z = 0) => { for (const dx of [-w / 3, w / 3]) bloco(vidro, 1.6, 1.3, 0.08, x + dx, y, z + d / 2 + 0.03); };
  const nivel = c.nivel || 1;
  const concreto = new THREE.MeshStandardMaterial({ color: '#cfc9bd', roughness: 0.85 });
  const guarda = new THREE.MeshStandardMaterial({ color: '#9fc0d8', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.45 });
  // fachada de prédio: andares com janelas, varandas na frente e laje no topo
  const predio = (w, d, andares, x, z, comVaranda) => {
    const h = andares * 3.2;
    bloco(parede, w, h, d, x, h / 2, z);
    for (let a = 0; a < andares; a++) {
      const y = a * 3.2 + 1.7;
      for (let k = 0; k < Math.floor(w / 3); k++) {
        const wx = x - w / 2 + 1.5 + k * 3 + (w % 3) / 2;
        bloco(vidro, 1.8, 1.5, 0.08, wx, y, z + d / 2 + 0.03);
        bloco(vidro, 0.08, 1.5, 1.8, x + w / 2 + 0.03, y, z - d / 2 + 1.5 + (k % Math.max(1, Math.floor(d / 3))) * 3);
        bloco(vidro, 0.08, 1.5, 1.8, x - w / 2 - 0.03, y, z - d / 2 + 1.5 + (k % Math.max(1, Math.floor(d / 3))) * 3);
      }
      if (comVaranda && a > 0) { bloco(concreto, w * 0.8, 0.18, 1.3, x, a * 3.2 + 0.1, z + d / 2 + 0.65); bloco(guarda, w * 0.8, 1.0, 0.06, x, a * 3.2 + 0.7, z + d / 2 + 1.28); }
    }
    bloco(concreto, w + 0.5, 0.5, d + 0.5, x, h + 0.25, z);
    return h;
  };
  if (nivel >= 3) {
    if (nivel === 3) {
      // condomínio: 4 sobradinhos, muro e portaria
      for (const [dx, dz] of [[-4.6, -4.8], [4.6, -4.8], [-4.6, 2.2], [4.6, 2.2]]) {
        bloco(parede, 8, 6.2, 5.6, dx, 3.1, dz); telhado(8, 5.6, 6.2, dx, dz); janelas(8, 5.6, 1.8, dx, dz); janelas(8, 5.6, 4.8, dx, dz);
        bloco(madeira, 1, 2.1, 0.1, dx, 1.05, dz + 2.85);
      }
      for (const sx of [-1, 1]) bloco(concreto, 7.5, 1.6, 0.25, sx * 5.6, 0.8, 8.9);
      bloco(concreto, 0.25, 1.6, 18, -9.2, 0.8, 0); bloco(concreto, 0.25, 1.6, 18, 9.2, 0.8, 0); bloco(concreto, 18.6, 1.6, 0.25, 0, 0.8, -9);
      bloco(parede, 2.4, 2.6, 2.4, 3, 1.3, 7.4); bloco(vidro, 1.6, 1, 0.08, 3, 1.8, 8.62);
    } else {
      const andares = nivel === 4 ? 4 : 12, h = predio(15, 11.5, andares, 0, -1.5, true);
      // portaria de vidro com marquise
      bloco(vidro, 4.5, 2.6, 0.1, 0, 1.3, 4.35);
      bloco(concreto, 7, 0.25, 3, 0, 3, 5.6);
      if (nivel === 5) {
        bloco(telha, 15.6, 2.2, 12.1, 0, h + 1.5, -1.5);                                          // coroa colorida
        const jardim = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 7), new THREE.MeshStandardMaterial({ color: '#5b8c3e', roughness: 1 }));
        jardim.position.set(0, h + 0.65, -1.5); g.add(jardim);
      } else bloco(new THREE.MeshStandardMaterial({ color: '#6b7075', roughness: 0.6 }), 3, 2, 3, 4, h + 1.5, -4);   // caixa d'água
    }
  } else if (c.modelo === 'simples') {
    bloco(parede, 9, 3.2, 8, 0, 1.6, 0); telhado(9, 8, 3.2); janelas(9, 8, 1.8);
    bloco(madeira, 1.1, 2.2, 0.1, 0, 1.1, 4.05); bloco(madeira, 9, 0.15, 2.2, 0, 2.9, 5);
    for (const dx of [-4.2, 4.2]) bloco(madeira, 0.2, 2.8, 0.2, dx, 1.4, 5.9);
  } else if (c.modelo === 'sobrado') {
    bloco(parede, 10, 6.4, 9, -1, 3.2, -0.5); telhado(10, 9, 6.4, -1, -0.5); janelas(10, 9, 1.8, -1, -0.5); janelas(10, 9, 5, -1, -0.5);
    bloco(madeira, 1.2, 2.3, 0.1, -1, 1.15, 4.05);
    bloco(parede, 5, 3, 6, 6.2, 1.5, 0.5); bloco(new THREE.MeshStandardMaterial({ color: '#5d636b', roughness: 0.6 }), 4, 2.5, 0.1, 6.2, 1.25, 3.55);
  } else {
    bloco(parede, 13, 3.6, 9, -1.5, 1.8, -2.5); bloco(parede, 8, 3.6, 7, -4, 5.4, -3.5);
    bloco(new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.5 }), 13.4, 0.3, 9.4, -1.5, 3.7, -2.5);
    bloco(new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.5 }), 8.4, 0.3, 7.4, -4, 7.3, -3.5);
    for (const dx of [-6, -2.5, 1, 4]) bloco(vidro, 2.6, 2.6, 0.08, dx, 1.8, 2.05);
    for (const dx of [-6, -2]) bloco(vidro, 2.6, 2.4, 0.08, dx, 5.4, 0.05);
    const piscina = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 3.4), new THREE.MeshStandardMaterial({ color: '#3fa3d6', roughness: 0.1, metalness: 0.2 }));
    piscina.position.set(4.5, 0.06, 5.2); g.add(piscina);
    bloco(new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.8 }), 7, 0.08, 4.4, 4.5, 0.03, 5.2).position.y = 0.02;
    for (const dx of [-7.5, 7.5]) { const a = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), new THREE.MeshStandardMaterial({ color: '#4f7f3a', flatShading: true })); a.position.set(dx, 2.6, 7); a.castShadow = true; g.add(a); bloco(madeira, 0.25, 2, 0.25, dx, 1, 7); }
  }
  if (nivel === 2) {
    // casa ampliada: garagem, muro baixo e jardim
    bloco(concreto, 18.6, 1.1, 0.2, 0, 0.55, 9);
    bloco(new THREE.MeshStandardMaterial({ color: '#5d636b', roughness: 0.6 }), 4.4, 2.6, 5.2, -6.6, 1.3, 5.5);
    const gr = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 3), new THREE.MeshStandardMaterial({ color: '#5b8c3e', roughness: 1 })); gr.position.set(3.5, 0.05, 7.2); g.add(gr);
    g.scale.setScalar(1.06);
  }
  g.position.set(cx, 0.18, cz); g.rotation.y = sz > 0 ? 0 : Math.PI; scene.add(g); g.updateMatrixWorld(true);
  const caixa = new THREE.Box3().setFromObject(g);
  const col = { tipo: 'caixa', x0: caixa.min.x + 0.3, x1: caixa.max.x - 0.3, z0: caixa.min.z + 0.3, z1: caixa.max.z - 0.3 };
  colisores.push(col); cols.push(col);
  const mats = []; g.traverse((o) => { if (o.isMesh) mats.push(o.material); });
  const pr = { obj: g, caixa, mats, opac: 1 }; predios.push(pr);
  luzesCasas.push(vidro);
  v.casa = { g, pr, cols };
}
const luzesCasas = [];
function casaProxima(raio) {
  let melhor = null, dm = raio;
  for (const v of casasMundo.values()) { const d = Math.hypot(v.d.x - jogador.pos.x, v.d.z - jogador.pos.z); if (d < dm) { dm = d; melhor = v.d; } }
  return melhor;
}
let confirmaCasa = 0;
// apartamentos do mesmo prédio dividem a porta: escolhe o meu ou o primeiro livre
function unidadeNaPorta(c) {
  if (c.tipo === 'terreno' || c.tipo === 'unidade') {
    const pai = c.tipo === 'unidade' ? c.pai : c.id;
    const minhaU = casasLista.find((u) => u.pai === pai && moraEm(u));
    if (minhaU) return minhaU;
    return casasMundo.get(pai)?.d || c;
  }
  if (c.tipo !== 'apto') return c;
  const lista = [...casasMundo.values()].map((v) => v.d).filter((d) => d.tipo === 'apto' && d.x === c.x && d.z === c.z);
  return lista.find((d) => d.dono === jogador.perfil.id) || lista.find((d) => !d.dono) || c;
}
function nomeMoradia(c) { return c.tipo === 'apto' || c.tipo === 'unidade' ? 'apartamento' : c.tipo === 'terreno' ? (c.modelo ? 'imóvel' : 'terreno') : 'casa'; }
async function acaoCasa(c0) {
  const c = unidadeNaPorta(c0);
  if (moraEm(c)) { portaAberta = c.id; abrirJanela('porta'); return; }
  if (c.tipo === 'terreno' && c.dono && (c.nivel || 1) >= 3) { portaAberta = c.id; abrirJanela('predio'); return; }
  if (c.dono) { aviso(c.tipo === 'apto' ? 'Prédio lotado: todos os apartamentos têm dono.' : `${nomeMoradia(c)} de ${c.dono_perfil?.nome || 'outro jogador'}. A porta está trancada.`); return; }
  if (jogador.moradias >= 3) { aviso('Você já tem 3 moradias. Para vender uma, toque na porta dela e escolha Vender.', 4); return; }
  if (performance.now() - confirmaCasa > 3000) { confirmaCasa = performance.now(); aviso(`${c.rotulo || 'Casa'} à venda por ${num(c.preco)}. Aperte de novo para comprar.`, 3); return; }
  confirmaCasa = 0;
  try {
    await rede.casas.comprar(c.id); tempoSocial = 0;
    aviso(c.tipo === 'terreno' ? 'Terreno comprado! Toque na placa de novo para construir a casa.' : `${c.tipo === 'apto' ? 'Apartamento' : 'Casa'} comprado! Agora você renasce aqui.`, 4);
  } catch (e) { aviso(e.message); }
}
function territorioAtual() {
  for (const v of territorios.values()) if (Math.hypot(v.d.x - jogador.pos.x, v.d.z - jogador.pos.z) < 23) return v.d;
  return null;
}
async function atualizarCaptura() {
  const el = $('captura');
  const t = territorioAtual();
  if (!t || !jogador.cla || t.dono_cla === jogador.cla || jogador.morto || jogador.pena > 0) {
    if (captura) { captura = null; }
    el.classList.add('oculto');
    if (t && jogador.cla && t.dono_cla === jogador.cla) { el.textContent = `${t.nome} é do seu clã`; el.classList.remove('oculto'); }
    return;
  }
  if (!captura || captura.id !== t.id) {
    captura = { id: t.id, fim: null, total: 0, pedindo: true };
    try { const seg = await rede.cla.iniciarCaptura(t.id); captura.total = seg; captura.fim = performance.now() + seg * 1000; }
    catch (e) { aviso(e.message); captura = { id: t.id, fim: Infinity, total: 0 }; }
  }
  if (!captura.fim || captura.fim === Infinity) { el.textContent = 'Captura indisponível agora'; el.classList.remove('oculto'); return; }
  const falta = Math.max(0, (captura.fim - performance.now()) / 1000);
  el.innerHTML = `Capturando ${t.nome}… ${Math.ceil(falta)} s<i style="width:${(100 * (1 - falta / captura.total)).toFixed(0)}%"></i>`;
  el.classList.remove('oculto');
  if (falta <= 0 && !captura.concluindo) {
    captura.concluindo = true;
    try { await rede.cla.concluirCaptura(t.id); aviso(`O ${t.nome} agora é do seu clã!`, 4); tempoSocial = 0; }
    catch (e) { aviso(e.message); captura.fim = performance.now() + 5000; captura.concluindo = false; }
  }
}
let tempoFundoMapa = 0;
let tempoSocial = 0, tempoCaptura = 0;
function atualizarSocial(dt) {
  tempoSocial -= dt; tempoCaptura -= dt;
  if (tempoFundoMapa > 0) { tempoFundoMapa -= dt; if (tempoFundoMapa <= 0) desenharFundoMapa(); }
  if (tempoSocial <= 0) { tempoSocial = 15; carregarCidadeSocial().catch(() => {}); rede.cla.processar().catch(() => {}); rede.casas.processarAlugueis().catch(() => {}); }
  if (tempoCaptura <= 0) { tempoCaptura = 0.5; atualizarCaptura(); }
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
  for (const l of ferrovia.linhas) for (const lado of ['centro', 'destino']) { const p = l.plataformas[lado]; LOCAIS.push({ nome: p.nome, x: 0, z: p.zSaida }); }
}

function teleportar(x, z) {
  if (jogador.trem) { ferrovia.ocultarTeto(jogador.trem.li, jogador.trem.k, false); jogador.trem = null; }
  if (jogador.pena > 0 && cadeia) { x = cadeia.x; z = cadeia.z; }
  if (x < 1500) jogador.dentroCasa = null;     // interiores ficam em x >= 2000
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
  if (novo.personagem !== antigo.personagem || novo.policial !== antigo.policial) trocarAvatar(skinAtual());
  if (novo.policial !== antigo.policial) aviso(novo.policial ? 'Você está em serviço na polícia. Prenda os procurados (em vermelho)!' : 'Você saiu do serviço da polícia.', 4);
  if ((novo.crimes || 0) > (antigo.crimes || 0)) aviso('Você está PROCURADO pela polícia.', 4);
  if (novo.personagem !== antigo.personagem || novo.cargo !== antigo.cargo || novo.nome !== antigo.nome || novo.crimes !== antigo.crimes || novo.policial !== antigo.policial) {
    conexao?.rastrear(metaPresenca());
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
  if (j.trem && seguirTrem()) {
    av.tocar(j.carregando ? 'carregar_parado' : 'idle'); av.raiz.position.copy(j.pos); av.raiz.rotation.y = j.yaw;
    av.mixer.update(dt); av.raiz.updateMatrixWorld(true);
    if (j.carregando) posicionarCaixa(av, j.carregando, j.yaw);
    return;
  }

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
  if (j.algemado || j.morto) { ix = 0; iy = 0; j.alvo = null; }
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
    if (j.morto) { /* fica caído */ }
    else if (vel > 0) {
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
  if (j.dentroCasa) limitarInterior(j.pos);
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
  if (tempoMapa <= 0) { tempoMapa = 0.1; desenharMapa(); $('rua').textContent = `${nomeDaRua(jogador.pos.x, jogador.pos.z) || '—'} · ${textoHora()}`; }
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
  if (jogador.trem) {
    const t = jogador.trem, est = ferrovia.estadoDe(t.li, t.k), dest = ferrovia.nomeParada(ferrovia.linhas[t.li], t.destino);
    if (est?.parado === t.origem) return [`descer do trem (parte para ${dest} em ${Math.ceil(est.resta)} s)`, 'Descer'];
    return [`a caminho da ${dest}: chega em ${Math.ceil(est?.chega ?? 0)} s`, `Chega ${Math.ceil(est?.chega ?? 0)}s`];
  }
  if (pd) return pertoDestino(pd.destino) ? ['entregar a carga', 'Entregar'] : [`levar a carga até: ${DESTINOS[pd.destino]?.nome}`, 'Largar'];
  const enc = jogador.carregando?.userData.encomenda;
  if (enc && !ferrovia.plataformaEm(jogador.pos.x, jogador.pos.z)) {
    const ag = agenciaProxima();
    return ag?.id === enc.destino ? [`entregar a encomenda (+${enc.valor})`, 'Entregar'] : [`encomenda para ${NOMES_AGENCIA[enc.destino]} (vá de trem)`, 'Largar'];
  }
  if (jogador.morto) return ['', ''];
  if (jogador.dentroCasa) {
    if (pontoInterior('porta', 1.8)) return ['sair de casa', 'Sair'];
    if (pontoInterior('cama', 2)) return ['descansar (vida cheia)', 'Dormir'];
    if (pontoInterior('bau', 1.8)) return ['abrir o baú', 'Baú'];
    return ['', ''];
  }
  const pl = ferrovia.plataformaEm(jogador.pos.x, jogador.pos.z);
  if (pl) {
    const dest = ferrovia.nomeParada(pl.linha, pl.lado === 'centro' ? 'destino' : 'centro');
    if (pl.trem !== null && pl.resta > 2) return [`embarcar no trem para ${dest} (parte em ${Math.ceil(pl.resta)} s)`, 'Embarcar'];
    const n = Math.ceil(ferrovia.proxima(pl.linha, pl.lado, agoraServidor() / 1000));
    return [`o trem para ${dest} chega em ${n} s`, `Trem ${n}s`];
  }
  if (jogador.perfil?.policial && procuradoProximo(2.4)) return ['algemar e prender o procurado', 'Prender'];
  if (agenciaProxima() && !jogador.carregando) return ['pegar uma encomenda para outra cidade', 'Encomenda'];
  if (pertoOficina()) return ['fazer parafusos (3 sucatas = 2 parafusos)', 'Fazer'];
  if (pertoDelegacia()) return [jogador.perfil?.policial ? 'sair do serviço policial' : 'entrar em serviço na polícia', 'Polícia'];
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
  const casa = casaProxima(3.2);
  if (casa) {
    const u = unidadeNaPorta(casa), minha = moraEm(u), nm = nomeMoradia(u);
    if (minha) return [u.tipo === 'unidade' ? 'seu apartamento: entrar ou sair' : `seu ${nm}: entrar, evoluir ou vender`, 'Porta'];
    if (u.tipo === 'terreno' && u.dono && (u.nivel || 1) >= 3) return ['ver apartamentos para alugar ou comprar', 'Aptos'];
    if (u.dono) return [u.tipo === 'apto' ? 'prédio lotado' : `${nm} de ${u.dono_perfil?.nome || '?'}`, 'Casa'];
    return [`comprar ${u.rotulo || 'esta casa'} (${num(u.preco)})`, 'Comprar'];
  }
  if (caminhaoProximo(3.4)) return ['F: atacar o caminhão e roubar a carga', ''];
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
  const v = $('barVida'); if (v) { v.firstChild.style.width = Math.max(0, jogador.vida).toFixed(0) + '%'; v.classList.toggle('baixa', jogador.vida < 35); }
  const b = $('barFome'); if (!b) return;
  b.firstChild.style.width = jogador.fome.toFixed(0) + '%';
  b.classList.toggle('vazia', jogador.fome < 15);
  b.title = `Fome ${Math.round(jogador.fome)}%`;
}

function quadro() {
  const dt = Math.min(relogio.getDelta(), 0.05);
  ferrovia.atualizar(agoraServidor() / 1000);
  atualizarCeu(agoraServidor() / 1000);
  mundo.atualizar(dt);
  sedes.atualizar(dt);
  if (jogador.avatar) atualizarRastreio(dt);
  atualizarJogador(dt);
  atualizarCaminhao(dt);
  atualizarCaminhoes(dt);
  atualizarRobos(dt);
  atualizarLogistica(dt);
  atualizarPolicia(dt);
  atualizarSocial(dt);
  atualizarNPCs(dt);
  atualizarRemotos(dt);
  enviarEstado(dt);
  tempoSalvar -= dt; if (tempoSalvar <= 0) { tempoSalvar = 15; salvarAgora(); }
  if (contratante?.avatar) contratante.avatar.mixer.update(dt);
  atualizarBolas(dt);
  atualizarCamera(dt);
  mundo.atualizarOclusao(dt, jogador.pos, offsetCamera(anguloCamSuave));
  atualizarHUD(dt);
  renderer.render(scene, camera);
}
