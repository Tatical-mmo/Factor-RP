// Empresas dos jogadores (etapa 4): fundar, caixa, funcionários, pedidos, caminhões e missões.
// Todas as ações são conferidas no banco.
import * as rede from './rede.js';
import { LOTES_VENDA, DESTINOS, CAPACIDADE_CAMINHAO, PRECO_CAMINHAO, PRODUTOS } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const STATUS = { aberto: 'aguardando a transportadora', aceito: 'em andamento', concluido: 'concluído', cancelado: 'cancelado' };

let ctx = null;
let modo = null;        // 'empresa' | 'comprar' | 'missoes'
let aba = 'resumo';
let loteCompra = null;
let mercado = {};

export async function iniciarEmpresa(contexto) {
  ctx = contexto;
  $('btEmpresa').onclick = () => abrirEmpresa();
  $('fecharEmpresa').onclick = fechar;
  try { for (const m of await rede.listarMercado()) mercado[m.produto] = m.valor_caixa; } catch { /* sem preços ainda */ }
}
export function abrirEmpresa() { modo = 'empresa'; aba = 'resumo'; mostrar(); }
export function abrirCompra(lote) { modo = 'comprar'; loteCompra = lote; mostrar(); }
export function abrirMissoes() { modo = 'missoes'; mostrar(); }
export function empresaAberta() { return !!modo; }
export function atualizar() { if (modo) desenhar(); }
function mostrar() { $('empresaJanela').classList.remove('oculto'); desenhar(); }
function fechar() { modo = null; $('empresaJanela').classList.add('oculto'); }

