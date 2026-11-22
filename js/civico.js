// Prefeitura, concessionária, outdoors e modelos de carro (tudo feito por código).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { criarOvni } from './ovni.js';
import { criarJato, JATOS } from './jato.js';

let ctx = null;
export const PREFEITURA = { x: -135, z: -135, porta: { x: -135, z: -120.5 }, prf: { x: -146, z: -115 }, jornal: { x: -124, z: -115 } };
export const CONCESSIONARIA = { x: 135, z: -135, balcao: { x: 135, z: -127.5 } };
export const BANCO = { x: 81, z: -135, balcao: { x: 75, z: -124 }, empregos: { x: 88, z: -124 } };
// almoxarifado: anexo do hospital (lado leste), só funcionários entram; a prateleira fica no fundo
export const ALMOX = { x0: -119.4, x1: -114.4, z0: 135, z1: 144, porta: { x: -116.9, z: 133.6 }, prateleira: { x: -116.9, z: 142.4 } };
export const HOSPITAL = { heli: null, heliVaga: null, x: -135, z: 135, balcao: { x: -131, z: 125 }, saida: { x: -139, z: 124 }, vaga: { x: -145, z: 126, ang: -Math.PI / 2 }, veiculo: null };
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
    { modelo: 'tanque', x: 200, z: 1059, ang: -Math.PI / 2 },
    { modelo: 'ovni', x: -800, z: -20, ang: Math.PI / 2, area51: true },   // escondido no hangar da Área 51
    // Base Aérea (ao lado do quartel): os caças ficam no pátio, na frente dos hangares, de nariz para a pista
    { modelo: 'caca_leve', x: 350, z: 1040, ang: 0, aerea: true }, { modelo: 'caca_furtivo', x: 395, z: 1040, ang: 0, aerea: true }, { modelo: 'asa_furtiva', x: 455, z: 1040, ang: 0, aerea: true },
  ],
  arsenal: { x: 163, z: 986 },
  estande: { x0: 150, x1: 250, z0: 1087, z1: 1103, linha: 157, entrada: { x: 199, z: 1084 } },
  alvos: [],
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
  // QG do Exército em 3D (predio_exercito.glb) por fora: as paredes daqui só aparecem quando você entra (o modelo some)
  { const glb = ctx.modelo?.('predio_exercito');
    if (glb) {
      const paredes = g.children.slice(0, g.children.indexOf(teto));
      const casca = new THREE.Group(); casca.position.set(cx, 0.15, cz); casca.rotation.y = -Math.PI / 2;   // modelo com a frente em +x: vira para a porta (+z)
      const m = glb.clone(true); casca.add(m); m.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(m), tam = bb.getSize(new THREE.Vector3()), k = (W + 2) / Math.max(tam.x, tam.z);
      m.scale.setScalar(k); m.position.set(-(bb.min.x + bb.max.x) / 2 * k, -bb.min.y * k, -(bb.min.z + bb.max.z) / 2 * k);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      ctx.scene.add(casca); EXERCITO.casca = { glb: casca, paredes };
    } }
  // interior
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * e, D - 2 * e).rotateX(-Math.PI / 2), mat('#8d8a7a', { roughness: 0.7 })); piso.position.set(cx, 0.14, cz); piso.receiveShadow = true; g.add(piso);
  const tapete = new THREE.Mesh(new THREE.PlaneGeometry(3, 10).rotateX(-Math.PI / 2), mat('#7a1f22', { roughness: 1 })); tapete.position.set(C.porta.x, 0.15, C.z1 - 6); g.add(tapete);
  ctx.balcao(EXERCITO.balcao.x, EXERCITO.balcao.z, '#4b5a2e', 'Comando do Exército', 'Ordens, caçadas e carreira');
  ctx.balcao(EXERCITO.arsenal.x, EXERCITO.arsenal.z, '#3a3f2c', 'Arsenal', 'Arma pesada (com autorização)');
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
  const tetoG = new THREE.Group(); g.add(tetoG); EXERCITO.tetoGaragem = tetoG; EXERCITO.garagem = G;
  b(escuro, G.x1 - G.x0 + 1, 0.35, G.z1 - G.z0 + 1.5, (G.x0 + G.x1) / 2, 5.4, (G.z0 + G.z1) / 2 - 0.4, tetoG);
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
  for (let k = 0; k < 4; k++) { b(madeira, 3, 1.2, 0.3, 160 + k * 6, 0.74, 1000); col(158.5 + k * 6, 161.5 + k * 6, 999.8, 1000.2); }   // pista de obstáculos
  for (const x of [186, 192]) { b(metal, 0.12, 2.4, 0.12, x - 1, 1.3, 987); b(metal, 0.12, 2.4, 0.12, x + 1, 1.3, 987); b(metal, 2.1, 0.1, 0.1, x, 2.4, 987); }
  for (const [x, z] of [[190, 1078], [193, 1078], [191.5, 1080.5]]) { b(madeira, 2.2, 1.4, 2.2, x, 0.85, z); }
  col(188.8, 194.2, 1076.8, 1081.7);
  for (let k = 0; k < 6; k++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 14), mat(k % 2 ? '#3f5a2b' : '#4a4f3a')); t.position.set(244 + (k % 3) * 1.1, 0.8, 1060 + Math.floor(k / 3) * 1.1); t.castShadow = true; g.add(t); }
  col(243.4, 247, 1059.4, 1061.8);
  // ---- estande de tiro (fundo do quartel, só militares): 4 raias com alvos a 8, 15, 25 e 40 m
  const E = EXERCITO.estande;
  b(concreto, 46, 1.2, 0.3, 173, 0.6, E.z0); col(150, 196, E.z0 - 0.15, E.z0 + 0.15);                 // mureta que separa
  b(concreto, 48, 1.2, 0.3, 226, 0.6, E.z0); col(202, 250, E.z0 - 0.15, E.z0 + 0.15);
  const ch = new THREE.Mesh(new THREE.PlaneGeometry(98, E.z1 - E.z0).rotateX(-Math.PI / 2), mat('#9c8f74', { roughness: 1 })); ch.position.set(200, 0.15, (E.z0 + E.z1) / 2); ch.receiveShadow = true; g.add(ch);
  b(mat('#6f6450', { roughness: 1 }), 2.5, 4, E.z1 - E.z0, 246, 2, (E.z0 + E.z1) / 2); col(244.7, 247.3, E.z0, E.z1);   // barranco atrás dos alvos
  const tAlvo = alvoTextura();
  EXERCITO.alvos = [];
  [8, 15, 25, 40].forEach((d, k) => {
    const z = E.z0 + 3.5 + k * 3.8, x = E.linha + d;
    b(madeira, 0.2, 1.1, 2.2, E.linha - 0.4, 0.55, z); col(E.linha - 0.5, E.linha - 0.3, z - 1.1, z + 1.1);           // bancada da raia
    b(branco, d, 0.03, 0.06, E.linha + d / 2, 0.17, z - 1.9);                                                          // faixa entre as raias
    b(escuro, 0.12, 1.2, 0.12, x + 0.1, 0.75, z); col(x - 0.1, x + 0.3, z - 0.1, z + 0.1);
    const disco = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshStandardMaterial({ map: tAlvo, roughness: 0.8 }));
    disco.position.set(x, 1.65, z); disco.rotation.y = -Math.PI / 2; disco.castShadow = true; g.add(disco);
    const pl = ctx.textoSprite(`${d} m`, { escala: 0.5, fundo: 'rgba(52,62,34,.9)' }); pl.position.set(x, 2.6, z); ctx.scene.add(pl);
    EXERCITO.alvos.push({ x, y: 1.65, z, d, raio: 0.6, disco });
  });
  const pe = ctx.textoSprite('🎯 Estande de tiro · só militares', { escala: 0.7, fundo: 'rgba(52,62,34,.94)' }); pe.position.set(E.linha + 2, 3.4, (E.z0 + E.z1) / 2); ctx.scene.add(pe);
  // ---- veículos expostos
  EXERCITO.veiculos = EXERCITO.vagas.map((v) => ({ ...v, mesh: veiculoDeServico(v.modelo, v) })).filter((v) => v.mesh);
}
export function alvoTextura() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  [['#f4f1e8', 64], ['#d62828', 52], ['#f4f1e8', 40], ['#d62828', 28], ['#f4f1e8', 16], ['#d62828', 7]].forEach(([cor, r]) => { g.fillStyle = cor; g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.fill(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// o teto do Comando some quando o jogador está dentro
export function atualizarQuartel(p) {
  const C = EXERCITO.comando; if (!EXERCITO.teto) return;
  const dentro = p.x > C.x0 && p.x < C.x1 && p.z > C.z0 && p.z < C.z1;
  EXERCITO.teto.visible = !dentro && !EXERCITO.casca;
  const K = EXERCITO.casca;
  if (K && K.dentro !== dentro) { K.dentro = dentro; K.glb.visible = !dentro; for (const o of K.paredes) o.visible = dentro; }
  const G = EXERCITO.garagem;   // garagem: o telhado some quando você chega perto, para ver os veículos
  if (G) EXERCITO.tetoGaragem.visible = !(p.x > G.x0 - 4 && p.x < G.x1 + 4 && p.z > G.z0 - 12 && p.z < G.z1 + 2);
}
export const BOMBEIROS = { heli: null, heliVaga: null, x: -81, z: 135, balcao: { x: -88, z: 125 }, vaga: { x: -77, z: 125.5, ang: Math.PI + 0.15 }, veiculo: null };
export const CARROS = {
  popular: { nome: 'Popular', preco: 40000, vel: 10 },
  suv: { nome: 'SUV', preco: 95000, vel: 11 },
  esportivo: { nome: 'Esportivo', preco: 180000, vel: 14 },
  classico: { nome: 'Clássico V8', preco: 1000000, vel: 16 },
  ambulancia: { nome: 'Ambulância', preco: 0, vel: 12 },
  viatura: { nome: 'Viatura', preco: 0, vel: 12 },
  bombeiros: { nome: 'Caminhão dos bombeiros', preco: 0, vel: 10 },
  presidencial: { nome: 'Presidencial', preco: 0, vel: 12 },
  militar: { nome: 'Jipe do Exército', preco: 0, vel: 14 },
  exercito_caminhao: { nome: 'Caminhão do Exército', preco: 0, vel: 11 },
  helicoptero_exercito: { nome: 'Helicóptero do Exército', preco: 0, vel: 26, voa: true },
  ovni: { nome: 'Óvni do Exército', preco: 0, vel: 62, voa: true },
  caca_leve: { nome: 'Caça leve', preco: 0, vel: 95, voa: true, jato: true },
  caca_furtivo: { nome: 'Caça furtivo', preco: 0, vel: 120, voa: true, jato: true },
  asa_furtiva: { nome: 'Asa furtiva', preco: 0, vel: 80, voa: true, jato: true },
  helicoptero: { nome: 'Helicóptero executivo', preco: 1500000, vel: 24, voa: true },
  helicoptero_resgate: { nome: 'Helicóptero de resgate (hospital)', preco: 0, vel: 24, voa: true },
  helicoptero_bombeiros: { nome: 'Helicóptero dos bombeiros', preco: 0, vel: 22, voa: true },
  tanque: { nome: 'Tanque do Exército', preco: 0, vel: 7 },
  caveirao: { nome: 'Caveirão do BOPE', preco: 0, vel: 11 },
  viatura_civil: { nome: 'Viatura da Polícia Civil', preco: 0, vel: 13 },
  viatura_prf: { nome: 'Viatura da PRF', preco: 0, vel: 14 },
  saveiro: { nome: 'Saveiro', preco: 55000, vel: 11 },
  moto_250: { nome: 'Moto 250 cc', preco: 18000, vel: 13, moto: true },   // 21h: motos
  moto_650: { nome: 'Moto 650 cc', preco: 85000, vel: 17.5, moto: true },
  saveiro_som: { nome: 'Saveiro com som', preco: 150000, vel: 10.5 },
  onibus: { nome: 'Ônibus', preco: 0, vel: 12 },
  van: { nome: 'Van', preco: 0, vel: 11 },
  caminhao_escola: { nome: 'Caminhão da autoescola', preco: 0, vel: 9 },
  caminhao_lixo: { nome: 'Caminhão de lixo', preco: 0, vel: 9 },
  onibus_amarelo: { nome: 'Ônibus urbano (amarelo)', preco: 0, vel: 12 },
  onibus_branco: { nome: 'Ônibus urbano (branco)', preco: 0, vel: 12 },
  onibus_laranja: { nome: 'Ônibus urbano (laranja)', preco: 0, vel: 12 },
  onibus_brasilsul: { nome: 'Ônibus de viagem dois andares', preco: 0, vel: 13 },
  onibus_viacao: { nome: 'Ônibus de viagem executivo', preco: 0, vel: 13 },
  // 20e: ônibus da Viação Expresso Fator (rodoviários)
  onibus_rod_dourado: { nome: 'Rodoviário Dourado (3 eixos)', preco: 0, vel: 13.5 },
  onibus_rod_amarelo: { nome: 'Rodoviário Amarelo (3 eixos)', preco: 0, vel: 13.5 },
  onibus_rod_vermelho: { nome: 'Executivo Vermelho', preco: 0, vel: 13 },
  onibus_rod_branco: { nome: 'Micro Executivo Branco', preco: 0, vel: 12.5 },
  aviao_pequeno: { nome: 'Avião pequeno', preco: 0, vel: 40, voa: true },
  aviao_medio: { nome: 'Avião médio', preco: 0, vel: 52, voa: true },
  aviao_grande: { nome: 'Avião grande', preco: 0, vel: 64, voa: true },
  aviao_gigante: { nome: 'Avião gigante', preco: 0, vel: 70, voa: true },
};
// arrancada: segundos para chegar perto da velocidade máxima. Os leves arrancam rápido; ônibus e caminhões, devagar.
const ARRANCADA = { moto_250: 3.6, moto_650: 2.4, esportivo: 3, classico: 3, popular: 5, viatura: 5, ambulancia: 5.5, presidencial: 5.5, suv: 6.5, militar: 6.5, van: 6.5,
  caminhao: 11, caminhao_escola: 11, caminhao_lixo: 11, bombeiros: 11, exercito_caminhao: 11, tanque: 12,
  onibus: 12, onibus_urbano: 12, onibus_apache: 12, onibus_busscar: 12, onibus_executivo: 14, onibus_executivo2: 15, onibus_dois_andares: 15, onibus_articulado: 16,
  onibus_amarelo: 12, onibus_branco: 12, onibus_laranja: 12, onibus_brasilsul: 15, onibus_viacao: 14,
  onibus_rod_dourado: 14, onibus_rod_amarelo: 14, onibus_rod_vermelho: 12.5, onibus_rod_branco: 11 };
// aceleração (m/s²) na velocidade v: forte no começo e mais fraca perto do máximo, como um motor de verdade
export function aceleracao(modelo, v, max) {
  const T = ARRANCADA[modelo] ?? 6, a0 = 1.21 * max / T, x = Math.min(1, Math.max(0, v / max));
  return a0 * Math.max(0.2, 1 - 0.75 * x * x);
}
// quantos passageiros cada veículo leva (além do motorista); veículos do Exército só levam militares
export const LUGARES = { helicoptero_resgate: 3, helicoptero_bombeiros: 3, caveirao: 5, viatura_civil: 3, viatura_prf: 3, saveiro: 2, saveiro_som: 2, ovni: 2, tanque: 1, militar: 3, exercito_caminhao: 8, helicoptero_exercito: 6, helicoptero: 4, suv: 3, popular: 3, classico: 3, esportivo: 1, presidencial: 3 };
// veículos abertos: o motorista aparece sentado (banco: altura e posição no modelo, motorista do lado esquerdo)
// lugares: [lado (1 = esquerda, -1 = direita), altura do assento, z]; o 1º é o do motorista
// helicóptero do Exército (19h): lugares em coordenadas do modelo [x, y, z, giro]; os militares sentam na beira do
// piso, virados para as portas abertas, com as pernas para fora (o 1º é o piloto, na cabine)
export const ABERTOS = { militar: { lugares: [[1, 0.98, -0.28], [-1, 0.98, -0.28], [1, 1.0, -0.98], [-1, 1.0, -0.98]] },
  helicoptero_exercito: { abs: true, lugares: [[-0.5, 1.4, 3.9, 0], [1.0, 0.95, 2.3, Math.PI / 2], [-1.0, 0.95, 2.3, -Math.PI / 2], [1.0, 0.95, 1.75, Math.PI / 2], [-1.0, 0.95, 1.75, -Math.PI / 2], [1.0, 0.95, 2.85, Math.PI / 2], [-1.0, 0.95, 2.85, -Math.PI / 2]] } };
export const DO_EXERCITO = new Set(['caca_leve', 'caca_furtivo', 'asa_furtiva', 'ovni', 'militar', 'exercito_caminhao', 'helicoptero_exercito', 'tanque']);
export const CORES_CARRO = ['#c0392b', '#2c3e50', '#ecf0f1', '#f1c40f', '#2980b9', '#16a085', '#8e44ad', '#1f1f1f', '#d35400'];

const mat = (cor, ex = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.6, ...ex });
function bloco(g, m, w, h, d, x, y, z) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o;
}

export function iniciar(contexto) { ctx = contexto; }
const GLB_CARRO = { moto_250: 'moto_250', moto_650: 'moto_650', van: 'van', tanque: 'tanque', militar: 'exercito_jipe', exercito_caminhao: 'exercito_caminhao', helicoptero_exercito: 'helicoptero_exercito', helicoptero: 'helicoptero_executivo', helicoptero_resgate: 'helicoptero_executivo', helicoptero_bombeiros: 'helicoptero_executivo', viatura: 'carro_suv', popular: 'carro_popular', classico: 'carro_classico', suv: 'carro_suv', esportivo: 'carro_esportivo', presidencial: 'carro_presidencial', ambulancia: 'ambulancia', bombeiros: 'caminhao_bombeiros', onibus: 'onibus_grande', caminhao_escola: 'caminhao', caminhao_lixo: 'caminhao_lixo', onibus_urbano: 'onibus_urbano', onibus_executivo: 'onibus_executivo', onibus_executivo2: 'onibus_executivo2', onibus_dois_andares: 'onibus_dois_andares', onibus_apache: 'onibus_apache', onibus_busscar: 'onibus_busscar', onibus_articulado: 'onibus_articulado', aviao_pequeno: 'aviao_pequeno', aviao_medio: 'aviao_medio', aviao_grande: 'aviao_grande', aviao_gigante: 'aviao_gigante' };
const SEM_TINTA = new Set(['moto_250', 'moto_650', 'onibus_executivo2', 'onibus_dois_andares', 'aviao_pequeno', 'aviao_medio', 'aviao_grande', 'aviao_gigante', 'tanque', 'presidencial', 'ambulancia', 'bombeiros', 'militar', 'exercito_caminhao', 'helicoptero_exercito', 'helicoptero']);

// prefeitura neoclássica: salão, colunas, frontão, cúpula e bandeiras
export function montarPrefeitura() {
  const g = new THREE.Group(); g.position.set(PREFEITURA.x, 0.18, PREFEITURA.z);
  const glb = ctx.modelo?.('predio_prefeitura');
  if (glb) {   // modelo 3D (Meshy) quando existe: ocupa o mesmo lugar do prédio feito por código, frente para a rua (+z)
    const giro = new THREE.Group(); giro.add(glb.clone(true)); giro.rotation.y = -Math.PI / 2;   // o modelo do Meshy veio com a frente para +x
    const m = new THREE.Group(); m.add(giro); m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m), tam = bb.getSize(new THREE.Vector3()), k = Math.min(34 / (tam.x || 1), 26 / (tam.z || 1));
    m.scale.setScalar(k); m.position.set(-(bb.min.x + bb.max.x) / 2 * k, -bb.min.y * k, -2 - (bb.min.z + bb.max.z) / 2 * k);
    m.traverse((q) => { if (q.isMesh) { q.castShadow = true; q.receiveShadow = true; } }); g.add(m); ctx.scene.add(g);
    const t0 = ctx.textoSprite('PREFEITURA', { escala: 1.4, fundo: 'rgba(30,50,80,.92)', cor: '#ffe7a8' }); t0.position.set(PREFEITURA.x, tam.y * k + 3, PREFEITURA.z + 6); ctx.scene.add(t0);
    // medidas tiradas do modelo (local, frente +z): corpo até z 0,5; pórtico com piso a 2 m (x ±6,7, z 0,5..5,6) e
    // escadaria (x ±5,4, z 5,6..8,8) descendo até a calçada. Pórtico e escada são chão de verdade: o pé não afunda.
    const X = PREFEITURA.x, Z = PREFEITURA.z, Y = 0.18, caixa = (x0, z0, x1, z1) => ctx.colisores.push({ tipo: 'caixa', x0: X + x0, x1: X + x1, z0: Z + z0, z1: Z + z1 });
    caixa(-17, -12.8, 17, 0.5);                                   // prédio
    caixa(-7.3, 0.5, -6.7, 8.8); caixa(6.7, 0.5, 7.3, 8.8);        // muretas do pórtico e da escada
    caixa(-6.7, 5.6, -5.4, 8.8); caixa(5.4, 5.6, 6.7, 8.8);        // guarda-corpo da escada
    for (const [cx, cz] of [[-6, 1], [6, 1], [-6, 3], [6, 3]]) ctx.colisores.push({ tipo: 'circ', x: X + cx, z: Z + cz, r: 0.45 });
    ctx.addPiso?.({ x0: X - 6.7, x1: X + 6.7, z0: Z + 0.5, z1: Z + 5.4, h: Y + 2.0 });
    ctx.addPiso?.({ x0: X - 5.4, x1: X + 5.4, z0: Z + 5.4, z1: Z + 8.8, h: Y + 2.0, rampa: { eixo: 'z', de: Z + 8.8, ate: Z + 5.4, h0: Y, h1: Y + 2.0 } });
    PREFEITURA.porta.z = Z + 3;                                    // a porta fica no pórtico, lá em cima
    PREFEITURA.porta.x = X;
    if (!ctx.modelo?.('predio_prf')) ctx.balcao(PREFEITURA.prf.x, PREFEITURA.prf.z, '#1f3f7a', 'PRF · Polícia Eleitoral', 'Entre em serviço e investigue');   // com a base 3D, a PRF sai da calçada
    ctx.balcao(PREFEITURA.jornal.x, PREFEITURA.jornal.z, '#6b5326', 'Jornal da Cidade', 'Vire jornalista e faça reportagens');
    return;
  }
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
  if (!ctx.modelo?.('predio_prf')) ctx.balcao(PREFEITURA.prf.x, PREFEITURA.prf.z, '#1f3f7a', 'PRF · Polícia Eleitoral', 'Entre em serviço e investigue');   // com a base 3D, a PRF sai da calçada
  ctx.balcao(PREFEITURA.jornal.x, PREFEITURA.jornal.z, '#6b5326', 'Jornal da Cidade', 'Vire jornalista e faça reportagens');
}

