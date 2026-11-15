// Curvas de verdade: o eixo da frente (o que vira) vai pela rua e o de trás vem arrastado por ele, como na vida
// real: na curva a traseira "fecha" para dentro. Com dois eixos atrás o arrasto é mais difícil (o eixo de trás
// "efetivo" fica mais para trás, ver eixosDe) e a traseira fecha mais. Os caminhos já abrem a curva para isso.
//
// Só muda o desenho: a lógica (horário, quem está na frente, colisão) continua usando a posição de sempre.
// restaurar() no começo do quadro devolve a posição lógica; aplicar() no fim (antes de desenhar) põe a visual.
import { eixosDe } from './civico.js';

const estado = new Map();   // objeto -> { rx, rz, fx, fz, lx, lz, la, vis, guia, marcado }

export function marcar(o, guia = null) {
  if (!o) return;
  let e = estado.get(o); if (!e) { e = {}; estado.set(o, e); }
  e.marcado = true; e.guia = guia;
}
export function restaurar() {
  for (const [o, e] of estado) if (e.vis) { o.position.x = e.lx; o.position.z = e.lz; o.rotation.y = e.la; o.rotation.x = 0; o.rotation.z = 0; e.vis = false; }
}
// ---------------------------------------------------------------- amortecedor
// A carroceria é uma massa numa mola com amortecedor: segue o chão (ladeira, meio-fio, rampa) com atraso, balança
// e assenta. Freando ela mergulha o nariz, acelerando agacha a traseira e na curva tomba para fora. Se o chão
// sobe rápido (meio-fio, lombada, rampa) e o veículo vem rápido, ela é lançada para cima: sem chão embaixo só a
// gravidade age, e na volta comprime e quica. As rodas ficam no chão (a mola é entre elas e a carroceria).
// Cada tipo tem a sua: f = frequência (Hz, mais baixa = mais macia), z = amortecimento (1 = sem balanço),
// mg/mr = quanto mergulha/tomba por m/s² de aceleração, curso = quanto a mola comprime/estica.
const MOLAS = {
  onibus: { f: 1.05, z: 0.42, mg: 0.006, mr: 0.012, curso: 0.16, ang: 0.85 },   // macia e caprichada: balança devagar e assenta
  caminhao: { f: 1.45, z: 0.38, mg: 0.006, mr: 0.010, curso: 0.13, ang: 1.1 },
  pesado: { f: 2.3, z: 0.55, mg: 0.003, mr: 0.004, curso: 0.08, ang: 1.6 },     // blindado, tanque, jipe militar
  carro: { f: 1.75, z: 0.36, mg: 0.008, mr: 0.008, curso: 0.11, ang: 1.25 },
  esporte: { f: 2.3, z: 0.5, mg: 0.005, mr: 0.004, curso: 0.07, ang: 1.6 },
};
function tipoMola(o) {
  let n = ''; o.traverse((k) => { n ||= k.userData?.glb || ''; }); n = n || o.userData?.modelo || '';
  if (/onibus/.test(n)) return MOLAS.onibus;
  if (/caminhao|bombeiros|lixo/.test(n)) return MOLAS.caminhao;
  if (/tanque|caveirao|jipe|militar/.test(n)) return MOLAS.pesado;
  if (/esport|classico/.test(n)) return MOLAS.esporte;
  return MOLAS.carro;
}
const molas = new WeakMap();
const G = 9.8;
function amortecer(o, yAlvo, pAlvo, rAlvo) {
  const agora = performance.now() / 1000;
  let m = molas.get(o);
  const x = o.position.x, z = o.position.z;
  if (!m || agora - m.t > 0.5 || Math.abs(yAlvo - m.y) > 1.5 || Math.hypot(x - m.x, z - m.z) > 8) {   // novo, sumiu um tempo ou pulou de lugar
    m = { t: agora, y: yAlvo, vy: 0, p: pAlvo, vp: 0, r: rAlvo, vr: 0, x, z, vx: 0, vz: 0, ax: 0, az: 0, ya: yAlvo, k: m?.k || tipoMola(o) };
    molas.set(o, m);
  }
  const dt = Math.min(0.05, agora - m.t); m.t = agora;
  if (dt <= 0) return;
  const K = m.k, w = 2 * Math.PI * K.f, kk = w * w, c = 2 * K.z * w;
  // velocidade e aceleração do veículo (suavizadas), para o mergulho, o agachar e o tombar
  const vx = (x - m.x) / dt, vz = (z - m.z) / dt; m.x = x; m.z = z;
  const sv = Math.min(1, dt / 0.12), ax = (vx - m.vx) / dt, az = (vz - m.vz) / dt;
  m.vx += (vx - m.vx) * sv; m.vz += (vz - m.vz) * sv;
  m.ax += (THREE_clamp(ax, -25, 25) - m.ax) * Math.min(1, dt / 0.18); m.az += (THREE_clamp(az, -25, 25) - m.az) * Math.min(1, dt / 0.18);
  const a = o.rotation.y, fx = Math.sin(a), fz = Math.cos(a);
  const aLong = m.ax * fx + m.az * fz, aLat = m.ax * fz - m.az * fx;   // frente / lado esquerdo (+x do veículo)
  const vh = Math.hypot(m.vx, m.vz);
  // altura: chão subindo de repente lança a carroceria (mais rápido = mais alto)
  const vChao = (yAlvo - m.ya) / dt; m.ya = yAlvo;
  if (vChao > 0.8 && m.y <= yAlvo + 0.03) m.vy = Math.max(m.vy, Math.min(vChao, 0.12 * vh, 2.4));   // o chão empurra (degrau: um tranco)
  if (m.y > yAlvo + 0.03) m.vy -= G * dt;                                   // no ar: só a gravidade
  else m.vy += (kk * (yAlvo - m.y) - c * m.vy) * dt;                           // apoiada: mola + amortecedor
  m.y += m.vy * dt;
  if (m.y < yAlvo - K.curso) { m.y = yAlvo - K.curso; if (m.vy < 0) m.vy *= -0.25; }   // fim de curso: bate e volta um pouco
  // ângulos: seguem o chão com a mesma mola (um pouco mais firme) e somam o mergulho/tombo da aceleração
  const wa = w * K.ang, ka = wa * wa, ca = 2 * K.z * wa;
  const pA = pAlvo - THREE_clamp(aLong * K.mg, -0.06, 0.06), rA = rAlvo + THREE_clamp(aLat * K.mr, -0.07, 0.07);
  m.vp += (ka * (pA - m.p) - ca * m.vp) * dt; m.p += m.vp * dt;
  m.vr += (ka * (rA - m.r) - ca * m.vr) * dt; m.r += m.vr * dt;
  o.position.y = m.y; o.rotation.x = THREE_clamp(m.p, -0.55, 0.55); o.rotation.z = THREE_clamp(m.r, -0.55, 0.55);
  // rodas no chão: a mola estica (no ar) ou comprime até o curso
  const gr = o.userData.grupoRodas || o.getObjectByName?.('rodas');
  if (gr) gr.position.y = THREE_clamp(yAlvo - m.y, -K.curso * 1.4, K.curso);
}
const THREE_clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ladeira: o veículo acompanha o chão (sobe de nariz, desce de nariz e tomba de lado na encosta).
// A altura é a média do chão debaixo dos dois eixos. Em chão plano não muda nada. Depois passa pelo amortecedor.
export function inclinar(o, alturaChao, larg = 1.0) {
  if (!o || !alturaChao) return;
  const { zf, zr } = eixosDe(o), a = o.rotation.y, sa = Math.sin(a), ca = Math.cos(a), x = o.position.x, z = o.position.z;
  const hf = alturaChao(x + sa * zf, z + ca * zf), hr = alturaChao(x + sa * zr, z + ca * zr);
  const hd = alturaChao(x + ca * larg, z - sa * larg), he = alturaChao(x - ca * larg, z + sa * larg);
  const lim = 0.5, wb = (zf - zr) || 2.6;
  o.rotation.order = 'YXZ';
  const p = Math.max(-lim, Math.min(lim, -Math.atan2(hf - hr, wb)));
  const r = Math.max(-lim, Math.min(lim, Math.atan2(hd - he, larg * 2)));
  amortecer(o, (hf + hr) / 2, p, r);
}
export function aplicar(alturaChao) {
  for (const [o, e] of estado) {
    if (!e.marcado || !o.visible) { estado.delete(o); continue; }
    e.marcado = false;
    const { zf, zr } = eixosDe(o), wb = zf - zr;
    const lx = o.position.x, lz = o.position.z, la = o.rotation.y;
    e.lx = lx; e.lz = lz; e.la = la;
    const fx = e.guia ? e.guia.x : lx + Math.sin(la) * zf, fz = e.guia ? e.guia.z : lz + Math.cos(la) * zf;
    // apareceu agora ou pulou de lugar: começa alinhado
    if (e.rx === undefined || Math.hypot(fx - e.fx, fz - e.fz) > 8) { e.rx = fx - Math.sin(la) * wb; e.rz = fz - Math.cos(la) * wb; }
    let dx = fx - e.rx, dz = fz - e.rz; const d = Math.hypot(dx, dz) || 1;
    // nunca fica atravessado demais em relação à rua (manobra brusca, ré): no máximo 75° (o ônibus de viagem chega a ~63° na esquina)
    let ang = Math.atan2(dx, dz), dif = Math.atan2(Math.sin(ang - la), Math.cos(ang - la));
    if (Math.abs(dif) > 1.3) { ang = la + Math.sign(dif) * 1.3; dx = Math.sin(ang); dz = Math.cos(ang); }
    else { dx /= d; dz /= d; }
    e.rx = fx - dx * wb; e.rz = fz - dz * wb; e.fx = fx; e.fz = fz;
    const x = fx - dx * zf, z = fz - dz * zf;
    o.position.x = x; o.position.z = z; o.rotation.y = ang;
    if (alturaChao) inclinar(o, alturaChao);
    e.vis = true;
  }
}
