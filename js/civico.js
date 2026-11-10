// Prefeitura, concessionária, outdoors e modelos de carro (tudo feito por código).
import * as THREE from 'three';

let ctx = null;
export const PREFEITURA = { x: -135, z: -135, porta: { x: -135, z: -120.5 }, prf: { x: -146, z: -115 }, jornal: { x: -124, z: -115 } };
export const CONCESSIONARIA = { x: 135, z: -135, balcao: { x: 135, z: -127.5 } };
export const BANCO = { x: 81, z: -135, balcao: { x: 75, z: -124 }, empregos: { x: 88, z: -124 } };
export const HOSPITAL = { x: -135, z: 135, balcao: { x: -131, z: 125 }, saida: { x: -139, z: 124 }, vaga: { x: -145, z: 126, ang: -Math.PI / 2 }, veiculo: null };
export const CEMITERIO = { x: 135, z: 135 };
// Quartel do Exército (Porto Sul). Os veículos ficam expostos na garagem aberta e no heliponto; são ilimitados:
// cada militar que pega um leva uma cópia, e o da exposição continua lá. O prédio do Comando tem interior.
export const EXERCITO = {
  vagas: [
    { modelo: 'militar', x: 159, z: 1074, ang: Math.PI },
    { modelo: 'militar', x: 165, z: 1074, ang: Math.PI },
    { modelo: 'exercito_caminhao', x: 173, z: 1072.5, ang: Math.PI },
    { modelo: 'exercito_caminhao', x: 181, z: 1072.5, ang: Math.PI },
    { modelo: 'helicoptero_exercito', x: 232, z: 1027, ang: -Math.PI / 2 },
  ],
  veiculos: [],
  comando: { x0: 210, x1: 242, z0: 974, z1: 990, porta: { x: 226, z: 991.5 } },
  balcao: { x: 226, z: 979.5 },
  teto: null,
};
export function montarQuartelExercito() {
  const C = EXERCITO.comando, g = new THREE.Group(); ctx.scene.add(g);
  const oliva = mat('#6b7448'), areia = mat('#cfc39a', { roughness: 0.8 }), escuro = mat('#3a3f2c'), concreto = mat('#a9a69a', { roughness: 0.9 });
  const metal = mat('#5d6266', { metalness: 0.5, roughness: 0.5 }), madeira = mat('#7a5a38'), branco = mat('#efeee6');
  const col = (x0, x1, z0, z1) => ctx.colisores.push({ tipo: 'caixa', x0, x1, z0, z1 });
  const b = (m, w, h, d, x, y, z, pai = g) => bloco(pai, m, w, h, d, x, y, z);
  // ---- Comando: paredes com porta, interior com balcão, mesa de mapas, armários, bandeiras; o teto some quando você entra
  const H = 6, e = 0.4, cx = (C.x0 + C.x1) / 2, cz = (C.z0 + C.z1) / 2, W = C.x1 - C.x0, D = C.z1 - C.z0;
  b(areia, W, H, e, cx, H / 2, C.z0 + e / 2); col(C.x0, C.x1, C.z0, C.z0 + e);                                   // fundo
  b(areia, e, H, D, C.x0 + e / 2, H / 2, cz); col(C.x0, C.x0 + e, C.z0, C.z1);                                   // lados
  b(areia, e, H, D, C.x1 - e / 2, H / 2, cz); col(C.x1 - e, C.x1, C.z0, C.z1);
  const pl = C.porta.x - 1.8, pr = C.porta.x + 1.8;                                                              // frente com porta
  b(areia, pl - C.x0, H, e, (C.x0 + pl) / 2, H / 2, C.z1 - e / 2); col(C.x0, pl, C.z1 - e, C.z1);
  b(areia, C.x1 - pr, H, e, (pr + C.x1) / 2, H / 2, C.z1 - e / 2); col(pr, C.x1, C.z1 - e, C.z1);
  b(areia, pr - pl, H - 3.4, e, C.porta.x, 3.4 + (H - 3.4) / 2, C.z1 - e / 2);
  b(oliva, W + 0.2, 0.6, e + 0.1, cx, 0.3, C.z1 - e / 2);                                                       // rodapé
  for (let k = 0; k < 6; k++) if (Math.abs(C.x0 + 3 + k * 5.3 - C.porta.x) > 3) b(mat('#28455c', { metalness: 0.5, roughness: 0.15 }), 2.2, 1.6, 0.08, C.x0 + 3 + k * 5.3, 3.3, C.z1 + 0.02);
  // marquise e colunas na entrada, escada
  b(oliva, 9, 0.35, 3.4, C.porta.x, 4.2, C.z1 + 1.7);
  for (const sx of [-4, 4]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4.1, 12), branco); c.position.set(C.porta.x + sx, 2.05, C.z1 + 3.1); c.castShadow = true; g.add(c); col(C.porta.x + sx - 0.3, C.porta.x + sx + 0.3, C.z1 + 2.8, C.z1 + 3.4); }
  b(concreto, 9, 0.18, 3.6, C.porta.x, 0.09, C.z1 + 1.8);
  // teto (escondido quando o jogador está dentro)
  const teto = new THREE.Group(); g.add(teto);
  b(escuro, W + 0.6, 0.5, D + 0.6, cx, H + 0.25, cz, teto); b(oliva, W - 6, 1.2, D - 5, cx, H + 1.1, cz, teto);
  EXERCITO.teto = teto;
  // interior
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * e, D - 2 * e).rotateX(-Math.PI / 2), mat('#8d8a7a', { roughness: 0.7 })); piso.position.set(cx, 0.14, cz); piso.receiveShadow = true; g.add(piso);
  const tapete = new THREE.Mesh(new THREE.PlaneGeometry(3, 10).rotateX(-Math.PI / 2), mat('#7a1f22', { roughness: 1 })); tapete.position.set(C.porta.x, 0.15, C.z1 - 6); g.add(tapete);
  ctx.balcao(EXERCITO.balcao.x, EXERCITO.balcao.z, '#4b5a2e', 'Comando do Exército', 'Ordens, caçadas e carreira');
  // bandeiras atrás do balcão
  for (const [x, cor] of [[221, '#2f7d3a'], [231, '#2f7d3a']]) {
    b(metal, 0.08, 3.6, 0.08, x, 1.95, C.z0 + 1.2); b(mat(cor), 1.4, 1, 0.04, x + 0.75, 3.2, C.z0 + 1.2); b(mat('#e2c234'), 0.7, 0.5, 0.05, x + 0.75, 3.2, C.z0 + 1.2);
  }
  b(mat('#2d3324'), 6, 2.4, 0.1, cx, 3.3, C.z0 + e + 0.06);                                                      // painel com o brasão
  b(mat('#e2c234', { emissive: '#7a5d10', emissiveIntensity: 0.4 }), 1.6, 1.6, 0.05, cx, 3.3, C.z0 + e + 0.12);
  // mesa de mapas (lado esquerdo) e escrivaninhas (lado direito)
  b(madeira, 5, 0.9, 2.6, 215.5, 0.6, 982); b(mat('#c8b98a'), 4.6, 0.04, 2.2, 215.5, 1.07, 982); col(213, 218, 980.7, 983.3);
  for (const [x, z] of [[236, 978], [236, 984]]) { b(madeira, 2.4, 0.8, 1.2, x, 0.55, z); b(metal, 0.5, 0.35, 0.05, x, 1.15, z - 0.2); col(x - 1.2, x + 1.2, z - 0.6, z + 0.6); }
  // armários e cabideiro de armas no fundo
  for (let k = 0; k < 6; k++) b(metal, 0.9, 2.1, 0.6, 212 + k * 1, 1.2, C.z0 + 0.8);
  col(211.5, 218, C.z0, C.z0 + 1.2);
  for (let k = 0; k < 5; k++) b(escuro, 0.12, 1.3, 0.12, 236 + k * 0.6, 1.1, C.z0 + 0.7);
  b(madeira, 3.4, 0.12, 0.4, 237.2, 0.5, C.z0 + 0.7); col(235.5, 239.5, C.z0, C.z0 + 1.1);
  const luz = new THREE.PointLight('#fff1d6', 5, 22, 1.6); luz.position.set(cx, 5.2, cz); g.add(luz);
  const placa = ctx.textoSprite('🎖️ QUARTEL DO EXÉRCITO', { escala: 1.1, fundo: 'rgba(52,62,34,.94)', cor: '#ffe9a8' }); placa.position.set(C.porta.x, 8.6, C.z1 + 1); ctx.scene.add(placa);
  // ---- garagem aberta (pilares, telhado e parede do fundo) com os veículos à mostra
  const G = { x0: 154, x1: 186, z0: 1066, z1: 1082 };
  b(oliva, G.x1 - G.x0, 5.2, 0.4, (G.x0 + G.x1) / 2, 2.6, G.z1 - 0.2); col(G.x0, G.x1, G.z1 - 0.4, G.z1);
  b(oliva, 0.4, 5.2, G.z1 - G.z0, G.x0 + 0.2, 2.6, (G.z0 + G.z1) / 2); col(G.x0, G.x0 + 0.4, G.z0, G.z1);
  b(escuro, G.x1 - G.x0 + 1, 0.35, G.z1 - G.z0 + 1.5, (G.x0 + G.x1) / 2, 5.4, (G.z0 + G.z1) / 2 - 0.4);
  for (const x of [G.x0 + 8, G.x0 + 16, G.x0 + 24, G.x1 - 0.3]) { b(metal, 0.35, 5.2, 0.35, x, 2.6, G.z0 + 0.2); col(x - 0.2, x + 0.2, G.z0, G.z0 + 0.4); }
  const pg = new THREE.Mesh(new THREE.PlaneGeometry(G.x1 - G.x0, G.z1 - G.z0).rotateX(-Math.PI / 2), mat('#5f5f58', { roughness: 0.95 })); pg.position.set((G.x0 + G.x1) / 2, 0.15, (G.z0 + G.z1) / 2); g.add(pg);
  const pgp = ctx.textoSprite('🚙 Viaturas do Exército · militares pegam à vontade', { escala: 0.55, fundo: 'rgba(52,62,34,.92)' }); pgp.position.set(170, 6.6, G.z0); ctx.scene.add(pgp);
  // ---- heliponto
  const h = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.08, 32), mat('#4d5346', { roughness: 0.9 })); h.position.set(232, 0.16, 1027); h.receiveShadow = true; g.add(h);
  const anel = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.18, 6, 48).rotateX(Math.PI / 2), mat('#e2c234')); anel.position.set(232, 0.22, 1027); g.add(anel);
  for (const [w, d, x] of [[0.9, 6, -1.6], [0.9, 6, 1.6], [3.2, 0.9, 0]]) b(branco, w, 0.02, d, 232 + x, 0.22, 1027);
  // ---- pátio: sacos de areia no portão, tanque de exposição, pista de obstáculos, caixotes e tambores
  const saco = mat('#b7a77a', { roughness: 1 });
  for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) { b(saco, 4, 0.5, 1, 156, 0.4 + k * 0.5, 1053 + sz * 8); }
  col(154, 158, 1044.5, 1045.5); col(154, 158, 1060.5, 1061.5);
  const tanque = new THREE.Group(); tanque.position.set(200, 0.14, 1060); tanque.rotation.y = -0.5; g.add(tanque);
  b(oliva, 3.6, 1.1, 7, 0, 0.9, 0, tanque); b(escuro, 4, 0.9, 7.4, 0, 0.45, 0, tanque); b(oliva, 2.6, 0.9, 3, 0, 1.9, -0.3, tanque);
  const canhao = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5, 10).rotateX(Math.PI / 2), escuro); canhao.position.set(0, 2, 3.4); tanque.add(canhao);
  col(197, 203, 1056, 1064);
  for (let k = 0; k < 4; k++) { b(madeira, 3, 1.2, 0.3, 160 + k * 6, 0.74, 1000); col(158.5 + k * 6, 161.5 + k * 6, 999.8, 1000.2); }   // pista de obstáculos
  for (const x of [166, 172]) { b(metal, 0.12, 2.4, 0.12, x - 1, 1.3, 1006); b(metal, 0.12, 2.4, 0.12, x + 1, 1.3, 1006); b(metal, 2.1, 0.1, 0.1, x, 2.4, 1006); }
  for (const [x, z] of [[190, 1078], [193, 1078], [191.5, 1080.5]]) { b(madeira, 2.2, 1.4, 2.2, x, 0.85, z); }
  col(188.8, 194.2, 1076.8, 1081.7);
  for (let k = 0; k < 6; k++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 14), mat(k % 2 ? '#3f5a2b' : '#4a4f3a')); t.position.set(244 + (k % 3) * 1.1, 0.8, 1060 + Math.floor(k / 3) * 1.1); t.castShadow = true; g.add(t); }
  col(243.4, 247, 1059.4, 1061.8);
  // ---- veículos expostos
  EXERCITO.veiculos = EXERCITO.vagas.map((v) => ({ ...v, mesh: veiculoDeServico(v.modelo, v) })).filter((v) => v.mesh);
}
// o teto do Comando some quando o jogador está dentro
export function atualizarQuartel(p) {
  const C = EXERCITO.comando; if (!EXERCITO.teto) return;
  EXERCITO.teto.visible = !(p.x > C.x0 && p.x < C.x1 && p.z > C.z0 && p.z < C.z1);
}
export const BOMBEIROS = { x: -81, z: 135, balcao: { x: -88, z: 125 }, vaga: { x: -77, z: 125.5, ang: Math.PI + 0.15 }, veiculo: null };
export const CARROS = {
  popular: { nome: 'Popular', preco: 40000, vel: 10 },
  suv: { nome: 'SUV', preco: 95000, vel: 11 },
  esportivo: { nome: 'Esportivo', preco: 180000, vel: 14 },
  ambulancia: { nome: 'Ambulância', preco: 0, vel: 12 },
  viatura: { nome: 'Viatura', preco: 0, vel: 12 },
  bombeiros: { nome: 'Caminhão dos bombeiros', preco: 0, vel: 10 },
  presidencial: { nome: 'Presidencial', preco: 0, vel: 12 },
  militar: { nome: 'Jipe do Exército', preco: 0, vel: 14 },
  exercito_caminhao: { nome: 'Caminhão do Exército', preco: 0, vel: 11 },
  helicoptero_exercito: { nome: 'Helicóptero do Exército', preco: 0, vel: 26, voa: true },
  helicoptero: { nome: 'Helicóptero executivo', preco: 1500000, vel: 24, voa: true },
};
// quantos passageiros cada veículo leva (além do motorista); veículos do Exército só levam militares
export const LUGARES = { militar: 3, exercito_caminhao: 8, helicoptero_exercito: 6, helicoptero: 4, suv: 3, popular: 3, esportivo: 1, presidencial: 3 };
export const DO_EXERCITO = new Set(['militar', 'exercito_caminhao', 'helicoptero_exercito']);
export const CORES_CARRO = ['#c0392b', '#2c3e50', '#ecf0f1', '#f1c40f', '#2980b9', '#16a085', '#8e44ad', '#1f1f1f', '#d35400'];

