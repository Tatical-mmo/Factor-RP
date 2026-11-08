// Serviços da cidade em tempo real: incêndios (fogo, fumaça e jatos d'água), ponto do emprego,
// placar da guerra de clãs e o processamento periódico (guerras e focos de incêndio).
import * as THREE from 'three';
import * as rede from './rede.js';

let ctx = null;
let incendios = [], tempoFogo = 2, tempoProc = 20, tempoPonto = 45, esperaPonto = 0, tempoGuerra = 3;
let guerras = [], hud = null, apagando = null;
const vistos = new Set(), focos = new Map(), jatos = [];
const matChama = [new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  new THREE.MeshBasicMaterial({ color: '#ffd23a', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })];
const matFumaca = new THREE.MeshBasicMaterial({ color: '#4a4a4a', transparent: true, opacity: 0.45, depthWrite: false });
const matAgua = new THREE.MeshBasicMaterial({ color: '#9fd4ff', transparent: true, opacity: 0.75, depthWrite: false });
const geoChama = new THREE.ConeGeometry(0.9, 2.6, 8), geoFumaca = new THREE.SphereGeometry(1, 8, 6), geoGota = new THREE.SphereGeometry(0.14, 6, 4);

export function iniciar(contexto) {
  ctx = contexto;
  hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:30;background:rgba(120,20,20,.92);color:#fff;padding:5px 12px;border-radius:10px;font:600 13px system-ui;display:none;pointer-events:none;white-space:nowrap';
  document.body.appendChild(hud);
}

export const listaIncendios = () => incendios;
export const guerrasAtivas = () => guerras;

// nomes dos clãs em guerra com o meu clã agora (para a etiqueta INIMIGO)
export function clasInimigos(meuCla, clas) {
  const r = new Set(), agora = ctx.agora();
  for (const g of guerras) {
    if (g.status !== 'aceita' || agora < Date.parse(g.inicio) || agora > Date.parse(g.fim)) continue;
    const outro = g.desafiante === meuCla ? g.desafiado : g.desafiado === meuCla ? g.desafiante : null;
    if (outro) { const c = clas.find((x) => x.id === outro); if (c) r.add(c.nome); }
  }
  return r;
}

function criarFoco(f) {
  const g = new THREE.Group();
  const chamas = [];
  for (let k = 0; k < 7; k++) {
    const m = new THREE.Mesh(geoChama, matChama[k % 2]);
    const a = (k / 7) * Math.PI * 2, r = k === 0 ? 0 : 1.6 + (k % 3) * 0.5;
    m.position.set(Math.cos(a) * r, 1.3, Math.sin(a) * r); m.userData.fase = k * 1.7;
    g.add(m); chamas.push(m);
  }
  const fumacas = [];
  for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(geoFumaca, matFumaca); s.userData.t = k / 6; g.add(s); fumacas.push(s); }
  const placa = ctx.textoSprite(`🔥 FOGO · ${f.nome}`, { escala: 0.8, fundo: 'rgba(190,60,10,.92)' }); placa.position.y = 7; g.add(placa);
  g.position.set(f.x, ctx.altura(f.x, f.z), f.z);
  ctx.scene.add(g);
  return { g, chamas, fumacas, placa, vida: f.vida };
}

function atualizarFocos(dt) {
  const t = performance.now() / 1000, ativos = new Set();
  for (const f of incendios) {
    ativos.add(f.id);
    let o = focos.get(f.id);
    if (!o) { o = criarFoco(f); focos.set(f.id, o); }
    const forca = 0.35 + 0.65 * Math.max(0, f.vida) / 10;
    for (const c of o.chamas) {
      const p = 0.75 + 0.35 * Math.sin(t * 9 + c.userData.fase);
      c.scale.set(forca * (0.9 + 0.2 * Math.sin(t * 7 + c.userData.fase)), forca * p * 1.4, forca * (0.9 + 0.2 * Math.cos(t * 6 + c.userData.fase)));
      c.position.y = 1.3 * forca * p;
    }
    for (const s of o.fumacas) {
      s.userData.t = (s.userData.t + dt * 0.18) % 1;
      const u = s.userData.t;
      s.position.set(Math.sin(u * 6 + s.id) * 1.2, 3 + u * 10, Math.cos(u * 5 + s.id) * 1.2);
      s.scale.setScalar((0.8 + u * 2.4) * forca);
    }
  }
  for (const [id, o] of focos) if (!ativos.has(id)) { ctx.scene.remove(o.g); focos.delete(id); }
  // jatos d'água
  for (let i = jatos.length - 1; i >= 0; i--) {
    const j = jatos[i]; j.vida -= dt; j.v.y -= 9.8 * dt; j.m.position.addScaledVector(j.v, dt);
    if (j.vida <= 0) { ctx.scene.remove(j.m); jatos.splice(i, 1); }
  }
}

function esguichar(f) {
  const p = ctx.jogador().pos;
  for (let k = 0; k < 14; k++) {
    const m = new THREE.Mesh(geoGota, matAgua); m.position.set(p.x, p.y + 1.3, p.z);
    const tempo = 0.55 + Math.random() * 0.2, dx = f.x - p.x + (Math.random() - 0.5) * 2, dz = f.z - p.z + (Math.random() - 0.5) * 2;
    ctx.scene.add(m);
    jatos.push({ m, vida: tempo, v: new THREE.Vector3(dx / tempo, 4.9 * tempo, dz / tempo) });
  }
}

