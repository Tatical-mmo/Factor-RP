// Jujubas (ração militar): janelas do armazém das corporações, da central do Exército, da licitação e do comprador ilegal.
// O estado vem do banco a cada 15 s (e o "relógio" do sistema — chegadas, licitação — roda junto).
import * as rede from './rede.js';

const CORP_NOME = { policia: 'Polícia', prf: 'PRF', bope: 'BOPE', bombeiros: 'Bombeiros' };
const CORPS = ['policia', 'prf', 'bope', 'bombeiros'];
const PROD = { jujuba: { nome: 'jujubas', ic: '🍬', col: 'estoque' }, antiacido: { nome: 'anti-ácidos', ic: '🥤', col: 'antiacido' } };
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
export function corpDe(p) { return p?.bope ? 'bope' : p?.prf ? 'prf' : p?.policial ? 'policia' : p?.profissao === 'bombeiro' ? 'bombeiros' : null; }
export async function recarregar() {
  try { await rede.jujuba.processar(); } catch (e) { /* o relógio é de todos: se falhar, outro roda */ }
  try { est = await rede.jujuba.estado(); est.armas = await rede.jujuba.armamento(); est.cofre = await rede.jujuba.cofre(); ctx.mudou?.(est); } catch (e) { /* tenta de novo depois */ }
  if (modo) desenhar();
}
export function atualizar(dt) { if ((tempo -= dt) <= 0) { tempo = 15; recarregar(); } }
// quadro da licitação na central: quem tem o contrato, quem está concorrendo e os botões de comando (admin e Coronel+)
async function desenharLicitacao(p) {
  const box = $('rLicBox'); if (!box) return;
  let d; try { d = await rede.jujuba.licitacaoPainel(); } catch (e) { box.innerHTML = `<b>📄 Licitação do transporte</b><br><small>${esc(e.message)}</small>`; return; }
  if (modo !== 'central' || !$('rLicBox')) return;
  const l = d?.licitacao, lances = d?.lances || [], hora = (t) => new Date(t).toLocaleTimeString('pt-BR').slice(0, 5);
  const situacao = !l ? 'Nenhuma licitação aberta.'
    : l.status === 'vigente' ? `✅ Contrato com <b>${esc(d.empresa_nome || 'empresa removida')}</b> · ${l.entregas}/5 caminhões · ganhou com ${fmt(l.valor)}.`
    : `🟡 Aberta, fecha às <b>${hora(l.fecha_em)}</b> (se ninguém der lance, renova por mais 10 min).`;
  const lista = l?.status === 'aberta' ? (lances.length ? lances.map((x, i) => `<br><small>${i === 0 ? '🥇' : '·'} ${esc(x.nome || 'empresa')} — ${fmt(x.valor)}</small>`).join('') : '<br><small>Nenhum lance ainda.</small>') : '';
  const comando = p?.cargo === 'admin' || p?.profissao === 'exercito';   // o banco confere a patente (Coronel+)
  box.innerHTML = `<b>📄 Licitação do transporte</b><br><small>${situacao}</small>${lista}
    <div class="botoes"><button id="rLicVer">📄 Abrir a licitação (dar lance)</button>
    ${comando ? `${!l ? '<button id="rLicAbrir">🆕 Abrir nova licitação</button>' : ''}${l?.status === 'aberta' && lances.length ? '<button id="rLicFechar">⏩ Fechar agora</button>' : ''}${l?.status === 'vigente' ? '<button id="rLicQuebrar" style="background:#8b2c2c">💔 Quebrar contrato</button>' : ''}` : ''}</div>
    ${comando ? '<small class="dica">Abrir, fechar e quebrar: admin e Coronel para cima. Quebrar encerra o contrato e já abre outra licitação.</small>' : ''}`;
  $('rLicVer').onclick = () => abrir('licitacao');
  const cmd = (id, acao, txt, confirma) => { const b = $(id); if (!b) return; b.onclick = () => {
    if (confirma && b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Toque de novo para confirmar'; return; }
    executar(() => rede.jujuba.licitacaoComando(acao), txt);
  }; };
  cmd('rLicAbrir', 'abrir', '📄 Licitação aberta.'); cmd('rLicFechar', 'fechar_agora', '⏩ Licitação fechada: o menor lance ganhou.'); cmd('rLicQuebrar', 'quebrar', '💔 Contrato quebrado. Nova licitação aberta.', true);
}
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
  const arm = (k, pr = 'jujuba') => est.armazens.find((a) => a.corp === k)?.[PROD[pr].col] ?? 0;
  const ped = (k, pr = 'jujuba') => est.pedidos.find((x) => x.corp === k && (x.produto || 'jujuba') === pr);
  const viag = (k) => est.viagens.filter((v) => v.corp === k && v.status === 'em_rota');
  const nomeCarga = (v) => `${v.qtd ? `${fmt(v.qtd)} ${PROD[v.produto || 'jujuba'].nome}` : ''}${v.kit ? `${v.qtd ? ' + ' : ''}🔫 kit de armas` : ''}`;
  if (modo === 'armazem') {
    const k = corpDe(p); $('racoesTitulo').textContent = `🍬 Depósito de rações · ${CORP_NOME[k] || ''}`;
    if (!k) { c.innerHTML = '<p class="dica">Só Polícia, PRF, BOPE e Bombeiros em serviço.</p>'; return; }
    const vs = viag(k);
    const bloco = (pr) => { const pd = ped(k, pr), q = arm(k, pr), P = PROD[pr];
      return `<p><b>${P.ic} ${fmt(q)}</b> de 10.000 ${P.nome}</p>${barra(q)}
        <div class="botoes"><button data-pegar="${pr}">Pegar 5</button>${!pd && q < 10000 ? `<button data-pedir="${pr}">Pedir reposição ao Exército</button>` : ''}</div>
        ${pd ? `<p class="dica">📋 Pedido de ${P.nome} ${pd.status === 'aberto' ? 'aguardando o Exército' : 'despachado'}.</p>` : ''}`; };
    c.innerHTML = `<p class="dica">🍬 Jujuba = ração militar: por 5 minutos você fica 10% mais rápido, bate mais forte e recupera vida aos poucos.<br>🥤 Anti-ácido = suplemento: por 7 minutos a fome quase não cai (no máximo 3%). Não mata a fome, só segura.</p>
      ${bloco('jujuba')}${bloco('antiacido')}
      ${vs.map((v) => `<p class="dica">🚚 Caminhão com ${nomeCarga(v)} chega em ~${Math.max(0, Math.ceil((Date.parse(v.chegada) - ctx.agora()) / 1000))} s.</p>`).join('')}`;
    c.querySelectorAll('[data-pegar]').forEach((b2) => { b2.onclick = () => executar(() => rede.jujuba.pegarRacao(b2.dataset.pegar), (n) => `Você pegou ${n} ${PROD[b2.dataset.pegar].nome}. Use pela mochila.`); });
    c.querySelectorAll('[data-pedir]').forEach((b2) => { b2.onclick = () => executar(() => rede.jujuba.pedirRacao(b2.dataset.pedir), 'Pedido enviado ao Exército.'); });
  } else if (modo === 'central') {
    const semContrato = () => est.licitacao?.status !== 'vigente';
    $('racoesTitulo').textContent = '🎖️ Central de rações do Exército';
    const l = est.licitacao;
    const linhaProd = (k, pr) => { const pd = ped(k, pr), P = PROD[pr];
      return `<div style="margin:2px 0">${P.ic} ${fmt(arm(k, pr))} / 10.000${barra(arm(k, pr))}
        ${pd && pd.status === 'aberto' ? `<span class="dica">📋 Pedido de ${P.nome}</span> <div class="botoes"><button data-desp="${pd.id}" data-m="faltante">Mandar o que falta</button><button data-desp="${pd.id}" data-m="cheio">1 caminhão cheio</button></div>`
          : pd ? `<span class="dica">🚚 ${P.nome} despachado</span>`
          : arm(k, pr) < 10000 ? `<div class="botoes"><button data-env="${k}" data-pr="${pr}" data-m="cheio">🚚 Mandar ${P.nome} (1 caminhão)</button>${arm(k, pr) < 5000 ? `<button data-env="${k}" data-pr="${pr}" data-m="faltante">Completar</button>` : ''}</div>` : ''}</div>`; };
    c.innerHTML = `<p class="dica">Estoque das corporações em tempo real. Ao despachar, o quartel chama um caminhão livre da transportadora do contrato (ela recebe <b>${fmt(est.valor)}</b> por caminhão): ele vem da garagem, carrega no círculo amarelo do pátio e leva até a corporação. Dá para mandar mesmo sem pedido. Sem caminhão livre, a empresa paga 20.000 de multa para o cofre e vai um caminhão do Exército.</p>
      ${semContrato() ? `<p class="dica" style="color:#ffb74d">⚠️ Sem contrato de transporte vigente (${l ? 'licitação aberta' : 'licitação abrindo'}): por enquanto quem leva é o caminhão do Exército, saindo do Quartel direto para a corporação. Com contrato, o caminhão da transportadora vem até o círculo do pátio.</p>` : ''}
      <p>💰 Cofre do Exército: <b>${est.cofre == null ? '—' : fmt(est.cofre)}</b></p>
      ${CORPS.map((k) => { const pd = ped(k), vs = viag(k);
        return `<div class="linha" style="display:block;margin-bottom:8px"><b>${CORP_NOME[k]}</b>${linhaProd(k, 'jujuba')}${linhaProd(k, 'antiacido')}
          ${vs.map((v) => `<small>🚚 ${nomeCarga(v)} a caminho (~${Math.max(0, Math.ceil((Date.parse(v.chegada) - ctx.agora()) / 1000))} s)${v.caminhao ? ' · caminhão da transportadora' : ''}</small><br>`).join('')}
          ${k === 'policia' || k === 'prf' ? (() => { const a2 = (est.armas || []).find((x) => x.corp === k); return `<small>🔫 Armamento: ${a2 ? `${a2.espingarda} espingardas · ${a2.fuzil} fuzis · ${a2.granada} granadas` : '—'}</small>
            <div class="botoes">${pd && pd.status === 'aberto' ? `<button data-kit="${k}" data-ped="${pd.id}">🚚 Caminhão cheio + kit de armas</button>` : ''}<button data-kit="${k}">🚚 Só o kit de armas</button></div>`; })() : ''}</div>`; }).join('')}
      ${est.viagens.filter((v) => v.status === 'sequestrada').map((v) => `<p class="dica" style="color:#ff8a80">🚨 Caminhão (${nomeCarga(v)}) SEQUESTRADO a caminho de ${CORP_NOME[v.corp]}.</p>`).join('')}
      <div class="linha" style="display:block" id="rLicBox"><b>📄 Licitação do transporte</b><br><small>carregando…</small></div>
      <hr><p class="dica">🎒 Rações para você (militar em serviço): 5 de cada vez, a cada 5 min. Saem da produção do Exército, sem gastar o depósito das corporações.</p>
      <div class="botoes"><button data-pegarmil="jujuba">🍬 Pegar 5 jujubas</button><button data-pegarmil="antiacido">🥤 Pegar 5 anti-ácidos</button></div>
      <hr><p class="dica">🎖️ Recompensar soldado exemplar com o cofre (Coronel para cima): prisões, missões, treinos, sem ferir inocentes.</p>
      <div class="botoes"><input id="rRecNome" placeholder="nome do soldado" style="width:9em"><input id="rRecValor" type="number" min="100" max="1000000" step="100" value="5000" style="width:6em"></div>
      <div class="botoes"><input id="rRecMotivo" placeholder="motivo" style="width:15em"><button id="rRec">🎖️ Recompensar</button></div>`;
    desenharLicitacao(p);
    c.querySelectorAll('[data-pegarmil]').forEach((b2) => { b2.onclick = () => executar(() => rede.jujuba.pegarRacao(b2.dataset.pegarmil), (n) => `Você pegou ${n} ${PROD[b2.dataset.pegarmil].nome}. Use pela mochila.`); });
    $('rRec').onclick = () => executar(() => rede.jujuba.recompensar($('rRecNome').value.trim(), Math.floor(Number($('rRecValor').value)), $('rRecMotivo').value.trim()), (v) => `🎖️ ${fmt(v)} moedas enviadas do cofre.`);
    c.querySelectorAll('[data-kit]').forEach((b2) => { b2.onclick = () => executar(() => rede.jujuba.despacharKit(b2.dataset.kit, b2.dataset.ped ? Number(b2.dataset.ped) : null, ctx.duracaoViagem(b2.dataset.kit)), '🚚 Kit de armas despachado (10 espingardas, 10 fuzis e 30 granadas).'); });
    // o Exército manda por conta própria, sem esperar o pedido da corporação (108)
    c.querySelectorAll('[data-env]').forEach((b2) => { b2.onclick = () => executar(() => rede.jujuba.enviarRacao(b2.dataset.env, b2.dataset.pr, b2.dataset.m, ctx.duracaoViagem(b2.dataset.env)), (n) => (!n ? 'O depósito já está cheio.' : semContrato() ? `🚚 Sem contrato vigente: ${n} caminhão(ões) do Exército saem do Quartel direto para a corporação.` : `🚚 ${n} caminhão(ões) da transportadora a caminho do Quartel para carregar.`)); });
    c.querySelectorAll('[data-desp]').forEach((b2) => { b2.onclick = () => executar(() => rede.jujuba.despachar(Number(b2.dataset.desp), b2.dataset.m, ctx.duracaoViagem(est.pedidos.find((x) => x.id === Number(b2.dataset.desp))?.corp)), (n) => (semContrato() ? `🚚 Sem contrato vigente: ${n} caminhão(ões) do Exército saem do Quartel direto.` : `🚚 ${n} caminhão(ões) da transportadora a caminho do Quartel para carregar.`)); });
  } else if (modo === 'licitacao') {
    $('racoesTitulo').textContent = '📄 Licitação: transporte de rações do Exército';
    const l = est.licitacao; let lances = [];
    if (l) try { lances = await rede.jujuba.lances(l.id); } catch (e) { /* sem lista */ }
    const minhas = (await ctx.minhasTransportadoras()).filter((e) => e.nivel >= 5 || p?.cargo === 'admin');   // admin testa com qualquer uma
    c.innerHTML = `<p class="dica">Transportadoras nível 5+ <b>com 5 caminhões</b> disputam o contrato: ganha o <b>menor</b> valor pedido, que é pago na hora ao fechar a licitação. O contrato vale 5 caminhões, e cada caminhão chamado paga mais <b>${fmt(est.valor)}</b>. O quartel chama os caminhões sozinho: se nenhum estiver livre, a empresa paga <b>20.000</b> de multa por chamada.</p>
      ${l && l.status === 'vigente' && minhas.some((e) => e.id === l.empresa) ? `<p>🚚 Seus caminhões a serviço do Exército: <b>${est.viagens.filter((v) => v.empresa === l.empresa && v.status === 'em_rota').length}/5</b></p>` : ''}
      <p>${!l ? 'A licitação está abrindo…' : l.status === 'vigente' ? `Contrato vigente: ${l.entregas}/5 caminhões. A próxima licitação abre quando ele acabar.` : `Aberta: fecha às <b>${new Date(l.fecha_em).toLocaleTimeString('pt-BR').slice(0, 5)}</b>. ${lances.length} lance(s); menor até agora: <b>${lances[0] ? fmt(lances[0].valor) : '—'}</b>.`}</p>
      ${!l || l.status === 'aberta' ? (minhas.length ? `<div class="botoes"><select id="rEmp">${minhas.map((e) => `<option value="${e.id}">${esc(e.nome)} (nv ${e.nivel})</option>`).join('')}</select>
        <input id="rValor" type="number" min="10000" max="5000000" step="1000" value="${lances[0] ? Math.max(10000, lances[0].valor - 10000) : 800000}" style="width:9em"><button id="rLance">Dar lance</button></div>` : '<p class="dica">Você não tem transportadora nível 5 ou mais.</p>') : ''}
      ${p?.cargo === 'admin' ? `<hr><p class="dica">Admin: valor por caminhão</p><div class="botoes"><input id="rVal" type="number" min="1000" max="1000000" step="1000" value="${est.valor}" style="width:8em"><button id="rMudar">Mudar valor</button></div>` : ''}`;
    if ($('rLance')) $('rLance').onclick = () => executar(() => rede.jujuba.lance(Number($('rEmp').value), Number($('rValor').value)), 'Lance registrado.');
    if ($('rMudar')) $('rMudar').onclick = () => executar(() => rede.jujuba.valor(Number($('rVal').value)), 'Valor atualizado (a placa do quartel muda também).');
  } else if (modo === 'comprador') {
    $('racoesTitulo').textContent = '📦 Armazém do Seu Tonho';
    c.innerHTML = `<p class="dica">"Tenho jujuba e anti-ácido do Exército, sem nota. 500 cada, só para gente de clã."</p>
      <p>🍬 Jujubas em estoque: <b>${fmt(est.mercado)}</b></p>
      <div class="botoes">${[1, 5, 10].map((q) => `<button data-comp="${q}" ${est.mercado >= q ? '' : 'disabled'}>${q} (${fmt(q * 500)})</button>`).join('')}</div>
      <p>🥤 Anti-ácido em estoque: <b>${fmt(est.mercadoAnti)}</b></p>
      <div class="botoes">${[1, 5, 10].map((q) => `<button data-compa="${q}" ${est.mercadoAnti >= q ? '' : 'disabled'}>${q} (${fmt(q * 500)})</button>`).join('')}</div>`;
    c.querySelectorAll('[data-comp]').forEach((b) => { b.onclick = () => executar(() => rede.jujuba.comprar(Number(b.dataset.comp)), (n) => `Você comprou ${n} jujubas.`); });
    c.querySelectorAll('[data-compa]').forEach((b) => { b.onclick = () => executar(() => rede.jujuba.comprarAntiacido(Number(b.dataset.compa)), (n) => `Você comprou ${n} anti-ácidos.`); });
  }
}