const mat = (cor, ex = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.6, ...ex });
function bloco(g, m, w, h, d, x, y, z) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o;
}

export function iniciar(contexto) { ctx = contexto; }
const GLB_CARRO = { militar: 'exercito_jipe', exercito_caminhao: 'exercito_caminhao', helicoptero_exercito: 'helicoptero_exercito', helicoptero: 'helicoptero_executivo', viatura: 'carro_suv', popular: 'carro_popular', suv: 'carro_suv', esportivo: 'carro_esportivo', presidencial: 'carro_presidencial', ambulancia: 'ambulancia', bombeiros: 'caminhao_bombeiros' };
const SEM_TINTA = new Set(['presidencial', 'ambulancia', 'bombeiros', 'militar', 'exercito_caminhao', 'helicoptero_exercito', 'helicoptero']);

// prefeitura neoclássica: salão, colunas, frontão, cúpula e bandeiras
export function montarPrefeitura() {
  const g = new THREE.Group(); g.position.set(PREFEITURA.x, 0.18, PREFEITURA.z);
  const branco = mat('#f1ece0', { roughness: 0.5 }), creme = mat('#e3d6b8'), cupula = mat('#b9c7cf', { metalness: 0.4, roughness: 0.35 });
  const vidro = mat('#2b3d4f', { roughness: 0.1, metalness: 0.5, emissive: '#ffcf7a', emissiveIntensity: 0 });
  bloco(g, creme, 34, 11, 22, 0, 5.5, -4);
  bloco(g, branco, 35, 0.6, 23, 0, 11.3, -4);
  for (let k = 0; k < 8; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 9.5, 14), branco); c.position.set(-12.6 + k * 3.6, 5.2, 9.3); c.castShadow = true; g.add(c); }
  bloco(g, branco, 30, 1.0, 5, 0, 10.4, 9.3);
  const fr = new THREE.Shape(); fr.moveTo(-15, 0); fr.lineTo(15, 0); fr.lineTo(0, 3.6); fr.lineTo(-15, 0);
  const fron = new THREE.Mesh(new THREE.ExtrudeGeometry(fr, { depth: 1, bevelEnabled: false }), branco); fron.position.set(0, 10.9, 11.3); fron.castShadow = true; g.add(fron);
  for (let k = 0; k < 3; k++) bloco(g, branco, 30 - k * 0.01, 0.3, 2.2 - k * 0.6, 0, 0.15 + k * 0.3, 12.6 - k * 0.6);
  for (let a = 0; a < 2; a++) for (let k = 0; k < 7; k++) if (a || k !== 3) bloco(g, vidro, 2, 3, 0.1, -13 + k * 4.3, 3 + a * 4.3, 7.08);
  bloco(g, mat('#5a3d22'), 3.2, 5, 0.14, 0, 2.5, 7.1);
  const tambor = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 3, 24), branco); tambor.position.set(0, 13.1, -4); tambor.castShadow = true; g.add(tambor);
  const dom = new THREE.Mesh(new THREE.SphereGeometry(5.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cupula); dom.position.set(0, 14.6, -4); dom.castShadow = true; g.add(dom);
  const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 8), mat('#d8d8d8', { metalness: 0.6 })); mastro.position.set(0, 22.6, -4); g.add(mastro);
  for (const [sx, cor] of [[-7, '#2f9e5b'], [7, '#f2c230']]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 8, 8), mat('#d8d8d8', { metalness: 0.6 })); m.position.set(sx, 4, 14); g.add(m);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), mat(cor, { side: THREE.DoubleSide })); b.position.set(sx + 1.25, 7.2, 14); g.add(b);
  }
  ctx.scene.add(g);
  ctx.janelas.push(vidro);
  const t1 = ctx.textoSprite('PREFEITURA', { escala: 1.4, fundo: 'rgba(30,50,80,.92)', cor: '#ffe7a8' }); t1.position.set(PREFEITURA.x, 17, PREFEITURA.z + 6); ctx.scene.add(t1);
  ctx.colisores.push({ tipo: 'caixa', x0: PREFEITURA.x - 17, x1: PREFEITURA.x + 17, z0: PREFEITURA.z - 15, z1: PREFEITURA.z + 11 });
  ctx.balcao(PREFEITURA.prf.x, PREFEITURA.prf.z, '#1f3f7a', 'PRF · Polícia Eleitoral', 'Entre em serviço e investigue');
  ctx.balcao(PREFEITURA.jornal.x, PREFEITURA.jornal.z, '#6b5326', 'Jornal da Cidade', 'Vire jornalista e faça reportagens');
}