export function fogoProximo(raio = 9) {
  const p = ctx.jogador().pos;
  let melhor = null, dm = raio;
  for (const f of incendios) { const d = Math.hypot(f.x - p.x, f.z - p.z); if (d < dm) { dm = d; melhor = f; } }
  return melhor;
}
export const estaApagando = () => !!apagando;

// segura o jato: 1 por segundo enquanto estiver perto, até apagar
export function apagar(f) {
  if (apagando) { apagando = null; ctx.aviso('Você parou de jogar água.'); return; }
  apagando = { id: f.id, t: 0 };
  ctx.aviso('Jogando água no fogo… fique perto.', 2);
}
async function passoApagar(dt) {
  if (!apagando) return;
  apagando.t -= dt;
  if (apagando.t > 0) return;
  apagando.t = 1;
  const f = incendios.find((x) => x.id === apagando.id);
  const j = ctx.jogador();
  if (!f || j.morto || Math.hypot(f.x - j.pos.x, f.z - j.pos.z) > 10) { apagando = null; return; }
  esguichar(f);
  try {
    const v = await rede.saude.apagar(f.id);
    f.vida = v;
    if (v <= 0) {
      apagando = null; incendios = incendios.filter((x) => x.id !== f.id);
      ctx.aviso(ctx.perfil()?.profissao === 'bombeiro' ? '🚒 Fogo apagado! +400 moedas' : '🚒 Fogo apagado!', 4);
      if (ctx.rastreio()?.nome?.startsWith('🔥')) ctx.rastrear(null);
    } else ctx.aviso(`Apagando… ${v} jatos restantes`, 1.2);
  } catch (e) { apagando = null; ctx.aviso(e.message); }
}

function carregarFogo() {
  rede.saude.incendios().then((lista) => {
    incendios = lista;
    const bombeiro = ctx.perfil()?.profissao === 'bombeiro';
    for (const f of lista) {
      if (vistos.has(f.id)) continue;
      vistos.add(f.id);
      if (bombeiro) { ctx.aviso(`🔥 Incêndio na ${f.nome}! Vá até lá apagar (+400).`, 5); if (!ctx.rastreio()) ctx.rastrear({ nome: `🔥 ${f.nome}`, x: f.x, z: f.z }); }
    }
  }).catch(() => {});
}

function carregarGuerras() {
  rede.guerra.listar().then((l) => { guerras = l; ctx.guerrasMudaram?.(); }).catch(() => {});
}

function desenharHud() {
  const meu = ctx.meuCla(); const agora = ctx.agora();
  const g = meu && guerras.find((x) => x.status === 'aceita' && (x.desafiante === meu || x.desafiado === meu) && agora < Date.parse(x.fim) && agora > Date.parse(x.inicio) - 10 * 60000);
  if (!g) { hud.style.display = 'none'; return; }
  const nome = (id) => ctx.clas().find((c) => c.id === id)?.nome || '?';
  const ini = Date.parse(g.inicio), fim = Date.parse(g.fim);
  const s = Math.max(0, Math.round(((agora < ini ? ini : fim) - agora) / 1000));
  const rel = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  hud.textContent = agora < ini ? `⚔️ Guerra contra ${nome(g.desafiante === meu ? g.desafiado : g.desafiante)} começa em ${rel}`
    : `⚔️ ${nome(g.desafiante)} ${g.pontos_a} × ${g.pontos_b} ${nome(g.desafiado)} · ${rel}`;
  hud.style.display = 'block';
}

function baterPonto() {
  if (esperaPonto > 0) return;
  const j = ctx.jogador();
  if (j.morto || j.dentroCasa || j.trem) return;
  rede.empregos.ponto(j.pos.x, j.pos.z).then((r) => {
    if (r.pago > 0 || r.caixas > 0) ctx.aviso(`⏱️ Ponto batido: +${r.pago} de salário${r.caixas ? ' · +1 caixa produzida' : ''}`, 2.5);
  }).catch((e) => { if (/não tem emprego|dono não bate/.test(e.message)) esperaPonto = 300; });
}

export function atualizar(dt) {
  if (!ctx) return;
  tempoFogo -= dt; tempoProc -= dt; tempoPonto -= dt; tempoGuerra -= dt; esperaPonto -= dt;
  if (tempoFogo <= 0) { tempoFogo = 6; carregarFogo(); }
  if (tempoGuerra <= 0) { tempoGuerra = 15; carregarGuerras(); }
  if (tempoProc <= 0) { tempoProc = 60; rede.saude.processar().catch(() => {}); rede.guerra.processar().catch(() => {}); }
  if (tempoPonto <= 0) { tempoPonto = 60; baterPonto(); }
  atualizarFocos(dt);
  passoApagar(dt);
  desenharHud();
}
export function recarregarGuerras() { tempoGuerra = 0.2; }
export function recomecarPonto() { esperaPonto = 0; tempoPonto = Math.min(tempoPonto, 5); }
