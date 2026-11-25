// Visual "de cinema": brilho (bloom), correção de cor, vinheta, neblina e chão molhado na chuva.
// Três níveis de qualidade (escolha do jogador, guardada no aparelho):
//   baixo  → resolução 1x, sombra simples 1024 (celular fraco)
//   medio  → sem pós-processamento (leve), sombra suave 1024, resolução até 1,5x
//   alto   → brilho só à noite (postes, faróis) + cor e vinheta suaves, sombra 2048
//   ultra  → tudo do alto + resolução cheia, sombra 4096 cobrindo mais área, texturas nítidas de longe (anisotrópico)
//            e visão mais longe (o resto do jogo lê o nível: prédios 3D, árvores e carros detalhados mais longe)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

export const NIVEIS = { baixo: 'Baixa', medio: 'Média', alto: 'Alta', ultra: 'Ultra', maxima: 'Máxima' };
// 22q: "Máxima" = tudo do Ultra + sombra de contato (oclusão), sombras cobrindo mais área, resolução cheia até 3x e
// visão mais longe. Para o resto do jogo ela é o Ultra (nivelAtual() devolve 'ultra'); maximaAtiva() diz se está nela.
const ORDEM = ['baixo', 'medio', 'alto', 'ultra', 'maxima'];
const comEfeitos = () => nivel === 'alto' || nivel === 'ultra';
const CHAVE = 'fator_qualidade';
let gotasP = null, R = null, cena = null, sol = null, comp = null, passeRender = null, bloom = null, cor = null, saida = null, nivel = 'medio', maxima = false, auto = false, aoMudar = null;
let toque = false, falhou = false, ao = null, comAO = false;
// 22q (prévia): sombra de contato (oclusão de ambiente) na Alta e na Ultra
export function definirAO(on) { comAO = !!on; if (comAO) montarComposer(); if (ao) ao.enabled = comAO; }