// concessionária: vitrine de vidro com três carros em exposição
export function montarConcessionaria() {
  const g = new THREE.Group(); g.position.set(CONCESSIONARIA.x, 0.18, CONCESSIONARIA.z);
  const vidro = new THREE.MeshStandardMaterial({ color: '#9fc0d8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false });
  bloco(g, mat('#d9dde2'), 28, 0.15, 18, 0, 0.08, -5);
  ctx.addPiso?.({ x0: CONCESSIONARIA.x - 14, x1: CONCESSIONARIA.x + 14, z0: CONCESSIONARIA.z - 14, z1: CONCESSIONARIA.z + 4, h: 0.335 });   // piso da loja
  bloco(g, mat('#2b2f36'), 28.4, 0.6, 18.4, 0, 6.3, -5);
  bloco(g, mat('#c0392b'), 28.5, 1.1, 0.3, 0, 5.6, 4.2);
  for (const [w, d, x, z] of [[28, 0.1, 0, 4], [0.1, 18, -14, -5], [0.1, 18, 14, -5]]) bloco(g, vidro, w, 5.6, d, x, 2.9, z);
  bloco(g, mat('#e9e6df'), 28, 6, 0.3, 0, 3, -14);
  ['popular', 'suv', 'esportivo', 'classico'].forEach((m, k) => { const c = modeloCarro(m, k === 3 ? '#d35400' : CORES_CARRO[k * 3 % CORES_CARRO.length]); c.position.set(-10.5 + k * 7, 0.15, -4); c.rotation.y = 0.5; g.add(c); });
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
// helicóptero de serviço parado numa laje (heliponto): fica no lugar e o modelo do GLB próprio entra quando existir
// helicópteros do Meshy vêm numa peça só: as pás (acima de y, em volta do eixo) viram um nó "rotor" que gira
const ROTOR = { helicoptero_resgate: { y: 3.97, x: 0, z: 1.82, r: 8 }, helicoptero_bombeiros: { y: 4.46, x: 0, z: 0.38, r: 8.5, queda: 0.12, lado: 1.6 } };   // queda: as pontas das pás caem (ficavam paradas no ar com o rotor girando)
function separarRotor(base, R) {
  if (!R || base.getObjectByName('rotor')) return;
  base.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(base.matrixWorld).invert();
  const malhas = []; base.traverse((o) => { if (o.isMesh && o.geometry?.index) malhas.push(o); });
  const rotor = new THREE.Group(); rotor.name = 'rotor'; rotor.position.set(R.x, 0, R.z);
  const v = new THREE.Vector3(), m = new THREE.Matrix4();
  for (const o of malhas) {
    const geo = o.geometry, pos = geo.attributes.position, uv = geo.attributes.uv, nor = geo.attributes.normal, idx = geo.index, fica = [], P = [], U = [], N = [];
    m.multiplyMatrices(inv, o.matrixWorld); const mn = new THREE.Matrix3().getNormalMatrix(m);
    const w = (i) => v.fromBufferAttribute(pos, i).applyMatrix4(m);
    for (let t = 0; t < idx.count; t += 3) {
      const ids = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const pa = ids.map((i) => w(i).clone());
      const naPa = (q) => { const d = Math.hypot(q.x - R.x, q.z - R.z);
        if (q.y > R.y && d < R.r) return true;
        // ponta caída da pá: longe do eixo (fora da fuselagem), um pouco abaixo da altura do rotor; a cauda (fina, atrás) fica
        return !!R.queda && d > R.lado && d < R.r + 2 && q.y > R.y - R.queda * d && !(Math.abs(q.x - R.x) < 0.8 && q.z < R.z - 3); };
      if (pa.every(naPa)) {
        for (let k = 0; k < 3; k++) {
          P.push(pa[k].x - R.x, pa[k].y, pa[k].z - R.z);
          if (uv) U.push(uv.getX(ids[k]), uv.getY(ids[k]));
          if (nor) { v.fromBufferAttribute(nor, ids[k]).applyMatrix3(mn).normalize(); N.push(v.x, v.y, v.z); }
        }
      } else fica.push(...ids);
    }
    if (!P.length) continue;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (U.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    if (N.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); else g.computeVertexNormals();
    const pas = new THREE.Mesh(g, o.material); pas.castShadow = true; rotor.add(pas);
    geo.setIndex(fica);
  }
  if (!rotor.children.length) return;
  // o eixo de verdade é o meio das pontas das pás (o x/z da tabela é só um chute): recentra tudo nele, senão gira torto
  const bb = new THREE.Box3(); for (const pa of rotor.children) { pa.geometry.computeBoundingBox(); bb.union(pa.geometry.boundingBox); }
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, raio = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2, y = (bb.min.y + bb.max.y) / 2;
  for (const pa of rotor.children) { pa.geometry.translate(-cx, 0, -cz); pa.geometry.computeBoundingSphere(); }
  rotor.position.x += cx; rotor.position.z += cz;
  montarBorrao(rotor, raio, y);
  base.add(rotor);
}
// como no primeiro helicóptero: parado/devagar aparecem as pás do modelo; girando rápido elas somem e entra o
// "borrão" (disco translúcido + duas pás apagadas), que não pisca como pá de verdade girando na tela
function montarBorrao(rotor, raio, y) {
  const reais = new THREE.Group(); reais.name = 'pasReais'; reais.add(...rotor.children); rotor.add(reais);
  const borrao = new THREE.Group(); borrao.name = 'borrao'; borrao.position.y = y; borrao.visible = false;
  const disco = new THREE.Mesh(new THREE.CircleGeometry(raio, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#222', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  borrao.add(disco); borrao.userData.t = 0;
  // parou de girar (ninguém chamou rotorRapido há um tempo): volta a mostrar as pás do modelo. Usa "this" porque cada
  // clone copia esta função, e precisa mexer nos nós do próprio clone
  disco.onBeforeRender = function () { const b = this.parent; if (performance.now() - b.userData.t > 400) { b.visible = false; const r = b.parent?.getObjectByName('pasReais'); if (r) r.visible = true; } };
  for (const a of [0, Math.PI / 2]) { const pa = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, raio * 2), new THREE.MeshBasicMaterial({ color: '#333', transparent: true, opacity: 0.45, depthWrite: false })); pa.rotation.y = a; borrao.add(pa); }
  rotor.add(borrao);
}
// troca pás do modelo <-> borrão pela velocidade do giro (cada clone tem os seus nós; vale para jogador, remotos e NPCs)
const _giroRotor = new WeakMap();
export function rotorRapido(ro, rapido) {
  let n = _giroRotor.get(ro);
  if (!n) {
    // modelo que já veio com o nó "rotor" pronto (helicóptero do Exército): monta o borrão nele na primeira vez
    if (!ro.getObjectByName('pasReais') && ro.isMesh && ro.geometry) {
      // o nó do rotor é a própria malha: as pás viram uma cópia filha e o nó fica invisível (só leva os filhos)
      const pas = new THREE.Mesh(ro.geometry, ro.material); pas.castShadow = true; ro.add(pas);
      ro.material = new THREE.MeshBasicMaterial({ visible: false });
    }
    if (!ro.getObjectByName('pasReais') && ro.children.length) {
      const bb = new THREE.Box3(); ro.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(ro.matrixWorld).invert();
      ro.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
      if (!bb.isEmpty()) montarBorrao(ro, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2, (bb.min.y + bb.max.y) / 2);
    }
    n = { r: ro.getObjectByName('pasReais'), b: ro.getObjectByName('borrao') }; _giroRotor.set(ro, n);
  }
  if (n.r) n.r.visible = !rapido; if (n.b) { n.b.visible = rapido; if (rapido) n.b.userData.t = performance.now(); }
}
// helicóptero dos bombeiros: a bolsa de água pendurada embaixo (abaixo dos esquis) vira um nó "balde" que some no
// pouso; o modelo desce para os esquis ficarem no chão (antes a bolsa era o "pé" e ele pousava em cima dela)
const BALDE = { helicoptero_bombeiros: { y: 1.05, x: 0.8, desce: 1.05 } };
function separarBalde(base, B) {
  if (!B || base.userData.baldeFeito) return; base.userData.baldeFeito = true;
  base.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(base.matrixWorld).invert(), v = new THREE.Vector3(), m = new THREE.Matrix4();
  const balde = new THREE.Group(); balde.name = 'balde';
  const malhas = []; base.traverse((o) => { if (o.isMesh && o.geometry?.index && o.parent?.name !== 'rotor') malhas.push(o); });
  for (const o of malhas) {
    const geo = o.geometry, pos = geo.attributes.position, idx = geo.index, fica = [], tira = []; m.multiplyMatrices(inv, o.matrixWorld);
    const ok = (i) => { v.fromBufferAttribute(pos, i).applyMatrix4(m); return v.y < B.y && Math.abs(v.x) < B.x; };
    for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); (ok(a) && ok(b) && ok(c) ? tira : fica).push(a, b, c); }
    if (!tira.length) continue;
    const gb = new THREE.BufferGeometry(); for (const k of Object.keys(geo.attributes)) gb.setAttribute(k, geo.attributes[k]); gb.setIndex(tira);
    const mb = new THREE.Mesh(gb, o.material); mb.castShadow = true; mb.matrixAutoUpdate = false; mb.matrix.copy(m); balde.add(mb);
    geo.setIndex(fica);
  }
  base.add(balde);
  for (const c of base.children) c.position.y -= B.desce;
}
// hélices dos aviões (18w): as pás saem do modelo para um grupo "helice" que gira no eixo do motor (z, para a frente).
// x, y, z: centro do cubo; r: raio das pás; dz: meia espessura do disco (medidos no modelo, em metros do GLB).
const HELICES = {
  aviao_pequeno: [{ x: 0, y: 1.53, z: 4.31, r: 1.15, dz: 0.23 }],
  aviao_medio: [{ x: -3.38, y: 3.78, z: 3.95, r: 1.3, dz: 0.4 }, { x: 3.38, y: 3.78, z: 3.95, r: 1.3, dz: 0.4 }],
};
function separarHelices(base, lista) {
  if (!lista || base.userData.helices) return; base.userData.helices = true;
  base.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(base.matrixWorld).invert();
  const malhas = []; base.traverse((o) => { if (o.isMesh && o.geometry?.index) malhas.push(o); });
  const v = new THREE.Vector3(), m = new THREE.Matrix4();
  for (const H of lista) {
    const grupo = new THREE.Group(); grupo.name = 'helice';
    for (const o of malhas) {
      const geo = o.geometry, pos = geo.attributes.position, uv = geo.attributes.uv, nor = geo.attributes.normal, idx = geo.index, fica = [], P = [], U = [], N = [];
      m.multiplyMatrices(inv, o.matrixWorld); const mn = new THREE.Matrix3().getNormalMatrix(m);
      for (let t = 0; t < idx.count; t += 3) {
        const ids = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)], pa = ids.map((i) => v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
        if (pa.every((q) => Math.abs(q.z - H.z) < H.dz && Math.hypot(q.x - H.x, q.y - H.y) < H.r)) {
          for (let k = 0; k < 3; k++) { P.push(pa[k].x, pa[k].y, pa[k].z); if (uv) U.push(uv.getX(ids[k]), uv.getY(ids[k])); if (nor) { v.fromBufferAttribute(nor, ids[k]).applyMatrix3(mn).normalize(); N.push(v.x, v.y, v.z); } }
        } else fica.push(...ids);
      }
      if (!P.length) continue;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      if (U.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      if (N.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); else g.computeVertexNormals();
      grupo.add(new THREE.Mesh(g, o.material)); geo.setIndex(fica);
    }
    if (!grupo.children.length) continue;
    const cx = H.x, cy = H.y;   // eixo: o centro do cone (spinner), medido no modelo
    for (const pa of grupo.children) { pa.geometry.translate(-cx, -cy, 0); pa.geometry.computeBoundingSphere(); }
    grupo.position.set(cx, cy, 0); base.add(grupo);
    // disco borrado: aparece com a hélice rápida (as pás somem num vulto)
    const disco = new THREE.Mesh(new THREE.CircleGeometry(H.r * 0.92, 28), new THREE.MeshBasicMaterial({ color: '#555', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    disco.name = 'discoHelice'; disco.position.set(cx, cy, H.z); disco.visible = false; base.add(disco);
  }
}
// rotor de cauda (19h): as pás saem do modelo para um grupo "rotorCauda" que gira no eixo x (de lado).
// x: plano do rotor; y, z: centro do cubo; r: raio; dx: meia espessura (medidos no modelo, em metros do GLB).
const CAUDA = { helicoptero_exercito: { x: -0.6, y: 4.19, z: -6.316, r: 1.25, dx: 0.2 } };
function separarCauda(base, C) {
  if (!C || base.userData.cauda) return; base.userData.cauda = true;
  base.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(base.matrixWorld).invert();
  const malhas = []; base.traverse((o) => { if (o.isMesh && o.geometry?.index) malhas.push(o); });
  const v = new THREE.Vector3(), m = new THREE.Matrix4(), grupo = new THREE.Group(); grupo.name = 'rotorCauda';
  for (const o of malhas) {
    const geo = o.geometry, pos = geo.attributes.position, uv = geo.attributes.uv, nor = geo.attributes.normal, idx = geo.index, fica = [], P = [], U = [], N = [];
    m.multiplyMatrices(inv, o.matrixWorld); const mn = new THREE.Matrix3().getNormalMatrix(m);
    for (let t = 0; t < idx.count; t += 3) {
      const ids = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)], pa = ids.map((i) => v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
      if (pa.every((q) => Math.abs(q.x - C.x) < C.dx && Math.hypot(q.y - C.y, q.z - C.z) < C.r)) {
        for (let k = 0; k < 3; k++) { P.push(pa[k].x, pa[k].y - C.y, pa[k].z - C.z); if (uv) U.push(uv.getX(ids[k]), uv.getY(ids[k])); if (nor) { v.fromBufferAttribute(nor, ids[k]).applyMatrix3(mn).normalize(); N.push(v.x, v.y, v.z); } }
      } else fica.push(...ids);
    }
    if (!P.length) continue;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (U.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    if (N.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); else g.computeVertexNormals();
    g.computeBoundingSphere(); grupo.add(new THREE.Mesh(g, o.material)); geo.setIndex(fica);
  }
  if (grupo.children.length) { grupo.position.set(0, C.y, C.z); base.add(grupo); }
}
// gira o rotor de cauda junto com o principal (bem mais rápido); "vel" é a velocidade do rotor principal
export function girarCauda(o, dt, vel) {
  const c = o.userData.rotorCauda !== undefined ? o.userData.rotorCauda : (o.userData.rotorCauda = o.getObjectByName('rotorCauda') || null);
  if (c) c.rotation.x += dt * vel * 2.6;
}
export function girarHelices(o, dt, ligado) {
  const l = o.userData.listaHelices ||= (() => { const r = []; o.traverse((x) => { if (x.name === 'helice') r.push(x); }); return r; })();
  const u = o.userData; u.giroHelice = THREE.MathUtils.lerp(u.giroHelice || 0, ligado ? 45 : 0, Math.min(1, dt * (ligado ? 1.2 : 0.6)));
  for (const h of l) h.rotation.z += u.giroHelice * dt;
  const d = u.discosHelice ||= (() => { const r = []; o.traverse((x) => { if (x.name === 'discoHelice') r.push(x); }); return r; })();
  const op = THREE.MathUtils.clamp((u.giroHelice - 20) / 25, 0, 1) * 0.28;
  for (const x of d) { x.visible = op > 0.01; x.material.opacity = op; }
}
function heliDeServico(modelo, vaga, cor) {
  const proprio = ctx.modelo?.(modelo); if (proprio) { GLB_CARRO[modelo] = modelo; SEM_TINTA.add(modelo); separarRotor(proprio, ROTOR[modelo]); separarBalde(proprio, BALDE[modelo]); }
  if (!ctx.modelo?.(GLB_CARRO[modelo])) return null;
  vaga.y += 0.12;   // os esquis em cima da laje (o raio pega a pintura do H)
  const m = modeloCarro(modelo, cor); m.position.set(vaga.x, vaga.y, vaga.z); m.rotation.y = vaga.ang; ctx.scene.add(m);
  const bd = m.getObjectByName('balde'); if (bd) bd.visible = false;   // pousado: sem a bolsa
  return m;
}
// altura da laje embaixo de (x, z) num grupo recém-montado (raio de cima para baixo)
function lajeEm(g, x, z, padrao) {
  g.updateMatrixWorld(true); const rc = new THREE.Raycaster(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0));
  const h = rc.intersectObject(g, true)[0]; return h ? h.point.y : padrao;
}
// hospital do Meshy (predio_hospital.glb): frente para a rua de baixo (-z), heliponto no teto com o helicóptero de resgate
function montarHospitalGLB(glb) {
  const X = -135, Z = 143, LARG = 27;
  const g = new THREE.Group(); g.position.set(X, 0.18, Z); g.rotation.y = Math.PI;   // o modelo veio com a frente para +z
  const m = glb.clone(true); g.add(m); m.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(m), tam = bb.getSize(new THREE.Vector3()), k = LARG / Math.max(tam.x, tam.z);
  m.scale.setScalar(k); m.position.set(-(bb.min.x + bb.max.x) / 2 * k, -bb.min.y * k, -(bb.min.z + bb.max.z) / 2 * k);
  m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.semUltra = true; } });   // fora do "prédio ultra": neste modelo as janelas acesas viravam triângulos e o vidro-espelho escurecia a fachada
  ctx.scene.add(g); g.updateMatrixWorld(true);
  const prof = tam.z * k, alto = tam.y * k;
  ctx.colisores.push({ tipo: 'caixa', x0: X - LARG / 2 + 2, x1: X + LARG / 2 - 2, z0: Z - prof / 2 + 3.5, z1: Z + prof / 2 - 1 });
  const t = ctx.textoSprite('✚ HOSPITAL', { escala: 1.3, fundo: 'rgba(200,30,30,.92)' }); t.position.set(X, alto + 4, Z - prof / 2 + 2); ctx.scene.add(t);
  HOSPITAL.veiculo = veiculoDeServico('ambulancia', HOSPITAL.vaga);
  const hx = X + 1, hz = Z + 3.5, hy = lajeEm(g, hx, hz, alto);   // no H do heliponto (medido no modelo)
  HOSPITAL.heliVaga = { x: hx, y: hy, z: hz, ang: Math.PI };
  HOSPITAL.heli = heliDeServico('helicoptero_resgate', HOSPITAL.heliVaga, '#ffffff');
  // entra direto pela porta do prédio (sem a barraquinha); a praça de concreto do modelo é chão (não afunda)
  Object.assign(HOSPITAL.balcao, { x: X, z: Z - prof / 2 });
  Object.assign(HOSPITAL.saida, { x: X - 3, z: Z - prof / 2 - 1.5 });
  ctx.addPiso?.({ x0: X - LARG / 2 + 1, x1: X + LARG / 2 - 1, z0: Z - prof / 2 + 0.5, z1: Z + prof / 2 - 0.5, h: 0.6 });
  montarAlmoxarifado();
}
export function montarHospital() {
  { const glb = ctx.modelo?.('predio_hospital'); if (glb) { montarHospitalGLB(glb); return; } }
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
  HOSPITAL.heliVaga = { x: HOSPITAL.x + 8, y: 18.5, z: HOSPITAL.z + 6, ang: Math.PI };
  HOSPITAL.heli = heliDeServico('helicoptero_resgate', HOSPITAL.heliVaga, '#ffffff');
  ctx.scene.add(g); ctx.janelas.push(vidro);
  const t = ctx.textoSprite('✚ HOSPITAL', { escala: 1.3, fundo: 'rgba(200,30,30,.92)' }); t.position.set(HOSPITAL.x, 21, HOSPITAL.z - 2); ctx.scene.add(t);
  ctx.colisores.push({ tipo: 'caixa', x0: HOSPITAL.x - 15, x1: HOSPITAL.x + 15, z0: HOSPITAL.z - 3.2, z1: HOSPITAL.z + 13 });
  ctx.balcao(HOSPITAL.balcao.x, HOSPITAL.balcao.z, '#d62828', 'Hospital', 'Tratamento e plantão médico');
  montarAlmoxarifado();
}
function montarAlmoxarifado() {
  const A = ALMOX, g = new THREE.Group(); g.position.set(0, 0.18, 0);
  const parede = mat('#e8ecee', { roughness: 0.6 }), faixa = mat('#3a87c8'), piso = mat('#b9c2c8', { roughness: 0.8 });
  const cx = (A.x0 + A.x1) / 2, cz = (A.z0 + A.z1) / 2, L = A.x1 - A.x0, P = A.z1 - A.z0, H = 3.4, e = 0.22, porta = 1.9;
  bloco(g, piso, L, 0.06, P, cx, 0.03, cz);
  bloco(g, parede, L, H, e, cx, H / 2, A.z1 - e / 2);                       // fundo
  bloco(g, parede, e, H, P, A.x0 + e / 2, H / 2, cz);                       // lados
  bloco(g, parede, e, H, P, A.x1 - e / 2, H / 2, cz);
  const lado = (L - porta) / 2;                                              // frente com a porta no meio
  bloco(g, parede, lado, H, e, A.x0 + lado / 2, H / 2, A.z0 + e / 2);
  bloco(g, parede, lado, H, e, A.x1 - lado / 2, H / 2, A.z0 + e / 2);
  bloco(g, parede, porta, H - 2.4, e, cx, 2.4 + (H - 2.4) / 2, A.z0 + e / 2);
  bloco(g, faixa, L + 0.2, 0.3, P + 0.2, cx, H + 0.15, cz);                  // laje com faixa azul
  bloco(g, mat('#d62828', { emissive: '#d62828', emissiveIntensity: 0.5 }), 1.6, 0.5, 0.06, cx, 2.85, A.z0 - 0.04);
  // prateleiras com caixas de remédio
  const metal = mat('#8d969e', { metalness: 0.6, roughness: 0.4 }), cores = ['#ffffff', '#f2c230', '#5fb3e8', '#e25555'];
  for (let k = 0; k < 4; k++) bloco(g, metal, L - 1, 0.06, 0.6, cx, 0.4 + k * 0.55, A.z1 - 0.6);
  for (const sx of [A.x0 + 0.55, A.x1 - 0.55]) bloco(g, metal, 0.06, 2.1, 0.6, sx, 1.05, A.z1 - 0.6);
  for (let k = 0; k < 4; k++) for (let i = 0; i < 7; i++) bloco(g, mat(cores[(i + k) % 4]), 0.36, 0.3, 0.4, A.x0 + 0.95 + i * 0.52, 0.58 + k * 0.55, A.z1 - 0.6);
  bloco(g, mat('#7a5a3a'), 0.8, 0.9, 1.6, A.x0 + 0.65, 0.45, A.z0 + 3.2);   // bancada lateral
  ctx.scene.add(g);
  const t = ctx.textoSprite('🔒 ALMOXARIFADO · só funcionários', { escala: 0.6, fundo: 'rgba(200,30,30,.92)' }); t.position.set(cx, H + 1.1, A.z0); ctx.scene.add(t);
  const lad = (L - porta) / 2;
  ctx.colisores.push({ tipo: 'caixa', x0: A.x0, x1: A.x1, z0: A.z1 - e - 1, z1: A.z1 });                 // fundo + prateleira
  ctx.colisores.push({ tipo: 'caixa', x0: A.x0, x1: A.x0 + e, z0: A.z0, z1: A.z1 });
  ctx.colisores.push({ tipo: 'caixa', x0: A.x1 - e, x1: A.x1, z0: A.z0, z1: A.z1 });
  ctx.colisores.push({ tipo: 'caixa', x0: A.x0, x1: A.x0 + lad, z0: A.z0, z1: A.z0 + e });
  ctx.colisores.push({ tipo: 'caixa', x0: A.x1 - lad, x1: A.x1, z0: A.z0, z1: A.z0 + e });
}
export function dentroDoAlmox(x, z) { return x > ALMOX.x0 + 0.2 && x < ALMOX.x1 - 0.2 && z > ALMOX.z0 + 0.25 && z < ALMOX.z1; }

// quartel dos bombeiros: tijolo vermelho, três portões, torre de treino e caminhão (frente para -Z)
// quartel do Meshy (predio_bombeiros.glb): portões para a rua de baixo (-z), heliponto na laje com o helicóptero
function montarBombeirosGLB(glb) {
  const X = -81, Z = 139.5, LARG = 36;
  const g = new THREE.Group(); g.position.set(X, 0.18, Z); g.rotation.y = Math.PI / 2;   // o modelo veio com a frente para +x
  const m = glb.clone(true); g.add(m); m.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(m), tam = bb.getSize(new THREE.Vector3()), k = LARG / Math.max(tam.x, tam.z);
  m.scale.setScalar(k); m.position.set(-(bb.min.x + bb.max.x) / 2 * k, -bb.min.y * k, -(bb.min.z + bb.max.z) / 2 * k);
  m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  ctx.scene.add(g); g.updateMatrixWorld(true);
  const prof = tam.x * k, alto = tam.y * k;   // depois de girar: a largura é o z do modelo e a profundidade o x
  ctx.colisores.push({ tipo: 'caixa', x0: X - 13.2, x1: X + 15.6, z0: Z - 7.2, z1: Z + 8.4 });   // só o prédio (a base de concreto em volta é chão)
  const t = ctx.textoSprite('🚒 BOMBEIROS', { escala: 1.2, fundo: 'rgba(170,30,20,.92)' }); t.position.set(X, alto + 3, Z - prof / 2 + 3); ctx.scene.add(t);
  BOMBEIROS.veiculo = veiculoDeServico('bombeiros', BOMBEIROS.vaga);
  const hx = X + BOMBEIROS_H.dx, hz = Z + BOMBEIROS_H.dz, hy = lajeEm(g, hx, hz, alto);
  BOMBEIROS.heliVaga = { x: hx, y: hy, z: hz, ang: Math.PI };
  BOMBEIROS.heli = heliDeServico('helicoptero_bombeiros', BOMBEIROS.heliVaga, '#d62020');
  // entra direto pela porta do quartel (sem a barraquinha); a base de concreto do modelo é chão (não afunda)
  Object.assign(BOMBEIROS.balcao, { x: X - 6, z: Z - 7.2 - 2.4 });
  ctx.addPiso?.({ x0: X - LARG / 2 + 1, x1: X + LARG / 2 - 1, z0: Z - prof / 2 + 0.6, z1: Z + prof / 2 - 0.6, h: 0.79 });
}
const BOMBEIROS_H = { dx: 1.2, dz: -0.6 };   // H do heliponto em relação ao centro do quartel (medido no modelo)
export function montarBombeiros() {
  { const glb = ctx.modelo?.('predio_bombeiros'); if (glb) { montarBombeirosGLB(glb); return; } }
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
  BOMBEIROS.heliVaga = { x: BOMBEIROS.x + 2, y: 8.7, z: BOMBEIROS.z + 5, ang: Math.PI };   // na laje do quartel
  BOMBEIROS.heli = heliDeServico('helicoptero_bombeiros', BOMBEIROS.heliVaga, '#d62020');
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
// o veículo tem arquivo 3D carregado? (os que perderam o arquivo viravam o "modelo do sistema" no teste do admin)
export function temModelo(id) { const g = GLB_CARRO[id]; return !g || !!ctx.modelo?.(g); }
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

// tira do modelo os triângulos com os 3 vértices dentro de uma região (coordenadas do modelo inteiro);
// a geometria é compartilhada pelas cópias, então isso é feito uma vez só por modelo
// corta numa CÓPIA da geometria (guardada por modelo): antes cortava a geometria original do GLB, compartilhada com os
// carros estacionados, que ficavam sem roda quando eram montados depois do primeiro carro de verdade
const geoCortada = new WeakMap();
export function removerTriangulos(g, dentro, marca) {
  g.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), v = new THREE.Vector3(), m = new THREE.Matrix4();
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry?.index || o.geometry.userData[marca]) return;
    const pronta = geoCortada.get(o.geometry)?.[marca]; if (pronta) { o.geometry = pronta; return; }
    const orig = o.geometry, geo = orig.clone(), pos = geo.attributes.position, idx = geo.index, fica = [];
    geo.userData = { ...orig.userData };
    if (!geoCortada.has(orig)) geoCortada.set(orig, {}); geoCortada.get(orig)[marca] = geo; o.geometry = geo;
    m.multiplyMatrices(inv, o.matrixWorld);
    const ok = new Uint8Array(pos.count); for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); ok[i] = dentro(v.x, v.y, v.z) ? 1 : 0; }
    for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (!(ok[a] && ok[b] && ok[c])) fica.push(a, b, c); }
    geo.setIndex(fica); geo.userData[marca] = true;
  });
}
// para-brisas com a textura manchada (pontos brancos): os triângulos da frente nessa faixa viram um vidro escuro e
// limpo (medido em cada modelo: altura y, z a partir de onde é frente, meia largura hx)
const PARA_BRISA = {
  onibus_grande: { y: [1.4, 2.8], z: 4.6, hx: 1.31 }, onibus_urbano: { y: [1.12, 3.0], z: 5.1, hx: 1.26 },
  onibus_executivo: { y: [1.3, 3.5], z: 5.1, hx: 1.26 },
  onibus_pequeno: { y: [1.75, 2.75], z: 2.6, hx: 1.16 },
  // caminhao_lixo: modelo novo (16r) ainda sem medida
};
let matVidro = null;
function paraBrisaLimpo(g, glb) {
  const R = PARA_BRISA[glb]; if (!R) return;
  matVidro ||= new THREE.MeshStandardMaterial({ color: '#17222b', metalness: 0.65, roughness: 0.14 });
  g.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), m = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const malhas = []; g.traverse((o) => { if (o.isMesh && o.geometry?.index && !o.userData.vidro) malhas.push(o); });
  for (const o of malhas) {
    const geo = o.geometry;
    if (!geo.userData.paraBrisa) {   // a divisão é feita uma vez por modelo (a geometria é a mesma em todas as cópias)
      const pos = geo.attributes.position, idx = geo.index, fica = [], vidro = [];
      m.multiplyMatrices(inv, o.matrixWorld);
      for (let t = 0; t < idx.count; t += 3) {
        const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
        a.fromBufferAttribute(pos, i0).applyMatrix4(m); b.fromBufferAttribute(pos, i1).applyMatrix4(m); c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
        const cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3, cx = (a.x + b.x + c.x) / 3;
        const ok = n.z > 0.35 && cz > R.z && cy > R.y[0] && cy < R.y[1] && Math.abs(cx) < R.hx;
        (ok ? vidro : fica).push(i0, i1, i2);
      }
      geo.userData.paraBrisa = { vidro: null };
      if (vidro.length) {
        const gv = new THREE.BufferGeometry(); for (const k of Object.keys(geo.attributes)) gv.setAttribute(k, geo.attributes[k]); gv.setIndex(vidro);
        geo.userData.paraBrisa.vidro = gv; geo.setIndex(fica);
      }
    }
    const gv = geo.userData.paraBrisa.vidro;
    if (gv) { const mv = new THREE.Mesh(gv, matVidro); mv.userData.vidro = true; mv.castShadow = o.castShadow; o.add(mv); }
  }
}
// vidros do carro inteiros (para-brisa, laterais e traseiro): no modelo eles saíram brancos/cinza manchados; viram
// vidro escuro. Faixa medida no modelo já no tamanho do jogo (frente +z, chão em 0): y entre a linha da cintura e o
// teto, e só as faces "em pé" (o teto continua da cor do carro)
const VIDROS = {
  caminhao_bombeiros: { y: [1.5, 2.32], ny: 0.6, z: [2.9, 4.4] },   // cabine (modelo novo 16r)
  caminhao_lixo: { y: [1.85, 2.78], ny: 0.6, z: [3.0, 4.4] },
  helicoptero_resgate: { y: [1.65, 2.75], ny: 0.75, z: [3.9, 6.5], bico: true },   // bico: só o que olha para a frente ou para o lado (o teto da cabine fica)
  helicoptero_bombeiros: { y: [2.2, 3.3], ny: 0.75, z: [3.6, 6.5], bico: true },
  viatura_pm: { y: [0.86, 1.3], ny: 0.8, z: [-1.75, 1.45], inclinado: { y: [0.95, 1.28], z: [-0.8, 0.38] } } };   // inclinado: para-brisa e vidro de trás (fora do teto, z entre -0.8 e 0.38)