// concessionária: vitrine de vidro com três carros em exposição
export function montarConcessionaria() {
  const g = new THREE.Group(); g.position.set(CONCESSIONARIA.x, 0.18, CONCESSIONARIA.z);
  const vidro = new THREE.MeshStandardMaterial({ color: '#9fc0d8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false });
  bloco(g, mat('#d9dde2'), 28, 0.15, 18, 0, 0.08, -5);
  bloco(g, mat('#2b2f36'), 28.4, 0.6, 18.4, 0, 6.3, -5);
  bloco(g, mat('#c0392b'), 28.5, 1.1, 0.3, 0, 5.6, 4.2);
  for (const [w, d, x, z] of [[28, 0.1, 0, 4], [0.1, 18, -14, -5], [0.1, 18, 14, -5]]) bloco(g, vidro, w, 5.6, d, x, 2.9, z);
  bloco(g, mat('#e9e6df'), 28, 6, 0.3, 0, 3, -14);
  ['popular', 'suv', 'esportivo'].forEach((m, k) => { const c = modeloCarro(m, CORES_CARRO[k * 3 % CORES_CARRO.length]); c.position.set(-8 + k * 8, 0.15, -4); c.rotation.y = 0.5; g.add(c); });
  ctx.scene.add(g);
  const t = ctx.textoSprite('CONCESSIONÁRIA', { escala: 1.2, fundo: 'rgba(160,30,30,.92)' }); t.position.set(CONCESSIONARIA.x, 8.2, CONCESSIONARIA.z + 2); ctx.scene.add(t);
  ctx.colisores.push({ tipo: 'caixa', x0: CONCESSIONARIA.x - 14, x1: CONCESSIONARIA.x + 14, z0: CONCESSIONARIA.z - 14, z1: CONCESSIONARIA.z + 4 });
  ctx.balcao(CONCESSIONARIA.balcao.x, CONCESSIONARIA.balcao.z, '#c0392b', 'Vendas de carros', 'Popular, SUV e Esportivo');
}

// banco: pedra clara, colunata, letreiro dourado e cofre à vista
export function montarBanco() {
  const g = new THREE.Group(); g.position.set(BANCO.x, 0.18, BANCO.z);
  const pedra = mat('#d8d2c4', { roughness: 0.7 }), escuro = mat('#3b3f46'), ouro = mat('#d6a937', { metalness: 0.8, roughness: 0.3, emissive: '#6b4d10', emissiveIntensity: 0.3 });
  const vidro = mat('#24384a', { roughness: 0.1, metalness: 0.5, emissive: '#ffd27a', emissiveIntensity: 0 });
  bloco(g, pedra, 26, 12, 18, 0, 6, -4);
  bloco(g, escuro, 26.6, 0.8, 18.6, 0, 12.4, -4);
  bloco(g, pedra, 20, 4, 14, 0, 14.8, -5);
  for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 10, 14), pedra); c.position.set(-10 + k * 4, 5.2, 6.4); c.castShadow = true; g.add(c); }
  bloco(g, pedra, 24, 1.4, 3, 0, 10.9, 6.4);
  for (let k = 0; k < 3; k++) bloco(g, pedra, 24, 0.3, 3 - k * 0.8, 0, 0.15 + k * 0.3, 8.6 - k * 0.4);
  for (let a = 0; a < 2; a++) for (let k = 0; k < 5; k++) if (k !== 2) bloco(g, vidro, 2.4, 3.2, 0.1, -9.6 + k * 4.8, 3 + a * 4.6, 5.08);
  bloco(g, mat('#2a2f36', { metalness: 0.6 }), 3.6, 5.5, 0.14, 0, 2.75, 5.1);
  const cofre = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 24).rotateX(Math.PI / 2), mat('#9aa3ad', { metalness: 0.9, roughness: 0.25 })); cofre.position.set(0, 2.6, 5.1); g.add(cofre);
  bloco(g, ouro, 10, 1.3, 0.2, 0, 13.6, 5.35);
  ctx.scene.add(g); ctx.janelas.push(vidro);
  const t = ctx.textoSprite('BANCO CENTRAL', { escala: 1.3, fundo: 'rgba(40,36,20,.92)', cor: '#ffd36b' }); t.position.set(BANCO.x, 19, BANCO.z + 4); ctx.scene.add(t);
  ctx.colisores.push({ tipo: 'caixa', x0: BANCO.x - 13, x1: BANCO.x + 13, z0: BANCO.z - 13, z1: BANCO.z + 7.2 });
  ctx.balcao(BANCO.balcao.x, BANCO.balcao.z, '#b8902a', 'Banco Central', 'Poupança e empréstimos');
  ctx.balcao(BANCO.empregos.x, BANCO.empregos.z, '#2f7a4f', 'Agência de Empregos', 'Vagas nas empresas');
}