// cor do filme: contraste, saturação, vinheta e um leve tom (quente de dia, azulado à noite)
// 22z4: gotas de chuva na tela (lente da câmera): gotas paradas que aparecem e secam e gotas escorrendo com rastro.
// Cada gota funciona como uma lente: mostra a imagem de trás um pouco deslocada e invertida.
const GOTAS = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uF: { value: 0 }, uAsp: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
uniform sampler2D tDiffuse; uniform float uT, uF, uAsp; varying vec2 vUv;
float h1(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
vec3 paradas(vec2 uv, float esc, float t, float semente) {
  vec2 g = uv * vec2(uAsp, 1.0) * esc + semente; vec2 id = floor(g), f = fract(g) - 0.5;
  float n = h1(id); if (n > 0.08 + 0.5 * uF) return vec3(0.0);
  vec2 c = (vec2(h1(id + 3.1), h1(id + 7.7)) - 0.5) * 0.55;
  float r = 0.1 + 0.2 * h1(id + 1.3), vida = fract(t * (0.05 + 0.06 * h1(id + 5.0)) + n * 7.0);
  float a = smoothstep(0.0, 0.04, vida) * smoothstep(1.0, 0.55, vida);
  vec2 d = f - c; d.y *= 1.15; float l = length(d);
  return vec3(d / r, smoothstep(r, r * 0.7, l) * a);
}
vec3 escorre(vec2 uv, float esc, float t) {
  vec2 g = uv * vec2(uAsp, 1.0) * vec2(esc, esc * 0.25);
  float col = floor(g.x), n = h1(vec2(col, 4.2)); if (n > 0.1 + 0.4 * uF) return vec3(0.0);
  float ly = fract(g.y), fx = fract(g.x) - 0.5, vel = 0.15 + 0.3 * h1(vec2(col, 2.3));
  float yh = fract(n * 3.7 - t * vel);
  float dy = ly - yh; if (dy < -0.5) dy += 1.0; if (dy > 0.5) dy -= 1.0;
  float x0 = (h1(vec2(col, 9.1)) - 0.5) * 0.5 + sin((g.y) * 9.0 + n * 6.0) * 0.06;
  vec2 q = vec2(fx - x0, dy * 4.0);
  float r = 0.16 + 0.06 * n, cab = smoothstep(r, r * 0.7, length(q * vec2(1.0, 0.75)));
  float tr = 0.0; vec2 qd = vec2(0.0);
  if (dy > 0.0 && dy < 0.4) {   // rastro de gotinhas acima da gota que desce
    float k = 1.0 - dy / 0.4; float cel = fract(ly * 28.0) - 0.5; vec2 qq = vec2(fx - x0, cel * 4.0 / 7.0);
    float rr = 0.05 * k + 0.01; tr = smoothstep(rr, rr * 0.6, length(qq)) * step(0.35, h1(vec2(col, floor(ly * 28.0))));
    qd = qq / max(rr, 0.001);
  }
  return cab > tr ? vec3(q / r, cab) : vec3(qd, tr);
}
void main() {
  vec2 off = vec2(0.0); float m = 0.0;
  vec3 a = paradas(vUv, 14.0, uT, 0.0), b = paradas(vUv, 26.0, uT * 1.3, 17.0), c = escorre(vUv, 9.0, uT);
  for (int i = 0; i < 3; i++) { vec3 v = i == 0 ? a : i == 1 ? b : c; off += v.xy * v.z; m = max(m, v.z); }
  vec2 uv2 = vUv - off * 0.028 * vec2(1.0 / uAsp, 1.0);
  vec4 cor = texture2D(tDiffuse, mix(vUv, uv2, step(0.001, m)));
  cor.rgb = mix(cor.rgb, cor.rgb * 1.08 + 0.02, m * 0.5);   // a gota fica um pouco mais clara
  gl_FragColor = cor;
}`,
};
const COR = {
  uniforms: {
    tDiffuse: { value: null }, uContraste: { value: 1.04 }, uSaturacao: { value: 1.08 },
    uVinheta: { value: 0.14 }, uTom: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uContraste, uSaturacao, uVinheta; uniform vec3 uTom; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 v = c.rgb * uTom;
      float l = dot(v, vec3(0.2126, 0.7152, 0.0722));
      v = mix(vec3(l), v, uSaturacao);
      v = (v - 0.5) * uContraste + 0.5;   // já em sRGB (depois do OutputPass)
      vec2 d = vUv - 0.5; float vin = 1.0 - uVinheta * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(max(v, 0.0) * vin, c.a);
    }`,
};

