// Logo das empresas na lona do baú dos caminhões (SQL 106).
//   · logos prontas do jogo: desenhadas aqui (ícone + nome da empresa + cor), aparecem na hora
//   · imagem do dono: recortada no celular para 1024×384 (formato da lona), enviada ao Supabase e só aparece para
//     todos depois de aprovada (o dono vê a dele nos próprios caminhões enquanto espera)
import * as THREE from 'three';

export const LONA = { w: 1024, h: 384 };
export const PRONTAS = [
  { id: 'escudo', nome: 'Escudo' }, { id: 'seta', nome: 'Seta' }, { id: 'globo', nome: 'Globo' },
  { id: 'raio', nome: 'Raio' }, { id: 'estrela', nome: 'Estrela' }, { id: 'roda', nome: 'Roda' },
];
export const CORES = ['#1f5fa8', '#c62828', '#2e7d32', '#ef6c00', '#6a1b9a', '#212121', '#00838f', '#c9a227'];

function icone(g, tipo, cx, cy, r, cor, cor2) {
  g.save(); g.translate(cx, cy); g.fillStyle = cor; g.strokeStyle = cor; g.lineJoin = 'round';
  const estrela = (raio, pontas, dentro) => { g.beginPath(); for (let i = 0; i < pontas * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / pontas, rr = i % 2 ? raio * dentro : raio; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); };
  if (tipo === 'escudo') {
    g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.85, -r * 0.62); g.lineTo(r * 0.78, r * 0.2); g.quadraticCurveTo(r * 0.55, r * 0.75, 0, r); g.quadraticCurveTo(-r * 0.55, r * 0.75, -r * 0.78, r * 0.2); g.lineTo(-r * 0.85, -r * 0.62); g.closePath(); g.fill();
    g.fillStyle = cor2; estrela(r * 0.42, 5, 0.45); g.fill();
  } else if (tipo === 'seta') {
    g.beginPath(); g.moveTo(-r, -r * 0.32); g.lineTo(r * 0.2, -r * 0.32); g.lineTo(r * 0.2, -r * 0.8); g.lineTo(r, 0); g.lineTo(r * 0.2, r * 0.8); g.lineTo(r * 0.2, r * 0.32); g.lineTo(-r, r * 0.32); g.closePath(); g.fill();
  } else if (tipo === 'globo') {
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = cor2; g.lineWidth = r * 0.08;
    g.beginPath(); g.ellipse(0, 0, r * 0.45, r * 0.98, 0, 0, Math.PI * 2); g.stroke();
    for (const y of [-0.5, 0, 0.5]) { const w = Math.sqrt(1 - y * y) * r * 0.98; g.beginPath(); g.moveTo(-w, y * r); g.lineTo(w, y * r); g.stroke(); }
  } else if (tipo === 'raio') {
    g.beginPath(); g.moveTo(r * 0.25, -r); g.lineTo(-r * 0.6, r * 0.12); g.lineTo(-r * 0.02, r * 0.12); g.lineTo(-r * 0.3, r); g.lineTo(r * 0.62, -r * 0.18); g.lineTo(r * 0.04, -r * 0.18); g.closePath(); g.fill();
  } else if (tipo === 'estrela') {
    estrela(r, 5, 0.45); g.fill();
  } else {   // roda
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.fillStyle = cor2; g.beginPath(); g.arc(0, 0, r * 0.62, 0, Math.PI * 2); g.fill();
    g.fillStyle = cor; g.beginPath(); g.arc(0, 0, r * 0.2, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 6; i++) { g.save(); g.rotate(i * Math.PI / 3); g.fillRect(-r * 0.06, r * 0.2, r * 0.12, r * 0.42); g.restore(); }
  }
  g.restore();
}

// desenha a lona de uma logo pronta num canvas (1024×384)
export function desenharPronta(tipo, cor, nome, cv = document.createElement('canvas')) {
  cv.width = LONA.w; cv.height = LONA.h; const g = cv.getContext('2d');
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, LONA.w, LONA.h);
  g.fillStyle = cor; g.fillRect(0, LONA.h - 70, LONA.w, 70);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, LONA.h - 82, LONA.w, 12);
  icone(g, tipo, 175, 155, 112, cor, '#f4f4f0');
  let t = String(nome || 'Transportes').toUpperCase(), tam = 104;
  g.font = `900 ${tam}px system-ui, sans-serif`;
  while (g.measureText(t).width > 680 && tam > 40) { tam -= 4; g.font = `900 ${tam}px system-ui, sans-serif`; }
  g.fillStyle = cor; g.textBaseline = 'middle'; g.fillText(t, 315, 140);
  g.font = '600 40px system-ui, sans-serif'; g.fillStyle = '#555'; g.fillText('Transportes & Cargas', 318, 140 + tam * 0.62);
  return cv;
}

// recorta a imagem escolhida no formato da lona (cobre tudo, corta as sobras) e devolve um JPEG pequeno
export function recortarImagem(arquivo) {
  return new Promise((ok, erro) => {
    if (!arquivo || !/^image\//.test(arquivo.type)) { erro(new Error('Escolha uma imagem.')); return; }
    const url = URL.createObjectURL(arquivo), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const cv = document.createElement('canvas'); cv.width = LONA.w; cv.height = LONA.h; const g = cv.getContext('2d');
      g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, LONA.w, LONA.h);
      const k = Math.max(LONA.w / img.width, LONA.h / img.height), w = img.width * k, h = img.height * k;
      g.drawImage(img, (LONA.w - w) / 2, (LONA.h - h) / 2, w, h);
      cv.toBlob((b) => (b ? ok({ blob: b, canvas: cv }) : erro(new Error('Não deu para preparar a imagem.'))), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não deu para abrir essa imagem.')); };
    img.src = url;
  });
}

// ---------------------------------------------------------------- lona no caminhão
const cacheTex = new Map();   // chave -> Promise<Texture>
export function chaveLogo(l, nome) { return !l ? null : l.tipo === 'pronta' ? `p:${l.pronta}:${l.cor}:${nome}` : `i:${l.url}`; }
function texturaDe(l, nome) {
  const k = chaveLogo(l, nome);
  if (!cacheTex.has(k)) {
    cacheTex.set(k, new Promise((ok, erro) => {
      if (l.tipo === 'pronta') { const t = new THREE.CanvasTexture(desenharPronta(l.pronta, l.cor, nome)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; ok(t); return; }
      const ld = new THREE.TextureLoader(); ld.setCrossOrigin('anonymous');
      ld.load(l.url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; ok(t); }, undefined, erro);
    }));
  }
  return cacheTex.get(k);
}
const geoLona = new THREE.PlaneGeometry(5.5, 2.06);
// as duas laterais do baú do caminhão novo (lado de fora do baú branco liso: x ±1.14, z -4.0..1.5, y 1.3..3.36)
export function porLona(obj, l, nome) {
  const k = chaveLogo(l, nome);
  if (obj.userData.logoChave === k) return;
  obj.userData.logoChave = k;
  obj.getObjectByName('lona')?.removeFromParent();
  if (!l) return;
  texturaDe(l, nome).then((tex) => {
    if (obj.userData.logoChave !== k) return;
    obj.getObjectByName('lona')?.removeFromParent();
    const g = new THREE.Group(); g.name = 'lona';
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const lado of [1, -1]) {
      const p = new THREE.Mesh(geoLona, mat); p.position.set(lado * 1.145, 2.33, -1.25); p.rotation.y = lado * Math.PI / 2; p.receiveShadow = true; g.add(p);
    }
    obj.add(g);
  }).catch(() => { obj.userData.logoChave = null; });
}
