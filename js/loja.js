// Loja e mochila (etapa 3). Toda compra, venda e refeição é feita no banco.
import * as rede from './rede.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONES = { sucata: '🔩', chocolate: '🍫', cereal: '🥣', remedio: '💊' };

let ctx = null;
let precos = [];
let inv = {};
let modo = null;          // 'loja' | 'mochila'

export async function iniciarLoja(contexto) {
  ctx = contexto;
  $('fecharJanela').onclick = fechar;
  $('btMochila').onclick = () => abrir('mochila');
  try { precos = await rede.carregarPrecos(); } catch (e) { console.warn('preços', e); }
  await recarregarInventario();
}
export async function recarregarInventario() {
  try { inv = await rede.carregarInventario(ctx.perfil().id); } catch { /* tenta depois */ }
  if (modo) desenhar();
}
export function abrir(m) { modo = m; $('janela').classList.remove('oculto'); desenhar(); }
export function fechar() { modo = null; $('janela').classList.add('oculto'); }
export function janelaAberta() { return !!modo; }
export const inventario = () => inv;

function msg(t, ok = true) { const m = $('janelaMsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'erro'); clearTimeout(msg.t); msg.t = setTimeout(() => { m.textContent = ''; }, 3500); }
async function executar(fn, sucesso) {
  try { const r = await fn(); msg(typeof sucesso === 'function' ? sucesso(r) : sucesso); await recarregarInventario(); }
  catch (e) { msg(e.message, false); }
}
const moedas = () => Number(ctx.perfil().moedas || 0).toLocaleString('pt-BR');

function desenhar() {
  const c = $('janelaConteudo');
  if (modo === 'loja') {
    $('janelaTitulo').textContent = 'Loja';
    const venda = precos.filter((p) => p.compra != null);
    const compra = precos.filter((p) => p.venda != null);
    c.innerHTML = `<p class="dica">Você tem <b>${moedas()}</b> moedas.</p>
      <div class="sub">Comprar</div><div class="lista">${venda.map((p) => `
        <div class="linha item"><span class="ic">${ICONES[p.item] || '📦'}</span>
          <span class="nm"><b>${esc(p.nome)}</b><small>${p.compra} moedas${p.fome ? ` · enche ${p.fome}% da fome` : ''}${p.item === 'remedio' ? ' · cura (em breve)' : ''}</small></span>
          <span class="bts"><button data-comprar="${p.item}" data-q="1">+1</button><button data-comprar="${p.item}" data-q="5">+5</button></span></div>`).join('')}</div>
      <div class="sub">Vender</div><div class="lista">${compra.map((p) => `
        <div class="linha item"><span class="ic">${ICONES[p.item] || '📦'}</span>
          <span class="nm"><b>${esc(p.nome)}</b><small>${p.venda} moedas cada · você tem ${inv[p.item] || 0}</small></span>
          <span class="bts"><button data-vender="${p.item}" data-q="1" ${inv[p.item] ? '' : 'disabled'}>1</button><button data-vender="${p.item}" data-q="${inv[p.item] || 0}" ${inv[p.item] ? '' : 'disabled'}>Todos</button></span></div>`).join('')}</div>`;
    c.querySelectorAll('[data-comprar]').forEach((b) => { b.onclick = () => executar(() => rede.economia.comprar(b.dataset.comprar, Number(b.dataset.q)), `Comprado: ${b.dataset.q}x ${nomeDe(b.dataset.comprar)}.`); });
    c.querySelectorAll('[data-vender]').forEach((b) => { b.onclick = () => { const q = Number(b.dataset.q); if (q > 0) executar(() => rede.economia.vender(b.dataset.vender, q), (r) => `Vendido por ${r} moedas.`); }; });
  } else {
    $('janelaTitulo').textContent = 'Mochila';
    const itens = precos.filter((p) => inv[p.item] > 0);
    c.innerHTML = `<p class="dica">Fome: <b>${Math.round(ctx.fome())}%</b> · Moedas: <b>${moedas()}</b></p>
      <div class="lista">${itens.length ? itens.map((p) => `
        <div class="linha item"><span class="ic">${ICONES[p.item] || '📦'}</span>
          <span class="nm"><b>${esc(p.nome)}</b><small>${inv[p.item]} na mochila</small></span>
          <span class="bts">${p.fome ? `<button data-comer="${p.item}">Comer</button>` : ''}</span></div>`).join('') : '<span class="vazio">Mochila vazia. Colete sucata no ferro-velho ou compre na loja.</span>'}</div>`;
    c.querySelectorAll('[data-comer]').forEach((b) => {
      b.onclick = () => executar(async () => { const f = await rede.economia.consumir(b.dataset.comer); ctx.definirFome(Number(f)); return f; }, (f) => `Fome agora: ${Math.round(f)}%.`);
    });
  }
}
function nomeDe(item) { return precos.find((p) => p.item === item)?.nome || item; }
