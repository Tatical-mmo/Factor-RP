// Semáforos brasileiros funcionando: um poste por esquina, virado para quem chega (do lado direito, do outro lado
// do cruzamento), caixa preta em pé com anteparo, três luzes (vermelho em cima, amarelo, verde embaixo) e pala.
// O ciclo vem do horário do servidor (todo mundo vê igual) e cada cruzamento tem um pequeno atraso ("onda verde").
// Os NPCs perguntam sinalAFrente() antes de entrar no cruzamento.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CIDADE } from './config.js';

const RW = CIDADE.rua, H = RW / 2 + 0.9;           // poste na esquina, fora do asfalto
const CICLO = 28;                                  // verde 10 · amarelo 3 · tudo vermelho 1 (para cada rua)
const MAX = 72;                                    // cabeças desenhadas perto de quem joga
const LUZ_Y = [3.72, 3.34, 2.96];                  // vermelho, amarelo, verde
const ACESA = [new THREE.Color('#ff2414'), new THREE.Color('#ffb000'), new THREE.Color('#16e868')];
const APAGADA = [new THREE.Color('#2a0f0b'), new THREE.Color('#2a2006'), new THREE.Color('#0a2414')];

let cruz = [], cabecas = [], colunas = new Map(), linhas = new Map(), relogio = () => Date.now() / 1000;
let poste = null, corpo = null, luzes = null, ativas = [], tempoLod = 0;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0);

// estado da luz para quem anda ao longo de z (vert) ou de x
function fase(c, vert, t) {
  const u = ((t + c.off) % CICLO + CICLO) % CICLO;
  if (vert) return u < 10 ? 2 : u < 13 ? 1 : 0;   // 2 verde · 1 amarelo · 0 vermelho
  return u >= 14 && u < 24 ? 2 : u >= 24 && u < 27 ? 1 : 0;
}

// lista: [{ x, z, y }] dos cruzamentos; alturaChao(x, z) para o pé do poste
export function iniciar(scene, lista, alturaChao, relogioServidor) {
  if (relogioServidor) relogio = relogioServidor;
  cruz = lista.map((c) => ({ x: c.x, z: c.z, off: (((c.x + c.z) / 54) * 2.5 % CICLO + CICLO) % CICLO }));
  for (const c of cruz) {
    const kx = Math.round(c.x), kz = Math.round(c.z);
    if (!colunas.has(kx)) colunas.set(kx, []); colunas.get(kx).push(c);
    if (!linhas.has(kz)) linhas.set(kz, []); linhas.get(kz).push(c);
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {   // d = sentido de quem chega
      const rx = -dz, rz = dx, x = c.x + dx * H + rx * H, z = c.z + dz * H + rz * H;
      cabecas.push({ c, vert: dx === 0, x, z, y: alturaChao(x, z), ang: Math.atan2(-dx, -dz) });
    }
  }
  for (const l of [...colunas.values()]) l.sort((a, b) => a.z - b.z);
  for (const l of [...linhas.values()]) l.sort((a, b) => a.x - b.x);
  // poste cinza; caixa, anteparo e palas pretos (uma malha só); luzes com cor por cópia
  const gp = new THREE.CylinderGeometry(0.07, 0.09, 3.2, 8); gp.translate(0, 1.6, 0);
  const partes = [];
  const caixa = new THREE.BoxGeometry(0.42, 1.18, 0.3); caixa.translate(0, 3.34, 0); partes.push(caixa);
  const anteparo = new THREE.BoxGeometry(0.72, 1.46, 0.03); anteparo.translate(0, 3.34, -0.16); partes.push(anteparo);
  for (const y of LUZ_Y) { const pala = new THREE.BoxGeometry(0.32, 0.03, 0.2); pala.translate(0, y + 0.15, 0.25); partes.push(pala); }
  const gc = mergeGeometries(partes.map((g) => g.toNonIndexed ? g.toNonIndexed() : g));
  const gl = new THREE.CircleGeometry(0.125, 16); gl.translate(0, 0, 0.152);
  poste = new THREE.InstancedMesh(gp, new THREE.MeshStandardMaterial({ color: '#8d9297', roughness: 0.6, metalness: 0.4 }), MAX);
  corpo = new THREE.InstancedMesh(gc, new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.7 }), MAX);
  luzes = new THREE.InstancedMesh(gl, new THREE.MeshBasicMaterial({ toneMapped: false }), MAX * 3);
  for (const im of [poste, corpo, luzes]) { im.count = 0; im.frustumCulled = false; scene.add(im); }
  poste.castShadow = corpo.castShadow = true;
  for (let i = 0; i < MAX * 3; i++) luzes.setColorAt(i, APAGADA[i % 3]);
}

// a cada meio segundo escolhe as cabeças mais perto; a cada quadro acende as luzes certas
export function atualizar(dt, px, pz) {
  if (!poste) return;
  if ((tempoLod -= dt) <= 0) {
    tempoLod = 0.5;
    const perto = [];
    for (const h of cabecas) { const d = Math.abs(h.x - px) + Math.abs(h.z - pz); if (d < 170) perto.push([d, h]); }
    perto.sort((a, b) => a[0] - b[0]); ativas = perto.slice(0, MAX).map((p) => p[1]);
    ativas.forEach((h, i) => {
      _q.setFromAxisAngle(_y, h.ang); _m.compose(_v.set(h.x, h.y, h.z), _q, _e); poste.setMatrixAt(i, _m); corpo.setMatrixAt(i, _m);
      for (let k = 0; k < 3; k++) { _m.compose(_v.set(h.x, h.y, h.z), _q, _e); _m.multiply(new THREE.Matrix4().makeTranslation(0, LUZ_Y[k], 0)); luzes.setMatrixAt(i * 3 + k, _m); }
    });
    poste.count = corpo.count = ativas.length; luzes.count = ativas.length * 3;
    poste.instanceMatrix.needsUpdate = corpo.instanceMatrix.needsUpdate = luzes.instanceMatrix.needsUpdate = true;
  }
  const t = relogio();
  ativas.forEach((h, i) => { const f = fase(h.c, h.vert, t), acesa = f === 2 ? 2 : f === 1 ? 1 : 0; for (let k = 0; k < 3; k++) luzes.setColorAt(i * 3 + k, k === acesa ? ACESA[k] : APAGADA[k]); });
  if (luzes.instanceColor) luzes.instanceColor.needsUpdate = true;
}

// quem está em (x, z) indo para ang (frente = sin, cos) precisa parar antes do próximo cruzamento?
// (vermelho; amarelo só se ainda dá para parar). dist: até onde olha à frente da faixa de retenção
export function sinalAFrente(x, z, ang, dist = 12) {
  if (!cruz.length) return false;
  const fx = Math.sin(ang), fz = Math.cos(ang), vert = Math.abs(fz) >= Math.abs(fx);
  if (Math.max(Math.abs(fx), Math.abs(fz)) < 0.9) return false;   // fazendo curva: segue
  const sg = Math.sign(vert ? fz : fx), mapa = vert ? colunas : linhas, pos = vert ? x : z;
  let lista = null;
  for (let d = -6; d <= 6 && !lista; d++) lista = mapa.get(Math.round(pos) + d) || null;
  if (!lista) return false;
  let alvo = null, dl = Infinity;
  for (const c of lista) { const ad = ((vert ? c.z - z : c.x - x) * sg) - (RW / 2 + 1.2); if (ad >= -0.5 && ad < dl) { dl = ad; alvo = c; } }
  if (!alvo || dl > dist) return false;
  const f = fase(alvo, vert, relogio());
  return f === 0 || (f === 1 && dl > 3);
}
