// Jujubas (ração militar): janelas do armazém das corporações, da central do Exército, da licitação e do comprador ilegal.
// O estado vem do banco a cada 15 s (e o "relógio" do sistema — chegadas, licitação — roda junto).
import * as rede from './rede.js';

const CORP_NOME = { policia: 'Polícia', prf: 'PRF', bombeiros: 'Bombeiros' };
let ctx = null, est = null, modo = null, tempo = 0, el = null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');

export function iniciarRacoes(c) {
  ctx = c;
  el = document.createElement('div'); el.id = 'racoesJanela'; el.className = 'modal oculto';
  el.innerHTML = '<div class="topo"><b id="racoesTitulo">Rações</b><button id="fecharRacoes" aria-label="Fechar">✕</button></div><div id="racoesConteudo" class="conteudo"></div><div id="racoesMsg" class="msg"></div>';
  document.body.appendChild(el);
  $('fecharRacoes').onclick = fechar;
}
export const estado = () => est;
export const aberto = () => !!modo;
export function corpDe(p) { return p?.prf ? 'prf' : p?.policial ? 'policia' : p?.profissao === 'bombeiro' ? 'bombeiros' : null; }
export async function recarregar() {
  try { await rede.jujuba.processar(); } catch (e) { /* o relógio é de todos: se falhar, outro roda */ }
  try { est = await rede.jujuba.estado(); ctx.mudou?.(est); } catch (e) { /* tenta de novo depois */ }
  if (modo) desenhar();
}
export function atualizar(dt) { if ((tempo -= dt) <= 0) { tempo = 15; recarregar(); } }
export function abrir(m) { modo = m; el.classList.remove('oculto'); desenhar(); }
function fechar() { modo = null; el.classList.add('oculto'); }
function msg(t, ok = true) { const m = $('racoesMsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'erro'); clearTimeout(msg.t); msg.t = setTimeout(() => { m.textContent = ''; }, 4500); }
async function executar(fn, ok) {
  try { const r = await fn(); msg(typeof ok === 'function' ? ok(r) : ok); await recarregar(); }
  catch (e) { msg(e.message, false); }
}
const barra = (v) => `<div style="height:8px;background:#333;border-radius:4px;overflow:hidden;margin:4px 0"><div style="height:100%;width:${Math.round(v / 100)}%;background:${v < 2000 ? '#d9534f' : v < 5000 ? '#e3b23c' : '#4caf50'}"></div></div>`;

async function desenhar() {
  const c = $('racoesConteudo'), p = ctx.perfil();
  if (!est) { c.innerHTML = '<p class="dica">Carregando…</p>'; return; }
  const arm = (k) => est.armazens.find((a) => a.corp === k)?.estoque ?? 0;
  const ped = (k) => est.pedidos.find((x) => x.corp === k);
  const viag = (k) => est.viagens.filter((v) => v.corp === k && v.status === 'em_rota');
  if (modo === 'armazem') {
    const k = corpDe(p); $('racoesTitulo').textContent = `🍬 Armazém de rações · ${CORP_NOME[k] || ''}`;
    if (!k) { c.innerHTML = '<p class="dica">Só Polícia, PRF e Bombeiros em serviço.</p>'; return; }
    const pd = ped(k), vs = viag(k);
    c.innerHTML = `<p class="dica">Jujuba = ração militar: por 5 minutos você fica 10% mais rápido, bate mais forte no soco e recupera 20% da vida aos poucos.</p>
      <p><b>${fmt(arm(k))}</b> de 10.000 jujubas</p>${barra(arm(k))}
      <div class="botoes"><button id="rPegar">Pegar 5 jujubas</button>${!pd && arm(k) < 10000 ? '<button id="rPedir">Pedir reposição ao Exército</button>' : ''}</div>
      ${pd ? `<p class="dica">📋 Pedido de reposição ${pd.status === 'aberto' ? 'aguardando o Exército' : 'despachado'}.</p>` : ''}
      ${vs.map((v) => `<p class="dica">🚚 Caminhão com ${fmt(v.qtd)} jujubas chega em ~${Math.max(0, Math.ceil((Date.parse(v.chegada) - ctx.agora()) / 1000))} s.</p>`).join('')}`;
    $('rPegar').onclick = () => executar(() => rede.jujuba.pegar(), (n) => `Você pegou ${n} jujubas. Use pela mochila.`);
    if ($('rPedir')) $('rPedir').onclick = () => executar(() => rede.jujuba.pedir(), 'Pedido enviado ao Exército.');
  } else if (modo === 'central') {
    $('racoesTitulo').textContent = '🎖️ Central de rações do Exército';
    const l = est.licitacao;
    c.innerHTML = `<p class="dica">Estoque das corporações em tempo real. Despache só o que falta ou um caminhão cheio (até 5.000 por caminhão). A transportadora do contrato recebe <b>${fmt(est.valor)}</b> por caminhão.</p>
      ${['policia', 'prf', 'bombeiros'].map((k) => { const pd = ped(k), vs = viag(k);
        return `<div class="linha" style="display:block;margin-bottom:8px"><b>${CORP_NOME[k]}</b>: ${fmt(arm(k))} / 10.000${barra(arm(k))}
          ${pd && pd.status === 'aberto' ? `<span class="dica">📋 Pedido aberto</span> <div class="botoes"><button data-desp="${pd.id}" data-m="faltante">Mandar o que falta</button><button data-desp="${pd.id}" data-m="cheio">1 caminhão cheio</button></div>` : pd ? '<span class="dica">🚚 Despachado</span>' : '<span class="dica">Sem pedido</span>'}
          ${vs.map((v) => `<br><small>🚚 ${fmt(v.qtd)} a caminho (~${Math.max(0, Math.ceil((Date.parse(v.chegada) - ctx.agora()) / 1000))} s)</small>`).join('')}</div>`; }).join('')}
      ${est.viagens.filter((v) => v.status === 'sequestrada').map((v) => `<p class="dica" style="color:#ff8a80">🚨 Caminhão de rações (${fmt(v.qtd)}) SEQUESTRADO a caminho de ${CORP_NOME[v.corp]}.</p>`).join('')}
      <p class="dica">📄 Licitação do transporte: ${l ? (l.status === 'vigente' ? `contrato vigente (${l.entregas}/5 caminhões)` : `aberta até ${new Date(l.fecha_em).toLocaleTimeString('pt-BR').slice(0, 5)}`) : 'abrindo…'}</p>`;
    c.querySelectorAll('[data-desp]').forEach((b) => { b.onclick = () => executar(() => rede.jujuba.despachar(Number(b.dataset.desp), b.dataset.m, ctx.duracaoViagem(est.pedidos.find((x) => x.id === Number(b.dataset.desp))?.corp)), (n) => `🚚 ${n} caminhão(ões) despachado(s).`); });
  } else if (modo === 'licitacao') {
    $('racoesTitulo').textContent = '📄 Licitação: transporte de rações do Exército';
    const l = est.licitacao; let lances = [];
    if (l) try { lances = await rede.jujuba.lances(l.id); } catch (e) { /* sem lista */ }
    const minhas = (await ctx.minhasTransportadoras()).filter((e) => e.nivel >= 5);
    c.innerHTML = `<p class="dica">Transportadoras nível 5+ disputam o contrato: ganha o <b>menor</b> valor pedido, que é pago na hora ao fechar a licitação. O contrato vale 5 caminhões, e cada caminhão despachado paga mais <b>${fmt(est.valor)}</b>.</p>
      <p>${!l ? 'A licitação está abrindo…' : l.status === 'vigente' ? `Contrato vigente: ${l.entregas}/5 caminhões. A próxima licitação abre quando ele acabar.` : `Aberta: fecha às <b>${new Date(l.fecha_em).toLocaleTimeString('pt-BR').slice(0, 5)}</b>. ${lances.length} lance(s); menor até agora: <b>${lances[0] ? fmt(lances[0].valor) : '—'}</b>.`}</p>
      ${!l || l.status === 'aberta' ? (minhas.length ? `<div class="botoes"><select id="rEmp">${minhas.map((e) => `<option value="${e.id}">${esc(e.nome)} (nv ${e.nivel})</option>`).join('')}</select>
        <input id="rValor" type="number" min="10000" max="5000000" step="1000" value="${lances[0] ? Math.max(10000, lances[0].valor - 10000) : 800000}" style="width:9em"><button id="rLance">Dar lance</button></div>` : '<p class="dica">Você não tem transportadora nível 5 ou mais.</p>') : ''}
      ${p?.cargo === 'admin' ? `<hr><p class="dica">Admin: valor por caminhão</p><div class="botoes"><input id="rVal" type="number" min="1000" max="1000000" step="1000" value="${est.valor}" style="width:8em"><button id="rMudar">Mudar valor</button></div>` : ''}`;
    if ($('rLance')) $('rLance').onclick = () => executar(() => rede.jujuba.lance(Number($('rEmp').value), Number($('rValor').value)), 'Lance registrado.');
    if ($('rMudar')) $('rMudar').onclick = () => executar(() => rede.jujuba.valor(Number($('rVal').value)), 'Valor atualizado (a placa do quartel muda também).');
  } else if (modo === 'comprador') {
    $('racoesTitulo').textContent = '📦 Armazém do Seu Tonho';
    c.innerHTML = `<p class="dica">"Tenho jujuba do Exército, sem nota. 500 cada, só para gente de clã."</p>
      <p>Em estoque: <b>${fmt(est.mercado)}</b></p>
      <div class="botoes">${[1, 5, 10].map((q) => `<button data-comp="${q}" ${est.mercado >= q ? '' : 'disabled'}>${q} (${fmt(q * 500)})</button>`).join('')}</div>`;
    c.querySelectorAll('[data-comp]').forEach((b) => { b.onclick = () => executar(() => rede.jujuba.comprar(Number(b.dataset.comp)), (n) => `Você comprou ${n} jujubas.`); });
  }
}