function msg(t, ok = true) { const m = $('empresaMsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'erro'); clearTimeout(msg.t); msg.t = setTimeout(() => { m.textContent = ''; }, 4000); }
async function executar(fn, sucesso) {
  try { const r = await fn(); msg(typeof sucesso === 'function' ? sucesso(r) : sucesso); await desenhar(); }
  catch (e) { msg(e.message, false); }
}
const inteiro = (id) => Math.floor(Number($(id)?.value) || 0);

async function desenhar() {
  const c = $('empresaConteudo'), abas = $('empresaAbas');
  abas.innerHTML = '';
  try {
    if (modo === 'comprar') return telaCompra(c);
    if (modo === 'missoes') return await telaMissoes(c);
    const meuId = ctx.perfil().id;
    const empId = await rede.minhaEmpresaId(meuId);
    ctx.definirMinhaEmpresa(empId);
    const empresas = await rede.listarEmpresas();
    const e = empresas.find((x) => x.id === empId);
    if (!e) return telaSemEmpresa(c, empresas);
    $('empresaTitulo').textContent = e.nome;
    if (e.dono !== meuId) return telaFuncionario(c, e);
    const lista = e.tipo === 'fabrica' ? [['resumo', 'Resumo'], ['equipe', 'Funcionários'], ['vendas', 'Vendas'], ['missoes', 'Missões']]
      : [['resumo', 'Resumo'], ['equipe', 'Funcionários'], ['pedidos', 'Pedidos'], ['caminhoes', 'Caminhões']];
    abas.innerHTML = lista.map(([k, t]) => `<button data-aba="${k}" class="${aba === k ? 'sel' : ''}">${t}</button>`).join('');
    abas.querySelectorAll('button').forEach((b) => { b.onclick = () => { aba = b.dataset.aba; desenhar(); }; });
    if (aba === 'resumo') return telaResumo(c, e);
    if (aba === 'equipe') return await telaEquipe(c, e);
    if (aba === 'vendas') return await telaVendas(c, e, empresas);
    if (aba === 'missoes') return await telaMissoes(c, e, empresas);
    if (aba === 'pedidos') return await telaPedidos(c, e);
    if (aba === 'caminhoes') return await telaCaminhoes(c, e);
  } catch (err) { c.textContent = err.message; }
}

// ------------------------------------------------------------ sem empresa / funcionário
function telaSemEmpresa(c, empresas) {
  $('empresaTitulo').textContent = 'Empresas';
  const livres = LOTES_VENDA.filter((l) => !empresas.some((e) => e.lote === l.id)).length;
  c.innerHTML = `<p class="dica">Você não trabalha em nenhuma empresa. Peça emprego a um dono ou funde a sua: há <b>${livres}</b> lote(s) à venda (placas "Lote à venda" pela cidade). Enquanto isso, as empresas do sistema pagam por entrega na doca.</p>
    <div class="sub">Empresas da cidade</div>
    <div class="lista">${empresas.length ? empresas.map((e) => `<div class="linha"><b>${esc(e.nome)}</b> <i class="tag">${e.tipo === 'fabrica' ? 'fábrica de ' + PRODUTOS[e.produto].nome.toLowerCase() : 'transportadora'}</i><br>
      <small>Dono: ${esc(e.dono_perfil?.nome || '?')} · paga ${e.pagamento} por tarefa</small></div>`).join('') : '<span class="vazio">Nenhuma ainda. Seja o primeiro!</span>'}</div>`;
}
function telaFuncionario(c, e) {
  const tarefa = e.tipo === 'fabrica'
    ? 'Vá até a <b>bancada</b> ao lado do prédio e aperte <b>E</b> para embalar. Cada caixa vai para o estoque e você recebe na hora.'
    : 'Vá ao <b>depósito</b> (portão) de uma fábrica com pedido aceito pela sua transportadora, retire uma caixa e leve ao destino do pedido.';
  c.innerHTML = `<p>Você trabalha aqui e recebe <b>${e.pagamento}</b> moedas por tarefa.</p><p class="dica">${tarefa}</p>
    <div class="botoes"><button id="eSair" class="perigo">Sair do emprego</button></div>`;
  $('eSair').onclick = () => executar(() => rede.logistica.sair(), 'Você saiu da empresa.');
}

// ------------------------------------------------------------ dono: resumo e equipe
function telaResumo(c, e) {
  const tipo = e.tipo === 'fabrica' ? `Fábrica de ${PRODUTOS[e.produto].nome.toLowerCase()}` : 'Transportadora';
  c.innerHTML = `<p class="dica">${tipo} · lote ${e.lote}</p>
    <div class="cartoes"><div><small>Caixa</small><b>${num(e.caixa)}</b></div>${e.tipo === 'fabrica' ? `<div><small>Estoque</small><b>${num(e.estoque)}</b></div>` : ''}<div><small>Paga por tarefa</small><b>${e.pagamento}</b></div></div>
    <div class="sub">Caixa da empresa</div>
    <div class="botoes"><input id="eValor" type="number" min="1" placeholder="Valor" inputmode="numeric"><button id="eDep">Depositar</button><button id="eSaq">Sacar</button></div>
    <div class="sub">Pagamento por tarefa (0 a 500)</div>
    <div class="botoes"><input id="ePag" type="number" min="0" max="500" value="${e.pagamento}" inputmode="numeric"><button id="eSalvarPag">Salvar</button></div>
    <p class="dica">${e.tipo === 'fabrica' ? 'Cada caixa embalada por um funcionário custa o pagamento dele. O mercado paga ' + (mercado[e.produto] || '?') + ' por caixa entregue.' : 'Cada caixa levada à mão por um funcionário custa o pagamento dele. Sua transportadora ganha o frete combinado em cada caixa entregue.'}</p>`;
  $('eDep').onclick = () => { const v = inteiro('eValor'); if (v > 0) executar(() => rede.logistica.depositar(v), `Depositado: ${num(v)}.`); };
  $('eSaq').onclick = () => { const v = inteiro('eValor'); if (v > 0) executar(() => rede.logistica.sacar(v), `Sacado: ${num(v)}.`); };
  $('eSalvarPag').onclick = () => executar(() => rede.logistica.pagamento(inteiro('ePag')), 'Pagamento atualizado.');
}
async function telaEquipe(c, e) {
  const membros = await rede.membrosDe(e.id);
  c.innerHTML = `<div class="botoes"><input id="eNome" placeholder="Nome do jogador"><button id="eContratar">Contratar</button></div>
    <div class="sub">Equipe (${membros.length})</div>
    <div class="lista">${membros.map((m) => `<div class="linha item"><span class="nm"><b>${esc(m.perfil?.nome)}</b><small>${m.jogador === e.dono ? 'dono' : 'funcionário desde ' + new Date(m.desde).toLocaleDateString('pt-BR')}</small></span>
      <span class="bts">${m.jogador === e.dono ? '' : `<button data-demitir="${m.jogador}">Demitir</button>`}</span></div>`).join('')}</div>`;
  $('eContratar').onclick = () => { const n = $('eNome').value.trim(); if (n) executar(() => rede.logistica.contratar(n), `${n} foi contratado.`); };
  c.querySelectorAll('[data-demitir]').forEach((b) => { b.onclick = () => executar(() => rede.logistica.demitir(b.dataset.demitir), 'Funcionário demitido.'); });
}

// ------------------------------------------------------------ fábrica: vendas
function listaPedidos(pedidos, papel) {
  if (!pedidos.length) return '<span class="vazio">Nenhum pedido ainda.</span>';
  return pedidos.map((p) => `<div class="linha"><b>#${p.id}</b> ${p.qtd} caixas de ${PRODUTOS[p.produto]?.nome.toLowerCase() || p.produto} → ${esc(DESTINOS[p.destino]?.nome || p.destino)}
    <br><small>${papel === 'fabrica' ? 'Transportadora: ' + esc(p.tra?.nome) : 'Fábrica: ' + esc(p.fab?.nome)} · frete ${p.frete_caixa}/caixa · valor ${p.valor_caixa}/caixa${p.missao ? ' · missão do Contratante' : ''}</small>
    <br><small>${STATUS[p.status]} · entregues ${p.entregues}/${p.qtd}${p.em_transito ? ` · ${p.em_transito} a caminho` : ''}</small>
    <span class="bts">${acoesPedido(p, papel)}</span></div>`).join('');
}
function acoesPedido(p, papel) {
  if (papel === 'fabrica' && (p.status === 'aberto' || (p.status === 'aceito' && !p.em_transito))) return `<button data-cancelar="${p.id}">Cancelar</button>`;
  if (papel === 'transportadora' && p.status === 'aberto') return `<button data-aceitar="${p.id}">Aceitar</button><button data-recusar="${p.id}">Recusar</button>`;
  return '';
}
function ligarPedidos(c) {
  c.querySelectorAll('[data-cancelar]').forEach((b) => { b.onclick = () => executar(() => rede.logistica.cancelar(Number(b.dataset.cancelar)), 'Pedido cancelado; o restante voltou ao estoque.'); });
  c.querySelectorAll('[data-aceitar]').forEach((b) => { b.onclick = () => executar(() => rede.logistica.responder(Number(b.dataset.aceitar), true), 'Pedido aceito. Despache um caminhão ou leve à mão.'); });
  c.querySelectorAll('[data-recusar]').forEach((b) => { b.onclick = () => executar(() => rede.logistica.responder(Number(b.dataset.recusar), false), 'Pedido recusado.'); });
}
function seletorTransportadora(empresas, id) {
  const t = empresas.filter((x) => x.tipo === 'transportadora');
  if (!t.length) return '<span class="vazio">Nenhuma transportadora de jogador ainda.</span>';
  return `<select id="${id}">${t.map((x) => `<option value="${x.id}">${esc(x.nome)} (${t.length > 0 ? 'dono: ' + esc(x.dono_perfil?.nome || '?') : ''})</option>`).join('')}</select>`;
}
async function telaVendas(c, e, empresas) {
  const pedidos = await rede.pedidosDe(e.id);
  const valor = mercado[e.produto] || 0;
  c.innerHTML = `<p class="dica">Estoque: <b>${e.estoque}</b> caixas. O mercado paga <b>${valor}</b> por caixa; você paga o frete à transportadora.</p>
    <div class="sub">Novo pedido para o mercado</div>
    <div class="form">${seletorTransportadora(empresas, 'eTra')}
      <label>Caixas <input id="eQtd" type="number" min="1" max="${Math.max(1, e.estoque)}" value="${Math.min(20, Math.max(1, e.estoque))}" inputmode="numeric"></label>
      <label>Frete por caixa <input id="eFrete" type="number" min="0" max="${valor}" value="${Math.round(valor * 0.3)}" inputmode="numeric"></label>
      <button id="eCriar">Enviar pedido</button></div>
    <div class="sub">Pedidos</div><div class="lista">${listaPedidos(pedidos, 'fabrica')}</div>`;
  const b = $('eCriar'); if (b) b.onclick = () => { const t = Number($('eTra')?.value); if (!t) { msg('Escolha uma transportadora.', false); return; }
    executar(() => rede.logistica.criarPedido(t, inteiro('eQtd'), inteiro('eFrete')), 'Pedido enviado à transportadora.'); };
  ligarPedidos(c);
}

// ------------------------------------------------------------ missões do Contratante
async function telaMissoes(c, e = null, empresas = null) {
  if (modo === 'missoes') $('empresaTitulo').textContent = 'Contratante';
  const missoes = await rede.logistica.missoes();
  const meu = e || await (async () => { const id = await rede.minhaEmpresaId(ctx.perfil().id); if (!id) return null; empresas = await rede.listarEmpresas(); return empresas.find((x) => x.id === id && x.dono === ctx.perfil().id) || null; })();
  if (!empresas && meu) empresas = await rede.listarEmpresas();
  const podeAceitar = meu && meu.tipo === 'fabrica';
  const resta = (m) => Math.max(0, Math.round((new Date(m.expira_em).getTime() - ctx.agora()) / 60000));
  c.innerHTML = `<p class="dica">"Pago o <b>dobro do mercado</b> por cargas entregues na praça. Quem chegar primeiro leva." ${podeAceitar ? '' : 'Só o dono de uma fábrica com estoque pode aceitar.'}</p>
    <div class="lista">${missoes.map((m) => `<div class="linha"><b>${m.qtd} caixas de ${PRODUTOS[m.produto]?.nome.toLowerCase() || m.produto}</b>
      <br><small>Paga ${m.valor_caixa} por caixa (total ${num(m.valor_caixa * m.qtd)}) · expira em ${resta(m)} min</small>
      ${podeAceitar && m.produto === meu.produto ? `<span class="bts"><button data-missao="${m.id}" data-valor="${m.valor_caixa}">Aceitar</button></span>` : ''}</div>`).join('')}</div>
    ${podeAceitar ? `<div class="sub">Transportadora e frete para a missão</div><div class="form">${seletorTransportadora(empresas, 'mTra')}
      <label>Frete por caixa <input id="mFrete" type="number" min="0" value="20" inputmode="numeric"></label></div>` : ''}`;
  c.querySelectorAll('[data-missao]').forEach((b) => {
    b.onclick = () => { const t = Number($('mTra')?.value); if (!t) { msg('Escolha uma transportadora.', false); return; }
      executar(() => rede.logistica.aceitarMissao(Number(b.dataset.missao), t, inteiro('mFrete')), 'Missão aceita! A transportadora foi avisada.'); };
  });
}

// ------------------------------------------------------------ transportadora: pedidos e caminhões
async function telaPedidos(c, e) {
  const pedidos = await rede.pedidosDe(e.id);
  c.innerHTML = `<p class="dica">Aceite pedidos e entregue com caminhão (aba Caminhões) ou à mão: o funcionário retira a caixa no portão da fábrica e leva ao destino.</p>
    <div class="lista">${listaPedidos(pedidos, 'transportadora')}</div>`;
  ligarPedidos(c);
}
async function telaCaminhoes(c, e) {
  const [frota, aceitos] = await Promise.all([rede.listarCaminhoes(), rede.pedidosAceitosDe(e.id)]);
  const meus = frota.filter((x) => x.empresa === e.id);
  const disponiveis = aceitos.filter((p) => p.qtd - p.entregues - p.em_transito > 0);
  const estado = (k) => k.status === 'parado' ? 'parado no portão' : k.status === 'em_rota'
    ? `levando ${k.carga} caixas · chega em ${Math.max(0, Math.round((new Date(k.chegada).getTime() - ctx.agora()) / 1000))} s` : 'voltando';
  c.innerHTML = `<p class="dica">Caminhão: <b>${num(PRECO_CAMINHAO)}</b> do caixa da empresa (você tem ${num(e.caixa)}). Leva até ${CAPACIDADE_CAMINHAO} caixas e faz a viagem sozinho.</p>
    <div class="botoes"><button id="eComprarCam">Comprar caminhão</button></div>
    <div class="sub">Frota (${meus.length}/5)</div>
    <div class="lista">${meus.length ? meus.map((k, i) => `<div class="linha"><b>Caminhão ${i + 1}</b> <small>${estado(k)}</small>
      ${k.status === 'parado' && disponiveis.length ? `<div class="form"><select data-sel="${k.id}">${disponiveis.map((p) => `<option value="${p.id}">#${p.id} · ${p.qtd - p.entregues - p.em_transito} caixas de ${esc(p.fab?.nome)} → ${esc(DESTINOS[p.destino]?.nome || p.destino)}</option>`).join('')}</select><button data-despachar="${k.id}">Despachar</button></div>` : ''}</div>`).join('') : '<span class="vazio">Nenhum caminhão.</span>'}</div>
    ${!disponiveis.length ? '<p class="dica">Nenhum pedido aceito com caixas para levar.</p>' : ''}`;
  $('eComprarCam').onclick = () => executar(() => rede.logistica.comprarCaminhao(), 'Caminhão comprado! Ele fica no portão da transportadora.');
  c.querySelectorAll('[data-despachar]').forEach((b) => {
    b.onclick = () => { const p = Number(c.querySelector(`[data-sel="${b.dataset.despachar}"]`).value);
      executar(() => rede.logistica.despachar(Number(b.dataset.despachar), p), 'Caminhão despachado! Acompanhe pelo mapa.'); };
  });
}

// ------------------------------------------------------------ comprar lote
function telaCompra(c) {
  const l = LOTES_VENDA.find((x) => x.id === loteCompra);
  $('empresaTitulo').textContent = `Lote ${loteCompra} à venda`;
  c.innerHTML = `<p>Preço: <b>20.000</b> moedas (você tem ${num(ctx.perfil().moedas)}).</p>
    <div class="form">
      <label>Nome da empresa <input id="cNome" maxlength="24" placeholder="Ex.: Doces do Vale"></label>
      <label>Tipo <select id="cTipo"><option value="fabrica">Fábrica</option><option value="transportadora">Transportadora</option></select></label>
      <label id="cProdL">Produto <select id="cProd"><option value="chocolate">Chocolate</option><option value="remedio">Remédio</option></select></label>
      <button id="cComprar">Comprar lote e fundar empresa</button></div>
    <p class="dica">A fábrica embala e vende ao mercado ou ao Contratante. A transportadora leva as cargas e ganha o frete. Você vira o dono e pode contratar funcionários.</p>`;
  $('cTipo').onchange = () => { $('cProdL').classList.toggle('oculto', $('cTipo').value !== 'fabrica'); };
  $('cComprar').onclick = () => {
    if (!l) return;
    const nome = $('cNome').value.trim(), tipo = $('cTipo').value;
    executar(() => rede.logistica.comprarLote(l.id, nome, tipo, tipo === 'fabrica' ? $('cProd').value : null), () => { modo = 'empresa'; aba = 'resumo'; return `${nome} fundada! O prédio já está no lote.`; });
  };
}