// hospital: prédio branco, ala alta, cruz vermelha, heliponto no teto e ambulância (frente para -Z)
export function montarHospital() {
  const g = new THREE.Group(); g.position.set(HOSPITAL.x, 0.18, HOSPITAL.z); g.rotation.y = Math.PI;
  const branco = mat('#f2f4f5', { roughness: 0.5 }), azul = mat('#3a87c8'), verm = mat('#d62828', { emissive: '#d62828', emissiveIntensity: 0.6 });
  const vidro = mat('#28455c', { roughness: 0.1, metalness: 0.5, emissive: '#d9f0ff', emissiveIntensity: 0 });
  bloco(g, branco, 30, 9, 16, 0, 4.5, -5);
  bloco(g, branco, 12, 18, 12, -8, 9, -6);
  bloco(g, azul, 30.4, 0.6, 16.4, 0, 9.3, -5);
  for (let a = 0; a < 2; a++) for (let k = 0; k < 6; k++) bloco(g, vidro, 2.6, 2.4, 0.1, -12.5 + k * 5, 2.4 + a * 3.6, 3.08);
  for (let a = 0; a < 4; a++) for (let k = 0; k < 3; k++) bloco(g, vidro, 2.4, 2.2, 0.1, -12 + k * 4, 10.5 + a * 2, 0.08);
  bloco(g, verm, 1.2, 4, 0.3, -8, 14, 0.2); bloco(g, verm, 4, 1.2, 0.3, -8, 14, 0.2);
  bloco(g, mat('#cfd6db'), 8, 0.4, 5, 3, 4.4, 5.4);
  for (const sx of [-0.6, 6.6]) bloco(g, mat('#9aa3ad'), 0.25, 4.2, 0.25, sx, 2.1, 7.6);
  const heli = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.2, 32), mat('#2c3238')); heli.position.set(-8, 18.1, -6); g.add(heli);
  const anel = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.12, 6, 40).rotateX(Math.PI / 2), mat('#f2c230')); anel.position.set(-8, 18.25, -6); g.add(anel);
  bloco(g, mat('#ffffff'), 0.3, 0.05, 2.6, -9, 18.25, -6); bloco(g, mat('#ffffff'), 0.3, 0.05, 2.6, -7, 18.25, -6); bloco(g, mat('#ffffff'), 2, 0.05, 0.3, -8, 18.25, -6);
  const amb = new THREE.Group(); amb.position.set(10, 0, 8); amb.rotation.y = Math.PI / 2;
  bloco(amb, mat('#f7f7f7'), 2.1, 2.2, 3.4, 0, 1.5, -0.6); bloco(amb, mat('#f7f7f7'), 2.0, 1.4, 1.6, 0, 1.1, 1.8);
  bloco(amb, mat('#1b2633'), 1.8, 0.6, 0.05, 0, 1.6, 2.62); bloco(amb, verm, 2.12, 0.3, 3.42, 0, 1.4, -0.6);
  bloco(amb, mat('#2266dd', { emissive: '#2266dd', emissiveIntensity: 1 }), 1.2, 0.2, 0.3, 0, 2.7, 0.8);
  for (const sx of [-1, 1]) for (const sz of [-1.6, 1.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12).rotateZ(Math.PI / 2), mat('#161616')); p.position.set(sx, 0.4, sz); amb.add(p); }
  HOSPITAL.veiculo = veiculoDeServico('ambulancia', HOSPITAL.vaga);
  if (!HOSPITAL.veiculo) g.add(amb);
  ctx.scene.add(g); ctx.janelas.push(vidro);
  const t = ctx.textoSprite('✚ HOSPITAL', { escala: 1.3, fundo: 'rgba(200,30,30,.92)' }); t.position.set(HOSPITAL.x, 21, HOSPITAL.z - 2); ctx.scene.add(t);
  ctx.colisores.push({ tipo: 'caixa', x0: HOSPITAL.x - 15, x1: HOSPITAL.x + 15, z0: HOSPITAL.z - 3.2, z1: HOSPITAL.z + 13 });
  ctx.balcao(HOSPITAL.balcao.x, HOSPITAL.balcao.z, '#d62828', 'Hospital', 'Tratamento e plantão médico');
}

