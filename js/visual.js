// Visual "de cinema": brilho (bloom), correção de cor, vinheta, neblina e chão molhado na chuva.
// Três níveis de qualidade (escolha do jogador, guardada no aparelho):
//   baixo  → sem pós-processamento, sombra simples, resolução 1x (celular fraco)
//   medio  → brilho em meia resolução + cor + vinheta, sombra suave 1024
//   alto   → brilho mais fino, resolução até 2x, sombra 2048
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const NIVEIS = { baixo: 'Baixa', medio: 'Média', alto: 'Alta' };
const CHAVE = 'fator_qualidade';
let R = null, cena = null, sol = null, comp = null, passeRender = null, bloom = null, cor = null, saida = null, nivel = 'medio';
let toque = false, falhou = false;

// cor do filme: contraste, saturação, vinheta e um leve tom (quente de dia, azulado à noite)
const COR = {
  uniforms: {
    tDiffuse: { value: null }, uContraste: { value: 1.08 }, uSaturacao: { value: 1.12 },
    uVinheta: { value: 0.28 }, uTom: { value: new THREE.Vector3(1.03, 1.0, 0.96) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uContraste, uSaturacao, uVinheta; uniform vec3 uTom; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 v = c.rgb * uTom;
      float l = dot(v, vec3(0.2126, 0.7152, 0.0722));
      v = mix(vec3(l), v, uSaturacao);
      v = (v - 0.18) * uContraste + 0.18;
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
    cor = new ShaderPass(COR);
    saida = new OutputPass();
    comp.addPass(passeRender); comp.addPass(bloom); comp.addPass(cor); comp.addPass(saida);
  } catch (e) { console.warn('pós-processamento indisponível', e); falhou = true; comp = null; }
}
function aplicar() {
  if (!R) return;
  const dpr = window.devicePixelRatio || 1;
  const pr = nivel === 'baixo' ? 1 : nivel === 'medio' ? Math.min(dpr, toque ? 1.25 : 1.5) : Math.min(dpr, 2);
  R.setPixelRatio(pr);
  R.shadowMap.type = nivel === 'baixo' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  const tam = nivel === 'alto' ? 2048 : 1024;
  if (sol && sol.shadow.mapSize.x !== tam) { sol.shadow.mapSize.set(tam, tam); sol.shadow.map?.dispose(); sol.shadow.map = null; }
  cena.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });   // troca do tipo de sombra
  if (nivel !== 'baixo') montarComposer();
  redimensionar();
}
export function redimensionar() {
  if (!R) return;
  const w = window.innerWidth, h = window.innerHeight;
  R.setSize(w, h);
  if (comp) {
    comp.setPixelRatio(R.getPixelRatio()); comp.setSize(w, h);
    const div = nivel === 'alto' ? 2 : 3;   // o brilho é borrado: dá para calcular em resolução menor
    bloom.resolution.set(Math.max(128, w / div), Math.max(128, h / div));
    bloom.setSize(Math.max(128, (w * R.getPixelRatio()) / div), Math.max(128, (h * R.getPixelRatio()) / div));
  }
}
// noite 0..1, molhado 0..1 (chuva)
export function ajustar(noite, molhado) {
  if (cor) {
    cor.uniforms.uTom.value.set(1.03 - 0.1 * noite, 1.0 - 0.02 * noite, 0.96 + 0.1 * noite);
    cor.uniforms.uSaturacao.value = 1.12 - 0.12 * molhado - 0.08 * noite;
    cor.uniforms.uContraste.value = 1.08 + 0.04 * noite;
    cor.uniforms.uVinheta.value = 0.26 + 0.14 * noite;
  }
  if (bloom) {
    bloom.strength = 0.18 + 0.75 * noite + 0.15 * molhado;   // de dia quase nada; à noite postes, janelas e faróis brilham
    bloom.threshold = 0.95 - 0.35 * noite;
    bloom.radius = 0.5;
  }
}
export function render(camera) {
  if (nivel === 'baixo' || !comp) { R.render(cena, camera); return; }
  passeRender.camera = camera;
  try { comp.render(); } catch (e) { console.warn('pós-processamento desligado', e); falhou = true; comp = null; R.render(cena, camera); }
}
