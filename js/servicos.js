// Serviços da cidade em tempo real: incêndios (fogo, fumaça e jatos d'água), ponto do emprego,
// placar da guerra de clãs e o processamento periódico (guerras e focos de incêndio).
import * as THREE from 'three';
import * as rede from './rede.js';
import * as civico from './civico.js';
import { ruaC } from './mundo.js';

let ctx = null;
let incendios = [], tempoFogo = 2, tempoProc = 20, tempoPonto = 45, esperaPonto = 0, tempoGuerra = 3;
let guerras = [], hud = null, apagando = null;
const vistos = new Set(), focos = new Map(), jatos = [];
const matAgua = new THREE.MeshBasicMaterial({ color: '#9fd4ff', transparent: true, opacity: 0.75, depthWrite: false });
const geoGota = new THREE.SphereGeometry(0.14, 6, 4);
let texMancha = null;
function mancha() {     // ponto suave (centro claro, borda transparente) para chamas, brilho e fumaça
  if (texMancha) return texMancha;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  texMancha = new THREE.CanvasTexture(c); return texMancha;
}
const COR_CHAMA = [new THREE.Color('#fff4b0'), new THREE.Color('#ffb21f'), new THREE.Color('#ff5a10'), new THREE.Color('#9a1800')];
function corChama(u, alvo) {   // u de 0 (base, quente) a 1 (topo, frio)
  const k = Math.min(2.999, u * 3), i = Math.floor(k);
  return alvo.copy(COR_CHAMA[i]).lerp(COR_CHAMA[i + 1], k - i);
}

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
  const g = new THREE.Group(), tex = mancha();
  const chamas = [], fumacas = [];
  for (let k = 0; k < 46; k++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#ffb21f', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.userData = { vida: Math.random(), dur: 0.55 + Math.random() * 0.6, x0: 0, z0: 0, sobe: 0 };
    g.add(m); chamas.push(m);
  }
  for (let k = 0; k < 16; k++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#2b2b2b', transparent: true, opacity: 0, depthWrite: false }));
    m.userData = { vida: k / 16, dur: 4 + Math.random() * 1.5, dx: (Math.random() - 0.5) * 2, dz: (Math.random() - 0.5) * 2 };
    g.add(m); fumacas.push(m);
  }
  // brilho alaranjado no chão e marca de queimado
  const brilho = new THREE.Mesh(new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, color: '#ff6a1a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  brilho.position.y = 0.06; g.add(brilho);
  const queimado = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1a1410', transparent: true, opacity: 0.6, depthWrite: false }));
  queimado.position.y = 0.04; g.add(queimado);
  const placa = ctx.textoSprite(`🔥 FOGO · ${f.nome}`, { escala: 0.8, fundo: 'rgba(190,60,10,.92)' }); placa.position.y = 8; g.add(placa);
  g.position.set(f.x, ctx.altura(f.x, f.z), f.z);
  ctx.scene.add(g);
  return { g, chamas, fumacas, brilho };
}

const corTmp = new THREE.Color();
function atualizarFocos(dt) {
  const t = performance.now() / 1000, ativos = new Set();
  for (const f of incendios) {
    ativos.add(f.id);
    let o = focos.get(f.id);
    if (!o) { o = criarFoco(f); focos.set(f.id, o); }
    const forca = 0.3 + 0.7 * Math.max(0, f.vida) / 10, raio = 2.4 * forca;
    for (const c of o.chamas) {
      const u = c.userData; u.vida += dt / u.dur;
      if (u.vida >= 1) { u.vida = 0; const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * raio; u.x0 = Math.cos(a) * r; u.z0 = Math.sin(a) * r; u.sobe = (3 + Math.random() * 3) * forca; }
      const v = u.vida;
      c.position.set(u.x0 * (1 - v * 0.6) + Math.sin(t * 3 + u.x0) * 0.2, 0.3 + v * u.sobe * u.dur * 1.4, u.z0 * (1 - v * 0.6));
      const esc = (1.9 - v * 1.5) * (0.6 + forca * 0.6); c.scale.set(esc, esc * 1.35, 1);
      c.material.color.copy(corChama(v, corTmp)); c.material.opacity = Math.min(1, (1 - v) * 1.6) * 0.9;
    }
    for (const sm of o.fumacas) {
      const u = sm.userData; u.vida += dt / u.dur; if (u.vida >= 1) u.vida = 0;
      const v = u.vida;
      sm.position.set(u.dx * (0.5 + v * 2) + Math.sin(t * 0.7 + u.dx) * 0.6, 2.5 + v * 13 * (0.5 + forca * 0.5), u.dz * (0.5 + v * 2));
      const esc = (2 + v * 6) * (0.5 + forca * 0.5); sm.scale.set(esc, esc, 1);
      sm.material.opacity = Math.sin(v * Math.PI) * 0.5 * (0.4 + forca * 0.6);
    }
    o.brilho.material.opacity = (0.35 + 0.25 * Math.sin(t * 11) * Math.sin(t * 7.3)) * forca + 0.1;
  }
  for (const [id, o] of focos) if (!ativos.has(id)) { ctx.scene.remove(o.g); o.g.traverse((x) => x.material?.dispose?.()); focos.delete(id); }
  // jatos d'água
  for (let i = jatos.length - 1; i >= 0; i--) {
    const jt = jatos[i]; jt.vida -= dt; jt.v.y -= 9.8 * dt; jt.m.position.addScaledVector(jt.v, dt);
    if (jt.vida <= 0) { ctx.scene.remove(jt.m); jatos.splice(i, 1); }
  }
}

