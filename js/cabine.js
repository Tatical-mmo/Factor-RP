// Cabine do motorista feita por código para os veículos cujo modelo é oco por dentro (o popular, o Clássico V8 e os
// caminhões usam o interior do próprio modelo). Devolve só uma lista de peças (sem three.js) para o main.js montar
// e para a prévia: coordenadas a partir do olho do motorista (x direita, y cima, z para trás; a frente é -z).
//   caixa: { t: 'caixa', s: [w, h, d], p: [x, y, z], r: [rx, ry, rz], c, o }
//   anel:  { t: 'anel', R, e, p, r, c, o }          (volante, aro dos mostradores)
//   cil:   { t: 'cil', rt, rb, h, p, r, c, o }      (miolo do volante, coluna, mostradores, alavanca)
// o: ordem de desenho (20 longe → 24 perto). Peças com "volante: true" ficam num grupo no centro do volante,
// inclinado (volante.incl), e giram com a direção.
export function pecasCabine(nome, caixaModelo, olho, T) {
  const b = caixaModelo, o = olho, P = [];
  const onibus = nome.startsWith('onibus'), carro = nome.startsWith('carro'), alto = nome === 'carro_suv' || nome === 'carro_presidencial';
  const grande = !carro, tipo = onibus ? 'onibus' : carro ? (alto ? 'alto' : 'carro') : 'caminhao';
  const cor = T.cor || '#8a8f96';
  const C = { forro: '#c7c2b6', painel: '#1e2124', painel2: '#2d3136', porta: '#3a3f45', borracha: '#111315', cromo: '#a3a9af',
    mostrador: '#0b0d0f', vidroEsp: '#6f8496', banco: '#2b2e33', tela: '#0b1d29', agulha: '#ff4b2b', branco: '#e6e6e6' };
  const caixa = (s, p, c, ord = 20, r = [0, 0, 0], extra = {}) => P.push({ t: 'caixa', s, p, r, c, o: ord, ...extra });
  const cil = (rt, rb, h, p, c, ord, r = [0, 0, 0], extra = {}) => P.push({ t: 'cil', rt, rb, h, p, r, c, o: ord, ...extra });
  const anel = (R, e, p, c, ord, r = [0, 0, 0], extra = {}) => P.push({ t: 'anel', R, e, p, r, c, o: ord, ...extra });

  // medidas do modelo (mesmas da moldura antiga)
  const cx = (b.min.x + b.max.x) / 2, meia = (b.max.x - b.min.x) * (onibus ? 0.48 : 0.43);
  const eL = Math.max(0.3, cx + meia - o.x), eR = Math.max(0.6, o.x - (cx - meia)), W = eL + eR, xc = (eR - eL) / 2;
  const dz = Math.max(0.35, T.capo[1] - o.z), dy = T.capo[0] - o.y;
  const teto = T.teto ?? (Math.min(b.max.y, o.y + (onibus ? 0.62 : grande ? 0.75 : alto ? 0.48 : 0.4)) - o.y - 0.04);
  const d = onibus ? 0.78 : grande ? 0.7 : 0.62;                                   // frente do painel
  const topo = Math.max(d * dy / dz + 0.008, -0.36) + (T.painel || 0);           // topo do painel na linha do capô (T.painel: ajuste por modelo)
  const zt = -dz * (T.zt ?? (onibus ? 0.97 : grande ? 0.86 : alto ? 0.55 : 0.45));           // topo do para-brisa
  const yw = topo + (onibus ? -0.12 : grande ? 0.02 : 0.03);                        // linha da janela lateral
  const zFr = Math.min(-dz * (onibus ? 0.98 : 0.9), -(d + 0.6)), zTr = onibus ? 1.6 : 0.95, Lp = zTr - zFr, zPm = (zFr + zTr) / 2;   // portas
  const piso = onibus ? -1.35 : grande ? -1.3 : -1.05;

  // ---- teto, colunas e portas (longe: desenhados primeiro)
  { const z0 = zt + 0.04, z1 = zTr + 0.3; caixa([W + 0.1, 0.04, z1 - z0], [xc, teto + 0.02, (z0 + z1) / 2], C.forro, 20); }   // forro do teto
  caixa([W + 0.1, onibus ? 0.12 : 0.07, 0.09], [xc, teto - 0.02, zt], cor, 20);                      // travessa do para-brisa
  if (onibus) {
    caixa([W * 0.8, 0.26, 0.12], [xc, teto - 0.15, zt + 0.1], C.painel, 21);                          // caixa do letreiro
    for (const [x, z] of [[eR * 0.45, 0.6], [eR * 0.85, 1.6]]) cil(0.02, 0.02, teto - piso, [x, (teto + piso) / 2, z], C.cromo, 22);   // balaústres
  }
  const lc = onibus ? 0.1 : grande ? 0.14 : 0.1;
  for (const [x0, x1] of [[-eL + 0.04, -eL + 0.09], [eR - 0.04, eR - 0.09]]) {                        // colunas do para-brisa
    const zb = -dz, yb = dy, comp = Math.hypot(zt - zb, teto - yb), inc = Math.atan2(zt - zb, teto - yb);
    caixa([lc, comp, 0.1], [(x0 + x1) / 2, (yb + teto) / 2, (zb + zt) / 2], cor, 20, [inc, 0, 0]);
  }
  for (const s of [-1, 1]) {
    const x = s < 0 ? -eL : eR;
    if (onibus && s > 0) {   // ônibus: à direita a porta de vidro (só os montantes) e o degrau
      for (const z of [-0.3, 0.9]) caixa([0.08, teto - piso, 0.1], [x, (teto + piso) / 2, z], C.cromo, 20);
      caixa([0.5, 0.08, 1.2], [x - 0.25, piso + 0.3, 0.3], C.painel2, 20);
      continue;
    }
    caixa([0.06, yw - piso, Lp], [x, (yw + piso) / 2, zPm], C.porta, 20);                             // painel da porta
    // soleira e borda do teto só entre a coluna do para-brisa e a traseira (não passam do vidro para cima do capô)
    { const z0 = -dz * 0.98, L = zTr - z0; caixa([0.11, 0.05, L], [x - s * 0.02, yw, (z0 + zTr) / 2], cor, 20); }   // soleira da janela
    { const z0 = zt, L = zTr - z0; caixa([0.1, 0.07, L], [x - s * 0.01, teto - 0.03, (z0 + zTr) / 2], cor, 20); }   // borda do teto
    if (!onibus) caixa([0.1, teto - yw, 0.14], [x, (yw + teto) / 2, zTr - 0.18], cor, 20);            // coluna do meio
    else for (const z of [0.15, 1.35]) caixa([0.09, teto - yw, 0.12], [x, (yw + teto) / 2, z], cor, 20);   // montantes das janelas
    caixa([0.08, 0.05, 0.45], [x - s * 0.07, yw - 0.3, 0.1], C.painel2, 21);                          // apoio de braço
    caixa([0.03, 0.04, 0.12], [x - s * 0.05, yw - 0.12, -0.2], C.cromo, 21);                           // maçaneta
    // retrovisor de fora, aparecendo pela janela
    const zr = zFr + (onibus ? 0.1 : 0.22), ra = onibus ? 0.55 : 0.2;
    caixa([ra, 0.03, 0.04], [x + s * ra / 2, onibus ? teto - 0.25 : yw + 0.05, zr], C.borracha, 19);
    const ex = x + s * (ra + (onibus ? 0.1 : 0.1)), ey = onibus ? teto - 0.55 : yw + 0.1;
    caixa(onibus ? [0.26, 0.5, 0.08] : [0.2, 0.13, 0.08], [ex, ey, zr], onibus ? C.borracha : cor, 19);
    caixa(onibus ? [0.21, 0.44, 0.01] : [0.16, 0.1, 0.01], [ex, ey, zr + 0.045], C.vidroEsp, 19);
  }

  // ---- painel
  { const hP = topo - piso; caixa([W, hP, 0.6], [xc, topo - hP / 2, -(d + 0.3)], C.painel, 21); }   // corpo do painel até o assoalho (tampa as rodas pela frente)
  caixa([W, 0.05, 0.66], [xc, topo, -(d + 0.3)], C.painel2, 21);                                     // tampo
  caixa([0.48, 0.11, 0.22], [0, topo + 0.045, -d + 0.02], C.painel, 22);                              // capuz dos mostradores
  for (const s of [-1, 1]) {                                                                         // velocímetro e conta-giros
    const p = [s * 0.1, topo - 0.075, -d + 0.005];
    cil(0.068, 0.068, 0.01, p, C.mostrador, 22, [Math.PI / 2, 0, 0]);
    anel(0.068, 0.008, [p[0], p[1], p[2] + 0.006], C.cromo, 23);
    caixa([0.007, 0.05, 0.004], [p[0] + 0.012, p[1] + 0.012, p[2] + 0.01], C.agulha, 23, [0, 0, -0.5 - s * 0.3]);
    for (let k = 0; k < 5; k++) { const a = -2.2 + k * 1.1; caixa([0.004, 0.012, 0.004], [p[0] + Math.sin(a) * 0.052, p[1] + Math.cos(a) * 0.052, p[2] + 0.008], C.branco, 23, [0, 0, -a]); }
  }
  const xm = Math.min(onibus ? 0.7 : 0.45, eR * 0.45);                                               // meio do painel
  for (const dx of [-0.075, 0.075]) caixa([0.11, 0.05, 0.02], [xm + dx, topo - 0.08, -d + 0.005], C.painel2, 22);   // saídas de ar
  caixa([0.12, 0.05, 0.02], [-eL + 0.16, topo - 0.08, -d + 0.005], C.painel2, 22);
  caixa([0.12, 0.05, 0.02], [eR - 0.18, topo - 0.08, -d + 0.005], C.painel2, 22);
  caixa([0.24, 0.13, 0.02], [xm, topo - 0.21, -d + 0.005], C.tela, 22);                               // rádio / tela
  if (!onibus) {
    caixa([0.25, 0.42, 0.62], [xm, topo - 0.55, -d + 0.28], C.painel, 22);                           // console entre os bancos
    cil(0.012, 0.012, 0.16, [xm, topo - 0.28, -d + 0.42], C.cromo, 23);                              // câmbio
    cil(0.03, 0.03, 0.04, [xm, topo - 0.19, -d + 0.42], C.borracha, 23);
  } else {
    caixa([0.24, 0.32, 0.24], [xm, piso + 0.5, -0.35], C.painel, 22);                               // validador / caixa
    caixa([0.55, 0.85, 0.08], [eR * 0.55, piso + 0.45, 0.85], C.cromo, 22);                          // catraca
    caixa([0.6, 0.5, 0.45], [eR * 0.72, piso + 0.55, 1.3], C.painel2, 22);                           // mesa do cobrador
  }
  // retrovisor de dentro e quebra-sóis
  if (!onibus) { cil(0.008, 0.008, 0.08, [xc, teto - 0.05, zt + 0.07], C.borracha, 22); caixa([0.25, 0.07, 0.025], [xc, teto - 0.1, zt + 0.07], C.borracha, 22); caixa([0.21, 0.05, 0.005], [xc, teto - 0.1, zt + 0.085], C.vidroEsp, 22); }
  for (const x of onibus ? [-0.05, eR * 0.6] : [-0.02, Math.min(eR * 0.75, 0.75)]) caixa([onibus ? 0.7 : 0.48, 0.02, 0.22], [x, teto - 0.04, zt + 0.15], C.forro, 21, [0.12, 0, 0]);
  // banco do passageiro (aparece quando olha para a direita)
  if (!onibus) {
    const xp = Math.min(eR - 0.32, grande ? 0.9 : 0.72);
    caixa([0.5, 0.66, 0.13], [xp, -0.27, 0.28], C.banco, 22, [-0.12, 0, 0]);
    caixa([0.27, 0.18, 0.11], [xp, 0.16, 0.33], C.banco, 22, [-0.12, 0, 0]);
    caixa([0.5, 0.13, 0.5], [xp, -0.64, 0], C.banco, 22);
  }
  caixa([W, 0.03, 2.2], [xc, piso, 0], C.borracha, 20);                                              // assoalho

  // ---- volante na frente do motorista (gira com a direção)
  const rv = onibus ? 0.26 : grande ? 0.23 : 0.19, inclV = onibus ? -0.9 : grande ? -0.6 : -0.45;
  const yv = onibus ? -0.4 : grande ? -0.36 : Math.max(topo - 0.02, -0.4) - rv * 0.55, zv = onibus ? -0.56 : grande ? -0.52 : -0.5;   // nos grandes o volante sobe para aparecer
  const V = { volante: true };   // peças do volante: coordenadas no plano do volante (o grupo fica no centro, inclinado)
  anel(rv, rv * 0.13, [0, 0, 0], C.borracha, 24, [0, 0, 0], V);
  cil(rv * 0.3, rv * 0.3, 0.05, [0, 0, 0], C.painel2, 24, [Math.PI / 2, 0, 0], V);                 // miolo
  for (const a of [0, Math.PI, -Math.PI / 2]) {                                                     // raios (3 h, 9 h e 6 h)
    const ll = rv * 0.7, m = rv * 0.3 + ll / 2;
    caixa([ll, rv * 0.12, 0.025], [Math.cos(a) * m, Math.sin(a) * m, 0], C.borracha, 24, [0, 0, a], V);
  }
  cil(0.035, 0.045, 0.32, [0, yv - 0.06, zv - 0.18], C.painel2, 21, [inclV + Math.PI / 2, 0, 0]);   // coluna
  return { pecas: P, volante: { centro: [0, yv, zv], incl: inclV } };
}
