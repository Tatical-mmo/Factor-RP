// Arquitetura procedural (21q): fachadas desenhadas no shader em metros reais (a janela nunca estica e não existe
// janela na quina), telhado cerâmico, telha metálica e peças comuns (muro, concertina, caixa d'água...).
// Usado pela cidade inteira (InstancedMesh com o estilo por instância) e pelos prédios especiais (casas dos jogadores,
// empresas, quartel, Marinha, Aeronáutica e aeroporto).
//
// Estilos: 0 prédio (térreo com lojas) · 1 casa (reboco) · 2 favela (tijolo baiano) · 3 galpão (telha metálica)
//          4 militar (creme, barrado verde-oliva) · 5 pele de vidro · 6 naval (branco, barrado azul-marinho)
import * as THREE from 'three';

export const ESTILO = { predio: 0, casa: 1, favela: 2, metal: 3, militar: 4, vidro: 5, naval: 6 };
let NOITE = { value: 0 };
export function ligarNoite(u) { NOITE = u; }
// 22q: "realismo" (prévia): manchas de reboco, escorrido de chuva e sujeira no pé das paredes (0 desliga, 1 liga)
export const REAL = { value: 0 };   // o uniform uNoite do mundo (0 dia, 1 noite)

// parâmetros de cada estilo: térreo, altura do andar, largura do vão, pilar do canto
const PAR = [
  [4.6, 3.3, 2.7, 1.3], [0.0, 3.0, 3.0, 0.45], [0.0, 2.9, 2.6, 0.3], [4.6, 3.3, 5.0, 0.6],
  [0.0, 3.2, 3.4, 0.6], [4.6, 3.6, 1.5, 0.0], [0.0, 3.3, 3.2, 0.8],
];
const vec4 = (a) => `vec4(${a.map((v) => v.toFixed(2)).join(',')})`;

