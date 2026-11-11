// Jornal: editor completo (no escritório da redação), fotos tiradas no jogo, cartões de matéria chamativos
// e a janela que amplia telões e outdoors quando o jogador toca neles.
import * as rede from './rede.js';
import { PERSONAGENS, PERSONAGENS_EVENTO, ROBOS } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const SELOS = ['URGENTE', 'EXCLUSIVO', 'AO VIVO', 'ENTREVISTA', 'POLÍCIA', 'ESPORTE', 'POLÍTICA'];
export const CORES = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad', '#2c3e50'];
const TODOS = () => [...PERSONAGENS, ...PERSONAGENS_EVENTO, ...ROBOS.map((id) => ({ id, nome: id === 'Rusty_Scout_Bot' ? 'Robô Batedor' : 'Robô Sentinela' }))];

// ---------------------------------------------------------------- fotos
const cacheFotos = new Map();
export function fotoDe(id) {
  if (!cacheFotos.has(id)) cacheFotos.set(id, rede.jornal.foto(id).catch(() => null));
  return cacheFotos.get(id);
}
export function esquecerFoto(id) { cacheFotos.delete(id); }
export function galeria() { try { return JSON.parse(localStorage.getItem('fator_fotos') || '[]'); } catch { return []; } }
export function guardarFoto(url) {
  const l = [url, ...galeria()].slice(0, 6);
  for (let n = l.length; n > 0; n--) { try { localStorage.setItem('fator_fotos', JSON.stringify(l.slice(0, n))); return; } catch { /* sem espaço: guarda menos */ } }
}
// imagem principal de uma matéria: foto do jogo > retrato do personagem > link
export async function imagemDe(m) {
  if (m.tem_foto) { const f = await fotoDe(m.id); if (f) return f; }
  if (m.personagem) return `assets/miniaturas/${m.personagem}.webp`;
  return m.imagem || null;
}
// cartão de matéria (lista do jornal e janela ampliada); a imagem entra depois em [data-img]
export function cartao(m, { grande = false } = {}) {
  const cor = m.cor || '#c0392b';
  return `<div class="materia-cartao" style="border-left:5px solid ${cor};padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.04);margin:6px 0">
    ${m.selo ? `<span style="display:inline-block;background:${cor};color:#fff;font:800 11px system-ui;padding:2px 7px;border-radius:5px;letter-spacing:.5px">${esc(m.selo)}</span>` : ''}
    <div style="font:${m.destaque || grande ? '900 20px' : '800 15px'} system-ui;margin:4px 0;color:${m.destaque ? cor : 'inherit'}">${esc(m.titulo)}</div>
    <img data-img="${m.id}" alt="" style="display:none;width:100%;max-height:${grande ? '50vh' : '200px'};object-fit:cover;border-radius:8px;margin:4px 0">
    ${m.texto ? `<div style="white-space:pre-wrap;font-size:${grande ? 15 : 13}px;line-height:1.35">${esc(m.texto)}</div>` : ''}
    <small style="opacity:.7">por ${esc(m.autor_nome || '')}</small></div>`;
}
export function carregarImagens(raiz, lista) {
  raiz.querySelectorAll('img[data-img]').forEach((img) => {
    const m = lista.find((x) => String(x.id) === img.dataset.img); if (!m) return;
    imagemDe(m).then((src) => { if (src) { img.src = src; img.style.display = 'block'; img.onerror = () => { img.style.display = 'none'; }; } });
  });
}

