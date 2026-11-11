import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
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
import * as civico from './civico.js';
import { iniciarGoverno, abrirPrefeitura, abrirConcessionaria, abrirServico, atualizarGoverno } from './governo.js';
import * as servicos from './servicos.js';
import * as sons from './sons.js';
import * as voz from './voz.js';
import * as clima from './clima.js';
import * as jornal from './jornal.js';
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
renderer.localClippingEnabled = true;   // corte do teto do trem quando você está dentro

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
  sol.intensity = 0.3 + 2.1 * dia;
  hemi.intensity = 0.4 + 0.75 * dia;
  hemi.color.copy(CEU.hemiNoite).lerp(CEU.hemiDia, dia);
  hemi.groundColor.copy(CEU.chaoNoite).lerp(CEU.chaoDia, dia);
  scene.environmentIntensity = 0.12 + 0.43 * dia;
  scene.background.copy(CEU.noite).lerp(CEU.dia, dia).lerp(CEU.tarde, tarde * 0.5);
  const noite = 1 - S(elev, -0.02, 0.3);
  mundo.definirNoite(noite);
  for (const m of luzesCasas) m.emissiveIntensity = noite * 1.1;
  civico.brilhoOutdoors(noite);
}
const textoHora = () => `${String(Math.floor(horaAtual)).padStart(2, '0')}:${String(Math.floor((horaAtual % 1) * 60)).padStart(2, '0')}`;

// Câmera isométrica
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
let zoom = TOQUE ? 26 : 30;            // altura visível em metros
let anguloCam = 0;                      // 0..3 (90° cada)
let anguloCamSuave = 0;
let camAtras = false;
const alvoCam = new THREE.Vector3();
// segunda câmera (☰ › Câmera): a câmera de cima que gira e fica atrás do personagem, igual a de dirigir
const ultimaPosCam = {};
let modoCam = (() => { try { return localStorage.getItem('fator_cam') || 'iso'; } catch { return 'iso'; } })();
if (modoCam === 'perto') modoCam = 'atras';
const camAtiva = camera;
function ajustarCamera() {
  const a = window.innerWidth / window.innerHeight;
  camera.left = -zoom * a / 2; camera.right = zoom * a / 2; camera.top = zoom / 2; camera.bottom = -zoom / 2;
  camera.updateProjectionMatrix();
}
// pás do rotor dos helicópteros 3D (nó "rotor" dentro do modelo)
const rotores = new WeakMap();
function rotorDe(o) { if (!rotores.has(o)) rotores.set(o, o.getObjectByName('rotor') || null); return rotores.get(o); }
function trocarCamera() {
  modoCam = modoCam === 'atras' ? 'iso' : 'atras';
  try { localStorage.setItem('fator_cam', modoCam); } catch { /* sem armazenamento */ }
  if (modoCam === 'iso') { anguloCam = Math.round(anguloCamSuave); camAtras = false; }
  aviso(modoCam === 'atras' ? '🎥 Câmera atrás do personagem (igual ao carro): ela gira e acompanha para onde você anda.' : '🎥 Câmera de cima (padrão).', 3);
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
loader.setMeshoptDecoder(MeshoptDecoder);
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
const PORTAS_QG = {};   // porta de cada base de clã (leste, oeste)

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
  const calcTex = texturaCanvas(512, mundo.desenharCalcada);
  const gramaTex = texturaCanvas(512, (g, t) => mundo.desenharGrama(g, t));
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
  const calc = matTex(calcTex, QB / 3.2, QB / 3.2);
  const grama = matTex(gramaTex, 5, 5, 1), pateo = matTex(pateoTex, 5, 5, 1);
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
    { // porta do QG do clã: no lado virado para a cidade
      const cx = predios[predios.length - 1].caixa, px = s > 0 ? cx.min.x - 1.4 : cx.max.x + 1.4, pz = ruaC(2);
      PORTAS_QG[s > 0 ? 'leste' : 'oeste'] = { x: px, z: pz };
      const tapete = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.9 }));
      tapete.rotation.x = -Math.PI / 2; tapete.position.set(px, 0.2, pz); scene.add(tapete);
      const pl = textoSprite('🏴 QG do clã', { escala: 0.75, fundo: 'rgba(40,20,20,.9)' }); pl.position.set(px, 3, pz); scene.add(pl);
    }
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
    // altura pela malha na pose de descanso (sem esqueleto), para o nome ficar acima da cabeça
    let alt = 0; modelo.updateMatrixWorld(true);
    modelo.traverse((o) => { if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); if (Number.isFinite(b.max.y)) alt = Math.max(alt, b.max.y); } });
    this.altura = alt > 0.5 && alt < 3.5 ? alt : 1.8;
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
  // A arma fica presa ao corpo (não ao osso da mão): sempre apontada para a frente do personagem, com a empunhadura
  // na altura da mão direita e nunca dentro do corpo. Assim funciona igual em personagens de qualquer tamanho.
  encaixarArma(arma, pegaArma = [0, 0.1, -0.11]) {
    if (arma.parent) arma.parent.remove(arma);
    arma.matrixAutoUpdate = true; arma.rotation.set(0, 0, 0); arma.userData.pega = pegaArma;
    this.raiz.add(arma); this.arma = arma; this.posicionarArma(true);
  }
  posicionarArma(forcar = false) {
    const arma = this.arma; if (!arma || !this.maoD || (!arma.visible && !forcar)) return;
    this.raiz.updateMatrixWorld(true);
    const m = this.maoD.getWorldPosition(_maoArma); this.raiz.worldToLocal(m);
    const h = this.altura || 1.8, [px, py, pz] = arma.userData.pega || [0, 0.1, -0.11];
    const lado = Math.sign(m.x) || -1; m.x = lado * THREE.MathUtils.clamp(Math.abs(m.x), 0.04 * h, 0.16 * h);   // do lado da mão direita, sem atravessar o peito
    m.y = THREE.MathUtils.clamp(m.y, 0.52 * h, 0.74 * h);          // entre a cintura e o ombro
    m.z = Math.max(m.z, 0.14 * h + 0.12);                           // sempre na frente do corpo
    arma.position.set(m.x - px, m.y - py, m.z - pz); arma.rotation.set(0, 0, 0);
  }
}
const _maoArma = new THREE.Vector3();

// As animações (menos correr e andar, que são de cada personagem) vêm do robô, que tem o mesmo esqueleto Mixamo.
// Copiar as rotações direto deixava pés e corpo tortos, porque cada esqueleto tem a pose de descanso um pouco diferente.
// Aqui elas são adaptadas "no mundo": cada osso faz o mesmo movimento que faz no robô, a partir da própria pose de descanso.
const DO_ROBO = ['punch_combo', 'shoot', 'death', 'pickup', 'hit', 'idle', 'punch_left', 'idle_long', 'punch_right', 'walk_shoot', 'carry_walk'];
let roboBase = null;
function obterRoboBase() {
  if (!roboBase) roboBase = carregarGLB('assets/robos/Rusty_Scout_Bot.glb').then((g) => { g.scene.updateMatrixWorld(true); return g; }).catch(() => null);
  return roboBase;
}
function ossosPorNome(cena) { const m = new Map(); cena.traverse((o) => { if (o.name.startsWith('mixamorig')) m.set(o.name, o); }); return m; }
function adaptarClipe(clip, cenaR, cenaN) {
  cenaN.updateMatrixWorld(true);
  const R = ossosPorNome(cenaR), N = ossosPorNome(cenaN);
  const restoMundoR = new Map(), restoMundoN = new Map();
  for (const [n, o] of R) restoMundoR.set(n, o.getWorldQuaternion(new THREE.Quaternion()));
  for (const [n, o] of N) restoMundoN.set(n, o.getWorldQuaternion(new THREE.Quaternion()));
  const faixas = new Map(); let hipsPos = null, tempos = null;
  for (const t of clip.tracks) {
    const [osso, prop] = t.name.split('.');
    if (prop === 'quaternion') { faixas.set(osso, t); if (!tempos || t.times.length > tempos.length) tempos = t.times; }
    else if (prop === 'position' && osso === 'mixamorigHips') hipsPos = t;
  }
  if (!tempos) return clip;
  const interp = new Map([...faixas].map(([n, t]) => [n, t.createInterpolant()]));
  // ordem: pais antes dos filhos
  const ordemR = [], ordemN = [];
  cenaR.traverse((o) => { if (R.has(o.name) && o === R.get(o.name)) ordemR.push(o); });
  cenaN.traverse((o) => { if (N.has(o.name) && o === N.get(o.name)) ordemN.push(o); });
  const valores = new Map(ordemN.filter((o) => R.has(o.name)).map((o) => [o.name, new Float32Array(tempos.length * 4)]));
  const mundoR = new Map(), mundoN = new Map(), q = new THREE.Quaternion(), qp = new THREE.Quaternion();
  for (let k = 0; k < tempos.length; k++) {
    const t = tempos[k];
    for (const o of ordemR) {
      const it = interp.get(o.name), loc = it ? q.fromArray(it.evaluate(t)) : q.copy(o.quaternion);
      const pai = mundoR.get(o.parent?.name) || o.parent.getWorldQuaternion(qp);
      mundoR.set(o.name, (mundoR.get(o.name) || new THREE.Quaternion()).copy(pai).multiply(loc));
    }
    for (const o of ordemN) {
      const pai = mundoN.get(o.parent?.name) || o.parent.getWorldQuaternion(qp);
      const m = mundoN.get(o.name) || new THREE.Quaternion();
      if (R.has(o.name)) m.copy(mundoR.get(o.name)).multiply(restoMundoR.get(o.name).clone().invert()).multiply(restoMundoN.get(o.name));
      else m.copy(pai).multiply(o.quaternion);
      mundoN.set(o.name, m);
      const v = valores.get(o.name);
      if (v) { const loc = pai.clone().invert().multiply(m); if (k && loc.dot(q.fromArray(v, (k - 1) * 4)) < 0) loc.set(-loc.x, -loc.y, -loc.z, -loc.w); loc.toArray(v, k * 4); }
    }
  }
  const tracks = [...valores].map(([n, v]) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, tempos, v));
  if (hipsPos && R.get('mixamorigHips') && N.get('mixamorigHips')) {
    const e = N.get('mixamorigHips').position.y / (R.get('mixamorigHips').position.y || 1);
    tracks.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', hipsPos.times, hipsPos.values.map((x) => x * e)));
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
async function criarAvatar(pasta, id) {
  let gltf;
  // procura em assets/<pasta>/ e, para os personagens de evento, também em personagens/ (onde o robô colocou);
  // se não achar, usa um personagem padrão para o jogo não travar
  for (const url of [`assets/${pasta}/${id}.glb`, `${pasta}/${id}.glb`, 'assets/personagens/Autumn_Traveler.glb']) {
    try { gltf = await carregarGLB(url); break; } catch (e) { console.warn('modelo não carregou:', url, e); }
  }
  const modelo = SkeletonUtils.clone(gltf.scene);
  if (!gltf.userData.clipes) {
    let anims = gltf.animations;
    const robo = pasta === 'personagens' ? await obterRoboBase() : null;
    if (robo) {
      try {
        const novos = robo.animations.filter((c) => DO_ROBO.includes(c.name)).map((c) => adaptarClipe(c, robo.scene, gltf.scene));
        anims = [...gltf.animations.filter((a) => !DO_ROBO.includes(a.name)), ...novos];
      } catch (e) { console.warn('não adaptou as animações:', id, e); }
    }
    if (!gltf.userData.clipes) gltf.userData.clipes = prepararClipes(anims);
  }
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
  colidirLista(colisoresCarros, p, raio);
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
const pedais = { esq: false, dir: false, acel: false, freio: false };
window.addEventListener('keydown', (e) => {
  const foco = document.activeElement;
  if (foco && (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA')) return;
  const k = e.key.toLowerCase(); teclas.add(k);
  if (!jogador.avatar || e.repeat) return;
  if (k === 'e') acaoContexto();
  if (k === 'f') { if (jogador.carro?.servico === 'tanque') atirarTanque(); else socar(); }
  if (k === 'q') alternarArma();
  if (k === 'z') girarCamera(-1);
  if (k === 'x') girarCamera(1);
  if (k === 'm') abrirJanela('mochila');
  if (k === 'v') { voz.falar(true); desenharBotaoVoz(); }
  if (k === 'g') acaoAlgema();
});
window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); teclas.delete(k); if (k === 'v') { voz.falar(false); desenharBotaoVoz(); } });
window.addEventListener('blur', () => teclas.clear());
window.addEventListener('wheel', (e) => { zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 1.1 : 0.9), 12, 70); ajustarCamera(); }, { passive: true });

// toque / clique no mundo
const raycaster = new THREE.Raycaster();
const planoChao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pontoNoChao(cx, cy) {
  const ndc = new THREE.Vector2(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camAtiva);
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
  if (!(jogador.armado && e.pointerType === 'mouse') && tocouPainel(e.clientX, e.clientY)) return;   // telão ou outdoor: amplia
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
  // volante: setas e pedais (cada botão com o próprio dedo)
  for (const [id, k] of [['vEsq', 'esq'], ['vDir', 'dir'], ['vAcel', 'acel'], ['vFreio', 'freio']]) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* sem captura */ } pedais[k] = true; b.dataset.dedo = e.pointerId; b.classList.add('ativo'); });
    const solta = () => { pedais[k] = false; delete b.dataset.dedo; b.classList.remove('ativo'); };
    window.addEventListener('pointerup', (e) => { if (b.dataset.dedo === String(e.pointerId)) solta(); });
    window.addEventListener('pointercancel', (e) => { if (b.dataset.dedo === String(e.pointerId)) solta(); });
    document.addEventListener('visibilitychange', solta);
    b.addEventListener('pointerup', solta); b.addEventListener('pointercancel', solta); b.addEventListener('lostpointercapture', solta);
  }
  toque('btAcao', acaoContexto); toque('btSoco', socar); toque('btArma', alternarArma); toque('btAlgema', acaoAlgema);
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
  if (jogador.carro) { aviso('Saia do carro primeiro.'); return false; }
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
  if (jogador.passageiro) { if (passageiroPodeDescer()) descerPassageiro(); else aviso('Espere o helicóptero pousar.'); return; }
  if (jogador.carro?.taxi) { acaoTaxi(); return; }
  if (jogador.carro) {
    const a = acaoNoVeiculo();
    if (a?.[0] === 'descarregar') descarregarRoubo();
    else if (a?.[0] === 'jato') servicos.apagar(servicos.fogoProximo(15) || servicos.listaIncendios()[0]);
    else if (a?.[0] === 'socorrer') socorrerFerido(feridoProximo(7));
    else sairCarro();
    return;
  }
  if (jogador.trava > 0 || !livre()) return;
  if (conviteAperto() && !jogador.armado && !jogador.carregando) { aceitarAperto(); return; }
  if (jogador.carregando?.userData.pedido) { acaoCaixaPedido(); return; }
  if (jogador.carregando?.userData.encomenda && !jogador.trem && !ferrovia.plataformaEm(jogador.pos.x, jogador.pos.z)) { acaoEncomenda(); return; }
  { const sa = salaAtual(); if (sa) { sa.acao(); return; } }
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
  if (pertoDelegacia()) { entrarPublico('delegacia', () => salaDelegacia('delegacia', 1100 + 0, 'Delegacia', '#f1c40f'), pontos.delegacia, '🚓 Delegacia: balcão de serviço, procurados, celas e estande de tiro.'); return; }
  if (pertoContratante()) { abrirMissoes(); return; }
  if (jogador.perfil.prf) { const alvo = eleitoralProximo(2.4); if (alvo) { prenderEleitoral(alvo); return; } }
  if (jogador.perfil.profissao === 'medico') { const fer = feridoProximo(2.8); if (fer) { socorrerFerido(fer); return; } }
  const fogo = servicos.fogoProximo(9); if (fogo && !jogador.carregando) { servicos.apagar(fogo); return; }
  { const a = algemadoParaSoltar(); if (a) { soltarAlgemado(a); return; } }
  if (bueiroPerto()) { acaoBueiro(); return; }
  { const q = portaQGPerto(); if (q) { if (meuQG(q)) entrarNoQG(q); else aviso('🏴 Só os membros do clã dono desta base entram no QG.', 3); return; } }
  { const k = conteinerPerto(); if (k !== null) { arrombarConteiner(k); return; } }
  if (perto(civico.BANCO.balcao, 3.2)) { abrirServico('banco'); return; }
  if (perto(civico.BANCO.empregos, 3.2)) { abrirServico('empregos'); return; }
  if (perto(civico.HOSPITAL.balcao, 3.2)) { abrirServico('hospital'); return; }
  if (perto(civico.BOMBEIROS.balcao, 3.2)) { entrarPublico('bombeiros', salaBombeiros, civico.BOMBEIROS.balcao, '🚒 Quartel dos bombeiros: balcão, quadro de incêndios, vestiário e enfermaria.'); return; }
  if (perto(civico.EXERCITO.arsenal, 3.2)) { usarArsenal(); return; }
  if (perto(CONTRABANDISTA, 3.2)) { falarContrabandista(); return; }
  if (BANCAS.some((b) => perto(b, 3.2))) { abrirServico('jornal'); return; }
  if (perto(civico.EXERCITO.balcao, 3.2)) { abrirServico(jogador.perfil?.profissao === 'exercito' ? 'trabalho' : 'empregos'); return; }
  if (jogador.perfil.profissao === 'jornalista') { const rp = reportagemProxima(); if (rp) { reportar(rp); return; } }
  if (perto(civico.PREFEITURA.jornal, 3.2)) { abrirServico('jornal'); return; }
  if (perto(civico.PREFEITURA.porta, 3.2)) { entrarPublico('prefeitura', salaPrefeitura, civico.PREFEITURA.porta, '🏛️ Prefeitura: gabinete, urna, outdoors e sala de imprensa.'); return; }
  if (perto(civico.PREFEITURA.prf, 3.2)) { entrarPublico('prf', () => salaDelegacia('prf', 1000, 'Posto da PRF', '#2b4fa8'), civico.PREFEITURA.prf, '🚔 Posto da PRF: balcão, procurados e estande de tiro.'); return; }
  if (perto(civico.CONCESSIONARIA.balcao, 3.2)) { abrirConcessionaria(); return; }
  const carro = meuCarroProximo(); if (carro && !jogador.carregando) { entrarCarro(carro); return; }
  const alheio = carroAlheioProximo(); if (alheio && !jogador.carregando) { if (jogador.perfil.policial || jogador.perfil.prf) recuperarCarro(alheio); else arrombarCarro(alheio); return; }
  if (taxi?.modo === 'roubo' && taxi.fase === 'esperando' && Math.hypot(taxi.c.obj.position.x - jogador.pos.x, taxi.c.obj.position.z - jogador.pos.z) < 8) { embarcarTaxi(); return; }
  if (armaPdPerto()) { pegarArmaPd(); return; }
  const vp = veiculoProximo(); if (vp && !jogador.carregando) { caronaAqui(vp.c, vp.garagem); return; }
  const sv = servicoProximo(); if (sv) { entrarServico(sv); return; }
  if (taxi?.fase === 'esperando' && taxi.modo !== 'roubo' && Math.hypot(taxi.c.obj.position.x - jogador.pos.x, taxi.c.obj.position.z - jogador.pos.z) < 8) { embarcarTaxi(); return; }
  const hp = heliParaPassageiro(); if (hp) { embarcarPassageiro(hp); return; }
  const cj = caronaDeJogador(); if (cj) { embarcarComJogador(cj); return; }
  const ag = agenciaProxima(); if (ag && !jogador.carregando) { pegarEncomenda(ag); return; }
  if (pertoOficina()) { fazerParafusos(); return; }
  const oc = ocorrenciaProxima(); if (oc) { atenderOcorrencia(oc); return; }
  { const em = empresaDoPortao(); if (em && !jogador.carregando) { entrarEmpresa(em); return; } }
  const lj = pontoProximo(pontos.lojas, 3.2);
  if (lj && jogador.armado && !jogador.perfil.policial && !jogador.perfil.prf) { iniciarAssalto(pontos.lojas.indexOf(lj)); return; }
  if (lj) { abrirJanela('loja'); return; }
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
  if (pontoProximo(pontos.sucata, 4)) { if (jogador.armado) { aviso('Guarde a arma para trabalhar.'); return; } coletar(); return; }
  const pp = pessoaProxima(); if (pp && !jogador.armado) pedirAperto(pp);
}

// ---------------------------------------------------------------- crime 2.0: assaltos, alarmes e ocorrências
let ocorrencias = [], tempoOcorrencias = 4;
const vistas = new Set(), alarmes = new Map();
async function iniciarAssalto(lojaIdx) {
  if (ocupado || jogador.assalto) return; ocupado = true;
  try {
    const l = pontos.lojas[lojaIdx];
    const seg = await rede.crime.iniciar(lojaIdx, l.x, l.z);
    jogador.assalto = { x: l.x, z: l.z, t: seg, aviso: 0 };
    aviso('ASSALTO! Fique no balcão. O alarme tocou: a polícia foi chamada!', 4);
    tempoOcorrencias = 0.5;
  } catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}
function atualizarAssalto(dt) {
  const a = jogador.assalto; if (!a) return;
  if (jogador.morto || jogador.algemado || Math.hypot(a.x - jogador.pos.x, a.z - jogador.pos.z) > 5) {
    jogador.assalto = null; rede.crime.cancelar().catch(() => {}); aviso('Assalto abandonado.'); return;
  }
  a.t -= dt; a.aviso -= dt;
  if (a.aviso <= 0 && a.t > 0) { a.aviso = 2; aviso(`Esvaziando o caixa… ${Math.ceil(a.t)} s`, 2); }
  if (a.t <= 0) {
    jogador.assalto = null;
    rede.crime.concluir().then((v) => aviso(`Assalto concluído: +${v} moedas. Você está PROCURADO!`, 4)).catch((e) => aviso(e.message));
  }
}
// alarme piscando no local (todos veem) e chamadas para a polícia
function atualizarOcorrencias(dt) {
  tempoOcorrencias -= dt;
  if (tempoOcorrencias <= 0) {
    tempoOcorrencias = 8;
    rede.crime.abertas().then((lista) => {
      ocorrencias = lista;
      const policia = jogador.perfil?.policial || jogador.perfil?.prf;
      for (const o of lista) {
        if (vistas.has(o.id)) continue;
        vistas.add(o.id);
        if (policia && o.suspeito !== jogador.perfil.id) {
          aviso(`🚨 Ocorrência: ${o.local}! Vá até o local para atender (+300).`, 5);
          if (!rastreio) rastrear({ nome: `🚨 ${o.local}`, x: o.x, z: o.z });
        }
      }
    }).catch(() => {});
  }
  const agora = Date.now(), ativos = new Set();
  for (const o of ocorrencias) {
    if (agora - Date.parse(o.criada_em) > 120000) continue;
    ativos.add(o.id);
    let a = alarmes.get(o.id);
    if (!a) {
      a = new THREE.Group();
      const luz = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff2020' }));
      luz.position.y = 4.2; a.add(luz);
      const anel = new THREE.Mesh(new THREE.RingGeometry(4, 4.6, 32), new THREE.MeshBasicMaterial({ color: '#ff3030', transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      anel.rotation.x = -Math.PI / 2; anel.position.y = 0.3; a.add(anel);
      const placa = textoSprite(`🚨 ${o.local}`, { escala: 0.75, fundo: 'rgba(170,20,20,.92)' }); placa.position.y = 5.2; a.add(placa);
      a.position.set(o.x, alturaChao(o.x, o.z), o.z); scene.add(a); alarmes.set(o.id, a);
    }
    const pisca = Math.sin(performance.now() / 120) > 0;
    a.children[0].visible = pisca; a.children[1].material.opacity = pisca ? 0.8 : 0.25;
  }
  for (const [id, a] of alarmes) if (!ativos.has(id)) { scene.remove(a); alarmes.delete(id); }
}
function ocorrenciaProxima() {
  if (!(jogador.perfil?.policial || jogador.perfil?.prf)) return null;
  return ocorrencias.find((o) => Math.hypot(o.x - jogador.pos.x, o.z - jogador.pos.z) < 10 && o.suspeito !== jogador.perfil.id) || null;
}
async function atenderOcorrencia(o) {
  if (ocupado) return; ocupado = true;
  try { const v = await rede.crime.atender(o.id); ocorrencias = ocorrencias.filter((x) => x.id !== o.id); aviso(`Ocorrência atendida: +${v}. Procure o suspeito!`, 4); if (rastreio?.nome?.startsWith('🚨')) rastrear(null); }
  catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}

// ---------------------------------------------------------------- prefeitura, outdoors e carros
let prefeitoAtual = null, segurancas = [], tempoPrefeitura = 3, tempoCarros = 2;
async function carregarPrefeitura() {
  const [pf, outs] = await Promise.all([rede.prefeitura.estado(), rede.prefeitura.outdoors()]);
  const antes = prefeitoAtual;
  prefeitoAtual = pf?.prefeito || null;
  segurancas = [pf?.seguranca1, pf?.seguranca2].filter(Boolean);
  if (antes !== prefeitoAtual) conexao?.rastrear(metaPresenca());
  civico.atualizarOutdoors(outs);
  atualizarGoverno();
}
function atualizarPrefeitura(dt) {
  tempoPrefeitura -= dt; tempoCarros -= dt;
  if (tempoPrefeitura <= 0) {
    tempoPrefeitura = 60;
    rede.prefeitura.processar().catch(() => {}).finally(() => carregarPrefeitura().catch(() => {}));
    if (prefeitoAtual === jogador.perfil.id) rede.prefeitura.salario().then((v) => { if (v > 0) aviso(`Salário de prefeito: +${v.toLocaleString('pt-BR')} moedas`, 4); }).catch(() => {});
  }
  if (tempoCarros <= 0) { tempoCarros = 10; rede.carros.listar().then(sincronizarCarros).catch(() => {}); }
  // enquanto dirige, a vaga do carro acompanha (se fechar o jogo, ele fica perto)
  if (jogador.carro) {
    jogador.carro.salvar -= dt;
    if (jogador.carro.salvar <= 0 && jogador.carro.caminhao) {
      jogador.carro.salvar = 1.5;
      const id = jogador.carro.caminhao;
      rede.veiculos.mover(id, jogador.pos.x, jogador.pos.z, jogador.yaw).then((r) => {
        if (r === 'bloqueado' && jogador.carro?.caminhao === id) { const v = caminhoes.get(id); sairCarroLocal(); if (v) { v.d = { ...v.d, status: 'parado' }; ejetarRobo(v.obj); } aviso('🔒 O dono BLOQUEOU o veículo: você foi jogado para fora!', 4); return; }
        if (r === 'perdeu' && jogador.carro?.caminhao === id && performance.now() - jogador.carro.desde > 4000) { sairCarroLocal(); aviso('O veículo voltou para o dono.', 3); }
      }).catch(() => {});
    } else if (jogador.carro.salvar <= 0) { jogador.carro.salvar = 20; rede.carros.estacionar(jogador.carro.id, jogador.pos.x, jogador.pos.z, jogador.yaw).catch(() => {}); }
  }
}
const carrosMundo = new Map();     // id -> { d, mesh }
function dirigidosPorOutros() { const r = new Set(); for (const x of remotos.values()) if (x.alvo?.cv) r.add(Number(String(x.alvo.cv).split('|')[0])); return r; }
function sincronizarCarros(lista) {
  const ids = new Set(lista.map((c) => c.id)), outros = dirigidosPorOutros();
  for (const [id, v] of carrosMundo) if (!ids.has(id)) { scene.remove(v.mesh); carrosMundo.delete(id); }
  for (const d of lista) {
    let v = carrosMundo.get(d.id);
    if (!v || v.d.cor !== d.cor || v.d.modelo !== d.modelo) { if (v) scene.remove(v.mesh); v = { d, mesh: civico.modeloCarro(d.modelo, d.cor) }; scene.add(v.mesh); carrosMundo.set(d.id, v); }
    v.d = d;
    if (jogador.carro?.id === d.id || v.chamada) continue;
    if (d.destruido_ate && Date.parse(d.destruido_ate) > agoraServidor()) { v.mesh.visible = false; continue; }
    v.mesh.visible = !outros.has(d.id);
    v.mesh.position.set(d.x, alturaChao(d.x, d.z), d.z); v.mesh.rotation.y = d.ang;
  }
  colisoresCarros = lista.filter((d) => jogador.carro?.id !== d.id && !outros.has(d.id)).map((d) => ({ tipo: 'circ', x: d.x, z: d.z, r: 1.4 }));
}
let colisoresCarros = [];
function meuCarroProximo() {
  let melhor = null, dm = 3.4;
  for (const v of carrosMundo.values()) {
    const meu = v.d.ladrao ? v.d.ladrao === jogador.perfil.id : v.d.dono === jogador.perfil.id;
    if (!meu || !v.mesh.visible) continue;
    const d = Math.hypot(v.mesh.position.x - jogador.pos.x, v.mesh.position.z - jogador.pos.z);
    if (d < dm) { dm = d; melhor = v; }
  }
  return melhor;
}
function modoVolante(sim) { if (!sim && document.body.classList.contains('tanque')) { document.body.classList.remove('tanque'); $('btTiro').classList.toggle('oculto', !jogador.armado || !TOQUE); } document.body.classList.toggle('dirigindo', sim); for (const k in pedais) pedais[k] = false; joy.ativo = false; joy.x = joy.y = 0; }
function entrarCarro(v) {
  if (jogador.carregando) { aviso('Largue a caixa antes de dirigir.'); return; }
  modoVolante(true);
  if (jogador.armado) alternarArma();
  jogador.carro = { id: v.d.id, modelo: v.d.modelo, cor: v.d.cor, vel: 0, mesh: v.mesh, salvar: 20, voa: !!civico.CARROS[v.d.modelo]?.voa, alt: 0, raio: v.d.modelo === 'helicoptero' ? 2.2 : undefined };
  if (!jogador.carro.voa) sons.tocar('carro_partida', { vol: 0.6 });
  jogador.pos.set(v.mesh.position.x, v.mesh.position.y, v.mesh.position.z); jogador.yaw = v.mesh.rotation.y; jogador.alvo = null;
  jogador.avatar.raiz.visible = false;
  aviso(`${civico.CARROS[v.d.modelo]?.nome || 'Carro'}: use o controle para dirigir. Toque em Sair para estacionar.`, 3.5);
}
function sairCarro() {
  const c = jogador.carro; if (!c) return;
  if (c.voa && !c.caminhao) {
    if (c.alt > 1.5) { aviso('Pare para pousar antes de sair.', 2); return; }
    const t = jogador.pos.clone(); mundo.limitar(t);
    if (Math.hypot(t.x - jogador.pos.x, t.z - jogador.pos.z) > 2) { aviso('Pouse numa cidade ou na mata para descer.', 2.5); return; }
  }
  if (c.servico) {   // ambulância / caminhão dos bombeiros: fica estacionado onde você desceu
    jogador.carro = null; modoVolante(false);
    c.mesh.position.copy(jogador.pos); c.mesh.rotation.y = jogador.yaw;
    const lx = Math.cos(jogador.yaw) * 2.8, lz = -Math.sin(jogador.yaw) * 2.8;
    jogador.pos.x += lx; jogador.pos.z += lz; resolverColisao(jogador.pos, jogador.raio);
    civico.atualizarSirenes(0, c.mesh); jogador.avatar.raiz.visible = true;
    c.mesh.position.y = alturaChao(c.mesh.position.x, c.mesh.position.z);
    aviso(c.servico === 'ambulancia' ? 'Ambulância estacionada. Socorra o ferido (✚) e volte para ela.' : civico.DO_EXERCITO.has(c.servico) ? 'Veículo do Exército estacionado aqui. Volte para ele quando quiser.' : 'Caminhão estacionado aqui. Volte para ele quando terminar.', 3);
    return;
  }
  if (c.caminhao) {
    rede.veiculos.sair(c.caminhao, jogador.pos.x, jogador.pos.z, jogador.yaw).then(() => { tempoLogistica = Math.min(tempoLogistica, 0.5); }).catch(() => {});
    const v = caminhoes.get(c.caminhao);
    if (v) v.d = { ...v.d, motorista: null, pos_x: jogador.pos.x, pos_z: jogador.pos.z, ang: jogador.yaw, ...(v.d.sequestrado ? {} : { status: 'parado' }) };
    sairCarroLocal();
    aviso(c.sequestrado ? 'Você largou o veículo roubado. Parado por 5 min, ele volta para o dono.' : 'O robô motorista levou o veículo de volta para a garagem.', 3.5);
    return;
  }
  jogador.carro = null; modoVolante(false);
  c.mesh.position.copy(jogador.pos); c.mesh.rotation.y = jogador.yaw;
  const v = carrosMundo.get(c.id); if (v) { v.d = { ...v.d, x: jogador.pos.x, z: jogador.pos.z, ang: jogador.yaw }; }
  rede.carros.estacionar(c.id, jogador.pos.x, jogador.pos.z, jogador.yaw).catch(() => {});
  // desce pela porta esquerda
  const lx = Math.cos(jogador.yaw) * 1.8, lz = -Math.sin(jogador.yaw) * 1.8;
  jogador.pos.x += lx; jogador.pos.z += lz; resolverColisao(jogador.pos, jogador.raio);
  jogador.avatar.raiz.visible = true;
  colisoresCarros.push({ tipo: 'circ', x: c.mesh.position.x, z: c.mesh.position.z, r: 1.4 });
}
// desce de um veículo de empresa (sem avisar o banco)
function sairCarroLocal() {
  const c = jogador.carro; if (!c) return;
  jogador.carro = null; modoVolante(false);
  if (c.mesh) c.mesh.position.y = alturaChao(jogador.pos.x, jogador.pos.z);
  const lx = Math.cos(jogador.yaw) * 2.2, lz = -Math.sin(jogador.yaw) * 2.2;
  jogador.pos.x += lx; jogador.pos.z += lz; jogador.pos.y = alturaChao(jogador.pos.x, jogador.pos.z); resolverColisao(jogador.pos, jogador.raio);
  jogador.avatar.raiz.visible = true;
  tempoLogistica = Math.min(tempoLogistica, 1);
}
// direção arcade: o controle aponta para onde o carro deve ir (como andar a pé)
function dirigir(dt) {
  const c = jogador.carro, max = c.max || civico.CARROS[c.modelo]?.vel || 15;
  const acel = pedais.acel || teclas.has('w') || teclas.has('arrowup'), freio = pedais.freio || teclas.has('s') || teclas.has('arrowdown');
  const volante = (pedais.dir || teclas.has('d') || teclas.has('arrowright') ? 1 : 0) - (pedais.esq || teclas.has('a') || teclas.has('arrowleft') ? 1 : 0);
  // aceleração suave; freio firme; parado, o freio vira ré (devagar)
  if (acel && !freio) c.vel = c.vel < 0 ? Math.min(0, c.vel + 10 * dt) : Math.min(max, c.vel + (c.vel < max * 0.5 ? 4.5 : 2.5) * dt);
  else if (freio) c.vel = c.vel > 0.3 ? Math.max(0, c.vel - 11 * dt) : Math.max(-Math.min(4, max * 0.35), c.vel - 3 * dt);
  else c.vel = c.vel > 0 ? Math.max(0, c.vel - 3 * dt) : Math.min(0, c.vel + 3 * dt);
  // volante com resposta gradual; vira menos quando está rápido (não roda no lugar)
  c.volante = (c.volante || 0) + (volante - (c.volante || 0)) * Math.min(1, dt * 7);
  const vAbs = Math.abs(c.vel), giro = 1.5 * Math.min(1, vAbs / 2.5) / (1 + vAbs / 12);
  jogador.yaw -= c.volante * giro * dt * Math.sign(c.vel || 1);
  if (c.servico) civico.atualizarSirenes(performance.now() / 1000, c.mesh);
  if (!c.assentado) { resolverColisao(jogador.pos, c.raio || 1.3); c.assentado = true; }
  const antes = { x: jogador.pos.x, z: jogador.pos.z };
  jogador.pos.x += Math.sin(jogador.yaw) * c.vel * dt; jogador.pos.z += Math.cos(jogador.yaw) * c.vel * dt;
  if (!c.voa) { colidirVeiculo(c, dt); resolverColisao(jogador.pos, c.raio || 1.3); }
  const andou = Math.hypot(jogador.pos.x - antes.x, jogador.pos.z - antes.z), esperado = Math.abs(c.vel) * dt;
  if (esperado > 0.01 && andou < esperado * 0.6) {          // bateu
    if (Math.abs(c.vel) > 6 && performance.now() - (c.batida || 0) > 1200) { c.batida = performance.now(); aviso('💥 Batida!', 1.2); tremor = 0.35; }
    c.vel *= Math.abs(c.vel) > 6 ? 0.15 : 0.5;
  }
  const chao = alturaChao(jogador.pos.x, jogador.pos.z);
  if (c.voa) {   // helicóptero: sobe quando anda e pousa quando para (pode voar entre a metrópole e as cidades)
    jogador.pos.x = THREE.MathUtils.clamp(jogador.pos.x, -700, 700); jogador.pos.z = THREE.MathUtils.clamp(jogador.pos.z, -1200, 1200);
    c.alt += ((Math.abs(c.vel) > 1 ? 22 : 0) - c.alt) * Math.min(1, dt * 1.2);
    jogador.pos.y = chao; c.mesh.position.set(jogador.pos.x, chao + c.alt, jogador.pos.z); c.mesh.rotation.y = jogador.yaw;
    const ro = c.mesh.userData.rotor || rotorDe(c.mesh); if (ro) { ro.visible = true; ro.rotation.y += dt * (c.alt > 1 || Math.abs(c.vel) > 0.5 ? 28 : 12); }
    jogador.avatar.raiz.position.copy(jogador.pos);
    return;
  }
  jogador.pos.y += (chao - jogador.pos.y) * Math.min(1, dt * 10);
  c.mesh.position.copy(jogador.pos); c.mesh.rotation.y = jogador.yaw;
  jogador.avatar.raiz.position.copy(jogador.pos);
}

// ---------------------------------------------------------------- encomendas entre cidades e oficina de parafusos
const NOMES_AGENCIA = { centro: 'a Metrópole', serra: 'Vila Serra', porto: 'Porto Sul' };
const AGENCIAS = [
  { id: 'centro', x: -20, z: -118 }, { id: 'centro', x: -20, z: 118 },
  { id: 'serra', x: -60, z: -934 }, { id: 'porto', x: -60, z: 934 },
];
const OFICINA = { x: 62, z: 934 };
function perto(p, raio) { return Math.hypot(p.x - jogador.pos.x, p.z - jogador.pos.z) < raio; }
function eleitoralProximo(raio) {
  let melhor = null, dm = raio;
  for (const [id, r] of remotos) {
    if (!r.av?.raiz.visible || !(r.meta.eleitoral && r.meta.crimes > 0)) continue;
    const d = r.av.raiz.position.distanceTo(jogador.pos);
    if (d < dm) { dm = d; melhor = { id, r }; }
  }
  return melhor;
}
async function prenderEleitoral(alvo) {
  if (ocupado) return; ocupado = true;
  try {
    virarPara(alvo.r.av.raiz.position.x, alvo.r.av.raiz.position.z);
    jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 2, fade: 0.1 }); jogador.trava = 0.9;
    const min = await rede.prf.prender(alvo.id);
    aviso(`${alvo.r.meta.nome} foi preso pela PRF por ${min} min. +2.000 moedas`, 4);
  } catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}
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
  if (!w) { ferrovia.ocultarTeto(jogador.trem.li, jogador.trem.k, false); jogador.trem = null; return false; }
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

// nome acima da cabeça, com uma folga (os personagens têm alturas diferentes)
function alturaNome(av) { return Math.max(2.2, (av?.altura || 1.8) + 0.45); }

// armas: a básica de todos e as das corporações (só em serviço), a militar dos clãs e a pesada do Exército
const ARMAS = {
  basica: { cod: 1, modelo: 'arma_paintball', dano: 20, recarga: 0.28, vel: 24, cor: null, pega: [0, 0.1, -0.11], boca: [0, 0.22, 0.3] },
  policia: { cod: 2, modelo: 'arma_policia', dano: 27, recarga: 0.19, vel: 28, cor: '#ffd23e', pega: [0, 0.07, -0.1], boca: [0, 0.14, 0.3] },
  prf: { cod: 3, modelo: 'arma_prf', dano: 27, recarga: 0.19, vel: 28, cor: '#3e8cff', pega: [0, 0.15, -0.2], boca: [0, 0.33, 0.3] },
  exercito: { cod: 4, modelo: 'arma_exercito', dano: 32, recarga: 0.16, vel: 30, cor: '#2fbf5a', pega: [0, 0.15, -0.25], boca: [0, 0.3, 0.4] },
  militar: { cod: 5, modelo: 'arma_militar', dano: 30, recarga: 0.16, vel: 30, cor: null, pega: [0, 0.12, -0.21], boca: [0, 0.22, 0.45] },
  pesada: { cod: 6, modelo: 'arma_grande_porte', dano: 55, recarga: 0.45, vel: 34, cor: '#1f9e46', pega: [0, 0.15, -0.18], boca: [0, 0.25, 0.58], bola: 2.2 },
};
const ARMA_POR_COD = Object.fromEntries(Object.entries(ARMAS).map(([k, a]) => [a.cod, k]));
function tipoArma() {
  const p = jogador.perfil; if (!p) return 'basica';
  const general = p.cargo === 'admin';
  if (jogador.armaPesada && (general || (p.profissao === 'exercito' && p.arma_pesada_ate && Date.parse(p.arma_pesada_ate) > agoraServidor()))) return 'pesada';
  if (militar()) return 'exercito';   // militar em serviço (o General Supremo sempre)
  if (p.policial) return 'policia';
  if (p.prf) return 'prf';
  if ((p.arma_militar || jogador.armaDoQG) && jogador.claInfo) return 'militar';
  return 'basica';
}
function novaArma(tipo, av) {
  const a = ARMAS[tipo];
  const arma = modelos[a.modelo] ? clonar(a.modelo) : clonar('arma_paintball');
  av.encaixarArma(arma, modelos[a.modelo] ? a.pega : ARMAS.basica.pega); return arma;
}
// troca a arma na mão quando muda o serviço (só no expediente) ou a autorização
function conferirArma() {
  const j = jogador; if (!j.avatar || !j.arma) return;
  const tipo = tipoArma(); if (j.armaTipo === tipo) return;
  const velha = j.arma, nova = novaArma(tipo, j.avatar);
  velha.parent?.remove(velha); nova.visible = j.armado; j.arma = nova; j.armaTipo = tipo;
  if (j.armaTipo !== 'basica' && j.armado) aviso({ policia: '🔫 Arma da Polícia (tinta amarela).', prf: '🔫 Arma da PRF (tinta azul).', exercito: '🔫 Arma do Exército (tinta verde).', militar: '🔫 Arma militar do clã.', pesada: '💥 ARMA PESADA equipada.' }[tipo], 2.5);
}

// tiros de paintball
const bolas = []; const manchas = [];
const geoBola = new THREE.SphereGeometry(0.07, 10, 8);
const geoMancha = new THREE.CircleGeometry(0.35, 14);
const CORES_TINTA = ['#ff3e6c', '#35d07f', '#3ea8ff', '#ffd23e', '#b05cff', '#ff8a2a'];
function atirar(alvo) {
  if (jogador.carro?.servico === 'tanque') { atirarTanque(); return; }
  if (!jogador.armado || jogador.trava > 0 || jogador.recarga > 0 || !livre()) return;
  const A = ARMAS[jogador.armaTipo || 'basica'];
  jogador.alvo = null;
  if (alvo) jogador.yaw = Math.atan2(alvo.x - jogador.pos.x, alvo.z - jogador.pos.z);
  jogador.avatar.raiz.rotation.y = jogador.yaw;
  jogador.avatar.raiz.updateMatrixWorld(true);
  const boca = jogador.arma.localToWorld(new THREE.Vector3(...(modelos[A.modelo] ? A.boca : ARMAS.basica.boca)));
  const dir = new THREE.Vector3(Math.sin(jogador.yaw), 0, Math.cos(jogador.yaw));
  const dourada = tenhoArmaPd();
  const cor = dourada ? '#ffd23e' : A.cor || CORES_TINTA[Math.floor(Math.random() * CORES_TINTA.length)];
  const vyMira = dourada ? null : miraNoAlvo(boca, dir, A.vel);
  const v = dir.multiplyScalar(dourada ? 34 : A.vel).add(new THREE.Vector3(0, vyMira ?? (dourada ? 0.6 : 1.2 * 24 / A.vel), 0));
  criarBola(boca, v, cor, true, dourada ? 1 : A.bola || 1);
  bolas[bolas.length - 1].dano = A.dano;
  if (dourada) {
    bolas[bolas.length - 1].pd = true; bolas[bolas.length - 1].m.scale.setScalar(1.6);
    armaPd = { ...armaPd, balas: armaPd.balas - 1 };
    rede.pd.disparar().then((resta) => { aviso(resta > 0 ? `✨ Arma dourada: ${resta} bala restante.` : '✨ Última bala: a arma dourada sumiu.', 3); if (resta <= 0) { armaPd = { ...armaPd, ativa: false, dono: null }; pintarArma(); } }).catch(() => {});
    jogador.recarga = 1.2;
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  conexao?.enviar('tiro', { x: r2(boca.x), y: r2(boca.y), z: r2(boca.z), vx: r2(v.x), vy: r2(v.y), vz: r2(v.z), c: cor, s: A.bola || 1 });
  if (!dourada) jogador.recarga = A.recarga;
}
function criarBola(pos, vel, cor, minha = false, escala = 1) {
  if (escala < 3) sons.tocar('tiro', { vol: 0.7, dist: jogador.avatar ? Math.hypot(pos.x - jogador.pos.x, pos.z - jogador.pos.z) : 0, raio: 55, velocidade: 0.9 + Math.random() * 0.2 });
  const m = new THREE.Mesh(geoBola, new THREE.MeshStandardMaterial({ color: cor, roughness: 0.3 }));
  m.position.copy(pos); m.scale.setScalar(escala); scene.add(m);
  bolas.push({ m, v: vel.clone(), vida: escala >= 3 ? 2.5 : 2, cor, minha, tanque: escala >= 3 });
}
// ---------------------------------------------------------------- tanque: canhão de tinta que explode veículos
let recargaTanque = 0;
function atirarTanque() {
  const c = jogador.carro;
  if (performance.now() < recargaTanque) { aviso('Canhão recarregando…', 0.8); return; }
  recargaTanque = performance.now() + 2500;
  const f = new THREE.Vector3(Math.sin(jogador.yaw), 0, Math.cos(jogador.yaw));
  const boca = new THREE.Vector3(c.mesh.position.x, c.mesh.position.y + 2.2, c.mesh.position.z).addScaledVector(f, 4.6);
  const v = f.clone().multiplyScalar(36).add(new THREE.Vector3(0, 2.2, 0));
  criarBola(boca, v, '#1f9e46', true, 3.5); bolas[bolas.length - 1].dano = 70;
  const r2 = (n) => Math.round(n * 100) / 100;
  conexao?.enviar('tiro', { x: r2(boca.x), y: r2(boca.y), z: r2(boca.z), vx: r2(v.x), vy: r2(v.y), vz: r2(v.z), c: '#1f9e46', s: 3.5 });
  tremor = 0.25;
}
function acertoTanque(b) {
  const p = b.m.position;
  for (const n of npcs) { const q = n.av.raiz.position; if (n.policia && n.caido <= 0 && Math.hypot(p.x - q.x, p.z - q.z) < 1.3 && p.y < q.y + 2.5) { acertarPoliciaNPC(n, 100); explodir(p); return true; } }
  for (const [id, r] of remotos) {
    if (r.carro && Math.hypot(p.x - r.carro.position.x, p.z - r.carro.position.z) < 3 && p.y < r.carro.position.y + 3.5) { explodir(r.carro.position, r.carroId); return true; }
    if (r.av?.raiz.visible && Math.hypot(p.x - r.av.raiz.position.x, p.z - r.av.raiz.position.z) < 1.4 && p.y < r.av.raiz.position.y + 2.2) { aplicarDanoRemoto(id, 70); explodir(p); return true; }
  }
  for (const v of carrosMundo.values()) {
    if (!v.mesh.visible || jogador.carro?.id === v.d.id) continue;
    if (Math.hypot(p.x - v.mesh.position.x, p.z - v.mesh.position.z) < 2.8 && p.y < v.mesh.position.y + 3) { explodir(v.mesh.position, v.d.id); return true; }
  }
  for (const c of caminhoes.values()) {
    if (!c.obj.visible) continue;
    if (Math.hypot(p.x - c.obj.position.x, p.z - c.obj.position.z) < 3 && p.y < c.obj.position.y + 3.5) { atacarCaminhao(c); explodir(c.obj.position); return true; }
  }
  return false;
}
// explosão: efeito para todos; carro de jogador some por 30 s e volta para o dono; quem estava dentro é jogado para fora
function explodir(pos, carro = null) {
  const e = { x: Math.round(pos.x * 10) / 10, y: Math.round((pos.y || 0) * 10) / 10, z: Math.round(pos.z * 10) / 10, cv: carro, de: jogador.perfil?.id };
  efeitoExplosao(e.x, e.y, e.z);
  conexao?.enviar('explosao', e);
  const v = carro != null && carrosMundo.get(Number(carro)); if (v) { v.mesh.visible = false; rede.exercito.explodirCarro(Number(carro)).catch(() => {}); }
  for (const [id, r] of remotos) if (r.av?.raiz.visible && Math.hypot(e.x - r.av.raiz.position.x, e.z - r.av.raiz.position.z) < 4.5) aplicarDanoRemoto(id, 35);
}
function receberExplosao(e) {
  efeitoExplosao(e.x, e.y, e.z);
  const v = e.cv != null && carrosMundo.get(Number(e.cv)); if (v && jogador.carro?.id !== v.d.id) v.mesh.visible = false;
  if (e.cv != null && jogador.carro && String(jogador.carro.id) === String(e.cv)) {
    sairCarro(); jogador.ultimoAgressor = e.de; danoLocal(50);
    aviso('💥 Seu veículo explodiu com o tanque! Ele volta para você em 30 s.', 4); return;
  }
  if (!jogador.carro && Math.hypot(e.x - jogador.pos.x, e.z - jogador.pos.z) < 4.5) { jogador.ultimoAgressor = e.de; danoLocal(35); }
}
const explosoes = [];
const geoExplosao = new THREE.SphereGeometry(1, 16, 12);
function efeitoExplosao(x, y, z) {
  const fogo = new THREE.Mesh(geoExplosao, new THREE.MeshBasicMaterial({ color: '#ffb23a', transparent: true, opacity: 0.95, toneMapped: false }));
  const tinta = new THREE.Mesh(geoExplosao, new THREE.MeshStandardMaterial({ color: '#1f9e46', transparent: true, opacity: 0.9, roughness: 0.6 }));
  const fumaca = new THREE.Mesh(geoExplosao, new THREE.MeshStandardMaterial({ color: '#3b3b3b', transparent: true, opacity: 0.6, roughness: 1, depthWrite: false }));
  for (const m of [fogo, tinta, fumaca]) { m.position.set(x, y + 1, z); scene.add(m); }
  explosoes.push({ fogo, tinta, fumaca, t: 0 });
  manchar(new THREE.Vector3(x, alturaChao(x, z) + 0.02, z), new THREE.Vector3(0, 1, 0), '#1f9e46');
  sons.tocar('tiro', { vol: 1, dist: Math.hypot(x - jogador.pos.x, z - jogador.pos.z), raio: 120, velocidade: 0.45 });
  tremor = Math.max(tremor, Math.hypot(x - jogador.pos.x, z - jogador.pos.z) < 30 ? 0.35 : 0);
}
function atualizarExplosoes(dt) {
  for (let i = explosoes.length - 1; i >= 0; i--) {
    const e = explosoes[i]; e.t += dt; const k = e.t / 1.6;
    e.fogo.scale.setScalar(0.5 + k * 6); e.fogo.material.opacity = Math.max(0, 0.95 - k * 2.2);
    e.tinta.scale.setScalar(0.4 + k * 4); e.tinta.material.opacity = Math.max(0, 0.9 - k * 1.4);
    e.fumaca.scale.setScalar(1 + k * 7); e.fumaca.position.y += dt * 2.5; e.fumaca.material.opacity = Math.max(0, 0.6 - k * 0.6);
    if (k >= 1) { for (const m of [e.fogo, e.tinta, e.fumaca]) { scene.remove(m); m.material.dispose(); } explosoes.splice(i, 1); }
  }
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
    if (b.minha) fim = acertoNoAlvo(b) || acertoDaBola(b);
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
    if (fim && b.tanque && b.minha && !b.explodiu) { b.explodiu = true; explodir(b.m.position); }
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
      npcs.push({ av, rota, laco: laco(rota), vel: 1.5, fase: k * 53 + 7, vida: 100, caido: 0, hostil: 0, tiro: 0, civil: true });
    } catch (e) { console.warn('NPC não carregou', e); }
  }
}
function atualizarNPCs(dt) {
  for (const n of npcs) {
    if (n.algemado) { npcAlgemado(n, dt); continue; }
    if (n.conversa) { conversando(n, dt); continue; }
    if (n.animConversa) { n.animConversa = false; n.av.tocar('walk', { velocidade: 0.85 }); }
    if (n.policia) {
      if (remotoAtivo(n) && !(n.caido > 0) && !n.cerco && !n.perseguindo && !(n.hostil > 0)) { mostrarRoboRemoto(n, dt); continue; }
      if (n.animRemota) { n.animRemota = null; n.av.tocar('walk', { velocidade: 0.85 }); }
      if (policiaNPCReage(n, dt)) { publicarRobo(n, dt, n.av.raiz); continue; }
      publicarRobo(n, dt, n.av.raiz);
    }
    const p = n.av.raiz.position, alvo = patrulha(n);
    const dx = alvo.x - p.x, dz = alvo.z - p.z, d = Math.hypot(dx, dz);
    if (d > 12) p.set(alvo.x, 0.18, alvo.z);                      // voltou da perseguição: retoma a ronda
    else { p.x += dx * Math.min(1, dt * 4); p.z += dz * Math.min(1, dt * 4); }
    n.av.raiz.rotation.y = suavizarAngulo(n.av.raiz.rotation.y, alvo.ang, dt * 6);
    n.av.mixer.update(dt);
  }
  atualizarViaturas(dt);
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
  const bloqueado = obstaculoAFrente(p.x, p.z, c.obj.rotation.y, c.obj);
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
  { x0: -320, z0: -1400, x1: 320, z1: -810 },
  { x0: -320, z0: 810, x1: 320, z1: 1190 },
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
  for (const o of ocorrencias) if (jogador.perfil?.policial || jogador.perfil?.prf) r.push({ icone: '🚨', nome: o.local, x: o.x, z: o.z });
  for (const a of AGENCIAS) r.push({ icone: '📦', nome: `Agência ${a.id === 'centro' ? (a.z < 0 ? 'Norte' : 'Sul') : NOMES_AGENCIA[a.id]}`, x: a.x, z: a.z });
  r.push({ icone: '🔩', nome: 'Oficina de Parafusos', x: OFICINA.x, z: OFICINA.z });
  r.push({ icone: '🏛️', nome: 'Prefeitura', x: civico.PREFEITURA.porta.x, z: civico.PREFEITURA.porta.z + 2 });
  r.push({ icone: '🚗', nome: 'Concessionária (carros)', x: civico.CONCESSIONARIA.balcao.x, z: civico.CONCESSIONARIA.balcao.z + 3 });
  r.push({ icone: '🏦', nome: 'Banco e Agência de Empregos', x: civico.BANCO.balcao.x, z: civico.BANCO.balcao.z + 2 });
  r.push({ icone: '✝', nome: 'Cemitério', x: civico.CEMITERIO.x, z: civico.CEMITERIO.z - 23 });
  r.push({ icone: '🏥', nome: 'Hospital', x: civico.HOSPITAL.balcao.x, z: civico.HOSPITAL.balcao.z - 2 });
  r.push({ icone: '🚒', nome: 'Bombeiros', x: civico.BOMBEIROS.balcao.x, z: civico.BOMBEIROS.balcao.z - 2 });
  for (const f of servicos.listaIncendios()) r.push({ icone: '🔥', nome: f.nome, x: f.x, z: f.z });
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
  for (const v of viaturas) desenhar(v.obj.position.x, v.obj.position.z, v.perseguindo ? '#ff3030' : '#3a6bff', 5);
  for (const r of remotos.values()) if (r.av?.raiz.visible) desenhar(r.av.raiz.position.x, r.av.raiz.position.z, '#4fa3ff', 5);
  if (caminhaoMovel) desenhar(caminhaoMovel.obj.position.x, caminhaoMovel.obj.position.z, '#e39b3a', 5);
  for (const [x, z] of ferrovia.marcadores()) desenhar(x, z, '#c8282e', 7);
  const prof = jogador.perfil?.profissao, piscaS = Math.sin(performance.now() / 150) > 0;
  if (prof === 'medico') {
    for (const r of remotos.values()) if (r.meta?.ferido && r.av) desenhar(r.av.raiz.position.x, r.av.raiz.position.z, piscaS ? '#ff2020' : '#ffffff', 9);
    if (civico.HOSPITAL.veiculo && !jogador.carro) desenhar(civico.HOSPITAL.veiculo.position.x, civico.HOSPITAL.veiculo.position.z, '#ffffff', 6);
  }
  if (prof === 'bombeiro') {
    for (const f of servicos.listaIncendios()) desenhar(f.x, f.z, piscaS ? '#ff7a1a' : '#ffd23e', 10);
    if (civico.BOMBEIROS.veiculo && !jogador.carro) desenhar(civico.BOMBEIROS.veiculo.position.x, civico.BOMBEIROS.veiculo.position.z, '#ff4a2a', 6);
  }
  if (militar() && !jogador.carro) { for (const v of civico.EXERCITO.veiculos) desenhar(v.mesh.position.x, v.mesh.position.z, '#7d9a3e', 5); if (meuMilitar) desenhar(meuMilitar.mesh.position.x, meuMilitar.mesh.position.z, '#b6e05a', 6); }
  if (jogador.perfil?.policial || jogador.perfil?.prf || prof === 'exercito') {
    const pisca = Math.sin(performance.now() / 150) > 0;
    for (const r of remotos.values()) if (r.meta?.crimes > 0 && r.av) desenhar(r.av.raiz.position.x, r.av.raiz.position.z, pisca ? '#ff2020' : '#ffffff', 6);
    for (const o of ocorrencias) desenhar(o.x, o.z, '#ff5a1f', 8);
  }
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
  // um modelo faltando não pode travar o jogo: ele só fica de fora (veículos e prédios têm versão feita por código)
  const carregamentos = MODELOS.map(async (m) => { try { modelos[m] = prepararEstatico((await carregarGLB(`assets/modelos/${m}.glb`)).scene); } catch (e) { console.warn('modelo não carregou:', m, e); } });
  const pastaJogador = ROBOS.includes(id) ? 'robos' : 'personagens';
  const skin = perfil.policial ? SKIN_POLICIA : id;
  const avatarP = criarAvatar(ROBOS.includes(skin) ? 'robos' : pastaJogador, skin);
  const roboP = criarAvatar('robos', 'Rusty_Scout_Bot');
  await Promise.all(carregamentos);
  montarQuarteiroes();
  montarPlacasRuas();
  sedes.iniciar({ scene, texturaCanvas });
  mundo.montar({ scene, texturaCanvas, ruido, textoSprite, modelo: (n) => modelos[n] });
  ferrovia.montar({ scene, textoSprite, modelo: (n) => modelos[n] });
  clima.iniciar({ scene, alturaChao, naRua, mudou: (t) => { if (jogador.avatar) aviso(t === 'limpo' ? '☀️ O tempo abriu.' : { chuva: '🌧️ Começou a chover.', tempestade: '⛈️ Tempestade chegando! Fique atento aos raios.', neve: '❄️ Começou a nevar.' }[t], 3.5); } });
  carregarClima();
  montarCargueiro(); montarBueiros();
  mundo.finalizar();
  for (const c of mundo.CIDADES) if (c.loja) colocarLojaExtra(c.loja.x, c.loja.z);
  montarAgencias();
  civico.iniciar({ scene, textoSprite, colisores, balcao, janelas: luzesCasas, altura: alturaChao, modelo: (n) => modelos[n] });
  civico.montarPrefeitura(); civico.montarConcessionaria();
  civico.montarBanco(); civico.montarHospital(); civico.montarBombeiros(); civico.montarCemiterio(); civico.montarQuartelExercito();
  balcao(CONTRABANDISTA.x, CONTRABANDISTA.z, '#5a2d2d', 'Contrabandista', 'Arma militar · só clãs');
  for (const b of BANCAS) balcao(b.x, b.z, '#c0392b', 'Banca de Jornal', 'Notícias da cidade');
  criarTeloes();
  criarCaminhaoMovel();

  // jogador
  const av = await avatarP;
  jogador.avatar = av; jogador.nome = nome;
  const arma = clonar('arma_paintball');
  av.encaixarArma(arma); arma.visible = false; jogador.arma = arma; jogador.armaTipo = 'basica';
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
  jogador.etiqueta = textoSprite(nome, { escala: 0.8, cor: '#f2a33a' }); jogador.etiqueta.position.y = alturaNome(av); av.raiz.add(jogador.etiqueta);
  av.tocar('idle');
  jogador.algemado = !!perfil.algemado; jogador.algemadoPor = perfil.algemado_por || null; mostrarAlgemas(jogador.algemado);

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
  else { $('ajuda').innerHTML = CONTROLES_PC.map(([k, t]) => `<kbd>${k}</kbd> ${t}`).join('<br>'); $('ajuda').classList.remove('oculto'); setTimeout(() => $('ajuda').classList.add('oculto'), 15000); }
  $('hud').classList.remove('oculto');
  $('carregando').classList.add('oculto');
  aviso(`Bem-vindo à cidade, ${nome}!`);
  criarNPCs(id);
  conectarMultiplayer(perfil);
  rede.escutarMeuPerfil(perfil.id, { perfil: aplicarPerfil, comando: aoComando, inventario: recarregarInventario });
  iniciarLoja({ perfil: () => jogador.perfil, fome: () => jogador.fome, definirFome: (f) => { jogador.fome = f; desenharFome(); }, curar: usarRemedio, vida: () => jogador.vida,
    casaId: () => (typeof jogador.dentroCasa === 'number' ? jogador.dentroCasa : null),
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
  servicos.iniciar({
    scene, textoSprite, altura: alturaChao, jogador: () => jogador, perfil: () => jogador.perfil, aviso, agora: agoraServidor,
    rastrear: (a) => rastrear(a), rastreio: () => rastreio, meuCla: () => jogador.cla, alcanceJato: () => (jogador.carro?.servico === 'bombeiros' ? 16 : 10), obstaculo: (x, z, a, o) => obstaculoAFrente(x, z, a, o), clas: () => [...clasCache.values()],
    guerrasMudaram: () => {
      atualizarCla();
      const novo = servicos.clasInimigos(jogador.cla, [...clasCache.values()]);
      if ([...novo].join() === [...inimigos].join()) return;
      inimigos = novo; for (const r of remotos.values()) etiquetaStatus(r);
    },
  });
  jornal.iniciarJornal({ perfil: () => jogador.perfil, mudou: () => { tempoJornal = 0.3; tempoTelao = 0; } });
  iniciarGoverno({
    perfil: () => jogador.perfil, agora: agoraServidor, recarregar: () => { tempoPrefeitura = 0.3; tempoCarros = 0.5; tempoSocial = 0.5; },
    clas: () => [...clasCache.values()], territorios: () => [...territorios.values()].map((v) => v.d),
    minhasEmpresas: () => [...empresas.values()].filter((e) => e.dono === jogador.perfil.id),
    meusCarros: () => [...carrosMundo.values()].map((v) => v.d).filter((d) => d.dono === jogador.perfil.id),
    veiculos: meusVeiculos, acaoVeiculo, amigosMudaram: () => carregarAmigos(), jornalMudou: () => { tempoJornal = 0.3; tempoTelao = 0; },
    irRedacao: () => entrarRedacao(), tirarFoto: () => tirarFotoRua(),
    rastrear: (a) => rastrear(a), portaoEmpresa: (id) => portaoDaEmpresa(id),
    locaisTrabalho: () => ({ policia: pontos.delegacia, prf: civico.PREFEITURA.prf, medico: civico.HOSPITAL.balcao, bombeiro: civico.BOMBEIROS.balcao,
      jornalista: civico.PREFEITURA.jornal, exercito: mundo.QUARTEL.portao, agencia: civico.BANCO.empregos }), destinosTaxi, voarPara, vida: () => jogador.vida, curar: () => { jogador.vida = 100; desenharFome(); }, pontoMudou: () => servicos.recomecarPonto(),
  });
  $('btVeiculos').onclick = () => abrirServico('veiculos');
  $('btAmigos').onclick = () => abrirServico('amigos');
  $('btTrabalho').onclick = () => abrirServico('trabalho');
  $('btJornal').onclick = () => { abrirServico('jornal'); $('menuBar').classList.remove('aberto'); };
  $('btMenu').onclick = () => $('menuBar').classList.toggle('aberto');
  $('menuItens').addEventListener('click', (e) => { if (e.target.closest('button') && e.target.closest('button').id !== 'btMenu') $('menuBar').classList.remove('aberto'); });
  $('btCamera').onclick = () => { trocarCamera(); $('menuBar').classList.remove('aberto'); };
  $('btSom').onclick = () => { const l = sons.alternar(); $('btSom').firstChild.textContent = l ? '🔊' : '🔇'; };
  $('btSom').firstChild.textContent = sons.estaLigado() ? '🔊' : '🔇';
  sons.preparar();
  iniciarChat();
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
  iniciarCla({ perfil: () => jogador.perfil, recarregar: () => { tempoSocial = 0; servicos.recarregarGuerras(); }, definirCla: (id, info) => { jogador.cla = id; if ((info?.nome || null) !== (jogador.claInfo?.nome || null)) { jogador.claInfo = info; conexao?.rastrear(metaPresenca()); } } });
  carregarCidadeSocial().catch(() => {});
  criarPoliciaNPC();
  criarSoldadosNPC();
  $('btFianca').onclick = async () => { try { await rede.policia.fianca(); aviso('Fiança paga. Você está livre.'); } catch (e) { aviso(e.message); } };
  iniciarPainel({
    perfil: () => jogador.perfil,
    prefeito: () => prefeitoAtual,
    prefeitoMudou: () => carregarPrefeitura().catch(() => {}),
    climaMudou: async () => { await carregarClima(); conexao?.enviar('clima', {}); },
    climaAgora: () => clima.atual(), climaConfig: () => clima.config(),
    online: () => [...remotos.entries()].map(([id, r]) => ({ id, nome: r.meta.nome })),
    posicaoDe: (id) => { const r = remotos.get(id); return r?.av?.raiz.visible ? r.av.raiz.position : (r?.alvo || null); },
    minhaPosicao: () => jogador.pos,
    teleportar,
    esconderArmaPd: () => rede.pd.esconder(jogador.pos.x, jogador.pos.z),
    locais: () => LOCAIS,
    bueiro: (k) => BUEIROS[k], irPara: (x, z) => { jogador.dentroCasa = null; teleportar(x, z); }, marcar: (a) => rastrear(a),
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
        else {
          const chave = (m) => [m.crimes, m.policial, m.cla, m.prf, m.eleitoral, m.prefeito, m.profissao, m.ferido, m.recompensa, m.patente].join('|');
          if (chave(r.meta) !== chave(meta)) {
            r.meta = meta; etiquetaStatus(r);
            if (meta.ferido && r.av) {
              const souMedico = jogador.perfil?.profissao === 'medico';
              servicos.chamarAmbulancia(id, { x: r.av.raiz.position.x, z: r.av.raiz.position.z }, undefined, souMedico || medicoOnline() ? 40 : 1.5);
              if (souMedico) {
                aviso(`✚ ${meta.nome} está ferido! Vá até a marcação no mapa (+250).`, 5);
                if (!rastreio || rastreio.ferido) rastrear({ nome: `✚ Ferido: ${meta.nome}`, x: r.av.raiz.position.x, z: r.av.raiz.position.z, ferido: id });
              }
            } else {
              servicos.cancelarAmbulancia(id);
              if (rastreio?.ferido === id) rastrear(null);
            }
          }
        }
      }
      for (const id of [...remotos.keys()]) if (!lista[id]) removerRemoto(id);
      atualizarInfo();
    },
    pos: (p) => { const r = remotos.get(p.id); if (r) r.alvo = p; },
    tiro: (t) => criarBola(new THREE.Vector3(t.x, t.y, t.z), new THREE.Vector3(t.vx, t.vy, t.vz), t.c, false, Number(t.s) || 1),
    explosao: (e) => receberExplosao(e),
    voz: (m) => voz.receber(m), gesto: (g) => receberGesto(g), clima: () => carregarClima(), assalto: (a) => avisoAssalto(a), algemaNpc: (m) => receberAlgemaNpc(m), bueiro: (m) => receberBueiro(m),
    dano: (d) => receberDano(d), atropelo: (d) => receberAtropelo(d), chat: (m) => receberChat(m),
    meta: () => metaPresenca(),
  });
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvarAgora(); });
  window.addEventListener('pagehide', salvarAgora);
  voz.iniciar({
    eu: () => (jogador.perfil ? { id: jogador.perfil.id, x: jogador.pos.x, z: jogador.pos.z, cla: jogador.claInfo?.nome || null } : null),
    outros: () => [...remotos.entries()].map(([id, r]) => ({ id, x: r.alvo?.x ?? 0, z: r.alvo?.z ?? 0, cla: r.meta?.cla || null })).filter((o) => remotos.get(o.id)?.alvo),
    enviar: (ev, m) => conexao?.enviar(ev, m), aviso,
  });
  desenharBotaoVoz();
}

async function adicionarRemoto(id, meta) {
  const r = { meta, av: null, arma: null, alvo: null, anim: '', caixa: null };
  remotos.set(id, r);
  try {
    const pasta = ROBOS.includes(meta.personagem) ? 'robos' : 'personagens';
    const av = await criarAvatar(pasta, meta.personagem);
    if (remotos.get(id) !== r) return;          // saiu enquanto carregava
    const arma = clonar('arma_paintball'); av.encaixarArma(arma); arma.visible = false; r.armaCod = 1;
    const et = textoSprite(meta.nome, { escala: 0.8, cor: meta.cargo === 'admin' ? '#ff6b6b' : meta.cargo === 'moderador' ? '#7fb8ff' : '#ffffff' });
    et.position.y = alturaNome(av); av.raiz.add(et);
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
  if (r.esq) { for (const o of r.esq.jipes) scene.remove(o); for (const av of r.esq.soldados) scene.remove(av.raiz); }
}

function atualizarRemotos(dt) {
  for (const r of remotos.values()) {
    if (!r.av || !r.alvo) continue;
    const raiz = r.av.raiz, a = r.alvo;
    if (a.cs || r.esq) atualizarEsquadraRemota(r, a, dt);
    if (a.tr) {   // dentro do trem: a posição vem do horário, igual para todos
      const [li, k, v] = String(a.tr).split('.').map(Number), w = ferrovia.vaga(li, k, v);
      if (w) {
        raiz.position.set(w.x, w.y, w.z); raiz.rotation.y = w.yaw; raiz.visible = true;
        if (r.anim !== 'idle') { r.anim = 'idle'; r.av.tocar('idle', { fade: 0.2 }); }
        r.arma.visible = false; r.av.mixer.update(dt); continue;
      }
    }
    if (r.carro && civico.CARROS[r.carroModelo]?.voa) { const ro = rotorDe(r.carro); if (ro) ro.rotation.y += dt * (r.carro.position.y > alturaChao(r.carro.position.x, r.carro.position.z) + 1 ? 28 : 12); }
    if (a.pg) { raiz.position.set(a.x, a.y, a.z); raiz.visible = false; if (r.algemas) r.algemas.visible = false; r.av.mixer.update(dt); continue; }   // passageiro de outro jogador
    if (a.vc) {   // dirigindo um veículo de empresa: o veículo segue a posição dele
      pilotos.set(Number(a.vc), { x: a.x, y: a.y, z: a.z, r: a.r, t: performance.now() });
      raiz.position.set(a.x, a.y, a.z); raiz.visible = false; r.av.mixer.update(dt); continue;
    }
    if (a.cv) {   // dirigindo: mostra o carro no lugar do personagem
      const [cid, mod, cor] = String(a.cv).split('|');
      if (!r.carro || r.carroId !== cid) { if (r.carro) scene.remove(r.carro); r.carro = civico.modeloCarro(mod, cor); r.carroId = cid; r.carroModelo = mod; r.carro.position.set(a.x, a.y, a.z); scene.add(r.carro); }
      const kc = Math.min(1, dt * 10);
      r.carro.position.x += (a.x - r.carro.position.x) * kc; r.carro.position.y += (a.y - r.carro.position.y) * kc; r.carro.position.z += (a.z - r.carro.position.z) * kc;
      r.carro.rotation.y = suavizarAngulo(r.carro.rotation.y, a.r, dt * 10);
      if (mod === 'ambulancia' || mod === 'bombeiros') civico.atualizarSirenes(performance.now() / 1000, r.carro);
      raiz.position.copy(r.carro.position); raiz.visible = false; r.av.mixer.update(dt); continue;
    }
    if (r.carro) { scene.remove(r.carro); r.carro = null; r.carroId = null; raiz.visible = true; tempoCarros = 0; }
    if (!raiz.visible || Math.hypot(a.x - raiz.position.x, a.z - raiz.position.z) > 8) { raiz.position.set(a.x, a.y, a.z); raiz.visible = true; }
    const k = Math.min(1, dt * 10);
    raiz.position.x += (a.x - raiz.position.x) * k; raiz.position.y += (a.y - raiz.position.y) * k; raiz.position.z += (a.z - raiz.position.z) * k;
    raiz.rotation.y = suavizarAngulo(raiz.rotation.y, a.r, dt * 12);
    if (a.a !== r.anim) {
      r.anim = a.a;
      const umaVez = a.a in ANIM_UMA_VEZ;
      r.av.tocar(a.a, { umaVez, velocidade: ANIM_UMA_VEZ[a.a] || ANIM_VEL[a.a] || 1, fade: umaVez ? 0.1 : 0.2 });
    }
    if (a.ar && a.ar !== r.armaCod && ARMA_POR_COD[a.ar]) { const nova = novaArma(ARMA_POR_COD[a.ar], r.av); r.arma.parent?.remove(r.arma); r.arma = nova; r.armaCod = a.ar; }
    r.arma.visible = !!a.ar;
    if (r.caixa && codigoCaixa(r.caixa) !== (a.cx || 0)) { scene.remove(r.caixa); r.caixa = null; }
    if (a.cx && !r.caixa) r.caixa = criarCaixa(tipoDoCodigo(a.cx));
    r.av.mixer.update(dt);
    raiz.updateMatrixWorld(true);
    if (a.mh) posarAperto(r.av);
    if (r.caixa) posicionarCaixa(r.av, r.caixa, raiz.rotation.y);
    if (a.al && !r.algemas) { r.algemas = clonar('algemas'); r.algemas.scale.setScalar(1.4); scene.add(r.algemas); }
    if (!a.al && r.algemas) { scene.remove(r.algemas); r.algemas = null; }
    if (r.algemas) { r.algemas.visible = true; posicionarAlgemas(r.av, r.algemas); }
  }
}

function enviarEstado(dt) {
  if (!conexao || !conectado) return;
  envioTimer -= dt; tempoKeepAlive -= dt;
  if (envioTimer > 0) return;
  envioTimer = 0.15;
  const j = jogador, r2 = (v) => Math.round(v * 100) / 100;
  const est = { id: j.perfil.id, x: r2(j.pos.x), y: r2(j.pos.y + (j.carro?.voa && !j.carro.caminhao ? j.carro.alt || 0 : 0)), z: r2(j.pos.z), r: r2(j.yaw), a: j.avatar.nomeAtual || 'idle', ar: j.armado ? ARMAS[j.armaTipo || 'basica'].cod : 0, cx: codigoCaixa(j.carregando), al: j.algemado ? 1 : 0, tr: j.trem ? `${j.trem.li}.${j.trem.k}.${j.trem.v}` : 0, cv: j.carro && !j.carro.caminhao ? `${j.carro.id}|${j.carro.modelo}|${j.carro.cor}` : 0, vc: j.carro?.caminhao || j.passageiro?.c.d.id || 0, pg: j.passageiro?.piloto || j.levadoPor || 0, cs: codigoEsquadra(), mh: j.aperto ? 1 : 0, ap: j.algemado ? (j.algemadoPor || 0) : 0, sg: j.segurando ? (j.segurando.npc !== undefined ? 'n' + j.segurando.npc : j.segurando.id) : 0 };
  const u = ultimoEnvio;
  const mudou = !u || Math.abs(u.x - est.x) > 0.03 || Math.abs(u.z - est.z) > 0.03 || Math.abs(u.r - est.r) > 0.05 || u.a !== est.a || u.ar !== est.ar || u.cx !== est.cx || u.al !== est.al || u.tr !== est.tr || u.cv !== est.cv || u.vc !== est.vc || u.pg !== est.pg || u.cs !== est.cs || u.mh !== est.mh || u.ap !== est.ap || u.sg !== est.sg;
  if (!mudou && tempoKeepAlive > 0) return;
  conexao.enviar('pos', est); ultimoEnvio = est; tempoKeepAlive = 3;
}

async function salvarAgora() {
  if (!jogador.perfil || !jogador.avatar) return;
  const c = typeof jogador.dentroCasa === 'string' ? (jogador.saidaSala ? { x: jogador.saidaSala.x - 2, z: jogador.saidaSala.z } : null) : jogador.dentroCasa ? casasMundo.get(jogador.dentroCasa)?.d : null;
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
  if (npcs.some((n) => n.policia && n.perseguindo) && (jogador.perfil?.crimes || 0) > 0) iniciarCerco(c.x + 2, c.z);
  const i = criarInterior(c.id);
  jogador.dentroCasa = c.id;
  if (jogador.carregando) { scene.remove(jogador.carregando); jogador.carregando = null; }
  teleportar(i.base.x + 4, i.base.z + 3);
  aviso('Bem-vindo à sua casa. Use a cama para recuperar a vida.', 3);
}
function sairDeCasa() {
  if (typeof jogador.dentroCasa === 'string') { sairSala(); return; }
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
  const sala = i.sala || SALA;
  p.x = THREE.MathUtils.clamp(p.x, i.base.x - sala.w / 2 + 0.5, i.base.x + sala.w / 2 - 0.5);
  p.z = THREE.MathUtils.clamp(p.z, i.base.z - sala.d / 2 + 0.5, i.base.z + sala.d / 2 - 0.5);
  // não atravessa os móveis
  for (const [x0, x1, z0, z1] of i.obst || [[-5.5, -3.3, -4.8, -1.4], [3.4, 5.0, -4.8, -3.7], [-0.3, 1.9, -1.2, 0.2]]) {
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
    { pts: servicos.faixaDireita(rotaGrade(T, F)), dur: r.d1 }, { parado: true, dur: r.carga },
    { pts: servicos.faixaDireita(rotaGrade(F, D)), dur: r.d2 }, { parado: true, dur: r.descarga },
    { pts: servicos.faixaDireita(rotaGrade(D, T)), dur: r.d3 },
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
  if ((tipo === 'van' || tipo === 'helicoptero') && modelos[tipo]) {
    const o = clonar(tipo);
    if (tipo === 'helicoptero') {   // hélice girando: disco translúcido sobre as pás
      const disco = new THREE.Mesh(new THREE.CircleGeometry(5.1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#222', transparent: true, opacity: 0.18, depthWrite: false }));
      const rotor = new THREE.Group(); rotor.position.y = 3.9; rotor.add(disco);
      for (const a of [0, Math.PI / 2]) { const pa = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 10), new THREE.MeshBasicMaterial({ color: '#333', transparent: true, opacity: 0.5 })); pa.rotation.y = a; rotor.add(pa); }
      o.add(rotor); o.userData.rotor = rotor; rotor.visible = false;
    }
    return o;
  }
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
  const meu = jogador.carro?.caminhao === d.id;
  if (meu && performance.now() - jogador.carro.desde > 4000 && (d.status !== 'dirigido' || d.motorista !== jogador.perfil.id)) {
    sairCarroLocal(); aviso('O veículo voltou para o dono.', 3);
  }
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
    if (c.d.status === 'dirigido') { atualizarDirigido(c, dt); continue; }
    if (c.d.status !== 'parado' && c.d.partida) {
      const p = pernas(c);
      let t = (agora - Date.parse(c.d.partida)) / 1000 - (c.atraso || 0), anterior = null;
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
    if (!estacionado && !alvo.parado && c.d.tipo !== 'helicoptero' && c.obj.visible) {
      const bloq = obstaculoAFrente(c.obj.position.x, c.obj.position.z, c.obj.rotation.y, c.obj);
      c.atraso = bloq ? Math.min(30, (c.atraso || 0) + dt) : Math.max(0, (c.atraso || 0) - dt * 0.4);
    } else if (estacionado) c.atraso = 0;
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
      c.noChao = !estacionado && !!alvo.parado && c.d.status === 'em_rota';
      if (ro.rotor) { ro.rotor.rotation.y += dt * (voando ? 28 : 3); if (modelos.helicoptero) ro.rotor.visible = voando; }
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
  atualizarEjetados(dt);
  atualizarTaxi(dt);
  atualizarChamadas(dt);
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
    robo: (r) => aoRobo(r),
    armaPd: (a) => aoArmaPd(a),
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
  return { nome: p.nome, personagem: skinAtual(), cargo: p.cargo, crimes: p.crimes || 0, policial: !!p.policial, cla: jogador.claInfo?.nome || null,
    prf: !!p.prf, eleitoral: !!p.eleitoral, prefeito: prefeitoAtual === p.id, profissao: p.profissao || null, ferido: !!jogador.ferido, recompensa: p.recompensa || 0, patente: jogador.patente || null };
}
// etiqueta acima do nome: procurado, polícia ou clã
function etiquetaStatus(r) {
  if (!r.av) return;
  if (r.status) { r.av.raiz.remove(r.status); r.status = null; }
  const m = r.meta;
  const inimigo = m.cla && inimigos.has(m.cla);
  const txt = m.ferido ? '✚ FERIDO' : m.recompensa > 0 ? `🎯 PROCURADO · ${Number(m.recompensa).toLocaleString('pt-BR')}` : inimigo ? `⚔️ INIMIGO [${m.cla}]` : m.crimes > 0 ? `PROCURADO${m.eleitoral ? ' (PRF)' : ''} ${'★'.repeat(Math.min(5, m.crimes))}` : m.prefeito ? '★ PREFEITO ★'
    : m.policial ? `POLÍCIA${m.patente ? ` · ${m.patente}` : ''}` : m.prf ? `PRF${m.patente ? ` · ${m.patente}` : ''}` : m.profissao === 'medico' ? `✚ ${(m.patente || 'MÉDICO').toUpperCase()}`
    : m.profissao === 'bombeiro' ? `🚒 ${(m.patente || 'BOMBEIRO').toUpperCase()}` : m.profissao === 'jornalista' ? `📰 ${(m.patente || 'IMPRENSA').toUpperCase()}` : m.profissao === 'exercito' ? `🎖️ ${(m.patente || 'EXÉRCITO').toUpperCase()}` : m.cla ? `[${m.cla}]` : null;
  if (!txt) return;
  const fundo = m.ferido ? 'rgba(200,40,40,.95)' : m.recompensa > 0 ? 'rgba(110,0,0,.97)' : inimigo ? 'rgba(140,10,10,.95)' : m.crimes > 0 ? 'rgba(170,30,30,.92)' : m.prefeito ? 'rgba(242,194,48,.95)' : m.policial ? 'rgba(30,70,160,.92)'
    : m.prf ? 'rgba(20,40,90,.95)' : m.profissao === 'medico' ? 'rgba(240,240,240,.95)' : m.profissao === 'bombeiro' ? 'rgba(200,60,20,.95)' : m.profissao === 'exercito' ? 'rgba(62,78,40,.95)' : 'rgba(40,40,40,.85)';
  r.status = textoSprite(txt, { escala: 0.6, cor: m.prefeito || m.profissao === 'medico' && !m.ferido && !inimigo && !(m.crimes > 0) ? '#20160a' : '#ffffff', fundo });
  r.status.position.y = alturaNome(r.av) + 0.45; r.av.raiz.add(r.status);
}

function aplicarDanoRemoto(id, valor) {
  conexao?.enviar('dano', { alvo: id, v: valor, de: jogador.perfil.id });
  const ultimo = jogador.agredidos.get(id) || 0;
  if (performance.now() - ultimo > 60000) { jogador.agredidos.set(id, performance.now()); rede.combate.agressao(id).catch(() => {}); }
}
function golpeSoco() {
  const f = new THREE.Vector3(Math.sin(jogador.yaw), 0, Math.cos(jogador.yaw));
  for (const n of npcs) {
    if (!n.policia) continue;
    const d = new THREE.Vector3().subVectors(n.av.raiz.position, jogador.pos); d.y = 0;
    const dist = d.length();
    if (dist < 1.7 && dist > 0.01 && d.normalize().dot(f) > 0.5) { acertarPoliciaNPC(n, 10); return; }
  }
  for (const [id, r] of remotos) {
    if (!r.av?.raiz.visible) continue;
    const d = new THREE.Vector3().subVectors(r.av.raiz.position, jogador.pos); d.y = 0;
    const dist = d.length();
    if (dist < 1.7 && dist > 0.01 && d.normalize().dot(f) > 0.5) { aplicarDanoRemoto(id, 10); return; }
  }
  const c = caminhaoProximo(3.4);
  if (c) atacarCaminhao(c);
}
// mira das armas novas (e do tanque): só quem está usando vê. Mostra a curva da tinta e onde ela vai cair;
// o círculo fica vermelho quando o tiro vai pegar em alguém.
let mira = null;
function criarMira() {
  const N = 40, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const linha = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.85, depthTest: false }));
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
  const ponto = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), anel.material);
  anel.add(ponto); linha.renderOrder = anel.renderOrder = 999; linha.frustumCulled = false;
  scene.add(linha, anel); mira = { linha, anel, N };
}
function atualizarMira() {
  const j = jogador, tanque = j.carro?.servico === 'tanque';
  const ligada = j.avatar && !j.morto && (tanque || (j.armado && !j.carro && j.armaTipo && j.armaTipo !== 'basica'));
  if (!ligada) { if (mira) mira.linha.visible = mira.anel.visible = false; return; }
  if (!mira) criarMira();
  const A = ARMAS[j.armaTipo] || ARMAS.basica, f = new THREE.Vector3(Math.sin(j.yaw), 0, Math.cos(j.yaw));
  let boca, v;
  if (tanque) { const m = j.carro.mesh.position; boca = new THREE.Vector3(m.x, m.y + 2.2, m.z).addScaledVector(f, 4.6); v = f.clone().multiplyScalar(36).add(new THREE.Vector3(0, 2.2, 0)); }
  else {
    j.avatar.raiz.updateMatrixWorld(true);
    boca = j.arma.localToWorld(new THREE.Vector3(...(modelos[A.modelo] ? A.boca : ARMAS.basica.boca)));
    const vy = miraNoAlvo(boca, f, A.vel); v = f.clone().multiplyScalar(A.vel).add(new THREE.Vector3(0, vy ?? 1.2 * 24 / A.vel, 0));
  }
  const cor = tanque ? '#1f9e46' : A.cor || '#ffffff';
  const pos = mira.linha.geometry.attributes.position, p = boca.clone(), vel = v.clone();
  let n = 0, fim = p.clone(), alguem = false, dtp = tanque ? 0.07 : 0.05;
  for (; n < mira.N; n++) {
    pos.setXYZ(n, p.x, p.y, p.z); fim.copy(p);
    for (const r of remotos.values()) if (r.av?.raiz.visible && Math.hypot(p.x - r.av.raiz.position.x, p.z - r.av.raiz.position.z) < 0.6 && p.y > r.av.raiz.position.y && p.y < r.av.raiz.position.y + 2) alguem = true;
    for (const nn of npcs) if (nn.policia && nn.caido <= 0 && Math.hypot(p.x - nn.av.raiz.position.x, p.z - nn.av.raiz.position.z) < 0.6) alguem = true;
    if (alguem || p.y <= alturaChao(p.x, p.z) + 0.03 || colisores.some((c) => c.tipo === 'caixa' && p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1 && p.y < 7)) { n++; break; }
    vel.y -= 9.8 * dtp; p.addScaledVector(vel, dtp);
  }
  for (let k = n; k < mira.N; k++) pos.setXYZ(k, fim.x, fim.y, fim.z);
  pos.needsUpdate = true; mira.linha.geometry.setDrawRange(0, n); mira.linha.computeLineDistances();
  mira.linha.material.color.set(cor);
  mira.anel.material.color.set(alguem ? '#ff3030' : cor);
  mira.anel.position.copy(fim); mira.anel.quaternion.copy(camAtiva.quaternion);
  mira.anel.scale.setScalar(tanque ? 2.2 : 1);
  mira.linha.visible = mira.anel.visible = true;
}
// no estande, a mira compensa a queda da tinta: se você está virado para um alvo, o tiro sai na curva certa até ele
const podeAlvo = (a) => (a.quem ? daPolicia() : militar());
function miraNoAlvo(boca, dir, vel) {
  if (!militar() && !daPolicia()) return null;
  let melhor = null, mc = 0.985;
  for (const a of civico.EXERCITO.alvos || []) {
    if (!podeAlvo(a)) continue;
    const dx = a.x - boca.x, dz = a.z - boca.z, d = Math.hypot(dx, dz), c = (dx * dir.x + dz * dir.z) / d;
    if (d > 2 && d < 60 && c > mc) { mc = c; melhor = { a, d }; }
  }
  if (!melhor) return null;
  const t = melhor.d / vel; return (melhor.a.y - boca.y + 4.9 * t * t) / t;
}
// estande de tiro do quartel: pontos pelo anel acertado, mais pontos quanto mais longe
let pontosEstande = 0, avisoEstande = 0;
function acertoNoAlvo(b) {
  const p = b.m.position;
  for (const a of civico.EXERCITO.alvos || []) {
    if (Math.abs(p.x - a.x) > 0.35 || Math.abs(p.z - a.z) > a.raio + 0.1 || Math.abs(p.y - a.y) > a.raio + 0.1) continue;
    const r = Math.hypot(p.z - a.z, p.y - a.y); if (r > a.raio + 0.07) continue;
    if (!podeAlvo(a)) return true;
    const anel = r < 0.07 ? 10 : r < 0.17 ? 8 : r < 0.3 ? 6 : r < 0.42 ? 4 : 2, pts = Math.round(anel * (1 + a.d / 20));
    pontosEstande += pts;
    manchar(new THREE.Vector3(a.x - 0.03, p.y, p.z), new THREE.Vector3(-1, 0, 0), b.cor);
    aviso(`🎯 Alvo de ${a.d} m: ${anel === 10 ? 'NA MOSCA! ' : ''}+${pts} pontos · total ${pontosEstande}`, 1.6);
    return true;
  }
  return false;
}
function acertoDaBola(b) {
  const p = b.m.position;
  if (cacada && esquadra.pronto) {   // atirou nos soldados da caçada: eles revidam
    for (const u of esquadra.soldados) { const q = u.av.raiz.position; if (u.av.raiz.visible && Math.hypot(p.x - q.x, p.z - q.z) < 0.6 && p.y > q.y && p.y < q.y + 2) { esquadra.hostil = 60; manchar(p.clone(), new THREE.Vector3(0, 1, 0), b.cor); aviso('🎖️ Você atirou no Exército: os soldados estão revidando!', 2.5); return true; } }
    for (const u of esquadra.jipes) { const q = u.obj.position; if (u.obj.visible && Math.hypot(p.x - q.x, p.z - q.z) < 2.2 && p.y < q.y + 2.5) { esquadra.hostil = 60; manchar(p.clone(), new THREE.Vector3(0, 1, 0), b.cor); return true; } }
  }
  if (b.tanque) return acertoTanque(b);
  for (const n of npcs) {
    if (!n.policia) continue;
    const q = n.av.raiz.position;
    if (n.caido <= 0 && Math.hypot(p.x - q.x, p.z - q.z) < 0.55 && p.y > q.y + 0.1 && p.y < q.y + 2) { acertarPoliciaNPC(n, b.pd ? 100 : b.dano || 20); manchar(p.clone(), new THREE.Vector3(0, 1, 0), b.cor); return true; }
  }
  for (const [id, r] of remotos) {
    if (!r.av?.raiz.visible) continue;
    const q = r.av.raiz.position;
    if (Math.hypot(p.x - q.x, p.z - q.z) < 0.5 && p.y > q.y + 0.1 && p.y < q.y + 1.9) {
      if (b.pd) acertoDourado(id); else aplicarDanoRemoto(id, b.dano || 20);
      manchar(p.clone(), new THREE.Vector3(0, 1, 0), b.cor); return true;
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
    if (c.d.status !== 'em_rota' || c.d.roubado || (c.d.tipo === 'helicoptero' && !c.noChao)) continue;
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
    const vida = await rede.combate.atacarCaminhao(c.d.id, c.obj.position.x, c.obj.position.z, c.obj.rotation.y);
    if (vida > 0) aviso(`${NOME_VEICULO[c.d.tipo] || 'Veículo'}: ${vida} de vida`, 1.2);
    else if (vida === 0) {
      c.d = { ...c.d, status: 'dirigido', motorista: jogador.perfil.id, sequestrado: true, roubado: true, pos_x: c.obj.position.x, pos_z: c.obj.position.z, ang: c.obj.rotation.y };
      iniciarCaronaParada(c, 'roubo');
      aviso('O veículo parou! Toque em RENDER MOTORISTA para ele levar a carga até o seu território ou a sua casa.', 5);
    }
  } catch (e) { aviso(e.message); }
}

// ---------------------------------------------------------------- veículos de empresa: robô motorista, sequestro e direção
const NOME_VEICULO = { caminhao: 'Caminhão', van: 'Van', helicoptero: 'Helicóptero' };
const pilotos = new Map();      // caminhão -> última posição transmitida por quem dirige
const ejetados = [];
// o robô motorista é arrancado do banco e cai fora do veículo; some depois de 3 s
function ejetarRobo(obj) {
  if (!modelos.robo_motorista) return;
  const m = clonar('robo_motorista');
  m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; } });
  const ry = obj.rotation.y, lado = { x: Math.cos(ry), z: -Math.sin(ry) };
  m.position.set(obj.position.x + lado.x * 1.1, obj.position.y + 1.0, obj.position.z + lado.z * 1.1); m.rotation.y = ry;
  scene.add(m);
  ejetados.push({ m, v: new THREE.Vector3(lado.x * 5.5, 5, lado.z * 5.5), giro: (Math.random() - 0.5) * 6, t: 0, ry });
}
function atualizarEjetados(dt) {
  for (let i = ejetados.length - 1; i >= 0; i--) {
    const e = ejetados[i]; e.t += dt;
    const chao = alturaChao(e.m.position.x, e.m.position.z);
    if (e.m.position.y > chao + 0.01 || e.v.y > 0) {
      e.v.y -= 14 * dt; e.m.position.addScaledVector(e.v, dt);
      e.m.rotation.z += e.giro * dt; e.m.rotation.x += e.giro * 0.5 * dt;
      if (e.m.position.y <= chao) { e.m.position.y = chao; e.v.set(0, 0, 0); e.m.rotation.x *= 0.3; e.m.rotation.z = Math.sign(e.giro) * Math.PI / 2 * 0.9; }
    }
    if (e.t > 3) e.m.traverse((o) => { if (o.isMesh) o.material.opacity = Math.max(0, 1 - (e.t - 3) / 0.6); });
    if (e.t > 3.6) { scene.remove(e.m); ejetados.splice(i, 1); }
  }
}
function atualizarDirigido(c, dt) {
  c.obj.visible = true; c.posicionado = false; c.manobra = null;
  if (c.escolta) { scene.remove(c.escolta); c.escolta = null; }
  if (jogador.carro?.caminhao === c.d.id || taxi?.c === c) return;          // sou eu que estou dirigindo (ou é o meu táxi)
  if (c.chamada) { andarChamada(c, c.obj, () => { c.chamada = null; }); return; }
  const pl = pilotos.get(c.d.id), vivo = pl && performance.now() - pl.t < 1500 && c.d.motorista;
  const x = vivo ? pl.x : c.d.pos_x, z = vivo ? pl.z : c.d.pos_z, ang = vivo ? pl.r : c.d.ang;
  if (x == null || z == null) return;
  if (Math.hypot(x - c.obj.position.x, z - c.obj.position.z) > 40) c.obj.position.set(x, c.obj.position.y, z);
  const k = Math.min(1, dt * 8);
  c.obj.position.x += (x - c.obj.position.x) * k; c.obj.position.z += (z - c.obj.position.z) * k;
  c.obj.rotation.y = suavizarAngulo(c.obj.rotation.y, ang || 0, dt * 8);
  const voando = c.d.tipo === 'helicoptero' && vivo && pl && Math.hypot(pl.x - c.obj.position.x, pl.z - c.obj.position.z) > 0.05;
  const alvoY = alturaChao(c.obj.position.x, c.obj.position.z) + (c.d.tipo === 'helicoptero' && c.d.motorista ? (voando || c.obj.position.y > 2 ? 22 : 0) : 0.02);
  c.obj.position.y += (alvoY - c.obj.position.y) * Math.min(1, dt * 1.5);
  const ro = c.obj.userData.rotor; if (ro) { ro.visible = !!c.d.motorista; ro.rotation.y += dt * 28; }
}
// ambulância (médico) e caminhão dos bombeiros (bombeiro) na base
function servicoProximo() {
  if (jogador.carro || jogador.trem) return null;
  const prof = jogador.perfil?.profissao;
  if (militar()) {   // Exército (e o General Supremo): o veículo da exposição (ilimitado) ou o seu, onde você deixou
    const lista = [...civico.EXERCITO.veiculos, ...(meuMilitar ? [{ modelo: meuMilitar.modelo, mesh: meuMilitar.mesh, meu: true }] : [])];
    let melhor = null, dm = 6;
    for (const v of lista) { const d = Math.hypot(v.mesh.position.x - jogador.pos.x, v.mesh.position.z - jogador.pos.z); if (d < dm) { dm = d; melhor = v; } }
    return melhor ? { exercito: melhor, modelo: melhor.modelo } : null;
  }
  const base = prof === 'medico' ? civico.HOSPITAL : prof === 'bombeiro' ? civico.BOMBEIROS : null;
  if (!base?.veiculo || Math.hypot(base.veiculo.position.x - jogador.pos.x, base.veiculo.position.z - jogador.pos.z) > 5.5) return null;
  return { base, modelo: prof === 'medico' ? 'ambulancia' : prof === 'exercito' ? 'militar' : 'bombeiros' };
}
function militar() { return jogador.perfil?.profissao === 'exercito' || jogador.perfil?.cargo === 'admin'; }
let meuMilitar = null;   // { modelo, mesh }: o veículo do Exército que você pegou (fica onde você deixar)
function podePilotarHeliExercito() { return jogador.perfil?.cargo === 'admin' || (jogador.patenteNivel || 0) >= 8; }
function entrarServico(sv) {
  if (jogador.carregando) { aviso('Largue a caixa antes de dirigir.'); return; }
  if (sv.exercito) {
    if (sv.modelo === 'helicoptero_exercito' && !podePilotarHeliExercito()) { aviso('Só Tenente para cima pilota o helicóptero do Exército. Você pode ir de passageiro.', 3.5); return; }
    if (!sv.exercito.meu) {   // pega uma cópia nova; a da vitrine continua lá
      if (meuMilitar) scene.remove(meuMilitar.mesh);
      const m = civico.modeloCarro(sv.modelo, '#ffffff'); m.position.copy(sv.exercito.mesh.position); m.rotation.y = sv.exercito.mesh.rotation.y; scene.add(m);
      sv.exercito.mesh.visible = false; setTimeout(() => { sv.exercito.mesh.visible = true; }, 4000);
      meuMilitar = { modelo: sv.modelo, mesh: m };
    }
    sv.base = { veiculo: meuMilitar.mesh };
  }
  if (jogador.armado) alternarArma();
  modoVolante(true);
  const m = sv.base.veiculo;
  jogador.carro = { id: 's' + jogador.perfil.id.slice(0, 8), servico: sv.modelo, modelo: sv.modelo, cor: '#ffffff', vel: 0, mesh: m, salvar: 1e9, max: civico.CARROS[sv.modelo].vel,
    raio: sv.modelo === 'bombeiros' || sv.modelo === 'exercito_caminhao' ? 1.9 : 1.6, voa: !!civico.CARROS[sv.modelo].voa, alt: 0 };
  jogador.pos.set(m.position.x, alturaChao(m.position.x, m.position.z), m.position.z); jogador.yaw = m.rotation.y; jogador.alvo = null;
  jogador.avatar.raiz.visible = false;
  document.body.classList.toggle('tanque', sv.modelo === 'tanque');
  if (sv.modelo === 'tanque' && TOQUE) $('btTiro').classList.remove('oculto');
  if (sv.modelo === 'tanque') aviso('Tanque: toque em Atirar (no PC, F) para disparar o canhão de tinta. Ele explode veículos; eles voltam para o dono em 30 s.', 4.5);
  else if (civico.DO_EXERCITO.has(sv.modelo)) aviso(sv.modelo === 'helicoptero_exercito' ? 'Helicóptero do Exército: acelere para decolar e pare para pousar. Leva até 6 militares.' : `${civico.CARROS[sv.modelo].nome}: leva até ${civico.LUGARES[sv.modelo]} militares de passageiro.`, 3.5);
  else aviso(sv.modelo === 'ambulancia' ? 'Ambulância: os feridos aparecem no mapa (✚). Pare perto, desça e socorra.' : 'Caminhão dos bombeiros: os incêndios aparecem no mapa (🔥). Pare perto e toque em Jato, sem descer.', 4);
  if (sv.modelo === 'bombeiros' && !rastreio) {   // já aponta o fogo mais perto
    const f = [...servicos.listaIncendios()].sort((a, b) => Math.hypot(a.x - jogador.pos.x, a.z - jogador.pos.z) - Math.hypot(b.x - jogador.pos.x, b.z - jogador.pos.z))[0];
    if (f) rastrear({ nome: `🔥 ${f.nome}`, x: f.x, z: f.z });
  }
  if (sv.modelo === 'ambulancia' && !rastreio) {
    const fer = [...remotos.entries()].find(([, r]) => r.meta?.ferido && r.av);
    if (fer) rastrear({ nome: `✚ Ferido: ${fer[1].meta.nome}`, x: fer[1].av.raiz.position.x, z: fer[1].av.raiz.position.z, ferido: fer[0] });
  }
}
function acaoNoVeiculo() {
  const c = jogador.carro;
  if (podeDescarregar()) return ['descarregar', `descarregar ${c.carga} caixas roubadas`, 'Descarregar'];
  if (c.servico === 'bombeiros' && Math.abs(c.vel) < 2 && (servicos.estaApagando() || servicos.fogoProximo(15))) return ['jato', servicos.estaApagando() ? 'jogando água (toque para parar)' : 'jogar água no fogo (+400)', 'Jato'];
  if (c.servico === 'ambulancia' && Math.abs(c.vel) < 2 && feridoProximo(7)) return ['socorrer', 'socorrer o ferido (+250)', 'Socorrer'];
  return null;
}
function donoDoVeiculo(c) { return empresas.get(c.d.empresa)?.dono === jogador.perfil?.id; }
// veículo perto para entrar: meu (qualquer um), roubado abandonado, ou da minha garagem pelo portão
function veiculoProximo() {
  if (jogador.carro || jogador.trem) return null;
  let melhor = null, dm = 4.8;
  for (const c of caminhoes.values()) {
    if (!c.obj.visible) continue;
    const d = Math.hypot(c.obj.position.x - jogador.pos.x, c.obj.position.z - jogador.pos.z);
    if (d >= dm || (c.d.tipo === 'helicoptero' && c.obj.position.y > alturaChao(c.obj.position.x, c.obj.position.z) + 1.5)) continue;
    const nome = NOME_VEICULO[c.d.tipo] || 'veículo';
    const livre = !(c.d.status === 'dirigido' && c.d.motorista);
    if (donoDoVeiculo(c) && livre) { dm = d; melhor = { c, texto: [`pegar carona no seu ${nome.toLowerCase()}${c.d.sequestrado ? ' (recuperar)' : ''}`, 'Carona'] }; continue; }
    if (c.d.status === 'dirigido' && c.d.sequestrado && livre) {
      const pol = jogador.perfil?.policial || jogador.perfil?.prf;
      dm = d; melhor = { c, texto: pol ? ['devolver o veículo roubado ao dono (+300)', 'Recuperar'] : [`render o motorista do ${nome.toLowerCase()} roubado`, 'Render'] };
    }
  }
  if (melhor) return melhor;
  // garagem: perto do portão de uma empresa minha, pega o primeiro veículo guardado
  for (const [lote, u] of unidades) {
    const e = empresas.get(u.empresa); if (!e || e.dono !== jogador.perfil?.id) continue;
    const l = LOTES_VENDA.find((x) => x.id === lote); if (!l || Math.hypot(l.portao.x - jogador.pos.x, l.portao.z - jogador.pos.z) > 6) continue;
    const guardado = [...caminhoes.values()].filter((c) => c.d.empresa === e.id && c.d.status === 'parado' && !c.obj.visible)
      .sort((a, b) => ['caminhao', 'van', 'helicoptero'].indexOf(a.d.tipo) - ['caminhao', 'van', 'helicoptero'].indexOf(b.d.tipo))[0];
    if (guardado) return { c: guardado, garagem: l.portao, texto: [`pegar carona: ${NOME_VEICULO[guardado.d.tipo]?.toLowerCase() || 'veículo'} da garagem`, 'Carona'] };
  }
  return null;
}
function podeDescarregar() {
  const c = jogador.carro;
  if (!c?.caminhao || !c.sequestrado || !(c.carga > 0) || Math.abs(c.vel) > 2) return false;
  const p = jogador.pos;
  if (jogador.cla) for (const v of territorios.values()) if (v.d.dono_cla === jogador.cla && Math.abs(v.d.x - p.x) < 30 && Math.abs(v.d.z - p.z) < 30) return true;
  return casasLista.some((d) => moraEm(d) && Math.abs(d.x - p.x) < 23 && Math.abs(d.z - p.z) < 23);
}
async function descarregarRoubo() {
  if (ocupado) return; ocupado = true;
  try {
    const n = await rede.veiculos.descarregar(jogador.carro.caminhao, jogador.pos.x, jogador.pos.z);
    jogador.carro.carga = 0;
    aviso(`📦 ${n} caixas descarregadas ${jogador.cla ? 'no estoque do clã' : 'na sua mochila'}!`, 4);
  } catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}

// ---------------------------------------------------------------- trânsito: ninguém atravessa ninguém
let corposCache = null, corposT = 0;
function corposNaRua() {
  if (corposCache && performance.now() - corposT < 40) return corposCache;
  const r = [];
  const chao = (o) => o.position.y < alturaChao(o.position.x, o.position.z) + 1.5;
  for (const c of caminhoes.values()) if (c.obj.visible && chao(c.obj)) r.push({ o: c.obj, x: c.obj.position.x, z: c.obj.position.z, r: c.d.tipo === 'caminhao' ? 2 : 1.6 });
  for (const v of carrosMundo.values()) if (v.mesh.visible) r.push({ o: v.mesh, x: v.mesh.position.x, z: v.mesh.position.z, r: 1.4 });
  for (const [id, x] of remotos) {
    if (x.carro) r.push({ o: x.carro, x: x.carro.position.x, z: x.carro.position.z, r: 1.5 });
    else if (x.av?.raiz.visible) r.push({ x: x.av.raiz.position.x, z: x.av.raiz.position.z, r: 0.45, pessoa: id });
  }
  for (const o of servicos.veiculosNpc()) r.push({ o, x: o.position.x, z: o.position.z, r: 1.9 });
  if (caminhaoMovel) r.push({ o: caminhaoMovel.obj, x: caminhaoMovel.obj.position.x, z: caminhaoMovel.obj.position.z, r: 2 });
  for (const n of npcs) r.push({ x: n.av.raiz.position.x, z: n.av.raiz.position.z, r: 0.45, npc: n.policia ? n : null, civilRef: n });
  for (const v of viaturas) r.push({ o: v.obj, x: v.obj.position.x, z: v.obj.position.z, r: 1.8 });
  if (jogador.avatar && !jogador.carro && !jogador.passageiro && !jogador.dentroCasa) r.push({ x: jogador.pos.x, z: jogador.pos.z, r: 0.45, eu: true });
  if (jogador.carro && !jogador.carro.voa && !jogador.carro.taxi) r.push({ o: jogador.carro.mesh, x: jogador.pos.x, z: jogador.pos.z, r: 1.6 });
  corposCache = r; corposT = performance.now();
  return r;
}
function obstaculoAFrente(x, z, ang, ignorar, dist = 7.5) {
  const fx = Math.sin(ang), fz = Math.cos(ang);
  for (const o of corposNaRua()) {
    if (ignorar && o.o === ignorar) continue;
    const dx = o.x - x, dz = o.z - z, f = dx * fx + dz * fz;
    if (f > 0.5 && f < dist && Math.abs(dx * fz - dz * fx) < 1.5 + o.r) return true;
  }
  return false;
}
// quem dirige bate nos outros veículos; atropelar machuca (jogadores e polícia NPC)
let tremor = 0;
const atropelados = new Map();
function colidirVeiculo(c, dt) {
  const raio = c.raio || 1.3, p = jogador.pos, chaveDe = (o) => o.o || o.pessoa || o.npc || o.civilRef;
  // quem já estava encostado quando entrou (doca, garagem, fila de veículos) não empurra: o veículo sai normalmente
  if (!c.fantasmas) {
    c.fantasmas = new Set();
    for (const o of corposNaRua()) if (o.o !== c.mesh && !o.eu && Math.hypot(p.x - o.x, p.z - o.z) < raio + o.r + 0.3) c.fantasmas.add(chaveDe(o));
  }
  for (const o of corposNaRua()) {
    if (o.o === c.mesh || o.eu) continue;
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), min = raio + o.r;
    if (c.fantasmas.has(chaveDe(o))) { if (d > min + 0.5) c.fantasmas.delete(chaveDe(o)); continue; }
    if (d >= min || d < 1e-4) continue;
    if ((o.pessoa || o.npc) && Math.abs(c.vel) > 5) {
      const chave = o.pessoa || o.npc;
      if (performance.now() - (atropelados.get(chave) || 0) > 1500) {
        atropelados.set(chave, performance.now());
        const dano = Math.abs(c.vel) >= 8 ? 100 : Math.round(Math.abs(c.vel) * 9);    // rápido mata na hora
        if (o.pessoa) { conexao?.enviar('atropelo', { alvo: o.pessoa, v: dano, de: jogador.perfil.id }); rede.combate.agressao(o.pessoa).catch(() => {}); }
        else acertarPoliciaNPC(o.npc, dano);
        aviso('💥 Atropelamento!', 1.2); tremor = 0.3;
      }
    }
    // empurrão limitado: no máximo o quanto o veículo andou neste quadro (nunca dispara)
    const empurra = Math.min(min - d, Math.abs(c.vel) * dt + 0.03);
    p.x += dx / d * empurra; p.z += dz / d * empurra;
  }
}
// dano que vem de NPC (tiro da polícia)
function danoLocal(v) {
  const j = jogador;
  if (j.morto || !j.avatar || j.perfil?.imortal || j.pena > 0) return;
  j.vida -= v; desenharFome();
  if (j.vida <= 0) { j.ultimoAgressor = null; morrerLocal(); return; }
  if (!j.carro && j.trava <= 0) { j.avatar.tocar('hit', { umaVez: true, velocidade: 1.4, fade: 0.08 }); j.trava = 0.4; }
}
// polícia NPC: apanha, cai e revida (atira em quem bateu nela)
function acertarPoliciaNPC(n, dano) {
  if (n.caido > 0) return;
  n.vida -= dano; n.hostil = 60;
  // quem atira em um policial vira alvo de todos os policiais por perto e das viaturas
  jogador.atacouPolicia = performance.now();
  for (const m of npcs) if (m.policia && m !== n && m.caido <= 0 && m.av.raiz.position.distanceTo(n.av.raiz.position) < 70) { if (!(m.hostil > 0)) m.av.tocar('run', { velocidade: 1 }); m.hostil = Math.max(m.hostil || 0, 60); }
  rede.crime.agredirNpc().catch(() => {});
  if (n.vida <= 0) { n.caido = 20; n.av.tocar('death', { umaVez: true, velocidade: 1, fade: 0.1 }); aviso('Você derrubou um policial! Está PROCURADO.', 3); }
  else { n.av.tocar('hit', { umaVez: true, velocidade: 1.4, fade: 0.08 }); if (n.vida <= dano) aviso('A polícia está atirando em você!', 2); }
}
function policiaNPCReage(n, dt) {
  const p = n.av.raiz.position;
  if (n.caido > 0) {
    n.caido -= dt;
    if (n.caido <= 0) { n.vida = 100; n.hostil = 0; const a = patrulha(n); p.set(a.x, 0.18, a.z); n.av.tocar('walk', { velocidade: 0.85 }); }
    n.av.mixer.update(dt); return true;
  }
  if (policiaPersegue(n, dt)) { n.av.mixer.update(dt); return true; }
  if (n.hostil <= 0) return false;
  n.hostil -= dt;
  const dx = jogador.pos.x - p.x, dz = jogador.pos.z - p.z, d = Math.hypot(dx, dz);
  if (jogador.morto || d > 90 || n.hostil <= 0) { n.hostil = 0; n.av.tocar('walk', { velocidade: 0.85 }); return false; }
  n.av.raiz.rotation.y = suavizarAngulo(n.av.raiz.rotation.y, Math.atan2(dx, dz), dt * 8);
  // revida: corre atrás atirando (mais rápido e mais certeiro que antes)
  if (d > 9) { p.x += dx / d * 5 * dt; p.z += dz / d * 5 * dt; n.av.tocar('run', { velocidade: 1.1 }); }
  else n.av.tocar('idle');
  n.tiro -= dt;
  if (d < 26 && n.tiro <= 0) {
    n.tiro = 0.75 + Math.random() * 0.25;
    const de = new THREE.Vector3(p.x, p.y + 1.4, p.z), t = Math.max(0.12, d / 30);
    criarBola(de, new THREE.Vector3(dx / t, (jogador.pos.y + 1 - de.y) / t + 4.9 * t, dz / t), n.corTiro || '#ffd23e');
    const acerto = jogador.carro ? 0.55 : d < 12 ? 0.85 : 0.65;
    setTimeout(() => { if (Math.random() < acerto && !jogador.morto) { jogador.ultimoAgressor = null; danoLocal(14); } }, t * 1000);
  }
  n.av.mixer.update(dt); return true;
}

// ---------------------------------------------------------------- chamar e recolher veículos (o robô motorista traz pelas ruas)
function andarChamada(alvo, obj, fim) {
  const ch = alvo.chamada, s = (performance.now() - ch.t0) / 1000 * ch.vel, p = servicos.pontoNaRota(ch.rota, s);
  obj.visible = true;
  obj.position.set(p.x, alturaChao(p.x, p.z), p.z); obj.rotation.y = suavizarAngulo(obj.rotation.y, p.ang, 0.2);
  if (p.fim) fim(p);
}
function pertoDeMim() { return { x: jogador.pos.x + Math.cos(jogador.yaw) * 4, z: jogador.pos.z - Math.sin(jogador.yaw) * 4 }; }
function atualizarChamadas() {
  for (const v of carrosMundo.values()) {
    if (!v.chamada) continue;
    andarChamada(v, v.mesh, (p) => {
      const msg = v.chamada.msg; v.chamada = null;
      v.d = { ...v.d, x: p.x, z: p.z, ang: v.mesh.rotation.y };
      rede.carros.estacionar(v.d.id, p.x, p.z, v.mesh.rotation.y).catch(() => {});
      if (msg) aviso(msg, 3);
    });
  }
}
function chamarCarro(v, recolher) {
  if (jogador.carro?.id === v.d.id) { aviso('Você já está nesse carro.'); return; }
  const destino = recolher ? { x: 120 + (v.d.id % 5) * 7, z: -119 } : pertoDeMim();
  v.chamada = { rota: servicos.rotaRuas({ x: v.mesh.position.x, z: v.mesh.position.z }, destino), t0: performance.now(), vel: 15,
    msg: recolher ? '' : `🚗 Seu ${civico.CARROS[v.d.modelo]?.nome || 'carro'} chegou. Toque em Dirigir.` };
  aviso(recolher ? 'O robô está levando o carro para a Concessionária.' : `🚗 O robô motorista está trazendo o carro (~${Math.ceil(v.chamada.rota.total / 15)} s).`, 3);
}
function portaoDaEmpresa(empresa) {
  for (const [lote, u] of unidades) if (u.empresa === empresa) { const l = LOTES_VENDA.find((x) => x.id === lote); if (l) return l.portao; }
  return null;
}
async function chamarVeiculo(c) {
  try {
    const destino = pertoDeMim();
    await rede.veiculos.chamar(c.d.id, destino.x, destino.z);
    const de = c.obj.visible ? { x: c.obj.position.x, z: c.obj.position.z } : portaoDaEmpresa(c.d.empresa) || destino;
    c.d = { ...c.d, status: 'dirigido', motorista: null, pos_x: destino.x, pos_z: destino.z, ang: 0 };
    c.chamada = { rota: servicos.rotaRuas(de, destino), t0: performance.now(), vel: 14 };
    c.obj.position.set(de.x, alturaChao(de.x, de.z), de.z); c.obj.visible = true;
    aviso(`${NOME_VEICULO[c.d.tipo] || 'Veículo'} a caminho (~${Math.ceil(c.chamada.rota.total / 14)} s). Ele espera 5 min por você.`, 3.5);
  } catch (e) { aviso(e.message); }
}
async function recolherVeiculo(c) {
  try { await rede.veiculos.recolher(c.d.id); c.chamada = null; c.d = { ...c.d, status: 'parado', motorista: null }; aviso('O robô levou o veículo para a garagem.'); }
  catch (e) { aviso(e.message); }
}
async function bloquearVeiculo(c) {
  try { const s = await rede.veiculos.bloquear(c.d.id); aviso(`🔒 Bloqueio acionado: o veículo trava em ${s} s e volta para a garagem.`, 4); }
  catch (e) { aviso(e.message); }
}
// lista para a janela 🚗 Veículos
function meusVeiculos() {
  const eu = jogador.perfil?.id;
  const carros = [...carrosMundo.values()].filter((v) => v.d.dono === eu).map((v) => ({ id: v.d.id, nome: civico.CARROS[v.d.modelo]?.nome || 'Carro',
    info: v.d.ladrao ? `🚨 ROUBADO${v.d.bloqueio_em ? ' · bloqueio acionado' : ''}` : `a ${Math.round(Math.hypot(v.mesh.position.x - jogador.pos.x, v.mesh.position.z - jogador.pos.z))} m${v.chamada ? ' · a caminho' : ''}`,
    acoes: v.d.ladrao ? ['bloquear'] : v.d.modelo === 'presidencial' ? ['chamar'] : ['chamar', 'recolher'] }));
  const frota = [...caminhoes.values()].filter((c) => donoDoVeiculo(c)).map((c) => {
    const d = c.d, heli = d.tipo === 'helicoptero', acoes = [];
    let info = d.status === 'parado' ? 'na garagem' : d.status === 'em_rota' ? 'em entrega' : d.status === 'voltando' ? 'voltando' : 'na rua';
    if (d.sequestrado) { info = d.motorista ? '🚨 ROUBADO (com o ladrão)' : '🚨 ROUBADO (abandonado)'; acoes.push('bloquear'); }
    else {
      if (d.status === 'parado' || (d.status === 'dirigido' && !d.motorista)) acoes.push('taxi');
      if (taxi?.c === c) info = heli ? 'táxi aéreo' : 'dando carona';
      else if (d.status === 'dirigido' && !d.motorista) acoes.push('recolher');
    }
    return { id: d.id, nome: `${NOME_VEICULO[d.tipo] || 'Veículo'} · ${empresas.get(d.empresa)?.nome || ''}`, info, acoes };
  });
  return { carros, frota };
}
function acaoVeiculo(acao, tipo, id) {
  if (tipo === 'carro') { if (acao === 'bloquear') { bloquearCarro(id); return; } const v = carrosMundo.get(id); if (v) chamarCarro(v, acao === 'recolher'); return; }
  const c = caminhoes.get(id); if (!c) return;
  if (acao === 'chamar') chamarVeiculo(c);
  else if (acao === 'recolher') recolherVeiculo(c);
  else if (acao === 'bloquear') bloquearVeiculo(c);
  else if (acao === 'taxi') chamarTaxi(c);
}

// ---------------------------------------------------------------- táxi aéreo: o robô piloto busca o dono e leva aonde ele pedir
let taxi = null;
const ALT_TAXI = 24, VEL_TAXI = 32, VEL_CARONA = 9;
const NOME_MOTORISTA = (c) => (c.d.tipo === 'helicoptero' ? 'piloto' : 'motorista');
// posição do trecho atual: helicóptero voa em linha reta; van e caminhão andam pelas ruas (respeitando o trânsito)
function posTaxi(tx, dt) {
  if (tx.voa) {
    const t = (performance.now() - tx.t0) / 1000, f = Math.min(1, t / tx.dur);
    const sobe = THREE.MathUtils.smoothstep(f, 0, 0.15), desce = 1 - THREE.MathUtils.smoothstep(f, 0.85, 1), k = THREE.MathUtils.smootherstep(f, 0, 1);
    const x = THREE.MathUtils.lerp(tx.de.x, tx.para.x, k), z = THREE.MathUtils.lerp(tx.de.z, tx.para.z, k);
    return { x, z, y: alturaChao(x, z) + ALT_TAXI * Math.min(sobe, desce), ang: tx.ang, fim: f >= 1 };
  }
  const o = tx.c.obj;
  const bloq = obstaculoAFrente(o.position.x, o.position.z, o.rotation.y, o);
  tx.atraso = bloq ? Math.min(30, tx.atraso + dt) : Math.max(0, tx.atraso - dt * 0.4);
  const p = servicos.pontoNaRota(tx.rota, ((performance.now() - tx.t0) / 1000 - tx.atraso) * VEL_CARONA);
  return { ...p, y: alturaChao(p.x, p.z) };
}
function trechoTaxi(fase, de, para) {
  taxi.fase = fase; taxi.de = { ...de }; taxi.para = { ...para }; taxi.t0 = performance.now(); taxi.atraso = 0;
  if (taxi.voa) { taxi.dur = Math.max(6, Math.hypot(para.x - de.x, para.z - de.z) / VEL_TAXI + 5); taxi.ang = Math.atan2(para.x - de.x, para.z - de.z); }
  else { taxi.rota = servicos.rotaRuas(de, para); taxi.dur = taxi.rota.total / VEL_CARONA; }
}
// chamar pela janela 🚗 Veículos: o robô vem buscar o dono
async function chamarTaxi(c) {
  if (taxi) { aviso('Você já tem uma carona chamada.'); return; }
  if (jogador.carro || jogador.trem || jogador.pos.x > 1500) { aviso('Saia do veículo (ou de casa) para chamar a carona.'); return; }
  const base = c.obj.visible ? { x: c.obj.position.x, z: c.obj.position.z } : portaoDaEmpresa(c.d.empresa) || { x: jogador.pos.x, z: jogador.pos.z };
  try {
    await rede.veiculos.entrar(c.d.id, base.x, base.z, c.obj.rotation.y);
    c.d = { ...c.d, status: 'dirigido', motorista: jogador.perfil.id, sequestrado: false };
    taxi = { c, base, ping: 0, espera: 0, voa: c.d.tipo === 'helicoptero', modo: 'carona', atraso: 0 };
    c.obj.visible = true; c.obj.position.set(base.x, alturaChao(base.x, base.z), base.z);
    const longe = taxi.voa ? 9 : 4;
    trechoTaxi('buscando', base, { x: jogador.pos.x + Math.cos(jogador.yaw) * longe, z: jogador.pos.z - Math.sin(jogador.yaw) * longe });
    aviso(`${taxi.voa ? '🚁 O piloto decolou' : '🚐 O motorista saiu'}: chega em ~${Math.ceil(taxi.dur)} s.`, 4);
  } catch (e) { aviso(e.message); }
}
// perto do veículo: o dono embarca na hora; outro ladrão rende o motorista de um veículo roubado abandonado
async function caronaAqui(c, garagem) {
  if (taxi) { aviso('Você já está numa carona.'); return; }
  if (ocupado) return; ocupado = true;
  try {
    const x = garagem ? garagem.x : c.obj.position.x, z = garagem ? garagem.z + 3 : c.obj.position.z;
    const papel = await rede.veiculos.entrar(c.d.id, x, z, c.obj.rotation.y);
    if (papel === 'policia') { aviso('🚓 Veículo devolvido ao dono: +300 moedas', 4); tempoLogistica = 0; return; }
    if (garagem) { c.obj.position.set(x, alturaChao(x, z), z); c.obj.rotation.y = Math.PI; }
    iniciarCaronaParada(c, papel === 'ladrao' ? 'roubo' : 'carona');
    embarcarTaxi();
  } catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}
function iniciarCaronaParada(c, modo) {
  c.d = { ...c.d, status: 'dirigido', motorista: jogador.perfil.id, sequestrado: modo === 'roubo' };
  const base = portaoDaEmpresa(c.d.empresa) || { x: c.obj.position.x, z: c.obj.position.z };
  taxi = { c, base, ping: 0, espera: 0, voa: c.d.tipo === 'helicoptero', modo, atraso: 0, fase: 'esperando' };
  c.obj.visible = true;
}
// destino do roubo: território do clã ou casa mais perto (null = descarrega aqui mesmo)
function destinoRoubo() {
  const p = jogador.pos, op = [];
  if (jogador.cla) for (const v of territorios.values()) if (v.d.dono_cla === jogador.cla) op.push({ nome: v.d.nome, x: v.d.x, z: v.d.z });
  for (const d of casasLista) if (moraEm(d)) op.push({ nome: d.rotulo || 'sua casa', x: d.x + 2, z: d.z });
  op.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  return op[0] || null;
}
async function descarregarAqui() {
  const c = taxi?.c; if (!c) return;
  try {
    const n = await rede.veiculos.descarregar(c.d.id, c.obj.position.x, c.obj.position.z);
    aviso(`📦 ${n} caixas roubadas descarregadas ${jogador.cla ? 'no estoque do clã' : 'na sua mochila'}. O motorista voltou para a garagem.`, 5);
  } catch (e) { aviso(e.message); }
  if (jogador.carro?.taxi) desembarcarTaxi();
  c.d = { ...c.d, status: 'parado', motorista: null, sequestrado: false }; c.posicionado = false;
  taxi = null; tempoLogistica = Math.min(tempoLogistica, 0.5);
}
function atualizarTaxi(dt) {
  if (!taxi) return;
  const c = taxi.c, o = c.obj;
  // mantém o veículo "em uso" no banco e a posição para os outros
  taxi.ping -= dt;
  if (taxi.ping <= 0) {
    taxi.ping = 1.5;
    rede.veiculos.mover(c.d.id, o.position.x, o.position.z, o.rotation.y).then((r) => {
      if (r === 'ok' || taxi?.c !== c) return;
      if (r === 'bloqueado') { if (jogador.carro?.taxi) desembarcarTaxi(); taxi = null; c.d = { ...c.d, status: 'parado', motorista: null }; c.posicionado = false; aviso('🔒 O dono bloqueou o veículo: o motorista te jogou para fora!', 4); return; }
      encerrarTaxi('O veículo voltou para a garagem.');
    }).catch(() => {});
  }
  const ro = o.userData.rotor;
  if (taxi.fase === 'esperando') {
    if (ro) { ro.visible = true; ro.rotation.y += dt * 6; }
    taxi.espera += dt;
    if (taxi.espera > 180 && !jogador.carro?.taxi) {
      if (taxi.modo === 'roubo') { rede.veiculos.sair(c.d.id, o.position.x, o.position.z, o.rotation.y).catch(() => {}); taxi = null; aviso('Você largou o veículo roubado.'); return; }
      aviso(`O ${NOME_MOTORISTA(c)} cansou de esperar e voltou.`); trechoTaxi('voltando', { x: o.position.x, z: o.position.z }, taxi.base);
    }
    return;
  }
  const p = posTaxi(taxi, dt);
  o.visible = true;
  o.position.set(p.x, p.y, p.z); o.rotation.y = suavizarAngulo(o.rotation.y, p.ang, dt * (taxi.voa ? 2 : 6));
  if (ro) { ro.visible = true; ro.rotation.y += dt * 28; }
  if (jogador.carro?.taxi) { jogador.pos.set(p.x, alturaChao(p.x, p.z), p.z); jogador.yaw = o.rotation.y; jogador.avatar.raiz.position.copy(jogador.pos); }
  if (!p.fim) return;
  if (taxi.fase === 'buscando') { taxi.fase = 'esperando'; taxi.espera = 0; aviso(`${taxi.voa ? '🚁 O helicóptero pousou' : '🚐 O motorista chegou'} perto de você. Toque em Embarcar.`, 4); }
  else if (taxi.fase === 'indo' && taxi.modo === 'roubo') descarregarAqui();
  else if (taxi.fase === 'indo') { taxi.fase = 'esperando'; taxi.espera = 0; desembarcarTaxi(); aviso(`Chegamos! O ${NOME_MOTORISTA(c)} volta para a garagem.`, 3); trechoTaxi('voltando', { x: o.position.x, z: o.position.z }, taxi.base); }
  else if (taxi.fase === 'voltando') encerrarTaxi();
}
function encerrarTaxi(msg) {
  if (!taxi) return;
  const c = taxi.c;
  if (jogador.carro?.taxi) desembarcarTaxi();
  rede.veiculos.sair(c.d.id, taxi.base.x, taxi.base.z, 0).catch(() => {}).finally(() => { tempoLogistica = Math.min(tempoLogistica, 0.5); });
  c.d = { ...c.d, status: 'parado', motorista: null }; c.posicionado = false;
  if (c.obj.userData.rotor) c.obj.userData.rotor.visible = false;
  taxi = null;
  if (msg) aviso(msg, 3);
}
function embarcarTaxi() {
  if (jogador.armado) alternarArma();
  if (jogador.carregando) { aviso('Largue a caixa antes de embarcar.'); return; }
  jogador.carro = { caminhao: taxi.c.d.id, tipo: taxi.c.d.tipo || 'caminhao', taxi: true, vel: 0, mesh: taxi.c.obj, salvar: 1e9, voa: taxi.voa };
  jogador.avatar.raiz.visible = false; jogador.alvo = null;
  document.body.classList.add('passageiro');
  if (taxi.modo === 'roubo') {   // o motorista rendido leva a carga para o seu território ou a sua casa
    const d = destinoRoubo();
    if (!d) { aviso('Você não tem território nem casa: a carga vai direto para a mochila.', 3); descarregarAqui(); return; }
    trechoTaxi('indo', { x: taxi.c.obj.position.x, z: taxi.c.obj.position.z }, d);
    aviso(`🔫 Você rendeu o motorista! Ele está levando a carga para ${d.nome} (~${Math.ceil(taxi.dur)} s).`, 5);
    return;
  }
  abrirServico('taxi');
}
function desembarcarTaxi() {
  jogador.carro = null; document.body.classList.remove('passageiro');
  const o = taxi?.c.obj;
  if (o) { jogador.pos.set(o.position.x + Math.cos(o.rotation.y) * 3, 0, o.position.z - Math.sin(o.rotation.y) * 3); jogador.pos.y = alturaChao(jogador.pos.x, jogador.pos.z); resolverColisao(jogador.pos, jogador.raio); }
  jogador.avatar.raiz.visible = true;
}
function acaoTaxi() { if (taxi?.fase === 'esperando' && taxi.modo !== 'roubo') abrirServico('taxi'); else aviso(taxi?.modo === 'roubo' ? 'O motorista rendido está levando a carga…' : 'A caminho…'); }
function textoTaxi() {
  if (taxi?.fase === 'esperando' && taxi.modo !== 'roubo') return ['escolher o destino da carona', 'Destino'];
  const falta = taxi ? Math.max(0, Math.ceil(taxi.dur + taxi.atraso - (performance.now() - taxi.t0) / 1000)) : 0;
  return [`${taxi?.modo === 'roubo' ? 'levando a carga roubada' : 'a caminho'} · chega em ${falta} s`, `${falta} s`];
}
function destinosTaxi() {
  const r = alvosRastreio().filter((a) => !a.icone.includes('🚆'));
  if (taxi?.voa) r.push({ icone: '⛰️', nome: 'Vila Serra', x: -40, z: -950 }, { icone: '⚓', nome: 'Porto Sul', x: -40, z: 950 });
  return r.filter((d) => taxi?.voa || (Math.abs(d.x) < 430 && Math.abs(d.z) < 430));
}
function voarPara(i) {
  if (!taxi || !jogador.carro?.taxi) return;
  if (i < 0) { desembarcarTaxi(); aviso(`Você desceu. O ${NOME_MOTORISTA(taxi.c)} volta para a garagem.`); trechoTaxi('voltando', { x: taxi.c.obj.position.x, z: taxi.c.obj.position.z }, taxi.base); return; }
  const d = destinosTaxi()[i]; if (!d) return;
  trechoTaxi('indo', { x: taxi.c.obj.position.x, z: taxi.c.obj.position.z }, taxi.voa ? { x: d.x + 6, z: d.z + 6 } : { x: d.x, z: d.z });
  aviso(`${taxi.voa ? '🚁' : '🚐'} Destino: ${d.nome} · ~${Math.ceil(taxi.dur)} s.`, 3);
}
// passageiros: membros do clã do dono ou funcionários da empresa embarcam quando ele pousa
function heliParaPassageiro() {
  if (jogador.carro || jogador.passageiro || jogador.trem) return null;
  for (const c of caminhoes.values()) {
    if (c.d.status !== 'dirigido' || !c.d.motorista || c.d.motorista === jogador.perfil?.id || c.d.sequestrado) continue;
    if (Math.hypot(c.obj.position.x - jogador.pos.x, c.obj.position.z - jogador.pos.z) > 8 || c.obj.position.y > alturaChao(c.obj.position.x, c.obj.position.z) + 1) continue;
    const dono = remotos.get(c.d.motorista);
    const doClan = dono?.meta.cla && dono.meta.cla === jogador.claInfo?.nome;
    if (doClan || emprego === c.d.empresa) return c;
  }
  return null;
}
function embarcarPassageiro(c) {
  if (jogador.armado) alternarArma();
  jogador.passageiro = { c, voou: false, ultimo: { x: c.obj.position.x, z: c.obj.position.z }, parado: 0, andou: 0 }; jogador.avatar.raiz.visible = false; jogador.alvo = null;
  document.body.classList.add('passageiro');
  aviso(`Você embarcou como passageiro. Desce sozinho quando ${c.d.tipo === 'helicoptero' ? 'o helicóptero pousar' : 'o veículo chegar'}.`, 3.5);
}
// passageiro no veículo de outro jogador (helicópteros, caminhão e jipe do Exército, carros)
function caronaDeJogador() {
  if (jogador.carro || jogador.passageiro || jogador.trem) return null;
  for (const [id, r] of remotos) {
    const o = r.carro, lug = civico.LUGARES[r.carroModelo]; if (!o || !lug) continue;
    if (civico.DO_EXERCITO.has(r.carroModelo) && !militar()) continue;
    if (Math.hypot(o.position.x - jogador.pos.x, o.position.z - jogador.pos.z) > 6.5 || o.position.y > alturaChao(o.position.x, o.position.z) + 1) continue;
    const ocupados = [...remotos.values()].filter((x) => x.alvo?.pg === id).length;
    if (ocupados >= lug) continue;
    return { id, r };
  }
  return null;
}
function embarcarComJogador({ id, r }) {
  if (jogador.armado) alternarArma();
  const voa = !!civico.CARROS[r.carroModelo]?.voa;
  jogador.passageiro = { piloto: id, c: { obj: r.carro, d: { id: 0, status: 'dirigido', tipo: voa ? 'helicoptero' : 'van' } }, voou: false, ultimo: { x: r.carro.position.x, z: r.carro.position.z }, parado: 0, andou: 0 };
  jogador.avatar.raiz.visible = false; jogador.alvo = null; document.body.classList.add('passageiro');
  aviso(`Você embarcou com ${r.meta?.nome || 'o motorista'}. ${voa ? 'Você desce quando ele pousar.' : 'Toque em Descer quando parar.'}`, 3);
}
function seguirComoPassageiro() {
  const ps = jogador.passageiro, o = ps.c.obj, chao = alturaChao(o.position.x, o.position.z);
  if (ps.piloto) { const r = remotos.get(ps.piloto); ps.c.d.status = r && r.carro === o ? 'dirigido' : 'parado'; }
  jogador.pos.set(o.position.x, chao, o.position.z); jogador.avatar.raiz.position.copy(jogador.pos);
  if (ps.c.d.status !== 'dirigido') { descerPassageiro(); return; }
  if (ps.c.d.tipo === 'helicoptero') {
    if (o.position.y > chao + 3) ps.voou = true;
    if (ps.voou && o.position.y < chao + 0.6) descerPassageiro();
    return;
  }
  // van e caminhão: desce quando o veículo, depois de andar, fica parado uns segundos
  const mov = Math.hypot(o.position.x - ps.ultimo.x, o.position.z - ps.ultimo.z); ps.ultimo = { x: o.position.x, z: o.position.z };
  ps.andou += mov; ps.parado = mov < 0.01 ? ps.parado + 1 / 60 : 0;
  if (ps.andou > 15 && ps.parado > 2.5) descerPassageiro();
}
function passageiroPodeDescer() { const ps = jogador.passageiro, o = ps?.c.obj; return !!o && o.position.y < alturaChao(o.position.x, o.position.z) + 1 && (ps.c.d.tipo === 'helicoptero' || ps.parado > 0.5); }
function descerPassageiro() {
  const o = jogador.passageiro?.c.obj; jogador.passageiro = null; document.body.classList.remove('passageiro');
  if (o) { jogador.pos.set(o.position.x - Math.cos(o.rotation.y) * 3, 0, o.position.z + Math.sin(o.rotation.y) * 3); jogador.pos.y = alturaChao(jogador.pos.x, jogador.pos.z); resolverColisao(jogador.pos, jogador.raio); }
  jogador.avatar.raiz.visible = true;
  aviso(o && jogador.passageiro === null ? 'Você desceu.' : 'Você desceu.', 2);
}

// ---------------------------------------------------------------- sons do mundo (volume pela distância)
let tempoBuzina = 0;
// o objeto andou desde o último quadro? (sirene só com o veículo em movimento)
function andando(o) {
  const u = o.userData, agora = performance.now(), x = o.position.x, z = o.position.z;
  if (u.somT === undefined) { u.somT = agora; u.somX = x; u.somZ = z; u.somV = 0; return false; }
  const dt = (agora - u.somT) / 1000;
  if (dt >= 0.25) { u.somV = Math.hypot(x - u.somX, z - u.somZ) / dt; u.somT = agora; u.somX = x; u.somZ = z; }
  return u.somV > 0.8;
}
function atualizarSons() {
  const p = jogador.pos, dist = (o) => Math.hypot(o.position.x - p.x, o.position.z - p.z), t = performance.now() / 1000;
  // sirenes: ambulâncias e bombeiros (NPC, o meu e o dos outros jogadores) e viaturas em perseguição; parados não tocam
  for (const o of servicos.veiculosNpc()) {
    const nome = o.userData.sireneDe; if (nome && andando(o)) sons.continuo(nome, 0.55 * sons.perto(dist(o), 75));
  }
  if ((jogador.carro?.servico === 'ambulancia' || jogador.carro?.servico === 'bombeiros') && Math.abs(jogador.carro.vel) > 0.8) sons.continuo(jogador.carro.servico === 'ambulancia' ? 'sirene_ambulancia' : 'sirene_bombeiros', 0.45);
  for (const r of remotos.values()) if (r.carro && (r.carroModelo === 'ambulancia' || r.carroModelo === 'bombeiros') && andando(r.carro)) sons.continuo(r.carroModelo === 'ambulancia' ? 'sirene_ambulancia' : 'sirene_bombeiros', 0.5 * sons.perto(dist(r.carro), 75));
  for (const v of viaturas) if ((v.perseguindo || remotoAtivo(v)) && andando(v.obj)) sons.continuo('sirene_policia', 0.6 * sons.perto(dist(v.obj), 85));
  // helicópteros: som de perto do chão e som do alto, conforme a altura
  for (const c of caminhoes.values()) {
    if (c.d.tipo !== 'helicoptero' || !c.obj.visible) continue;
    const alt = c.obj.position.y - alturaChao(c.obj.position.x, c.obj.position.z), ligado = alt > 0.5 || c.obj.userData.rotor?.visible;
    if (!ligado) continue;
    const dentro = jogador.carro?.caminhao === c.d.id || jogador.passageiro?.c === c, vol = dentro ? 0.6 : 0.55 * sons.perto(dist(c.obj), 110);
    const k = THREE.MathUtils.clamp(alt / 12, 0, 1);
    sons.continuo('helicoptero_baixo', vol * (1 - k)); sons.continuo('helicoptero_alto', vol * k);
  }
  // helicópteros dos jogadores (executivo e do Exército): o mesmo som do helicóptero das empresas
  const somHeli = (alt, vol) => { const k = THREE.MathUtils.clamp(alt / 12, 0, 1); sons.continuo('helicoptero_baixo', vol * (1 - k)); sons.continuo('helicoptero_alto', vol * k); };
  if (jogador.carro?.voa && !jogador.carro.caminhao) somHeli(jogador.carro.alt || 0, 0.6);
  if (jogador.passageiro?.piloto) { const o = jogador.passageiro.c.obj; if (civico.CARROS[remotos.get(jogador.passageiro.piloto)?.carroModelo]?.voa) somHeli(o.position.y - alturaChao(o.position.x, o.position.z), 0.6); }
  for (const r of remotos.values()) {
    if (!r.carro || !civico.CARROS[r.carroModelo]?.voa || jogador.passageiro?.piloto && remotos.get(jogador.passageiro.piloto) === r) continue;
    somHeli(r.carro.position.y - alturaChao(r.carro.position.x, r.carro.position.z), 0.55 * sons.perto(dist(r.carro), 110));
  }
  // trem: barulho dentro e perto; buzina quando passa perto
  const trens = ferrovia.andando();
  if (jogador.trem) { if (trens.some((tr) => tr.li === jogador.trem.li && tr.k === jogador.trem.k)) sons.continuo('trem_andando', 0.6); }
  else {
    let dm = Infinity; for (const tr of trens) dm = Math.min(dm, Math.hypot(tr.x - p.x, tr.z - p.z));
    sons.continuo('trem_andando', 0.4 * sons.perto(dm, 55));
    if (dm < 70 && t > tempoBuzina) { tempoBuzina = t + 40; sons.tocar('buzina_trem', { vol: 0.5, dist: dm, raio: 120 }); }
  }
  somMotores(dist);
  somAmbiente();
  sons.atualizar();
}
// motor de cada tipo de veículo: o meu (tom sobe com a velocidade), dos outros jogadores e das empresas por perto
const SOM_MOTOR = { popular: 'carro_geral', suv: 'carro_geral', viatura: 'carro_geral', presidencial: 'carro_geral', ambulancia: 'carro_geral',
  esportivo: 'carro_esportivo', militar: 'motor_jipe', exercito_caminhao: 'caminhao_andando', bombeiros: 'caminhao_andando', tanque: 'caminhao_andando',
  caminhao: 'caminhao_andando', van: 'van' };
function somMotores(dist) {
  const c = jogador.carro;
  if (c && !c.voa) {
    const mod = c.caminhao ? (c.tipo || 'caminhao') : (c.servico || c.modelo), nome = SOM_MOTOR[mod];
    if (nome) {
      const max = c.max || civico.CARROS[c.modelo]?.vel || 11, k = THREE.MathUtils.clamp(Math.abs(c.vel || 0) / max, 0, 1);
      const base = mod === 'tanque' ? 0.65 : nome === 'carro_esportivo' ? 0.8 : 0.85;
      sons.continuo(nome, 0.22 + 0.33 * k, base + (nome === 'carro_esportivo' ? 0.5 : 0.55) * k);
    }
  }
  for (const r of remotos.values()) {
    if (!r.carro || civico.CARROS[r.carroModelo]?.voa || !andando(r.carro)) continue;
    const nome = SOM_MOTOR[r.carroModelo]; if (nome) sons.continuo(nome, 0.4 * sons.perto(dist(r.carro), 45));
  }
  for (const v of caminhoes.values()) {
    if (v.d.tipo === 'helicoptero' || !v.obj?.visible || jogador.carro?.caminhao === v.d.id || !andando(v.obj)) continue;
    sons.continuo(v.d.tipo === 'van' ? 'van' : 'caminhao_andando', 0.35 * sons.perto(dist(v.obj), 45));
  }
}
// cidade grande ao fundo e passarinhos nas cidades menores, nas praças e na mata (somem com chuva)
const PRACAS = [[mundo.quadC(-4), mundo.quadC(-4)], [mundo.quadC(7), mundo.quadC(7)]];
function somAmbiente() {
  const p = jogador.pos, tempo = clima.fatorTempo(), dentro = jogador.dentroCasa ? 0.35 : 1;
  const metro = Math.abs(p.x) < mundo.LIM + 30 && Math.abs(p.z) < mundo.LIM + 30;
  const praca = Math.min(...PRACAS.map(([x, z]) => Math.hypot(p.x - x, p.z - z)), contratante ? Math.hypot(p.x - contratante.x, p.z - contratante.z) : Infinity);
  const noite = horaAtual < 5.5 || horaAtual > 19.5;
  sons.continuo('cidade_ambiente', (metro ? 0.32 * (1 - 0.5 * sons.perto(praca, 40)) : 0) * (1 - 0.6 * tempo) * dentro);
  const passaros = metro ? 0.45 * sons.perto(praca, 45) : Math.abs(p.z) > 860 ? 0.4 : 0;
  sons.continuo('passaros', passaros * (noite ? 0.15 : 1) * (1 - tempo) * dentro);
}

// ---------------------------------------------------------------- NPCs se encontram e conversam
const FALAS_ROBO = ['Bip! Tudo em ordem.', 'Ronda tranquila.', 'Algum procurado por aí?', 'Bateria em 87%.', 'Viu a viatura 3?', 'Bip bop.'];
const FALAS_GENTE = ['Oi! Tudo bem?', 'Que calor hoje!', 'Viu o preço do chocolate?', 'Vou pegar o trem.', 'Ouvi uma sirene…', 'Bom dia!', 'Até mais!'];
function atualizarConversas(dt) {
  const agora = performance.now();
  for (const n of npcs) {
    if (n.conversa) {
      const c = n.conversa;
      if (agora > c.ate) { if (n.balao) { n.av.raiz.remove(n.balao); n.balao = null; } n.conversa = null; n.pausa = agora + 25000; n.fase -= c.dur * n.vel; continue; }
      if (agora > c.proxFala) {
        c.proxFala = agora + 2200; c.vez = !c.vez;
        if (n.balao) { n.av.raiz.remove(n.balao); n.balao = null; }
        if (c.vez) {
          const falas = n.policia ? FALAS_ROBO : FALAS_GENTE;
          n.balao = textoSprite(falas[Math.floor(Math.random() * falas.length)], { escala: 0.5, fundo: 'rgba(255,255,255,.92)', cor: '#1a1a1a' });
          n.balao.position.y = 3.0; n.av.raiz.add(n.balao);
          if (n.policia) sons.tocar('robo_conversando', { vol: 0.35, dist: Math.hypot(n.av.raiz.position.x - jogador.pos.x, n.av.raiz.position.z - jogador.pos.z), raio: 25 });
        }
      }
    }
  }
  // dois NPCs livres que se cruzam param para conversar uns segundos
  for (let i = 0; i < npcs.length; i++) {
    const a = npcs[i]; if (a.conversa || (a.pausa || 0) > agora || a.perseguindo || a.hostil > 0 || a.caido > 0 || a.cerco || (a.policia && remotoAtivo(a))) continue;
    for (let k = i + 1; k < npcs.length; k++) {
      const b = npcs[k]; if (b.conversa || (b.pausa || 0) > agora || b.perseguindo || b.hostil > 0 || b.caido > 0 || b.cerco || (b.policia && remotoAtivo(b))) continue;
      if (a.av.raiz.position.distanceTo(b.av.raiz.position) > 2.4) continue;
      const dur = 6 + Math.random() * 4;
      a.conversa = { ate: agora + dur * 1000, dur, proxFala: agora + 300, vez: false, com: b };
      b.conversa = { ate: agora + dur * 1000, dur, proxFala: agora + 1400, vez: false, com: a };
      break;
    }
  }
}
function conversando(n, dt) {   // parado, de frente para o outro
  const o = n.conversa.com.av.raiz.position, p = n.av.raiz.position;
  n.av.raiz.rotation.y = suavizarAngulo(n.av.raiz.rotation.y, Math.atan2(o.x - p.x, o.z - p.z), dt * 5);
  if (n.animConversa !== true) { n.animConversa = true; n.av.tocar('idle'); }
  n.av.mixer.update(dt);
}

// ---------------------------------------------------------------- chat: ao vivo, não é salvo em lugar nenhum
const amigosIds = new Set();
let chatPrivado = false, ultimoChat = 0, tempoAmigos = 1;
function carregarAmigos() {
  rede.amigos.listar().then((l) => { amigosIds.clear(); for (const a of l || []) if (a.aceita) amigosIds.add(a.id); }).catch(() => {});
}
function iniciarChat() {
  const caixa = $('chatCaixa'), txt = $('chatTexto');
  const abrir = () => { caixa.classList.remove('oculto'); txt.focus(); };
  const fechar = () => { caixa.classList.add('oculto'); txt.blur(); };
  $('btChat').onclick = () => (caixa.classList.contains('oculto') ? abrir() : fechar());
  $('chatFechar').onclick = fechar;
  $('chatModo').onclick = () => { chatPrivado = !chatPrivado; $('chatModo').textContent = chatPrivado ? '🔒 Amigos' : '🌐 Todos'; $('chatModo').classList.toggle('privado', chatPrivado); txt.focus(); };
  const enviar = () => {
    const t = txt.value.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!t) { fechar(); return; }
    if (performance.now() - ultimoChat < 1200) { aviso('Calma: uma mensagem por segundo.'); return; }
    if (chatPrivado && !amigosIds.size) { aviso('Você ainda não tem amigos. Adicione em 👥 Amigos.'); return; }
    ultimoChat = performance.now();
    const m = { de: jogador.perfil.id, nome: jogador.perfil.nome, texto: t, privado: chatPrivado };
    conexao?.enviar('chat', m);
    mostrarChat(m, true); txt.value = '';
  };
  $('chatEnviar').onclick = enviar;
  txt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); enviar(); } if (e.key === 'Escape') fechar(); e.stopPropagation(); });
  window.addEventListener('keydown', (e) => {
    const foco = document.activeElement;
    if (e.key === 'Enter' && jogador.avatar && !(foco && (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA'))) { e.preventDefault(); abrir(); }
  });
}
function receberChat(m) {
  if (!m || typeof m.texto !== 'string' || !m.de) return;
  if (m.privado && !amigosIds.has(m.de)) return;      // modo privado: só os amigos veem
  mostrarChat({ ...m, texto: m.texto.slice(0, 120), nome: String(m.nome || '?').slice(0, 24) }, false);
}
function mostrarChat(m, meu) {
  // linha no canto (some em 20 s)
  const log = $('chatLog'), linha = document.createElement('div');
  if (m.privado) linha.className = 'privado';
  const b = document.createElement('b'); b.textContent = `${m.privado ? '🔒 ' : ''}${m.nome}: `;
  linha.append(b, document.createTextNode(m.texto));
  log.append(linha);
  while (log.children.length > 6) log.firstChild.remove();
  setTimeout(() => { linha.style.opacity = '0'; setTimeout(() => linha.remove(), 1000); }, 20000);
  // balão sobre a cabeça (some em 6 s)
  const raiz = meu ? jogador.avatar?.raiz : remotos.get(m.de)?.av?.raiz;
  if (!raiz) return;
  if (raiz.userData.balaoChat) raiz.remove(raiz.userData.balaoChat);
  const curto = m.texto.length > 46 ? `${m.texto.slice(0, 45)}…` : m.texto;
  const s = textoSprite(curto, { escala: 0.55, fundo: m.privado ? 'rgba(255,214,40,.95)' : 'rgba(255,255,255,.94)', cor: '#151515' });
  s.position.y = 3.15; raiz.add(s); raiz.userData.balaoChat = s;
  setTimeout(() => { if (raiz.userData.balaoChat === s) { raiz.remove(s); raiz.userData.balaoChat = null; } }, 6000);
}
function atualizarChat(dt) {
  tempoAmigos -= dt;
  if (tempoAmigos <= 0) { tempoAmigos = 45; carregarAmigos(); }
}

// ---------------------------------------------------------------- ARMA DOURADA (evento): 2 balas, quem morre por ela acorda no cemitério
let armaPd = null, objArmaPd = null, brilhoPd = null;
function aoArmaPd(a) { armaPd = a; pintarArma(); }
const tenhoArmaPd = () => !!(armaPd?.ativa && armaPd.dono === jogador.perfil?.id && armaPd.balas > 0);
function armaPdPerto() { return !!(armaPd?.ativa && !armaPd.dono && !jogador.carro && Math.hypot(armaPd.x - jogador.pos.x, armaPd.z - jogador.pos.z) < 3.5); }
async function pegarArmaPd() {
  try {
    const b = await rede.pd.pegar(jogador.pos.x, jogador.pos.z);
    armaPd = { ...armaPd, dono: jogador.perfil.id, balas: b }; pintarArma();
    aviso(`✨ Você pegou a ARMA DOURADA: ${b} balas. Use a arma (Q) para atirar. Quem cair por ela vai para o cemitério; a equipe é imune.`, 6);
    if (!jogador.armado) alternarArma();
  } catch (e) { aviso(e.message); }
}
// a arma na mão fica dourada enquanto você tem a PD
function pintarArma() {
  const a = jogador.arma; if (!a) return;
  const dourada = tenhoArmaPd();
  a.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.matOriginal) o.userData.matOriginal = o.material;
    o.material = dourada ? (o.userData.matOuro ||= new THREE.MeshStandardMaterial({ color: '#ffcf3a', metalness: 1, roughness: 0.22, emissive: '#6b4d00', emissiveIntensity: 0.35 })) : o.userData.matOriginal;
  });
}
function acertoDourado(id) {
  rede.pd.acertar(id).then((r) => aviso(r === 'imune' ? '🛡 A equipe é imune à arma dourada.' : '☠️ Atingido pela ARMA DOURADA! Você agora é muito procurado.', 4)).catch((e) => aviso(e.message));
}
function atualizarArmaPd(dt) {
  if (!armaPd && !atualizarArmaPd.pediu) { atualizarArmaPd.pediu = true; rede.pd.estado().then((a) => { if (a) aoArmaPd(a); }).catch(() => {}); }
  const solta = armaPd?.ativa && !armaPd.dono;
  if (!solta) { if (objArmaPd) objArmaPd.visible = false; return; }
  if (!objArmaPd) {
    objArmaPd = new THREE.Group();
    const m = clonar('arma_paintball');
    m.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: '#ffcf3a', metalness: 1, roughness: 0.22, emissive: '#7a5800', emissiveIntensity: 0.5 }); });
    m.scale.setScalar(1.6); objArmaPd.add(m);
    brilhoPd = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.9, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd23e', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    objArmaPd.add(brilhoPd); scene.add(objArmaPd);
  }
  // escondida: só aparece de perto (o administrador vê de longe)
  const d = Math.hypot(armaPd.x - jogador.pos.x, armaPd.z - jogador.pos.z), adm = jogador.perfil?.cargo === 'admin';
  objArmaPd.visible = d < 14 || adm;
  const t = performance.now() / 1000;
  objArmaPd.position.set(armaPd.x, alturaChao(armaPd.x, armaPd.z) + 0.6 + Math.sin(t * 2) * 0.12, armaPd.z);
  objArmaPd.children[0].rotation.y = t * 1.5;
  brilhoPd.position.y = -0.55; brilhoPd.scale.setScalar(1 + Math.sin(t * 4) * 0.15);
}

// ---------------------------------------------------------------- roubo de carros de jogador
function carroAlheioProximo() {
  if (jogador.carro || jogador.trem) return null;
  const eu = jogador.perfil?.id, pol = jogador.perfil?.policial || jogador.perfil?.prf;
  let melhor = null, dm = 3.4;
  for (const v of carrosMundo.values()) {
    if (!v.mesh.visible || v.d.modelo === 'presidencial' || v.d.dono === eu) continue;
    if (pol ? !v.d.ladrao : v.d.ladrao) continue;   // policial só mexe em carro roubado; ladrão só em carro livre
    const d = Math.hypot(v.mesh.position.x - jogador.pos.x, v.mesh.position.z - jogador.pos.z);
    if (d < dm) { dm = d; melhor = v; }
  }
  return melhor;
}
async function arrombarCarro(v) {
  if (ocupado) return; ocupado = true;
  try {
    virarPara(v.mesh.position.x, v.mesh.position.z);
    jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 0.7, fade: 0.1 }); jogador.trava = 2.5;
    aviso('Arrombando o carro…', 2.5);
    await new Promise((r) => setTimeout(r, 2500));
    await rede.carros.roubar(v.d.id);
    v.d = { ...v.d, ladrao: jogador.perfil.id };
    entrarCarro(v);
    aviso('🚗 Carro roubado! O dono pode bloquear: fuja rápido.', 4);
  } catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}
async function recuperarCarro(v) {
  try { const r = await rede.carros.liberar(v.d.id); if (r) { aviso(`🚓 Carro devolvido ao dono: +${r} moedas`, 3); v.d = { ...v.d, ladrao: null }; tempoCarros = 0; } }
  catch (e) { aviso(e.message); }
}
async function bloquearCarro(id) {
  try {
    const s = await rede.carros.bloquear(id);
    aviso(`🔒 Bloqueio acionado: o carro trava em ${s} s e volta para você.`, 4);
    setTimeout(() => { rede.carros.liberar(id).catch(() => {}).finally(() => { tempoCarros = 0; }); }, s * 1000 + 1500);
  } catch (e) { aviso(e.message); }
}

// ---------------------------------------------------------------- carreiras: turno a cada minuto em serviço, patente e salário
let tempoTurno = 20, avisouFora = false;
function atualizarCarreira(dt) {
  const p = jogador.perfil;
  const emServico = p && (p.policial || p.prf || p.profissao);
  const chip = $('patente');
  if (!emServico) {
    jogador.patente = null;
    if (chip) { const e = emprego && empresas.get(emprego); chip.textContent = e && e.dono !== p?.id ? `💼 ${e.nome}` : ''; }
    return;
  }
  tempoTurno -= dt;
  if (tempoTurno > 0) return;
  tempoTurno = 60;
  rede.carreiras.turno(jogador.pos.x, jogador.pos.z).then((r) => {
    if (!r) return;
    const antes = jogador.patente;
    jogador.patente = r.nome; jogador.patenteNivel = Number(r.nivel) || 0;
    if (chip) chip.textContent = `🎖️ ${r.nome} · ${Math.floor(r.minutos / 60)}h${String(r.minutos % 60).padStart(2, '0')}${r.proximo ? ` · ${r.proximo} em ${r.falta} min` : ' · topo da carreira'}`;
    if (r.subiu) aviso(`🎖️ PROMOVIDO a ${r.nome}! O salário subiu.`, 5);
    else if (r.pago > 0 && !antes) aviso(`Turno: +${r.pago} moedas por minuto em serviço (${r.nome}).`, 3);
    if (r.fora && !avisouFora) { avisouFora = true; aviso(`Como ${r.nome}, seu turno só conta dentro do hospital.`, 4); }
    if (antes !== r.nome) conexao?.rastrear(metaPresenca());
  }).catch(() => {});
}

// ---------------------------------------------------------------- jornalista e o Jornal da Cidade
const reportados = new Set();
function reportagemProxima() {
  const p = jogador.pos, perto = (x, z, r) => Math.hypot(x - p.x, z - p.z) < r;
  for (const f of servicos.listaIncendios()) if (!reportados.has('incendio' + f.id) && perto(f.x, f.z, 22)) return { tipo: 'incendio', ref: String(f.id), titulo: `🔥 Incêndio atinge ${f.nome}`, x: f.x, z: f.z };
  for (const o of ocorrencias) if (!reportados.has('ocorrencia' + o.id) && perto(o.x, o.z, 20) && Date.now() - Date.parse(o.criada_em) < 900000)
    return { tipo: 'ocorrencia', ref: String(o.id), titulo: `🚨 ${o.local}: polícia é chamada`, x: o.x, z: o.z };
  for (const [id, r] of remotos) {
    if (!r.meta.ferido || !r.av) continue;
    const ref = `${id}:${Math.floor(agoraServidor() / 120000)}`;
    if (!reportados.has('ferido' + ref) && perto(r.av.raiz.position.x, r.av.raiz.position.z, 12)) return { tipo: 'ferido', ref, titulo: `🚑 ${r.meta.nome} é encontrado ferido na cidade`, x: r.av.raiz.position.x, z: r.av.raiz.position.z };
  }
  return null;
}
async function reportar(rp) {
  if (ocupado) return; ocupado = true;
  reportados.add(rp.tipo + rp.ref);
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:.85;z-index:40;pointer-events:none;transition:opacity .5s';
  document.body.appendChild(flash); setTimeout(() => { flash.style.opacity = 0; }, 60); setTimeout(() => flash.remove(), 600);
  try { const v = await rede.jornal.publicar(rp.tipo, rp.ref, rp.titulo, rp.x, rp.z); aviso(`📰 Reportagem publicada: +${v} moedas`, 3); tempoJornal = 0.5; }
  catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}
// faixa de manchetes no alto da tela: matérias do dia e reportagens da última hora, uma de cada vez.
// Tocar abre o Jornal; o "–" minimiza (fica só um 📰 pequeno). Os telões da cidade mostram as mesmas notícias.
let tempoJornal = 2, manchetes = [], mancheteI = 0, tempoManchete = 0, faixaJornal = null;
let jornalMin = (() => { try { return localStorage.getItem('fator_jornal_min') === '1'; } catch { return false; } })();
function atualizarJornal(dt) {
  if (!faixaJornal) {
    faixaJornal = document.createElement('div');
    faixaJornal.style.cssText = 'position:fixed;top:calc(40px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:12;max-width:72vw;display:none;align-items:center;gap:6px;background:rgba(40,32,16,.9);color:#ffe7a8;padding:4px 6px 4px 10px;border-radius:8px;font:600 12px system-ui;pointer-events:auto;cursor:pointer';
    faixaJornal.innerHTML = '<span class="txt" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span><button style="border:0;background:rgba(255,255,255,.15);color:inherit;border-radius:6px;padding:0 7px;font:700 14px system-ui">–</button>';
    faixaJornal.querySelector('.txt').onclick = () => abrirServico('jornal');
    faixaJornal.querySelector('button').onclick = (e) => { e.stopPropagation(); jornalMin = !jornalMin; try { localStorage.setItem('fator_jornal_min', jornalMin ? '1' : '0'); } catch { /* ok */ } tempoManchete = 0; };
    document.body.appendChild(faixaJornal);
  }
  tempoJornal -= dt; tempoManchete -= dt;
  if (tempoJornal <= 0) {
    tempoJornal = 30;
    Promise.all([rede.jornal.materias().catch(() => []), rede.jornal.ultimas().catch(() => [])]).then(([mt, rp]) => {
      const dia = (mt || []).filter((m) => Date.now() - Date.parse(m.publicar_em) < 86400000).map((m) => ({ ...m, materia: true }));
      manchetes = [...dia.slice(0, 6), ...(rp || []).filter((n) => Date.now() - Date.parse(n.criada_em) < 3600000).slice(0, 4)];
      noticiasTelao = [...(mt || []).slice(0, 8).map((m) => ({ ...m, materia: true })), ...(rp || []).slice(0, 4)];
    });
  }
  atualizarTeloes(dt);
  if (!manchetes.length) { faixaJornal.style.display = 'none'; return; }
  faixaJornal.style.display = 'flex';
  const txt = faixaJornal.querySelector('.txt'), bt = faixaJornal.querySelector('button');
  if (jornalMin) { txt.textContent = '📰'; bt.textContent = '+'; return; }
  bt.textContent = '–';
  if (tempoManchete <= 0) { tempoManchete = 7; mancheteI = (mancheteI + 1) % manchetes.length; const m = manchetes[mancheteI]; txt.textContent = `📰 ${m.titulo} · ${m.autor_nome}`; }
}
// telões de LED (centro, Vila Serra e Porto Sul): mostram as matérias e reportagens, trocando a cada 10 s
let noticiasTelao = [], teloes = [], tempoTelao = 0, telaoI = 0;
const LUGARES_TELAO = [{ x: -151.5, z: -117, ang: 0 }, { x: 30, z: -939.5, ang: 0 }, { x: 30, z: 939.5, ang: Math.PI }];
function criarTeloes() {
  const metal = new THREE.MeshStandardMaterial({ color: '#2b2f36', metalness: 0.6, roughness: 0.4 });
  for (const L of LUGARES_TELAO) {
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group(); g.position.set(L.x, alturaChao(L.x, L.z), L.z); g.rotation.y = L.ang; scene.add(g);
    for (const sx of [-3.4, 3.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.2, 0.35), metal); p.position.set(sx, 3.1, -0.2); p.castShadow = true; g.add(p); }
    const caixa = new THREE.Mesh(new THREE.BoxGeometry(8.4, 4.9, 0.4), metal); caixa.position.set(0, 6.6, -0.25); caixa.castShadow = true; g.add(caixa);
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); tela.position.set(0, 6.6, -0.04); g.add(tela);
    colisores.push({ tipo: 'circ', x: L.x - 3.4 * Math.cos(L.ang), z: L.z, r: 0.3 }, { tipo: 'circ', x: L.x + 3.4 * Math.cos(L.ang), z: L.z, r: 0.3 });
    teloes.push({ cv, tex, img: null, imgUrl: '', tela });
  }
}
function desenharTelao(t, n) {
  const g = t.cv.getContext('2d'), W = t.cv.width, H = t.cv.height;
  g.fillStyle = '#0b1220'; g.fillRect(0, 0, W, H);
  t.noticia = n;
  const cor = n?.cor || '#c0392b';
  g.fillStyle = cor; g.fillRect(0, 0, W, 44); g.fillStyle = '#fff'; g.font = '700 24px system-ui'; g.fillText('📰 JORNAL DA CIDADE', 16, 31);
  const selo = n ? (n.selo || (n.materia ? 'MATÉRIA' : 'AO VIVO')) : '';
  if (selo) { g.font = '800 18px system-ui'; const sw = g.measureText(selo).width + 18; g.fillStyle = '#fff'; g.fillRect(W - sw - 12, 9, sw, 27); g.fillStyle = cor; g.textAlign = 'right'; g.fillText(selo, W - 21, 29); g.textAlign = 'left'; }
  if (!n) { g.fillStyle = '#9fb3c8'; g.font = '600 26px system-ui'; g.fillText('Sem notícias no momento.', 24, 200); t.tex.needsUpdate = true; return; }
  let x0 = 20;
  if (n.materia && !t.buscando && t.imgPara !== n.id) {   // foto do jogo, retrato do personagem ou link
    t.buscando = true;
    jornal.imagemDe(n).then((src) => { t.buscando = false; t.imgPara = n.id; t.imgUrl = src || ''; t.img = null; if (src) { t.img = new window.Image(); if (/^https:/.test(src)) t.img.crossOrigin = 'anonymous'; t.img.onload = () => { if (t.noticia === n) desenharTelao(t, n); }; t.img.src = src; } });
  }
  if (t.imgPara === n.id && t.img?.complete && t.img.naturalWidth) { try { const ar = t.img.naturalWidth / t.img.naturalHeight, h = 280, w = Math.min(300, h * ar); g.drawImage(t.img, 20, 60, w, h); x0 = 36 + w; } catch { /* imagem bloqueada */ } }
  const linhas = (txt, larg, fonte, max) => { g.font = fonte; const out = []; let l = ''; for (const w of String(txt).split(/\s+/)) { const tt = l ? l + ' ' + w : w; if (g.measureText(tt).width > larg && l) { out.push(l); l = w; if (out.length >= max) break; } else l = tt; } if (out.length < max && l) out.push(l); return out; };
  g.fillStyle = '#ffffff'; let y = 92;
  if (n.destaque) g.fillStyle = '#ffe066';
  for (const l of linhas(n.titulo, W - x0 - 20, n.destaque ? '900 34px system-ui' : '800 30px system-ui', 3)) { g.fillText(l, x0, y); y += n.destaque ? 40 : 36; }
  g.fillStyle = '#c9d6e2'; y += 6;
  for (const l of linhas(n.texto || '', W - x0 - 20, '500 20px system-ui', 6)) { g.fillText(l, x0, y); y += 26; }
  g.fillStyle = '#8aa0b6'; g.font = '600 17px system-ui'; g.fillText(`por ${n.autor_nome}`, x0, H - 18);
  t.tex.needsUpdate = true;
}
function atualizarTeloes(dt) {
  if (!teloes.length) return;
  tempoTelao -= dt; if (tempoTelao > 0) return; tempoTelao = 10;
  teloes.forEach((t, k) => desenharTelao(t, noticiasTelao.length ? noticiasTelao[(telaoI + k) % noticiasTelao.length] : null));
  telaoI++;
}

// ---------------------------------------------------------------- muito procurados e perseguição da polícia robô
let tempoProcurados = 3;
function atualizarProcurados(dt) {
  tempoProcurados -= dt;
  if (tempoProcurados > 0) return;
  tempoProcurados = 20;
  rede.recompensas.procurados().then((l) => civico.procuradosNosOutdoors(l)).catch(() => {});
  // cerco salvo no banco (voltou ao jogo dentro de casa ou perto dela): o robô continua na porta
  const p = jogador.perfil;
  const pol = npcs.find((n) => n.policia);
  if (p?.cerco_ate && Date.parse(p.cerco_ate) > agoraServidor() && pol && !npcs.some((n) => n.cerco)) {
    pol.cerco = { x: p.cerco_x, z: p.cerco_z, ate: Date.parse(p.cerco_ate) };
    pol.av.raiz.position.set(p.cerco_x + 1.5, alturaChao(p.cerco_x, p.cerco_z), p.cerco_z + 1.5);
  }
}
function iniciarCerco(x, z) {
  const n = npcs.find((k) => k.policia && k.perseguindo) || npcs.find((k) => k.policia); if (!n) return;
  n.cerco = { x, z, ate: agoraServidor() + 1920000 };
  rede.recompensas.cercar(x, z).then((ate) => { if (ate) n.cerco.ate = Date.parse(ate); }).catch(() => {});
  aviso('🚓 Você se escondeu, mas a polícia robô vai ficar esperando na porta (até 1 ciclo).', 4);
}
function fimCerco(n) { n.cerco = null; n.perseguindo = false; rede.recompensas.fimCerco().catch(() => {}); n.av.tocar('walk', { velocidade: 0.85 }); }
// procurado à vista (25 m) é perseguido; alcançado a pé, é preso. Em casa, o robô espera na porta.
function policiaPersegue(n, dt) {
  if (remotoAtivo(n) && !n.cerco && !n.perseguindo) return false;
  const p = n.av.raiz.position, j = jogador, procurado = (j.perfil?.crimes || 0) > 0 && !j.morto && !(j.pena > 0);
  if (n.cerco) {
    if (!procurado || agoraServidor() > n.cerco.ate) { fimCerco(n); return false; }
    if (j.dentroCasa) {   // espera na porta
      const dx = n.cerco.x + 1.5 - p.x, dz = n.cerco.z + 1.5 - p.z, d = Math.hypot(dx, dz);
      if (d > 0.5) { p.x += dx / d * 4 * dt; p.z += dz / d * 4 * dt; n.av.tocar('run'); n.av.raiz.rotation.y = Math.atan2(dx, dz); }
      else { n.av.tocar('idle'); n.av.raiz.rotation.y = suavizarAngulo(n.av.raiz.rotation.y, Math.atan2(n.cerco.x - p.x, n.cerco.z - p.z), dt * 4); }
      return true;
    }
    n.perseguindo = true; n.cerco = null;     // saiu de casa: a perseguição continua
  }
  if (!procurado || refugiado()) { if (n.perseguindo) { n.perseguindo = false; n.av.tocar('walk', { velocidade: 0.85 }); } n.cerco = null; return false; }
  if (j.dentroCasa) return n.perseguindo;
  const dx = j.pos.x - p.x, dz = j.pos.z - p.z, d = Math.hypot(dx, dz);
  if (!n.perseguindo && d < 25) { n.perseguindo = true; aviso('🚓 A polícia robô viu você! Fuja ou se esconda.', 3); }
  if (!n.perseguindo) return false;
  if (d > 70) { n.perseguindo = false; n.av.tocar('walk', { velocidade: 0.85 }); return false; }
  n.av.raiz.rotation.y = suavizarAngulo(n.av.raiz.rotation.y, Math.atan2(dx, dz), dt * 8);
  if (d > 1.3) { p.x += dx / d * 4.2 * dt; p.z += dz / d * 4.2 * dt; n.av.tocar('run'); }
  else if (!j.carro && !j.passageiro && !ocupado) {
    ocupado = true; n.perseguindo = false;
    rede.recompensas.presoPorRobo().then((min) => { if (min) aviso(`🚓 A polícia robô te prendeu: ${min} min de pena.`, 4); }).catch((e) => aviso(e.message)).finally(() => { ocupado = false; });
  }
  return true;
}

// atropelado por outro jogador: confere se o veículo dele está mesmo perto
function receberAtropelo(d) {
  if (d.alvo !== jogador.perfil?.id || jogador.morto || !jogador.avatar || jogador.dentroCasa) return;
  if (jogador.perfil.imortal || jogador.pena > 0) return;
  const r = remotos.get(d.de), pl = r && (r.carro?.position || r.av?.raiz.position);
  if (!pl || Math.hypot(pl.x - jogador.pos.x, pl.z - jogador.pos.z) > 12) return;
  if (jogador.carro) sairCarro();
  jogador.vida -= Math.max(0, Math.min(100, Number(d.v) || 0)); jogador.ultimoAgressor = d.de;
  desenharFome();
  if (jogador.vida <= 0) { aviso('Você foi atropelado!', 3); morrerLocal(); }
  else { aviso('💥 Você foi atropelado!', 2); jogador.trava = 0.6; jogador.avatar.tocar('hit', { umaVez: true, velocidade: 1.2, fade: 0.08 }); }
}
// trem em movimento mata quem está no trilho (a pé ou de carro)
function checarTrem() {
  const j = jogador;
  if (j.morto || j.trem || j.dentroCasa || j.passageiro || j.carro?.voa || !j.avatar || j.pena > 0 || j.perfil?.imortal) return;
  if (ferrovia.atropela(j.pos, j.carro ? 1.2 : 0.35)) { j.vida = 0; j.ultimoAgressor = null; desenharFome(); aviso('🚆 Você foi atropelado pelo trem!', 4); morrerLocal(); }
}
function receberDano(d) {
  if (d.alvo !== jogador.perfil?.id || jogador.morto || !jogador.avatar) return;
  if (jogador.perfil.imortal || jogador.pena > 0) return;
  const r = remotos.get(d.de);
  if (!r?.av || r.av.raiz.position.distanceTo(jogador.pos) > 30) return;     // golpe de longe demais: ignora
  const v = Math.max(0, Math.min(80, Number(d.v) || 0));
  jogador.vida -= v; jogador.ultimoAgressor = d.de;
  desenharFome();
  if (jogador.vida <= 0) { morrerLocal(); return; }
  if (jogador.trava <= 0) { jogador.avatar.tocar('hit', { umaVez: true, velocidade: 1.4, fade: 0.08 }); jogador.trava = 0.45; }
}

async function morrerLocal(pd = false) {
  const j = jogador;
  if (j.carro) sairCarro();
  if (armaPd?.dono === j.perfil?.id) rede.pd.soltar(j.pos.x, j.pos.z).catch(() => {});
  j.morto = true; j.vida = 0; j.alvo = null;
  if (j.armado) alternarArmaForcado(false);
  if (j.carregando) { scene.remove(j.carregando); j.carregando = null; }
  j.avatar.tocar('death', { umaVez: true, velocidade: 1, fade: 0.1 });
  j.trava = 5;
  const quem = remotos.get(j.ultimoAgressor)?.meta.nome;
  if (pd) {   // arma dourada: ninguém socorre; 7 s depois acorda no cemitério
    rede.combate.morrer(j.ultimoAgressor || null).catch(() => {});
    aviso(`☠️ Você foi atingido pela ARMA DOURADA${quem ? ` de ${quem}` : ''}. Vão te enterrar…`, 6);
    clearTimeout(j.timerHospital); j.timerHospital = setTimeout(acordarNoCemiterio, 7000);
    return;
  }
  try {
    if (j.ultimoAgressor && remotos.get(j.ultimoAgressor)?.meta?.profissao === 'exercito') rede.exercito.morteMilitar(j.ultimoAgressor).catch(() => {});
    const perdeu = await rede.combate.morrer(j.ultimoAgressor || null);
    aviso(`Você está FERIDO${quem ? ' (' + quem + ')' : ''}.${perdeu ? ` Perdeu ${perdeu} moedas.` : ''} A ambulância está a caminho.`, 6);
  } catch { aviso('Você está ferido. A ambulância está a caminho.', 5); }
  j.ferido = true; conexao?.rastrear(metaPresenca());
  clearTimeout(j.timerHospital);
  // ambulância NPC vem até você (fora de casa); um médico jogador pode chegar antes
  const medico = medicoOnline();
  const seg = j.pos.x < 1500 && !j.trem ? servicos.chamarAmbulancia('eu', { x: j.pos.x, z: j.pos.z }, atendidoPeloNpc, medico ? 40 : 1.5) : null;
  j.timerHospital = setTimeout(renascer, ((seg || 20) + 25) * 1000);
  if (seg) aviso(medico ? `🚑 Um socorrista foi chamado. Se ele não chegar, a ambulância da prefeitura vem em ~${Math.ceil(seg)} s.` : `🚑 Ambulância chegando em ~${Math.ceil(seg)} s.`, 5);
}
function acordarNoCemiterio() {
  if (!jogador.morto) return;
  const p = civico.pontoNoCemiterio();
  teleportar(p.x, p.z);
  levantar(100);
  aviso('✝ Você acordou no cemitério…', 4);
}
function medicoOnline() { return [...remotos.values()].some((r) => r.meta?.profissao === 'medico'); }
function atendidoPeloNpc() {
  if (!jogador.morto) return;
  levantar(60);
  rede.saude.alta().then((v) => aviso(`🚑 O paramédico te atendeu. Conta do hospital: ${v} moedas.`, 4)).catch(() => aviso('🚑 O paramédico te atendeu.'));
}
function levantar(vida) {
  const j = jogador;
  clearTimeout(j.timerHospital); j.ferido = false; servicos.cancelarAmbulancia('eu');
  j.vida = vida; j.morto = false; j.trava = 0; j.ultimoAgressor = null;
  j.avatar.tocar('idle', { fade: 0.3 }); desenharFome();
  conexao?.rastrear(metaPresenca());
}
// sem socorro: acorda no hospital e paga a conta (até 100)
function renascer() {
  if (!jogador.morto) return;
  teleportar(civico.HOSPITAL.saida.x, civico.HOSPITAL.saida.z);
  levantar(100);
  rede.saude.alta().then((v) => aviso(v > 0 ? `Você acordou no hospital. Conta: ${v} moedas.` : 'Você acordou no hospital.', 4)).catch(() => aviso('Você acordou no hospital.'));
}
function socorrido(medico) {
  if (!jogador.morto) return;
  levantar(60);
  aviso(`✚ ${medico || 'Um médico'} te socorreu! Você levantou com 60 de vida.`, 4);
}
function feridoProximo(raio) {
  let melhor = null, dm = raio;
  for (const [id, r] of remotos) {
    if (!r.av?.raiz.visible || !r.meta.ferido) continue;
    const d = r.av.raiz.position.distanceTo(jogador.pos);
    if (d < dm) { dm = d; melhor = { id, r }; }
  }
  return melhor;
}
async function socorrerFerido(alvo) {
  if (ocupado) return; ocupado = true;
  try {
    virarPara(alvo.r.av.raiz.position.x, alvo.r.av.raiz.position.z);
    jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 1.5, fade: 0.1 }); jogador.trava = 1.2;
    const v = await rede.saude.socorrer(alvo.id);
    alvo.r.meta.ferido = false; etiquetaStatus(alvo.r);
    aviso(`✚ Você socorreu ${alvo.r.meta.nome}: +${v} moedas`, 4);
  } catch (e) { aviso(e.message); }
  finally { ocupado = false; }
}

async function usarRemedio() {
  if (jogador.vida >= 100) { aviso('Sua vida já está cheia.'); return false; }
  await rede.combate.usarRemedio();
  jogador.vida = Math.min(100, jogador.vida + 50); desenharFome();
  return true;
}

// ================================================================= POLÍCIA (etapa 6)
// 12 policiais robôs a pé, cada um dando a volta numa quadra diferente (centro e bairros)
const QUADRAS_POLICIA = [[1, 1], [2, 2], [0, 0], [3, 3], [0, 3], [3, 0], [-1, 1], [4, 2], [1, -1], [2, 4], [-1, 3], [4, 0]];
// soldados NPC do quartel: pelotão marchando em volta do pátio, sentinelas no portão e uma patrulha na mata
const soldados = [];
async function criarSoldadosNPC() {
  const Q = mundo.QUARTEL, px = Q.patio.x, pz = Q.patio.z;
  const patio = laco([[px - 16, pz - 13], [px + 16, pz - 13], [px + 16, pz + 13], [px - 16, pz + 13]]);
  const mata = laco([[Q.x0 - 14, Q.z0 - 14], [Q.x1 + 14, Q.z0 - 14], [Q.x1 + 14, Math.min(Q.z1 + 4, 1107)], [Q.x0 - 14, Math.min(Q.z1 + 4, 1107)]]);
  const lista = [
    ...[0, 1, 2, 3, 4, 5].map((k) => ({ l: patio, fase: -k * 1.7, vel: 1.3 })),
    { parado: [Q.portao.x - 1, Q.portao.z - 5, -Math.PI / 2] }, { parado: [Q.portao.x - 1, Q.portao.z + 5, -Math.PI / 2] },
    { l: mata, fase: 0, vel: 1.4 }, { l: mata, fase: -2, vel: 1.4 },
    // pelotão correndo em volta do pátio e do heliponto
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ l: laco([[168, 994], [246, 994], [246, 1047], [168, 1047]]), fase: -k * 1.5, vel: 3.4, corre: true })),
    // turma nova chegando: entra pelo portão e vai para o alojamento (some lá dentro e a próxima turma chega)
    ...[0, 1, 2, 3, 4, 5].map((k) => ({ trajeto: trajeto([[96, 1052.5], [150, 1053], [204, 1053], [226, 1061.5]]), fase: -k * 2.2, vel: 1.3, espera: 40, recruta: true })),
  ];
  const civis = PERSONAGENS.map((p) => p.id).sort(() => Math.random() - 0.5);
  for (const d of lista) {
    try {
      const av = d.recruta ? await criarAvatar('personagens', civis[soldados.length % civis.length]) : await criarAvatar('robos', 'Rusty_Scout_Bot');
      const et = textoSprite(d.recruta ? 'Recruta' : 'Exército', { escala: 0.55, fundo: d.recruta ? 'rgba(90,90,90,.9)' : 'rgba(62,78,40,.95)' }); et.position.y = 2.2; av.raiz.add(et);
      av.raiz.visible = false; scene.add(av.raiz);
      if (d.parado) { av.raiz.position.set(d.parado[0], 0.12, d.parado[1]); av.raiz.rotation.y = d.parado[2]; av.tocar('idle'); } else av.tocar(d.corre ? 'run' : 'walk', { velocidade: d.corre ? 1 : 0.8 });
      soldados.push({ av, ...d });
    } catch { /* sem soldados NPC */ }
  }
}
function atualizarSoldados(dt) {
  if (!soldados.length) return;
  const Q = mundo.QUARTEL, perto = Math.hypot(jogador.pos.x - (Q.x0 + Q.x1) / 2, jogador.pos.z - (Q.z0 + Q.z1) / 2) < 220;
  for (const s of soldados) {
    s.av.raiz.visible = perto; if (!perto) continue;
    if (s.trajeto) {   // caminho de ida: depois de chegar, fica escondido um tempo e recomeça
      const T = s.trajeto, ciclo = T.total + s.espera * s.vel, u = ((agoraServidor() / 1000 * s.vel + s.fase) % ciclo + ciclo) % ciclo;
      if (u > T.total) { s.av.raiz.visible = false; continue; }
      const p = pontoNoLaco(T, u);
      s.av.raiz.position.set(p.x, alturaChao(p.x, p.z), p.z); s.av.raiz.rotation.y = suavizarAngulo(s.av.raiz.rotation.y, p.ang, dt * 6);
    } else if (s.l) {
      const p = pontoNoLaco(s.l, agoraServidor() / 1000 * s.vel + s.fase);
      s.av.raiz.position.set(p.x, alturaChao(p.x, p.z), p.z);
      s.av.raiz.rotation.y = suavizarAngulo(s.av.raiz.rotation.y, p.ang, dt * 6);
    }
    s.av.mixer.update(dt);
  }
}
// caçada do Exército (roda no jogo de quem está sendo caçado): 2 jipes e 4 soldados vão atrás dele
let cacada = null, tempoCacada = 5, tempoArma = 1;
// arsenal do quartel: a arma pesada só sai com autorização de um superior e só no expediente
function usarArsenal() {
  const p = jogador.perfil;
  if (jogador.armaPesada) { jogador.armaPesada = false; conferirArma(); aviso('Arma pesada guardada no arsenal.', 2); return; }
  if (p?.cargo === 'admin') { jogador.armaPesada = true; conferirArma(); aviso('💥 General Supremo: arma pesada equipada. Saque com o botão Arma.', 3.5); return; }
  if (p?.profissao !== 'exercito') { aviso('O arsenal é só para militares em serviço.', 2.5); return; }
  if (!p.arma_pesada_ate || Date.parse(p.arma_pesada_ate) < agoraServidor()) { aviso('Você precisa da autorização de um Tenente para cima (ou do General Supremo) para pegar a arma pesada.', 3.5); return; }
  jogador.armaPesada = true; conferirArma();
  aviso('💥 Arma pesada equipada. Use só com ordem: matar sem autorização tira o seu direito de usar.', 4);
}
// contrabandista no Morro da Serra: vende a arma militar para membros de clã (é ilegal: +1 crime)
const CONTRABANDISTA = { x: -150, z: -1236 };
const BANCAS = [{ x: -22, z: -936 }, { x: -22, z: 936 }];
async function falarContrabandista() {
  const opcoes = [{ rotulo: '✂️ Alicate de corte: 2.500 (corta algemas; não é crime)', fn: async () => {
    try { const n = await rede.algemas.comprarAlicate(); temAlicate = true; aviso(`✂️ Alicate comprado (você tem ${n}). Use perto de um algemado: botão 🔗 Cortar.`, 4); recarregarInventario(); } catch (e) { aviso(e.message, 3); }
  } }];
  if (!jogador.perfil?.arma_militar) opcoes.unshift({ rotulo: '🔫 Arma militar: 60.000 (só para clãs; é crime)', fn: async () => {
    if (!jogador.claInfo) { aviso('Contrabandista: "Arma só negocio com gente de clã."', 3); return; }
    try { await rede.exercito.comprarArmaMilitar(); aviso('🔫 Você comprou a ARMA MILITAR. Ela substitui a arma básica (fora do expediente). Você virou procurado.', 4.5); } catch (e) { aviso(e.message, 3); }
  } });
  escolher('Contrabandista', '"Fala baixo. O que vai ser?"', opcoes);
}
const esquadra = { jipes: [], soldados: [], pronto: false, criando: false };
async function montarEsquadra() {
  if (esquadra.pronto || esquadra.criando) return; esquadra.criando = true;
  for (let k = 0; k < 2; k++) { const m = civico.modeloCarro('militar', '#ffffff'); m.visible = false; scene.add(m); esquadra.jipes.push({ obj: m }); }
  for (let k = 0; k < 4; k++) {
    try {
      const av = await criarAvatar('robos', 'Rusty_Scout_Bot');
      const et = textoSprite('Exército', { escala: 0.55, fundo: 'rgba(62,78,40,.95)' }); et.position.y = 2.2; av.raiz.add(et);
      av.raiz.visible = false; scene.add(av.raiz); esquadra.soldados.push({ av });
    } catch { /* sem soldado */ }
  }
  esquadra.pronto = true;
}
function soltarEsquadra() {
  const j = jogador;
  [...esquadra.jipes, ...esquadra.soldados].forEach((u, k) => {
    const o = u.obj || u.av.raiz, a = k * 1.7 + Math.random(), d = u.obj ? 75 : 45;
    o.position.set(j.pos.x + Math.cos(a) * d, 0, j.pos.z + Math.sin(a) * d); o.position.y = alturaChao(o.position.x, o.position.z); o.visible = true;
    if (u.av) u.av.tocar('run', { velocidade: 1.1 });
  });
}
function recolherEsquadra() { for (const u of [...esquadra.jipes, ...esquadra.soldados]) (u.obj || u.av.raiz).visible = false; }
function atualizarCacada(dt) {
  const j = jogador;
  tempoCacada -= dt;
  if (tempoCacada <= 0) {
    tempoCacada = 15;
    if (j.perfil && j.perfil.crimes > 0) rede.exercito.minha(j.perfil.id).then((c) => {
      const ativa = c && Date.parse(c.ate) > agoraServidor() ? c : null;
      if (ativa && !cacada) { montarEsquadra().then(soltarEsquadra); aviso('🎖️ O Exército está te caçando! Jipes e soldados vêm aí.', 4); }
      if (!ativa && cacada) recolherEsquadra();
      cacada = ativa;
    }).catch(() => {});
    else if (cacada) { cacada = null; recolherEsquadra(); }
  }
  if (!cacada || !esquadra.pronto) { esquadra.hostil = 0; return; }
  esquadra.hostil = Math.max(0, (esquadra.hostil || 0) - dt);
  if (Date.parse(cacada.ate) < agoraServidor() || j.pena > 0 || j.morto) { cacada = null; recolherEsquadra(); return; }
  const alvo = j.pos, rapido = j.carro && Math.abs(j.carro.vel) > 3, voando = j.carro?.voa && j.carro.alt > 3;
  let pegou = false;
  for (const u of esquadra.jipes) {
    const o = u.obj, dx = alvo.x - o.position.x, dz = alvo.z - o.position.z, d = Math.hypot(dx, dz);
    if (d > 260) { o.position.set(alvo.x - dx / d * 70, 0, alvo.z - dz / d * 70); continue; }   // não deixa o jipe se perder
    const vel = j.carro ? 15 : 10;
    if (d > 4.5) { o.position.x += dx / d * vel * dt; o.position.z += dz / d * vel * dt; o.rotation.y = suavizarAngulo(o.rotation.y, Math.atan2(dx, dz), dt * 5); }
    o.position.y = alturaChao(o.position.x, o.position.z);
    if (d < 5.5 && !rapido && !voando) pegou = true;
  }
  for (const u of esquadra.soldados) {
    const o = u.av.raiz, dx = alvo.x - o.position.x, dz = alvo.z - o.position.z, d = Math.hypot(dx, dz);
    if (d > 160) { o.position.set(alvo.x - dx / d * 40, 0, alvo.z - dz / d * 40); }
    else if (d > 1.6) { o.position.x += dx / d * 6.8 * dt; o.position.z += dz / d * 6.8 * dt; }
    resolverColisaoNPC(o.position);
    o.position.y = alturaChao(o.position.x, o.position.z);
    o.rotation.y = suavizarAngulo(o.rotation.y, Math.atan2(dx, dz), dt * 8);
    u.av.mixer.update(dt);
    if (esquadra.hostil > 0 && d < 28) {   // revide: tinta verde, forte
      u.tiro = (u.tiro || Math.random()) - dt;
      if (u.tiro <= 0) {
        u.tiro = 0.7 + Math.random() * 0.3;
        const de = new THREE.Vector3(o.position.x, o.position.y + 1.4, o.position.z), t = Math.max(0.12, d / 30);
        criarBola(de, new THREE.Vector3(dx / t, (j.pos.y + 1 - de.y) / t + 4.9 * t, dz / t), '#2fbf5a');
        const acerto = j.carro ? 0.6 : d < 12 ? 0.9 : 0.7;
        setTimeout(() => { if (Math.random() < acerto && !j.morto) { j.ultimoAgressor = null; danoLocal(16); } }, t * 1000);
      }
    }
    if (d < 2.2 && !j.carro && !j.passageiro) pegou = true;
  }
  if (pegou && !ocupado && !j.trem) {
    if (j.carro) sairCarro();
    ocupado = true; const c = cacada; cacada = null;
    rede.exercito.preso().then((min) => { if (min) aviso(`🎖️ O Exército te pegou: ${min} min de pena.`, 4); }).catch((e) => { aviso(e.message); cacada = c; })
      .finally(() => { ocupado = false; if (!cacada) recolherEsquadra(); });
  }
}
// a esquadra que me caça vai junto no meu estado, para todo mundo ver a perseguição
function codigoEsquadra() {
  if (!cacada || !esquadra.pronto) return 0;
  return [...esquadra.jipes.map((u) => u.obj), ...esquadra.soldados.map((u) => u.av.raiz)].map((o) => `${Math.round(o.position.x * 10) / 10},${Math.round(o.position.z * 10) / 10},${Math.round(o.rotation.y * 10) / 10}`).join(';');
}
// esquadras que caçam outros jogadores (vistas por todos)
async function esquadraRemota(r) {
  if (r.esq || r.criandoEsq) return; r.criandoEsq = true;
  const e = { jipes: [], soldados: [] };
  for (let k = 0; k < 2; k++) { const m = civico.modeloCarro('militar', '#ffffff'); m.visible = false; scene.add(m); e.jipes.push(m); }
  for (let k = 0; k < 4; k++) {
    try { const av = await criarAvatar('robos', 'Rusty_Scout_Bot'); const et = textoSprite('Exército', { escala: 0.55, fundo: 'rgba(62,78,40,.95)' }); et.position.y = 2.2; av.raiz.add(et); av.raiz.visible = false; scene.add(av.raiz); av.tocar('run', { velocidade: 1.1 }); e.soldados.push(av); } catch { /* sem soldado */ }
  }
  r.esq = e;
}
function atualizarEsquadraRemota(r, a, dt) {
  if (!a.cs) { if (r.esq) { for (const o of r.esq.jipes) o.visible = false; for (const av of r.esq.soldados) av.raiz.visible = false; } return; }
  if (!r.esq) { esquadraRemota(r); return; }
  const pts = String(a.cs).split(';').map((t) => t.split(',').map(Number));
  const objs = [...r.esq.jipes, ...r.esq.soldados.map((av) => av.raiz)];
  objs.forEach((o, k) => {
    const p = pts[k]; if (!p) { o.visible = false; return; }
    if (!o.visible || Math.hypot(p[0] - o.position.x, p[1] - o.position.z) > 25) o.position.set(p[0], 0, p[1]);
    const kk = Math.min(1, dt * 8); o.position.x += (p[0] - o.position.x) * kk; o.position.z += (p[1] - o.position.z) * kk;
    o.position.y = alturaChao(o.position.x, o.position.z); o.rotation.y = suavizarAngulo(o.rotation.y, p[2], dt * 8); o.visible = true;
  });
  for (const av of r.esq.soldados) av.mixer.update(dt);
}
function resolverColisaoNPC(p) { colidirLista(colisores, p, 0.4); mundo.colidir(p, 0.4, colidirLista); }
async function criarPoliciaNPC() {
  if (!cadeia) return;
  const d = QB / 2 - 1.1;
  for (let k = 0; k < QUADRAS_POLICIA.length; k++) {
    const cx = quadC(QUADRAS_POLICIA[k][0]), cz = quadC(QUADRAS_POLICIA[k][1]);
    let rota = [[cx - d, cz + d], [cx + d, cz + d], [cx + d, cz - d], [cx - d, cz - d]];
    if (k % 2) rota = rota.reverse();
    try {
      const av = await criarAvatar('robos', SKIN_POLICIA);
      scene.add(av.raiz); av.tocar('walk', { velocidade: 0.85 });
      const et = textoSprite('Polícia', { escala: 0.6, fundo: 'rgba(30,70,160,.92)' }); et.position.y = 2.2; av.raiz.add(et);
      const n = { id: k + 1, policia: true, av, rota, laco: laco(rota), vel: 1.5, fase: k * 41, vida: 100, caido: 0, hostil: 0, tiro: 0 };
      npcs.push(n); const p = patrulha(n); av.raiz.position.set(p.x, 0.18, p.z);
    } catch { /* sem policiais NPC */ }
  }
  // agentes da PRF (robôs): mesma regra da polícia, tinta azul
  const QUADRAS_PRF = [[-1, 0], [0, -1], [4, 0], [0, 4]];
  for (let k = 0; k < QUADRAS_PRF.length; k++) {
    const cx = quadC(QUADRAS_PRF[k][0]), cz = quadC(QUADRAS_PRF[k][1]);
    let rota = [[cx - d, cz - d], [cx + d, cz - d], [cx + d, cz + d], [cx - d, cz + d]];
    if (k % 2) rota = rota.reverse();
    try {
      const av = await criarAvatar('robos', SKIN_POLICIA);
      scene.add(av.raiz); av.tocar('walk', { velocidade: 0.85 });
      const et = textoSprite('PRF', { escala: 0.6, fundo: 'rgba(20,40,90,.95)' }); et.position.y = 2.2; av.raiz.add(et);
      const n = { id: 101 + k, policia: true, prf: true, corTiro: '#3e8cff', av, rota, laco: laco(rota), vel: 1.5, fase: k * 37 + 11, vida: 100, caido: 0, hostil: 0, tiro: 0 };
      npcs.push(n); const pp = patrulha(n); av.raiz.position.set(pp.x, 0.18, pp.z);
    } catch { /* sem PRF NPC */ }
  }
  criarViaturas();
  rede.robos.listar().then((l) => { for (const r of l) aoRobo(r); }).catch(() => {});
}
// percurso fechado (volta da quadra) e ponto nele pelo relógio do servidor: todos veem o robô no mesmo lugar
function laco(pts) {
  let total = 0; const seg = [];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push([a, b, d]); total += d; }
  return { seg, total };
}
// caminho aberto (não volta ao começo)
function trajeto(pts) {
  let total = 0; const seg = [];
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push([a, b, d]); total += d; }
  return { seg, total };
}
function pontoNoLaco(l, s) {
  s = ((s % l.total) + l.total) % l.total;
  for (const [a, b, d] of l.seg) { if (s <= d) { const f = s / d; return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, ang: Math.atan2(b[0] - a[0], b[1] - a[1]) }; } s -= d; }
  const [a] = l.seg[0]; return { x: a[0], z: a[1], ang: 0 };
}
function patrulha(n) { return pontoNoLaco(n.laco, agoraServidor() / 1000 * n.vel + n.fase); }
// estado compartilhado (perseguição, cerco, caído) que veio do banco
function aoRobo(r) {
  const n = npcs.find((k) => k.id === r.id) || viaturas.find((k) => k.id === r.id);
  if (n) n.remoto = r;
}
function remotoAtivo(n) {
  const r = n.remoto;
  if (!r || r.estado === 'patrulha' || r.alvo === jogador.perfil?.id) return false;
  if (r.estado === 'cerco' || r.estado === 'caido') return r.ate && Date.parse(r.ate) > agoraServidor();
  return agoraServidor() - Date.parse(r.atualizado) < 12000;
}
// quem controla a cena (o perseguido ou quem derrubou) grava o estado para os outros verem
function publicarRobo(n, dt, obj) {
  const estado = n.caido > 0 ? 'caido' : n.cerco ? 'cerco' : n.perseguindo || n.hostil > 0 ? 'perseguindo' : 'patrulha';
  n.pub = (n.pub || 0) - dt;
  if (estado === n.estadoPub && (estado !== 'perseguindo' || n.pub > 0)) return;
  if (estado === 'patrulha' && !n.estadoPub) return;
  n.estadoPub = estado === 'patrulha' ? null : estado; n.pub = 1;
  const p = obj.position, seg = estado === 'caido' ? n.caido : estado === 'cerco' ? (n.cerco.ate - agoraServidor()) / 1000 : 0;
  rede.robos.atualizar(n.id, estado, jogador.perfil.id, p.x, p.z, obj.rotation.y, seg).catch(() => {});
}
function mostrarRoboRemoto(n, dt) {
  const r = n.remoto, p = n.av.raiz.position;
  const dx = r.x - p.x, dz = r.z - p.z, d = Math.hypot(dx, dz);
  if (d > 30) p.set(r.x, alturaChao(r.x, r.z), r.z);
  else { p.x += dx * Math.min(1, dt * 4); p.z += dz * Math.min(1, dt * 4); }
  n.av.raiz.rotation.y = suavizarAngulo(n.av.raiz.rotation.y, d > 0.3 ? Math.atan2(dx, dz) : r.ang || 0, dt * 6);
  const anim = r.estado === 'caido' ? 'death' : d > 0.3 ? 'run' : 'idle';
  if (n.animRemota !== anim) { n.animRemota = anim; n.av.tocar(anim, anim === 'death' ? { umaVez: true, fade: 0.1 } : {}); }
  n.av.mixer.update(dt);
}

// ---------------------------------------------------------------- viaturas robôs: rodam a cidade e caçam os muito procurados
const viaturas = [];
function criarViaturas() {
  const faixa = 2.5;
  const lacos = [[-1, -1, 5, 5], [0, 0, 4, 4], [1, -1, 3, 5], [-1, 1, 5, 3]];
  lacos.forEach(([a, b, c, d], k) => {
    const cantos = [[ruaC(a), ruaC(b)], [ruaC(c), ruaC(b)], [ruaC(c), ruaC(d)], [ruaC(a), ruaC(d)]];
    const pts = cantos.map(([x, z], i) => { const nx = cantos[(i + 1) % 4][0] - x, nz = cantos[(i + 1) % 4][1] - z, l = Math.hypot(nx, nz); return [x - nz / l * faixa, z + nx / l * faixa]; });
    const obj = civico.modeloCarro('viatura', '#ffffff'); scene.add(obj);
    viaturas.push({ id: 13 + k, obj, laco: laco(pts), vel: 7, fase: k * 120, perseguindo: false });
  });
}
function atualizarViaturas(dt) {
  const t = performance.now() / 1000, j = jogador;
  const atacou = performance.now() - (j.atacouPolicia || -1e9) < 120000 && (j.perfil?.crimes || 0) > 0;
  const cacado = ((j.perfil?.recompensa || 0) > 0 || atacou) && !j.morto && !(j.pena > 0) && !j.dentroCasa && !j.trem;
  for (const v of viaturas) {
    const o = v.obj;
    civico.atualizarSirenes(v.perseguindo || remotoAtivo(v) ? t : 0, o);
    if (remotoAtivo(v)) {   // perseguição de outro jogador: segue o que ele gravou
      const r = v.remoto, dx = r.x - o.position.x, dz = r.z - o.position.z, d = Math.hypot(dx, dz);
      if (d > 40) o.position.set(r.x, alturaChao(r.x, r.z), r.z); else { o.position.x += dx * Math.min(1, dt * 3); o.position.z += dz * Math.min(1, dt * 3); }
      if (d > 0.3) o.rotation.y = suavizarAngulo(o.rotation.y, Math.atan2(dx, dz), dt * 5);
      continue;
    }
    if (cacado) {
      const dx = j.pos.x - o.position.x, dz = j.pos.z - o.position.z, d = Math.hypot(dx, dz);
      if (!v.perseguindo && d < (atacou ? 160 : 90)) { v.perseguindo = true; aviso(atacou ? '🚓 Você atirou na polícia: as viaturas estão vindo!' : '🚓 Uma viatura da polícia está atrás de você!', 3); }
      if (v.perseguindo && d > 220) v.perseguindo = false;
      if (v.perseguindo) {
        const vel = j.carro ? 12 : 8.5;
        // segue pelas ruas (refaz o caminho a cada 2 s); no fim do caminho vai direto até você
        v.recalc = (v.recalc || 0) - dt;
        if (v.recalc <= 0 || !v.rota) { v.recalc = 2; v.rota = servicos.rotaRuas({ x: o.position.x, z: o.position.z }, { x: j.pos.x, z: j.pos.z }, 4); v.s = 0; }
        if (d > 5) {
          v.s += vel * dt;
          const p = servicos.pontoNaRota(v.rota, v.s);
          if (!p.fim) { o.rotation.y = suavizarAngulo(o.rotation.y, p.ang, dt * 6); o.position.x = p.x; o.position.z = p.z; }
          else { o.position.x += dx / d * vel * dt; o.position.z += dz / d * vel * dt; o.rotation.y = suavizarAngulo(o.rotation.y, Math.atan2(dx, dz), dt * 4); }
        }
        o.position.y = alturaChao(o.position.x, o.position.z);
        if (d < 6 && !j.passageiro && (!j.carro || Math.abs(j.carro.vel) < 1.5) && !ocupado) {
          if (j.carro) sairCarro();
          ocupado = true; v.perseguindo = false;
          rede.recompensas.presoPorRobo().then((min) => { if (min) aviso(`🚓 A viatura te alcançou: ${min} min de pena.`, 4); }).catch((e) => aviso(e.message)).finally(() => { ocupado = false; });
        }
        publicarRobo(v, dt, o);
        continue;
      }
    } else if (v.perseguindo) v.perseguindo = false;
    if (v.estadoPub) publicarRobo(v, dt, o);
    const p = pontoNoLaco(v.laco, agoraServidor() / 1000 * v.vel + v.fase);
    if (Math.hypot(p.x - o.position.x, p.z - o.position.z) > 25) o.position.set(p.x, alturaChao(p.x, p.z), p.z);
    else { o.position.x += (p.x - o.position.x) * Math.min(1, dt * 4); o.position.z += (p.z - o.position.z) * Math.min(1, dt * 4); o.position.y = alturaChao(o.position.x, o.position.z); }
    o.rotation.y = suavizarAngulo(o.rotation.y, p.ang, dt * 5);
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
let tempoSalarioPolicia = 180, tempoSalarioPrf = 180;
function atualizarPolicia(dt) {
  if (jogador.perfil?.policial) {
    tempoSalarioPolicia -= dt;
    if (tempoSalarioPolicia <= 0) { tempoSalarioPolicia = 180; rede.policia.salario().then((v) => { if (v > 0) aviso(`Salário da polícia: +${v} moedas`); }).catch(() => {}); }
  }
  if (jogador.perfil?.prf) {
    tempoSalarioPrf -= dt;
    if (tempoSalarioPrf <= 0) { tempoSalarioPrf = 180; rede.prf.salario().then((v) => { if (v > 0) aviso(`Salário da PRF: +${v} moedas`); }).catch(() => {}); }
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
let inimigos = new Set();     // clãs em guerra com o meu agora
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
    else if (tipo === 'oficial') { texto = 'Residência Oficial'; fundo = 'rgba(30,50,80,.92)'; }
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
let _fachadaCasa = null;
function texturasFachadaCasa() {
  // uma "célula" de 3 m x 3,2 m: parede branca (a cor vem do material), janela com caixilho e reflexo
  if (_fachadaCasa) return _fachadaCasa;
  const cor = texturaCanvas(128, (g, t) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, t, t); ruido(g, t, 700, 0.05, 1.2);
    g.fillStyle = '#d9d4cc'; g.fillRect(t * 0.16, t * 0.2, t * 0.68, t * 0.62);           // moldura
    const gr = g.createLinearGradient(0, t * 0.24, 0, t * 0.78); gr.addColorStop(0, '#5f88a8'); gr.addColorStop(1, '#22343f');
    g.fillStyle = gr; g.fillRect(t * 0.2, t * 0.24, t * 0.6, t * 0.54);
    g.fillStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(t * 0.2, t * 0.6); g.lineTo(t * 0.45, t * 0.24); g.lineTo(t * 0.56, t * 0.24); g.lineTo(t * 0.2, t * 0.74); g.fill();
    g.fillStyle = '#cfc9bd'; g.fillRect(t * 0.49, t * 0.24, 3, t * 0.54);                // montante
    g.fillStyle = '#bdb6a8'; g.fillRect(t * 0.12, t * 0.82, t * 0.76, 5);                 // peitoril
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, t - 4, t, 4);
  });
  const luz = texturaCanvas(128, (g, t) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, t, t);
    g.fillStyle = '#fff'; g.fillRect(t * 0.2, t * 0.24, t * 0.6, t * 0.54);
  });
  _fachadaCasa = { cor, luz };
  return _fachadaCasa;
}
function removerCasaTerreno(v) {
  if (!v.casa) return;
  for (const m of v.casa.luzes || []) { const k = luzesCasas.indexOf(m); if (k >= 0) luzesCasas.splice(k, 1); }
  scene.remove(v.casa.g);
  const i = predios.indexOf(v.casa.pr); if (i >= 0) predios.splice(i, 1);
  for (const c of v.casa.cols) { const k = colisores.indexOf(c); if (k >= 0) colisores.splice(k, 1); }
  v.casa = null;
}
function desenharCasaTerreno(v) {
  const c = v.d;
  // centro do quarteirão do lote: grade do centro (27 + 54k) ou das cidades vizinhas (972, 1026, 1080)
  const az = Math.abs(c.z), zq = az > 900 ? Math.sign(c.z) * (972 + 54 * Math.round((az - 972) / 54)) : 27 + 54 * Math.round((c.z - 27) / 54);
  const sz = Math.sign(c.z - zq) || 1;                                  // lado da rua
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
    // um bloco só com a fachada pintada (janelas na textura, acendem à noite): leve e sem piscar
    const { cor, luz } = texturasFachadaCasa();
    const face = (rx) => {
      const t = cor.clone(), e = luz.clone(); t.needsUpdate = e.needsUpdate = true;
      t.repeat.set(Math.max(1, Math.round(rx / 3)), andares); e.repeat.copy(t.repeat);
      return new THREE.MeshStandardMaterial({ color: cores[0], map: t, emissive: '#ffcf7a', emissiveMap: e, emissiveIntensity: 0, roughness: 0.75 });
    };
    const frente = face(w), lado = face(d);
    luzesCasas.push(frente, lado);
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [lado, lado, concreto, concreto, frente, frente]);
    corpo.position.set(x, h / 2, z); corpo.castShadow = corpo.receiveShadow = true; g.add(corpo);
    bloco(concreto, w + 0.3, 0.35, d + 0.3, x, 3.2, z);                                     // marca do térreo
    if (comVaranda) for (let a = 1; a < andares; a++) { bloco(concreto, w * 0.8, 0.18, 1.3, x, a * 3.2 + 0.1, z + d / 2 + 0.65); bloco(guarda, w * 0.8, 1.0, 0.06, x, a * 3.2 + 0.7, z + d / 2 + 1.28); }
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
  const mats = []; g.traverse((o) => { if (o.isMesh) mats.push(...[].concat(o.material)); });
  const pr = { obj: g, caixa, mats, opac: 1 }; predios.push(pr);
  luzesCasas.push(vidro);
  const luzes = []; g.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (luzesCasas.includes(m)) luzes.push(m); });
  if (!luzes.includes(vidro)) luzes.push(vidro);
  v.casa = { g, pr, cols, luzes };
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
function nomeMoradia(c) { return c.tipo === 'oficial' ? 'residência oficial' : c.tipo === 'apto' || c.tipo === 'unidade' ? 'apartamento' : c.tipo === 'terreno' ? (c.modelo ? 'imóvel' : 'terreno') : 'casa'; }
async function acaoCasa(c0) {
  const c = unidadeNaPorta(c0);
  if (c.tipo === 'oficial') { if (moraEm(c)) entrarEmCasa(c); else aviso('Residência oficial: só o prefeito entra.'); return; }
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
  LOCAIS.push({ nome: 'Quartel do Exército', x: mundo.QUARTEL.portao.x - 4, z: mundo.QUARTEL.portao.z });
  LOCAIS.push({ nome: 'Estande de tiro', x: 153, z: 1096 });
  for (const l of ferrovia.linhas) for (const lado of ['centro', 'destino']) { const p = l.plataformas[lado]; LOCAIS.push({ nome: p.nome, x: 0, z: p.zSaida }); }
}

function teleportar(x, z) {
  if (jogador.carro) sairCarro();
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
  if (c.tipo === 'socorro') socorrido(c.dados?.medico);
  if (c.tipo === 'bloqueio_carro') {   // o dono bloqueou o carro que eu roubei
    const id = c.dados?.carro, seg = c.dados?.segundos || 20;
    aviso(`🔒 O dono acionou o BLOQUEIO: o carro trava em ${seg} s!`, 4);
    setTimeout(() => {
      if (jogador.carro?.id === id) { sairCarro(); aviso('🔒 O carro travou e você foi jogado para fora!', 4); }
      rede.carros.liberar(id).catch(() => {}).finally(() => { tempoCarros = 0; });
    }, seg * 1000 + 500);
  }
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
    novo.raiz.add(jogador.etiqueta); jogador.etiqueta.position.y = alturaNome(novo);
    novo.raiz.position.copy(jogador.pos); novo.raiz.rotation.y = jogador.yaw;
    scene.add(novo.raiz); novo.tocar('idle');
    jogador.avatar = novo; jogador.arma = arma; jogador.armaTipo = 'basica';
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
  if (novo.prf !== antigo.prf) aviso(novo.prf ? 'Você está em serviço na PRF. Investigue a prefeitura!' : 'Você saiu do serviço da PRF.', 4);
  if (novo.eleitoral && !antigo.eleitoral) aviso('CRIME ELEITORAL comprovado: você perdeu o mandato e está procurado!', 5);
  if (novo.pd_morte && novo.pd_morte !== antigo.pd_morte && Date.now() - Date.parse(novo.pd_morte) < 20000 && !jogador.morto && jogador.avatar) {
    jogador.vida = 0; jogador.ultimoAgressor = novo.pd_por; desenharFome(); morrerLocal(true);
  }
  if (novo.profissao !== antigo.profissao) {
    for (const base of [civico.HOSPITAL, civico.BOMBEIROS]) {
      if (!base.veiculo) continue;
      if (jogador.carro?.mesh === base.veiculo) sairCarro();
      base.veiculo.position.set(base.vaga.x, 0.18, base.vaga.z); base.veiculo.rotation.y = base.vaga.ang;
    }
  }
  if (novo.profissao !== antigo.profissao) aviso(novo.profissao === 'medico' ? 'Plantão médico: socorra os feridos (✚) pela cidade. +250 por socorro.' : novo.profissao === 'bombeiro' ? 'Você está em serviço nos bombeiros. Apague os incêndios (🔥). +400 por fogo.' : novo.profissao === 'jornalista' ? 'Você é jornalista: vá até incêndios, ocorrências e feridos e toque em Reportar (+200).' : novo.profissao === 'exercito' ? 'Você entrou no Exército! Apresente-se no Quartel em Porto Sul. Cada minuto em serviço conta para a patente.' : 'Você saiu do serviço público.', 4);
  if (novo.personagem !== antigo.personagem || novo.cargo !== antigo.cargo || novo.nome !== antigo.nome || novo.crimes !== antigo.crimes || novo.policial !== antigo.policial || novo.prf !== antigo.prf || novo.eleitoral !== antigo.eleitoral || novo.profissao !== antigo.profissao || novo.recompensa !== antigo.recompensa) {
    conexao?.rastrear(metaPresenca());
  }
  jogador.algemadoPor = novo.algemado_por || null;
  if (novo.algemado !== antigo.algemado) {
    jogador.algemado = novo.algemado; mostrarAlgemas(novo.algemado);
    if (!novo.algemado) { jogador.levadoPor = null; jogador.avatar.raiz.visible = true; }
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
  if (j.morto || (j.algemado && algemadoPreso(dt))) { ix = 0; iy = 0; j.alvo = null; }
  const dir = new THREE.Vector3().addScaledVector(direita, ix).addScaledVector(frente, iy);
  let forca = Math.min(1, dir.length());
  if (forca > 0.01) { dir.normalize(); j.alvo = null; }
  else if (j.alvo) {
    dir.set(j.alvo.x - j.pos.x, 0, j.alvo.z - j.pos.z);
    const d = dir.length();
    if (d < 0.25) { j.alvo = null; forca = 0; } else { dir.normalize(); forca = 1; }
  }
  if (j.passageiro) { seguirComoPassageiro(); av.mixer.update(dt); return; }
  if (j.carro) { if (!j.carro.taxi) dirigir(dt); av.mixer.update(dt); av.raiz.updateMatrixWorld(true); return; }
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
  if (j.aperto) posarAperto(av);

  // caixa entre as mãos
  if (j.carregando) posicionarCaixa(av, j.carregando, j.yaw);
  if (j.algemas) { j.algemas.visible = av.raiz.visible; posicionarAlgemas(av, j.algemas); }
}

// algemas acima da cabeça (acima do nome), girando devagar: mostra que o jogador está algemado
function posicionarAlgemas(av, obj) {
  obj.position.copy(av.raiz.position); obj.position.y += alturaNome(av) + 0.55;
  obj.rotation.set(0.35, performance.now() / 700, 0);
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
  // dirigindo, a câmera gira para ficar atrás do veículo: a frente dele aponta sempre para cima da tela
  const dirigindo = jogador.carro && !jogador.carro.taxi;
  // câmera "atrás": a pé, faz o mesmo que dirigindo, girando aos poucos para ficar atrás de quem anda
  const atras = modoCam === 'atras' && !jogador.carro && !jogador.passageiro && !jogador.trem && !jogador.dentroCasa;
  const andou = Math.hypot(jogador.pos.x - (ultimaPosCam.x ?? jogador.pos.x), jogador.pos.z - (ultimaPosCam.z ?? jogador.pos.z)) > 0.4 * dt;
  ultimaPosCam.x = jogador.pos.x; ultimaPosCam.z = jogador.pos.z;
  if (dirigindo || (atras && andou)) {
    let alvo = (jogador.yaw - Math.PI * 1.25) / (Math.PI / 2);
    alvo += 4 * Math.round((anguloCamSuave - alvo) / 4);
    if (dirigindo || Math.abs(alvo - anguloCamSuave) < 1.15) anguloCam = alvo;   // andando para trás (de frente para a câmera) ela não dá meia-volta
    camAtras = true;
  } else if (camAtras && !atras) { anguloCam = Math.round(anguloCamSuave); camAtras = false; }
  anguloCamSuave += (anguloCam - anguloCamSuave) * Math.min(1, dt * (dirigindo ? 3 : atras ? 2.2 : 8));
  alvoCam.lerp(new THREE.Vector3(jogador.pos.x, 0.9, jogador.pos.z), Math.min(1, dt * 6));
  const off = offsetCamera(anguloCamSuave);
  camera.position.copy(alvoCam).addScaledVector(off, 150);
  if (tremor > 0) { tremor -= dt; camera.position.x += (Math.random() - 0.5) * tremor * 2; camera.position.z += (Math.random() - 0.5) * tremor * 2; }
  camera.lookAt(alvoCam);
  sol.position.copy(alvoCam).addScaledVector(SOL_DIR, 80);
  sol.target.position.copy(alvoCam);
  // prédios na frente do jogador ficam transparentes
  const origem = camAtiva.position.clone();
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
  const alg = contextoAlgema();
  const el = $('dica'); el.textContent = [dica ? `E: ${dica}` : '', alg ? `G: ${alg[0]}` : ''].filter(Boolean).join('  ·  '); el.classList.toggle('oculto', !(dica || alg) || TOQUE);
  { const b = $('btAlgema'); if (b) { b.classList.toggle('oculto', !alg); if (alg) b.textContent = '🔗 ' + alg[1]; } }
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
  if (jogador.passageiro) return passageiroPodeDescer() ? ['descer do helicóptero', 'Descer'] : ['passageiro no helicóptero', 'Voando'];
  if (jogador.carro?.taxi) return textoTaxi();
  if (jogador.carro && acaoNoVeiculo()) return acaoNoVeiculo().slice(1);
  if (jogador.carro) return [`${jogador.carro.vel < -0.3 ? "dando ré" : "dirigindo"} · ${Math.round(Math.abs(jogador.carro.vel) * 3.6)} km/h${jogador.carro.carga ? ` · ${jogador.carro.carga} caixas roubadas` : ''}`, 'Sair'];
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
  { const sa = salaAtual(); if (sa) return sa.contexto(); }
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
  if (jogador.perfil?.prf && eleitoralProximo(2.4)) return ['prender por crime eleitoral (PRF)', 'Prender'];
  if (jogador.perfil?.profissao === 'medico' && feridoProximo(2.8)) return ['socorrer o ferido (+250)', 'Socorrer'];
  if (servicos.estaApagando()) return ['jogando água no fogo (toque para parar)', 'Parar'];
  if (servicos.fogoProximo(9) && !jogador.carregando) return [jogador.perfil?.profissao === 'bombeiro' ? 'apagar o incêndio (+400)' : 'apagar o fogo (só o dono ou bombeiros)', 'Apagar'];
  if (perto(civico.BANCO.balcao, 3.2)) return ['banco: poupança e empréstimo', 'Banco'];
  if (perto(civico.BANCO.empregos, 3.2)) return ['agência de empregos: vagas nas empresas', 'Vagas'];
  if (perto(civico.HOSPITAL.balcao, 3.2)) return ['hospital: tratamento e plantão médico', 'Hospital'];
  if (perto(civico.BOMBEIROS.balcao, 3.2)) return ['entrar no quartel dos bombeiros', 'Bombeiros'];
  if (perto(civico.EXERCITO.arsenal, 3.2)) return [jogador.armaPesada ? 'guardar a arma pesada' : 'arsenal: pegar a arma pesada (com autorização)', 'Arsenal'];
  if (BANCAS.some((b) => perto(b, 3.2))) return ['banca de jornal: ler as notícias', 'Jornal'];
  if (perto(CONTRABANDISTA, 3.2)) return ['contrabandista: arma militar e alicate de corte', 'Negociar'];
  if (perto(civico.EXERCITO.balcao, 3.2)) return [jogador.perfil?.profissao === 'exercito' ? 'comando do Exército: ordens e caçadas' : 'comando do Exército: alistar-se', 'Comando'];
  if (jogador.perfil?.profissao === 'jornalista' && reportagemProxima()) return [`reportar: ${reportagemProxima().titulo} (+200)`, 'Reportar'];
  if (perto(civico.PREFEITURA.jornal, 3.2)) return ['Jornal da Cidade: virar jornalista e ler as notícias', 'Jornal'];
  if (perto(civico.PREFEITURA.porta, 3.2)) return ['entrar na prefeitura: gabinete, eleição e outdoors', 'Prefeitura'];
  if (perto(civico.PREFEITURA.prf, 3.2)) return ['entrar no posto da PRF', 'PRF'];
  if (perto(civico.CONCESSIONARIA.balcao, 3.2)) return ['comprar carro', 'Carros'];
  if (meuCarroProximo() && !jogador.carregando) return [meuCarroProximo().d.ladrao ? 'dirigir o carro roubado' : 'dirigir o seu carro', 'Dirigir'];
  { const ca = carroAlheioProximo(); if (ca && !jogador.carregando) return jogador.perfil?.policial || jogador.perfil?.prf ? ['devolver o carro roubado ao dono (+300)', 'Recuperar'] : ['arrombar o carro e sair dirigindo (crime)', 'Arrombar']; }
  if (taxi?.modo === 'roubo' && taxi.fase === 'esperando' && Math.hypot(taxi.c.obj.position.x - jogador.pos.x, taxi.c.obj.position.z - jogador.pos.z) < 8) return ['RENDER MOTORISTA: ele leva a carga para o seu território ou casa', 'Render'];
  if (armaPdPerto()) return ['pegar a ARMA DOURADA (2 balas)', 'Pegar'];
  { const vp = veiculoProximo(); if (vp && !jogador.carregando) return vp.texto; }
  { const sv = servicoProximo(); if (sv) return [sv.modelo === 'ambulancia' ? 'dirigir a ambulância' : civico.DO_EXERCITO.has(sv.modelo) ? `${civico.CARROS[sv.modelo].voa ? 'pilotar' : 'dirigir'} o ${civico.CARROS[sv.modelo].nome.toLowerCase().replace(' do exército', ' do Exército')}` : 'dirigir o caminhão dos bombeiros', 'Dirigir']; }
  if (taxi?.fase === 'esperando' && taxi.modo !== 'roubo' && Math.hypot(taxi.c.obj.position.x - jogador.pos.x, taxi.c.obj.position.z - jogador.pos.z) < 8) return [`embarcar no seu ${NOME_VEICULO[taxi.c.d.tipo]?.toLowerCase() || 'veículo'}`, 'Embarcar'];
  if (heliParaPassageiro()) return ['embarcar como passageiro no helicóptero', 'Embarcar'];
  { const cj = caronaDeJogador(); if (cj) return [`embarcar no ${(civico.CARROS[cj.r.carroModelo]?.nome || 'veículo').replace(' do Exército', ' do Exército').toLowerCase()} de ${cj.r.meta?.nome || 'outro jogador'}`, 'Embarcar']; }
  if (agenciaProxima() && !jogador.carregando) return ['pegar uma encomenda para outra cidade', 'Encomenda'];
  if (pertoOficina()) return ['fazer parafusos (3 sucatas = 2 parafusos)', 'Fazer'];
  if (pertoDelegacia()) return ['entrar na delegacia (serviço, procurados e estande de tiro)', 'Delegacia'];
  if (pertoContratante()) return ['ver missões do Contratante', 'Falar'];
  if (ocorrenciaProxima()) return ['atender a ocorrência (+300)', 'Atender'];
  if (jogador.assalto) return [`assaltando… ${Math.ceil(jogador.assalto.t)} s (não se afaste)`, 'Assalto'];
  if (jogador.arrombando) return [`arrombando o contêiner… ${Math.ceil(jogador.arrombando.t)} s (não se afaste)`, 'Arrombar'];
  { const a = algemadoParaSoltar(); if (a) return [`tirar as algemas de ${a.nome}`, 'Soltar']; }
  { const bu = contextoBueiro(); if (bu) return bu; }
  { const q = portaQGPerto(); if (q) return meuQG(q) ? ['entrar no QG do clã', 'QG'] : ['QG do clã (só membros do clã dono da base)', 'QG']; }
  { const k = conteinerPerto(); if (k !== null) return ['ARROMBAR o contêiner do cargueiro (crime)', 'Arrombar']; }
  { const cv = conviteAperto(); if (cv && !jogador.armado && !jogador.carregando) return [`🤝 apertar a mão de ${remotos.get(cv.de)?.meta?.nome || 'alguém'}`, 'Apertar']; }
  { const em = empresaDoPortao(); if (em && !jogador.carregando) return [`entrar na ${em.nome}`, 'Entrar']; }
  if (pontoProximo(pontos.lojas, 3.2)) return jogador.armado && !jogador.perfil?.policial && !jogador.perfil?.prf ? ['ASSALTAR a loja (crime!)', 'Assaltar'] : ['abrir a loja', 'Loja'];
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
    if (u.tipo === 'oficial') return [minha ? 'entrar na residência oficial' : 'residência oficial do prefeito', minha ? 'Entrar' : 'Casa'];
    if (minha) return [u.tipo === 'unidade' ? 'seu apartamento: entrar ou sair' : `seu ${nm}: entrar, evoluir ou vender`, 'Porta'];
    if (u.tipo === 'terreno' && u.dono && (u.nivel || 1) >= 3) return ['ver apartamentos para alugar ou comprar', 'Aptos'];
    if (u.dono) return [u.tipo === 'apto' ? 'prédio lotado' : `${nm} de ${u.dono_perfil?.nome || '?'}`, 'Casa'];
    return [`comprar ${u.rotulo || 'esta casa'} (${num(u.preco)})`, 'Comprar'];
  }
  if (caminhaoProximo(3.4)) return ['F: atacar o caminhão e roubar a carga', ''];
  { const pp = pessoaProxima(); if (pp) return [jogador.aperto ? '🤝 apertando a mão…' : `🤝 oferecer um aperto de mão a ${pp.r.meta?.nome || 'jogador'}`, 'Mão']; }
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
  clima.atualizar(dt, agoraServidor() / 1000, CICLO_DIA, { x: jogador.pos.x, y: jogador.pos.y - 2, z: jogador.pos.z, dentro: !!jogador.dentroCasa }, { sol, hemi, cena: scene });
  tempoClima -= dt; if (tempoClima <= 0) { tempoClima = 30; carregarClima(); }
  mundo.atualizar(dt);
  mundo.carrosPerto(jogador.pos.x, jogador.pos.z, dt);
  mundo.arvoresPerto(jogador.pos.x, jogador.pos.z, dt);
  sedes.atualizar(dt);
  if (jogador.avatar) { atualizarRastreio(dt); atualizarPrefeitura(dt); atualizarAssalto(dt); atualizarOcorrencias(dt); servicos.atualizar(dt); checarTrem(); atualizarArmaPd(dt); atualizarProcurados(dt); atualizarJornal(dt); atualizarCarreira(dt); atualizarSons(); atualizarChat(dt); atualizarConversas(dt); }
  atualizarJogador(dt);
  atualizarCaminhao(dt);
  atualizarCaminhoes(dt);
  atualizarRobos(dt);
  atualizarLogistica(dt);
  atualizarPolicia(dt);
  atualizarSocial(dt);
  atualizarNPCs(dt);
  atualizarSoldados(dt);
  atualizarCacada(dt);
  tempoArma -= dt; if (tempoArma <= 0) { tempoArma = 0.5; conferirArma(); }
  atualizarExplosoes(dt);
  atualizarMira();
  civico.atualizarQuartel(jogador.pos);
  { const E = civico.EXERCITO.estande, p = jogador.pos;   // estande: só militares entram
    if (E && !militar() && p.x > E.x0 && p.x < E.x1 && p.z > E.z0 && p.z < E.z1 + 1) { p.z = E.z0 - 0.6; if (performance.now() - (avisoEstande || 0) > 4000) { avisoEstande = performance.now(); aviso('🎯 O estande de tiro é só para militares.', 2.5); } } }
  atualizarRemotos(dt);
  voz.atualizar(dt); atualizarAperto(dt); atualizarQG(dt); atualizarAlgemas(dt); atualizarEsgoto(dt); atualizarEsteiras(dt);
  jogador.avatar?.posicionarArma(); for (const r of remotos.values()) r.av?.posicionarArma();
  enviarEstado(dt);
  tempoSalvar -= dt; if (tempoSalvar <= 0) { tempoSalvar = 15; salvarAgora(); }
  if (contratante?.avatar) contratante.avatar.mixer.update(dt);
  atualizarBolas(dt);
  atualizarCamera(dt);
  mundo.atualizarOclusao(dt, jogador.pos, offsetCamera(anguloCamSuave));
  atualizarHUD(dt);
  renderer.render(scene, camAtiva);
}

// ---------------------------------------------------------------- aperto de mão
// Um oferece (botão de ação perto de outro jogador), o outro aceita em até 10 s. Os dois se viram,
// estendem o braço direito e balançam a mão por 2,5 s. Os outros jogadores veem pelo campo "mh".
let convitesAperto = new Map(), meuPedidoAperto = 0;
function pessoaProxima(raio = 2.2) {
  if (jogador.carro || jogador.passageiro || jogador.trem || jogador.dentroCasa) return null;
  let melhor = null, md = raio;
  for (const [id, r] of remotos) {
    if (!r.av?.raiz.visible || r.carro || r.alvo?.pg || r.alvo?.al) continue;
    const d = Math.hypot(r.av.raiz.position.x - jogador.pos.x, r.av.raiz.position.z - jogador.pos.z);
    if (d < md) { md = d; melhor = { id, r }; }
  }
  return melhor;
}
function conviteAperto() {
  const agora = performance.now();
  for (const [de, t] of convitesAperto) {
    const r = remotos.get(de);
    if (agora - t > 10000 || !r?.av) { convitesAperto.delete(de); continue; }
    if (Math.hypot(r.av.raiz.position.x - jogador.pos.x, r.av.raiz.position.z - jogador.pos.z) < 3.2) return { de };
  }
  return null;
}
function pedirAperto(pp) {
  if (jogador.aperto) return;
  if (performance.now() - meuPedidoAperto < 3000) { aviso('Esperando a outra pessoa aceitar…'); return; }
  meuPedidoAperto = performance.now();
  conexao?.enviar('gesto', { de: jogador.perfil.id, para: pp.id, tipo: 'convite' });
  aviso(`🤝 Você estendeu a mão para ${pp.r.meta?.nome || 'o jogador'}. Esperando ele aceitar…`, 3);
  virarPara(pp.r.av.raiz.position.x, pp.r.av.raiz.position.z);
}
function aceitarAperto() {
  const cv = conviteAperto(); if (!cv) return;
  convitesAperto.delete(cv.de);
  conexao?.enviar('gesto', { de: jogador.perfil.id, para: cv.de, tipo: 'aceito' });
  comecarAperto(cv.de);
}
function receberGesto(g) {
  if (!jogador.perfil || g.para !== jogador.perfil.id) return;
  const nome = remotos.get(g.de)?.meta?.nome || 'Alguém';
  if (g.tipo === 'convite') { convitesAperto.set(g.de, performance.now()); aviso(`🤝 ${nome} quer apertar a sua mão. Toque em "Apertar".`, 4); }
  else if (g.tipo === 'aceito' && performance.now() - meuPedidoAperto < 12000) { meuPedidoAperto = 0; comecarAperto(g.de); }
}
function comecarAperto(id) {
  const r = remotos.get(id); if (!r?.av || !jogador.avatar) return;
  if (jogador.armado) alternarArma();
  jogador.aperto = { id, t: 2.5 }; jogador.trava = 2.5; jogador.alvo = null;
  virarPara(r.av.raiz.position.x, r.av.raiz.position.z);
  jogador.avatar.tocar('idle', { fade: 0.2 });
  aviso(`🤝 Você apertou a mão de ${r.meta?.nome || 'jogador'}.`, 2.5);
}
function atualizarAperto(dt) {
  const a = jogador.aperto; if (!a) return;
  a.t -= dt;
  const r = remotos.get(a.id);
  if (r?.av) {   // chega bem perto, de frente
    const p = r.av.raiz.position, d = Math.hypot(p.x - jogador.pos.x, p.z - jogador.pos.z);
    virarPara(p.x, p.z);
    if (d > 1.15) { const k = Math.min(1, dt * 3) * (d - 1.05) / d; jogador.pos.x += (p.x - jogador.pos.x) * k; jogador.pos.z += (p.z - jogador.pos.z) * k; }
  }
  if (a.t <= 0 || !r) jogador.aperto = null;
}
// gira um osso (no espaço do mundo) para que ele aponte para "dir"
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3(), _vd = new THREE.Vector3();
function apontarOsso(osso, filho, dir) {
  if (!osso?.parent || !filho) return;
  osso.updateWorldMatrix(true, true);
  osso.getWorldPosition(_va); filho.getWorldPosition(_vb);
  _vc.subVectors(_vb, _va); if (_vc.lengthSq() < 1e-8) return; _vc.normalize();
  _qa.setFromUnitVectors(_vc, dir);
  osso.getWorldQuaternion(_qb).premultiply(_qa);
  osso.parent.getWorldQuaternion(_qc).invert();
  osso.quaternion.copy(_qc.multiply(_qb));
  osso.updateWorldMatrix(false, true);
}
const ossosAperto = new WeakMap();
function posarAperto(av) {
  if (!ossosAperto.has(av)) {
    const m = av.modelo, o = (n) => m.getObjectByName('mixamorig' + n);
    ossosAperto.set(av, { braco: o('RightArm'), ante: o('RightForeArm'), mao: o('RightHand') });
  }
  const b = ossosAperto.get(av); if (!b.braco || !b.ante || !b.mao) return;
  const yaw = av.raiz.rotation.y, t = performance.now() / 1000, balanco = Math.sin(t * 13) * 0.12;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  // braço: para a frente e para baixo, um pouco para dentro; antebraço quase reto para a frente, balançando
  _vd.set(fx * 0.55 - fz * -0.12, -0.8, fz * 0.55 + fx * -0.12).normalize(); apontarOsso(b.braco, b.ante, _vd.clone());
  _vd.set(fx, -0.12 + balanco, fz).normalize(); apontarOsso(b.ante, b.mao, _vd.clone());
}

// ---------------------------------------------------------------- botão de voz
function desenharBotaoVoz() {
  const m = voz.modoAtual(), bt = $('btVoz'), pt = $('btFalar');
  if (bt) bt.innerHTML = `${m === 'off' ? '🔇' : '🎙️'}<span>Voz: ${m === 'off' ? 'desligada' : m === 'perto' ? 'quem está perto' : 'clã'}</span>`;
  if (pt) { pt.classList.toggle('oculto', m === 'off'); pt.classList.toggle('falando', voz.estaFalando()); pt.textContent = voz.estaFalando() ? '🔴' : '🎙️'; }
}
{
  const bt = $('btVoz'), pt = $('btFalar');
  if (bt) bt.onclick = async () => {
    const m = await voz.alternar(); desenharBotaoVoz();
    if (m === 'cla' && !jogador.claInfo?.nome) aviso('🎙️ Voz do clã: você não está em um clã. Ninguém vai ouvir.', 4);
    else aviso({ off: '🔇 Voz desligada.', perto: '🎙️ Voz: quem está perto (40 m). Segure 🎙️ (ou V) para falar.', cla: '🎙️ Voz do clã: só os membros online ouvem. Segure 🎙️ (ou V) para falar.' }[m], 4);
  };
  if (pt) {
    const on = (e) => { e.preventDefault(); e.stopPropagation(); try { pt.setPointerCapture(e.pointerId); } catch { /* sem captura */ } jogador.alvo = null; voz.falar(true); desenharBotaoVoz(); };
    const off = (e) => { e.preventDefault(); e.stopPropagation(); voz.falar(false); desenharBotaoVoz(); };
    pt.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    pt.addEventListener('pointerdown', on); pt.addEventListener('pointerup', off); pt.addEventListener('pointercancel', off); pt.addEventListener('lostpointercapture', off);
    pt.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

// ---------------------------------------------------------------- tempo (chuva, tempestade e neve)
let tempoClima = 30;
async function carregarClima() { try { const c = await rede.clima.ler(); if (c) clima.definirConfig(c); } catch { /* tenta de novo depois */ } }
// ruas da metrópole e das duas cidades menores (onde aparecem as poças)
const LIM_METRO = mundo.LIM + 4;
const RUAS_PERTO = (() => { const r = []; for (let i = -6; i <= 10; i++) r.push(ruaC(i)); return r; })();
function naRua(x, z) {
  const m = RW / 2 + 0.5;
  if (Math.abs(x) < LIM_METRO && Math.abs(z) < LIM_METRO) return RUAS_PERTO.some((c) => Math.abs(z - c) < m || Math.abs(x - c) < m);
  const az = Math.abs(z);
  if (az > 928 && az < 1115 && Math.abs(x) < 90) return [945, 999, 1053, 1107].some((c) => Math.abs(az - c) < m) || [-81, -27, 27, 81].some((c) => Math.abs(x - c) < m) || (az > 928 && az < 940);
  return false;
}

// ================================================================= QG do clã (dentro da base) e assalto ao cargueiro
// Só os membros do clã dono da base entram. Lá dentro: cofre do clã, mesa de planejamento (assalto ao cargueiro),
// arsenal (pega a arma do clã), enfermaria (cura) e refúgio (1 min lá dentro e a polícia perde o seu rastro).
const QG_SALA = { w: 16, d: 12 };
let refugioAte = 0, assaltoNavio = null, tempoAssalto = 3, avisoAssaltoId = null;
function territorioBase(id) { for (const v of territorios.values()) if (v.d.id === id) return v.d; return null; }
function meuQG(id) { const t = territorioBase(id); return !!(t && jogador.cla && t.dono_cla === jogador.cla); }
function portaQGPerto() {
  if (jogador.carro || jogador.dentroCasa) return null;
  for (const [id, p] of Object.entries(PORTAS_QG)) if (Math.hypot(p.x - jogador.pos.x, p.z - jogador.pos.z) < 2.6) return id;
  return null;
}
function criarQG() {
  if (interiores.has('qg')) return interiores.get('qg');
  const bx = 3200, bz = 0, W = QG_SALA.w, D = QG_SALA.d;
  const g = new THREE.Group(); g.position.set(bx, 0, bz); scene.add(g);
  const mat = (cor, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: cor, roughness: r, metalness: m });
  const caixa = (w, h, d, cor, x, y, z, m = 0) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof cor === 'string' ? mat(cor, 0.7, m) : cor); k.position.set(x, y, z); k.castShadow = true; k.receiveShadow = true; g.add(k); return k; };
  const piso = texturaCanvas(256, (gx, t) => { gx.fillStyle = '#4a4d52'; gx.fillRect(0, 0, t, t); for (let i = 0; i <= 4; i++) { gx.fillStyle = 'rgba(0,0,0,.25)'; gx.fillRect(i * t / 4, 0, 2, t); gx.fillRect(0, i * t / 4, t, 2); } ruido(gx, t, 4000, 0.1, 1.2); });
  piso.repeat.set(4, 3);
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: piso, roughness: 0.9 })); chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; g.add(chao);
  caixa(W, 3.6, 0.3, '#6b5f55', 0, 1.8, -D / 2); caixa(0.3, 3.6, D, '#5f554c', -W / 2, 1.8, 0);
  const bandeira = caixa(3.2, 1.8, 0.05, '#c43b3b', 0, 2.3, -D / 2 + 0.2);
  // cofre (fundo à direita)
  caixa(2.2, 2.2, 1.4, '#3d4248', 6.1, 1.1, -5, 0.6); caixa(0.5, 0.5, 0.08, '#c9a227', 6.1, 1.2, -4.27, 0.8);
  // mesa de planejamento com o mapa do porto
  caixa(3.2, 0.12, 2.0, '#5a3f28', 0, 0.95, -1); for (const [x, z] of [[-1.4, -1.8], [1.4, -1.8], [-1.4, -0.2], [1.4, -0.2]]) caixa(0.12, 0.95, 0.12, '#3b2a1a', x, 0.47, z);
  const mapa = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.6), new THREE.MeshStandardMaterial({ map: texturaCanvas(128, (gx, t) => { gx.fillStyle = '#d9c9a0'; gx.fillRect(0, 0, t, t); gx.fillStyle = '#4a7fa8'; gx.fillRect(0, t * 0.55, t, t * 0.45); gx.fillStyle = '#7d2a24'; gx.fillRect(t * 0.55, t * 0.62, t * 0.12, t * 0.3); gx.strokeStyle = '#c00'; gx.lineWidth = 3; gx.beginPath(); gx.arc(t * 0.61, t * 0.75, 12, 0, 7); gx.stroke(); }), roughness: 0.9 }));
  mapa.rotation.x = -Math.PI / 2; mapa.position.set(0, 1.02, -1); g.add(mapa);
  // arsenal (parede da esquerda)
  caixa(0.5, 2.4, 3.2, '#2f3a2c', -7.5, 1.2, -4);
  for (let k = 0; k < 4; k++) caixa(0.12, 0.16, 1.1, '#1a1a1a', -7.15, 1.0 + k * 0.4, -4 + (k % 2 ? 0.4 : -0.4), 0.7);
  // enfermaria: maca e armário com cruz
  caixa(2.2, 0.7, 1.0, '#e8ecef', -6, 0.35, 3); caixa(0.6, 0.15, 0.9, '#ffffff', -6.8, 0.78, 3);
  caixa(0.9, 1.6, 0.5, '#f2f2f2', -7.5, 0.8, 1.2); caixa(0.5, 0.12, 0.06, '#d42a2a', -7.22, 1.2, 1.2); caixa(0.12, 0.5, 0.06, '#d42a2a', -7.22, 1.2, 1.2);
  // porta de saída
  caixa(1.6, 0.05, 1.0, '#3b2a1a', 7, 0.03, 5.3);
  const luz = new THREE.PointLight('#ffe2b8', 9, 22, 1.5); luz.position.set(0, 3.2, 0); g.add(luz);
  const placa = (txt, x, z, y = 2.2) => { const sp = textoSprite(txt, { escala: 0.55 }); sp.position.set(x, y, z); g.add(sp); };
  placa('Cofre', 6.1, -5, 2.8); placa('Mesa de planejamento', 0, -1, 2); placa('Arsenal', -7.3, -4, 2.9); placa('Enfermaria', -6, 3, 1.8); placa('Sair', 7, 5.3, 1.4);
  const i = { base: { x: bx, z: bz }, sala: QG_SALA, bandeira,
    obst: [[4.9, 7.4, -6, -4.2], [-1.75, 1.75, -2.1, 0.1], [-8, -7.1, -5.7, -2.3], [-7.2, -4.8, 2.4, 3.6], [-8, -6.9, 0.8, 1.6]],
    pontos: { porta: { x: bx + 7, z: bz + 5.3 }, cofre: { x: bx + 6.1, z: bz - 3.6 }, mesa: { x: bx, z: bz + 0.9 }, arsenal: { x: bx - 6.3, z: bz - 4 }, maca: { x: bx - 6, z: bz + 4.3 } } };
  interiores.set('qg', i);
  return i;
}
function entrarNoQG(id) {
  const i = criarQG();
  i.bandeira.material.color.set(clasCache.get(jogador.cla)?.cor || jogador.claInfo?.cor || '#c43b3b');
  jogador.qg = id; jogador.qgDesde = performance.now();
  const p = PORTAS_QG[id];
  entrarSala('qg', { x: p.x + (p.x > 0 ? -2 : 2), z: p.z }, i.base.x + 6, i.base.z + 4.4);
  aviso((jogador.perfil?.crimes || 0) > 0 ? '🏴 QG do clã. Você está no refúgio: fique 1 minuto aqui e a polícia perde o seu rastro.' : '🏴 Bem-vindo ao QG do clã.', 4);
}
function sairDoQG() { sairSala(); }
function aoSairDoQG() { if (refugioAte > performance.now()) aviso('🛡️ A polícia perdeu o seu rastro por enquanto. Aproveite.', 3); }
// refúgio: depois de 1 min no QG, a polícia larga a perseguição (e fica 2 min sem achar você ao sair)
function refugiado() { return refugioAte > performance.now(); }
function atualizarQG(dt) {
  if (jogador.dentroCasa === 'qg' && (jogador.perfil?.crimes || 0) > 0 && performance.now() - jogador.qgDesde > 60000) {
    if (!refugiado()) aviso('🛡️ A polícia perdeu o seu rastro. Saia com calma.', 3);
    refugioAte = performance.now() + 120000;
  }
  atualizarArrombar(dt);
  tempoAssalto -= dt;
  const perto = Math.abs(jogador.pos.z) > 800 || jogador.dentroCasa === 'qg';
  if (tempoAssalto <= 0) { tempoAssalto = assaltoNavio || perto ? 8 : 30; carregarAssalto(); }
  desenharConteineres();
}
function contextoQG() {
  if (pontoInterior('porta', 1.8)) return ['sair do QG', 'Sair'];
  if (pontoInterior('cofre', 2)) return ['cofre do clã (entregar a carga do cargueiro aqui)', 'Cofre'];
  if (pontoInterior('mesa', 2.4)) return [assaltoNavio ? `assalto em andamento: ${assaltoNavio.cla_nome}` : 'mesa de planejamento: assalto ao cargueiro', 'Planejar'];
  if (pontoInterior('arsenal', 2)) return [jogador.armaDoQG || jogador.perfil?.arma_militar ? 'arsenal (você já tem a arma do clã)' : 'arsenal: pegar a arma do clã', 'Arsenal'];
  if (pontoInterior('maca', 2.2)) return ['enfermaria: curar a vida', 'Curar'];
  return ['', ''];
}
async function acaoQG() {
  if (pontoInterior('porta', 1.8)) { sairDoQG(); return; }
  if (pontoInterior('cofre', 2)) { abrirCofreQG(); return; }
  if (pontoInterior('mesa', 2.4)) { planejarAssalto(); return; }
  if (pontoInterior('arsenal', 2)) {
    if (!jogador.armaDoQG && !jogador.perfil?.arma_militar) { jogador.armaDoQG = true; aviso('🔫 Você pegou a ARMA DO CLÃ no arsenal (vale até sair do jogo). Ela é ilegal: cuidado com a polícia.', 4); }
    if (!jogador.armado) alternarArma();
    tempoArma = 0; return;
  }
  if (pontoInterior('maca', 2.2)) {
    jogador.trava = 1.5; jogador.alvo = null; jogador.avatar.tocar('idle_long', { fade: 0.3 }); aviso('✚ Cuidando dos ferimentos…', 1.5);
    jogador.eventos.push({ t: 1.5, fn: () => { jogador.vida = 100; desenharFome(); aviso('✚ Vida recuperada!'); } });
  }
}

// ---------------------------------------------------------------- cofre do clã
function janelaQG() {
  let el = $('qgJanela');
  if (!el) {
    el = document.createElement('div'); el.id = 'qgJanela'; el.className = 'modal oculto';
    el.innerHTML = '<div class="topo"><b>🏴 Cofre do clã</b><button id="qgFechar" aria-label="Fechar">✕</button></div><div id="qgConteudo" class="conteudo"></div><div id="qgMsg" class="msg"></div>';
    document.body.appendChild(el); $('qgFechar').onclick = () => el.classList.add('oculto');
  }
  return el;
}
function msgQG(t, ok = true) { const m = $('qgMsg'); if (!m) return; m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'erro'); clearTimeout(msgQG.t); msgQG.t = setTimeout(() => { m.textContent = ''; }, 4500); }
async function abrirCofreQG() {
  janelaQG().classList.remove('oculto');
  // carga do cargueiro na mochila: entrega primeiro
  try {
    const inv = await rede.carregarInventario(jogador.perfil.id);
    if (inv.carga_navio > 0) { const r = await rede.qg.entregar(); msgQG(`📦 ${r.cargas} carga(s) entregue(s): +${num(r.cla)} para o clã e +${num(r.voce)} para você!`); recarregarInventario(); }
  } catch (e) { msgQG(e.message, false); }
  desenharCofreQG();
}
async function desenharCofreQG() {
  const c = $('qgConteudo'); c.textContent = 'Carregando…';
  let d, inv; try { [d, inv] = await Promise.all([rede.qg.cofre(), rede.carregarInventario(jogador.perfil.id)]); } catch (e) { c.textContent = e.message; return; }
  if (!d) { c.textContent = 'Não foi possível abrir o cofre.'; return; }
  const nomes = {}; try { for (const p of await rede.carregarPrecos()) nomes[p.item] = p.nome; } catch { /* sem nomes */ }
  const mochila = Object.entries(inv).filter(([k, q]) => q > 0 && k !== 'carga_navio' && k !== 'desbloqueio');
  c.innerHTML = `<p class="dica">Caixa do clã: <b>${num(d.caixa)}</b> moedas. Qualquer membro guarda; ${d.retirar ? 'você pode retirar.' : 'só o líder e quem ele autorizar retiram.'}</p>
    <div class="sub">Moedas</div>
    <div class="botoes"><input id="qgValor" type="number" min="1" inputmode="numeric" placeholder="Valor" style="max-width:120px"><button id="qgDep">Depositar</button>${d.retirar ? '<button id="qgSac">Sacar</button>' : ''}</div>
    <div class="sub">No cofre</div>
    ${d.itens.length ? d.itens.map((x) => `<div class="botoes"><span style="flex:1">${esc(x.nome)}: <b>${x.qtd}</b></span>${d.retirar ? `<button data-ret="${x.item}">Retirar 1</button>` : ''}</div>`).join('') : '<p class="dica">Vazio.</p>'}
    <div class="sub">Sua mochila</div>
    ${mochila.length ? mochila.map(([k, q]) => `<div class="botoes"><span style="flex:1">${esc(nomes[k] || k)}: <b>${q}</b></span><button data-guar="${k}">Guardar 1</button><button data-guart="${k}" data-q="${q}">Guardar tudo</button></div>`).join('') : '<p class="dica">Nada para guardar.</p>'}
    ${d.lider && d.membros.length ? `<div class="sub">Quem pode retirar (além de você)</div>${d.membros.map((m) => `<div class="botoes"><span style="flex:1">${esc(m.nome)}</span><button data-aut="${m.id}" data-sim="${m.cofre ? 0 : 1}" class="${m.cofre ? 'ativo' : ''}">${m.cofre ? 'Autorizado ✓' : 'Autorizar'}</button></div>`).join('')}` : ''}`;
  const fazer = async (fn, ok) => { try { await fn(); msgQG(ok); recarregarInventario(); desenharCofreQG(); } catch (e) { msgQG(e.message, false); } };
  const valor = () => Math.floor(Number($('qgValor').value));
  $('qgDep').onclick = () => { const v = valor(); if (v > 0) fazer(() => rede.cla.depositar(v), `Depositou ${num(v)}.`); };
  if ($('qgSac')) $('qgSac').onclick = () => { const v = valor(); if (v > 0) fazer(() => rede.qg.sacar(v), `Sacou ${num(v)}.`); };
  c.querySelectorAll('[data-ret]').forEach((b) => { b.onclick = () => fazer(() => rede.qg.retirar(b.dataset.ret, 1), 'Retirado para a mochila.'); });
  c.querySelectorAll('[data-guar]').forEach((b) => { b.onclick = () => fazer(() => rede.qg.guardar(b.dataset.guar, 1), 'Guardado no cofre.'); });
  c.querySelectorAll('[data-guart]').forEach((b) => { b.onclick = () => fazer(() => rede.qg.guardar(b.dataset.guart, Number(b.dataset.q)), 'Tudo guardado no cofre.'); });
  c.querySelectorAll('[data-aut]').forEach((b) => { b.onclick = () => fazer(() => rede.qg.autorizar(b.dataset.aut, b.dataset.sim === '1'), 'Permissão alterada.'); });
}

// ---------------------------------------------------------------- assalto ao cargueiro (Porto Sul)
// 6 contêineres no convés, entre as pilhas e a ponte de comando. Sobe pelo píer e pela rampa.
// pontos de arrombar nos corredores laterais do convés, ao lado das pilhas de contêineres do navio
const CONTEINERES = [[60.1, 1145], [60.1, 1157], [60.1, 1169], [71.9, 1145], [71.9, 1157], [71.9, 1169]];
const conteineres = [];
function montarCargueiro() {
  mundo.addPiso({ x0: 43, x1: 53, z0: 1108, z1: 1183, h: 0.5 });
  mundo.addPiso({ x0: 59, x1: 73, z0: 1130, z1: 1190, h: 4.0 });
  mundo.addPiso({ x0: 52, x1: 60, z0: 1149.5, z1: 1153.5, h: 4, rampa: { eixo: 'x', de: 53, ate: 59.4, h0: 0.5, h1: 4.0 } });
  // rampa de embarque com corrimão
  const rampa = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(6.4, 3.5), 0.15, 3.6), new THREE.MeshStandardMaterial({ color: '#8a8f96', roughness: 0.6, metalness: 0.5 }));
  rampa.position.set(56.2, 2.2, 1151.5); rampa.rotation.z = Math.atan2(3.5, 6.4); rampa.receiveShadow = true; rampa.castShadow = true; scene.add(rampa);
  for (const dz of [-1.8, 1.8]) { const c = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(6.4, 3.5), 0.08, 0.08), new THREE.MeshStandardMaterial({ color: '#d8b13a' })); c.position.set(56.2, 3.2, 1151.5 + dz); c.rotation.z = rampa.rotation.z; scene.add(c); }
  // as pilhas de contêineres e a ponte de comando não se atravessam: anda-se pelos corredores dos lados
  colisores.push({ tipo: 'caixa', x0: 60.7, x1: 71.3, z0: 1137, z1: 1176 }, { tipo: 'caixa', x0: 60.2, x1: 71.8, z0: 1176, z1: 1189 });
  CONTEINERES.forEach(([x, z], k) => {
    const marca = textoSprite('💰 Contêiner', { escala: 0.6, fundo: 'rgba(160,20,20,.9)' }); marca.position.set(x < 66 ? x + 1.2 : x - 1.2, 7.2, z); marca.visible = false; scene.add(marca);
    const feito = textoSprite('✔ Arrombado', { escala: 0.5, fundo: 'rgba(40,40,40,.85)' }); feito.position.copy(marca.position); feito.visible = false; scene.add(feito);
    conteineres.push({ k, x, z, marca, feito, ponto: { x, z } });
  });
}
async function carregarAssalto() {
  try {
    const a = await rede.qg.assaltoAtual();
    assaltoNavio = a && Date.parse(a.fim) > agoraServidor() ? a : null;
  } catch { /* tenta depois */ }
}
function desenharConteineres() {
  const meu = assaltoNavio && jogador.cla && assaltoNavio.cla === jogador.cla;
  for (const c of conteineres) {
    const aberto = !!assaltoNavio?.abertos?.includes(c.k);
    c.marca.visible = !!meu && !aberto;
    c.feito.visible = !!assaltoNavio && aberto;
  }
}
function conteinerPerto() {
  if (!assaltoNavio || !jogador.cla || assaltoNavio.cla !== jogador.cla || jogador.carro || jogador.pos.y < 3) return null;
  for (const c of conteineres) if (!assaltoNavio.abertos?.includes(c.k) && Math.hypot(c.ponto.x - jogador.pos.x, c.ponto.z - jogador.pos.z) < 2.6) return c.k;
  return null;
}
function arrombarConteiner(k) {
  if (jogador.arrombando) return;
  const c = conteineres[k];
  jogador.arrombando = { k, t: 12, x: c.ponto.x, z: c.ponto.z, aviso: 0 };
  virarPara(66, c.z); jogador.alvo = null;
  conexao?.enviar('assalto', { tipo: 'arrombando', cla: assaltoNavio?.cla_nome });
  aviso('🔧 Arrombando o contêiner… não se afaste (12 s).', 3);
}
function atualizarArrombar(dt) {
  const a = jogador.arrombando; if (!a) return;
  if (jogador.morto || jogador.algemado || jogador.pena > 0 || Math.hypot(a.x - jogador.pos.x, a.z - jogador.pos.z) > 3.5) { jogador.arrombando = null; aviso('Arrombamento abandonado.'); return; }
  a.t -= dt; a.aviso -= dt;
  if (a.aviso <= 0 && a.t > 0) { a.aviso = 3; jogador.avatar.tocar('punch_right', { umaVez: true, velocidade: 1.7, fade: 0.1 }); }
  if (a.t <= 0) {
    jogador.arrombando = null;
    rede.qg.arrombar(a.k).then(() => {
      aviso('📦 Carga roubada! Leve até o COFRE do QG do clã. Se for preso no caminho, a polícia confisca. Você está PROCURADO!', 5);
      recarregarInventario(); tempoAssalto = 0;
      const p = PORTAS_QG[territorioBase('leste')?.dono_cla === jogador.cla ? 'leste' : 'oeste'];
      if (p) rastrear({ nome: '🏴 QG do clã', x: p.x, z: p.z });
    }).catch((e) => aviso(e.message, 3));
  }
}
async function planejarAssalto() {
  if (assaltoNavio) {
    const resta = Math.max(0, Math.ceil((Date.parse(assaltoNavio.fim) - agoraServidor()) / 60000));
    aviso(assaltoNavio.cla === jogador.cla ? `Assalto do seu clã em andamento: ${resta} min. Contêineres abertos: ${assaltoNavio.abertos.length}/6.` : `O cargueiro já está sendo assaltado (${assaltoNavio.cla_nome}).`, 4);
    if (assaltoNavio.cla === jogador.cla) rastrear({ nome: '🚢 Cargueiro', x: 66, z: 1150 });
    return;
  }
  if (performance.now() > (planejarAssalto.conf || 0)) { planejarAssalto.conf = performance.now() + 4000; aviso('🗺️ Assalto ao cargueiro do Porto Sul: 15 min, 6 contêineres, a polícia vai reagir. Toque de novo para começar.', 4.5); return; }
  planejarAssalto.conf = 0;
  try {
    assaltoNavio = await rede.qg.iniciarAssalto();
    conexao?.enviar('assalto', { tipo: 'inicio', cla: assaltoNavio?.cla_nome });
    aviso('🚢 ASSALTO COMEÇOU! 15 minutos. Vão até o cargueiro no Porto Sul: suba pelo píer e arrombe os contêineres.', 5);
    rastrear({ nome: '🚢 Cargueiro', x: 50, z: 1110 });
  } catch (e) { aviso(e.message, 3.5); }
}
// todos ficam sabendo do assalto (polícia, PRF e Exército podem ir até lá)
function avisoAssalto(a) {
  tempoAssalto = Math.min(tempoAssalto, 1);
  if (a?.tipo === 'inicio' && avisoAssaltoId !== a.cla) {
    avisoAssaltoId = a.cla;
    aviso(`🚨 ALERTA: o clã ${a.cla || '?'} está assaltando o cargueiro no Porto Sul!`, 5);
    const p = jogador.perfil; if (p?.policial || p?.prf || militar()) rastrear({ nome: '🚨 Assalto ao cargueiro', x: 50, z: 1110 });
  }
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ================================================================= algemas
// Algemam: Polícia, PRF, Exército, prefeito, os 2 seguranças do prefeito, moderadores e administrador (botão 🔗 / tecla G).
// O algemado fica passivo: não ataca nem age; perto de quem algemou não consegue andar. Quem algemou pode "Segurar" e
// levar junto (até dentro do carro). Se quem algemou morrer ou ficar longe, o algemado foge, ainda algemado.
// Tiram as algemas: quem algemou, moderadores e administrador (botão de ação). Com alicate de corte, qualquer um liberta.
// Os pedestres (NPC) também podem ser algemados.
let temAlicate = false, tempoAlicate = 0;
const souEquipe = () => ['admin', 'moderador'].includes(jogador.perfil?.cargo);
function podeAlgemar() {
  const p = jogador.perfil; if (!p) return false;
  return souEquipe() || p.policial || p.prf || p.profissao === 'exercito' || prefeitoAtual === p.id || segurancas.includes(p.id);
}
function remotoAPe(r) { return r.av?.raiz.visible && r.alvo && !r.carro && !r.alvo.pg; }
// o que o botão 🔗 faria agora (o mais perto)
function alvoAlgema() {
  const j = jogador; if (!j.avatar || !j.perfil || j.morto || j.algemado || j.pena > 0) return null;
  if (j.segurando) return { acao: 'largar', nome: j.segurando.nome };
  if (j.carro || j.trem || j.dentroCasa || j.passageiro) return null;
  const eu = j.perfil.id, pode = podeAlgemar();
  let melhor = null, md = 2.4;
  for (const [id, r] of remotos) {
    if (!remotoAPe(r)) continue;
    const d = Math.hypot(r.av.raiz.position.x - j.pos.x, r.av.raiz.position.z - j.pos.z); if (d >= md) continue;
    const a = r.alvo, nome = r.meta?.nome || 'jogador';
    if (a.al && a.ap === eu) { md = d; melhor = { acao: 'segurar', id, nome }; }
    else if (a.al && temAlicate) { md = d; melhor = { acao: 'cortar', id, nome }; }
    else if (!a.al && pode && (r.meta?.cargo || 'jogador') === 'jogador') { md = d; melhor = { acao: 'algemar', id, nome }; }
  }
  npcs.forEach((n, i) => {
    if (!n.civil || !n.av?.raiz.visible) return;
    const d = Math.hypot(n.av.raiz.position.x - j.pos.x, n.av.raiz.position.z - j.pos.z); if (d >= md) return;
    if (n.algemado && n.algemadoPor === eu) { md = d; melhor = { acao: 'segurar', npc: i, nome: 'o pedestre' }; }
    else if (!n.algemado && pode) { md = d; melhor = { acao: 'algemar', npc: i, nome: 'o pedestre' }; }
  });
  return melhor;
}
const TEXTO_ALGEMA = { largar: ['largar', 'Largar'], segurar: ['segurar e levar', 'Segurar'], cortar: ['cortar as algemas (alicate) de', 'Cortar'], algemar: ['algemar', 'Algemar'] };
function contextoAlgema() { const a = alvoAlgema(); if (!a) return null; const [t, b] = TEXTO_ALGEMA[a.acao]; return [`🔗 ${t} ${a.nome}`, b]; }
async function acaoAlgema() {
  const a = alvoAlgema(); if (!a) return;
  const j = jogador;
  if (a.acao === 'largar') { j.segurando = null; aviso(`Você largou ${a.nome}.`); return; }
  if (a.acao === 'segurar') { j.segurando = a.npc !== undefined ? { npc: a.npc, nome: a.nome } : { id: a.id, nome: a.nome }; aviso(`🔗 Você está segurando ${a.nome}: ele vai junto com você (até no carro). Toque em Largar para soltar.`, 4); return; }
  if (a.npc !== undefined) { algemarNpc(a.npc, true); return; }
  try {
    if (a.acao === 'algemar') { await rede.algemas.algemar(a.id); aviso(`🔗 ${a.nome} foi algemado. Toque em Segurar para levar.`, 3.5); }
    else { await rede.algemas.cortar(a.id); temAlicate = false; tempoAlicate = 0; aviso(`✂️ Você cortou as algemas de ${a.nome}. Ele está livre.`, 3.5); }
    jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 2, fade: 0.1 }); jogador.trava = 0.6;
  } catch (e) { aviso(e.message, 3); }
}
// tirar as algemas (botão de ação): quem algemou ou a equipe
function algemadoParaSoltar() {
  const j = jogador; if (!j.perfil || j.algemado || j.carro || j.dentroCasa) return null;
  const eu = j.perfil.id, equipe = souEquipe();
  for (const [id, r] of remotos) {
    if (!remotoAPe(r) || !r.alvo.al || !(r.alvo.ap === eu || equipe)) continue;
    if (Math.hypot(r.av.raiz.position.x - j.pos.x, r.av.raiz.position.z - j.pos.z) < 2.4) return { id, nome: r.meta?.nome || 'jogador' };
  }
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i]; if (!n.algemado || !(n.algemadoPor === eu || equipe)) continue;
    if (Math.hypot(n.av.raiz.position.x - j.pos.x, n.av.raiz.position.z - j.pos.z) < 2.4) return { npc: i, nome: 'o pedestre' };
  }
  return null;
}
async function soltarAlgemado(a) {
  if (a.npc !== undefined) { algemarNpc(a.npc, false); return; }
  try { await rede.algemas.soltar(a.id); if (jogador.segurando?.id === a.id) jogador.segurando = null; aviso(`Você tirou as algemas de ${a.nome}.`); }
  catch (e) { aviso(e.message, 3); }
}
// eu algemado: parado perto de quem algemou, seguindo quando ele me segura, fugindo se ele morreu ou está longe
function algemadoPreso(dt) {
  const j = jogador, r = j.algemadoPor ? remotos.get(j.algemadoPor) : null, a = r?.alvo;
  const vivo = !!(r && a && a.a !== 'death' && !r.meta?.ferido);
  if (vivo && a.sg === j.perfil.id) {
    if (a.cv || a.vc) { j.levadoPor = j.algemadoPor; j.pos.set(a.x, a.y, a.z); j.avatar.raiz.visible = false; return true; }   // dentro do carro dele
    if (j.levadoPor) { j.levadoPor = null; j.avatar.raiz.visible = true; }
    const tx = a.x - Math.sin(a.r) * 1.1, tz = a.z - Math.cos(a.r) * 1.1, dd = Math.hypot(tx - j.pos.x, tz - j.pos.z);
    if (dd > 8) j.pos.set(tx, j.pos.y, tz);
    else if (dd > 0.15) { const v = Math.min(dd, dt * Math.max(2.4, dd * 3)); j.pos.x += (tx - j.pos.x) / dd * v; j.pos.z += (tz - j.pos.z) / dd * v; }
    j.yaw = Math.atan2(a.x - j.pos.x, a.z - j.pos.z);
    return true;
  }
  if (j.levadoPor) { j.levadoPor = null; j.avatar.raiz.visible = true; }
  return vivo && Math.hypot(a.x - j.pos.x, a.z - j.pos.z) < 30;
}
function atualizarAlgemas(dt) {
  const j = jogador, s = j.segurando;
  if (s) {
    if (j.morto || j.algemado) j.segurando = null;
    else if (s.npc !== undefined) { if (!npcs[s.npc]?.algemado) j.segurando = null; }
    else {
      const r = remotos.get(s.id), a = r?.alvo;
      if (!a || !a.al || a.ap !== j.perfil.id || Math.hypot(a.x - j.pos.x, a.z - j.pos.z) > 40) { j.segurando = null; aviso(`Você não está mais segurando ${s.nome}.`); }
    }
  }
  // tenho alicate? (só confere quando há algum algemado por perto)
  tempoAlicate -= dt;
  if (tempoAlicate <= 0) {
    tempoAlicate = 12;
    const algemadoPerto = [...remotos.values()].some((r) => r.alvo?.al && r.av && Math.hypot(r.av.raiz.position.x - j.pos.x, r.av.raiz.position.z - j.pos.z) < 15);
    if (algemadoPerto && j.perfil) rede.carregarInventario(j.perfil.id).then((inv) => { temAlicate = (inv.alicate || 0) > 0; }).catch(() => {});
  }
}
// pedestres algemados: param, seguem quem segura e são soltos sozinhos depois de 5 min
function algemarNpc(i, ligar, de = jogador.perfil?.id, avisar = true) {
  const n = npcs[i]; if (!n) return;
  if (ligar) {
    n.algemado = true; n.algemadoPor = de; n.ateAlgema = performance.now() + 300000;
    if (!n.algemas) { n.algemas = clonar('algemas'); n.algemas.scale.setScalar(1.4); scene.add(n.algemas); }
    n.av.tocar('idle', { fade: 0.2 });
    if (de === jogador.perfil?.id && avisar) aviso('🔗 Pedestre algemado. Toque em Segurar para levar.', 3);
  } else {
    n.algemado = false; n.algemadoPor = null;
    if (n.algemas) { scene.remove(n.algemas); n.algemas = null; }
    n.av.tocar('walk', { velocidade: 0.85 });
    if (jogador.segurando?.npc === i) jogador.segurando = null;
    if (avisar && de === jogador.perfil?.id) aviso('Você tirou as algemas do pedestre.');
  }
  if (de === jogador.perfil?.id) conexao?.enviar('algemaNpc', { i, on: ligar ? 1 : 0, por: de });
}
function receberAlgemaNpc(m) { if (npcs[m.i]) algemarNpc(m.i, !!m.on, m.por, false); }
function npcAlgemado(n, dt) {
  const i = npcs.indexOf(n), p = n.av.raiz.position;
  if (performance.now() > n.ateAlgema) { algemarNpc(i, false, n.algemadoPor, false); return; }
  let alvo = null;
  if (n.algemadoPor === jogador.perfil?.id && jogador.segurando?.npc === i) alvo = { x: jogador.pos.x, z: jogador.pos.z, r: jogador.yaw };
  else { const a = remotos.get(n.algemadoPor)?.alvo; if (a && a.sg === 'n' + i) alvo = { x: a.x, z: a.z, r: a.r }; }
  let anda = false;
  if (alvo) {
    const tx = alvo.x - Math.sin(alvo.r) * 1.1, tz = alvo.z - Math.cos(alvo.r) * 1.1, d = Math.hypot(tx - p.x, tz - p.z);
    if (d > 10) p.set(tx, p.y, tz);
    else if (d > 0.2) { const v = Math.min(d, dt * Math.max(2.4, d * 3)); p.x += (tx - p.x) / d * v; p.z += (tz - p.z) / d * v; anda = true; }
    p.y = alturaChao(p.x, p.z);
    n.av.raiz.rotation.y = suavizarAngulo(n.av.raiz.rotation.y, Math.atan2(alvo.x - p.x, alvo.z - p.z), dt * 8);
  }
  if (anda !== !!n.andandoAlgemado) { n.andandoAlgemado = anda; n.av.tocar(anda ? 'walk' : 'idle', { fade: 0.2 }); }
  n.av.mixer.update(dt);
  n.av.raiz.updateMatrixWorld(true);
  if (n.algemas) posicionarAlgemas(n.av, n.algemas);
}

// ---------------------------------------------------------------- janela de escolha simples (contrabandista)
function escolher(titulo, texto, opcoes) {
  let el = $('escolhaJanela');
  if (!el) {
    el = document.createElement('div'); el.id = 'escolhaJanela'; el.className = 'modal oculto';
    el.innerHTML = '<div class="topo"><b id="escolhaTitulo"></b><button id="escolhaFechar" aria-label="Fechar">✕</button></div><div id="escolhaConteudo" class="conteudo"></div>';
    document.body.appendChild(el); $('escolhaFechar').onclick = () => el.classList.add('oculto');
  }
  $('escolhaTitulo').textContent = titulo;
  const c = $('escolhaConteudo');
  c.innerHTML = `<p class="dica">${texto}</p>${opcoes.map((o, k) => `<div class="botoes"><button data-op="${k}" style="flex:1;text-align:left">${o.rotulo}</button></div>`).join('')}`;
  c.querySelectorAll('[data-op]').forEach((b) => { b.onclick = () => { el.classList.add('oculto'); opcoes[Number(b.dataset.op)].fn(); }; });
  el.classList.remove('oculto');
}

// ================================================================= salas (interiores com funções): QG, redação, prefeitura...
// Cada sala tem contexto() (o que o botão de ação faz em cada ponto) e acao(). A saída leva de volta para a porta.
const SALAS = { qg: { contexto: () => contextoQG(), acao: () => acaoQG(), sair: () => aoSairDoQG() } };
function salaAtual() { return typeof jogador.dentroCasa === 'string' ? SALAS[jogador.dentroCasa.split(':')[0]] || null : null; }
function entrarSala(chave, saida, x, z) {
  if (jogador.carregando) { scene.remove(jogador.carregando); jogador.carregando = null; }
  jogador.saidaSala = saida; jogador.dentroCasa = chave;
  teleportar(x, z);
}
function sairSala() {
  const chave = jogador.dentroCasa, s = jogador.saidaSala;
  jogador.dentroCasa = null;
  if (s) teleportar(s.x, s.z); else teleportar(contratante.x + 6, contratante.z + 6);
  SALAS[String(chave).split(':')[0]]?.sair?.();
}
// monta uma sala simples: piso, duas paredes (fundo e esquerda) e luz; "moveis" desenha o resto
function montarSala(chave, bx, bz, w, d, { piso = '#6d6a66', parede = '#cfc8bb', luz = '#fff1d6' } = {}, moveis) {
  if (interiores.has(chave)) return interiores.get(chave);
  const g = new THREE.Group(); g.position.set(bx, 0, bz); scene.add(g);
  const mats = new Map(), mat = (cor, r = 0.75, m = 0) => { const k = cor + r + m; if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: cor, roughness: r, metalness: m })); return mats.get(k); };
  const caixa = (cw, ch, cd, cor, x, y, z, m = 0) => { const k = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), mat(cor, 0.7, m)); k.position.set(x, y, z); k.castShadow = true; k.receiveShadow = true; g.add(k); return k; };
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(piso, 0.9)); chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; g.add(chao);
  caixa(w, 3.6, 0.3, parede, 0, 1.8, -d / 2); caixa(0.3, 3.6, d, parede, -w / 2, 1.8, 0);
  const l = new THREE.PointLight(luz, 10, Math.max(w, d) * 1.6, 1.5); l.position.set(0, 3.3, 0); g.add(l);
  const placa = (txt, x, z, y = 2.2) => { const sp = textoSprite(txt, { escala: 0.55 }); sp.position.set(x, y, z); g.add(sp); };
  caixa(1.6, 0.05, 1.0, '#3b2a1a', w / 2 - 1.2, 0.03, d / 2 - 0.8); placa('Sair', w / 2 - 1.2, d / 2 - 0.8, 1.4);
  const i = { base: { x: bx, z: bz }, sala: { w, d }, obst: [], pontos: { porta: { x: bx + w / 2 - 1.2, z: bz + d / 2 - 0.8 } }, g, caixa, placa, mat };
  moveis?.(i);
  interiores.set(chave, i);
  return i;
}
// ponto da sala com móvel: registra o obstáculo e o ponto de uso na frente dele
function movel(i, nome, x, z, w, d, frente = [0, 1]) {
  i.obst.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);
  i.pontos[nome] = { x: i.base.x + x + frente[0] * (w / 2 + 0.9), z: i.base.z + z + frente[1] * (d / 2 + 0.9) };
}
const naPorta = () => pontoInterior('porta', 1.8);

// ---------------------------------------------------------------- redação do jornal (escritório)
// Mesa de edição (editor completo), estúdio de fotos (fundo, luzes e câmera fixa) e mural das matérias.
let camEstudio = null;
function salaRedacao() {
  return montarSala('redacao', 3000, 400, 16, 12, { piso: '#5b616b', parede: '#e6e1d8' }, (i) => {
    const { caixa, placa } = i;
    // mesas com computadores
    for (const [x, z] of [[-4, -1], [0, -1], [-4, 2.5], [0, 2.5]]) {
      caixa(2.2, 0.08, 1.1, '#8a6a4a', x, 0.85, z); caixa(0.9, 0.55, 0.06, '#1b1f27', x, 1.2, z - 0.3); caixa(0.86, 0.5, 0.02, '#4aa3ff', x, 1.2, z - 0.26);
      for (const dx of [-0.95, 0.95]) caixa(0.08, 0.85, 1.0, '#5a4630', x + dx, 0.42, z);
      i.obst.push([x - 1.15, x + 1.15, z - 0.6, z + 0.6]);
    }
    movel(i, 'mesa', -4, -1, 2.4, 1.2); placa('Mesa de edição', -4, -1, 2);
    // estúdio de fotos: fundo vermelho, chão claro, dois refletores
    caixa(5, 3.2, 0.1, '#7a1e2b', 5, 1.6, -5.7); caixa(5, 0.02, 2.4, '#efe9df', 5, 0.01, -4.4);
    for (const sx of [3, 7]) { caixa(0.08, 2.2, 0.08, '#222', sx, 1.1, -2.6); caixa(0.5, 0.4, 0.4, '#ddd', sx, 2.3, -2.6, 0.5); }
    const marca = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24), new THREE.MeshBasicMaterial({ color: '#ffd23e' })); marca.rotation.x = -Math.PI / 2; marca.position.set(5, 0.03, -4.4); i.g.add(marca);
    i.pontos.estudio = { x: i.base.x + 5, z: i.base.z - 4.4 };
    placa('📸 Estúdio de fotos', 5, -4.4, 3.4);
    camEstudio = new THREE.PerspectiveCamera(42, 1.6, 0.1, 60); camEstudio.position.set(i.base.x + 5, 1.55, i.base.z + 0.4); camEstudio.lookAt(i.base.x + 5, 1.1, i.base.z - 4.6);
    // mural
    caixa(3.2, 1.8, 0.06, '#2b3442', -6, 2, -5.8); placa('Mural de matérias', -6, -5.5, 3.2); i.pontos.mural = { x: i.base.x - 6, z: i.base.z - 4.6 };
  });
}
function entrarRedacao() {
  const i = salaRedacao(), p = civico.PREFEITURA.jornal;
  entrarSala('redacao', { x: p.x + 1.5, z: p.z + 1.5 }, i.pontos.porta.x - 1, i.pontos.porta.z - 1);
  aviso(redator() ? '📰 Redação do Jornal. Mesa de edição: editor completo. Estúdio: fotos dos personagens.' : '📰 Redação do Jornal. Fique na marca do estúdio para um jornalista fotografar você.', 4);
}
const redator = () => jogador.perfil?.profissao === 'jornalista' || jogador.perfil?.cargo === 'admin';
SALAS.redacao = {
  contexto: () => {
    if (naPorta()) return ['sair da redação', 'Sair'];
    if (pontoInterior('mesa', 1.6)) return [redator() ? 'mesa de edição: editor completo do jornal' : 'mesa de edição (só jornalistas)', 'Editar'];
    if (pontoInterior('estudio', 2.6)) return [redator() ? 'estúdio: tirar foto de quem está na marca' : 'estúdio de fotos (fique na marca amarela)', redator() ? 'Foto' : 'Posar'];
    if (pontoInterior('mural', 1.8)) return ['ler o mural de matérias', 'Ler'];
    return ['', ''];
  },
  acao: () => {
    if (naPorta()) { sairSala(); return; }
    if (pontoInterior('mesa', 1.6)) { if (redator()) jornal.abrirEditor(); else aviso('Só jornalistas usam a mesa de edição.'); return; }
    if (pontoInterior('estudio', 2.6)) { if (redator()) fotoEstudio(); else { jogador.yaw = 0; aviso('😄 Pose! Olhe para a câmera e espere o jornalista.'); } return; }
    if (pontoInterior('mural', 1.8)) abrirServico('jornal');
  },
};
// tira uma foto do jogo (sem os botões da tela) e guarda na galeria do aparelho
function capturar(cam) {
  const c = renderer.domElement;
  if (cam.isPerspectiveCamera) { cam.aspect = c.width / c.height; cam.updateProjectionMatrix(); }
  renderer.render(scene, cam);
  const W = 480, H = 300, out = document.createElement('canvas'); out.width = W; out.height = H;
  const r = Math.max(W / c.width, H / c.height), sw = W / r, sh = H / r;
  out.getContext('2d').drawImage(c, (c.width - sw) / 2, (c.height - sh) / 2, sw, sh, 0, 0, W, H);
  return out.toDataURL('image/jpeg', 0.62);
}
function flash() {
  const f = document.createElement('div'); f.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:50;opacity:.9;transition:opacity .5s;pointer-events:none';
  document.body.appendChild(f); window.requestAnimationFrame(() => { f.style.opacity = 0; }); setTimeout(() => f.remove(), 600);
}
function fotoEstudio() {
  if (!camEstudio) return;
  const url = capturar(camEstudio); jornal.guardarFoto(url); flash();
  aviso('📸 Foto de estúdio guardada! Use na mesa de edição.', 3);
}
function tirarFotoRua() {
  setTimeout(() => { const url = capturar(camAtiva); jornal.guardarFoto(url); flash(); aviso('📷 Foto guardada! Use no editor da redação.', 3); }, 350);
}

// ---------------------------------------------------------------- tocar num telão ou outdoor amplia na tela
const _rc = new THREE.Raycaster(), _ndc = new THREE.Vector2();
function tocouPainel(cx, cy) {
  _ndc.set(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  _rc.setFromCamera(_ndc, camAtiva);
  const alvos = [...teloes.map((t) => ({ mesh: t.tela, t })), ...civico.placasOutdoors().map((o) => ({ mesh: o.mesh, o }))].filter((a) => a.mesh);
  const hits = _rc.intersectObjects(alvos.map((a) => a.mesh), false);
  if (!hits.length) return false;
  const a = alvos.find((x) => x.mesh === hits[0].object);
  if (a.t) {
    const n = a.t.noticia;
    if (!n) jornal.ampliar({ titulo: '📺 Telão', html: '<p>Sem notícias no momento.</p>' });
    else if (n.materia) jornal.ampliar({ titulo: '📺 Telão · Jornal da Cidade', html: jornal.cartao(n, { grande: true }), lista: [n] });
    else jornal.ampliar({ titulo: '📺 Telão · Ao vivo', html: `<h2>${esc(n.titulo)}</h2><small>por ${esc(n.autor_nome || '')}</small>` });
  } else {
    let src = ''; try { src = a.o.canvas?.toDataURL?.('image/png') || ''; } catch { /* sem imagem */ }
    jornal.ampliar({ titulo: '🪧 Outdoor', html: `${src ? `<img src="${src}" style="width:100%;border-radius:8px">` : ''}${a.o.o?.titulo ? `<h3>${esc(a.o.o.titulo)}</h3>` : ''}${a.o.o?.texto ? `<p>${esc(a.o.o.texto)}</p>` : ''}` });
  }
  return true;
}

// ================================================================= Lixeiros: bueiros e esgoto
// 16 bueiros pela cidade (um deles é a entrada secreta). Membros descem e sobem por qualquer um.
const BUEIROS = (() => {
  const l = [[0, 1], [2, 3], [4, 0], [1, 4], [-2, -1], [-4, 2], [3, -3], [6, 1], [8, 5], [-5, 6]].map(([a, b]) => ({ x: mundo.ruaC(a) + 3, z: mundo.ruaC(b) + 3, onde: 'Metrópole' }));
  for (const s of [-1, 1]) for (const [x, z] of [[-24, 999], [30, 1053], [-78, 945]]) l.push({ x, z: s * z, onde: s < 0 ? 'Vila Serra' : 'Porto Sul' });
  return l.map((b, k) => ({ ...b, k, nome: `Bueiro nº ${k + 1} · ${b.onde}` }));
})();
let conviteBueiro = null, meusConvidados = new Map(), entradaEsgoto = null, tempoInsalubre = 60, casasEsgoto = [];
function montarBueiros() {
  const tampa = new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.55, metalness: 0.7 });
  const aro = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.6, metalness: 0.5 });
  const geoT = new THREE.CylinderGeometry(0.55, 0.55, 0.05, 20), geoA = new THREE.TorusGeometry(0.58, 0.06, 6, 24).rotateX(Math.PI / 2);
  for (const b of BUEIROS) {
    const y = alturaChao(b.x, b.z) + 0.03;
    const t = new THREE.Mesh(geoT, tampa); t.position.set(b.x, y, b.z); t.receiveShadow = true; scene.add(t);
    const a = new THREE.Mesh(geoA, aro); a.position.set(b.x, y + 0.02, b.z); scene.add(a);
  }
}
const lixeiro = () => !!jogador.perfil?.lixeiro;
function bueiroPerto(r = 2.2) {
  if (jogador.carro || jogador.dentroCasa || jogador.trem) return null;
  return BUEIROS.find((b) => Math.hypot(b.x - jogador.pos.x, b.z - jogador.pos.z) < r) || null;
}
function contextoBueiro() {
  const b = bueiroPerto(); if (!b) return null;
  if (lixeiro()) return ['descer pelo bueiro (esgoto dos Lixeiros)', 'Bueiro'];
  if (conviteBueiro && conviteBueiro.ate > performance.now()) return ['descer pelo bueiro (um lixeiro abriu para você)', 'Bueiro'];
  return ['examinar o bueiro', 'Bueiro'];
}
async function acaoBueiro() {
  const b = bueiroPerto(); if (!b) return;
  if (lixeiro()) {
    const perto = [...remotos.entries()].filter(([, r]) => remotoAPe(r) && Math.hypot(r.av.raiz.position.x - b.x, r.av.raiz.position.z - b.z) < 5);
    if (!perto.length) { descerEsgoto(b); return; }
    escolher('🐀 Bueiro', 'Descer sozinho ou abrir a passagem para alguém (resgate e fuga pelo esgoto)?', [
      { rotulo: '⬇️ Descer', fn: () => descerEsgoto(b) },
      ...perto.map(([id, r]) => ({ rotulo: `🤝 Abrir para ${esc(r.meta?.nome || 'jogador')}${r.meta?.crimes > 0 ? ' (procurado)' : ''}`, fn: () => {
        conexao?.enviar('bueiro', { tipo: 'convite', de: jogador.perfil.id, para: id }); meusConvidados.set(id, { b: b.k, t: performance.now() });
        aviso(`Passagem aberta para ${r.meta?.nome || 'o jogador'} por 1 minuto. Leve-o pelo esgoto e saia longe daqui (+800 se for procurado).`, 4.5);
      } }))]);
    return;
  }
  if (conviteBueiro && conviteBueiro.ate > performance.now()) { descerEsgoto(b, true); return; }
  try {
    if (!(await rede.lixeiros.secreto(b.k))) { aviso('A tampa está emperrada. Sai um cheiro horrível lá de baixo.', 3); return; }
    escolher('🐀 Uma passagem…', 'A tampa cede. Lá embaixo, alguém sussurra: "Quer entrar para os Lixeiros? A entrada custa 5.000. Ninguém lá em cima pode saber."', [
      { rotulo: '💰 Pagar 5.000 e entrar para a sociedade', fn: async () => { try { await rede.lixeiros.entrar(b.k); jogador.perfil.lixeiro = true; aviso('🐀 Bem-vindo aos Lixeiros. Use qualquer bueiro da cidade.', 4); descerEsgoto(b); } catch (e) { aviso(e.message, 3); } } },
      { rotulo: 'Ir embora', fn: () => {} }]);
  } catch (e) { aviso(e.message, 3); }
}
function receberBueiro(m) {
  if (!jogador.perfil) return;
  if (m.tipo === 'convite' && m.para === jogador.perfil.id) { conviteBueiro = { de: m.de, ate: performance.now() + 60000 }; aviso(`🐀 ${remotos.get(m.de)?.meta?.nome || 'Alguém'} abriu um bueiro para você. Desça por ele (1 min).`, 4); }
  if (m.tipo === 'saiu' && m.para === jogador.perfil.id && meusConvidados.has(m.de)) {
    meusConvidados.delete(m.de);
    if (m.longe && m.procurado) rede.lixeiros.resgate(m.de).then((v) => aviso(`🐀 Resgate concluído: +${v}.`, 3)).catch(() => {});
  }
}
// ---------------------------------------------------------------- o esgoto por dentro
const LIXO = [[-14, 3], [-6, -3], [4, 3.2], [12, -3], [17, 3], [-17, -3]];
let lixoColetado = new Map();
function salaEsgoto() {
  return montarSala('esgoto', 3000, 800, 40, 16, { piso: '#3d4237', parede: '#5a5f50', luz: '#b9f0a0' }, (i) => {
    const { caixa, placa, g } = i;
    // canal de água no meio
    const agua = new THREE.Mesh(new THREE.PlaneGeometry(38, 2.4), new THREE.MeshStandardMaterial({ color: '#4c5a2e', roughness: 0.15, metalness: 0.3 }));
    agua.rotation.x = -Math.PI / 2; agua.position.set(0, 0.02, 0); g.add(agua);
    for (let x = -18; x <= 18; x += 6) { caixa(0.4, 3.2, 0.4, '#4a4e44', x, 1.6, -7.6); caixa(0.5, 0.5, 15.5, '#6b5a3a', x, 3.4, 0, 0.3); }
    caixa(38, 0.35, 0.35, '#7a6a48', 0, 2.6, -7.4, 0.4); caixa(0.35, 0.35, 15, '#7a6a48', -19.6, 2.3, 0, 0.4);
    // escada de saída
    caixa(1.2, 3.4, 0.2, '#555', 18.8, 1.7, 7.2, 0.6); placa('Escada: sair por um bueiro', 18.8, 6.4, 3);
    // sala de reuniões
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.1, 20), i.mat('#5a4630')); mesa.position.set(-14, 0.85, -4.5); g.add(mesa);
    caixa(0.3, 0.85, 0.3, '#3b2a1a', -14, 0.42, -4.5); i.obst.push([-15.7, -12.3, -6.2, -2.8]);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; caixa(0.5, 0.5, 0.5, '#2f2a24', -14 + Math.cos(a) * 2.3, 0.25, -4.5 + Math.sin(a) * 2.3); }
    i.pontos.reuniao = { x: i.base.x - 14, z: i.base.z - 2.2 }; placa('Sala de reuniões', -14, -4.5, 2.4);
    // quadro de missões
    caixa(3, 1.8, 0.1, '#2b2416', -4, 2, -7.6); movel(i, 'quadro', -4, -7.3, 3, 0.4); placa('Quadro de missões', -4, -7.3, 3.2);
    // casas subterrâneas: 8 portas na parede do fundo (lado direito)
    for (let k = 0; k < 8; k++) {
      const x = 0.5 + k * 2.2;
      caixa(1.2, 2.2, 0.15, '#4b3a28', x, 1.1, -7.6); placa(`Casa ${k + 1}`, x, -7.3, 2.6);
      i.pontos['casa' + (k + 1)] = { x: i.base.x + x, z: i.base.z - 6.6 };
    }
    // montes de lixo para coletar
    i.lixo = LIXO.map(([x, z]) => { const m = caixa(1.2, 0.6, 1.0, '#3e3a2a', x, 0.3, z); return { m, x: i.base.x + x, z: i.base.z + z }; });
  });
}
function descerEsgoto(b, convidado = false) {
  const i = salaEsgoto();
  entradaEsgoto = { b: b.k, convidado, de: conviteBueiro?.de || null };
  if (convidado) conviteBueiro = null;
  entrarSala('esgoto', { x: b.x + 1.2, z: b.z }, i.pontos.porta.x - 1, i.pontos.porta.z - 1);
  refugioAte = performance.now() + 120000; tempoInsalubre = 60;
  rede.lixeiros.casas().then((l) => { casasEsgoto = l || []; }).catch(() => {});
  aviso(lixeiro() ? '🐀 Esgoto. Aqui você ganha adicional de insalubridade a cada minuto. A polícia não entra.' : '🐀 Você está no esgoto, escondido da polícia. Siga o lixeiro e saia pela escada por outro bueiro.', 4);
}
function sairDoEsgoto(b) {
  jogador.saidaSala = { x: b.x + 1.2, z: b.z };
  const e = entradaEsgoto; entradaEsgoto = null;
  sairSala();
  refugioAte = performance.now() + 60000;
  const longe = e && Math.hypot(BUEIROS[e.b].x - b.x, BUEIROS[e.b].z - b.z) > 150;
  if (e?.convidado && e.de) conexao?.enviar('bueiro', { tipo: 'saiu', de: jogador.perfil.id, para: e.de, longe, procurado: (jogador.perfil?.crimes || 0) > 0 });
  // contrabando: entrega se este for o bueiro sorteado
  const m = jogador.perfil?.lixeiro_missao;
  if (lixeiro() && m && Number(m.destino) === b.k) {
    const visto = npcs.some((n) => n.policia && Math.hypot(n.av.raiz.position.x - b.x, n.av.raiz.position.z - b.z) < 25)
      || [...remotos.values()].some((r) => (r.meta?.policial || r.meta?.prf) && r.alvo && Math.hypot(r.alvo.x - b.x, r.alvo.z - b.z) < 25);
    rede.lixeiros.entregar(b.k, visto).then((v) => { jogador.perfil.lixeiro_missao = null; rastrear(null); aviso(v > 0 ? `📦 Pacote entregue sem ninguém ver: +${v}!` : '🚨 A polícia viu! Você perdeu o pacote e virou procurado.', 4); }).catch((er) => aviso(er.message, 3));
  }
}
function escolherSaida() {
  escolher('🪜 Sair por qual bueiro?', 'O esgoto liga todos os bueiros da cidade.', BUEIROS.map((b) => ({ rotulo: `${b.nome}${Number(jogador.perfil?.lixeiro_missao?.destino) === b.k ? ' 📦 (entrega)' : ''}`, fn: () => sairDoEsgoto(b) })));
}
function casaEsgotoAqui() {
  for (let k = 1; k <= 8; k++) if (pontoInterior('casa' + k, 1.3)) return k;
  return 0;
}
SALAS.esgoto = {
  contexto: () => {
    if (naPorta()) return ['subir pela escada (escolher o bueiro)', 'Sair'];
    if (pontoInterior('quadro', 1.8)) return [lixeiro() ? 'quadro de missões: contrabando e informações' : 'quadro de missões (só Lixeiros)', 'Missões'];
    if (pontoInterior('reuniao', 2.6)) return ['sala de reuniões (use o chat de voz: quem está perto)', 'Reunião'];
    const k = casaEsgotoAqui();
    if (k) { const c = casasEsgoto.find((x) => x.id === k); return [c?.dono === jogador.perfil.id ? `entrar na sua casa (nº ${k})` : c?.dono ? `casa nº ${k} de ${c.dono_perfil?.nome || '?'}` : lixeiro() ? `comprar a casa nº ${k} (8.000)` : `casa nº ${k} (só Lixeiros)`, 'Casa']; }
    const l = lixoPerto(); if (l && lixeiro()) return ['coletar o lixo (+120)', 'Coletar'];
    return ['', ''];
  },
  acao: () => {
    if (naPorta()) { escolherSaida(); return; }
    if (pontoInterior('quadro', 1.8)) { if (lixeiro()) quadroMissoes(); else aviso('Só membros da sociedade.'); return; }
    if (pontoInterior('reuniao', 2.6)) { aviso('🐀 Sala de reuniões. Ligue a voz (☰ › Voz: quem está perto) para conversar com os outros.', 3.5); return; }
    const k = casaEsgotoAqui(); if (k) { acaoCasaEsgoto(k); return; }
    const l = lixoPerto(); if (l && lixeiro()) coletarLixo(l);
  },
  sair: () => { tempoInsalubre = 60; },
};
function lixoPerto() {
  const i = interiores.get('esgoto'); if (!i?.lixo) return null;
  return i.lixo.find((l) => l.m.visible && Math.hypot(l.x - jogador.pos.x, l.z - jogador.pos.z) < 1.8) || null;
}
async function coletarLixo(l) {
  jogador.trava = 2; jogador.alvo = null; jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 1, fade: 0.1 });
  try { const v = await rede.lixeiros.coletar(); l.m.visible = false; lixoColetado.set(l, performance.now() + 90000); aviso(`🗑️ Lixo recolhido: +${v}.`); }
  catch (e) { aviso(e.message, 2.5); }
}
async function acaoCasaEsgoto(k) {
  const c = casasEsgoto.find((x) => x.id === k);
  if (c?.dono === jogador.perfil.id) {
    escolher(`🏠 Sua casa nº ${k}`, 'Casa subterrânea (não evolui).', [
      { rotulo: '🛏️ Descansar (vida cheia)', fn: () => descansar() },
      { rotulo: '💸 Vender (recebe 4.000)', fn: async () => { try { await rede.lixeiros.venderCasa(); casasEsgoto = await rede.lixeiros.casas(); aviso('Casa vendida.'); } catch (e) { aviso(e.message, 3); } } }]);
    return;
  }
  if (c?.dono) { aviso('Essa casa já tem dono.'); return; }
  if (!lixeiro()) { aviso('Só Lixeiros moram aqui.'); return; }
  escolher(`🏠 Casa nº ${k}`, 'Casa subterrânea por 8.000 (mais barata, mas não evolui). Uma por jogador.', [
    { rotulo: '💰 Comprar por 8.000', fn: async () => { try { await rede.lixeiros.comprarCasa(k); casasEsgoto = await rede.lixeiros.casas(); aviso(`🏠 A casa nº ${k} é sua!`, 3); } catch (e) { aviso(e.message, 3); } } },
    { rotulo: 'Agora não', fn: () => {} }]);
}
function quadroMissoes() {
  const m = jogador.perfil?.lixeiro_missao, ativa = m && Date.parse(m.ate) > agoraServidor();
  escolher('🐀 Quadro de missões', 'Trabalhos da sociedade. Limpeza: os montes de lixo do esgoto (+120 cada).', [
    { rotulo: ativa ? `📦 Contrabando em andamento: saia pelo ${BUEIROS[m.destino]?.nome}` : '📦 Contrabando: levar um pacote até um bueiro (+1.500)', fn: async () => {
      try {
        const d = await rede.lixeiros.contrabando();
        jogador.perfil.lixeiro_missao = { destino: d, ate: new Date(agoraServidor() + 600000).toISOString() };
        rastrear({ nome: `📦 ${BUEIROS[d].nome}`, x: BUEIROS[d].x, z: BUEIROS[d].z });
        aviso(`📦 Pacote com você. Saia pela escada no ${BUEIROS[d].nome} em até 10 min. Se a polícia estiver a menos de 25 m quando você sair, perde o pacote e vira procurado.`, 6);
      } catch (e) { aviso(e.message, 3); }
    } },
    { rotulo: '👂 Ouvir os túneis (informações secretas)', fn: () => informacoesTuneis() },
    { rotulo: '🚪 Sair da sociedade', fn: () => escolher('Sair dos Lixeiros?', 'Você perde o acesso aos bueiros e a casa do esgoto. Para voltar, terá que pagar de novo.', [
      { rotulo: 'Sim, sair', fn: async () => { try { await rede.lixeiros.sair(); jogador.perfil.lixeiro = false; aviso('Você saiu dos Lixeiros.'); } catch (e) { aviso(e.message, 3); } } }, { rotulo: 'Ficar', fn: () => {} }]) },
  ]);
}
async function informacoesTuneis() {
  let d; try { d = await rede.lixeiros.informacoes(); } catch (e) { aviso(e.message, 3); return; }
  const a = d.assalto;
  const ops = (d.procurados || []).map((p) => ({ rotulo: `🚨 ${esc(p.nome)} · ${p.crimes} crimes · visto em x ${Math.round(p.x)}, z ${Math.round(p.z)} — denunciar à polícia (+400)`, fn: async () => {
    try { const v = await rede.lixeiros.denunciar(p.id); aviso(`🐀 Denúncia anônima enviada aos policiais: +${v}.`, 3); } catch (e) { aviso(e.message, 3); }
  } }));
  escolher('👂 O que se ouve nos túneis', `${a ? `🚢 O clã <b>${esc(a.cla_nome)}</b> está assaltando o cargueiro no Porto Sul.<br>` : 'Nenhum assalto ao cargueiro agora.<br>'}${ops.length ? 'Procurados vistos nos últimos 10 minutos (toque para denunciar):' : 'Nenhum procurado à vista.'}`, ops.length ? ops : [{ rotulo: 'Ok', fn: () => {} }]);
}
function atualizarEsgoto(dt) {
  for (const [l, t] of lixoColetado) if (performance.now() > t) { l.m.visible = true; lixoColetado.delete(l); }
  if (jogador.dentroCasa !== 'esgoto') return;
  refugioAte = Math.max(refugioAte, performance.now() + 60000);
  if (!lixeiro()) return;
  tempoInsalubre -= dt;
  if (tempoInsalubre <= 0) { tempoInsalubre = 60; rede.lixeiros.insalubridade().then((v) => { if (v > 0) aviso(`☣️ Adicional de insalubridade: +${v}.`, 2); }).catch(() => {}); }
}

// ================================================================= interiores públicos: prefeitura, bombeiros, delegacia e PRF
// Polícia e PRF têm estande de tiro interno (alvos a 8, 15 e 22 m), só para quem é da corporação.
function estandeInterno(i, quem, x0, z0) {
  const { caixa, placa, g } = i, t = civico.alvoTextura();
  caixa(0.3, 1.1, 7, '#6b5a3a', x0, 0.55, z0); i.obst.push([x0 - 0.2, x0 + 0.2, z0 - 3.5, z0 + 3.5]);   // bancada (linha de tiro)
  [8, 15, 22].forEach((d, k) => {
    const z = z0 - 2.3 + k * 2.3, x = x0 + d;
    caixa(d, 0.02, 0.05, '#e8e8e8', x0 + d / 2, 0.02, z - 1.15);
    caixa(0.12, 1.2, 0.12, '#222', x + 0.1, 0.6, z);
    const disco = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
    disco.position.set(x, 1.65, z); disco.rotation.y = -Math.PI / 2; g.add(disco);
    placa(`${d} m`, x, z, 2.6);
    civico.EXERCITO.alvos.push({ x: i.base.x + x, y: 1.65, z: i.base.z + z, d, raio: 0.6, disco, quem });
  });
  caixa(0.6, 3.4, 8, '#5c5246', x0 + 23.6, 1.7, z0);
  placa('🎯 Estande de tiro', x0 + 1, z0, 3.2);
  i.pontos.estande = { x: i.base.x + x0 - 1, z: i.base.z + z0 };
}
const daPolicia = () => !!(jogador.perfil?.policial || jogador.perfil?.prf || jogador.perfil?.cargo === 'admin');
function quadroProcurados() {
  rede.procuradosTodos().then((l) => {
    const lista = (l || []).filter((p) => p.crimes > 0 && !(p.pena_seg > 0)).slice(0, 15);
    escolher('🚨 Procurados', lista.length ? 'Os mais procurados da cidade agora:' : 'Ninguém procurado agora.', lista.length ? lista.map((p) => ({ rotulo: `${esc(p.nome)} · ${p.crimes} crimes${p.recompensa ? ` · recompensa ${num(p.recompensa)}` : ''}`, fn: () => {} })) : [{ rotulo: 'Ok', fn: () => {} }]);
  }).catch((e) => aviso(e.message, 3));
}
function salaDelegacia(chave, bz, titulo, cor) {
  return montarSala(chave, 3000, bz, 36, 14, { piso: '#5d6168', parede: '#d7dbe0' }, (i) => {
    const { caixa, placa } = i;
    caixa(36, 0.4, 0.32, cor, 0, 3.2, -6.8);
    // balcão de atendimento e quadro
    caixa(3.6, 1.1, 1, '#4a4f58', 12, 0.55, 1.5); movel(i, 'balcao', 12, 1.5, 3.6, 1, [0, 1]); placa(titulo, 12, 1.5, 2.4);
    caixa(3, 1.8, 0.1, '#20262e', 12, 2, -6.7); movel(i, 'quadro', 12, -6.5, 3, 0.4); placa('Quadro de procurados', 12, -6.5, 3.2);
    // celas (visual)
    for (const z of [-4, 0.5]) { for (let k = 0; k < 6; k++) caixa(0.08, 2.6, 0.08, '#777', 15.6, 1.3, z - 1.4 + k * 0.56, 0.7); caixa(2, 0.5, 1, '#5a5a5a', 17, 0.25, z); }
    placa('Celas', 17, -1.8, 3);
    estandeInterno(i, chave, -14, -2);
  });
}
function salaBombeiros() {
  return montarSala('bombeiros', 3000, 1300, 22, 14, { piso: '#6a5f57', parede: '#e4d6c8' }, (i) => {
    const { caixa, placa, g } = i;
    caixa(22, 0.4, 0.32, '#c0392b', 0, 3.2, -6.8);
    caixa(3.4, 1.1, 1, '#7a2e26', 5, 0.55, 1.5); movel(i, 'balcao', 5, 1.5, 3.4, 1); placa('Balcão dos bombeiros', 5, 1.5, 2.4);
    caixa(3, 1.8, 0.1, '#20262e', -2, 2, -6.7); movel(i, 'quadro', -2, -6.5, 3, 0.4); placa('Incêndios na cidade', -2, -6.5, 3.2);
    for (let k = 0; k < 5; k++) { caixa(0.6, 1.8, 0.5, '#b03a2e', -9 + k * 0.8, 0.9, -6.3); caixa(0.45, 0.45, 0.3, '#f1c40f', -9 + k * 0.8, 1.9, -6.2); }   // armários com capacetes
    i.obst.push([-9.4, -5.4, -6.7, -5.9]); placa('Vestiário', -7.4, -6, 2.8);
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 10), i.mat('#cfcfcf', 0.3, 0.9)); poste.position.set(-6, 1.8, 3); g.add(poste);
    i.pontos.poste = { x: i.base.x - 6, z: i.base.z + 3.8 }; placa('Mastro (descida rápida)', -6, 3, 3.1);
    caixa(2.2, 0.6, 1, '#e8ecef', 7, 0.3, -4); movel(i, 'maca', 7, -4, 2.2, 1); placa('Enfermaria', 7, -4, 1.8);
  });
}
function salaPrefeitura() {
  return montarSala('prefeitura', 3000, 1600, 26, 14, { piso: '#7b6a55', parede: '#efe6d6', luz: '#fff2dc' }, (i) => {
    const { caixa, placa } = i;
    const tapete = new THREE.Mesh(new THREE.PlaneGeometry(3, 12), i.mat('#7a1e2b', 1)); tapete.rotation.x = -Math.PI / 2; tapete.position.set(0, 0.01, 0); i.g.add(tapete);
    caixa(3.4, 0.9, 1.4, '#5a3f28', 0, 0.45, -5); movel(i, 'gabinete', 0, -5, 3.4, 1.4); placa('Gabinete do prefeito', 0, -5, 2.4);
    for (const sx of [-1.8, 1.8]) { caixa(0.08, 2.8, 0.08, '#c9a227', sx, 1.4, -6.6, 0.8); caixa(0.9, 0.6, 0.02, sx < 0 ? '#2a7a3a' : '#2b4fa8', sx + 0.5, 2.5, -6.6); }
    caixa(1, 1.2, 0.8, '#3b4d6b', -8, 0.6, -2); movel(i, 'urna', -8, -2, 1, 0.8); placa('Urna: eleição', -8, -2, 2.2);
    caixa(3, 1.6, 0.1, '#20262e', 8, 1.8, -6.7); movel(i, 'outdoors', 8, -6.5, 3, 0.4); placa('Outdoors da cidade', 8, -6.5, 3);
    caixa(2.4, 0.9, 1, '#4a4f58', -8, 0.45, 3.5); movel(i, 'imprensa', -8, 3.5, 2.4, 1); placa('Sala de imprensa → Redação', -8, 3.5, 2);
  });
}
function entrarPublico(chave, sala, saida, texto) {
  const i = sala();
  entrarSala(chave, { x: saida.x + 1.6, z: saida.z + 1.6 }, i.pontos.porta.x - 1, i.pontos.porta.z - 1);
  aviso(texto, 3.5);
}
const servicoPolicia = () => (jogador.perfil?.policial ? 'sair do serviço policial' : 'entrar em serviço na polícia');
SALAS.delegacia = {
  contexto: () => {
    if (naPorta()) return ['sair da delegacia', 'Sair'];
    if (pontoInterior('balcao', 1.8)) return [servicoPolicia(), 'Polícia'];
    if (pontoInterior('quadro', 1.8)) return ['quadro de procurados', 'Ver'];
    if (pontoInterior('estande', 2.2)) return [daPolicia() ? 'estande de tiro: saque a arma e mire nos alvos' : 'estande de tiro (só policiais)', 'Estande'];
    return ['', ''];
  },
  acao: () => {
    if (naPorta()) { sairSala(); return; }
    if (pontoInterior('balcao', 1.8)) { alternarServico(); return; }
    if (pontoInterior('quadro', 1.8)) { quadroProcurados(); return; }
    if (pontoInterior('estande', 2.2)) aviso(daPolicia() ? '🎯 Saque a arma (Arma) e atire nos alvos: a mira compensa a distância.' : 'Só policiais usam o estande.', 3);
  },
};
SALAS.prf = {
  contexto: () => {
    if (naPorta()) return ['sair do posto da PRF', 'Sair'];
    if (pontoInterior('balcao', 1.8)) return ['posto da PRF: serviço e investigações', 'PRF'];
    if (pontoInterior('quadro', 1.8)) return ['quadro de procurados', 'Ver'];
    if (pontoInterior('estande', 2.2)) return [daPolicia() ? 'estande de tiro: saque a arma e mire nos alvos' : 'estande de tiro (só agentes)', 'Estande'];
    return ['', ''];
  },
  acao: () => {
    if (naPorta()) { sairSala(); return; }
    if (pontoInterior('balcao', 1.8)) { abrirPrefeitura('prf'); return; }
    if (pontoInterior('quadro', 1.8)) { quadroProcurados(); return; }
    if (pontoInterior('estande', 2.2)) aviso(daPolicia() ? '🎯 Saque a arma (Arma) e atire nos alvos: a mira compensa a distância.' : 'Só agentes usam o estande.', 3);
  },
};
SALAS.bombeiros = {
  contexto: () => {
    if (naPorta()) return ['sair do quartel dos bombeiros', 'Sair'];
    if (pontoInterior('balcao', 1.8)) return ['balcão: serviço dos bombeiros', 'Bombeiros'];
    if (pontoInterior('quadro', 1.8)) return [`incêndios na cidade (${servicos.listaIncendios().length})`, 'Ver'];
    if (pontoInterior('poste', 1.4)) return ['descer pelo mastro e sair para a rua', 'Descer'];
    if (pontoInterior('maca', 2)) return ['enfermaria: curar a vida', 'Curar'];
    return ['', ''];
  },
  acao: () => {
    if (naPorta() || pontoInterior('poste', 1.4)) { sairSala(); return; }
    if (pontoInterior('balcao', 1.8)) { abrirServico('bombeiros'); return; }
    if (pontoInterior('quadro', 1.8)) {
      const l = servicos.listaIncendios();
      escolher('🔥 Incêndios', l.length ? 'Toque para marcar no mapa:' : 'Nenhum incêndio agora.', l.length ? l.map((f, k) => ({ rotulo: `🔥 Incêndio ${k + 1}`, fn: () => rastrear({ nome: '🔥 Incêndio', x: f.x, z: f.z }) })) : [{ rotulo: 'Ok', fn: () => {} }]);
      return;
    }
    if (pontoInterior('maca', 2)) { jogador.vida = 100; desenharFome(); aviso('✚ Vida recuperada!'); }
  },
};
SALAS.prefeitura = {
  contexto: () => {
    if (naPorta()) return ['sair da prefeitura', 'Sair'];
    if (pontoInterior('gabinete', 1.8)) return ['gabinete do prefeito: governo e cofre', 'Gabinete'];
    if (pontoInterior('urna', 1.6)) return ['urna: candidatos e votação', 'Votar'];
    if (pontoInterior('outdoors', 1.8)) return ['outdoors da cidade: alugar propaganda', 'Outdoors'];
    if (pontoInterior('imprensa', 1.8)) return ['sala de imprensa: ir para a redação do jornal', 'Redação'];
    return ['', ''];
  },
  acao: () => {
    if (naPorta()) { sairSala(); return; }
    if (pontoInterior('gabinete', 1.8)) { abrirPrefeitura('prefeito'); return; }
    if (pontoInterior('urna', 1.6)) { abrirPrefeitura('eleicao'); return; }
    if (pontoInterior('outdoors', 1.8)) { abrirPrefeitura('outdoors'); return; }
    if (pontoInterior('imprensa', 1.8)) { const s = jogador.saidaSala; jogador.dentroCasa = null; entrarRedacao(); if (s) jogador.saidaSala = s; }
  },
};

// ================================================================= interior das empresas (dono e funcionários)
// Entra-se pelo portão. O interior cresce com o nível (fases 5, 10 e 15): mais prateleiras, sala de reuniões,
// linha de produção, escritório envidraçado e sala VIP. Funções: mesa do dono (painel da empresa),
// relógio de ponto (salário), estoque, copa (mata a fome) e, na sede, sala VIP (cura).
let cafeAte = 0, esteiras = [];
function empresaDoPortao() {
  if (jogador.carro || jogador.dentroCasa) return null;
  for (const e of empresas.values()) {
    if (e.dono !== jogador.perfil?.id && emprego !== e.id) continue;
    const p = portaoDaEmpresa(e.id);
    if (p && Math.hypot(p.x - jogador.pos.x, p.z - jogador.pos.z) < 2.4) return e;
  }
  return null;
}
function salaEmpresa(e) {
  const chave = 'empresa:' + e.id, f = sedes.fase(e.nivel || 1), velha = interiores.get(chave);
  if (velha && velha.fase !== f) { scene.remove(velha.g); interiores.delete(chave); esteiras = esteiras.filter((x) => x.g !== velha.g); }
  const w = [16, 20, 26, 30][f], d = [12, 12, 14, 16][f];
  const i = montarSala(chave, 4500 + (e.id % 25) * 70, 2000 + Math.floor(e.id / 25) * 70, w, d, { piso: ['#6b6b6b', '#5f6670', '#596574', '#4f5a68'][f], parede: ['#cfc6b6', '#d6d9de', '#e2e6ea', '#eef1f4'][f] }, (s) => {
    const { caixa, placa } = s, x0 = -w / 2;
    s.fase = f;
    caixa(w, 0.4, 0.32, '#3d6fb0', 0, 3.2, -d / 2 + 0.2);
    placa(`${e.nome} · nível ${e.nivel}`, 0, -d / 2 + 0.5, 3.4);
    // mesa do dono
    caixa(2.6, 0.85, 1.2, f >= 2 ? '#2b2f36' : '#6b4f35', x0 + 3, 0.42, -d / 2 + 2.2); movel(s, 'mesa', x0 + 3, -d / 2 + 2.2, 2.6, 1.2); placa('Mesa do dono', x0 + 3, -d / 2 + 2.2, 2);
    if (f >= 2) { caixa(0.08, 2.6, 4, '#9cc3dc', x0 + 5.2, 1.3, -d / 2 + 2, 0.3); caixa(5.2, 2.6, 0.08, '#9cc3dc', x0 + 2.6, 1.3, -d / 2 + 4, 0.3); s.obst.push([x0 + 5.1, x0 + 5.3, -d / 2, -d / 2 + 4]); }
    // relógio de ponto
    caixa(0.6, 0.9, 0.3, '#444', 2, 1.3, -d / 2 + 0.3); movel(s, 'ponto', 2, -d / 2 + 0.35, 0.6, 0.3); placa('Relógio de ponto', 2, -d / 2 + 0.6, 2.4);
    // estoque: prateleiras com caixas (quantidade real do estoque, até 24)
    const prat = 1 + f;
    for (let k = 0; k < prat; k++) { const x = w / 2 - 1.2 - k * 1.6; caixa(1.2, 2.4, 0.5, '#7a7f87', x, 1.2, -d / 2 + 0.6, 0.4); }
    const n = Math.min(24, e.estoque || 0);
    for (let k = 0; k < n; k++) caixa(0.4, 0.35, 0.35, '#b98a4e', w / 2 - 1.5 - Math.floor(k / 6) * 1.6 + (k % 2) * 0.5, 0.45 + Math.floor((k % 6) / 2) * 0.7, -d / 2 + 0.6);
    movel(s, 'estoque', w / 2 - 1.2 - (prat - 1) * 0.8, -d / 2 + 0.6, prat * 1.6, 0.6); placa(`Estoque: ${e.estoque || 0}`, w / 2 - 1.2 - (prat - 1) * 0.8, -d / 2 + 0.8, 3);
    // copa
    caixa(1.6, 0.9, 0.7, '#8a5a35', x0 + 1.4, 0.45, d / 2 - 2.5); caixa(0.3, 0.4, 0.3, '#222', x0 + 1, 1.1, d / 2 - 2.5); movel(s, 'copa', x0 + 1.4, d / 2 - 2.5, 1.6, 0.7, [1, 0]); placa('Copa (café)', x0 + 1.4, d / 2 - 2.5, 2);
    if (f >= 1) {   // sala de reuniões
      caixa(3, 0.08, 1.4, '#5a3f28', -1, 0.8, 1); for (const sx of [-1.3, 1.3]) caixa(0.1, 0.8, 1.2, '#3b2a1a', -1 + sx, 0.4, 1);
      s.obst.push([-2.6, 0.6, 0.2, 1.8]); placa('Sala de reuniões', -1, 1, 1.8);
    }
    if (f >= 2) {   // linha de produção (esteira que anda)
      const esteira = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 1.2), s.mat('#2a2d33', 0.6, 0.4)); esteira.position.set(4, 0.3, d / 2 - 3); s.g.add(esteira);
      s.obst.push([0, 8, d / 2 - 3.7, d / 2 - 2.3]);
      for (let k = 0; k < 6; k++) { const c = caixa(0.5, 0.4, 0.5, '#b98a4e', k * 1.3 + 0.5, 0.8, d / 2 - 3); esteiras.push({ m: c, g: s.g, x0: 0.5, x1: 7.6 }); }
      placa('Linha de produção', 4, d / 2 - 3, 2);
    }
    if (f >= 3) {   // sala VIP da sede
      caixa(3, 0.5, 1, '#6b2b3a', x0 + 3, 0.25, 0); caixa(3, 0.7, 0.3, '#6b2b3a', x0 + 3, 0.6, -0.5); movel(s, 'vip', x0 + 3, 0, 3, 1);
      caixa(0.5, 1, 0.5, '#c9a227', x0 + 6, 0.5, 0, 0.8); placa('Sala VIP', x0 + 3, 0, 2);
    }
  });
  i.empresa = e.id;
  return i;
}
function entrarEmpresa(e) {
  const i = salaEmpresa(e), p = portaoDaEmpresa(e.id);
  entrarSala('empresa:' + e.id, { x: p.x, z: p.z + 1.5 }, i.pontos.porta.x - 1, i.pontos.porta.z - 1);
  aviso(`🏢 ${e.nome}. ${e.dono === jogador.perfil.id ? 'Mesa do dono: painel da empresa.' : 'Relógio de ponto: bata o ponto e receba o salário.'} Copa: café para a fome.`, 4);
}
const empresaAtual = () => empresas.get(Number(String(jogador.dentroCasa).split(':')[1]));
SALAS.empresa = {
  contexto: () => {
    const e = empresaAtual(); if (!e) return ['', ''];
    if (naPorta()) return ['sair da empresa', 'Sair'];
    if (pontoInterior('mesa', 1.8)) return [e.dono === jogador.perfil.id ? 'mesa do dono: painel da empresa' : 'mesa do dono (só o dono)', 'Painel'];
    if (pontoInterior('ponto', 1.6)) return ['bater o ponto (salário por minuto)', 'Ponto'];
    if (pontoInterior('estoque', 2.4)) return [`estoque: ${e.estoque || 0} caixas`, 'Estoque'];
    if (pontoInterior('copa', 1.8)) return ['tomar um café (mata a fome)', 'Café'];
    if (pontoInterior('vip', 2)) return ['sala VIP: descansar (vida cheia)', 'Descansar'];
    return ['', ''];
  },
  acao: () => {
    const e = empresaAtual(); if (!e) { sairSala(); return; }
    if (naPorta()) { sairSala(); return; }
    if (pontoInterior('mesa', 1.8)) { if (e.dono === jogador.perfil.id) $('btEmpresa').click(); else aviso('Só o dono usa a mesa.'); return; }
    if (pontoInterior('ponto', 1.6)) {
      const p = portaoDaEmpresa(e.id);
      rede.empregos.ponto(p.x, p.z).then((r) => aviso(r.pago > 0 || r.caixas > 0 ? `⏱️ Ponto batido: +${r.pago}${r.caixas ? ' · +1 caixa produzida' : ''}` : '⏱️ Ponto já batido neste minuto.', 2.5)).catch((er) => aviso(er.message, 3));
      return;
    }
    if (pontoInterior('estoque', 2.4)) { aviso(`📦 Estoque da ${e.nome}: ${e.estoque || 0} caixas.`, 2.5); return; }
    if (pontoInterior('copa', 1.8)) {
      if (performance.now() < cafeAte) { aviso('Você acabou de tomar café. Volte daqui a pouco.'); return; }
      cafeAte = performance.now() + 300000; jogador.fome = Math.min(100, jogador.fome + 30); desenharFome(); aviso('☕ Café tomado: +30 de fome.'); return;
    }
    if (pontoInterior('vip', 2)) descansar();
  },
};
function atualizarEsteiras(dt) {
  if (!String(jogador.dentroCasa).startsWith('empresa:')) return;
  for (const c of esteiras) { c.m.position.x += dt * 1.2; if (c.m.position.x > c.x1) c.m.position.x = c.x0; }
}