// quartel dos bombeiros: tijolo vermelho, três portões, torre de treino e caminhão (frente para -Z)
export function montarBombeiros() {
  const g = new THREE.Group(); g.position.set(BOMBEIROS.x, 0.18, BOMBEIROS.z); g.rotation.y = Math.PI;
  const tijolo = mat('#9c3b2c', { roughness: 0.85 }), branco = mat('#efe9df'), portao = mat('#c9ced3', { metalness: 0.4 });
  bloco(g, tijolo, 22, 8, 16, -2, 4, -5);
  bloco(g, branco, 22.4, 0.6, 16.4, -2, 8.2, -5);
  for (let k = 0; k < 3; k++) { bloco(g, portao, 5, 5.6, 0.12, -9 + k * 6.6, 2.8, 3.04); for (let f = 0; f < 5; f++) bloco(g, mat('#aab1b8'), 5, 0.08, 0.14, -9 + k * 6.6, 0.7 + f * 1.1, 3.1); }
  bloco(g, tijolo, 4.5, 16, 4.5, 11, 8, -8);
  for (let a = 0; a < 4; a++) bloco(g, mat('#2a3540', { emissive: '#ffb36b', emissiveIntensity: 0.2 }), 2, 1.6, 0.08, 11, 4 + a * 3.4, -5.7);
  const cam = new THREE.Group(); cam.position.set(-4, 0, 9); cam.rotation.y = 0.15;
  const vm = mat('#c81e1e', { roughness: 0.35, metalness: 0.4 });
  bloco(cam, vm, 2.4, 2.2, 6.6, 0, 1.6, -0.4); bloco(cam, vm, 2.4, 1.6, 1.8, 0, 1.3, 3.6);
  bloco(cam, mat('#1b2633'), 2.2, 0.8, 0.05, 0, 1.9, 4.52); bloco(cam, mat('#f2f2f2'), 2.45, 0.25, 6.65, 0, 1.4, -0.4);
  bloco(cam, mat('#bfc5ca', { metalness: 0.7 }), 0.9, 0.2, 6, 0, 2.9, -0.6);
  for (let k = 0; k < 8; k++) bloco(cam, mat('#bfc5ca', { metalness: 0.7 }), 0.9, 0.08, 0.08, 0, 3.0, -3.3 + k * 0.75);
  bloco(cam, mat('#2266dd', { emissive: '#ff2020', emissiveIntensity: 1 }), 1.6, 0.2, 0.3, 0, 2.25, 4.0);
  for (const sx of [-1.15, 1.15]) for (const sz of [-2.8, 0, 3.4]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12).rotateZ(Math.PI / 2), mat('#161616')); p.position.set(sx, 0.5, sz); cam.add(p); }
  BOMBEIROS.veiculo = veiculoDeServico('bombeiros', BOMBEIROS.vaga);
  if (!BOMBEIROS.veiculo) g.add(cam);
  ctx.scene.add(g);
  const t = ctx.textoSprite('🚒 BOMBEIROS', { escala: 1.2, fundo: 'rgba(170,30,20,.92)' }); t.position.set(BOMBEIROS.x, 11, BOMBEIROS.z - 2); ctx.scene.add(t);
  ctx.colisores.push({ tipo: 'caixa', x0: BOMBEIROS.x - 9, x1: BOMBEIROS.x + 13, z0: BOMBEIROS.z - 3.2, z1: BOMBEIROS.z + 13 });
  ctx.colisores.push({ tipo: 'caixa', x0: BOMBEIROS.x - 13.3, x1: BOMBEIROS.x - 8.7, z0: BOMBEIROS.z + 5.7, z1: BOMBEIROS.z + 10.3 });
  ctx.balcao(BOMBEIROS.balcao.x, BOMBEIROS.balcao.z, '#c81e1e', 'Quartel dos Bombeiros', 'Entre em serviço e apague incêndios');
}

