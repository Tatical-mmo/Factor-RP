// Curvas de verdade: o eixo da frente vai pela rua e o de trás vem puxado por ele (como um reboque),
// e o veículo aponta sempre do eixo de trás para o da frente. Na curva a traseira "fecha" para dentro
// devagar, em vez de girar tudo de uma vez quando o veículo entra na rua nova.
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
  for (const [o, e] of estado) if (e.vis) { o.position.x = e.lx; o.position.z = e.lz; o.rotation.y = e.la; e.vis = false; }
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
    // nunca fica atravessado demais em relação à rua (manobra brusca, ré): no máximo 50°
    let ang = Math.atan2(dx, dz), dif = Math.atan2(Math.sin(ang - la), Math.cos(ang - la));
    if (Math.abs(dif) > 0.87) { ang = la + Math.sign(dif) * 0.87; dx = Math.sin(ang); dz = Math.cos(ang); }
    else { dx /= d; dz /= d; }
    e.rx = fx - dx * wb; e.rz = fz - dz * wb; e.fx = fx; e.fz = fz;
    const x = fx - dx * zf, z = fz - dz * zf;
    o.position.x = x; o.position.z = z; o.rotation.y = ang;
    if (alturaChao) o.position.y = alturaChao(x, z);
    e.vis = true;
  }
}
