// Painel da equipe (administrador e moderadores)
// Toda ação é conferida no banco; aqui só mostramos os botões que fazem sentido.
import * as rede from './rede.js';
import { PERSONAGENS, ROBOS } from './config.js';

const $ = (id) => document.getElementById(id);
const PODERES = [
  ['banir', 'Banir e desbanir'],
  ['moedas', 'Dar e tirar moedas'],
  ['algemar', 'Algemar'],
  ['prender', 'Prender e soltar'],
  ['teleportar', 'Teleportar'],
  ['imortal', 'Modo imortal'],
];
const ACOES = {
  moedas: 'mudou as moedas de', banir: 'baniu', desbanir: 'desbaniu', algemar: 'algemou', soltar_algemas: 'tirou as algemas de',
  prender: 'prendeu', soltar: 'soltou da cadeia', teleporte: 'teleportou', cargo: 'mudou o cargo de',
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let ctx = null;          // funções e dados vindos do jogo
let aba = 'jogadores';
let selecionado = null;  // id do jogador aberto

export function iniciarPainel(contexto) {
  ctx = contexto;
  $('btPainel').onclick = () => abrir();
  $('fecharPainel').onclick = fechar;
  document.querySelectorAll('#painel .abas button').forEach((b) => { b.onclick = () => { aba = b.dataset.aba; selecionado = null; desenhar(); }; });
  atualizarBotao();
}
export function atualizarBotao() {
  const staff = ctx && ctx.perfil().cargo !== 'jogador';
  $('btPainel').classList.toggle('oculto', !staff);
  if (!staff) fechar();
  document.querySelectorAll('#painel .abas .soAdmin').forEach((b) => b.classList.toggle('oculto', ctx?.perfil().cargo !== 'admin'));
}
export function painelAberto() { return !$('painel').classList.contains('oculto'); }
function abrir() { $('painel').classList.remove('oculto'); desenhar(); }
function fechar() { $('painel').classList.add('oculto'); }

function pode(poder) {
  const p = ctx.perfil();
  return p.cargo === 'admin' || (p.cargo === 'moderador' && p.poderes?.[poder] === true);
}
function msg(t, ok = true) { const m = $('painelMsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'erro'); clearTimeout(msg.t); msg.t = setTimeout(() => { m.textContent = ''; }, 4000); }
async function executar(fn, sucesso) {
  try { await fn(); msg(sucesso); if (selecionado) await abrirJogador(selecionado); else desenhar(); }
  catch (e) { msg(e.message, false); }
}

function desenhar() {
  document.querySelectorAll('#painel .abas button').forEach((b) => b.classList.toggle('sel', b.dataset.aba === aba));
  if (aba === 'jogadores') { if (selecionado) abrirJogador(selecionado); else listaJogadores(); }
  else if (aba === 'eu') abaEu();
  else if (aba === 'equipe') abaEquipe();
  else if (aba === 'historico') abaHistorico();
}

// ------------------------------------------------------------ jogadores
async function listaJogadores(texto = '') {
  const c = $('painelConteudo');
  const online = ctx.online();
  c.innerHTML = `
    <input id="pBusca" placeholder="Buscar jogador pelo nome" value="${esc(texto)}">
    <div class="sub">Online agora</div>
    <div class="chips">${online.length ? online.map((o) => `<button class="chip" data-id="${o.id}">${esc(o.nome)}</button>`).join('') : '<span class="vazio">Ninguém além de você.</span>'}</div>
    <div class="sub">Resultados</div><div id="pLista" class="lista">Carregando…</div>`;
  c.querySelectorAll('.chip').forEach((b) => { b.onclick = () => abrirJogador(b.dataset.id); });
  const busca = $('pBusca');
  busca.oninput = () => { clearTimeout(busca.t); busca.t = setTimeout(() => preencherLista(busca.value.trim()), 350); };
  preencherLista(texto);
}
async function preencherLista(texto) {
  const el = $('pLista'); if (!el) return;
  try {
    const lista = await rede.buscarJogadores(texto);
    const on = new Set(ctx.online().map((o) => o.id));
    el.innerHTML = lista.length ? lista.map((j) => `
      <button class="linha" data-id="${j.id}">
        <b>${esc(j.nome)}</b> ${etiquetas(j, on.has(j.id))}
      </button>`).join('') : '<span class="vazio">Nenhum jogador encontrado.</span>';
    el.querySelectorAll('.linha').forEach((b) => { b.onclick = () => abrirJogador(b.dataset.id); });
  } catch (e) { el.textContent = e.message; }
}
function etiquetas(j, online) {
  const t = [];
  if (j.cargo !== 'jogador') t.push(`<i class="tag ${j.cargo}">${j.cargo}</i>`);
  if (online) t.push('<i class="tag on">online</i>');
  if (j.banido) t.push('<i class="tag ruim">banido</i>');
  if (j.algemado) t.push('<i class="tag ruim">algemado</i>');
  if (j.pena_seg > 0) t.push(`<i class="tag ruim">preso ${Math.ceil(j.pena_seg / 60)} min</i>`);
  return t.join(' ');
}

async function abrirJogador(id) {
  selecionado = id; aba = 'jogadores';
  const c = $('painelConteudo');
  let j;
  try { j = await rede.carregarPerfil(id); } catch (e) { c.textContent = e.message; return; }
  if (!j) { c.textContent = 'Jogador não encontrado.'; return; }
  const eu = ctx.perfil();
  const souEu = j.id === eu.id;
  const online = ctx.online().find((o) => o.id === j.id);
  const nome = PERSONAGENS.find((p) => p.id === j.personagem)?.nome || j.personagem;
  const equipe = j.cargo !== 'jogador';
  let h = `<button class="voltar" id="pVoltar">‹ Voltar</button>
    <div class="ficha"><img src="assets/miniaturas/${esc(j.personagem)}.webp" alt="">
      <div><b class="grande">${esc(j.nome)}</b><br>${etiquetas(j, !!online || souEu)}<br>
      ${esc(nome)} · ${Number(j.moedas).toLocaleString('pt-BR')} moedas
      ${j.banido && j.banido_motivo ? `<br><small>Motivo do banimento: ${esc(j.banido_motivo)}</small>` : ''}</div></div>`;

  if (pode('teleportar')) {
    h += `<div class="sub">Teleporte</div><div class="botoes">
      ${online && !souEu ? '<button id="pIr">Ir até ele</button>' : ''}
      ${!souEu ? '<button id="pTrazer">Trazer até mim</button>' : ''}</div>`;
  }
  if (pode('moedas') && (eu.cargo === 'admin' || !souEu)) {
    h += `<div class="sub">Moedas</div><div class="botoes"><input id="pValor" type="number" min="1" placeholder="Quantidade" inputmode="numeric">
      <button id="pDar">Dar</button><button id="pTirar">Tirar</button></div>`;
  }
  if (!souEu && !equipe) {
    if (pode('algemar')) h += `<div class="sub">Algemas</div><div class="botoes"><button id="pAlgemar">${j.algemado ? 'Tirar as algemas' : 'Algemar'}</button></div>`;
    if (pode('prender')) h += `<div class="sub">Cadeia</div><div class="botoes">
      ${j.pena_seg > 0 ? '<button id="pSoltar">Soltar agora</button>' : '<input id="pMin" type="number" min="1" max="1440" value="7" inputmode="numeric"><button id="pPrender">Prender (min)</button>'}</div>`;
  }
  if (!souEu && pode('banir') && (eu.cargo === 'admin' ? j.cargo !== 'admin' : !equipe)) {
    h += `<div class="sub">Banimento</div><div class="botoes">
      ${j.banido ? '<button id="pDesbanir">Desbanir</button>' : '<input id="pMotivo" placeholder="Motivo"><button id="pBanir" class="perigo">Banir</button>'}</div>`;
  }
  if (eu.cargo === 'admin' && !souEu && j.cargo !== 'admin') {
    const pod = j.poderes || {};
    h += `<div class="sub">Cargo</div>
      <div class="botoes"><button id="pCargo">${j.cargo === 'moderador' ? 'Rebaixar para jogador' : 'Tornar moderador'}</button></div>`;
    if (j.cargo === 'moderador') {
      h += `<div class="poderes">${PODERES.map(([k, t]) => `<label><input type="checkbox" data-poder="${k}" ${pod[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div>
        <div class="botoes"><input id="pSalario" type="number" min="0" value="${j.salario || 0}" inputmode="numeric"><button id="pSalvarMod">Salvar poderes e salário (por dia)</button></div>`;
    }
  }
  c.innerHTML = h;

  const on = (idb, fn) => { const b = $(idb); if (b) b.onclick = fn; };
  on('pVoltar', () => { selecionado = null; listaJogadores(); });
  on('pIr', () => { const p = ctx.posicaoDe(j.id); if (p) { ctx.teleportar(p.x + 1.2, p.z + 1.2); msg('Você foi até ' + j.nome + '.'); } else msg('Posição ainda desconhecida.', false); });
  on('pTrazer', () => { const p = ctx.minhaPosicao(); executar(() => rede.painel.teleporte(j.id, p.x + 1.2, p.z), `${j.nome} foi trazido até você.`); });
  const valor = () => Math.floor(Number($('pValor').value));
  on('pDar', () => { const v = valor(); if (v > 0) executar(() => rede.painel.moedas(j.id, v), `${v} moedas para ${j.nome}.`); else msg('Digite uma quantidade.', false); });
  on('pTirar', () => { const v = valor(); if (v > 0) executar(() => rede.painel.moedas(j.id, -v), `${v} moedas retiradas de ${j.nome}.`); else msg('Digite uma quantidade.', false); });
  on('pAlgemar', () => executar(() => rede.painel.algemar(j.id, !j.algemado), j.algemado ? 'Algemas retiradas.' : `${j.nome} foi algemado.`));
  on('pPrender', () => { const m = Math.floor(Number($('pMin').value)); if (m > 0) executar(() => rede.painel.prender(j.id, m), `${j.nome} preso por ${m} min.`); });
  on('pSoltar', () => executar(() => rede.painel.prender(j.id, 0), `${j.nome} foi solto.`));
  on('pBanir', () => { if (confirmarDuplo('pBanir')) executar(() => rede.painel.banir(j.id, $('pMotivo').value.trim()), `${j.nome} foi banido.`); });
  on('pDesbanir', () => executar(() => rede.painel.desbanir(j.id), `${j.nome} foi desbanido.`));
  on('pCargo', () => executar(() => rede.painel.definirCargo(j.id, j.cargo === 'moderador' ? 'jogador' : 'moderador', {}, 0),
    j.cargo === 'moderador' ? `${j.nome} voltou a ser jogador.` : `${j.nome} agora é moderador. Marque os poderes dele abaixo.`));
  on('pSalvarMod', () => {
    const poderes = {}; c.querySelectorAll('[data-poder]').forEach((x) => { if (x.checked) poderes[x.dataset.poder] = true; });
    executar(() => rede.painel.definirCargo(j.id, 'moderador', poderes, Math.max(0, Math.floor(Number($('pSalario').value) || 0))), 'Poderes e salário salvos.');
  });
}
// banir pede um segundo toque para confirmar (sem diálogos do navegador)
function confirmarDuplo(id) {
  const b = $(id);
  if (b.dataset.conf) return true;
  b.dataset.conf = '1'; b.textContent = 'Toque de novo para confirmar';
  setTimeout(() => { if (b.isConnected) { delete b.dataset.conf; b.textContent = 'Banir'; } }, 3000);
  return false;
}

// ------------------------------------------------------------ eu
function abaEu() {
  const c = $('painelConteudo'); const eu = ctx.perfil();
  let h = '';
  if (pode('imortal')) h += `<div class="sub">Modo imortal</div><div class="botoes"><button id="pImortal" class="${eu.imortal ? 'ativo' : ''}">${eu.imortal ? 'Imortal: ligado' : 'Imortal: desligado'}</button></div>`;
  if (pode('teleportar')) h += `<div class="sub">Teleportar para</div><div class="botoes">${ctx.locais().map((l, i) => `<button data-local="${i}">${esc(l.nome)}</button>`).join('')}</div>`;
  h += `<div class="sub">Skin (grátis para a equipe)</div><div class="skins">${[...ROBOS.map((id) => ({ id, nome: id === 'Rusty_Scout_Bot' ? 'Robô Batedor' : 'Robô Sentinela' })), ...PERSONAGENS]
    .map((p) => `<button class="skin ${p.id === eu.personagem ? 'sel' : ''}" data-skin="${p.id}"><img src="assets/miniaturas/${p.id}.webp" alt=""><span>${esc(p.nome)}</span></button>`).join('')}</div>`;
  c.innerHTML = h;
  const b = $('pImortal'); if (b) b.onclick = () => executar(() => rede.painel.imortal(!eu.imortal), eu.imortal ? 'Modo imortal desligado.' : 'Modo imortal ligado.');
  c.querySelectorAll('[data-local]').forEach((x) => { x.onclick = () => { const l = ctx.locais()[x.dataset.local]; ctx.teleportar(l.x, l.z); msg('Teleportado: ' + l.nome); }; });
  c.querySelectorAll('[data-skin]').forEach((x) => { x.onclick = () => executar(() => rede.painel.skin(x.dataset.skin), 'Skin trocada.'); });
}

// ------------------------------------------------------------ equipe (admin)
async function abaEquipe() {
  const c = $('painelConteudo'); c.textContent = 'Carregando…';
  try {
    const eq = await rede.listarEquipe();
    c.innerHTML = `<div class="sub">Equipe</div><div class="lista">${eq.map((m) => `
      <button class="linha" data-id="${m.id}"><b>${esc(m.nome)}</b> <i class="tag ${m.cargo}">${m.cargo}</i>
      ${m.cargo === 'moderador' ? `<small>${Object.keys(m.poderes || {}).map((k) => PODERES.find((p) => p[0] === k)?.[1]).filter(Boolean).join(', ') || 'sem poderes'} · ${m.salario} moedas/dia</small>` : ''}</button>`).join('')}</div>
      <p class="dica">Para nomear um moderador, abra o jogador em <b>Jogadores</b> e toque em <b>Tornar moderador</b>.</p>`;
    c.querySelectorAll('.linha').forEach((b) => { b.onclick = () => abrirJogador(b.dataset.id); });
  } catch (e) { c.textContent = e.message; }
}

// ------------------------------------------------------------ histórico (admin)
async function abaHistorico() {
  const c = $('painelConteudo'); c.textContent = 'Carregando…';
  try {
    const h = await rede.historico();
    c.innerHTML = h.length ? `<div class="lista">${h.map((r) => {
      const d = new Date(r.criado_em);
      const det = r.acao === 'moedas' ? ` (${r.detalhes.valor > 0 ? '+' : ''}${r.detalhes.valor})` : r.acao === 'prender' ? ` (${r.detalhes.minutos} min)` : r.acao === 'banir' && r.detalhes.motivo ? ` (${esc(r.detalhes.motivo)})` : r.acao === 'cargo' ? ` → ${esc(r.detalhes.cargo)}` : '';
      return `<div class="linha"><small>${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small><br>
        <b>${esc(r.autor?.nome || '?')}</b> ${ACOES[r.acao] || r.acao} <b>${esc(r.alvo?.nome || '?')}</b>${det}</div>`;
    }).join('')}</div>` : '<span class="vazio">Nenhuma ação ainda.</span>';
  } catch (e) { c.textContent = e.message; }
}