// luzes de sirene (piscam em atualizarSirenes)
function sirene(g, pos) {
  if (!pos) return;
  const [y, z] = pos;
  for (const [sx, cor] of [[-0.45, '#ff2020'], [0.45, '#2266ff']]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: cor }));
    l.position.set(sx, y, z); l.userData.sirene = sx < 0 ? 0 : 1; g.add(l);
  }
}
export function atualizarSirenes(t, raiz) {
  const fase = Math.floor(t * 4) % 2;
  raiz.traverse((o) => { if (o.userData.sirene !== undefined) o.visible = o.userData.sirene === fase; });
}
// ambulância e caminhão dos bombeiros parados na base (somem enquanto alguém dirige)
function veiculoDeServico(modelo, vaga) {
  if (!ctx.modelo?.(GLB_CARRO[modelo]) && !DO_EXERCITO.has(modelo)) return null;
  const m = modeloCarro(modelo, '#ffffff');
  m.position.set(vaga.x, ctx.altura?.(vaga.x, vaga.z) ?? 0.18, vaga.z); m.rotation.y = vaga.ang; ctx.scene.add(m);
  return m;
}

// cemitério: muro baixo de pedra, portão virado para a rua de cima, fileiras de túmulos, capela e ciprestes
export function montarCemiterio() {
  const g = new THREE.Group(); g.position.set(CEMITERIO.x, 0.18, CEMITERIO.z);
  const pedra = mat('#8d8a82', { roughness: 0.9 }), lapide = mat('#b9b6ae', { roughness: 0.8 }), escura = mat('#5d5a54'), grama = mat('#3e5a32', { roughness: 1 });
  bloco(g, grama, 40, 0.06, 40, 0, 0.03, 0);
  const L = 20, h = 1.3;
  bloco(g, pedra, 2 * L, h, 0.6, 0, h / 2, L);                     // fundo
  bloco(g, pedra, 0.6, h, 2 * L, -L, h / 2, 0); bloco(g, pedra, 0.6, h, 2 * L, L, h / 2, 0);
  bloco(g, pedra, L - 3, h, 0.6, -(L + 3) / 2, h / 2, -L); bloco(g, pedra, L - 3, h, 0.6, (L + 3) / 2, h / 2, -L);   // frente com portão
  for (const sx of [-3.2, 3.2]) bloco(g, escura, 0.9, 3, 0.9, sx, 1.5, -L);
  bloco(g, mat('#2b2b2b', { metalness: 0.6 }), 5.6, 0.25, 0.15, 0, 2.8, -L);
  // túmulos em fileiras (lápide + laje), alguns com cruz
  const geoLap = new THREE.BoxGeometry(1.1, 1.2, 0.25), geoLaje = new THREE.BoxGeometry(1.2, 0.18, 2.2), geoCruzV = new THREE.BoxGeometry(0.16, 1.5, 0.16), geoCruzH = new THREE.BoxGeometry(0.8, 0.16, 0.16);
  let k = 0;
  for (let zi = 0; zi < 5; zi++) for (let xi = 0; xi < 9; xi++) {
    if (xi === 4) continue;                                           // corredor do meio
    const x = -16 + xi * 4, z = -12 + zi * 5.2 + ((xi * 7) % 3) * 0.15;
    if (z > 12) continue;
    const laje = new THREE.Mesh(geoLaje, escura); laje.position.set(x, 0.09, z); g.add(laje);
    if (k++ % 3 === 0) {
      const v = new THREE.Mesh(geoCruzV, lapide); v.position.set(x, 0.85, z + 1.05); g.add(v);
      const hz = new THREE.Mesh(geoCruzH, lapide); hz.position.set(x, 1.15, z + 1.05); g.add(hz);
    } else { const l = new THREE.Mesh(geoLap, lapide); l.position.set(x, 0.6, z + 1.05); l.rotation.z = ((xi + zi) % 3 - 1) * 0.04; g.add(l); }
  }
  // capela ao fundo
  bloco(g, mat('#e6e0d2'), 7, 5, 6, 0, 2.5, 15.5);
  const tel = new THREE.Mesh(new THREE.ConeGeometry(5.4, 2.6, 4).rotateY(Math.PI / 4), mat('#6b3b2a')); tel.scale.set(1, 1, 0.85); tel.position.set(0, 6.3, 15.5); g.add(tel);
  bloco(g, mat('#3a2a1e'), 1.8, 3, 0.1, 0, 1.5, 12.45);
  bloco(g, lapide, 0.2, 1.6, 0.2, 0, 8.2, 15.5); bloco(g, lapide, 0.9, 0.2, 0.2, 0, 8.5, 15.5);
  // ciprestes
  const verde = mat('#2f4a2c');
  for (const [x, z] of [[-18, -17], [18, -17], [-18, 17], [18, 17], [-8, 17], [8, 17]]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6, 8), verde); c.position.set(x, 3.2, z); c.castShadow = true; g.add(c);
  }
  ctx.scene.add(g);
  const t = ctx.textoSprite('✝ CEMITÉRIO', { escala: 1.1, fundo: 'rgba(40,40,44,.92)' }); t.position.set(CEMITERIO.x, 5, CEMITERIO.z - L - 1); ctx.scene.add(t);
  const X = CEMITERIO.x, Z = CEMITERIO.z;
  ctx.colisores.push({ tipo: 'caixa', x0: X - L, x1: X + L, z0: Z + L - 0.3, z1: Z + L + 0.3 });
  ctx.colisores.push({ tipo: 'caixa', x0: X - L - 0.3, x1: X - L + 0.3, z0: Z - L, z1: Z + L });
  ctx.colisores.push({ tipo: 'caixa', x0: X + L - 0.3, x1: X + L + 0.3, z0: Z - L, z1: Z + L });
  ctx.colisores.push({ tipo: 'caixa', x0: X - L, x1: X - 3.5, z0: Z - L - 0.3, z1: Z - L + 0.3 });
  ctx.colisores.push({ tipo: 'caixa', x0: X + 3.5, x1: X + L, z0: Z - L - 0.3, z1: Z - L + 0.3 });
  ctx.colisores.push({ tipo: 'caixa', x0: X - 3.5, x1: X + 3.5, z0: Z + 12.5, z1: Z + 18.5 });
}
// lugar para acordar: entre os túmulos
export function pontoNoCemiterio() {
  const xi = [0, 1, 2, 3, 5, 6, 7, 8][Math.floor(Math.random() * 8)], zi = Math.floor(Math.random() * 4);
  return { x: CEMITERIO.x - 16 + xi * 4 + 1.6, z: CEMITERIO.z - 12 + zi * 5.2 + 0.5 };
}

