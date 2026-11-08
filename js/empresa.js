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
let selecionada = null; // empresa aberta na janela
let loteCompra = null;
let mercado = {};
const LIMITES = { robos: [2, 4, 8], funcionarios: [5, 10, 20], caminhoes: [2, 3, 5], evoluir: [30000, 60000, null] };
const lim = (e, item) => LIMITES[item][e.nivel - 1];
const ativos = (e) => e.robos + (e.aluguel_ate && Date.parse(e.aluguel_ate) > Date.now() ? e.robos_alugados : 0);
const temFrota = (e) => e.transporte || e.nivel >= 3;
const tipoNome = (e) => e.fabrica && e.transporte ? `Grupo (fábrica de ${PRODUTOS[e.produto].nome.toLowerCase()} + transportadora)`
  : e.fabrica ? `Fábrica de ${PRODUTOS[e.produto].nome.toLowerCase()}` : 'Transportadora';

export async function iniciarEmpresa(contexto) {
  ctx = contexto;
  $('btEmpresa').onclick = () => abrirEmpresa();
  $('fecharEmpresa').onclick = fechar;
  try { for (const m of await rede.listarMercado()) mercado[m.produto] = m.valor_caixa; } catch { /* sem preços ainda */ }
}
export function abrirEmpresa(id = null) { modo = 'empresa'; aba = 'resumo'; if (id) selecionada = id; mostrar(); }
export function abrirCompra(lote) { modo = 'comprar'; loteCompra = lote; mostrar(); }
export function abrirMissoes() { modo = 'missoes'; mostrar(); }
export function empresaAberta() { return !!modo; }
const digitando = (id) => { const f = document.activeElement; return !!f && ['INPUT', 'SELECT', 'TEXTAREA'].includes(f.tagName) && !!$(id)?.contains(f); };
export function atualizar() { if (modo && !digitando('empresaJanela')) desenhar(); }
function mostrar() { $('empresaJanela').classList.remove('oculto'); desenhar(); }
function fechar() { modo = null; $('empresaJanela').classList.add('oculto'); }