// attr: InstancedMesh com os atributos aEstilo (float) e aInfo (frente 0..3, base em m, loja 0/1)
export function materialFachada({ estilo = 0, attr = false, porta = null, loja = 1, par = null, cor = '#ffffff' } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.85, metalness: 0 });
  const e = typeof estilo === 'string' ? ESTILO[estilo] : estilo;
  const P = par ? { ...Object.fromEntries(['t', 'a', 'b', 'p'].map((k, i) => [k, PAR[e][i]])), ...par } : null;
  const uPar = new THREE.Vector4(...(P ? [P.t, P.a, P.b, P.p] : PAR[e]));
  const uPorta = porta === null ? (e === 1 || e === 3 || e === 4 || e === 6 ? 1 : 0) : (porta ? 1 : 0);
  m.onBeforeCompile = (s) => {
    s.uniforms.uNoite = NOITE; s.uniforms.uReal = REAL; s.uniforms.uEst = { value: e }; s.uniforms.uPar = { value: uPar }; s.uniforms.uPorta = { value: uPorta }; s.uniforms.uLoja = { value: loja };
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
      varying vec3 vLoc; varying vec3 vNl; flat varying vec3 vEsc; flat varying float vSeed; flat varying float vEst; flat varying vec3 vInfo;
      ${attr ? 'attribute float aEstilo; attribute vec3 aInfo;' : 'uniform float uEst; uniform float uLoja;'}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vLoc = position; vNl = normal;
      mat4 mmF = modelMatrix;
      #ifdef USE_INSTANCING
        mmF = modelMatrix * instanceMatrix;
      #endif
      vEsc = vec3(length(mmF[0].xyz), length(mmF[1].xyz), length(mmF[2].xyz));
      vSeed = fract(sin(dot(mmF[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
      ${attr ? 'vEst = aEstilo; vInfo = aInfo;' : 'vEst = uEst; vInfo = vec3(0.0, 0.0, uLoja);'}`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uNoite; uniform float uReal; uniform vec4 uPar; uniform float uPorta;
      varying vec3 vLoc; varying vec3 vNl; flat varying vec3 vEsc; flat varying float vSeed; flat varying float vEst; flat varying vec3 vInfo;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float caixa(vec2 p, vec2 a, vec2 b){ vec2 q = step(a, p) * step(p, b); return q.x * q.y; }
      float ruido(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      vec3 tijoloCor(float u, float y, float fx){
        float lin = floor(y / 0.2), cu = u / 0.4 + lin * 0.5; vec3 t = mix(vec3(0.62, 0.3, 0.17), vec3(0.74, 0.4, 0.22), h21(vec2(floor(cu), lin)));
        float junta = step(fract(y / 0.2), 0.1) + step(fract(cu), 0.04); t = mix(t, vec3(0.55, 0.52, 0.48), clamp(junta, 0.0, 1.0));
        return mix(t, vec3(0.66, 0.37, 0.21), fx);   // de longe vira a cor média (sem chiado)
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float vidro = 0.0, aceso = 0.0, moldura = 0.0, metalico = 0.0;
      int E = int(vEst + 0.5);
      ${attr ? `vec4 par = E == 0 ? ${vec4(PAR[0])} : E == 1 ? ${vec4(PAR[1])} : E == 2 ? ${vec4(PAR[2])} : E == 3 ? ${vec4(PAR[3])} : E == 4 ? ${vec4(PAR[4])} : E == 5 ? ${vec4(PAR[5])} : ${vec4(PAR[6])};
      float temPorta = (E == 1 || E == 3 || E == 4 || E == 6) ? 1.0 : 0.0;` : 'vec4 par = uPar; float temPorta = uPorta;'}
      vec3 parede = diffuseColor.rgb;
      if (abs(vNl.y) < 0.5) {
        int fi = vNl.z > 0.5 ? 0 : vNl.z < -0.5 ? 1 : vNl.x > 0.5 ? 2 : 3;
        float frente = fi == int(vInfo.x + 0.5) ? 1.0 : 0.0;
        float larg = abs(vNl.x) > 0.5 ? vEsc.z : vEsc.x;
        float u = (abs(vNl.x) > 0.5 ? vLoc.z * sign(vNl.x) : -vLoc.x * sign(vNl.z)) * larg + larg * 0.5;
        float base = vInfo.y, y = vLoc.y * vEsc.y - base, alt = vEsc.y - base;
        float fx = clamp(max(fwidth(u), fwidth(y)) * 3.0 - 0.6, 0.0, 1.0);
        float terreo = vInfo.z > 0.5 ? par.x : 0.0, andar = par.y, bay = par.z, pil = par.w;
        float nb = max(1.0, floor((larg - 2.0 * pil) / bay)), sobra = (larg - nb * bay) * 0.5;
        float bu = u - sobra, i = floor(bu / bay), f = fract(bu / bay) * bay, dentro = step(sobra, u) * step(u, larg - sobra);
        vec3 cor = parede;
        // ---- paredes
        if (E == 2) {
          float reb = step(0.45, vSeed) * step(ruido(vec2(u * 0.35, y * 0.5) + vSeed * 9.0), 0.62 + 0.25 * (1.0 - y / max(alt, 1.0)));
          cor = mix(tijoloCor(u, y, fx), parede * (0.85 + 0.15 * ruido(vec2(u, y) * 1.3)), reb);
          cor = mix(cor, vec3(0.6, 0.6, 0.58), step(fract(y / 2.9), 0.09) * (1.0 - fx));
        } else if (E == 3) {
          float onda = 0.5 + 0.5 * sin(u * 6.2832 / 0.25); cor = parede * (0.82 + 0.18 * mix(onda, 0.5, fx)); metalico = 1.0;
        } else if (E != 5) cor *= 0.94 + 0.06 * ruido(vec2(u * 0.6, y * 0.05));
        cor *= 0.86 + 0.14 * smoothstep(0.0, 8.0, y);   // sujeira perto do chão
        if (y < 0.0) {
          // alicerce (casas no barranco): bloco sem janela
          cor = E == 2 ? tijoloCor(u, y, fx) * 0.85 : parede * 0.7;
        } else if (E == 0) {
          float topo = alt - 0.9;
          if (y < terreo) {
            cor = parede * 0.72;
            if (dentro > 0.5) {
              float vit = caixa(vec2(f, y), vec2(0.25, 0.45), vec2(bay - 0.25, terreo - 1.0));
              vidro = vit; moldura = vit * (1.0 - caixa(vec2(f, y), vec2(0.33, 0.53), vec2(bay - 0.33, terreo - 1.08)));
              aceso = vit * step(0.3, h21(vec2(i, vSeed * 91.0)));
              if (y > terreo - 0.95 && y < terreo - 0.25) {   // letreiro: uma cor por loja (3 vãos), sem chiado
                float rl = h21(vec2(floor(i / 3.0) + float(fi) * 17.0, vSeed * 33.0));
                cor = rl < 0.25 ? vec3(0.62, 0.12, 0.10) : rl < 0.5 ? vec3(0.10, 0.28, 0.45) : rl < 0.75 ? vec3(0.13, 0.4, 0.22) : vec3(0.85, 0.62, 0.12);
              }
            }
          } else if (y > topo) { cor = parede * 1.1; }
          else {
            float yy = y - terreo, k = floor(yy / andar), fy = fract(yy / andar) * andar;
            vec2 a = vec2(0.55, 0.85), b = vec2(bay - 0.55, andar - 0.45);
            float jan = dentro * caixa(vec2(f, fy), a, b), jin = dentro * caixa(vec2(f, fy), a + 0.09, b - 0.09);
            moldura = jan - jin; float div = step(abs(f - bay * 0.5), 0.035); vidro = jin * (1.0 - div); moldura = max(moldura, jin * div);
            cor = mix(cor, parede * 0.8, step(fy, 0.3) * (1.0 - jan));
            cor = mix(cor, parede * 1.08, dentro * caixa(vec2(f, fy), vec2(a.x - 0.12, a.y - 0.14), vec2(b.x + 0.12, a.y)));
            aceso = step(0.62, h21(vec2(i + vSeed * 13.0, k)));
            if (u < sobra || u > larg - sobra) cor *= 0.93;
          }
        } else if (E == 1 || E == 4 || E == 6) {
          float fy = mod(y - 0.4, andar), k = floor((y - 0.4) / andar);
          vec2 a = vec2(bay * 0.22, 0.95), b = vec2(bay * 0.78, 2.35);
          float jan = dentro * caixa(vec2(f, fy), a, b) * step(y, alt - 0.4) * step(0.4, y), jin = jan * caixa(vec2(f, fy), a + 0.1, b - 0.1);
          float portaV = frente * step(abs(i - floor(nb * 0.5)), 0.5) * step(y, andar + 0.4) * temPorta;
          float porta = portaV * caixa(vec2(f, y), vec2(bay * 0.3, 0.0), vec2(bay * 0.7, 2.3));
          jan *= 1.0 - portaV; jin *= 1.0 - portaV;
          moldura = jan - jin + porta * (1.0 - caixa(vec2(f, y), vec2(bay * 0.34, 0.0), vec2(bay * 0.66, 2.22)));
          float div = step(abs(f - bay * 0.5), 0.04) + step(abs(fy - (a.y + b.y) * 0.5), 0.03);
          vidro = jin * (1.0 - clamp(div, 0.0, 1.0)); moldura = max(moldura, jin * clamp(div, 0.0, 1.0));
          aceso = step(0.5, h21(vec2(i + vSeed * 13.0, k)));
          if (E == 4) { cor = mix(cor, vec3(0.2, 0.3, 0.17), max(step(y, 1.0), step(alt - 0.5, y))); }
          else if (E == 6) { cor = mix(cor, vec3(0.1, 0.2, 0.42), max(step(y, 0.9), step(alt - 0.6, y))); }
          else cor = mix(cor, parede * 0.7, step(y, 0.45));
          cor = mix(cor, E == 1 ? vec3(0.36, 0.22, 0.13) : vec3(0.24, 0.26, 0.22), porta * (1.0 - moldura));
        } else if (E == 2) {
          float fy = mod(y, 2.9), k = floor(y / 2.9);
          float tem = step(0.35, h21(vec2(i * 1.3 + vSeed, k)));
          vec2 a = vec2(bay * 0.25, 1.0), b = vec2(bay * 0.75, 2.1);
          float jan = dentro * tem * caixa(vec2(f, fy), a, b) * step(y, alt - 0.5), jin = jan * caixa(vec2(f, fy), a + 0.07, b - 0.07);
          moldura = jan - jin; vidro = jin;
          float grade = jin * step(0.5, h21(vec2(i, k + 3.0))) * (step(fract(f / 0.14), 0.18) + step(fract(fy / 0.3), 0.1));
          moldura = max(moldura, clamp(grade, 0.0, 1.0)); vidro *= 1.0 - clamp(grade, 0.0, 1.0);
          float porta = frente * step(k, 0.5) * step(abs(i - floor(nb * 0.5)), 0.5) * caixa(vec2(f, fy), vec2(bay * 0.25, 0.0), vec2(bay * 0.75, 2.15));
          cor = mix(cor, mix(vec3(0.25, 0.3, 0.32), vec3(0.45, 0.2, 0.15), step(0.5, vSeed)) * (0.8 + 0.2 * step(fract(fy / 0.25), 0.5)), porta); moldura *= 1.0 - porta; vidro *= 1.0 - porta;
          aceso = step(0.45, h21(vec2(i + vSeed * 7.0, k)));
        } else if (E == 3) {
          float pt = min(max(par.x, 3.0), 5.0);
          float porta = frente * temPorta * dentro * caixa(vec2(f, y), vec2(0.6, 0.0), vec2(bay - 0.6, pt));
          cor = mix(cor, vec3(0.62, 0.64, 0.66) * (0.85 + 0.15 * step(fract(y / 0.12), 0.5)), porta);
          moldura = porta * (1.0 - caixa(vec2(f, y), vec2(0.75, 0.0), vec2(bay - 0.75, pt - 0.15)));
          float faixa = dentro * caixa(vec2(f, y), vec2(0.2, alt - 2.0), vec2(bay - 0.2, alt - 0.9)) * step(pt + 1.0, alt - 2.0);
          vidro = faixa * (1.0 - step(abs(f - bay * 0.5), 0.05));
          aceso = 1.0;
        } else if (E == 5) {
          float mont = step(fract(u / 1.5), 0.04), lj = step(mod(y, andar), 0.45);
          vidro = (1.0 - mont) * (1.0 - lj); moldura = mont * (1.0 - lj); cor = mix(cor, parede * 0.55, lj);
          aceso = step(0.25, h21(vec2(floor(u / 1.5) + vSeed * 5.0, floor(y / andar))));
        }
        vec3 corVidro = mix(vec3(0.05, 0.08, 0.12), vec3(0.34, 0.48, 0.62), clamp(vLoc.y * 0.5 + 0.25 + (h21(vec2(floor(u / 2.0), floor(y / 3.0))) - 0.5) * 0.35, 0.0, 1.0));
        if (E == 5) corVidro = mix(vec3(0.1, 0.16, 0.2), vec3(0.45, 0.6, 0.72), clamp(vLoc.y * 0.8, 0.0, 1.0));
        float tomL = h21(vec2(floor(u / 2.7) + vSeed, floor(y / 3.0)));
        corVidro = mix(corVidro, mix(vec3(1.0, 0.74, 0.42), vec3(0.85, 0.9, 1.0), step(0.75, tomL)) * (0.55 + 0.5 * tomL), aceso * uNoite);
        cor = mix(cor, corVidro, vidro);
        vec3 cm = E == 1 ? vec3(0.95, 0.94, 0.9) : E == 2 ? vec3(0.18, 0.18, 0.19) : (E == 4 || E == 6) ? vec3(0.92, 0.9, 0.84) : vec3(0.2, 0.21, 0.22);
        cor = mix(cor, cm, moldura * 0.95);
        if (uReal > 0.5) {   // 22q: reboco irregular, escorridos de chuva, pé da parede e beirada da laje mais sujos
          float nA = ruido(vec2(u, y) * 0.45 + vSeed * 31.0), nB = mix(ruido(vec2(u, y) * 2.3 + 7.0), 0.5, fx);
          float esc = smoothstep(0.5, 0.9, ruido(vec2(u * 1.1 + vSeed * 17.0, y * 0.08))) * (0.6 + 0.4 * ruido(vec2(u * 3.0, y * 0.5)));
          float pe = 1.0 - smoothstep(0.0, 1.6, vLoc.y * vEsc.y), sob = smoothstep(alt - 0.7, alt, y);
          float k = 1.0 + (nA - 0.5) * 0.26 + (nB - 0.5) * 0.12 - (esc * 0.24 + sob * 0.12) * (1.0 - vidro) - pe * 0.34;
          cor = mix(cor, vec3(dot(cor, vec3(0.3, 0.59, 0.11))) * vec3(1.02, 0.97, 0.9), 0.12 * (1.0 - vidro)) * k;
        }
        diffuseColor.rgb = cor;
      } else if (E == 3) {   // telha metálica ondulada em cima
        float ut = vLoc.x * vEsc.x, fxt = clamp(fwidth(ut) * 6.0 - 0.5, 0.0, 1.0);
        diffuseColor.rgb = parede * mix(0.8 + 0.2 * (0.5 + 0.5 * sin(ut * 25.13)), 0.9, fxt); metalico = 1.0;
      } else diffuseColor.rgb = E == 2 ? vec3(0.55, 0.55, 0.53) : E == 5 ? vec3(0.25, 0.27, 0.3) : vec3(0.42, 0.42, 0.41);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(mix(roughnessFactor, 0.4, metalico), 0.06, vidro);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(mix(metalnessFactor, 0.55, metalico), 0.35, vidro);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * aceso * vidro * uNoite * 0.9;`);
  };
  m.customProgramCacheKey = () => `fachada21q-${attr ? 'attr' : 'un'}`;
  m.userData.semUltra = true;
  const obc = m.onBeforeCompile, key = m.customProgramCacheKey;   // clone() do three não copia o shader: este copia
  m.clone = function () { const c = THREE.MeshStandardMaterial.prototype.clone.call(this); c.onBeforeCompile = obc; c.customProgramCacheKey = key; c.clone = m.clone; return c; };   // o "prédio ultra" do visual.js não mexe aqui
  return m;
}

// telhado cerâmico por instância (prisma da cidade, cumeeira em X): telha colonial em metros reais, oitão claro
export function materialTelhaCidade() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocT; varying vec3 vNlT; varying vec3 vEscT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vLocT = position; vNlT = normal; mat4 mmT = modelMatrix;
      #ifdef USE_INSTANCING
        mmT = modelMatrix * instanceMatrix;
      #endif
      vEscT = vec3(length(mmT[0].xyz), length(mmT[1].xyz), length(mmT[2].xyz));`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocT; varying vec3 vNlT; varying vec3 vEscT;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (abs(vNlT.x) > 0.6) diffuseColor.rgb = vec3(0.86, 0.83, 0.76);
      else {
        float u = vLocT.x * vEscT.x, v = vLocT.z * vEscT.z + vLocT.y * vEscT.y;
        float fv = fract(v / 0.42), fu = fract((u + step(0.5, fract(v / 0.84)) * 0.11) / 0.22);
        float fx = clamp(fwidth(u) * 8.0 - 0.5, 0.0, 1.0);
        float onda = mix(0.72 + 0.28 * sin(fu * 3.1416), 0.86, fx) * mix(1.0 - 0.28 * smoothstep(0.82, 1.0, fv), 0.93, fx);
        diffuseColor.rgb *= onda * (0.93 + 0.07 * fract(sin(dot(floor(vec2(u / 0.22, v / 0.42)), vec2(12.9, 78.2))) * 43758.5));
      }`);
  };
  m.customProgramCacheKey = () => 'telha21q';
  return m;
}

