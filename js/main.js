import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FERRO_VELHOS, FABRICAS, PRODUTOS, FOME_POR_SEGUNDO, LOTES_VENDA, DESTINOS } from './config.js';
import { iniciarCla, atualizarCla } from './cla.js';
import { iniciarEmpresa, abrirCompra, abrirMissoes, atualizar as atualizarJanelaEmpresa } from './empresa.js';
import { iniciarLoja, abrir as abrirJanela, recarregarInventario, qtdItem } from './loja.js';
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
import * as ceu from './ceu.js';
import * as semaforos from './semaforos.js';
import * as eixos from './eixos.js';
import * as racoes from './racoes.js';
import { pecasCabine } from './cabine.js';
import * as ovni from './ovni.js';
import * as jato from './jato.js';
import { JATOS } from './jato.js';
import * as jornal from './jornal.js';
import * as visual from './visual.js';
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
  // esqueci minha senha: manda o link; a resposta é a mesma para qualquer e-mail (não revela quem tem conta)
  $('btEsqueci').onclick = async () => {
    const email = $('email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { msgLogin('Digite o e-mail da sua conta no campo de cima e toque de novo em "Esqueci minha senha".'); $('email').focus(); return; }
    let ult = 0; try { ult = Number(localStorage.getItem('fr_recup') || 0); } catch { /* sem armazenamento */ }
    if (Date.now() - ult < 60000) { msgLogin('Espere 1 minuto para pedir outro link.'); return; }
    $('btEsqueci').disabled = true; msgLogin('Enviando…', true);
    try { await rede.recuperarSenha(email); try { localStorage.setItem('fr_recup', String(Date.now())); } catch { /* ok */ } msgLogin('📧 Se esse e-mail tiver conta, o link para criar uma senha nova chegou. Veja também a caixa de spam.', true); }
    catch (e) { msgLogin(e.message); }
    finally { $('btEsqueci').disabled = false; }
  };
  $('btSalvarSenha').onclick = async () => {
    const a1 = $('novaSenha1').value, a2 = $('novaSenha2').value;
    if (a1.length < 6) { msgLogin('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if (a1 !== a2) { msgLogin('As duas senhas não são iguais.'); return; }
    $('btSalvarSenha').disabled = true; msgLogin('Salvando…', true);
    try {
      await rede.trocarSenha(a1); recuperando = false;
      history.replaceState(null, '', location.pathname);
      $('novaSenhaBox').classList.add('oculto'); for (const id of ['email', 'senha', 'btEsqueci']) $(id).classList.remove('oculto'); document.querySelector('#login .linha').classList.remove('oculto');
      msgLogin('✅ Senha trocada!', true);
      const s2 = await rede.sessaoAtual(); if (s2) await aposLogin(s2);
    } catch (e) { msgLogin(e.message); }
    finally { $('btSalvarSenha').disabled = false; }
  };
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
// voltando pelo link de "esqueci minha senha": mostra a tela de senha nova em vez de entrar direto
let recuperando = /type=recovery/.test(location.hash) || /[?&]recuperar=1/.test(location.search);
function telaNovaSenha() {
  recuperando = true; mostrar('login');
  for (const id of ['email', 'senha', 'btEsqueci']) $(id).classList.add('oculto'); document.querySelector('#login .linha').classList.add('oculto');
  $('novaSenhaBox').classList.remove('oculto'); msgLogin('Digite a senha nova duas vezes.', true);
}
rede.aoRecuperarSenha(() => telaNovaSenha());
if (recuperando) telaNovaSenha();
rede.sessaoAtual().then((s) => { if (s && !recuperando) aposLogin(s).catch((e) => { mostrar('login'); msgLogin(e.message); }); });

// ================================================================= MOTOR
const canvas = $('jogo');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !TOQUE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOQUE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;   // neutro: cores vivas, brancos sem estourar
renderer.toneMappingExposure = 0.95;
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
scene.fog = new THREE.Fog('#a9c8de', 200, 330);
visual.iniciar(renderer, scene, sol, TOQUE);
const SOL_DIR = new THREE.Vector3(-0.55, 1, 0.35).normalize();

// ---------------------------------------------------------------- dia e noite (igual para todos, pelo relógio do servidor)
const CICLO_DIA = 32 * 60;                   // um dia do jogo = 32 minutos (22 de dia, 10 de noite)
const HORA_FIXA = (location.search.match(/[?&]hora=(\d+(?:\.\d+)?)/) || [])[1];   // ?hora=22 para testar
const CEU = {
  dia: new THREE.Color('#a9c8de'), noite: new THREE.Color('#0d1730'), tarde: new THREE.Color('#e8a27a'),
  sol: new THREE.Color('#fff2dc'), solTarde: new THREE.Color('#ffae6a'), lua: new THREE.Color('#9fb4ff'),
  hemiDia: new THREE.Color('#dfeeff'), hemiNoite: new THREE.Color('#4a5f92'), chaoDia: new THREE.Color('#8a7457'), chaoNoite: new THREE.Color('#2a2833'),
};
let horaAtual = 12, noiteAtual = 0, molhadoAtual = 0;
const ajusteHora = { desloc: 0, fixa: null };   // ajuste do admin (config_jogo): adiantar o ciclo ou travar uma hora
function horaDoJogo(t) {
  if (HORA_FIXA !== undefined) return Number(HORA_FIXA) % 24;
  if (ajusteHora.fixa !== null && ajusteHora.fixa !== undefined) return Number(ajusteHora.fixa) % 24;
  const f = (((t + ajusteHora.desloc) / CICLO_DIA) % 1 + 1) % 1;
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
  sol.intensity = 0.3 + 2.2 * dia;
  hemi.intensity = 0.4 + 0.55 * dia;   // menos luz "chapada": sombras com mais volume
  hemi.color.copy(CEU.hemiNoite).lerp(CEU.hemiDia, dia);
  hemi.groundColor.copy(CEU.chaoNoite).lerp(CEU.chaoDia, dia);
  scene.environmentIntensity = 0.12 + 0.33 * dia + 0.35 * molhadoAtual;   // chão molhado reflete mais
  scene.background.copy(CEU.noite).lerp(CEU.dia, dia).lerp(CEU.tarde, tarde * 0.5);
  const noite = 1 - S(elev, -0.02, 0.3);
  mundo.definirNoite(noite);
  noiteAtual = noite;
  // neblina leve no fundo da cena (mesma cor do céu): dá profundidade e esconde o fim do mapa
  if (scene.fog) { scene.fog.color.copy(scene.background); scene.fog.near = 175 + (1 - molhadoAtual) * 25; scene.fog.far = 330 - molhadoAtual * 90; }
  for (const m of luzesCasas) m.emissiveIntensity = noite * 1.1;
  civico.brilhoOutdoors(noite);
}
// quantos segundos somar ao relógio para que agora seja a hora h (o ciclo continua dali)
function deslocParaHora(h) {
  h = ((h % 24) + 24) % 24;
  const f = h >= 6 && h < 18 ? (h - 6) / 12 * 0.7 : 0.7 + (((h - 18) + 24) % 24) / 12 * 0.3;
  const t = agoraServidor() / 1000, atual = ((t % CICLO_DIA) + CICLO_DIA) % CICLO_DIA;
  return Math.round(((f * CICLO_DIA - atual) % CICLO_DIA + CICLO_DIA) % CICLO_DIA);
}
function aplicarRelogio(c) { ajusteHora.desloc = Number(c?.hora_desloc) || 0; ajusteHora.fixa = c?.hora_fixa ?? null; }
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
// câmeras 3D (☰ › Câmera): "livre" gira em volta do personagem em perspectiva; "p1" é a visão em primeira pessoa
const camP = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.08, 700);
scene.add(camP);   // os filhos dela (painel do veículo) aparecem na frente da visão
let camAtiva = camera;
const olhar = { yaw: 0, pitch: -0.05, dist: 14, incl: 0.42, veic: 0, arrastou: 0 };
const modo3D = () => modoCam === 'livre' || modoCam === 'p1';
camera.layers.enable(1); sol.shadow.camera.layers.enable(1);   // camada 1 = o seu próprio personagem (some na primeira pessoa)
function ajustarCamera() {
  const a = window.innerWidth / window.innerHeight;
  camera.left = -zoom * a / 2; camera.right = zoom * a / 2; camera.top = zoom / 2; camera.bottom = -zoom / 2;
  camera.updateProjectionMatrix();
  camP.aspect = a; camP.updateProjectionMatrix();
}
// pás do rotor dos helicópteros 3D (nó "rotor" dentro do modelo)
const rotores = new WeakMap();
function rotorDe(o) { if (!rotores.has(o)) rotores.set(o, o.getObjectByName('rotor') || null); return rotores.get(o); }
function trocarCamera() {
  const opc = [['iso', '🗺️ De cima (padrão)', 'Câmera de cima (padrão).'], ['atras', '🎥 De cima, atrás do personagem', 'Câmera de cima que gira e acompanha para onde você anda.'],
    ['livre', '🌆 3D livre', 'Visão 3D: arraste na tela para girar e inclinar; pinça (ou rodinha) aproxima.'], ['p1', '👁️ Primeira pessoa', 'Primeira pessoa: arraste na tela para olhar; o joystick anda para onde você olha. Armado, o tiro vai na mira do centro.']];
  escolher('🎥 Câmera', 'Escolha como ver o jogo (fica salvo).', opc.map(([m, r, t]) => ({ rotulo: `${m === modoCam ? '✅ ' : ''}${r}`, fn: () => {
    if (modo3D() !== (m === 'livre' || m === 'p1')) olhar.yaw = Math.PI / 4 + anguloCamSuave * Math.PI / 2 + Math.PI;   // começa olhando para o mesmo lado da câmera de cima
    modoCam = m; try { localStorage.setItem('fator_cam', modoCam); } catch { /* sem armazenamento */ }
    if (modoCam === 'iso') { anguloCam = Math.round(anguloCamSuave); camAtras = false; }
    olhar.pitch = m === 'p1' ? -0.05 : olhar.pitch; aviso(`🎥 ${t}`, 3.5);
  } })));
}
window.addEventListener('resize', () => { visual.redimensionar(); ajustarCamera(); });
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
function prepararEstatico(obj, doisLados = false) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      if (o.material) { o.material.envMapIntensity = 0.8; if (doisLados) o.material.side = THREE.DoubleSide; }   // modelo com faces viradas pra dentro: desenha os dois lados (senão fica 'transparente')
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
function criarCadeia(caixaDelegacia) {
  cadeia = { x: caixaDelegacia.max.x + 3.2, z: (caixaDelegacia.min.z + caixaDelegacia.max.z) / 2 };
  // os presos ficam na carceragem, dentro da delegacia (sala 'carceragem'); aqui fica só o ponto de saída
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
  colidirCarros(p, raio); colidirOnibus(p, raio); colidirLixoNpc(p, raio);
  if (!jogador.trem) ferrovia.empurrar(p, raio);
  resolverMoveis(p, raio);
  mundo.limitar(p);
}
function colidirLista(lista, p, raio) {
  for (const c of lista) {
    if (c.off) continue;
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
// só bate no que está de fato aparecendo: na cena, visível (ele e todos os pais) e perto do chão
function aparece(o) {
  if (!o) return false;
  let x = o; for (let k = 0; x && k < 40; k++) { if (!x.visible) return false; if (x === scene) return true; x = x.parent; }
  return false;   // tirado da cena, mas ainda guardado em alguma lista: não pode virar parede invisível
}
function colidirCarros(p, raio) {
  for (const v of carrosMundo.values()) {
    const m = v.mesh; if (jogador.carro?.mesh === m || v.chamada || !aparece(m)) continue;
    const q = m.position; if (q.y > alturaChao(q.x, q.z) + 2) continue;
    const dx = p.x - q.x, dz = p.z - q.z, r = raio + 1.4, d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = q.x + dx / d * r; p.z = q.z + dz / d * r; }
  }
}
function resolverMoveis(p, raio) {
  // caminhão em movimento
  if (aparece(caminhaoMovel?.obj)) {
    const dx = p.x - caminhaoMovel.obj.position.x, dz = p.z - caminhaoMovel.obj.position.z, r = raio + 2.3, d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = caminhaoMovel.obj.position.x + dx / d * r; p.z = caminhaoMovel.obj.position.z + dz / d * r; }
  }
  for (const c of caminhoes.values()) {
    // só veículo que está aparecendo no mapa e no chão (os escondidos ficavam parados no centro, em x 0 z 0, como um bloqueio invisível)
    if (jogador.carro?.mesh === c.obj || !aparece(c.obj) || c.obj.position.y > alturaChao(c.obj.position.x, c.obj.position.z) + 2) continue;
    const q = c.obj.position, dx = p.x - q.x, dz = p.z - q.z, rr = raio + 2.2, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = q.x + dx / d * rr; p.z = q.z + dz / d * rr; }
  }
  for (const r of remotos.values()) {
    if (!aparece(r.av?.raiz)) continue;
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
const manche = { ativo: false, x: 0, y: 0, id: null };   // avião: x inclina (vira), y puxa (sobe) / empurra (desce)
const pedais = { esq: false, dir: false, acel: false, freio: false };
window.addEventListener('keydown', (e) => {
  const foco = document.activeElement;
  if (foco && (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA')) return;
  const k = (e.key || '').toLowerCase(); if (!k) return; teclas.add(k);
  if (!jogador.avatar || e.repeat) return;
  if (k === 'e') acaoContexto();
  if (k === 'f') { if (jogador.carro?.servico === 'tanque') atirarTanque(); else if (!jogador.carro?.voa) socar(); }
  if (k === 'q') alternarArma();
  if (k === 'z') girarCamera(-1);
  if (k === 'x') girarCamera(1);
  if (k === 'm') abrirJanela('mochila');
  if (k === 'v') { voz.falar(true); desenharBotaoVoz(); }
  if (k === 'g') acaoAlgema();
  if (k === 'c') acaoCrime();
  if (k === 'j') ejetar();
});
window.addEventListener('keyup', (e) => { const k = (e.key || '').toLowerCase(); teclas.delete(k); if (k === 'v') { voz.falar(false); desenharBotaoVoz(); } });
window.addEventListener('blur', () => teclas.clear());
window.addEventListener('wheel', (e) => { if (modoCam === 'livre') { olhar.dist = THREE.MathUtils.clamp(olhar.dist * (e.deltaY > 0 ? 1.1 : 0.9), 4, 60); return; } zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 1.1 : 0.9), 12, 70); ajustarCamera(); }, { passive: true });

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
  const ant = ponteiros.get(e.pointerId);
  if (modo3D() && ponteiros.size === 1) {   // câmera 3D: arrastar gira (para os lados) e inclina (para cima e para baixo)
    const dx = e.clientX - ant.x, dy = e.clientY - ant.y; ant.mov = (ant.mov || 0) + Math.abs(dx) + Math.abs(dy);
    const k = e.pointerType === 'mouse' ? 0.006 : 0.0085;
    if (jogador.carro && modoCam === 'p1') olhar.veic -= dx * k; else olhar.yaw -= dx * k;
    if (modoCam === 'p1') olhar.pitch = THREE.MathUtils.clamp(olhar.pitch - dy * k, -1.25, 1.1); else olhar.incl = THREE.MathUtils.clamp(olhar.incl + dy * k, 0.05, 1.35);
    olhar.arrastou = 1.5;
  }
  ponteiros.set(e.pointerId, { ...ant, x: e.clientX, y: e.clientY });
  if (pinca && ponteiros.size === 2) {
    const [a, b] = [...ponteiros.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (modoCam === 'livre') { pinca.dist ??= olhar.dist; olhar.dist = THREE.MathUtils.clamp(pinca.dist * pinca.d / Math.max(d, 1), 4, 60); }
    else zoom = THREE.MathUtils.clamp(pinca.z * pinca.d / Math.max(d, 1), 12, 70); ajustarCamera();
  }
});
function soltarPonteiro(e) {
  const p = ponteiros.get(e.pointerId); ponteiros.delete(e.pointerId);
  if (pinca) { if (ponteiros.size === 0) pinca = null; return; }
  if (!p || !jogador.avatar || e.type === 'pointercancel') return;
  if (performance.now() - p.t > 450) return;      // segurou: não é toque
  if (modo3D() && (p.mov || 0) > 10) return;      // arrastou para olhar: não é toque
  if (modoCam === 'p1' && !(jogador.armado && e.pointerType === 'mouse')) return;   // primeira pessoa: anda pelo joystick / teclado
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
  // manche do avião: arrastar para baixo puxa (nariz sobe), para cima empurra (desce); para os lados vira
  const mb = $('manche'); if (mb) {
    const mbola = mb.querySelector('i'), rm = 58;
    const moverM = (e) => { const r = mb.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const d = Math.hypot(dx, dy); if (d > rm) { dx = dx / d * rm; dy = dy / d * rm; } manche.x = dx / rm; manche.y = dy / rm; mbola.style.transform = `translate(${dx}px, ${dy}px)`; };
    mb.addEventListener('pointerdown', (e) => { e.preventDefault(); manche.ativo = true; manche.id = e.pointerId; try { mb.setPointerCapture(e.pointerId); } catch { } moverM(e); });
    mb.addEventListener('pointermove', (e) => { if (manche.ativo && e.pointerId === manche.id) moverM(e); });
    const fimM = (e) => { if (e && e.pointerId !== manche.id) return; manche.ativo = false; manche.x = manche.y = 0; mbola.style.transform = ''; };
    mb.addEventListener('pointerup', fimM); mb.addEventListener('pointercancel', fimM); mb.addEventListener('lostpointercapture', fimM);
  }
  // volante: setas e pedais (cada botão com o próprio dedo)
  $('vEjetar').onclick = (e) => { e.stopPropagation(); ejetar(); };
  $('vPairar').onclick = (e) => {
    e.stopPropagation(); const c = jogador.carro; if (!c?.voa) return;
    if (c.aviao) { if (c.ap) desligarAP(c, '🕹️ Piloto automático desligado: o avião é seu.'); else escolherAP(c); return; }
    menuRevisaoHeli(c); return;
    c.pairar = !c.pairar; aviso(c.pairar ? '🚁 Pairando: o helicóptero fica parado no ar.' : '🚁 Pairar desligado: parado, ele desce para pousar.', 2.5);
  };
  for (const [id, k] of [['vEsq', 'esq'], ['vDir', 'dir'], ['vAcel', 'acel'], ['vFreio', 'freio']]) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* sem captura */ } pedais[k] = true; b.dataset.dedo = e.pointerId; b.classList.add('ativo'); });
    const solta = () => { pedais[k] = false; delete b.dataset.dedo; b.classList.remove('ativo'); };
    window.addEventListener('pointerup', (e) => { if (b.dataset.dedo === String(e.pointerId)) solta(); });
    window.addEventListener('pointercancel', (e) => { if (b.dataset.dedo === String(e.pointerId)) solta(); });
    document.addEventListener('visibilitychange', solta);
    b.addEventListener('pointerup', solta); b.addEventListener('pointercancel', solta); b.addEventListener('lostpointercapture', solta);
  }
  toque('btAcao', acaoContexto); toque('btSoco', socar); toque('btArma', alternarArma); toque('btAlgema', acaoAlgema); toque('btCrime', acaoCrime);
  toque('btTiro', () => atirar(null)); toque('btGiraE', () => girarCamera(-1)); toque('btGiraD', () => girarCamera(1));
}

function girarCamera(s) { if (modo3D()) { olhar.yaw -= s * Math.PI / 4; return; } anguloCam += s; }

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
  if (cativo()) { aviso('Você é refém: espere alguém te libertar.'); return false; }
  if (jogador.pena > 0) { aviso('Você está preso.'); return false; }
  return true;
}

function acaoContexto() {
  if (jogador.onibus) { acaoNoOnibus(); return; }
  if (jogador.voo) { aviso('Você está voando: desce quando o avião chegar.', 2); return; }
  if (jogador.trem) {
    const est = ferrovia.estadoDe(jogador.trem.li, jogador.trem.k);
    if (est?.parado === jogador.trem.origem) desembarcar(jogador.trem.origem); else aviso(contexto()[0]);
    return;
  }
  if (jogador.passageiro) { if (passageiroPodeDescer()) descerPassageiro(); else aviso('Espere o helicóptero pousar.'); return; }
  if (jogador.carro?.taxi) { acaoTaxi(); return; }
  if (aula && jogador.carro?.aula === aula && !aula.voo) { encerrarAula(false, 'Você desistiu da prova.'); return; }
  if (jogador.carro) {
    const a = acaoNoVeiculo();
    if (a?.[0] === 'descarregar') descarregarRoubo();
    else if (a?.[0] === 'comprador') contextoComprador()?.[2]();
    else if (a?.[0] === 'jato') servicos.apagar(servicos.fogoProximo(15) || servicos.listaIncendios()[0]);
    else if (a?.[0] === 'socorrer') socorrerFerido(feridoProximo(7));
    else if (a?.[0] === 'abduzir') abduzir(alvoAbducao());
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
  const fogo = servicos.fogoProximo(9);
  if (fogo && !jogador.carregando) {
    if (fogo.tipo === 'veiculo' && jogador.perfil.profissao !== 'bombeiro' && !servicos.fogoNoComeco(fogo)) { aviso('🔥 O fogo já cresceu: só os bombeiros conseguem apagar.', 3); return; }
    servicos.apagar(fogo); return;
  }
  { const a = algemadoParaSoltar(); if (a) { soltarAlgemado(a); return; } }
  { const b = bandidoPerto(); if (b) { prenderBandido(b); return; } }
  { const r = refemPerto(); if (r) { libertarRefem(r); return; } }
  { const f = feridoParaSequestro(); if (f) { sequestrar(f); return; } }
  if (bueiroPerto()) { acaoBueiro(); return; }
  { const q = portaQGPerto(); if (q) { if (meuQG(q)) entrarNoQG(q); else aviso('🏴 Só os membros do clã dono desta base entram no QG.', 3); return; } }
  { const k = conteinerPerto(); if (k !== null) { arrombarConteiner(k); return; } }
  if (perto(civico.BANCO.balcao, 3.2)) { abrirServico('banco'); return; }
  if (perto(civico.BANCO.empregos, 3.2)) { abrirServico('empregos'); return; }
  if (perto(civico.HOSPITAL.balcao, 3.2)) { abrirServico('hospital'); return; }
  if (perto(civico.BOMBEIROS.balcao, 3.2)) { entrarPublico('bombeiros', salaBombeiros, civico.BOMBEIROS.balcao, '🚒 Quartel dos bombeiros: balcão, quadro de incêndios, vestiário e enfermaria.'); return; }
  if (acaoOnibus()) return;
  if (acaoColeta()) return;
  if (Math.hypot(AUTOESCOLA.balcao.x - jogador.pos.x, AUTOESCOLA.balcao.z - jogador.pos.z) < 3) { abrirAutoescola(); return; }
  if (contextoAviacao() && acaoAviacao()) return;
  { const s = tropaPerto(); if (s) { iniciarTropa(s); return; } }
  if (perto(civico.EXERCITO.arsenal, 3.2)) { usarArsenal(); return; }
  if (perto(CONTRABANDISTA, 3.2)) { falarContrabandista(); return; }
  if (BANCAS.some((b) => perto(b, 3.2))) { abrirServico('jornal'); return; }
  if (perto(GUARITA_ALIST, 3.2)) { menuGuarita(); return; }
  if (perto(CENTRAL_MISSEIS, 4)) { menuCentralMisseis(); return; }
  if ((jogador.embarcado || navioNoPier()) && acaoNavio()) return;
  if (perto(civico.EXERCITO.balcao, 3.2)) { abrirServico(jogador.perfil?.profissao === 'exercito' ? 'trabalho' : 'empregos'); return; }
  if (jogador.perfil.profissao === 'jornalista') { const rp = reportagemProxima(); if (rp) { reportar(rp); return; } }
  if (perto(civico.PREFEITURA.jornal, 3.2)) { abrirServico('jornal'); return; }
  if (perto(civico.PREFEITURA.porta, 3.2)) { entrarPublico('prefeitura', salaPrefeitura, civico.PREFEITURA.porta, '🏛️ Prefeitura: gabinete, urna, outdoors e sala de imprensa.'); return; }
  if (perto(civico.PREFEITURA.prf, 3.2)) { entrarPublico('prf', () => salaDelegacia('prf', 1000, 'Posto da PRF', '#2b4fa8'), civico.PREFEITURA.prf, '🚔 Posto da PRF: balcão, procurados e estande de tiro.'); return; }
  if (perto(civico.CONCESSIONARIA.balcao, 3.2)) { abrirConcessionaria(); return; }
  const carro = meuCarroProximo(); if (carro && !jogador.carregando) { if (carro.d.queimado || veiculoEmChamas('car:' + carro.d.id)) { aviso('🔥 Seu carro queimou: pague o conserto (5.000) na concessionária.', 3.5); return; } entrarCarro(carro); return; }
  { const so = onibusSeqPerto(); if (so !== null) { pegarOnibusSeq(so); return; } }
  { const va = viaturaAbandonadaPerto(); if (va) { roubarViatura(va); return; } }
  { const cj = contextoComprador(); if (cj) { cj[2](); return; } }
  { const jl = jujubaLargadaPerto(); if (jl) { rede.jujuba.pegarSeq(jl.d.id).then((q) => dirigirJujuba(jl, q)).catch((e) => aviso(e.message, 3)); return; } }
  { const vl = vanLargadaPerto(); if (vl) { entrarCarro({ d: { id: 'vnpc' + vl.id, modelo: 'van', cor: '#f2f2ee' }, mesh: vl.obj }); jogador.carro.vanNpc = vl; jogador.carro.salvar = 1e9; vl.largadaAte = 0; return; } }
  { const cr = carroRuaProximo(); if (cr !== null && !jogador.carregando) { roubarCarroRua(cr); return; } }
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
}
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
let voandoUI = false;
function modoHeli(sim) {
  document.body.classList.toggle('heli', sim);
  const t = $('manche'); if (t) { t.querySelector('.m-t').textContent = sim ? '▲ FRENTE' : '▲ DESCE'; t.querySelector('.m-b').textContent = sim ? '▼ RÉ' : '▼ SOBE'; }
  const a = $('vAcel'), f = $('vFreio'); if (a) a.innerHTML = sim ? '⬆️<br>SUBIR' : 'ACELERAR'; if (f) f.innerHTML = sim ? '⬇️<br>DESCER' : 'FREIO<br>RÉ';
  const bp = $('vPairar'); if (bp && !sim) { bp.style.display = ''; delete bp.dataset.rev; }
}
function modoVolante(sim) {
  if (!sim && document.body.classList.contains('heli')) modoHeli(false);
  if (!sim) { document.body.classList.remove('aviao'); manche.x = manche.y = 0; manche.ativo = false; const b = $('manche')?.querySelector('i'); if (b) b.style.transform = ''; }
  if (!sim && voandoUI) { voandoUI = false; document.body.classList.remove('voando'); } if (!sim && document.body.classList.contains('tanque')) { document.body.classList.remove('tanque'); $('btTiro').classList.toggle('oculto', !jogador.armado || !TOQUE); } document.body.classList.toggle('dirigindo', sim); for (const k in pedais) pedais[k] = false; joy.ativo = false; joy.x = joy.y = 0; }
function entrarCarro(v) {
  if (jogador.carregando) { aviso('Largue a caixa antes de dirigir.'); return; }
  modoVolante(true);
  if (jogador.armado) alternarArma();
  jogador.carro = { id: v.d.id, modelo: v.d.modelo, cor: v.d.cor, vel: 0, mesh: v.mesh, salvar: 20, voa: !!civico.CARROS[v.d.modelo]?.voa, alt: 0, raio: v.d.modelo === 'helicoptero' ? 2.2 : undefined };
  if (!jogador.carro.voa) somPartida(jogador.carro);
  jogador.pos.set(v.mesh.position.x, v.mesh.position.y, v.mesh.position.z); jogador.yaw = v.mesh.rotation.y; jogador.alvo = null;
  jogador.avatar.raiz.visible = false;
  aviso(`${civico.CARROS[v.d.modelo]?.nome || 'Carro'}: use o controle para dirigir. Toque em Sair para estacionar.`, 3.5);
}
function sairCarro() {
  const c = jogador.carro; if (!c) return;
  if (c.jato && (c.noAr || c.vel > 2)) { aviso('Pouse e pare o caça antes de sair.', 2); return; }
  if (c.jato && c.alt > 1) { aviso('No porta-aviões não dá para descer: decole e pouse na Base Aérea.', 3); return; }
  if (c.servico === 'lixo' && minhaColeta) { encerrarColeta(); return; }
  if (c.aula && c.aula === aula) { if (c.aula.voo && c.alt > 1.5) { aviso('Pouse antes de sair.', 2); return; } encerrarAula(false, 'Você saiu do veículo da prova.'); return; }
  if (c.voa && !c.caminhao) {
    if (c.alt > 1.5) { aviso('Pare para pousar antes de sair.', 2); return; }
    const t = jogador.pos.clone(); mundo.limitar(t);
    if (Math.hypot(t.x - jogador.pos.x, t.z - jogador.pos.z) > 2) { aviso('Pouse numa cidade ou na mata para descer.', 2.5); return; }
  }
  if (c.teste) { jogador.carro = null; modoVolante(false); scene.remove(c.mesh); jogador.pos.x += Math.cos(jogador.yaw) * 2.5; jogador.pos.z -= Math.sin(jogador.yaw) * 2.5; resolverColisao(jogador.pos, jogador.raio); jogador.avatar.raiz.visible = true; aviso('🧪 Veículo de teste guardado.', 2); return; }
  if (c.servico === 'aviao') { jogador.carro = null; modoVolante(false); scene.remove(c.mesh); jogador.pos.x += 3; resolverColisao(jogador.pos, jogador.raio); jogador.avatar.raiz.visible = true; aviso('✈️ Avião devolvido ao hangar.', 2.5); return; }
  if (c.servico) {   // ambulância / caminhão dos bombeiros: fica estacionado onde você desceu
    jogador.carro = null; modoVolante(false);
    c.mesh.position.copy(jogador.pos); c.mesh.rotation.y = jogador.yaw;
    const lx = Math.cos(jogador.yaw) * 2.8, lz = -Math.sin(jogador.yaw) * 2.8;
    jogador.pos.x += lx; jogador.pos.z += lz; resolverColisao(jogador.pos, jogador.raio);
    civico.atualizarSirenes(0, c.mesh); jogador.avatar.raiz.visible = true;
    c.mesh.position.y = alturaChao(c.mesh.position.x, c.mesh.position.z);
    if (c.servico === 'ovni') { guardarOvni(c); return; }
    if (JATOS[c.servico]) { guardarJato(c); return; }
    aviso(c.servico === 'ambulancia' ? 'Ambulância estacionada. Socorra o ferido (✚) e volte para ela.' : civico.DO_EXERCITO.has(c.servico) ? 'Veículo do Exército estacionado aqui. Volte para ele quando quiser.' : 'Caminhão estacionado aqui. Volte para ele quando terminar.', 3);
    return;
  }
  if (c.caminhao) {
    rede.veiculos.sair(c.caminhao, jogador.pos.x, jogador.pos.z, jogador.yaw).then(() => { tempoLogistica = Math.min(tempoLogistica, 0.5); }).catch(() => {});
    const v = caminhoes.get(c.caminhao);
    if (v) v.d = { ...v.d, motorista: null, pos_x: jogador.pos.x, pos_z: jogador.pos.z, ang: jogador.yaw, ...(v.d.sequestrado ? {} : { status: 'parado' }) };
    sairCarroLocal();
    if (c.sequestrado) ultimoLargado = { ref: 'cam:' + c.caminhao, ate: agoraServidor() + 90000 };
    aviso(c.sequestrado ? 'Você largou o veículo roubado. Dá para pôr fogo nele (Incendiar). Parado por 7 min, ele volta para o dono.' : 'O robô motorista levou o veículo de volta para a garagem.', 3.5);
    return;
  }
  if (c.seqOnibus) { largarOnibusSeq(c); return; }
  if (c.viatura) { largarViatura(c); return; }
  if (c.vanNpc) { largarVanNpc(c); return; }
  if (c.jujuba) { largarJujuba(c); return; }
  if (c.rua !== undefined) { largarCarroRua(c); return; }
  jogador.carro = null; modoVolante(false);
  c.mesh.position.copy(jogador.pos); c.mesh.rotation.y = jogador.yaw;
  const v = carrosMundo.get(c.id); if (v) { v.d = { ...v.d, x: jogador.pos.x, z: jogador.pos.z, ang: jogador.yaw }; }
  rede.carros.estacionar(c.id, jogador.pos.x, jogador.pos.z, jogador.yaw).catch(() => {});
  // desce pela porta esquerda
  const lx = Math.cos(jogador.yaw) * 1.8, lz = -Math.sin(jogador.yaw) * 1.8;
  jogador.pos.x += lx; jogador.pos.z += lz; resolverColisao(jogador.pos, jogador.raio);
  jogador.avatar.raiz.visible = true;
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
  if (c.dano === undefined) c.dano = danoGuardado(c);
  if (c.voa !== voandoUI) { voandoUI = !!c.voa; document.body.classList.toggle('voando', voandoUI); }
  if (c.jato) { pilotarJato(c, dt); return; }
  if (c.aviao) { pilotarAviao(c, dt); return; }
  if (c.voa) { pilotarHeli(c, dt, max); return; }
  const acel = pedais.acel || teclas.has('w') || teclas.has('arrowup'), freio = pedais.freio || teclas.has('s') || teclas.has('arrowdown');
  const volante = (pedais.dir || teclas.has('d') || teclas.has('arrowright') ? 1 : 0) - (pedais.esq || teclas.has('a') || teclas.has('arrowleft') ? 1 : 0);
  // aceleração suave; freio firme; parado, o freio vira ré (devagar)
  if (acel && !freio) c.vel = c.vel < 0 ? Math.min(0, c.vel + 10 * dt) : Math.min(max, c.vel + civico.aceleracao(c.modelo, c.vel, max) * dt);   // cada veículo com a sua arrancada
  else if (freio) c.vel = c.vel > 0.3 ? Math.max(0, c.vel - 11 * dt) : c.voa ? 0 : Math.max(-Math.min(4, max * 0.35), c.vel - 3 * dt);   // helicóptero não tem ré
  else c.vel = c.vel > 0 ? Math.max(0, c.vel - 3 * dt) : Math.min(0, c.vel + 3 * dt);
  // volante com resposta gradual; vira menos quando está rápido (não roda no lugar)
  {
    // carro de verdade (modelo de bicicleta): o volante gira aos poucos e volta ao centro sozinho; a curva depende da
    // distância entre os eixos e da velocidade (rápido, o volante "pesa" e a curva fica mais aberta). Sem curva seca.
    c.volante = (c.volante || 0) + (volante - (c.volante || 0)) * Math.min(1, dt * (volante ? 2.6 : 4.5));
    const tc = tipoCabine(), eixo = tc === 'onibus' ? 6.2 : tc === 'caminhao' ? 4.8 : 2.7, vAbs = Math.abs(c.vel);
    const maxEsterco = (tc === 'carro' ? 0.58 : 0.8) / (1 + vAbs / 10);
    const giro = vAbs / eixo * Math.tan(c.volante * maxEsterco);
    jogador.yaw -= giro * dt * Math.sign(c.vel || 1);
  }
  if (c.servico) civico.atualizarSirenes(performance.now() / 1000, c.mesh);
  if (!c.assentado) { resolverColisao(jogador.pos, c.raio || 1.3); c.assentado = true; }
  const antes = { x: jogador.pos.x, z: jogador.pos.z };
  jogador.pos.x += Math.sin(jogador.yaw) * c.vel * dt; jogador.pos.z += Math.cos(jogador.yaw) * c.vel * dt;
  if (!c.voa) { colidirVeiculo(c, dt); resolverColisao(jogador.pos, c.raio || 1.3); }
  const andou = Math.hypot(jogador.pos.x - antes.x, jogador.pos.z - antes.z), esperado = Math.abs(c.vel) * dt;
  if (esperado > 0.01 && andou < esperado * 0.6) {          // bateu
    if (Math.abs(c.vel) > 6 && performance.now() - (c.batida || 0) > 1200) {
      c.batida = performance.now(); tremor = 0.35; if (c.aula) c.aula.batidas++;
      c.dano = Math.min(100, (c.dano || 0) + Math.min(45, Math.abs(c.vel) * 2.2));   // batida forte estraga mais
      guardarDanoVeiculo(c);
      if (c.dano >= 100) { acidenteVeiculo(c, '💥 Bateu demais: o veículo explodiu!'); return; }
      aviso(`💥 Batida! Veículo ${Math.round(100 - c.dano)}%${c.dano >= 70 ? ' (pegando fogo, cuidado!)' : ''}`, 1.6);
    }
    c.vel *= Math.abs(c.vel) > 6 ? 0.15 : 0.5;
  }
  const chao = alturaChao(jogador.pos.x, jogador.pos.z);
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
  if (armasProibidas()) { aviso('🚫 Aqui não é permitido brigar nem usar armas.'); return; }
  jogador.alvo = null;
  jogador.soco = (jogador.soco + 1) % 2;
  jogador.avatar.tocar(jogador.soco ? 'punch_right' : 'punch_left', { umaVez: true, velocidade: 1.7, fade: 0.08 });
  jogador.trava = 0.72 / (1 + bonusTreino('luta'));
  jogador.eventos.push({ t: 0.3, fn: golpeSoco });
}

function alternarArma() {
  if (jogador.trava > 0) return;
  if (!jogador.armado && armasProibidas()) { aviso('🚫 Armas não são permitidas aqui.'); return; }
  if (!jogador.armado && !livre()) return;
  if (jogador.carregando) { aviso('Solte a caixa antes de sacar a arma.'); return; }
  jogador.armado = !jogador.armado;
  jogador.arma.visible = jogador.armado;
  $('btTiro').classList.toggle('oculto', !jogador.armado);
  $('btArma').classList.toggle('ativo', jogador.armado);
  jogador.trava = 0.2;
}

// nome acima da cabeça, com uma folga (os personagens têm alturas diferentes)
function alturaNome(av) { return Math.max(2.45, (av?.altura || 1.8) + 0.65); }   // alto o bastante para não cobrir capacete e boné

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
  if (armasProibidas()) { aviso('🚫 Armas não são permitidas aqui.'); return; }
  const A = ARMAS[jogador.armaTipo || 'basica'];
  jogador.alvo = null;
  if (modoCam === 'p1' && !jogador.carro) jogador.yaw = olhar.yaw;
  else if (alvo) jogador.yaw = Math.atan2(alvo.x - jogador.pos.x, alvo.z - jogador.pos.z);
  jogador.avatar.raiz.rotation.y = jogador.yaw;
  jogador.avatar.raiz.updateMatrixWorld(true);
  const boca = jogador.arma.localToWorld(new THREE.Vector3(...(modelos[A.modelo] ? A.boca : ARMAS.basica.boca)));
  const dir = new THREE.Vector3(Math.sin(jogador.yaw), 0, Math.cos(jogador.yaw));
  const dourada = tenhoArmaPd();
  const cor = dourada ? '#ffd23e' : A.cor || CORES_TINTA[Math.floor(Math.random() * CORES_TINTA.length)];
  const vyMira = dourada ? null : miraNoAlvo(boca, dir, A.vel);
  const v = dir.multiplyScalar(dourada ? 34 : A.vel).add(new THREE.Vector3(0, vyMira ?? (dourada ? 0.6 : 1.2 * 24 / A.vel), 0));
  if (modoCam === 'p1' && vyMira == null) v.y += Math.tan(THREE.MathUtils.clamp(olhar.pitch, -0.6, 0.6)) * (dourada ? 34 : A.vel);   // mira para cima / para baixo
  criarBola(boca, v, cor, true, dourada ? 1 : A.bola || 1);
  const critico = Math.random() < bonusTreino('tiro');   // treino de tiro: chance de acerto crítico (dano dobrado)
  bolas[bolas.length - 1].dano = Math.round(A.dano * (critico ? 2 : 1) * fatorForca()); bolas[bolas.length - 1].critico = critico;
  if (dourada) {
    bolas[bolas.length - 1].pd = true; bolas[bolas.length - 1].m.scale.setScalar(1.6);
    armaPd = { ...armaPd, balas: armaPd.balas - 1 };
    rede.pd.disparar().then((resta) => { aviso(resta > 0 ? `✨ Arma dourada: ${resta} bala restante.` : '✨ Última bala: a arma dourada sumiu.', 3); if (resta <= 0) { armaPd = { ...armaPd, ativa: false, dono: null }; pintarArma(); } }).catch(() => {});
    jogador.recarga = 1.2;
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  conexao?.enviar('tiro', { x: r2(boca.x), y: r2(boca.y), z: r2(boca.z), vx: r2(v.x), vy: r2(v.y), vz: r2(v.z), c: cor, s: A.bola || 1 });
  if (!dourada) jogador.recarga = A.recarga / (1 + bonusTreino('luta'));
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
// ---- acidentes: cada batida forte gasta o veículo; em 100% ele explode (no trem, explode na hora).
// O carro do jogador some por 30 s e volta para o dono; quem estava dentro sai ferido.
const danoVeiculos = new Map();   // dano dos carros nesta sessão (sair e entrar não conserta)
function guardarDanoVeiculo(c) { danoVeiculos.set(c.rua !== undefined ? 'r' + c.rua : c.caminhao ? 'k' + c.caminhao : c.servico ? 's' + c.servico : c.id, c.dano); }
function danoGuardado(c) { return danoVeiculos.get(c.rua !== undefined ? 'r' + c.rua : c.caminhao ? 'k' + c.caminhao : c.servico ? 's' + c.servico : c.id) || 0; }
function acidenteVeiculo(c, msg) {
  if (!c || c.explodiu) return; c.explodiu = true;
  if (c.voa && !c.caminhao) { quedaAeronave(c, msg); return; }
  const p = c.mesh ? c.mesh.position.clone() : jogador.pos.clone();
  const meu = c.rua === undefined && !c.caminhao && !c.servico && carrosMundo.has(c.id) ? c.id : null;
  danoVeiculos.delete(meu ?? (c.rua !== undefined ? 'r' + c.rua : c.caminhao ? 'k' + c.caminhao : 's' + c.servico));
  if (meu !== null) {
    jogador.carro = null; modoVolante(false); jogador.avatar.raiz.visible = true;
    const v = carrosMundo.get(meu); if (v) v.mesh.visible = false;
    rede.carros.acidente(meu).catch(() => {});
  } else { c.alt = 0; c.pairar = false; c.vel = 0; sairCarro(); if (jogador.carro === c) { jogador.carro = null; modoVolante(false); jogador.avatar.raiz.visible = true; } if (c.mesh && c.rua === undefined) c.mesh.visible = !c.servico; if (c.servico && c.mesh) scene.remove(c.mesh); }
  jogador.pos.x += 2.2; jogador.pos.y = alturaChao(jogador.pos.x, jogador.pos.z); resolverColisao(jogador.pos, jogador.raio);
  const e = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 10) / 10, cv: meu, de: jogador.perfil?.id };
  efeitoExplosao(e.x, e.y, e.z); tremor = 0.8; conexao?.enviar('explosao', e);
  for (const [id, r] of remotos) if (r.av?.raiz.visible && Math.hypot(e.x - r.av.raiz.position.x, e.z - r.av.raiz.position.z) < 4.5) aplicarDanoRemoto(id, 25);
  jogador.ultimoAgressor = null; danoLocal(40);
  aviso(msg + (meu !== null ? ' Ele volta para você em 30 s.' : ''), 4.5);
}
// ---- queda de avião ou helicóptero: explosão do tamanho dele, carcaça queimando e foco de incêndio (os bombeiros apagam).
// Caiu de baixo (até uns 10 m, ou só tocou errado no chão): sobrevive com -40. De mais alto: morre (com paraquedas, ejete antes).
const ESCALA_QUEDA = { pequeno: 2, medio: 3, grande: 4.5 };
const escalaAeronave = (c) => (c.aviao ? ESCALA_QUEDA[c.porte] || 2 : 2.5);
function explosaoAeronave(c, mesh, pil, fatal) {
  const p = mesh ? mesh.position : jogador.pos, k = escalaAeronave(c), chao = alturaChao(p.x, p.z);
  const e = { x: Math.round(p.x * 10) / 10, y: Math.round(chao * 10) / 10, z: Math.round(p.z * 10) / 10, cv: null, de: jogador.perfil?.id, k, ae: 1, mod: c.modelo, r: Math.round((mesh?.rotation.y || 0) * 100) / 100, pil, fatal: fatal ? 1 : 0 };
  efeitoExplosao(e.x, e.y, e.z, k, false); carcaca(e.x, e.z, e.mod, e.r); conexao?.enviar('explosao', e);
  for (const [id, r] of remotos) if (r.av?.raiz.visible && Math.hypot(e.x - r.av.raiz.position.x, e.z - r.av.raiz.position.z) < 4.5 * k) aplicarDanoRemoto(id, 50);
  rede.aviacao.incendioQueda(e.x, e.z, `Queda de ${c.aviao ? 'avião' : 'helicóptero'}`).catch(() => {});
  if (mesh) scene.remove(mesh);
  // helicóptero do jogador (comprado): some por 30 s e volta, como os carros
  const meu = !c.aviao && !c.servico && carrosMundo.has(c.id) ? c.id : null;
  if (meu !== null) { const v = carrosMundo.get(meu); if (v) v.mesh.visible = false; rede.carros.acidente(meu).catch(() => {}); }
  return e;
}
function quedaAeronave(c, msg) {
  const altura = Math.max(c.altRec || 0, c.alt || 0), fatal = altura > 10 || (c.vs || 0) < -9;
  danoVeiculos.delete(c.servico ? 's' + c.servico : c.id);
  const mesh = c.mesh; c.alt = 0; c.vel = 0; c.pairar = false;
  const pos = mesh ? mesh.position.clone() : jogador.pos.clone();
  jogador.carro = null; modoVolante(false); document.body.classList.remove('ejetar');
  const ehMeu = !c.aviao && !c.servico && carrosMundo.has(c.id);
  explosaoAeronave(c, ehMeu ? null : mesh, jogador.perfil?.id, fatal);
  if (ehMeu) { const v = carrosMundo.get(c.id); if (v) v.mesh.visible = false; }
  if (c.aula && c.aula === aula) encerrarAula(false, '💥 Você caiu na aula de voo.');
  jogador.pos.set(pos.x + 2.5, alturaChao(pos.x + 2.5, pos.z), pos.z); resolverColisao(jogador.pos, jogador.raio); jogador.avatar.raiz.visible = true;
  jogador.ultimoAgressor = null;
  if (fatal && !jogador.perfil?.imortal) { aviso(`${msg} Caiu de muito alto: ninguém sobrevive a essa queda.`, 5); morrerLocal(); }
  else { danoLocal(40); aviso(msg + (fatal ? ' (imortal: sobreviveu)' : ' Foi de baixo: você sobreviveu, machucado.'), 4.5); }
}
// carcaça queimada no lugar da queda (some em 3 minutos)
let matCarcaca = null;
function carcaca(x, z, mod, r) {
  const o = mod && civico.modeloCarro(mod, '#333333'); if (!o) return;
  matCarcaca ||= new THREE.MeshStandardMaterial({ color: '#1b1714', roughness: 1, metalness: 0.1 });
  o.traverse((m) => { if (m.isMesh) { m.material = matCarcaca; m.castShadow = false; } if (m.isSprite || m.name === 'luzes' || m.name === 'giroflex') m.visible = false; });
  o.position.set(x, alturaChao(x, z) - 0.25, z); o.rotation.set(0.12, r || 0, -0.18); scene.add(o);
  setTimeout(() => scene.remove(o), 180000);
}
// ---- ejetar com paraquedas: o avião segue sem piloto e cai; você desce devagar
const semPiloto = [];
function ejetar() {
  const c = jogador.carro; if (!c?.voa || c.caminhao) return;
  if (qtdItem('paraquedas') < 1) { aviso('🪂 Você não tem paraquedas (compre no balcão do aeroporto, 5.000).', 3); return; }
  if ((c.alt || 0) < 8) { aviso('🪂 Baixo demais para o paraquedas abrir.', 2.5); return; }
  rede.aviacao.usarParaquedas().then(() => recarregarInventario()).catch(() => {});
  const chao = alturaChao(jogador.pos.x, jogador.pos.z);
  semPiloto.push({ c, mesh: c.mesh, yaw: jogador.yaw, alt: c.alt, vel: Math.max(c.vel, 8), vs: Math.min(c.vs || 0, -1), pitch: c.pitch || 0 });
  if (c.ap) c.ap = null; if (c.aula && c.aula === aula) c.aula.comAP = true;
  jogador.carro = null; modoVolante(false); document.body.classList.remove('ejetar');
  jogador.pos.y = chao + c.alt + 2; jogador.paraquedas = { t: 0 }; jogador.avatar.raiz.visible = true;
  aviso('🪂 Ejetou! O paraquedas abriu. Use o joystick para guiar a descida.', 3.5);
}
function atualizarSemPiloto(dt) {
  for (let i = semPiloto.length - 1; i >= 0; i--) {
    const o = semPiloto[i];
    o.vs -= 3 * dt; o.pitch = Math.max(-0.6, o.pitch - 0.25 * dt); o.yaw += 0.12 * dt;
    o.alt += o.vs * dt; const x = o.mesh.position.x + Math.sin(o.yaw) * o.vel * dt, z = o.mesh.position.z + Math.cos(o.yaw) * o.vel * dt, chao = alturaChao(x, z);
    o.mesh.position.set(x, chao + Math.max(0, o.alt), z); o.mesh.rotation.set(-o.pitch, o.yaw, 0.35, 'YXZ');
    if (o.alt <= 0) { semPiloto.splice(i, 1); o.c.explodiu = true; explosaoAeronave(o.c, o.mesh, null, false); }
  }
}
let geoParaquedas = null;
function paraquedasMesh() {
  if (!geoParaquedas) geoParaquedas = new THREE.SphereGeometry(2.4, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.6);
  const g = new THREE.Group();
  const lona = new THREE.Mesh(geoParaquedas, new THREE.MeshStandardMaterial({ color: '#f07a1c', roughness: 0.8, side: THREE.DoubleSide })); lona.scale.y = 0.55; lona.position.y = 3.2; g.add(lona);
  const cordaM = new THREE.MeshBasicMaterial({ color: '#dddddd' });
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, cd = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 4), cordaM); cd.position.set(Math.cos(a) * 1.0, 2.5, Math.sin(a) * 1.0); cd.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(cd); }
  return g;
}
function descerParaquedas(dt, dir, forca) {
  const j = jogador, av = j.avatar, pq = j.paraquedas;
  if (!pq.mesh) { pq.mesh = paraquedasMesh(); av.raiz.add(pq.mesh); }
  pq.t += dt;
  j.pos.x += dir.x * forca * 3.5 * dt; j.pos.z += dir.z * forca * 3.5 * dt; if (forca > 0.1) j.yaw = Math.atan2(dir.x, dir.z);
  j.pos.y -= 4 * dt;
  const chao = alturaChao(j.pos.x, j.pos.z);
  av.tocar('idle'); av.raiz.position.copy(j.pos); av.raiz.rotation.y = j.yaw; av.mixer.update(dt); av.raiz.updateMatrixWorld(true);
  if (j.pos.y <= chao) { j.pos.y = chao; resolverColisao(j.pos, j.raio); av.raiz.remove(pq.mesh); j.paraquedas = null; aviso('🪂 Pousou com o paraquedas.', 2.5); }
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
  efeitoExplosao(e.x, e.y, e.z, e.k || 1, !e.ae);
  if (e.ae) {   // queda de avião ou helicóptero
    if (e.mod) carcaca(e.x, e.z, e.mod, e.r);
    if (e.pil && jogador.passageiro?.piloto === e.pil) {   // eu ia de passageiro nele
      descerPassageiro(); jogador.ultimoAgressor = null;
      if (e.fatal && !jogador.perfil?.imortal) { aviso('💥 O avião em que você estava caiu de muito alto.', 5); morrerLocal(); } else { danoLocal(40); aviso('💥 O avião caiu! Você sobreviveu, machucado.', 4); }
      return;
    }
    if (!jogador.carro && Math.hypot(e.x - jogador.pos.x, e.z - jogador.pos.z) < 4.5 * (e.k || 1)) { jogador.ultimoAgressor = e.de; danoLocal(50); }
    return;
  }
  const v = e.cv != null && carrosMundo.get(Number(e.cv)); if (v && jogador.carro?.id !== v.d.id) v.mesh.visible = false;
  if (e.cv != null && jogador.carro && String(jogador.carro.id) === String(e.cv)) {
    sairCarro(); jogador.ultimoAgressor = e.de; danoLocal(50);
    aviso('💥 Seu veículo explodiu com o tanque! Ele volta para você em 30 s.', 4); return;
  }
  if (!jogador.carro && Math.hypot(e.x - jogador.pos.x, e.z - jogador.pos.z) < 4.5) { jogador.ultimoAgressor = e.de; danoLocal(35); }
}
const explosoes = [];
const geoExplosao = new THREE.SphereGeometry(1, 16, 12);
function efeitoExplosao(x, y, z, k = 1, tinta = true) {
  const fogo = new THREE.Mesh(geoExplosao, new THREE.MeshBasicMaterial({ color: '#ffb23a', transparent: true, opacity: 0.95, toneMapped: false }));
  const fumaca = new THREE.Mesh(geoExplosao, new THREE.MeshStandardMaterial({ color: '#3b3b3b', transparent: true, opacity: 0.6, roughness: 1, depthWrite: false }));
  const tt = tinta ? new THREE.Mesh(geoExplosao, new THREE.MeshStandardMaterial({ color: '#1f9e46', transparent: true, opacity: 0.9, roughness: 0.6 })) : null;
  for (const m of [fogo, tt, fumaca]) if (m) { m.position.set(x, y + 1, z); scene.add(m); }
  explosoes.push({ fogo, tinta: tt || new THREE.Mesh(), fumaca, t: 0, k });
  if (tt) manchar(new THREE.Vector3(x, alturaChao(x, z) + 0.02, z), new THREE.Vector3(0, 1, 0), '#1f9e46');
  const d = Math.hypot(x - jogador.pos.x, z - jogador.pos.z);
  sons.tocar('tiro', { vol: Math.min(1, 0.7 + 0.15 * k), dist: d, raio: 120 * Math.max(1, k * 0.7), velocidade: 0.45 / Math.sqrt(k) });
  tremor = Math.max(tremor, d < 30 * k ? 0.35 * Math.min(2.5, k) : 0);
}
function atualizarExplosoes(dt) {
  for (let i = explosoes.length - 1; i >= 0; i--) {
    const e = explosoes[i]; e.t += dt; const k = e.t / (1.6 * Math.sqrt(e.k || 1)), s = e.k || 1;
    e.fogo.scale.setScalar((0.5 + k * 6) * s); e.fogo.material.opacity = Math.max(0, 0.95 - k * 2.2);
    if (e.tinta.material) { e.tinta.scale.setScalar(0.4 + k * 4); e.tinta.material.opacity = Math.max(0, 0.9 - k * 1.4); }
    e.fumaca.scale.setScalar((1 + k * 7) * s); e.fumaca.position.y += dt * 2.5 * s; e.fumaca.material.opacity = Math.max(0, 0.6 - k * 0.6);
    if (k >= 1) { for (const m of [e.fogo, e.tinta, e.fumaca]) { scene.remove(m); m.material?.dispose(); } explosoes.splice(i, 1); }
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
    if (n.abduzido) { npcAbduzido(n, dt); continue; }
    if (n.ordem !== undefined) { const off = n.ordem >= configJogo.policia_robo; if (off !== !!n.fora) { n.fora = off; n.av.raiz.visible = !off; if (off) { n.perseguindo = false; n.cerco = null; } } if (off) continue; }
    if (n.bandido && banditoAtivo(n)) { atualizarBandido(n, dt); continue; }
    if (n.algemado) { npcAlgemado(n, dt); continue; }
    if (n.conversa) { conversando(n, dt); continue; }
    if (n.animConversa) { n.animConversa = false; n.av.tocar('walk', { velocidade: 0.85 }); }
    if (n.rendido > 0) { n.rendido -= dt; n.av.mixer.update(dt); continue; }   // parado, com a arma apontada
    if (n.fugindoT > 0) {   // assaltado: corre para longe e depois volta à rotina
      n.fugindoT -= dt; const p = n.av.raiz.position; p.x += n.fugir.dx * 5.5 * dt; p.z += n.fugir.dz * 5.5 * dt; p.y = alturaChao(p.x, p.z);
      n.av.raiz.rotation.y = suavizarAngulo(n.av.raiz.rotation.y, Math.atan2(n.fugir.dx, n.fugir.dz), dt * 8); n.av.mixer.update(dt);
      if (n.fugindoT <= 0) n.av.tocar('walk', { velocidade: 0.85 });
      continue;
    }
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
  atualizarViaturas(dt); atualizarRondasBombeiros(dt); atualizarVansNpc(dt);
}

let caminhaoMovel = null;
function criarCaminhaoMovel() {
  const obj = civico.luzesEm(clonar('caminhao'), 'caminhao', 'frota_caminhao_0'); scene.add(obj);
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
  { x0: -320, z0: -1400, x1: 320, z1: -640 },     // Vila Serra (com a rodovia)
  { x0: -320, z0: 640, x1: 320, z1: 1190 },      // Porto Sul (com a rodovia)
  { x0: 100, z0: -900, x1: 560, z1: -640 },     // aeroporto da Metrópole
  { x0: 100, z0: 900, x1: 900, z1: 1420 },      // bases militares (Quartel, Base Aérea, Base Naval e o mar)
  { x0: -900, z0: -270, x1: -630, z1: 270 },     // Área 51 (só aparece para quem tem acesso)
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
    desenharTransporteNoMapa(g);
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
const NOMES_REGIAO = ['Metrópole', 'Vila Serra', 'Porto Sul', 'Aeroporto', 'Bases militares', 'Área 51'];
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
  r.push({ icone: '🚌', nome: 'Rodoviária', x: RODO.x, z: RODO.z1 + 2 });
  r.push({ icone: '♻️', nome: 'Central de Reciclagem', x: CENTRAL.garagem.x, z: CENTRAL.garagem.z + 2 });
  r.push({ icone: '🚗', nome: 'Autoescola', x: AUTOESCOLA.balcao.x, z: AUTOESCOLA.balcao.z + 2 });
  for (const a of AEROPORTOS) r.push({ icone: '✈️', nome: a.nome, x: a.balcao.x, z: a.balcao.z + (a.eixo === 'x' ? 6 : 0) });
  r.push({ icone: '🏛️', nome: 'Prefeitura', x: civico.PREFEITURA.porta.x, z: civico.PREFEITURA.porta.z + 2 });
  r.push({ icone: '🚗', nome: 'Concessionária (carros)', x: civico.CONCESSIONARIA.balcao.x, z: civico.CONCESSIONARIA.balcao.z + 3 });
  r.push({ icone: '🏦', nome: 'Banco e Agência de Empregos', x: civico.BANCO.balcao.x, z: civico.BANCO.balcao.z + 2 });
  r.push({ icone: '✝', nome: 'Cemitério', x: civico.CEMITERIO.x, z: civico.CEMITERIO.z - 23 });
  r.push({ icone: '🏥', nome: 'Hospital', x: civico.HOSPITAL.balcao.x, z: civico.HOSPITAL.balcao.z - 2 });
  r.push({ icone: '🚒', nome: 'Bombeiros', x: civico.BOMBEIROS.balcao.x, z: civico.BOMBEIROS.balcao.z - 2 });
  for (const f of servicos.listaIncendios()) r.push({ icone: '🔥', nome: f.nome, x: f.x, z: f.z });
  r.unshift(...fugitivosNoMapa());   // fugitivos primeiro: dá para rastrear e o rastreio acompanha
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
  const rm = (x, z) => { const r = regiaoMapa(x, z); return r === 3 ? 0 : r; };   // o aeroporto se alcança por rua
  const rp = rm(jogador.pos.x, jogador.pos.z), ra = rm(rastreio.x, rastreio.z);
  if (rp === ra || rp < 0) return rastreio;
  const linha = (ra === 1 || rp === 1) ? ferrovia.linhas[0] : ferrovia.linhas[1];
  const lado = rp === 0 ? 'centro' : 'destino', p = linha.plataformas[lado];
  return { x: 0, z: p.zSaida, nome: `${p.nome} (trem para ${ra === 0 ? 'a Metrópole' : NOMES_REGIAO[ra]})`, estacao: true };
}
function atualizarRastreio(dt) {
  if (!rastreio) return;
  seguirFugitivoRastreado(); if (!rastreio) return;
  const passo = proximoPasso(), d = Math.hypot(passo.x - jogador.pos.x, passo.z - jogador.pos.z);
  if (beacon) {
    beacon.position.set(passo.x, alturaChao(passo.x, passo.z), passo.z);
    beacon.children[0].material.opacity = 0.22 + Math.sin(performance.now() / 300) * 0.08;
    { const rl = (x, z) => { const r = regiaoMapa(x, z); return r === 3 ? 0 : r; }; beacon.visible = rl(passo.x, passo.z) === rl(jogador.pos.x, jogador.pos.z) || Math.hypot(passo.x - jogador.pos.x, passo.z - jogador.pos.z) < 400; }
  }
  atualizarRastreio.t = (atualizarRastreio.t || 0) - dt;
  if (atualizarRastreio.t <= 0) {
    atualizarRastreio.t = 0.3;
    $('rastreio').innerHTML = `📍 ${passo.estacao ? 'Vá até ' : ''}<b>${passo.nome}</b> · ${Math.round(d)} m <small>(toque para parar)</small>`;
  }
  if (!passo.estacao && d < 5) { aviso(`Você chegou: ${rastreio.nome}`); rastrear(null); }
}
function abrirMapaGrande() {
  regiaoMapaG = Math.max(0, regiaoMapa(jogador.pos.x, jogador.pos.z)); if (regiaoMapaG === 5 && !acessoArea51()) regiaoMapaG = 0;
  $('mapaJanela').classList.remove('oculto');
  desenharMapaGrande();
}
function desenharMapaGrande() {
  const abas = $('mapaAbas');
  abas.innerHTML = NOMES_REGIAO.map((n, i) => i === 5 && !acessoArea51() ? '' : `<button data-reg="${i}" class="${i === regiaoMapaG ? 'sel' : ''}">${n}</button>`).join('');
  abas.querySelectorAll('[data-reg]').forEach((b) => { b.onclick = () => { regiaoMapaG = Number(b.dataset.reg); desenharMapaGrande(); }; });
  const c = $('mapaG'), g = c.getContext('2d'), w = c.width, r = REGIOES_MAPA[regiaoMapaG];
  g.fillStyle = '#86a95c'; g.fillRect(0, 0, w, w);
  const lado = Math.max(r.x1 - r.x0, r.z1 - r.z0), esc = w / lado, ox = (r.x0 + r.x1) / 2 - lado / 2, oz = (r.z0 + r.z1) / 2 - lado / 2;
  if (fundosMapa[regiaoMapaG]) g.drawImage(fundosMapa[regiaoMapaG], ((r.x1 - r.x0) - lado) / 2 > 0 ? 0 : 0, 0, fundosMapa[regiaoMapaG].width, fundosMapa[regiaoMapaG].height, (r.x0 - ox) * esc, (r.z0 - oz) * esc, (r.x1 - r.x0) * esc, (r.z1 - r.z0) * esc);
  const tela = (x, z) => [(x - ox) * esc, (z - oz) * esc];
  desenharBasesNoMapa(g, tela, esc, true);
  desenharLinhasMapaGrande(g, tela, esc);
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
  desenharBasesNoMapa(g, (x, z) => [((x - px) / MAPA_R * 0.5 + 0.5) * w, ((z - pz) / MAPA_R * 0.5 + 0.5) * w], w / (MAPA_R * 2), false);
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
  if (veFugitivos()) {   // fugitivos: piscando no mapa e, se estiverem longe, uma seta vermelha na borda
    const pisca = Math.sin(performance.now() / 150) > 0;
    for (const f of fugitivosNoMapa()) {
      const mx = ((f.x - px) / MAPA_R * 0.5 + 0.5) * w, mz = ((f.z - pz) / MAPA_R * 0.5 + 0.5) * w;
      if (mx > 6 && mz > 6 && mx < w - 6 && mz < w - 6) { desenhar(f.x, f.z, pisca ? '#ff2020' : '#ffffff', f.ladrao !== undefined ? 8 : 6); continue; }
      const a = Math.atan2(mz - w / 2, mx - w / 2), rr = w / 2 - 10;
      g.save(); g.translate(w / 2 + Math.cos(a) * rr, w / 2 + Math.sin(a) * rr); g.rotate(a); g.fillStyle = pisca ? '#ff2020' : '#ffffff'; g.strokeStyle = '#111'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, -7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
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
  const carregamentos = MODELOS.map(async (m) => { try { modelos[m] = prepararEstatico((await carregarGLB(`assets/modelos/${m}.glb${/^(aviao_|onibus_|caminhao_lixo)/.test(m) ? '?v=tex1' : /^caminhao/.test(m) ? '?v=cam2' : ''}`)).scene, /^caminhao/.test(m)); } catch (e) { console.warn('modelo não carregou:', m, e); } });
  const pastaJogador = ROBOS.includes(id) ? 'robos' : 'personagens';
  const skin = perfil.policial ? SKIN_POLICIA : id;
  const avatarP = criarAvatar(ROBOS.includes(skin) ? 'robos' : pastaJogador, skin);
  const roboP = criarAvatar('robos', 'Rusty_Scout_Bot');
  await Promise.all(carregamentos);
  montarQuarteiroes();
  montarPlacasRuas();
  sedes.iniciar({ scene, texturaCanvas, modelo: (n) => modelos[n] });
  mundo.montar({ scene, texturaCanvas, ruido, textoSprite, modelo: (n) => modelos[n], qualidade: () => visual.nivelAtual() });
  ferrovia.montar({ scene, textoSprite, modelo: (n) => modelos[n] });
  ceu.iniciar(scene); clima.ouvirRelampago(() => ceu.raio(foco(), alturaChao, camAtiva === camP ? camP : null));
  clima.iniciar({ scene, alturaChao, naRua, mudou: (t) => { if (jogador.avatar) aviso(t === 'limpo' ? '☀️ O tempo abriu.' : { chuva: '🌧️ Começou a chover.', tempestade: '⛈️ Tempestade chegando! Fique atento aos raios.', neve: '❄️ Começou a nevar.' }[t], 3.5); } });
  carregarClima();
  montarCargueiro(); montarBueiros(); montarEsconderijos();
  prepararTransporte();
  mundo.finalizar();
  semaforos.iniciar(scene, mundo.CRUZAMENTOS, (x, z) => mundo.alturaCalcada(x, z), () => agoraServidor() / 1000);
  // objetos de rua em 3D (leves): bancos de praça, hidrantes e semáforos — carregam em segundo plano
  for (const n of ['banco', 'hidrante']) Promise.resolve(carregarGLB(`assets/modelos/prop_${n}.glb`)).then((g) => { if (g?.scene) mundo.montarProps(n, g.scene, scene); }).catch(() => {});
  // prédios 3D (perto do jogador): carregam em segundo plano
  { const nomes = ['predio_casa1', 'predio_casa2', 'predio_sobrado', 'predio_residencial', 'predio_escritorio', 'predio_galpao'];
    Promise.all(nomes.map((n) => Promise.resolve(carregarGLB(`assets/modelos/${n}.glb`)).then((g) => [n, g?.scene]).catch(() => [n, null]))).then((l) => { const m = Object.fromEntries(l.filter(([, c]) => c)); if (Object.keys(m).length) mundo.ativarPredios3d(m); }); }
  for (const c of mundo.CIDADES) if (c.loja) colocarLojaExtra(c.loja.x, c.loja.z);
  montarAgencias();
  civico.iniciar({ scene, textoSprite, colisores, balcao, janelas: luzesCasas, altura: alturaChao, modelo: (n) => modelos[n] });
  civico.montarPrefeitura(); civico.montarConcessionaria();
  { // degraus da entrada da prefeitura: o personagem sobe neles em vez de afundar
    const P = civico.PREFEITURA;
    mundo.addPiso({ x0: P.x - 15, x1: P.x + 15, z0: P.z + 11.4, z1: P.z + 13.7, h: 0.48 });
    mundo.addPiso({ x0: P.x - 15, x1: P.x + 15, z0: P.z + 11.2, z1: P.z + 12.8, h: 0.78 });
    mundo.addPiso({ x0: P.x - 15, x1: P.x + 15, z0: P.z + 10.9, z1: P.z + 11.9, h: 1.08 });
  }
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
  if (jogador.pena > 0 && cadeia) { const c = posCela(); jogador.pos.set(c.x, 0, c.z); jogador.dentroCasa = 'carceragem'; jogador.saidaSala = { x: cadeia.x + 4.5, z: cadeia.z }; }
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
  iniciarLoja({ usarJujuba: () => usarJujuba(), perfil: () => jogador.perfil, fome: () => jogador.fome, definirFome: (f) => { jogador.fome = f; desenharFome(); }, curar: usarRemedio, vida: () => jogador.vida,
    casaId: () => (typeof jogador.dentroCasa === 'number' ? jogador.dentroCasa : null),
    meuTerreno: () => { const d = casasMundo.get(portaAberta)?.d; return d?.tipo === 'terreno' && d.dono === jogador.perfil.id ? d : null; },
    portaAtual: () => { const d = casasMundo.get(portaAberta)?.d; return moraEm(d) ? d : null; },
    predioAberto: () => casasMundo.get(portaAberta)?.d || null,
    unidadesDe: (pai) => casasLista.filter((u) => u.pai === pai).sort((a, b) => a.id - b.id),
    agora: agoraServidor,
    entrarMoradia: (d) => entrarEmCasa(d),
    casaVendida: () => { tempoSocial = 0; if (jogador.dentroCasa) sairDeCasa(); } });
  racoes.iniciarRacoes({ perfil: () => jogador.perfil, agora: () => agoraServidor(), mudou: (e) => racoesMudou(e), duracaoViagem: (corp) => duracaoViagemJujuba(corp),
    minhasTransportadoras: async () => (await rede.listarEmpresas()).filter((e) => e.dono === jogador.perfil.id && e.tipo === 'transportadora') });
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
    rastrear: (a) => rastrear(a), rastreio: () => rastreio, meuCla: () => jogador.cla, alcanceJato: () => (jogador.carro?.servico === 'bombeiros' ? 16 : 10), obstaculo: (x, z, a, o) => obstaculoAFrente(x, z, a, o), sinal: (x, z, a) => semaforos.sinalAFrente(x, z, a, 9), rondaPerto, posRonda, clas: () => [...clasCache.values()],
    guerrasMudaram: () => {
      atualizarCla();
      const novo = servicos.clasInimigos(jogador.cla, [...clasCache.values()]);
      if ([...novo].join() === [...inimigos].join()) return;
      inimigos = novo; for (const r of remotos.values()) etiquetaStatus(r);
    },
  });
  jornal.iniciarJornal({ perfil: () => jogador.perfil, mudou: () => { tempoJornal = 0.3; tempoTelao = 0; } });
  iniciarGoverno({
    perfil: () => jogador.perfil, vestiario: () => vestiario(), treino: () => entrarTreino(), agora: agoraServidor, recarregar: () => { tempoPrefeitura = 0.3; tempoCarros = 0.5; tempoSocial = 0.5; },
    clas: () => [...clasCache.values()], territorios: () => [...territorios.values()].map((v) => v.d),
    minhasEmpresas: () => [...empresas.values()].filter((e) => e.dono === jogador.perfil.id),
    meusCarros: () => [...carrosMundo.values()].map((v) => v.d).filter((d) => d.dono === jogador.perfil.id),
    veiculos: meusVeiculos, acaoVeiculo, amigosMudaram: () => carregarAmigos(), jornalMudou: () => { tempoJornal = 0.3; tempoTelao = 0; },
    irRedacao: () => entrarRedacao(), tirarFoto: () => tirarFotoRua(), convidarEstudio: () => convidarEstudio(),
    online: () => [...remotos.entries()].map(([id, r]) => ({ id, nome: r.meta?.nome || '?' })), bloqueado: (id) => bloqueados.has(id),
    bloqueiosMudaram: () => carregarBloqueios(), sairDaConta: async () => { await rede.sair(); location.reload(); },
    rastrear: (a) => rastrear(a), portaoEmpresa: (id) => portaoDaEmpresa(id),
    locaisTrabalho: () => ({ policia: pontos.delegacia, prf: civico.PREFEITURA.prf, medico: civico.HOSPITAL.balcao, bombeiro: civico.BOMBEIROS.balcao,
      jornalista: civico.PREFEITURA.jornal, exercito: mundo.QUARTEL.portao, motorista: TERMINAL, fiscal: PONTO_FISCAL, gari: CENTRAL.garagem, piloto: AERO.metro.hangar, controlador: AERO.metro.torre, agencia: civico.BANCO.empregos }), destinosTaxi, voarPara, vida: () => jogador.vida, curar: () => { jogador.vida = 100; desenharFome(); }, pontoMudou: () => servicos.recomecarPonto(),
  });
  $('btVeiculos').onclick = () => abrirServico('veiculos');
  $('btAmigos').onclick = () => abrirServico('amigos');
  const rotuloGrafico = () => { const b = $('btGrafico'); if (b) b.querySelector('span').textContent = `Gráficos: ${visual.NIVEIS[visual.nivelAtual()]}`; };
  rotuloGrafico();
  $('btGrafico').onclick = () => {
    const ordem = ['baixo', 'medio', 'alto'], prox = ordem[(ordem.indexOf(visual.nivelAtual()) + 1) % 3];
    visual.definirNivel(prox); rotuloGrafico(); ajustarCamera();
    aviso(`✨ Gráficos: ${visual.NIVEIS[prox]}${prox === 'baixo' ? ' (mais leve, sem efeitos)' : prox === 'alto' ? ' (mais bonito, pesa mais)' : ''}`, 2.5);
  };
  $('btConta').onclick = () => { abrirServico('conta'); $('menuBar').classList.remove('aberto'); };
  carregarBloqueios();
  $('btTrabalho').onclick = () => abrirServico('trabalho');
  $('btJornal').onclick = () => { abrirServico('jornal'); $('menuBar').classList.remove('aberto'); };
  $('btMenu').onclick = () => $('menuBar').classList.toggle('aberto');
  $('menuItens').addEventListener('click', (e) => { if (e.target.closest('button') && e.target.closest('button').id !== 'btMenu') $('menuBar').classList.remove('aberto'); });
  $('btCamera').onclick = () => { trocarCamera(); $('menuBar').classList.remove('aberto'); };
  $('btCreditos').onclick = () => { creditos(); $('menuBar').classList.remove('aberto'); };
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
    ajustarFarda: () => abrirEditorFarda(),
    relogio: () => ({ ...ajusteHora, hora: horaAtual }),
    deslocParaHora: (h) => deslocParaHora(h),
    relogioMudou: (c) => aplicarRelogio(c),
    prefeito: () => prefeitoAtual,
    prefeitoMudou: () => carregarPrefeitura().catch(() => {}),
    climaMudou: async () => { await carregarClima(); conexao?.enviar('clima', {}); },
    climaAgora: () => clima.atual(), climaConfig: () => clima.config(),
    online: () => [...remotos.entries()].map(([id, r]) => ({ id, nome: r.meta.nome })),
    averiguar: (id, nome) => iniciarAveriguar(id, nome),
    resetFeito: () => { conexao?.enviar('reset', { de: jogador.perfil.id }); setTimeout(() => location.reload(), 2500); },
    configMudou: () => { tempoConfig = 0; },
    posicaoDe: (id) => { const r = remotos.get(id); return r?.av?.raiz.visible ? r.av.raiz.position : (r?.alvo || null); },
    minhaPosicao: () => jogador.pos,
    teleportar,
    esconderArmaPd: () => rede.pd.esconder(jogador.pos.x, jogador.pos.z),
    locais: () => LOCAIS,
    objetosNaRua: () => objetosNaRua(),
    testeDefesa: (base, tipo) => testeDefesa(base, tipo),
    guardasBases: () => ({ a51: 28, quartel: 16, aerea: 16, naval: 16, ...GUARDAS_CONF }),
    definirGuardas: (base, n) => rede.guardas.definir(base, n).then(() => { GUARDAS_CONF[base] = n; const B = BASES.find((b) => b.id === base); if (B) ajustarGuardas(B); }),
    veiculosTeste: () => Object.entries(civico.CARROS).map(([id, c]) => ({ id, nome: `${c.voa ? (id.startsWith('aviao') ? '✈️' : '🚁') : id.includes('onibus') ? '🚌' : id.includes('caminhao') || id === 'bombeiros' ? '🚚' : id === 'tanque' ? '🪖' : '🚗'} ${c.nome}${id === 'onibus_executivo2' ? ' 2' : ''}` })),
    testarVeiculo,
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
    + `Vida <span class="vida" id="barVida"><i></i></span> Fome <span class="fome" id="barFome"><i></i></span>`
    + `<span id="linhaEscudo" style="display:none"> 🛡️<span class="vida escudo" id="barEscudo"><i></i></span><small id="txtEscudo"></small></span><br>`
    + (p.policial ? '<span style="color:#7fb8ff">● Em serviço (polícia)</span><br>' : '') + (p.crimes > 0 ? `<span style="color:#ff6b6b">● PROCURADO <b style="color:#ffd23e;letter-spacing:1px">${estrelas(p.crimes, true)}</b> <small id="perdaoTxt" style="color:#ffb3b3"></small></span><br>` : '')
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
          const chave = (m) => [m.crimes, m.policial, m.cla, m.prf, m.eleitoral, m.prefeito, m.profissao, m.ferido, m.recompensa, m.patente, m.ref].join('|');
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
    voz: (m) => voz.receber(m), gesto: (g) => receberGesto(g), clima: () => carregarClima(), assalto: (a) => avisoAssalto(a), algemaNpc: (m) => receberAlgemaNpc(m), torre: (m) => receberTorre(m), torreOk: (m) => receberTorreOk(m), fiscal: (m) => receberFiscal(m), lixo: (m) => receberLixo(m), bueiro: (m) => receberBueiro(m), carroRua: (m) => receberCarroRua(m), onibusSeq: (m) => receberOnibusSeq(m), denuncia: (m) => receberDenuncia(m), reset: (m) => { if (remotos.get(m?.de)?.meta?.cargo !== 'admin') return; aviso('🧹 O mapa foi resetado. Recarregando…', 3); setTimeout(() => location.reload(), 2500); },   // só vale se veio de um admin on-line
    dano: (d) => receberDano(d), atropelo: (d) => receberAtropelo(d), chat: (m) => receberChat(m),
    abducao: (e) => receberAbducao(e), abducaoRes: (e) => receberAbducaoRes(e), ovniVisto: (e) => receberOvniVisto(e), ovniAbducao: (e) => receberOvniAbducao(e), missil: (e) => receberMissil(e), travado: (e) => receberTravado(e), missilAcerto: (e) => receberMissilAcerto(e), cruzeiro: (e) => receberCruzeiro(e), navio: (e) => receberNavio(e),
    meta: () => metaPresenca(),
  });
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvarAgora(); });
  window.addEventListener('pagehide', salvarAgora);
  voz.iniciar({
    eu: () => (jogador.perfil ? { id: jogador.perfil.id, x: jogador.pos.x, z: jogador.pos.z, cla: jogador.claInfo?.nome || null } : null),
    outros: () => [...remotos.entries()].map(([id, r]) => ({ id, x: r.alvo?.x ?? 0, z: r.alvo?.z ?? 0, cla: r.meta?.cla || null })).filter((o) => remotos.get(o.id)?.alvo && !bloqueados.has(o.id)),
    enviar: (ev, m) => conexao?.enviar(ev, m), aviso, bloqueado: (id) => bloqueados.has(id),
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
    r.av = av; r.arma = arma; r.et = et; r.etCla = null; etiquetaStatus(r);
  } catch (e) { console.warn('jogador remoto não carregou', e); }
}

function removerRemoto(id) {
  const r = remotos.get(id); remotos.delete(id);
  if (!r) return;
  if (r.av) { scene.remove(r.av.raiz); if (r.av.uniforme) scene.remove(r.av.uniforme.colete, r.av.uniforme.chapeu); }
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
    if (a.pg) {   // passageiro de outro jogador (no jipe aberto aparece sentado)
      raiz.position.set(a.x, a.y, a.z); raiz.visible = false; if (r.algemas) r.algemas.visible = false; r.av.mixer.update(dt);
      const vp = a.pg === jogador.perfil?.id ? (jogador.carro?.modelo === 'militar' ? jogador.carro.mesh : null) : (remotos.get(a.pg)?.carroModelo === 'militar' ? remotos.get(a.pg).carro : null);
      if (vp && sentarNoVeiculo(r.av, vp, 'militar', lugarPassageiro(a.id, a.pg))) { r.arma.visible = false; r.anim = 'idle'; }
      continue;
    }
    if (a.vc) {   // dirigindo um veículo de empresa: o veículo segue a posição dele
      pilotos.set(Number(a.vc), { x: a.x, y: a.y, z: a.z, r: a.r, t: performance.now() });
      raiz.position.set(a.x, a.y, a.z); raiz.visible = false; r.av.mixer.update(dt); continue;
    }
    if (a.cv) {   // dirigindo: mostra o carro no lugar do personagem
      const [cid, mod, cor] = String(a.cv).split('|');
      if (!r.carro || r.carroId !== cid) {
        if (r.carro) scene.remove(r.carro); r.carro = civico.modeloCarro(mod, cor); r.carroId = cid; r.carroModelo = mod; r.carro.position.set(a.x, a.y, a.z); scene.add(r.carro);
        // o motor dele pegando, se for perto (o avião só se estiver no chão)
        const d = Math.hypot(a.x - jogador.pos.x, a.z - jogador.pos.z), av = /^aviao_/.test(mod), pf = perfilSom(mod);
        if (av && (a.y || 0) - alturaChao(a.x, a.z) < 1 && d < 150) sons.tocar(`${SOM_AVIAO[mod.slice(6)]}_partida`, { vol: 0.8, dist: d, raio: 150 });
        else if (pf && d < 60) sons.tocar(`${pf.p}_partida`, { vol: 0.6, dist: d, raio: 60, velocidade: pf.tom });
      }
      const kc = Math.min(1, dt * 10);
      r.carro.position.x += (a.x - r.carro.position.x) * kc; r.carro.position.y += (a.y - r.carro.position.y) * kc; r.carro.position.z += (a.z - r.carro.position.z) * kc;
      r.carro.rotation.y = suavizarAngulo(r.carro.rotation.y, a.r, dt * 10);
      r.carro.visible = !a.iv;   // óvni invisível
      if (mod === 'ambulancia' || mod === 'bombeiros') civico.atualizarSirenes(performance.now() / 1000, r.carro);
      raiz.position.copy(r.carro.position); raiz.visible = false; r.av.mixer.update(dt);
      if (sentarNoVeiculo(r.av, r.carro, mod)) { r.arma.visible = false; r.anim = 'idle'; }
      continue;
    }
    if (r.carro) { scene.remove(r.carro); r.carro = null; r.carroId = null; raiz.visible = true; tempoCarros = 0; }
    if (!!a.pq !== !!r.pq) { if (a.pq) { r.pq = paraquedasMesh(); raiz.add(r.pq); } else { raiz.remove(r.pq); r.pq = null; } }   // descendo de paraquedas
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
  const est = { id: j.perfil.id, x: r2(j.pos.x), y: r2(j.pos.y + (j.carro?.voa && !j.carro.caminhao ? j.carro.alt || 0 : 0)), z: r2(j.pos.z), r: r2(j.yaw), a: j.avatar.nomeAtual || 'idle', ar: j.armado ? ARMAS[j.armaTipo || 'basica'].cod : 0, cx: codigoCaixa(j.carregando), al: j.algemado ? 1 : 0, tr: j.trem ? `${j.trem.li}.${j.trem.k}.${j.trem.v}` : 0, cv: j.carro && !j.carro.caminhao ? `${j.carro.id}|${j.carro.modelo}|${j.carro.cor}` : 0, vc: j.carro?.caminhao || j.passageiro?.c.d.id || 0, pg: j.passageiro?.piloto || j.levadoPor || (j.onibus || j.voo ? 1 : 0), cs: codigoEsquadra(), iv: j.carro?.invisivel ? 1 : 0, mh: j.aperto ? 1 : 0, ap: j.algemado ? (j.algemadoPor || 0) : 0, sg: j.segurando ? (j.segurando.npc !== undefined ? 'n' + j.segurando.npc : j.segurando.id) : 0, pq: j.paraquedas ? 1 : 0 };
  const u = ultimoEnvio;
  const mudou = !u || Math.abs(u.x - est.x) > 0.03 || Math.abs(u.z - est.z) > 0.03 || Math.abs(u.r - est.r) > 0.05 || u.a !== est.a || u.ar !== est.ar || u.cx !== est.cx || u.al !== est.al || u.tr !== est.tr || u.cv !== est.cv || u.vc !== est.vc || u.pg !== est.pg || u.cs !== est.cs || u.iv !== est.iv || u.mh !== est.mh || u.ap !== est.ap || u.sg !== est.sg;
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
  const obj = colocarPredio(fabrica && modelos.empresa_f0 ? 'empresa_f0' : !fabrica && modelos.transp_f0 ? 'transp_f0' : modelo, x, z, 0);   // níveis 1–4 (modelo novo quando existe)
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
  const sd = sedes.construir({ x, z, nivel: e.nivel, fabrica, id: e.id, corProduto: PRODUTOS[e.produto]?.cor || '#c9a06a', helis: principal ? helisPorEmpresa.get(e.id) || 0 : 0, nome: e.nome });
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
  if (i.celasMil && presoMilitar()) { const b = caixaCelaMilitar(); p.x = THREE.MathUtils.clamp(p.x, b.x0, b.x1); p.z = THREE.MathUtils.clamp(p.z, b.z0, b.z1); return; }
  if (i.celas && jogador.pena > 0) { const b = caixaCela(); p.x = THREE.MathUtils.clamp(p.x, b.x0, b.x1); p.z = THREE.MathUtils.clamp(p.z, b.z0, b.z1); return; }   // preso: só dentro da cela
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
function criarVeiculo(tipo, danificado) { return civico.luzesEm(criarVeiculoBase(tipo, danificado), tipo === 'helicoptero' ? 'helicoptero' : tipo, `frota_${tipo}_${danificado ? 1 : 0}`); }
function criarVeiculoBase(tipo, danificado) {
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
  return { emb: jogador.embarcado?.id || null, inv: performance.now() < invasorAte ? 1 : 0, nome: p.nome, personagem: skinAtual(), cargo: p.cargo, crimes: p.crimes || 0, policial: !!p.policial, cla: jogador.claInfo?.nome || null,
    prf: !!p.prf, eleitoral: !!p.eleitoral, prefeito: prefeitoAtual === p.id, profissao: p.profissao || null, ferido: !!jogador.ferido, recompensa: p.recompensa || 0, patente: jogador.patente || null, ref: cativo() ? p.cativeiro : 0, farda: jogador.farda || null, on: minhaVolta ? `${minhaVolta.L.id}.${minhaVolta.m}` : 0, tw: estavaNaTorre ? 1 : 0, fs: jogador.perfil?.profissao === 'fiscal' && naRodoviaria(jogador.pos.x, jogador.pos.z, 25) ? 1 : 0, gr: minhaColeta ? minhaColeta.S.id : 0 };
}
// etiqueta acima do nome: procurado, polícia ou clã
function etiquetaStatus(r) {
  if (!r.av) return;
  if (r.status) { r.av.raiz.remove(r.status); r.status = null; }
  const m = r.meta;
  const inimigo = m.cla && inimigos.has(m.cla);
  const txt = m.ferido ? '✚ FERIDO' : m.recompensa > 0 ? `🎯 PROCURADO · ${Number(m.recompensa).toLocaleString('pt-BR')}` : inimigo ? `⚔️ INIMIGO [${m.cla}]` : m.crimes > 0 ? `PROCURADO${m.eleitoral ? ' (PRF)' : ''} ${estrelas(m.crimes)}` : m.prefeito ? '★ PREFEITO ★'
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
  if (golpeNoBoneco(f)) return;
  const forca = Math.round(10 * fatorForca() * (racaoAtiva() ? 1.3 : 1));   // com a ração militar o soco ganha da briga
  for (const n of npcs) {
    if (!n.policia) continue;
    const d = new THREE.Vector3().subVectors(n.av.raiz.position, jogador.pos); d.y = 0;
    const dist = d.length();
    if (dist < 1.7 && dist > 0.01 && d.normalize().dot(f) > 0.5) { acertarPoliciaNPC(n, forca); return; }
  }
  for (const [id, r] of remotos) {
    if (!r.av?.raiz.visible) continue;
    const d = new THREE.Vector3().subVectors(r.av.raiz.position, jogador.pos); d.y = 0;
    const dist = d.length();
    if (dist < 1.7 && dist > 0.01 && d.normalize().dot(f) > 0.5) { aplicarDanoRemoto(id, forca); return; }
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
const podeAlvo = (a) => (a.quem === 'treino' ? daPolicia() || militar() : a.quem ? daPolicia() : militar());
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
    pontosEstande += pts; acertoTreinoTiro();
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
      if (b.pd) acertoDourado(id); else { aplicarDanoRemoto(id, b.dano || 20); if (b.critico) aviso('💥 Acerto crítico!', 1.2); }
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
    for (const v of lista) { if (v.modelo === 'ovni' && !acessoArea51()) continue; const d = Math.hypot(v.mesh.position.x - jogador.pos.x, v.mesh.position.z - jogador.pos.z); if (d < (v.modelo === 'ovni' || JATOS[v.modelo] ? 9 : dm)) { dm = Math.min(dm, d); melhor = v; } }
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
    if (JATOS[sv.modelo] && !(jogador.perfil?.cargo === 'admin' || (militar() && jogador.perfil?.forca === 'aeronautica'))) { aviso('✈️ Os caças são da Aeronáutica: só quem o General Supremo nomeou para a Aeronáutica pilota.', 4); return; }
    if (sv.modelo === 'ovni' && !acessoArea51()) { aviso('Só oficiais do Exército (Tenente para cima) pilotam o óvni.', 3.5); return; }
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
  else if (JATOS[sv.modelo]) prepararJato(jogador.carro);
  else if (sv.modelo === 'ovni') aviso('🛸 Óvni do Exército: acelere para subir e freie para descer. Pare em cima de alguém e toque em 👽 Abduzir. Leva 2 militares.', 5);
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
  if (podeDescarregar()) return ['descarregar', `saquear as ${c.carga} caixas aqui`, 'Saquear'];
  if (c.jujuba) { const cj = contextoComprador(); if (cj) return ['comprador', cj[0], cj[1]]; }
  if (c.servico === 'bombeiros' && Math.abs(c.vel) < 2 && (servicos.estaApagando() || servicos.fogoProximo(15))) return ['jato', servicos.estaApagando() ? 'jogando água (toque para parar)' : 'jogar água no fogo (+400)', 'Jato'];
  if (c.servico === 'ambulancia' && Math.abs(c.vel) < 2 && feridoProximo(7)) return ['socorrer', 'socorrer o ferido (+250)', 'Socorrer'];
  if (c.servico === 'ovni') { const alvo = alvoAbducao(); if (alvo) return ['abduzir', alvo.npc ? 'abduzir o morador' : `abduzir ${alvo.r.meta?.nome || 'o jogador'} (ele não vê nada e acorda em outro lugar)`, '👽 Abduzir']; }
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
function podeDescarregar() {   // o saque é feito onde o clã quiser, com o veículo parado
  const c = jogador.carro;
  return !!(c?.caminhao && c.sequestrado && c.carga > 0 && Math.abs(c.vel) <= 2);
}
async function descarregarRoubo() {
  if (ocupado) return; ocupado = true;
  try {
    const n = await rede.veiculos.descarregar(jogador.carro.caminhao, jogador.pos.x, jogador.pos.z);
    jogador.carro.carga = 0;
    aviso(`📦 ${n} caixas saqueadas ${jogador.cla ? 'para o estoque do clã' : 'para a sua mochila'}!`, 4);
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
  for (const v of rondasBombeiros) if (v.obj.visible) r.push({ o: v.obj, x: v.obj.position.x, z: v.obj.position.z, r: 1.9 });
  for (const k of obstrucoes) r.push({ o: k.marca, x: k.x, z: k.z, r: k.r });   // veículo em chamas ou carcaça: ninguém passa
  for (const v of vansNpc) if (v.obj.visible && jogador.carro?.vanNpc !== v) r.push({ o: v.obj, x: v.obj.position.x, z: v.obj.position.z, r: 1.7 });
  for (const b of onibusNpc) if (b.vivo) { const fx = Math.sin(b.ang), fz = Math.cos(b.ang), h = (b.comp || 12) / 2 - 2; for (let k = -h; k <= h + 0.01; k += h / Math.ceil(h / 4)) r.push({ o: b.mesh, x: b.x + fx * k, z: b.z + fz * k, r: 1.3 }); }
  for (const S of SETORES) if (S.npc?.visible) r.push({ o: S.npc, x: S.npc.position.x, z: S.npc.position.z, r: 1.6 });
  if (jogador.avatar && !jogador.carro && !jogador.passageiro && !jogador.onibus && !jogador.voo && !jogador.dentroCasa && !jogador.paraquedas) r.push({ x: jogador.pos.x, z: jogador.pos.z, r: 0.45, eu: true });
  if (jogador.carro && !jogador.carro.voa && !jogador.carro.taxi) r.push({ o: jogador.carro.mesh, x: jogador.pos.x, z: jogador.pos.z, r: 1.6 });
  corposCache = r; corposT = performance.now();
  return r;
}
// veículo do sistema que segue um horário: se tem alguém parado na frente, ele espera (o atraso cresce) e depois
// recupera devagar. Se ficar travado muito tempo (cruzamento), passa uma vez sem esperar, para não travar tudo.
function frearAtras(st, o, dt, dist = 9, x = o.position.x, z = o.position.z, ang = o.rotation.y, paciencia = 40) {
  st.fantasma = Math.max(0, (st.fantasma || 0) - dt);
  // sinal vermelho à frente: espera na faixa (não conta para a "paciência" de travamento)
  // (medido do bico do veículo: um ônibus comprido não para com a frente já dentro do cruzamento)
  const meio = Math.max(0, dist - 7), bx = x + Math.sin(ang) * meio, bz = z + Math.cos(ang) * meio;
  if (!st.sirene && semaforos.sinalAFrente(bx, bz, ang, meio > 0 ? 5 : Math.min(dist, 10))) { if ((st.atraso || 0) < 120) st.atraso = Math.min(120, (st.atraso || 0) + dt); return st.atraso; }
  // longe de quem joga a checagem é mais espaçada (meio segundo), mas continua: ninguém "entra" no outro fora da vista
  const f = foco(), longe = Math.abs(x - f.x) + Math.abs(z - f.z) > 260;
  let bloq;
  if (longe && (st.prox = (st.prox || 0) - dt) > 0) bloq = st.ultimo;
  else { st.prox = 0.5; bloq = st.ultimo = st.fantasma <= 0 && obstaculoAFrente(x, z, ang, st.ignorar || o, dist, o); }
  if (bloq) { const teto = bloq.fogo ? 1800 : 120; if ((st.atraso || 0) < teto) st.atraso = Math.min(teto, (st.atraso || 0) + dt); if (!bloq.fogo) st.bloq = (st.bloq || 0) + dt; if (st.bloq > paciencia) { st.fantasma = 2; st.bloq = 0; } }   // veículo em chamas: espera de verdade, nunca atravessa
  else { st.bloq = 0; st.atraso = Math.max(0, (st.atraso || 0) - dt * (longe ? 1 : 0.35)); }
  return st.atraso;
}
// quem tem a vez quando dois estão um dentro do outro: regra fixa (o id), igual para todos os aparelhos
const temAVez = (eu, outro) => !outro || (eu?.uuid || '') < (outro.uuid || '');
function obstaculoAFrente(x, z, ang, ignorar, dist = 7.5, eu = null) {
  const fx = Math.sin(ang), fz = Math.cos(ang);
  for (const o of corposNaRua()) {
    if (ignorar && (o.o === ignorar || ignorar.has?.(o.o))) continue;
    const dx = o.x - x, dz = o.z - z, f = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
    if (f > 0.5 && f < dist && lat < 1.5 + o.r) {
      return o.o || true;
    }
    // em cima do outro (os dois no mesmo lugar): um deles para até abrir espaço, senão andam juntos "invisíveis"
    if (eu && o.o && f > -1 && f <= 0.5 && lat < 1 && !temAVez(eu, o.o)) return o.o;
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
  j.vida -= absorverEscudo(v); desenharFome();
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
    acoes: v.d.ladrao ? ['bloquear'] : v.d.modelo === 'presidencial' ? ['chamar', 'materializar'] : ['chamar', 'materializar', 'recolher'] }));
  const frota = [...caminhoes.values()].filter((c) => donoDoVeiculo(c)).map((c) => {
    const d = c.d, heli = d.tipo === 'helicoptero', acoes = [];
    let info = d.status === 'parado' ? 'na garagem' : d.status === 'em_rota' ? 'em entrega' : d.status === 'voltando' ? 'voltando' : 'na rua';
    if (d.sequestrado) { info = d.motorista ? '🚨 ROUBADO (com o ladrão)' : '🚨 ROUBADO (abandonado)'; acoes.push('bloquear'); }
    else {
      if (d.status === 'parado' || (d.status === 'dirigido' && !d.motorista)) acoes.push('taxi', 'materializar');
      if (taxi?.c === c) info = heli ? 'táxi aéreo' : 'dando carona';
      else if (d.status === 'dirigido' && !d.motorista) acoes.push('recolher');
    }
    return { id: d.id, nome: `${NOME_VEICULO[d.tipo] || 'Veículo'} · ${empresas.get(d.empresa)?.nome || ''}`, info, acoes };
  });
  return { carros, frota };
}
function acaoVeiculo(acao, tipo, id) {
  if (acao === 'materializar') { materializar(tipo, id); return; }
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
  if (jogador.carro?.servico === 'ovni') sons.zumbido(0.5);
  else if (jogador.carro?.voa && !jogador.carro.caminhao && !jogador.carro.aviao && !jogador.carro.jato) somHeli(jogador.carro.alt || 0, 0.6);
  if (jogador.passageiro?.piloto) { const o = jogador.passageiro.c.obj; const mp = remotos.get(jogador.passageiro.piloto)?.carroModelo; if (mp === 'ovni') sons.zumbido(0.5); else if (civico.CARROS[mp]?.voa && !String(mp).startsWith('aviao')) somHeli(o.position.y - alturaChao(o.position.x, o.position.z), 0.6); }
  for (const r of remotos.values()) {
    if (!r.carro || !civico.CARROS[r.carroModelo]?.voa || civico.CARROS[r.carroModelo]?.jato || String(r.carroModelo).startsWith('aviao') || jogador.passageiro?.piloto && remotos.get(jogador.passageiro.piloto) === r) continue;
    if (r.carroModelo === 'ovni') { if (r.carro.visible) sons.zumbido(0.45 * sons.perto(dist(r.carro), 90)); continue; }
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
const SOM_AVIAO = { grande: 'aviaoG', medio: 'aviaoM', pequeno: 'aviaoP' };
// som de motor de cada veículo: marcha lenta, rotação alta (os dois em laço), partida e uma acelerada curta (carros e
// ônibus; caminhões não têm). O tom sobe com a velocidade; o tanque usa o caminhão mais grave.
const PERFIL_SOM = {
  popular: 'popular', autoescola: 'popular', esportivo: 'esportivo', presidencial: 'presidencial', suv: 'suv', viatura: 'suv',
  militar: 'jipe', van: 'van', ambulancia: 'van', classico: 'classico',
  caminhao: 'caminhao', caminhao_escola: 'caminhao', caminhao_lixo: 'caminhao', lixo: 'caminhao', bombeiros: 'caminhao', exercito_caminhao: 'caminhao', tanque: 'caminhao',
};
function perfilSom(modelo) {
  if (!modelo) return null;
  if (/^onibus/.test(modelo)) return { p: 'onibus', ronco: true, tom: 1 };
  const p = PERFIL_SOM[modelo]; if (!p) return null;
  return { p, ronco: p !== 'caminhao', tom: modelo === 'tanque' ? 0.78 : 1 };
}
const perfilDoCarro = (c) => perfilSom(c.caminhao ? (c.tipo || 'caminhao') : c.modelo) || perfilSom(c.servico);
function somPartida(c, op = {}) { const pf = c && perfilDoCarro(c); sons.tocar(pf ? `${pf.p}_partida` : 'carro_partida', { vol: pf ? 0.7 : 0.6, velocidade: pf?.tom || 1, ...op }); }
function somMotores(dist) {
  const c = jogador.carro;
  if (c && !c.voa) {
    const pf = perfilDoCarro(c);
    if (pf) {   // parado: marcha lenta; acelerando: entra a rotação alta e o tom sobe; pisar devagar dá uma acelerada
      const max = c.max || civico.CARROS[c.modelo]?.vel || 11, k = THREE.MathUtils.clamp(Math.abs(c.vel || 0) / max, 0, 1);
      const pe = pedais.acel || teclas.has('w') || teclas.has('arrowup') || (Math.abs(joy.y) > 0.3 && !TOQUE);
      const alto = THREE.MathUtils.smoothstep(k + (pe ? 0.25 : 0), 0.08, 0.55);
      sons.continuo(`${pf.p}_lenta`, 0.5 * (1 - alto), (1 + 0.35 * k) * pf.tom);
      sons.continuo(`${pf.p}_alto`, 0.15 + 0.5 * alto, (0.72 + 0.45 * k) * pf.tom);
      const agora = performance.now();
      if (pf.ronco && pe && !c.peAntes && k < (pf.p === 'onibus' ? 0.12 : 0.3) && agora - (c.ultRonco || 0) > (pf.p === 'onibus' ? 9000 : 5000)) { c.ultRonco = agora; sons.tocar(`${pf.p}_ronco`, { vol: 0.6 }); }
      c.peAntes = pe;
    }
  }
  // outros jogadores: andando = rotação alta, parado perto = marcha lenta
  for (const r of remotos.values()) {
    if (!r.carro || civico.CARROS[r.carroModelo]?.voa) continue;
    const pf = perfilSom(r.carroModelo); if (!pf) continue;
    const d = dist(r.carro);
    if (andando(r.carro)) sons.continuo(`${pf.p}_alto`, 0.4 * sons.perto(d, 45), 0.85 * pf.tom); else sons.continuo(`${pf.p}_lenta`, 0.3 * sons.perto(d, 25), pf.tom);
  }
  for (const v of caminhoes.values()) {
    if (v.d.tipo === 'helicoptero' || !v.obj?.visible || jogador.carro?.caminhao === v.d.id || !andando(v.obj)) continue;
    sons.continuo(v.d.tipo === 'van' ? 'van_alto' : 'caminhao_alto', 0.35 * sons.perto(dist(v.obj), 45), 0.9);
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
  if (averiguando && m.de === averiguando.id) mostrarFalaAveriguado(m);   // equipe averiguando vê tudo o que ele escreve (até o privado)
  if (m.privado && !amigosIds.has(m.de)) return;      // modo privado: só os amigos veem
  if (bloqueados.has(m.de)) return;                   // bloqueado: some do meu chat
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
// o aviso de cargo fica no topo; um toque minimiza (só o ícone) e outro mostra de novo — lembrado no aparelho
let patenteMin = false; try { patenteMin = localStorage.getItem('patenteMin') === '1'; } catch { }
function mostrarPatente(texto) {
  const chip = $('patente'); if (!chip) return;
  chip.dataset.texto = texto || '';
  if (!chip.dataset.ligado) { chip.dataset.ligado = '1'; chip.title = 'Toque para minimizar / mostrar'; chip.addEventListener('click', (e) => { e.stopPropagation(); patenteMin = !patenteMin; try { localStorage.setItem('patenteMin', patenteMin ? '1' : '0'); } catch { } mostrarPatente(chip.dataset.texto); }); }
  chip.classList.toggle('min', patenteMin && !!texto);
  chip.textContent = !texto ? '' : patenteMin ? texto.split(' ')[0] : texto;
}
function atualizarCarreira(dt) {
  const p = jogador.perfil;
  const emServico = p && (p.policial || p.prf || p.profissao);
  const chip = $('patente');
  if (!emServico) {
    jogador.patente = null;
    if (chip) { const e = emprego && empresas.get(emprego); mostrarPatente(e && e.dono !== p?.id ? `💼 ${e.nome}` : ''); }
    return;
  }
  tempoTurno -= dt;
  if (tempoTurno > 0) return;
  tempoTurno = 60;
  rede.carreiras.turno(jogador.pos.x, jogador.pos.z).then((r) => {
    if (!r) return;
    const antes = jogador.patente;
    jogador.patente = r.nome; jogador.patenteNivel = Number(r.nivel) || 0;
    if (chip) mostrarPatente(`🎖️ ${r.nome} · ${Math.floor(r.minutos / 60)}h${String(r.minutos % 60).padStart(2, '0')}${r.proximo ? ` · ${r.proximo} em ${r.falta} min` : ' · topo da carreira'}`);
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
  const n = npcs.find((k) => k.policia && !k.fora && k.perseguindo) || npcs.find((k) => k.policia && !k.fora); if (!n) return;
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
  if (!golpePlausivel(d.de)) return;
  if (jogador.carro) sairCarro();
  jogador.vida -= absorverEscudo(Math.max(0, Math.min(100, Number(d.v) || 0))); jogador.ultimoAgressor = d.de;
  desenharFome();
  if (jogador.vida <= 0) { aviso('Você foi atropelado!', 3); morrerLocal(); }
  else { aviso('💥 Você foi atropelado!', 2); jogador.trava = 0.6; jogador.avatar.tocar('hit', { umaVez: true, velocidade: 1.2, fade: 0.08 }); }
}
// trem em movimento mata quem está no trilho (a pé ou de carro)
function checarTrem() {
  const j = jogador;
  if (j.morto || j.trem || j.dentroCasa || j.passageiro || j.carro?.voa || !j.avatar || j.pena > 0 || j.perfil?.imortal) return;
  if (ferrovia.atropela(j.pos, j.carro ? 1.2 : 0.35)) { if (j.carro) acidenteVeiculo(j.carro, '🚆💥 O trem acertou o veículo!'); j.vida = 0; j.ultimoAgressor = null; desenharFome(); aviso('🚆 Você foi atropelado pelo trem!', 4); morrerLocal(); }
}
// cada atacante acerta no máximo 8 vezes por segundo (mais que isso é mensagem forjada no canal)
const golpesRecebidos = new Map();
function golpePlausivel(de) {
  const t = performance.now(), g = golpesRecebidos.get(de) || { t, n: 0 };
  if (t - g.t > 1000) { g.t = t; g.n = 0; }
  g.n++; golpesRecebidos.set(de, g);
  return g.n <= 8;
}
function receberDano(d) {
  if (d.alvo !== jogador.perfil?.id || jogador.morto || !jogador.avatar) return;
  if (jogador.perfil.imortal || jogador.pena > 0) return;
  const r = remotos.get(d.de);
  if (!r?.av || r.av.raiz.position.distanceTo(jogador.pos) > 30) return;     // golpe de longe demais: ignora
  if (!golpePlausivel(d.de)) return;                                           // rápido demais para ser de verdade
  const v = Math.max(0, Math.min(80, Number(d.v) || 0)) * (1 - bonusTreino('luta'));   // treino de luta: defesa
  jogador.vida -= absorverEscudo(v); jogador.ultimoAgressor = d.de;
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
  // sem atendimento, renasce no hospital depois do tempo do admin (padrão 90 s); a ambulância ou um médico antes levantam aqui mesmo
  const espera = THREE.MathUtils.clamp(Number(configJogo.respawn_seg) || 90, 15, 300);
  j.renasceEm = performance.now() + espera * 1000;
  j.timerHospital = setTimeout(renascer, espera * 1000);
  if (seg) aviso(medico ? `🚑 Um socorrista foi chamado. Se ele não chegar, a ambulância da prefeitura vem em ~${Math.ceil(seg)} s.` : `🚑 Ambulância chegando em ~${Math.ceil(seg)} s.`, 5);
}
// contagem na tela enquanto espera atendimento
function contagemMorte(txt) {
  let el = $('contagemMorte');
  if (!el) { el = document.createElement('div'); el.id = 'contagemMorte'; el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 18vh);z-index:9;pointer-events:none;font:700 15px system-ui;color:#fff;background:rgba(120,20,20,.85);padding:8px 14px;border-radius:12px;text-align:center;max-width:88vw'; document.body.appendChild(el); }
  el.style.display = txt ? 'block' : 'none'; if (txt) el.textContent = txt;
}
function atualizarContagemMorte() {
  const j = jogador;
  if (!j.morto || !j.renasceEm) { if ($('contagemMorte')?.style.display === 'block') contagemMorte(''); return; }
  const f = Math.max(0, Math.ceil((j.renasceEm - performance.now()) / 1000));
  contagemMorte(`🚑 Esperando atendimento · 🏥 renasce no hospital em ${Math.floor(f / 60)}:${String(f % 60).padStart(2, '0')}`);
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
  const j = jogador; j.renasceEm = 0; contagemMorte('');
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
const QUADRAS_POLICIA = [[1, 1], [2, 2], [0, 0], [3, 3], [0, 3], [3, 0], [-1, 1], [4, 2], [1, -1], [2, 4], [-1, 3], [4, 0],
  [-2, -2], [5, 5], [-3, 4], [6, 1], [2, -3], [-4, 0], [7, 3], [3, 6]];   // as 8 últimas só aparecem se o admin aumentar
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
      const n = { id: k < 12 ? k + 1 : 21 + (k - 12), policia: true, ordem: k, av, rota, laco: laco(rota), vel: 1.5, fase: k * 41, vida: 100, caido: 0, hostil: 0, tiro: 0 };
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
  criarViaturas(); criarRondasBombeiros(); criarVansNpc();
  rede.robos.listar().then((l) => { for (const r of l) aoRobo(r); }).catch(() => {});
}
// percurso fechado (volta da quadra) e ponto nele pelo relógio do servidor: todos veem o robô no mesmo lugar
// arredonda as esquinas de um caminho fechado (curva de até r metros), para ninguém virar "no canto"
function arredondarLaco(pts, rmax = 8) {
  const n = pts.length; if (n < 3) return pts;
  const r = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], p = pts[i], b = pts[(i + 1) % n];
    const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]), l2 = Math.hypot(b[0] - p[0], b[1] - p[1]);
    if (l1 < 0.01 || l2 < 0.01) { r.push(p); continue; }
    const d1 = [(p[0] - a[0]) / l1, (p[1] - a[1]) / l1], d2 = [(b[0] - p[0]) / l2, (b[1] - p[1]) / l2];
    if (Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) < 0.05 && d1[0] * d2[0] + d1[1] * d2[1] > 0) { r.push(p); continue; }
    const rr = Math.min(rmax, l1 * 0.45, l2 * 0.45), q0 = [p[0] - d1[0] * rr, p[1] - d1[1] * rr], q2 = [p[0] + d2[0] * rr, p[1] + d2[1] * rr];
    for (let k = 0; k <= 6; k++) { const t = k / 6, u = 1 - t; r.push([u * u * q0[0] + 2 * u * t * p[0] + t * t * q2[0], u * u * q0[1] + 2 * u * t * p[1] + t * t * q2[1]]); }
  }
  return r;
}
function laco(pts, curva = false) {
  if (curva) pts = arredondarLaco(pts);
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
// laço com velocidade fixa: a posição que falta por causa da arrancada vira atraso (atraso += falta / vel)
function arrancarLaco(st, u, vel, modelo, dt) {
  const r = arrancar(st, u, dt, modelo, vel);
  if (r < u) st.atraso += (u - r) / vel;
  return r;
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
    viaturas.push({ id: 13 + k, obj, laco: laco(pts, true), vel: 7, fase: k * 120, perseguindo: false });
  });
}
// caminhões dos bombeiros fazendo ronda pela cidade (o mais perto de um incêndio vai atender)
const rondasBombeiros = [];
function criarRondasBombeiros() {
  const faixa = 2.5;
  [[-2, -2, 2, 2], [1, -3, 6, 2], [-3, 2, 2, 7]].forEach(([a, b, c, d], k) => {
    const cantos = [[ruaC(a), ruaC(b)], [ruaC(c), ruaC(b)], [ruaC(c), ruaC(d)], [ruaC(a), ruaC(d)]];
    const pts = cantos.map(([x, z], i) => { const nx = cantos[(i + 1) % 4][0] - x, nz = cantos[(i + 1) % 4][1] - z, l = Math.hypot(nx, nz); return [x - nz / l * faixa, z + nx / l * faixa]; });
    const obj = civico.modeloCarro('bombeiros', '#ffffff'); scene.add(obj);
    rondasBombeiros.push({ obj, laco: laco(pts, true), vel: 6.5, fase: k * 170 + 40, st: { atraso: 0 } });
  });
}
// vans de entrega NPC rodando pela cidade (dá para sequestrar)
const vansNpc = [];
function criarVansNpc() {
  const faixa = 2.5;
  [[-1, -3, 3, 1], [2, 1, 6, 5], [-4, -1, 0, 4], [0, 3, 5, 7]].forEach(([a, b, c, d], k) => {
    const cantos = [[ruaC(a), ruaC(b)], [ruaC(c), ruaC(b)], [ruaC(c), ruaC(d)], [ruaC(a), ruaC(d)]];
    if (k % 2) cantos.reverse();
    const pts = cantos.map(([x, z], i) => { const nx = cantos[(i + 1) % 4][0] - x, nz = cantos[(i + 1) % 4][1] - z, l = Math.hypot(nx, nz); return [x - nz / l * faixa, z + nx / l * faixa]; });
    const obj = civico.modeloCarro('van', ['#f2f2ee', '#d8d8d2', '#c9302c', '#2d5fa8'][k]); scene.add(obj);
    vansNpc.push({ id: k, obj, laco: laco(pts, true), vel: 7.5, fase: k * 97 + 23, st: { atraso: 0 } });
  });
}
function atualizarVansNpc(dt) {
  for (const v of vansNpc) {
    const o = v.obj;
    if (v.roubada) {
      if (jogador.carro?.vanNpc === v) continue;
      if (v.largadaAte && agoraServidor() > v.largadaAte && !veiculoEmChamas('van:' + v.id)) { v.roubada = false; v.largadaAte = 0; if (o.userData.queimado) limparQueimado(o); }
      continue;
    }
    frearAtras(v.st, o, dt, 7.5);
    const p = pontoNoLaco(v.laco, arrancarLaco(v.st, (agoraServidor() / 1000 - v.st.atraso) * v.vel + v.fase, v.vel, 'van', dt));
    if (Math.hypot(p.x - o.position.x, p.z - o.position.z) > 25) o.position.set(p.x, alturaChao(p.x, p.z), p.z);
    else { o.position.x += (p.x - o.position.x) * Math.min(1, dt * 4); o.position.z += (p.z - o.position.z) * Math.min(1, dt * 4); o.position.y = alturaChao(o.position.x, o.position.z); }
    o.rotation.y = suavizarAngulo(o.rotation.y, p.ang, dt * 5);
  }
}
const posRonda = (i) => { const v = rondasBombeiros[i]; return v && { x: v.obj.position.x, z: v.obj.position.z, ang: v.obj.rotation.y }; };
function rondaPerto(x, z, ocupadas) {
  let m = null, dm = Infinity;
  rondasBombeiros.forEach((v, i) => { if (ocupadas.has(i)) return; const d = Math.hypot(v.obj.position.x - x, v.obj.position.z - z); if (d < dm) { dm = d; m = { i, ...posRonda(i) }; } });
  return m;
}
function atualizarRondasBombeiros(dt) {
  const ocup = servicos.rondasOcupadas();
  rondasBombeiros.forEach((v, i) => {
    const o = v.obj; o.visible = !ocup.has(i); if (!o.visible) return;
    civico.atualizarSirenes(0, o);
    frearAtras(v.st, o, dt, 8);
    const p = pontoNoLaco(v.laco, arrancarLaco(v.st, (agoraServidor() / 1000 - v.st.atraso) * v.vel + v.fase, v.vel, 'bombeiros', dt));
    if (Math.hypot(p.x - o.position.x, p.z - o.position.z) > 25) o.position.set(p.x, alturaChao(p.x, p.z), p.z);
    else { o.position.x += (p.x - o.position.x) * Math.min(1, dt * 4); o.position.z += (p.z - o.position.z) * Math.min(1, dt * 4); o.position.y = alturaChao(o.position.x, o.position.z); }
    o.rotation.y = suavizarAngulo(o.rotation.y, p.ang, dt * 5);
  });
}
function atualizarViaturas(dt) {
  const t = performance.now() / 1000, j = jogador;
  const denuncia = performance.now() - (j.denunciadoEm || -1e9) < 120000;
  const atacou = (performance.now() - (j.atacouPolicia || -1e9) < 120000 || denuncia) && (j.perfil?.crimes || 0) > 0;
  const cacado = ((j.perfil?.recompensa || 0) > 0 || atacou) && !j.morto && !(j.pena > 0) && !j.dentroCasa && !j.trem;
  for (const v of viaturas) {
    const o = v.obj;
    civico.atualizarSirenes(v.perseguindo || remotoAtivo(v) ? t : 0, o);
    if (v.roubada) { if (jogador.carro?.viatura !== v) atualizarViaturaRoubada(v); if (v.pe) atualizarViaturaAPe(v, dt); continue; }
    if (v.pe) { atualizarViaturaAPe(v, dt); continue; }
    if (remotoAtivo(v)) {   // perseguição de outro jogador: segue o que ele gravou
      const r = v.remoto, dx = r.x - o.position.x, dz = r.z - o.position.z, d = Math.hypot(dx, dz);
      if (d > 40) o.position.set(r.x, alturaChao(r.x, r.z), r.z); else { o.position.x += dx * Math.min(1, dt * 3); o.position.z += dz * Math.min(1, dt * 3); }
      if (d > 0.3) o.rotation.y = suavizarAngulo(o.rotation.y, Math.atan2(dx, dz), dt * 5);
      continue;
    }
    if (cacado) {
      const dx = j.pos.x - o.position.x, dz = j.pos.z - o.position.z, d = Math.hypot(dx, dz);
      if (!v.perseguindo && d < (atacou ? 160 : 90)) { v.perseguindo = true; aviso(denuncia ? '🚓 O pedestre chamou a polícia: uma viatura está vindo!' : atacou ? '🚓 Você atirou na polícia: as viaturas estão vindo!' : '🚓 Uma viatura da polícia está atrás de você!', 3); }
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
          // fim das ruas e você fora da pista (terreno, entre prédios): a viatura encosta e os policiais seguem a pé
          else if (!j.carro && !mundo.naRua(j.pos.x, j.pos.z) && d < 45) { descerPoliciais(v); continue; }
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
    v.st ||= { atraso: 0 }; frearAtras(v.st, o, dt, 8);
    const p = pontoNoLaco(v.laco, arrancarLaco(v.st, (agoraServidor() / 1000 - v.st.atraso) * v.vel + v.fase, v.vel, 'viatura', dt));
    if (Math.hypot(p.x - o.position.x, p.z - o.position.z) > 25) o.position.set(p.x, alturaChao(p.x, p.z), p.z);
    else { o.position.x += (p.x - o.position.x) * Math.min(1, dt * 4); o.position.z += (p.z - o.position.z) * Math.min(1, dt * 4); o.position.y = alturaChao(o.position.x, o.position.z); }
    o.rotation.y = suavizarAngulo(o.rotation.y, p.ang, dt * 5);
  }
}
// ---------------------------------------------------------------- viatura que encosta: policiais robôs a pé
// Na perseguição, se você sai da pista (terreno, entre prédios), a viatura encosta e descem dois policiais robôs que
// seguem a pé. A viatura fica destrancada enquanto eles estão fora: dá para roubar. Se ao voltar ela sumiu, chamam reforço.
function descerPoliciais(v) {
  const o = v.obj;
  v.perseguindo = false;
  v.pe = { t: 0, robos: [], volta: false, x: o.position.x, z: o.position.z, ang: o.rotation.y };
  aviso('🚓 A viatura encostou: dois policiais robôs desceram e vêm atrás de você a pé!', 3.5);
  const rx = -Math.cos(o.rotation.y), rz = Math.sin(o.rotation.y);
  for (let k = 0; k < 2; k++) {
    criarAvatar('robos', SKIN_POLICIA).then((av) => {
      if (!v.pe) return;
      const lado = k ? -1 : 1, x = o.position.x + rx * 1.6 * lado, z = o.position.z + rz * 1.6 * lado;
      av.raiz.position.set(x, alturaChao(x, z), z); scene.add(av.raiz); av.tocar('run');
      const et = textoSprite('Polícia', { escala: 0.6, fundo: 'rgba(30,70,160,.92)' }); et.position.y = 2.2; av.raiz.add(et);
      v.pe.robos.push({ av, dentro: false });
    }).catch(() => {});
  }
}
function atualizarViaturaAPe(v, dt) {
  const pe = v.pe, j = jogador; pe.t += dt;
  civico.atualizarSirenes(performance.now() / 1000, v.obj);
  const procurado = (j.perfil?.crimes || 0) > 0 && !j.morto && !(j.pena > 0) && !j.dentroCasa;
  // desistem: longe demais, você pegou um carro e foi para a rua, ou já passou um minuto e meio
  if (!pe.volta && (!procurado || pe.t > 90 || (j.carro && mundo.naRua(j.pos.x, j.pos.z)))) pe.volta = true;
  let fora = 0;
  for (const r of pe.robos) {
    if (r.dentro) continue; fora++;
    const p = r.av.raiz.position, alvo = pe.volta ? { x: pe.x, z: pe.z } : j.pos;
    const dx = alvo.x - p.x, dz = alvo.z - p.z, d = Math.hypot(dx, dz);
    if (!pe.volta && d > 60) { pe.volta = true; aviso('🚓 Os policiais perderam você de vista e voltaram para a viatura.', 3); }
    if (!pe.volta && d < 1.4 && !ocupado && !j.carro) {
      ocupado = true; pe.volta = true;
      rede.recompensas.presoPorRobo().then((min) => { if (min) aviso(`🚓 Os policiais te pegaram a pé: ${min} min de pena.`, 4); }).catch((e) => aviso(e.message)).finally(() => { ocupado = false; });
    }
    if (d > 0.6) { const vel = pe.volta ? 3.5 : 6.2; p.x += dx / d * vel * dt; p.z += dz / d * vel * dt; p.y = alturaChao(p.x, p.z); r.av.raiz.rotation.y = suavizarAngulo(r.av.raiz.rotation.y, Math.atan2(dx, dz), dt * 8); }
    if (pe.volta && r.av.nomeAtual !== 'walk') r.av.tocar('walk');
    r.av.mixer.update(dt);
    if (pe.volta && d < 1.5) { r.dentro = true; scene.remove(r.av.raiz); }
  }
  if (pe.volta && pe.robos.length && !fora) {   // todos voltaram
    if (v.roubada) {
      aviso('🚓 Os policiais voltaram e a viatura tinha sumido: chamaram reforço!', 4);
      const outra = viaturas.filter((x) => x !== v && !x.roubada && !x.pe).sort((a, b) => Math.hypot(a.obj.position.x - j.pos.x, a.obj.position.z - j.pos.z) - Math.hypot(b.obj.position.x - j.pos.x, b.obj.position.z - j.pos.z))[0];
      if (outra) { outra.perseguindo = true; outra.rota = null; j.denunciadoEm = performance.now(); }
    }
    v.pe = null;
  }
}
// viatura parada com a porta aberta (policiais fora): o botão de ação vira Roubar
// alguém foi assaltado e chamou a polícia: policiais e PRF recebem o chamado com o local; quem está perto vê também
function receberDenuncia(m) {
  const d = Math.hypot(m.x - jogador.pos.x, m.z - jogador.pos.z);
  if (jogador.perfil?.policial || jogador.perfil?.prf) { aviso(`🚨 Chamado: assalto a pedestre na ${m.rua}. Suspeito: ${m.nome}.`, 5); rastrear({ nome: '🚨 Assalto a pedestre', x: m.x, z: m.z }); }
  else if (d < 120) aviso(`🚨 Um pedestre chamou a polícia: assalto na ${m.rua}.`, 3.5);
}
function viaturaAbandonadaPerto() {
  if (jogador.carro || jogador.dentroCasa || jogador.passageiro || jogador.onibus || jogador.morto || jogador.perfil?.policial || jogador.perfil?.prf) return null;
  for (const v of viaturas) {
    const largada = v.roubada && jogador.carro?.viatura !== v && (v.largadaAte || 0) > agoraServidor();
    if (!(v.pe && !v.roubada) && !largada) continue;
    if (veiculoEmChamas('via:' + v.id)) continue;
    if (Math.hypot(v.obj.position.x - jogador.pos.x, v.obj.position.z - jogador.pos.z) < 3.6) return v;
  }
  return null;
}
async function roubarViatura(v) {
  if (ocupado) return; ocupado = true;
  try {
    await rede.roubarCarroRua();   // conta como crime (fica procurado)
    v.roubada = true; v.largadaAte = 0;
    entrarCarro({ d: { id: 'via' + v.id, modelo: 'viatura', cor: '#ffffff' }, mesh: v.obj });
    jogador.carro.viatura = v; jogador.carro.salvar = 1e9;
    aviso('🚨 Você roubou a viatura! Largada, ela volta para a polícia depois de 3 min.', 4);
  } catch (e) { aviso(e.message, 3); }
  finally { ocupado = false; }
}
function largarViatura(c) {
  const v = c.viatura;
  jogador.carro = null; modoVolante(false);
  const x = jogador.pos.x, z = jogador.pos.z, r = jogador.yaw;
  v.obj.position.set(x, alturaChao(x, z), z); v.obj.rotation.y = r;
  v.largadaAte = agoraServidor() + 180000;
  ultimoLargado = { ref: 'via:' + v.id, ate: agoraServidor() + 90000 };
  const lx = Math.cos(r) * 1.8, lz = -Math.sin(r) * 1.8;
  jogador.pos.x += lx; jogador.pos.z += lz; resolverColisao(jogador.pos, jogador.raio);
  jogador.avatar.raiz.visible = true;
  aviso('Viatura largada. Dá para pôr fogo nela. Em 3 min a polícia vem buscar.', 3.5);
}
function atualizarViaturaRoubada(v) {
  civico.atualizarSirenes(0, v.obj);
  if ((v.largadaAte || 0) && agoraServidor() > v.largadaAte && !veiculoEmChamas('via:' + v.id)) {   // a polícia recolheu: volta para a ronda
    v.roubada = false; v.largadaAte = 0; v.pe = null; if (v.obj.userData.queimado) limparQueimado(v.obj);
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
// painel do admin: o que está em cima do asfalto (casas e terrenos do banco, territórios, lixeiras e pontos)
function objetosNaRua() {
  ajustarAoMapa();
  const r = [], ve = (x, z, m) => mundo.naRua(x, z, m);
  const TIPO = { casa: '🏠 Casa', terreno: '🏗️ Terreno', apto: '🏢 Apto', unidade: '🏭 Unidade', oficial: '🏛️ Residência' };
  const vistos = new Set();
  for (const c of casasLista) {
    const k = `${Math.round(c.x)},${Math.round(c.z)}`; if (vistos.has(k)) continue; vistos.add(k);
    if (ve(c.x, c.z, c.tipo === 'terreno' ? 4 : 1)) r.push({ tipo: TIPO[c.tipo || 'casa'] || '🏠 Casa', nome: `${c.rotulo || ''} (id ${c.id})`, x: c.x, z: c.z });
  }
  for (const v of territorios.values()) if (v.d && ve(v.d.x, v.d.z, 2)) r.push({ tipo: '🚩 Território', nome: v.d.nome, x: v.d.x, z: v.d.z });
  for (const l of LIXEIRAS) if (ve(l.x, l.z, 0.3)) r.push({ tipo: '🗑️ Lixeira', nome: `setor ${l.setor}`, x: l.x, z: l.z });
  for (const L of LINHAS) for (const p of L.pontos) { const q = pontoCaminho(L, p.s), x = q.x - Math.cos(q.ang) * 4.6, z = q.z + Math.sin(q.ang) * 4.6; if (ve(x, z, 0.3)) r.push({ tipo: '🚏 Ponto', nome: `${p.nome} · ${L.curto}`, x, z }); }
  return r;
}
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
  for (const a of AEROPORTOS) LOCAIS.push({ nome: `✈️ ${a.nome}`, x: a.balcao.x, z: a.balcao.z + (a.eixo === 'x' ? 4 : 0) });
  LOCAIS.push({ nome: '🛸 Área 51 (portão)', x: mundo.AREA51.x1 + 8, z: 0 });
  LOCAIS.push({ nome: '🪖 Quartel do Exército (portão)', x: mundo.QUARTEL.x0 - 8, z: mundo.QUARTEL.portao.z });
  LOCAIS.push({ nome: '✈️ Base Aérea (portão)', x: mundo.BASE_AEREA.portao.x, z: mundo.BASE_AEREA.z0 - 8 });
  LOCAIS.push({ nome: '⚓ Base Naval (portão)', x: mundo.BASE_NAVAL.portao.x, z: mundo.BASE_NAVAL.z0 - 8 });   // o admin entra; os outros levam tiro
  LOCAIS.push({ nome: '🛩️ Aviões dos pilotos (frota)', x: 444, z: -728 });
  LOCAIS.push({ nome: '🚌 Rodoviária', x: RODO.guiche.x - 2, z: RODO.guiche.z });
  LOCAIS.push({ nome: '♻️ Central de Reciclagem', x: CENTRAL.garagem.x, z: CENTRAL.garagem.z + 2 });
  LOCAIS.push({ nome: '🚗 Autoescola', x: AUTOESCOLA.balcao.x, z: AUTOESCOLA.balcao.z + 2 });
  if (pontos.lojas[0]) LOCAIS.push({ nome: 'Loja', x: pontos.lojas[0].x, z: pontos.lojas[0].z + 1.5 });
  if (pontos.sucata[0]) LOCAIS.push({ nome: 'Ferro-velho', x: pontos.sucata[0].x + 3.5, z: pontos.sucata[0].z + 3.5 });
  if (pontos.bancadas[0]) LOCAIS.push({ nome: 'Bancada (chocolate)', x: pontos.bancadas[0].x, z: pontos.bancadas[0].z + 2.5 });
  LOCAIS.push({ nome: 'Base Leste', x: BASE_X - 26, z: ruaC(2) });
  LOCAIS.push({ nome: 'Base Oeste', x: -BASE_X + 26, z: ruaC(2) });
  LOCAIS.push({ nome: 'Quartel do Exército', x: mundo.QUARTEL.portao.x - 4, z: mundo.QUARTEL.portao.z });
  LOCAIS.push({ nome: 'Estande de tiro', x: 153, z: 1096 });
  for (const l of ferrovia.linhas) for (const lado of ['centro', 'destino']) { const p = l.plataformas[lado]; LOCAIS.push({ nome: p.nome, x: 0, z: p.zSaida }); }
  for (const e of ESCONDERIJOS) LOCAIS.push({ nome: `⛺ ${e.nome}`, x: e.x + 3.5, z: e.z + 3.5 });
  for (const [id, p] of Object.entries(PORTAS_QG)) LOCAIS.push({ nome: `🏴 QG do clã (${id === 'leste' ? 'Leste' : 'Oeste'})`, x: p.x + (p.x > 0 ? -2 : 2), z: p.z });
  LOCAIS.push({ nome: '🚢 Píer do cargueiro', x: 48, z: 1112 });
  LOCAIS.push({ nome: 'Prefeitura', x: civico.PREFEITURA.porta.x, z: civico.PREFEITURA.porta.z + 3 });
}

function teleportar(x, z) {
  if (jogador.carro) sairCarro();
  if (jogador.trem) { ferrovia.ocultarTeto(jogador.trem.li, jogador.trem.k, false); jogador.trem = null; }
  if (jogador.pena > 0 && cadeia) { const c = posCela(); x = c.x; z = c.z; jogador.dentroCasa = 'carceragem'; jogador.saidaSala = { x: cadeia.x + 4.5, z: cadeia.z }; }
  else if (cativo()) { const c = ESCONDERIJOS[jogador.perfil.cativeiro - 1]; x = c.x; z = c.z; }
  else if (presoMilitar()) { const c = posCelaMilitar(); x = c.x; z = c.z; jogador.dentroCasa = 'prisaomilitar'; jogador.saidaSala = { x: mundo.QUARTEL.portao.x - 2, z: mundo.QUARTEL.portao.z }; }
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
    scene.remove(velho.raiz); velho.raiz.remove(jogador.etiqueta); vestir(velho, null);
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
  if (novo.profissao === 'mecanico' && antigo.profissao !== 'mecanico') rastrear({ nome: '🔧 Aviões da frota', x: 444, z: -728, frota: true });
  if (novo.profissao === 'piloto' && antigo.profissao !== 'piloto') rastrear({ nome: '🛩️ Aviões dos pilotos', x: 444, z: -728, frota: true });
  if (novo.profissao !== antigo.profissao) aviso(novo.profissao === 'medico' ? 'Plantão médico: socorra os feridos (✚) pela cidade. +250 por socorro.' : novo.profissao === 'bombeiro' ? 'Você está em serviço nos bombeiros. Apague os incêndios (🔥). +400 por fogo.' : novo.profissao === 'jornalista' ? 'Você é jornalista: vá até incêndios, ocorrências e feridos e toque em Reportar (+200).' : novo.profissao === 'piloto' ? '✈️ Você é piloto! Siga a marca até os aviões da frota no Aeroporto da Metrópole e toque em Pilotar.' : novo.profissao === 'controlador' ? '🗼 Você é controlador de voo! Fique na torre do Aeroporto e autorize pousos e decolagens.' : novo.profissao === 'motorista' ? '🚌 Você é motorista de ônibus! Vá ao Despacho da Rodoviária e escolha a linha.' : novo.profissao === 'mecanico' ? '🔧 Você é mecânico de aviões! Vá aos aviões da frota no Aeroporto da Metrópole: os que estão com a placa vermelha precisam de revisão (+300 cada).' : novo.profissao === 'gari' ? '♻️ Você é gari! Vá à Central de Reciclagem (leste do centro) e pegue o caminhão de lixo.' : novo.profissao === 'fiscal' ? '🧾 Você é fiscal da Rodoviária! Fique nas plataformas e registre os ônibus que não saírem no horário (+30).' : novo.profissao === 'exercito' ? 'Você entrou no Exército! Apresente-se no Quartel em Porto Sul. Cada minuto em serviço conta para a patente.' : 'Você saiu do serviço público.', 4);
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
  if (j.abducao) { seguirAbducao(dt); return; }
  if (j.embarcado) { seguirNavio(dt); return; }
  if (j.trem && seguirTrem()) {
    av.tocar(j.carregando ? 'carregar_parado' : 'idle'); av.raiz.position.copy(j.pos); av.raiz.rotation.y = j.yaw;
    av.mixer.update(dt); av.raiz.updateMatrixWorld(true);
    if (j.carregando) posicionarCaixa(av, j.carregando, j.yaw);
    return;
  }

  // direção de entrada relativa à câmera
  const off = offsetCamera(anguloCamSuave);
  const frente = modo3D() ? new THREE.Vector3(Math.sin(olhar.yaw), 0, Math.cos(olhar.yaw)) : new THREE.Vector3(-off.x, 0, -off.z).normalize();
  const direita = new THREE.Vector3(-frente.z, 0, frente.x);
  let ix = 0, iy = 0;
  if (teclas.has('w') || teclas.has('arrowup')) iy += 1;
  if (teclas.has('s') || teclas.has('arrowdown')) iy -= 1;
  if (teclas.has('d') || teclas.has('arrowright')) ix += 1;
  if (teclas.has('a') || teclas.has('arrowleft')) ix -= 1;
  if (joy.ativo) { ix = joy.x; iy = joy.y; }
  if (j.morto || averiguando || (j.algemado && algemadoPreso(dt))) { ix = 0; iy = 0; j.alvo = null; }
  const dir = new THREE.Vector3().addScaledVector(direita, ix).addScaledVector(frente, iy);
  let forca = Math.min(1, dir.length());
  if (forca > 0.01) { dir.normalize(); j.alvo = null; }
  else if (j.alvo) {
    dir.set(j.alvo.x - j.pos.x, 0, j.alvo.z - j.pos.z);
    const d = dir.length();
    if (d < 0.25) { j.alvo = null; forca = 0; } else { dir.normalize(); forca = 1; }
  }
  { const ej = !!(j.carro?.voa && !j.carro.caminhao && (j.carro.alt || 0) >= 8 && qtdItem('paraquedas') > 0); if (ej !== document.body.classList.contains('ejetar')) document.body.classList.toggle('ejetar', ej); }
  if (j.paraquedas) { descerParaquedas(dt, dir, forca); return; }
  if (j.voo) { seguirVoo(); return; }
  if (j.onibus) { seguirOnibus(); av.mixer.update(dt); return; }
  if (j.passageiro) {
    seguirComoPassageiro(); av.mixer.update(dt);
    const rp = j.passageiro && remotos.get(j.passageiro.piloto);
    if (rp?.carroModelo === 'militar' && rp.carro) sentarNoVeiculo(av, rp.carro, 'militar', lugarPassageiro(j.perfil.id, j.passageiro.piloto));
    return;
  }
  if (j.carro) { if (!j.carro.taxi) dirigir(dt); av.mixer.update(dt); if (!j.carro || !sentarNoVeiculo(av, j.carro.mesh, j.carro.modelo)) av.raiz.updateMatrixWorld(true); return; }
  if (correTropa) {
    if (forca > 0.15 || j.morto || j.trava > 0) pararTropa('Você saiu da corrida da tropa.');
    else { correrComTropa(dt); av.tocar('run', { velocidade: 0.8 }); av.raiz.position.copy(j.pos); av.raiz.rotation.y = j.yaw; av.mixer.update(dt); av.raiz.updateMatrixWorld(true); return; }
  }
  const correr = !j.carregando && !j.armado && (teclas.has('shift') || (joy.ativo && forca > 0.92) || (j.alvo && j.pos.distanceTo(j.alvo) > 12));

  if (j.trava > 0) {
    j.trava -= dt;
  } else {
    let vel = 0;
    if (forca > 0.15) {
      vel = j.carregando ? VELOCIDADE.carregando : j.armado ? VELOCIDADE.armado : correr ? VELOCIDADE.correr : VELOCIDADE.andar;
      if (racaoAtiva()) vel *= 1.1;
      if (joy.ativo && !correr) vel *= THREE.MathUtils.clamp(forca * 1.3, 0.5, 1);
      vel *= fatorVelocidade();
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
    if (j.dentroCasa !== 'carceragem') { const c = posCela(); teleportar(c.x, c.z); }
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

// olho do motorista / piloto: um ponto à frente e no alto do veículo (medido uma vez pela caixa do modelo)
// tipo de cabine do veículo em que o jogador está (para o olho e para o painel desenhado na frente da câmera)
function tipoCabine() {
  const c = jogador.carro;
  if (jogador.voo || c?.aviao) return 'aviao';
  if (c?.voa || jogador.passageiro?.c?.d?.tipo === 'helicoptero') return 'heli';
  if (jogador.onibus || /^onibus/.test(c?.modelo || '')) return 'onibus';
  if (c?.caminhao || /caminhao|bombeiros|tanque|lixo/.test(`${c?.modelo || ''} ${c?.servico || ''}`)) return 'caminhao';
  return 'carro';
}
// olho do motorista / piloto, medido uma vez pelo modelo: no carro, dentro da cabine (o capô aparece pelo vidro);
// no ônibus e no caminhão, logo atrás do para-brisa; no avião e no helicóptero, em cima do nariz (aparece o bico)
const _rcOlho = new THREE.Raycaster();
// posição do motorista e do capô medidas em cada modelo (coordenadas do modelo: frente em +Z, esquerda em +X):
// olho = [altura, z]; capo = base do para-brisa [altura, z]; x = distância do centro até o motorista (esquerda);
// interior = o modelo já tem painel e volante por dentro (não desenha a moldura); nada = sem moldura (tanque)
const CABINE = {
  carro_popular: { olho: [1.38, -0.05], interior: 1 },
  carro_classico: { olho: [1.28, -0.3], interior: 1 },
  exercito_jipe: { olho: [1.64, -0.04], interior: 1 , int: 'int_jipe'},
  carro_suv: { olho: [1.72, 0.25], capo: [1.38, 1.25], cor: '#e56600' , int: 'int_carro'},
  carro_esportivo: { olho: [1.07, -0.35], capo: [0.92, 0.65], cor: '#b20019', painel: -0.16, teto: 0.5, zt: 0.3 , int: 'int_carro'},   // capô baixo: painel mais baixo para ver a rua
  carro_presidencial: { olho: [1.58, 0.6], capo: [1.28, 1.35], cor: '#2b2b36' , int: 'int_carro'},
  ambulancia: { olho: [2.2, 1.5], capo: [1.55, 2.25], x: 0.5, cor: '#e5e5e5' , int: 'int_van'},
  caminhao_bombeiros: { olho: [2.6, 2.9], capo: [1.9, 3.6], x: 0.75, cor: '#cc3333' , int: 'int_caminhao'},
  caminhao: { olho: [1.82, 2.75], capo: [1.45, 3.45], x: 0.55, cor: '#f2b705', teto: 0.24 , int: 'int_caminhao'},
  caminhao_lixo: { olho: [2.55, 3.15], capo: [1.85, 3.85], x: 0.6, cor: '#cfcfcf' , int: 'int_caminhao'},
  exercito_caminhao: { olho: [2.4, 2.2], x: 0.6, interior: 1 },
  tanque: { olho: [3.05, -0.6], nada: 1 },
  onibus_grande: { olho: [2.2, 4.6], capo: [1.15, 5.4], x: 0.7 , int: 'int_onibus'},
  onibus_urbano: { olho: [2.25, 5.0], capo: [1.05, 5.75], x: 0.7 , int: 'int_onibus'},
  onibus_executivo: { olho: [2.35, 4.9], capo: [1.2, 5.6], x: 0.7 , int: 'int_onibus'},
  onibus_executivo2: { olho: [2.4, 6.05], capo: [1.75, 6.88], x: 0.7, cor: '#fcd605' , int: 'int_onibus'},
  onibus_dois_andares: { olho: [1.85, 5.9], capo: [1.0, 6.7], x: 0.7, cor: '#0fb9dd' , int: 'int_onibus'},
  onibus_apache: { olho: [2.2, 5.0], capo: [1.15, 5.8], x: 0.7, cor: '#4b5157' , int: 'int_onibus'},
  onibus_articulado: { olho: [2.25, 8.3], capo: [1.1, 9.05], x: 0.7, cor: '#6ccf3a' , int: 'int_onibus'},
  onibus_busscar: { olho: [2.4, 4.35], x: 0.8, interior: 1 },
};
function caixaDoModelo(mesh) {
  if (!mesh.userData.caixa) {
    const r = mesh.rotation.clone(), p = mesh.position.clone(); mesh.rotation.set(0, 0, 0); mesh.position.set(0, 0, 0); mesh.updateMatrixWorld(true);
    const luz = (o) => { for (let x = o; x; x = x.parent) if (x.name === 'luzes' || x.name === 'giroflex' || x.name === 'rotor' || x.name === 'rodas') return true; return false; };
    const b = new THREE.Box3(); mesh.traverse((o) => { if (o.isMesh && !luz(o)) b.expandByObject(o); });
    mesh.rotation.copy(r); mesh.position.copy(p); mesh.updateMatrixWorld(true); mesh.userData.caixa = b;
  }
  return mesh.userData.caixa;
}
// veículo aberto (jipe): o motorista aparece sentado no banco da esquerda, pernas dobradas e mãos para o volante.
// A pose é aplicada por cima da animação parada, dobrando os ossos em volta do eixo lateral do corpo.
const _qS = new THREE.Quaternion(), _qP = new THREE.Quaternion(), _eixoS = new THREE.Vector3(), _latS = new THREE.Vector3(), _vS = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
function ossosSentar(av) {
  if (!av.ossosSentar) { const o = {}; av.modelo.traverse((b) => { if (!b.isBone) return; const n = (b.name || '').toLowerCase(); for (const k of ['leftupleg', 'rightupleg', 'leftleg', 'rightleg', 'leftarm', 'rightarm', 'leftforearm', 'rightforearm', 'hips']) if (!o[k] && n.endsWith(k)) o[k] = b; }); av.ossosSentar = o; }
  return av.ossosSentar;
}
function girarOsso(b, ang) { if (!b?.parent) return; b.parent.getWorldQuaternion(_qP).invert(); _eixoS.copy(_latS).applyQuaternion(_qP).normalize(); b.quaternion.premultiply(_qS.setFromAxisAngle(_eixoS, ang)); }
// quem vai sentado em cada lugar do jipe: o motorista no 1º, os passageiros (em ordem de id) nos outros
function lugarPassageiro(id, piloto) {
  const ids = [];
  if (jogador.passageiro?.piloto === piloto) ids.push(jogador.perfil.id);
  for (const [rid, r] of remotos) if (r.alvo?.pg === piloto) ids.push(rid);
  ids.sort(); const i = ids.indexOf(id); return i < 0 ? -1 : i + 1;
}
function sentarNoVeiculo(av, mesh, modelo, lugar = 0) {
  const A = civico.ABERTOS[modelo]; if (!A || !av || !mesh) return false;
  const L = A.lugares[lugar]; if (!L) return false;
  if (av.nomeAtual !== 'idle') av.tocar('idle', { fade: 0.15 });
  const b = caixaDoModelo(mesh), cx = (b.min.x + b.max.x) / 2, W = b.max.x - b.min.x, raiz = av.raiz;
  const banco = mesh.localToWorld(_vS.set(cx + L[0] * Math.min(0.45, W * 0.2), L[1], L[2]));
  raiz.visible = true; raiz.rotation.y = mesh.rotation.y; raiz.position.copy(banco); raiz.updateMatrixWorld(true);
  _latS.set(1, 0, 0).applyAxisAngle(_Y, raiz.rotation.y);
  const o = ossosSentar(av);
  girarOsso(o.leftupleg, -1.45); girarOsso(o.rightupleg, -1.45);
  girarOsso(o.leftleg, 1.5); girarOsso(o.rightleg, 1.5);
  if (lugar === 0) { girarOsso(o.leftarm, -0.95); girarOsso(o.rightarm, -0.95); girarOsso(o.leftforearm, -0.45); girarOsso(o.rightforearm, -0.45); }   // mãos no volante
  else { girarOsso(o.leftarm, -0.25); girarOsso(o.rightarm, -0.25); girarOsso(o.leftforearm, -0.9); girarOsso(o.rightforearm, -0.9); }       // passageiro: mãos no colo
  if (o.hips) { raiz.updateMatrixWorld(true); const yq = o.hips.getWorldPosition(_eixoS).y; raiz.position.y += banco.y + 0.1 - yq; }
  if (av.uniforme) { /* colete e chapéu seguem os ossos sozinhos */ }
  raiz.updateMatrixWorld(true);
  return true;
}
function olhoDoVeiculo(mesh, tipo) {
  const T = tipo !== 'aviao' && tipo !== 'heli' && CABINE[mesh.userData.glb];
  if (T && mesh.userData.olhoTipo !== tipo) {
    const b = caixaDoModelo(mesh), cx = (b.min.x + b.max.x) / 2, W = b.max.x - b.min.x;
    mesh.userData.olho = new THREE.Vector3(cx + (T.x ?? Math.min(0.45, W * 0.2)), T.olho[0], T.olho[1]); mesh.userData.olhoTipo = tipo;
  }
  if (!mesh.userData.olho || mesh.userData.olhoTipo !== tipo) {
    const r = mesh.rotation.clone(), p = mesh.position.clone(); mesh.rotation.set(0, 0, 0); mesh.position.set(0, 0, 0); mesh.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(mesh), h = b.max.y - b.min.y, L = b.max.z - b.min.z, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const zo = { carro: cz + L * 0.04, onibus: b.max.z - 1.4, caminhao: b.max.z - 1.1, aviao: b.max.z - L * 0.14, heli: b.max.z - L * 0.24 }[tipo];
    _rcOlho.set(new THREE.Vector3(cx + (tipo === 'carro' || tipo === 'caminhao' || tipo === 'onibus' ? 0.35 : 0), b.max.y + 5, zo), new THREE.Vector3(0, -1, 0));
    _rcOlho.camera = camP;
    const luz = (o) => { for (let x = o; x; x = x.parent) if (x.name === 'luzes' || x.name === 'giroflex' || x.name === 'rotor') return true; return false; };
    const hit = _rcOlho.intersectObject(mesh, true).find((i) => i.object.isMesh && !i.object.isSprite && !luz(i.object)), topo = hit ? hit.point.y : b.min.y + h * 0.8;
    const y = { carro: topo - 0.28, onibus: topo - 0.75, caminhao: topo - 0.45, aviao: topo + 0.35, heli: topo + 0.15 }[tipo];
    mesh.rotation.copy(r); mesh.position.copy(p); mesh.updateMatrixWorld(true);
    mesh.userData.olho = new THREE.Vector3(tipo === 'onibus' || tipo === 'caminhao' || tipo === 'carro' ? cx + Math.min(0.45, (b.max.x - b.min.x) * 0.2) : cx, y, zo); mesh.userData.olhoTipo = tipo;   // motorista à esquerda (modelo olha para +Z: esquerda = +X)
  }
  return mesh.localToWorld(mesh.userData.olho.clone());
}
// painel na frente da câmera (só na primeira pessoa, dentro do veículo): colunas, para-brisa, painel e volante
const cabines = {};
// moldura do motorista feita para cada modelo: o painel começa logo abaixo do capô (o capô do próprio veículo aparece
// pelo para-brisa), o volante fica na frente do motorista (lado esquerdo) e o resto do painel, o console e o
// retrovisor ficam para a direita, onde está o resto do carro
// interiores 3D gerados (cabine de verdade): o modelo, o ponto do olho do motorista nele e a largura
const INTERIORES = {
  int_onibus: { olho: [0.7, 1.15, -1.15] }, int_rodoviario: { olho: [0.95, 1.22, -1.15] }, int_caminhao: { olho: [0.55, 0.92, -1.25] },
  int_van: { olho: [0.5, 1.0, -1.0] }, int_carro: { olho: [0.38, 0.9, -1.1] }, int_jipe: { olho: [0.36, 1.0, -1.75] },
};
// a cabine 3D é desenhada por cima do mundo, numa cena só dela (limpa a profundidade antes): não briga com a lataria
const cenaCabine = new THREE.Scene();
const luzCabH = new THREE.HemisphereLight('#ffffff', '#5a5a5a', 1.25), luzCabD = new THREE.DirectionalLight('#ffffff', 0.9);
luzCabD.position.set(0.4, 1, 0.3); cenaCabine.add(luzCabH, luzCabD);
let cabine3D = null;   // { g, mesh } ativa neste quadro
function interiorDoVeiculo(mesh) {
  const T = CABINE[mesh.userData.glb]; if (!T?.int || !INTERIORES[T.int] || !mesh.userData.olho) return null;
  const I = INTERIORES[T.int];
  if (mesh.userData.int3d !== undefined) return mesh.userData.int3d;
  mesh.userData.int3d = null;   // carregando
  carregarGLB(`assets/modelos/${T.int}.glb`).then((gl) => {
    const g = gl.scene.clone(true); g.matrixAutoUpdate = false;
    g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.fog = false; o.material.side = THREE.DoubleSide; o.frustumCulled = false; } });
    const esc = T.intEsc || 1, e = I.olho, ol = mesh.userData.olho;
    g.userData.local = new THREE.Matrix4().makeTranslation(ol.x, ol.y, ol.z).multiply(new THREE.Matrix4().makeScale(esc, esc, esc)).multiply(new THREE.Matrix4().makeTranslation(-e[0], -e[1], -e[2]));
    g.visible = false; cenaCabine.add(g); mesh.userData.int3d = g;
  }).catch(() => {});
  return null;
}
function cabineVeiculo(mesh, tipo) {
  const nome = mesh.userData.glb, T = CABINE[nome];
  if (!T || !mesh.userData.olho) return cabine(tipo);
  if (mesh.userData.cabine) return mesh.userData.cabine;
  // a cabine fica presa no veículo (no olho do motorista): olhando para o lado aparecem a porta, a janela e o retrovisor
  const g = new THREE.Group(); g.visible = false; mesh.add(g); mesh.userData.cabine = g; cabines[mesh.uuid] = g;
  g.position.copy(mesh.userData.olho); g.rotation.y = Math.PI;   // peças: frente = -z
  if (T.interior || T.nada || !T.capo) return g;
  const cor = mesh.userData.modelo === 'viatura' ? '#41507a' : T.cor;   // a viatura usa o modelo do SUV pintado de azul
  const { pecas, volante } = pecasCabine(nome, caixaDoModelo(mesh), mesh.userData.olho, { ...T, cor });
  const mats = {}, mat = (c) => (mats[c] ||= new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, fog: false }));
  const gv = new THREE.Group(); gv.position.set(...volante.centro); gv.rotation.x = volante.incl; g.add(gv);
  const giro = new THREE.Group(); gv.add(giro); g.userData.volante = giro;
  for (const p of pecas) {
    const geo = p.t === 'caixa' ? new THREE.BoxGeometry(...p.s) : p.t === 'cil' ? new THREE.CylinderGeometry(p.rt, p.rb, p.h, 14) : new THREE.TorusGeometry(p.R, p.e, 8, 28);
    // um pouco de sombra pelo lado da peça (MeshBasic não tem luz): faces de cima mais claras
    const m = new THREE.Mesh(geo, mat(p.c)); m.position.set(...p.p); m.rotation.set(...p.r); m.renderOrder = p.o;
    (p.volante ? giro : g).add(m);
  }
  return g;
}
function cabine(tipo) {
  if (cabines[tipo]) return cabines[tipo];
  const g = new THREE.Group(); g.visible = false; camP.add(g);
  const mat = (cor) => new THREE.MeshBasicMaterial({ color: cor, depthTest: false, depthWrite: false, fog: false });
  const escuro = mat('#1d2126'), cinza = mat('#3a4048'), borracha = mat('#121417');
  const caixa = (m, w, h, d, x, y, z, rz = 0, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.renderOrder = 20; g.add(o); return o; };
  const volante = (r, x, y, z) => { const v = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.12, 8, 24), borracha); v.position.set(x, y, z); v.rotation.x = -0.45; v.renderOrder = 21; g.add(v); caixa(borracha, r * 1.6, r * 0.14, 0.03, x, y, z, 0, -0.45); };
  if (tipo === 'carro') {
    caixa(escuro, 2.2, 0.32, 0.6, 0, -0.62, -0.95);                         // painel
    for (const s of [-1, 1]) caixa(cinza, 0.07, 1.25, 0.07, s * 0.98, -0.02, -1.0, s * 0.28);   // colunas do para-brisa
    caixa(cinza, 2.2, 0.08, 0.08, 0, 0.5, -0.95);                           // borda de cima
    volante(0.21, 0, -0.42, -0.62);
  } else if (tipo === 'onibus' || tipo === 'caminhao') {
    const w = tipo === 'onibus' ? 2.9 : 2.5;
    caixa(escuro, w, 0.38, 0.7, 0, -0.68, -1.05);
    for (const s of [-1, 1]) caixa(cinza, 0.09, 1.7, 0.09, s * w / 2, 0.05, -1.1);
    if (tipo === 'onibus') caixa(cinza, 0.06, 1.7, 0.06, 0.45, 0.05, -1.12);   // coluna do meio do para-brisa
    caixa(cinza, w, 0.12, 0.12, 0, 0.82, -1.1); caixa(cinza, w, 0.1, 0.1, 0, -0.48, -1.1);
    if (tipo === 'onibus') caixa(mat('#111'), 1.3, 0.22, 0.05, 0.6, 0.66, -1.08);   // letreiro (por dentro)
    volante(tipo === 'onibus' ? 0.27 : 0.24, 0, -0.42, -0.7);
  } else {   // avião e helicóptero: moldura da cabine (o bico aparece embaixo)
    const larg = tipo === 'heli' ? 1.6 : 1.9;
    for (const s of [-1, 1]) caixa(cinza, 0.06, 1.0, 0.06, s * larg / 2, 0.15, -1.1, s * 0.35);
    caixa(cinza, larg, 0.06, 0.06, 0, 0.62, -1.0);
    caixa(escuro, larg * 1.2, 0.16, 0.5, 0, -0.78, -1.05);   // painel baixo (não tapa o nariz)
    if (tipo === 'heli') caixa(cinza, 0.05, 0.8, 0.05, 0, 0.2, -1.15);
  }
  cabines[tipo] = g; return g;
}
function veiculoDoJogador() {
  if (jogador.carro?.mesh) return jogador.carro.mesh;
  if (jogador.onibus) return onibusNpc.find((b) => b.ativo && b.L === jogador.onibus.L && b.m === jogador.onibus.m)?.mesh || null;
  if (jogador.voo) return npcAvioes[0]?.mesh || null;
  if (jogador.passageiro) return jogador.passageiro.c?.obj || null;
  return null;
}
const _dirOlhar = new THREE.Vector3();
// os caminhões são desenhados dos dois lados (o modelo tem faces viradas para dentro); na visão de dentro,
// o veículo do jogador volta a ter um lado só, senão o avesso da lataria aparece em volta do para-brisa
let p1LadoUnico = null;
function ladoUnicoP1(v) {
  if (p1LadoUnico === v) return;
  if (p1LadoUnico) p1LadoUnico.traverse((o) => { if (o.isMesh && o.userData.matDois) { o.material = o.userData.matDois; } });
  p1LadoUnico = null;
  if (!v) return;
  v.traverse((o) => { if (!o.isMesh || !o.material || Array.isArray(o.material) || o.material.side !== THREE.DoubleSide) return;
    o.userData.matDois = o.material; o.userData.matUm ||= Object.assign(o.material.clone(), { side: THREE.FrontSide }); o.material = o.userData.matUm; });
  p1LadoUnico = v;
}
function cabecaDe(av) { if (!av) return null; if (av.ossoCabeca === undefined) { av.ossoCabeca = null; av.modelo.traverse((o) => { if (!av.ossoCabeca && o.isBone && /head$/i.test(o.name) && !/top/i.test(o.name)) av.ossoCabeca = o; }); } return av.ossoCabeca; }
function atualizarCamera3D(dt) {
  camAtiva = camP;
  if (modoCam !== 'p1' || !veiculoDoJogador()) ladoUnicoP1(null);
  const av = jogador.avatar;
  if (av && (atualizarCamera3D.t = (atualizarCamera3D.t || 0) - dt) <= 0) {   // refaz de tempos em tempos (arma, chapéu e etiqueta entram depois)
    atualizarCamera3D.t = 0.5; const cab = cabecaDe(av);
    av.raiz.traverse((o) => { let naCabeca = false; for (let x = o.parent; x && x !== av.raiz; x = x.parent) if (x === cab) { naCabeca = true; break; } if (o.isSprite || (naCabeca && !o.isBone)) o.layers.set(1); else o.layers.set(0); });
  }
  if (modoCam === 'p1') camP.layers.disable(1); else camP.layers.enable(1);
  olhar.arrastou = Math.max(0, olhar.arrastou - dt);
  const v = veiculoDoJogador();
  if (modoCam === 'p1') {
    let olho, yaw = olhar.yaw;
    if (v) {   // dentro do veículo: olha para a frente dele (dá para virar a cabeça arrastando; volta sozinho)
      const tc = tipoCabine(); olho = olhoDoVeiculo(v, tc); if (olhar.arrastou <= 0) olhar.veic *= Math.max(0, 1 - dt * 2);
      const cb = tc === 'aviao' || tc === 'heli' ? cabine(tc) : cabineVeiculo(v, tc);
      const int3 = interiorDoVeiculo(v);
      ladoUnicoP1(v);   // por dentro, a lataria do próprio veículo não aparece pelo avesso
      for (const g of Object.values(cabines)) g.visible = !int3 && g === cb && (g.parent !== camP || Math.abs(olhar.veic) < 1.2);   // a do veículo fica presa nele
      if (int3) { v.updateMatrixWorld(); int3.matrix.multiplyMatrices(v.matrixWorld, int3.userData.local); int3.visible = true; cabine3D = int3; }
      if (cb?.userData.volante) cb.userData.volante.rotation.z = -(jogador.carro?.volante || 0) * 1.8;
      // a visão acompanha o veículo com suavidade e olha um pouco para dentro da curva (onde você vai passar)
      const alvoYaw = v.rotation.y - (jogador.carro?.volante || 0) * 0.22 + olhar.veic;
      olhar.yawVeic = olhar.yawVeic === undefined ? alvoYaw : olhar.yawVeic + Math.atan2(Math.sin(alvoYaw - olhar.yawVeic), Math.cos(alvoYaw - olhar.yawVeic)) * Math.min(1, dt * 6);
      yaw = olhar.yawVeic; olhar.yaw = yaw;
    } else {   // a pé: olho na cabeça do personagem, um pouco à frente do rosto (aparecem as mãos e os braços)
      for (const g of Object.values(cabines)) g.visible = false; olhar.yawVeic = undefined;
      const cab = cabecaDe(av); olho = cab ? cab.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.07, 0)) : new THREE.Vector3(jogador.pos.x, (jogador.pos.y || 0) + 1.62, jogador.pos.z);
      olho.addScaledVector(_dirOlhar.set(Math.sin(yaw), 0, Math.cos(yaw)), 0.24);
    }
    camP.position.copy(olho);
    { const fov = v ? 78 : 68; if (Math.abs(camP.fov - fov) > 0.5) { camP.fov += (fov - camP.fov) * Math.min(1, dt * 4); camP.updateProjectionMatrix(); } }
    _dirOlhar.set(Math.sin(yaw) * Math.cos(olhar.pitch), Math.sin(olhar.pitch), Math.cos(yaw) * Math.cos(olhar.pitch));
    camP.lookAt(olho.clone().add(_dirOlhar));
    if (!v && !jogador.alvo && Math.hypot(joy.x, joy.y) < 0.05) jogador.yaw = yaw;   // parado, o corpo vira para onde você olha
  } else {
    for (const g of Object.values(cabines)) g.visible = false;
    const f = foco(), alvo = new THREE.Vector3(f.x, (f.y || 0) + (jogador.pos.y || 0) + 1.4, f.z);
    if (v && olhar.arrastou <= 0) olhar.yaw += Math.atan2(Math.sin(v.rotation.y - olhar.yaw), Math.cos(v.rotation.y - olhar.yaw)) * Math.min(1, dt * 1.5);   // dirigindo: fica atrás do veículo
    const dist = v ? Math.max(olhar.dist, 12) : olhar.dist;
    camP.position.set(alvo.x - Math.sin(olhar.yaw) * Math.cos(olhar.incl) * dist, alvo.y + Math.sin(olhar.incl) * dist, alvo.z - Math.cos(olhar.yaw) * Math.cos(olhar.incl) * dist);
    const chao = alturaChao(camP.position.x, camP.position.z) + 0.6; if (camP.position.y < chao) camP.position.y = chao;
    camP.lookAt(alvo);
  }
  if (tremor > 0) { tremor -= dt; camP.position.x += (Math.random() - 0.5) * tremor; camP.position.y += (Math.random() - 0.5) * tremor; }
  const c = camP.position; alvoCam.set(c.x + Math.sin(olhar.yaw) * 25, 0, c.z + Math.cos(olhar.yaw) * 25);
  sol.position.copy(alvoCam).addScaledVector(SOL_DIR, 80); sol.target.position.copy(alvoCam);
  for (const p of predios) if (p.opac < 0.99) { p.opac = 1; for (const m of p.mats) { m.transparent = false; m.opacity = 1; m.depthWrite = true; } }
  const mira1 = $('mira1p'); if (mira1) mira1.classList.toggle('oculto', modoCam !== 'p1' || !!v);
}
function atualizarCamera(dt) {
  if (modo3D()) { atualizarCamera3D(dt); return; }
  ladoUnicoP1(null);
  camAtiva = camera;
  if ($('mira1p')) $('mira1p').classList.add('oculto');
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
  { const f = foco(); alvoCam.lerp(new THREE.Vector3(f.x, 0.9 + (f.y || 0), f.z), Math.min(1, dt * 6)); }
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
  const alg = contextoAlgema(), cri = contextoCrime();
  const el = $('dica'); el.textContent = [dica ? `E: ${dica}` : '', alg ? `G: ${alg[0]}` : '', cri ? `C: ${cri[0]}` : ''].filter(Boolean).join('  ·  '); el.classList.toggle('oculto', !(dica || alg || cri) || TOQUE);
  { const b = $('btAlgema'); if (b) { b.classList.toggle('oculto', !alg); if (alg) b.textContent = '🔗 ' + alg[1]; } }
  { const b = $('btCrime'); if (b) { b.classList.toggle('oculto', !cri); if (cri && b.textContent !== cri[1]) b.textContent = cri[1]; } }
  if (TOQUE) { $('btAcao').textContent = botao || 'Pegar'; $('btAcao').classList.toggle('ativo', !!dica); }
  atualizarFome(dt);
  const bl = $('bloqueio');
  if (jogador.perfil?.banido) { /* mensagem já exibida */ }
  else if (jogador.pena > 0) { bl.textContent = `Preso: ${formatarTempo(jogador.pena)}`; bl.classList.remove('oculto'); }
  else if (jogador.algemado) { bl.textContent = 'Algemado'; bl.classList.remove('oculto'); }
  else if (cativo()) { bl.textContent = `Refém: ${formatarTempo(Math.max(0, (Date.parse(jogador.perfil.cativeiro_ate) - agoraServidor()) / 1000))}`; bl.classList.remove('oculto'); }
  else if (presoMilitar()) { bl.textContent = `Prisão militar: ${formatarTempo(Math.max(0, (Date.parse(jogador.perfil.prisao_militar_ate) - agoraServidor()) / 1000))}`; bl.classList.remove('oculto'); }
  else bl.classList.add('oculto');
  if (avisoTimer > 0) { avisoTimer -= dt; if (avisoTimer <= 0) $('aviso').style.opacity = 0; }
  atualizarPlacas();
  if (contratante?.excl) contratante.excl.position.y = 3.0 + Math.sin(performance.now() / 300) * 0.12;
}

// texto da dica e do botão de ação conforme o que está perto
function contexto() {
  const pd = jogador.carregando?.userData.pedido;
  if (jogador.onibus) return contextoNoOnibus();
  if (jogador.voo) return [`em voo para ${AERO[jogador.voo.d].nome}`, 'Voando'];
  if (jogador.passageiro) return passageiroPodeDescer() ? ['descer do helicóptero', 'Descer'] : ['passageiro no helicóptero', 'Voando'];
  if (jogador.carro?.taxi) return textoTaxi();
  if (aula && jogador.carro?.aula === aula && !aula.voo) return textoAula();
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
  { const f = servicos.fogoProximo(9);
    if (f && !jogador.carregando) {
      if (jogador.perfil?.profissao === 'bombeiro') return ['apagar o incêndio (+400)', 'Apagar'];
      if (f.tipo === 'veiculo') return servicos.fogoNoComeco(f) ? ['abafar o fogo do veículo antes que cresça', 'Abafar'] : ['fogo grande: só os bombeiros apagam', 'Fogo'];
      return ['apagar o fogo (só o dono ou bombeiros)', 'Apagar'];
    } }
  if (perto(civico.BANCO.balcao, 3.2)) return ['banco: poupança e empréstimo', 'Banco'];
  if (perto(civico.BANCO.empregos, 3.2)) return ['agência de empregos: vagas nas empresas', 'Vagas'];
  if (perto(civico.HOSPITAL.balcao, 3.2)) return ['hospital: tratamento e plantão médico', 'Hospital'];
  if (perto(civico.BOMBEIROS.balcao, 3.2)) return ['entrar no quartel dos bombeiros', 'Bombeiros'];
  { const o = contextoOnibus() || contextoAviacao() || contextoColeta(); if (o) return o; }
  if (Math.hypot(AUTOESCOLA.balcao.x - jogador.pos.x, AUTOESCOLA.balcao.z - jogador.pos.z) < 3) return ['autoescola: aulas e provas (carteiras B, C, D e brevê)', 'Autoescola'];
  if (tropaPerto()) return ['correr com a tropa (treino de corrida)', 'Correr'];
  if (perto(civico.EXERCITO.arsenal, 3.2)) return [jogador.armaPesada ? 'guardar a arma pesada' : 'arsenal: pegar a arma pesada (com autorização)', 'Arsenal'];
  if (BANCAS.some((b) => perto(b, 3.2))) return ['banca de jornal: ler as notícias', 'Jornal'];
  if (perto(CONTRABANDISTA, 3.2)) return ['contrabandista: arma militar e alicate de corte', 'Negociar'];
  { const cn = contextoNavio(); if (cn) return cn; }
  if (perto(CENTRAL_MISSEIS, 4)) return ['Central de Mísseis da Marinha (alvo = ponto marcado no mapa)', '🚀 Mísseis'];
  if (perto(GUARITA_ALIST, 3.2)) return [militar() ? 'guarita do Exército: pedidos de alistamento' : 'guarita do Exército: alistamento e licitação de rações', 'Guarita'];
  if (perto(civico.EXERCITO.balcao, 3.2)) return [jogador.perfil?.profissao === 'exercito' ? 'comando do Exército: ordens e caçadas' : 'comando do Exército: alistar-se', 'Comando'];
  if (jogador.perfil?.profissao === 'jornalista' && reportagemProxima()) return [`reportar: ${reportagemProxima().titulo} (+200)`, 'Reportar'];
  if (perto(civico.PREFEITURA.jornal, 3.2)) return ['Jornal da Cidade: virar jornalista e ler as notícias', 'Jornal'];
  if (perto(civico.PREFEITURA.porta, 3.2)) return ['entrar na prefeitura: gabinete, eleição e outdoors', 'Prefeitura'];
  if (perto(civico.PREFEITURA.prf, 3.2)) return ['entrar no posto da PRF', 'PRF'];
  if (perto(civico.CONCESSIONARIA.balcao, 3.2)) return ['comprar carro', 'Carros'];
  if (meuCarroProximo() && !jogador.carregando) return [meuCarroProximo().d.ladrao ? 'dirigir o carro roubado' : 'dirigir o seu carro', 'Dirigir'];
  if (onibusSeqPerto() !== null) return ['dirigir o ônibus sequestrado pelo seu clã', 'Dirigir'];
  if (viaturaAbandonadaPerto()) return ['roubar a viatura abandonada (crime)', 'Roubar'];
  { const cj = contextoComprador(); if (cj) return [cj[0], cj[1]]; }
  if (jujubaLargadaPerto()) return ['dirigir o caminhão de rações sequestrado', 'Dirigir'];
  if (vanLargadaPerto()) return ['dirigir a van sequestrada', 'Dirigir'];
  { const cr = carroRuaProximo(); if (cr !== null && !jogador.carregando) return ['arrombar o carro estacionado (crime)', 'Arrombar']; }
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
  { const b = bandidoPerto(); if (b) return ['PRENDER o ladrão (+300)', 'Prender']; }
  { const r = refemPerto(); if (r) return [`libertar ${r.r.meta?.nome || 'o refém'} (+200)`, 'Libertar']; }
  { const f = feridoParaSequestro(); if (f) return [`sequestrar ${f.r.meta?.nome || 'o ferido'} e levar ao esconderijo (crime)`, 'Sequestrar']; }
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
  desenharEscudo();
  const v = $('barVida'); if (v) { v.firstChild.style.width = Math.max(0, jogador.vida).toFixed(0) + '%'; v.classList.toggle('baixa', jogador.vida < 35); }
  const b = $('barFome'); if (!b) return;
  b.firstChild.style.width = jogador.fome.toFixed(0) + '%';
  b.classList.toggle('vazia', jogador.fome < 15);
  b.title = `Fome ${Math.round(jogador.fome)}%`;
}

// o laço do jogo não pode parar: se algo der erro num quadro, avisa (uma vez a cada 20 s) e segue no próximo
let ultimoErroQuadro = 0;
function quadro() {
  try { quadroJogo(); } catch (e) {
    console.error(e);
    if (performance.now() - ultimoErroQuadro > 20000) { ultimoErroQuadro = performance.now(); try { aviso(`⚠️ Erro no jogo (mande print): ${String(e?.message || e).slice(0, 120)}`, 6); } catch { /* sem aviso */ } }
  }
}
function quadroJogo() {
  const dt = Math.min(relogio.getDelta(), 0.05);
  eixos.restaurar();   // a lógica do quadro usa a posição de sempre; o desenho das curvas volta no fim
  ferrovia.atualizar(agoraServidor() / 1000);
  atualizarCeu(agoraServidor() / 1000);
  ceu.atualizar(dt, camAtiva, noiteAtual, clima.atual(), clima.fatorTempo(), camAtiva === camP, SOL_DIR);
  clima.atualizar(dt, agoraServidor() / 1000, CICLO_DIA, { x: foco().x, y: (foco().y || 0) - 2, z: foco().z, dentro: !!jogador.dentroCasa && !averiguando }, { sol, hemi, cena: scene });
  tempoClima -= dt; if (tempoClima <= 0) { tempoClima = 30; carregarClima(); }
  mundo.atualizar(dt);
  mundo.carrosPerto(foco().x, foco().z, dt);
  mundo.arvoresPerto(foco().x, foco().z, dt);
  mundo.propsPerto(foco().x, foco().z, dt); semaforos.atualizar(dt, foco().x, foco().z);
  mundo.predios3dPerto(foco().x, foco().z, dt);
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
  atualizarExplosoes(dt); atualizarSemPiloto(dt); atualizarContagemMorte();
  atualizarMira();
  civico.atualizarQuartel(jogador.pos);
  atualizarArea51(dt); atualizarBases(dt); atualizarQuartelExtras(dt); atualizarBaseAerea(dt); atualizarMisseis(dt); avisarAlistamentos(dt); atualizarMarinha(dt);
  atualizarPerdao(dt);
  { const E = civico.EXERCITO.estande, p = jogador.pos;   // estande: só militares entram
    if (E && !militar() && p.x > E.x0 && p.x < E.x1 && p.z > E.z0 && p.z < E.z1 + 1) { p.z = E.z0 - 0.6; if (performance.now() - (avisoEstande || 0) > 4000) { avisoEstande = performance.now(); aviso('🎯 O estande de tiro é só para militares.', 2.5); } } }
  atualizarRemotos(dt);
  voz.atualizar(dt); atualizarAperto(dt); atualizarQG(dt); atualizarAlgemas(dt); atualizarEsgoto(dt); atualizarEsteiras(dt); atualizarCarrosRua(); atualizarQueimados(dt); atualizarOnibusSeq(dt); atualizarPovo(dt); racoes.atualizar(dt); atualizarJujubas(dt); atualizarObstrucoes(dt); explosoesDeFogo(); pintarCarrosQueimados(); atualizarAveriguar(dt); atualizarVisita(); atualizarNomesCla(dt); atualizarConfigJogo(dt); atualizarBandidos(); atualizarPrisaoMilitar(dt); desenharBotaoViatura(); atualizarCativeiro(dt);
  jogador.avatar?.posicionarArma(); for (const r of remotos.values()) r.av?.posicionarArma();
  atualizarUniformes(); atualizarTreino(dt); fraquezaFome(dt); atualizarOnibus(dt); atualizarAviacao(dt); atualizarAula(dt); atualizarColeta(dt); marcarEixos(); eixos.aplicar(alturaChao); civico.atualizarLuzesVeiculos(dt, noiteAtual, alturaChao, scene); civico.atualizarRodas(dt, camAtiva === camP ? camP.position : jogador.pos);
  enviarEstado(dt);
  tempoSalvar -= dt; if (tempoSalvar <= 0) { tempoSalvar = 15; salvarAgora(); }
  if (contratante?.avatar) contratante.avatar.mixer.update(dt);
  atualizarBolas(dt);
  atualizarCamera(dt);
  mundo.atualizarOclusao(dt, averiguando ? foco() : jogador.pos, modo3D() ? new THREE.Vector3(0, 1, 0) : offsetCamera(anguloCamSuave));
  atualizarHUD(dt);
  // chuva molha o chão (asfalto escuro e brilhante); o visual ajusta brilho e cor pela noite e pela chuva
  const tc = clima.atual(), alvoMolhado = tc === 'chuva' || tc === 'tempestade' ? clima.fatorTempo() : 0;
  molhadoAtual += (alvoMolhado - molhadoAtual) * Math.min(1, dt * 0.4);
  mundo.molhar(molhadoAtual);
  visual.ajustar(noiteAtual, molhadoAtual);
  visual.render(camAtiva);
  // cabine 3D por cima (só na primeira pessoa, dentro do veículo)
  for (const o of cenaCabine.children) if (o.isGroup || o.type === 'Group' || o.isObject3D && o.userData.local) o.visible = o === cabine3D;
  if (cabine3D && camAtiva === camP) {
    luzCabH.intensity = 0.45 + 0.85 * (1 - noiteAtual); luzCabD.intensity = 0.25 + 0.7 * (1 - noiteAtual);
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(cenaCabine, camAtiva); renderer.autoClear = true;
  }
  cabine3D = null;
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
  if (g.tipo === 'estudio') { conviteEstudio(g); return; }
  if (g.tipo === 'visita') { conviteVisita(g); return; }
  if (g.tipo === 'visitaOk') { aviso(`🔒 ${nome} chegou para a visita na carceragem.`, 4); return; }
  if (g.tipo === 'visitaNao') { aviso(`${nome} recusou a visita.`, 3); return; }
  if (g.tipo === 'estudioOk') { aviso(`📸 ${nome} chegou ao estúdio. Toque em Foto quando quiser.`, 4); return; }
  if (g.tipo === 'estudioNao') { aviso(`${nome} recusou o convite para o estúdio.`, 3); return; }
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
// créditos dos modelos 3D com licença CC-BY 4.0 (a licença pede o nome do autor e o link da obra)
const CREDITOS = [
  ['Caio Apache Vip IV', 'lael.eugenio', 'https://sketchfab.com/3d-models/caio-apache-vip-iv-9d368d4f432b40a18f8882563043ee04'],
  ['Busscar Ecoss MB OF-1721 - FULL', 'QCY', 'https://sketchfab.com/3d-models/busscar-ecoss-mb-of-1721-full-db6df9e45e17418c9f191f81af27bbcf'],
];
function creditos() {
  escolher('📜 Créditos', 'Modelos 3D usados no jogo sob a licença Creative Commons CC-BY 4.0 (creativecommons.org/licenses/by/4.0). Os modelos foram reduzidos e adaptados para o jogo (tamanho, rodas e cabine). Toque para abrir a página original.',
    CREDITOS.map(([obra, autor, url]) => ({ rotulo: `🚌 "${obra}" · por ${autor} (Sketchfab)`, fn: () => window.open(url, '_blank', 'noopener') })));
}
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
    camEstudio = new THREE.PerspectiveCamera(42, 1.6, 0.1, 60); camEstudio.layers.enable(1); camEstudio.position.set(i.base.x + 5, 1.55, i.base.z + 0.4); camEstudio.lookAt(i.base.x + 5, 1.1, i.base.z - 4.6);
    // mural
    caixa(3.2, 1.8, 0.06, '#2b3442', -6, 2, -5.8); placa('Mural de matérias', -6, -5.5, 3.2); i.pontos.mural = { x: i.base.x - 6, z: i.base.z - 4.6 };
    for (let k = 0; k < 3; k++) caixa(0.5, 1.9, 0.7, '#3a4a66', 7.6, 0.95, 3 + k * 0.8);   // armários da imprensa
    movel(i, 'vestiario', 7.6, 3.8, 0.5, 2.4, [-1, 0]); placa('👔 Vestiário', 7.6, 3.8, 2.6);
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
    if (pontoInterior('vestiario', 1.6)) return ['vestiário: vestir ou tirar a farda', 'Farda'];
    if (pontoInterior('mesa', 1.6)) return [redator() ? 'mesa de edição: editor completo do jornal' : 'mesa de edição (só jornalistas)', 'Editar'];
    if (pontoInterior('estudio', 2.6)) return [redator() ? 'estúdio: tirar foto de quem está na marca' : 'estúdio de fotos (fique na marca amarela)', redator() ? 'Foto' : 'Posar'];
    if (pontoInterior('mural', 1.8)) return ['ler o mural de matérias', 'Ler'];
    return ['', ''];
  },
  acao: () => {
    if (naPorta()) { sairSala(); return; }
    if (pontoInterior('vestiario', 1.6)) { vestiario('Jornal'); return; }
    if (pontoInterior('mesa', 1.6)) { if (redator()) jornal.abrirEditor(); else aviso('Só jornalistas usam a mesa de edição.'); return; }
    if (pontoInterior('estudio', 2.6)) {
      if (redator()) escolher('📸 Estúdio', 'A câmera fixa fotografa quem está na marca amarela.', [{ rotulo: '📸 Tirar a foto agora', fn: () => fotoEstudio() }, { rotulo: '📨 Convidar alguém para o estúdio', fn: () => convidarEstudio() }]);
      else { jogador.yaw = 0; aviso('😄 Pose! Olhe para a câmera e espere o jornalista.'); }
      return;
    }
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
  const ops = (d.procurados || []).map((p) => ({ rotulo: `🚨 ${esc(p.nome)} · ${estrelas(p.crimes)} · visto em x ${Math.round(p.x)}, z ${Math.round(p.z)} — denunciar à polícia (+400)`, fn: async () => {
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
    escolher('🚨 Procurados', lista.length ? 'Os mais procurados da cidade agora:' : 'Ninguém procurado agora.', lista.length ? lista.map((p) => ({ rotulo: `${esc(p.nome)} · ${estrelas(p.crimes)}${p.recompensa ? ` · recompensa ${num(p.recompensa)}` : ''}`, fn: () => {} })) : [{ rotulo: 'Ok', fn: () => {} }]);
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
    for (let k = 0; k < 4; k++) caixa(0.7, 1.9, 0.5, '#3d4652', -11.2 + k * 0.8, 0.95, 6.4);   // armários do vestiário
    caixa(2, 2.6, 0.15, '#4b5a3a', -16, 1.3, 6.8); i.pontos.treino = { x: i.base.x - 16, z: i.base.z + 5.8 }; placa('🏋️ Centro de treinamento', -16, 6.6, 3);
    movel(i, 'vestiario', -10, 6.4, 3.2, 0.5, [0, -1]); placa('👔 Vestiário', -10, 6.4, 2.6);
    caixa(1.6, 2.4, 0.15, '#2b2f36', 4, 1.2, -6.8); i.pontos.celas = { x: i.base.x + 4, z: i.base.z - 5.8 }; placa('🔒 Carceragem', 4, -6.5, 2.9);
  });
}
function salaBombeiros() {
  return montarSala('bombeiros', 3000, 1300, 22, 14, { piso: '#6a5f57', parede: '#e4d6c8' }, (i) => {
    const { caixa, placa, g } = i;
    caixa(22, 0.4, 0.32, '#c0392b', 0, 3.2, -6.8);
    caixa(3.4, 1.1, 1, '#7a2e26', 5, 0.55, 1.5); movel(i, 'balcao', 5, 1.5, 3.4, 1); placa('Balcão dos bombeiros', 5, 1.5, 2.4);
    caixa(3, 1.8, 0.1, '#20262e', -2, 2, -6.7); movel(i, 'quadro', -2, -6.5, 3, 0.4); placa('Incêndios na cidade', -2, -6.5, 3.2);
    for (let k = 0; k < 5; k++) { caixa(0.6, 1.8, 0.5, '#b03a2e', -9 + k * 0.8, 0.9, -6.3); caixa(0.45, 0.45, 0.3, '#f1c40f', -9 + k * 0.8, 1.9, -6.2); }   // armários com capacetes
    i.obst.push([-9.4, -5.4, -6.7, -5.9]); placa('👔 Vestiário', -7.4, -6, 2.8); i.pontos.vestiario = { x: i.base.x - 7.4, z: i.base.z - 5 };
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
    if (pontoInterior('vestiario', 1.6)) return ['vestiário: vestir ou tirar a farda', 'Farda'];
    if (pontoInterior('treino', 1.8)) return ['centro de treinamento: corrida, luta e tiro', 'Treinar'];
    if (pontoInterior('celas', 1.6)) return [daPolicia() ? 'entrar na carceragem (celas dos presos)' : 'carceragem (só policiais e PRF)', 'Celas'];
    if (pontoInterior('balcao', 1.8)) return [servicoPolicia(), 'Polícia'];
    if (pontoInterior('quadro', 1.8)) return ['quadro de procurados', 'Ver'];
    if (pontoInterior('estande', 2.2)) return [daPolicia() ? 'estande de tiro: saque a arma e mire nos alvos' : 'estande de tiro (só policiais)', 'Estande'];
    return ['', ''];
  },
  acao: () => {
    if (naPorta()) { sairSala(); return; }
    if (pontoInterior('vestiario', 1.6)) { vestiario('Polícia'); return; }
    if (pontoInterior('treino', 1.8)) { const pt = jogador.pos; entrarTreino({ chave: jogador.dentroCasa, x: pt.x, z: pt.z }); return; }
    if (pontoInterior('celas', 1.6)) { entrarCarceragem(); return; }
    if (pontoInterior('balcao', 1.8)) { alternarServico(); return; }
    if (pontoInterior('quadro', 1.8)) { quadroProcurados(); return; }
    if (pontoInterior('estande', 2.2)) aviso(daPolicia() ? '🎯 Saque a arma (Arma) e atire nos alvos: a mira compensa a distância.' : 'Só policiais usam o estande.', 3);
  },
};
SALAS.prf = {
  contexto: () => {
    if (naPorta()) return ['sair do posto da PRF', 'Sair'];
    if (pontoInterior('vestiario', 1.6)) return ['vestiário: vestir ou tirar a farda', 'Farda'];
    if (pontoInterior('treino', 1.8)) return ['centro de treinamento: corrida, luta e tiro', 'Treinar'];
    if (pontoInterior('celas', 1.6)) return [daPolicia() ? 'entrar na carceragem (celas dos presos)' : 'carceragem (só policiais e PRF)', 'Celas'];
    if (pontoInterior('balcao', 1.8)) return ['posto da PRF: serviço e investigações', 'PRF'];
    if (pontoInterior('quadro', 1.8)) return ['quadro de procurados', 'Ver'];
    if (pontoInterior('estande', 2.2)) return [daPolicia() ? 'estande de tiro: saque a arma e mire nos alvos' : 'estande de tiro (só agentes)', 'Estande'];
    return ['', ''];
  },
  acao: () => {
    if (naPorta()) { sairSala(); return; }
    if (pontoInterior('vestiario', 1.6)) { vestiario('PRF'); return; }
    if (pontoInterior('treino', 1.8)) { const pt = jogador.pos; entrarTreino({ chave: jogador.dentroCasa, x: pt.x, z: pt.z }); return; }
    if (pontoInterior('celas', 1.6)) { entrarCarceragem(); return; }
    if (pontoInterior('balcao', 1.8)) { abrirPrefeitura('prf'); return; }
    if (pontoInterior('quadro', 1.8)) { quadroProcurados(); return; }
    if (pontoInterior('estande', 2.2)) aviso(daPolicia() ? '🎯 Saque a arma (Arma) e atire nos alvos: a mira compensa a distância.' : 'Só agentes usam o estande.', 3);
  },
};
SALAS.bombeiros = {
  contexto: () => {
    if (naPorta()) return ['sair do quartel dos bombeiros', 'Sair'];
    if (pontoInterior('vestiario', 1.6)) return ['vestiário: vestir ou tirar a farda', 'Farda'];
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
    if (pontoInterior('vestiario', 1.6)) { vestiario('Bombeiros'); return; }
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

// ---------------------------------------------------------------- bloqueios (o bloqueado some do meu chat e da minha voz)
const bloqueados = new Set();
async function carregarBloqueios() { try { const l = await rede.conta.bloqueios(); bloqueados.clear(); for (const b of l || []) bloqueados.add(b.alvo); } catch { /* tenta depois */ } }

// ---------------------------------------------------------------- convite para o estúdio de fotos (jornalista → jogador)
function convidarEstudio() {
  const lista = [...remotos.entries()].filter(([id]) => !bloqueados.has(id));
  if (!lista.length) { aviso('Ninguém online para convidar agora.'); return; }
  escolher('📨 Convidar para o estúdio', 'O jogador recebe o convite e, se aceitar, vem direto para a marca do estúdio na redação.', lista.map(([id, r]) => ({
    rotulo: `📸 ${esc(r.meta?.nome || 'jogador')}`,
    fn: () => { conexao?.enviar('gesto', { de: jogador.perfil.id, para: id, tipo: 'estudio', nome: jogador.perfil.nome }); aviso(`📨 Convite enviado para ${r.meta?.nome || 'o jogador'}.`, 3); },
  })));
}
function conviteEstudio(g) {
  if (bloqueados.has(g.de)) return;
  const nome = String(g.nome || remotos.get(g.de)?.meta?.nome || 'Um jornalista').slice(0, 24);
  const responder = (tipo) => conexao?.enviar('gesto', { de: jogador.perfil.id, para: g.de, tipo });
  escolher('📸 Convite do Jornal', `<b>${esc(nome)}</b> convidou você para uma sessão de fotos no estúdio do Jornal da Cidade. A foto pode sair numa reportagem!`, [
    { rotulo: '✅ Aceitar e ir ao estúdio', fn: () => {
      if (jogador.pena > 0 || jogador.algemado || jogador.morto) { aviso('Agora você não pode ir.'); responder('estudioNao'); return; }
      if (jogador.passageiro || jogador.trem) { aviso('Desça primeiro e aceite de novo.'); responder('estudioNao'); return; }
      if (jogador.dentroCasa !== 'redacao') entrarRedacao();
      const p = interiores.get('redacao')?.pontos.estudio;
      if (p) { teleportar(p.x, p.z); jogador.yaw = 0; jogador.alvo = null; }
      aviso('😄 Você está na marca do estúdio. Olhe para a câmera e espere a foto!', 4);
      responder('estudioOk');
    } },
    { rotulo: 'Agora não', fn: () => responder('estudioNao') }]);
}

// ================================================================= carros estacionados na rua: dá para roubar
// Arrombar leva 2,5 s e é crime. O carro some da vaga (para todos) e anda com quem roubou. Largado, fica onde parou;
// depois de 5 minutos parado ele volta sozinho para a vaga de origem. Outro jogador pode roubar o largado de novo.
const MODELO_RUA = ['popular', 'suv', 'esportivo'];
const largadosRua = new Map();   // k -> { mesh, x, z, ate }
let roubandoRua = false;
function carroRuaProximo() {
  if (jogador.carro || jogador.trem || jogador.dentroCasa || jogador.passageiro) return null;
  let melhor = null, md = 3.2;
  for (const [k, l] of largadosRua) { if (l.queima > 0 || veiculoEmChamas('rua:' + k)) continue; const d = Math.hypot(l.x - jogador.pos.x, l.z - jogador.pos.z); if (d < md) { md = d; melhor = k; } }
  if (melhor !== null) return melhor;
  return mundo.carroRuaPerto(jogador.pos.x, jogador.pos.z, 3.2);
}
async function roubarCarroRua(k) {
  if (roubandoRua || jogador.trava > 0) return;
  if (jogador.perfil?.policial || jogador.perfil?.prf) { aviso('Policial em serviço não rouba carro.'); return; }
  const c = mundo.carroRua(k), l = largadosRua.get(k); if (!c) return;
  roubandoRua = true;
  const px = l ? l.x : c.x, pz = l ? l.z : c.z, rot = l ? l.r : c.rot;
  virarPara(px, pz); jogador.alvo = null;
  jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 0.7, fade: 0.1 }); jogador.trava = 2.5;
  aviso('Arrombando o carro…', 2.5);
  await new Promise((r) => setTimeout(r, 2500));
  try {
    if (jogador.morto || Math.hypot(px - jogador.pos.x, pz - jogador.pos.z) > 4) throw new Error('Você se afastou do carro.');
    await rede.roubarCarroRua();
    const modelo = MODELO_RUA[c.tipo] || 'popular';
    if (l) { scene.remove(l.mesh); largadosRua.delete(k); }
    roubadosRua.delete(k);
    mundo.tirarCarroRua(k, true);
    const mesh = civico.modeloCarro(modelo, c.cor); mesh.position.set(px, alturaChao(px, pz), pz); mesh.rotation.y = rot; scene.add(mesh);
    conexao?.enviar('carroRua', { k, tipo: 'roubado' });
    entrarCarro({ d: { id: 'rua' + k, modelo, cor: c.cor }, mesh });
    jogador.carro.rua = k; jogador.carro.salvar = 1e9;
    aviso('🚗 Carro roubado! Você está procurado. Largado, ele volta para a vaga depois de 5 min.', 4);
  } catch (e) { aviso(e.message, 3); }
  finally { roubandoRua = false; }
}
function largarCarroRua(c) {
  jogador.carro = null; modoVolante(false);
  const x = jogador.pos.x, z = jogador.pos.z, r = jogador.yaw;
  c.mesh.position.set(x, alturaChao(x, z), z); c.mesh.rotation.y = r;
  largadosRua.set(c.rua, { mesh: c.mesh, x, z, r, ate: agoraServidor() + 300000 });
  conexao?.enviar('carroRua', { k: c.rua, tipo: 'largado', x, z, r, ate: agoraServidor() + 300000 });
  ultimoLargado = { ref: 'rua:' + c.rua, ate: agoraServidor() + 90000 };
  const lx = Math.cos(r) * 1.8, lz = -Math.sin(r) * 1.8;
  jogador.pos.x += lx; jogador.pos.z += lz; resolverColisao(jogador.pos, jogador.raio);
  jogador.avatar.raiz.visible = true;
  aviso('Carro largado. Parado por 5 min, ele volta para a vaga de origem.', 3);
}
function receberCarroRua(m) {
  const c = mundo.carroRua(m.k); if (!c) return;
  const l = largadosRua.get(m.k); if (l) { scene.remove(l.mesh); largadosRua.delete(m.k); }
  if (m.tipo === 'roubado') { mundo.tirarCarroRua(m.k, true); roubadosRua.set(m.k, agoraServidor()); return; }
  if (m.tipo === 'largado') {
    mundo.tirarCarroRua(m.k, true);
    const mesh = civico.modeloCarro(MODELO_RUA[c.tipo] || 'popular', c.cor); mesh.position.set(m.x, alturaChao(m.x, m.z), m.z); mesh.rotation.y = m.r; scene.add(mesh);
    largadosRua.set(m.k, { mesh, x: m.x, z: m.z, r: m.r, ate: m.ate || agoraServidor() + 300000 });
  }
}
// ================================================================= fogo em veículo (clãs)
// Quem é de clã larga o veículo e, no primeiro minuto e meio, pode pôr fogo nele. O fogo começa pequeno e cresce
// até queimar tudo (~90 s): no começo qualquer um abafa; depois só os bombeiros (1 ou 2 caminhões, pelo tamanho).
let ultimoLargado = null, incendiando = false;
const veiculoEmChamas = (ref) => servicos.listaIncendios().some((f) => f.ref === ref);
// veículos que podem pegar fogo, pela referência ('rua:12' …): { mesh, x, z }
function veiculoPorRef(ref) {
  const [t, k] = ref.split(':');
  if (t === 'rua') { const l = largadosRua.get(+k); return l ? { mesh: l.mesh, x: l.x, z: l.z, l } : null; }
  if (t === 'cam') { const c = caminhoes.get(+k); return c?.obj && c.d.status === 'dirigido' && !c.d.motorista ? { mesh: c.obj, x: c.obj.position.x, z: c.obj.position.z, l: c } : null; }
  if (t === 'car') { const v = carrosMundo.get(+k); return v?.mesh && jogador.carro?.id !== v.d.id ? { mesh: v.mesh, x: v.mesh.position.x, z: v.mesh.position.z, l: v } : null; }
  if (t === 'juj') { const v = viagensJuj.get(+k); return v?.mesh && v.d.status === 'sequestrada' && v.d.largado ? { mesh: v.mesh, x: v.mesh.position.x, z: v.mesh.position.z, l: v } : null; }
  if (t === 'van') { const v = vansNpc.find((x) => x.id === +k); return v?.roubada && jogador.carro?.vanNpc !== v ? { mesh: v.obj, x: v.obj.position.x, z: v.obj.position.z, l: v } : null; }
  if (t === 'via') { const v = viaturas.find((x) => x.id === +k); return v?.roubada && jogador.carro?.viatura !== v ? { mesh: v.obj, x: v.obj.position.x, z: v.obj.position.z, l: v } : null; }
  if (t === 'seq') { const s = seqOnibus.get(+k); return s?.mesh ? { mesh: s.mesh, x: s.mesh.position.x, z: s.mesh.position.z, l: s } : null; }
  return null;
}
// botão extra dos crimes de clã (ao lado do botão de ação, que continua com Entrar/Arrombar/Dirigir)
function contextoCrime() {
  if (jogador.carregando) return null;
  { const r = contextoRacoes(); if (r) return r; }
  { const jj = jujubaParaSequestrar(); if (jj) return ['sequestrar o caminhão de rações (crime de clã)', '🔫 Sequestrar', () => sequestrarJujuba(jj)]; }
  const vi = veiculoParaIncendiar(); if (vi) return ['pôr fogo no veículo (crime de clã)', '🔥 Incendiar', () => incendiarVeiculo(vi)];
  const ob = onibusParaSequestrar(); if (ob) return ['sequestrar o ônibus (crime de clã)', '🔫 Sequestrar', () => sequestrarOnibus(ob)];
  const pn = pedestreParaAssaltar(); if (pn) return ['assaltar o pedestre (crime)', '💰 Assaltar', () => assaltarPedestre(pn)];
  const vn = vanNpcParaSequestrar(); if (vn) return ['sequestrar a van (crime de clã)', '🔫 Sequestrar', () => sequestrarVanNpc(vn)];
  const ve = veiculoEmpresaParaSequestrar(); if (ve) return [`sequestrar ${ve.d.tipo === 'van' ? 'a van' : 'o caminhão'} (crime de clã)`, '🔫 Sequestrar', () => sequestrarVeiculoEmpresa(ve)];
  return null;
}
function vanNpcParaSequestrar() {
  if (!jogador.cla || !jogador.armado || jogador.carro || jogador.dentroCasa || jogador.passageiro || jogador.onibus || jogador.morto || sequestrando) return null;
  if (jogador.perfil?.policial || jogador.perfil?.prf) return null;
  for (const v of vansNpc) {
    if (v.roubada || !v.obj.visible) continue;
    const a = v.obj.rotation.y, fx = Math.sin(a), fz = Math.cos(a), dx = jogador.pos.x - v.obj.position.x, dz = jogador.pos.z - v.obj.position.z;
    const f = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
    if (f < 2 || f > 11 || lat > 2.3) continue;
    if (Math.cos(jogador.yaw - Math.atan2(-dx, -dz)) < 0.6) continue;
    return v;
  }
  return null;
}
async function sequestrarVanNpc(v) {
  if (sequestrando) return; sequestrando = true;
  const o = v.obj, x = o.position.x, z = o.position.z, ang = o.rotation.y;
  virarPara(x, z); jogador.alvo = null;
  try {
    await rede.roubarCarroRua();   // conta como crime
    v.roubada = true; v.largadaAte = 0;
    const espera = fugirDoVeiculo(x, z, ang, 5, 1);
    jogador.trava = espera / 1000;
    aviso('🔫 Van sequestrada! O motorista está descendo…', 3);
    setTimeout(() => {
      if (jogador.morto || jogador.carro || Math.hypot(x - jogador.pos.x, z - jogador.pos.z) > 25) { v.largadaAte = agoraServidor() + 420000; return; }
      entrarCarro({ d: { id: 'vnpc' + v.id, modelo: 'van', cor: '#f2f2ee' }, mesh: o });
      jogador.carro.vanNpc = v; jogador.carro.salvar = 1e9;
      aviso('🚐 A van é sua por enquanto. Largada e parada 7 min, ela some.', 3.5);
    }, espera);
  } catch (e) { aviso(e.message, 3); }
  finally { sequestrando = false; }
}
function largarVanNpc(c) {
  const v = c.vanNpc;
  jogador.carro = null; modoVolante(false);
  const x = jogador.pos.x, z = jogador.pos.z, r = jogador.yaw;
  v.obj.position.set(x, alturaChao(x, z), z); v.obj.rotation.y = r;
  v.largadaAte = agoraServidor() + 420000;
  ultimoLargado = { ref: 'van:' + v.id, ate: agoraServidor() + 90000 };
  jogador.pos.x += -Math.cos(r) * 2; jogador.pos.z += Math.sin(r) * 2; resolverColisao(jogador.pos, jogador.raio);
  jogador.avatar.raiz.visible = true;
  aviso('Van largada. Dá para pôr fogo nela. Parada 7 min, ela some.', 3);
}
function vanLargadaPerto() {
  if (jogador.carro || jogador.dentroCasa || jogador.passageiro || jogador.onibus || jogador.morto) return null;
  return vansNpc.find((v) => v.roubada && v.largadaAte > agoraServidor() && !veiculoEmChamas('van:' + v.id) && !(v.queima > 0) && Math.hypot(v.obj.position.x - jogador.pos.x, v.obj.position.z - jogador.pos.z) < 3.5) || null;
}
// pedestre NPC perto, você armado e virado para ele
let assaltando = false;
function pedestreParaAssaltar() {
  if (!jogador.armado || jogador.carro || jogador.dentroCasa || jogador.passageiro || jogador.onibus || jogador.morto || assaltando) return null;
  if (jogador.perfil?.policial || jogador.perfil?.prf) return null;
  for (const n of npcs) {
    if (!n.civil || n.caido > 0 || n.fugindoT > 0 || !n.av.raiz.visible || n.conversa || n.algemado) continue;
    const p = n.av.raiz.position, dx = p.x - jogador.pos.x, dz = p.z - jogador.pos.z, d = Math.hypot(dx, dz);
    if (d > 3.5) continue;
    if (Math.cos(jogador.yaw - Math.atan2(dx, dz)) < 0.5) continue;
    return n;
  }
  return null;
}
async function assaltarPedestre(n) {
  assaltando = true;
  const p = n.av.raiz.position; virarPara(p.x, p.z); jogador.alvo = null;
  n.av.raiz.rotation.y = Math.atan2(jogador.pos.x - p.x, jogador.pos.z - p.z); n.av.tocar('idle'); n.rendido = 1.2;
  try {
    const v = await rede.assaltarNpc();
    const chamou = Math.random() < 0.4;
    aviso(`💰 O pedestre entregou ${v} moedas e saiu correndo.${chamou ? ' Ele vai chamar a polícia!' : ''}`, 3.5);
    let ax = p.x - jogador.pos.x, az = p.z - jogador.pos.z; const d = Math.hypot(ax, az) || 1;
    n.fugir = { dx: ax / d, dz: az / d }; n.fugindoT = 6; n.av.tocar('run');
    if (chamou) setTimeout(() => {
      jogador.denunciadoEm = performance.now();
      const rua = nomeDaRua(jogador.pos.x, jogador.pos.z) || 'cidade';
      conexao?.enviar('denuncia', { x: jogador.pos.x, z: jogador.pos.z, rua, nome: jogador.perfil.nome });
    }, 4000);
  } catch (e) { aviso(e.message, 3); n.rendido = 0; }
  finally { assaltando = false; }
}
// caminhão ou van de empresa fazendo entrega, com você na frente apontando a arma
function veiculoEmpresaParaSequestrar() {
  if (!jogador.cla || !jogador.armado || jogador.carro || jogador.dentroCasa || jogador.passageiro || jogador.onibus || jogador.morto || sequestrando || taxi) return null;
  if (jogador.perfil?.policial || jogador.perfil?.prf) return null;
  for (const c of caminhoes.values()) {
    if (!c.obj?.visible || c.d.status !== 'em_rota' || c.d.roubado || c.d.tipo === 'helicoptero') continue;
    const comp = c.d.tipo === 'van' ? 5 : 9, a = c.obj.rotation.y, fx = Math.sin(a), fz = Math.cos(a);
    const dx = jogador.pos.x - c.obj.position.x, dz = jogador.pos.z - c.obj.position.z, f = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
    if (f < comp / 2 - 0.5 || f > comp / 2 + 9 || lat > 2.4) continue;
    if (Math.cos(jogador.yaw - Math.atan2(-dx, -dz)) < 0.6) continue;
    return c;
  }
  return null;
}
async function sequestrarVeiculoEmpresa(c) {
  if (sequestrando) return; sequestrando = true;
  const x = c.obj.position.x, z = c.obj.position.z, ang = c.obj.rotation.y, tipo = c.d.tipo || 'caminhao';
  virarPara(x, z); jogador.alvo = null;
  try {
    const carga = await rede.veiculos.sequestrar(c.d.id, x, z, ang);
    c.d = { ...c.d, status: 'dirigido', motorista: jogador.perfil.id, sequestrado: true, roubado: true, pos_x: x, pos_z: z, ang };
    const espera = fugirDoVeiculo(x, z, ang, tipo === 'van' ? 5 : 9, 1, true);   // o robô motorista desce e foge
    jogador.trava = espera / 1000;
    aviso(`🔫 ${NOME_VEICULO[tipo] || 'Veículo'} sequestrado! O robô motorista está descendo…`, 3);
    setTimeout(() => {
      if (jogador.morto || jogador.carro || Math.hypot(x - jogador.pos.x, z - jogador.pos.z) > 25) { rede.veiculos.sair(c.d.id, x, z, ang).catch(() => {}); return; }
      dirigirVeiculoEmpresa(c, carga);
    }, espera);
  } catch (e) { aviso(e.message, 3); }
  finally { sequestrando = false; }
}
function dirigirVeiculoEmpresa(c, carga) {
  const tipo = c.d.tipo || 'caminhao';
  if (jogador.armado) alternarArma();
  modoVolante(true);
  jogador.carro = { caminhao: c.d.id, tipo, modelo: tipo, cor: '#ffffff', vel: 0, mesh: c.obj, salvar: 1.5, desde: performance.now(), sequestrado: true, carga, max: tipo === 'van' ? 12 : 10 };
  jogador.pos.set(c.obj.position.x, alturaChao(c.obj.position.x, c.obj.position.z), c.obj.position.z); jogador.yaw = c.obj.rotation.y; jogador.alvo = null;
  jogador.avatar.raiz.visible = false;
  aviso(carga > 0 ? `🚚 Agora é você no volante, com ${carga} caixas. Leve até o território do clã ou a sua casa e toque em Descarregar.` : '🚚 Agora é você no volante. O veículo está vazio.', 5);
}
// pontos dos armazéns de rações (balcão de cada corporação) e da central do Exército
function pontoRacoes() {
  const k = racoes.corpDe(jogador.perfil);
  return k === 'policia' ? pontos.delegacia : k === 'prf' ? civico.PREFEITURA.prf : k === 'bombeiros' ? civico.BOMBEIROS.balcao : null;
}
function contextoRacoes() {
  if (jogador.carro || jogador.dentroCasa || jogador.morto) return null;
  const pr = pontoRacoes();
  if (pr && perto(pr, 4)) return ['armazém de rações (jujubas)', '🍬 Rações', () => racoes.abrir('armazem')];
  if (perto(civico.EXERCITO.balcao, 4)) return militar() ? ['central de rações: estoques e pedidos', '🍬 Rações', () => racoes.abrir('central')] : ['licitação do transporte de rações', '📄 Licitação', () => racoes.abrir('licitacao')];
  return null;
}
function acaoCrime() { const c = contextoCrime(); if (c) c[2](); }
function veiculoParaIncendiar() {
  if (!jogador.cla || !ultimoLargado || agoraServidor() > ultimoLargado.ate || jogador.carro || jogador.dentroCasa || jogador.passageiro || jogador.morto) return null;
  if (jogador.perfil?.policial || jogador.perfil?.prf || veiculoEmChamas(ultimoLargado.ref)) return null;
  const v = veiculoPorRef(ultimoLargado.ref); if (!v || v.l?.queima > 0) return null;
  return Math.hypot(v.x - jogador.pos.x, v.z - jogador.pos.z) < 5 ? { ...v, ref: ultimoLargado.ref } : null;
}
async function incendiarVeiculo(v) {
  if (incendiando) return; incendiando = true;
  const modelo = v.mesh.userData.modelo || (v.l?.d?.tipo), porte = /onibus|caminhao|bombeiros/.test(modelo || '') || v.ref.startsWith('cam:') && v.l?.d?.tipo !== 'van' ? 2 : 1;
  virarPara(v.x, v.z); jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 0.9, fade: 0.1 }); jogador.trava = 1.2;
  try {
    await rede.incendiarVeiculo(v.ref, v.x, v.z, civico.CARROS[modelo]?.nome || NOME_VEICULO[modelo] || 'Veículo', porte);
    ultimoLargado = null; servicos.recarregarFogo();
    aviso('🔥 Fogo no veículo! Ele vai queimar aos poucos. Você está procurado.', 4);
  } catch (e) { aviso(e.message, 3); }
  finally { incendiando = false; }
}
// o veículo vai escurecendo enquanto queima (de 20 s até ~90 s, todo preto: carcaça)
let tempoQueima = 0;
function atualizarQueimados(dt) {
  if ((tempoQueima -= dt) > 0) return; tempoQueima = 0.5;
  const agora = agoraServidor();
  // carro de vaga que pegou fogo (explosão do lado): sai da vaga e vira um carro de verdade ali mesmo, para queimar
  for (const f of servicos.listaIncendios()) {
    if (f.tipo !== 'veiculo' || !f.ref?.startsWith('rua:')) continue;
    const k = +f.ref.slice(4), c = mundo.carroRua(k); if (!c || largadosRua.has(k)) continue;
    mundo.tirarCarroRua(k, true);   // o carro está onde o fogo está (vaga ou onde foi largado)
    const mesh = civico.modeloCarro(MODELO_RUA[c.tipo] || 'popular', c.cor); mesh.position.set(f.x, alturaChao(f.x, f.z), f.z); mesh.rotation.y = c.rot; scene.add(mesh);
    largadosRua.set(k, { mesh, x: f.x, z: f.z, r: c.rot, ate: Date.parse(f.inicio) + 360000 });   // depois de ~6 min volta uma vaga nova
  }
  for (const f of servicos.listaIncendios()) {
    if (f.tipo !== 'veiculo' || !f.ref) continue;
    const v = veiculoPorRef(f.ref); if (!v) continue;
    const q = Math.min(1, Math.max(0, ((agora - Date.parse(f.inicio)) / 1000 - 20) / 70));
    if (v.l) v.l.queima = Math.max(v.l.queima || 0, q);
    pintarQueimado(v.mesh, v.l ? v.l.queima : q);
  }
  // o veículo da empresa voltou para o dono (garagem): sai novo, sem a pintura de queimado
  for (const c of caminhoes.values()) if (c.obj?.userData.queimado && c.d.status !== 'dirigido') { limparQueimado(c.obj); c.queima = 0; }
}
function limparQueimado(mesh) {
  mesh.traverse((o) => { if (o.userData.matSemQueima) { o.material = o.userData.matSemQueima; delete o.userData.matSemQueima; delete o.userData.matQueima; } });
  mesh.userData.queimado = false;
}
function pintarQueimado(mesh, q) {
  if (!(q > 0)) return;
  mesh.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (!o.userData.matQueima) { o.userData.matSemQueima = o.material; o.userData.matQueima = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); o.material = o.userData.matQueima; for (const m of [].concat(o.material)) m.userData.cor0 = m.color?.clone(); }
    mesh.userData.queimado = true;
    for (const m of [].concat(o.material)) if (m.userData.cor0) { m.color.copy(m.userData.cor0).multiplyScalar(1 - 0.9 * q); if (m.map && q > 0.85) m.map = null, m.needsUpdate = true; }
  });
}
// ================================================================= rua obstruída e explosão de veículo em chamas
// Veículo pegando fogo (e a carcaça depois) fecha a faixa: os NPCs param, ninguém passa por dentro, e os caminhos
// (serviços, viaturas, rações) desviam pela rua mais perto. Ônibus que ainda não entrou no trecho contorna a quadra.
// Sem ninguém apagar, explode (carro/van 75 s, ônibus/caminhão 100 s), machuca quem está perto e o fogo pula para
// veículos parados a até 8 m — que também podem explodir.
const obstrucoes = [];          // { x, z, r, marca, ref }
const carcacas = new Map();     // ref -> { x, z, r } (fogo acabou, a carcaça continua ali)
const explodidos = new Set(), pedidoExplosao = new Map(), marcasFogo = new Map();
let chaveBloq = '', tempoBloq = 0, desvioSeq = 0;
function atualizarObstrucoes(dt) {
  if ((tempoBloq -= dt) > 0) return; tempoBloq = 1;
  const lista = [];
  for (const f of servicos.listaIncendios()) if (f.tipo === 'veiculo') {
    const r = f.porte >= 2 ? 6 : 5, v = f.ref && veiculoPorRef(f.ref), x = v ? v.x : f.x, z = v ? v.z : f.z;   // fecha a rua toda (as duas faixas)
    lista.push({ x, z, r, ref: f.ref }); if (f.ref) carcacas.set(f.ref, { x, z, r });
  }
  for (const [ref, k] of carcacas) {   // carcaça: some quando o veículo sai dali (volta para a vaga, o dono, a rota…)
    if (lista.some((l) => l.ref === ref)) continue;
    const v = veiculoPorRef(ref);
    if (!v || !(v.l?.queima > 0.3 || v.mesh?.userData.queimado) || Math.hypot(v.x - k.x, v.z - k.z) > 3) { carcacas.delete(ref); continue; }
    lista.push({ ...k, ref });
  }
  obstrucoes.length = 0; for (const k of lista) { if (!marcasFogo.has(k.ref)) marcasFogo.set(k.ref, { fogo: k.ref }); obstrucoes.push({ ...k, marca: marcasFogo.get(k.ref) }); }
  const chave = lista.map((k) => `${k.ref}@${Math.round(k.x)},${Math.round(k.z)}`).sort().join('|');
  if (chave === chaveBloq) return;
  chaveBloq = chave;
  mundo.definirBloqueios(lista.map((k) => ({ x: k.x, z: k.z, r: k.r })));
  montarDesvios(lista);
  for (const v of viaturas) v.recalc = 0;   // perseguição refaz o caminho
  for (const v of viagensJuj.values()) v.desvio = null;
}
// para cada linha de ônibus: trecho em volta do bloqueio [s1, s2] e o caminho alternativo pelas ruas
function montarDesvios(lista) {
  for (const L of LINHAS) {
    L.desvios = [];
    if (!L.L) continue;
    for (const k of lista) {
      let sb = null, dm = 6;
      for (let s = 0; s < L.L; s += 2) { const q = pontoCaminho(L, s), d = Math.hypot(q.x - k.x, q.z - k.z); if (d < dm) { dm = d; sb = s; } }
      if (sb === null) continue;
      const s1 = Math.max(0, sb - 32), s2 = Math.min(L.L, sb + 32);
      if (!L.circular && (s1 < 14 || s2 > L.sFila - 60)) continue;   // dentro/na porta da rodoviária não dá para contornar: espera
      const a = pontoCaminho(L, s1), b = pontoCaminho(L, s2), rota = servicos.rotaRuas({ x: a.x, z: a.z }, { x: b.x, z: b.z });
      if (!rota || rota.total > 450 || rota.total < (s2 - s1) * 0.8 || rota.pts.some((p, i) => i > 0 && mundo.distTrecho(k, rota.pts[i - 1], p) < k.r + 2)) continue;   // sem volta possível: espera
      L.desvios.push({ id: ++desvioSeq, s1, s2, rota });
    }
  }
}
function explosoesDeFogo() {
  const agora = agoraServidor(), t = performance.now();
  for (const f of servicos.listaIncendios()) {
    if (f.tipo !== 'veiculo' || explodidos.has(f.id)) continue;
    const quando = Date.parse(f.inicio) + (f.porte >= 2 ? 100000 : 75000);
    if (f.explodiu_em) { explosaoVeiculo(f, agora - Date.parse(f.explodiu_em) < 15000); continue; }
    if (agora < quando || Math.hypot(f.x - jogador.pos.x, f.z - jogador.pos.z) > 250 || t < (pedidoExplosao.get(f.id) || 0)) continue;
    pedidoExplosao.set(f.id, t + 4000);
    rede.explodirIncendio(f.id).then((ok) => { if (ok) { f.explodiu_em = new Date(agoraServidor()).toISOString(); explosaoVeiculo(f, true); } }).catch(() => {});
  }
}
function explosaoVeiculo(f, agoraMesmo) {
  if (explodidos.has(f.id)) return; explodidos.add(f.id);
  if (!agoraMesmo) return;   // chegou depois: só a carcaça
  const v = f.ref && veiculoPorRef(f.ref), x = v ? v.x : f.x, z = v ? v.z : f.z, k = f.porte >= 2 ? 1.8 : 1.3;
  efeitoExplosao(x, alturaChao(x, z), z, k, false);
  if (v?.l) v.l.queima = 1; if (v?.mesh) pintarQueimado(v.mesh, 1);
  const d = Math.hypot(x - jogador.pos.x, z - jogador.pos.z);
  if (!jogador.morto && !jogador.dentroCasa && !jogador.perfil?.imortal) {
    if (d < 6) { danoLocal(50); aviso('💥 Um veículo explodiu do seu lado!', 3); } else if (d < 10) { danoLocal(20); aviso('💥 Explosão perto de você!', 2.5); }
  }
  if (d < 40) tremor = Math.max(tremor, 0.6);
  if (d > 160) return;
  // o fogo pula para os veículos parados perto
  const alvos = [];
  const add = (ref, o, nome, porte) => { if (!o || ref === f.ref || veiculoEmChamas(ref)) return; const px = o.position.x, pz = o.position.z; if (Math.hypot(px - x, pz - z) <= 8) alvos.push({ ref, x: px, z: pz, nome, porte }); };
  for (const [k2, l] of largadosRua) add('rua:' + k2, l.mesh, 'Carro', 1);
  for (const k2 of mundo.carrosRuaRaio(x, z, 8)) { const c = mundo.carroRua(k2); if (!largadosRua.has(k2) && !veiculoEmChamas('rua:' + k2)) alvos.push({ ref: 'rua:' + k2, x: c.x, z: c.z, nome: 'Carro', porte: 1 }); }   // estacionados na vaga
  for (const [id, s] of seqOnibus) if (s.mesh) add('seq:' + id, s.mesh, 'Ônibus', 2);
  for (const c of caminhoes.values()) if (c.d.status === 'dirigido' && !c.d.motorista) add('cam:' + c.d.id, c.obj, NOME_VEICULO[c.d.tipo] || 'Caminhão', c.d.tipo === 'van' ? 1 : 2);
  for (const vn of vansNpc) if (vn.roubada && jogador.carro?.vanNpc !== vn) add('van:' + vn.id, vn.obj, 'Van', 1);
  for (const vi of viaturas) if (vi.roubada && jogador.carro?.viatura !== vi) add('via:' + vi.id, vi.obj, 'Viatura', 1);
  for (const vj of viagensJuj.values()) if (vj.mesh && vj.d.status === 'sequestrada' && vj.d.largado) add('juj:' + vj.d.id, vj.mesh, 'Caminhão de rações', 2);
  for (const c of carrosMundo.values()) if (c.mesh.visible && jogador.carro?.id !== c.d.id && !c.d.queimado) add('car:' + c.d.id, c.mesh, civico.CARROS[c.d.modelo]?.nome || 'Carro', 1);
  for (const a of alvos) rede.propagarFogo(f.id, a.ref, a.x, a.z, a.nome, a.porte).then((id) => { if (id) servicos.recarregarFogo(); if (a.ref.startsWith('car:')) { const c = carrosMundo.get(+a.ref.slice(4)); if (c) c.d = { ...c.d, queimado: true }; } }).catch(() => {});
}
// carros de jogador queimados ficam pretos até o conserto
function pintarCarrosQueimados() {
  for (const c of carrosMundo.values()) {
    if (c.d.queimado && !c.mesh.userData.queimado) pintarQueimado(c.mesh, 1);
    else if (!c.d.queimado && c.mesh.userData.queimado && !veiculoEmChamas('car:' + c.d.id)) limparQueimado(c.mesh);
  }
}
// caminhão de rações: refaz o caminho que falta se uma rua do trajeto fechou (chega na mesma hora)
function desvioJujuba(v, agora) {
  if (v.desvio !== null && v.desvio !== undefined) return v.desvio;
  v.desvio = false;
  if (!mundo.bloqueiosRua().length || !v.mesh) return false;
  const ini = Date.parse(v.d.partida), fim = Date.parse(v.d.chegada), f = Math.min(1, Math.max(0, (agora - ini) / Math.max(1, fim - ini)));
  const s0 = f * v.rota.total, resto = v.rota.pts.filter((p, i) => i > 0);
  const passa = mundo.bloqueiosRua().some((k) => resto.some((p) => Math.hypot(p.x - k.x, p.z - k.z) < k.r + 6));
  if (!passa || f >= 1) return false;
  const de = servicos.pontoNaRota(v.rota, s0), nova = servicos.rotaRuas({ x: de.x, z: de.z }, destinoJujuba(v.d.corp), 2.5);
  if (nova) v.desvio = { rota: nova, t0: agora };
  return v.desvio;
}
// ================================================================= jujubas (ração militar)
// Efeito de 5 min (mais rápido, soco mais forte, +20% de vida aos poucos), caminhões de rações saindo do Quartel
// (Porto Sul) para a corporação, sequestro, placa do valor no quartel e o comprador ilegal de Vila Serra.
const COMPRADOR = { x: 64, z: -972, porta: { x: 64, z: -964 } };
const viagensJuj = new Map();   // id -> { d, rota, mesh }
let placaRacoes = null, valorPlaca = 0, compradorMontado = null, tempoJujPos = 0, jujubaAvisou = 0;
const racaoAtiva = () => Math.max(jogador.jujubaAte || 0, Date.parse(jogador.perfil?.jujuba_ate || 0) || 0) > agoraServidor();
async function usarJujuba() {
  const ate = await rede.jujuba.usar();
  jogador.jujubaAte = Date.parse(ate); jujubaAvisou = 0;
  aviso('🍬 Ração militar: 5 minutos mais rápido, mais forte no soco e recuperando vida.', 4);
  return true;
}
const destinoJujuba = (corp) => (corp === 'policia' ? pontos.delegacia : corp === 'prf' ? civico.PREFEITURA.prf : civico.BOMBEIROS.balcao) || { x: 0, z: 0 };
// caminho do Quartel até a corporação: sai de Porto Sul pela rodovia e entra na cidade pelas ruas
function rotaJujuba(corp) {
  const ini = [{ x: mundo.QUARTEL.portao.x - 6, z: mundo.QUARTEL.portao.z }, { x: mundo.QUARTEL.portao.x - 6, z: 945 }, { x: 216, z: 945 }, { x: 216, z: 641 }];
  const cidade = servicos.rotaRuas({ x: 216, z: 641 }, destinoJujuba(corp), 2.5);
  const pts = [...ini, ...(cidade?.pts || [destinoJujuba(corp)]).slice(1)];
  let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return { pts, total };
}
function duracaoViagemJujuba(corp) { return Math.round(rotaJujuba(corp).total / 9); }
function racoesMudou(e) {
  // placa com o valor por caminhão na frente do Quartel (refeita quando o valor muda)
  if (e.valor !== valorPlaca) {
    if (placaRacoes) scene.remove(placaRacoes);
    placaRacoes = textoSprite(`🍬 Transporte de rações: ${e.valor.toLocaleString('pt-BR')} por caminhão`, { escala: 0.9, fundo: 'rgba(62,78,40,.95)' });
    placaRacoes.position.set(mundo.QUARTEL.portao.x - 3, 4.2, mundo.QUARTEL.portao.z + 4); scene.add(placaRacoes);
    if (valorPlaca && Math.hypot(mundo.QUARTEL.portao.x - jogador.pos.x, mundo.QUARTEL.portao.z - jogador.pos.z) < 80) aviso(`🎖️ Novo valor do transporte de rações: ${e.valor.toLocaleString('pt-BR')} por caminhão.`, 4);
    valorPlaca = e.valor;
  }
  const vivos = new Set();
  for (const d of e.viagens) {
    vivos.add(d.id);
    let v = viagensJuj.get(d.id);
    if (!v) { v = { d, rota: rotaJujuba(d.corp), mesh: null }; viagensJuj.set(d.id, v); }
    v.d = d;
    if (!v.mesh && jogador.carro?.jujuba !== d.id) { v.mesh = civico.modeloCarro('exercito_caminhao', '#556b2f'); scene.add(v.mesh); }
  }
  for (const [id, v] of viagensJuj) if (!vivos.has(id) && jogador.carro?.jujuba !== id) { if (v.mesh) scene.remove(v.mesh); viagensJuj.delete(id); }
}
function atualizarJujubas(dt) {
  // ração: cura 20% em 5 min e avisa quando acaba
  if (racaoAtiva()) {
    if (!jogador.morto && jogador.vida < 100) { jogador.vida = Math.min(100, jogador.vida + 20 / 300 * dt); if (Math.random() < dt) desenharFome(); }
    jujubaAvisou = 1;
  } else if (jujubaAvisou === 1) { jujubaAvisou = 2; aviso('🍬 O efeito da ração acabou.', 3); }
  const agora = agoraServidor();
  for (const [id, v] of viagensJuj) {
    if (!v.mesh) continue;
    const d = v.d;
    if (d.status === 'em_rota') {
      const dv = desvioJujuba(v, agora), ini = dv ? dv.t0 : Date.parse(d.partida), fim = Date.parse(d.chegada), f = Math.min(1, Math.max(0, (agora - ini) / Math.max(1, fim - ini)));
      const p = dv ? servicos.pontoNaRota(dv.rota, f * dv.rota.total) : servicos.pontoNaRota(v.rota, f * v.rota.total);
      v.mesh.position.set(p.x, alturaChao(p.x, p.z), p.z); v.mesh.rotation.y = suavizarAngulo(v.mesh.rotation.y, p.ang, dt * 6); v.mesh.visible = true;
    } else if (d.largado && d.x != null) { v.mesh.position.set(d.x, alturaChao(d.x, d.z), d.z); v.mesh.rotation.y = d.ang || 0; v.mesh.visible = true; }
    else v.mesh.visible = false;   // alguém está dirigindo: aparece pelo carro dele
  }
  // quem está com o caminhão sequestrado avisa a posição de vez em quando
  if (jogador.carro?.jujuba && (tempoJujPos -= dt) <= 0) { tempoJujPos = 20; rede.jujuba.mover(jogador.carro.jujuba, jogador.pos.x, jogador.pos.z, jogador.yaw, false).catch(() => {}); }
  montarComprador();
}
function jujubaParaSequestrar() {
  if (!jogador.cla || !jogador.armado || jogador.carro || jogador.dentroCasa || jogador.passageiro || jogador.onibus || jogador.morto || sequestrando) return null;
  if (jogador.perfil?.policial || jogador.perfil?.prf || militar()) return null;
  for (const v of viagensJuj.values()) {
    if (v.d.status !== 'em_rota' || !v.mesh?.visible) continue;
    const a = v.mesh.rotation.y, fx = Math.sin(a), fz = Math.cos(a), dx = jogador.pos.x - v.mesh.position.x, dz = jogador.pos.z - v.mesh.position.z;
    const f = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
    if (f < 3 || f > 14 || lat > 2.6) continue;
    if (Math.cos(jogador.yaw - Math.atan2(-dx, -dz)) < 0.6) continue;
    return v;
  }
  return null;
}
async function sequestrarJujuba(v) {
  if (sequestrando) return; sequestrando = true;
  const x = v.mesh.position.x, z = v.mesh.position.z, ang = v.mesh.rotation.y;
  virarPara(x, z); jogador.alvo = null;
  try {
    const qtd = await rede.jujuba.sequestrar(v.d.id, x, z, ang);
    v.d = { ...v.d, status: 'sequestrada', x, z, ang, largado: true, motorista: jogador.perfil.id };
    const espera = fugirDoVeiculo(x, z, ang, 8, 1);
    jogador.trava = espera / 1000;
    aviso(`🔫 Caminhão de rações sequestrado (${qtd} jujubas)! O motorista está descendo…`, 3);
    setTimeout(() => {
      if (jogador.morto || jogador.carro || Math.hypot(x - jogador.pos.x, z - jogador.pos.z) > 25) { rede.jujuba.mover(v.d.id, x, z, ang, true).catch(() => {}); return; }
      dirigirJujuba(v, qtd);
    }, espera);
  } catch (e) { aviso(e.message, 3); }
  finally { sequestrando = false; }
}
function dirigirJujuba(v, qtd) {
  v.d = { ...v.d, largado: false };
  entrarCarro({ d: { id: 'juj' + v.d.id, modelo: 'exercito_caminhao', cor: '#556b2f' }, mesh: v.mesh });
  jogador.carro.jujuba = v.d.id; jogador.carro.salvar = 1e9; jogador.carro.cargaJuj = qtd || v.d.qtd;
  v.mesh = null;
  rastrear({ nome: '📦 Comprador (Seu Tonho)', x: COMPRADOR.porta.x, z: COMPRADOR.porta.z + 6, comprador: true });   // destaque no mapa + feixe até o armazém
  aviso('🚚 Carga de rações do Exército: não dá para guardar no clã. Só o comprador do armazém de Vila Serra (ao lado da loja) compra.', 5);
}
function largarJujuba(c) {
  const v = viagensJuj.get(c.jujuba);
  jogador.carro = null; modoVolante(false);
  const x = jogador.pos.x, z = jogador.pos.z, r = jogador.yaw;
  c.mesh.position.set(x, alturaChao(x, z), z); c.mesh.rotation.y = r;
  if (v) { v.mesh = c.mesh; v.d = { ...v.d, x, z, ang: r, largado: true }; }
  rede.jujuba.mover(c.jujuba, x, z, r, true).catch(() => {});
  ultimoLargado = { ref: 'juj:' + c.jujuba, ate: agoraServidor() + 90000 };
  jogador.pos.x += Math.cos(r) * 2.2; jogador.pos.z += -Math.sin(r) * 2.2; resolverColisao(jogador.pos, jogador.raio);
  jogador.avatar.raiz.visible = true;
  aviso('Caminhão de rações largado. Parado 7 min, a carga se perde.', 3);
}
// comprador ilegal: armazém ao lado da loja de Vila Serra. Fecha quando vê Exército, Polícia ou PRF por perto.
function oficialPerto() {
  const ofi = (m) => m && (m.policial || m.prf || m.profissao === 'exercito');
  if ((jogador.perfil?.policial || jogador.perfil?.prf || jogador.perfil?.profissao === 'exercito') && Math.hypot(COMPRADOR.x - jogador.pos.x, COMPRADOR.z - jogador.pos.z) < 45) return true;
  for (const r of remotos.values()) if (ofi(r.meta) && r.av?.raiz && Math.hypot(r.av.raiz.position.x - COMPRADOR.x, r.av.raiz.position.z - COMPRADOR.z) < 45) return true;
  return false;
}
function montarComprador() {
  const perto = Math.hypot(COMPRADOR.x - jogador.pos.x, COMPRADOR.z - jogador.pos.z) < 160;
  if (!perto) return;
  if (!compradorMontado) {
    // galpão de tijolo com telhado de zinco em duas águas, porta de enrolar listrada, toldo, caixotes e balcão
    const g = new THREE.Group(), m = (c, r = 0.85, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...x });
    const tex = (w, h, f) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; f(cv.getContext('2d')); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const tijolo = tex(128, 128, (c) => { c.fillStyle = '#9a5a3c'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#c9b49a';
      for (let y = 0; y < 128; y += 16) { c.fillRect(0, y, 128, 2); for (let x = (y / 16) % 2 ? 16 : 0; x < 128; x += 32) c.fillRect(x, y, 2, 16); }
      for (let k = 0; k < 90; k++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '60,30,20' : '200,140,110'},.18)`; c.fillRect(Math.random() * 128, Math.random() * 128, 14, 6); } });
    tijolo.repeat.set(3, 1.4);
    const zinco = tex(64, 64, (c) => { for (let x = 0; x < 64; x++) { const v = 150 + Math.round(Math.sin(x / 64 * Math.PI * 8) * 35); c.fillStyle = `rgb(${v},${v + 4},${v + 8})`; c.fillRect(x, 0, 1, 64); } c.fillStyle = 'rgba(120,70,40,.25)'; c.fillRect(0, 50, 64, 14); });
    zinco.repeat.set(6, 1);
    const enrolar = tex(64, 64, (c) => { for (let y = 0; y < 64; y += 4) { c.fillStyle = y % 8 ? '#7d8790' : '#5e666e'; c.fillRect(0, y, 64, 4); } });
    enrolar.repeat.set(1, 4);
    const W = 13, D = 11, H = 5;
    const parede = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), m('#ffffff', 0.95, { map: tijolo })); parede.position.y = H / 2; g.add(parede);
    const rodape = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.6, D + 0.1), m('#5b5650')); rodape.position.y = 0.3; g.add(rodape);
    const oitao = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, 2.2)]);
    for (const zz of [D / 2, -D / 2]) { const o = new THREE.Mesh(new THREE.ShapeGeometry(oitao), m('#ffffff', 0.95, { map: tijolo, side: THREE.DoubleSide })); o.position.set(0, H, zz); g.add(o); }
    const aba = Math.hypot(W / 2 + 0.6, 2.2), incl = Math.atan2(2.2, W / 2);
    for (const lado of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(aba, 0.12, D + 1.2), m('#ffffff', 0.45, { map: zinco, metalness: 0.5 }));
      t.position.set(lado * (W / 4 + 0.15), H + 1.1 + 0.05, 0); t.rotation.z = -lado * incl; g.add(t); }
    const moldura = new THREE.Mesh(new THREE.BoxGeometry(5.8, 4.3, 0.3), m('#3b3631')); moldura.position.set(0, 2.15, D / 2 + 0.05); g.add(moldura);
    const vao = new THREE.Mesh(new THREE.BoxGeometry(5, 3.6, 0.1), m('#1d1b19', 1)); vao.position.set(0, 1.8, D / 2 + 0.12); g.add(vao);
    const porta = new THREE.Mesh(new THREE.BoxGeometry(5, 3.6, 0.12), m('#ffffff', 0.5, { map: enrolar, metalness: 0.6 })); porta.position.set(0, 1.9, D / 2 + 0.2); g.add(porta);
    const caixaPorta = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.6, 0.6), m('#6b7178', 0.5, { metalness: 0.6 })); caixaPorta.position.set(0, 4.05, D / 2 + 0.35); g.add(caixaPorta);
    const toldo = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.1, 2.2), m('#2f6b3a')); toldo.position.set(0, 4.55, D / 2 + 1.1); toldo.rotation.x = 0.22; g.add(toldo);
    for (const xx of [-3.6, 3.6]) { const j = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.12), m('#d8d1a8', 0.2, { emissive: '#3a3320' })); j.position.set(xx + (xx > 0 ? 0.6 : -0.6), 2.8, D / 2 + 0.06); g.add(j);
      const gr = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 0.05), m('#2a2a2a', 0.6, { wireframe: true })); gr.position.set(j.position.x, 2.8, D / 2 + 0.14); g.add(gr); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), m('#ffe9a8', 0.3, { emissive: '#ffcf6a', emissiveIntensity: 0.8 })); lamp.position.set(0, 4.75, D / 2 + 0.5); g.add(lamp);
    const madeira = m('#a07a4a'), pallet = m('#8a6a3e');
    for (const [cx, cz, cy, s] of [[-5.2, D / 2 + 1.6, 0.45, 0.9], [-4.2, D / 2 + 1.4, 0.45, 0.9], [-4.7, D / 2 + 1.5, 1.35, 0.9], [5.3, D / 2 + 1.3, 0.4, 0.8]]) {
      const cx2 = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), madeira); cx2.position.set(cx, cy, cz); cx2.rotation.y = cx * 0.3; g.add(cx2); }
    const pl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 1.1), pallet); pl.position.set(4.6, 0.09, D / 2 + 2.6); g.add(pl);
    const balcao = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.7), m('#6e4b2a')); balcao.position.set(3.2, 0.52, D / 2 + 1.4); g.add(balcao);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(COMPRADOR.x, alturaChao(COMPRADOR.x, COMPRADOR.z), COMPRADOR.z); scene.add(g);
    colisores.push({ tipo: 'caixa', x0: COMPRADOR.x - W / 2, x1: COMPRADOR.x + W / 2, z0: COMPRADOR.z - D / 2, z1: COMPRADOR.z + D / 2 });
    const placa = textoSprite('📦 Armazém do Seu Tonho', { escala: 0.7, fundo: 'rgba(90,70,40,.92)' }); placa.position.set(COMPRADOR.x, 7.6, COMPRADOR.z + D / 2 + 0.4); scene.add(placa);
    compradorMontado = { g, porta, aberto: null, placaFechado: null };
    // Seu Tonho: atrás do balcão, de frente para a rua, com nome em cima
    criarAvatar('personagens', 'Bandit_Brave').then((av) => { const y = alturaChao(COMPRADOR.x, COMPRADOR.z);
      av.raiz.position.set(COMPRADOR.x + 3.2, y, COMPRADOR.z + D / 2 + 0.75); av.raiz.rotation.y = 0; scene.add(av.raiz); av.tocar('idle'); compradorMontado.av = av;
      const nome = textoSprite('Seu Tonho', { escala: 0.45, fundo: 'rgba(40,30,20,.85)' }); nome.position.set(0, 2.25, 0); av.raiz.add(nome);
    }).catch((e) => console.warn('Seu Tonho não carregou', e));
  }
  const aberto = !oficialPerto();
  if (aberto !== compradorMontado.aberto) {
    compradorMontado.aberto = aberto;
    compradorMontado.porta.scale.y = aberto ? 0.12 : 1; compradorMontado.porta.position.y = aberto ? 3.85 : 1.9;   // porta de enrolar: enrola lá em cima quando abre
    if (compradorMontado.av) compradorMontado.av.raiz.visible = aberto;
    if (!compradorMontado.placaFechado) { const f = textoSprite('FECHADO', { escala: 0.6, fundo: 'rgba(150,30,20,.92)' }); f.position.set(COMPRADOR.x, 3.6, COMPRADOR.z + 6.4); scene.add(f); compradorMontado.placaFechado = f; }
    compradorMontado.placaFechado.visible = !aberto;
  }
  if (compradorMontado.av?.raiz.visible) compradorMontado.av.mixer.update(1 / 60);
}
function contextoComprador() {
  if (!compradorMontado || jogador.dentroCasa || jogador.morto) return null;
  const c = jogador.carro;
  if (c?.jujuba && Math.hypot(COMPRADOR.porta.x - jogador.pos.x, COMPRADOR.porta.z - jogador.pos.z) < 20 && Math.abs(c.vel) < 2) {
    if (!compradorMontado.aberto) return ['o armazém está fechado (tem oficial por perto)', 'Fechado', () => aviso('O Seu Tonho fechou o armazém: tem oficial por perto.', 3)];
    return [`vender a carga ao comprador (${((c.cargaJuj || 0) * 9).toLocaleString('pt-BR')} moedas)`, 'Vender', () => venderJujuba()];
  }
  if (c || !perto(COMPRADOR.porta, 3.5)) return null;
  if (!compradorMontado.aberto) return ['o armazém está fechado', 'Fechado', () => aviso('O Seu Tonho fechou o armazém: tem oficial por perto.', 3)];
  if (!jogador.cla) return ['"Só faço negócio com gente de clã."', 'Armazém', () => aviso('"Só faço negócio com gente de clã."', 3)];
  return ['comprar jujubas do comprador (500 cada)', 'Comprar', () => racoes.abrir('comprador')];
}
async function venderJujuba() {
  const c = jogador.carro; if (!c?.jujuba || ocupado) return; ocupado = true;
  try {
    const valor = await rede.jujuba.vender(c.jujuba, jogador.pos.x, jogador.pos.z);
    sairCarroLocal(); if (c.mesh) scene.remove(c.mesh); viagensJuj.delete(c.jujuba);
    if (rastreio?.comprador) rastrear(null);
    aviso(`💰 O Seu Tonho comprou a carga: +${valor.toLocaleString('pt-BR')} moedas.`, 4);
  } catch (e) { aviso(e.message, 3); }
  finally { ocupado = false; }
}
// pegar de novo o caminhão de rações largado (mesmo clã)
function jujubaLargadaPerto() {
  if (jogador.carro || !jogador.cla || jogador.dentroCasa || jogador.morto) return null;
  for (const v of viagensJuj.values()) if (v.mesh && v.d.status === 'sequestrada' && v.d.largado && v.d.cla === jogador.cla && !veiculoEmChamas('juj:' + v.d.id) && Math.hypot(v.mesh.position.x - jogador.pos.x, v.mesh.position.z - jogador.pos.z) < 4.5) return v;
  return null;
}
// ================================================================= passageiros NPC (pontos e rodoviária)
// Gente esperando no ponto (mais gente quanto mais tempo sem ônibus), que sobe quando o ônibus da linha para,
// e gente que desce e vai embora pela calçada até "entrar em casa". Só perto de você (até 14 pessoas ao mesmo tempo).
const esperas = [];                 // pontos e plataformas: { L, ponto|baia, x, z, fx, fz, rx, rz, gente: [], ultima }
const povo = [];                    // { av, uso: null | { tipo, ... } }
let povoCriando = 0, tempoPovo = 0;
const POVO_MAX = 14;
// quantas pessoas cada saída de ônibus leva (começa com um número sorteado pela saída; sobe e desce gente nos pontos)
const lotacao = new Map();
const lotacaoDe = (b) => { const k = `${b.L.id}.${b.m}`; if (!lotacao.has(k)) lotacao.set(k, Math.abs(b.m * 7 + b.L.id * 3) % 6); return k; };
function pessoaLivre() {
  const p = povo.find((x) => !x.uso);
  if (p) return p;
  if (povo.length + povoCriando < POVO_MAX) {
    povoCriando++;
    criarAvatar('personagens', PERSONAGENS[(Math.random() * PERSONAGENS.length) | 0].id)
      .then((av) => { av.raiz.visible = false; scene.add(av.raiz); povo.push({ av, uso: null }); })
      .catch(() => {}).finally(() => { povoCriando--; });
  }
  return null;
}
function soltarPessoa(p) { p.uso = null; p.av.raiz.visible = false; }
// porta do ônibus (frente, lado direito)
const portaOnibus = (b) => { const fx = Math.sin(b.ang), fz = Math.cos(b.ang); return { x: b.x + fx * (b.comp / 2 - 1.6) - Math.cos(b.ang) * 1.6, z: b.z + fz * (b.comp / 2 - 1.6) + Math.sin(b.ang) * 1.6 }; };
function onibusParadoNaEspera(e) {
  return onibusNpc.find((b) => b.ativo && b.L === e.L && b.parado && b.mesh.visible && (e.baia ? b.e?.baia : b.e?.ponto === e.ponto && !b.e?.baia));
}
function atualizarPovo(dt) {
  const t = agoraServidor() / 1000, j = jogador.pos;
  if ((tempoPovo -= dt) <= 0) {
    tempoPovo = 0.5;
    for (const e of esperas) {
      const d = Math.hypot(e.x - j.x, e.z - j.z);
      if (d > 80) { for (const g of e.gente) soltarPessoa(g); e.gente.length = 0; continue; }
      if (e.ultima < 0) e.ultima = t - (((e.x * 13 + e.z * 7) % 120) + 120) % 120;   // cada ponto começa com um tanto diferente
      const b = onibusParadoNaEspera(e);
      if (b && !e.embarcando) {   // o ônibus parou: quem espera sobe, um por vez; e às vezes alguém desce
        e.embarcando = b; e.ultima = t;
        e.gente.forEach((g, k) => { g.uso = { tipo: 'sobe', b, espera: k * 0.9 }; g.av.tocar('walk'); });
        e.gente.length = 0;
        const kl = lotacaoDe(b), dentro = lotacao.get(kl);
        const desce = e.baia ? dentro : Math.min(dentro, Math.abs(b.m * 7 + (e.ponto || 0)) % 3);   // na rodoviária desce todo mundo
        lotacao.set(kl, dentro - desce);
        for (let k = 0; k < desce; k++) {
          const p = pessoaLivre(); if (!p) break;
          const porta = portaOnibus(b), lado = (k + b.m) % 2 ? 1 : -1;
          p.av.raiz.position.set(porta.x, alturaChao(porta.x, porta.z), porta.z); p.av.raiz.visible = false;
          p.uso = { tipo: 'desce', espera: 0.6 + k * 0.9, t: 0, dx: e.fx * lado, dz: e.fz * lado, rx: e.rx, rz: e.rz };
        }
      }
      if (!b) e.embarcando = null;
      const quer = e.embarcando ? 0 : Math.min(e.baia ? 4 : 3, Math.floor((t - e.ultima) / 35));
      while (e.gente.length < quer) {
        const p = pessoaLivre(); if (!p) break;
        const k = e.gente.length, x = e.x + e.fx * (k * 1.1 - 1) + e.rx * ((k % 2) * 0.5), z = e.z + e.fz * (k * 1.1 - 1) + e.rz * ((k % 2) * 0.5);
        p.av.raiz.position.set(x, alturaChao(x, z), z); p.av.raiz.rotation.y = Math.atan2(-e.rx, -e.rz) + (k - 1) * 0.3;   // olhando para a rua
        p.av.raiz.visible = true; p.av.tocar(k % 3 === 2 ? 'idle_long' : 'idle'); p.uso = { tipo: 'espera' };
        e.gente.push(p);
      }
    }
  }
  for (const p of povo) {
    const u = p.uso; if (!u) continue;
    const r = p.av.raiz, pos = r.position;
    if (u.tipo === 'sobe') {   // anda até a porta e entra
      if ((u.espera -= dt) > 0) { p.av.mixer.update(dt); continue; }
      if (!u.b.ativo || !u.b.parado) { soltarPessoa(p); continue; }
      const porta = portaOnibus(u.b), dx = porta.x - pos.x, dz = porta.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.5) { const kl = lotacaoDe(u.b); lotacao.set(kl, Math.min(40, lotacao.get(kl) + 1)); soltarPessoa(p); continue; }
      pos.x += dx / d * 1.6 * dt; pos.z += dz / d * 1.6 * dt; pos.y = alturaChao(pos.x, pos.z); r.rotation.y = suavizarAngulo(r.rotation.y, Math.atan2(dx, dz), dt * 8);
    } else if (u.tipo === 'desce') {   // desce, anda pela calçada e entra numa casa
      if (u.espera > 0) { if ((u.espera -= dt) <= 0) { r.visible = true; p.av.tocar('walk'); } else continue; }
      u.t += dt;
      const ax = u.t < 1.2 ? u.rx : u.t < 9 ? u.dx : u.rx, az = u.t < 1.2 ? u.rz : u.t < 9 ? u.dz : u.rz;
      pos.x += ax * 1.4 * dt; pos.z += az * 1.4 * dt; pos.y = alturaChao(pos.x, pos.z); r.rotation.y = suavizarAngulo(r.rotation.y, Math.atan2(ax, az), dt * 6);
      if (u.t > 12) soltarPessoa(p);
    }
    p.av.mixer.update(dt);
  }
}
// ================================================================= sequestro de ônibus (clãs)
// Armado, na frente do ônibus e olhando para ele: Sequestrar. O motorista NPC desce e foge, os passageiros descem
// um a um e fogem também; depois quem sequestrou assume a direção. A saída some da linha para todos enquanto durar.
// Largado: quem sequestrou pode pôr fogo; alguém do mesmo clã pode pegar de novo. Parado 7 min, some.
const seqOnibus = new Map();          // id -> { d, mesh }   (mesh = ônibus largado no chão)
const saidasSequestradas = new Set(); // 'linha.saida' fora da linha
const fugitivos = [];                 // NPCs correndo para longe do veículo
let sequestrando = false, tempoSeqServ = 0, tempoSeqPos = 0;
const chaveSaida = (linha, saida) => `${linha}.${saida}`;
function onibusParaSequestrar() {
  if (!jogador.cla || !jogador.armado || jogador.carro || jogador.dentroCasa || jogador.passageiro || jogador.onibus || jogador.morto || sequestrando) return null;
  if (jogador.perfil?.policial || jogador.perfil?.prf) return null;
  for (const b of onibusNpc) {
    if (!b.ativo || !b.mesh.visible || b.e?.fila) continue;
    const fx = Math.sin(b.ang), fz = Math.cos(b.ang), dx = jogador.pos.x - b.x, dz = jogador.pos.z - b.z;
    const f = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
    if (f < b.comp / 2 - 0.5 || f > b.comp / 2 + 9 || lat > 2.6) continue;
    if (Math.cos(jogador.yaw - Math.atan2(-dx, -dz)) < 0.6) continue;   // apontando para o ônibus
    return b;
  }
  return null;
}
// gente descendo pela porta (da frente, do lado direito) e correndo para longe de quem sequestrou
function fugirDoVeiculo(x, z, ang, comp, n, robo = false) {
  const fx = Math.sin(ang), fz = Math.cos(ang), rx = -Math.cos(ang), rz = Math.sin(ang);
  const px = x + fx * (comp / 2 - 1.6) + rx * 1.7, pz = z + fz * (comp / 2 - 1.6) + rz * 1.7;
  for (let k = 0; k < n; k++) {
    setTimeout(async () => {
      try {
        const av = robo ? await criarAvatar('robos', 'Rusty_Scout_Bot') : await criarAvatar('personagens', PERSONAGENS[(Math.random() * PERSONAGENS.length) | 0].id);
        av.raiz.position.set(px, alturaChao(px, pz), pz); scene.add(av.raiz); av.tocar('run');
        // foge para o lado da calçada e para longe de quem está com a arma
        let ax = px - jogador.pos.x + rx * 6, az = pz - jogador.pos.z + rz * 6; const d = Math.hypot(ax, az) || 1; ax /= d; az /= d;
        const giro = (Math.random() - 0.5) * 0.8, dirX = ax * Math.cos(giro) - az * Math.sin(giro), dirZ = ax * Math.sin(giro) + az * Math.cos(giro);
        av.raiz.rotation.y = Math.atan2(dirX, dirZ);
        fugitivos.push({ av, dx: dirX, dz: dirZ, t: 0, vel: 4.5 + Math.random() * 1.5 });
      } catch (e) { /* sem modelo: ninguém aparece, segue o jogo */ }
    }, k === 0 ? 0 : 900 + (k - 1) * 750);
  }
  return n === 0 ? 0 : 900 + (n - 1) * 750 + 600;   // ms até o último descer
}
function atualizarFugitivos(dt) {
  for (let i = fugitivos.length - 1; i >= 0; i--) {
    const f = fugitivos[i]; f.t += dt;
    const p = f.av.raiz.position; p.x += f.dx * f.vel * dt; p.z += f.dz * f.vel * dt; p.y = alturaChao(p.x, p.z);
    f.av.mixer.update(dt);
    if (f.t > 7) { scene.remove(f.av.raiz); fugitivos.splice(i, 1); }
  }
}
async function sequestrarOnibus(b) {
  if (sequestrando) return; sequestrando = true;
  const L = b.L, m = b.m, mod = b.mod, x = b.x, z = b.z, ang = b.ang, comp = b.comp;
  virarPara(x, z); jogador.alvo = null;
  try {
    const id = await rede.onibusSeq.sequestrar(L.id, m, mod, L.cor, x, z, ang);
    const d = { id, linha: L.id, saida: m, modelo: mod, cor: L.cor, x, z, ang, largado: true, jogador: jogador.perfil.id, cla: jogador.cla, ativo_em: new Date(agoraServidor()).toISOString() };
    const kl = lotacaoDe(b), passageiros = Math.min(12, lotacao.get(kl)); lotacao.set(kl, 0);   // quem estava dentro (inclusive quem subiu nos pontos)
    // o ônibus fica parado onde estava enquanto todo mundo desce
    const mesh = corpoOnibus(L.cor, mod); mesh.position.set(x, alturaChao(x, z), z); mesh.rotation.y = ang; scene.add(mesh);
    seqOnibus.set(id, { d, mesh }); saidasSequestradas.add(chaveSaida(L.id, m));
    conexao?.enviar('onibusSeq', { tipo: 'novo', d, passageiros });
    const espera = fugirDoVeiculo(x, z, ang, comp, 1 + passageiros);
    jogador.trava = espera / 1000;
    aviso(passageiros ? '🔫 Ônibus sequestrado! O motorista e os passageiros estão descendo…' : '🔫 Ônibus sequestrado! O motorista está descendo…', 3);
    setTimeout(() => {
      const s = seqOnibus.get(id);
      if (!s?.mesh || jogador.morto || jogador.carro || Math.hypot(x - jogador.pos.x, z - jogador.pos.z) > 25) { aviso('Você se afastou do ônibus. Ele ficou parado ali.', 3); rede.onibusSeq.mover(id, x, z, ang, true).catch(() => {}); return; }
      dirigirOnibusSeq(id);
    }, espera);
  } catch (e) { aviso(e.message, 3); }
  finally { sequestrando = false; }
}
function dirigirOnibusSeq(id) {
  const s = seqOnibus.get(id); if (!s?.mesh) return;
  s.d = { ...s.d, largado: false, jogador: jogador.perfil.id };
  conexao?.enviar('onibusSeq', { tipo: 'pego', id });
  entrarCarro({ d: { id: 'seq' + id, modelo: s.d.modelo, cor: s.d.cor }, mesh: s.mesh });
  jogador.carro.seqOnibus = id; jogador.carro.salvar = 1e9;
  s.mesh = null;
  aviso('🚌 O ônibus é seu por enquanto: leve para onde quiser. Largado e parado por 7 min, ele some.', 4);
}
function largarOnibusSeq(c) {
  const id = c.seqOnibus, s = seqOnibus.get(id);
  jogador.carro = null; modoVolante(false);
  const x = jogador.pos.x, z = jogador.pos.z, r = jogador.yaw;
  c.mesh.position.set(x, alturaChao(x, z), z); c.mesh.rotation.y = r;
  if (s) { s.mesh = c.mesh; s.d = { ...s.d, x, z, ang: r, largado: true, ativo_em: new Date(agoraServidor()).toISOString() }; }
  rede.onibusSeq.mover(id, x, z, r, true).catch(() => {});
  conexao?.enviar('onibusSeq', { tipo: 'largado', id, x, z, ang: r });
  ultimoLargado = { ref: 'seq:' + id, ate: agoraServidor() + 90000 };
  const lx = -Math.cos(r) * 2.2, lz = Math.sin(r) * 2.2;   // desce pela porta da direita
  jogador.pos.x += lx; jogador.pos.z += lz; resolverColisao(jogador.pos, jogador.raio);
  jogador.avatar.raiz.visible = true;
  aviso('Ônibus largado. Você pode pôr fogo nele (Incendiar) ou alguém do clã pode pegar de novo. Parado 7 min, ele some.', 4);
}
function onibusSeqPerto() {
  if (jogador.carro || jogador.dentroCasa || jogador.passageiro || jogador.onibus || jogador.morto || !jogador.cla) return null;
  for (const [id, s] of seqOnibus) {
    if (!s.mesh || !s.d.largado || s.d.cla !== jogador.cla || veiculoEmChamas('seq:' + id) || s.queima > 0) continue;
    if (Math.hypot(s.mesh.position.x - jogador.pos.x, s.mesh.position.z - jogador.pos.z) < 6) return id;
  }
  return null;
}
async function pegarOnibusSeq(id) {
  try { await rede.onibusSeq.pegar(id); dirigirOnibusSeq(id); } catch (e) { aviso(e.message, 3); }
}
function tirarOnibusSeq(id) {
  const s = seqOnibus.get(id); if (!s) return;
  if (s.mesh) scene.remove(s.mesh);
  saidasSequestradas.delete(chaveSaida(s.d.linha, s.d.saida)); seqOnibus.delete(id);
}
function colocarOnibusSeq(d) {
  let s = seqOnibus.get(d.id);
  if (!s) { s = { d, mesh: null }; seqOnibus.set(d.id, s); }
  s.d = { ...s.d, ...d };
  saidasSequestradas.add(chaveSaida(d.linha, d.saida));
  const meu = jogador.carro?.seqOnibus === d.id;
  if (d.largado && !meu) {
    if (!s.mesh) { s.mesh = corpoOnibus(d.cor, d.modelo); scene.add(s.mesh); }
    s.mesh.position.set(d.x, alturaChao(d.x, d.z), d.z); s.mesh.rotation.y = d.ang;
  } else if (!d.largado && s.mesh && !meu) { scene.remove(s.mesh); s.mesh = null; }   // alguém está dirigindo: aparece pelo carro dele
}
function receberOnibusSeq(m) {
  if (m.tipo === 'novo') {
    colocarOnibusSeq(m.d);
    if (Math.hypot(m.d.x - jogador.pos.x, m.d.z - jogador.pos.z) < 150) fugirDoVeiculo(m.d.x, m.d.z, m.d.ang, COMP_ONIBUS(m.d.modelo), 1 + (m.passageiros || 0));
  } else if (m.tipo === 'largado') { const s = seqOnibus.get(m.id); if (s) colocarOnibusSeq({ ...s.d, x: m.x, z: m.z, ang: m.ang, largado: true }); }
  else if (m.tipo === 'pego') { const s = seqOnibus.get(m.id); if (s) colocarOnibusSeq({ ...s.d, largado: false }); }
}
function atualizarOnibusSeq(dt) {
  atualizarFugitivos(dt);
  // quem está dirigindo avisa a posição de vez em quando (os 7 min contam do último movimento)
  const c = jogador.carro;
  if (c?.seqOnibus && (tempoSeqPos -= dt) <= 0) { tempoSeqPos = 20; rede.onibusSeq.mover(c.seqOnibus, jogador.pos.x, jogador.pos.z, jogador.yaw, false).catch(() => {}); }
  if ((tempoSeqServ -= dt) > 0) return; tempoSeqServ = 30;
  rede.onibusSeq.ativos().then((lista) => {
    const vivos = new Set();
    for (const d of lista || []) { vivos.add(d.id); colocarOnibusSeq(d); }
    for (const id of [...seqOnibus.keys()]) if (!vivos.has(id) && jogador.carro?.seqOnibus !== id) tirarOnibusSeq(id);
    // o meu acabou (7 min sem mexer não acontece dirigindo, mas se o servidor encerrou, desce)
  }).catch(() => {});
}
let tempoCarrosRua = 0;
function atualizarCarrosRua() {
  if ((tempoCarrosRua -= 1) > 0) return; tempoCarrosRua = 60;   // confere mais ou menos a cada segundo
  const agora = agoraServidor();
  for (const [k, l] of largadosRua) if (agora > l.ate) { scene.remove(l.mesh); largadosRua.delete(k); mundo.tirarCarroRua(k, false); }
  // roubado por outro jogador que saiu do jogo dirigindo: volta para a vaga 5 min depois de sumir
  for (const [k, visto] of roubadosRua) {
    if (largadosRua.has(k) || jogador.carro?.rua === k) { roubadosRua.delete(k); continue; }
    if ([...remotos.values()].some((r) => String(r.alvo?.cv || '').startsWith(`rua${k}|`))) roubadosRua.set(k, agora);
    else if (agora - visto > 300000) { roubadosRua.delete(k); mundo.tirarCarroRua(k, false); }
  }
}
const roubadosRua = new Map();   // k -> última vez que alguém foi visto dirigindo

// ================================================================= averiguar (moderadores e administrador)
// A câmera passa a seguir o jogador (de qualquer lugar do mapa), com uma barra mostrando o que ele faz agora,
// o que escreve no chat (até no modo privado) e botões para punir: algemar, prender, banir, ir até ele ou encerrar.
let averiguando = null;
const ANIM_TXT = { idle: 'parado', idle_long: 'parado', walk: 'andando', run: 'correndo', punch_left: 'dando soco', punch_right: 'dando soco', punch_combo: 'dando soco', shoot: 'atirando', walk_shoot: 'atirando andando', pegar: 'pegando algo', carregar: 'carregando caixa', carregar_parado: 'carregando caixa', death: 'caído', hit: 'levando dano' };
function foco() {
  if (jogador.carro?.aviao) return { x: jogador.pos.x, y: jogador.carro.alt, z: jogador.pos.z };
  if (jogador.voo) return { x: jogador.pos.x, y: jogador.vooY || 0, z: jogador.pos.z };
  const a = averiguando && remotos.get(averiguando.id)?.alvo;
  return a ? { x: a.x, y: Math.max(0, a.y - alturaChao(a.x, a.z)), z: a.z } : jogador.pos;
}
function iniciarAveriguar(id, nome) {
  if (!['admin', 'moderador'].includes(jogador.perfil?.cargo)) return;
  if (!remotos.get(id)) { aviso(`${nome} não está online agora.`, 3); return; }
  averiguando = { id, nome, falas: [] };
  let bar = $('barraAveriguar');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'barraAveriguar';
    bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(10px + env(safe-area-inset-bottom));z-index:30;width:min(560px,96vw);background:rgba(18,22,32,.94);border:2px solid #e0a83a;border-radius:14px;padding:8px 10px;color:#e8edf5;font:13px system-ui;pointer-events:auto';
    document.body.appendChild(bar);
  }
  bar.style.display = 'block'; document.body.classList.add('averiguando');
  desenharBarraAveriguar();
  aviso(`👁️ Averiguando ${nome}. A câmera segue ele; seu personagem fica parado onde está.`, 4);
}
function encerrarAveriguar() {
  averiguando = null; const bar = $('barraAveriguar'); if (bar) bar.style.display = 'none'; document.body.classList.remove('averiguando');
}
function estadoAveriguado() {
  const r = remotos.get(averiguando.id); if (!r?.alvo) return 'fora do jogo';
  const a = r.alvo, t = [];
  if (a.cv) t.push(`dirigindo ${civico.CARROS[String(a.cv).split('|')[1]]?.nome || 'um carro'}`);
  else if (a.pg) t.push('passageiro de outro jogador');
  else if (a.tr) t.push('no trem');
  else if (a.x > 1500) t.push('dentro de um prédio ou casa');
  else t.push(ANIM_TXT[a.a] || a.a || 'parado');
  if (a.ar) t.push('🔫 armado'); if (a.al) t.push('🔗 algemado'); if (a.cx) t.push('📦 com caixa');
  if (r.meta?.crimes > 0) t.push(`🚨 ${estrelas(r.meta.crimes)}`);
  if (r.meta?.cla) t.push(`⚔️ clã ${r.meta.cla}`);
  const rua = a.x < 1500 ? nomeDaRua(a.x, a.z) : '';
  return `${t.join(' · ')}${rua ? ` · ${rua}` : ''} · x ${Math.round(a.x)}, z ${Math.round(a.z)}`;
}
function desenharBarraAveriguar() {
  const bar = $('barraAveriguar'); if (!bar || !averiguando) return;
  const pode = (k) => jogador.perfil?.cargo === 'admin' || jogador.perfil?.poderes?.[k];
  bar.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>👁️ Averiguando ${esc(averiguando.nome)}</b><button data-av="sair" style="border:0;background:#2d3650;color:#fff;border-radius:8px;padding:4px 10px">✕ Encerrar</button></div>
    <div id="avEstado" style="margin:4px 0;color:#ffd98a"></div>
    <div id="avFalas" style="max-height:66px;overflow:auto;font-size:12px;color:#c9d6e2">${averiguando.falas.map((f) => `<div>💬 ${f.privado ? '🔒 ' : ''}${esc(f.texto)}</div>`).join('') || '<i>Nenhuma mensagem dele ainda.</i>'}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
      ${pode('teleportar') ? '<button data-av="ir">📍 Ir até ele</button>' : ''}
      ${pode('algemar') ? '<button data-av="algemar">🔗 Algemar</button>' : ''}
      ${pode('prender') ? '<button data-av="prender">🚔 Prender 10 min</button>' : ''}
      ${pode('banir') ? '<button data-av="banir" style="background:#8a2525">⛔ Banir</button>' : ''}
      <button data-av="painel">🛡 Abrir no painel</button></div>`;
  bar.querySelectorAll('button').forEach((b) => { b.style.cssText += ';border:0;border-radius:8px;padding:6px 10px;color:#fff;font-weight:700;' + (b.dataset.av === 'banir' ? '' : 'background:#2d3650'); b.onclick = () => acaoAveriguar(b.dataset.av); });
  $('avEstado').textContent = estadoAveriguado();
}
function mostrarFalaAveriguado(m) {
  if (!averiguando) return;
  averiguando.falas = [...averiguando.falas, { texto: String(m.texto).slice(0, 120), privado: !!m.privado }].slice(-4);
  desenharBarraAveriguar();
}
async function acaoAveriguar(a) {
  const alvo = averiguando; if (!alvo) return;
  try {
    if (a === 'sair') { encerrarAveriguar(); return; }
    if (a === 'ir') { const r = remotos.get(alvo.id)?.alvo; if (r) { jogador.dentroCasa = null; teleportar(r.x + 1.2, r.z + 1.2); } encerrarAveriguar(); return; }
    if (a === 'painel') { encerrarAveriguar(); $('btPainel').click(); return; }
    if (a === 'algemar') { await rede.painel.algemar(alvo.id, true); aviso(`🔗 ${alvo.nome} foi algemado.`); return; }
    if (a === 'prender') { await rede.painel.prender(alvo.id, 10); aviso(`🚔 ${alvo.nome} foi preso por 10 min.`); return; }
    if (a === 'banir') {
      escolher(`⛔ Banir ${esc(alvo.nome)}?`, '<input id="avMotivo" placeholder="Motivo do banimento" style="width:100%;padding:8px;border-radius:8px">', [
        { rotulo: '⛔ Confirmar banimento', fn: async () => { const motivo = ($('avMotivo')?.value || '').trim() || 'Comportamento inadequado'; try { await rede.painel.banir(alvo.id, motivo); aviso(`${alvo.nome} foi banido.`, 3); encerrarAveriguar(); } catch (e) { aviso(e.message, 3); } } },
        { rotulo: 'Cancelar', fn: () => {} }]);
    }
  } catch (e) { aviso(e.message, 3); }
}
let tempoAveriguar = 0;
function atualizarAveriguar(dt) {
  if (!averiguando) return;
  if (!remotos.get(averiguando.id)) { aviso(`${averiguando.nome} saiu do jogo.`, 3); encerrarAveriguar(); return; }
  tempoAveriguar -= dt; if (tempoAveriguar > 0) return; tempoAveriguar = 0.5;
  const el = $('avEstado'); if (el) el.textContent = estadoAveriguado();
}

// ================================================================= carceragem (dentro da delegacia e do posto da PRF)
// Oito celas. Quem é preso vai para uma cela (sempre a mesma para o mesmo jogador) e só anda dentro dela.
// Policiais e PRF em serviço (e o administrador) entram pela porta "Carceragem". Só eles autorizam visitas:
// o visitante recebe o convite e fica 3 minutos no corredor, em frente às celas, para conversar.
const CELAS = 8, VISITA_MS = 180000;
function salaCarceragem() {
  return montarSala('carceragem', 3000, 2200, 30, 18, { piso: '#55595f', parede: '#9aa0a6', luz: '#f2f6ff' }, (i) => {
    const { caixa, placa, g } = i;
    i.celas = true;
    const ferro = i.mat('#30353d', 0.4, 0.7), barra = new THREE.CylinderGeometry(0.04, 0.04, 2.7, 6);
    const grades = new THREE.InstancedMesh(barra, ferro, CELAS * 13); let n = 0; const m4 = new THREE.Matrix4();
    for (let k = 0; k < CELAS; k++) {
      const x = celaX(k);
      caixa(0.15, 2.8, 6, '#7d838a', x - 1.7, 1.4, -6);                        // parede entre celas
      caixa(1.0, 0.45, 2.1, '#6b5a48', x - 0.9, 0.23, -7.6); caixa(0.9, 0.12, 1.9, '#d9d4c8', x - 0.9, 0.5, -7.6);   // cama
      caixa(0.45, 0.4, 0.45, '#e6e6e6', x + 1.1, 0.2, -8.4);                   // vaso
      for (let b = 0; b < 13; b++) { m4.makeTranslation(x - 1.55 + b * 0.26, 1.35, -3); grades.setMatrixAt(n++, m4); }
      placa(`Cela ${k + 1}`, x, -3, 3.1);
    }
    caixa(0.15, 2.8, 6, '#7d838a', celaX(CELAS - 1) + 1.7, 1.4, -6);
    caixa(CELAS * 3.4, 0.12, 0.12, '#30353d', 0, 2.7, -3, 0.7);
    grades.castShadow = true; g.add(grades);
    i.obst.push([-15, 15, -9, -2.75]);                                         // ninguém de fora entra nas celas
    // guarita e área de visita
    caixa(2.6, 1.1, 1.0, '#2b4fa8', 10, 0.55, 5); movel(i, 'guarita', 10, 5, 2.6, 1, [0, -1]); placa('Guarita: autorizar visitas', 10, 5, 2.3);
    for (const x of [-6, -2, 2, 6]) caixa(0.5, 0.45, 0.5, '#4a4f58', x, 0.22, -1.2);
    placa('Área de visita', 0, -1.4, 2.2);
    i.pontos.visita = { x: i.base.x, z: i.base.z - 1.6 };
  });
}
const celaX = (k) => -11.9 + k * 3.4;
function celaDe(id) { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % CELAS; }
function posCela() { const i = salaCarceragem(), k = celaDe(jogador.perfil?.id || ''); return { x: i.base.x + celaX(k), z: i.base.z - 5.8 }; }
function caixaCela() { const i = salaCarceragem(), k = celaDe(jogador.perfil?.id || ''), x = i.base.x + celaX(k); return { x0: x - 1.35, x1: x + 1.35, z0: i.base.z - 8.4, z1: i.base.z - 3.4 }; }
function entrarCarceragem() {
  if (!daPolicia()) { aviso('🔒 Só policiais e agentes da PRF em serviço entram na carceragem.', 3); return; }
  const i = salaCarceragem(), s = jogador.saidaSala;
  jogador.dentroCasa = null;
  entrarSala('carceragem', s || { x: pontos.delegacia.x, z: pontos.delegacia.z + 1.5 }, i.pontos.porta.x - 1, i.pontos.porta.z - 1);
  aviso('🔒 Carceragem. Na guarita você autoriza um visitante para falar com um preso.', 3.5);
}
SALAS.carceragem = {
  contexto: () => {
    if (jogador.pena > 0) return [`cumprindo pena: ${formatarTempo(jogador.pena)} (quem visitar pode falar com você)`, ''];
    if (naPorta()) return [jogador.visitaAte ? 'encerrar a visita e sair' : 'sair da carceragem', 'Sair'];
    if (pontoInterior('guarita', 1.8)) return [daPolicia() ? 'autorizar a visita de um jogador' : 'guarita (só policiais)', 'Visita'];
    if (jogador.visitaAte) return [`visita: ${Math.max(0, Math.ceil((jogador.visitaAte - performance.now()) / 1000))} s (fale com o preso pela grade)`, ''];
    return ['', ''];
  },
  acao: () => {
    if (jogador.pena > 0) return;
    if (naPorta()) { jogador.visitaAte = 0; sairSala(); return; }
    if (pontoInterior('guarita', 1.8)) { if (daPolicia()) autorizarVisita(); else aviso('Só policiais autorizam visitas.'); }
  },
  sair: () => { jogador.visitaAte = 0; },
};
function autorizarVisita() {
  const lista = [...remotos.entries()].filter(([id]) => !bloqueados.has(id));
  if (!lista.length) { aviso('Ninguém online para trazer.'); return; }
  escolher('🔒 Autorizar visita', 'O jogador recebe o convite e, se aceitar, vem para a área de visita da carceragem por 3 minutos.', lista.map(([id, r]) => ({
    rotulo: `👤 ${esc(r.meta?.nome || 'jogador')}`,
    fn: () => { conexao?.enviar('gesto', { de: jogador.perfil.id, para: id, tipo: 'visita', nome: jogador.perfil.nome }); aviso(`Convite de visita enviado para ${r.meta?.nome || 'o jogador'}.`, 3); },
  })));
}
function conviteVisita(g) {
  if (bloqueados.has(g.de)) return;
  const quem = remotos.get(g.de)?.meta;
  if (!(quem?.policial || quem?.prf || quem?.cargo === 'admin')) return;   // só polícia, PRF e admin convidam
  const nome = String(g.nome || quem?.nome || 'Um policial').slice(0, 24);
  const responder = (tipo) => conexao?.enviar('gesto', { de: jogador.perfil.id, para: g.de, tipo });
  escolher('🔒 Visita na carceragem', `<b>${esc(nome)}</b> autorizou você a visitar os presos na carceragem por 3 minutos.`, [
    { rotulo: '✅ Aceitar e ir', fn: () => {
      if (jogador.pena > 0 || jogador.algemado || jogador.morto || jogador.passageiro || jogador.trem) { aviso('Agora você não pode ir.'); responder('visitaNao'); return; }
      const i = salaCarceragem();
      jogador.dentroCasa = null;
      entrarSala('carceragem', { x: pontos.delegacia.x, z: pontos.delegacia.z + 1.5 }, i.pontos.visita.x, i.pontos.visita.z);
      jogador.visitaAte = performance.now() + VISITA_MS; jogador.yaw = Math.PI;
      aviso('🔒 Visita autorizada: 3 minutos. Converse com o preso pela grade (chat ou voz por perto).', 4);
      responder('visitaOk');
    } },
    { rotulo: 'Agora não', fn: () => responder('visitaNao') }]);
}
function atualizarVisita() {
  if (jogador.visitaAte && jogador.dentroCasa === 'carceragem' && performance.now() > jogador.visitaAte && !daPolicia()) {
    jogador.visitaAte = 0; sairSala(); aviso('⏱️ O horário de visita acabou.', 3);
  }
}

// ---------------------------------------------------------------- materializar: o veículo aparece do lado do dono na hora (150)
async function materializar(tipo, id) {
  if (jogador.carro || jogador.dentroCasa || jogador.trem) { aviso('Saia do veículo ou do prédio primeiro.'); return; }
  const p = pertoDeMim(), ang = jogador.yaw;
  try {
    if (tipo === 'carro') {
      const v = carrosMundo.get(id); if (!v) return;
      await rede.carros.materializar(id, p.x, p.z, ang);
      v.chamada = null; v.d = { ...v.d, x: p.x, z: p.z, ang };
      v.mesh.position.set(p.x, alturaChao(p.x, p.z), p.z); v.mesh.rotation.y = ang; v.mesh.visible = true;
      aviso(`✨ Seu ${civico.CARROS[v.d.modelo]?.nome || 'carro'} apareceu aqui. -150 moedas.`, 3);
    } else {
      const c = caminhoes.get(id); if (!c) return;
      await rede.veiculos.materializar(id, p.x, p.z, ang);
      c.chamada = null; c.d = { ...c.d, status: 'dirigido', motorista: null, pos_x: p.x, pos_z: p.z, ang };
      c.obj.position.set(p.x, alturaChao(p.x, p.z), p.z); c.obj.rotation.y = ang; c.obj.visible = true;
      aviso(`✨ ${NOME_VEICULO[c.d.tipo] || 'Veículo'} apareceu aqui. -150 moedas.`, 3);
    }
    const f = $('flashMat') || document.createElement('div'); f.id = 'flashMat';
    f.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle,rgba(160,220,255,.55),transparent 60%);z-index:20;pointer-events:none;opacity:1;transition:opacity .6s';
    document.body.appendChild(f); window.requestAnimationFrame(() => { f.style.opacity = 0; });
  } catch (e) { aviso(e.message, 3); }
}

// ================================================================= fome, preparação física e treinamento
// Fome: abaixo de 20 o personagem fica FRACO (mais lento e com golpes mais fracos); zerada, ainda perde vida aos poucos.
// Saciado (80 ou mais) anda 0,2% mais rápido.
// Treino (Polícia, PRF e Exército): cada treino completo vale +0,1% na especialidade, até 0,6%:
//   corrida → velocidade de movimento · luta (boneco) → velocidade de ataque e defesa · tiro no alvo → chance de crítico.
// Os bônus só valem no expediente: saiu do serviço, perde tudo e precisa treinar de novo.
const SACIADO = 80, FRACO = 20, BONUS_SACIADO = 0.002, TREINO_PASSO = 0.001, TREINO_MAX = 6;
const NOME_TREINO = { corrida: ['corrida', 'velocidade de movimento'], luta: ['luta', 'velocidade de ataque e defesa'], tiro: ['tiro', 'chance de acerto crítico'] };
let treino = { corrida: 0, luta: 0, tiro: 0 }, treinoPapel, golpesBoneco = 0, acertosTiro = 0, volta = null, correTropa = null, boneco = null, treinoVolta = null, avisoFraco = false, sangriaFome = 0;
const PISTA = [[-18, -3], [18, -3], [18, 13], [-18, 13]];   // cantos da pista (na ordem da volta), relativos à sala
function corporacao() {
  const p = jogador.perfil; if (!p) return null;
  if (p.policial) return 'policia';
  if (p.prf) return 'prf';
  if (p.profissao === 'exercito') return 'exercito';
  return souEquipe() ? 'equipe' : null;
}
function bonusTreino(tipo) { return corporacao() ? (treino[tipo] || 0) * TREINO_PASSO : 0; }
function fatorVelocidade() {
  const f = jogador.fome;
  return (f <= 0 ? 0.6 : f < FRACO ? 0.85 : 1) * (1 + (f >= SACIADO ? BONUS_SACIADO : 0) + bonusTreino('corrida'));
}
const fatorForca = () => (jogador.fome < FRACO ? 0.75 : 1);
function fraquezaFome(dt) {
  const f = jogador.fome;
  if (f < FRACO && f > 0 && !avisoFraco) { avisoFraco = true; aviso('😵 Você está FRACO de fome: mais lento e com golpes mais fracos. Coma algo.', 4); }
  if (f >= FRACO + 5) avisoFraco = false;
  if (f <= 0 && !jogador.morto && jogador.vida > 15) {   // sem comida nenhuma: perde 1 de vida a cada 6 s (não mata: para em 15)
    sangriaFome += dt; if (sangriaFome >= 6) { sangriaFome = 0; jogador.vida = Math.max(15, jogador.vida - 1); desenharFome(); }
  }
}
function salvarTreino() { try { localStorage.setItem('fator_treino_' + (jogador.perfil?.id || ''), JSON.stringify({ papel: treinoPapel, ...treino })); } catch { /* sem armazenamento */ } }
function seguirTreino() {
  if (!jogador.perfil) return;
  const c = corporacao();
  if (treinoPapel === undefined) {   // ao abrir o jogo: recupera o treino se continua no mesmo expediente
    treinoPapel = c;
    try { const t = JSON.parse(localStorage.getItem('fator_treino_' + (jogador.perfil?.id || '')) || 'null'); if (t && t.papel === c && c) treino = { corrida: t.corrida | 0, luta: t.luta | 0, tiro: t.tiro | 0 }; } catch { /* nada */ }
    return;
  }
  if (c === treinoPapel) return;
  const tinha = treino.corrida + treino.luta + treino.tiro > 0;
  treinoPapel = c; treino = { corrida: 0, luta: 0, tiro: 0 }; golpesBoneco = 0; acertosTiro = 0; salvarTreino();
  if (tinha && !c) aviso('Fim do expediente: os bônus de treino foram perdidos. Treine de novo no próximo serviço.', 4);
}
function ganharTreino(tipo) {
  const [nome, efeito] = NOME_TREINO[tipo];
  if (!corporacao()) { aviso('Treino só conta no expediente (Polícia, PRF ou Exército em serviço).', 3.5); return; }
  if (treino[tipo] >= TREINO_MAX) { aviso(`💪 Treino de ${nome} no máximo: +0,6% de ${efeito}.`, 3); return; }
  treino[tipo]++; salvarTreino();
  aviso(`💪 Treino de ${nome} completo! Agora +${(treino[tipo] * 0.1).toFixed(1).replace('.', ',')}% de ${efeito}.`, 3.5);
}
function verPreparacao() {
  const linha = (k) => `${NOME_TREINO[k][0]}: ${'▰'.repeat(treino[k])}${'▱'.repeat(TREINO_MAX - treino[k])} +${(treino[k] * 0.1).toFixed(1).replace('.', ',')}% de ${NOME_TREINO[k][1]}`;
  escolher('💪 Sua preparação', corporacao() ? 'Vale enquanto você estiver no expediente.' : 'Você não está no expediente: os bônus não valem agora.',
    ['corrida', 'luta', 'tiro'].map((k) => ({ rotulo: linha(k), fn: () => {} })));
}
// ---- sala de treinamento (Polícia e PRF entram pela delegacia/posto; o Exército pelo comando do quartel)
function salaTreino() {
  return montarSala('treino', 3600, 1000, 44, 34, { piso: '#596247', parede: '#cfd3c4' }, (i) => {
    const { caixa, placa, g } = i;
    // pista de corrida: faixas no chão e cones nos cantos
    const [a, b, c, d] = PISTA;
    for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]]) {
      const cx = (p[0] + q[0]) / 2, cz = (p[1] + q[1]) / 2, horiz = p[1] === q[1];
      caixa(horiz ? Math.abs(q[0] - p[0]) + 2.2 : 2.2, 0.02, horiz ? 2.2 : Math.abs(q[1] - p[1]) + 2.2, '#a5522f', cx, 0.011, cz);
    }
    for (const [x, z] of PISTA) caixa(0.5, 0.8, 0.5, '#ff7a1a', x, 0.4, z);
    placa('🏃 Largada', d[0], d[1] + 1.4, 2.2); i.pontos.largada = { x: i.base.x + d[0], z: i.base.z + d[1] + 1.4 };
    const marca = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.7, 28), new THREE.MeshBasicMaterial({ color: '#ffd23e', side: THREE.DoubleSide }));
    marca.rotation.x = -Math.PI / 2; marca.position.y = 0.05; marca.visible = false; g.add(marca); i.marca = marca;
    // tiro ao alvo (fundo da sala)
    estandeInterno(i, 'treino', -12, -11);
    // boneco de luta no meio da pista
    caixa(2.6, 0.1, 2.6, '#2b2f36', 0, 0.05, 5); placa('🥊 Boneco de luta', 0, 5, 2.9);
    i.obst.push([-0.5, 0.5, 4.5, 5.5]); i.pontos.boneco = { x: i.base.x, z: i.base.z + 6.4 };
    criarAvatar('robos', 'Rusty_Scout_Bot').then((av) => { av.raiz.position.set(i.base.x, 0.1, i.base.z + 5); av.raiz.rotation.y = 0; av.tocar('idle'); scene.add(av.raiz); boneco = av; }).catch(() => {});
    // quadro da preparação
    caixa(0.1, 1.8, 3, '#20262e', -21.7, 2, 5); movel(i, 'quadro', -21.5, 5, 0.4, 3, [1, 0]); placa('💪 Sua preparação', -21.4, 5, 3.2);
  });
}
function entrarTreino(voltaPara) {
  if (!corporacao()) { aviso('O centro de treinamento é da Polícia, PRF e Exército em serviço.', 3); return; }
  if (jogador.carro) { aviso('Desça do veículo primeiro.'); return; }
  const i = salaTreino();
  treinoVolta = voltaPara || null;
  entrarSala('treino', voltaPara ? jogador.saidaSala : { x: jogador.pos.x + 1.5, z: jogador.pos.z + 1.5 }, i.pontos.porta.x - 1, i.pontos.porta.z - 1.5);
  aviso('🏋️ Centro de treinamento: corra na pista, lute com o boneco e atire nos alvos. Cada treino: +0,1% (até 0,6%).', 5);
}
SALAS.treino = {
  contexto: () => {
    if (naPorta()) return ['sair do centro de treinamento', 'Sair'];
    if (pontoInterior('largada', 2)) return [volta ? 'correndo: passe pelos 4 cones' : 'pista: correr uma volta em até 40 s', 'Correr'];
    if (pontoInterior('boneco', 1.8)) return [`boneco de luta: dê socos (${golpesBoneco % 12}/12)`, 'Socar'];
    if (pontoInterior('quadro', 1.8)) return ['ver sua preparação', 'Ver'];
    if (pontoInterior('estande', 2.2)) return ['tiro ao alvo: saque a arma e acerte os alvos (6 acertos = 1 treino)', 'Estande'];
    return ['', ''];
  },
  acao: () => {
    if (naPorta()) {
      const v = treinoVolta; treinoVolta = null; volta = null;
      if (v) { const s = jogador.saidaSala; entrarSala(v.chave, s, v.x, v.z); } else sairSala();
      return;
    }
    if (pontoInterior('largada', 2)) { if (!volta) { volta = { k: 0, t0: performance.now() }; aviso('🏃 Valendo! Passe pelos 4 cones e volte à largada.', 3); } return; }
    if (pontoInterior('boneco', 1.8)) { socar(); return; }
    if (pontoInterior('quadro', 1.8)) { verPreparacao(); return; }
    if (pontoInterior('estande', 2.2)) aviso('🎯 Saque a arma (Arma) e atire nos alvos.', 3);
  },
  sair: () => { volta = null; },
};
function golpeNoBoneco(f) {
  if (jogador.dentroCasa !== 'treino' || !boneco) return false;
  const d = new THREE.Vector3().subVectors(boneco.raiz.position, jogador.pos); d.y = 0;
  const dist = d.length(); if (dist > 1.9 || dist < 0.01 || d.normalize().dot(f) < 0.4) return false;
  boneco.tocar('hit', { umaVez: true, velocidade: 1.4, fade: 0.08 });
  golpesBoneco++;
  if (golpesBoneco % 12 === 0) ganharTreino('luta'); else aviso(`🥊 ${golpesBoneco % 12}/12`, 0.8);
  return true;
}
function acertoTreinoTiro() {
  if (!corporacao()) return;
  acertosTiro++;
  if (acertosTiro % 6 === 0) ganharTreino('tiro');
}
// ---- corrida com a tropa do Exército (pátio do quartel): o personagem acompanha o pelotão sozinho
function tropaPerto() {
  if (correTropa || jogador.carro || !['exercito', 'equipe'].includes(corporacao())) return null;
  return soldados.find((s) => s.corre && s.av.raiz.visible && s.av.raiz.position.distanceTo(jogador.pos) < 5) || null;
}
function correrComTropa(dt) {
  const t = correTropa;
  if (!soldados.some((s) => s.corre && s.av.raiz.visible)) { pararTropa(); return; }
  const p = pontoNoLaco(t.l, agoraServidor() / 1000 * t.vel + t.fase);
  jogador.pos.set(p.x, alturaChao(p.x, p.z), p.z); jogador.yaw = suavizarAngulo(jogador.yaw, p.ang, dt * 6); jogador.alvo = null;
  t.dist += t.vel * dt;
  if (t.dist >= t.l.total) { t.dist -= t.l.total; ganharTreino('corrida'); }
}
function iniciarTropa(s) {
  const fase = Math.min(...soldados.filter((x) => x.corre).map((x) => x.fase)) - 1.5;   // no fim da fila
  correTropa = { l: s.l, vel: s.vel, fase, dist: 0 };
  aviso('🎖️ Correndo com a tropa! Cada volta completa no pátio = 1 treino de corrida. Mexa o controle para sair.', 4.5);
}
function pararTropa(msg) { correTropa = null; if (msg) aviso(msg, 2.5); }
function atualizarTreino(dt) {
  seguirTreino();
  boneco?.mixer.update(dt);
  const i = interiores.get('treino');
  if (i?.marca) i.marca.visible = !!volta && jogador.dentroCasa === 'treino';
  if (!volta || jogador.dentroCasa !== 'treino') { if (jogador.dentroCasa !== 'treino') volta = null; return; }
  const alvo = volta.k < PISTA.length ? PISTA[volta.k] : [PISTA[3][0], PISTA[3][1] + 1.4];
  i.marca.position.set(alvo[0], 0.05, alvo[1]);
  const seg = (performance.now() - volta.t0) / 1000;
  if (seg > 40) { volta = null; aviso('⏱️ Tempo esgotado (40 s). Volte à largada e tente de novo.', 3); return; }
  if (Math.hypot(i.base.x + alvo[0] - jogador.pos.x, i.base.z + alvo[1] - jogador.pos.z) < 2.6) {
    volta.k++;
    if (volta.k > PISTA.length) { volta = null; aviso(`Volta em ${seg.toFixed(1).replace('.', ',')} s!`, 2); ganharTreino('corrida'); }
    else aviso(volta.k === PISTA.length ? 'Agora volte à largada!' : `Cone ${volta.k}/4 · ${seg.toFixed(0)} s`, 1.2);
  }
}
// ---- fugitivos no mapa: ladrões NPC em fuga e jogadores procurados (para Polícia, PRF, Exército e equipe)
const veFugitivos = () => ['policia', 'prf', 'exercito'].includes(papelDe(jogador.perfil)) || souEquipe();
function ladroesEmFuga() {
  const r = [], ciclo = cicloCrime();
  for (const c of [ciclo, ciclo - 1]) {
    if (presosNpc.has(c)) continue;
    const cr = crimeDoCiclo(c); if (!cr) continue;
    const t = agoraServidor() / 1000 - c * CICLO_CRIME; if (t < 0 || t > FUGA) continue;
    const p = servicos.pontoNaRota(cr.rota, Math.min(cr.rota.total, t * 4.2));
    r.push({ x: p.x, z: p.z, ciclo: c });
  }
  return r;
}
function fugitivosNoMapa() {
  if (!veFugitivos()) return [];
  const r = ladroesEmFuga().map((l) => ({ icone: '🦹', nome: '🦹 Ladrão em fuga', x: l.x, z: l.z, ladrao: l.ciclo }));
  for (const [id, x] of remotos) if (x.meta?.crimes > 0 && x.av) r.push({ icone: '🚨', nome: `🚨 ${x.meta.nome || 'Procurado'}`, x: x.av.raiz.position.x, z: x.av.raiz.position.z, jogador: id });
  return r;
}
// o rastreio de um fugitivo acompanha ele andando
function seguirFugitivoRastreado() {
  if (!rastreio) return;
  if (rastreio.ladrao !== undefined) { const l = ladroesEmFuga().find((x) => x.ciclo === rastreio.ladrao); if (l) { rastreio.x = l.x; rastreio.z = l.z; } else { rastrear(null); aviso('O ladrão sumiu do mapa (preso ou escapou).', 2.5); } }
  else if (rastreio.jogador) { const x = remotos.get(rastreio.jogador); if (x?.av) { rastreio.x = x.av.raiz.position.x; rastreio.z = x.av.raiz.position.z; } }
}

// ================================================================= uniformes e símbolo do clã
// Em serviço, cada corporação veste um colete e um boné/capacete com a cor dela, visíveis para todos:
// Polícia azul-escuro, PRF preto com faixa amarela, Bombeiros vermelho com faixa refletiva, Hospital branco com cruz
// vermelha e Exército verde. Quem é de clã ganha o símbolo do clã (cor e iniciais) ao lado do nome.
const UNIFORMES = {
  policia: { cor: '#1b2a4a', texto: 'POLÍCIA', letra: '#ffffff', faixa: null, chapeu: '#14203a' },
  prf: { cor: '#111111', texto: 'PRF', letra: '#f2c230', faixa: '#f2c230', chapeu: '#111111' },
  bombeiro: { cor: '#b3261e', texto: 'BOMBEIROS', letra: '#ffffff', faixa: '#e8e36a', chapeu: '#f0b400' },
  medico: { cor: '#f4f4f4', texto: '✚ RESGATE', letra: '#c0392b', faixa: '#c0392b', chapeu: '#f4f4f4' },
  exercito: { cor: '#4b5d33', texto: 'EXÉRCITO', letra: '#e8e3c8', faixa: null, chapeu: '#3c4a28' },
  jornalista: { cor: '#1f4f8a', texto: 'IMPRENSA', letra: '#ffffff', faixa: '#ffffff', chapeu: '#1f4f8a' },
};
const NOME_FARDA = { policia: 'Polícia', prf: 'PRF', bombeiro: 'Bombeiros', medico: 'Resgate (Hospital)', exercito: 'Exército', jornalista: 'Imprensa' };
function papelDe(m) { return m?.policial ? 'policia' : m?.prf ? 'prf' : UNIFORMES[m?.profissao] ? m.profissao : null; }
const _texUni = new Map();
function texturaUniforme(u) {
  if (_texUni.has(u.texto)) return _texUni.get(u.texto);
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = u.cor; g.fillRect(0, 0, 512, 128);
  if (u.faixa) { g.fillStyle = u.faixa; g.fillRect(0, 84, 512, 14); }
  g.fillStyle = u.letra; g.font = '800 26px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(u.texto, 128, 52); g.fillText(u.texto, 384, 52);          // na frente e nas costas
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; _texUni.set(u.texto, t); return t;
}
// peças em 3D (GLB, cor neutra: o jogo pinta com a cor de cada corporação). Frente dos modelos = +X.
// medidas = caixa do modelo (largura no eixo Z, topo no eixo Y), para encaixar pela altura do personagem
const PECAS_FARDA = {
  colete: { arq: 'farda_colete', largura: 0.84, prof: 0.77, topo: 0.5 },
  // chapéus: copa = largura da parte que veste a cabeça; cx = onde fica o centro da copa (o boné tem a aba na frente)
  bone: { arq: 'farda_bone', copa: 0.69, cx: -0.1, topo: 0.277, folga: 1.08, subir: 0 },
  bombeiro: { arq: 'farda_capacete_bombeiro', copa: 0.7, cx: 0.016, topo: 0.465, folga: 0.88, subir: 0.05 },   // aba larga: menor e mais alto, senão engole a cabeça,
  militar: { arq: 'farda_capacete_militar', copa: 0.78, cx: 0.014, topo: 0.5, folga: 1.12, subir: 0 },
};
const CHAPEU_DE = { policia: 'bone', prf: 'bone', bombeiro: 'bombeiro', medico: 'bone', exercito: 'militar', jornalista: 'bone' };
const pecasFarda = {}; let pecasPedidas = false;
function carregarPecasFarda() {
  if (pecasPedidas) return; pecasPedidas = true;
  for (const [k, d] of Object.entries(PECAS_FARDA)) carregarGLB(`assets/modelos/${d.arq}.glb`).then((g) => { pecasFarda[k] = g.scene; }).catch(() => { /* fica a farda simples */ });
}
const _rotulos = new Map();
function rotuloFarda(u) {   // plaquinha com o nome da corporação, no peito e nas costas do colete
  if (_rotulos.has(u.texto)) return _rotulos.get(u.texto);
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = u.cor; g.fillRect(0, 0, 256, 64); if (u.faixa) { g.fillStyle = u.faixa; g.fillRect(0, 52, 256, 8); }
  g.fillStyle = u.letra; g.font = '800 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(u.texto, 128, 28);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }); _rotulos.set(u.texto, m); return m;
}
function pecaGlb(nome, cor, u) {
  const base = pecasFarda[nome]; if (!base) return null;
  const g = base.clone(true);
  g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color(cor).lerp(new THREE.Color('#ffffff'), 0.22); o.castShadow = true; } });
  if (u) for (const lado of [1, -1]) {   // frente (+X) e costas (-X)
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.15), rotuloFarda(u)); pl.position.set(lado * 0.405, 0.06, 0); pl.rotation.y = lado * Math.PI / 2; g.add(pl);
  }
  g.rotation.y = -Math.PI / 2;   // a frente do modelo (+X) vira a frente do personagem (+Z)
  const h = new THREE.Group(); h.add(g); return h;
}
// Mede a parte do corpo pela própria malha do personagem (na pose de descanso), nas coordenadas de um osso:
// assim o capacete e o colete viram "filhos" do osso e acompanham cabeça e peito exatamente, em qualquer personagem.
function medirParte(modelo, osso, incluir) {
  const v = new THREE.Vector3(), pts = []; let bi = null, esq = null;
  modelo.traverse((m) => {   // todas as malhas com esqueleto (cabeça, cabelo e roupa podem ser malhas separadas)
    if (!m.isSkinnedMesh) return;
    const sk = m.skeleton, ia = sk.bones.indexOf(osso); if (ia < 0) return;
    const quer = new Set(); sk.bones.forEach((b, i) => { if (incluir(b)) quer.add(i); });
    const g = m.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight; if (!P || !SI || !SW) return;
    const M = new THREE.Matrix4().multiplyMatrices(sk.boneInverses[ia], m.bindMatrix);
    const passo = Math.max(1, Math.floor(P.count / 6000));
    for (let k = 0; k < P.count; k += passo) {
      let w = 0; for (let c = 0; c < 4; c++) if (quer.has(SI.getComponent(k, c))) w += SW.getComponent(k, c);
      if (w >= 0.4) pts.push(v.fromBufferAttribute(P, k).applyMatrix4(M).clone());
    }
    bi = sk.boneInverses[ia]; esq = sk;
  });
  if (!bi || pts.length < 30) return null;
  const R = new THREE.Matrix3().setFromMatrix4(bi);   // direções do mundo (em pé, olhando +Z) dentro do osso
  const cima = new THREE.Vector3(0, 1, 0).applyMatrix3(R).normalize();
  const frente = new THREE.Vector3(0, 0, 1).applyMatrix3(R); frente.addScaledVector(cima, -frente.dot(cima)).normalize();
  const lado = new THREE.Vector3().crossVectors(cima, frente).normalize();
  const faixa = (eixo, a, b) => { const l = pts.map((p) => p.dot(eixo)).sort((x, y) => x - y); return [l[Math.floor(l.length * a)], l[Math.min(l.length - 1, Math.floor(l.length * b))]]; };
  const [l0, l1] = faixa(lado, 0.05, 0.95), [f0, f1] = faixa(frente, 0.08, 0.92), [c0, c1] = faixa(cima, 0.02, 0.96);   // ignora pontas (nariz, mochila, cabelo espetado)
  // posição de outro osso (na pose de descanso) medida neste osso: usada para a altura do colete (do quadril ao pescoço)
  const alturaDe = (b) => { const i = esq.bones.indexOf(b); if (i < 0) return null; return new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(bi).multiply(new THREE.Matrix4().copy(esq.boneInverses[i]).invert())).dot(cima); };
  return { cima, frente, lado, largura: l1 - l0, prof: f1 - f0, baixo: c0, topo: c1, cl: (l0 + l1) / 2, cf: (f0 + f1) / 2, alturaDe };
}
const descendeDe = (b, pai) => { for (let x = b; x; x = x.parent) if (x === pai) return true; return false; };
function encaixar(peca, osso, med, sx, sy, sz, centro) {
  const m = new THREE.Matrix4().makeBasis(med.lado, med.cima, med.frente);
  peca.quaternion.setFromRotationMatrix(m); peca.scale.set(sx, sy, sz);
  peca.position.set(0, 0, 0).addScaledVector(med.lado, med.cl).addScaledVector(med.frente, centro.f).addScaledVector(med.cima, centro.c);
  osso.add(peca);
}
// ---- ajuste fino da farda (feito pelo admin, salvo para todos): por corporação, colete e capacete/boné separados
// colete: larg/alt/fund (multiplicam) e subir/frente (deslocam, em fração da altura do tronco)
// chapéu: tam (multiplica) e subir/frente (fração da altura da cabeça)
let ajusteFarda = {}, versaoFarda = 0;
const AJ_PADRAO = { colete: { larg: 1, alt: 1, fund: 1, subir: 0, frente: 0 }, chapeu: { tam: 1, subir: 0, frente: 0 } };
function ajusteDe(papel, peca) { return { ...AJ_PADRAO[peca], ...(ajusteFarda?.[papel]?.[peca] || {}) }; }
function definirAjusteFarda(novo) {
  const txt = JSON.stringify(novo || {}); if (txt === JSON.stringify(ajusteFarda)) return;
  ajusteFarda = JSON.parse(txt); versaoFarda++;   // muda a versão: todo mundo se veste de novo com o ajuste
}
function vestir(av, papel) {
  if (!av) return;
  const glb = !!(papel && pecasFarda.colete && pecasFarda[CHAPEU_DE[papel]]);
  if (av.uniforme?.papel === papel && av.uniforme.glb === glb && av.uniforme.v === versaoFarda) return;
  if (av.uniforme) { av.uniforme.colete.removeFromParent(); av.uniforme.chapeu.removeFromParent(); av.uniforme = null; }
  if (!papel) return;
  carregarPecasFarda();
  const u = UNIFORMES[papel], achados = {};
  // cada modelo nomeia os ossos de um jeito (mixamorigSpine1, mixamorig:Spine1, Spine1...): procura pelo fim do nome
  av.modelo.traverse((x) => { if (!x.isBone) return; const n = (x.name || '').toLowerCase().replace(/[^a-z0-9_]/g, ''); for (const k of ['spine2', 'spine1', 'spine', 'neck', 'headtop_end', 'head', 'hips']) if (!achados[k] && n.endsWith(k)) { achados[k] = x; break; } });
  let ossos = { base: achados.spine1 || achados.spine || achados.spine2, pescoco: achados.neck, cabeca: achados.head, topo: achados.headtop_end };
  if (!ossos.base || !ossos.pescoco || !ossos.cabeca) ossos = null;   // sem esqueleto conhecido: veste pela altura do corpo
  let colete, chapeu;
  if (glb) { colete = pecaGlb('colete', u.cor, u); chapeu = pecaGlb(CHAPEU_DE[papel], u.chapeu); }
  else {   // enquanto os modelos 3D não carregam: colete e boné simples
    colete = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.94, 1, 14, 1, true), new THREE.MeshStandardMaterial({ map: texturaUniforme(u), roughness: 0.8, side: THREE.DoubleSide }));
    chapeu = new THREE.Group();
    const copa = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1, 0.55, 14), new THREE.MeshStandardMaterial({ color: u.chapeu, roughness: 0.6 })); copa.position.y = 0.27; chapeu.add(copa);
    colete.castShadow = true;
  }
  let preso = false;
  if (glb && ossos) {
    if (!av._medidas) {   // mede uma vez por personagem
      const tronco = achados.spine1 || achados.spine || achados.spine2;   // osso do meio da coluna: o colete gira em torno do próprio centro e não balança para trás ao andar
      av._medidas = {
        tronco, cabeca: ossos.cabeca,
        mt: medirParte(av.modelo, tronco, (b) => /spine\d?$/i.test((b.name || '').replace(/[^a-z0-9]/gi, ''))),
        mc: medirParte(av.modelo, ossos.cabeca, (b) => descendeDe(b, ossos.cabeca) || b === ossos.pescoco),
      };
    }
    const { tronco, cabeca, mt, mc } = av._medidas;
    if (mt && mc) {
      // colete: do pescoço até um pouco acima do quadril; largura e fundura do peito medidas na malha
      const C = PECAS_FARDA.colete, quadril = achados.hips || av.modelo.getObjectByName('mixamorigHips');
      let topo = mt.alturaDe(ossos.pescoco), base = quadril ? mt.alturaDe(quadril) : null;
      if (topo === null || base === null || topo - base < 0.05) { topo = mt.topo; base = mt.baixo; } else base += (topo - base) * 0.12;
      const H = topo - base, ac = ajusteDe(papel, 'colete'), ah = ajusteDe(papel, 'chapeu');
      encaixar(colete, tronco, mt, mt.largura * 1.35 * ac.larg / C.largura, H * ac.alt, Math.min(mt.prof, mt.largura * 0.85) * 1.5 * ac.fund / C.prof,
        { f: mt.cf + ac.frente * H, c: (topo + base) / 2 + ac.subir * H });
      const P = PECAS_FARDA[CHAPEU_DE[papel]], hc = mc.topo - mc.baixo, sc = Math.min(mc.largura, hc * 0.95) * P.folga * 1.1 * ah.tam / P.copa;
      encaixar(chapeu, cabeca, mc, sc, sc, sc, { f: mc.cf - P.cx * sc + ah.frente * hc, c: mc.topo + hc * (0.03 + P.subir + ah.subir) - P.topo * sc });
      preso = true;
    }
  }
  if (!preso) scene.add(colete, chapeu);
  av.uniforme = { papel, colete, chapeu, ossos, glb, preso, peca: CHAPEU_DE[papel], v: versaoFarda };
}
const _cx = new THREE.Vector3(), _cy = new THREE.Vector3(), _cz = new THREE.Vector3(), _cw = new THREE.Vector3();
const _ua = new THREE.Vector3(), _ub = new THREE.Vector3(), _uc = new THREE.Vector3(), _ud = new THREE.Vector3(), _um = new THREE.Matrix4(), _ux = new THREE.Vector3(), _uq = new THREE.Quaternion();
function posicionarUniforme(av) {
  const U = av?.uniforme; if (!U || U.preso) return;   // presa aos ossos: anda sozinha com o corpo
  const vis = av.raiz.visible; U.colete.visible = U.chapeu.visible = vis; if (!vis) return;
  const alt = av.altura || 1.8, yaw = av.raiz.rotation.y, r = av.raiz.position;
  // eixos do corpo: "cima" segue a coluna; sem ossos, fica em pé
  let pesc, topo;
  if (U.ossos) {
    U.ossos.base.getWorldPosition(_ua); U.ossos.pescoco.getWorldPosition(_ub);
    _uc.subVectors(_ub, _ua); if (_uc.lengthSq() < 1e-6) _uc.set(0, 1, 0); _uc.normalize();
  } else { _ua.set(r.x, r.y + alt * 0.5, r.z); _ub.set(r.x, r.y + alt * 0.8, r.z); _uc.set(0, 1, 0); }
  const cima = _uc, frente = _ud.set(Math.sin(yaw), 0, Math.cos(yaw)); frente.addScaledVector(cima, -frente.dot(cima)).normalize();
  const lado = _ux.crossVectors(cima, frente).normalize();
  _um.makeBasis(lado, cima, frente); _uq.setFromRotationMatrix(_um);
  pesc = _ub.clone();
  if (U.ossos) { U.ossos.cabeca.getWorldPosition(_ua); topo = U.ossos.topo ? U.ossos.topo.getWorldPosition(new THREE.Vector3()) : _ua.clone().addScaledVector(cima, 0.13 * alt); }
  else topo = new THREE.Vector3(r.x, r.y + alt, r.z);
  U.colete.quaternion.copy(_uq); U.chapeu.quaternion.copy(_uq);
  if (U.glb) {
    const C = PECAS_FARDA.colete, sy = 0.36 * alt;   // largo e fundo o bastante para envolver o tronco de qualquer personagem
    U.colete.scale.set(0.36 * alt / C.largura, sy, 0.26 * alt / C.prof);
    U.colete.position.copy(pesc).addScaledVector(cima, 0.035 * alt - C.topo * sy).addScaledVector(frente, 0.015 * alt);   // o alto do colete nos ombros
    // chapéu medido pela própria cabeça (personagens cabeçudos ganham capacete maior) e centrado no crânio
    const P = PECAS_FARDA[U.peca], cab = U.ossos ? U.ossos.cabeca.getWorldPosition(new THREE.Vector3()) : topo.clone().addScaledVector(_cy.set(0, 1, 0), -0.13 * alt);
    const eixo = _cy.subVectors(topo, cab); let hc = eixo.length();
    if (hc < 0.05 * alt || hc > 0.4 * alt) { hc = 0.13 * alt; eixo.set(0, 1, 0); } else eixo.normalize().add(_cx.set(0, 1, 0)).normalize();   // meio-termo entre a cabeça e o vertical: acompanha sem entortar
    const fr = _cz.copy(frente).addScaledVector(eixo, -frente.dot(eixo)).normalize(), ld = _cw.crossVectors(eixo, fr).normalize();
    _um.makeBasis(ld, eixo, fr); U.chapeu.quaternion.setFromRotationMatrix(_um);
    const sc = hc * P.folga / P.copa;   // a copa um pouco mais larga que a cabeça
    U.chapeu.scale.setScalar(sc);
    U.chapeu.position.copy(topo).addScaledVector(eixo, (0.16 + P.subir) * hc - P.topo * sc).addScaledVector(fr, -0.02 * hc - P.cx * sc);   // a copa do boné/capacete no alto da cabeça
    return;
  }
  const comp = Math.max(0.2, _ub.distanceTo(U.ossos ? U.ossos.base.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(r.x, r.y + alt * 0.5, r.z)));
  U.colete.position.copy(pesc).addScaledVector(cima, -comp * 0.5);
  U.colete.scale.set(0.16 * alt, comp * 1.5, 0.12 * alt);
  U.chapeu.position.copy(topo).addScaledVector(cima, -0.02 * alt);
  U.chapeu.scale.setScalar(0.1 * alt);
}
// A farda: veste sozinha ao entrar no expediente e sai ao terminar. No vestiário do QG de cada trabalho dá para
// vestir ou tirar quando quiser. A equipe (admin e moderadores) pode vestir qualquer uma.
let papelVisto;
function chaveFarda() { return 'fator_farda_' + (jogador.perfil?.id || ''); }
function definirFarda(papel, silencioso) {
  jogador.farda = papel || null;
  try { if (papel) localStorage.setItem(chaveFarda(), papel); else localStorage.removeItem(chaveFarda()); } catch { /* sem armazenamento */ }
  conexao?.rastrear(metaPresenca()); desenharEscudo();
  if (!silencioso) aviso(papel ? `👔 Farda vestida: ${NOME_FARDA[papel]}.` : '👕 Farda guardada no armário.', 2.5);
}
function seguirExpediente() {
  if (!jogador.perfil) return;
  const p = papelDe(jogador.perfil);
  if (papelVisto === undefined) {   // ao abrir o jogo: volta com a farda que estava
    papelVisto = p; let salva = null; try { salva = localStorage.getItem(chaveFarda()); } catch { /* nada */ }
    jogador.farda = salva && UNIFORMES[salva] && (salva === p || souEquipe()) ? salva : p;
    if (jogador.farda) conexao?.rastrear(metaPresenca());
    return;
  }
  if (jogador.farda && !souEquipe() && jogador.farda !== p) definirFarda(p || null, true);   // farda é só da própria corporação
  if (p === papelVisto) return;
  papelVisto = p;
  if (p) definirFarda(p);                                          // entrou no expediente: veste
  else if (jogador.farda && !souEquipe()) definirFarda(null);       // saiu: guarda
}
// ---- escudo da farda: o colete aguenta 100 de dano antes da vida; o capacete segura 10% do que passar.
// Colete destruído: só um novo no vestiário (o escudo fica guardado entre expedientes, não volta sozinho).
const ESCUDO_MAX = 100;
let escudo = null;   // lido do aparelho na primeira vez
function chaveEscudo() { return 'fator_escudo_' + (jogador.perfil?.id || ''); }
function escudoAtual() {
  if (escudo === null) { let v = null; try { v = localStorage.getItem(chaveEscudo()); } catch { /* nada */ } escudo = v === null ? ESCUDO_MAX : Math.max(0, Math.min(ESCUDO_MAX, +v || 0)); }
  return escudo;
}
function guardarEscudo() { try { localStorage.setItem(chaveEscudo(), String(Math.round(escudo))); } catch { /* nada */ } }
const comColete = () => !!jogador.farda && !jogador.carro;
function absorverEscudo(v) {
  if (!comColete() || v <= 0) return v;
  const e = escudoAtual(), tira = Math.min(e, v), resto = (v - tira) * 0.9;   // capacete: -10% no que chega à vida
  if (tira > 0) {
    escudo = e - tira; guardarEscudo();
    if (escudo <= 0) aviso('🛡️ Seu colete foi destruído! Vá ao vestiário do seu trabalho e pegue um colete novo.', 4.5);
  }
  return resto;
}
function desenharEscudo() {
  const linha = $('linhaEscudo'); if (!linha) return;
  const ver = !!jogador.farda; linha.style.display = ver ? '' : 'none'; if (!ver) return;
  const e = escudoAtual(), b = $('barEscudo');
  b.firstChild.style.width = (e / ESCUDO_MAX * 100).toFixed(0) + '%';
  $('txtEscudo').textContent = e <= 0 ? ' ⚠️' : ''; b.title = e <= 0 ? 'Colete quebrado: pegue um novo no vestiário' : `Escudo ${Math.round(e)}%`;
}
function trocarColete() { escudo = ESCUDO_MAX; guardarEscudo(); desenharEscudo(); aviso('🛡️ Colete novo! Escudo 100%.', 2.5); }
function vestiario(trabalho) {
  const p = papelDe(jogador.perfil), opcoes = [];
  if (souEquipe()) for (const k of Object.keys(UNIFORMES)) opcoes.push({ rotulo: `${jogador.farda === k ? '✔️ ' : ''}${NOME_FARDA[k]}`, fn: () => definirFarda(k) });
  else if (p) opcoes.push({ rotulo: jogador.farda === p ? `Tirar a farda (${NOME_FARDA[p]})` : `Vestir a farda: ${NOME_FARDA[p]}`, fn: () => definirFarda(jogador.farda === p ? null : p) });
  else { aviso(`Só quem está no expediente ${trabalho ? `(${trabalho}) ` : ''}veste a farda. Entre em serviço primeiro.`, 3.5); return; }
  if (souEquipe() && jogador.farda) opcoes.push({ rotulo: 'Tirar a farda', fn: () => definirFarda(null) });
  if (jogador.farda || p) { const e = escudoAtual(); opcoes.unshift({ rotulo: e >= ESCUDO_MAX ? '🛡️ Colete inteiro (100%)' : `🛡️ Pegar colete novo (escudo ${Math.round(e)}% → 100%)`, fn: () => { if (e < ESCUDO_MAX) trocarColete(); } }); }
  escolher('👔 Vestiário', souEquipe() ? 'Equipe: escolha qualquer farda.' : 'Sua farda de trabalho:', opcoes);
}
function atualizarUniformes() {
  seguirExpediente();
  if (jogador.avatar) { vestir(jogador.avatar, jogador.carro || jogador.passageiro ? null : jogador.farda || null); posicionarUniforme(jogador.avatar); }
  for (const r of remotos.values()) { if (!r.av) continue; vestir(r.av, r.meta && 'farda' in r.meta ? r.meta.farda : papelDe(r.meta)); posicionarUniforme(r.av); }
}
// nome com o símbolo do clã (escudo na cor do clã com as iniciais)
function corDoClaNome(nome) { for (const c of clasCache.values()) if (c.nome === nome) return c.cor || '#c43b3b'; return '#c43b3b'; }
function nomeComCla(nome, cla, cor) {
  if (!cla) return textoSprite(nome, { escala: 0.8, cor });
  const tam = 34, c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `700 ${tam}px system-ui, sans-serif`;
  const tw = Math.ceil(g.measureText(nome).width), esc = 46, w = tw + esc + 40, h = tam + 22;
  c.width = w; c.height = h;
  g.fillStyle = 'rgba(20,24,34,.78)'; g.beginPath(); g.roundRect(0, 0, w, h, h / 2); g.fill();
  // escudo
  const x0 = 10, y0 = 5, cc = corDoClaNome(cla);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + esc - 8, y0); g.lineTo(x0 + esc - 8, y0 + 26); g.quadraticCurveTo(x0 + (esc - 8) / 2, h - 2, x0, y0 + 26); g.closePath();
  g.fillStyle = cc; g.fill(); g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = '#ffffff'; g.font = '800 18px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(cla).replace(/[^A-Za-zÀ-ú0-9]/g, '').slice(0, 2).toUpperCase(), x0 + (esc - 8) / 2, y0 + 17);
  g.font = `700 ${tam}px system-ui, sans-serif`; g.fillStyle = cor; g.textAlign = 'left'; g.fillText(nome, x0 + esc + 4, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  const k = 0.022 * 0.8; s.scale.set(w * k, h * k, 1); s.renderOrder = 5;
  return s;
}
function trocarNome(av, antigo, nome, cla, cor) {
  if (antigo) av.raiz.remove(antigo);
  const s = nomeComCla(nome, cla, cor); s.position.y = alturaNome(av); av.raiz.add(s); return s;
}
let tempoNomes = 0;
function atualizarNomesCla(dt) {
  if ((tempoNomes -= dt) > 0) return; tempoNomes = 1;
  const eu = jogador.claInfo?.nome || null;
  if (jogador.avatar && jogador.etiqueta && jogador.etiquetaCla !== eu) { jogador.etiqueta = trocarNome(jogador.avatar, jogador.etiqueta, jogador.perfil.nome, eu, '#f2a33a'); jogador.etiquetaCla = eu; }
  for (const r of remotos.values()) {
    if (!r.av || !r.et) continue;
    const cla = r.meta?.cla || null;
    if (r.etCla !== cla) { r.et = trocarNome(r.av, r.et, r.meta.nome, cla, r.meta.cargo === 'admin' ? '#ff6b6b' : r.meta.cargo === 'moderador' ? '#7fb8ff' : '#ffffff'); r.etCla = cla; }
  }
}

// ================================================================= ônibus: Rodoviária e três linhas
// A Rodoviária (quarteirão a nordeste do centro) tem uma plataforma por linha. Os ônibus do sistema rodam pelo
// relógio do servidor (todos veem igual): cada saída tem horário. Quem volta antes da vez espera na fila, atrás do
// que está na plataforma, e só encosta quando ele sai; as três linhas chegam quase juntas, uma em cada plataforma.
// As linhas são voltas fechadas que passam por ruas de mão dupla, então ônibus indo e vindo se cruzam.
// O motorista jogador assume uma saída da tabela (o ônibus do sistema daquela saída some para todos).
// Qualquer jogador pode embarcar como passageiro (5 moedas) num ônibus parado no ponto ou na plataforma.
const RODO = { x: 135, z: -243, x0: 113, x1: 157, z0: -265, z1: -221, baia: -230, fila: -243, entrada: -262, saidaZ: -221, guiche: { x: 155.5, z: -239 } };
// cinco plataformas na Rodoviária (oeste → leste). As linhas "circulares" não param na plataforma: passam na calçada
// do lado leste da rodoviária (ponto Rodoviária) e rodam sem parar o dia todo.
const PLAT = [117.5, 126.1, 134.7, 143.3, 151.9];
const URB = ['onibus_urbano', 'onibus_apache', 'onibus_busscar', 'onibus_apache'], EXEC = ['onibus_executivo2', 'onibus_dois_andares'];   // os de viagem vão para as cidades vizinhas
const ROD = [162, -238, 'Rodoviária', 's'];   // ponto das circulares, na calçada leste da rodoviária
const LINHAS = [
  { id: 1, nome: 'Linha 1 · Circular', curto: 'Circular', cor: '#1f6fd1', faixa: PLAT[0], k: 3, fase: 0, modelos: ['onibus_articulado', 'onibus_apache', 'onibus_busscar'],
    rua: [[PLAT[0], -216], [108, -216], [108, -54], [-108, -54], [-108, 54], [108, 54], [108, -270], [PLAT[0], -270]],
    paradas: [[108, -150, 'Concessionária', 's'], [-27, -54, null], [-108, -27, null], [27, 54, null], [108, -110, 'Banco', 'n']] },
  { id: 7, nome: 'Linha 7 · Vila Serra', curto: 'Vila Serra', cor: '#6d4c9f', faixa: PLAT[1], k: 4, fase: 3, modelos: EXEC, inter: true,
    rua: [[PLAT[1], -216], [108, -216], [108, -108], [-162, -108], [-162, -945], [81, -945], [81, -999], [-81, -999], [-81, -945], [-162, -945], [-162, -108], [108, -108], [108, -270], [PLAT[1], -270]],
    paradas: [[-27, -108, 'Estação Norte', 'o'], [-162, -560, 'Rodovia Norte', 'n'], [70, -945, '🚌 Rodoviária de Vila Serra', 'l'], [0, -999, 'Vila Serra · Centro', 'o'], [-162, -600, 'Rodovia Norte', 's'], [27, -108, 'Estação Norte', 'l']] },
  { id: 8, nome: 'Linha 8 · Porto Sul', curto: 'Porto Sul', cor: '#1a8fb0', faixa: PLAT[2], k: 4, fase: 10, modelos: EXEC, inter: true,
    rua: [[PLAT[2], -216], [216, -216], [216, 945], [-81, 945], [-81, 999], [81, 999], [81, 945], [216, 945], [216, -270], [PLAT[2], -270]],
    paradas: [[216, 300, 'Av. Leste', 's'], [216, 600, 'Rodovia Sul', 's'], [70, 945, '🚌 Rodoviária de Porto Sul', 'o'], [0, 999, 'Porto Sul · Centro', 'l'], [216, 560, 'Rodovia Sul', 'n'], [216, 250, 'Av. Leste', 'n']] },
  { id: 3, nome: 'Linha 3 · Leste', curto: 'Leste', cor: '#2e9e57', faixa: PLAT[3], k: 3, fase: 14, modelos: ['onibus_urbano', 'onibus_articulado', 'onibus_busscar'],
    rua: [[PLAT[3], -216], [270, -216], [270, 162], [108, 162], [108, -270], [PLAT[3], -270]],
    paradas: [[270, -90, 'Zona Leste'], [190, 162, 'Cemitério'], [108, 27, null], [108, -180, 'Banco']] },
  { id: 2, nome: 'Linha 2 · Aeroporto', curto: 'Aeroporto', cor: '#e8891c', faixa: PLAT[4], k: 3, fase: 7, modelos: ['onibus_executivo'],
    rua: [[PLAT[4], -216], [162, -216], [162, -668], [400, -668], [400, -688], [162, -688], [162, -270], [PLAT[4], -270]],
    paradas: [[162, -470, 'Av. do Aeroporto', 'n'], [270, -688, '✈️ Aeroporto · Terminal'], [162, -420, 'Av. do Aeroporto', 's']] },
  // circulares (sem plataforma): começam e terminam na calçada leste da rodoviária
  { id: 4, nome: 'Linha 4 · Oeste e Serviços', curto: 'Serviços', cor: '#8e44ad', k: 4, fase: 5, modelos: URB, circular: true,
    rua: [[162, -260], [162, -216], [108, -216], [108, -108], [-270, -108], [-270, 162], [-108, 162], [-108, 108], [108, 108], [108, -270], [162, -270], [162, -260]],
    paradas: [ROD, [-135, -108, 'Prefeitura', 'o'], [-270, -27, 'Autoescola', 's'], [-150, 162, 'Hospital', 'l'], [-81, 108, 'Bombeiros', 'l'], [0, 108, 'Estação Sul', 'l'], [108, -135, 'Banco', 'n']] },
  { id: 5, nome: 'Linha 5 · Estações e Trabalho', curto: 'Estações', cor: '#c0392b', k: 4, fase: 9, modelos: URB, circular: true,
    rua: [[162, -260], [162, -216], [108, -216], [108, -108], [-108, -108], [-108, 108], [108, 108], [378, 108], [378, -54], [216, -54], [216, -270], [162, -270], [162, -260]],
    paradas: [ROD, [0, -108, 'Estação Norte', 'o'], [-108, 0, 'Mercado', 's'], [0, 108, 'Estação Sul', 'l'], [300, 108, 'Zona Leste', 'l'], [351, -54, '♻️ Central de Reciclagem', 'o'], [216, -150, 'Zona Nordeste', 'n']] },
  { id: 6, nome: 'Linha 6 · Territórios', curto: 'Territórios', cor: '#16a085', k: 4, fase: 2, modelos: URB, circular: true,
    rua: [[162, -260], [162, -216], [108, -216], [108, -108], [-270, -108], [-270, -270], [-324, -270], [-324, 54], [-108, 54], [270, 54], [270, 324], [324, 324], [324, -270], [162, -270], [162, -260]],
    paradas: [ROD, [-297, -270, 'Praça do Território (NO)', 'o'], [-324, -100, 'Zona Oeste', 's'], [-162, 54, 'Território Oeste', 'l'], [297, 324, 'Praça do Território (SE)', 'l'], [324, 0, 'Zona Leste', 'n']] },
];
const V_ONIBUS = 10, ESPERA_PONTO = 6, FOLGA_FILA = 25;
// caminho de direção (faixa da direita, curvas arredondadas) de uma linha: da plataforma, pela cidade, de volta à fila e à plataforma
function montarCaminho(L) {
  const lado = 2.6, f = L.faixa, R = L.rua;
  const dir = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1; return [dx / d, dz / d]; };
  const ruaPts = R.map((p, i) => {
    const di = i > 0 ? dir(R[i - 1], p) : null, dout = i < R.length - 1 ? dir(p, R[i + 1]) : null;
    if (di && dout) {   // esquina: cruzamento das duas faixas da direita
      const n1 = [-di[1], di[0]], n2 = [-dout[1], dout[0]], cr = di[0] * dout[1] - di[1] * dout[0];
      if (Math.abs(cr) < 1e-6) return [p[0] + n1[0] * lado, p[1] + n1[1] * lado];
      const a = [p[0] + n1[0] * lado, p[1] + n1[1] * lado], b = [p[0] + n2[0] * lado, p[1] + n2[1] * lado];
      const t = ((b[0] - a[0]) * dout[1] - (b[1] - a[1]) * dout[0]) / cr; return [a[0] + di[0] * t, a[1] + di[1] * t];
    }
    const d = di || dout, n = [-d[1], d[0]]; return [p[0] + n[0] * lado, p[1] + n[1] * lado];
  });
  const bruto = L.circular ? ruaPts : [...(L.ini || [[f, RODO.baia], [f, RODO.saidaZ]]), ...ruaPts, ...(L.fimPts || [[f, RODO.entrada], [f, RODO.fila], [f, RODO.baia]])];
  // arredonda as esquinas (curva de até 7 m)
  const pts = [bruto[0]];
  for (let i = 1; i < bruto.length - 1; i++) {
    const a = bruto[i - 1], p = bruto[i], b = bruto[i + 1], d1 = dir(a, p), d2 = dir(p, b);
    const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]), l2 = Math.hypot(b[0] - p[0], b[1] - p[1]);
    if (Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) < 0.05 && d1[0] * d2[0] + d1[1] * d2[1] > 0) { pts.push(p); continue; }
    const r = Math.min(9, l1 * 0.45, l2 * 0.45), q0 = [p[0] - d1[0] * r, p[1] - d1[1] * r], q2 = [p[0] + d2[0] * r, p[1] + d2[1] * r];
    for (let k = 0; k <= 6; k++) { const t = k / 6, u = 1 - t; pts.push([u * u * q0[0] + 2 * u * t * p[0] + t * t * q2[0], u * u * q0[1] + 2 * u * t * p[1] + t * t * q2[1]]); }
  }
  pts.push(bruto[bruto.length - 1]);
  const acum = [0]; for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  L.pts = pts; L.acum = acum; L.L = acum[acum.length - 1]; L.sFila = L.circular ? L.L : L.L - (RODO.baia - RODO.fila);
}
function pontoCaminho(L, s) {
  s = THREE.MathUtils.clamp(s, 0, L.L);
  let lo = 0, hi = L.acum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L.acum[m] <= s) lo = m; else hi = m; }
  const a = L.pts[lo], b = L.pts[hi], d = L.acum[hi] - L.acum[lo] || 1, k = (s - L.acum[lo]) / d;
  return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, ang: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}
function pontoCaminhoExt(L, s) {
  if (L.circular && L.L) s = ((s % L.L) + L.L) % L.L;
  const q = pontoCaminho(L, s), fora = s > L.L ? s - L.L : s < 0 ? s : 0;
  if (fora) { q.x += Math.sin(q.ang) * fora; q.z += Math.cos(q.ang) * fora; }
  return q;
}
// curvas: quem anda pela rua é desenhado pelos dois eixos (eixos.js)
function marcarEixos() {
  for (const b of onibusNpc) if (b.ativo && b.mesh.visible && b.e) eixos.marcar(b.mesh, b.desviando ? null : pontoCaminhoExt(b.L, b.e.s + civico.eixosDe(b.mesh).zf));
  for (const S of SETORES) if (S.npc?.visible && S.sAtual !== undefined) eixos.marcar(S.npc, pontoCaminhoExt(S.cam, S.sAtual + civico.eixosDe(S.npc).zf));
  for (const o of servicos.veiculosNpc()) eixos.marcar(o);
  for (const v of viaturas) if (v.obj.visible) eixos.marcar(v.obj);
  for (const v of rondasBombeiros) if (v.obj.visible) eixos.marcar(v.obj);
  for (const v of vansNpc) if (v.obj.visible && !v.roubada) eixos.marcar(v.obj);
}
// paradas: o ponto da rua vira o trecho do caminho que passa com a calçada à direita
function montarParadasLinha(L) {
  L.pontos = [];
  const RUMO = { n: Math.PI, s: 0, l: Math.PI / 2, o: -Math.PI / 2 };
  for (const [cx, cz, nome, rumo] of L.paradas) {
    let melhor = null;
    for (let s = 0; s < L.L; s += 1) {
      const q = pontoCaminho(L, s), d = Math.hypot(q.x - cx, q.z - cz); if (d > 4) continue;
      if (rumo && Math.cos(q.ang - RUMO[rumo]) < 0.7) continue;   // rua de mão dupla: o ponto é do sentido pedido
      if (!melhor || d < melhor.d) melhor = { s, d };
    }
    if (melhor) L.pontos.push({ s: melhor.s, nome: nome || nomeDaRua(cx, cz) || 'Ponto' });
  }
  L.pontos.sort((a, b) => a.s - b.s);
  tabelaLinha(L);
}
// tabela: chegada e saída em cada ponto (segundos depois da saída da plataforma)
function tabelaLinha(L) {
  let t = 0, sAnt = 0; L.tab = [];
  for (const p of L.pontos) { const chega = t + (p.s - sAnt) / V_ONIBUS + 2; L.tab.push({ chega, sai: chega + ESPERA_PONTO }); t = chega + ESPERA_PONTO; sAnt = p.s; }
  L.R = t + (L.sFila - sAnt) / V_ONIBUS + 2;           // volta inteira até a fila
  L.H = L.circular ? L.R / L.k : (L.R + FOLGA_FILA) / (L.k - 1);   // intervalo entre saídas (circular: roda sem parar)
  L.C = L.circular ? L.R : L.k * L.H;                  // ciclo de cada ônibus
}
for (const L of LINHAS) { montarCaminho(L); montarParadasLinha(L); }
const LINHA_ID = Object.fromEntries(LINHAS.map((L) => [L.id, L]));
// posição (s) de um ônibus e. segundos depois de sair; "ponto" = índice do ponto onde está parado
function sNaRota(L, e) {
  let sAnt = 0, tAnt = 0;
  for (let i = 0; i < L.pontos.length; i++) {
    const p = L.pontos[i], tb = L.tab[i];
    if (e < tb.chega) return { s: sAnt + (p.s - sAnt) * THREE.MathUtils.smootherstep((e - tAnt) / (tb.chega - tAnt), 0, 1) };
    if (e < tb.sai) return { s: p.s, ponto: i };
    sAnt = p.s; tAnt = tb.sai;
  }
  return { s: sAnt + (L.sFila - sAnt) * THREE.MathUtils.smootherstep((e - tAnt) / (L.R - tAnt), 0, 1) };
}
const horaSaida = (L, m) => L.fase + m * L.H;
// algumas saídas do sistema atrasam (igual para todos): o ônibus fica na plataforma 15 a 35 s depois do horário
// e corre um pouco mais na rua para chegar no horário. O fiscal registra esses atrasos.
function atrasoSaida(L, m) {
  if (L.circular) return 0;
  const h = Math.abs(Math.sin(L.id * 91.7 + m * 12.9898) * 43758.5453) % 1;
  return h < 0.2 ? 15 + Math.floor(h / 0.2 * 20) : 0;
}
// estado da saída m da linha no tempo t (null = não está na rua nem na rodoviária por esta saída)
function estadoSaida(L, m, t) {
  const T = horaSaida(L, m), D = atrasoSaida(L, m);
  if (L.circular) { if (t < T || t >= T + L.R) return null; const r = sNaRota(L, t - T); return { ...r, rota: true, parado: r.ponto !== undefined }; }
  if (t >= T + L.R || t < T - (L.C - L.R)) return null;
  if (t >= T + D) { const r = sNaRota(L, (t - T - D) * L.R / (L.R - D)); return { ...r, rota: true, parado: r.ponto !== undefined }; }
  const entra = T - L.H + 7 + atrasoSaida(L, m - 1);   // só encosta depois que o da frente saiu (e ganhou distância)
  if (t >= entra) { const k = THREE.MathUtils.smootherstep((t - entra) / 6, 0, 1); return { s: L.sFila + (L.L - L.sFila) * k, baia: true, parado: k >= 1, atrasado: t >= T ? Math.floor(t - T) : 0 }; }
  return { s: L.sFila, fila: true, parado: true };   // a posição na fila (um atrás do outro) é decidida no quadro
}
const proximaSaidaLinha = (L, t) => Math.ceil((t - L.fase) / L.H);
const saidasOcupadas = new Set();   // '2.123' assumidas por motoristas jogadores (vindas da presença)
const onibusNpc = [];               // { mesh, L, m, x, z, ang, parado, ativo }
const estadoBus = new Map(), pontosOcupados = [], pontosAntes = [], juncaoAntes = [], juncaoAgora = [];        // 'linha.saída' -> { atraso, sVis, bloq, fantasma }: atraso local de quem esperou no trânsito
let paradasMontadas = false, minhaVolta = null, placasRodo = [];
// modelo do ônibus de cada saída: as linhas alternam entre os modelos (o mesmo ônibus físico mantém o modelo)
// comprimento de cada ônibus (o articulado tem 18,6 m): a fila e a espera nos pontos usam o tamanho de verdade
const COMP_ONIBUS = (mod) => (mod === 'onibus_articulado' ? 18.6 : mod === 'onibus_executivo2' || mod === 'onibus_dois_andares' ? 14 : 12);
const passoFila = (L) => (L.passoFila ??= Math.max(...L.modelos.map(COMP_ONIBUS)) + 2);
function modeloSaida(L, m) { const lista = L.modelos.filter((x) => x === 'onibus' || modelos[x]); return lista.length ? lista[(((m % L.k) + L.k) % L.k) % lista.length] : 'onibus'; }
function corpoOnibus(cor, modelo = 'onibus') { return civico.modeloCarro(modelo, cor); }
function abrigo(x, z, ang, nome, cor) {
  const telhado = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.5 }), poste = new THREE.MeshStandardMaterial({ color: '#555b63', roughness: 0.6, metalness: 0.4 });
  const vidro = new THREE.MeshStandardMaterial({ color: '#9fc3e6', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35 });
  const g = new THREE.Group();
  const caixa = (w, h, d, m, px, py, pz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); o.castShadow = true; g.add(o); };
  caixa(3.2, 0.1, 1.5, telhado, 0, 2.5, 0); caixa(3.2, 2.2, 0.05, vidro, 0, 1.35, -0.7);
  for (const sx of [-1.5, 1.5]) caixa(0.08, 2.5, 0.08, poste, sx, 1.25, -0.65);
  caixa(2.6, 0.08, 0.45, poste, 0, 0.5, -0.45);
  const r = rotuloSimples(`🚏 ${nome}`, 3.4); r.position.set(0, 3.15, 0); g.add(r);
  g.position.set(x, alturaChao(x, z), z); g.rotation.y = ang; scene.add(g);
  mundo.addCol({ tipo: 'circ', x, z, r: 0.6 });
}
// pontos e lixeiras que caíram numa esquina (o abrigo ficaria na rua que cruza): anda até a calçada mais perto
// (no máximo 30 m pelo mesmo trajeto). Precisa das ruas do mapa prontas; roda uma vez.
let mapaAjustado = false;
function sForaDaRua(cam, s0, lado = 4.6) {
  for (let k = 0; k <= 60; k++) {
    const s = s0 + (k % 2 ? -1 : 1) * Math.ceil(k / 2); if (s < 3 || s > cam.L - 3) continue;
    // a rua que cruza (perpendicular a quem passa), com folga de 2 m: o abrigo não pode encostar nela
    const ok = [-3, 0, 3].every((d) => { const q = pontoCaminho(cam, s + d), x = q.x - Math.cos(q.ang) * lado, z = q.z + Math.sin(q.ang) * lado; return !mundo.naRua(x, z, 0.4) && !mundo.naRua(x, z, 3, Math.abs(Math.cos(q.ang)) < 0.7); });
    if (ok) return s;
  }
  return s0;
}
function ajustarAoMapa() {
  if (mapaAjustado || !mundo.listaRuas().length) return; mapaAjustado = true;
  for (const L of LINHAS) { for (const p of L.pontos) p.s = sForaDaRua(L, p.s); L.pontos.sort((a, b) => a.s - b.s); tabelaLinha(L); }
  for (const S of SETORES) {
    for (const l of S.lix) { l.s = sForaDaRua(S.cam, l.s); const q = pontoCaminho(S.cam, l.s); l.x = q.x - Math.cos(q.ang) * 4.6; l.z = q.z + Math.sin(q.ang) * 4.6; l.ang = q.ang; }
    S.lix.sort((a, b) => a.s - b.s); tabelaSetor(S);
  }
}
function montarParadas() {
  ajustarAoMapa();
  if (paradasMontadas) return; paradasMontadas = true;
  for (const L of LINHAS) L.pontos.forEach((p, i) => {
    const q = pontoCaminho(L, p.s), rx = -Math.cos(q.ang), rz = Math.sin(q.ang);
    abrigo(q.x + rx * 4.6, q.z + rz * 4.6, q.ang - Math.PI / 2, `${p.nome} · ${L.curto}`, L.cor);
    esperas.push({ L, ponto: i, x: q.x + rx * 3.4, z: q.z + rz * 3.4, fx: Math.sin(q.ang), fz: Math.cos(q.ang), rx, rz, gente: [], ultima: -1 });
  });
  // plataformas da rodoviária (ilha à direita de cada faixa)
  for (const L of LINHAS.filter((x) => !x.circular && x.faixa !== undefined)) esperas.push({ L, baia: true, x: L.faixa - 3.1, z: RODO.baia + 1, fx: 0, fz: 1, rx: -1, rz: 0, gente: [], ultima: -1 });
  montarRodoviaria(); montarAutoescola(); montarRodovias();
}
// rodovias até Vila Serra (norte, pela rua x = -162) e Porto Sul (sul, pela rua x = 216): trechos [x0, z0, x1, z1]
const RODOVIAS = [[-162, -641, -162, -945], [-162, -945, -86, -945], [216, 641, 216, 945], [216, 945, 86, 945]];
// rodoviárias das cidades: cobertura na praça da estação, junto da calçada da primeira rua
const RODO_CIDADES = [{ nome: 'Rodoviária de Vila Serra', z: -935.5, lado: -1, x0: 52, x1: 86 }, { nome: 'Rodoviária de Porto Sul', z: 935.5, lado: 1, x0: 52, x1: 86 }];
function montarRodovias() {
  const asf = new THREE.MeshStandardMaterial({ color: '#3a3d43', roughness: 0.85 }), amarelo = new THREE.MeshBasicMaterial({ color: '#f2c230' }), branco = new THREE.MeshBasicMaterial({ color: '#eeeeee' });
  const plano = (x, z, w, d, m, y) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m); o.position.set(x, y, z); o.receiveShadow = true; scene.add(o); return o; };
  for (const [x0, z0, x1, z1] of RODOVIAS) {
    const vert = x0 === x1, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, L = Math.abs(vert ? z1 - z0 : x1 - x0);
    plano(cx, cz, vert ? 10 : L + 10, vert ? L + 10 : 10, asf, 0.015);
    for (const lado of [-1, 1]) plano(vert ? cx + lado * 4.6 : cx, vert ? cz : cz + lado * 4.6, vert ? 0.2 : L, vert ? L : 0.2, branco, 0.03);
    for (let k = 4; k < L - 2; k += 9) plano(vert ? cx : Math.min(x0, x1) + k, vert ? Math.min(z0, z1) + k : cz, vert ? 0.22 : 4, vert ? 4 : 0.22, amarelo, 0.031);
  }
  for (const [x, z, t] of [[-162, -650, '🛣️ Rodovia → Vila Serra'], [216, 650, '🛣️ Rodovia → Porto Sul'], [-162, -930, '🛣️ Rodovia → Metrópole'], [216, 930, '🛣️ Rodovia → Metrópole']]) { const r = rotuloSimples(t, 6); r.position.set(x + 7, 4.5, z); scene.add(r); }
  // rodoviárias das cidades
  const cob = new THREE.MeshStandardMaterial({ color: '#e9e4d8', roughness: 0.5 }), metal = new THREE.MeshStandardMaterial({ color: '#59606a', metalness: 0.5, roughness: 0.5 });
  for (const c of RODO_CIDADES) {
    const cx = (c.x0 + c.x1) / 2, w = c.x1 - c.x0;
    if (glbEm('rodo_cidade', cx, 0.12, c.z, w, 5.6, 7, c.lado < 0 ? Math.PI : 0)) { const r = rotuloSimples(`🚌 ${c.nome.toUpperCase()}`, 9); r.position.set(cx, 7.4, c.z); scene.add(r); continue; }
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 7), cob); t.position.set(cx, 4.4, c.z); t.castShadow = true; scene.add(t);
    for (let x = c.x0 + 2; x <= c.x1 - 2; x += 10) for (const dz of [-2.8, 2.8]) { const pc = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.3, 0.25), metal); pc.position.set(x, 2.25, c.z + dz); pc.castShadow = true; scene.add(pc); mundo.addCol({ tipo: 'circ', x, z: c.z + dz, r: 0.25 }); }
    for (let x = c.x0 + 6; x <= c.x1 - 6; x += 8) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.6), metal); b.position.set(x, 0.45, c.z - c.lado * 2); scene.add(b); }
    const r = rotuloSimples(`🚌 ${c.nome.toUpperCase()}`, 9); r.position.set(cx, 6.2, c.z); scene.add(r);
  }
}
// a Rodoviária: três faixas (uma por linha), ilhas de embarque cobertas, guichê do despacho e painéis com a próxima saída
function montarRodoviaria() {
  const R = RODO, y = 0.18;
  const mat = (cor, o = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, ...o });
  const asf = mat('#3b3f46'), ilha = mat('#cfc8ba'), cobertura = mat('#e9e4d8', { roughness: 0.5 }), metal = mat('#59606a', { metalness: 0.5, roughness: 0.5 }), branco = new THREE.MeshBasicMaterial({ color: '#f0f0f0' });
  const caixa = (x, yy, z, w, h, d, m, sombra = true) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, yy, z); o.castShadow = sombra; o.receiveShadow = true; scene.add(o); return o; };
  const plano = (x, z, w, d, m, yy) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m); o.position.set(x, yy, z); o.receiveShadow = true; scene.add(o); return o; };
  plano(R.x, R.z, R.x1 - R.x0, R.z1 - R.z0, asf, y + 0.012);
  for (const L of LINHAS.filter((x) => !x.circular)) {
    for (let z = R.z0 + 2; z < R.z1 - 1; z += 4) plano(L.faixa - 1.9, z, 0.15, 2, branco, y + 0.02);   // faixa da plataforma
    const p = plano(L.faixa, R.baia - 4, 3.6, 0.5, new THREE.MeshBasicMaterial({ color: L.cor }), y + 0.022); p.scale.set(1, 1, 1);
  }
  // ilhas (à direita de cada ônibus = lado oeste da faixa) com cobertura, bancos e colunas
  const ilhas = [[114.5, 3], [121.8, 3.4], [130.4, 3.4], [139, 3.4], [147.6, 3.4], [155.3, 3.4]];
  for (const [x, w] of ilhas) {
    caixa(x, y + 0.13, R.z, w, 0.26, R.z1 - R.z0 - 6, ilha, false);
    if (x === 155.3) continue;
    if (glbEm('rodo_cidade', x, y + 0.26, R.z - 2, 32, 4.4, w + 1.2, Math.PI / 2)) continue;   // cobertura 3D (abrigo com bancos)
    caixa(x, y + 4.1, R.z - 2, w + 1.4, 0.25, 32, cobertura);
    for (const dz of [-14, -2, 10]) { caixa(x, y + 2.1, R.z - 2 + dz, 0.25, 4, 0.25, metal); mundo.addCol({ tipo: 'circ', x, z: R.z - 2 + dz, r: 0.3 }); }
    for (const dz of [-8, 4]) caixa(x - 0.8, y + 0.7, R.z - 2 + dz, 0.5, 0.45, 3, metal);
  }
  // guichê do despacho (motoristas) no canto leste
  caixa(155.5, y + 1.6, -252, 3, 3.2, 8, mat('#2b5fa8', { roughness: 0.5 }));
  const g = rotuloSimples('🚌 Despacho dos motoristas', 4.6); g.position.set(R.guiche.x, 3.9, R.guiche.z); scene.add(g);
  mundo.addCol({ tipo: 'caixa', x0: 154, x1: 157, z0: -256, z1: -248 });
  const nome = rotuloSimples('🚌 RODOVIÁRIA', 9); nome.position.set(R.x, 8, R.z1 + 1); scene.add(nome);
  const fs = rotuloSimples('🧾 Fiscalização', 3.6); fs.position.set(PONTO_FISCAL.x + 2, 3.2, PONTO_FISCAL.z); scene.add(fs);
  // painéis com a próxima saída (atualizados a cada segundo)
  placasRodo = LINHAS.filter((x) => !x.circular).map((L) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false })); s.scale.set(5, 5 * 160 / 512, 1); s.position.set(L.faixa, 5.4, R.baia + 4); scene.add(s);
    return { L, c, t, txt: '' };
  });
}
function atualizarPlacasRodo(t) {
  for (const p of placasRodo) {
    const m = proximaSaidaLinha(p.L, t), falta = Math.max(0, Math.round(horaSaida(p.L, m) - t));
    const at = estadoSaida(p.L, m - 1, t)?.atrasado || 0;
    const txt = `${p.L.curto}|${falta}|${at}`; if (txt === p.txt) continue; p.txt = txt;
    const g = p.c.getContext('2d'); g.clearRect(0, 0, 512, 160);
    g.fillStyle = 'rgba(18,22,30,.92)'; g.beginPath(); g.roundRect(4, 4, 504, 152, 22); g.fill();
    g.fillStyle = p.L.cor; g.beginPath(); g.roundRect(4, 4, 504, 52, [22, 22, 0, 0]); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 38px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.L.nome, 256, 31);
    g.font = 'bold 50px system-ui'; g.fillStyle = at ? '#ff5a4a' : '#ffd23e'; g.fillText(at ? `ATRASADO ${at} s` : falta > 0 ? `sai em ${falta} s` : 'saindo!', 256, 108);
    p.t.needsUpdate = true;
  }
}
// coloca um modelo 3D normalizado (caixa 1 x 1 x 1, frente em +Z) esticado para (sx, sy, sz) e girado; null se não carregou
function glbEm(nome, x, y, z, sx, sy, sz, rot = 0) {
  const base = modelos[nome]; if (!base) return null;
  const o = base.clone(true); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.y = rot;
  o.traverse((k) => { if (k.isMesh) { k.castShadow = true; k.receiveShadow = true; } }); scene.add(o); return o;
}
function rotuloSimples(texto, larg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = 'rgba(20,40,80,.85)'; x.beginPath(); x.roundRect(4, 8, 504, 80, 30); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 40px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(texto, 256, 50, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false })); s.scale.set(larg, larg * 96 / 512, 1); return s;
}
let tempoPlacas = 0;
// o menor atraso (st.atraso) que deixa pos(atraso) <= alvo, por busca binária; null se já está
function atrasoAte(st, pos, alvo) {
  const ok = (a) => { const v = pos(a); return v === null || v <= alvo; };
  if (ok(st.atraso)) return null;
  let lo = st.atraso, hi = st.atraso + 1;
  while (!ok(hi) && hi - st.atraso < 600) { lo = hi; hi = st.atraso + (hi - st.atraso) * 2; }
  for (let i = 0; i < 18; i++) { const md = (lo + hi) / 2; if (ok(md)) hi = md; else lo = md; }
  return hi;
}
// arrancada dos veículos do sistema: andam no máximo o que a aceleração do modelo deixa. O que faltou vira atraso,
// como esperar no trânsito, e o horário é recuperado depois. s: onde o horário manda estar; devolve onde pode estar.
function arrancar(st, s, dt, modelo, vmax) {
  const s0 = st.gS;
  if (s0 === undefined || s < s0 - 0.05 || s - s0 > 40 || dt <= 0) { st.gV = s0 === undefined ? vmax : 0; st.gS = s; return s; }   // começo, volta do laço ou pulo
  const v = (st.gV || 0) + civico.aceleracao(modelo, st.gV || 0, vmax) * dt, lim = s0 + v * dt;
  const r = Math.min(s, lim);
  st.gV = Math.max(0, (r - s0) / dt); st.gS = r;
  return r;
}
// o menor atraso que deixa o ônibus em s <= alvo (busca binária): ele chega exatamente no limite e espera ali.
// Somar meio segundo de cada vez passava do ponto e o ônibus ficava indo para trás e para frente.
function segurarAte(L, m, t, st, alvo) {
  const ok = (a) => { const e2 = estadoSaida(L, m, t - a); return !e2 || !e2.rota || e2.s <= alvo; };
  if (ok(st.atraso)) return null;
  let lo = st.atraso, hi = st.atraso + 1;
  while (!ok(hi) && hi - st.atraso < 600) { lo = hi; hi = st.atraso + (hi - st.atraso) * 2; }
  for (let i = 0; i < 18; i++) { const md = (lo + hi) / 2; if (ok(md)) hi = md; else lo = md; }
  const e2 = estadoSaida(L, m, t - hi); if (!e2 || !e2.rota) return null;
  st.atraso = hi; return e2;
}
function atualizarOnibus(dt) {
  montarParadas();
  saidasOcupadas.clear(); for (const r of remotos.values()) if (r.meta?.on) saidasOcupadas.add(String(r.meta.on));
  const t = agoraServidor() / 1000;
  if ((tempoPlacas -= dt) <= 0) { tempoPlacas = 1; atualizarPlacasRodo(t); }
  const usados = new Map(), porLinha = new Map(), feitos = new Set();
  juncaoAntes.length = 0; for (const k2 of juncaoAgora) juncaoAntes.push(k2); juncaoAgora.length = 0;
  // pontos ocupados: quem já estava parado no quadro anterior continua dono (os outros esperam atrás)
  pontosOcupados.length = 0; for (const o of pontosAntes) pontosOcupados.push(o);
  for (const b of onibusNpc) b.ativo = false;
  for (const L of LINHAS) {
    const m0 = Math.floor((t - L.fase) / L.H);
    for (let m = m0 - L.k - 1; m <= m0 + L.k + 1; m++) {
      const chB = `${L.id}.${((m % L.k) + L.k) % L.k}`, st = estadoBus.get(chB) || { atraso: 0 };
      if (feitos.has(chB)) continue;   // um ônibus físico só aparece numa volta por quadro
      let e = estadoSaida(L, m, t - st.atraso); if (!e) continue;
      feitos.add(chB);
      estadoBus.set(chB, st);
      // ponto ocupado (linhas que dividem o mesmo ponto): quem chegou depois espera atrás, sem parar em cima do outro
      if (e.rota) {
        // o ponto em que está parado ou o próximo (a menos de 14 m)
        const pi = e.ponto ?? L.pontos.findIndex((p) => p.s >= e.s - 0.5 && p.s - e.s < 14);
        if (pi >= 0) {
          const sp = L.pontos[pi].s, q0 = pontoCaminho(L, sp);
          const outro = pontosOcupados.find((o) => o.dono !== chB && Math.hypot(o.x - q0.x, o.z - q0.z) < 10);
          if (outro) {   // ocupado: fica 13 m antes do ponto, esperando
            const recuo = COMP_ONIBUS(modeloSaida(L, m)) / 2 + 10.3;   // atrás de quem está no ponto (cabe até um articulado)
            e = segurarAte(L, m, t, st, sp - recuo) || e;   // exatamente no limite: sem ir e voltar
          } else if (e.parado) pontosOcupados.push({ x: q0.x, z: q0.z, dono: chB });
        }
      }
      // circulares: as três linhas se encontram na esquina da rodoviária (vindas de lados opostos); entra um por vez
      if (L.circular) {
        const naJ = (q) => q.s > L.L - 24 || q.s < 16;
        if (naJ(e)) {
          const outro = [...juncaoAntes, ...juncaoAgora].some((k2) => k2 !== chB) && !juncaoAntes.includes(chB);
          if (outro) {   // espera antes da esquina (no fim da volta anterior)
            if (e.s > L.L - 24) e = segurarAte(L, m, t, st, L.L - 24.05) || e;   // para na beira da esquina, sem ir e voltar
            else {
              let mm = m;
              for (let i = 0; i < 120 && e && naJ(e); i++) { st.atraso += 0.5; e = estadoSaida(L, mm, t - st.atraso); if (!e && mm === m) { mm = m - L.k; e = estadoSaida(L, mm, t - st.atraso); } }
              if (!e) continue;
            }
          } else juncaoAgora.push(chB);
        }
      }
      // plataforma: só entra quem achar a baia livre; na fila, um atrás do outro (14 m cada), na ordem de chegada
      if (!L.circular) {
        const pl = porLinha.get(L) || { fila: 0, baia: false }; porLinha.set(L, pl);
        if (e.rota && e.s < 14) pl.baia = true;
        // chegando: para atrás do último da fila (a fila do quadro anterior), sem encostar nele
        if (e.rota && e.s > L.sFila - 60) {
          let nq = 0; for (const [k2, s2] of estadoBus) if (k2 !== chB && k2.startsWith(L.id + '.') && s2.filaAtiva) nq++;
          const lim = L.sFila - passoFila(L) * nq;
          if (e.s > lim) { st.atraso += dt; e = { ...e, s: Math.max(lim, 0), parado: true, chegando: true }; }
        }
        if (e.baia) { if (pl.baia) { e = { s: L.sFila, fila: true, parado: true }; st.atraso += dt; } else pl.baia = true; }   // segura na fila (o horário dele espera)
        if (e.fila) {
          st.filaDesde ??= t; let idx = 0;
          for (const [k2, s2] of estadoBus) if (k2 !== chB && k2.startsWith(L.id + '.') && s2.filaDesde !== undefined && s2.filaAtiva && (s2.filaDesde < st.filaDesde || (s2.filaDesde === st.filaDesde && k2 < chB))) idx++;
          e = { ...e, s: L.sFila - passoFila(L) * idx }; st.filaAtiva = true; pl.fila++;
        } else { st.filaDesde = undefined; st.filaAtiva = false; }
      }
      // fila e plataforma: anda até a posição nova devagar (sem pular de lugar)
      if (e.fila || e.baia) {   // arranca devagar, anda no máximo 5 m/s e freia chegando na vaga
        if (st.sVis === undefined) { st.sVis = e.s; st.vVis = 0; }
        else { const d = e.s - st.sVis, vm = Math.min(5, Math.sqrt(2 * 1.5 * Math.abs(d))), v = Math.min(vm, (st.vVis || 0) + 1.2 * dt), passo = Math.min(Math.abs(d), v * dt); st.sVis += Math.sign(d) * passo; st.vVis = dt > 0 ? passo / dt : 0; }
        e.s = st.sVis;
      } else { st.sVis = e.s; st.vVis = 0; }
      if (saidasOcupadas.has(`${L.id}.${m}`) || saidasSequestradas.has(`${L.id}.${m}`) || (minhaVolta && minhaVolta.L === L && minhaVolta.m === m)) continue;
      let q = pontoCaminho(L, e.s);
      // arrancada: depois de esperar (ponto, sinal, trânsito) ele sai devagar e vai ganhando velocidade
      if (e.rota && !e.fila && !e.baia && !e.chegando && st.mAnt === m && st.sAnt !== undefined && e.s > st.sAnt && e.s - st.sAnt < 40) {
        const v0 = st.gV || 0, lim = st.sAnt + (v0 + civico.aceleracao(modeloSaida(L, m), v0, 15) * dt) * dt;
        if (e.s > lim + 0.005) { e = segurarAte(L, m, t, st, lim) || e; q = pontoCaminho(L, e.s); }
      }
      // saindo da rodoviária: espera a rua ficar livre antes de pôr o bico para fora (quem vem pela rua tem a vez)
      if (!L.circular && e.rota && !e.fila && !e.baia && e.s < 9) {
        const sa = st.mAnt === m ? st.sAnt : undefined, X = pontoCaminho(L, 9);
        const vem = onibusNpc.some((o) => o.vivo && o.chB !== chB && Math.hypot(o.x - X.x, o.z - X.z) < 25 && o.e?.rota && !o.e.parado && (o.L.circular || (o.e.s >= 12 && o.e.s < o.L.sFila - 60)));   // só quem está andando na rua (não quem está na plataforma ou na fila)
        // só segura quem ainda não pôs o bico na rua; quem já saiu termina de sair (a rua espera por ele)
        if (vem && (sa === undefined || sa < 2)) { const alvo = sa !== undefined ? Math.max(0.3, sa) : 0.3; if (e.s > alvo) { e = segurarAte(L, m, t, st, alvo) || e; q = pontoCaminho(L, e.s); } }
      }
      // nunca dentro de outro ônibus no mesmo sentido (fila de linhas diferentes, saída de ponto, volta do horário):
      // se ia encostar em quem está na frente, fica onde estava no quadro anterior (sem pular para trás) e o horário espera
      const sAnt = st.mAnt === m ? st.sAnt : undefined;
      if (e.rota && !e.fila && !e.baia && sAnt !== undefined && e.s > sAnt) {
        const cp = COMP_ONIBUS(modeloSaida(L, m));
        const encosta = (qq) => { const fx = Math.sin(qq.ang), fz = Math.cos(qq.ang); return onibusNpc.some((o) => {
          if (!o.vivo || o.chB === chB || Math.cos(o.ang - qq.ang) < 0.5) return false;
          const dx = o.x - qq.x, dz = o.z - qq.z, d = dx * fx + dz * fz;
          return Math.abs(dx * fz - dz * fx) < 2.2 && d < (cp + o.comp) / 2 + 1.5 && (d > 0.3 || (d > -0.3 && o.chB < chB));
        }); };
        if (encosta(q) && !encosta(pontoCaminho(L, sAnt))) {
          if (e.chegando) e = { ...e, s: sAnt };
          else {   // procura o atraso que deixa o ônibus no mesmo lugar do quadro anterior
            let lo = st.atraso, hi = st.atraso + 8;
            for (let i = 0; i < 14; i++) { const md = (lo + hi) / 2, e2 = estadoSaida(L, m, t - md); if (e2 && e2.rota && e2.s > sAnt + 0.02) lo = md; else hi = md; }
            const e2 = estadoSaida(L, m, t - hi); if (e2 && e2.rota) { st.atraso = hi; e = e2; }
          }
          q = pontoCaminho(L, e.s);
        }
      }
      st.gV = st.mAnt === m && st.sAnt !== undefined && e.s >= st.sAnt && e.s - st.sAnt < 40 && dt > 0 ? (e.s - st.sAnt) / dt : st.mAnt === m ? 0 : 12;
      st.sAnt = e.s; st.mAnt = m;
      // rua fechada por veículo em chamas: quem entra no trecho depois do bloqueio contorna pela quadra ao lado
      { const dv = L.desvios?.find((d) => e.rota && e.s > d.s1 && e.s < d.s2);
        if (dv) {
          if (st.desvio !== dv.id && (st.mAnt !== m || st.sAnt === undefined || st.sAnt <= dv.s1 + 1 || st.desvioAntes)) st.desvio = dv.id;
          if (st.desvio === dv.id) {
            const pd = servicos.pontoNaRota(dv.rota, (e.s - dv.s1) / (dv.s2 - dv.s1) * dv.rota.total); q = { x: pd.x, z: pd.z, ang: pd.ang };
            st.atraso += dt * Math.max(0, 1 - (dv.s2 - dv.s1) / dv.rota.total);   // a volta é mais longa: o horário espera, na velocidade de sempre
          }
        } else st.desvio = null;
        st.desvioAntes = !!dv && st.desvio === dv?.id; }
      const longe = Math.abs(q.x - jogador.pos.x) + Math.abs(q.z - jogador.pos.z) > 320 && !(jogador.onibus && jogador.onibus.L === L && jogador.onibus.m === m);
      const mod = modeloSaida(L, m), chave = `${L.id}|${mod}`, i = usados.get(chave) || 0; usados.set(chave, i + 1);
      const doTipo = onibusNpc.filter((x) => x.chave === chave);   // reaproveita os ônibus da mesma linha e modelo
      // longe da câmera o ônibus é só um marcador vazio (não monta o modelo): monta de verdade quando chega perto
      let b = doTipo[i]; if (!b) { b = { mesh: longe ? new THREE.Group() : corpoOnibus(L.cor, mod), leve: longe, L, mod, chave, comp: COMP_ONIBUS(mod) }; scene.add(b.mesh); onibusNpc.push(b); }
      else if (b.leve && !longe) { scene.remove(b.mesh); b.mesh = corpoOnibus(L.cor, mod); b.leve = false; scene.add(b.mesh); }
      b.m = m; b.x = q.x; b.z = q.z; b.ang = q.ang; b.parado = e.parado; b.ativo = true; b.e = e; b.chB = chB; b.desviando = !!st.desvio;
      b.mesh.position.set(q.x, alturaChao(q.x, q.z), q.z); b.mesh.rotation.y = q.ang; b.mesh.visible = !jogador.dentroCasa && !longe;   // longe: não desenha, mas continua respeitando os outros
      // respeita quem está na frente: com um veículo parado à frente, espera (o horário dele atrasa um pouco)
      if (!e.parado && !e.fila) {
        // chegando na rodoviária: os ônibus da própria linha na fila e na plataforma estão no lugar deles (a fila já cuida)
        // ônibus lado a lado (chegaram juntos num trecho em comum): só um espera, senão os dois travariam
        const fx = Math.sin(b.ang), fz = Math.cos(b.ang);
        const term = !L.circular && e.s > L.sFila - 60;
        st.ignorar = new Set([b.mesh, ...onibusNpc.filter((x) => x.vivo && x !== b && ((term && x.L === L && (x.e?.fila || x.e?.baia)) || (x.chB > chB && Math.hypot(x.x - b.x, x.z - b.z) < 9 && Math.abs((x.x - b.x) * fx + (x.z - b.z) * fz) < 1.5))).map((x) => x.mesh)]);
        frearAtras(st, b.mesh, dt, b.comp / 2 + 7, b.x, b.z, b.ang, 70);
      }
    }
  }
  for (const b of onibusNpc) { if (!b.ativo) b.mesh.visible = false; b.vivo = b.ativo; }   // corpos para o próximo quadro
  corposT = 0;
  pontosAntes.length = 0; for (const b of onibusNpc) if (b.ativo && b.e?.rota && b.e.parado) pontosAntes.push({ x: b.x, z: b.z, dono: b.chB });   // libera quem saiu
  if (minhaVolta) atualizarMinhaVolta(dt, t);
  animarRota(dt);
  atualizarFiscal(dt, t);
  // motor: o seu (dirigindo ou de passageiro) ou o do sistema que passa perto
  // (o ônibus que você dirige toca em somMotores)
  if (jogador.onibus) { const b = onibusNpc.find((x) => x.ativo && x.L === jogador.onibus.L && x.m === jogador.onibus.m); sons.continuo(b?.parado ? 'onibus_lenta' : 'onibus_alto', 0.45); }
  for (const b of onibusNpc) {
    if (!b.ativo) continue;
    const d = Math.hypot(b.x - jogador.pos.x, b.z - jogador.pos.z);
    if (b.parado) sons.continuo('onibus_lenta', 0.4 * sons.perto(d, 30)); else sons.continuo('onibus_alto', 0.55 * sons.perto(d, 55));
    if (b.parado !== b.paradoAntes) { if (b.paradoAntes && d < 50) sons.tocar('onibus_ronco', { vol: 0.55, dist: d, raio: 50 }); b.paradoAntes = b.parado; }   // arrancada ao sair do ponto
  }
}
// ônibus do sistema empurram quem está no caminho (três círculos ao longo do comprimento)
function colidirOnibus(p, raio) {
  for (const b of onibusNpc) {
    if (!b.ativo || !b.mesh.visible) continue;
    if (jogador.onibus && b.L === jogador.onibus.L && b.m === jogador.onibus.m) continue;
    const fx = Math.sin(b.ang), fz = Math.cos(b.ang);
    for (const o of [-3.6, 0, 3.6]) {
      const cx = b.x + fx * o, cz = b.z + fz * o, dx = p.x - cx, dz = p.z - cz, r = raio + 1.5, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
    }
  }
}
// ---- passageiro: embarca num ônibus parado (ponto ou plataforma) e desce no ponto que quiser
function onibusParadoPerto() {
  let melhor = null, dm = 7.5;
  for (const b of onibusNpc) {
    if (!b.ativo || !b.parado || b.e?.fila) continue;
    const d = Math.hypot(b.x - jogador.pos.x, b.z - jogador.pos.z); if (d < dm) { dm = d; melhor = b; }
  }
  return melhor;
}
function proximoPontoNome(L, e) {
  const s = !e || e.baia || e.fila ? 0 : e.s, p = L.pontos.find((x) => x.s > s + 1);
  return p ? p.nome : 'Rodoviária';
}
async function embarcarOnibus(b) {
  try { await rede.transporte.tarifa(); } catch (e) { aviso(e.message || 'Sem moedas para a passagem (5).', 3); return; }
  jogador.onibus = { L: b.L, m: b.m, descer: false };
  if (jogador.armado) alternarArma();
  jogador.alvo = null; jogador.avatar.raiz.visible = false;
  aviso(`🚌 ${b.L.nome} · −5 moedas. Toque em Descer para saltar no próximo ponto.`, 4);
}
function seguirOnibus() {
  // segue o ônibus de verdade (com o atraso dele: fila, ponto ocupado, sinal, trânsito), não o horário puro;
  // senão o passageiro ia na frente sozinho e o ônibus ficava para trás ("invisível")
  const o = jogador.onibus, t = agoraServidor() / 1000;
  const b = onibusNpc.find((x) => x.ativo && x.L === o.L && x.m === o.m);
  const atrasoB = estadoBus.get(`${o.L.id}.${((o.m % o.L.k) + o.L.k) % o.L.k}`)?.atraso || 0;
  const e = b?.e || estadoSaida(o.L, o.m, t - atrasoB);
  const tomada = saidasOcupadas.has(`${o.L.id}.${o.m}`) || saidasSequestradas.has(`${o.L.id}.${o.m}`);
  if (!e || tomada || e.fila) { descerOnibus(e ? e.s : o.L.sFila, tomada ? (saidasSequestradas.has(`${o.L.id}.${o.m}`) ? "🔫 O ônibus foi sequestrado! Você desceu." : "🚌 Troca de motorista: desça aqui.") : '🚌 Rodoviária! Fim da linha.'); return; }
  const q = b ? { x: b.x, z: b.z, ang: b.ang } : pontoCaminho(o.L, e.s);
  jogador.pos.set(q.x, alturaChao(q.x, q.z), q.z); jogador.yaw = q.ang; jogador.avatar.raiz.position.copy(jogador.pos);
  o.e = e;
  if (e.ponto !== undefined && o.descer && (o.L.tab[e.ponto].sai - (t - atrasoB - horaSaida(o.L, o.m))) > 0.5) descerOnibus(e.s, `🚏 ${o.L.pontos[e.ponto].nome}`);
}
function descerOnibus(s, msg) {
  const o = jogador.onibus; if (!o) return; jogador.onibus = null;
  const q = pontoCaminho(o.L, s), rx = -Math.cos(q.ang), rz = Math.sin(q.ang);
  jogador.pos.set(q.x + rx * 3.2, 0, q.z + rz * 3.2); resolverColisao(jogador.pos, jogador.raio); jogador.pos.y = alturaChao(jogador.pos.x, jogador.pos.z);
  jogador.avatar.raiz.position.copy(jogador.pos); jogador.avatar.raiz.visible = true;
  if (msg) aviso(msg, 3);
}
function contextoNoOnibus() {
  const o = jogador.onibus, prox = proximoPontoNome(o.L, o.e);
  return o.descer ? [`vai descer em: ${prox} (toque para continuar)`, 'Ficar'] : [`no ${o.L.nome} · próximo ponto: ${prox}`, 'Descer'];
}
function acaoNoOnibus() { const o = jogador.onibus; o.descer = !o.descer; aviso(o.descer ? '🔔 Sinal dado: você desce no próximo ponto.' : 'Você continua no ônibus.', 2); }
// ---- motorista jogador
const ehMotorista = () => jogador.perfil?.profissao === 'motorista' || jogador.perfil?.cargo === 'admin';
const TERMINAL = RODO.guiche;
function pegarOnibus() {
  if (!ehMotorista()) { abrirServico('onibus'); return; }
  if (jogador.carro) { aviso('Desça do veículo primeiro.'); return; }
  const t = agoraServidor() / 1000;
  escolher('🚌 Despacho da Rodoviária', 'Escolha a linha. Você assume o ônibus que está na plataforma e sai no horário dele.', LINHAS.map((L) => {
    const m = proximaSaidaLinha(L, t + 4);
    return { rotulo: `${L.nome} · sai em ${Math.round(horaSaida(L, m) - t)} s`, fn: () => assumirSaida(L) };
  }).concat([{ rotulo: '📋 Ver o meu serviço', fn: () => abrirServico('onibus') }]));
}
function assumirSaida(L) {
  const t = agoraServidor() / 1000, m = proximaSaidaLinha(L, t + 4), q = pontoCaminho(L, 0), mod = modeloSaida(L, m);
  const mesh = corpoOnibus(L.cor, mod); mesh.position.set(q.x, alturaChao(q.x, q.z), q.z); mesh.rotation.y = q.ang; scene.add(mesh);
  if (jogador.armado) alternarArma();
  modoVolante(true);
  jogador.carro = { id: 'o' + jogador.perfil.id.slice(0, 8), servico: 'onibus', modelo: mod, cor: L.cor, vel: 0, mesh, salvar: 1e9, max: 12, raio: 1.9, alt: 0 };
  jogador.pos.set(q.x, alturaChao(q.x, q.z), q.z); jogador.yaw = q.ang; jogador.alvo = null; jogador.avatar.raiz.visible = false;
  minhaVolta = { L, m, mesh, prox: 0, passageiros: 0, atrasoMax: 0, parado: 0, saiu: false, saida: horaSaida(L, m) };
  conexao?.rastrear(metaPresenca());
  guiarProxima();
  aviso(`🚌 ${L.nome}: sai em ${Math.round(minhaVolta.saida - t)} s. Espere o horário e siga os pontos (🚏).`, 5);
}
function pontoMinhaVolta(v) {
  if (v.prox >= v.L.pontos.length) { const q = pontoCaminho(v.L, v.L.sFila); return { ...q, nome: 'Rodoviária (fila da plataforma)', fim: true }; }
  const p = v.L.pontos[v.prox]; return { ...pontoCaminho(v.L, p.s), nome: p.nome };
}
function guiarProxima() { const v = minhaVolta; if (!v) return; const q = pontoMinhaVolta(v); rastrear({ nome: `🚏 ${q.fim ? 'Fim: ' : ''}${q.nome}`, x: q.x, z: q.z }); }
// ---- linha amarela no chão: mostra ao motorista (e na prova da autoescola) por onde ir até o próximo ponto
let rotaMesh = null, rotaTex = null, tempoRota = 0;
function texturaRota() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,210,62,.55)'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#fff3b0'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(12, 46); g.lineTo(32, 18); g.lineTo(52, 46); g.stroke();   // seta apontando para frente
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function desenharRota(pts, larg = 0.55) {
  if (pts.length < 2) { esconderRota(); return; }
  if (!rotaTex) rotaTex = texturaRota();
  const pos = [], uv = [], idx = []; let acum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1, nx = -dz / d * larg, nz = dx / d * larg;
    if (i) acum += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const y = pts[i][2] !== undefined ? pts[i][2] : alturaChao(pts[i][0], pts[i][1]) + 0.1;   // terceiro valor: altura no ar (rota do avião)
    pos.push(pts[i][0] + nx, y, pts[i][1] + nz, pts[i][0] - nx, y, pts[i][1] - nz); uv.push(0, acum / 1.6, 1, acum / 1.6);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  if (!rotaMesh) { rotaMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: rotaTex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); rotaMesh.renderOrder = 4; rotaMesh.frustumCulled = false; scene.add(rotaMesh); }
  else { rotaMesh.geometry.dispose(); rotaMesh.geometry = geo; }
  rotaMesh.visible = true;
}
function esconderRota() { if (rotaMesh) rotaMesh.visible = false; }
function animarRota(dt) { if (rotaTex && rotaMesh?.visible) rotaTex.offset.y -= dt * 1.4; }
// trecho do caminho da linha entre onde o motorista está e o próximo ponto
function rotaDaVolta(v) {
  const L = v.L; let melhor = v.s ?? 0, dm = Infinity;
  for (let s = Math.max(0, (v.s ?? 0) - 25); s <= Math.min(L.L, (v.s ?? 0) + 90); s += 1) { const q = pontoCaminho(L, s), d = Math.hypot(q.x - jogador.pos.x, q.z - jogador.pos.z); if (d < dm) { dm = d; melhor = s; } }
  if (dm > 25) {   // saiu muito do caminho: procura na linha toda
    for (let s = 0; s <= L.L; s += 2) { const q = pontoCaminho(L, s), d = Math.hypot(q.x - jogador.pos.x, q.z - jogador.pos.z); if (d < dm) { dm = d; melhor = s; } }
  }
  v.s = melhor;
  const alvo = v.alvoS ?? (v.prox < L.pontos.length ? L.pontos[v.prox].s : L.sFila), pts = [];   // só pela faixa da direita (sem cortar calçada)
  for (let s = Math.min(alvo, v.s + 2); s < alvo && s < v.s + 450; s += 2) { const q = pontoCaminho(L, s); pts.push([q.x, q.z]); }
  const f = pontoCaminho(L, Math.min(alvo, v.s + 450)); pts.push([f.x, f.z]);
  return pts;
}
function atualizarMinhaVolta(dt, t) {
  const v = minhaVolta;
  if ((tempoRota -= dt) <= 0) { tempoRota = 0.25; desenharRota(rotaDaVolta(v)); }
  if (!jogador.carro || jogador.carro.mesh !== v.mesh) { encerrarVolta('Você largou o ônibus: a volta foi cancelada.'); return; }
  const e = t - v.saida;
  if (!v.saiu) {   // na plataforma, antes do horário
    if (e < -2 && Math.abs(jogador.carro.vel) > 1) { jogador.carro.vel = 0; aviso(`⏱️ Ainda não: saída em ${Math.ceil(-e)} s.`, 1); }
    if (e >= 0) { v.saiu = true; aviso('🚌 Horário! Pode sair.', 2); }
    return;
  }
  const q = pontoMinhaVolta(v), fim = !!q.fim;
  const chegaPrevisto = fim ? v.L.R : v.L.tab[v.prox].chega, saiPrevisto = fim ? v.L.R : v.L.tab[v.prox].sai;
  const perto = Math.hypot(q.x - jogador.pos.x, q.z - jogador.pos.z) < (fim ? 12 : 9);
  if (!perto || Math.abs(jogador.carro.vel) > 0.8) { v.parado = 0; return; }
  v.parado += dt;
  if (v.parado < 0.6) return;
  if (!v.chegou) {
    v.chegou = true; v.atrasoMax = Math.max(v.atrasoMax, e - chegaPrevisto);
    const sobe = fim ? 0 : 1 + (Math.abs(Math.sin(v.m * 12.9898 + v.prox * 78.233 + v.L.id * 3) * 43758.5453) % 1) * 4 | 0; v.passageiros += sobe;
    aviso(fim ? '🏁 Rodoviária! Fechando a volta…' : `🚏 ${q.nome}: ${sobe} passageiro(s) subindo. ${e < chegaPrevisto - 5 ? `Adiantado ${Math.round(chegaPrevisto - e)} s.` : e > chegaPrevisto + 15 ? `Atrasado ${Math.round(e - chegaPrevisto)} s.` : 'No horário!'}`, 3);
  }
  if (fim) { pagarVolta(); return; }
  if (v.parado < 3.5) return;                                      // tempo de embarque
  if (e < saiPrevisto - 2) { if (!v.avisoEspera) { v.avisoEspera = true; aviso(`⏱️ Adiantado: espere ${Math.ceil(saiPrevisto - e)} s para seguir (o ônibus de trás não pode encostar).`, 2.5); } return; }
  v.prox++; v.chegou = false; v.avisoEspera = false; v.parado = 0; guiarProxima();
  aviso(`🚌 Próximo ponto: ${pontoMinhaVolta(v).nome}`, 2);
}
async function pagarVolta() {
  const v = minhaVolta; if (!v || v.pagando) return; v.pagando = true;
  const pontual = v.atrasoMax < 25;
  try { const ganho = await rede.transporte.pagarOnibus(v.passageiros, pontual); aviso(`🏁 Volta completa! ${v.passageiros} passageiros${pontual ? ' · no horário (+150)' : ' · atrasou'} · +${ganho} moedas. Vá ao despacho para a próxima saída.`, 5); }
  catch (e) { aviso('Volta não paga: ' + (e.message || e), 4); }
  encerrarVolta();
}
function encerrarVolta(msg) {
  const v = minhaVolta; if (!v) return; minhaVolta = null;
  if (jogador.carro?.mesh === v.mesh) { const c = jogador.carro; jogador.carro = null; modoVolante(false); jogador.avatar.raiz.visible = true; const lx = Math.cos(jogador.yaw) * 2.4, lz = -Math.sin(jogador.yaw) * 2.4; jogador.pos.x += lx; jogador.pos.z += lz; resolverColisao(jogador.pos, jogador.raio); c.mesh = null; }
  scene.remove(v.mesh); rastrear(null); esconderRota(); conexao?.rastrear(metaPresenca());
  if (msg) aviso(msg, 3);
}
// ---- fiscal da rodoviária: registra os ônibus que não saíram no horário (do sistema e de motoristas jogadores)
const ehFiscal = () => jogador.perfil?.profissao === 'fiscal' || jogador.perfil?.cargo === 'admin';
const PONTO_FISCAL = { x: 155.5, z: -229 };
const atrasosRegistrados = new Set();
let fiscalNpc = null, avisoAtrasoT = 0, ultimoAtrasoAvisado = '';
const naRodoviaria = (x, z, m = 0) => x > RODO.x0 - m && x < RODO.x1 + m && z > RODO.z0 - m && z < RODO.z1 + m;
// ônibus atrasados agora: do sistema (na plataforma depois do horário) e de motoristas jogadores (parados na rodoviária)
function onibusAtrasados(t) {
  const r = [];
  for (const L of LINHAS) {
    if (L.circular) continue;
    const m = proximaSaidaLinha(L, t) - 1, e = estadoSaida(L, m, t);
    if (e?.atrasado > 0 && !saidasOcupadas.has(`${L.id}.${m}`)) { const q = pontoCaminho(L, e.s); r.push({ chave: `${L.id}.${m}`, L, m, x: q.x, z: q.z, seg: e.atrasado, nome: L.nome }); }
  }
  for (const [id, rm] of remotos) {
    const on = rm.meta?.on; if (!on || !rm.carro) continue;
    const [li, m] = String(on).split('.').map(Number), L = LINHA_ID[li]; if (!L) continue;
    const atraso = t - horaSaida(L, m), p = rm.carro.position;
    if (atraso > 8 && naRodoviaria(p.x, p.z, 4)) r.push({ chave: `${li}.${m}`, L, m, x: p.x, z: p.z, seg: Math.floor(atraso), nome: `${L.curto} · ${rm.meta.nome || 'motorista'}`, jogador: id });
  }
  return r;
}
function atrasoPerto(t) {
  let melhor = null, dm = 10;
  for (const a of onibusAtrasados(t)) { if (atrasosRegistrados.has(a.chave)) continue; const d = Math.hypot(a.x - jogador.pos.x, a.z - jogador.pos.z); if (d < dm) { dm = d; melhor = a; } }
  return melhor;
}
async function registrarAtraso(a) {
  atrasosRegistrados.add(a.chave);
  if (a.jogador) conexao?.enviar('fiscal', { para: a.jogador, on: a.chave, nome: jogador.perfil?.nome });
  try { const v = await rede.transporte.pagarFiscal(); aviso(`🧾 Atraso registrado: ${a.nome} (${a.seg} s). +${v} moedas.`, 3.5); }
  catch (e) { aviso(`🧾 Atraso registrado: ${a.nome}. ${e.message || ''}`, 3); }
}
function receberFiscal(m) {
  const v = minhaVolta; if (m.para !== jogador.perfil?.id || !v || `${v.L.id}.${v.m}` !== m.on) return;
  v.atrasoMax = Math.max(v.atrasoMax, 999); v.registrado = true;
  aviso(`🧾 O fiscal ${m.nome || ''} registrou o seu atraso: esta volta fica sem o bônus de horário.`, 4);
}
function quadroFiscal() {
  const t = agoraServidor() / 1000, at = onibusAtrasados(t);
  const linhas = LINHAS.map((L) => { const m = proximaSaidaLinha(L, t); return `${L.nome}: próxima saída em ${Math.round(horaSaida(L, m) - t)} s`; }).join(' · ');
  escolher('🧾 Quadro do fiscal', `${linhas}. ${at.length ? `Atrasados agora: ${at.map((a) => `${a.nome} (+${a.seg} s)`).join(', ')}. Vá até o ônibus na plataforma e registre.` : 'Nenhum ônibus atrasado agora.'} Cada atraso registrado vale 30.`,
    at.filter((a) => !atrasosRegistrados.has(a.chave)).map((a) => ({ rotulo: `📍 Ir até: ${a.nome}`, fn: () => rastrear({ nome: `🧾 ${a.nome}`, x: a.x, z: a.z }) })).concat([{ rotulo: '📋 Ver o meu serviço', fn: () => abrirServico('fiscal') }]));
}
// fiscal NPC: quando não há fiscal jogador na rodoviária, um NPC vai até o ônibus atrasado e anota
function atualizarFiscal(dt, t) {
  const fiscalJogador = (ehFiscal() && naRodoviaria(jogador.pos.x, jogador.pos.z, 25) && jogador.perfil?.profissao === 'fiscal') || [...remotos.values()].some((r) => r.meta?.fs);
  if (!fiscalNpc && !atualizarFiscal.criando && Math.abs(jogador.pos.x - RODO.x) + Math.abs(jogador.pos.z - RODO.z) < 300) {
    atualizarFiscal.criando = true;
    criarAvatar('personagens', PERSONAGENS[11 % PERSONAGENS.length].id).then((av) => {
      av.raiz.position.set(PONTO_FISCAL.x, 0.44, PONTO_FISCAL.z); scene.add(av.raiz);
      const et = textoSprite('🧾 Fiscal', { escala: 0.5, fundo: 'rgba(46,158,87,.95)' }); et.position.y = 2.2; av.raiz.add(et);
      fiscalNpc = { av, anim: '' };
    }).catch(() => {});
  }
  const at = onibusAtrasados(t);
  if (fiscalNpc) {
    const f = fiscalNpc, av = f.av; av.raiz.visible = !fiscalJogador && !jogador.dentroCasa;
    const alvo = at[0] ? (() => { const L = at[0].L; return { x: L.faixa - 4.3, z: RODO.baia + 2 }; })() : PONTO_FISCAL;
    const dx = alvo.x - av.raiz.position.x, dz = alvo.z - av.raiz.position.z, d = Math.hypot(dx, dz);
    const anim = d > 0.4 ? 'walk' : 'idle'; if (anim !== f.anim) { f.anim = anim; av.tocar(anim, { velocidade: 0.9 }); }
    if (d > 0.4) { const st = Math.min(d, 1.6 * dt); av.raiz.position.x += dx / d * st; av.raiz.position.z += dz / d * st; av.raiz.rotation.y = Math.atan2(dx, dz); }
    else if (at[0]) av.raiz.rotation.y = Math.atan2(at[0].x - av.raiz.position.x, at[0].z - av.raiz.position.z);
    av.raiz.position.y = alturaChao(av.raiz.position.x, av.raiz.position.z);
    av.mixer.update(dt);
  }
  // motorista jogador atrasado sem fiscal jogador por perto: o fiscal NPC registra
  const v = minhaVolta;
  if (v && !v.saiu && !v.registrado && t - v.saida > 20 && !fiscalJogador) { v.registrado = true; v.atrasoMax = 999; aviso('🧾 Fiscal (NPC): seu ônibus não saiu no horário. Atraso registrado, sem bônus nesta volta.', 4); }
  const fsAgora = jogador.perfil?.profissao === 'fiscal' && naRodoviaria(jogador.pos.x, jogador.pos.z, 25);
  if (fsAgora !== !!atualizarFiscal.fs) { atualizarFiscal.fs = fsAgora; conexao?.rastrear(metaPresenca()); }
  // aviso para o fiscal em serviço
  if (jogador.perfil?.profissao === 'fiscal' && (avisoAtrasoT -= dt) <= 0) {
    avisoAtrasoT = 1;
    const novo = at.find((a) => !atrasosRegistrados.has(a.chave) && a.chave !== ultimoAtrasoAvisado);
    if (novo && Math.hypot(RODO.x - jogador.pos.x, RODO.z - jogador.pos.z) < 200) { ultimoAtrasoAvisado = novo.chave; aviso(`⏰ ${novo.nome} não saiu no horário! Vá até a plataforma e registre.`, 3.5); }
  }
}
function contextoOnibus() {
  if (jogador.carro) return null;
  const b = onibusParadoPerto();
  if (ehFiscal() && jogador.perfil?.profissao === 'fiscal') { const a = atrasoPerto(agoraServidor() / 1000); if (a) return [`registrar atraso: ${a.nome} (+${a.seg} s) · +30`, 'Registrar']; }
  if (b) return [`embarcar: ${b.L.nome} → ${proximoPontoNome(b.L, b.e)} (5 moedas)`, 'Embarcar'];
  if (Math.hypot(TERMINAL.x - jogador.pos.x, TERMINAL.z - jogador.pos.z) < 3.5) return [ehMotorista() ? 'despacho: pegar o ônibus da próxima saída' : 'despacho da rodoviária (vagas para motorista)', 'Ônibus'];
  if (Math.hypot(PONTO_FISCAL.x - jogador.pos.x, PONTO_FISCAL.z - jogador.pos.z) < 3) return [ehFiscal() ? 'quadro do fiscal: horários e atrasos' : 'fiscalização da rodoviária (vagas para fiscal)', 'Fiscal'];
  return null;
}
function acaoOnibus() {
  if (jogador.perfil?.profissao === 'fiscal') { const a = atrasoPerto(agoraServidor() / 1000); if (a) { registrarAtraso(a); return true; } }
  const b = onibusParadoPerto(); if (b) { embarcarOnibus(b); return true; }
  if (Math.hypot(TERMINAL.x - jogador.pos.x, TERMINAL.z - jogador.pos.z) < 3.5) { pegarOnibus(); return true; }
  if (Math.hypot(PONTO_FISCAL.x - jogador.pos.x, PONTO_FISCAL.z - jogador.pos.z) < 3) { if (ehFiscal()) quadroFiscal(); else abrirServico('fiscal'); return true; }
  return false;
}
// corredores dos ônibus: sem carro estacionado no caminho; o quarteirão da rodoviária fica livre (era uma praça)
function prepararTransporte() {
  for (const L of LINHAS) mundo.semEstacionar(L.pts);
  for (const k of ['B', 'C', 'D']) mundo.semEstacionar(CATEGORIAS[k].rota.pts);
  for (const [x0, z0, x1, z1] of RODOVIAS) mundo.abrirTrilha([[x0, z0], [x1, z1]], 9);
  for (const c of RODO_CIDADES) mundo.abrirTrilha([[c.x0, c.z], [c.x1, c.z]], 4);
  mundo.limparArea(RODO.x0 - 1, RODO.z0 - 1, RODO.x1 + 1, RODO.z1 + 1);
  mundo.limparArea(CENTRAL.x0 - 1, CENTRAL.z0 - 1, CENTRAL.x1 + 1, CENTRAL.z1 + 1); for (const S of SETORES) mundo.semEstacionar(S.cam.pts);
  mundo.limparArea(AUTOESCOLA.x0 - 1, AUTOESCOLA.z0 - 1, AUTOESCOLA.x1 + 1, AUTOESCOLA.z1 + 1);
  { const D = mundo.AREA51.deserto; mundo.limparArea(D.x0, D.z0, D.x1, D.z1); }   // deserto da Área 51
  mundo.abrirTrilha([[216, 945], [760, 945], [760, 1000]], 7); mundo.abrirTrilha([[400, 945], [400, 975]], 7); mundo.limparArea(250, 938, 900, 1112);   // Base Aérea e a rua até ela
  mundo.limparArea(118, 1061, 126, 1069);   // guarita de alistamento (GUARITA_ALIST)
  mundo.limparArea(COMPRADOR.x - 9, COMPRADOR.z - 8, COMPRADOR.x + 9, COMPRADOR.z + 11);   // armazém do Seu Tonho: sem árvore na frente
  mundo.semEstacionar([[AUTOESCOLA.x0 - 12, AUTOESCOLA.saida.z], [AUTOESCOLA.x1 + 6, AUTOESCOLA.saida.z]]);
  for (const a of AEROPORTOS) {
    const c = a.cerca; mundo.limparArea(c.x0 - 6, c.z0 - 6, c.x1 + 6, c.z1 + 6);
    if (a.estrada) mundo.abrirTrilha(a.estrada, 6);
  }
}
// mapa: rodoviária, linhas e pontos (o mapa grande desenha as linhas por cima)
function desenharTransporteNoMapa(g) {
  g.fillStyle = '#3b3f46'; g.fillRect(RODO.x0, RODO.z0, RODO.x1 - RODO.x0, RODO.z1 - RODO.z0);
  for (const L of LINHAS) if (!L.circular) { g.fillStyle = L.cor; g.fillRect(L.faixa - 1.4, RODO.z0 + 6, 2.8, 30); }
  g.fillStyle = '#4a4e57'; for (const [x0, z0, x1, z1] of RODOVIAS) g.fillRect(Math.min(x0, x1) - 5, Math.min(z0, z1) - 5, Math.abs(x1 - x0) + 10, Math.abs(z1 - z0) + 10);
  for (const a of AEROPORTOS) desenharAeroNoMapa(g, a);
  g.fillStyle = '#5a5d61'; g.fillRect(CENTRAL.x0, CENTRAL.z0, CENTRAL.x1 - CENTRAL.x0, CENTRAL.z1 - CENTRAL.z0); g.fillStyle = '#7d8f63'; g.fillRect(331, -98, 14, 34);
  g.fillStyle = '#4a4e55'; g.fillRect(AUTOESCOLA.x0, AUTOESCOLA.z0, AUTOESCOLA.x1 - AUTOESCOLA.x0, AUTOESCOLA.z1 - AUTOESCOLA.z0); g.fillStyle = '#e8891c'; g.fillRect(AUTOESCOLA.x - 10, -44, 20, 10);
}
function desenharLinhasMapaGrande(g, tela, esc) {
  g.save(); g.lineWidth = Math.max(2, esc * 2.2); g.lineJoin = 'round'; g.globalAlpha = 0.8;
  for (const L of LINHAS) {
    g.strokeStyle = L.cor; g.beginPath();
    L.pts.forEach(([x, z], i) => { const [mx, mz] = tela(x, z); if (i) g.lineTo(mx, mz); else g.moveTo(mx, mz); }); g.stroke();
    g.fillStyle = '#fff';
    for (const p of L.pontos) { const q = pontoCaminho(L, p.s), [mx, mz] = tela(q.x, q.z); g.beginPath(); g.arc(mx, mz, 4, 0, 7); g.fill(); g.strokeStyle = L.cor; g.lineWidth = 2; g.stroke(); g.lineWidth = Math.max(2, esc * 2.2); g.strokeStyle = L.cor; }
  }
  g.restore();
}
// ================================================================= Autoescola: carteiras B (carro), C (caminhão), D (ônibus) e brevê (avião)
// Paga a aula no balcão e faz a prova prática: seguir os pontos (📍) pelas ruas dentro do tempo, sem bater 3 vezes;
// no ônibus ainda é preciso parar nos pontos marcados. O brevê é um voo: decolar no aeroporto e pousar numa pista.
// Quem vai trabalhar dirigindo precisa da carteira: médico B, bombeiro C, motorista de ônibus D, piloto brevê.
const AUTOESCOLA = { x: -297, z: -27, x0: -319, x1: -275, z0: -49, z1: -5, balcao: { x: -297, z: -27.5 }, atendente: { x: -297, z: -31.2 }, saida: { x: -300, z: 2.6, yaw: Math.PI / 2 } };
const CATEGORIAS = {
  B: { nome: 'Carteira B · carro', preco: 300, modelo: 'popular', cor: '#f2f2f2', rua: [[-300, 0], [-270, 0], [-270, -108], [-378, -108], [-378, 0], [-300, 0]], parar: [] },
  C: { nome: 'Carteira C · caminhão', preco: 600, modelo: 'caminhao_escola', cor: '#f2f2f2', precisa: 'B', rua: [[-300, 0], [-270, 0], [-270, -162], [-378, -162], [-378, 108], [-324, 108], [-324, 0], [-300, 0]], parar: [] },
  D: { nome: 'Carteira D · ônibus', preco: 900, modelo: 'onibus', cor: '#f2c230', precisa: 'C', rua: [[-300, 0], [-270, 0], [-270, -162], [-378, -162], [-378, 108], [-324, 108], [-324, 0], [-300, 0]], parar: [[-270, -81, 'n'], [-378, -54, 's']] },
  AV: { nome: 'Brevê · avião', preco: 1500 },
};
// percurso de cada prova: voltas pela faixa da direita, saindo e chegando na frente da autoescola
const RUMOS = { n: Math.PI, s: 0, l: Math.PI / 2, o: -Math.PI / 2 };
for (const k of ['B', 'C', 'D']) {
  const C = CATEGORIAS[k]; C.rota = { circular: true, rua: C.rua }; montarCaminho(C.rota);
  C.paradas = C.parar.map(([x, z, r]) => { let m = null; for (let s = 0; s < C.rota.L; s++) { const q = pontoCaminho(C.rota, s), d = Math.hypot(q.x - x, q.z - z); if (d < 4 && Math.cos(q.ang - RUMOS[r]) > 0.7 && (!m || d < m.d)) m = { s, d }; } return m ? m.s : 0; });
  C.tempo = Math.round(C.rota.L / (k === 'B' ? 6 : 5) + C.paradas.length * 10 + 30);
}
const temCarteira = (c) => (jogador.perfil?.habilitacoes || []).includes(c);
let aula = null;   // prova em andamento: { cat, i, inicio, batidas, veiculo, parado }
function abrirAutoescola() {
  const minhas = (jogador.perfil?.habilitacoes || []).map((c) => (c === 'AV' ? 'Brevê' : c)).join(', ') || 'nenhuma';
  escolher('🚗 Autoescola', `Suas carteiras: ${minhas}. Pague a aula e faça a prova prática na hora. Médico precisa da B, bombeiro da C, motorista de ônibus da D e piloto do brevê.`, Object.entries(CATEGORIAS).map(([k, c]) => {
    const tem = temCarteira(k), falta = c.precisa && !temCarteira(c.precisa);
    return { rotulo: `${tem ? '✅' : falta ? '🔒' : '📝'} ${c.nome}${tem ? ' (já tem)' : falta ? ` (tire a ${c.precisa} antes)` : ` · ${c.preco}`}`, fn: () => (tem ? aviso('Você já tem essa carteira.') : falta ? aviso(`Tire a carteira ${c.precisa} antes.`) : iniciarAula(k)) };
  }));
}
async function iniciarAula(cat) {
  if (jogador.carro || aula) { aviso('Termine o que está fazendo primeiro.'); return; }
  try { await rede.autoescola.iniciar(cat); } catch (e) { aviso(e.message || 'Não deu para pagar a aula.', 3); return; }
  if (cat === 'AV') {   // o instrutor leva você até o hangar e a aula começa já dentro do avião
    aula = { cat, inicio: performance.now(), voo: true };
    const h = AERO.metro.hangar; jogador.pos.set(h.x, alturaChao(h.x, h.z), h.z); jogador.avatar.raiz.position.copy(jogador.pos);
    aviso('🛩️ O instrutor levou você ao hangar do Aeroporto da Metrópole. Siga a faixa amarela até a cabeceira, decole e pouse numa pista.', 6);
    setTimeout(() => { if (aula?.voo && !aula.veiculo && !jogador.carro) entrarAulaVoo(); }, 600);
    return;
  }
  const C = CATEGORIAS[cat], q0 = pontoCaminho(C.rota, 0), s = { x: q0.x, z: q0.z, yaw: q0.ang };
  const mesh = civico.modeloCarro(C.modelo, C.cor); mesh.position.set(s.x, 0, s.z); mesh.rotation.y = s.yaw; scene.add(mesh);
  if (jogador.armado) alternarArma();
  modoVolante(true);
  aula = { cat, i: 0, inicio: performance.now(), batidas: 0, parado: 0, s: 0, infracoes: 0, fora: 0, espera: 0 };
  jogador.carro = { id: 'e' + jogador.perfil.id.slice(0, 8), servico: 'autoescola', modelo: C.modelo, cor: C.cor, vel: 0, mesh, salvar: 1e9, max: cat === 'B' ? 10 : 9, raio: cat === 'B' ? 1.3 : 1.9, alt: 0, aula };
  aula.veiculo = jogador.carro;
  jogador.pos.set(s.x, 0, s.z); jogador.yaw = s.yaw; jogador.alvo = null; jogador.avatar.raiz.visible = false;
  aviso(`📝 Prova da ${C.nome}: siga a faixa amarela pela mão direita, sem subir na calçada, em até ${C.tempo} s.${cat === 'D' ? ' Pare 2 s nos pontos de ônibus.' : ''} 3 infrações ou 3 batidas reprovam.`, 7);
}
async function encerrarAula(passou, msg) {
  const a = aula; if (!a) return; aula = null;
  const c = jogador.carro;
  if (c && c.aula === a) {   // devolve o veículo da autoescola
    jogador.carro = null; modoVolante(false); scene.remove(c.mesh);
    if (!a.voo) { const s = AUTOESCOLA.balcao; jogador.pos.set(s.x, 0.18, s.z + 3); }
    else jogador.pos.x += 3;
    resolverColisao(jogador.pos, jogador.raio); jogador.avatar.raiz.visible = true;
  }
  rastrear(null); esconderRota();
  if (!passou) { aviso(`❌ ${msg || 'Reprovado.'} Pague a aula de novo para tentar outra vez.`, 5); return; }
  try {
    const h = await rede.autoescola.concluir(a.cat); if (jogador.perfil) jogador.perfil.habilitacoes = h;
    aviso(`🎉 Aprovado! ${CATEGORIAS[a.cat].nome} na sua carteira.`, 5);
  } catch (e) { aviso('Aprovado, mas não salvou: ' + (e.message || e), 4); }
}
function atualizarAula(dt) {
  if (!aula) return;
  const a = aula;
  if (a.voo) {
    if (performance.now() - a.inicio > 20 * 60000) { encerrarAula(false, 'A aula de voo expirou.'); return; }
    if (a.veiculo && jogador.carro !== a.veiculo) { encerrarAula(false, 'O avião caiu ou você saiu dele.'); return; }
    return;
  }
  const C = CATEGORIAS[a.cat], R = C.rota, seg = (performance.now() - a.inicio) / 1000;
  if (jogador.carro !== a.veiculo) { encerrarAula(false, 'Você saiu do veículo ou ele explodiu.'); return; }
  if (seg > C.tempo) { encerrarAula(false, 'O tempo acabou.'); return; }
  if (a.batidas >= 3) { encerrarAula(false, 'Bateu 3 vezes.'); return; }
  if (a.infracoes >= 3) { encerrarAula(false, '3 infrações de trânsito.'); return; }
  // progresso no percurso (só para a frente) e distância da faixa da direita
  let melhor = a.s, dm = Infinity;
  for (let s2 = Math.max(0, a.s - 8); s2 <= Math.min(R.L, a.s + 30); s2 += 0.5) { const q = pontoCaminho(R, s2), d = Math.hypot(q.x - jogador.pos.x, q.z - jogador.pos.z); if (d < dm) { dm = d; melhor = s2; } }
  if (dm < 6) a.s = Math.max(a.s, melhor);
  if ((tempoRota -= dt) <= 0) { tempoRota = 0.25; const pts = []; for (let s2 = a.s + 2; s2 < Math.min(R.L, a.s + 160); s2 += 2) { const q = pontoCaminho(R, s2); pts.push([q.x, q.z]); } desenharRota(pts); }
  const infracao = (msg) => { a.infracoes++; aviso(`⚠️ Infração ${a.infracoes}/3: ${msg}`, 2.5); };
  // regras: mão direita e nada de calçada
  if (dm > 3.4) { a.fora += dt; if (a.fora > 1.2) { a.fora = -3; infracao('fora da faixa da direita (mão de direção).'); } } else if (a.fora > 0) a.fora = 0; else a.fora = Math.min(0, a.fora + dt);
  a.calcada = Math.max(0, (a.calcada || 0) - dt);
  if (alturaChao(jogador.pos.x, jogador.pos.z) > 0.1 && !a.calcada) { a.calcada = 3; infracao('subiu na calçada.'); }
  // pontos de ônibus (prova D): parar 2 s
  const ip = a.i < C.paradas.length ? C.paradas[a.i] : null;
  if (ip !== null) {
    if (Math.abs(a.s - ip) < 8 && Math.abs(a.veiculo.vel) < 0.5) { a.espera += dt; if (a.espera >= 2) { a.i++; a.espera = 0; aviso('🚏 Parada feita!', 1.5); } }
    else if (a.s > ip + 10) { a.i++; a.espera = 0; infracao('não parou no ponto de ônibus.'); }
  }
  if (a.s >= R.L - 4) encerrarAula(true);
}
function textoAula() {
  const a = aula; if (a.voo) return null;
  const C = CATEGORIAS[a.cat], seg = (performance.now() - a.inicio) / 1000;
  return [`prova ${a.cat}: ${Math.round(a.s / C.rota.L * 100)}% · ${Math.max(0, Math.round(C.tempo - seg))} s · infrações ${a.infracoes}/3 · batidas ${a.batidas}/3 (toque para desistir)`, 'Desistir'];
}
// aula de voo: começa no hangar com o avião pequeno da escola
function entrarAulaVoo() { entrarAviao('pequeno'); jogador.carro.aula = aula; aula.veiculo = jogador.carro; aviso('🛩️ Aula de voo: vá até a cabeceira 09, decole e pouse numa pista (alinhado e devagar).', 6); }
function montarAutoescola() {
  const A = AUTOESCOLA, y = 0.18;
  const M = (cor, o = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.7, ...o });
  const caixa = (x, yy, z, w, h, d, m, col = false) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, yy, z); o.castShadow = o.receiveShadow = true; scene.add(o); if (col) mundo.addCol({ tipo: 'caixa', x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); return o; };
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(A.x1 - A.x0 - 2, A.z1 - A.z0 - 2).rotateX(-Math.PI / 2), M('#4a4e55')); piso.position.set(A.x, y + 0.012, A.z); piso.receiveShadow = true; scene.add(piso);
  caixa(A.x, y + 2.6, -39, 20, 5.2, 10, M('#f2f2f2'), true);                 // escritório
  caixa(A.x, y + 5.4, -39, 20.6, 0.4, 10.6, M('#e8891c'));
  caixa(A.x, y + 3.3, -32.6, 10, 0.2, 3, M('#e8891c'));                       // toldo
  caixa(A.x, y + 0.55, -29.6, 4, 1.1, 0.8, M('#2b5fa8'), true);               // balcão
  const nome = rotuloSimples('🚗 AUTOESCOLA', 9); nome.position.set(A.x, 7.5, -34); scene.add(nome);
  const b = rotuloSimples('📝 Aulas e provas', 3.6); b.position.set(A.balcao.x, 2.8, A.balcao.z); scene.add(b);
  // pátio de treino: cones
  const cone = new THREE.ConeGeometry(0.28, 0.75, 10).translate(0, 0.375, 0), mc = M('#ff6a1a');
  const cones = []; for (let k = 0; k < 7; k++) cones.push([A.x0 + 5 + k * 5.5, -18 + (k % 2) * 2.5]);
  const im = new THREE.InstancedMesh(cone, mc, cones.length); cones.forEach(([x, z], k) => im.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, y, z))); scene.add(im);
  // carro da autoescola estacionado (decoração)
  const carro = civico.modeloCarro('popular', '#f2f2f2'); carro.position.set(A.x1 - 5, y, -12); carro.rotation.y = Math.PI; scene.add(carro);
  mundo.addCol({ tipo: 'caixa', x0: A.x1 - 6, x1: A.x1 - 4, z0: -14.2, z1: -9.8 });
  criarAvatar('personagens', PERSONAGENS[5 % PERSONAGENS.length].id).then((av) => {
    av.raiz.position.set(A.atendente.x, y, A.atendente.z); av.raiz.rotation.y = 0; av.tocar('idle'); scene.add(av.raiz);
    const et = textoSprite('Instrutor', { escala: 0.5, fundo: 'rgba(232,137,28,.95)' }); et.position.y = 2.2; av.raiz.add(et); atendentes.push(av);
  }).catch(() => {});
}
// ================================================================= coleta de lixo: Central de Reciclagem, setores, lixeiras e caminhões
// Quatro setores (rotas) saem e voltam à Central. Em cada um roda um caminhão do sistema com dois garis NPC nos
// estribos de trás: em cada lixeira cheia eles descem, levam os sacos ao caminhão e sobem de novo. O gari jogador
// escolhe um setor; o caminhão do sistema daquele setor sai de cena e os dois garis NPC passam a trabalhar com ele.
const CENTRAL = { x: 351, z: -81, x0: 329, x1: 373, z0: -103, z1: -59, garagem: { x: 362, z: -72 }, descarga: { x: 351, z: -86 } };
const SETORES = [
  { id: 1, nome: 'Setor Leste', rua: [[351, -54], [378, -54], [378, 162], [216, 162], [216, -162], [378, -162], [378, -108], [351, -108]] },
  { id: 2, nome: 'Setor Centro', rua: [[351, -54], [108, -54], [-108, -54], [-108, 108], [378, 108], [378, -108], [351, -108]] },
  { id: 3, nome: 'Setor Oeste', rua: [[351, -54], [-378, -54], [-378, 216], [-162, 216], [-162, 108], [108, 108], [108, -108], [351, -108]] },
  { id: 4, nome: 'Setor Norte', rua: [[351, -54], [378, -54], [378, -378], [54, -378], [54, -108], [351, -108]] },
];
const LIXEIRAS = [];
const CHEIA_EM = 240;   // segundos para encher de novo
const lixeiraCheia = (l, t) => t - l.coletada > CHEIA_EM;
const PARADA_LIXO = 8;   // segundos parado em cada lixeira (os garis descem, recolhem e sobem)
SETORES.forEach((S, k) => {
  S.cam = { faixa: 351, ini: [[351, -86], [351, -64]], fimPts: [[351, -100], [351, -86]], rua: S.rua }; montarCaminho(S.cam);
  const n = Math.max(8, Math.min(14, Math.round(S.cam.L / 85))), ini = 45, fim = S.cam.L - 45; S.lix = [];
  for (let i = 0; i < n; i++) {
    const s = ini + (fim - ini) * i / (n - 1), q = pontoCaminho(S.cam, s), rx = -Math.cos(q.ang), rz = Math.sin(q.ang);
    const l = { s, x: q.x + rx * 4.6, z: q.z + rz * 4.6, ang: q.ang, coletada: -1e9, mesh: null, i: LIXEIRAS.length, setor: S.id }; LIXEIRAS.push(l); S.lix.push(l);
  }
  // caminhão do sistema: 7 m/s, para em cada lixeira e 20 s na Central; os setores saem em horários diferentes
  S.fase = k * 47; tabelaSetor(S);
  S.npc = null; S.garis = [];
});
function tabelaSetor(S) {
  const tab = []; let t = 0, sAnt = 0;
  for (const l of S.lix) { const chega = t + (l.s - sAnt) / 7 + 2; tab.push({ chega, sai: chega + PARADA_LIXO }); t = chega + PARADA_LIXO; sAnt = l.s; }
  const fimT = t + (S.cam.L - sAnt) / 7 + 2; S.tab = { tab, fim: fimT, ciclo: fimT + 20 };
}
const SETOR_ID = Object.fromEntries(SETORES.map((S) => [S.id, S]));
function caminhaoLixoNpc(S, t) {
  const C = S.tab.ciclo, u = (((t - S.fase) % C) + C) % C; let sAnt = 0, tAnt = 0;
  for (let i = 0; i < S.lix.length; i++) {
    const tb = S.tab.tab[i];
    if (u < tb.chega) return { s: sAnt + (S.lix[i].s - sAnt) * THREE.MathUtils.smootherstep((u - tAnt) / (tb.chega - tAnt), 0, 1) };
    if (u < tb.sai) return { s: S.lix[i].s, lixeira: S.lix[i], f: (u - tb.chega) / PARADA_LIXO };
    sAnt = S.lix[i].s; tAnt = tb.sai;
  }
  if (u < S.tab.fim) return { s: sAnt + (S.cam.L - sAnt) * THREE.MathUtils.smootherstep((u - tAnt) / (S.tab.fim - tAnt), 0, 1) };
  return { s: S.cam.L, central: true };
}
let centralMontada = false, minhaColeta = null;
const ehGari = () => jogador.perfil?.profissao === 'gari' || jogador.perfil?.cargo === 'admin';
function montarCentral() {
  ajustarAoMapa();
  if (centralMontada) return; centralMontada = true;
  const C = CENTRAL, y = 0.18, Mt = (cor, o = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, ...o });
  const caixa = (x, yy, z, w, h, d, m, col = false) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, yy, z); o.castShadow = o.receiveShadow = true; scene.add(o); if (col) mundo.addCol({ tipo: 'caixa', x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); return o; };
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(C.x1 - C.x0, C.z1 - C.z0).rotateX(-Math.PI / 2), Mt('#5a5d61')); piso.position.set(C.x, y + 0.012, C.z); piso.receiveShadow = true; scene.add(piso);
  caixa(338, y + 4, -81, 14, 8, 34, Mt('#7d8f63', { metalness: 0.3, roughness: 0.6 }), true);   // galpão de triagem
  caixa(338, y + 8.3, -81, 15, 0.5, 35, Mt('#4f5a3a'));
  ['#2f6fd1', '#e0c22a', '#c8322a', '#2e9e57'].forEach((c, k) => caixa(366, y + 0.8, -98 + k * 3, 2.4, 1.6, 2.2, Mt(c), true));   // contêineres de reciclagem
  const sacos = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), Mt('#1d2024', { roughness: 0.4 }), 26);
  for (let k = 0; k < 26; k++) sacos.setMatrixAt(k, new THREE.Matrix4().makeTranslation(355 + (k % 6) * 1.1 + Math.sin(k) * 0.3, y + 0.45 + Math.floor(k / 12) * 0.6, -66 + Math.floor(k / 6) % 2 * 1.2)); scene.add(sacos);
  for (const [o, t] of [[C.garagem, '🚛 Garagem da coleta'], [C.descarga, '♻️ Descarga']]) { const r = rotuloSimples(t, 4.2); r.position.set(o.x, 3.4, o.z); scene.add(r); }
  const nome = rotuloSimples('♻️ CENTRAL DE RECICLAGEM', 11); nome.position.set(C.x, 10, C.z1 + 1); scene.add(nome);
  // lixeiras: contêiner verde com tampa; sacos em volta quando cheia
  const corpo = Mt('#2f6b3a', { roughness: 0.6 }), tampa = Mt('#24532d'), saco = Mt('#1d2024', { roughness: 0.4 });
  const vistas = [];
  for (const l of LIXEIRAS) {
    if (vistas.some((v) => Math.hypot(v.x - l.x, v.z - l.z) < 3)) { l.gemea = vistas.find((v) => Math.hypot(v.x - l.x, v.z - l.z) < 3); continue; }   // setores que passam no mesmo lugar dividem a lixeira
    vistas.push(l);
    const g = new THREE.Group(); g.position.set(l.x, alturaChao(l.x, l.z), l.z); g.rotation.y = l.ang; scene.add(g);
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.1), corpo); c1.position.y = 0.6; c1.castShadow = true; g.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.2), tampa); c2.position.y = 1.26; g.add(c2);
    const cheio = new THREE.Group(); g.add(cheio);
    for (const [dx, dz, r] of [[-1.1, 0.2, 0.45], [1.15, -0.1, 0.4], [0.9, 0.6, 0.35], [0, 1.45, 0.3]]) { const sc = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), saco); sc.position.set(dx, r * 0.8, dz); cheio.add(sc); }
    l.mesh = g; l.cheio = cheio;
    mundo.addCol({ tipo: 'circ', x: l.x, z: l.z, r: 0.9 });
  }
}
// uma lixeira compartilhada (mesmo lugar em dois setores) é a mesma: recolher uma esvazia a outra
const lixReal = (l) => l.gemea || l;
function esvaziar(l, t) { const r = lixReal(l); r.coletada = t; for (const o of LIXEIRAS) if (o.gemea === r) o.coletada = t; }
// ---- garis NPC: dois por caminhão, nos estribos de trás; descem na lixeira e levam os sacos
const ROUPA_GARI = ['Urban_Explorer', 'Patchwork_Scout'];
function garisDe(dono) {
  if (dono.garis.length || dono.criandoGaris) return dono.garis;
  dono.criandoGaris = true;
  ROUPA_GARI.forEach((id, k) => criarAvatar('personagens', id).then((av) => {
    const et = textoSprite('Gari', { escala: 0.45, fundo: 'rgba(232,137,28,.95)' }); et.position.y = 2.1; av.raiz.add(et);
    av.raiz.visible = false; scene.add(av.raiz); dono.garis[k] = { av, anim: '' };
  }).catch(() => {}));
  return dono.garis;
}
// f: 0..1 na parada (null = andando); caminhão em (x, z, ang); lixeira l
function posicionarGaris(dono, mesh, f, l, visivel, dt) {
  const gs = garisDe(dono), a = mesh.rotation.y, fx = Math.sin(a), fz = Math.cos(a), rx = -Math.cos(a), rz = Math.sin(a);
  gs.forEach((g, k) => {
    if (!g) return; const av = g.av; av.raiz.visible = visivel; if (!visivel) return;
    const lado = k ? 0.65 : -0.65, est = { x: mesh.position.x - fx * 4.9 + rx * lado, z: mesh.position.z - fz * 4.9 + rz * lado };
    let p = est, anim = 'idle', y = mesh.position.y + 0.45, rot = a;
    if (f !== null && l) {
      const lx = l.x - rx * 0.9 + fx * (k ? 0.7 : -0.7), lz = l.z - rz * 0.9 + fz * (k ? 0.7 : -0.7);
      const fase = THREE.MathUtils.clamp((f - k * 0.06) / 0.9, 0, 1);
      if (fase < 0.3) { const u = fase / 0.3; p = { x: est.x + (lx - est.x) * u, z: est.z + (lz - est.z) * u }; anim = 'walk'; y = alturaChao(p.x, p.z); rot = Math.atan2(lx - est.x, lz - est.z); }
      else if (fase < 0.45) { p = { x: lx, z: lz }; anim = 'idle'; y = alturaChao(lx, lz); rot = Math.atan2(l.x - lx, l.z - lz); }
      else if (fase < 0.8) { const u = (fase - 0.45) / 0.35; p = { x: lx + (est.x - lx) * u, z: lz + (est.z - lz) * u }; anim = 'carry_walk'; y = alturaChao(p.x, p.z); rot = Math.atan2(est.x - lx, est.z - lz); }
      else { p = est; anim = 'idle'; }
    }
    av.raiz.position.set(p.x, y, p.z); av.raiz.rotation.y = rot;
    if (anim !== g.anim) { g.anim = anim; av.tocar(anim, { velocidade: 1 }); }
    av.mixer.update(dt);
  });
}
function setoresComGari() { const r = new Set(); for (const x of remotos.values()) if (x.meta?.gr) r.add(Number(x.meta.gr)); if (minhaColeta) r.add(minhaColeta.S.id); return r; }
function atualizarColeta(dt) {
  montarCentral();
  const t = agoraServidor() / 1000, ocupados = setoresComGari();
  for (const S of SETORES) {
    S.st ||= { atraso: 0 };
    let e = caminhaoLixoNpc(S, t - S.st.atraso);
    // arrancada do caminhão de lixo (depois de cada lixeira e de cada espera)
    if (!e.lixeira && S.sAntL !== undefined && e.s > S.sAntL && e.s - S.sAntL < 40) {
      const v0 = S.st.gV || 0, lim = S.sAntL + (v0 + civico.aceleracao('caminhao_lixo', v0, 10) * dt) * dt;
      if (e.s > lim + 0.005) { const a = atrasoAte(S.st, (x) => caminhaoLixoNpc(S, t - x).s, lim); if (a !== null) { S.st.atraso = a; e = caminhaoLixoNpc(S, t - a); } }
    }
    S.st.gV = S.sAntL !== undefined && e.s >= S.sAntL && e.s - S.sAntL < 40 && dt > 0 ? (e.s - S.sAntL) / dt : 0; S.sAntL = e.s;
    const q = pontoCaminho(S.cam, e.s), perto = Math.abs(q.x - jogador.pos.x) + Math.abs(q.z - jogador.pos.z) < 260;
    const ativo = !ocupados.has(S.id);
    if (ativo && e.lixeira) esvaziar(e.lixeira, t);   // o caminhão do sistema recolhe mesmo longe (todos veem igual)
    if (!S.npc && perto && modelos.caminhao_lixo) { S.npc = civico.modeloCarro('caminhao_lixo', '#ffffff'); S.npc.userData.giroflex = true; scene.add(S.npc); }
    if (!S.npc) continue;
    S.npc.position.set(q.x, alturaChao(q.x, q.z), q.z); S.npc.rotation.y = q.ang; S.sAtual = e.s;
    if (S.npc.visible && !e.lixeira) frearAtras(S.st, S.npc, dt, 8);   // respeita quem está parado na frente
    S.npc.visible = ativo && perto && !jogador.dentroCasa;
    if (S.npc.visible) sons.continuo(e.lixeira ? 'caminhao_lenta' : 'caminhao_alto', 0.45 * sons.perto(Math.hypot(q.x - jogador.pos.x, q.z - jogador.pos.z), 50), 0.9);
    if (S.npc.visible || S.garis.length) posicionarGaris(S, S.npc, e.lixeira ? e.f : null, e.lixeira ? lixReal(e.lixeira) : null, S.npc.visible && Math.abs(q.x - jogador.pos.x) + Math.abs(q.z - jogador.pos.z) < 160, dt);
  }
  for (const l of LIXEIRAS) if (l.cheio) l.cheio.visible = lixeiraCheia(l, t);
  if (minhaColeta) atualizarMinhaColeta(dt, t);
}
// colisão dos caminhões do sistema (empurram quem está na frente)
function colidirLixoNpc(p, raio) {
  for (const S of SETORES) {
    const m = S.npc; if (!m?.visible) continue;
    const a = m.rotation.y, fx = Math.sin(a), fz = Math.cos(a);
    for (const o of [-2.6, 0, 2.6]) { const cx = m.position.x + fx * o, cz = m.position.z + fz * o, dx = p.x - cx, dz = p.z - cz, r = raio + 1.4, d2 = dx * dx + dz * dz; if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; } }
  }
}
// ---- gari jogador
function pegarCaminhaoLixo() {
  if (!ehGari()) { abrirServico('lixo'); return; }
  if (jogador.carro) { aviso('Desça do veículo primeiro.'); return; }
  const ocupados = setoresComGari();
  escolher('🚛 Garagem da coleta', 'Escolha o setor. Os dois garis NPC vão com você e descem em cada lixeira.', SETORES.map((S) => ({
    rotulo: `${ocupados.has(S.id) ? '🚫' : '🗑️'} ${S.nome} · ${S.lix.length} lixeiras · ${(S.cam.L / 1000).toFixed(1)} km${ocupados.has(S.id) ? ' (outro gari)' : ''}`,
    fn: () => (ocupados.has(S.id) ? aviso('Outro gari já está nesse setor.') : sairComCaminhao(S)),
  })));
}
function sairComCaminhao(S) {
  const q = pontoCaminho(S.cam, 0), mesh = civico.modeloCarro('caminhao_lixo', '#ffffff'); mesh.userData.giroflex = true;
  mesh.position.set(q.x, alturaChao(q.x, q.z), q.z); mesh.rotation.y = q.ang; scene.add(mesh);
  if (jogador.armado) alternarArma();
  modoVolante(true);
  jogador.carro = { id: 'l' + jogador.perfil.id.slice(0, 8), servico: 'lixo', modelo: 'caminhao_lixo', cor: '#ffffff', vel: 0, mesh, salvar: 1e9, max: 9, raio: 1.8, alt: 0 };
  jogador.pos.set(q.x, alturaChao(q.x, q.z), q.z); jogador.yaw = q.ang; jogador.alvo = null; jogador.avatar.raiz.visible = false;
  minhaColeta = { S, mesh, carga: 0, s: 0, parado: 0, garis: [], recolhendo: null };
  conexao?.rastrear(metaPresenca());
  aviso(`🚛 ${S.nome}: siga a faixa amarela até as lixeiras cheias. Pare do lado e espere os garis recolherem. Depois descarregue na Central.`, 6);
}
function alvoColeta(c, t) {
  if (c.carga < 14) for (const l of c.S.lix) if (l.s > c.s - 5 && lixeiraCheia(lixReal(l), t)) return { s: l.s, l };
  return { s: c.S.cam.L, central: true };
}
function atualizarMinhaColeta(dt, t) {
  const c = minhaColeta;
  if (!jogador.carro || jogador.carro.mesh !== c.mesh) { encerrarColeta(); return; }
  const alvo = alvoColeta(c, t);
  if ((tempoRota -= dt) <= 0) { tempoRota = 0.25; const v = { L: c.S.cam, s: c.s, prox: 0, alvoS: alvo.s }; desenharRota(rotaDaVolta(v)); c.s = v.s; }
  const parado = Math.abs(jogador.carro.vel) < 0.5;
  // os garis NPC trabalham com você: descem quando você para do lado de uma lixeira cheia
  if (!c.recolhendo && parado && c.carga < 14) { const l = c.S.lix.find((x) => lixeiraCheia(lixReal(x), t) && Math.hypot(lixReal(x).x - jogador.pos.x, lixReal(x).z - jogador.pos.z) < 8); if (l) c.recolhendo = { l: lixReal(l), f: 0 }; }
  if (c.recolhendo) {
    if (!parado && c.recolhendo.f < 0.8) { c.recolhendo = null; aviso('Espere os garis voltarem para o caminhão!', 2); }
    else {
      c.recolhendo.f += dt / 4.5;
      if (c.recolhendo.f >= 1) { const l = c.recolhendo.l; esvaziar(l, t); c.carga++; c.recolhendo = null; conexao?.enviar('lixo', { i: l.i }); aviso(`🗑️ Lixeira recolhida! Carga: ${c.carga}/14.${c.carga >= 14 ? ' Caminhão cheio: volte à Central.' : ''}`, 2.5); }
    }
  }
  posicionarGaris(c, c.mesh, c.recolhendo ? c.recolhendo.f : null, c.recolhendo?.l, !jogador.dentroCasa, dt);
  if (!parado) { c.parado = 0; return; }
  c.parado += dt;
  const fim = pontoCaminho(c.S.cam, c.S.cam.L);
  if (c.carga > 0 && Math.hypot(fim.x - jogador.pos.x, fim.z - jogador.pos.z) < 10 && c.parado > 1.5 && !c.pagando) {
    c.pagando = true; const n = c.carga;
    rede.transporte.pagarColeta(n).then((v) => { c.carga = 0; c.s = 0; aviso(`♻️ Descarregou ${n} lixeira(s): +${v} moedas. Pode sair para outra volta.`, 4); })
      .catch((e) => aviso('Descarga não paga: ' + (e.message || e), 3)).finally(() => { c.pagando = false; });
  }
}
function encerrarColeta() {
  const c = minhaColeta; if (!c) return; minhaColeta = null;
  if (jogador.carro?.mesh === c.mesh) { jogador.carro = null; modoVolante(false); jogador.avatar.raiz.visible = true; jogador.pos.x += Math.cos(jogador.yaw) * 2.6; jogador.pos.z -= Math.sin(jogador.yaw) * 2.6; resolverColisao(jogador.pos, jogador.raio); }
  for (const g of c.garis) if (g) scene.remove(g.av.raiz);
  scene.remove(c.mesh); esconderRota(); conexao?.rastrear(metaPresenca());
  aviso(c.carga ? `🚛 Caminhão devolvido. ${c.carga} lixeira(s) não descarregada(s) foram perdidas.` : '🚛 Caminhão devolvido à garagem.', 3);
}
function receberLixo(m) { const l = LIXEIRAS[m.i]; if (l) esvaziar(l, agoraServidor() / 1000); }
function contextoColeta() {
  if (jogador.carro) return null;
  if (Math.hypot(CENTRAL.garagem.x - jogador.pos.x, CENTRAL.garagem.z - jogador.pos.z) < 3.5) return [ehGari() ? 'garagem: escolher o setor e pegar o caminhão de lixo' : 'Central de Reciclagem (vagas para gari)', 'Coleta'];
  return null;
}
function acaoColeta() { if (contextoColeta()) { pegarCaminhaoLixo(); return true; } return false; }
// ================================================================= aviação: aeroporto da Metrópole + pistas de Vila Serra e Porto Sul
// Voos regulares (NPC) seguem uma tabela pelo relógio do servidor (todos veem igual) e levam quem comprou passagem.
// Um avião grande faz um voo internacional (sai e volta à Metrópole). A torre fala com os aviões pelo rádio.
// Pilotos jogadores pegam o avião no hangar (o porte cresce com a carreira), pedem autorização à torre (ou ela é
// automática se não houver controlador), decolam na pista e precisam pousar alinhados numa pista, devagar: senão caem.
const AEROPORTOS = [
  { id: 'metro', nome: 'Aeroporto da Metrópole', grande: true, eixo: 'x', x0: 140, x1: 500, c: -800, larg: 30, cab: '09', torreNome: 'Torre Metrópole',
    cerca: { x0: 120, x1: 520, z0: -880, z1: -655, portao: [155, 169] },
    vaga: { x: 330, z: -737 }, portao: { x: 330, z: -716 }, balcao: { x: 346, z: -699 }, atendente: { x: 346, z: -704.5, yaw: 0 },
    torre: { x: 405, z: -695 }, hangar: { x: 465, z: -689 }, spawn: { x: 465, z: -748 },
    taxiOut: [{ x: 330, z: -765, re: 1 }, { x: 150, z: -765 }, { x: 146, z: -800 }], saida: { x: 300, z: -800 }, taxiIn: [{ x: 300, z: -765 }, { x: 330, z: -765 }, { x: 330, z: -737 }] },
  { id: 'serra', nome: 'Pista de Vila Serra', eixo: 'z', z0: -1090, z1: -930, c: -255, larg: 22, cab: '18', torreNome: 'Rádio Vila Serra',
    cerca: { x0: -276, x1: -194, z0: -1110, z1: -910, porta: -1005 }, estrada: [[-86, -1005], [-198, -1005]],
    vaga: { x: -228, z: -1030 }, portao: { x: -216, z: -1016 }, balcao: { x: -200, z: -1012 }, atendente: { x: -203.6, z: -1012, yaw: Math.PI / 2 },
    taxiOut: [{ x: -255, z: -1030 }, { x: -255, z: -1086 }], saida: { x: -255, z: -985 }, taxiIn: [{ x: -230, z: -985 }, { x: -228, z: -1030 }] },
  { id: 'porto', nome: 'Pista de Porto Sul', eixo: 'z', z0: 930, z1: 1090, c: -255, larg: 22, cab: '36', torreNome: 'Rádio Porto Sul',
    cerca: { x0: -276, x1: -194, z0: 910, z1: 1108, porta: 1005 }, estrada: [[-86, 1005], [-198, 1005]],
    vaga: { x: -228, z: 1030 }, portao: { x: -216, z: 1016 }, balcao: { x: -200, z: 1012 }, atendente: { x: -203.6, z: 1012, yaw: Math.PI / 2 },
    taxiOut: [{ x: -255, z: 1030 }, { x: -255, z: 1086 }], saida: { x: -255, z: 985 }, taxiIn: [{ x: -230, z: 985 }, { x: -228, z: 1030 }] },
];
const AERO = Object.fromEntries(AEROPORTOS.map((a) => [a.id, a]));
const PORTES = {
  pequeno: { modelo: 'aviao_pequeno', vdec: 20, vmax: 40, cruz: 42, giro: 0.6, raio: 2.6, nome: 'pequeno' },
  medio: { modelo: 'aviao_medio', vdec: 26, vmax: 52, cruz: 58, giro: 0.45, raio: 4, nome: 'médio' },
  grande: { modelo: 'aviao_grande', vdec: 32, vmax: 64, cruz: 72, giro: 0.32, raio: 6, nome: 'grande' },
};
// comprimento, ponta de decolagem/pouso e direção de cada pista
function pista(a) {
  if (a.eixo === 'x') return { ini: { x: a.x0, z: a.c }, fim: { x: a.x1, z: a.c }, len: a.x1 - a.x0, ang: Math.PI / 2 };
  // pistas das cidades: decolam e pousam no sentido da Metrópole (começam na ponta mais longe dela)
  const zi = a.z0 < 0 ? a.z0 : a.z1, zf = a.z0 < 0 ? a.z1 : a.z0;
  return { ini: { x: a.c, z: zi }, fim: { x: a.c, z: zf }, len: Math.abs(a.z1 - a.z0), ang: Math.atan2(0, zf - zi) };
}
function pistaEm(x, z) {
  for (const a of AEROPORTOS) {
    if (a.eixo === 'x' ? x >= a.x0 - 4 && x <= a.x1 + 4 && Math.abs(z - a.c) <= a.larg / 2 : z >= a.z0 - 4 && z <= a.z1 + 4 && Math.abs(x - a.c) <= a.larg / 2) return a;
  }
  return null;
}
const alinhado = (a, yaw) => Math.abs(Math.sin(yaw - (a.eixo === 'x' ? Math.PI / 2 : 0))) < 0.42;
// ---- cenário (montado uma vez)
let aeroMontado = false;
const luzesPista = [], aviaoParado = [], tetosTerminal = [];
let painelVoos = null, matLuzPista = null, matLuzTaxi = null, farolTorre = null;
const AVIOES_PARADOS = [   // decoração: [porte, x, z, ângulo]
  ['grande', 232, -735, 0], ['medio', 285, -737, 0], ['pequeno', 440, -735, 0], ['pequeno', 490, -735, 0],
  ['pequeno', -232, -1062, Math.PI], ['pequeno', -232, 1062, 0],
];
function montarAeroportos() {
  if (aeroMontado) return; aeroMontado = true;
  const M = (cor, o = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.85, ...o });
  const asf = M('#34373d'), asfTaxi = M('#3d4047'), concreto = M('#b9b5ab', { roughness: 0.9 }), patio = M('#a9a59c', { roughness: 0.9 });
  const vidro = M('#7fb2d8', { roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.55 }), branco = new THREE.MeshBasicMaterial({ color: '#f2f2f2' }), amarelo = new THREE.MeshBasicMaterial({ color: '#f2c230' });
  const parede = M('#e9e6df', { roughness: 0.6 }), azul = M('#2b5fa8', { roughness: 0.5 }), metal = M('#8d99a6', { roughness: 0.5, metalness: 0.45 });
  matLuzPista = new THREE.MeshStandardMaterial({ color: '#fff4c8', emissive: '#fff1b0', emissiveIntensity: 0.2 });
  matLuzTaxi = new THREE.MeshStandardMaterial({ color: '#4a7cff', emissive: '#3a6cff', emissiveIntensity: 0.2 });
  const plano = (x, z, w, d, m, y = 0.03) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m); o.position.set(x, y, z); o.receiveShadow = true; scene.add(o); return o; };
  const caixa = (x, y, z, w, h, d, m, col = false) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; scene.add(o); if (col) mundo.addCol({ tipo: 'caixa', x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); return o; };
  const letreiro = (txt, x, z, ang) => {   // número da cabeceira pintado no chão
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#f2f2f2'; g.font = 'bold 100px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 64, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const o = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    o.position.set(x, 0.05, z); o.rotation.y = ang; scene.add(o);
  };
  const posLuz = [], posTaxi = [];
  for (const a of AEROPORTOS) {
    const p = pista(a), cx = (p.ini.x + p.fim.x) / 2, cz = (p.ini.z + p.fim.z) / 2, ex = a.eixo === 'x';
    // pista: asfalto, faixa central, cabeceiras zebradas, números e luzes nas bordas
    plano(cx, cz, ex ? p.len + 20 : a.larg, ex ? a.larg : p.len + 20, asf);
    for (let k = 14; k < p.len - 14; k += 24) plano(ex ? p.ini.x + k : cx, ex ? cz : Math.min(p.ini.z, p.fim.z) + k, ex ? 12 : 0.6, ex ? 0.6 : 12, branco, 0.04);
    for (const ponta of [p.ini, p.fim]) for (let k = -4; k <= 4; k++) { if (!k) continue; plano(ex ? ponta.x + Math.sign(cx - ponta.x) * 5 : ponta.x + k * (a.larg / 10), ex ? ponta.z + k * (a.larg / 10) : ponta.z + Math.sign(cz - ponta.z) * 5, ex ? 9 : 1.2, ex ? 1.2 : 9, branco, 0.045); }
    const num = Number(a.cab), oposto = String((num + 18 - 1) % 36 + 1).padStart(2, '0');
    letreiro(a.cab, ex ? p.ini.x + 18 : p.ini.x, ex ? p.ini.z : p.ini.z + Math.sign(cz - p.ini.z) * 18, ex ? -Math.PI / 2 : (p.ini.z < cz ? Math.PI : 0));
    letreiro(oposto, ex ? p.fim.x - 18 : p.fim.x, ex ? p.fim.z : p.fim.z + Math.sign(cz - p.fim.z) * 18, ex ? Math.PI / 2 : (p.fim.z < cz ? Math.PI : 0));
    for (let k = 0; k <= p.len; k += 30) for (const lado of [-1, 1]) posLuz.push(ex ? [p.ini.x + k, cz + lado * (a.larg / 2 + 1)] : [cx + lado * (a.larg / 2 + 1), Math.min(p.ini.z, p.fim.z) + k]);
    // cerca alambrado em volta (com o portão aberto)
    cerca(a.cerca, a.eixo === 'x');
    // biruta
    const bx = ex ? a.x0 + 10 : a.c - a.larg / 2 - 6, bz = ex ? a.c - 26 : (a.z0 + a.z1) / 2 + 40;
    caixa(bx, 3, bz, 0.15, 6, 0.15, metal); const bi = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.2, 10, 1, true).rotateZ(Math.PI / 2), M('#ff7a1a', { side: THREE.DoubleSide })); bi.position.set(bx + 1.1, 5.7, bz); scene.add(bi);
    if (!ex) {   // pista das cidades: pátio, quiosque de passagens com atendente e estrada de terra até a cidade
      plano(-228, a.vaga.z - Math.sign(a.vaga.z) * 18, 30, 64, patio, 0.028);
      for (const [x0, z0] of a.estrada.slice(0, 1)) plano((x0 + a.estrada[1][0]) / 2, z0, Math.abs(a.estrada[1][0] - x0), 6, M('#7a6448', { roughness: 1 }), 0.02);
      const zc = a.balcao.z;
      if (glbEm('aero_quiosque', -207.6, 0, zc, 9, 6, 4.7, Math.PI / 2)) mundo.addCol({ tipo: 'caixa', x0: -210, x1: -205.3, z0: zc - 4.5, z1: zc + 4.5 });   // quiosque 3D virado para a estrada
      else { caixa(-204, 3.1, zc, 7, 0.25, 8, azul); for (const [sx, sz] of [[-3, -3.6], [-3, 3.6], [3, -3.6], [3, 3.6]]) caixa(-204 + sx, 1.5, zc + sz, 0.2, 3, 0.2, metal); }
      caixa(-202, 0.55, zc, 0.8, 1.1, 4, concreto, true);
      const r = rotuloSimples(`✈️ ${a.nome}`, 6); r.position.set(-204, 4.6, zc); scene.add(r);
      const rb = rotuloSimples('🎫 Passagens', 3.2); rb.position.set(a.balcao.x, 2.6, a.balcao.z); scene.add(rb);
      const rp = rotuloSimples('✈️ Embarque', 3.2); rp.position.set(a.portao.x, 2.6, a.portao.z); scene.add(rp);
      continue;
    }
    // ===== Metrópole: taxiway, pátio, terminal, torre, hangar, estacionamento e acesso
    plano(320, -765, 345, 16, asfTaxi, 0.031);
    for (const x of [150, 300, 490]) plano(x, -775, 16, 22, asfTaxi, 0.032);
    for (let x = 152; x < 488; x += 6) plano(x, -765, 3, 0.35, amarelo, 0.036);
    for (const x of [150, 300, 490]) for (let z = -784; z < -767; z += 5) plano(x, z, 0.35, 3, amarelo, 0.037);
    for (let x = 150; x <= 490; x += 20) for (const lado of [-1, 1]) posTaxi.push([x, -765 + lado * 8.6]);
    plano(345, -735.5, 300, 43, patio, 0.029);
    for (const [, x, z] of AVIOES_PARADOS.slice(0, 2).concat([[0, 330, -737], [0, 385, -735]])) { plano(x, -755, 0.35, 34, amarelo, 0.034); plano(x, z + 12, 8, 0.35, amarelo, 0.034); }
    // acesso: rua do horizonte até o portão e o anel do terminal (o ônibus da Linha 2 dá a volta nele)
    plano(162, -671, 10, 34, asf, 0.02); plano(281, -668, 248, 9, asf, 0.021); plano(400, -678, 9, 29, asf, 0.022); plano(321, -688, 328, 9, asf, 0.023);
    plano(280, -678, 200, 11, M('#4a4e55'), 0.018);   // estacionamento
    for (let x = 186; x < 380; x += 4.5) plano(x, -678, 0.15, 4.5, branco, 0.03);
    plano(320, -693, 84, 2.4, concreto, 0.035);          // calçada do terminal
    estacionarCarros();
    // terminal de passageiros: paredes de vidro, teto que some quando você entra, balcão com atendente e painel de voos
    const T = { x0: 280, x1: 360, z0: -712, z1: -694 }, H = 8;
    plano((T.x0 + T.x1) / 2, (T.z0 + T.z1) / 2, T.x1 - T.x0, T.z1 - T.z0, M('#d8d4cb', { roughness: 0.4, metalness: 0.1 }), 0.04);
    const muro = (x0, z0, x1, z1, m) => caixa((x0 + x1) / 2, H / 2, (z0 + z1) / 2, Math.max(0.3, x1 - x0), H, Math.max(0.3, z1 - z0), m, true);
    muro(T.x0, T.z0, T.x0 + 0.3, T.z1, parede); muro(T.x1 - 0.3, T.z0, T.x1, T.z1, parede);
    muro(T.x0, T.z0, 327, T.z0 + 0.3, vidro); muro(333, T.z0, T.x1, T.z0 + 0.3, vidro);              // lado das aeronaves, porta do embarque
    muro(T.x0, T.z1 - 0.3, 314, T.z1, vidro); muro(326, T.z1 - 0.3, T.x1, T.z1, vidro);              // entrada pela calçada
    for (const x of [T.x0, T.x1]) caixa(x, H + 0.6, (T.z0 + T.z1) / 2, 0.6, 1.2, T.z1 - T.z0 + 0.6, azul);
    const teto = caixa((T.x0 + T.x1) / 2, H + 0.25, (T.z0 + T.z1) / 2, T.x1 - T.x0 + 2, 0.5, T.z1 - T.z0 + 2, parede); tetosTerminal.push(teto);
    const term3d = glbEm('aero_terminal', (T.x0 + T.x1) / 2, 0, (T.z0 + T.z1) / 2, T.x1 - T.x0 + 2, 11, T.z1 - T.z0 + 2, 0); if (term3d) tetosTerminal.push(term3d);   // fachada 3D: some quando você entra (aparece o salão)
    const faixaTeto = caixa((T.x0 + T.x1) / 2, H + 0.7, T.z1 + 0.6, T.x1 - T.x0 + 2, 0.8, 0.3, azul); tetosTerminal.push(faixaTeto);
    const nomeT = rotuloSimples('✈️ AEROPORTO DA METRÓPOLE', 16); nomeT.position.set(320, H + 5.5, T.z1 + 1); scene.add(nomeT);
    caixa(346, 0.55, -702.2, 12, 1.1, 1.2, azul, true);   // balcão
    for (let k = 0; k < 3; k++) caixa(340 + k * 6, 1.6, -705.5, 3.6, 1.2, 0.2, M('#222833'));
    for (let fila = 0; fila < 3; fila++) for (let k = 0; k < 6; k++) caixa(292 + k * 4, 0.45, -700 - fila * 3, 3, 0.5, 0.7, M('#3a4a63'));   // cadeiras
    // painel de voos (sprite que sempre olha para a câmera)
    const pc = document.createElement('canvas'); pc.width = 512; pc.height = 300; const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
    const ps = new THREE.Sprite(new THREE.SpriteMaterial({ map: pt, depthWrite: false })); ps.scale.set(9, 9 * 300 / 512, 1); ps.position.set(304, 5.2, -709); scene.add(ps);
    painelVoos = { c: pc, t: pt, txt: '' };
    // pontes de embarque (decoração) até os aviões
    for (const x of [285, 330]) { caixa(x, 4, -717.5, 3, 2.6, 11, metal); caixa(x, 1.4, -721, 0.5, 2.8, 0.5, metal, true); }
    for (const [o, t] of [[a.balcao, '🎫 Passagens'], [a.portao, '✈️ Embarque · Portão 1'], [a.torre, '🗼 Torre de controle'], [a.hangar, '🛩️ Hangar dos pilotos']]) { const r = rotuloSimples(t, 4.4); r.position.set(o.x, 3.4, o.z); scene.add(r); }
    // torre de controle: base, cabine de vidro, teto e farol giratório
    const torre3d = glbEm('aero_torre', 405, 0, -701, 11, 11 * 2.519, 11, Math.PI);   // modelo 3D (porta para a rua)
    if (torre3d) mundo.addCol({ tipo: 'caixa', x0: 402, x1: 408, z0: -704, z1: -698 });
    else { caixa(405, 13, -701, 6, 26, 6, parede, true); caixa(405, 28, -701, 10, 4, 10, vidro); caixa(405, 30.3, -701, 11, 0.6, 11, azul); caixa(405, 32.5, -701, 0.2, 4, 0.2, metal); }
    farolTorre = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: '#d8ffd8', emissive: '#7dff8a', emissiveIntensity: 0.5 })); farolTorre.position.set(405, torre3d ? 11 * 2.519 + 0.6 : 31.2, -701); scene.add(farolTorre);
    // hangar com o portão aberto para o pátio
    if (glbEm('aero_hangar', 465, 0, -704, 70, 16, 24, Math.PI)) mundo.addCol({ tipo: 'caixa', x0: 430, x1: 500, z0: -716, z1: -692 });   // hangar 3D com o portão para o pátio
    else { caixa(465, 6.5, -704, 70, 13, 24, metal, true); const porta = new THREE.Mesh(new THREE.PlaneGeometry(50, 11), M('#1b1e22')); porta.position.set(465, 5.5, -716.05); porta.rotation.y = Math.PI; scene.add(porta); }
  }
  // luzes da pista (amarelas) e da taxiway (azuis): acendem à noite
  const geoLuz = new THREE.BoxGeometry(0.5, 0.35, 0.5);
  for (const [lista, mat] of [[posLuz, matLuzPista], [posTaxi, matLuzTaxi]]) {
    const im = new THREE.InstancedMesh(geoLuz, mat, lista.length);
    lista.forEach(([x, z], k) => { im.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, 0.2, z)); });
    scene.add(im); luzesPista.push(im);
  }
  montarAvioesParados();
  montarAtendentes();
}
// alambrado: postes, tela (textura de losangos) e colisão; deixa a entrada aberta
function cerca(c, grandeAero) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const g = cv.getContext('2d');
  g.strokeStyle = 'rgba(200,205,210,.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
  const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  const altura = 2.4, lados = [];
  const aberto = grandeAero ? { lado: 'sul', de: c.portao[0], ate: c.portao[1] } : { lado: 'leste', de: c.porta - 5, ate: c.porta + 5 };
  const add = (x0, z0, x1, z1) => { if (Math.hypot(x1 - x0, z1 - z0) > 0.5) lados.push([x0, z0, x1, z1]); };
  // norte e oeste inteiros; sul ou leste com a abertura
  add(c.x0, c.z0, c.x1, c.z0); add(c.x0, c.z0, c.x0, c.z1);
  if (aberto.lado === 'sul') { add(c.x0, c.z1, aberto.de, c.z1); add(aberto.ate, c.z1, c.x1, c.z1); add(c.x1, c.z0, c.x1, c.z1); }
  else { add(c.x0, c.z1, c.x1, c.z1); add(c.x1, c.z0, c.x1, aberto.de); add(c.x1, aberto.ate, c.x1, c.z1); }
  const postes = [];
  for (const [x0, z0, x1, z1] of lados) {
    const L = Math.hypot(x1 - x0, z1 - z0), t = tx.clone(); t.needsUpdate = true; t.repeat.set(L / 1.2, altura / 1.2);
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(L, altura), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }));
    tela.position.set((x0 + x1) / 2, altura / 2, (z0 + z1) / 2); tela.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2; scene.add(tela);
    for (let k = 0; k <= L; k += 4) postes.push([x0 + (x1 - x0) * k / L, z0 + (z1 - z0) * k / L]);
    mundo.addCol({ tipo: 'caixa', x0: Math.min(x0, x1) - 0.15, x1: Math.max(x0, x1) + 0.15, z0: Math.min(z0, z1) - 0.15, z1: Math.max(z0, z1) + 0.15 });
  }
  const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, altura + 0.2, 6), new THREE.MeshStandardMaterial({ color: '#6c737c', metalness: 0.5, roughness: 0.5 }), postes.length);
  postes.forEach(([x, z], k) => im.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, (altura + 0.2) / 2, z))); im.castShadow = true; scene.add(im);
  if (grandeAero) {   // pórtico na entrada
    const m = new THREE.MeshStandardMaterial({ color: '#2b5fa8', roughness: 0.5 });
    for (const x of [aberto.de - 0.4, aberto.ate + 0.4]) { const o = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6), m); o.position.set(x, 3, c.z1); o.castShadow = true; scene.add(o); mundo.addCol({ tipo: 'circ', x, z: c.z1, r: 0.4 }); }
    const viga = new THREE.Mesh(new THREE.BoxGeometry(aberto.ate - aberto.de + 2, 0.8, 0.6), m); viga.position.set((aberto.de + aberto.ate) / 2, 6, c.z1); scene.add(viga);
    const r = rotuloSimples('✈️ Aeroporto', 6); r.position.set((aberto.de + aberto.ate) / 2, 7.2, c.z1); scene.add(r);
  }
}
function estacionarCarros() {
  const tipos = ['popular', 'suv', 'esportivo'], cores = ['#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#2980b9', '#16a085', '#f1c40f', '#1f1f1f'];
  for (let k = 0; k < 14; k++) {
    const x = 188 + k * 13.5 + (k % 3) * 1.1; if (x > 376) break;
    const o = civico.modeloCarro(tipos[k % 3], cores[(k * 5) % cores.length]); o.position.set(x + 2.2, 0.02, -678 + (k % 2 ? 1.2 : -1.2)); o.rotation.y = k % 2 ? 0 : Math.PI; scene.add(o);
    mundo.addCol({ tipo: 'caixa', x0: x + 1.2, x1: x + 3.2, z0: -680.4, z1: -675.6 });
  }
}
// aviões parados (decoração), com colisão ao longo da fuselagem e das asas
function montarAvioesParados() {
  for (const [porte, x, z, ang] of AVIOES_PARADOS) {
    const P = PORTES[porte];
    const frota = x > 200 && z < -700 && z > -760;   // os da Metrópole são a frota dos pilotos
    const o = { porte, x, z, ang, mesh: null, cols: [], frota, fid: frota ? aviaoParado.filter((q) => q.frota).length : -1 }; aviaoParado.push(o);
    const comp = { pequeno: 9, medio: 20, grande: 32 }[porte], env = { pequeno: 10, medio: 20, grande: 30 }[porte];
    for (let k = -0.4; k <= 0.41; k += 0.2) o.cols.push({ tipo: 'circ', x: x + Math.sin(ang) * comp * k, z: z + Math.cos(ang) * comp * k, r: P.raio * 0.55 });
    for (const lado of [-1, 1]) o.cols.push({ tipo: 'circ', x: x + Math.cos(ang) * env * 0.3 * lado, z: z - Math.sin(ang) * env * 0.3 * lado, r: P.raio * 0.4 });
    o.cols.forEach((c) => mundo.addCol(c));
    if (frota) { const r = textoSprite(`🛩️ Avião ${P.nome} · pilotos`, { escala: 0.9, fundo: 'rgba(43,95,168,.92)' }); r.position.set(x, { pequeno: 5, medio: 9, grande: 13 }[porte], z); scene.add(r); o.placa = r; }
  }
}
// avião da frota mais perto do jogador (a pé), para pilotar
const ALCANCE_AVIAO = { pequeno: 10, medio: 15, grande: 21 };
function aviaoFrotaPerto() {
  let m = null, dm = Infinity;
  for (const o of aviaoParado) { if (!o.frota) continue; const d = Math.hypot(o.x - jogador.pos.x, o.z - jogador.pos.z); if (d < ALCANCE_AVIAO[o.porte] && d < dm) { dm = d; m = o; } }
  return m;
}
const aviaoLivre = (porte) => aviaoParado.find((o) => o.frota && o.porte === porte && jogador.carro?.vaga !== o);
// ---- revisão da frota: cada avião conta os voos desde a última revisão (no servidor, igual para todos)
const frotaVoos = {}; let tempoFrota = 0;
const REVISAO_PRECO = { pequeno: 2000, medio: 4000, grande: 8000 };
function placaFrota(o) {
  const v = frotaVoos[o.fid] ?? 0, P = PORTES[o.porte], chave = `${v >= 3 ? 'x' : v}`;
  if (o.placaChave === chave) return; o.placaChave = chave;
  if (o.placa) scene.remove(o.placa);
  const r = textoSprite(v >= 3 ? `⚠️ Avião ${P.nome} · revisão vencida (${v} voos)` : `🛩️ Avião ${P.nome} · ${v}/3 voos`, { escala: 0.9, fundo: v >= 3 ? 'rgba(190,50,30,.95)' : 'rgba(43,95,168,.92)' });
  r.position.set(o.x, { pequeno: 5, medio: 9, grande: 13 }[o.porte], o.z); scene.add(r); o.placa = r;
}
function atualizarFrota(dt) {
  if ((tempoFrota -= dt) > 0) return; tempoFrota = 15;
  if (jogador.perfil?.profissao === 'mecanico') rede.aviacao.helis().then((l) => { for (const a of l || []) heliVoos[a.chave] = a.voos; }).catch(() => {});
  if (Math.hypot(jogador.pos.x - 330, jogador.pos.z - 760) > 700) return;
  rede.aviacao.frota().then((l) => { for (const a of l || []) frotaVoos[a.id] = a.voos; for (const o of aviaoParado) if (o.frota) placaFrota(o); }).catch(() => {});
}
// no chão perto de um avião da frota: pilotar, revisão com o mecânico do hangar ou (mecânico jogador) fazer a revisão
function menuAviaoFrota(fa) {
  const v = frotaVoos[fa.fid] ?? 0, P = PORTES[fa.porte], mec = jogador.perfil?.profissao === 'mecanico' || jogador.perfil?.cargo === 'admin';
  const revisar = (mecanico) => rede.aviacao.revisar(fa.fid, mecanico).then((r) => { frotaVoos[fa.fid] = 0; placaFrota(fa); aviso(mecanico ? `🔧 Revisão feita! +${r}` : `🔧 O mecânico do hangar revisou o avião (${num(r)}).`, 4); }).catch((e) => aviso(e.message, 3));
  const ops = [{ rotulo: `✈️ Pilotar o avião ${P.nome}${v >= 3 ? ' (⚠️ revisão vencida: pode falhar no ar)' : ''}`, fn: () => pegarAviao(fa) }];
  if (v > 0) ops.push({ rotulo: `🔧 Revisão com o mecânico do hangar (${num(REVISAO_PRECO[fa.porte])})`, fn: () => revisar(false) });
  if (mec && v > 0) ops.push({ rotulo: '🔧 Fazer a revisão eu mesmo (+300)', fn: () => revisar(true) });
  escolher(`🛩️ Avião ${P.nome}`, `${v} voo(s) desde a última revisão. A revisão é a cada 3 voos; depois disso, cada voo tem mais chance de o motor falhar no ar.`, ops);
}
function atualizarAvioesParados() {
  for (const o of aviaoParado) {
    const uso = !!jogador.carro?.aviao && jogador.carro.vaga === o;   // o que estou pilotando some da vaga e libera a colisão
    if (o.mesh) o.mesh.visible = !uso; if (o.placa) o.placa.visible = !uso; for (const c of o.cols) c.off = uso;
    if (o.mesh || !modelos[PORTES[o.porte].modelo]) continue;
    o.mesh = civico.modeloCarro(PORTES[o.porte].modelo, '#ffffff'); o.mesh.position.set(o.x, alturaChao(o.x, o.z), o.z); o.mesh.rotation.y = o.ang; scene.add(o.mesh);
  }
}
// atendentes nos balcões de passagens (NPC parado, só decoração)
function montarAtendentes() {
  const ids = PERSONAGENS.map((p) => p.id);
  AEROPORTOS.forEach((a, k) => {
    if (!a.atendente) return;
    criarAvatar('personagens', ids[(k * 7 + 3) % ids.length]).then((av) => {
      av.raiz.position.set(a.atendente.x, alturaChao(a.atendente.x, a.atendente.z), a.atendente.z); av.raiz.rotation.y = a.atendente.yaw; av.tocar('idle'); scene.add(av.raiz);
      const et = textoSprite('Atendente', { escala: 0.5, fundo: 'rgba(43,95,168,.95)' }); et.position.y = 2.2; av.raiz.add(et);
      atendentes.push(av);
    }).catch(() => {});
  });
  // mecânico do hangar (NPC): faz a revisão dos aviões da frota, cobrando do piloto
  criarAvatar('personagens', ids[11 % ids.length]).then((av) => {
    const m = MECANICO_HANGAR; av.raiz.position.set(m.x, alturaChao(m.x, m.z), m.z); av.raiz.rotation.y = Math.PI; av.tocar('idle'); scene.add(av.raiz);
    const et = textoSprite('🔧 Mecânico', { escala: 0.5, fundo: 'rgba(200,120,20,.95)' }); et.position.y = 2.2; av.raiz.add(et);
    atendentes.push(av);
  }).catch(() => {});
}
const atendentes = [];
// mapa: pistas, pátio, terminal e cerca
function desenharAeroNoMapa(g, a) {
  const c = a.cerca, p = pista(a), ex = a.eixo === 'x';
  g.fillStyle = '#9cbf6e'; g.fillRect(c.x0, c.z0, c.x1 - c.x0, c.z1 - c.z0);
  g.strokeStyle = '#d9dde2'; g.lineWidth = 1.5; g.strokeRect(c.x0, c.z0, c.x1 - c.x0, c.z1 - c.z0);
  g.fillStyle = '#34373d';
  if (ex) g.fillRect(p.ini.x - 10, a.c - a.larg / 2, p.len + 20, a.larg); else g.fillRect(a.c - a.larg / 2, Math.min(p.ini.z, p.fim.z) - 10, a.larg, p.len + 20);
  g.fillStyle = '#f2f2f2'; for (let k = 14; k < p.len - 14; k += 24) { if (ex) g.fillRect(p.ini.x + k, a.c - 0.6, 12, 1.2); else g.fillRect(a.c - 0.6, Math.min(p.ini.z, p.fim.z) + k, 1.2, 12); }
  if (ex) {
    g.fillStyle = '#3d4047'; g.fillRect(148, -773, 345, 16); for (const x of [150, 300, 490]) g.fillRect(x - 8, -786, 16, 22);
    g.fillStyle = '#a9a59c'; g.fillRect(195, -757, 300, 43);
    g.fillStyle = '#4a4e57'; g.fillRect(157, -688, 10, 34); g.fillRect(157, -672.5, 248, 9); g.fillRect(395.5, -692, 9, 29); g.fillRect(157, -692.5, 328, 9);
    g.fillStyle = '#2b5fa8'; g.fillRect(280, -712, 80, 18); g.fillStyle = '#e9e6df'; g.fillRect(402, -704, 6, 6); g.fillStyle = '#8d99a6'; g.fillRect(430, -716, 70, 24);
    g.fillStyle = '#f2f2f2'; for (const [, x, z] of AVIOES_PARADOS.slice(0, 4)) { g.fillRect(x - 1.5, z - 10, 3, 20); g.fillRect(x - 9, z - 2, 18, 3); }
  } else {
    g.fillStyle = '#a9a59c'; g.fillRect(-243, a.vaga.z - Math.sign(a.vaga.z) * 18 - 32, 30, 64);
    g.fillStyle = '#7a6448'; g.fillRect(a.estrada[1][0], a.estrada[0][1] - 3, a.estrada[0][0] - a.estrada[1][0], 6);
    g.fillStyle = '#2b5fa8'; g.fillRect(-207.5, a.balcao.z - 4, 7, 8);
  }
}
// ---- rádio: a torre fala com os aviões (voos do sistema e pilotos jogadores)
const radioLinhas = [];
function radio(quem, texto) {
  radioLinhas.push({ quem, texto, t: performance.now() }); while (radioLinhas.length > 4) radioLinhas.shift();
  if (emVoo() && (quem === 'torre' || /arremet/i.test(texto))) vooFlash = performance.now() + 3500;   // a torre falou: a barra abre um instante
  sons.radio?.(); desenharRadio();
}
function desenharRadio() {
  let el = $('radio');
  if (!el) {
    el = document.createElement('div'); el.id = 'radio';
    el.style.cssText = 'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 31vh);max-width:min(80vw,430px);z-index:9;pointer-events:none;font:600 12.5px system-ui;color:#e9f5ff;display:flex;flex-direction:column;gap:3px';
    document.body.appendChild(el);
  }
  const agora = performance.now();
  for (let k = radioLinhas.length - 1; k >= 0; k--) if (agora - radioLinhas[k].t > 14000) radioLinhas.splice(k, 1);
  if (emVoo()) { el.innerHTML = ''; desenharBarraVoo(); return; }   // no avião o rádio sai na barra do topo
  el.innerHTML = radioLinhas.map((l) => `<div style="background:rgba(14,22,34,.82);border-left:3px solid ${l.quem === 'torre' ? '#7dff8a' : '#ffd23e'};border-radius:7px;padding:4px 8px;opacity:${Math.min(1, (14000 - (agora - l.t)) / 2000)}">📻 ${esc(l.texto)}</div>`).join('');
}
// quem escuta: quem está na torre (rádio da Metrópole) e quem está num avião perto do aeroporto (pousando ou decolando)
function ouveRadio(a) {
  if (a.id === 'metro' && naTorre()) return true;
  if (!jogador.voo && !jogador.carro?.aviao) return false;
  const p = pista(a), cx = (p.ini.x + p.fim.x) / 2, cz = (p.ini.z + p.fim.z) / 2;
  return Math.hypot(cx - jogador.pos.x, cz - jogador.pos.z) < 650;
}
const FALAS = {
  push: (cs, a) => [['piloto', `${cs}: ${a.torreNome}, ${cs} pronto no portão, solicito pushback.`], ['torre', `${a.torreNome}: ${cs}, pushback autorizado.`]],
  taxi: (cs, a) => [['torre', `${a.torreNome}: ${cs}, táxi até a cabeceira ${a.cab}.`]],
  alinha: (cs, a) => [['torre', `${a.torreNome}: ${cs}, vento calmo, pista ${a.cab} livre, autorizado decolar.`], ['piloto', `${cs}: Autorizado decolar, ${cs}.`]],
  subida: (cs, a) => [['piloto', `${cs}: No ar, subindo. Obrigado, ${a.torreNome}!`]],
  final: (cs, a) => [['piloto', `${cs}: ${a.torreNome}, ${cs} na final da pista ${a.cab}.`], ['torre', `${a.torreNome}: ${cs}, pista livre, autorizado pouso.`]],
  livra: (cs, a) => [['torre', `${a.torreNome}: ${cs}, bem-vindo! Livre a pista e siga para o portão.`]],
};
// ---- voos do sistema: quadros-chave (posição, altura) montados a partir de pontos e velocidades
function trechoQuadros(o, d, { espera = 75, saida = null, taxiIn = null, vaga = null, rota = null } = {}) {
  const A = AERO[o], B = AERO[d], po = pista(A), pd = pista(B);
  const q = [{ t: 0, ...(vaga?.o || A.vaga), y: 0 }];
  const ult = () => q[q.length - 1];
  const ir = (p, v, y = 0, extra = {}) => { const u = ult(), dist = Math.hypot(p.x - u.x, p.z - u.z, (y - u.y) * 0.5); q.push({ t: u.t + Math.max(0.3, dist / v), x: p.x, z: p.z, y, ...extra }); };
  const parar = (s, extra = {}) => { const u = ult(); q.push({ ...u, t: u.t + s, re: 0, ar: 0, fala: null, ...extra }); };
  parar(espera, { embarque: 1 });
  const out = rota?.out || A.taxiOut;
  out.forEach((p, i) => ir(p, p.re ? 3 : 7, 0, { re: p.re ? 1 : 0, fala: i === 0 ? (p.re ? 'push' : 'taxi') : i === 1 && out[0].re ? 'taxi' : null, aero: o }));
  ir(po.ini, 6); parar(5, { fala: 'alinha', aero: o });
  const dir = { x: (po.fim.x - po.ini.x) / po.len, z: (po.fim.z - po.ini.z) / po.len };
  ir({ x: po.ini.x + dir.x * po.len * 0.55, z: po.ini.z + dir.z * po.len * 0.55 }, 12);
  ir(po.fim, 24, 14, { fala: 'subida', aero: o });
  const dirD = { x: (pd.fim.x - pd.ini.x) / pd.len, z: (pd.fim.z - pd.ini.z) / pd.len };
  if (rota?.longe) { ir(rota.longe.ida, 50, 140, { ar: 1 }); parar(rota.longe.fora, { oculto: 1 }); q.push({ ...rota.longe.volta, y: 140, t: ult().t + 0.3, oculto: 1 }); }
  ir({ x: pd.ini.x - dirD.x * 320, z: pd.ini.z - dirD.z * 320 }, 45, 45, { ar: rota?.longe ? 0 : 2 });
  ir(pd.ini, 34, 0, { fala: 'final', aero: d });
  ir(saida || B.saida, 14);
  (taxiIn || B.taxiIn).forEach((p, i) => ir(p, i === (taxiIn || B.taxiIn).length - 1 ? 4 : 7, 0, i === 0 ? { fala: 'livra', aero: d } : {}));
  return q;
}
function montarTabela(trechos) {
  let t0 = 0; for (const tr of trechos) { tr.ini = t0; t0 += tr.q[tr.q.length - 1].t; }
  return { trechos, ciclo: t0 };
}
const VOO_REGULAR = montarTabela([['metro', 'serra'], ['serra', 'metro'], ['metro', 'porto'], ['porto', 'metro']].map(([o, d]) => ({ o, d, q: trechoQuadros(o, d) })));
// voo internacional (avião grande): sai da Metrópole para leste, some no horizonte e volta pelo oeste
const VAGA_INTER = { x: 385, z: -735 };
const VOO_INTER = montarTabela([{ o: 'metro', d: 'metro', q: trechoQuadros('metro', 'metro', {
  espera: 60, vaga: { o: VAGA_INTER }, saida: { x: 470, z: -800 },
  taxiIn: [{ x: 490, z: -768 }, { x: 385, z: -765 }, { x: 385, z: -735 }],
  rota: { out: [{ x: 385, z: -765, re: 1 }, { x: 150, z: -765 }, { x: 146, z: -800 }], longe: { ida: { x: 1300, z: -760 }, fora: 70, volta: { x: -1300, z: -820 } } },
}) }]);
VOO_REGULAR.cs = 'Fator 2'; VOO_INTER.cs = 'Fator 9';
// desloca o internacional para usar a pista quando o regular não está nela
VOO_INTER.desloc = (() => {
  const naPista = (tab, d, u) => { const v = vooNpc(u, tab, d); return v && v.y < 1 && pistaEm(v.x, v.z)?.id === 'metro'; };
  let melhor = 0, menor = Infinity;
  for (let d = 0; d < VOO_REGULAR.ciclo; d += 7) {
    let n = 0; for (let u = 0; u < VOO_REGULAR.ciclo * 3; u += 3) if (naPista(VOO_REGULAR, 0, u) && naPista(VOO_INTER, d, u)) n++;
    if (n < menor) { menor = n; melhor = d; }
  }
  return melhor;
})();
function vooNpc(seg, tab = VOO_REGULAR, desloc = 0) {
  const s = seg - desloc, ciclo = Math.floor(s / tab.ciclo), u = s - ciclo * tab.ciclo;
  let k = tab.trechos.length - 1; for (let i = 0; i < tab.trechos.length; i++) if (u < tab.trechos[i].ini + tab.trechos[i].q[tab.trechos[i].q.length - 1].t) { k = i; break; }
  const tr = tab.trechos[k], e = u - tr.ini, q = tr.q;
  let i = 0; while (i < q.length - 2 && e > q[i + 1].t) i++;
  const a = q[i], b = q[i + 1], f = THREE.MathUtils.clamp((e - a.t) / Math.max(0.001, b.t - a.t), 0, 1), s2 = b.ar ? f : THREE.MathUtils.smoothstep(f, 0, 1);
  const y = a.y + (b.y - a.y) * s2 + (b.ar === 2 ? Math.sin(f * Math.PI) * 20 : 0);
  const parado = Math.hypot(b.x - a.x, b.z - a.z) < 0.1;
  // parado: aponta para onde vai andar depois (gira na cabeceira antes de decolar)
  let ang = Math.atan2(b.x - a.x, b.z - a.z), re = !!b.re;
  if (parado) { for (let j = i + 1; j < q.length - 1; j++) { const c = q[j], n = q[j + 1]; if (Math.hypot(n.x - c.x, n.z - c.z) > 0.1) { ang = Math.atan2(n.x - c.x, n.z - c.z); re = !!n.re; break; } } }
  if (re) ang += Math.PI;
  return { x: a.x + (b.x - a.x) * s2, z: a.z + (b.z - a.z) * s2, y, ang, parado, oculto: !!b.oculto, subindo: (b.y - a.y) / Math.max(1, Math.hypot(b.x - a.x, b.z - a.z)),
    embarque: !!b.embarque, o: tr.o, d: tr.d, id: `${ciclo}.${k}`, n: ciclo * tab.trechos.length + k, seg: i, fala: b.fala, aeroFala: b.aero,
    falta: q[1].t - e, fim: tr.ini + q[q.length - 1].t - u };
}
const npcAvioes = [
  { tab: VOO_REGULAR, porte: 'medio', mesh: null, ang: 0, ult: null },
  { tab: VOO_INTER, porte: 'grande', mesh: null, ang: 0, ult: null },
];
const vooRegular = () => vooNpc(agoraServidor() / 1000, VOO_REGULAR, 0);
// ---- passageiro do voo regular
function balcaoPerto() { return AEROPORTOS.find((a) => Math.hypot(a.balcao.x - jogador.pos.x, a.balcao.z - jogador.pos.z) < 3.2) || null; }
function portaoPerto() { return AEROPORTOS.find((a) => Math.hypot(a.portao.x - jogador.pos.x, a.portao.z - jogador.pos.z) < 7) || null; }
// próximo embarque do voo regular de o para d (janela em que o avião fica parado no portão)
function proximoEmbarque(o, d, seg) {
  const tab = VOO_REGULAR, c0 = Math.floor(seg / tab.ciclo);
  for (let c = c0; c <= c0 + 2; c++) for (const tr of tab.trechos) {
    if (tr.o !== o || tr.d !== d) continue;
    const ini = c * tab.ciclo + tr.ini, fim = ini + tr.q[1].t;
    if (seg < fim) return { ini, fim };
  }
  return null;
}
let painelPassagem = false;
function guiarPassageiro() {
  const p = jogador.passagem;
  if (jogador.voo) { const v = vooRegular(); painelVoo(`✈️ Em voo para ${AERO[jogador.voo.d].nome} · chegada em ${Math.max(0, Math.ceil(v.fim))} s`); painelPassagem = true; return; }
  if (!p || jogador.carro) { if (painelPassagem) { painelPassagem = false; painelVoo(''); } return; }
  const seg = agoraServidor() / 1000, e = proximoEmbarque(p.de, p.para, seg), a = AERO[p.de]; if (!e) return;
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const noPortao = Math.hypot(a.portao.x - jogador.pos.x, a.portao.z - jogador.pos.z) < 7;
  painelVoo(seg >= e.ini ? `🎫 Voo para ${AERO[p.para].nome}: EMBARQUE AGORA no portão ✈️ de ${a.nome} — sai em ${Math.ceil(e.fim - seg)} s${noPortao ? ' (toque em Embarcar)' : ''}`
    : `🎫 Voo para ${AERO[p.para].nome}: o avião chega ao portão ✈️ de ${a.nome} em ${mmss(e.ini - seg)}${noPortao ? ' — espere aqui' : ' — siga a marcação'}`);
  painelPassagem = true;
  if (!noPortao && !rastreio) rastrear({ nome: `✈️ Portão de embarque (${a.nome})`, x: a.portao.x, z: a.portao.z });
}
function comprarPassagem(a) {
  const destinos = AEROPORTOS.filter((x) => x.id !== a.id && VOO_REGULAR.trechos.some((t) => t.o === a.id && t.d === x.id));
  escolher('🎫 Passagem aérea · 150', `Saindo de ${a.nome}. O voo regular para no portão; embarque quando ele chegar.`, destinos.map((d) => ({
    rotulo: `✈️ ${d.nome} · embarque ${(() => { const e = proximoEmbarque(a.id, d.id, agoraServidor() / 1000); if (!e) return ''; const f = e.ini - agoraServidor() / 1000; return f <= 0 ? 'agora' : `em ${Math.floor(f / 60)}:${String(Math.floor(f % 60)).padStart(2, '0')}`; })()}`, fn: async () => { try { await rede.transporte.passagem(); jogador.passagem = { de: a.id, para: d.id }; rastrear({ nome: `✈️ Portão de embarque (${a.nome})`, x: a.portao.x, z: a.portao.z }); aviso(`🎫 Passagem para ${d.nome}! Siga a marcação até o portão ✈️; o painel no alto mostra quando o avião chega.`, 5); } catch (e) { aviso(e.message); } },
  })));
}
function embarcarVoo(v) { jogador.voo = { id: v.id, d: v.d }; jogador.passagem = null; jogador.avatar.raiz.visible = false; aviso(`✈️ Embarcou! Voo ${VOO_REGULAR.cs}${String(v.n % 100).padStart(2, '0')} para ${AERO[v.d].nome}.`, 3); }
function seguirVoo() {
  const v = vooRegular();
  if (v.id !== jogador.voo.id) {   // chegou
    const g = AERO[jogador.voo.d].portao; jogador.voo = null; jogador.pos.set(g.x + 2, alturaChao(g.x, g.z), g.z); jogador.avatar.raiz.visible = true;
    aviso('🛬 Chegamos! Bem-vindo.', 3); return;
  }
  jogador.pos.set(v.x, alturaChao(v.x, v.z), v.z); jogador.vooY = v.y;
}
// ---- piloto jogador
const ehPiloto = () => jogador.perfil?.profissao === 'piloto' || jogador.perfil?.cargo === 'admin';
const ehControlador = () => jogador.perfil?.profissao === 'controlador' || jogador.perfil?.cargo === 'admin';
function portesLiberados() {
  if (jogador.perfil?.cargo === 'admin') return ['pequeno', 'medio', 'grande'];
  const n = jogador.patenteNivel || 1; return n >= 3 ? ['pequeno', 'medio', 'grande'] : n >= 2 ? ['pequeno', 'medio'] : ['pequeno'];
}
function pegarAviao(o) {
  if (!ehPiloto()) { abrirServico('piloto'); return; }
  if (o) {
    if (!portesLiberados().includes(o.porte)) { aviso(`O avião ${PORTES[o.porte].nome} libera com a carreira (Piloto = médio, Comandante = grande). Pegue o pequeno.`, 4); return; }
    entrarAviao(o.porte, o); return;
  }
  escolher('🛩️ Hangar', 'Escolha o avião (o porte libera com a carreira: Piloto = médio, Comandante = grande).', portesLiberados().map((p) => ({ rotulo: `✈️ Avião ${PORTES[p].nome}`, fn: () => entrarAviao(p) })));
}
const prefixo = () => `PR-${(jogador.perfil?.nome || 'FTR').normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X')}`;
// admin: testa qualquer veículo do jogo (some ao sair; aviões saem da frota do aeroporto)
function testarVeiculo(modelo) {
  if (jogador.perfil?.cargo !== 'admin') { aviso('Só o administrador testa veículos.'); return; }
  if (jogador.carro) { sairCarro(); if (jogador.carro) return; }
  if (jogador.carregando) { aviso('Largue a caixa antes de dirigir.'); return; }
  const C = civico.CARROS[modelo]; if (!C) return;
  if (modelo.startsWith('aviao_')) {
    const porte = modelo.slice(6), o = aviaoLivre(porte);
    if (o) { jogador.dentroCasa = null; teleportar(o.x, o.z + 12); }
    entrarAviao(porte, o); return;
  }
  const mesh = civico.modeloCarro(modelo, '#c8202a'); mesh.position.set(jogador.pos.x, alturaChao(jogador.pos.x, jogador.pos.z), jogador.pos.z); mesh.rotation.y = jogador.yaw; scene.add(mesh);
  if (jogador.armado) alternarArma();
  modoVolante(true);
  const grande = /onibus|caminhao|bombeiros|tanque/.test(modelo);
  jogador.carro = { id: 't' + jogador.perfil.id.slice(0, 8), teste: true, servico: modelo === 'tanque' ? 'tanque' : undefined, modelo, cor: '#c8202a', vel: 0, mesh, salvar: 1e9, max: C.vel, raio: modelo.startsWith('helicoptero') ? 2.2 : grande ? 1.9 : 1.3, voa: !!C.voa, alt: 0 };
  jogador.alvo = null; jogador.avatar.raiz.visible = false;
  document.body.classList.toggle('tanque', modelo === 'tanque');
  if (modelo === 'tanque' && TOQUE) $('btTiro').classList.remove('oculto');
  if (!C.voa) somPartida(jogador.carro);
  aviso(`🧪 Testando: ${C.nome}. Saia do veículo para guardá-lo.`, 3);
}
function entrarAviao(porte, parado = aviaoLivre(porte)) {
  const P = PORTES[porte], a = AERO.metro, x = parado ? parado.x : a.spawn.x, z = parado ? parado.z : a.spawn.z, yaw = parado ? parado.ang + Math.PI : Math.PI;
  const mesh = civico.modeloCarro(P.modelo, '#ffffff'); mesh.position.set(x, 0, z); mesh.rotation.y = yaw; scene.add(mesh);
  if (jogador.armado) alternarArma();
  modoVolante(true); document.body.classList.add('aviao');
  jogador.carro = { id: 'a' + jogador.perfil.id.slice(0, 8), servico: 'aviao', pitch: 0, vs: 0, aviao: true, porte, modelo: P.modelo, cor: '#ffffff', vel: 0, mesh, salvar: 1e9, max: P.vmax, raio: P.raio, voa: true, alt: 0, vaga: parado };
  if (parado) { for (const c of parado.cols) c.off = true; if (parado.mesh) parado.mesh.visible = false; }
  jogador.pos.set(x, 0, z); jogador.yaw = yaw; if (rastreio?.frota) rastrear(null);
  if (parado?.frota && (frotaVoos[parado.fid] ?? 0) >= 3) setTimeout(() => aviso(`⚠️ Este avião está com a revisão vencida (${frotaVoos[parado.fid]} voos). O motor pode falhar no ar. Revise com o mecânico do hangar.`, 6), 1200); jogador.alvo = null; jogador.avatar.raiz.visible = false;
  aviso(`✈️ Avião ${P.nome} (${prefixo()}): o manche amarelo (no PC, setas) vira e sobe/desce; os pedais aceleram (no PC, W/S). Taxie até a cabeceira ${a.cab}, acelere até ${P.vdec} m/s e puxe o manche (▼). Solto, ele mantém a altura.`, 8);
}
function pilotarAviao(c, dt) {
  const P = PORTES[c.porte];
  // PC: W/S = motor, setas ↑/↓ = manche (↑ empurra, ↓ puxa), A/D ou ←/→ = inclinar. Celular: pedais = motor, manche amarelo = direção.
  let acel = pedais.acel || teclas.has('w'), freio = pedais.freio || teclas.has('s');
  let lado = THREE.MathUtils.clamp(manche.x + (pedais.dir || teclas.has('d') || teclas.has('arrowright') ? 1 : 0) - (pedais.esq || teclas.has('a') || teclas.has('arrowleft') ? 1 : 0), -1, 1);
  let puxa = THREE.MathUtils.clamp(manche.y + (teclas.has('arrowdown') ? 1 : 0) - (teclas.has('arrowup') ? 1 : 0), -1, 1);   // + = nariz para cima
  if (c.noAr) {
    c.tVoo = (c.tVoo || 0) + dt;
    if (c.falhaEm && !c.motorParado && c.tVoo > c.falhaEm) {
      c.motorParado = true; desligarAP(c); tremor = 0.4;
      radio('piloto', `${prefixo()}: MAYDAY, MAYDAY! Falha no motor!`);
      aviso(`🔥 FALHA NO MOTOR! O avião estava sem revisão. Plane até uma pista ou um campo aberto${qtdItem('paraquedas') ? ', ou ejete (🪂)' : ''}.`, 6);
    }
  }
  if (c.motorParado) { acel = false; if (c.noAr) c.vel = Math.max(0, c.vel - 1.2 * dt); }
  if (c.ap) {
    if (acel || freio || Math.abs(lado) > 0.5 || Math.abs(puxa) > 0.5) desligarAP(c, '🕹️ Você assumiu o controle. Piloto automático desligado.');
    else {
      const u = pilotoAutomatico(c, dt, P); if (!jogador.carro) return;
      if (c.noAr) {   // olha à frente e sobe para passar por cima dos prédios
        const topo = predioAFrente(c, 5), falta = topo + 15 - (alturaChao(jogador.pos.x, jogador.pos.z) + c.alt);
        if (topo > 0 && falta > 0) { u.puxa = Math.max(u.puxa, THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(Math.min(6, falta * 0.8) / Math.max(c.vel, 1), 0, 0.32)) / 0.32, 0, 1)); u.acel = true; u.freio = false; }
      }
      ({ acel, freio, lado, puxa } = u);
    }
  }
  c.volante = (c.volante || 0) + (lado - (c.volante || 0)) * Math.min(1, dt * 4);
  const pe = pistaEm(jogador.pos.x, jogador.pos.z), suave = (alvo, taxa) => { c.pitch += THREE.MathUtils.clamp(alvo - c.pitch, -taxa * dt, taxa * dt); };
  if (!c.noAr) {
    const lim = pe && c.liberado ? P.vmax : 10;
    if (acel && !freio) c.vel = Math.min(lim, c.vel + (pe ? 6 : 3) * dt); else if (freio) c.vel = Math.max(0, c.vel - 10 * dt); else c.vel = Math.max(0, c.vel - (c.vel > 10 ? 4 : 2) * dt);
    if (pe && !c.liberado && acel) pedirTorre(c, 'decolagem');
    jogador.yaw -= c.volante * 1.1 * Math.min(1, c.vel / 3) / (1 + c.vel / 15) * dt;
    jogador.pos.x += Math.sin(jogador.yaw) * c.vel * dt; jogador.pos.z += Math.cos(jogador.yaw) * c.vel * dt;
    resolverColisao(jogador.pos, Math.min(3, P.raio));
    // rotação: com velocidade, puxar o manche levanta o nariz; sem velocidade a roda do nariz fica no chão
    suave(c.vel >= P.vdec * 0.85 && puxa > 0.15 ? 0.16 * puxa : 0, 0.5);
    if (!pe && c.vel > 16) { acidenteVeiculo(c, '💥 O avião saiu da pista em alta velocidade!'); return; }
    if (pe && c.liberado && c.vel >= P.vdec && c.pitch > 0.07) {
      if (c.vaga?.frota) rede.aviacao.voo(c.vaga.fid).then((v) => { frotaVoos[c.vaga.fid] = v; placaFrota(c.vaga); if (v > 3 && Math.random() < Math.min(0.9, 0.15 * (v - 3))) c.falhaEm = 15 + Math.random() * 35; }).catch(() => {});
      c.tVoo = 0;
      if (c.aula) c.aula.decolou = true; c.destino = c.ap?.destino || destinoVoo(pe, c.porte); c.noAr = true; c.alt = 0.4; c.origem = pe.id; c.liberado = false; c.pedido = null; c.avisoEstol = false;
      radio('piloto', `${prefixo()}: No ar, subindo!`); aviso('🛫 Decolou! Manche puxado sobe, empurrado desce, solto mantém a altura.', 4);
    }
    c.vs = 0;
  } else {
    const estol = c.vel < P.vdec * 0.8;
    // auto-pouso (botão POUSAR): desce ~3,5 m/s e reduz; o manche ainda corrige
    let desceAuto = 0;
    if (c.pousar) {   // segue a rampa da faixa amarela (12 m de altura a cada 100 m até a cabeceira)
      const pa = pista(AERO[c.destino] || aeroProximo()), ux = (pa.fim.x - pa.ini.x) / pa.len, uz = (pa.fim.z - pa.ini.z) / pa.len;
      const falta = Math.max(0, -((jogador.pos.x - pa.ini.x) * ux + (jogador.pos.z - pa.ini.z) * uz));
      const vsAlvo = THREE.MathUtils.clamp((falta * 0.12 - c.alt) * 0.6, -4.5, 1.5);
      desceAuto = Math.asin(THREE.MathUtils.clamp(vsAlvo / Math.max(c.vel, 1), -0.3, 0.3));
    }
    let alvo = estol ? -0.22 : THREE.MathUtils.clamp(desceAuto + puxa * 0.32, -0.32, 0.32);
    if (c.alt > 300 && alvo > 0) alvo = 0;   // teto
    suave(alvo, estol ? 0.6 : 0.45);
    if (estol && !c.avisoEstol) { c.avisoEstol = true; aviso('⚠️ ESTOL: devagar demais! Acelere e empurre o manche.', 3); } else if (!estol) c.avisoEstol = false;
    if (acel && !freio) c.vel += 5 * dt; else if (freio) c.vel -= 6 * dt;
    if (c.pousar && !acel) c.vel = Math.max(P.vdec * 0.9, c.vel - 4 * dt);
    c.vel = THREE.MathUtils.clamp(c.vel - Math.sin(c.pitch) * 9 * dt, P.vdec * 0.6, P.vmax * 1.1);   // subir gasta velocidade, descer ganha
    c.vs = estol ? Math.min(c.vel * Math.sin(c.pitch), -6) : c.vel * Math.sin(c.pitch);
    jogador.yaw -= c.volante * P.giro * dt;
    jogador.pos.x = THREE.MathUtils.clamp(jogador.pos.x + Math.sin(jogador.yaw) * c.vel * Math.cos(c.pitch) * dt, -1300, 1300);
    jogador.pos.z = THREE.MathUtils.clamp(jogador.pos.z + Math.cos(jogador.yaw) * c.vel * Math.cos(c.pitch) * dt, -1400, 1400);
    c.alt = Math.min(320, c.alt + c.vs * dt); c.altRec = Math.max(c.alt, (c.altRec || 0) - 4 * dt);
    { const ch = alturaChao(jogador.pos.x, jogador.pos.z); if (aeronaveEmPredio(c, ch)) return; alertaPredio(c, ch); }
    if (c.pousar && !c.pedidoPouso) { c.pedidoPouso = true; pedirTorre(c, 'pouso'); }
    if (c.alt <= 0.3) {   // tocou o chão
      const ok = pe && alinhado(pe, jogador.yaw) && c.vel <= P.vdec * 1.3 && c.vs > -5 && (c.porte !== 'grande' || pe.grande);
      if (!ok) { acidenteVeiculo(c, !pe ? '💥 O avião caiu fora da pista!' : c.porte === 'grande' && !pe.grande ? '💥 Pista curta demais para o avião grande!' : !alinhado(pe, jogador.yaw) ? '💥 Pouso torto: o avião saiu da pista!' : c.vs <= -5 ? '💥 Pouso duro: desceu rápido demais!' : '💥 Pouso rápido demais!'); return; }
      c.noAr = false; c.pousar = false; c.pedidoPouso = false; c.alt = 0; c.vs = 0; c.pitch = 0; c.vel = Math.min(c.vel, P.vdec);
      if (c.aula && c.aula.decolou) { c.vel = 0; if (c.aula.comAP) encerrarAula(false, '🤖 Pousou no piloto automático: a aula só conta pilotando sozinho. Tente de novo.'); else encerrarAula(true); return; }
      radio('torre', `${pe.torreNome}: ${prefixo()}, bem-vindo! Livre a pista.`);
      if (c.origem && pe.id !== c.origem) rede.transporte.pagarVoo(c.porte).then((v) => aviso(`🛬 Pouso perfeito em ${pe.nome}! +${v} moedas.`, 4)).catch((e) => aviso(`🛬 Pousou em ${pe.nome}. ${e.message || ''}`, 3));
      else aviso(`🛬 Pousou em ${pe.nome}.`, 3);
      c.origem = null;
    }
  }
  const chao = alturaChao(jogador.pos.x, jogador.pos.z);
  jogador.pos.y = chao;
  c.mesh.position.set(jogador.pos.x, chao + c.alt, jogador.pos.z);
  c.mesh.rotation.set(-c.pitch, jogador.yaw, c.noAr ? c.volante * 0.35 : 0, 'YXZ');   // curva para a direita: asa direita abaixa
  jogador.avatar.raiz.position.copy(jogador.pos);
  const bp = $('vPairar'); if (bp) { bp.classList.toggle('ativo', !!c.ap); bp.innerHTML = c.ap ? '🤖<br>DESLIGAR' : '🤖<br>AUTO'; }
}
// ---- rota amarela e instruções para o piloto: no chão leva à cabeceira; no ar mostra a aproximação e a pista
// ---- helicóptero: o analógico leva para onde ele aponta (frente/ré) e vira o nariz (lados); SUBIR e DESCER devagar.
// Solto, ele fica parado no ar. Em cima de prédio ou obstáculo, ele não desce abaixo de 1,5 m (lugar ocupado).
function pilotarHeli(c, dt, max) {
  const toque = Math.abs(manche.x) > 0.05 || Math.abs(manche.y) > 0.05;
  const frente = THREE.MathUtils.clamp((toque ? -manche.y : 0) + (teclas.has('w') || teclas.has('arrowup') ? 1 : 0) - (teclas.has('s') || teclas.has('arrowdown') ? 1 : 0), -1, 1);
  const lado = THREE.MathUtils.clamp((toque ? manche.x : 0) + (teclas.has('d') || teclas.has('arrowright') ? 1 : 0) - (teclas.has('a') || teclas.has('arrowleft') ? 1 : 0), -1, 1);
  let sobe = pedais.acel || teclas.has('r'); const desce = pedais.freio || teclas.has('f');
  if (c.motorParado) sobe = false;
  const noAr = c.alt > 0.3, chao = alturaChao(jogador.pos.x, jogador.pos.z);
  // altura: sobe 3 m/s, desce 2,5 m/s (sem tranco); com o motor falhando, cai a 7 m/s
  const ufo = c.servico === 'ovni', vsAlvo = c.motorParado ? -7 : sobe ? (ufo ? 7 : 3) : desce ? (ufo ? -6 : -2.5) : 0;
  c.vs = (c.vs || 0) + THREE.MathUtils.clamp(vsAlvo - (c.vs || 0), -(ufo ? 10 : 4) * dt, (ufo ? 10 : 4) * dt);
  const altAntes = c.alt; c.alt = Math.min(120, c.alt + c.vs * dt);
  if (c.alt <= 1.5 && c.vs < 0) {   // pousando: precisa de chão livre
    const t = jogador.pos.clone(); mundo.limitar(t);
    const livre = jogador.pos.clone(); resolverColisao(livre, c.raio || 2.2);
    const ocupado = Math.hypot(t.x - jogador.pos.x, t.z - jogador.pos.z) > 2 || Math.hypot(livre.x - jogador.pos.x, livre.z - jogador.pos.z) > 0.6;
    if (ocupado && !c.motorParado) { c.alt = Math.max(c.alt, 1.5); c.vs = 0; if (performance.now() - (c.avisoOcupado || 0) > 3000) { c.avisoOcupado = performance.now(); aviso('🚁 Lugar ocupado: pouse em chão livre.', 2); } }
  }
  if (c.alt <= 0) {   // tocou o chão
    if (c.motorParado && c.vs < -4 && (c.altRec || 0) > 1.5) { acidenteVeiculo(c, '💥 O helicóptero caiu com o motor parado!'); return; }
    c.alt = 0; c.vs = 0; if (c.voou) { c.voou = false; c.tVoo = 0; }
  }
  if (c.alt > 6 && !c.voou) { c.voou = true; c.tVoo = 0; contarVooHeli(c); }
  c.altRec = Math.max(c.alt, (c.altRec || 0) - 4 * dt);
  if (c.voou && !c.motorParado && c.falhaEm) {
    c.tVoo = (c.tVoo || 0) + dt;
    if (c.tVoo > c.falhaEm) { c.motorParado = true; tremor = 0.4; aviso(`🔥 FALHA NO MOTOR! O helicóptero estava sem revisão e está caindo${qtdItem('paraquedas') ? ' — ejete (🪂)!' : '!'}`, 6); }
  }
  // frente/ré e giro (só no ar); no chão fica parado
  const alvoV = noAr ? (frente >= 0 ? frente * max : frente * max * 0.3) : 0;
  c.vel += THREE.MathUtils.clamp(alvoV - c.vel, -5 * dt, 4 * dt);
  c.volante = (c.volante || 0) + (lado - (c.volante || 0)) * Math.min(1, dt * 5);
  if (noAr) jogador.yaw -= c.volante * 1.3 * dt;
  jogador.pos.x = THREE.MathUtils.clamp(jogador.pos.x + Math.sin(jogador.yaw) * c.vel * dt, -890, 700);
  jogador.pos.z = THREE.MathUtils.clamp(jogador.pos.z + Math.cos(jogador.yaw) * c.vel * dt, -1200, 1200);
  // prédios: alarme e batida
  if (noAr && aeronaveEmPredio(c, chao)) return;
  if (noAr) alertaPredio(c, chao);
  const ch2 = alturaChao(jogador.pos.x, jogador.pos.z);
  jogador.pos.y = ch2; c.mesh.position.set(jogador.pos.x, ch2 + c.alt, jogador.pos.z);
  c.mesh.rotation.set(noAr ? c.vel / Math.max(max, 1) * (ufo ? 0.06 : 0.18) : 0, jogador.yaw, noAr ? c.volante * (ufo ? 0.05 : 0.12) : 0, 'YXZ');   // inclina para a frente e para o lado da curva
  const ro = c.mesh.userData.rotor || rotorDe(c.mesh); if (ro) { ro.visible = true; ro.rotation.y += dt * (c.motorParado ? 8 : c.alt > 0.3 || sobe ? 28 : 12); }
  jogador.avatar.raiz.position.copy(jogador.pos);
  const bp = $('vPairar'), revisa = c.alt <= 0 && !!chaveHeli(c) && Math.hypot(MECANICO_HANGAR.x - jogador.pos.x, MECANICO_HANGAR.z - jogador.pos.z) < 35;
  if (bp) { bp.style.display = revisa ? 'block' : 'none'; if (revisa && bp.dataset.rev !== '1') { bp.dataset.rev = '1'; bp.innerHTML = '🔧<br>REVISÃO'; } }
  if (!document.body.classList.contains('heli')) modoHeli(true);
  void altAntes;
}
// ---- revisão do helicóptero (a cada 7 voos): cada um tem o seu contador no servidor
const heliVoos = {}; const PRECO_REVISAO_HELI = 5000;
function chaveHeli(c) { if (!c?.voa || c.aviao || c.teste || c.caminhao) return null; if (c.servico === 'helicoptero_exercito') return 'exercito'; return carrosMundo.has(c.id) ? `carro:${c.id}` : null; }
function contarVooHeli(c) {
  const k = chaveHeli(c); if (!k) return;
  rede.aviacao.vooHeli(k).then((v) => {
    heliVoos[k] = v;
    if (v > 7 && Math.random() < Math.min(0.9, 0.15 * (v - 7))) c.falhaEm = 12 + Math.random() * 30;
    aviso(v > 7 ? `⚠️ Helicóptero com a revisão vencida (${v} voos): o motor pode falhar. Revise com o mecânico do hangar do aeroporto.` : `🚁 Voo ${v}/7 desde a última revisão.`, v > 7 ? 5 : 2.5);
  }).catch(() => {});
}
function menuRevisaoHeli(c) {
  const k = chaveHeli(c); if (!k) return;
  rede.aviacao.helis().then((l) => {
    const v = (l || []).find((x) => x.chave === k)?.voos ?? heliVoos[k] ?? 0; heliVoos[k] = v;
    escolher('🔧 Mecânico do hangar', `Este helicóptero tem ${v} voo(s) desde a última revisão (a revisão é a cada 7 voos).`, v > 0 ? [
      { rotulo: `🔧 Fazer a revisão (${num(PRECO_REVISAO_HELI)})`, fn: () => rede.aviacao.revisarHeli(k, false).then(() => { heliVoos[k] = 0; c.falhaEm = 0; aviso('🔧 Helicóptero revisado!', 3); }).catch((e) => aviso(e.message, 3)) },
      ...(jogador.perfil?.profissao === 'mecanico' ? [{ rotulo: '🔧 Fazer a revisão eu mesmo (+300)', fn: () => rede.aviacao.revisarHeli(k, true).then(() => { heliVoos[k] = 0; c.falhaEm = 0; aviso('🔧 Revisão feita! +300', 3); }).catch((e) => aviso(e.message, 3)) }] : []),
    ] : [{ rotulo: '✅ Já está revisado', fn: () => {} }]);
  }).catch((e) => aviso(e.message, 3));
}
// mecânico jogador, a pé, perto de um helicóptero de jogador pousado
function heliParaRevisar() {
  if (jogador.perfil?.profissao !== 'mecanico' && jogador.perfil?.cargo !== 'admin') return null;
  for (const v of carrosMundo.values()) if (v.d.modelo === 'helicoptero' && v.mesh.visible && Math.hypot(v.mesh.position.x - jogador.pos.x, v.mesh.position.z - jogador.pos.z) < 5) return v;
  return null;
}
// prédios no caminho de aviões e helicópteros: abaixo do telhado = bateu (cai, com as regras de queda)
function aeronaveEmPredio(c, chao) {
  const topo = mundo.topoPredio(jogador.pos.x, jogador.pos.z);
  if (topo > 0 && chao + c.alt < topo - 0.5) { acidenteVeiculo(c, `💥 ${c.aviao ? 'O avião' : 'O helicóptero'} bateu num prédio!`); return true; }
  return false;
}
// alarme: prédio mais alto que você no caminho dos próximos 3 segundos
function predioAFrente(c, seg = 3) {
  let topo = 0; const v = Math.max(Math.abs(c.vel), 4);
  for (let t = 0.5; t <= seg; t += 0.5) topo = Math.max(topo, mundo.topoPredio(jogador.pos.x + Math.sin(jogador.yaw) * v * t, jogador.pos.z + Math.cos(jogador.yaw) * v * t));
  return topo;
}
function alertaPredio(c, chao) {
  const topo = predioAFrente(c);
  if (topo > 0 && chao + c.alt < topo + 3 && performance.now() - (c.avisoPredio || 0) > 2500) { c.avisoPredio = performance.now(); aviso('⚠️ PRÉDIO À FRENTE — SUBA!', 2); sons.tocar('tiro', { vol: 0.15, velocidade: 2.5 }); }
}
// ---- piloto automático: taxia até a cabeceira, pede a decolagem, decola, sobe, voa até o destino, entra na reta final,
// desce pela rampa, arredonda, pousa e freia. Arremete se a chegada ficar ruim (ou se a torre mandar).
// Mexer forte no manche ou nos pedais (ou tocar no botão) devolve o controle.
const RAMPA_AP = 0.1;   // 10 m de altura a cada 100 m até a cabeceira
const pistaAP = (a) => pista(a);   // pousa no mesmo sentido da decolagem (nas cidades, chegando pela beira do mapa)
// altura mínima segura: o prédio mais alto no caminho dos próximos metros (em relação ao chão daqui)
function msaRaio(raio = 600) {   // o prédio mais alto em volta (qualquer direção)
  let topo = 0;
  for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; for (let d = 50; d <= raio; d += 50) topo = Math.max(topo, mundo.topoPredio(jogador.pos.x + Math.sin(a) * d, jogador.pos.z + Math.cos(a) * d)); }
  return topo - alturaChao(jogador.pos.x, jogador.pos.z);
}
function msaAFrente(dist = 700) {
  let topo = mundo.topoPredio(jogador.pos.x, jogador.pos.z);
  for (let d = 25; d <= dist; d += 25) topo = Math.max(topo, mundo.topoPredio(jogador.pos.x + Math.sin(jogador.yaw) * d, jogador.pos.z + Math.cos(jogador.yaw) * d));
  return topo - alturaChao(jogador.pos.x, jogador.pos.z);
}
function escolherAP(c) {
  const ops = AEROPORTOS.filter((a) => c.porte !== 'grande' || a.grande).map((a) => ({ rotulo: `🛬 ${a.nome}${a.id === aeroProximo().id && !c.noAr ? ' (dar uma volta e pousar aqui)' : ''}`, fn: () => ligarAP(c, a.id) }));
  escolher('🤖 Piloto automático', c.noAr ? 'Escolha onde pousar. Ele vai até a reta final, desce, pousa e freia. Mexer no manche ou nos pedais devolve o controle.'
    : 'Escolha o destino. Ele taxia até a cabeceira, pede a decolagem, decola, voa, pousa e para na pista. Mexer no manche ou nos pedais devolve o controle.', ops);
}
function ligarAP(c, destino) {
  if (jogador.carro !== c) return;
  c.ap = { destino, fase: c.noAr ? 'ida' : 'taxi', parado: 0, ultX: jogador.pos.x, ultZ: jogador.pos.z, t: 0 };
  c.pousar = false; c.destino = destino; if (c.aula) c.aula.comAP = true;
  radio('piloto', `${prefixo()}: piloto automático ligado, destino ${AERO[destino].nome}.`);
  aviso(`🤖 Piloto automático: ${AERO[destino].nome}. Mexa no manche ou nos pedais para assumir.`, 4);
}
function desligarAP(c, msg) { if (!c.ap) return; c.ap = null; if (msg) aviso(msg, 3); }
const _ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function textoAP(c) {
  const ap = c.ap, a = AERO[ap.destino], p = pistaAP(a), d = Math.hypot(p.ini.x - jogador.pos.x, p.ini.z - jogador.pos.z);
  const f = { subida: '🛫 subindo', perna: '🛬 perna do vento (descendo ao lado da pista)', curva: '↩️ curvando para a reta final', taxi: '🚕 taxiando até a cabeceira', alinhar: '↪️ entrando na pista', espera: '🗼 esperando a torre', decolagem: '🛫 decolando', ida: `✈️ em cruzeiro para ${a.nome}`, final: '🛬 na reta final', descida: '🛬 descendo pela rampa', arredondar: '🛬 arredondando', freando: '🛑 freando', arremeter: '🔁 arremetendo' }[ap.fase];
  return `🤖 Piloto automático · ${f} · ${Math.round(c.alt)} m · ${Math.round(c.vel)} m/s${c.noAr || ap.fase === 'taxi' ? ` · ${(d / 1000).toFixed(1)} km` : ''}`;
}
function pilotoAutomatico(c, dt, P) {
  const ap = c.ap, u = { acel: false, freio: false, lado: 0, puxa: 0 };
  const virarPara = (h, k = 2.5) => THREE.MathUtils.clamp(-_ang(h - jogador.yaw) * k, -1, 1);   // volante positivo diminui o rumo
  const velAlvo = (v) => { if (c.vel < v - 0.8) u.acel = true; else if (c.vel > v + 2) u.freio = true; };
  const subir = (vs) => { u.puxa = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(vs / Math.max(c.vel, 1), -0.32, 0.32)) / 0.32, -1, 1); };
  ap.t += dt;
  if (!c.noAr) {
    if (ap.fase === 'freando' || (ap.fase !== 'taxi' && ap.fase !== 'alinhar' && ap.fase !== 'espera' && ap.fase !== 'decolagem')) {   // depois do pouso
      ap.fase = 'freando'; u.freio = true; u.lado = 0;
      if (c.vel < 0.3) { c.vel = 0; desligarAP(c, `🤖 Pouso concluído em ${AERO[ap.destino].nome}. O controle é seu: taxie até onde quiser.`); radio('piloto', `${prefixo()}: pousado, livrando a pista.`); }
      return u;
    }
    const a = aeroProximo(), p = pista(a), dir = { x: (p.fim.x - p.ini.x) / p.len, z: (p.fim.z - p.ini.z) / p.len }, hp = Math.atan2(dir.x, dir.z);
    // preso (bateu em algo) por muito tempo: devolve o controle
    const mov = Math.hypot(jogador.pos.x - ap.ultX, jogador.pos.z - ap.ultZ); ap.ultX = jogador.pos.x; ap.ultZ = jogador.pos.z;
    ap.parado = (ap.fase === 'taxi' || ap.fase === 'alinhar') && mov < 0.02 && ap.t > 2 ? ap.parado + dt : 0;
    if (ap.parado > 6) { desligarAP(c, '🤖 O piloto automático não conseguiu taxiar daqui. Leve o avião até a pista e ligue de novo.'); return u; }
    if (ap.fase === 'taxi') {
      if (!ap.rota) { const t = TAXI_ROTA[a.id]; let k = 0, dm = Infinity; t.forEach(([x, z], i) => { const d = Math.hypot(x - jogador.pos.x, z - jogador.pos.z); if (d < dm) { dm = d; k = i; } }); ap.rota = [...t.slice(k), [p.ini.x + dir.x * 6, p.ini.z + dir.z * 6]]; ap.i = 0; }
      // segue a faixa: mira um ponto alguns metros à frente
      let alvo = ap.rota[ap.i];
      while (ap.i < ap.rota.length - 1 && Math.hypot(alvo[0] - jogador.pos.x, alvo[1] - jogador.pos.z) < 7) alvo = ap.rota[++ap.i];
      const dAlvo = Math.hypot(alvo[0] - jogador.pos.x, alvo[1] - jogador.pos.z), h = Math.atan2(alvo[0] - jogador.pos.x, alvo[1] - jogador.pos.z);
      u.lado = virarPara(h, 3); velAlvo(Math.abs(_ang(h - jogador.yaw)) > 0.6 ? 3 : 8);
      if (ap.i === ap.rota.length - 1 && dAlvo < 6) ap.fase = 'alinhar';
      return u;
    }
    // na pista: alinha no eixo, pede a decolagem, espera, acelera e puxa
    const r = { x: jogador.pos.x - p.ini.x, z: jogador.pos.z - p.ini.z }, e = r.x * dir.z - r.z * dir.x;
    const hAlvo = hp - THREE.MathUtils.clamp(e * 0.08, -0.5, 0.5);
    u.lado = virarPara(hAlvo, 3);
    if (ap.fase === 'alinhar') { velAlvo(Math.abs(_ang(hp - jogador.yaw)) > 0.15 ? 2.5 : 0); if (Math.abs(_ang(hp - jogador.yaw)) < 0.12 && c.vel < 1) { ap.fase = 'espera'; pedirTorre(c, 'decolagem'); } return u; }
    if (ap.fase === 'espera') { u.freio = true; if (c.liberado) ap.fase = 'decolagem'; else if (!c.pedido) pedirTorre(c, 'decolagem'); return u; }
    u.acel = true; if (c.vel >= P.vdec * 1.02) u.puxa = 1;   // decolagem
    return u;
  }
  // ---- no ar
  const a = AERO[ap.destino], p = pistaAP(a), dir = { x: (p.fim.x - p.ini.x) / p.len, z: (p.fim.z - p.ini.z) / p.len }, hp = Math.atan2(dir.x, dir.z);
  const r = { x: jogador.pos.x - p.ini.x, z: jogador.pos.z - p.ini.z }, sAt = -(r.x * dir.x + r.z * dir.z), e = r.x * dir.z - r.z * dir.x;   // sAt: metros antes da cabeceira; e: fora do eixo
  const vapp = P.vdec * 1.15, vcruz = P.vmax * 0.85, R = vapp / P.giro;
  const Df = P.cruz / RAMPA_AP + 80, sE = Df + 2.5 * R;   // começo da rampa e ponto de entrada na reta final
  if (ap.fase === 'decolagem') { ap.fase = 'subida'; ap.rumoSubida = jogador.yaw; }
  if (ap.fase === 'subida') {   // sobe reto pelo rumo da pista até passar com folga dos prédios em volta, depois vira
    u.lado = virarPara(ap.rumoSubida ?? jogador.yaw); subir(6); velAlvo(vcruz);
    if ((ap.msaSubida ??= msaRaio(700) + 20) && c.alt > Math.max(35, ap.msaSubida)) { ap.fase = 'ida'; ap.msaSubida = null; }
    return u;
  }
  if (ap.arremeter) { ap.arremeter = false; ap.fase = 'arremeter'; ap.tArr = 0; radio('piloto', `${prefixo()}: arremetendo.`); }
  if (ap.fase === 'arremeter') {   // sobe reto e depois volta para a entrada
    ap.tArr += dt; u.lado = virarPara(jogador.yaw); subir(5); velAlvo(vcruz);
    if (c.alt > Math.min(P.cruz * 0.8, 35) && ap.tArr > 6) { ap.fase = 'ida'; ap.sentido = null; }
    return u;
  }
  const msa = msaAFrente() + 20;
  if (a.eixo === 'z' && (ap.fase === 'ida' || ap.fase === 'perna' || ap.fase === 'curva')) {
    // pistas das cidades: a pista começa perto da beira do mapa, então ele chega pelo lado (perna do vento), desce,
    // passa da cabeceira e faz a curva de 180° já alinhado na reta final curta
    const lado = p.ini.x < 0 ? 1 : -1, Lf = 220, off = 2 * R * lado;
    const A = { x: p.ini.x + off, z: p.ini.z + dir.z * 120 }, B = { x: p.ini.x + off, z: p.ini.z - dir.z * Lf };
    if (ap.fase === 'ida') {
      const dA = Math.hypot(A.x - jogador.pos.x, A.z - jogador.pos.z);
      u.lado = virarPara(Math.atan2(A.x - jogador.pos.x, A.z - jogador.pos.z), 2);
      subir(THREE.MathUtils.clamp((Math.max(dA < 1200 ? 35 : P.cruz, msa) - c.alt) * 0.5, -4, c.alt < msa ? 9 : 5)); velAlvo(dA < 800 ? vapp * 1.12 : vcruz);
      if (dA < Math.max(R, 60)) { ap.fase = 'perna'; pedirTorre(c, 'pouso'); }
      return u;
    }
    if (ap.fase === 'perna') {
      const dB = Math.hypot(B.x - jogador.pos.x, B.z - jogador.pos.z);
      u.lado = virarPara(Math.atan2(B.x - jogador.pos.x, B.z - jogador.pos.z), 2.5);
      subir(THREE.MathUtils.clamp((Math.max(Lf * RAMPA_AP, msa - 5) - c.alt) * 0.5, -4, 3)); velAlvo(vapp * 1.05);
      const passou = (jogador.pos.z - B.z) * -dir.z > -10;   // chegou na altura do ponto de curva
      if (dB < 35 || passou) ap.fase = 'curva';
      return u;
    }
    // curva de 180° para o lado da pista, sempre no mesmo sentido, até ficar alinhado
    const fx = Math.cos(jogador.yaw), fz = -Math.sin(jogador.yaw), cx = p.ini.x - jogador.pos.x;
    u.lado = ap.sentido ?? (ap.sentido = (fx * cx + fz * 0) > 0 ? -1 : 1);
    subir(THREE.MathUtils.clamp((Lf * RAMPA_AP - c.alt) * 0.5, -3, 2)); velAlvo(vapp);
    if (Math.abs(_ang(hp - jogador.yaw)) < 0.3) { ap.fase = 'final'; ap.sentido = null; }
    return u;
  }
  if (ap.fase === 'ida') {   // vai até o ponto de entrada, na altura de cruzeiro (ou acima dos prédios do caminho)
    const E = { x: p.ini.x - dir.x * sE, z: p.ini.z - dir.z * sE }, dE = Math.hypot(E.x - jogador.pos.x, E.z - jogador.pos.z);
    u.lado = virarPara(Math.atan2(E.x - jogador.pos.x, E.z - jogador.pos.z), 2); subir(THREE.MathUtils.clamp((Math.max(P.cruz, msa) - c.alt) * 0.5, -4, c.alt < msa ? 9 : 5));
    velAlvo(dE < 700 ? vapp * 1.15 : vcruz);
    if (dE < Math.max(2 * R, 120) || (sAt > Df && sAt < sE + R && Math.abs(e) < R && Math.abs(_ang(hp - jogador.yaw)) < 0.6)) { ap.fase = 'final'; pedirTorre(c, 'pouso'); }
    return u;
  }
  // reta final: segue o eixo da pista (intercepta com até ~50°) e desce pela rampa
  const hAlvo = hp - THREE.MathUtils.clamp(e * 0.02, -0.9, 0.9);
  u.lado = virarPara(hAlvo, 2.5);
  const naRampa = Math.abs(e) < 40 && Math.abs(_ang(hp - jogador.yaw)) < 0.5;
  const altRampa = Math.max(0, (sAt + 15) * RAMPA_AP);   // mira 15 m depois da cabeceira
  if (ap.fase === 'final' && naRampa && altRampa <= c.alt + 2) ap.fase = 'descida';
  if (ap.fase === 'final') { subir(THREE.MathUtils.clamp((Math.min(P.cruz, Math.max(altRampa, 25)) - c.alt) * 0.4, -3, 4)); velAlvo(vapp * 1.08); if (sAt < -50) ap.fase = 'arremeter'; return u; }
  velAlvo(vapp);
  if (c.alt < 3) { ap.fase = 'arredondar'; subir(-Math.max(1.3, Math.min(3, c.alt))); if (c.vel > P.vdec * 1.15) u.freio = true; }   // arredonda curto: toca logo
  else subir(THREE.MathUtils.clamp((altRampa - c.alt) * 0.6 - c.vel * RAMPA_AP, -6, 2));
  // chegada ruim: arremete
  const ruim = (sAt < 220 && (Math.abs(e) > 9 || Math.abs(_ang(hp - jogador.yaw)) > 0.3)) || (sAt < 60 && c.alt > altRampa + 15) || (sAt < -30 && c.alt > 5) || (sAt < -p.len * 0.4 && c.alt > 0.6);   // passaria do meio da pista ainda no ar
  if (ruim && c.alt > 2) { ap.fase = 'arremeter'; ap.tArr = 0; c.pedido = null; radio('piloto', `${prefixo()}: arremetendo.`); aviso('🔁 Piloto automático arremeteu: a chegada não estava boa. Ele tenta de novo.', 3); }
  return u;
}
const TAXI_ROTA = { metro: [[465, -765], [150, -765], [146, -800]], serra: [[-255, -1030], [-255, -1086]], porto: [[-255, 1030], [-255, 1086]] };
function destinoVoo(origem, porte) {
  let m = null, dm = Infinity;
  for (const a of AEROPORTOS) { if (a.id === origem.id || (porte === 'grande' && !a.grande)) continue; const p = pista(a), d = Math.hypot(p.ini.x - jogador.pos.x, p.ini.z - jogador.pos.z); if (d < dm) { dm = d; m = a; } }
  return (m || origem).id;
}
let guiaVoo = false, tempoGuia = 0;
// barra de voo: fina, no topo, e dá para minimizar (a escolha fica salva no aparelho)
let vooTxt = '', vooFlash = 0, vooMin = (() => { try { return localStorage.getItem('fr_voo_min') === '1'; } catch { return false; } })();
function emVoo() { return !!(jogador.carro?.aviao || jogador.voo); }
function painelVoo(txt) {
  if (txt && /^🛫 Autorizado/.test(txt) && !/^🛫 Autorizado/.test(vooTxt)) vooFlash = performance.now() + 3500;   // autorização: abre um instante
  vooTxt = txt || ''; desenharBarraVoo();
}
function desenharBarraVoo() {
  let el = $('instrucaoVoo');
  if (!el) {
    el = document.createElement('div'); el.id = 'instrucaoVoo';
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);z-index:9;font:700 12px system-ui;color:#fff;background:rgba(14,22,34,.78);border:1.5px solid #ffd23e;border-radius:9px;padding:3px 8px;display:flex;align-items:flex-start;gap:6px;cursor:pointer;user-select:none;-webkit-user-select:none';
    el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); vooMin = !vooMin; vooFlash = 0; try { localStorage.setItem('fr_voo_min', vooMin ? '1' : '0'); } catch {} desenharBarraVoo(); });
    document.body.appendChild(el);
  }
  const ultimo = radioLinhas[radioLinhas.length - 1], agora = performance.now();
  const temRadio = ultimo && agora - ultimo.t < 14000;
  if (!vooTxt && !(emVoo() && temRadio)) { el.style.display = 'none'; return; }
  const retrato = innerHeight > innerWidth, aberto = !vooMin || agora < vooFlash;
  el.style.display = 'flex';
  el.style.top = retrato ? 'calc(env(safe-area-inset-top,0px) + 23vh)' : 'calc(env(safe-area-inset-top,0px) + 50px)';
  el.style.maxWidth = aberto ? (retrato ? '94vw' : 'min(34vw,440px)') : (retrato ? '70vw' : 'min(26vw,300px)');
  el.style.opacity = aberto ? '1' : '.85';
  const curto = vooTxt.replace(/^🤖 Piloto automático · /, '🤖 ');
  const linha = (t, extra = '') => `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis${extra}">${t}</div>`;
  let corpo = '';
  if (aberto) {
    if (vooTxt) corpo += aberto && vooTxt.length > 70 ? `<div style="line-height:1.25">${esc(curto)}</div>` : linha(esc(curto));
    if (emVoo() && temRadio) corpo += linha(`📻 ${esc(ultimo.texto)}`, `;font-weight:600;color:${ultimo.quem === 'torre' ? '#9dffa6' : '#ffe27a'};margin-top:1px`);
  } else corpo = linha(esc(curto || `📻 ${ultimo.texto}`));
  el.innerHTML = `<div style="min-width:0;flex:1">${corpo}</div><div style="opacity:.8;font-size:11px;padding-top:1px">${aberto ? '▴' : '▾'}</div>`;
}
function guiarPiloto(dt) {
  const c = jogador.carro;
  if (!c?.aviao) { if (guiaVoo) { guiaVoo = false; esconderRota(); painelVoo(''); } return; }
  guiaVoo = true;
  if ((tempoGuia -= dt) > 0) return; tempoGuia = 0.3;
  const P = PORTES[c.porte], pe = pistaEm(jogador.pos.x, jogador.pos.z), chao = alturaChao(jogador.pos.x, jogador.pos.z);
  if (!c.noAr) {   // no chão: até a cabeceira e a direção da decolagem
    const a = pe || aeroProximo(), p = pista(a), dir = { x: (p.fim.x - p.ini.x) / p.len, z: (p.fim.z - p.ini.z) / p.len };
    let pts = [];
    if (!pe || !alinhado(pe, jogador.yaw)) {
      const t = TAXI_ROTA[a.id]; let k = 0, dm = Infinity; t.forEach(([x, z], i) => { const d = Math.hypot(x - jogador.pos.x, z - jogador.pos.z); if (d < dm) { dm = d; k = i; } });
      pts = [[jogador.pos.x, jogador.pos.z], ...t.slice(k), [p.ini.x, p.ini.z]];
    } else pts = [[jogador.pos.x, jogador.pos.z]];
    pts.push([p.ini.x + dir.x * Math.min(p.len, 220), p.ini.z + dir.z * Math.min(p.len, 220)]);
    const det = []; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3)); for (let k2 = 0; k2 < n; k2++) det.push([ax + (bx - ax) * k2 / n, az + (bz - az) * k2 / n]); }
    desenharRota(det, 1.2);
    if (c.ap) painelVoo(textoAP(c)); else painelVoo(c.liberado ? `🛫 Autorizado! Acelere até ${P.vdec} m/s (agora ${Math.round(c.vel)}) e PUXE o manche (▼) para subir.` : pe && alinhado(pe, jogador.yaw) ? `🛫 Na cabeceira ${a.cab}: acelere — a torre autoriza a decolagem.` : `🛫 Siga a faixa até a cabeceira ${a.cab} de ${a.nome}, pela taxiway.`);
    return;
  }
  if (c.ap) { painelVoo(textoAP(c)); }
  // no ar: aproximação da pista de destino, descida e pista
  const a = AERO[c.destino] || aeroProximo(), p = pista(a), dir = { x: (p.fim.x - p.ini.x) / p.len, z: (p.fim.z - p.ini.z) / p.len };
  const alvo = [[p.ini.x - dir.x * 380, p.ini.z - dir.z * 380, 45], [p.ini.x - dir.x * 150, p.ini.z - dir.z * 150, 18], [p.ini.x, p.ini.z, 0.6], [p.ini.x + dir.x * Math.min(p.len, 160), p.ini.z + dir.z * Math.min(p.len, 160), 0.4]];
  const dA = Math.hypot(alvo[0][0] - jogador.pos.x, alvo[0][1] - jogador.pos.z);
  const vt = [[jogador.pos.x, jogador.pos.z, c.alt], ...(c.pousar || dA < 60 ? alvo.slice(1) : alvo)];
  const det = []; let total = 0;
  for (let i = 0; i < vt.length - 1 && total < 900; i++) { const [ax, az, ay] = vt[i], [bx, bz, by] = vt[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 8)); for (let k = 0; k < n && total < 900; k++, total += L / n) { const f = k / n, x = ax + (bx - ax) * f, z = az + (bz - az) * f; det.push([x, z, alturaChao(x, z) + ay + (by - ay) * f + 0.3]); } }
  const ul = vt[vt.length - 1]; det.push([ul[0], ul[1], alturaChao(ul[0], ul[1]) + ul[2] + 0.3]);
  desenharRota(det, 2.4);
  const ok = alinhado(a, jogador.yaw), vmax = Math.round(P.vdec * 1.3);
  const vs = Math.round(c.vs || 0), alt = `${Math.round(c.alt)} m · ${vs > 0 ? '+' : ''}${vs} m/s`;
  if (!c.ap) painelVoo(c.pousar ? `🛬 Descendo · altura ${Math.round(c.alt)} m · ${Math.round(c.vel)} m/s (máx ${vmax}) · ${ok ? 'alinhado ✅' : 'corrija o rumo ↔️'}`
    : dA > 220 ? `✈️ ${alt} · Rumo a ${a.nome} · pista ${a.cab}: siga a linha amarela (${(dA / 1000).toFixed(1)} km).`
      : `🛬 ${alt} · Aproximação da pista ${a.cab}: ${ok ? 'alinhado ✅' : 'alinhe com a pista ↔️'} — empurre o manche devagar ou toque em POUSAR.`);
  void chao;
}
// ---- torre de controle (controlador jogador ou automática)
const pedidosTorre = new Map();   // id do piloto -> pedido
function controladorOnline() { for (const r of remotos.values()) if (r.meta?.tw) return true; return false; }
function aeroProximo() { let m = AERO.metro, dm = Infinity; for (const a of AEROPORTOS) { const p = pista(a), d = Math.hypot((p.ini.x + p.fim.x) / 2 - jogador.pos.x, (p.ini.z + p.fim.z) / 2 - jogador.pos.z); if (d < dm) { dm = d; m = a; } } return m; }
function pedirTorre(c, tipo) {
  if (c.pedido === tipo) return; c.pedido = tipo;
  const a = aeroProximo();
  conexao?.enviar('torre', { de: jogador.perfil.id, nome: jogador.perfil.nome, cs: prefixo(), tipo, porte: c.porte, aero: a.id });
  if (ouveRadio(a)) radio('piloto', `${prefixo()}: ${a.torreNome}, solicito ${tipo}${tipo === 'decolagem' ? ` na pista ${a.cab}` : ''}.`);
  const humano = controladorOnline() && a.id === 'metro';
  clearTimeout(c.timerTorre); c.timerTorre = setTimeout(() => liberar(c, tipo, true), humano ? 25000 : 2500);
  if (humano) aviso('🗼 Pedido enviado. O controlador vai responder pelo rádio.', 3);
}
function liberar(c, tipo, automatico) {
  if (jogador.carro !== c || c.pedido !== tipo) return;
  if (tipo === 'decolagem') c.liberado = true;
  const a = aeroProximo();
  if (ouveRadio(a)) radio('torre', `${automatico && a.id === 'metro' ? 'Torre (automática)' : a.torreNome}: ${prefixo()}, ${tipo === 'decolagem' ? `pista ${a.cab} livre, autorizado decolar` : 'autorizado pouso, vento calmo'}.`);
  else aviso(`🗼 ${tipo === 'decolagem' ? 'Decolagem' : 'Pouso'} autorizado${tipo === 'pouso' ? '' : 'a'}.`, 2.5);
}
function receberTorre(m) {
  const a = AERO[m.aero] || AERO.metro;
  if (ouveRadio(a) && m.de !== jogador.perfil?.id) radio('piloto', `${m.cs || m.nome}: ${a.torreNome}, solicito ${m.tipo}.`);
  if (!ehControlador() || !naTorre()) return;
  pedidosTorre.set(m.de, { ...m, em: Date.now() }); aviso(`🗼 ${m.nome} pede ${m.tipo} (avião ${PORTES[m.porte]?.nome || ''}). Toque em Torre para responder.`, 4);
}
function receberTorreOk(m) {
  const c = jogador.carro;
  if (m.para !== jogador.perfil?.id || !c?.aviao) { if (m.texto && ouveRadio(AERO.metro)) radio('torre', m.texto); return; }
  if (m.texto) radio('torre', m.texto);
  if (m.tipo === 'aguarde') { clearTimeout(c.timerTorre); c.timerTorre = setTimeout(() => liberar(c, c.pedido, true), 30000); return; }
  if (m.tipo === 'arremeter') { if (c.ap) c.ap.arremeter = true; clearTimeout(c.timerTorre); c.pousar = false; c.pedidoPouso = false; c.pedido = null; aviso('🔁 Arremeta! A torre mandou subir de novo.', 3); return; }
  clearTimeout(c.timerTorre); liberar(c, m.tipo, false);
}
const naTorre = () => Math.hypot(AERO.metro.torre.x - jogador.pos.x, AERO.metro.torre.z - jogador.pos.z) < 6;
function abrirTorre() {
  if (!ehControlador()) { abrirServico('torre'); return; }
  for (const [k, p] of pedidosTorre) if (Date.now() - p.em > 40000) pedidosTorre.delete(k);
  const lista = [...pedidosTorre.values()], a = AERO.metro;
  const responder = (p, tipo, texto, paga) => { conexao?.enviar('torreOk', { para: p.de, tipo, texto }); radio('torre', texto); if (tipo !== 'aguarde') pedidosTorre.delete(p.de); if (paga) rede.transporte.pagarTorre().then((v) => v && aviso(`🗼 +${v}`, 2)).catch(() => {}); };
  const v = vooRegular(), vi = vooNpc(agoraServidor() / 1000, VOO_INTER, VOO_INTER.desloc);
  const trafego = `Tráfego do sistema: ${VOO_REGULAR.cs}${String(v.n % 100).padStart(2, '0')} (${v.y > 1 ? 'em voo' : v.embarque ? 'embarcando' : 'no solo'}) · ${VOO_INTER.cs}${String(vi.n % 100).padStart(2, '0')} (${vi.oculto ? 'fora do país' : vi.y > 1 ? 'em voo' : vi.embarque ? 'embarcando' : 'no solo'}).`;
  escolher('🗼 Torre de controle', lista.length ? `Pedidos dos pilotos (cada autorização dá +40). ${trafego}` : `Nenhum pedido agora. Fique aqui: os pedidos chegam com aviso. ${trafego}`, lista.flatMap((p) => [
    { rotulo: `✅ ${p.cs || p.nome}: autorizar ${p.tipo}`, fn: () => responder(p, p.tipo, `${a.torreNome}: ${p.cs || p.nome}, ${p.tipo === 'decolagem' ? `pista ${a.cab} livre, autorizado decolar` : 'pista livre, autorizado pouso'}.`, true) },
    { rotulo: `⏳ ${p.cs || p.nome}: aguarde`, fn: () => responder(p, 'aguarde', `${a.torreNome}: ${p.cs || p.nome}, aguarde, tráfego na pista.`, false) },
    ...(p.tipo === 'pouso' ? [{ rotulo: `🔁 ${p.cs || p.nome}: arremeter`, fn: () => responder(p, 'arremeter', `${a.torreNome}: ${p.cs || p.nome}, arremeta! Suba e aguarde nova autorização.`, false) }] : []),
  ]));
}
let estavaNaTorre = false, tempoPainel = 0;
// painel de partidas e chegadas do terminal
function atualizarPainelVoos(seg) {
  if (!painelVoos) return;
  const hm = (s) => new Date((s) * 1000 - (agoraServidor() - Date.now())).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const linhas = [];
  // próximos dois voos regulares saindo da Metrópole
  const tab = VOO_REGULAR, c0 = Math.floor(seg / tab.ciclo);
  for (let c = c0; c <= c0 + 1 && linhas.length < 2; c++) for (const [k, tr] of tab.trechos.entries()) {
    if (tr.o !== 'metro') continue; const sai = c * tab.ciclo + tr.ini + tr.q[1].t; if (sai < seg - 2) continue;
    const n = c * tab.trechos.length + k, est = sai - seg < 60 ? (sai - seg < 0 ? 'PARTIU' : 'EMBARQUE') : 'NO HORÁRIO';
    if (linhas.length < 2) linhas.push([`${tab.cs}${String(n % 100).padStart(2, '0')}`, AERO[tr.d].nome.replace('Pista de ', ''), hm(sai), est]);
  }
  const vi = vooNpc(seg, VOO_INTER, VOO_INTER.desloc), saiI = seg + Math.max(0, vi.falta);
  linhas.push([`${VOO_INTER.cs}${String(vi.n % 100).padStart(2, '0')}`, 'Internacional', vi.embarque ? hm(saiI) : '—', vi.embarque ? (vi.falta < 40 ? 'EMBARQUE' : 'NO HORÁRIO') : vi.oculto ? 'EM VOO' : vi.y > 1 ? 'DECOLOU' : 'CHEGOU']);
  const txt = JSON.stringify(linhas); if (txt === painelVoos.txt) return; painelVoos.txt = txt;
  const g = painelVoos.c.getContext('2d'); g.clearRect(0, 0, 512, 300);
  g.fillStyle = '#101722'; g.beginPath(); g.roundRect(0, 0, 512, 300, 18); g.fill();
  g.fillStyle = '#ffd23e'; g.font = 'bold 34px system-ui'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('✈ PARTIDAS', 20, 36);
  g.font = 'bold 22px monospace'; g.fillStyle = '#7f8ea3'; g.fillText('VOO      DESTINO        HORA  SITUAÇÃO', 20, 78);
  linhas.forEach(([v, d, h, s], i) => {
    const y = 122 + i * 56; g.fillStyle = '#e9f5ff'; g.font = 'bold 26px monospace';
    g.fillText(v.padEnd(8), 20, y); g.fillText(d.slice(0, 13), 140, y); g.fillText(h, 330, y);
    g.fillStyle = s === 'EMBARQUE' ? '#7dff8a' : s === 'PARTIU' || s === 'DECOLOU' ? '#ff9a5a' : '#ffd23e'; g.font = 'bold 20px system-ui'; g.fillText(s, 418, y);
  });
  painelVoos.t.needsUpdate = true;
}
// ---- por quadro
function atualizarAviacao(dt) {
  montarAeroportos(); atualizarAvioesParados(); guiarPiloto(dt);
  if ((atualizarAviacao.tp = (atualizarAviacao.tp || 0) - dt) <= 0) { atualizarAviacao.tp = 0.5; if (!jogador.carro?.aviao) guiarPassageiro(); }
  const seg = agoraServidor() / 1000;
  for (const av of atendentes) av.mixer.update(dt);
  if ((tempoPainel -= dt) <= 0) { tempoPainel = 1; atualizarPainelVoos(seg); desenharRadio(); }
  atualizarFrota(dt);
  // teto do terminal some quando você está dentro
  const dentroT = jogador.pos.x > 280 && jogador.pos.x < 360 && jogador.pos.z > -712 && jogador.pos.z < -694;
  for (const t of tetosTerminal) t.visible = !dentroT;
  // luzes da pista à noite e farol da torre
  if (matLuzPista) { matLuzPista.emissiveIntensity = 0.2 + noiteAtual * 2.5; matLuzTaxi.emissiveIntensity = 0.2 + noiteAtual * 2.2; }
  if (farolTorre) { farolTorre.rotation.y += dt * 2.4; farolTorre.material.emissiveIntensity = 0.5 + noiteAtual * 2.5; }
  // no ar: rotação alta (some com a distância); no chão por perto: marcha lenta (taxiando, no portão, na cabeceira)
  const vols = { grande: [0, 0], medio: [0, 0], pequeno: [0, 0] };
  const ouvir = (porte, x, z, y) => {
    const d = Math.hypot(x - jogador.pos.x, z - jogador.pos.z), v = vols[porte];
    if (y > 3) v[1] = Math.max(v[1], 1 - d / (porte === 'pequeno' ? 180 : porte === 'medio' ? 220 : 260));
    else { v[0] = Math.max(v[0], 1 - d / (porte === 'pequeno' ? 70 : 100)); v[1] = Math.max(v[1], 0.35 * (1 - d / 140)); }
  };
  npcAvioes.forEach((n, idx) => {
    const v = vooNpc(seg, n.tab, n.tab.desloc || 0);
    // falas do rádio quando o avião muda de fase (iguais para todos, saem do horário)
    const chave = `${v.id}.${v.seg}`;
    if (n.ult !== chave) {
      if (n.ult !== null && v.fala && FALAS[v.fala]) { const a = AERO[v.aeroFala] || AERO.metro, cs = `${n.tab.cs}${String(v.n % 100).padStart(2, '0')}`; if (ouveRadio(a)) FALAS[v.fala](cs, a).forEach(([q, t], k) => setTimeout(() => radio(q, t), k * 1600)); }
      n.ult = chave;
    }
    if (!n.mesh && modelos[PORTES[n.porte].modelo]) { n.mesh = civico.modeloCarro(PORTES[n.porte].modelo, '#ffffff'); scene.add(n.mesh); n.ang = v.ang; }
    if (!n.mesh) return;
    n.ang += Math.atan2(Math.sin(v.ang - n.ang), Math.cos(v.ang - n.ang)) * Math.min(1, dt * (v.y > 2 ? 1.5 : 2.2));
    n.mesh.position.set(v.x, alturaChao(v.x, v.z) + v.y, v.z);
    n.mesh.rotation.set(v.y > 0.5 ? -THREE.MathUtils.clamp(v.subindo, -0.12, 0.2) : 0, n.ang, 0, 'YXZ');
    n.mesh.visible = !jogador.dentroCasa && !v.oculto && Math.abs(v.x) < 1250;
    if (n.mesh.visible && !(idx === 0 && jogador.voo)) ouvir(n.porte, v.x, v.z, v.y);
  });
  const tw = ehControlador() && naTorre(); if (tw !== estavaNaTorre) { estavaNaTorre = tw; conexao?.rastrear(metaPresenca()); }
  // sons por porte: grande = som de dentro + som passando no céu; médio e pequeno = um som cada (dentro e fora)
  const dentro = jogador.voo || jogador.carro?.aviao || (jogador.passageiro?.piloto && /^aviao_/.test(remotos.get(jogador.passageiro.piloto)?.carroModelo || ''));
  for (const r of remotos.values()) if (r.carro && /^aviao_/.test(r.carroModelo || '')) ouvir(r.carroModelo.slice(6), r.carro.position.x, r.carro.position.z, r.carro.position.y - alturaChao(r.carro.position.x, r.carro.position.z));
  // o ronco do avião é para quem está do lado de fora: dentro (piloto ou passageiro) fica em silêncio
  for (const [porte, [lenta, alto]] of Object.entries(vols)) {
    const p = SOM_AVIAO[porte];
    sons.continuo(`${p}_lenta`, dentro ? 0 : Math.max(0, lenta) * 0.7);
    sons.continuo(`${p}_alto`, dentro ? 0 : Math.max(0, alto) * 0.85);
  }
}
const MECANICO_HANGAR = { x: 452, z: -700 };
const pertoMecanico = () => Math.hypot(MECANICO_HANGAR.x - jogador.pos.x, MECANICO_HANGAR.z - jogador.pos.z) < 3;
function contextoAviacao() {
  if (jogador.carro || jogador.voo) return null;
  { const hv = heliParaRevisar(); if (hv) return [`helicóptero: ${heliVoos['carro:' + hv.d.id] ?? '?'} voo(s) sem revisão`, 'Revisar']; }
  if (pertoMecanico()) return [jogador.perfil?.profissao === 'mecanico' ? 'oficina do hangar: você é mecânico (revise os aviões da frota)' : 'mecânico do hangar: revisões e vaga de mecânico', 'Oficina'];
  const v = vooRegular(), g = portaoPerto();
  if (g && v.embarque && v.o === g.id && jogador.passagem?.de === g.id && jogador.passagem.para === v.d) return [`embarcar no voo para ${AERO[v.d].nome} (sai em ${Math.ceil(v.falta)} s)`, 'Embarcar'];
  if (g && jogador.passagem?.de === g.id) return [`portão de embarque: o voo para ${AERO[jogador.passagem.para].nome} ${v.embarque && v.o === g.id ? 'é outro destino, espere o próximo' : 'ainda não chegou'}`, 'Portão'];
  const b = balcaoPerto(); if (b) return [jogador.passagem ? `passagem para ${AERO[jogador.passagem.para].nome} (embarque no portão ✈️)` : 'atendente: passagem aérea (150) e paraquedas (5.000)', 'Passagem'];
  if (Math.hypot(AERO.metro.hangar.x - jogador.pos.x, AERO.metro.hangar.z - jogador.pos.z) < 4) return aula?.voo && !aula.veiculo ? ['aula de voo: pegar o avião da escola', 'Aula'] : [ehPiloto() ? 'hangar: pegar um avião' : 'hangar (vagas para piloto)', 'Hangar'];
  const fa = aviaoFrotaPerto();
  if (fa && jogador.perfil?.profissao === 'mecanico' && !ehPiloto()) return [(frotaVoos[fa.fid] ?? 0) > 0 ? `avião ${PORTES[fa.porte].nome}: ${frotaVoos[fa.fid]} voo(s) sem revisão` : `avião ${PORTES[fa.porte].nome}: revisado`, 'Revisar'];
  if (fa) return aula?.voo && !aula.veiculo ? ['aula de voo: pegar o avião da escola', 'Aula'] : [ehPiloto() ? (portesLiberados().includes(fa.porte) ? `pilotar o avião ${PORTES[fa.porte].nome}` : `avião ${PORTES[fa.porte].nome} (libera com a carreira)`) : `avião ${PORTES[fa.porte].nome} (só pilotos)`, 'Pilotar'];
  if (naTorre()) return [ehControlador() ? `torre de controle: ${pedidosTorre.size} pedido(s)` : 'torre de controle (vagas para controlador)', 'Torre'];
  return null;
}
function acaoAviacao() {
  { const hv = !jogador.carro && heliParaRevisar(); if (hv) { const k = 'carro:' + hv.d.id; rede.aviacao.revisarHeli(k, true).then(() => { heliVoos[k] = 0; aviso('🔧 Helicóptero revisado! +300', 3); }).catch((e) => aviso(e.message, 3)); return true; } }
  if (!jogador.carro && pertoMecanico()) { abrirServico('mecanico'); return true; }
  const v = vooRegular(), g = portaoPerto();
  if (g && v.embarque && v.o === g.id && jogador.passagem?.de === g.id && jogador.passagem.para === v.d) { embarcarVoo(v); return true; }
  const b = balcaoPerto(); if (b) {
    escolher('🛫 Balcão do aeroporto', `Você tem ${qtdItem('paraquedas')} paraquedas na mochila. Com ele, aparece o botão 🪂 EJETAR no avião e no helicóptero (no PC, tecla J).`, [
      jogador.passagem ? { rotulo: `🎫 Você já tem passagem para ${AERO[jogador.passagem.para].nome} (espere no portão ✈️)`, fn: () => {} } : { rotulo: '🎫 Passagem aérea (150)', fn: () => comprarPassagem(b) },
      { rotulo: '🪂 Comprar paraquedas (5.000)', fn: () => rede.aviacao.comprarParaquedas().then(() => { recarregarInventario(); aviso('🪂 Paraquedas comprado! Ele fica na mochila e é gasto quando você ejeta.', 4); }).catch((e) => aviso(e.message, 3)) },
    ]);
    return true;
  }
  if (Math.hypot(AERO.metro.hangar.x - jogador.pos.x, AERO.metro.hangar.z - jogador.pos.z) < 4) { if (aula?.voo && !aula.veiculo) entrarAulaVoo(); else pegarAviao(); return true; }
  const fa = aviaoFrotaPerto(); if (fa) { if (aula?.voo && !aula.veiculo) entrarAulaVoo(); else if (ehPiloto() || jogador.perfil?.profissao === 'mecanico') menuAviaoFrota(fa); else pegarAviao(fa); return true; }
  if (naTorre()) { abrirTorre(); return true; }
  if (g) { aviso(contextoAviacao()?.[0] || 'Portão de embarque.', 3); return true; }
  return false;
}
// ================================================================= editor da farda (admin): ajusta olhando o próprio personagem
let editorFarda = null;
const CAMPOS_FARDA = {
  colete: [['larg', 'Largura', 0.5, 2, 0.02], ['alt', 'Altura', 0.5, 2, 0.02], ['fund', 'Fundura', 0.5, 2.5, 0.02], ['subir', 'Subir / descer', -0.6, 0.6, 0.01], ['frente', 'Frente / trás', -0.6, 0.6, 0.01]],
  chapeu: [['tam', 'Tamanho', 0.5, 2, 0.02], ['subir', 'Subir / descer', -0.8, 0.8, 0.01], ['frente', 'Frente / trás', -0.8, 0.8, 0.01]],
};
function abrirEditorFarda() {
  if (!souEquipe() || jogador.perfil?.cargo !== 'admin') { aviso('Só o administrador ajusta a farda.'); return; }
  if (editorFarda) return;
  const rascunho = JSON.parse(JSON.stringify(ajusteFarda || {})), antes = jogador.farda;
  if (!document.getElementById('estiloEditorFarda')) {
    const st = document.createElement('style'); st.id = 'estiloEditorFarda';
    st.textContent = '#editorFarda button{background:#2c333d;color:#eee;border:1px solid #4a5361;border-radius:8px;padding:7px 10px;font:600 13px system-ui}';
    document.head.appendChild(st);
  }
  const el = document.createElement('div'); el.id = 'editorFarda';
  el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:60;background:rgba(20,24,30,.9);color:#eee;padding:10px 12px 14px;font:14px system-ui;max-height:48vh;overflow:auto;border-top:2px solid #f2a33a;touch-action:pan-y';
  let papel = jogador.farda || 'policia', peca = 'colete';
  const desenhar = () => {
    const aj = { ...AJ_PADRAO[peca], ...(rascunho[papel]?.[peca] || {}) };
    el.innerHTML = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px"><b style="flex:1">👔 Ajuste da farda</b>
        <button data-a="girar">↻ Girar</button><button data-a="fechar">✕</button></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${Object.keys(UNIFORMES).map((k) => `<button data-p="${k}" style="${k === papel ? 'background:#f2a33a;color:#111' : ''}">${NOME_FARDA[k]}</button>`).join('')}</div>
      <div style="display:flex;gap:6px;margin-bottom:6px">${[['colete', '🦺 Colete'], ['chapeu', '⛑️ Capacete / boné']].map(([k, t]) => `<button data-q="${k}" style="flex:1;${k === peca ? 'background:#f2a33a;color:#111' : ''}">${t}</button>`).join('')}</div>
      ${CAMPOS_FARDA[peca].map(([k, n, mi, ma, st]) => `<label style="display:flex;align-items:center;gap:8px;margin:4px 0"><span style="width:110px">${n}</span>
        <input type="range" data-c="${k}" min="${mi}" max="${ma}" step="${st}" value="${aj[k]}" style="flex:1"><b data-v="${k}" style="width:46px;text-align:right">${(+aj[k]).toFixed(2)}</b></label>`).join('')}
      <div style="display:flex;gap:6px;margin-top:8px"><button data-a="zerar" style="flex:1">↺ Padrão desta peça</button><button data-a="salvar" style="flex:1;background:#2f8f4e;color:#fff">💾 Salvar para todos</button></div>
      <small style="opacity:.75">Mexa e veja no seu personagem. Cada corporação e cada peça têm o seu ajuste. Só muda para todos depois de salvar.</small>`;
    el.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { papel = b.dataset.p; definirFarda(papel, true); desenhar(); }; });
    el.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { peca = b.dataset.q; desenhar(); }; });
    el.querySelectorAll('[data-c]').forEach((r) => {
      r.oninput = () => {
        ((rascunho[papel] ||= {})[peca] ||= {})[r.dataset.c] = +r.value;
        el.querySelector(`[data-v="${r.dataset.c}"]`).textContent = (+r.value).toFixed(2);
        definirAjusteFarda(rascunho);   // pré-visualização na hora
      };
    });
    el.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = async () => {
        const a = b.dataset.a;
        if (a === 'girar') { jogador.yaw += Math.PI / 4; return; }
        if (a === 'zerar') { if (rascunho[papel]) delete rascunho[papel][peca]; definirAjusteFarda(rascunho); desenhar(); return; }
        if (a === 'salvar') {
          b.disabled = true;
          try { await rede.configJogo.salvarFarda(rascunho); aviso('✅ Ajuste da farda salvo: já vale para todos os jogadores.', 3.5); }
          catch (e) { aviso(/admin_farda|schema cache|does not exist/i.test(e.message || '') ? 'Rode o 53_farda_ajuste.sql no Supabase e tente de novo.' : 'Não salvou: ' + (e.message || e), 4.5); }
          b.disabled = false; return;
        }
        if (a === 'fechar') {
          el.remove(); editorFarda = null; definirFarda(antes, true);
          rede.configJogo.ler().then((c) => { if (c) definirAjusteFarda(c.farda); }).catch(() => {});   // volta ao que está salvo
        }
      };
    });
  };
  definirFarda(papel, true); desenhar(); document.body.appendChild(el); editorFarda = el;
}
// ================================================================= configurações do admin (polícia robô e crimes de NPC)
let configJogo = { policia_robo: 12, crimes_npc: false, chance_crime: 30 }, tempoConfig = 0;
function atualizarConfigJogo(dt) {
  if ((tempoConfig -= dt) > 0) return; tempoConfig = 30;
  rede.configJogo.ler().then((c) => { if (c) { configJogo = c; aplicarRelogio(c); if (!editorFarda) definirAjusteFarda(c.farda); } }).catch(() => {});
  rede.configJogo.presos(cicloCrime() - 3).then((l) => { for (const x of l) presosNpc.add(x.ciclo); }).catch(() => {});
}
// ---------------------------------------------------------------- ladrões NPC: a cada 2 minutos, com a chance definida, um pedestre
// assalta uma loja e foge pelas ruas por 3 minutos. Todos os aparelhos sorteiam igual (pelo número do ciclo).
const CICLO_CRIME = 120, FUGA = 180, presosNpc = new Set();
let ultimoAlertaCrime = -1;
const cicloCrime = () => Math.floor(agoraServidor() / 1000 / CICLO_CRIME);
function sorte(n, k) { let h = (n * 2654435761 + k * 40503) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; }
function crimeDoCiclo(ciclo) {
  if (!configJogo.crimes_npc || !pontos.lojas?.length) return null;
  if (sorte(ciclo, 1) * 100 >= configJogo.chance_crime) return null;
  const civis = npcs.filter((n) => n.civil); if (!civis.length) return null;
  const loja = pontos.lojas[Math.floor(sorte(ciclo, 2) * pontos.lojas.length)], destino = pontos.lojas[Math.floor(sorte(ciclo, 3) * pontos.lojas.length)];
  return { ciclo, n: civis[Math.floor(sorte(ciclo, 4) * civis.length)], loja, rota: servicos.rotaRuas(loja, destino) };
}
function banditoAtivo(n) {
  const b = n.bandido, t = agoraServidor() / 1000 - b.ciclo * CICLO_CRIME;
  if (t < 0 || t > FUGA || presosNpc.has(b.ciclo)) { soltarBandido(n); return false; }
  return true;
}
function soltarBandido(n) {
  if (!n.bandido) return;
  if (n.bandido.placa) n.av.raiz.remove(n.bandido.placa);
  n.bandido = null; n.av.tocar('walk', { velocidade: 0.85 });
}
function atualizarBandidos() {
  const ciclo = cicloCrime();
  for (const c of [ciclo, ciclo - 1]) {
    if (presosNpc.has(c)) continue;
    const cr = crimeDoCiclo(c); if (!cr || cr.n.bandido || cr.n.algemado) continue;
    if (agoraServidor() / 1000 - c * CICLO_CRIME > FUGA) continue;
    const placa = textoSprite('🦹 LADRÃO', { escala: 0.6, fundo: 'rgba(170,30,30,.95)' }); placa.position.y = 2.6; cr.n.av.raiz.add(placa);
    cr.n.bandido = { ciclo: c, rota: cr.rota, placa, loja: cr.loja }; cr.n.av.tocar('run', { fade: 0.2 });
    if (ultimoAlertaCrime !== c && papelDe(jogador.perfil) && ['policia', 'prf', 'exercito'].includes(papelDe(jogador.perfil))) {
      ultimoAlertaCrime = c; aviso('🚨 Assalto numa loja! O ladrão está fugindo pelas ruas: prenda ele (+300).', 5);
      rastrear({ nome: '🦹 Ladrão em fuga', x: cr.loja.x, z: cr.loja.z, ladrao: c });
    }
  }
}
function atualizarBandido(n, dt) {
  const b = n.bandido, t = agoraServidor() / 1000 - b.ciclo * CICLO_CRIME, p = servicos.pontoNaRota(b.rota, Math.min(b.rota.total, t * 4.2));
  const raiz = n.av.raiz, ang = Math.atan2(p.x - raiz.position.x, p.z - raiz.position.z);
  raiz.position.set(p.x, alturaChao(p.x, p.z), p.z);
  if (t * 4.2 < b.rota.total) raiz.rotation.y = suavizarAngulo(raiz.rotation.y, ang, dt * 8);
  if (rastreio?.nome === '🦹 Ladrão em fuga') { rastreio.x = p.x; rastreio.z = p.z; }
  n.av.mixer.update(dt);
}
function bandidoPerto() {
  const pap = papelDe(jogador.perfil);
  if (!(['policia', 'prf', 'exercito'].includes(pap) || jogador.perfil?.cargo === 'admin') || jogador.carro) return null;
  return npcs.find((n) => n.bandido && Math.hypot(n.av.raiz.position.x - jogador.pos.x, n.av.raiz.position.z - jogador.pos.z) < 2.6) || null;
}
async function prenderBandido(n) {
  const c = n.bandido.ciclo;
  try {
    const v = await rede.configJogo.prenderBandido(c);
    presosNpc.add(c); soltarBandido(n); algemarNpc(npcs.indexOf(n), true, jogador.perfil.id, false);
    if (rastreio?.nome === '🦹 Ladrão em fuga') rastrear(null);
    jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 2, fade: 0.1 });
    aviso(`🚔 Ladrão preso! +${v}`, 3);
  } catch (e) { presosNpc.add(c); soltarBandido(n); aviso(e.message, 3); }
}

// ================================================================= viatura do expediente: quem está em serviço pede o veículo a qualquer hora
const VEICULO_SERVICO = { policia: 'viatura', prf: 'viatura', bombeiro: 'bombeiros', medico: 'ambulancia', exercito: 'militar' };
let viaturaPedida = 0;
function desenharBotaoViatura() {
  let b = $('btViatura');
  const pap = papelDe(jogador.perfil), pode = !!pap && !!jogador.avatar && !jogador.carro && !jogador.passageiro && !jogador.trem && !jogador.dentroCasa && !jogador.algemado && !(jogador.pena > 0) && !presoMilitar();
  if (!b) {
    b = document.createElement('button'); b.id = 'btViatura';
    b.style.cssText = 'position:fixed;left:12px;bottom:270px;z-index:30;padding:10px 12px;border-radius:14px;border:2px solid rgba(255,255,255,.5);background:rgba(30,70,160,.88);color:#fff;font:800 13px system-ui;pointer-events:auto';
    b.onclick = () => pedirViatura(); document.body.appendChild(b);
  }
  b.style.display = pode ? 'block' : 'none';
  if (pode) b.textContent = { policia: '🚓 Viatura', prf: '🚔 Viatura PRF', bombeiro: '🚒 Caminhão', medico: '🚑 Ambulância', exercito: '🪖 Jipe' }[pap];
}
function pedirViatura() {
  const pap = papelDe(jogador.perfil), modelo = VEICULO_SERVICO[pap]; if (!modelo) return;
  if (performance.now() - viaturaPedida < 8000) { aviso('Espere um pouco para pedir de novo.'); return; }
  viaturaPedida = performance.now();
  const p = pertoDeMim(), ang = jogador.yaw;
  if (modelo === 'militar') {
    if (meuMilitar) scene.remove(meuMilitar.mesh);
    const m = civico.modeloCarro('militar', '#ffffff'); m.position.set(p.x, alturaChao(p.x, p.z), p.z); m.rotation.y = ang; scene.add(m);
    meuMilitar = { modelo: 'militar', mesh: m };
    entrarServico({ exercito: { meu: true, mesh: m, modelo: 'militar' }, modelo: 'militar' });
  } else if (modelo === 'viatura') {
    if (minhaViatura) scene.remove(minhaViatura);
    minhaViatura = civico.modeloCarro('viatura', pap === 'prf' ? '#1d2b4f' : '#ffffff'); minhaViatura.position.set(p.x, alturaChao(p.x, p.z), p.z); minhaViatura.rotation.y = ang; scene.add(minhaViatura);
    entrarServico({ base: { veiculo: minhaViatura }, modelo: 'viatura' });
  } else {
    const base = modelo === 'ambulancia' ? civico.HOSPITAL : civico.BOMBEIROS; if (!base?.veiculo) return;
    base.veiculo.position.set(p.x, alturaChao(p.x, p.z), p.z); base.veiculo.rotation.y = ang; base.veiculo.visible = true;
    entrarServico({ base, modelo });
  }
  aviso('🚨 Veículo do expediente na mão. Bom trabalho!', 2.5);
}
let minhaViatura = null;

// ================================================================= prisão militar (no quartel): militar que matou inocente ou cometeu crime
const presoMilitar = () => { const a = jogador.perfil?.prisao_militar_ate; return !!a && Date.parse(a) > agoraServidor(); };
function salaPrisaoMilitar() {
  return montarSala('prisaomilitar', 3000, 2500, 18, 12, { piso: '#4d5240', parede: '#7b8064', luz: '#e8f0d0' }, (i) => {
    const { caixa, placa, g } = i;
    i.celasMil = true;
    const barra = new THREE.CylinderGeometry(0.045, 0.045, 2.7, 6), ferro = i.mat('#2c3024', 0.5, 0.6), grades = new THREE.InstancedMesh(barra, ferro, 4 * 14); let n = 0; const m4 = new THREE.Matrix4();
    for (let k = 0; k < 4; k++) {
      const x = -6 + k * 4;
      caixa(0.15, 2.8, 5, '#6b705a', x - 2, 1.4, -3.5); caixa(1.0, 0.45, 2.0, '#4b5d33', x - 1, 0.23, -4.8);
      for (let b = 0; b < 14; b++) { m4.makeTranslation(x - 1.8 + b * 0.28, 1.35, -1); grades.setMatrixAt(n++, m4); }
      placa(`Cela militar ${k + 1}`, x, -1, 3.1);
    }
    caixa(0.15, 2.8, 5, '#6b705a', 8, 1.4, -3.5); g.add(grades);
    i.obst.push([-9, 9, -6, -0.8]);
    placa('⛓️ Prisão militar', 0, 3, 3.2);
  });
}
function celaMilitarIdx() { let h = 0; for (const ch of String(jogador.perfil?.id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 4; }
function posCelaMilitar() { const i = salaPrisaoMilitar(); return { x: i.base.x - 6 + celaMilitarIdx() * 4, z: i.base.z - 3.5 }; }
function caixaCelaMilitar() { const i = salaPrisaoMilitar(), x = i.base.x - 6 + celaMilitarIdx() * 4; return { x0: x - 1.7, x1: x + 1.7, z0: i.base.z - 5.6, z1: i.base.z - 1.4 }; }
SALAS.prisaomilitar = {
  contexto: () => (presoMilitar() ? [`prisão militar: ${formatarTempo(Math.max(0, (Date.parse(jogador.perfil.prisao_militar_ate) - agoraServidor()) / 1000))}`, ''] : naPorta() ? ['sair da prisão militar', 'Sair'] : ['', '']),
  acao: () => { if (!presoMilitar() && naPorta()) sairSala(); },
};
let tempoPrisaoMil = 0;
function atualizarPrisaoMilitar(dt) {
  if ((tempoPrisaoMil -= dt) > 0) return; tempoPrisaoMil = 1;
  if (presoMilitar()) {
    if (jogador.dentroCasa !== 'prisaomilitar') { if (jogador.carro) sairCarro(); if (jogador.armado) alternarArmaForcado(false); const c = posCelaMilitar(); teleportar(c.x, c.z); aviso('⛓️ Você está na prisão militar.', 3); }
  } else if (jogador.dentroCasa === 'prisaomilitar' && jogador.saidaSala) { const s = jogador.saidaSala; teleportar(s.x, s.z); aviso('🎖️ Você saiu da prisão militar.', 3); }
}

// ================================================================= armas proibidas nas cadeias (polícia, PRF e prisão militar) e para reféns
function armasProibidas() {
  const d = jogador.dentroCasa;
  return (d === 'carceragem' && !daPolicia()) || (d === 'prisaomilitar' && !militar()) || presoMilitar() || cativo() || jogador.pena > 0;
}
// ================================================================= esconderijos dos clãs na mata (cativeiro)
// 4 esconderijos com jaula, ligados à cidade por uma trilha de terra. Clã leva um jogador ferido para lá (crime).
// O refém fica na jaula, sem agir nem atirar, até alguém libertar ou passar 15 min. Quem achar pode atirar nos sequestradores.
const ESCONDERIJOS = [
  { nome: 'Mata Oeste da Vila Serra', x: -165, z: -1075, trilha: [[-86, -1053], [-128, -1062], [-165, -1075]] },
  { nome: 'Mata Leste da Vila Serra', x: 205, z: -1070, trilha: [[86, -1053], [150, -1062], [205, -1070]] },
  { nome: 'Mata Oeste do Porto Sul', x: -160, z: 955, trilha: [[-86, 945], [-125, 950], [-160, 955]] },
  { nome: 'Mata do Porto Sul (fundos)', x: -172, z: 1075, trilha: [[-86, 1053], [-130, 1064], [-172, 1075]] },
];
const cativo = () => { const p = jogador.perfil; return !!(p?.cativeiro && p.cativeiro_ate && Date.parse(p.cativeiro_ate) > agoraServidor()); };
function montarEsconderijos() {
  const terra = new THREE.MeshStandardMaterial({ color: '#7a5c3a', roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), madeira = new THREE.MeshStandardMaterial({ color: '#5a3f26', roughness: 0.9 });
  const ferro = new THREE.MeshStandardMaterial({ color: '#2e2f33', roughness: 0.5, metalness: 0.6 }), lona = new THREE.MeshStandardMaterial({ color: '#4d5a3a', roughness: 0.9, side: THREE.DoubleSide });
  for (const e of ESCONDERIJOS) {
    mundo.abrirTrilha([...e.trilha, [e.x, e.z]], 3.2);
    // trilha de terra: uma faixa contínua e curva que começa na grama, logo depois do fim do asfalto
    const pts = e.trilha.map(([x, z], i) => new THREE.Vector3(i === 0 ? x + Math.sign(x) * 1.2 : x, 0, z));
    const curva = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), n = Math.ceil(curva.getLength() / 1.2);
    const pos = [], idx = [], L = 1.35;
    for (let k = 0; k <= n; k++) {
      const p = curva.getPointAt(k / n), t = curva.getTangentAt(k / n), nx = -t.z, nz = t.x;
      const larg = L * (k === 0 ? 0.85 : 1) * (0.92 + 0.08 * Math.sin(k * 1.7));   // bordas levemente irregulares
      for (const lado of [-1, 1]) { const x = p.x + nx * larg * lado, z = p.z + nz * larg * lado; pos.push(x, alturaChao(x, z) + 0.05, z); }
      if (k < n) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const faixa = new THREE.Mesh(geo, terra); faixa.receiveShadow = true; faixa.renderOrder = 1; scene.add(faixa);
    const y = alturaChao(e.x, e.z);
    const clar = new THREE.Mesh(new THREE.CircleGeometry(7, 20), terra); clar.rotation.x = -Math.PI / 2; clar.position.set(e.x, y + 0.05, e.z); clar.receiveShadow = true; scene.add(clar);
    // jaula
    const g = new THREE.Group(); g.position.set(e.x, y, e.z); scene.add(g);
    const barra = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6);
    for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2, b = new THREE.Mesh(barra, ferro); b.position.set(Math.cos(a) * 1.9, 1.2, Math.sin(a) * 1.9); b.castShadow = true; g.add(b); }
    const tampa = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.12, 22), madeira); tampa.position.y = 2.45; g.add(tampa);
    // barraca dos sequestradores
    const barraca = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.4, 4), lona); barraca.position.set(4.2, 1.2, 0); barraca.rotation.y = Math.PI / 4; barraca.castShadow = true; g.add(barraca);
    const caixote = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), madeira); caixote.position.set(-3.6, 0.35, 1.5); g.add(caixote);
    const fog = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.25, 8), new THREE.MeshStandardMaterial({ color: '#3a2a1a', emissive: '#ff6a1a', emissiveIntensity: 0.5 })); fog.position.set(-2.6, 0.12, -2.6); g.add(fog);
    const pl = textoSprite('⛺ Esconderijo', { escala: 0.6, fundo: 'rgba(60,45,25,.9)' }); pl.position.set(0, 3.3, 0); g.add(pl);
    colisores.push({ tipo: 'circ', x: e.x + 4.2, z: e.z, r: 1.6 });
  }
}
function feridoParaSequestro() {
  if (!jogador.cla || jogador.carro || jogador.dentroCasa || cativo()) return null;
  const f = feridoProximo(2.6); if (!f || f.r.meta?.ref) return null;
  if (f.r.meta?.cla && f.r.meta.cla === jogador.claInfo?.nome) return null;
  if (jogador.perfil?.profissao === 'medico') return null;   // médico socorre
  return f;
}
function sequestrar(f) {
  escolher(`⛓️ Sequestrar ${esc(f.r.meta?.nome || 'o ferido')}`, 'Para qual esconderijo da mata? É crime (+2). Ele fica na jaula até alguém libertar ou por 15 minutos.', ESCONDERIJOS.map((e, k) => ({
    rotulo: `⛺ ${e.nome}`,
    fn: async () => { try { await rede.cativeiro.capturar(f.id, k + 1); aviso(`⛓️ ${f.r.meta?.nome || 'O refém'} foi levado para o esconderijo: ${e.nome}.`, 4); rastrear({ nome: `⛺ ${e.nome}`, x: e.x, z: e.z }); } catch (er) { aviso(er.message, 3); } },
  })));
}
function refemPerto() {
  if (jogador.carro || jogador.dentroCasa || cativo()) return null;
  for (const [id, r] of remotos) {
    const k = r.meta?.ref; if (!k || !r.av?.raiz.visible) continue;
    if (Math.hypot(r.av.raiz.position.x - jogador.pos.x, r.av.raiz.position.z - jogador.pos.z) < 2.8) return { id, r };
  }
  return null;
}
async function libertarRefem(a) {
  try { const v = await rede.cativeiro.libertar(a.id); aviso(`🔓 Você libertou ${a.r.meta?.nome || 'o refém'}!${v ? ` +${v}` : ''}`, 3.5); jogador.avatar.tocar('pegar', { umaVez: true, velocidade: 2, fade: 0.1 }); }
  catch (e) { aviso(e.message, 3); }
}
let eraCativo = false;
function atualizarCativeiro(dt) {
  const c = cativo();
  if (c && jogador.armado) alternarArmaForcado(false);
  if (armasProibidas() && jogador.armado && !c) alternarArmaForcado(false);
  if (c) {
    const e = ESCONDERIJOS[jogador.perfil.cativeiro - 1];
    if (!eraCativo) {
      eraCativo = true;
      if (jogador.morto) levantar(30);
      if (jogador.carro) sairCarro();
      teleportar(e.x, e.z); conexao?.rastrear(metaPresenca());
      aviso(`⛓️ Você é REFÉM no esconderijo "${e.nome}". Espere alguém te libertar (ou 15 min).`, 5);
    }
    const dx = jogador.pos.x - e.x, dz = jogador.pos.z - e.z, d = Math.hypot(dx, dz);   // fica dentro da jaula
    if (d > 1.5) { jogador.pos.x = e.x + dx / d * 1.5; jogador.pos.z = e.z + dz / d * 1.5; }
  } else if (eraCativo) {
    eraCativo = false; conexao?.rastrear(metaPresenca());
    aviso('🔓 Você está livre! Saia da mata pela trilha.', 4);
  }
}

// ================================================================= ÁREA 51 E O ÓVNI
// Base secreta do Exército no deserto, a oeste da metrópole. Só oficiais do Exército (Tenente para cima) entram;
// o óvni fica no hangar (o teto abre no meio). Pilotando, parado em cima de alguém: 👽 Abduzir. O abduzido sobe
// no feixe, não vê nada (tela branca e depois preta) e acorda numa rua qualquer. À noite, quem está perto vê
// "luzes estranhas" e os jornalistas recebem o avistamento (região aproximada) para correr e fotografar.
const A51 = mundo.AREA51;
let area51 = null, avisoA51 = 0, tAvistamento = 0, ovniMarcaAte = 0, abducaoPronta = 0, ultimaAbducao = -1e9;
const feixesOvni = [];
function acessoArea51() { return jogador.perfil?.cargo === 'admin' || (militar() && podePilotarHeliExercito()); }
function dentroArea51(x, z, m = 0) { return x > A51.x0 - m && x < A51.x1 + m && z > A51.z0 - m && z < A51.z1 + m; }
function regiaoDe(x, z) {
  if (x <= -640) return 'deserto a oeste da Metrópole';
  if (Math.abs(z) > 700) return z < 0 ? 'Vila Serra' : 'Porto Sul';
  const p = []; if (z < -150) p.push('norte'); else if (z > 150) p.push('sul'); if (x > 150) p.push('leste'); else if (x < -150) p.push('oeste');
  return p.length ? `zona ${p.join('-')} da Metrópole` : 'centro da Metrópole';
}
function montarArea51() {
  if (area51) return;
  const g = new THREE.Group(); scene.add(g);
  const M = (c, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...x });
  const areiaTex = texturaCanvas(256, (c, t) => { c.fillStyle = '#d2b07a'; c.fillRect(0, 0, t, t); ruido(c, t, 9000, 0.07, 1.6, [150, 110, 60]);
    c.strokeStyle = 'rgba(170,130,80,.35)'; c.lineWidth = 2; for (let y = 8; y < t; y += 22) { c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= t; x += 16) c.lineTo(x, y + Math.sin(x / 20 + y) * 4); c.stroke(); } });
  const D = A51.deserto; areiaTex.repeat.set((D.x1 - D.x0) / 18, (D.z1 - D.z0) / 18);
  const plano = (x, z, w, d, mat, y) => { mat.polygonOffset = true; mat.polygonOffsetFactor = Math.min(mat.polygonOffsetFactor || 0, -Math.round(y * 100)); mat.polygonOffsetUnits = mat.polygonOffsetFactor * 2;   // sem cintilar com o chão
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m; };
  const caixa = (x, y, z, w, h, d, mat, col = false, sombra = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = sombra; m.receiveShadow = true; g.add(m);
    if (col) colisores.push({ tipo: 'caixa', x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); return m; };
  plano((D.x0 + D.x1) / 2, (D.z0 + D.z1) / 2, D.x1 - D.x0, D.z1 - D.z0, M('#ffffff', { map: areiaTex }), 0.012);
  // estrada até o portão (continua a Avenida Central) e o pátio de concreto
  const asf = M('#3d4047'), amarelo = M('#e8c23a'), concreto = M('#9d9a92'), branco = M('#e8e8e8');
  plano(-670, 0, 62, 10, asf, 0.02); for (let x = -697; x < -642; x += 6) plano(x, 0, 3, 0.25, amarelo, 0.03);
  plano((A51.x0 + A51.x1) / 2, 0, A51.x1 - A51.x0, A51.z1 - A51.z0, concreto, 0.016);
  plano(-790, 72, 150, 16, asf, 0.022); for (let x = -858; x < -722; x += 9) plano(x, 72, 5, 0.4, branco, 0.03);   // pista
  { const hel = plano(-740, -62, 16, 16, asf, 0.022); void hel; const an = new THREE.Mesh(new THREE.RingGeometry(6.2, 6.8, 40), branco); an.rotation.x = -Math.PI / 2; an.position.set(-740, 0.03, -62); g.add(an);
    caixa(-742, 0.03, -62, 0.8, 0.02, 6, branco, false, false); caixa(-738, 0.03, -62, 0.8, 0.02, 6, branco, false, false); caixa(-740, 0.03, -62, 3.2, 0.02, 0.8, branco, false, false); }
  // muro com arame no topo; portão a leste (z de -6 a 6)
  const muro = M('#8b8172'), arame = M('#2b2b2b'), H = 5, e = 0.7;
  const muroDe = (x, z, w, d) => { caixa(x, H / 2, z, w, H, d, muro, true); caixa(x, H + 0.35, z, Math.max(w, 0.15), 0.7, Math.max(d, 0.15), arame, false, false); };
  muroDe((A51.x0 + A51.x1) / 2, A51.z0, A51.x1 - A51.x0, e); muroDe((A51.x0 + A51.x1) / 2, A51.z1, A51.x1 - A51.x0, e);
  muroDe(A51.x0, 0, e, A51.z1 - A51.z0);
  muroDe(A51.x1, (A51.z0 - 6) / 2, e, -6 - A51.z0); muroDe(A51.x1, (A51.z1 + 6) / 2, e, A51.z1 - 6);
  const portao = { tipo: 'caixa', x0: A51.x1 - 0.6, x1: A51.x1 + 0.6, z0: -6, z1: 6 }; colisores.push(portao);
  const cancela = new THREE.Group(); cancela.position.set(A51.x1 + 1, 1.1, -6); g.add(cancela);
  { const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 12), M('#d33a2c')); b.position.z = 6; cancela.add(b);
    for (let k = 1; k < 12; k += 2) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.27, 1), M('#f2f2f2')); f.position.z = k; cancela.add(f); } }
  caixa(A51.x1 + 1, 0.55, -6.6, 0.6, 1.1, 0.6, M('#555'));
  // guarita e placas
  caixa(A51.x1 - 6, 1.5, 10, 4, 3, 4, M('#7c8a6a'), true); caixa(A51.x1 - 6, 3.15, 10, 4.6, 0.3, 4.6, M('#4a5242'));
  caixa(A51.x1 - 3.95, 1.8, 10, 0.05, 1, 2.6, M('#9fd0e8', { roughness: 0.1, emissive: '#29424f' }), false, false);
  const placa = textoSprite('⚠️ ÁREA 51 · ACESSO RESTRITO AO EXÉRCITO', { escala: 0.8, fundo: 'rgba(150,30,20,.94)' }); placa.position.set(A51.x1 + 2, 7, 0); g.add(placa);
  const placa2 = textoSprite('🚫 Proibido fotografar · uso de força autorizado', { escala: 0.55, fundo: 'rgba(40,40,40,.9)' }); placa2.position.set(-660, 3.2, 8); g.add(placa2);
  // hangar: paredes altas e o teto aberto no meio (o óvni sai por cima)
  const Hg = A51.hangar, hx0 = Hg.x - Hg.w / 2, hx1 = Hg.x + Hg.w / 2, hz0 = Hg.z - Hg.d / 2, hz1 = Hg.z + Hg.d / 2, HH = 11;
  const chapa = M('#6f757b', { metalness: 0.5, roughness: 0.6 }), ferro = M('#3b3f44');
  caixa(Hg.x, HH / 2, hz0, Hg.w, HH, 0.5, chapa, true); caixa(Hg.x, HH / 2, hz1, Hg.w, HH, 0.5, chapa, true);
  caixa(hx0, HH / 2, Hg.z, 0.5, HH, Hg.d, chapa, true);
  caixa(hx1, HH / 2, (hz0 + (Hg.z + 8)) / 2, 0.5, HH, Hg.z + 8 - hz0, chapa, true);       // parede leste com a porta de pessoal
  caixa(hx1, HH / 2, (hz1 + (Hg.z + 12)) / 2, 0.5, HH, hz1 - (Hg.z + 12), chapa, true);
  caixa(hx1, (HH + 3) / 2, Hg.z + 10, 0.5, HH - 3, 4, chapa, false);
  caixa(hx1 + 0.3, 1.5, Hg.z + 10, 0.1, 3, 4, M('#2a2d31'), false, false).visible = false;
  for (const zz of [hz0 + 3, hz1 - 3]) caixa(Hg.x, HH + 0.2, zz, Hg.w + 0.6, 0.4, 6.4, ferro);                     // faixas do teto (o meio fica aberto)
  const folhas = [-1, 1].map((sg) => caixa(Hg.x, HH + 0.75, Hg.z + sg * 4.4, Hg.w + 0.4, 0.35, 8.9, chapa, false));   // teto que abre: as duas folhas deslizam para os lados
  for (let x = hx0 + 3; x < hx1; x += 7) caixa(x, HH + 0.1, Hg.z, 0.35, 0.35, Hg.d - 12, ferro, false, false);     // vigas
  plano(Hg.x, Hg.z, Hg.w, Hg.d, M('#55595e'), 0.03);
  { const an = new THREE.Mesh(new THREE.RingGeometry(7, 7.5, 48), amarelo); an.rotation.x = -Math.PI / 2; an.position.set(Hg.x, 0.04, Hg.z); g.add(an); }
  const pl3 = textoSprite('HANGAR 18', { escala: 0.6, fundo: 'rgba(40,46,40,.92)' }); pl3.position.set(hx1 + 0.6, HH - 1.5, Hg.z - 2); g.add(pl3);
  // holofotes nas quinas (acendem à noite)
  const lamp = new THREE.MeshBasicMaterial({ color: '#fff6d8', toneMapped: false }), luzCone = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  for (const [x, z] of [[A51.x0 + 3, A51.z0 + 3], [A51.x0 + 3, A51.z1 - 3], [A51.x1 - 3, A51.z0 + 3], [A51.x1 - 3, A51.z1 - 3]]) {
    caixa(x, 7, z, 0.5, 14, 0.5, ferro, false); caixa(x, 14.2, z, 1.4, 0.8, 1.4, ferro, false);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), lamp); l.position.set(x, 14, z); g.add(l);
    const alvoX = (A51.x0 + A51.x1) / 2, alvoZ = 0, dx = alvoX - x, dz = alvoZ - z, L = Math.hypot(dx, 14, dz) * 0.55;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 9, L, 20, 1, true), luzCone);
    cone.position.set(x + dx / Math.hypot(dx, 14, dz) * L / 2, 14 - 14 / Math.hypot(dx, 14, dz) * L / 2, z + dz / Math.hypot(dx, 14, dz) * L / 2);
    cone.lookAt(x, 14, z); cone.rotateX(-Math.PI / 2); g.add(cone);
  }
  // deserto: dunas baixas e cactos (fora do muro e da estrada)
  const duna = M('#c9a46c'), cacto = M('#4f7a3a');
  let sd = 51; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  for (let k = 0; k < 70; k++) {
    const x = D.x0 + 6 + rnd() * (D.x1 - D.x0 - 12), z = D.z0 + 6 + rnd() * (D.z1 - D.z0 - 12);
    if (dentroArea51(x, z, 10) || (Math.abs(z) < 12 && x > A51.x1 - 5)) continue;
    if (k % 3) { const d = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), duna); d.scale.set(6 + rnd() * 10, 0.8 + rnd() * 1.6, 4 + rnd() * 8); d.position.set(x, -0.2, z); d.rotation.y = rnd() * 3; d.receiveShadow = true; g.add(d); }
    else { const h = 2 + rnd() * 2.5; caixa(x, h / 2, z, 0.45, h, 0.45, cacto, true);
      for (const s of [-1, 1]) if (rnd() < 0.7) { const bh = 0.6 + rnd(); caixa(x + s * 0.55, h * 0.45, z, 0.7, 0.3, 0.3, cacto, false, false); caixa(x + s * 0.85, h * 0.45 + bh / 2, z, 0.3, bh, 0.3, cacto, false, false); } }
  }
  // plataformas de vigia nas quinas e as baterias antiaéreas
  for (const [x, z] of [[A51.x0 + 9, A51.z0 + 9], [A51.x0 + 9, A51.z1 - 9], [A51.x1 - 9, A51.z0 + 9], [A51.x1 - 9, A51.z1 - 9]]) {
    caixa(x, 2, z, 3.2, 4, 3.2, M('#6b6f5e'), true); caixa(x, 4.6, z, 3.4, 1.2, 0.15, ferro, false, false);
  }
  const baterias = [[-860, -85], [-860, 35]].map(([x, z]) => criarBateria(g, x, z));
  area51 = { g, portao, cancela, luzCone, folhas, abertura: 0 };
  const x0 = A51.x0, x1 = A51.x1, z0 = A51.z0, z1 = A51.z1, ronda = laco([[x0 + 28, z0 + 15], [x1 - 15, z0 + 15], [x1 - 15, z1 - 15], [x0 + 28, z1 - 15]]);
  registrarBase({ id: 'a51', nome: 'Área 51', rect: A51, aviso: 40, tiro: 15, acesso: acessoArea51, acessoAr: (c) => c.servico === 'ovni' || acessoArea51(),
    aa: { cx: (x0 + x1) / 2, cz: 0, raio: 250 }, baterias, rotulo: 'Exército · Área 51',
    postos: [{ parado: [x1 + 3, -8, Math.PI / 2] }, { parado: [x1 + 3, 8, Math.PI / 2] }, { parado: [x1 - 3, -9, Math.PI / 2] }, { parado: [x1 - 3, 9, Math.PI / 2] },
      ...[[x0 + 9, z0 + 9], [x0 + 9, z1 - 9], [x1 - 9, z0 + 9], [x1 - 9, z1 - 9]].map(([x, z]) => ({ parado: [x, z, Math.atan2(x - (x0 + x1) / 2, z)], alto: 4.05 })),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ l: ronda, fase: k * ronda.total / 8, vel: 1.2 })),
      ...[[x1 - 6, -30], [x1 - 6, 30], [x1 - 40, -60], [x1 - 40, 60], [-783 + 3, -20 + 18], [-783 + 3, -20 - 18], [x0 + 40, 0], [x0 + 70, -95]].map(([x, z]) => ({ parado: [x, z, Math.atan2(x - (x0 + x1) / 2, z)] })),
      ...[x0 + 50, x0 + 110].map((x) => ({ parado: [x, z1 - 4, 0] })), ...[x0 + 50, x0 + 110].map((x) => ({ parado: [x, z0 + 4, Math.PI] }))] });
}
function atualizarArea51(dt) {
  if (!jogador.perfil) return;
  const agora = performance.now(), p = jogador.pos, ok = acessoArea51();
  if (!area51 && Math.hypot(p.x - (A51.x0 + A51.x1) / 2, p.z) < 700) montarArea51();
  if (area51) {
    area51.portao.off = ok;
    const abre = ok && Math.hypot(p.x - A51.x1, p.z) < 18;
    area51.cancela.rotation.x = THREE.MathUtils.lerp(area51.cancela.rotation.x, abre ? -Math.PI / 2 * 0.95 : 0, Math.min(1, dt * 3));
    area51.luzCone.opacity = 0.16 * noiteAtual;
  }
  // de fora não entra (nem pousando)
  if (!ok && !jogador.abducao && dentroArea51(p.x, p.z)) {
    const c = jogador.carro;
    if (c?.voa && !c.aviao) { if ((c.alt || 0) < 9) { c.alt = 9; c.vs = Math.max(0, c.vs || 0); } }
    else if (!c?.aviao) teleportar(A51.x1 + 30, 0);
    if (agora - avisoA51 > 4000) { avisoA51 = agora; aviso('🚫 Área 51: acesso restrito ao Exército (Tenente para cima). Espaço aéreo fechado para pouso.', 4); }
  }
  if (jogador.carro?.servico !== 'ovni') { const pn = $('painelOvni'); if (pn) pn.style.display = 'none'; }
  tetoHangar(dt);
  // o óvni da exposição só aparece para quem tem acesso
  const vit = civico.EXERCITO.veiculos.find((v) => v.modelo === 'ovni');
  if (vit && !ok) vit.mesh.visible = false;
  // luzes de todos os óvnis
  const lista = []; if (vit?.mesh.visible) lista.push(vit.mesh);
  if (meuMilitar?.modelo === 'ovni') lista.push(meuMilitar.mesh);
  for (const r of remotos.values()) if (r.carroModelo === 'ovni' && r.carro?.visible) lista.push(r.carro);
  if (lista.length) ovni.animar(agora / 1000, lista, noiteAtual);
  for (let i = feixesOvni.length - 1; i >= 0; i--) { const f = feixesOvni[i]; if (agora > f.ate) { f.g.parent?.remove(f.g); feixesOvni.splice(i, 1); } else ovni.animarFeixe(f.g, agora / 1000); }
  // à noite, voando, o óvni é avistado
  const c = jogador.carro;
  if (c?.servico === 'ovni') controlesOvni(c, dt);
  if (c?.servico === 'ovni' && !c.invisivel && (c.alt || 0) > 10 && noiteAtual > 0.45 && (tAvistamento -= dt) <= 0) {
    tAvistamento = 45;
    const x = p.x + (Math.random() - 0.5) * 120, z = p.z + (Math.random() - 0.5) * 120;
    conexao?.enviar('ovniVisto', { x: Math.round(x), z: Math.round(z), lugar: regiaoDe(p.x, p.z) });
  }
  if (rastreio?.ovni && agora > ovniMarcaAte) rastrear(null);
}
// ---- abdução
function alvoAbducao() {
  const c = jogador.carro; if (c?.servico !== 'ovni' || (c.alt || 0) < 3 || c.alt > 45 || Math.abs(c.vel) > 5) return null;
  let melhor = null, dm = 7.5;
  for (const [id, r] of remotos) {
    const a = r.alvo; if (!a || !r.av?.raiz.visible || a.cv || a.vc || a.pg || a.tr || a.x > 1500) continue;
    const d = Math.hypot(a.x - jogador.pos.x, a.z - jogador.pos.z); if (d < dm) { dm = d; melhor = { id, r }; }
  }
  if (melhor) return melhor;
  npcs.forEach((n, idx) => {   // moradores da calçada (não os robôs da polícia nem os bandidos)
    if (n.policia || n.bandido || n.abduzido || n.algemado || n.conversa || !n.av?.raiz.visible) return;
    const p = n.av.raiz.position, d = Math.hypot(p.x - jogador.pos.x, p.z - jogador.pos.z); if (d < dm) { dm = d; melhor = { npc: n, idx }; }
  });
  return melhor;
}
function feixeEm(pai, h, seg = 6.5) { const f = ovni.feixe(h); pai.add(f); feixesOvni.push({ g: f, ate: performance.now() + seg * 1000 }); }
function abduzir(alvo) {
  if (!alvo || !conexao) return;
  const agora = performance.now();
  if (agora < abducaoPronta) { aviso(`👽 O feixe está recarregando: ${Math.ceil((abducaoPronta - agora) / 1000)} s.`, 2.5); return; }
  abducaoPronta = agora + 120000;
  const c = jogador.carro;
  feixeEm(c.mesh, c.alt || 10); sons.abducao?.();
  if (alvo.npc) {
    abducaoPronta = agora + 30000;   // morador: recarga curta
    iniciarAbducaoNpc(alvo.npc, c.mesh.position.y);
    conexao.enviar('abducao', { npc: alvo.idx, de: jogador.perfil.id, x: r2(jogador.pos.x), z: r2(jogador.pos.z), y: r2(c.mesh.position.y), h: r2(c.alt || 10) });
    const p = alvo.npc.av.raiz.position; conexao.enviar('ovniAbducao', { x: Math.round(p.x), z: Math.round(p.z), lugar: regiaoDe(p.x, p.z) });
    aviso('👽 Morador subindo no feixe…', 3); return;
  }
  conexao.enviar('abducao', { alvo: alvo.id, de: jogador.perfil.id, x: r2(jogador.pos.x), z: r2(jogador.pos.z), y: r2(c.mesh.position.y), h: r2(c.alt || 10) });
  aviso(`👽 Feixe ligado em ${alvo.r.meta?.nome || 'alguém'}…`, 3);
}
function r2(v) { return Math.round(v * 100) / 100; }
function receberAbducao(e) {
  if (!jogador.perfil) return;
  const r = remotos.get(e.de);   // o feixe sai do óvni de quem abduziu (todos veem)
  if (r?.carro?.visible) feixeEm(r.carro, Number(e.h) || 10);
  else { const o = new THREE.Group(); o.position.set(e.x, e.y, e.z); scene.add(o); feixeEm(o, Number(e.h) || 10); setTimeout(() => scene.remove(o), 7000); }
  if (Math.hypot(e.x - jogador.pos.x, e.z - jogador.pos.z) < 120) sons.abducao?.();
  if (e.npc !== undefined) { const n = npcs[Number(e.npc)]; if (n && !n.abduzido) iniciarAbducaoNpc(n, Number(e.y)); return; }
  if (e.alvo !== jogador.perfil.id) return;
  const j = jogador, agora = performance.now();
  const motivo = j.dentroCasa ? 'está dentro de um lugar fechado' : j.carro || j.trem || j.passageiro || j.onibus || j.voo ? 'está num veículo' : j.morto ? 'está caído'
    : j.pena > 0 || cativo() || presoMilitar() || j.algemado ? 'está preso' : j.abducao ? 'já está sendo levado' : agora - ultimaAbducao < 600000 ? 'foi abduzido há pouco' : null;
  conexao?.enviar('abducaoRes', { para: e.de, ok: !motivo, nome: j.perfil.nome, motivo });
  if (motivo) return;
  iniciarAbducao(e);
}
function receberAbducaoRes(e) {
  if (e.para !== jogador.perfil?.id) return;
  if (e.ok) aviso(`👽 ${e.nome} está subindo no feixe…`, 3);
  else { abducaoPronta = 0; aviso(`👽 Não deu: ${e.nome} ${e.motivo}.`, 3); }
}
function iniciarAbducao(e) {
  const j = jogador; if (j.armado) alternarArma();
  const chao = alturaChao(j.pos.x, j.pos.z);
  j.abducao = { t: 0, chao, topo: Math.max(chao + 3, Number(e.y) - 1.5), fim: false };
  j.alvo = null; ultimaAbducao = performance.now();
  let tela = $('telaAbducao');
  if (!tela) { tela = document.createElement('div'); tela.id = 'telaAbducao'; tela.style.cssText = 'position:fixed;inset:0;z-index:60;pointer-events:auto;background:#fff;opacity:0;transition:background-color 1.2s, opacity .6s'; document.body.appendChild(tela); }
  tela.style.display = 'block'; tela.style.background = '#fff'; setTimeout(() => { tela.style.opacity = "1"; }, 20);
  conexao?.enviar('ovniAbducao', { x: Math.round(j.pos.x), z: Math.round(j.pos.z), lugar: regiaoDe(j.pos.x, j.pos.z) });
}
function seguirAbducao(dt) {
  const j = jogador, A = j.abducao, av = j.avatar; A.t += dt;
  const tela = $('telaAbducao');
  if (A.t > 1.2 && tela && !A.preto) { A.preto = true; tela.style.background = '#000'; }
  j.pos.y = A.chao + Math.min(1, A.t / 4.5) * (A.topo - A.chao);
  av.tocar('idle'); av.raiz.position.copy(j.pos); av.raiz.rotation.y += dt * 1.5; j.yaw = av.raiz.rotation.y;
  av.mixer.update(dt); av.raiz.updateMatrixWorld(true);
  if (A.t > 5.5 && !A.fim) {
    A.fim = true; j.abducao = null;
    // acorda numa rua qualquer da metrópole
    const R = mundo.ruaC, i = Math.floor(Math.random() * 15) - 5, longe = (Math.random() * 2 - 1) * 380;
    const [x, z] = Math.random() < 0.5 ? [R(i), longe] : [longe, R(i)];
    j.pos.y = 0; teleportar(x, z);
    av.raiz.position.copy(j.pos); av.raiz.visible = true;
    setTimeout(() => { if (tela) { tela.style.opacity = '0'; setTimeout(() => { tela.style.display = 'none'; }, 700); } aviso('😵 Você acordou no meio da rua… não lembra de nada.', 5); }, 900);
  }
}
// ---- avistamentos (jornalistas)
function receberOvniVisto(e) {
  if (!jogador.perfil) return;
  const d = Math.hypot(e.x - jogador.pos.x, e.z - jogador.pos.z);
  if (jogador.perfil.profissao === 'jornalista') {
    if (!rastreio || rastreio.ovni) { rastrear({ nome: '🛸 Avistamento de óvni (região aproximada)', x: e.x, z: e.z, ovni: true }); ovniMarcaAte = performance.now() + 180000; }
    aviso(`📰 Avistamento de óvni: ${e.lugar}! Corra para fotografar (Jornal › Tirar foto).`, 5);
  } else if (d < 320 && !jogador.dentroCasa) aviso('🛸 Luzes estranhas no céu…', 4);
}
function receberOvniAbducao(e) {
  if (jogador.perfil?.profissao !== 'jornalista') return;
  if (!rastreio || rastreio.ovni) { rastrear({ nome: '👽 Relato de abdução', x: e.x, z: e.z, ovni: true }); ovniMarcaAte = performance.now() + 180000; }
  aviso(`📰 Relato de abdução: ${e.lugar}. Alguém diz ter sido levado por uma luz no céu!`, 5);
}

// teto do Hangar 18: abre quando um óvni está perto (o seu ou o de outro piloto) e fecha depois
function tetoHangar(dt) {
  if (!area51) return;
  const H = A51.hangar, perto = (o) => o && Math.hypot(o.position.x - H.x, o.position.z - H.z) < 70;
  let abre = jogador.carro?.servico === 'ovni' && perto(jogador.carro.mesh);
  for (const r of remotos.values()) if (r.carroModelo === 'ovni' && perto(r.carro)) abre = true;
  area51.abertura = THREE.MathUtils.clamp(area51.abertura + (abre ? 1 : -1) * dt / 3, 0, 1);   // 3 s para abrir ou fechar
  const k = area51.abertura * area51.abertura * (3 - 2 * area51.abertura);
  area51.folhas.forEach((f, i) => { f.position.z = H.z + (i ? 1 : -1) * (4.4 + 8.8 * k); });
}
function dentroHangar(x, z) { const H = A51.hangar; return Math.abs(x - H.x) < H.w / 2 - 1 && Math.abs(z - H.z) < H.d / 2 - 1; }
// botão de invisibilidade (e pousado fora do hangar ele fica invisível sozinho)
function controlesOvni(c) {
  let pn = $('painelOvni');
  if (!pn) {   // à esquerda, no meio da tela (longe do Sair, das setas da câmera e do manche)
    pn = document.createElement('div'); pn.id = 'painelOvni';
    pn.style.cssText = 'position:fixed;left:calc(env(safe-area-inset-left,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 36vh);z-index:30;display:flex;flex-direction:column;gap:8px';
    const bt = (id, fn) => { const b = document.createElement('button'); b.id = id; b.style.cssText = 'border-radius:14px;border:2px solid #7ff6ff;background:rgba(14,30,40,.88);color:#dffcff;font:800 13px system-ui;padding:8px 10px;min-width:96px;line-height:1.15;touch-action:none';
      b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); }); pn.appendChild(b); return b; };
    bt('btOvniInv', alternarInvisivel);
    bt('btOvniAbd', () => { const a = alvoAbducao(); if (a) abduzir(a); else aviso(dicaAbducao(), 4); });
    document.body.appendChild(pn);
    window.addEventListener('keydown', (ev) => { if (ev.key?.toLowerCase() === 'i' && jogador.carro?.servico === 'ovni' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) alternarInvisivel(); });
  }
  pn.style.display = 'flex';
  if ((c.alt || 0) <= 0.2 && !dentroHangar(jogador.pos.x, jogador.pos.z) && !c.invisivel) { c.invisivel = true; aviso('👻 Pousado fora do hangar: o óvni ficou invisível sozinho.', 3); }
  const bi = $('btOvniInv'), ba = $('btOvniAbd'), alvo = alvoAbducao(), rec = Math.max(0, Math.ceil((abducaoPronta - performance.now()) / 1000));
  const ti = c.invisivel ? '👻 Invisível<br><small>ligado</small>' : '👁️ Visível<br><small>toque p/ sumir</small>';
  if (bi.dataset.t !== ti) { bi.dataset.t = ti; bi.innerHTML = ti; bi.style.borderColor = c.invisivel ? '#b48cff' : '#7ff6ff'; }
  const ta = rec ? `👽 Abduzir<br><small>recarga ${rec} s</small>` : alvo ? `👽 Abduzir<br><small>${esc((alvo.npc ? 'morador' : alvo.r.meta?.nome || 'jogador').slice(0, 12))}</small>` : '👽 Abduzir<br><small>sem alvo</small>';
  if (ba.dataset.t !== ta) { ba.dataset.t = ta; ba.innerHTML = ta; ba.style.opacity = alvo && !rec ? '1' : '.6'; ba.style.borderColor = alvo && !rec ? '#7dff8a' : '#7ff6ff'; }
  const h = c.mesh.getObjectByName?.('ovniHalo'); if (h) h.visible = !c.invisivel;   // para você: sem o halo quando está invisível
}
// por que não dá para abduzir agora
function dicaAbducao() {
  const c = jogador.carro; if (!c) return '';
  if ((c.alt || 0) < 3) return '👽 Suba um pouco: o feixe funciona de 3 a 45 m de altura.';
  if (c.alt > 45) return '👽 Muito alto: desça para menos de 45 m.';
  if (Math.abs(c.vel) > 5) return '👽 Pare o óvni em cima da pessoa.';
  let dm = Infinity; for (const r of remotos.values()) if (r.alvo) dm = Math.min(dm, Math.hypot(r.alvo.x - jogador.pos.x, r.alvo.z - jogador.pos.z));
  return dm === Infinity ? '👽 Nenhum jogador na cidade para abduzir agora.' : `👽 Pare bem em cima de um jogador a pé (o mais perto está a ${Math.round(dm)} m).`;
}
function alternarInvisivel() {
  const c = jogador.carro; if (c?.servico !== 'ovni') return;
  if (c.invisivel && (c.alt || 0) <= 0.2 && !dentroHangar(jogador.pos.x, jogador.pos.z)) { aviso('Pousado fora do hangar ele fica invisível. Decole para aparecer.', 3); return; }
  c.invisivel = !c.invisivel;
  aviso(c.invisivel ? '👻 Óvni invisível: ninguém vê você (o feixe de abdução ainda aparece).' : '🛸 Óvni visível de novo.', 3);
}
// descer do óvni: no hangar ele fica guardado; fora dele, volta sozinho (invisível) para o Hangar 18
function guardarOvni(c) {
  c.invisivel = false;
  if (dentroHangar(c.mesh.position.x, c.mesh.position.z)) { aviso('🛸 Óvni guardado no Hangar 18.', 3); return; }
  scene.remove(c.mesh); if (meuMilitar?.mesh === c.mesh) meuMilitar = null;
  aviso('🛸 O óvni voltou sozinho, invisível, para o Hangar 18.', 3.5);
}

// morador abduzido: sobe girando no feixe, some e volta à calçada depois de 3 min
function iniciarAbducaoNpc(n, yTopo) {
  const p = n.av.raiz.position; n.abduzido = { t: 0, chao: p.y, topo: Math.max(p.y + 3, (yTopo || p.y + 12) - 1.5) };
  n.av.tocar('idle');
}
function npcAbduzido(n, dt) {
  const A = n.abduzido, r = n.av.raiz; A.t += dt;
  if (A.t < 4.5) { r.position.y = A.chao + (A.t / 4.5) * (A.topo - A.chao); r.rotation.y += dt * 2; n.av.mixer.update(dt); return; }
  r.visible = false;
  if (A.t > 180) { n.abduzido = null; r.visible = true; r.position.y = A.chao; n.av.tocar('walk', { velocidade: 0.85 }); }
}

// ================================================================= estrelas e perdão automático
// 1 crime = 1 estrela (no máximo 5). Online, sem perseguição e fora da cadeia: até 3 estrelas some 1 a cada
// 5 min; acima de 3, 20 min por estrela. A conta é no servidor (perdao_tick, a cada 30 s).
function estrelas(n, html = false) { const k = Math.max(0, Math.min(5, Number(n) || 0)); return !k ? '' : html ? '★'.repeat(k) + '<span style="opacity:.3">' + '★'.repeat(5 - k) + '</span>' : '★'.repeat(k); }
let tPerdao = 5, perdaoInfo = null, tPerdaoTxt = 0;
function atualizarPerdao(dt) {
  const p = jogador.perfil; if (!p || !conectado) return;
  if ((p.crimes || 0) <= 0) { perdaoInfo = null; return; }
  if ((tPerdao -= dt) <= 0) {
    tPerdao = 30;
    const perseguido = npcs.some((n) => n.policia && (n.perseguindo || n.cerco)) || !!jogador.algemado || jogador.pena > 0;
    rede.crime.perdaoTick(perseguido).then((r) => {
      if (!r) return;
      perdaoInfo = { falta: Number(r.falta) || 0, pausa: !!r.pausa, t: performance.now() };
      const antes = p.crimes || 0;
      if (Number(r.crimes) < antes) { p.crimes = Number(r.crimes); atualizarInfo(); conexao?.rastrear(metaPresenca()); aviso(p.crimes > 0 ? `⭐ Uma estrela sumiu: ${p.crimes} restante${p.crimes > 1 ? 's' : ''}.` : '✅ Ficha limpa: a polícia parou de procurar você.', 3.5); }
    }).catch(() => {});
  }
  if ((tPerdaoTxt -= dt) > 0) return; tPerdaoTxt = 1;
  const el = $('perdaoTxt'); if (!el) return;
  if (!perdaoInfo) { el.textContent = ''; return; }
  if (perdaoInfo.pausa) { el.textContent = '· perdão pausado'; return; }
  const s = Math.max(0, Math.round(perdaoInfo.falta - (performance.now() - perdaoInfo.t) / 1000));
  el.textContent = `· próxima some em ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ================================================================= BASES MILITARES: Área 51, Quartel e Base Aérea
// Cada base tem soldados armados (avisam a 'aviso' m do muro; a menos de 'tiro' m, 3 s de último aviso e depois atiram)
// e antiaéreo (aeronave sem permissão no raio: 10 s para sair, depois é abatida). Quem insiste vira "invasor"
// por 5 min: os caças podem travar míssil nele (além dos procurados).
const BASES = [];
let invasorAte = 0, invasorAntes = false;
function registrarBase(B) { B.guardas = []; B.postosBase = B.postos || []; B.pedidos = 0; B.st = { tiro: 0, aviso: 0, rajada: 0 }; B.aaSt = { t: 0, aviso: 0, disparo: 0, tiros: 0 }; BASES.push(B); ajustarGuardas(B); return B; }
function criarBateria(g, x, z) {
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o }), ferro = M('#3b3f44');
  const base = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 6), M('#5b6150')); base.position.set(x, 0.6, z); base.castShadow = true; g.add(base);
  colisores.push({ tipo: 'caixa', x0: x - 3, x1: x + 3, z0: z - 3, z1: z + 3 });
  const giro = new THREE.Group(); giro.position.set(x, 1.2, z); g.add(giro);
  const torre = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 1.6, 16), M('#55603f')); torre.position.y = 0.8; giro.add(torre);
  const canos = new THREE.Group(); canos.position.y = 1.4; giro.add(canos);
  for (const sx of [-0.45, 0.45]) { const cn = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5, 10), ferro); cn.rotation.x = Math.PI / 2; cn.position.set(sx, 0, 2.4); canos.add(cn); }
  canos.rotation.x = -0.6;
  const radar = new THREE.Group(); radar.position.set(x + 3.6, 1.2, z + 3.6); g.add(radar);
  const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 8), ferro); haste.position.y = 1.5; radar.add(haste);
  const prato = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 0.15), M('#c9ccd0', { metalness: 0.5 })); prato.position.y = 3.1; radar.add(prato);
  const luz = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false })); luz.position.set(x, 4.3, z); g.add(luz);
  return { x, z, giro, canos, radar, luz };
}
// quantos soldados cada base tem: o General Supremo define no painel (tabela guardas_bases); sem ela, o padrão
const GUARDAS_CONF = {};
let tGuardasConf = 0;
function ajustarGuardas(B) {
  const alvo = Math.max(0, Math.min(60, GUARDAS_CONF[B.id] ?? B.postosBase.length));
  const postos = gerarPostos(B, alvo);
  while (B.guardas.length > alvo) { const s = B.guardas.pop(); scene.remove(s.av.raiz); B.pedidos--; }
  if (B.pedidos > alvo) B.pedidos = alvo;   // os que ainda carregam além do número desistem
  for (let k = B.pedidos; k < alvo; k++) { B.pedidos++; criarGuarda(B, postos[k], k); }
}
// postos a mais: espalhados no contorno de dentro, olhando para fora; um em cada três faz ronda
function gerarPostos(B, n) {
  const base = B.postosBase; if (n <= base.length) return base.slice(0, n);
  const R = B.rect, extra = n - base.length, out = base.slice(), ins = 5;
  const x0 = R.x0 + ins, x1 = R.x1 - ins, z0 = R.z0 + ins, z1 = R.z1 - ins, W = x1 - x0, D = z1 - z0, per = 2 * (W + D);
  const ronda = laco([[R.x0 + 12, R.z0 + 12], [R.x1 - 12, R.z0 + 12], [R.x1 - 12, R.z1 - 12], [R.x0 + 12, R.z1 - 12]]);
  for (let k = 0; k < extra; k++) {
    if (k % 3 === 2) { out.push({ l: ronda, fase: (k / extra) * ronda.total, vel: 1.1 }); continue; }
    let u = ((k + 0.5) / extra) * per, x, z, ang;
    if (u < W) { x = x0 + u; z = z0; ang = Math.PI; } else if ((u -= W) < D) { x = x1; z = z0 + u; ang = Math.PI / 2; }
    else if ((u -= D) < W) { x = x1 - u; z = z1; ang = 0; } else { u -= W; x = x0; z = z1 - u; ang = -Math.PI / 2; }
    out.push({ parado: [x, z, ang] });
  }
  return out;
}
async function criarGuarda(B, d, idx) {
  try {
    const av = await criarAvatar('robos', 'Rusty_Scout_Bot');
    if (idx >= B.pedidos) return;   // o número diminuiu enquanto carregava
    const et = textoSprite(B.rotulo || 'Exército', { escala: 0.5, fundo: 'rgba(62,78,40,.95)' }); et.position.y = 2.2; av.raiz.add(et);
    try { av.arma = novaArma('militar', av); } catch { /* sem arma */ }
    av.raiz.visible = false; scene.add(av.raiz);
    const s = { av, ...d };
    if (d.parado) { av.raiz.position.set(d.parado[0], d.alto || alturaChao(d.parado[0], d.parado[1]), d.parado[1]); av.raiz.rotation.y = d.parado[2]; s.rumo = d.parado[2]; av.tocar('idle'); } else av.tocar('walk', { velocidade: 0.8 });
    B.guardas.push(s);
  } catch { B.pedidos--; }
}
function lerGuardasConf(dt) {
  if (!BASES.length || (tGuardasConf -= dt) > 0) return; tGuardasConf = 60;
  rede.guardas.lista().then((l) => { for (const r of l || []) GUARDAS_CONF[r.base] = r.guardas; for (const B of BASES) ajustarGuardas(B); }).catch(() => {});
}
function distRect(R, x, z) { const dx = Math.max(R.x0 - x, 0, x - R.x1), dz = Math.max(R.z0 - z, 0, z - R.z1); return Math.hypot(dx, dz); }
function marcarInvasor() { invasorAte = performance.now() + 300000; }
function atualizarBases(dt) {
  if (!jogador.perfil) return;
  const p = jogador.pos;
  if (!quartelExtras && Math.hypot(p.x - 200, p.z - 1035) < 650) montarQuartelExtras();
  if (!baseAerea && Math.hypot(p.x - 460, p.z - 1040) < 700) montarBaseAerea();
  for (const B of BASES) { vigiarBase(B, dt); antiaereoBase(B, dt); }
  lerGuardasConf(dt);
  const inv = performance.now() < invasorAte; if (inv !== invasorAntes) { invasorAntes = inv; conexao?.rastrear(metaPresenca()); }
}
function vigiarBase(B, dt) {
  const j = jogador, p = j.pos, agora = performance.now(), R = B.rect;
  const d = distRect(R, p.x, p.z), perto = d < 260;
  const ok = B.acesso(), noAr = j.carro?.voa && (j.carro.alt || 0) > 6;
  const alvo = !ok && !j.morto && !j.abducao && !noAr && !j.dentroCasa && !j.passageiro && !j.voo && perto;
  const naMira = alvo && d < B.tiro, avisar = alvo && d < B.aviso && !(B.livre && B.livre());
  for (const s of B.guardas) {
    const r = s.av.raiz; r.visible = perto; if (!perto) continue;
    if (Math.hypot(r.position.x - p.x, r.position.z - p.z) > 120) continue;   // longe: parado em pose de guarda (economiza o celular)
    if (s.l && !(naMira && Math.hypot(r.position.x - p.x, r.position.z - p.z) < 90)) {
      const q = pontoNoLaco(s.l, agoraServidor() / 1000 * s.vel + s.fase);
      r.position.set(q.x, alturaChao(q.x, q.z), q.z); r.rotation.y = suavizarAngulo(r.rotation.y, q.ang, dt * 6);
      if (s.anim !== 'walk') { s.anim = 'walk'; s.av.tocar('walk', { velocidade: 0.8 }); }
    } else {
      const mira = (avisar || naMira) && Math.hypot(r.position.x - p.x, r.position.z - p.z) < 110;
      r.rotation.y = suavizarAngulo(r.rotation.y, mira ? Math.atan2(p.x - r.position.x, p.z - r.position.z) : s.rumo ?? r.rotation.y, dt * 5);
      if (s.anim !== 'idle') { s.anim = 'idle'; s.av.tocar('idle'); }
    }
    s.av.mixer.update(dt);
  }
  if (!avisar && !naMira) { B.st.tiro = Math.max(0, B.st.tiro - dt * 2); return; }
  const fardado = militar() || j.perfil?.policial || j.perfil?.prf;
  if (!naMira) {
    if (agora - B.st.aviso > 6000) { B.st.aviso = agora; aviso(fardado ? `⚠️ ${B.nome}: acesso só para quem é autorizado. Dê meia-volta ou os soldados atiram.` : `⚠️ ${B.nome}: área militar restrita. Dê meia-volta ou será abatido.`, 4); sons.radio?.(); }
    B.st.tiro = Math.max(0, B.st.tiro - dt);
    return;
  }
  B.st.tiro += dt;
  if (B.st.tiro < 3) { if (agora - B.st.aviso > 1200) { B.st.aviso = agora; aviso(`🔫 ÚLTIMO AVISO: recue agora! (${Math.ceil(3 - B.st.tiro)})`, 1.2); } return; }
  marcarInvasor();
  if ((B.st.rajada -= dt) > 0) return;
  B.st.rajada = 0.7;
  let melhor = null, dm = 120;
  for (const s of B.guardas) { const r = s.av.raiz; if (!r.visible) continue; const dd = Math.hypot(r.position.x - p.x, r.position.z - p.z); if (dd < dm) { dm = dd; melhor = s; } }
  if (!melhor) return;
  const de = melhor.av.raiz.position.clone(); de.y += 1.3;
  const para = new THREE.Vector3(p.x, (p.y || 0) + 1.1, p.z), v = para.clone().sub(de).normalize().multiplyScalar(60);
  criarBola(de, v, '#ffcf3a', false, 0.7);
  conexao?.enviar('tiro', { x: r2(de.x), y: r2(de.y), z: r2(de.z), vx: r2(v.x), vy: r2(v.y), vz: r2(v.z), c: '#ffcf3a', s: 0.7 });
  j.ultimoAgressor = null; danoLocal(25);
  if (j.morto) aviso(`💀 Abatido pelos soldados (${B.nome}).`, 5);
}
function antiaereoBase(B, dt) {
  if (!B.baterias?.length) return;
  const c = jogador.carro, agora = performance.now(), S = B.aaSt, A = B.aa;
  for (const b of B.baterias) { b.radar.rotation.y += dt * 1.8; b.luz.visible = (agora / 500) % 1 < 0.5; }
  const alvo = c?.voa && !c.caminhao && !B.acessoAr(c) && !c.explodiu && Math.hypot(jogador.pos.x - A.cx, jogador.pos.z - A.cz) < A.raio && ((c.alt || 0) > 1 || c.aviao || c.jato);
  if (!alvo) {
    if (S.t > 0) { S.t = 0; S.tiros = 0; if (c?.voa) aviso(`Você saiu do espaço aéreo restrito (${B.nome}).`, 2.5); }
    for (const b of B.baterias) b.giro.rotation.y += dt * 0.3;
    return;
  }
  const y = c.mesh?.position.y ?? 0;
  for (const b of B.baterias) {
    b.giro.rotation.y = suavizarAngulo(b.giro.rotation.y, Math.atan2(jogador.pos.x - b.x, jogador.pos.z - b.z), dt * 4);
    b.canos.rotation.x = -Math.atan2(y - 2.6, Math.hypot(jogador.pos.x - b.x, jogador.pos.z - b.z));
  }
  S.t += dt;
  if (S.t < 10) { if (agora - S.aviso > 2000) { S.aviso = agora; aviso(`🚨 Espaço aéreo restrito (${B.nome}): saia em ${Math.ceil(10 - S.t)} s ou será abatido!`, 2); sons.radio?.(); } return; }
  marcarInvasor();
  if ((S.disparo -= dt) > 0) return;
  S.disparo = 0.35; S.tiros++;
  const p = jogador.pos, b = B.baterias[S.tiros % B.baterias.length];
  const de = new THREE.Vector3(b.x, 4, b.z), para = new THREE.Vector3(p.x, y + 1, p.z), v = para.clone().sub(de).normalize().multiplyScalar(90);
  criarBola(de, v, '#ff7a2a', false, 0.9);
  conexao?.enviar('tiro', { x: r2(de.x), y: r2(de.y), z: r2(de.z), vx: r2(v.x), vy: r2(v.y), vz: r2(v.z), c: '#ff7a2a', s: 0.9 });
  efeitoExplosao(p.x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 5, p.z + (Math.random() - 0.5) * 8, 0.5, false);
  if (S.tiros >= 5) { S.t = 0; S.tiros = 0; acidenteVeiculo(c, `💥 Abatido pela defesa antiaérea (${B.nome})!`); }
}
// cancela que abre sozinha para quem tem acesso (a colisão do portão some para ele)
function cancelaEm(g, x, z, larg, eixo, cor = '#d33a2c') {
  const grupo = new THREE.Group(); grupo.position.set(x, 1.1, z); g.add(grupo);
  const braco = new THREE.Group(); grupo.add(braco);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, larg), new THREE.MeshStandardMaterial({ color: cor })); b.position.z = larg / 2; braco.add(b);
  for (let k = 1; k < larg; k += 2) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.27, 1), new THREE.MeshStandardMaterial({ color: '#f2f2f2' })); f.position.z = k; braco.add(f); }
  if (eixo === 'x') grupo.rotation.y = Math.PI / 2;
  return braco;
}
function abrirCancela(braco, abre, dt) { braco.rotation.x = THREE.MathUtils.lerp(braco.rotation.x, abre ? -Math.PI / 2 * 0.95 : 0, Math.min(1, dt * 3)); }

// ---- Quartel: cancela, guarita de alistamento do lado de fora, soldados com ordem de atirar e antiaéreo
const GUARITA_ALIST = { x: 122, z: 1063.5 };
let quartelExtras = null;
function montarQuartelExtras() {
  const Q = mundo.QUARTEL, pz = Q.portao.z, g = new THREE.Group(); scene.add(g);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
  const portao = { tipo: 'caixa', x0: Q.x0 - 0.6, x1: Q.x0 + 0.6, z0: pz - 6, z1: pz + 6 }; colisores.push(portao);
  const braco = cancelaEm(g, Q.x0 - 1, pz - 6, 12, 'z');
  // guarita de alistamento (fora do portão, ao lado da estrada)
  const G = GUARITA_ALIST, cx = (o, c) => { const m = new THREE.Mesh(o, c); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  cx(new THREE.BoxGeometry(4.6, 3, 3.6), M('#6d7a52')).position.set(G.x, 1.5, G.z + 1.4);
  cx(new THREE.BoxGeometry(5.4, 0.3, 4.4), M('#3f4733')).position.set(G.x, 3.15, G.z + 1.4);
  cx(new THREE.BoxGeometry(3, 0.9, 0.6), M('#4b5238')).position.set(G.x, 0.45, G.z - 0.6);
  colisores.push({ tipo: 'caixa', x0: G.x - 2.3, x1: G.x + 2.3, z0: G.z - 0.3, z1: G.z + 3.2 });
  const pl = textoSprite('🎖️ Alistamento do Exército', { escala: 0.6, fundo: 'rgba(52,62,34,.94)' }); pl.position.set(G.x, 4.2, G.z); g.add(pl);
  criarAvatar('robos', 'Rusty_Scout_Bot').then((av) => { av.raiz.position.set(G.x, alturaChao(G.x, G.z), G.z + 0.6); av.raiz.rotation.y = Math.PI; scene.add(av.raiz); av.tocar('idle'); quartelExtras.recrutador = av; }).catch(() => {});
  const baterias = [[243, 1003], [160, 1001]].map(([x, z]) => criarBateria(g, x, z));
  quartelExtras = { g, portao, braco, recrutador: null };
  registrarBase({ id: 'quartel', nome: 'Quartel do Exército', rect: Q, aviso: 22, tiro: 10, acesso: () => militar(), acessoAr: () => militar(),
    livre: () => Math.hypot(jogador.pos.x - G.x, jogador.pos.z - G.z) < 8,
    aa: { cx: (Q.x0 + Q.x1) / 2, cz: (Q.z0 + Q.z1) / 2, raio: 120 }, baterias, rotulo: 'Exército · Sentinela',
    postos: [{ parado: [Q.x0 - 4, pz - 8, -Math.PI / 2] }, { parado: [Q.x0 - 4, pz + 8, -Math.PI / 2] }, { parado: [Q.x0 + 4, pz - 9, -Math.PI / 2] }, { parado: [Q.x0 + 4, pz + 9, -Math.PI / 2] },
      ...[[Q.x0 + 2, Q.z0 + 2], [Q.x1 - 2, Q.z0 + 2], [Q.x0 + 2, Q.z1 - 2], [Q.x1 - 2, Q.z1 - 2]].map(([x, z]) => ({ parado: [x, z, Math.atan2(x - (Q.x0 + Q.x1) / 2, z - (Q.z0 + Q.z1) / 2)], alto: 10.5 })),
      { parado: [Q.x1 - 4, mundo.PASSAGEM_BASES.z0 - 2, Math.PI / 2] }, { parado: [Q.x1 - 4, mundo.PASSAGEM_BASES.z1 + 2, Math.PI / 2] },
      ...[0, 1, 2, 3, 4, 5].map((k) => { const l = laco([[Q.x0 + 8, Q.z0 + 8], [Q.x1 - 8, Q.z0 + 8], [Q.x1 - 8, Q.z1 - 22], [Q.x0 + 8, Q.z1 - 22]]); return { l, fase: k * l.total / 6, vel: 1.1 }; })] });
}
function atualizarQuartelExtras(dt) {
  if (!quartelExtras) return;
  const Q = mundo.QUARTEL, ok = militar();
  quartelExtras.portao.off = ok;
  abrirCancela(quartelExtras.braco, ok && Math.hypot(jogador.pos.x - Q.x0, jogador.pos.z - Q.portao.z) < 16, dt);
  quartelExtras.recrutador?.mixer.update(dt);
}
// ---- Base Aérea (a leste do quartel): pista, hangares, torre, cancela, soldados e antiaéreo
let baseAerea = null;
function montarBaseAerea() {
  const B = mundo.BASE_AEREA, g = new THREE.Group(); scene.add(g);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
  const plano = (x, z, w, d, mat, ordem) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -ordem; mat.polygonOffsetUnits = -ordem * 4; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02 + ordem * 0.01, z); m.receiveShadow = true; g.add(m); return m; };
  const caixa = (x, y, z, w, h, d, mat, col = false) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); if (col) colisores.push({ tipo: 'caixa', x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); return m; };
  const grama = M('#5d7a3e'), concreto = M('#a29f97'), asf = M('#3b3e45'), branco = M('#ececec'), amarelo = M('#e8c23a'), muro = M('#8c8a6e'), chapa = M('#6f757b', { metalness: 0.4, roughness: 0.6 });
  plano((296 + B.x1 + 8) / 2, (938 + B.z1 + 2) / 2, B.x1 + 8 - 296, B.z1 + 2 - 938, grama, 0);
  plano((B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2, B.x1 - B.x0, B.z1 - B.z0, concreto, 1);
  // rua da rodovia até o portão
  plano((216 + 405) / 2, 945, 405 - 216, 10, M('#41454d'), 2); plano(B.portao.x, (945 + B.z0) / 2, 10, B.z0 - 945, M('#41454d'), 2);
  // pista com marcas, taxiway e pátio
  const P = B.pista; plano((P.x0 + P.x1) / 2, P.z, P.x1 - P.x0, P.larg, asf, 3);
  for (let x = P.x0 + 12; x < P.x1 - 12; x += 14) plano(x, P.z, 7, 0.5, branco, 4);
  for (const x of [P.x0 + 4, P.x1 - 4]) for (let k = -3; k <= 3; k++) plano(x, P.z + k * 2.4, 6, 1, branco, 4);
  plano((P.x0 + P.x1) / 2, 1055, P.x1 - P.x0, 14, asf, 3); for (let x = P.x0; x < P.x1; x += 6) plano(x, 1055, 3, 0.3, amarelo, 4);
  // muro com portão ao norte (x 392..408)
  const H = 3.2, e = 0.6, gx = B.portao.x;
  const m = (x0, z0, x1, z1) => caixa((x0 + x1) / 2, H / 2, (z0 + z1) / 2, Math.max(e, x1 - x0), H, Math.max(e, z1 - z0), muro, true);
  const PS = mundo.PASSAGEM_BASES;
  m(B.x0, B.z0, gx - 8, B.z0 + e); m(gx + 8, B.z0, B.x1, B.z0 + e); m(B.x0, B.z1 - e, B.x1, B.z1);
  m(B.x0, B.z0, B.x0 + e, PS.z0); m(B.x0, PS.z1, B.x0 + e, B.z1); m(B.x1 - e, B.z0, B.x1, PS.z0); m(B.x1 - e, PS.z1, B.x1, B.z1);   // passagens para o Quartel e a Base Naval
  const portao = { tipo: 'caixa', x0: gx - 8, x1: gx + 8, z0: B.z0 - 0.6, z1: B.z0 + 0.6 }; colisores.push(portao);
  const braco = cancelaEm(g, gx - 8, B.z0 - 1, 16, 'x');
  caixa(gx + 11, 1.5, B.z0 + 4, 4, 3, 4, M('#6d7a52'), true); caixa(gx + 11, 3.15, B.z0 + 4, 4.6, 0.3, 4.6, M('#3f4733'));
  const pl = textoSprite('✈️ BASE AÉREA · ACESSO RESTRITO AO EXÉRCITO', { escala: 0.75, fundo: 'rgba(30,60,110,.94)' }); pl.position.set(gx, 6.5, B.z0 - 2); g.add(pl);
  // hangares abertos para o pátio (um para cada caça) e a torre
  for (const [hx, w] of [[350, 26], [395, 28], [455, 40]]) {
    const z0 = 990, d = 30, HH = 10;
    caixa(hx, HH / 2, z0, w, HH, 0.5, chapa, true); caixa(hx - w / 2, HH / 2, z0 + d / 2, 0.5, HH, d, chapa, true); caixa(hx + w / 2, HH / 2, z0 + d / 2, 0.5, HH, d, chapa, true);
    caixa(hx, HH + 0.3, z0 + d / 2, w + 1, 0.6, d + 1, M('#55595e'));
    plano(hx, z0 + d / 2, w, d, M('#5a5d62'), 2);
  }
  caixa(560, 9, 1005, 6, 18, 6, M('#d9d4c8'), true); caixa(560, 19.5, 1005, 9, 3, 9, M('#2a3a4a', { roughness: 0.15, metalness: 0.6, emissive: '#10202c' })); caixa(560, 21.3, 1005, 10, 0.6, 10, M('#4a4f55'));
  const pl2 = textoSprite('Torre · Base Aérea', { escala: 0.55, fundo: 'rgba(30,60,110,.94)' }); pl2.position.set(560, 23.5, 1005); g.add(pl2);
  // plataformas de vigia
  for (const [x, z] of [[B.x0 + 6, B.z0 + 6], [B.x1 - 6, B.z0 + 6], [B.x0 + 6, B.z1 - 6], [B.x1 - 6, B.z1 - 6]]) caixa(x, 2, z, 3.2, 4, 3.2, M('#6b6f5e'), true);
  const baterias = [[318, 1000], [604, 1030]].map(([x, z]) => criarBateria(g, x, z));
  baseAerea = { g, portao, braco };
  registrarBase({ id: 'aerea', nome: 'Base Aérea', rect: B, aviso: 30, tiro: 12, acesso: () => militar(), acessoAr: () => militar(),
    aa: { cx: (B.x0 + B.x1) / 2, cz: (B.z0 + B.z1) / 2, raio: 120 }, baterias, rotulo: 'Base Aérea · Sentinela',
    postos: [{ parado: [gx - 9, B.z0 - 4, Math.PI] }, { parado: [gx + 9, B.z0 - 4, Math.PI] }, { parado: [gx - 10, B.z0 + 4, Math.PI] }, { parado: [gx + 6, B.z0 + 9, Math.PI] },
      ...[[B.x0 + 6, B.z0 + 6], [B.x1 - 6, B.z0 + 6], [B.x0 + 6, B.z1 - 6], [B.x1 - 6, B.z1 - 6]].map(([x, z]) => ({ parado: [x, z, Math.atan2(x - (B.x0 + B.x1) / 2, z - (B.z0 + B.z1) / 2)], alto: 4.05 })),
      { parado: [B.x0 + 4, mundo.PASSAGEM_BASES.z0 - 2, -Math.PI / 2] }, { parado: [B.x1 - 4, mundo.PASSAGEM_BASES.z0 - 2, Math.PI / 2] },
      ...[0, 1, 2, 3, 4, 5].map((k) => { const l = laco([[B.x0 + 10, B.z0 + 10], [B.x1 - 10, B.z0 + 10], [B.x1 - 10, 1064], [B.x0 + 10, 1064]]); return { l, fase: k * l.total / 6, vel: 1.1 }; })] });
}
function atualizarBaseAerea(dt) {
  if (!baseAerea) return;
  const B = mundo.BASE_AEREA, ok = militar();
  baseAerea.portao.off = ok;
  abrirCancela(baseAerea.braco, ok && Math.hypot(jogador.pos.x - B.portao.x, jogador.pos.z - B.z0) < 18, dt);
}

// ---- alistamento: a guarita pede; um oficial (Tenente para cima) aprova
function oficialExercito() { return jogador.perfil?.cargo === 'admin' || (militar() && podePilotarHeliExercito()); }
function menuGuarita() {
  const ops = [];
  if (!militar()) ops.push({ rotulo: '🎖️ Pedir alistamento no Exército', fn: () => rede.exercito.pedirAlistamento().then((r) => aviso(r === 'pendente' ? '⏳ Seu pedido já está esperando a aprovação de um oficial.' : '📨 Pedido enviado! Um oficial do Exército (Tenente para cima) precisa aprovar.', 4.5)).catch((e) => aviso(e.message, 4)) });
  if (oficialExercito()) ops.push({ rotulo: '📋 Pedidos de alistamento', fn: () => menuAlistamentos() });
  if (!militar()) ops.push({ rotulo: '📄 Licitação do transporte de rações', fn: () => racoes.abrir('licitacao') });
  if (!ops.length) ops.push({ rotulo: 'Ok', fn: () => {} });
  escolher('🎖️ Guarita do Exército', militar() ? 'Guarita de alistamento. Oficiais aprovam aqui os novos recrutas.' : 'Quer servir? Peça o alistamento: um oficial do Exército analisa e aprova.', ops);
}
function menuAlistamentos() {
  rede.exercito.alistamentosPendentes().then((l) => {
    if (!l?.length) { aviso('Nenhum pedido de alistamento esperando.', 3); return; }
    escolher('📋 Pedidos de alistamento', 'Toque para decidir:', l.map((a) => ({ rotulo: `${esc(a.nome)} · há ${Math.max(1, Math.round((Date.now() - Date.parse(a.criado)) / 60000))} min`,
      fn: () => escolher(`Alistar ${esc(a.nome)}?`, 'Aprovado, ele vira Recruta do Exército na hora.', [
        { rotulo: '✅ Aprovar', fn: () => rede.exercito.decidirAlistamento(a.id, true).then(() => aviso(`✅ ${a.nome} agora é Recruta.`, 3)).catch((e) => aviso(e.message, 3)) },
        { rotulo: '❌ Recusar', fn: () => rede.exercito.decidirAlistamento(a.id, false).then(() => aviso('Pedido recusado.', 2.5)).catch((e) => aviso(e.message, 3)) }]) })));
  }).catch((e) => aviso(e.message, 3));
}
let tAlist = 20, alistVistos = 0;
function avisarAlistamentos(dt) {
  if (!oficialExercito() || (tAlist -= dt) > 0) return; tAlist = 90;
  rede.exercito.alistamentosPendentes().then((l) => { const n = l?.length || 0; if (n > alistVistos) aviso(`📋 ${n} pedido(s) de alistamento esperando: aprove na guarita do quartel.`, 5); alistVistos = n; }).catch(() => {});
}

// ================================================================= CAÇAS E MÍSSEIS
function pistaMilitar(x, z) { const P = mundo.BASE_AEREA.pista; return x > P.x0 && x < P.x1 && Math.abs(z - P.z) < P.larg / 2 + 2; }
function prepararJato(c) {
  const J = JATOS[c.servico]; c.jato = true; c.noAr = false; c.alt = 0; c.pitch = 0; c.vs = 0; c.misseis = J.misseis; c.trava = null;
  document.body.classList.add('aviao');
  aviso(`✈️ ${J.nome}: taxie até a pista, acelere até ${J.vdec} m/s e puxe o manche (▼). ${J.misseis ? `${J.misseis} mísseis: 🎯 Travar e 🚀 Disparar (só em procurados e invasores).` : 'Botão 👻 Invisível.'}`, 6);
}
// convés do porta-aviões: retângulo da pista (proa para +z) e altura do convés
const CONVES_Y = 14;
function noConves(x, z) {
  const n = NAVIOS.porta; if (!n) return null;
  const dx = x - n.x, dz = z - n.z, c = Math.cos(n.ang), sn = Math.sin(n.ang), lz = dx * sn + dz * c, lx = dx * c - dz * sn;
  return Math.abs(lx) < 14 && Math.abs(lz) < n.comp * 0.45 ? CONVES_Y : null;
}
function pilotarJato(c, dt) {
  const J = JATOS[c.servico];
  let acel = pedais.acel || teclas.has('w'), freio = pedais.freio || teclas.has('s');
  const lado = THREE.MathUtils.clamp(manche.x + (pedais.dir || teclas.has('d') || teclas.has('arrowright') ? 1 : 0) - (pedais.esq || teclas.has('a') || teclas.has('arrowleft') ? 1 : 0), -1, 1);
  const puxa = THREE.MathUtils.clamp(manche.y + (teclas.has('arrowdown') ? 1 : 0) - (teclas.has('arrowup') ? 1 : 0), -1, 1);
  if (c.auto && (Math.abs(lado) > 0.5 || Math.abs(puxa) > 0.5)) { c.auto = null; aviso('🛬 Pouso automático cancelado: você está no comando.', 2.5); }
  if (!c.auto) c.volante = (c.volante || 0) + (lado - (c.volante || 0)) * Math.min(1, dt * 4);
  const conves = noConves(jogador.pos.x, jogador.pos.z);
  const naPista = pistaMilitar(jogador.pos.x, jogador.pos.z) || !!pistaEm(jogador.pos.x, jogador.pos.z) || conves !== null;
  const suave = (alvo, taxa) => { c.pitch += THREE.MathUtils.clamp(alvo - c.pitch, -taxa * dt, taxa * dt); };
  if (!c.noAr) {
    if (c.auto) { acel = false; freio = true; if (c.vel < 0.5) { c.auto = null; aviso('🛬 Pouso automático concluído.', 3); } }
    const lim = naPista ? J.vmax * 0.7 : 12;
    if (acel && !freio) c.vel = Math.min(lim, c.vel + (naPista ? 14 : 4) * dt); else if (freio) c.vel = Math.max(0, c.vel - 16 * dt); else c.vel = Math.max(0, c.vel - 3 * dt);
    jogador.yaw -= c.volante * 1.1 * Math.min(1, c.vel / 3) / (1 + c.vel / 15) * dt;
    jogador.pos.x += Math.sin(jogador.yaw) * c.vel * dt; jogador.pos.z += Math.cos(jogador.yaw) * c.vel * dt;
    if (c.alt > 1) { const n = NAVIOS.porta; if (n?.dx !== undefined) { const rx = jogador.pos.x - n.x0, rz = jogador.pos.z - n.z0, ca = Math.cos(n.dang), sa = Math.sin(n.dang); jogador.pos.x = n.x + rx * ca + rz * sa; jogador.pos.z = n.z - rx * sa + rz * ca; jogador.yaw += n.dang; } }
    if (c.alt > 1 && noConves(jogador.pos.x, jogador.pos.z) === null) { acidenteVeiculo(c, '💥 O caça caiu do porta-aviões no mar!'); return; }
    if (c.alt < 1) resolverColisao(jogador.pos, Math.min(3, J.raio));
    suave(c.vel >= J.vdec * 0.85 && puxa > 0.15 ? 0.18 * puxa : 0, 0.6);
    if (!naPista && c.vel > 18) { acidenteVeiculo(c, '💥 O caça saiu da pista em alta velocidade!'); return; }
    if (naPista && c.vel >= J.vdec && c.pitch > 0.08) { c.noAr = true; c.alt += 0.5; aviso('🛫 Decolou! Manche puxado sobe, empurrado desce. Para pousar, use 🛬 Pouso automático perto da base.', 3.5); }
    c.vs = 0;
  } else {
    const estol = c.vel < J.vdec * 0.75;
    if (c.auto) guiarPouso(c, J, dt);
    else {
      let alvo = estol ? -0.25 : THREE.MathUtils.clamp(puxa * 0.45, -0.45, 0.45);
      if (c.alt > 400 && alvo > 0) alvo = 0;
      suave(alvo, 0.8);
      if (acel && !freio) c.vel += 18 * dt; else if (freio) c.vel -= 16 * dt;
      c.vel = THREE.MathUtils.clamp(c.vel - Math.sin(c.pitch) * 9 * dt, J.vdec * 0.6, J.vmax);
    }
    c.vs = estol && !c.auto ? Math.min(c.vel * Math.sin(c.pitch), -8) : c.vel * Math.sin(c.pitch);
    jogador.yaw -= c.volante * J.giro * dt;
    jogador.pos.x = THREE.MathUtils.clamp(jogador.pos.x + Math.sin(jogador.yaw) * c.vel * Math.cos(c.pitch) * dt, -1300, 1300);
    jogador.pos.z = THREE.MathUtils.clamp(jogador.pos.z + Math.cos(jogador.yaw) * c.vel * Math.cos(c.pitch) * dt, -1400, 1400);
    c.alt = Math.min(420, c.alt + c.vs * dt);
    { const ch = alturaChao(jogador.pos.x, jogador.pos.z); if (aeronaveEmPredio(c, ch)) return; alertaPredio(c, ch); }
    const piso = noConves(jogador.pos.x, jogador.pos.z) ?? 0;
    if (c.alt <= piso + 0.3) {
      const naPista2 = pistaMilitar(jogador.pos.x, jogador.pos.z) || !!pistaEm(jogador.pos.x, jogador.pos.z) || piso > 0;
      const ok = naPista2 && c.vs > -7 && c.vel <= J.vdec * 1.5;
      if (!ok) { acidenteVeiculo(c, !naPista2 ? (jogador.pos.z > 1113 ? '💥 O caça caiu no mar!' : '💥 O caça caiu fora da pista!') : '💥 Pouso rápido demais: o caça se despedaçou!'); return; }
      c.noAr = false; c.alt = piso; c.vs = 0; c.pitch = 0; c.vel = Math.min(c.vel, J.vdec);
      if ((pistaMilitar(jogador.pos.x, jogador.pos.z) || piso > 0) && c.misseis < J.misseis) { c.misseis = J.misseis; aviso(`🛬 Pousou ${piso > 0 ? 'no porta-aviões' : 'na Base Aérea'}: mísseis recarregados.`, 3); } else if (!c.auto) aviso('🛬 Pousou.', 2.5);
    }
  }
  const chao = alturaChao(jogador.pos.x, jogador.pos.z);
  c.mesh.position.set(jogador.pos.x, chao + c.alt, jogador.pos.z);
  jogador.pos.y = chao;
  c.mesh.rotation.set(-c.pitch, jogador.yaw, c.noAr ? c.volante * 0.6 : 0, 'YXZ');
  jato.chamas(c.mesh, acel ? 1 : c.vel / J.vmax * 0.35);
  jogador.avatar.raiz.position.copy(jogador.pos);
  sons.continuo('aviaoG_alto', c.invisivel ? 0.15 : 0.35 + 0.4 * c.vel / J.vmax, 1.2 + c.vel / J.vmax * 0.5);
  controlesJato(c, dt);
}
// ---- pouso automático: escolhe a pista mais perto (Base Aérea ou porta-aviões), entra na reta final e desce na rampa
function pistasPouso() {
  const P = mundo.BASE_AEREA.pista, N = mundo.BASE_NAVAL.porta;
  const n = NAVIOS.porta || { x: N.x, z: N.z, ang: 0, comp: N.comp }, fx = Math.sin(n.ang), fz = Math.cos(n.ang);
  return [{ nome: 'Base Aérea', tx: P.x0 + 12, tz: P.z, dx: 1, dz: 0, h: 0 }, { nome: 'porta-aviões', navio: true, tx: n.x - fx * n.comp * 0.42, tz: n.z - fz * n.comp * 0.42, dx: fx, dz: fz, h: CONVES_Y }];
}
function pistaPousoPerto() {
  let melhor = null, dm = 2200;
  for (const p of pistasPouso()) { const d = Math.hypot(jogador.pos.x - p.tx, jogador.pos.z - p.tz); if (d < dm) { dm = d; melhor = p; } }
  return melhor;
}
function ligarPousoAuto() {
  const c = jogador.carro; if (!c?.jato) return;
  if (!c.noAr) { aviso('🛬 O pouso automático é para quando você está voando.', 2.5); return; }
  if (c.auto) { c.auto = null; aviso('🛬 Pouso automático desligado.', 2); return; }
  const p = pistaPousoPerto(); if (!p) { aviso('🛬 Chegue a menos de 2 km da Base Aérea ou do porta-aviões.', 3); return; }
  c.auto = { p, fase: 'entrada' };
  aviso(`🛬 Pouso automático: indo para a ${p.nome}. Mexa no manche para cancelar.`, 4);
}
function guiarPouso(c, J, dt) {
  const A = c.auto; if (A.p.navio) A.p = pistasPouso()[1];   // o porta-aviões anda: a pista vai junto
  const p = A.p, P = jogador.pos;
  const s = (P.x - p.tx) * p.dx + (P.z - p.tz) * p.dz;                     // distância ao longo da pista (negativo = antes da cabeceira)
  let ax, az, altAlvo, velAlvo;
  if (A.fase === 'entrada') {
    ax = p.tx - p.dx * 1400; az = p.tz - p.dz * 1400; altAlvo = p.h + 110; velAlvo = J.vdec * 1.5;
    if (Math.hypot(P.x - ax, P.z - az) < 180 || (s < -900 && Math.abs((P.x - p.tx) * p.dz - (P.z - p.tz) * p.dx) < 60)) A.fase = 'final';
  }
  if (A.fase === 'final') {
    const frente = Math.max(s + 260, 60);
    ax = p.tx + p.dx * frente; az = p.tz + p.dz * frente;
    altAlvo = p.h + Math.max(-3, -s * 0.075 - 2); velAlvo = s < -250 ? J.vdec * 1.2 : J.vdec * 1.05;   // mira um pouco abaixo: toca logo depois da cabeceira
    if (s > 30 && c.alt > p.h + 25) { A.fase = 'entrada'; aviso('🛬 Arremetendo: vamos dar outra volta.', 2.5); }
  }
  const quer = Math.atan2(ax - P.x, az - P.z), dif = Math.atan2(Math.sin(quer - jogador.yaw), Math.cos(quer - jogador.yaw));
  c.volante = THREE.MathUtils.clamp(-dif * 1.6, -1, 1);
  const vsAlvo = THREE.MathUtils.clamp((altAlvo - c.alt) * 0.7, -10, 10);
  const pitchAlvo = Math.asin(THREE.MathUtils.clamp(vsAlvo / Math.max(c.vel, 1), -0.4, 0.4));
  c.pitch += THREE.MathUtils.clamp(pitchAlvo - c.pitch, -0.8 * dt, 0.8 * dt);
  c.vel += THREE.MathUtils.clamp(velAlvo - c.vel, -12 * dt, 12 * dt);
}
// descer do caça: só parado no chão; fora da Base Aérea ele volta sozinho para o pátio
function guardarJato(c) {
  c.invisivel = false; document.body.classList.remove('aviao');
  const B = mundo.BASE_AEREA, naBase = jogador.pos.x > B.x0 && jogador.pos.x < B.x1 && jogador.pos.z > B.z0 && jogador.pos.z < B.z1;
  if (naBase) { aviso('✈️ Caça estacionado na Base Aérea.', 3); return; }
  scene.remove(c.mesh); if (meuMilitar?.mesh === c.mesh) meuMilitar = null;
  aviso('✈️ O caça voltou com a equipe de solo para a Base Aérea.', 3.5);
}
// ---- painel do caça: Travar, Disparar e (na asa furtiva) Invisível
function controlesJato(c) {
  let pn = $('painelJato');
  if (!pn) {
    pn = document.createElement('div'); pn.id = 'painelJato';
    pn.style.cssText = 'position:fixed;left:calc(env(safe-area-inset-left,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 36vh);z-index:30;display:flex;flex-direction:column;gap:8px';
    const bt = (id, fn) => { const b = document.createElement('button'); b.id = id; b.style.cssText = 'border-radius:14px;border:2px solid #8fd3ff;background:rgba(14,24,40,.88);color:#e3f4ff;font:800 13px system-ui;padding:8px 10px;min-width:100px;line-height:1.15;touch-action:none';
      b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); }); pn.appendChild(b); return b; };
    bt('btJPouso', () => ligarPousoAuto()); bt('btJTravar', () => travarAlvo()); bt('btJDisparar', () => dispararMissil()); bt('btJInv', () => { const k = jogador.carro; if (!k?.jato || !JATOS[k.servico].invisivel) return; k.invisivel = !k.invisivel; aviso(k.invisivel ? '👻 Asa furtiva invisível: ninguém vê você.' : '✈️ Visível de novo.', 3); });
    document.body.appendChild(pn);
  }
  const J = JATOS[c.servico];
  pn.style.display = 'flex';
  $('btJTravar').style.display = $('btJDisparar').style.display = J.misseis ? 'block' : 'none';
  $('btJInv').style.display = J.invisivel ? 'block' : 'none';
  { const bp = $('btJPouso'), perto = c.noAr && !!pistaPousoPerto(); bp.style.display = perto || c.auto ? 'block' : 'none';
    const tp = c.auto ? `🛬 Pouso auto<br><small>${c.auto.p.nome} · cancelar</small>` : '🛬 Pouso<br><small>automático</small>'; if (bp.dataset.t !== tp) { bp.dataset.t = tp; bp.innerHTML = tp; bp.style.borderColor = c.auto ? '#7dff8a' : '#8fd3ff'; } }
  const tr = c.trava, r = tr && remotos.get(tr.id);
  if (tr && (!r?.carro || !alvoMissilValido(r, c, 900))) { c.trava = null; }
  else if (tr && !tr.ok) { tr.t += 1 / 60 * 2; if (tr.t >= 1.5) { tr.ok = true; aviso(`🎯 TRAVADO: ${r.meta?.nome || 'alvo'}`, 2); conexao?.enviar('travado', { de: jogador.perfil.id, alvo: tr.id }); } }
  const t1 = !c.trava ? '🎯 Travar<br><small>procurar alvo</small>' : c.trava.ok ? `🎯 Travado<br><small>${esc((remotos.get(c.trava.id)?.meta?.nome || 'alvo').slice(0, 12))}</small>` : '🎯 Travando…<br><small>mantenha à frente</small>';
  const t2 = `🚀 Disparar<br><small>${c.misseis} míssei${c.misseis === 1 ? 'l' : 's'}</small>`, t3 = c.invisivel ? '👻 Invisível<br><small>ligado</small>' : '👁️ Visível<br><small>toque p/ sumir</small>';
  for (const [id, t] of [['btJTravar', t1], ['btJDisparar', t2], ['btJInv', t3]]) { const b = $(id); if (b.dataset.t !== t) { b.dataset.t = t; b.innerHTML = t; } }
  $('btJDisparar').style.opacity = c.trava?.ok && c.misseis > 0 ? '1' : '.55';
  const h = c.mesh; if (h) h.traverse((o) => { if (o.isMesh && J.invisivel) { o.material.transparent = !!c.invisivel; o.material.opacity = c.invisivel ? 0.35 : 1; } });
}
// alvo válido: aeronave de outro jogador no ar, visível, procurada ou invasora, à frente e no alcance
function alvoMissilValido(r, c, alcance = 700) {
  const o = r.carro; if (!o || !o.visible || !civico.CARROS[r.carroModelo]?.voa) return false;
  if (o.position.y - alturaChao(o.position.x, o.position.z) < 3) return false;
  if (!(r.meta?.crimes > 0 || r.meta?.inv)) return false;
  const dx = o.position.x - jogador.pos.x, dz = o.position.z - jogador.pos.z, d = Math.hypot(dx, dz); if (d > alcance) return false;
  const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - jogador.yaw), Math.cos(Math.atan2(dx, dz) - jogador.yaw)));
  return ang < 0.75;
}
function travarAlvo() {
  const c = jogador.carro; if (!c?.jato || !JATOS[c.servico].misseis) return;
  if (!c.noAr) { aviso('🎯 Decole primeiro.', 2); return; }
  let melhor = null, dm = Infinity;
  for (const [id, r] of remotos) { if (!alvoMissilValido(r, c)) continue; const d = r.carro.position.distanceTo(c.mesh.position); if (d < dm) { dm = d; melhor = id; } }
  if (!melhor) { aviso('🎯 Nenhum alvo: só aeronaves de procurados ou de invasores de área militar, à sua frente, a até 700 m.', 4); c.trava = null; return; }
  c.trava = { id: melhor, t: 0, ok: false };
}
const misseis = [], fumacas = [];
function dispararMissil() {
  const c = jogador.carro; if (!c?.jato) return;
  if (!c.trava?.ok) { aviso('🚀 Trave um alvo antes (🎯).', 2); return; }
  if (c.misseis <= 0) { aviso('🚀 Sem mísseis: pouse na Base Aérea para recarregar.', 3); return; }
  c.misseis--;
  const f = new THREE.Vector3(Math.sin(jogador.yaw), Math.sin(c.pitch), Math.cos(jogador.yaw)).normalize();
  const pos = c.mesh.position.clone().addScaledVector(f, 6).add(new THREE.Vector3(0, -0.6, 0)), vel = f.multiplyScalar(Math.max(60, c.vel + 20));
  const id = jogador.perfil.id.slice(0, 6) + Date.now().toString(36);
  lancarMissil({ id, de: jogador.perfil.id, alvo: c.trava.id, pos, vel, meu: true });
  conexao?.enviar('missil', { id, de: jogador.perfil.id, alvo: c.trava.id, x: r2(pos.x), y: r2(pos.y), z: r2(pos.z), vx: r2(vel.x), vy: r2(vel.y), vz: r2(vel.z) });
  aviso('🚀 Míssil disparado!', 1.5);
}
function lancarMissil(m) {
  const mesh = jato.criarMissil(modelos.missil); mesh.position.copy(m.pos); scene.add(mesh);
  misseis.push({ ...m, mesh, t: 0, fum: 0 });
  sons.tocar('tiro', { vol: 0.9, dist: m.pos.distanceTo(jogador.pos), raio: 200, velocidade: 0.5 });
}
function receberMissil(e) {
  if (!jogador.perfil) return;
  lancarMissil({ id: e.id, de: e.de, alvo: e.alvo, pos: new THREE.Vector3(e.x, e.y, e.z), vel: new THREE.Vector3(e.vx, e.vy, e.vz), meu: false });
  if (e.alvo === jogador.perfil.id) { aviso('🚀 MÍSSIL A CAMINHO! Acelere e faça curva fechada!', 4); sons.radio?.(); }
}
function receberTravado(e) { if (e.alvo === jogador.perfil?.id) { aviso('⚠️ Um caça TRAVOU míssil em você!', 4); sons.radio?.(); } }
function receberMissilAcerto(e) {
  const m = misseis.find((x) => x.id === e.id); if (m) { efeitoExplosao(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, 1.2, false); scene.remove(m.mesh); misseis.splice(misseis.indexOf(m), 1); }
  if (e.alvo !== jogador.perfil?.id) return;
  const c = jogador.carro; if (c?.voa && !c.explodiu) acidenteVeiculo(c, '💥 Abatido por um míssil do Exército!');
}
function atualizarMisseis(dt) {
  jato.animarFumaca(scene, fumacas, dt);
  for (let i = misseis.length - 1; i >= 0; i--) {
    const m = misseis[i]; m.t += dt;
    const alvoPos = m.alvo === jogador.perfil?.id ? (jogador.carro?.mesh?.position || jogador.pos) : remotos.get(m.alvo)?.carro?.position;
    const v = m.vel, vel = Math.min(150, v.length() + 60 * dt);
    if (alvoPos && m.t > 0.4) {   // persegue: vira no máximo 1,1 rad/s
      const quer = alvoPos.clone().sub(m.mesh.position).normalize(), atual = v.clone().normalize(), ang = atual.angleTo(quer), max = 1.1 * dt;
      if (ang > 1e-4) atual.lerp(quer, Math.min(1, max / ang)).normalize();
      v.copy(atual.multiplyScalar(vel));
    } else v.setLength(vel);
    m.mesh.position.addScaledVector(v, dt);
    m.mesh.lookAt(m.mesh.position.clone().add(v));
    if ((m.fum -= dt) <= 0) { m.fum = 0.04; fumacas.push(jato.fumaca(scene, m.mesh.position.clone().addScaledVector(v.clone().normalize(), -2.4))); }
    const acertou = alvoPos && m.mesh.position.distanceTo(alvoPos) < 7, fim = m.t > 9 || m.mesh.position.y < alturaChao(m.mesh.position.x, m.mesh.position.z);
    if (acertou && m.meu) { conexao?.enviar('missilAcerto', { id: m.id, alvo: m.alvo, de: m.de }); aviso('💥 Alvo abatido!', 3); }
    if ((acertou && m.meu) || fim) { efeitoExplosao(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, acertou ? 1.2 : 0.6, false); scene.remove(m.mesh); misseis.splice(i, 1); }
  }
  if (!jogador.carro?.jato) { const pn = $('painelJato'); if (pn) pn.style.display = 'none'; }
  // som dos caças dos outros
  for (const r of remotos.values()) if (r.carro?.visible && civico.CARROS[r.carroModelo]?.jato) sons.continuo('aviaoG_alto', 0.6 * sons.perto(r.carro.position.distanceTo(jogador.pos), 260), 1.4);
}

// ================================================================= MARINHA: Base Naval, navios e míssil de cruzeiro
let baseNaval = null;
const PORTOES_INTERNOS = [];   // passagens entre as bases: só militares passam
function portoesInternos() {
  if (PORTOES_INTERNOS.length) return;
  const PS = mundo.PASSAGEM_BASES, g = new THREE.Group(); scene.add(g);
  for (const x of [mundo.QUARTEL.x1, mundo.BASE_AEREA.x0, mundo.BASE_AEREA.x1, mundo.BASE_NAVAL.x0]) {
    const col = { tipo: 'caixa', x0: x - 0.6, x1: x + 0.6, z0: PS.z0, z1: PS.z1 }; colisores.push(col);
    PORTOES_INTERNOS.push({ col, braco: cancelaEm(g, x + 1, PS.z0, PS.z1 - PS.z0, 'z', '#2c5fd3'), x });
  }
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(50, PS.z1 - PS.z0), new THREE.MeshStandardMaterial({ color: '#41454d', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
  chao.rotation.x = -Math.PI / 2; chao.position.set((mundo.QUARTEL.x1 + mundo.BASE_AEREA.x0) / 2, 0.03, (PS.z0 + PS.z1) / 2); g.add(chao);
  const chao2 = chao.clone(); chao2.scale.x = 0.25; chao2.position.x = (mundo.BASE_AEREA.x1 + mundo.BASE_NAVAL.x0) / 2; g.add(chao2);
}
function atualizarPortoesInternos(dt) {
  const ok = militar();
  for (const p of PORTOES_INTERNOS) { p.col.off = ok; abrirCancela(p.braco, ok && Math.hypot(jogador.pos.x - p.x, jogador.pos.z - (mundo.PASSAGEM_BASES.z0 + mundo.PASSAGEM_BASES.z1) / 2) < 14, dt); }
}
// navio do GLB (proa +z) ou de caixas: comprimento 'comp', quilha 'cala' m abaixo d'água
function navio(nomeGLB, comp, cala, cor) {
  const glb = modelos[nomeGLB];
  if (glb) {
    const piv = new THREE.Group(), c = glb.clone(true); piv.add(c); piv.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(piv), s = comp / Math.max(0.01, b.max.z - b.min.z);
    c.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); piv.scale.setScalar(s); piv.position.y = -cala;
    c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const g = new THREE.Group(); g.add(piv); return g;
  }
  const g = new THREE.Group(), M = (k) => new THREE.MeshStandardMaterial({ color: k, roughness: 0.6, metalness: 0.3 });
  const casco = new THREE.Mesh(new THREE.BoxGeometry(comp * 0.14, cala + 10, comp), M(cor)); casco.position.y = (10 - cala) / 2; g.add(casco);
  const torre = new THREE.Mesh(new THREE.BoxGeometry(comp * 0.05, 14, comp * 0.12), M('#8a9097')); torre.position.set(comp * 0.04, 17, 0); g.add(torre);
  return g;
}
function montarBaseNaval() {
  const N = mundo.BASE_NAVAL, g = new THREE.Group(); scene.add(g);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
  const plano = (x, z, w, d, mat, ordem) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -ordem; mat.polygonOffsetUnits = -ordem * 4; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02 + ordem * 0.01, z); m.receiveShadow = true; g.add(m); return m; };
  const caixa = (x, y, z, w, h, d, mat, col = false) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); if (col) colisores.push({ tipo: 'caixa', x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); return m; };
  const muro = M('#8c8a6e'), concreto = M('#a29f97'), azul = M('#2c4f7c');
  plano((620 + N.x1 + 10) / 2, (938 + N.z1 + 2) / 2, N.x1 + 10 - 620, N.z1 + 2 - 938, M('#5d7a3e'), 0);
  plano((N.x0 + N.x1) / 2, (N.z0 + N.z1) / 2, N.x1 - N.x0, N.z1 - N.z0, concreto, 1);
  plano((405 + N.portao.x + 5) / 2, 945, N.portao.x + 5 - 405, 10, M('#41454d'), 2); plano(N.portao.x, (945 + N.z0) / 2, 10, N.z0 - 945, M('#41454d'), 2);
  // muro (ao sul é o cais, aberto para o mar) com portão ao norte e a passagem para a Base Aérea a oeste
  const H = 3.2, e = 0.6, gx = N.portao.x, PS = mundo.PASSAGEM_BASES;
  const m = (x0, z0, x1, z1) => caixa((x0 + x1) / 2, H / 2, (z0 + z1) / 2, Math.max(e, x1 - x0), H, Math.max(e, z1 - z0), muro, true);
  m(N.x0, N.z0, gx - 8, N.z0 + e); m(gx + 8, N.z0, N.x1, N.z0 + e); m(N.x0, N.z0, N.x0 + e, PS.z0); m(N.x0, PS.z1, N.x0 + e, N.z1); m(N.x1 - e, N.z0, N.x1, N.z1);
  const portao = { tipo: 'caixa', x0: gx - 8, x1: gx + 8, z0: N.z0 - 0.6, z1: N.z0 + 0.6 }; colisores.push(portao);
  const braco = cancelaEm(g, gx - 8, N.z0 - 1, 16, 'x', '#2c5fd3');
  const pl = textoSprite('⚓ BASE NAVAL · ACESSO RESTRITO ÀS FORÇAS ARMADAS', { escala: 0.75, fundo: 'rgba(24,52,96,.95)' }); pl.position.set(gx, 6.5, N.z0 - 2); g.add(pl);
  // comando naval com a central de mísseis, alojamento e cais com dois píeres até os navios
  caixa(700, 4, 1030, 30, 8, 18, M('#d8d3c4'), true); caixa(700, 8.3, 1030, 31, 0.6, 19, azul);
  const pl2 = textoSprite('⚓ Comando Naval · 🚀 Central de Mísseis', { escala: 0.55, fundo: 'rgba(24,52,96,.95)' }); pl2.position.set(700, 10.5, 1030); g.add(pl2);
  caixa(820, 3, 1035, 36, 6, 14, M('#c9c3b2'), true);
  caixa((N.x0 + N.x1) / 2, 0.4, 1112, N.x1 - N.x0, 0.8, 4, concreto);
  for (const x of [675, 760, 845]) caixa(x, 0.35, 1140, 8, 0.7, 56, concreto);
  for (const [x, z] of [[N.x0 + 6, N.z0 + 6], [N.x1 - 6, N.z0 + 6], [N.x0 + 6, N.z1 - 8], [N.x1 - 6, N.z1 - 8]]) caixa(x, 2, z, 3.2, 4, 3.2, M('#6b6f5e'), true);
  const baterias = [[650, 1020], [870, 1020]].map(([x, z]) => criarBateria(g, x, z));
  baseNaval = { g, portao, braco };
  registrarBase({ id: 'naval', nome: 'Base Naval', rect: N, aviso: 30, tiro: 12, acesso: () => militar(), acessoAr: () => militar(),
    aa: { cx: N.porta.x, cz: 1150, raio: 210 }, baterias, rotulo: 'Marinha · Sentinela',
    postos: [{ parado: [gx - 9, N.z0 - 4, Math.PI] }, { parado: [gx + 9, N.z0 - 4, Math.PI] }, { parado: [gx - 10, N.z0 + 4, Math.PI] }, { parado: [gx + 10, N.z0 + 4, Math.PI] },
      ...[[N.x0 + 6, N.z0 + 6], [N.x1 - 6, N.z0 + 6], [N.x0 + 6, N.z1 - 8], [N.x1 - 6, N.z1 - 8]].map(([x, z]) => ({ parado: [x, z, Math.atan2(x - (N.x0 + N.x1) / 2, z - (N.z0 + N.z1) / 2)], alto: 4.05 })),
      ...[0, 1, 2, 3].map((k) => { const l = laco([[N.x0 + 12, N.z0 + 12], [N.x1 - 12, N.z0 + 12], [N.x1 - 12, N.z1 - 12], [N.x0 + 12, N.z1 - 12]]); return { l, fase: k * l.total / 4, vel: 1.1 }; }),
      ...[655, 700, 805, 860].map((x) => ({ parado: [x, N.z1 - 3, 0] }))] });
}
function atualizarBaseNaval(dt) {
  if (!baseNaval) return;
  const N = mundo.BASE_NAVAL, ok = militar();
  baseNaval.portao.off = ok;
  abrirCancela(baseNaval.braco, ok && Math.hypot(jogador.pos.x - N.portao.x, jogador.pos.z - N.z0) < 18, dt);
}
// ---- míssil de cruzeiro: General da Marinha pede, o General Supremo autoriza. Alerta de 20 s no alvo.
const CENTRAL_MISSEIS = { x: 700, z: 1020 };
const AREAS_PROTEGIDAS = () => [{ ...civico.HOSPITAL, r: 60, nome: 'o hospital' }, { ...civico.PREFEITURA, r: 50, nome: 'a prefeitura' }, { ...civico.BOMBEIROS, r: 40, nome: 'os bombeiros' }];
function menuCentralMisseis() {
  const p = jogador.perfil, pode = p?.cargo === 'admin' || (militar() && p?.forca === 'marinha');
  if (!pode) { aviso('🚀 Central de Mísseis: só a Marinha (General) e o General Supremo.', 3.5); return; }
  if (!rastreio) { aviso('🚀 Marque o alvo: abra o mapa grande, toque no ponto e volte aqui.', 4.5); return; }
  const { x, z } = rastreio, prot = AREAS_PROTEGIDAS().find((a) => Math.hypot(a.x - x, a.z - z) < a.r);
  if (prot) { aviso(`🚫 Alvo proibido: perto de ${prot.nome}.`, 3.5); return; }
  escolher('🚀 Míssil de cruzeiro', `Alvo: ${regiaoDe(x, z)} (${Math.round(x)}, ${Math.round(z)}). ${p.cargo === 'admin' ? 'Como General Supremo, você lança direto.' : 'O General Supremo precisa autorizar.'} Quem estiver perto recebe 20 s de alerta.`, [
    { rotulo: p.cargo === 'admin' ? '🚀 Lançar agora' : '📨 Pedir autorização', fn: () => rede.marinha.pedirMissil(x, z).then((r) => {
      if (r?.status === 'lancado') dispararCruzeiro(x, z, p.nome); else aviso('📨 Pedido enviado ao General Supremo. Ele decide em até 10 min.', 4);
    }).catch((e) => aviso(e.message, 4)) },
    { rotulo: 'Cancelar', fn: () => {} }]);
}
function dispararCruzeiro(x, z, autor) {
  const ev = { x: Math.round(x), z: Math.round(z), autor, t: agoraServidor() };
  conexao?.enviar('cruzeiro', ev); receberCruzeiro(ev);
}
const cruzeiros = [];
function receberCruzeiro(e) {
  const N = mundo.BASE_NAVAL, d0 = NAVIOS[Math.abs(Math.round(e.x)) % 2 ? 'd2' : 'd1'] || N.destroieres[0];
  const mesh = jato.criarMissil(modelos.missil_cruzeiro); mesh.scale.setScalar(1.8); scene.add(mesh);
  cruzeiros.push({ ...e, de: new THREE.Vector3(d0.x, 14, d0.z), mesh, fum: 0, avisado: 0 });
  if (Math.hypot(jogador.pos.x - e.x, jogador.pos.z - e.z) > 200) aviso(`🚀 A Marinha lançou um míssil de cruzeiro em direção a: ${regiaoDe(e.x, e.z)}.`, 4);
}
function atualizarCruzeiros(dt) {
  for (let i = cruzeiros.length - 1; i >= 0; i--) {
    const c = cruzeiros[i], k = Math.min(1, (agoraServidor() - c.t) / 20000);
    const alvo = new THREE.Vector3(c.x, alturaChao(c.x, c.z), c.z), pos = c.de.clone().lerp(alvo, k); pos.y += Math.sin(k * Math.PI) * 220 * (1 - k * 0.2);
    const ant = c.mesh.position.clone(); c.mesh.position.copy(pos); if (k > 0.01) c.mesh.lookAt(pos.clone().add(pos.clone().sub(ant)));
    if ((c.fum -= dt) <= 0) { c.fum = 0.06; fumacas.push(jato.fumaca(scene, pos.clone())); }
    const dj = Math.hypot(jogador.pos.x - c.x, jogador.pos.z - c.z), resta = Math.ceil(20 * (1 - k));
    if (dj < 160 && resta !== c.avisado) { c.avisado = resta; aviso(`🚨 MÍSSIL DE CRUZEIRO A CAMINHO DESTA ÁREA! Fuja: ${resta} s`, 1.2); if (resta % 3 === 0) sons.radio?.(); }
    if (k >= 1) {
      scene.remove(c.mesh); cruzeiros.splice(i, 1);
      for (let n = 0; n < 6; n++) efeitoExplosao(c.x + (Math.random() - 0.5) * 16, alvo.y + Math.random() * 4, c.z + (Math.random() - 0.5) * 16, 2.2, false);
      if (!jogador.dentroCasa && !jogador.morto) {
        const carro = jogador.carro;
        if (dj < 25) { if (carro && !carro.explodiu) acidenteVeiculo(carro, '💥 Atingido por um míssil de cruzeiro!'); jogador.ultimoAgressor = null; danoLocal(999); }
        else if (dj < 45) { jogador.ultimoAgressor = null; danoLocal(40); aviso('💥 A explosão do míssil feriu você!', 3); }
      }
    }
  }
}
// o General Supremo é avisado dos pedidos e decide ali mesmo
let tMissilAdm = 8, missilVisto = 0;
function pedidosMissilAdmin(dt) {
  if (jogador.perfil?.cargo !== 'admin' || (tMissilAdm -= dt) > 0) return; tMissilAdm = 20;
  rede.marinha.pendente().then((l) => {
    const m = l?.[0]; if (!m || m.id === missilVisto) return; missilVisto = m.id;
    escolher('🚀 Pedido de míssil de cruzeiro', `${esc(m.autor_nome)} quer lançar em: ${regiaoDe(m.x, m.z)} (${Math.round(m.x)}, ${Math.round(m.z)}).`, [
      { rotulo: '🚀 Autorizar e lançar', fn: () => rede.marinha.decidir(m.id, true).then((r) => { dispararCruzeiro(r.x, r.z, r.autor); aviso('🚀 Míssil lançado.', 3); }).catch((e) => aviso(e.message, 4)) },
      { rotulo: '❌ Recusar', fn: () => rede.marinha.decidir(m.id, false).then(() => aviso('Lançamento recusado.', 2.5)).catch((e) => aviso(e.message, 3)) },
      { rotulo: 'Ver no mapa', fn: () => { rastrear({ nome: '🎯 Alvo do míssil', x: m.x, z: m.z }); missilVisto = 0; } }]);
  }).catch(() => {});
}
function atualizarMarinha(dt) {
  const p = jogador.pos;
  if (!baseNaval && Math.hypot(p.x - 760, p.z - 1100) < 800) montarBaseNaval();
  if (Math.hypot(p.x - 450, p.z - 1054) < 500) portoesInternos();
  atualizarNavios(dt); atualizarPortoesInternos(dt); atualizarBaseNaval(dt); atualizarCruzeiros(dt); pedidosMissilAdmin(dt); atualizarTesteDefesa(dt);
}

// ================================================================= 🧪 teste de defesa das bases (só na tela do admin)
// Um NPC invasor (a pé, de helicóptero ou de avião) segue as mesmas regras dos jogadores: aviso, último aviso,
// tiros dos soldados / alerta do antiaéreo e abate. No fim, um relatório com os tempos.
let teste = null;
const BASE_INFO = {   // portão e a direção "para fora" de cada base
  a51: { montar: () => montarArea51(), portao: () => ({ x: A51.x1, z: 0 }), fora: [1, 0] },
  quartel: { montar: () => montarQuartelExtras(), portao: () => mundo.QUARTEL.portao ? { x: mundo.QUARTEL.x0, z: mundo.QUARTEL.portao.z } : null, fora: [-1, 0] },
  aerea: { montar: () => montarBaseAerea(), portao: () => ({ ...mundo.BASE_AEREA.portao }), fora: [0, -1] },
  naval: { montar: () => montarBaseNaval(), portao: () => ({ ...mundo.BASE_NAVAL.portao }), fora: [0, -1] },
};
function testeDefesa(base, tipo) {
  if (jogador.perfil?.cargo !== 'admin') return 'Só o admin.';
  pararTeste();
  if (base === 'parar') return 'Teste parado.';
  const info = BASE_INFO[base]; if (!info) return 'Base inválida.';
  let B = BASES.find((b) => b.id === base);
  if (!B) { info.montar(); B = BASES.find((b) => b.id === base); }
  if (!B) return 'A base não montou.';
  const g = info.portao(), [fx, fz] = info.fora;
  teste = { B, tipo, t: 0, log: [], fim: false, vida: 100, tiros: 0, aaT: 0, aaTiros: 0, aaDisp: 0, rajada: 0, avisou: false, mirou: false };
  if (tipo === 'pe') {
    teste.pos = new THREE.Vector3(g.x + fx * 60, 0, g.z + fz * 60); teste.alvo = new THREE.Vector3(g.x - fx * 30, 0, g.z - fz * 30);
    criarAvatar('personagens', 'Bandit_Brave').then((av) => {
      if (!teste) return; teste.av = av; av.raiz.position.copy(teste.pos); scene.add(av.raiz); av.tocar('walk', { velocidade: 1.8 });
      const et = textoSprite('INVASOR (teste)', { escala: 0.5, fundo: 'rgba(170,30,30,.95)' }); et.position.y = 2.3; av.raiz.add(et);
    }).catch(() => { teste.log.push('não carregou o invasor'); });
  } else {
    const ar = tipo === 'heli', d = ar ? 400 : 520, mod = ar ? 'helicoptero' : 'aviao_pequeno';
    teste.pos = new THREE.Vector3(B.aa.cx + fx * d, ar ? 40 : 80, B.aa.cz + fz * d);
    teste.mesh = civico.modeloCarro(mod); teste.mesh.position.copy(teste.pos); scene.add(teste.mesh);
    const et = textoSprite('INVASOR (teste)', { escala: 0.6, fundo: 'rgba(170,30,30,.95)' }); et.position.y = 5; teste.mesh.add(et);
    teste.vel = ar ? 30 : 45; teste.orbita = ar ? 40 : 90;
  }
  aviso(`🧪 Teste de defesa: ${tipo === 'pe' ? 'invasor a pé' : tipo === 'heli' ? 'helicóptero' : 'avião'} indo para ${B.nome}.`, 4);
  return null;
}
function pararTeste() {
  if (!teste) return;
  if (teste.av) scene.remove(teste.av.raiz);
  if (teste.mesh) scene.remove(teste.mesh);
  teste = null;
}
function logTeste(txt) { teste.log.push(`${txt} em ${teste.t.toFixed(1)} s`); aviso(`🧪 ${txt} (${teste.t.toFixed(1)} s)`, 2.5); }
function fimTeste(txt) {
  teste.fim = true; teste.log.push(txt);
  const T = teste;
  setTimeout(() => { escolher('🧪 Relatório do teste', `${T.B.nome} · ${T.tipo === 'pe' ? 'invasor a pé' : T.tipo === 'heli' ? 'helicóptero' : 'avião'}:<br>• ${T.log.join('<br>• ')}`, [{ rotulo: 'Ok', fn: () => {} }]); if (teste === T) pararTeste(); }, 2500);
}
function atualizarTesteDefesa(dt) {
  if (!teste || teste.fim && teste.tipo === 'pe') { if (teste?.av) teste.av.mixer.update(dt); return; }
  const T = teste, B = T.B; T.t += dt;
  if (T.t > 90 && !T.fim) { fimTeste('⏱️ 90 s sem abate: a defesa falhou'); return; }
  if (T.tipo === 'pe') {
    if (!T.av) return;
    const r = T.av.raiz, d = distRect(B.rect, r.position.x, r.position.z);
    if (!T.fim) {   // anda até passar do portão (os soldados não deixam)
      const dx = T.alvo.x - r.position.x, dz = T.alvo.z - r.position.z, L = Math.hypot(dx, dz);
      if (L > 1) { const nx = r.position.x + dx / L * 3 * dt, nz = r.position.z + dz / L * 3 * dt; r.position.set(nx, alturaChao(nx, nz), nz); r.rotation.y = Math.atan2(dx, dz); }
    }
    T.av.mixer.update(dt);
    if (!T.avisou && d < B.aviso) { T.avisou = true; logTeste('⚠️ entrou na zona de aviso'); }
    if (d < B.tiro) T.zona = (T.zona || 0) + dt;
    if (T.zona >= 3 && !T.mirou) { T.mirou = true; logTeste('🔫 último aviso acabou: soldados atirando'); }
    if (T.mirou && (T.rajada -= dt) <= 0 && T.vida > 0) {
      T.rajada = 0.7;
      let melhor = null, dm = 120;
      for (const s of B.guardas) { const q = s.av.raiz.position, dd = Math.hypot(q.x - r.position.x, q.z - r.position.z); if (dd < dm) { dm = dd; melhor = s; } }
      if (melhor) {
        const q = melhor.av.raiz; q.rotation.y = Math.atan2(r.position.x - q.position.x, r.position.z - q.position.z);
        const de = new THREE.Vector3(q.position.x, q.position.y + 1.3, q.position.z), vx = r.position.x - de.x, vy = r.position.y + 1.1 - de.y, vz = r.position.z - de.z, vl = Math.hypot(vx, vy, vz) || 1;
        criarBola(de, new THREE.Vector3(vx / vl * 60, vy / vl * 60, vz / vl * 60), '#ffcf3a', false, 0.7);
        T.vida -= 25; T.tiros++;
        if (T.vida <= 0) { T.av.tocar('death', { umaVez: true, velocidade: 1, fade: 0.1 }); logTeste(`💀 invasor abatido com ${T.tiros} tiros`); fimTeste('✅ defesa a pé funcionando'); }
      } else if (!T.semGuarda) { T.semGuarda = true; logTeste('❗ nenhum soldado a menos de 120 m para atirar'); }
    }
    for (const s of B.guardas) { const q = s.av.raiz; if (Math.hypot(q.position.x - r.position.x, q.position.z - r.position.z) < 110 && T.avisou && !T.fim) q.rotation.y = Math.atan2(r.position.x - q.position.x, r.position.z - q.position.z); }
    return;
  }
  // aeronave
  const m = T.mesh, c = new THREE.Vector3(B.aa.cx, T.pos.y, B.aa.cz);
  if (!T.fim) {
    const dc = Math.hypot(T.pos.x - c.x, T.pos.z - c.z);
    if (dc > T.orbita) { const dir = c.clone().sub(T.pos); dir.y = 0; dir.normalize(); T.pos.addScaledVector(dir, T.vel * dt); T.ang = Math.atan2(dir.x, dir.z); }
    else { T.a = (T.a ?? Math.atan2(T.pos.x - c.x, T.pos.z - c.z)) + T.vel / T.orbita * dt; T.pos.set(c.x + Math.sin(T.a) * T.orbita, T.pos.y, c.z + Math.cos(T.a) * T.orbita); T.ang = T.a + Math.PI / 2; }
    m.position.copy(T.pos); m.rotation.set(0, T.ang || 0, 0);
    const dentro = Math.hypot(T.pos.x - B.aa.cx, T.pos.z - B.aa.cz) < B.aa.raio;
    if (dentro) {
      if (!T.avisou) { T.avisou = true; logTeste('📡 radar detectou: alerta de 10 s'); }
      T.aaT += dt;
      for (const b of B.baterias) { b.giro.rotation.y = suavizarAngulo(b.giro.rotation.y, Math.atan2(T.pos.x - b.x, T.pos.z - b.z), dt * 4); b.canos.rotation.x = -Math.atan2(T.pos.y - 2.6, Math.hypot(T.pos.x - b.x, T.pos.z - b.z)); }
      if (T.aaT >= 10 && (T.aaDisp -= dt) <= 0) {
        if (!T.aaTiros) logTeste('💥 antiaéreo disparando');
        T.aaDisp = 0.35; T.aaTiros++;
        const b = B.baterias[T.aaTiros % B.baterias.length], de = new THREE.Vector3(b.x, 4, b.z);
        criarBola(de, T.pos.clone().sub(de).normalize().multiplyScalar(90), '#ff7a2a', false, 0.9);
        efeitoExplosao(T.pos.x + (Math.random() - 0.5) * 8, T.pos.y + (Math.random() - 0.5) * 5, T.pos.z + (Math.random() - 0.5) * 8, 0.5, false);
        if (T.aaTiros >= 5) { efeitoExplosao(T.pos.x, T.pos.y, T.pos.z, 1.6, false); T.fim = true; T.queda = 0; logTeste('🔥 aeronave abatida'); T.log.push('✅ antiaéreo funcionando'); }
      }
    }
  } else if (T.queda !== undefined && T.queda < 3) {   // cai girando
    T.queda += dt; T.pos.y = Math.max(alturaChao(T.pos.x, T.pos.z), T.pos.y - (8 + T.queda * 15) * dt);
    m.position.copy(T.pos); m.rotation.z += dt * 3; m.rotation.x += dt;
    if (T.queda >= 3) { efeitoExplosao(T.pos.x, T.pos.y + 1, T.pos.z, 1.4, false); const Tt = T; setTimeout(() => { escolher('🧪 Relatório do teste', `${Tt.B.nome} · ${Tt.tipo === 'heli' ? 'helicóptero' : 'avião'}:<br>• ${Tt.log.join('<br>• ')}`, [{ rotulo: 'Ok', fn: () => {} }]); if (teste === Tt) pararTeste(); }, 2000); }
  }
}

// ================================================================= NAVIOS: patrulha automática ou tripulados
// Sem piloto, cada navio faz a rota dele pelo mar do sul (do oeste ao leste do mapa) e para 2 min no cais.
// A rota sai do relógio do servidor: todos veem o navio no mesmo lugar. Quem assume o leme manda a posição
// (5 vezes por segundo para os outros, e a cada 4 s para o servidor); ao largar, o navio volta sozinho.
const NAVIOS = {};
const ROTA_EXTERNA = [[900, 1350], [1050, 1560], [600, 1820], [-200, 1840], [-900, 1760], [-1060, 1460], [-700, 1260], [0, 1300], [500, 1330]];
const ROTA_INTERNA = [[950, 1320], [700, 1520], [0, 1540], [-700, 1500], [-920, 1360], [-400, 1260], [300, 1280]];
const DEF_NAVIOS = {
  porta: { nome: 'porta-aviões', glb: 'porta_avioes', comp: 200, cala: 7, convés: CONVES_Y, vel: 4, max: 7, rota: ROTA_INTERNA, fase: 0, cor: '#6b737c' },
  d1: { nome: 'destróier 1', glb: 'destroier', comp: 110, cala: 4, convés: 9, vel: 6, max: 10, rota: ROTA_EXTERNA, fase: 0, cor: '#5f666e' },
  d2: { nome: 'destróier 2', glb: 'destroier', comp: 110, cala: 4, convés: 9, vel: 6, max: 10, rota: ROTA_EXTERNA, fase: 0.5, cor: '#5f666e' },
};
const PARADA_CAIS = 120;   // s atracado
function docaDe(id) { const N = mundo.BASE_NAVAL; return id === 'porta' ? { x: N.porta.x, z: N.porta.z } : { ...N.destroieres[id === 'd1' ? 0 : 1] }; }
function montarNavios() {
  if (NAVIOS.porta) return;
  for (const [id, D] of Object.entries(DEF_NAVIOS)) {
    const mesh = navio(D.glb, D.comp, D.cala, D.cor); scene.add(mesh);
    const doca = docaDe(id), pts = [[doca.x, doca.z], ...D.rota, [doca.x, doca.z + 40], [doca.x, doca.z]];
    const caminho = laco(pts);   // laço fechado: doca → rota → doca
    NAVIOS[id] = { id, ...D, mesh, doca, caminho, x: doca.x, z: doca.z, ang: 0, v: 0, db: null, remoto: null, guardas: [] };
    criarGuardasNavio(NAVIOS[id], id === 'porta' ? 4 : 2);
  }
}
async function criarGuardasNavio(n, k) {
  for (let i = 0; i < k; i++) {
    try {
      const av = await criarAvatar('robos', 'Rusty_Scout_Bot'); const et = textoSprite('Marinha', { escala: 0.5, fundo: 'rgba(24,52,96,.95)' }); et.position.y = 2.2; av.raiz.add(et);
      try { av.arma = novaArma('militar', av); } catch { /* sem arma */ }
      scene.add(av.raiz); av.tocar('idle'); n.guardas.push({ av, lx: (i % 2 ? 1 : -1) * (n.id === 'porta' ? 9 : 3), lz: (i < 2 ? -0.3 : 0.3) * n.comp });
    } catch { /* sem guarda */ }
  }
}
// posição da patrulha no instante t (ms do servidor): parado no cais, depois a volta toda
function patrulhaNavio(n, t) {
  const L = n.caminho.total, periodo = PARADA_CAIS + L / n.vel, u = ((t / 1000 + n.fase * periodo) % periodo + periodo) % periodo;
  if (u < PARADA_CAIS) return { x: n.doca.x, z: n.doca.z, ang: 0, v: 0, cais: true };
  const q = pontoNoLaco(n.caminho, (u - PARADA_CAIS) * n.vel);
  return { x: q.x, z: q.z, ang: q.ang, v: n.vel, cais: false };
}
// depois de largar o leme: vai em linha reta até o cais e espera o próximo ciclo da patrulha
function retorno(n, t) {
  const d = n.db, t0 = Date.parse(d.t), dist = Math.hypot(n.doca.x - d.x, n.doca.z - d.z), tChega = t0 + dist / n.vel * 1000;
  if (t < tChega) { const k = (t - t0) / (tChega - t0 || 1); return { x: d.x + (n.doca.x - d.x) * k, z: d.z + (n.doca.z - d.z) * k, ang: Math.atan2(n.doca.x - d.x, n.doca.z - d.z), v: n.vel, cais: false }; }
  const L = n.caminho.total, periodo = (PARADA_CAIS + L / n.vel) * 1000, fase = n.fase * periodo;
  const prox = Math.ceil((tChega + fase) / periodo) * periodo - fase;
  if (t < prox) return { x: n.doca.x, z: n.doca.z, ang: 0, v: 0, cais: true };
  return patrulhaNavio(n, t);
}
let tNaviosDB = 0;
function lerNavios(dt) {
  if ((tNaviosDB -= dt) > 0) return; tNaviosDB = 8;
  rede.navios.lista().then((l) => { for (const r of l || []) if (NAVIOS[r.id]) NAVIOS[r.id].db = r; }).catch(() => {});
}
function receberNavio(e) { const n = NAVIOS[e.id]; if (n) n.remoto = { ...e, quando: performance.now() }; }
function atualizarNavios(dt) {
  montarNavios(); lerNavios(dt);
  const t = agoraServidor(), meu = jogador.embarcado?.leme ? jogador.embarcado.id : null;
  for (const n of Object.values(NAVIOS)) {
    n.x0 = n.x; n.z0 = n.z; const a0 = n.ang;
    if (n.id === meu) { /* quem pilota move em pilotarNavio */ }
    else {
      const db = n.db, pilotado = db?.modo === 'pilotado' && db.piloto !== jogador.perfil?.id && t - Date.parse(db.t) < 40000;
      let alvo;
      if (pilotado) alvo = n.remoto && performance.now() - n.remoto.quando < 3000 ? n.remoto : { x: db.x, z: db.z, ang: db.ang, v: 0 };
      else if (db?.modo === 'retorno' || (db?.modo === 'pilotado' && db.x != null)) alvo = retorno(n, t);
      else alvo = patrulhaNavio(n, t);
      if (Math.hypot(alvo.x - n.x, alvo.z - n.z) > 60) { n.x = alvo.x; n.z = alvo.z; n.ang = alvo.ang; }
      else { const k = Math.min(1, dt * 3); n.x += (alvo.x - n.x) * k; n.z += (alvo.z - n.z) * k; n.ang = suavizarAngulo(n.ang, alvo.ang, dt * 2); }
      n.v = alvo.v || 0; n.cais = !!alvo.cais;
    }
    n.dang = Math.atan2(Math.sin(n.ang - a0), Math.cos(n.ang - a0)); n.dx = n.x - n.x0;
    const balanco = Math.sin(t / 1300 + n.comp) * 0.008;
    n.mesh.position.set(n.x, Math.sin(t / 1700 + n.comp) * 0.25, n.z); n.mesh.rotation.set(balanco, n.ang, balanco * 0.6, 'YXZ');
    n.mesh.visible = Math.hypot(n.x - jogador.pos.x, n.z - jogador.pos.z) < 1600;
    for (const s of n.guardas) { const p = pontoNoNavio(n, s.lx, s.lz); s.av.raiz.position.set(p.x, n.convés, p.z); s.av.raiz.rotation.y = n.ang + Math.PI; s.av.raiz.visible = n.mesh.visible; if (Math.hypot(p.x - jogador.pos.x, p.z - jogador.pos.z) < 120) s.av.mixer.update(dt); }
  }
}
function pontoNoNavio(n, lx, lz) { const c = Math.cos(n.ang), s = Math.sin(n.ang); return { x: n.x + lx * c + lz * s, z: n.z - lx * s + lz * c }; }
function atracado(n) { return n.cais || (Math.hypot(n.x - n.doca.x, n.z - n.doca.z) < 25 && Math.abs(n.v) < 0.5); }
function podePilotarNavio(id) { const p = jogador.perfil; return p?.cargo === 'admin' || (militar() && p?.forca === 'marinha' && (jogador.patenteNivel || 0) >= (id === 'porta' ? 9 : 8)); }
// ---- embarque: no fim do píer de cada navio, com ele atracado. Até 15 militares por navio.
function navioNoPier() {
  for (const n of Object.values(NAVIOS)) if (Math.hypot(jogador.pos.x - n.doca.x, jogador.pos.z - 1166) < 5) return n;
  return null;
}
function lotacaoNavio(id) { let k = jogador.embarcado?.id === id ? 1 : 0; for (const r of remotos.values()) if (r.meta?.emb === id) k++; return k; }
function contextoNavio() {
  const e = jogador.embarcado;
  if (e) {
    const n = NAVIOS[e.id];
    if (e.leme) return [`no leme do ${n.nome}: ${atracado(n) ? 'atracado' : `${Math.abs(n.v).toFixed(0)} m/s`}`, 'Largar leme'];
    if (atracado(n)) return [`${n.nome} atracado: descer no píer`, 'Desembarcar'];
    return [podePilotarNavio(n.id) && !lemeOcupado(n) ? `a bordo do ${n.nome}: assumir o leme` : `a bordo do ${n.nome} (alto-mar)`, podePilotarNavio(n.id) && !lemeOcupado(n) ? 'Leme' : 'A bordo'];
  }
  const n = navioNoPier(); if (!n) return null;
  if (!atracado(n)) return [`${n.nome} fora do cais (ele volta a cada volta da patrulha)`, '⚓ Píer'];
  return [`⚓ embarcar no ${n.nome} (${lotacaoNavio(n.id)}/15)`, 'Embarcar'];
}
function lemeOcupado(n) { const db = n.db; return db?.modo === 'pilotado' && db.piloto !== jogador.perfil?.id && agoraServidor() - Date.parse(db.t) < 40000; }
function acaoNavio() {
  const e = jogador.embarcado;
  if (e) {
    const n = NAVIOS[e.id];
    if (e.leme) { largarLeme(); return true; }
    if (atracado(n)) { desembarcarNavio(); return true; }
    if (podePilotarNavio(n.id) && !lemeOcupado(n)) { assumirLeme(); return true; }
    return true;
  }
  const n = navioNoPier(); if (!n) return false;
  if (!atracado(n)) { aviso(`O ${n.nome} está em patrulha. Espere ele voltar ao cais.`, 3); return true; }
  if (!militar()) { aviso('⚓ Só militares das Forças Armadas embarcam.', 3); return true; }
  if (lotacaoNavio(n.id) >= 15) { aviso(`⚓ O ${n.nome} está lotado (15 soldados).`, 3); return true; }
  const embarcar = (leme) => { jogador.embarcado = { id: n.id, slot: lotacaoNavio(n.id), leme: false }; if (jogador.armado) alternarArma(); conexao?.rastrear(metaPresenca()); aviso(`⚓ A bordo do ${n.nome}.`, 2.5); if (leme) assumirLeme(); };
  if (podePilotarNavio(n.id) && !lemeOcupado(n)) escolher(`⚓ ${n.nome}`, 'Embarcar como tripulante ou assumir o leme?', [{ rotulo: '🧭 Assumir o leme', fn: () => embarcar(true) }, { rotulo: '🪖 Só embarcar', fn: () => embarcar(false) }]);
  else embarcar(false);
  return true;
}
function assumirLeme() {
  const e = jogador.embarcado, n = NAVIOS[e.id];
  rede.navios.assumir(n.id, n.x, n.z, n.ang).then(() => {
    e.leme = true; n.v = 0; modoVolante(true); aviso(`🧭 Você está no leme do ${n.nome}: acelere, freie/ré e vire. O navio não entra em terra.`, 5);
  }).catch((er) => aviso(er.message, 3.5));
}
function largarLeme() {
  const e = jogador.embarcado, n = NAVIOS[e.id]; e.leme = false; modoVolante(false);
  rede.navios.largar(n.id, n.x, n.z, n.ang).then(() => { n.db = { ...(n.db || {}), modo: 'retorno', piloto: null, x: n.x, z: n.z, ang: n.ang, t: new Date(agoraServidor()).toISOString() }; }).catch(() => {});
  aviso(`🧭 Leme largado: o ${n.nome} volta sozinho para a patrulha.`, 3.5);
}
function desembarcarNavio() {
  const n = NAVIOS[jogador.embarcado.id];
  if (jogador.embarcado.leme) largarLeme();
  jogador.embarcado = null; conexao?.rastrear(metaPresenca());
  jogador.pos.set(n.doca.x, 0, 1164); teleportar(n.doca.x, 1160);
  aviso('⚓ Desembarcou no píer.', 2.5);
}
let tLemeRede = 0, tLemeDB = 0;
function seguirNavio(dt) {
  const j = jogador, e = j.embarcado, n = NAVIOS[e.id]; if (!n) { j.embarcado = null; return; }
  if (e.leme) pilotarNavio(n, dt);
  const lx = e.leme ? 0 : ((e.slot % 4) - 1.5) * (n.id === 'porta' ? 4 : 1.6), lz = e.leme ? n.comp * 0.05 : (Math.floor(e.slot / 4) - 1.5) * (n.id === 'porta' ? 8 : 5);
  const p = pontoNoNavio(n, lx, lz);
  j.pos.set(p.x, n.convés, p.z); j.yaw = n.ang;
  j.avatar.raiz.position.copy(j.pos); j.avatar.raiz.rotation.y = n.ang; j.avatar.tocar('idle'); j.avatar.mixer.update(dt);
}
function pilotarNavio(n, dt) {
  const acel = pedais.acel || teclas.has('w'), freio = pedais.freio || teclas.has('s');
  const lado = THREE.MathUtils.clamp((pedais.dir || teclas.has('d') || teclas.has('arrowright') ? 1 : 0) - (pedais.esq || teclas.has('a') || teclas.has('arrowleft') ? 1 : 0), -1, 1);
  if (acel && !freio) n.v = Math.min(n.max, n.v + 0.8 * dt); else if (freio) n.v = Math.max(-2, n.v - 1.2 * dt); else n.v *= Math.max(0, 1 - 0.05 * dt);
  n.ang -= lado * 0.09 * Math.min(1, Math.abs(n.v) / 3) * Math.sign(n.v || 1) * dt;
  let nx = n.x + Math.sin(n.ang) * n.v * dt, nz = n.z + Math.cos(n.ang) * n.v * dt;
  const meia = n.comp / 2, proaX = nx + Math.sin(n.ang) * meia * Math.sign(n.v || 1), proaZ = nz + Math.cos(n.ang) * meia * Math.sign(n.v || 1);
  const naAgua = (x, z) => Math.abs(x) < 1080 && z > 1135 && z < 1895;
  let bate = !naAgua(proaX, proaZ) && !(Math.hypot(nx - n.doca.x, nz - n.doca.z) < 30);
  for (const o of Object.values(NAVIOS)) if (o !== n && Math.hypot(o.x - nx, o.z - nz) < (o.comp + n.comp) * 0.32) bate = true;
  if (bate) { n.v = 0; if (performance.now() - (n.avisoBate || 0) > 3000) { n.avisoBate = performance.now(); aviso('⚓ Aí não dá: terra ou outro navio à frente.', 2); } }
  else { n.x = nx; n.z = nz; }
  n.cais = false;
  if ((tLemeRede -= dt) <= 0) { tLemeRede = 0.2; conexao?.enviar('navio', { id: n.id, x: r2(n.x), z: r2(n.z), ang: r2(n.ang), v: r2(n.v) }); }
  if ((tLemeDB -= dt) <= 0) { tLemeDB = 4; rede.navios.mover(n.id, n.x, n.z, n.ang).catch(() => {}); }
  sons.continuo('aviaoG_lenta', 0.2 + Math.abs(n.v) / n.max * 0.3, 0.5);
}

// bases militares no mapa (grande e minimapa): pisos, pista, hangares, cais e os navios onde estiverem.
// A Área 51 só aparece para quem tem acesso.
function desenharBasesNoMapa(g, tela, esc, rotulos) {
  const ret = (x0, z0, x1, z1, cor) => { const [a, b] = tela(x0, z0), [c, d] = tela(x1, z1); g.fillStyle = cor; g.fillRect(a, b, c - a, d - b); };
  const txt = (x, z, t) => { if (!rotulos) return; const [mx, mz] = tela(x, z); g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.8)'; g.fillStyle = '#fff'; g.strokeText(t, mx, mz); g.fillText(t, mx, mz); };
  g.save();
  const A = mundo.BASE_AEREA, N = mundo.BASE_NAVAL, P = A.pista, PS = mundo.PASSAGEM_BASES;
  ret(296, 938, N.x1 + 10, N.z1 + 2, '#6f8f4a');
  ret(216, 940, N.portao.x + 5, 950, '#41454d'); ret(A.portao.x - 5, 945, A.portao.x + 5, A.z0, '#41454d'); ret(N.portao.x - 5, 945, N.portao.x + 5, N.z0, '#41454d');
  ret(mundo.QUARTEL.x1, PS.z0, N.x0, PS.z1, '#41454d');
  ret(A.x0, A.z0, A.x1, A.z1, '#a29f97'); ret(P.x0, P.z - P.larg / 2, P.x1, P.z + P.larg / 2, '#3b3e45'); ret(P.x0, 1048, P.x1, 1062, '#4a4e55');
  for (const [hx, w] of [[350, 26], [395, 28], [455, 40]]) ret(hx - w / 2, 990, hx + w / 2, 1020, '#6f757b');
  ret(557, 1002, 563, 1008, '#d9d4c8');
  ret(N.x0, N.z0, N.x1, N.z1, '#a29f97'); ret(685, 1021, 715, 1039, '#d8d3c4'); ret(802, 1028, 838, 1042, '#c9c3b2');
  for (const x of [675, 760, 845]) ret(x - 4, 1112, x + 4, 1168, '#9a978f');
  // navios onde estiverem (retângulo girado)
  for (const n of Object.values(NAVIOS)) {
    const lg = n.id === 'porta' ? 34 : 16, c = Math.cos(n.ang), sn = Math.sin(n.ang), pts = [[-lg / 2, -n.comp / 2], [lg / 2, -n.comp / 2], [lg / 2, n.comp / 2], [0, n.comp / 2 + 8], [-lg / 2, n.comp / 2]];
    g.fillStyle = n.id === 'porta' ? '#59626b' : '#4a525a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath();
    pts.forEach(([lx, lz], i) => { const [mx, mz] = tela(n.x + lx * c + lz * sn, n.z - lx * sn + lz * c); if (i) g.lineTo(mx, mz); else g.moveTo(mx, mz); });
    g.closePath(); g.fill(); g.stroke();
    if (rotulos) txt(n.x, n.z - n.comp / 2 - 10, n.id === 'porta' ? '⚓ Porta-aviões' : '⚓ Destróier');
  }
  txt((A.x0 + A.x1) / 2, A.z0 - 12, '✈️ Base Aérea'); txt((N.x0 + N.x1) / 2, N.z0 - 12, '⚓ Base Naval'); txt((mundo.QUARTEL.x0 + mundo.QUARTEL.x1) / 2, mundo.QUARTEL.z0 - 12, '🪖 Quartel');
  if (acessoArea51()) {
    const R = mundo.AREA51, D = R.deserto;
    ret(D.x0, D.z0, D.x1, D.z1, '#d2b07a'); ret(-700, -5, -640, 5, '#3d4047'); ret(R.x0, R.z0, R.x1, R.z1, '#9d9a92');
    ret(-865, 64, -715, 80, '#3d4047'); ret(R.hangar.x - R.hangar.w / 2, R.hangar.z - R.hangar.d / 2, R.hangar.x + R.hangar.w / 2, R.hangar.z + R.hangar.d / 2, '#6f757b');
    txt((R.x0 + R.x1) / 2, R.z0 - 12, '🛸 Área 51');
  }
  g.restore();
}