function vidrosEscuros(g, R) {
  matVidro ||= new THREE.MeshStandardMaterial({ color: '#17222b', metalness: 0.65, roughness: 0.14 });
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), m = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const malhas = []; g.traverse((o) => { if (o.isMesh && o.geometry?.index && !o.userData.vidro) malhas.push(o); });
  for (const o of malhas) {
    const geo = o.geometry;
    if (!geo.userData.vidros) {   // uma vez por modelo (todas as cópias usam a mesma geometria)
      const pos = geo.attributes.position, idx = geo.index, fica = [], vidro = [];
      m.multiplyMatrices(inv, o.matrixWorld);
      for (let t = 0; t < idx.count; t += 3) {
        const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
        a.fromBufferAttribute(pos, i0).applyMatrix4(m); b.fromBufferAttribute(pos, i1).applyMatrix4(m); c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
        const cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
        const I = R.inclinado;
        const ok = (cy > R.y[0] && cy < R.y[1] && Math.abs(n.y) < R.ny && cz > R.z[0] && cz < R.z[1] && (!R.bico || n.z > 0.3 || Math.abs(n.x) > 0.8))
          || (I && n.y >= R.ny && n.y < 0.995 && cy > I.y[0] && cy < I.y[1] && (cz < I.z[0] || cz > I.z[1]) && cz > R.z[0] - 0.2 && cz < R.z[1] + 0.2);
        (ok ? vidro : fica).push(i0, i1, i2);
      }
      geo.userData.vidros = { vidro: null };
      if (vidro.length) {
        const gv = new THREE.BufferGeometry(); for (const k of Object.keys(geo.attributes)) gv.setAttribute(k, geo.attributes[k]); gv.setIndex(vidro);
        geo.userData.vidros.vidro = gv; geo.setIndex(fica);
      }
    }
    const gv = geo.userData.vidros.vidro;
    if (gv) { const mv = new THREE.Mesh(gv, matVidro); mv.userData.vidro = true; mv.castShadow = o.castShadow; o.add(mv); }
  }
}
// jipe: os vidros do para-brisa são opacos no modelo e tapavam a vista do motorista; fica só a moldura
const VIDRO_JIPE = (x, y, z) => Math.abs(x) > 0.055 && Math.abs(x) < 0.8 && y > 1.5 && y < 2.01 && z > 0.35 && z < 0.95;
// rodas que giram: posição de cada eixo medida no modelo (z, raio), altura do centro (cy) e as faces de fora/dentro
// da roda (xo/xi, lado esquerdo; o direito é espelhado). A roda original do modelo é apagada dentro desse cilindro.
export const RODAS = {
  carro_classico: { estilo: 'classico', eixos: [[-1.38, 0.35], [1.57, 0.35]], cy: 0.36, xo: 0.95, xi: 0.64 },
  carro_popular: { estilo: 'carro', eixos: [[-1.22, 0.345], [1.17, 0.345]], cy: 0.35, xo: 0.87, xi: 0.6 },
  carro_suv: { estilo: 'suv', eixos: [[-1.33, 0.42], [1.47, 0.42]], cy: 0.42, xo: 0.99, xi: 0.71 },
  carro_esportivo: { estilo: 'esporte', eixos: [[-1.19, 0.36], [1.31, 0.36]], cy: 0.36, xo: 1.0, xi: 0.71 },
  carro_presidencial: { estilo: 'carro', eixos: [[-1.85, 0.44], [2.12, 0.44]], cy: 0.44, xo: 1.23, xi: 0.85 },
  exercito_jipe: { estilo: 'militar', eixos: [[-1.08, 0.46], [1.34, 0.46]], cy: 0.45, xo: 0.97, xi: 0.59 },
  ambulancia: { estilo: 'suv', eixos: [[-1.34, 0.38], [1.88, 0.38]], cy: 0.38, xo: 0.96, xi: 0.7 },   // nova (16aj): van tipo Sprinter do SAMU
  caminhao_bombeiros: { estilo: 'pesado', eixos: [[-2.4, 0.58], [-1.3, 0.58], [2.45, 0.58]], cy: 0.58, xo: 1.33, xi: 0.86 },   // modelo novo (16r): eixo duplo atrás
  caminhao: { estilo: 'pesado', eixos: [[-3.0, 0.5], [-1.75, 0.5], [2.8, 0.5]], cy: 0.5, xo: 1.09, xi: 0.74 },   // modelo novo (16bd): baú branco liso, eixo duplo atrás
  caminhao_lixo: { estilo: 'pesado', eixos: [[-1.6, 0.56], [-0.4, 0.56], [2.8, 0.56]], cy: 0.56, xo: 1.56, xi: 1.0 },   // modelo novo (16r): eixo duplo atrás
  exercito_caminhao: { estilo: 'militar', eixos: [[-2.15, 0.55], [-1.0, 0.55], [2.45, 0.55]], cy: 0.53, xo: 1.29, xi: 0.95 },
  onibus_grande: { estilo: 'pesado', eixos: [[-2.55, 0.53], [3.3, 0.53]], cy: 0.52, xo: 1.2, xi: 0.85 },
  onibus_urbano: { estilo: 'pesado', eixos: [[-2.7, 0.52], [3.7, 0.52]], cy: 0.53, xo: 1.27, xi: 0.78 },
  onibus_executivo: { estilo: 'pesado', eixos: [[-2.42, 0.53], [3.3, 0.53]], cy: 0.53, xo: 1.17, xi: 0.78 },
  onibus_executivo2: { estilo: 'pesado', eixos: [[-3.47, 0.55], [-2.13, 0.55], [4.3, 0.56]], cy: 0.56, xo: 1.22, xi: 0.84 },
  onibus_dois_andares: { estilo: 'pesado', eixos: [[-4.13, 0.47], [-2.78, 0.47], [3.03, 0.47], [4.36, 0.47]], cy: 0.47, xo: 1.23, xi: 0.84 },
  onibus_apache: { estilo: 'pesado', eixos: [[-2.13, 0.56], [3.37, 0.56]], cy: 0.57, xo: 1.22, xi: 0.84 },
  onibus_busscar: { estilo: 'pesado', eixos: [[-2.27, 0.5], [3.16, 0.5]], cy: 0.51, xo: 1.2, xi: 0.84 },
  onibus_articulado: { estilo: 'pesado', eixos: [[-5.25, 0.52], [-3.9, 0.52], [1.8, 0.52], [6.6, 0.52]], cy: 0.53, xo: 1.23, xi: 0.84 },
  // ônibus novos (medidos já girados e no tamanho do jogo)
  onibus_amarelo: { estilo: 'pesado', eixos: [[-1.7, 0.52], [3.25, 0.52]], cy: 0.52, xo: 1.28, xi: 0.86, corte: [1.22, 0.45, 0.25] },
  onibus_branco: { estilo: 'pesado', eixos: [[-2.0, 0.52], [3.3, 0.52]], cy: 0.52, xo: 1.28, xi: 0.86, corte: [1.22, 0.45, 0.25] },
  onibus_laranja: { estilo: 'pesado', eixos: [[-2.35, 0.52], [3.35, 0.52]], cy: 0.52, xo: 1.2, xi: 0.8, corte: [1.22, 0.45, 0.25] },
  onibus_brasilsul: { estilo: 'pesado', eixos: [[-3.9, 0.52], [-2.65, 0.52], [4.5, 0.52]], cy: 0.52, xo: 1.28, xi: 0.86, corte: [1.22, 0.45, 0.25] },
  onibus_viacao: { estilo: 'pesado', eixos: [[-4.0, 0.52], [-2.5, 0.52], [4.7, 0.52]], cy: 0.52, xo: 1.3, xi: 0.88, corte: [1.22, 0.45, 0.25] },
  // 20w: ônibus da Viação (rodoviários): medidos no tamanho do jogo — antes não tinham rodas que giram/viram nem a dinâmica dos outros
  onibus_rod_dourado: { estilo: 'pesado', eixos: [[-3.43, 0.5], [-2.14, 0.5], [4.47, 0.5]], cy: 0.5, xo: 1.3, xi: 0.88, corte: [1.22, 0.45, 0.25] },
  onibus_rod_amarelo: { estilo: 'pesado', eixos: [[-3.55, 0.5], [-2.11, 0.5], [4.34, 0.5]], cy: 0.5, xo: 1.3, xi: 0.88, corte: [1.22, 0.45, 0.25] },
  onibus_rod_vermelho: { estilo: 'pesado', eixos: [[-2.14, 0.48], [3.75, 0.48]], cy: 0.48, xo: 1.3, xi: 0.88, corte: [1.22, 0.45, 0.25] },
  onibus_rod_branco: { estilo: 'pesado', eixos: [[-1.9, 0.45], [3.39, 0.45]], cy: 0.45, xo: 1.25, xi: 0.85, corte: [1.22, 0.45, 0.25] },
  // carros novos (Meshy) das lojas e das polícias: medidos no tamanho do jogo (18l)
  saveiro: { estilo: 'carro', eixos: [[-1.22, 0.355], [1.43, 0.355]], cy: 0.36, xo: 0.93, xi: 0.62, corte: [1.1, 0.06, 0.08] },
  saveiro_som: { estilo: 'esporte', eixos: [[-1.24, 0.3], [1.41, 0.3]], cy: 0.3, xo: 0.92, xi: 0.6, corte: [1.12, 0.06, 0.08] },
  viatura_pm: { estilo: 'carro', eixos: [[-1.26, 0.31], [1.29, 0.31]], cy: 0.315, xo: 0.91, xi: 0.57, corte: [1.1, 0.06, 0.08] },
  viatura_civil: { estilo: 'suv', eixos: [[-1.35, 0.4], [1.4, 0.4]], cy: 0.4, xo: 1.0, xi: 0.6, corte: [1.1, 0.06, 0.08] },
  viatura_prf: { estilo: 'suv', eixos: [[-1.38, 0.42], [1.35, 0.42]], cy: 0.42, xo: 0.98, xi: 0.62, corte: [1.1, 0.06, 0.08] },
  caveirao: { estilo: 'militar', eixos: [[-2.09, 0.48], [-1.08, 0.48], [1.51, 0.48]], cy: 0.48, xo: 1.23, xi: 0.85, corte: [1.1, 0.06, 0.08] },
};
const LARG_RODA = { classico: 0.32, carro: 0.30, esporte: 0.32, suv: 0.36, pesado: 0.30, militar: 0.38 };
const comRodas = new Set();
// embaixo do veículo (para não ficar oco): assoalho, caixas de roda, motor/cárter, escapamento, tanque, eixos e diferencial
function geoChassi(nome, R, b) {
  const { estilo, eixos, cy, xo, xi } = R, r = Math.max(...eixos.map((e) => e[1])), s = r / 0.35, xin = xi - 0.03;
  const zs = eixos.map((e) => e[0]), zf = Math.max(...zs), zr = Math.min(...zs), alto = estilo === 'pesado' || estilo === 'militar', onibus = nome.startsWith('onibus');
  const fb = cy * (alto ? 1.1 : 0.72), ft = cy * (alto ? 1.6 : 1.25);
  const zmin = Math.max(b.min.z + 0.35, zr - r * (alto ? 2.2 : 1.25)), zmax = Math.min(b.max.z - 0.35, zf + r * (alto ? 1.6 : 1.25));
  const ESC = [0.07, 0.075, 0.08], MET = [0.2, 0.21, 0.23], FER = [0.13, 0.135, 0.14], PRETO = [0.05, 0.05, 0.055], lista = [];
  const add = (geo, cor) => { const n = geo.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(cor, i * 3); geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); if (geo.index) geo = geo.toNonIndexed(); geo.deleteAttribute('uv'); lista.push(geo); };
  const caixa = (w, h, d, x, y, z, cor) => add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), cor);
  caixa(2 * xin, ft - fb, zmax - zmin, 0, (fb + ft) / 2, (zmin + zmax) / 2, ESC);                       // assoalho
  for (const [z, rr] of eixos) for (const sg of [1, -1]) {
    const L = (xo - 0.04) - (xi - 0.02);
    add(new THREE.CylinderGeometry(rr * 1.09, rr * 1.09, L, 16, 1, true, -Math.PI * 0.62 + Math.PI / 2, Math.PI * 1.24).rotateZ(Math.PI / 2).translate(sg * ((xi - 0.02) + L / 2), cy, z), PRETO);   // caixa de roda
    add(new THREE.CircleGeometry(rr * 1.1, 16).rotateY(Math.PI / 2).translate(sg * (xi - 0.02), cy, z), PRETO);   // fundo da caixa de roda
  }
  if (alto) for (const [z, rr] of eixos) { add(new THREE.CylinderGeometry(rr * 0.09, rr * 0.09, 2 * xin, 8).rotateZ(Math.PI / 2).translate(0, cy, z), MET); caixa(0.32 * s, 0.26 * s, 0.32 * s, 0, cy, z, MET); }
  const ze = onibus ? zr - r * 2.2 : zf + r * 0.35;
  caixa(xin * 1.2, cy * 0.7, r * 1.5, 0, fb + cy * 0.35 + 0.01, ze, MET);                               // motor / cárter
  const z0 = onibus ? ze - r : zr - r * 1.2, z1 = onibus ? zmin + 0.2 : zf - r * 0.2;
  add(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, Math.abs(z1 - z0), 10).rotateX(Math.PI / 2).translate(-xin * 0.55, fb - 0.04 * s, (z0 + z1) / 2), FER);   // escapamento
  caixa(xin * 0.6, 0.1 * s, 0.45 * s, xin * 0.3, fb - 0.03 * s, onibus ? (zr + zf) / 2 : zr + r * 1.6, FER);   // tanque
  return mergeGeometries(lista);
}
let matChassi = null;
function montarRodas(g, nome) {
  const R = RODAS[nome], base = R && ctx?.modelo?.('roda_' + R.estilo); if (!base) return;
  const { eixos, cy, xo, xi } = R, W = LARG_RODA[R.estilo], zf = Math.max(...eixos.map((e) => e[0]));
  // corte: [raio (x o da roda), quanto entra para dentro (rodado duplo), quanto sai para fora]
  const [kr, dxi, dxo] = R.corte || [1.04, 0.03, 0.06];
  removerTriangulos(g, (x, y, z) => { const sx = Math.abs(x); if (sx < xi - dxi || sx > xo + dxo) return false; for (const [ez, r] of eixos) if (Math.hypot(y - cy, z - ez) < r * kr) return true; return false; }, 'semRodas');
  const b = new THREE.Box3().setFromObject(g);
  const grupo = new THREE.Group(); grupo.name = 'rodas'; g.add(grupo);
  matChassi ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.1, side: THREE.DoubleSide });
  const ch = new THREE.Mesh(geoChassi(nome, R, b), matChassi); ch.name = 'chassi'; grupo.add(ch);
  const tras = g.getObjectByName('traseira'); if (tras) ch.visible = false;   // articulado: o chassi inteiriço apareceria na curva
  for (const [z, r] of eixos) for (const sg of [1, -1]) {
    const piv = new THREE.Object3D(); piv.position.set(sg * (xo + xi) / 2, cy, z); piv.userData.dianteira = z === zf && eixos.length > 1; grupo.add(piv);
    if (tras && z < tras.position.z) { piv.userData.traseira = true; piv.userData.p0 = piv.position.clone(); }
    const rd = base.clone(true); rd.scale.set(sg * (xo - xi) / (2 * W), r, r); rd.userData.raio = r; piv.add(rd);
  }
}
// baú do caminhão novo: a textura gerada fica manchada de perto; as faces do baú viram um branco liso (e é nelas
// que vai a lona com a logo da empresa). A separação é feita uma vez e reaproveitada nos clones.
const geoBau = new WeakMap();
let matBau = null;
export function bauLiso(g) {
  matBau ||= new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  const dentro = (v) => Math.abs(v.x) < 1.2 && v.y > 1.13 && v.y < 3.5 && v.z < 1.79;
  g.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), m = new THREE.Matrix4(), a = new THREE.Vector3();
  const lista = []; g.traverse((o) => { if (o.isMesh && o.geometry?.index && !o.userData.bau && !o.geometry.userData.bauFeito) lista.push(o); });
  for (const o of lista) {
    let par = geoBau.get(o.geometry);
    if (!par) {
      const orig = o.geometry, pos = orig.attributes.position, idx = orig.index, fica = [], bau = [];
      m.multiplyMatrices(inv, o.matrixWorld);
      const ok = new Uint8Array(pos.count); for (let i = 0; i < pos.count; i++) ok[i] = dentro(a.fromBufferAttribute(pos, i).applyMatrix4(m)) ? 1 : 0;
      for (let t = 0; t < idx.count; t += 3) { const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2); (ok[i0] && ok[i1] && ok[i2] ? bau : fica).push(i0, i1, i2); }
      const gf = orig.clone(); gf.setIndex(fica); gf.userData = { ...orig.userData, bauFeito: true };
      const gb = new THREE.BufferGeometry(); for (const k of ['position', 'normal']) if (orig.attributes[k]) gb.setAttribute(k, orig.attributes[k]); gb.setIndex(bau);
      par = { gf, gb: bau.length ? gb : null }; geoBau.set(orig, par);
    }
    o.geometry = par.gf;
    if (par.gb) { const mb = new THREE.Mesh(par.gb, matBau); mb.userData.bau = true; mb.castShadow = true; mb.receiveShadow = true; mb.name = 'bau'; o.add(mb); }
  }
}
// traseira do baú: moldura, as duas portas com as trancas e as dobradiças, para-choque e lanternas
let trasBau = null;
function traseiraBau() {
  if (trasBau) return trasBau.clone();
  const g = new THREE.Group(); g.name = 'traseiraBau';
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.3, ...o });
  const escuro = M('#3a3d42'), metal = M('#9aa0a6', { metalness: 0.7, roughness: 0.35 }), preto = M('#141518', { roughness: 0.8 });
  const verm = new THREE.MeshStandardMaterial({ color: '#b3121b', emissive: '#ff1a1a', emissiveIntensity: 0.35, roughness: 0.3 });
  const ambar = new THREE.MeshStandardMaterial({ color: '#d98a12', emissive: '#ff9a1a', emissiveIntensity: 0.25, roughness: 0.3 });
  const branca = new THREE.MeshStandardMaterial({ color: '#e8e8e8', emissive: '#ffffff', emissiveIntensity: 0.1, roughness: 0.3 });
  const zb = -4.19, y0 = 1.15, y1 = 3.42, xb = 1.13;
  const box = (m, w, h, d, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  box(escuro, 2 * xb + 0.04, 0.09, 0.06, 0, y1 - 0.04, zb);          // moldura: em cima, embaixo e dos lados
  box(escuro, 2 * xb + 0.04, 0.12, 0.08, 0, y0 + 0.05, zb);
  for (const sx of [-1, 1]) box(escuro, 0.08, y1 - y0, 0.07, sx * (xb - 0.02), (y0 + y1) / 2, zb);
  box(preto, 0.025, y1 - y0 - 0.2, 0.02, 0, (y0 + y1) / 2, zb - 0.02);   // fresta entre as portas
  for (const x of [-0.82, -0.32, 0.32, 0.82]) {                        // trancas (barras verticais) com a alavanca
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, y1 - y0 - 0.25, 8), metal); b.position.set(x, (y0 + y1) / 2, zb - 0.05); g.add(b);
    for (const y of [y0 + 0.14, y1 - 0.14]) box(metal, 0.09, 0.06, 0.05, x, y, zb - 0.04);
    box(metal, 0.05, 0.04, 0.22, x + (x < 0 ? 0.07 : -0.07), (y0 + y1) / 2 - 0.25, zb - 0.1).rotation.y = x < 0 ? 0.5 : -0.5;
  }
  for (const sx of [-1, 1]) for (const y of [y0 + 0.4, (y0 + y1) / 2, y1 - 0.4]) box(metal, 0.16, 0.12, 0.05, sx * (xb - 0.1), y, zb - 0.04);   // dobradiças
  // para-choque (barra de proteção) e lanternas
  box(preto, 2.15, 0.14, 0.12, 0, 0.62, -4.12);
  for (const sx of [-1, 1]) box(preto, 0.08, 0.5, 0.08, sx * 0.7, 0.85, -4.08);
  for (const sx of [-1, 1]) {
    box(preto, 0.62, 0.22, 0.08, sx * 0.86, 0.98, -4.1);
    box(verm, 0.26, 0.15, 0.04, sx * 0.97, 0.98, -4.15);
    box(ambar, 0.13, 0.15, 0.04, sx * 0.76, 0.98, -4.15);
    box(branca, 0.1, 0.15, 0.04, sx * 0.63, 0.98, -4.15);
  }
  // para-brisa e janelas da cabine: vidro novo, com borda limpa, por cima da textura manchada (o para-brisa é curvo:
  // um arco de cilindro com o raio medido na frente da cabine)
  const vidro = new THREE.MeshStandardMaterial({ color: '#0d1620', roughness: 0.08, metalness: 0.75, side: THREE.DoubleSide });
  const R = 2.62, ab = Math.asin(1.0 / R);
  const pb = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.62, 24, 1, true, -ab, 2 * ab), vidro); pb.position.set(0, 2.43, 4.115 - R); pb.rotation.x = -0.06; g.add(pb);
  for (const sx of [-1, 1]) { const j = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.58), vidro); j.position.set(sx * 1.078, 2.38, 3.42); j.rotation.y = sx * Math.PI / 2; g.add(j); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  trasBau = g; return g.clone();
}
// caminhões das empresas (vêm do clone do modelo, sem pintura): troca as rodas do modelo pelas que giram e viram
export function veiculoComRodas(o, nome) {
  o.userData.glb = nome;
  if (nome === 'caminhao') { bauLiso(o); o.add(traseiraBau()); }
  try { montarRodas(o, nome); } catch (e) { console.warn('rodas:', nome, e); }
  if (o.getObjectByName('rodas')) comRodas.add(o);
  return o;
}
// gira as rodas pelo quanto cada veículo andou (serve para o seu, os NPCs e os outros jogadores) e vira as da frente
// distância do centro do modelo até o eixo da frente (zf) e até o de trás (zr); com dois eixos juntos, o meio deles.
// No articulado conta só a parte da frente (a de trás é um reboque, dobrada à parte).
// distância entre o eixo que vira e o eixo de trás (efetivo) de um modelo, sem precisar do objeto
export function entreEixos(modelo) {
  const R = RODAS[GLB_CARRO[modelo]] || RODAS[modelo]; if (!R || R.eixos.length < 2) return 2.7;
  const zs = R.eixos.map((a) => a[0]), meio = (Math.max(...zs) + Math.min(...zs)) / 2, media = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  const f = zs.filter((z) => z >= meio), t = zs.filter((z) => z < meio);
  return media(f) - (media(t) - (t.length > 1 ? 0.35 * (Math.max(...t) - Math.min(...t)) : 0));
}
export function eixosDe(o) {
  if (o.userData.eixos) return o.userData.eixos;
  let glb = null; o.traverse((k) => { glb ||= k.userData?.glb; });
  const R = RODAS[glb]; let e = { zf: 1.3, zr: -1.3 };
  if (R && R.eixos.length > 1) {
    const tras = o.getObjectByName('traseira'), zs = R.eixos.map((a) => a[0]).filter((z) => !tras || z > tras.position.z);
    const hi = Math.max(...zs), lo = Math.min(...zs), meio = (hi + lo) / 2, media = (l) => l.reduce((a, b) => a + b, 0) / l.length;
    const f = zs.filter((z) => z >= meio), t = zs.filter((z) => z < meio);
    // dois eixos atrás: os pneus arrastam de lado e resistem à curva, como se o eixo ficasse mais para trás do meio deles
    if (f.length && t.length) e = { zf: media(f), zr: media(t) - (t.length > 1 ? 0.35 * (Math.max(...t) - Math.min(...t)) : 0) };
  }
  const k = o.scale.z || 1; e = { zf: e.zf * k, zr: e.zr * k };
  o.userData.eixos = e; return e;
}

