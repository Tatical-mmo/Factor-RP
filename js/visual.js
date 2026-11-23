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

export const NIVEIS = { baixo: 'Baixa', medio: 'Média', alto: 'Alta', ultra: 'Ultra' };
const comEfeitos = () => nivel === 'alto' || nivel === 'ultra';
const CHAVE = 'fator_qualidade';
let R = null, cena = null, sol = null, comp = null, passeRender = null, bloom = null, cor = null, saida = null, nivel = 'medio';
let toque = false, falhou = false;

// cor do filme: contraste, saturação, vinheta e um leve tom (quente de dia, azulado à noite)
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
export function iniciar(renderer, scene, luzSol, ehToque) {
  R = renderer; cena = scene; sol = luzSol; toque = ehToque;
  let salvo = null; try { salvo = localStorage.getItem(CHAVE); } catch { /* sem armazenamento */ }
  nivel = NIVEIS[salvo] ? salvo : 'medio';
  aplicar();
}
export function definirNivel(n) {
  if (!NIVEIS[n]) return; nivel = n;
  try { localStorage.setItem(CHAVE, n); } catch { /* nada */ }
  aplicar();
}
function montarComposer() {
  if (comp || falhou) return;
  try {
    comp = new EffectComposer(R);
    passeRender = new RenderPass(cena, null);
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 1.0);
    // 21k: um pixel NaN/infinito (normal zerada, luz forte à noite) entrava no brilho e o desfoque espalhava pela tela
    // inteira, que piscava preta. O filtro do brilho agora joga esses pixels fora.
    { const m = bloom.materialHighPassFilter; if (m?.fragmentShader?.includes('vec4 texel = texture2D( tDiffuse, vUv );')) {
      m.fragmentShader = m.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv ); if ( isnan( texel.r ) || isnan( texel.g ) || isnan( texel.b ) || isinf( texel.r ) || isinf( texel.g ) || isinf( texel.b ) ) texel = vec4( 0.0 ); texel = min( texel, vec4( 32.0 ) );');
      m.needsUpdate = true; } }
    cor = new ShaderPass(COR);
    saida = new OutputPass();
    comp.addPass(passeRender); comp.addPass(bloom); comp.addPass(saida); comp.addPass(cor);
  } catch (e) { console.warn('pós-processamento indisponível', e); falhou = true; comp = null; }
}
function aplicar() {
  if (!R) return;
  const dpr = window.devicePixelRatio || 1;
  const pr = nivel === 'baixo' ? 1 : nivel === 'medio' ? Math.min(dpr, toque ? 1.25 : 2) : nivel === 'ultra' ? Math.min(dpr, 2.5) : Math.min(dpr, toque ? 1.5 : 2);   // celular na média: 1,25x (bem mais leve, quase a mesma nitidez)
  R.setPixelRatio(pr);
  R.shadowMap.type = nivel === 'baixo' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  // 21o: Alta e Ultra com ACES (filme: mais contraste e cor mais rica, brilho do sol sem estourar); Baixa e Média
  // seguem com o neutro (mais claro e leve de ler no celular)
  R.toneMapping = comEfeitos() ? THREE.ACESFilmicToneMapping : (THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping);
  R.toneMappingExposure = comEfeitos() ? 1.05 : 0.95;
  const tam = nivel === 'ultra' ? 4096 : nivel === 'alto' ? 2048 : 1024;
  if (sol && sol.shadow.mapSize.x !== tam) { sol.shadow.mapSize.set(tam, tam); sol.shadow.map?.dispose(); sol.shadow.map = null; }
  cena.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });   // troca do tipo de sombra
  if (comEfeitos()) montarComposer();
  nitidas();   // liga ou desliga o relevo e a nitidez do ultra
  redimensionar();
}
// ultra: filtro anisotrópico nas texturas (o chão, as ruas e as paredes não borram quando vistos de lado ou de longe)
let anisoFeito = new WeakSet();
// e relevo: a própria textura vira mapa de relevo (grama, asfalto, terra, calçada e paredes ganham volume com a luz)
export function nitidas() {
  if (!R) return;
  const ultra = nivel === 'ultra', max = R.capabilities.getMaxAnisotropy?.() || 1;
  cena.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    for (const m of [].concat(o.material || [])) {
      if (ultra && max > 1) for (const k of ['map', 'normalMap', 'roughnessMap']) { const t = m[k]; if (t && !anisoFeito.has(t)) { anisoFeito.add(t); t.anisotropy = Math.min(16, max); t.needsUpdate = true; } }
      if (!m.isMeshStandardMaterial || m.transparent) continue;
      if (ultra && m.map && !m.normalMap && !m.bumpMap && m.roughness >= 0.8) { m.bumpMap = m.map; m.bumpScale = 1.6; m.userData.relevoUltra = true; m.needsUpdate = true; }
      else if (!ultra && m.userData.relevoUltra) { m.bumpMap = null; m.userData.relevoUltra = false; m.needsUpdate = true; }
    }
  });
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
  passeRender.camera = camera;
  try { comp.render(); } catch (e) { console.warn('pós-processamento desligado', e); falhou = true; comp = null; R.render(cena, camera); }
}
