// Loja e mochila (etapa 3). Toda compra, venda e refeição é feita no banco.
import * as rede from './rede.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONES = { sucata: '🔩', chocolate: '🍫', cereal: '🥣', remedio: '💊', desbloqueio: '🔓' };

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
let bau = {};
export function fechar() { modo = null; $('janela').classList.add('oculto'); }
export function janelaAberta() { return !!modo; }
export const inventario = () => inv;

function msg(t, ok = true) { const m = $('janelaMsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'erro'); clearTimeout(msg.t); msg.t = setTimeout(() => { m.textContent = ''; }, 3500); }
async function executar(fn, sucesso) {
  try { const r = await fn(); msg(typeof sucesso === 'function' ? sucesso(r) : sucesso); await recarregarInventario(); }
  catch (e) { msg(e.message, false); }
}
const moedas = () => Number(ctx.perfil().moedas || 0).toLocaleString('pt-BR');

// terreno: escolher a casa que vai ser construída
const MODELOS = [
  { id: 'simples', nome: 'Casa simples', preco: 20000, texto: 'Térrea, com varanda.' },
  { id: 'sobrado', nome: 'Sobrado', preco: 45000, texto: 'Dois andares e garagem.' },
  { id: 'mansao', nome: 'Mansão', preco: 90000, texto: 'Dois andares, piscina e jardim.' },
];
function desenharTerreno(c) {
  const t = ctx.meuTerreno?.();
  $('janelaTitulo').textContent = t?.rotulo || 'Seu terreno';
  if (!t) { c.textContent = 'Você não tem terreno.'; return; }
  c.innerHTML = `<p class="dica">Escolha o que construir. Trocar de modelo depois cobra o preço do novo. Moedas: <b>${moedas()}</b>.</p>
    <div class="lista">${MODELOS.map((m) => `<div class="linha item"><span class="nm"><b>${m.nome}</b><small>${m.texto} · ${m.preco.toLocaleString('pt-BR')} moedas${t.modelo === m.id ? ' · construída' : ''}</small></span>
      <span class="bts">${t.modelo === m.id ? '' : `<button data-mod="${m.id}">Construir</button>`}</span></div>`).join('')}</div>
`;
  c.querySelectorAll('[data-mod]').forEach((b) => { b.onclick = () => executar(() => rede.casas.construir(t.id, b.dataset.mod), () => { ctx.casaVendida?.(); return 'Construção pronta!'; }); });
}

async function desenharBau(c) {
  $('janelaTitulo').textContent = 'Baú da casa';
  const casa = ctx.casaId?.();
  if (!casa) { c.textContent = 'Você não tem casa.'; return; }
  try { bau = await rede.listarBau(casa); } catch (e) { c.textContent = e.message; return; }
  const linhas = precos.filter((p) => (inv[p.item] || 0) > 0 || (bau[p.item] || 0) > 0);
  c.innerHTML = `<p class="dica">O baú guarda até 200 de cada item, protegido em casa.</p>
    <div class="lista">${linhas.length ? linhas.map((p) => `
      <div class="linha item"><span class="ic">${ICONES[p.item] || '📦'}</span>
        <span class="nm"><b>${esc(p.nome)}</b><small>mochila ${inv[p.item] || 0} · baú ${bau[p.item] || 0}</small></span>
        <span class="bts"><button data-guardar="${p.item}" ${inv[p.item] ? '' : 'disabled'}>Guardar</button><button data-tirar="${p.item}" ${bau[p.item] ? '' : 'disabled'}>Pegar</button></span></div>`).join('')
      : '<span class="vazio">Mochila e baú vazios.</span>'}</div>
    <p class="dica">Para vender esta moradia, saia e toque na porta dela.</p>`;
  c.querySelectorAll('[data-guardar]').forEach((b) => { b.onclick = () => executar(() => rede.casas.guardar(casa, b.dataset.guardar, inv[b.dataset.guardar]), 'Guardado no baú.'); });
  c.querySelectorAll('[data-tirar]').forEach((b) => { b.onclick = () => executar(() => rede.casas.retirar(casa, b.dataset.tirar, bau[b.dataset.tirar]), 'Na sua mochila.'); });
}

// porta da sua moradia: entrar, construir (terreno) ou vender
const VALOR_VENDA = { simples: 10000, sobrado: 22500, mansao: 45000 };
const valorVenda = (c) => (c.tipo === 'apto' ? 8000 : c.tipo === 'terreno' ? 6000 + (VALOR_VENDA[c.modelo] || 0) : 20000);
function desenharPorta(c) {
  const m = ctx.portaAtual?.();
  if (!m) { fechar(); return; }
  const nome = m.tipo === 'apto' ? 'Seu apartamento' : m.tipo === 'terreno' ? (m.modelo ? 'Sua casa (terreno)' : 'Seu terreno') : 'Sua casa';
  $('janelaTitulo').textContent = m.rotulo || nome;
  c.innerHTML = `<p class="dica">${nome}. Você pode ter até 3 moradias (casa, apartamento ou terreno). Cada uma tem o seu baú com cama.</p>
    <div class="botoes">${m.tipo !== 'terreno' || m.modelo ? '<button id="pEntrar">Entrar</button>' : ''}
      ${m.tipo === 'terreno' ? `<button id="pConstruir">${m.modelo ? 'Trocar a casa' : 'Construir a casa'}</button>` : ''}</div>
    <div class="sub">Vender</div>
    <p class="dica">Recebe <b>${valorVenda(m).toLocaleString('pt-BR')}</b>. O que estiver no baú volta para a sua mochila.</p>
    <div class="botoes"><button id="pVender" class="perigo">Vender</button></div>`;
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('pEntrar', () => { fechar(); ctx.entrarMoradia(m); });
  on('pConstruir', () => abrir('terreno'));
  on('pVender', () => { const b = $('pVender'); if (!b.dataset.conf) { b.dataset.conf = '1'; b.textContent = 'Toque de novo para confirmar'; return; }
    executar(() => rede.casas.vender(m.id), (v) => { ctx.casaVendida?.(); fechar(); return `Vendido por ${Number(v).toLocaleString('pt-BR')}.`; }); });
}

function desenhar() {
  const c = $('janelaConteudo');
  if (modo === 'bau') { desenharBau(c); return; }
  if (modo === 'terreno') { desenharTerreno(c); return; }
  if (modo === 'porta') { desenharPorta(c); return; }
  if (modo === 'loja') {
    $('janelaTitulo').textContent = 'Loja';
    const venda = precos.filter((p) => p.compra != null);
    const compra = precos.filter((p) => p.venda != null);
    c.innerHTML = `<p class="dica">Você tem <b>${moedas()}</b> moedas.</p>
      <div class="sub">Comprar</div><div class="lista">${venda.map((p) => `
        <div class="linha item"><span class="ic">${ICONES[p.item] || '📦'}</span>
          <span class="nm"><b>${esc(p.nome)}</b><small>${p.compra} moedas${p.fome ? ` · enche ${p.fome}% da fome` : ''}${p.item === 'remedio' ? ' · cura 50 de vida' : ''}${p.item === 'desbloqueio' ? ' · libera os níveis 5, 10 e 15 de empresas e clãs' : ''}</small></span>
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
    c.innerHTML = `<p class="dica">Vida: <b>${Math.round(ctx.vida?.() ?? 100)}</b> · Fome: <b>${Math.round(ctx.fome())}%</b> · Moedas: <b>${moedas()}</b></p>
      <div class="lista">${itens.length ? itens.map((p) => `
        <div class="linha item"><span class="ic">${ICONES[p.item] || '📦'}</span>
          <span class="nm"><b>${esc(p.nome)}</b><small>${inv[p.item]} na mochila</small></span>
          <span class="bts">${p.fome ? `<button data-comer="${p.item}">Comer</button>` : ''}${p.item === 'remedio' ? '<button data-curar="1">Usar (+50 vida)</button>' : ''}</span></div>`).join('') : '<span class="vazio">Mochila vazia. Colete sucata no ferro-velho ou compre na loja.</span>'}</div>`;
    c.querySelectorAll('[data-curar]').forEach((b) => {
      b.onclick = () => executar(async () => { if (!(await ctx.curar())) throw new Error('Sua vida já está cheia.'); }, 'Remédio usado: +50 de vida.');
    });
    c.querySelectorAll('[data-comer]').forEach((b) => {
      b.onclick = () => executar(async () => { const f = await rede.economia.consumir(b.dataset.comer); ctx.definirFome(Number(f)); return f; }, (f) => `Fome agora: ${Math.round(f)}%.`);
    });
  }
}
function nomeDe(item) { return precos.find((p) => p.item === item)?.nome || item; }