// nas curvas; de longe usa a roda simples e não gira
const _pR = new THREE.Vector3();
export function atualizarRodas(dt, cam) {
  for (const m of comRodas) {
    if (!m.parent) { comRodas.delete(m); continue; }
    const gr = m.userData.grupoRodas || (m.userData.grupoRodas = m.getObjectByName('rodas')); if (!gr) { comRodas.delete(m); continue; }
    m.getWorldPosition(_pR); const d = _pR.distanceTo(cam), perto = d < 45;
    if (gr.userData.perto !== perto) { gr.userData.perto = perto; gr.traverse((o) => { if (o.name === 'perto') o.visible = perto; else if (o.name === 'longe') o.visible = !perto; }); }
    const u = m.userData, ry = m.rotation.y;
    if (u.sanfona === undefined) { const tr = m.getObjectByName('traseira'); u.sanfona = tr ? { tr, sa: m.getObjectByName('sanfona') } : null; }
    if (u.sanfona) dobrarSanfona(m, u, gr);
    if (!u.ultR) { u.ultR = _pR.clone(); u.ultY = ry; continue; }
    const dx = _pR.x - u.ultR.x, dz = _pR.z - u.ultR.z; u.ultR.copy(_pR);
    const dyaw = Math.atan2(Math.sin(ry - u.ultY), Math.cos(ry - u.ultY)); u.ultY = ry;
    if (d > 120 || Math.hypot(dx, dz) > 6) continue;
    const anda = dx * Math.sin(ry) + dz * Math.cos(ry);
    // ângulo das rodas da frente pela geometria (bicicleta): giro = andou × tan(ângulo) / entre-eixos
    const ex = eixosDe(m), wb = Math.max(1.5, ex.zf - ex.zr);
    const alvo = Math.abs(anda) > 0.004 ? THREE.MathUtils.clamp(Math.atan(dyaw * wb / anda), -0.84, 0.84) : (u.esterco || 0);
    u.esterco = (u.esterco || 0) + (alvo - (u.esterco || 0)) * Math.min(1, dt * 8);
    for (const piv of gr.children) { if (piv.name === 'chassi') continue; const rd = piv.children[0]; if (rd) rd.rotation.x += anda / (rd.userData.raio || 0.4); if (piv.userData.dianteira) piv.rotation.y = u.esterco; }
  }
}
// articulado: a parte de trás é puxada pela junta (como um reboque) e dobra na sanfona; a sanfona gira a metade
const _jS = new THREE.Vector3();
function dobrarSanfona(m, u, gr) {
  const { tr, sa } = u.sanfona, J = tr.position.z, Lr = 4.6, ry = m.rotation.y, s = Math.sin(ry), c = Math.cos(ry);
  _jS.set(m.position.x + s * J, 0, m.position.z + c * J);   // junta no mundo
  let p = u.trasR;
  if (!p || Math.hypot(p.x - _jS.x, p.z - _jS.z) > Lr + 3) p = u.trasR = new THREE.Vector3(_jS.x - s * Lr, 0, _jS.z - c * Lr);
  let dx = _jS.x - p.x, dz = _jS.z - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  p.set(_jS.x - dx * Lr, 0, _jS.z - dz * Lr);
  const rel = THREE.MathUtils.clamp(Math.atan2(Math.sin(Math.atan2(dx, dz) - ry), Math.cos(Math.atan2(dx, dz) - ry)), -0.75, 0.75);
  tr.rotation.y = rel; if (sa) sa.rotation.y = rel / 2;
  const cr = Math.cos(rel), sr = Math.sin(rel);
  for (const piv of gr.children) if (piv.userData.traseira) {
    const q = piv.userData.p0, lx = q.x, lz = q.z - J;
    piv.position.set(lx * cr + lz * sr, q.y, J - lx * sr + lz * cr); piv.rotation.y = rel;
  }
}
// carros: frente em +Z, chão em y = 0
const cacheCarro = new Map();
export function modeloCarro(modelo, cor) { const o = modeloCarroBase(modelo, cor); if (o.getObjectByName('luzes')) comLuz.add(o); if (o.getObjectByName('rodas')) comRodas.add(o); return o; }
function modeloCarroBase(modelo, cor) {
  if (JATOS[modelo]) {   // caças: por código ou do GLB, sem pintura
    const glb = ctx?.modelo?.(modelo), k = modelo + (glb ? 1 : 0);
    if (!cacheCarro.has(k)) cacheCarro.set(k, criarJato(modelo, glb));
    return cacheCarro.get(k).clone();
  }
  if (modelo === 'ovni') {   // feito por código (ou casco do ovni.glb, se existir) e sem pintura
    const glb = ctx?.modelo?.('ovni'), k = 'ovni' + (glb ? 1 : 0);
    if (!cacheCarro.has(k)) cacheCarro.set(k, criarOvni(glb));
    return cacheCarro.get(k).clone();
  }
  const chave = modelo + cor;
  if (cacheCarro.has(chave)) return cacheCarro.get(chave).clone();
  // viatura da polícia: usa o modelo da viatura (o SUV laranja pintado de azul continuava laranja); se um dia vier o
  // viatura_pm.glb, ele entra no lugar
  if (modelo === 'viatura') { const qual = ctx?.modelo?.('viatura_pm') ? 'viatura_pm' : ctx?.modelo?.('viatura_civil') ? 'viatura_civil' : null;
    if (qual) { const o = veiculoGLBNovo(qual, cor); o.userData.modelo = 'viatura'; adicionarLuzes(o, 'viatura'); cacheCarro.set(chave, o); return o.clone(); } }
  const base = ctx?.modelo?.(GLB_CARRO[modelo]);
  if (base && HELICES[modelo]) separarHelices(base, HELICES[modelo]);
  if (base && CAUDA[modelo]) separarCauda(base, CAUDA[modelo]);
  if (base) {   // modelo 3D: pinta de leve com a cor escolhida (o presidencial fica como é)
    const g = base.clone(true); g.userData.glb = GLB_CARRO[modelo]; g.userData.modelo = modelo;
    if (modelo === 'militar') removerTriangulos(g, VIDRO_JIPE, 'semVidro');
    if (modelo === 'viatura') { g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color('#ffffff').lerp(new THREE.Color('#1c2a52'), 0.55); } }); sirene(g, [2.05, -0.2]); }
    else if (SEM_TINTA.has(modelo)) { const sr = { ambulancia: [2.56, 0.85], bombeiros: [2.45, 3.1] }[modelo]; if (sr) sirene(g, sr); }
    else if (REPINTA.has(modelo)) g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); repintar(o.material, cor); } });   // carro de jogador: troca a cor da lataria de verdade
    else g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color('#ffffff').lerp(new THREE.Color(cor), modelo.startsWith('onibus') ? 0.38 : modelo === 'caminhao_lixo' ? 0.12 : modelo === 'helicoptero_bombeiros' ? 0.9 : 0.45); } });
    try { paraBrisaLimpo(g, GLB_CARRO[modelo]); } catch (e) { console.warn('para-brisa:', modelo, e); }
    if (VIDROS[GLB_CARRO[modelo]]) { g.updateMatrixWorld(true); vidrosEscuros(g, VIDROS[GLB_CARRO[modelo]]); }
    if (GLB_CARRO[modelo] === 'caminhao') { bauLiso(g); g.add(traseiraBau()); }
    try { montarRodas(g, GLB_CARRO[modelo]); } catch (e) { console.warn('rodas:', modelo, e); }   // depois da pintura: as rodas e o chassi têm cor própria
    adicionarLuzes(g, modelo);
    cacheCarro.set(chave, g);
    return g.clone();
  }
  const g = new THREE.Group();
  const pint = mat(cor, { roughness: 0.25, metalness: 0.55 }), vidro = mat('#1b2633', { roughness: 0.1, metalness: 0.6 }), pneu = mat('#161616', { roughness: 0.9 });
  const luz = mat('#fff6d0', { emissive: '#fff1c8', emissiveIntensity: 1.4 }), lanterna = mat('#c81e1e', { emissive: '#c81e1e', emissiveIntensity: 0.8 });
  if (modelo === 'onibus') { const o = modeloOnibus(cor); adicionarLuzes(o, modelo); cacheCarro.set(chave, o); return o.clone(); }
  if (GLB_NOVOS[modelo] && ctx?.modelo?.(modelo)) { const o = veiculoGLBNovo(modelo, cor); adicionarLuzes(o, modelo); cacheCarro.set(chave, o); return o.clone(); }
  if (modelo === 'caveirao') { const o = modeloCaveirao(); adicionarLuzes(o, modelo); cacheCarro.set(chave, o); return o.clone(); }
  if (modelo === 'viatura_civil' || modelo === 'viatura_prf') { const o = modeloViaturaNova(modelo); adicionarLuzes(o, modelo); cacheCarro.set(chave, o); return o.clone(); }
  if (modelo === 'saveiro' || modelo === 'saveiro_som') { const o = modeloSaveiro(cor, modelo === 'saveiro_som'); adicionarLuzes(o, modelo); cacheCarro.set(chave, o); return o.clone(); }
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
  adicionarLuzes(g, modelo);
  cacheCarro.set(chave, g);
  return g.clone();
}