// carros: frente em +Z, chão em y = 0
const cacheCarro = new Map();
export function modeloCarro(modelo, cor) {
  const chave = modelo + cor;
  if (cacheCarro.has(chave)) return cacheCarro.get(chave).clone();
  const base = ctx?.modelo?.(GLB_CARRO[modelo]);
  if (base) {   // modelo 3D: pinta de leve com a cor escolhida (o presidencial fica como é)
    const g = base.clone(true);
    if (modelo === 'viatura') { g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color('#ffffff').lerp(new THREE.Color('#1c2a52'), 0.55); } }); sirene(g, [2.05, -0.2]); }
    else if (SEM_TINTA.has(modelo)) { const sr = { ambulancia: [3.4, 0.9], bombeiros: [3.15, 2.5] }[modelo]; if (sr) sirene(g, sr); }
    else g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color('#ffffff').lerp(new THREE.Color(cor), 0.45); } });
    cacheCarro.set(chave, g);
    return g.clone();
  }
  const g = new THREE.Group();
  const pint = mat(cor, { roughness: 0.25, metalness: 0.55 }), vidro = mat('#1b2633', { roughness: 0.1, metalness: 0.6 }), pneu = mat('#161616', { roughness: 0.9 });
  const luz = mat('#fff6d0', { emissive: '#fff1c8', emissiveIntensity: 1.4 }), lanterna = mat('#c81e1e', { emissive: '#c81e1e', emissiveIntensity: 0.8 });
  if (!{ popular: 1, suv: 1, esportivo: 1, presidencial: 1 }[modelo]) modelo = 'suv';
  const dims = { popular: [1.7, 0.6, 3.9, 1.5, 0.55, 2.0, 0.34], suv: [1.95, 0.85, 4.6, 1.8, 0.75, 2.7, 0.42], esportivo: [1.95, 0.5, 4.5, 1.6, 0.42, 1.8, 0.36], presidencial: [2.0, 0.7, 6.4, 1.85, 0.62, 3.6, 0.4] }[modelo];
  const [w, h, l, cw, ch, cl, r] = dims;
  bloco(g, pint, w, h, l, 0, r + h / 2 + 0.1, 0);
  bloco(g, vidro, cw, ch, cl, 0, r + h + ch / 2 + 0.08, modelo === 'esportivo' ? -0.3 : -0.2);
  bloco(g, pint, cw * 0.98, 0.08, cl * 0.9, 0, r + h + ch + 0.1, modelo === 'esportivo' ? -0.3 : -0.2);
  for (const sx of [-w / 2 + 0.25, w / 2 - 0.25]) {
    bloco(g, luz, 0.4, 0.14, 0.05, sx, r + h * 0.7, l / 2 + 0.01);
    bloco(g, lanterna, 0.4, 0.14, 0.05, sx, r + h * 0.7, -l / 2 - 0.01);
    for (const sz of [-l / 2 + 0.75, l / 2 - 0.75]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.26, 14).rotateZ(Math.PI / 2), pneu); p.position.set(sx + Math.sign(sx) * 0.05, r, sz); p.castShadow = true; g.add(p); }
  }
  if (modelo === 'esportivo') { bloco(g, mat('#111'), w, 0.06, 0.4, 0, r + h + 0.45, -l / 2 + 0.25); for (const sx of [-0.7, 0.7]) bloco(g, mat('#111'), 0.08, 0.35, 0.08, sx, r + h + 0.25, -l / 2 + 0.25); }
  if (modelo === 'presidencial') for (const sx of [-0.85, 0.85]) {
    bloco(g, mat('#cfcfcf', { metalness: 0.7 }), 0.04, 0.5, 0.04, sx, r + h + 0.35, l / 2 - 0.4);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), mat(sx < 0 ? '#2f9e5b' : '#f2c230', { side: THREE.DoubleSide })); b.position.set(sx, r + h + 0.5, l / 2 - 0.6); b.rotation.y = Math.PI / 2; g.add(b);
  }
  cacheCarro.set(chave, g);
  return g.clone();
}