function esguichar(f, origem = null, n = 14) {
  const p = origem || ctx.jogador().pos, h = origem ? origem.y : p.y + 1.3;
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(geoGota, matAgua); m.position.set(p.x, h, p.z);
    const tempo = 0.55 + Math.random() * 0.2 + (origem ? 0.3 : 0), dx = f.x - p.x + (Math.random() - 0.5) * 2, dz = f.z - p.z + (Math.random() - 0.5) * 2;
    ctx.scene.add(m);
    jatos.push({ m, vida: tempo, v: new THREE.Vector3(dx / tempo, 4.9 * tempo - (h - ctx.altura(f.x, f.z) - 1) / tempo, dz / tempo) });
  }
}

export function fogoProximo(raio = ctx?.alcanceJato?.() ? ctx.alcanceJato() - 1 : 9) {
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
  const alcance = ctx.alcanceJato?.() || 10;
  if (!f || j.morto || Math.hypot(f.x - j.pos.x, f.z - j.pos.z) > alcance) { apagando = null; return; }
  esguichar(f, alcance > 10 ? new THREE.Vector3(j.pos.x, j.pos.y + 3.6, j.pos.z) : null, alcance > 10 ? 22 : 14);
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
    const r = ctx.rastreio();   // fogo apagado (por alguém ou pela prefeitura): some do rastreio
    if (r?.nome?.startsWith('🔥') && !lista.some((f) => Math.hypot(f.x - r.x, f.z - r.z) < 1)) ctx.rastrear(null);
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

// ---------------------------------------------------------------- NPCs: caminhão dos bombeiros e ambulância
const npcs = new Map();     // chave -> { obj, pts, t0, vel, volta, ... }
function ruaMaisPerto(v) { let m = ruaC(0), d = Infinity; for (let i = -7; i <= 11; i++) { const c = ruaC(i); if (Math.abs(c - v) < d) { d = Math.abs(c - v); m = c; } } return m; }
// caminho pelas ruas (em L): sai para a rua, anda na horizontal, depois na vertical e entra no destino
export function rotaRuas(a, b, parar = 0) {
  const za = ruaMaisPerto(a.z), xb = ruaMaisPerto(b.x), zb = ruaMaisPerto(b.z);
  const pts = [{ x: a.x, z: a.z }, { x: a.x, z: za }, { x: xb, z: za }, { x: xb, z: zb }, { x: b.x, z: zb }, { x: b.x, z: b.z }]
    .filter((p, i, l) => i === 0 || Math.hypot(p.x - l[i - 1].x, p.z - l[i - 1].z) > 0.5);
  if (parar > 0 && pts.length > 1) {   // para um pouco antes do destino
    const u = pts[pts.length - 1], w = pts[pts.length - 2], d = Math.hypot(u.x - w.x, u.z - w.z);
    if (d > parar + 0.5) pts[pts.length - 1] = { x: u.x + (w.x - u.x) / d * parar, z: u.z + (w.z - u.z) / d * parar }; else pts.pop();
  }
  let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return { pts, total };
}
export function pontoNaRota(r, s) {
  let resto = Math.max(0, s);
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], d = Math.hypot(b.x - a.x, b.z - a.z);
    if (resto <= d) { const f = d ? resto / d : 1; return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, ang: Math.atan2(b.x - a.x, b.z - a.z), fim: false }; }
    resto -= d;
  }
  const a = r.pts[r.pts.length - 2] || r.pts[0], b = r.pts[r.pts.length - 1];
  return { x: b.x, z: b.z, ang: Math.atan2(b.x - a.x, b.z - a.z), fim: true };
}
function novoNpc(chave, modelo, base, destino, atraso, vel, parar) {
  const obj = civico.modeloCarro(modelo, '#ffffff');
  obj.visible = false; ctx.scene.add(obj);
  const n = { obj, modelo, base, rota: rotaRuas(base, destino, parar), t0: performance.now() + atraso * 1000, vel, volta: null, chegou: false, atraso: 0 };
  npcs.set(chave, n); return n;
}
function voltarNpc(chave) {
  const n = npcs.get(chave); if (!n || n.volta) return;
  n.volta = rotaRuas({ x: n.obj.position.x, z: n.obj.position.z }, n.base); n.t1 = performance.now(); n.atraso = 0;
  if (!n.obj.visible) { ctx.scene.remove(n.obj); npcs.delete(chave); }
}
function atualizarNpcs(dt) {
  const agora = performance.now(), t = agora / 1000;
  for (const [chave, n] of npcs) {
    if (agora < n.t0) continue;
    // trânsito: espera quem estiver na frente (o atraso é recuperado depois, um pouco mais rápido)
    if (n.obj.visible && !n.chegou || n.volta) {
      const bloq = n.obj.visible && ctx.obstaculo?.(n.obj.position.x, n.obj.position.z, n.obj.rotation.y, n.obj);
      n.atraso = bloq ? Math.min(30, n.atraso + dt) : Math.max(0, n.atraso - dt * 0.4);
    }
    const r = n.volta || n.rota, s = ((agora - (n.volta ? n.t1 : n.t0)) / 1000 - n.atraso) * n.vel, p = pontoNaRota(r, s);
    if (n.volta && p.fim) { ctx.scene.remove(n.obj); npcs.delete(chave); continue; }
    n.obj.visible = true;
    n.obj.position.set(p.x, ctx.altura(p.x, p.z), p.z);
    n.obj.rotation.y = suave(n.obj.rotation.y, p.ang, dt * 6);
    civico.atualizarSirenes(t, n.obj);
    if (!n.volta && p.fim && !n.chegou) { n.chegou = true; n.aoChegar?.(); }
  }
}
const suave = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * Math.min(1, k); };
// bombeiros NPC: saem 60 s depois do início do fogo e jogam água até a prefeitura apagar (3 min)
function npcsDeFogo(dt) {
  const agora = ctx.agora(), ativos = new Set();
  for (const f of incendios) {
    const chave = 'fogo' + f.id; ativos.add(chave);
    const desde = (agora - Date.parse(f.inicio)) / 1000;
    if (desde < 60) continue;
    let n = npcs.get(chave);
    if (!n) n = novoNpc(chave, 'bombeiros', civico.BOMBEIROS.vaga, f, 0, 16, 9);
    if (n.chegou && !n.volta) {
      n.jato = (n.jato || 0) - dt;
      if (n.jato <= 0) { n.jato = 0.35; esguichar(f, new THREE.Vector3(n.obj.position.x, n.obj.position.y + 4, n.obj.position.z), 6); }
    }
  }
  for (const chave of npcs.keys()) if (chave.startsWith('fogo') && !ativos.has(chave)) voltarNpc(chave);
}
// ambulância NPC: vai até o ferido e, ao chegar, chama aoChegar (o atendimento leva 2,5 s)
export function chamarAmbulancia(chave, alvo, aoChegar, atraso = 1.5) {
  const ex = npcs.get('amb' + chave);
  if (ex && !ex.volta) return null;
  if (ex) { ctx.scene.remove(ex.obj); npcs.delete('amb' + chave); }
  const n = novoNpc('amb' + chave, 'ambulancia', civico.HOSPITAL.vaga, alvo, atraso, 24, 4);
  n.aoChegar = () => setTimeout(() => { aoChegar?.(); setTimeout(() => voltarNpc('amb' + chave), 2500); }, 2500);
  return (n.rota.total / 24) + atraso + 2.5;     // segundos até o atendimento
}
export function cancelarAmbulancia(chave) { voltarNpc('amb' + chave); }
export function veiculosNpc() { const r = []; for (const n of npcs.values()) if (n.obj.visible) r.push(n.obj); return r; }

export function atualizar(dt) {
  if (!ctx) return;
  tempoFogo -= dt; tempoProc -= dt; tempoPonto -= dt; tempoGuerra -= dt; esperaPonto -= dt;
  if (tempoFogo <= 0) { tempoFogo = 6; carregarFogo(); }
  if (tempoGuerra <= 0) { tempoGuerra = 15; carregarGuerras(); }
  if (tempoProc <= 0) { tempoProc = 60; rede.saude.processar().catch(() => {}); rede.guerra.processar().catch(() => {}); }
  if (tempoPonto <= 0) { tempoPonto = 60; baterPonto(); }
  atualizarFocos(dt);
  npcsDeFogo(dt);
  atualizarNpcs(dt);
  passoApagar(dt);
  desenharHud();
}
export function recarregarGuerras() { tempoGuerra = 0.2; }
export function recomecarPonto() { esperaPonto = 0; tempoPonto = Math.min(tempoPonto, 5); }