// modelos 3D gerados (vêm com a frente em +x e tamanho 1): gira para +z, põe as rodas no chão e ajusta o comprimento
const GLB_NOVOS = { caveirao: 6, viatura_pm: 4.6, viatura_civil: 4.6, viatura_prf: 4.7, saveiro: 4.4, saveiro_som: 4.4,
  // ônibus novos (Meshy): os da cidade (circulares) e os de viagem; vêm com a frente em -x
  onibus_amarelo: 12.5, onibus_branco: 12, onibus_laranja: 12, onibus_brasilsul: 14, onibus_viacao: 14,
  onibus_rod_dourado: 14, onibus_rod_amarelo: 14, onibus_rod_vermelho: 11.5, onibus_rod_branco: 10.5 };
const FRENTE_MENOS_X = new Set(['onibus_amarelo', 'onibus_branco', 'onibus_laranja', 'onibus_brasilsul', 'onibus_viacao', 'onibus_rod_dourado', 'onibus_rod_amarelo', 'onibus_rod_vermelho', 'onibus_rod_branco']);
const FRENTE_MENOS_Z = new Set(['viatura_pm']);
// ---- pintura de verdade (18v): a textura do Meshy já vem colorida (ex.: o Popular é azul); multiplicar por uma cor só
// escurecia. Aqui acha a cor da lataria (o tom mais comum entre os pixels coloridos), troca só esses pixels pela cor
// escolhida mantendo a luz e a sombra da textura, e deixa vidro, pneu, cromado, faróis e detalhes como estão.
const REPINTA = new Set(['popular', 'suv', 'esportivo', 'classico', 'saveiro', 'saveiro_som', 'van']);
const _tomLataria = new Map(), _repintadas = new Map();
function hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, sat, l];
}
function repintar(m, cor) {
  const tx = m.map, img = tx?.image;
  if (!img || !img.width) { m.color = new THREE.Color('#ffffff').lerp(new THREE.Color(cor), 0.45); return; }
  const k = tx.uuid + cor;
  if (_repintadas.has(k)) { m.map = _repintadas.get(k); m.color.set('#ffffff'); return; }
  try {
    const W = img.width, H = img.height, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const dados = g.getImageData(0, 0, W, H), px = dados.data;
    let tom = _tomLataria.get(tx.uuid), calculou = false;
    const hist = new Float32Array(36); let somaL = 0, nL = 0, nCor = 0, nTot = 0, somaN = 0, nN = 0;
    if (!tom) {   // histograma de tons dos pixels bem coloridos (amostra)
      calculou = true;
      for (let i = 0; i < px.length; i += 4 * 7) { const [h, sa, l] = hsl(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255); nTot++; if (sa > 0.28 && l > 0.12 && l < 0.88) { hist[Math.floor(h * 36) % 36] += sa; nCor++; } if (sa < 0.18 && l > 0.5 && l < 0.98) { somaN += l; nN++; } }
      if (nCor < nTot * 0.12) { tom = { neutro: true, l: nN ? somaN / nN : 0.8 }; _tomLataria.set(tx.uuid, tom); }   // carro branco/prata: a lataria é o cinza claro
    }
    if (!tom && calculou) {
      let mi = 0; for (let i = 1; i < 36; i++) if (hist[i] + hist[(i + 35) % 36] + hist[(i + 1) % 36] > hist[mi] + hist[(mi + 35) % 36] + hist[(mi + 1) % 36]) mi = i;
      const centro = (mi + 0.5) / 36;
      for (let i = 0; i < px.length; i += 4 * 7) { const [h, sa, l] = hsl(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255); const dh = Math.min(Math.abs(h - centro), 1 - Math.abs(h - centro)); if (sa > 0.28 && dh < 0.07) { somaL += l; nL++; } }
      tom = { h: centro, l: nL ? somaL / nL : 0.5 }; _tomLataria.set(tx.uuid, tom);
    }
    const alvo = new THREE.Color(cor), hslA = {}; alvo.getHSL(hslA, THREE.SRGBColorSpace);
    const c = new THREE.Color();
    for (let i = 0; i < px.length; i += 4) {
      const [h, sa, l] = hsl(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
      let peso;
      if (tom.neutro) { if (sa > 0.18 || l < 0.5 || l > 0.985) continue; peso = Math.min(1, (0.18 - sa) / 0.06) * Math.min(1, (l - 0.5) / 0.08); }
      else {
        const dh = Math.min(Math.abs(h - tom.h), 1 - Math.abs(h - tom.h));
        if (sa < 0.2 || dh > 0.09) continue;   // não é a lataria
        peso = Math.min(1, (sa - 0.2) / 0.15) * Math.min(1, (0.09 - dh) / 0.03);
      }
      const nl = THREE.MathUtils.clamp(hslA.l * (l / Math.max(0.05, tom.l)), 0.03, 0.97);
      c.setHSL(hslA.h, hslA.s, nl, THREE.SRGBColorSpace);
      px[i] = px[i] + (c.r * 255 - px[i]) * peso; px[i + 1] = px[i + 1] + (c.g * 255 - px[i + 1]) * peso; px[i + 2] = px[i + 2] + (c.b * 255 - px[i + 2]) * peso;
    }
    g.putImageData(dados, 0, 0);
    const nova = new THREE.CanvasTexture(cv); nova.colorSpace = tx.colorSpace; nova.flipY = tx.flipY; nova.wrapS = tx.wrapS; nova.wrapT = tx.wrapT; nova.channel = tx.channel;
    nova.offset.copy(tx.offset); nova.repeat.copy(tx.repeat); nova.anisotropy = tx.anisotropy;
    _repintadas.set(k, nova); m.map = nova; m.color.set('#ffffff');
  } catch { m.color = new THREE.Color('#ffffff').lerp(new THREE.Color(cor), 0.45); }   // imagem protegida ou sem canvas: pinta de leve como antes
}
function veiculoGLBNovo(modelo, cor) {
  const L = GLB_NOVOS[modelo], g = new THREE.Group(), piv = new THREE.Group(), c = ctx.modelo(modelo).clone(true);
  c.rotation.y = FRENTE_MENOS_Z.has(modelo) ? Math.PI : FRENTE_MENOS_X.has(modelo) ? Math.PI / 2 : -Math.PI / 2; piv.add(c); piv.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(piv), s = L / Math.max(0.01, b.max.z - b.min.z);
  c.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); piv.scale.setScalar(s); g.add(piv);
  const tinta = REPINTA.has(modelo) && cor;
  c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (tinta) { o.material = o.material.clone(); repintar(o.material, cor); } } });
  const h = (b.max.y - b.min.y) * s;
  if (VIDROS[modelo]) { g.updateMatrixWorld(true); vidrosEscuros(g, VIDROS[modelo]); }
  if (modelo === 'caveirao' || (modelo.startsWith('viatura') && modelo !== 'viatura_pm')) sirene(g, [h + 0.05, modelo === 'caveirao' ? 0.6 : -0.2]);   // a da PM já tem giroflex no modelo
  g.userData.modelo = modelo;
  if (RODAS[modelo]) { g.userData.glb = modelo; try { montarRodas(g, modelo); } catch (e) { console.warn('rodas:', modelo, e); } }   // ônibus novos: rodas que giram e viram
  else g.userData.eixos = { zf: L * 0.31, zr: -L * 0.31 };
  return g;
}
// placa de texto pintada (letreiro na lataria)
function letreiro(txt, cor, fundo, w, h) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = fundo; x.fillRect(0, 0, 256, 64); x.fillStyle = cor; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, side: THREE.DoubleSide }));
}
function rodasEm(g, pneu, r, xs, zs) {
  for (const sx of xs) for (const sz of zs) { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.34, 14).rotateZ(Math.PI / 2), pneu); p.position.set(sx, r, sz); p.castShadow = true; g.add(p); }
}
// Caveirão (blindado do BOPE): 6 m, preto fosco, frente inclinada, vigias estreitas, escotilha e torre no teto
function modeloCaveirao() {
  const g = new THREE.Group(), r = 0.55;
  const aco = mat('#1b1d20', { roughness: 0.8, metalness: 0.35 }), vidro = mat('#0e151c', { roughness: 0.1, metalness: 0.6 }), pneu = mat('#121212', { roughness: 0.95 });
  bloco(g, aco, 2.5, 1.9, 5.4, 0, r + 0.25 + 0.95, -0.2);                 // caixa blindada
  const frente = bloco(g, aco, 2.45, 1.3, 1.4, 0, r + 0.25 + 0.65, 2.9); frente.rotation.x = -0.35;   // capô inclinado
  bloco(g, vidro, 1.9, 0.28, 0.05, 0, r + 1.95, 2.42);                     // vigia do motorista
  for (const sx of [-1.26, 1.26]) for (const sz of [-1.6, -0.2, 1.2]) bloco(g, vidro, 0.04, 0.18, 0.7, sx, r + 1.75, sz);   // seteiras laterais
  bloco(g, mat('#26292d', { metalness: 0.4 }), 1.4, 0.55, 1.6, 0, r + 2.45, -0.6);   // torre/escotilha
  bloco(g, mat('#3a3d42'), 2.7, 0.18, 0.4, 0, r + 0.35, 3.3);             // para-choque de aríete
  const l1 = letreiro('BOPE', '#e8e8e8', '#1b1d20', 1.6, 0.4); l1.position.set(1.27, r + 1.35, -0.4); l1.rotation.y = Math.PI / 2; g.add(l1);
  const l2 = l1.clone(); l2.position.x = -1.27; l2.rotation.y = -Math.PI / 2; g.add(l2);
  rodasEm(g, pneu, r, [-1.15, 1.15], [-1.9, -0.7, 1.9]);
  sirene(g, [r + 2.15, 1.6]);
  g.userData.eixos = { zf: 1.9, zr: -1.3 };
  return g;
}
// viaturas novas: Polícia Civil (sedã cinza-chumbo com faixas brancas) e PRF (SUV azul-escuro com faixa amarela)
function modeloViaturaNova(modelo) {
  const g = new THREE.Group(), prf = modelo === 'viatura_prf', r = prf ? 0.42 : 0.36;
  const pint = mat(prf ? '#14213d' : '#2b2f36', { roughness: 0.3, metalness: 0.5 }), vidro = mat('#121a24', { roughness: 0.08, metalness: 0.6 }), pneu = mat('#151515', { roughness: 0.9 });
  const faixa = mat(prf ? '#f2c230' : '#f2f2f0', { roughness: 0.5 });
  const [w, h, l, ch] = prf ? [1.95, 0.85, 4.7, 0.75] : [1.8, 0.62, 4.6, 0.58];
  bloco(g, pint, w, h, l, 0, r + h / 2 + 0.1, 0);
  bloco(g, vidro, w * 0.9, ch, l * (prf ? 0.55 : 0.45), 0, r + h + ch / 2 + 0.08, -0.2);
  bloco(g, pint, w * 0.88, 0.08, l * (prf ? 0.52 : 0.42), 0, r + h + ch + 0.1, -0.2);
  bloco(g, faixa, w + 0.02, 0.16, l * 0.8, 0, r + h * 0.55, 0);
  const t = letreiro(prf ? 'PRF' : 'POLÍCIA CIVIL', prf ? '#14213d' : '#2b2f36', prf ? '#f2c230' : '#f2f2f0', prf ? 1.0 : 1.9, 0.3);
  for (const sx of [-1, 1]) { const m = t.clone(); m.position.set(sx * (w / 2 + 0.02), r + h * 0.55, 0); m.rotation.y = sx * Math.PI / 2; g.add(m); }
  bloco(g, mat('#222'), 1.1, 0.12, 0.3, 0, r + h + ch + 0.2, -0.2);   // base do giroflex
  rodasEm(g, pneu, r, [-w / 2 + 0.2, w / 2 - 0.2], [-l / 2 + 0.8, l / 2 - 0.8]);
  sirene(g, [r + h + ch + 0.32, -0.2]);
  g.userData.eixos = { zf: l / 2 - 0.8, zr: -l / 2 + 0.8 };
  return g;
}
// Saveiro (picape): cabine e caçamba; a versão com som leva caixas e luz neon na caçamba
function modeloSaveiro(cor, som) {
  const g = new THREE.Group(), r = 0.36;
  const pint = mat(cor || '#c0392b', { roughness: 0.3, metalness: 0.5 }), vidro = mat('#121a24', { roughness: 0.08, metalness: 0.6 }), pneu = mat('#151515', { roughness: 0.9 });
  bloco(g, pint, 1.75, 0.6, 4.4, 0, r + 0.4, 0);                        // chassi e laterais
  bloco(g, vidro, 1.6, 0.55, 1.3, 0, r + 0.98, 0.75);                   // cabine (vidros)
  bloco(g, pint, 1.58, 0.07, 1.25, 0, r + 1.28, 0.7);                   // teto
  bloco(g, mat('#2a2a2a', { roughness: 0.9 }), 1.55, 0.05, 1.8, 0, r + 0.72, -1.2);   // assoalho da caçamba
  bloco(g, pint, 1.75, 0.35, 0.08, 0, r + 0.88, -2.16);                 // tampa traseira
  rodasEm(g, pneu, r, [-0.78, 0.78], [-1.35, 1.35]);
  if (som) {
    const cx = mat('#111', { roughness: 0.7 }), cone = mat('#3a3a3a', { metalness: 0.5 });
    bloco(g, cx, 1.5, 0.9, 0.7, 0, r + 1.2, -1.7);
    for (const sx of [-0.45, 0.45]) for (const sy of [0.95, 1.4]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 16).rotateX(Math.PI / 2), cone); c.position.set(sx, r + sy, -1.34); g.add(c); }
    const neon = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 1.9), new THREE.MeshBasicMaterial({ color: '#b45cff' })); neon.position.set(0, r + 0.12, -1.2); g.add(neon);
  }
  g.userData.eixos = { zf: 1.35, zr: -1.35 };
  return g;
}
// ônibus feito por código (até chegar o modelo 3D): 11 m, frente em +Z, letreiro da linha
function modeloOnibus(cor) {
  const g = new THREE.Group(), L = 11, W = 2.5, H = 2.9, r = 0.48;
  const pint = mat('#f4f4f0', { roughness: 0.45, metalness: 0.2 }), faixa = mat(cor || '#1f6fd1', { roughness: 0.4 }), vidro = mat('#16202b', { roughness: 0.08, metalness: 0.6 }), pneu = mat('#151515', { roughness: 0.9 });
  bloco(g, pint, W, H - 0.3, L, 0, r + 0.15 + (H - 0.3) / 2, 0);
  bloco(g, faixa, W + 0.02, 0.32, L + 0.02, 0, r + 0.55, 0);
  bloco(g, vidro, W + 0.03, 0.95, L - 2.2, 0, r + 1.75, -0.4);
  bloco(g, vidro, W - 0.2, 1.15, 0.05, 0, r + 1.65, L / 2 + 0.01);
  bloco(g, mat('#222'), W, 0.12, L, 0, r + H - 0.05, 0);
  const c = document.createElement('canvas'); c.width = 256; c.height = 48; const x = c.getContext('2d');
  x.fillStyle = '#111'; x.fillRect(0, 0, 256, 48); x.fillStyle = '#ffb21c'; x.font = 'bold 30px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('1 CIRCULAR', 128, 25);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const let_ = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.36), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); let_.position.set(0, r + H - 0.38, L / 2 + 0.03); g.add(let_);
  const luz = mat('#fff6d0', { emissive: '#fff1c8', emissiveIntensity: 1.4 });
  for (const sx of [-0.9, 0.9]) {
    bloco(g, luz, 0.35, 0.16, 0.05, sx, r + 0.75, L / 2 + 0.02);
    for (const sz of [-L / 2 + 1.8, L / 2 - 2.0]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 14).rotateZ(Math.PI / 2), pneu); p.position.set(sx * 1.32, r, sz); p.castShadow = true; g.add(p); }
  }
  return g;
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
export function placasOutdoors() { return [...outdoors.values()].map((v) => ({ mesh: v.placa, o: v.o, canvas: v.placa.material.map?.image })); }
export function brilhoOutdoors(noite) { for (const v of outdoors.values()) v.placa.material.emissiveIntensity = 0.15 + noite * 0.6; }