export function nivelAtual() { return nivel; }
// ---- 22q: resolução dinâmica. Quando o aparelho não aguenta (muita gente, chuva, explosão), a imagem é desenhada
// com menos pixels por um tempo (até 60% da resolução do nível) e volta aos poucos quando sobra folga. É o que mais
// tira as "travadinhas": o jogo prefere ficar um pouco menos nítido a perder quadros.
let base = 1, escala = 1, janela = { n: 0, lentos: 0, t: 0 }, folga = 0;
export const escalaResolucao = () => escala;
export function adaptar(dt) {
  if (!R || document.hidden) return;   // aba escondida: não conta (um engasgo único pesa só 1 quadro na conta)
  conferirAuto(dt);
  janela.n++; janela.t += Math.min(dt, 0.5); if (dt > 1 / 45) janela.lentos++;
  if (janela.t < 2) return;
  const frac = janela.lentos / janela.n; janela = { n: 0, lentos: 0, t: 0 };
  let nova = escala;
  if (frac > 0.25) { nova = Math.max(0.6, escala - 0.1); folga = 0; }
  else if (frac < 0.04) { if (++folga >= 2) { nova = Math.min(1, escala + 0.05); folga = 0; } }
  else folga = 0;
  if (Math.abs(nova - escala) > 0.001) { escala = nova; R.setPixelRatio(base * escala); redimensionar(); }
}
export const nivelEscolhido = () => (maxima ? 'maxima' : nivel);
export const maximaAtiva = () => maxima;
export const modoAuto = () => auto;
export function aoMudarNivel(fn) { aoMudar = fn; }
export function iniciar(renderer, scene, luzSol, ehToque) {
  R = renderer; cena = scene; sol = luzSol; toque = ehToque;
  let salvo = null; try { salvo = localStorage.getItem(CHAVE); auto = localStorage.getItem(CHAVE + '_auto') === '1'; } catch { /* sem armazenamento */ }
  if (!NIVEIS[salvo]) { salvo = sugerirNivel(); auto = true; try { localStorage.setItem(CHAVE, salvo); localStorage.setItem(CHAVE + '_auto', '1'); } catch { /* nada */ } }
  usar(salvo);
  aplicar();
}
function usar(n) { maxima = n === 'maxima'; nivel = maxima ? 'ultra' : n; }
// manual (menu ou conta): o jogo para de escolher sozinho
export function definirNivel(n, { automatico = false } = {}) {
  if (!NIVEIS[n]) return; usar(n);
  if (!automatico) auto = false;
  try { localStorage.setItem(CHAVE, n); localStorage.setItem(CHAVE + '_auto', auto ? '1' : '0'); } catch { /* nada */ }
  aplicar();
}
// ---- 22q: detecção do aparelho (primeira vez que abre): pela placa de vídeo, memória e núcleos. Depois, nos primeiros
// minutos, o FPS de verdade confirma (ver adaptar): se não aguentar, desce um nível sozinho.
export function infoGPU() {
  try { const gl = R.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info'); return String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || ''); } catch { return ''; }
}
function sugerirNivel() {
  const g = infoGPU(), mem = navigator.deviceMemory || 4, nuc = navigator.hardwareConcurrency || 4;
  if (/SwiftShader|llvmpipe|Software|Microsoft Basic/i.test(g)) return 'baixo';
  if (toque) {
    if (/Adreno \(TM\) (7[3-9]\d|8\d\d)|Adreno.*(7[3-9]\d|8\d\d)|Immortalis|Mali-G(7[7-9]|[7-9]\d\d)|Apple GPU|Xclipse/i.test(g) && mem >= 6) return 'alto';
    if (/Adreno.*[3-5]\d\d|Adreno.*6[0-1]\d|Mali-(4|T|G5[0-2])|PowerVR/i.test(g) || mem <= 3) return 'baixo';
    return 'medio';
  }
  if (/RTX|RX ?[67]\d{3}|RX ?9\d{3}|Radeon Pro|Apple M[1-9] (Pro|Max|Ultra)/i.test(g)) return 'maxima';
  if (/GTX ?(10[6-8]|16|9[78])|RX ?5[5-9]\d\d|RX ?5\d{3}|Arc|Apple M[1-9]/i.test(g)) return 'ultra';
  if (/Iris Xe|Radeon(\(TM\))? Graphics|Vega/i.test(g)) return 'alto';
  if (/Intel/i.test(g)) return 'medio';
  return nuc >= 8 && mem >= 8 ? 'alto' : 'medio';
}
let medida = { t: 0, n: 0, quedas: 0, espera: 6 };
function conferirAuto(dt) {   // em modo automático: média de FPS a cada 10 s; abaixo de 32 com a resolução já no mínimo, desce um nível
  if (!auto || medida.quedas >= 2) return;
  if (medida.espera > 0) { medida.espera -= dt; return; }   // começo da partida (carregando coisas): não conta
  medida.t += Math.min(dt, 0.5); medida.n++;
  if (medida.t < 10) return;
  const fps = medida.n / medida.t; medida.t = 0; medida.n = 0;
  if (fps < 32 && escala <= 0.61) {
    const i = ORDEM.indexOf(nivelEscolhido()); if (i <= 0) return;
    medida.quedas++; medida.espera = 4; escala = 1;
    definirNivel(ORDEM[i - 1], { automatico: true });
    aoMudar?.(ORDEM[i - 1]);
  }
}
function montarComposer() {
  if (comp || falhou) return;
  try {
    // 22p: com pós-processamento a imagem passa por uma textura: ela também ganha antisserrilhado (MSAA)
    const sz = R.getDrawingBufferSize(new THREE.Vector2());
    comp = new EffectComposer(R, new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: toque ? 2 : 4 }));
    passeRender = new RenderPass(cena, null);
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 1.0);
    // 21k: um pixel NaN/infinito (normal zerada, luz forte à noite) entrava no brilho e o desfoque espalhava pela tela
    // inteira, que piscava preta. O filtro do brilho agora joga esses pixels fora.
    { const m = bloom.materialHighPassFilter; if (m?.fragmentShader?.includes('vec4 texel = texture2D( tDiffuse, vUv );')) {
      m.fragmentShader = m.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv ); if ( isnan( texel.r ) || isnan( texel.g ) || isnan( texel.b ) || isinf( texel.r ) || isinf( texel.g ) || isinf( texel.b ) ) texel = vec4( 0.0 ); texel = min( texel, vec4( 32.0 ) );');
      m.needsUpdate = true; } }
    cor = new ShaderPass(COR);
    saida = new OutputPass();
    comp.addPass(passeRender);
    try { ao = new GTAOPass(cena, new THREE.PerspectiveCamera(), Math.max(256, sz.x / 2), Math.max(256, sz.y / 2)); ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 2, thickness: 0.8, scale: 1, samples: 16 }); ao.updatePdMaterial?.({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 }); ao.blendIntensity = 0.9;   // 22s: raio curto e "espessura" fina: sem a mancha escura em volta das mãos e de objetos finos ao.enabled = comAO || maxima;
      // placas, letreiros, partículas e vidros não entram na conta da sombra de contato (viravam manchas pretas); 22s: nem
      // os personagens (a conta não anima o esqueleto: o braço "parado em T" deixava uma sombra escura perto das mãos)
      ao.overrideVisibility = function () { const c = this._visibilityCache; this.scene.traverse((o) => { c.set(o, o.visible); if (o.isPoints || o.isLine || o.isSprite || o.isSkinnedMesh || (o.material && (o.material.transparent || o.material.depthWrite === false))) o.visible = false; }); };
      comp.addPass(ao); } catch (e) { console.warn('oclusão indisponível', e); ao = null; }
    comp.addPass(bloom); comp.addPass(saida); comp.addPass(cor);
    gotasP = new ShaderPass(GOTAS); gotasP.enabled = false; comp.addPass(gotasP);   // 22z4: gotas na tela (só com chuva)
  } catch (e) { console.warn('pós-processamento indisponível', e); falhou = true; comp = null; }
}
function aplicar() {
  if (!R) return;
  const dpr = window.devicePixelRatio || 1;
  const pr = nivel === 'baixo' ? 1 : nivel === 'medio' ? Math.min(dpr, toque ? 1.25 : 2) : nivel === 'ultra' ? Math.min(dpr, maxima ? 3 : 2.5) : Math.min(dpr, toque ? 1.5 : 2);   // celular na média: 1,25x (bem mais leve, quase a mesma nitidez)
  base = pr; R.setPixelRatio(pr * escala);
  R.shadowMap.type = nivel === 'baixo' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  // 21o: Alta e Ultra com ACES (filme: mais contraste e cor mais rica, brilho do sol sem estourar); Baixa e Média
  // seguem com o neutro (mais claro e leve de ler no celular)
  R.toneMapping = comEfeitos() ? THREE.ACESFilmicToneMapping : (THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping);
  R.toneMappingExposure = comEfeitos() ? 1.05 : 0.95;
  const tam = nivel === 'ultra' ? 4096 : nivel === 'alto' ? 2048 : 1024;
  if (sol && sol.shadow.mapSize.x !== tam) { sol.shadow.mapSize.set(tam, tam); sol.shadow.map?.dispose(); sol.shadow.map = null; }
  cena.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });   // troca do tipo de sombra
  if (comEfeitos()) montarComposer();
  if (ao) ao.enabled = comAO || maxima;
  nitidas();   // liga ou desliga o relevo e a nitidez do ultra
  redimensionar();
}
// filtro anisotrópico nas texturas (o chão, as ruas e as paredes não borram quando vistos de lado ou de longe):
// 22p: Média 4x, Alta 8x, Ultra 16x (antes só no Ultra)
const anisoFeito = new WeakMap();
// e relevo: a própria textura vira mapa de relevo (grama, asfalto, terra, calçada e paredes ganham volume com a luz)
export function nitidas() {
  if (!R) return;
  const ultra = nivel === 'ultra', max = R.capabilities.getMaxAnisotropy?.() || 1, alvoA = Math.min(max, ultra ? 16 : nivel === 'alto' ? 8 : nivel === 'medio' ? 4 : 1);
  cena.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    for (const m of [].concat(o.material || [])) {
      for (const k of ['map', 'normalMap', 'roughnessMap']) { const t = m[k]; if (t && anisoFeito.get(t) !== alvoA && (alvoA > 1 || anisoFeito.has(t))) { anisoFeito.set(t, alvoA); t.anisotropy = alvoA; t.needsUpdate = true; } }
      if (!m.isMeshStandardMaterial || m.transparent) continue;
      if (ultra && m.map && !m.normalMap && !m.bumpMap && m.roughness >= 0.8) { m.bumpMap = m.map; m.bumpScale = 1.6; m.userData.relevoUltra = true; m.needsUpdate = true; }
      else if (!ultra && m.userData.relevoUltra) { m.bumpMap = null; m.userData.relevoUltra = false; m.needsUpdate = true; }
    }
  });
}
// 22z4: f = 0..1 (força da chuva na lente). Só no Alto para cima (precisa do pós-processamento)
export function gotasTela(f, t) {
  if (!gotasP) return;
  gotasP.enabled = f > 0.02 && comEfeitos();
  if (gotasP.enabled) { const u = gotasP.uniforms; u.uF.value = f; u.uT.value = t; u.uAsp.value = window.innerWidth / Math.max(1, window.innerHeight); }
}
export function redimensionar() {
  if (!R) return;
  const w = window.innerWidth, h = window.innerHeight;
  R.setSize(w, h);
  if (comp) {
    comp.setPixelRatio(R.getPixelRatio()); comp.setSize(w, h);
    const div = 4;   // o brilho é borrado: dá para calcular em resolução menor
    bloom.resolution.set(Math.max(128, w / div), Math.max(128, h / div));
    bloom.setSize(Math.max(128, (w * R.getPixelRatio()) / div), Math.max(128, (h * R.getPixelRatio()) / div));
  }
}
// noite 0..1, molhado 0..1 (chuva)
export function ajustar(noite, molhado) {
  if (cor) {
    cor.uniforms.uTom.value.set(1.0 - 0.05 * noite, 1.0, 1.0 + 0.06 * noite);
    cor.uniforms.uSaturacao.value = 1.08 - 0.08 * molhado;
    cor.uniforms.uContraste.value = 1.04;
    cor.uniforms.uVinheta.value = 0.12 + 0.12 * noite;
  }
  if (bloom) {
    bloom.enabled = noite > 0.15;              // de dia desligado: nada branco vira mancha (e economiza)
    bloom.strength = 0.6 * noite;
    bloom.threshold = 0.85;
    bloom.radius = 0.4;
  }
}
export function render(camera) {
  if (!comEfeitos() || !comp) { R.render(cena, camera); return; }
  passeRender.camera = camera; if (ao) { ao.camera = camera; ao.enabled = comAO || maxima; }
  try { comp.render(); } catch (e) { console.warn('pós-processamento desligado', e); falhou = true; comp = null; R.render(cena, camera); }
}