// outdoors: duas colunas e uma placa com o anúncio desenhado num canvas
const outdoors = new Map();
function texturaOutdoor(o) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const livre = !o.ate || Date.parse(o.ate) < Date.now();
  const cand = o.tipo === 'candidato';
  const gr = g.createLinearGradient(0, 0, 512, 256);
  if (livre) { gr.addColorStop(0, '#3a3f48'); gr.addColorStop(1, '#22262d'); } else if (cand) { gr.addColorStop(0, '#1f4f9a'); gr.addColorStop(1, '#0f2a57'); } else { gr.addColorStop(0, '#c0392b'); gr.addColorStop(1, '#7a1f17'); }
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 8; g.strokeRect(8, 8, 496, 240);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const caber = (t, max, tam) => { let s = tam; do { g.font = `bold ${s}px sans-serif`; s -= 2; } while (g.measureText(t).width > max && s > 16); };
  if (livre) {
    caber('ANUNCIE AQUI', 470, 56); g.fillText('ANUNCIE AQUI', 256, 100);
    g.font = '28px sans-serif'; g.fillStyle = '#ffe7a8'; g.fillText('40 moedas por minuto · Prefeitura', 256, 170);
  } else {
    if (cand) { g.font = 'bold 30px sans-serif'; g.fillStyle = '#ffe7a8'; g.fillText('ELEIÇÃO PARA PREFEITO', 256, 50); g.fillStyle = '#fff'; }
    caber(o.titulo || '', 470, 60); g.fillText(o.titulo || '', 256, cand ? 120 : 105);
    if (o.texto) { caber(o.texto, 470, 34); g.fillStyle = '#f2f2f2'; g.fillText(o.texto, 256, cand ? 190 : 180); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export function atualizarOutdoors(lista) {
  for (const o of lista) {
    const livre = !o.ate || Date.parse(o.ate) < Date.now();
    const chave = livre ? 'livre' : `${o.titulo}|${o.texto}|${o.tipo}`;
    let v = outdoors.get(o.id);
    if (!v) {
      const g = new THREE.Group(), y = ctx.altura(o.x, o.z);
      g.position.set(o.x, y, o.z);
      for (const sx of [-2.2, 2.2]) bloco(g, mat('#3a3d42', { metalness: 0.5 }), 0.25, 3.2, 0.25, sx, 1.6, 0);
      const placa = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.15 }));
      placa.position.set(0, 4.8, 0); g.add(placa);
      bloco(g, mat('#2b2f36'), 6.7, 0.2, 0.4, 0, 3.15, 0);
      ctx.scene.add(g);
      ctx.colisores.push({ tipo: 'circ', x: o.x - 2.2, z: o.z, r: 0.3 }, { tipo: 'circ', x: o.x + 2.2, z: o.z, r: 0.3 });
      v = { g, placa, chave: null }; outdoors.set(o.id, v);
    }
    v.o = o; v.chaveNormal = chave;
    pintarOutdoor(o.id, v);
  }
}
// muito procurados: os 2 outdoors mais perto de onde cada um foi visto mostram o cartaz
const cartazes = new Map();     // outdoor -> procurado
function pintarOutdoor(id, v) {
  const w = cartazes.get(id), chave = w ? `proc|${w.id}|${w.recompensa}|${w.matancas}` : v.chaveNormal;
  if (v.chave === chave) return;
  v.chave = chave;
  v.placa.material.map?.dispose();
  const tex = w ? texturaProcurado(w) : texturaOutdoor(v.o); v.placa.material.map = tex; v.placa.material.emissiveMap = tex; v.placa.material.needsUpdate = true;
}
function texturaProcurado(w) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e9dcb8'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#5a3a1a'; g.lineWidth = 10; g.strokeRect(6, 6, 500, 244);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#9a1b12'; g.font = 'bold 54px serif'; g.fillText('PROCURADO', 256, 46);
  g.fillStyle = '#2a1a0a'; let t = 46; do { g.font = `bold ${t}px sans-serif`; t -= 2; } while (g.measureText(w.nome).width > 470 && t > 18);
  g.fillText(w.nome, 256, 110);
  g.font = 'bold 34px sans-serif'; g.fillStyle = '#1f5d1f'; g.fillText(`RECOMPENSA: ${Number(w.recompensa).toLocaleString('pt-BR')}`, 256, 165);
  g.font = '22px sans-serif'; g.fillStyle = '#3a2a1a'; g.fillText(`${w.matancas} mortes · visto nesta região · vivo ou preso`, 256, 214);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  return tx;
}
export function procuradosNosOutdoors(lista) {
  cartazes.clear();
  for (const w of lista) {
    if (w.x == null) continue;
    [...outdoors.entries()].map(([id, v]) => [id, Math.hypot(v.o.x - w.x, v.o.z - w.z)]).sort((a, b) => a[1] - b[1]).slice(0, 2)
      .forEach(([id]) => { if (!cartazes.has(id)) cartazes.set(id, w); });
  }
  for (const [id, v] of outdoors) if (v.o) pintarOutdoor(id, v);
}
export function brilhoOutdoors(noite) { for (const v of outdoors.values()) v.placa.material.emissiveIntensity = 0.15 + noite * 0.6; }