// ================================================================= luzes dos veículos à noite
// Carros, caminhões e ônibus: faróis (com a luz no chão à frente) e lanternas vermelhas atrás.
// Aviões e helicópteros: luzes de navegação (vermelha à esquerda, verde à direita), estrobo branco piscando,
// farol giratório vermelho em cima e, perto do chão, o farol de pouso iluminando a pista (helicóptero: holofote embaixo).
// Só acendem com o veículo em uso (andou nos últimos segundos) e de noite. Tudo é sprite/plano aditivo, sem luz real (leve no celular).
const comLuz = new Set();
const extremos = new Map();
let texBrilho = null, texFeixe = null, texPoca = null, M = null, tLuz = 0;
function texturas() {
  if (M) return;
  const canv = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  texBrilho = canv(64, 64, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
  texFeixe = canv(64, 128, (g, w, h) => {   // cone de luz: forte perto do carro (embaixo da textura), some à frente
    for (let y = 0; y < h; y++) { const k = y / h, larg = w * (0.25 + 0.75 * (1 - k)) / 2, a = Math.pow(k, 1.6) * 0.95; const lg = g.createLinearGradient(w / 2 - larg, 0, w / 2 + larg, 0); lg.addColorStop(0, 'rgba(255,240,200,0)'); lg.addColorStop(0.5, `rgba(255,240,200,${a})`); lg.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = lg; g.fillRect(0, y, w, 1); }
  });
  texPoca = canv(64, 64, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,248,225,.95)'); r.addColorStop(0.5, 'rgba(255,240,200,.45)'); r.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
  const spr = (cor) => new THREE.SpriteMaterial({ map: texBrilho, color: cor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  M = { farol: spr('#fff1c8'), lanterna: spr('#ff2a1a'), navV: spr('#ff2020'), navG: spr('#1fff5a'), estrobo: spr('#ffffff'), giro: spr('#ff3020'),
    laranjaA: spr('#ff8a12'), laranjaB: spr('#ff8a12'),
    feixe: new THREE.MeshBasicMaterial({ map: texFeixe, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0.8 }),
    poca: new THREE.MeshBasicMaterial({ map: texPoca, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }) };
}
// pontos extremos do modelo (no espaço do próprio objeto), ignorando as pás do rotor
function medir(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  const e = { min: new THREE.Vector3(1e9, 1e9, 1e9), max: new THREE.Vector3(-1e9, -1e9, -1e9), px: null, nx: null, py: null, nz: null };
  const pulas = (o) => { for (let x = o; x && x !== g; x = x.parent) if (x.name === 'rotor' || x === g.userData.rotor || x === g.userData.rotorCauda) return true; return false; };
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position || pulas(o)) return;
    m.multiplyMatrices(inv, o.matrixWorld); const pa = o.geometry.attributes.position, passo = Math.max(1, Math.floor(pa.count / 5000));
    for (let i = 0; i < pa.count; i += passo) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m); e.min.min(v); e.max.max(v);
      if (!e.px || v.x > e.px.x) e.px = v.clone(); if (!e.nx || v.x < e.nx.x) e.nx = v.clone();
      if (!e.py || v.y > e.py.y) e.py = v.clone(); if (!e.nz || v.z < e.nz.z) e.nz = v.clone();
    }
  });
  return e.px ? e : null;
}
function adicionarLuzes(g, tipo, chave = null) {
  texturas();
  if (g.getObjectByName('luzes')) return g;
  let e = chave && extremos.get(chave); if (!e) { e = medir(g); if (!e) return g; if (chave) extremos.set(chave, e); }
  const aereo = /^(aviao_|helicoptero)/.test(tipo), heli = /^helicoptero/.test(tipo);
  const L = new THREE.Group(); L.name = 'luzes'; L.visible = false; L.userData = { aereo, heli, comp: e.max.z - e.min.z };
  const sp = (mat, x, y, z, t) => { const s = new THREE.Sprite(mat); s.position.set(x, y, z); s.scale.set(t, t, t); L.add(s); return s; };
  const w = e.max.x - e.min.x, h = e.max.y - e.min.y, cx = (e.max.x + e.min.x) / 2;
  if (!aereo) {
    const grande = w > 2.2, moto = /^moto/.test(tipo), yf = e.min.y + h * (grande ? 0.22 : moto ? 0.62 : 0.38);
    for (const s of moto ? [0] : [-1, 1]) {   // moto: um farol só
      sp(M.farol, cx + s * w * 0.34, yf, e.max.z + 0.08, grande ? 0.9 : 0.7);
      sp(M.lanterna, cx + s * w * 0.4, yf + (grande ? 0.3 : 0.05), e.min.z - 0.08, grande ? 0.6 : 0.5);
    }
    const comp = grande ? 16 : 12, f = new THREE.Mesh(new THREE.PlaneGeometry(grande ? 6 : 4.8, comp).rotateX(-Math.PI / 2), M.feixe);
    f.position.set(cx, e.min.y + 0.06, e.max.z + comp / 2 - 0.5); f.rotation.y = Math.PI; f.renderOrder = 3; L.add(f);
  } else if (heli) {   // helicóptero: nada nas pás; pisca-pisca na cauda (ponta e em cima da deriva) e um embaixo da barriga
    const t = 0.9;
    sp(M.estrobo, e.nz.x, e.nz.y, e.nz.z - 0.05, t * 2);
    sp(M.giro, e.nz.x, e.nz.y + 0.45, e.nz.z + 0.3, t * 1.4);
    sp(M.giro, cx, Math.max(e.min.y, 0) + 0.45, (e.min.z + e.max.z) / 2 + 1, t * 1.2);   // farol de baixo
    // navegação: vermelha à esquerda (+X), verde à direita, na altura do meio da cabine
    const yn = e.min.y + h * 0.42, zn = e.min.z + (e.max.z - e.min.z) * 0.62;
    sp(M.navV, e.max.x + 0.05, yn, zn, t * 1.1); sp(M.navG, e.min.x - 0.05, yn, zn, t * 1.1);
  } else {
    const t = Math.max(0.9, w * 0.05);
    sp(M.navV, e.px.x, e.px.y, e.px.z, t * 1.3);   // ponta esquerda (o modelo olha para +Z: esquerda = +X)
    sp(M.navG, e.nx.x, e.nx.y, e.nx.z, t * 1.3);
    for (const p of [e.px, e.nx, e.nz]) sp(M.estrobo, p.x, p.y, p.z, t * 2.2);
    sp(M.giro, e.py.x, e.py.y + 0.15, e.py.z, t * 1.5);
    sp(M.giro, cx, e.min.y + 0.1, (e.min.z + e.max.z) / 2, t * 1.2);   // farol de baixo
  }
  g.add(L);
  if (tipo === 'caminhao_lixo') {   // giroflex laranja: duas lâmpadas no teto da cabine, piscando de dia e de noite
    const G = new THREE.Group(); G.name = 'giroflex'; G.visible = false;
    for (const [s, m] of [[-1, M.laranjaA], [1, M.laranjaB]]) { const sp2 = new THREE.Sprite(m); sp2.position.set(cx + s * 0.55, e.min.y + h * 0.93, e.max.z - 1.25); sp2.scale.set(0.9, 0.9, 0.9); G.add(sp2); }
    g.add(G);
  }
  return g;
}
// para veículos que não saem de modeloCarro (frota das empresas, caminhão das ruas)
export function luzesEm(o, tipo, chave) { adicionarLuzes(o, tipo, chave); if (o.getObjectByName('luzes')) comLuz.add(o); return o; }
const _f = new THREE.Vector3();
let luzAerea = null;
export function atualizarLuzesVeiculos(dt, noite, chao, cena) {
  let melhor = null;
  if (!M) return;
  tLuz += dt;
  M.estrobo.opacity = (tLuz % 1.3) < 0.07 || ((tLuz % 1.3) > 0.18 && (tLuz % 1.3) < 0.24) ? 1 : 0;   // pisca-pisca duplo
  M.giro.opacity = 0.25 + 0.75 * Math.max(0, Math.sin(tLuz * 5.5));
  M.feixe.opacity = 0.75 * noite; M.poca.opacity = noite;
  const gi = (tLuz * 2.2) % 1; M.laranjaA.opacity = gi < 0.5 ? 1 : 0.08; M.laranjaB.opacity = gi < 0.5 ? 0.08 : 1;
  for (const o of comLuz) {
    const L = o.getObjectByName('luzes');
    if (!o.parent || !L) { if (L) L.visible = false; if (o.userData.pocaLuz) o.userData.pocaLuz.visible = false; comLuz.delete(o); continue; }
    o.getWorldPosition(_f);
    const u = o.userData, ult = u.ultLuz;
    if (ult && Math.hypot(_f.x - ult.x, _f.y - ult.y, _f.z - ult.z) > 0.03) u.ativoAte = tLuz + 4;
    u.ultLuz = { x: _f.x, y: _f.y, z: _f.z };
    const ligado = noite > 0.25 && tLuz < (u.ativoAte || 0) && o.visible;
    L.visible = ligado;
    const G = o.getObjectByName('giroflex'); if (G) G.visible = o.visible && (tLuz < (u.ativoAte || 0) || !!u.giroflex);
    if (!L.userData.aereo) continue;
    // farol de pouso (avião, perto do chão) / holofote (helicóptero, no ar): mancha de luz no chão
    const alt = _f.y - chao(_f.x, _f.z);
    const mostra = ligado && alt < 90 && (!L.userData.heli || alt > 1.2);
    if (!mostra) { if (u.pocaLuz) u.pocaLuz.visible = false; continue; }
    if (!u.pocaLuz) { u.pocaLuz = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), M.poca); u.pocaLuz.renderOrder = 3; cena.add(u.pocaLuz); }
    const yaw = o.rotation.y, frente = L.userData.heli ? 2 : L.userData.comp * 0.5 + 8 + alt * 0.6;
    const px = _f.x + Math.sin(yaw) * frente, pz = _f.z + Math.cos(yaw) * frente, r = L.userData.heli ? 7 + alt * 0.08 : 10 + alt * 0.15;
    u.pocaLuz.position.set(px, chao(px, pz) + 0.03, pz); u.pocaLuz.scale.set(r * 2, 1, L.userData.heli ? r * 2 : r * 3); u.pocaLuz.rotation.y = yaw;
    u.pocaLuz.material = M.poca; u.pocaLuz.visible = true;
    u.pocaLuz.userData.k = Math.max(0.25, 1 - alt / 90);
    // candidato à luz de verdade: a aeronave acesa mais perto de quem joga
    const f = ctx?.foco?.(), d = f ? Math.hypot(_f.x - f.x, _f.z - f.z) : 0;
    if (d < 160 && (!melhor || d < melhor.d)) melhor = { d, x: _f.x, y: _f.y - 0.6, z: _f.z, px, py: chao(px, pz), pz, r, alt };
  }
  // a mancha só clareia o chão: a luz de verdade (uma só, sempre na cena) ilumina trem, carros e gente embaixo
  if (!luzAerea) { luzAerea = new THREE.SpotLight('#fff6e0', 0, 0, 0.5, 0.5, 1); luzAerea.position.set(0, -200, 0); cena.add(luzAerea, luzAerea.target); }
  if (melhor) {
    luzAerea.position.set(melhor.x, melhor.y, melhor.z); luzAerea.target.position.set(melhor.px, melhor.py, melhor.pz); luzAerea.target.updateMatrixWorld();
    const dist = Math.hypot(melhor.px - melhor.x, melhor.py - melhor.y, melhor.pz - melhor.z);
    luzAerea.angle = Math.min(1.1, Math.atan(melhor.r / Math.max(1, dist)) * 1.15);
    luzAerea.intensity += (5 * dist * noite - luzAerea.intensity) * 0.2;
  } else luzAerea.intensity *= 0.8;
}
