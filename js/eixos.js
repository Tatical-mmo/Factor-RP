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
// ladeira: o veículo acompanha o chão (sobe de nariz, desce de nariz e tomba de lado na encosta).
// A altura é a média do chão debaixo dos dois eixos. Em chão plano não muda nada.
export function inclinar(o, alturaChao, larg = 1.0) {
  if (!o || !alturaChao) return;
  const { zf, zr } = eixosDe(o), a = o.rotation.y, sa = Math.sin(a), ca = Math.cos(a), x = o.position.x, z = o.position.z;
  const hf = alturaChao(x + sa * zf, z + ca * zf), hr = alturaChao(x + sa * zr, z + ca * zr);
  const hd = alturaChao(x + ca * larg, z - sa * larg), he = alturaChao(x - ca * larg, z + sa * larg);
  const lim = 0.5, wb = (zf - zr) || 2.6;
  o.rotation.order = 'YXZ';
  o.rotation.x = Math.max(-lim, Math.min(lim, -Math.atan2(hf - hr, wb)));
  o.rotation.z = Math.max(-lim, Math.min(lim, Math.atan2(hd - he, larg * 2)));
  o.position.y = (hf + hr) / 2;
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