function msg(t, ok = true) { const m = $('empresaMsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'erro'); clearTimeout(msg.t); msg.t = setTimeout(() => { m.textContent = ''; }, 4000); }
async function executar(fn, sucesso) {
  try { const r = await fn(); msg(typeof sucesso === 'function' ? sucesso(r) : sucesso); ctx.recarregar?.(); await desenhar(); }
  catch (e) { msg(e.message, false); }
}
const inteiro = (id) => Math.floor(Number($(id)?.value) || 0);

async function desenhar() {
  const c = $('empresaConteudo'), abas = $('empresaAbas');
  abas.innerHTML = '';
  try {
    if (modo === 'comprar') return telaCompra(c);
    const meuId = ctx.perfil().id;
    const [empresas, emprego] = await Promise.all([rede.listarEmpresas(), rede.minhaEmpresaId(meuId)]);
    ctx.definirEmprego(emprego);
    const minhas = empresas.filter((e) => e.dono === meuId);
    if (modo === 'missoes') return await telaMissoes(c, minhas, empresas);
    const opcoes = [...minhas, ...empresas.filter((e) => e.id === emprego && e.dono !== meuId)];
    if (!opcoes.some((e) => e.id === selecionada)) selecionada = opcoes[0]?.id ?? null;
    const e = opcoes.find((x) => x.id === selecionada);
    let topo = opcoes.length > 1 ? `<div class="chips seletor">${opcoes.map((x) => `<button class="chip ${x.id === selecionada ? 'sel' : ''}" data-emp="${x.id}">${esc(x.nome)}${x.dono === meuId ? '' : ' (emprego)'}</button>`).join('')}</div>` : '';
    if (!e) { $('empresaTitulo').textContent = 'Empresas'; return telaSemEmpresa(c, empresas); }
    $('empresaTitulo').textContent = `${e.nome} ${'★'.repeat(e.nivel)}`;
    if (e.dono !== meuId) { telaFuncionario(c, e); c.insertAdjacentHTML('afterbegin', topo); ligarSeletor(c); return; }
    const lista = [['resumo', 'Resumo'], ['equipe', 'Funcionários']];
    if (e.fabrica) lista.push(['vendas', 'Vendas'], ['missoes', 'Missões']);
    if (temFrota(e)) lista.push(['pedidos', 'Pedidos'], ['caminhoes', 'Caminhões']);
    lista.push(['robos', 'Robôs e nível']);
    if (minhas.length > 1) lista.push(['fundir', 'Fundir']);
    if (!lista.some(([k]) => k === aba)) aba = 'resumo';
    abas.innerHTML = lista.map(([k, t]) => `<button data-aba="${k}" class="${aba === k ? 'sel' : ''}">${t}</button>`).join('');
    abas.querySelectorAll('button').forEach((b) => { b.onclick = () => { aba = b.dataset.aba; desenhar(); }; });
    if (aba === 'resumo') telaResumo(c, e);
    else if (aba === 'equipe') await telaEquipe(c, e);
    else if (aba === 'vendas') await telaVendas(c, e, empresas);
    else if (aba === 'missoes') await telaMissoes(c, [e], empresas);
    else if (aba === 'pedidos') await telaPedidos(c, e);
    else if (aba === 'caminhoes') await telaCaminhoes(c, e);
    else if (aba === 'robos') telaRobos(c, e);
    else if (aba === 'fundir') telaFundir(c, e, minhas);
    c.insertAdjacentHTML('afterbegin', topo); ligarSeletor(c);
  } catch (err) { c.textContent = err.message; }
}
function ligarSeletor(c) { c.querySelectorAll('[data-emp]').forEach((b) => { b.onclick = () => { selecionada = Number(b.dataset.emp); desenhar(); }; }); }

// ------------------------------------------------------------ sem empresa / funcionário
function telaSemEmpresa(c, empresas) {
  $('empresaTitulo').textContent = 'Empresas';
  const livres = LOTES_VENDA.length - ctx.lotesOcupados();
  c.innerHTML = `<p class="dica">Você não tem empresa nem emprego. Peça emprego a um dono ou funde a sua: há <b>${livres}</b> lote(s) à venda (placas "Lote à venda" pela cidade). Enquanto isso, as empresas do sistema pagam por entrega na doca.</p>
    <div class="sub">Empresas da cidade</div>
    <div class="lista">${empresas.length ? empresas.map((e) => `<div class="linha"><b>${esc(e.nome)}</b> <i class="tag">${esc(tipoNome(e))}</i> ${'★'.repeat(e.nivel)}<br>
      <small>Dono: ${esc(e.dono_perfil?.nome || '?')} · paga ${e.pagamento} por tarefa</small></div>`).join('') : '<span class="vazio">Nenhuma ainda. Seja o primeiro!</span>'}</div>`;
}
function telaFuncionario(c, e) {
  const tarefa = e.fabrica
    ? 'Vá até a <b>bancada</b> ao lado do prédio e aperte <b>E</b> para embalar. Cada caixa vai para o estoque e você recebe na hora.'
    : 'Vá ao <b>depósito</b> (portão) de uma fábrica com pedido aceito pela sua transportadora, retire uma caixa e leve ao destino do pedido.';
  c.innerHTML = `<p>Você trabalha aqui e recebe <b>${e.pagamento}</b> moedas por tarefa.</p><p class="dica">${tarefa}</p>
    <div class="botoes"><button id="eSair" class="perigo">Sair do emprego</button></div>`;
  $('eSair').onclick = () => executar(() => rede.logistica.sair(), 'Você saiu da empresa.');
}

// ------------------------------------------------------------ dono: resumo e equipe
function telaResumo(c, e) {
  c.innerHTML = `<p class="dica">${esc(tipoNome(e))} · nível ${e.nivel} · lotes ${ctx.lotesDe(e.id).join(', ') || '?'}</p>
    <div class="cartoes"><div><small>Caixa</small><b>${num(e.caixa)}</b></div>${e.fabrica ? `<div><small>Estoque</small><b>${num(e.estoque)}</b></div>` : ''}<div><small>Paga por tarefa</small><b>${e.pagamento}</b></div><div><small>Robôs</small><b>${ativos(e)}</b></div></div>
    <div class="sub">Caixa da empresa</div>
    <div class="botoes"><input id="eValor" type="number" min="1" placeholder="Valor" inputmode="numeric"><button id="eDep">Depositar</button><button id="eSaq">Sacar</button></div>
    <div class="sub">Pagamento por tarefa (0 a 500)</div>
    <div class="botoes"><input id="ePag" type="number" min="0" max="500" value="${e.pagamento}" inputmode="numeric"><button id="eSalvarPag">Salvar</button></div>
    <p class="dica">${e.fabrica ? 'Cada caixa embalada por um funcionário custa o pagamento dele. O mercado paga ' + (mercado[e.produto] || '?') + ' por caixa entregue.' : 'Cada caixa levada à mão por um funcionário custa o pagamento dele. Sua transportadora ganha o frete combinado em cada caixa entregue.'}</p>`;
  $('eDep').onclick = () => { const v = inteiro('eValor'); if (v > 0) executar(() => rede.logistica.depositar(e.id, v), `Depositado: ${num(v)}.`); };
  $('eSaq').onclick = () => { const v = inteiro('eValor'); if (v > 0) executar(() => rede.logistica.sacar(e.id, v), `Sacado: ${num(v)}.`); };
  $('eSalvarPag').onclick = () => executar(() => rede.logistica.pagamento(e.id, inteiro('ePag')), 'Pagamento atualizado.');
}
async function telaEquipe(c, e) {
  const membros = await rede.membrosDe(e.id);
  c.innerHTML = `<p class="dica">Funcionários: ${membros.length}/${lim(e, 'funcionarios')} (evolua a empresa para contratar mais).</p><div class="botoes"><input id="eNome" placeholder="Nome do jogador"><button id="eContratar">Contratar</button></div>
    <div class="sub">Equipe (${membros.length})</div>
    <div class="lista">${membros.map((m) => `<div class="linha item"><span class="nm"><b>${esc(m.perfil?.nome)}</b><small>funcionário desde ${new Date(m.desde).toLocaleDateString('pt-BR')}</small></span>
      <span class="bts"><button data-demitir="${m.jogador}">Demitir</button></span></div>`).join('')}</div>`;
  $('eContratar').onclick = () => { const n = $('eNome').value.trim(); if (n) executar(() => rede.logistica.contratar(e.id, n), `${n} foi contratado.`); };
  c.querySelectorAll('[data-demitir]').forEach((b) => { b.onclick = () => executar(() => rede.logistica.demitir(e.id, b.dataset.demitir), 'Funcionário demitido.'); });
}

// ------------------------------------------------------------ fábrica: vendas
function listaPedidos(pedidos, papelFixo, eId) {
  if (!pedidos.length) return '<span class="vazio">Nenhum pedido ainda.</span>';
  return pedidos.map((p) => { const papel = papelFixo === 'auto' ? (p.transportadora === eId ? 'transportadora' : 'fabrica') : papelFixo; return `<div class="linha"><b>#${p.id}</b> ${p.qtd} caixas de ${PRODUTOS[p.produto]?.nome.toLowerCase() || p.produto} → ${esc(DESTINOS[p.destino]?.nome || p.destino)}
    <br><small>${papel === 'fabrica' ? 'Transportadora: ' + esc(p.tra?.nome) : 'Fábrica: ' + esc(p.fab?.nome)} · frete ${p.frete_caixa}/caixa · valor ${p.valor_caixa}/caixa${p.missao ? ' · missão do Contratante' : ''}</small>
    <br><small>${STATUS[p.status]} · entregues ${p.entregues}/${p.qtd}${p.em_transito ? ` · ${p.em_transito} a caminho` : ''}</small>
    <span class="bts">${acoesPedido(p, papel)}</span></div>`; }).join('');
}
function acoesPedido(p, papel) {
  if (papel === 'fabrica' && p.transportadora === p.fabrica && p.status === 'aceito' && !p.em_transito) return `<button data-cancelar="${p.id}">Cancelar</button>`;
  if (papel === 'fabrica' && (p.status === 'aberto' || (p.status === 'aceito' && !p.em_transito))) return `<button data-cancelar="${p.id}">Cancelar</button>`;
  if (papel === 'transportadora' && p.status === 'aberto') return `<button data-aceitar="${p.id}">Aceitar</button><button data-recusar="${p.id}">Recusar</button>`;
  return '';
}
function ligarPedidos(c) {
  c.querySelectorAll('[data-cancelar]').forEach((b) => { b.onclick = () => executar(() => rede.logistica.cancelar(Number(b.dataset.cancelar)), 'Pedido cancelado; o restante voltou ao estoque.'); });
  c.querySelectorAll('[data-aceitar]').forEach((b) => { b.onclick = () => executar(() => rede.logistica.responder(Number(b.dataset.aceitar), true), 'Pedido aceito. Despache um caminhão ou leve à mão.'); });
  c.querySelectorAll('[data-recusar]').forEach((b) => { b.onclick = () => executar(() => rede.logistica.responder(Number(b.dataset.recusar), false), 'Pedido recusado.'); });
}
function seletorTransportadora(empresas, id, fabrica) {
  const t = empresas.filter((x) => x.transporte || (fabrica && x.id === fabrica.id && temFrota(x)));
  if (!t.length) return '<span class="vazio">Nenhuma transportadora de jogador ainda.</span>';
  return `<select id="${id}">${t.map((x) => `<option value="${x.id}">${esc(x.nome)}${fabrica && x.dono === fabrica.dono ? ' (sua, sem frete)' : ' (dono: ' + esc(x.dono_perfil?.nome || '?') + ')'}</option>`).join('')}</select>`;
}
async function telaVendas(c, e, empresas) {
  const pedidos = await rede.pedidosDe(e.id);
  const valor = mercado[e.produto] || 0;
  c.innerHTML = `<p class="dica">Estoque: <b>${e.estoque}</b> caixas. O mercado paga <b>${valor}</b> por caixa; você paga o frete à transportadora.</p>
    <div class="sub">Novo pedido para o mercado</div>
    <div class="form">${seletorTransportadora(empresas, 'eTra', e)}
      <label>Caixas <input id="eQtd" type="number" min="1" max="${Math.max(1, e.estoque)}" value="${Math.min(20, Math.max(1, e.estoque))}" inputmode="numeric"></label>
      <label>Frete por caixa <input id="eFrete" type="number" min="0" max="${valor}" value="${Math.round(valor * 0.3)}" inputmode="numeric"></label>
      <button id="eCriar">Enviar pedido</button></div>
    <div class="sub">Pedidos</div><div class="lista">${listaPedidos(pedidos, 'fabrica')}</div>`;
  const b = $('eCriar'); if (b) b.onclick = () => { const t = Number($('eTra')?.value); if (!t) { msg('Escolha uma transportadora.', false); return; }
    executar(() => rede.logistica.criarPedido(e.id, t, inteiro('eQtd'), inteiro('eFrete')), 'Pedido enviado à transportadora.'); };
  ligarPedidos(c);
}

// ------------------------------------------------------------ missões do Contratante
async function telaMissoes(c, minhas, empresas) {
  if (modo === 'missoes') $('empresaTitulo').textContent = 'Contratante';
  const missoes = await rede.logistica.missoes();
  const fabricas = minhas.filter((x) => x.fabrica);
  const resta = (m) => Math.max(0, Math.round((new Date(m.expira_em).getTime() - ctx.agora()) / 60000));
  const fabDe = (m) => fabricas.find((f) => f.produto === m.produto && f.estoque >= m.qtd) || fabricas.find((f) => f.produto === m.produto);
  c.innerHTML = `<p class="dica">"Pago o <b>dobro do mercado</b> por cargas entregues na praça. Quem chegar primeiro leva." ${fabricas.length ? '' : 'Só o dono de uma fábrica com estoque pode aceitar.'}</p>
    <div class="lista">${missoes.map((m) => { const f = fabDe(m); return `<div class="linha"><b>${m.qtd} caixas de ${PRODUTOS[m.produto]?.nome.toLowerCase() || m.produto}</b>
      <br><small>Paga ${m.valor_caixa} por caixa (total ${num(m.valor_caixa * m.qtd)}) · expira em ${resta(m)} min</small>
      ${f ? `<span class="bts"><button data-missao="${m.id}" data-fab="${f.id}">Aceitar pela ${esc(f.nome)} (estoque ${f.estoque})</button></span>` : ''}</div>`; }).join('')}</div>
    ${fabricas.length ? `<div class="sub">Transportadora e frete para a missão</div><div class="form">${seletorTransportadora(empresas, 'mTra', fabricas[0])}
      <label>Frete por caixa <input id="mFrete" type="number" min="0" value="20" inputmode="numeric"></label></div>` : ''}`;
  c.querySelectorAll('[data-missao]').forEach((b) => {
    b.onclick = () => { const t = Number($('mTra')?.value); if (!t) { msg('Escolha uma transportadora.', false); return; }
      executar(() => rede.logistica.aceitarMissao(Number(b.dataset.missao), Number(b.dataset.fab), t, inteiro('mFrete')), 'Missão aceita! A transportadora foi avisada.'); };
  });
}

// ------------------------------------------------------------ transportadora: pedidos e caminhões
async function telaPedidos(c, e) {
  const pedidos = await rede.pedidosDe(e.id);
  c.innerHTML = `<p class="dica">Aceite pedidos e entregue com caminhão (aba Caminhões) ou à mão: o funcionário retira a caixa no portão da fábrica e leva ao destino.</p>
    <div class="lista">${listaPedidos(pedidos, 'auto', e.id)}</div>`;
  ligarPedidos(c);
}
async function telaCaminhoes(c, e) {
  const [frota, aceitos] = await Promise.all([rede.listarCaminhoes(), rede.pedidosAceitosDe(e.id)]);
  const meus = frota.filter((x) => x.empresa === e.id);
  const cap = Math.min(60, 20 + 5 * ativos(e));
  const disponiveis = aceitos.filter((p) => p.qtd - p.entregues - p.em_transito > 0);
  const estado = (k) => k.status === 'parado' ? 'parado no portão' : k.status === 'em_rota'
    ? `levando ${k.carga} caixas · chega em ${Math.max(0, Math.round((new Date(k.chegada).getTime() - ctx.agora()) / 1000))} s` : 'voltando';
  c.innerHTML = `<p class="dica">Caminhão: <b>${num(PRECO_CAMINHAO)}</b> do caixa da empresa (você tem ${num(e.caixa)}). Leva até <b>${cap}</b> caixas (${CAPACIDADE_CAMINHAO} + 5 por robô) e faz a viagem sozinho.</p>
    <div class="botoes"><button id="eComprarCam">Comprar caminhão</button></div>
    <div class="sub">Frota (${meus.length}/${lim(e, 'caminhoes')})</div>
    <div class="lista">${meus.length ? meus.map((k, i) => `<div class="linha"><b>Caminhão ${i + 1}</b> <small>${estado(k)}</small>
      ${k.status === 'parado' && disponiveis.length ? `<div class="form"><select data-sel="${k.id}">${disponiveis.map((p) => `<option value="${p.id}">#${p.id} · ${p.qtd - p.entregues - p.em_transito} caixas de ${esc(p.fab?.nome)} → ${esc(DESTINOS[p.destino]?.nome || p.destino)}</option>`).join('')}</select><label class="check"><input type="checkbox" data-esc="${k.id}"> Escolta armada (400): caminhão aguenta mais ataques</label><button data-despachar="${k.id}">Despachar</button></div>` : ''}</div>`).join('') : '<span class="vazio">Nenhum caminhão.</span>'}</div>
    ${!disponiveis.length ? '<p class="dica">Nenhum pedido aceito com caixas para levar.</p>' : ''}`;
  $('eComprarCam').onclick = () => executar(() => rede.logistica.comprarCaminhao(e.id), 'Caminhão comprado! Ele fica no portão da transportadora.');
  c.querySelectorAll('[data-despachar]').forEach((b) => {
    b.onclick = () => { const p = Number(c.querySelector(`[data-sel="${b.dataset.despachar}"]`).value);
      const esc2 = !!c.querySelector(`[data-esc="${b.dataset.despachar}"]`)?.checked;
      executar(() => rede.logistica.despachar(Number(b.dataset.despachar), p, esc2), esc2 ? 'Caminhão despachado com escolta!' : 'Caminhão despachado! Acompanhe pelo mapa.'); };
  });
}

// ------------------------------------------------------------ robôs e nível
function telaRobos(c, e) {
  const alugadosAtivos = e.aluguel_ate && Date.parse(e.aluguel_ate) > Date.now() ? e.robos_alugados : 0;
  const custo = lim(e, 'evoluir');
  const funcao = [e.fabrica ? 'Na fábrica, cada robô embala <b>1 caixa a cada 90 s</b> sozinho (acumula até 4 h fora do jogo).' : '',
    temFrota(e) ? 'Na transportadora, cada robô carregador põe <b>+5 caixas</b> em cada caminhão (máximo 60).' : ''].filter(Boolean).join(' ');
  c.innerHTML = `<div class="cartoes"><div><small>Nível</small><b>${'★'.repeat(e.nivel)}</b></div><div><small>Robôs ativos</small><b>${ativos(e)}/${lim(e, 'robos')}</b></div>
      <div><small>Funcionários</small><b>até ${lim(e, 'funcionarios')}</b></div><div><small>Caminhões</small><b>${temFrota(e) ? 'até ' + lim(e, 'caminhoes') : '—'}</b></div></div>
    <p class="dica">${funcao}</p>
    <div class="sub">Robôs</div>
    <p class="dica">Próprios: <b>${e.robos}</b> · alugados: <b>${alugadosAtivos}</b>${alugadosAtivos ? ` (até ${new Date(e.aluguel_ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})` : ''}</p>
    <div class="botoes"><button id="rComprar">Comprar robô (8.000)</button><button id="rAlugar">Alugar por 24 h (1.200)</button></div>
    <div class="sub">Evoluir a empresa</div>
    ${custo ? `<p class="dica">Nível ${e.nivel + 1}: prédio maior, até ${LIMITES.robos[e.nivel]} robôs, ${LIMITES.funcionarios[e.nivel]} funcionários e ${LIMITES.caminhoes[e.nivel]} caminhões${!e.transporte && e.nivel + 1 >= 3 ? ', e a fábrica passa a poder ter caminhões' : ''}.</p>
      <div class="botoes"><button id="rEvoluir">Evoluir por ${num(custo)}</button></div>` : '<p class="dica">Nível máximo.</p>'}
    <p class="dica">Tudo sai do caixa da empresa (${num(e.caixa)}).</p>`;
  $('rComprar').onclick = () => executar(() => rede.logistica.comprarRobo(e.id), 'Robô comprado! Ele já está trabalhando.');
  $('rAlugar').onclick = () => executar(() => rede.logistica.alugarRobo(e.id), 'Robô alugado por 24 horas.');
  const ev = $('rEvoluir'); if (ev) ev.onclick = () => executar(() => rede.logistica.evoluir(e.id), (n) => `Empresa evoluiu para o nível ${n}!`);
}

// ------------------------------------------------------------ fusão
function telaFundir(c, e, minhas) {
  const outras = minhas.filter((x) => x.id !== e.id);
  c.innerHTML = `<p class="dica">A <b>${esc(e.nome)}</b> absorve outra empresa sua: caixa, estoque, robôs, caminhões, funcionários (até o limite) e o prédio, que vira uma unidade. Fábrica + transportadora vira um <b>grupo</b>, que produz e transporta sem pagar frete. Fica o nível mais alto das duas.</p>
    <div class="form"><label>Empresa que será absorvida <select id="fAbs">${outras.map((x) => `<option value="${x.id}">${esc(x.nome)} · ${esc(tipoNome(x))}</option>`).join('')}</select></label>
      <button id="fFundir">Fundir na ${esc(e.nome)}</button></div>
    <p class="dica">Não dá para desfazer. A absorvida não pode ter pedidos em andamento nem caminhões viajando.</p>`;
  $('fFundir').onclick = () => {
    const b = $('fFundir');
    if (!b.dataset.conf) { b.dataset.conf = '1'; b.textContent = 'Toque de novo para confirmar'; setTimeout(() => { if (b.isConnected) { delete b.dataset.conf; b.textContent = `Fundir na ${e.nome}`; } }, 3000); return; }
    executar(() => rede.logistica.fundir(e.id, Number($('fAbs').value)), 'Empresas fundidas!');
  };
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
    <p class="dica">A fábrica embala e vende ao mercado ou ao Contratante. A transportadora leva as cargas e ganha o frete. Você pode ter até 5 empresas e fundir as suas depois.</p>`;
  $('cTipo').onchange = () => { $('cProdL').classList.toggle('oculto', $('cTipo').value !== 'fabrica'); };
  $('cComprar').onclick = () => {
    if (!l) return;
    const nome = $('cNome').value.trim(), tipo = $('cTipo').value;
    executar(() => rede.logistica.comprarLote(l.id, nome, tipo, tipo === 'fabrica' ? $('cProd').value : null), (id) => { modo = 'empresa'; aba = 'resumo'; selecionada = id; return `${nome} fundada! O prédio já está no lote.`; });
  };
}