// ---------------------------------------------------------------- janela ampliada (telão, outdoor ou matéria)
export function ampliar({ titulo = '', html = '', lista = [] }) {
  let el = $('ampliar');
  if (!el) {
    el = document.createElement('div'); el.id = 'ampliar';
    el.style.cssText = 'position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.82);display:none;align-items:center;justify-content:center;padding:14px';
    el.innerHTML = `<div style="position:relative;width:min(760px,96vw);max-height:92vh;overflow:auto;background:#151a24;border-radius:14px;padding:14px 14px 18px;color:#e8edf5">
      <button id="ampliarFechar" style="position:sticky;top:0;float:right;border:0;background:#2d3650;color:#fff;font:700 18px system-ui;border-radius:9px;width:40px;height:40px">✕</button>
      <b id="ampliarTitulo" style="font:800 15px system-ui;opacity:.8"></b><div id="ampliarCorpo" style="clear:both"></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('pointerdown', (e) => { if (e.target === el) fecharAmpliar(); });
    $('ampliarFechar').onclick = fecharAmpliar;
  }
  $('ampliarTitulo').textContent = titulo; $('ampliarCorpo').innerHTML = html;
  carregarImagens($('ampliarCorpo'), lista);
  el.style.display = 'flex';
}
export function fecharAmpliar() { const el = $('ampliar'); if (el) el.style.display = 'none'; }
export const ampliado = () => $('ampliar')?.style.display === 'flex';

// ---------------------------------------------------------------- editor completo (escritório da redação)
let ctx = null, edicao = null;
export function iniciarJornal(c) { ctx = c; }
function janela() {
  let el = $('editorJornal');
  if (!el) {
    el = document.createElement('div'); el.id = 'editorJornal'; el.className = 'modal oculto'; el.style.width = 'min(760px, 98vw)';
    el.innerHTML = '<div class="topo"><b>🖋️ Editor da redação</b><button id="edFechar" aria-label="Fechar">✕</button></div><div id="edConteudo" class="conteudo"></div><div id="edMsg" class="msg"></div>';
    document.body.appendChild(el); $('edFechar').onclick = () => el.classList.add('oculto');
  }
  return el;
}
function msg(t, ok = true) { const m = $('edMsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'erro'); clearTimeout(msg.t); msg.t = setTimeout(() => { m.textContent = ''; }, 4500); }
export async function abrirEditor() {
  janela().classList.remove('oculto');
  edicao = edicao || novo();
  await desenhar();
}
const novo = () => ({ id: null, titulo: '', texto: '', imagem: '', quando: '', selo: '', cor: CORES[0], destaque: false, personagem: '', foto: null, fotoAtual: null });
async function desenhar() {
  const c = $('edConteudo'), e = edicao;
  let lista = []; try { lista = await rede.jornal.redacao(); } catch { /* sem lista */ }
  const fotos = galeria();
  c.innerHTML = `<div class="sub">Prévia</div><div id="edPrevia"></div>
    <div class="lista">
      <input id="edTitulo" maxlength="90" placeholder="Título (manchete)" value="${esc(e.titulo)}">
      <textarea id="edTexto" maxlength="600" rows="4" placeholder="Texto (até 600 letras)">${esc(e.texto)}</textarea>
      <div class="botoes"><select id="edSelo"><option value="">Sem selo</option>${SELOS.map((s) => `<option ${s === e.selo ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <label><input type="checkbox" id="edDestaque" ${e.destaque ? 'checked' : ''}> Manchete em destaque</label></div>
      <div class="botoes">${CORES.map((k) => `<button data-cor="${k}" style="background:${k};width:34px;height:34px;border-radius:50%;padding:0;${k === e.cor ? 'outline:3px solid #fff' : ''}"></button>`).join('')}</div>
    </div>
    <div class="sub">📷 Foto (tire no estúdio da redação ou na rua pelo Jornal › Tirar foto)</div>
    <div class="botoes" style="flex-wrap:wrap">
      <button data-foto="-1" class="${!e.foto && !e.fotoAtual ? 'ativo' : ''}">Sem foto</button>
      ${e.fotoAtual ? `<button data-foto="atual" class="${e.foto === null && e.fotoAtual ? 'ativo' : ''}" style="padding:2px"><img src="${e.fotoAtual}" style="height:54px;border-radius:6px;display:block"></button>` : ''}
      ${fotos.map((f, k) => `<button data-foto="${k}" class="${e.foto === f ? 'ativo' : ''}" style="padding:2px"><img src="${f}" style="height:54px;border-radius:6px;display:block"></button>`).join('')}
    </div>
    <div class="sub">🧍 Retrato de um personagem (aparece quando não há foto)</div>
    <div class="botoes" style="flex-wrap:wrap;max-height:150px;overflow:auto">
      <button data-pers="" class="${!e.personagem ? 'ativo' : ''}">Nenhum</button>
      ${TODOS().map((p) => `<button data-pers="${p.id}" title="${esc(p.nome)}" class="${p.id === e.personagem ? 'ativo' : ''}" style="padding:2px"><img src="assets/miniaturas/${p.id}.webp" style="height:46px;display:block"></button>`).join('')}
    </div>
    <div class="lista"><input id="edImagem" placeholder="Ou um link de imagem (https://…)" value="${esc(e.imagem)}">
      <label class="dica">Publicar em: <input id="edQuando" type="datetime-local" value="${e.quando}"></label></div>
    <div class="botoes"><button id="edSalvar">${e.id ? '💾 Salvar edição' : '📰 Publicar'}</button><button id="edNovo">Nova matéria</button></div>
    <div class="sub">Matérias (toque para editar)</div>
    <div class="lista">${lista.map((m) => `<div class="linha item"><span class="nm"><b>${m.selo ? `[${esc(m.selo)}] ` : ''}${esc(m.titulo)}</b><small>por ${esc(m.autor_nome)}</small></span><span class="bts"><button data-ed="${m.id}">Editar</button></span></div>`).join('') || '<span class="vazio">Nenhuma ainda.</span>'}</div>`;
  const ler = () => { e.titulo = $('edTitulo').value; e.texto = $('edTexto').value; e.selo = $('edSelo').value; e.destaque = $('edDestaque').checked; e.imagem = $('edImagem').value.trim(); e.quando = $('edQuando').value; };
  const previa = async () => {
    ler();
    const m = { id: 'previa', titulo: e.titulo || 'Título da matéria', texto: e.texto, selo: e.selo, cor: e.cor, destaque: e.destaque, autor_nome: ctx.perfil().nome };
    $('edPrevia').innerHTML = cartao(m, { grande: true });
    const src = e.foto || e.fotoAtual || (e.personagem ? `assets/miniaturas/${e.personagem}.webp` : e.imagem);
    const img = $('edPrevia').querySelector('img'); if (src && img) { img.src = src; img.style.display = 'block'; img.onerror = () => { img.style.display = 'none'; }; }
  };
  for (const id of ['edTitulo', 'edTexto', 'edSelo', 'edDestaque', 'edImagem']) $(id).addEventListener('input', previa);
  c.querySelectorAll('[data-cor]').forEach((b) => { b.onclick = () => { ler(); e.cor = b.dataset.cor; desenhar(); }; });
  c.querySelectorAll('[data-foto]').forEach((b) => { b.onclick = () => { ler(); const k = b.dataset.foto; if (k === '-1') { e.foto = null; e.fotoAtual = null; e.tirarFoto = true; } else if (k === 'atual') e.foto = null; else { e.foto = fotos[Number(k)]; e.tirarFoto = false; } desenhar(); }; });
  c.querySelectorAll('[data-pers]').forEach((b) => { b.onclick = () => { ler(); e.personagem = b.dataset.pers; desenhar(); }; });
  c.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = async () => {
    const m = lista.find((x) => String(x.id) === b.dataset.ed); if (!m) return;
    const d = new Date(m.publicar_em); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    edicao = { ...novo(), id: m.id, titulo: m.titulo, texto: m.texto || '', imagem: m.imagem || '', quando: d.toISOString().slice(0, 16), selo: m.selo || '', cor: m.cor || CORES[0], destaque: !!m.destaque, personagem: m.personagem || '' };
    if (m.tem_foto) { esquecerFoto(m.id); edicao.fotoAtual = await fotoDe(m.id); }
    desenhar();
  }; });
  $('edNovo').onclick = () => { edicao = novo(); desenhar(); };
  $('edSalvar').onclick = async () => {
    ler();
    const q = e.quando ? new Date(e.quando).toISOString() : null;
    const foto = e.foto ? e.foto : e.tirarFoto ? '' : null;
    try {
      const id = await rede.jornal.salvar2(e.id, e.titulo, e.texto, e.imagem, q, foto, e.personagem, e.selo, e.cor, e.destaque);
      esquecerFoto(id); msg(q && Date.parse(q) > Date.now() ? 'Matéria agendada.' : 'Matéria publicada!'); ctx.mudou?.();
      edicao = novo(); desenhar();
    } catch (err) { msg(err.message, false); }
  };
  previa();
}