// ---------------------------------------------------------------- peças (para grupos)
const GEO = { cubo: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0) };
const cacheMat = new Map(), cacheStd = new Map();
// cada construção usa materiais próprios (o jogo deixa o prédio transparente quando ele tapa o jogador)
export function novoCache() { cacheMat.clear(); cacheStd.clear(); }
export function matFachada(estilo, cor, opts = {}) {
  const k = estilo + '|' + cor + '|' + JSON.stringify(opts);
  if (!cacheMat.has(k)) cacheMat.set(k, materialFachada({ estilo, cor, ...opts }));
  return cacheMat.get(k);
}
export function std(cor, rough = 0.85, metal = 0, extra = null) {
  const k = cor + rough + '|' + metal + (extra ? JSON.stringify(extra) : '');
  if (!cacheStd.has(k)) cacheStd.set(k, new THREE.MeshStandardMaterial({ color: cor, roughness: rough, metalness: metal, ...(extra || {}) }));
  return cacheStd.get(k);
}
// caixa com a base em y (fachada desenhada certo em qualquer tamanho)
export function bloco(g, mat, x, y, z, w, h, d, rot = 0) {
  const m = new THREE.Mesh(GEO.cubo, mat); m.position.set(x, y, z); m.scale.set(w, h, d); m.rotation.y = rot;
  m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
export function cil(g, mat, x, y, z, r, h, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg).translate(0, h / 2, 0), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
export function muro(g, x0, z0, x1, z1, h = 2.2, cor = '#d8d0c0', y = 0) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  return bloco(g, std(cor, 0.9), (x0 + x1) / 2, y, (z0 + z1) / 2, L, h, 0.25, -Math.atan2(z1 - z0, x1 - x0));
}
let TELHA = null;
function texTelha() {
  if (TELHA) return TELHA;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = -1; x < 9; x++) {
    const ox = x * 32 + (y % 2) * 16, gr = g.createLinearGradient(ox, 0, ox + 32, 0), c = (Math.sin(x * 12.9 + y * 7.1) * 0.5 + 0.5) * 0.15;
    gr.addColorStop(0, '#7a3418'); gr.addColorStop(0.5, '#b5532f'); gr.addColorStop(1, '#7a3418'); g.fillStyle = gr; g.fillRect(ox, y * 32, 32, 32);
    g.fillStyle = `rgba(0,0,0,${0.18 + c})`; g.fillRect(ox, y * 32 + 28, 32, 4);
  }
  TELHA = new THREE.CanvasTexture(cv); TELHA.wrapS = TELHA.wrapT = THREE.RepeatWrapping; TELHA.colorSpace = THREE.SRGBColorSpace; TELHA.anisotropy = 4;
  return TELHA;
}
// telhado de 2 águas (cumeeira em X) com oitões; y = topo da parede
export function telhado(g, x, y, z, w, d, rot = 0, cor = '#ffffff', oitao = '#e9e2d2') {
  const t = new THREE.Group(), al = Math.min(w, d) * 0.28;
  const tx = texTelha().clone(); tx.repeat.set(w / 2, d / 2.2); tx.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.75, color: cor });
  const ang = Math.atan2(al, d / 2), L = Math.hypot(al, d / 2) + 0.5;
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.12, L), mat); p.position.set(0, al / 2, s * (L / 2 * Math.cos(ang) - 0.05)); p.rotation.x = s * ang; p.castShadow = p.receiveShadow = true; t.add(p); }
  const oit = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, al)]);
  const mo = std(oitao, 0.9, 0, { side: THREE.DoubleSide });
  for (const s of [-1, 1]) { const o = new THREE.Mesh(new THREE.ShapeGeometry(oit), mo); o.rotation.y = Math.PI / 2; o.position.x = s * w / 2; t.add(o); }
  t.position.set(x, y, z); t.rotation.y = rot; g.add(t); return t;
}
// telha metálica (galpão): duas águas bem baixas, ondulada no shader do estilo metal
export function telhadoMetal(g, x, y, z, w, d, cor = '#9da3a8', rot = 0) {
  const t = new THREE.Group(), al = d * 0.08, L = Math.hypot(al, d / 2) + 0.3, ang = Math.atan2(al, d / 2);
  const M = matFachada('metal', cor, { porta: false });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(GEO.cubo, M); p.scale.set(w + 0.6, 0.1, L); p.position.set(0, al / 2 - 0.05, s * L / 2 * Math.cos(ang)); p.rotation.x = s * ang; p.castShadow = p.receiveShadow = true; t.add(p); }
  bloco(t, std('#d9dcdf', 0.5, 0.4), 0, -0.05, 0, w, al, 0.2).scale.z = d * 0.98;   // oitões fechados
  t.position.set(x, y, z); t.rotation.y = rot; g.add(t); return t;
}
// arame de concertina (linhas) em cima de um muro
export function concertina(g, trechos, y) {
  const p = [];
  for (const [x0, z0, x1, z1] of trechos) {
    const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    for (let t = 0; t < L; t += 0.35) for (let k = 0; k < 6; k++) {
      const a0 = k / 6 * 6.283, a1 = (k + 1) / 6 * 6.283, r = 0.35;
      const P = (a, tt) => new THREE.Vector3(x0 + ux * tt - uz * Math.cos(a) * r, y + r + Math.sin(a) * r, z0 + uz * tt + ux * Math.cos(a) * r);
      p.push(P(a0, t + k / 6 * 0.35), P(a1, t + (k + 1) / 6 * 0.35));
    }
  }
  const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(p), new THREE.LineBasicMaterial({ color: '#9a9a9a' })); g.add(l); return l;
}
export function caixaDagua(g, x, y, z, r = 0.75) { cil(g, std('#2d6fb5', 0.5), x, y, z, r, 1.0); cil(g, std('#2d6fb5', 0.5), x, y + 1.0, z, r + 0.07, 0.1); }
// placa de letreiro (canvas) presa na fachada
export function letreiro(g, txt, x, y, z, w, h, fundo = '#f3c21c', cor = '#1b1b1b', rot = 0) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.max(64, Math.round(512 * h / w)); const c = cv.getContext('2d');
  c.fillStyle = fundo; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = cor; c.font = `bold ${Math.round(cv.height * 0.55)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 256, cv.height / 2, 490);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.15), [std(fundo), std(fundo), std(fundo), std(fundo), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.15 }), std(fundo)]);
  m.position.set(x, y, z); m.rotation.y = rot; g.add(m); return m;
}

// ---------------------------------------------------------------- casa do jogador (lote 19 x 19, frente em +Z)
// nível 1 casa · 2 sobrado com garagem · 3 condomínio · 4 residencial · 5 torre. modelo (simples/sobrado/mansao) muda a cor.
export function casaJogador(g, nivel, modelo = 'simples') {
  novoCache();
  const C = { simples: ['#f0dfc0', '#e8c7a8'], sobrado: ['#d6e4ee', '#cfdde6'], mansao: ['#f7f4ec', '#e9e3d6'] }[modelo] || ['#f0dfc0', '#e8c7a8'];
  const F = (cor) => matFachada('casa', cor, { par: { a: 3.0, b: 3.2, p: 0.4 } });
  const FR = (cor) => matFachada('predio', cor, { par: { t: 3.4, a: 3.0, b: 3.0, p: 1.0 } });
  const metal = std('#3a3d42', 0.45, 0.6), branco = std('#efe9dc'), guarda = new THREE.MeshStandardMaterial({ color: '#9fc0d8', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.5 });
  const grama = std('#5f8a3c', 0.95);
  bloco(g, grama, 0, 0, 0, 18.6, 0.04, 18.6).receiveShadow = true;
  bloco(g, std('#a6a29a', 0.9), 2.5, 0.02, 7.8, 3.2, 0.04, 3.4);   // caminho até a porta
  const muroBaixo = (h, cor = '#e6dccb') => { muro(g, -9.2, 9.2, -2, 9.2, h, cor); muro(g, 2, 9.2, 9.2, 9.2, h, cor); muro(g, -9.2, -9.2, 9.2, -9.2, h, cor); muro(g, -9.2, -9.2, -9.2, 9.2, h, cor); muro(g, 9.2, -9.2, 9.2, 9.2, h, cor); bloco(g, metal, 0, 0, 9.2, 4, Math.min(h, 1.5), 0.06); };
  let topo = 3.2;
  if (nivel <= 1) {
    bloco(g, F(C[0]), 0, 0, -1, 10, 3.2, 8); telhado(g, 0, 3.2, -1, 10.6, 8.6);
    bloco(g, branco, 0, 2.7, 4.1, 10.4, 0.18, 2.0); for (const dx of [-4.6, 4.6]) bloco(g, std('#6b4a2e', 0.7), dx, 0, 4.9, 0.2, 2.7, 0.2);   // varanda
    muroBaixo(1.2);
    topo = 6;
  } else if (nivel === 2) {
    bloco(g, F(C[0]), -1.5, 0, -2, 11, 6.2, 9); telhado(g, -1.5, 6.2, -2, 11.6, 9.6, 0, '#cfd6d6');
    bloco(g, std('#b9b4aa', 0.85), 6.4, 0, 3, 4.8, 3.0, 6); bloco(g, branco, 6.4, 3.0, 3, 5.2, 0.25, 6.4); bloco(g, std('#5d636b', 0.6, 0.4), 6.4, 0, 6.02, 4, 2.6, 0.06);   // garagem
    bloco(g, branco, -3.5, 3.1, 3.3, 6, 0.2, 1.6); for (let k = 0; k < 7; k++) bloco(g, metal, -6.5 + k, 3.3, 4.05, 0.05, 1.0, 0.05); bloco(g, metal, -3.5, 4.3, 4.05, 6, 0.06, 0.06);   // varanda com grade
    muroBaixo(2.0);
    topo = 9;
  } else if (nivel === 3) {
    for (let k = 0; k < 3; k++) { const x = -6 + k * 6; bloco(g, F(['#f2e3c6', '#e8c7a8', '#dfe6d6'][k]), x, 0, -2, 5.8, 6.2, 9); telhado(g, x, 6.2, -2, 6.2, 9.6); }
    muroBaixo(1.6, '#cfc6b6');
    bloco(g, F('#e8e0cf'), -6.8, 0, 7.2, 2.6, 2.6, 2.4); bloco(g, std('#3b3f44'), -6.8, 2.6, 7.2, 3, 0.2, 2.8);   // portaria
    topo = 10;
  } else {
    const andares = nivel === 4 ? 6 : 14, h = 3.4 + (andares - 1) * 3.0 + 0.9, cor = nivel === 4 ? '#e4cfb0' : '#a9b8c8';
    bloco(g, FR(cor), 0, 0, -2, 15, h, 11.5);
    bloco(g, std('#d9d2c4', 0.8), 0, h, -2, 15.5, 0.45, 12);   // platibanda
    for (let a = 1; a < andares; a++) for (let k = 0; k < 4; k++) {
      const x = -5.6 + k * 3.75, y = 3.4 + a * 3.0 - 0.3;
      bloco(g, branco, x, y, 4.45, 2.8, 0.2, 1.4); bloco(g, guarda, x, y + 0.2, 5.12, 2.8, 1.0, 0.05);
    }
    bloco(g, new THREE.MeshStandardMaterial({ color: '#2a3d50', roughness: 0.05, metalness: 0.4 }), 0, 0, 3.8, 4.5, 2.6, 0.1);   // portaria de vidro
    bloco(g, std('#3b3f44'), 0, 2.9, 5.2, 7, 0.25, 3);   // marquise
    bloco(g, std('#8e9196'), 4, h + 0.45, -5, 3, 2, 3); bloco(g, std('#6b7075', 0.6, 0.3), -4, h + 0.45, -4, 2.4, 1.4, 2.4);   // caixa d'água e casa de máquinas
    if (nivel >= 5) { const j = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 5), std('#5b8c3e', 1)); j.position.set(0, h + 0.6, -1); g.add(j); }
    muroBaixo(1.4, '#cfc6b6');
    topo = h + 3;
  }
  // árvore no jardim
  if (nivel <= 3) { cil(g, std('#5a3f28'), -7.2, 0, 6.6, 0.16, 2.0, 7); const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), std('#4f7d36', 0.9)); c.position.set(-7.2, 2.9, 6.6); c.castShadow = true; g.add(c); }
  return topo;
}

// ---------------------------------------------------------------- bases e aeroporto
// hangar em arco (meia abóbada de chapa), aberto em +Z; base no chão, centrado em x, z
export function hangarArco(g, x, y, z, w, d, h, rot = 0, cor = '#a7adb2') {
  const t = new THREE.Group(), chapa = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.42, metalness: 0.6, side: THREE.DoubleSide });
  const arco = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 36, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), chapa);
  arco.scale.y = h / (w / 2); arco.castShadow = arco.receiveShadow = true; t.add(arco);
  const fundo = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 36, 0, Math.PI), std('#8e949a', 0.6, 0.4, { side: THREE.DoubleSide }));
  fundo.scale.y = h / (w / 2); fundo.position.z = -d / 2; t.add(fundo);
  // nervuras e a viga da boca
  for (let k = 0; k <= 6; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.05, 0.12, 4, 36, Math.PI), std('#6f767d', 0.5, 0.5)); r.scale.y = h / (w / 2); r.position.z = -d / 2 + k * d / 6; t.add(r); }
  const boca = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.1, 0.35, 6, 36, Math.PI), std('#e7e3da', 0.6)); boca.scale.y = h / (w / 2); boca.position.z = d / 2; t.add(boca);
  t.position.set(x, y, z); t.rotation.y = rot; g.add(t); return t;
}
// torre de controle: fuste cilíndrico, cabine de vidro inclinado, laje e antena; topo em y + h
export function torreControle(g, x, y, z, h, cor = '#e6e2d8') {
  const t = new THREE.Group(), fuste = h - 4.2;
  cil(t, std(cor, 0.8), 0, 0, 0, 2.6, fuste, 20);
  for (let k = 1; k < fuste / 3.2; k++) cil(t, std('#2a3d50', 0.1, 0.4), 0, k * 3.2, 0, 2.62, 0.5, 20);   // janelinhas da escada
  cil(t, std('#d9d4c8', 0.8), 0, fuste, 0, 4.4, 0.4, 16);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 3.7, 3.2, 12, 1, true).translate(0, 1.6, 0), new THREE.MeshStandardMaterial({ color: '#2a4458', roughness: 0.05, metalness: 0.6, emissive: '#10202c', side: THREE.DoubleSide }));
  cab.position.y = fuste + 0.4; t.add(cab);
  cil(t, std('#3a3d42', 0.6), 0, fuste + 3.6, 0, 4.7, 0.6, 16);
  cil(t, std('#9aa1a8', 0.4, 0.6), 1.5, fuste + 4.2, 0, 0.06, 3, 6);
  t.position.set(x, y, z); g.add(t); return t;
}
// farol listrado (vermelho e branco) com a lanterna em cima
export function farol(g, x, y, z, h = 16) {
  const t = new THREE.Group();
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, h, 16).translate(0, h / 2, 0), std('#f2f2ee', 0.7)); corpo.castShadow = true; t.add(corpo);
  for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(1.5 + 0.7 * (1 - (k * 5 + 4.4) / h) + 0.04, 1.5 + 0.7 * (1 - (k * 5 + 3) / h) + 0.04, 1.6, 16).translate(0, 0.8, 0), std('#c22', 0.6)); f.position.y = 3 + k * 5; t.add(f); }
  cil(t, std('#3a3d42', 0.5), 0, h, 0, 2, 0.3, 16);
  const lan = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 12).translate(0, 0.9, 0), new THREE.MeshStandardMaterial({ color: '#fff6d6', emissive: '#ffe9a0', emissiveIntensity: 0.6, roughness: 0.1 })); lan.position.y = h + 0.3; t.add(lan);
  cil(t, std('#c22', 0.6), 0, h + 2.1, 0, 1.3, 0.5, 12);
  t.position.set(x, y, z); g.add(t); t.userData.lanterna = lan; return t;
}
// terminal de passageiros: caixa de vidro, faixa de cobertura saliente e marquise do embarque com pilares (frente +Z)
export function terminalAeroporto(g, x, y, z, w, h, d) {
  novoCache();
  const t = new THREE.Group();
  bloco(t, matFachada('vidro', '#5f7486', { par: { a: 3.6 } }), 0, 0, 0, w, h, d);
  bloco(t, std('#e9e6df', 0.6), 0, h, 0, w + 4, 0.9, d + 4);                       // cobertura saliente
  bloco(t, std('#2c4f7c', 0.5), 0, h + 0.2, d / 2 + 2.02, w + 4, 0.5, 0.05);       // faixa azul
  bloco(t, std('#e9e6df', 0.6), 0, 4.6, d / 2 + 1.6, w * 0.7, 0.35, 4.4);          // marquise do embarque (em balanço sobre a calçada)
  for (let k = 0; k < 7; k++) cil(t, std('#c9ccd0', 0.4, 0.6), -w * 0.35 + 0.5 + k * (w * 0.7 - 1) / 6, 0, d / 2 + 0.6, 0.22, 4.6, 10);
  t.position.set(x, y, z); g.add(t); return t;
}
// prédio de comando (militar/naval): bloco com fachada, telhado cerâmico ou platibanda com faixa (frente +Z)
export function predioBase(g, x, y, z, w, h, d, { estilo = 'militar', cor = '#e8dec3', telha = true, faixa = null, rot = 0 } = {}) {
  novoCache();
  const t = new THREE.Group();
  bloco(t, matFachada(estilo, cor), 0, 0, 0, w, h, d);
  if (telha) telhado(t, 0, h, 0, w + 0.4, d + 0.4, 0, '#ffffff', cor);
  else { bloco(t, std(faixa || '#1f3d7a', 0.6), 0, h, 0, w + 0.6, 0.9, d + 0.6); bloco(t, std('#8e9196', 0.8), w * 0.25, h + 0.9, -d * 0.15, 3, 1.8, 3); }
  t.position.set(x, y, z); t.rotation.y = rot; g.add(t); return t;
}
