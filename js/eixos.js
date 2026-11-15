// Curvas de verdade: o veículo segue por onde a frente passou, sempre alinhado com a faixa, e vira aos poucos
// em vez de girar tudo de uma vez quando entra na rua nova.
//
// Só muda o desenho: a lógica (horário, quem está na frente, colisão) continua usando a posição de sempre.
// restaurar() no começo do quadro devolve a posição lógica; aplicar() no fim (antes de desenhar) põe a visual.
import { eixosDe } from './civico.js';

const estado = new Map();   // objeto -> { tr (rastro da frente), lx, lz, la, vis, guia, marcado }

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
// Motorista profissional: o MEIO do veículo vai pela faixa e ele fica alinhado com ela (tangente). Assim a traseira
// não "fecha" para dentro da curva (era o que subia a roda de trás na calçada); quem abre um pouco é o veículo
// inteiro, para o lado de fora (o meio do cruzamento). Para isso guarda o rastro por onde o eixo da frente passou.
function noRastro(tr, fx, fz, dist) {
  let x = fx, z = fz, falta = dist;
  for (let i = tr.length - 1; i >= 0; i--) {
    const p = tr[i], dx = p[0] - x, dz = p[1] - z, d = Math.hypot(dx, dz);
    if (d >= falta && d > 1e-6) return [x + dx / d * falta, z + dz / d * falta];
    falta -= d; x = p[0]; z = p[1];
  }
  // rastro curto: continua reto pelo último trecho
  const a = tr.length > 1 ? tr[1] : [fx, fz], b = tr[0], dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1;
  return [x + dx / d * falta, z + dz / d * falta];
}
export function aplicar(alturaChao) {
  for (const [o, e] of estado) {
    if (!e.marcado || !o.visible) { estado.delete(o); continue; }
    e.marcado = false;
    const { zf, zr } = eixosDe(o), wb = Math.max(1, zf - zr);
    const lx = o.position.x, lz = o.position.z, la = o.rotation.y, sa = Math.sin(la), ca = Math.cos(la);
    e.lx = lx; e.lz = lz; e.la = la;
    const fx = e.guia ? e.guia.x : lx + sa * zf, fz = e.guia ? e.guia.z : lz + ca * zf;
    let tr = e.tr; const ult = tr && tr[tr.length - 1];
    // apareceu agora, pulou de lugar ou deu ré: começa alinhado
    if (!ult || Math.hypot(fx - ult[0], fz - ult[1]) > 8 || (fx - ult[0]) * sa + (fz - ult[1]) * ca < -0.05) {
      const L = wb + zf + 6; tr = e.tr = [[fx - sa * L, fz - ca * L], [fx - sa * 0.01, fz - ca * 0.01]];
    } else if (Math.hypot(fx - ult[0], fz - ult[1]) > 0.35) {
      tr.push([fx, fz]);
      let tot = 0; for (let i = tr.length - 1; i > 0; i--) { tot += Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]); if (tot > wb + zf + 6) { tr.splice(0, i - 1); break; } }
    }
    const c = noRastro(tr, fx, fz, zf), a = noRastro(tr, fx, fz, Math.max(0, zf - 1.3)), b = noRastro(tr, fx, fz, zf + 1.3);
    let ang = Math.atan2(a[0] - b[0], a[1] - b[1]);
    // nunca fica atravessado demais em relação à rua (manobra brusca): no máximo 50°
    const dif = Math.atan2(Math.sin(ang - la), Math.cos(ang - la));
    if (Math.abs(dif) > 0.87) ang = la + Math.sign(dif) * 0.87;
    o.position.x = c[0]; o.position.z = c[1]; o.rotation.y = ang;
    if (alturaChao) inclinar(o, alturaChao);
    e.vis = true;
  }
}
