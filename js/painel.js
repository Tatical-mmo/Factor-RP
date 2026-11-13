// Painel da equipe (administrador e moderadores)
// Toda ação é conferida no banco; aqui só mostramos os botões que fazem sentido.
import * as rede from './rede.js';
import { PERSONAGENS, PERSONAGENS_EVENTO, ROBOS } from './config.js';

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
  perdoar: 'perdoou',
  moedas: 'mudou as moedas de', emprego: 'mudou o emprego de', banir: 'baniu', desbanir: 'desbaniu', algemar: 'algemou', soltar_algemas: 'tirou as algemas de',
  prender: 'prendeu', soltar: 'soltou da cadeia', teleporte: 'teleportou', cargo: 'mudou o cargo de',
  prefeito_nomeado: 'nomeou como prefeito', prefeito_afastado: 'afastou o prefeito', eleicao_convocada: 'convocou eleição extraordinária', salario: 'mudou um salário',  presente_personagem: 'deu um personagem para', evento_personagens: 'mexeu na vitrine do evento', patente: 'mudou a patente de', reset_mapa: 'resetou o mapa',
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
  else if (aba === 'salarios') abaSalarios();
  else if (aba === 'tempo') abaTempo();
  else if (aba === 'denuncias') abaDenuncias();
  else if (aba === 'carreiras') abaCarreiras();
  else if (aba === 'cidade') abaCidade();
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
  if (j.crimes > 0) t.push(`<i class="tag ruim">procurado (${j.crimes})</i>`);
  if (j.policial) t.push('<i class="tag moderador">policial</i>');
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
  const nome = [...PERSONAGENS, ...PERSONAGENS_EVENTO].find((p) => p.id === j.personagem)?.nome || j.personagem;
  const equipe = j.cargo !== 'jogador';
  let h = `<button class="voltar" id="pVoltar">‹ Voltar</button>
    <div class="ficha"><img src="assets/miniaturas/${esc(j.personagem)}.webp" alt="">
      <div><b class="grande">${esc(j.nome)}</b><br>${etiquetas(j, !!online || souEu)}<br>
      ${esc(nome)} · ${Number(j.moedas).toLocaleString('pt-BR')} moedas
      ${j.banido && j.banido_motivo ? `<br><small>Motivo do banimento: ${esc(j.banido_motivo)}</small>` : ''}</div></div>`;

  if (eu.cargo === 'admin' && (souEu || equipe) && (j.crimes > 0 || j.recompensa > 0)) h += '<div class="sub">Crimes</div><div class="botoes"><button id="pPerdoar">⚖️ Perdoar todos os crimes</button></div>';
  if (!souEu && online) h += '<div class="sub">Averiguar</div><div class="botoes"><button id="pAveriguar">👁️ Averiguar (ver o que ele está fazendo)</button></div>';
  if (pode('teleportar')) {
    h += `<div class="sub">Teleporte</div><div class="botoes">
      ${online && !souEu ? '<button id="pIr">Ir até ele</button>' : ''}
      ${!souEu ? '<button id="pTrazer">Trazer até mim</button>' : ''}</div>`;
  }
  if (pode('moedas') && (eu.cargo === 'admin' || !souEu)) {
    h += `<div class="sub">Moedas</div><div class="botoes"><input id="pValor" type="number" min="1" max="2147483647" placeholder="Quantidade" inputmode="numeric">
      <button id="pDar">Dar</button><button id="pTirar">Tirar</button></div>`;
  }
  if (!souEu && !equipe) {
    if (pode('algemar')) h += `<div class="sub">Algemas</div><div class="botoes"><button id="pAlgemar">${j.algemado ? 'Tirar as algemas' : 'Algemar'}</button></div>`;
    if (pode('prender')) h += `<div class="sub">Cadeia</div><div class="botoes">
      ${j.pena_seg > 0 ? '<button id="pSoltar">Soltar agora</button>' : '<input id="pMin" type="number" min="1" max="1440" value="7" inputmode="numeric"><button id="pPrender">Prender (min)</button>'}
      ${j.crimes > 0 || j.recompensa > 0 ? '<button id="pPerdoar">⚖️ Perdoar todos os crimes</button>' : ''}</div>`;
  }
  if (!souEu && pode('banir') && (eu.cargo === 'admin' ? j.cargo !== 'admin' : !equipe)) {
    h += `<div class="sub">Banimento</div><div class="botoes">
      ${j.banido ? '<button id="pDesbanir">Desbanir</button>' : '<input id="pMotivo" placeholder="Motivo"><button id="pBanir" class="perigo">Banir</button>'}</div>`;
  }
  if (eu.cargo === 'admin' && !j.banido) {
    h += `<div class="sub">Presentear personagem de evento</div><div class="botoes"><select id="pPresSel">${PERSONAGENS_EVENTO.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select><button id="pPresente">🎁 Presentear</button></div>`;
    h += `<div class="sub">Prefeitura</div><div class="botoes">${ctx.prefeito?.() === j.id ? '<small>🏛️ É o prefeito atual.</small>' : '<button id="pPrefeito">🏛️ Nomear prefeito</button>'}</div>`;
    if (j.cargo === 'jogador') h += '<div class="sub">💼 Emprego público e patentes</div><div id="pCarreiras" class="dica">Carregando…</div>';
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
  if ($('pCarreiras')) blocoCarreiras(j);

  const on = (idb, fn) => { const b = $(idb); if (b) b.onclick = fn; };
  on('pVoltar', () => { selecionado = null; listaJogadores(); });
  on('pAveriguar', () => { fechar(); ctx.averiguar(j.id, j.nome); });
  on('pIr', () => { const p = ctx.posicaoDe(j.id); if (p) { ctx.teleportar(p.x + 1.2, p.z + 1.2); msg('Você foi até ' + j.nome + '.'); } else msg('Posição ainda desconhecida.', false); });
  on('pTrazer', () => { const p = ctx.minhaPosicao(); executar(() => rede.painel.teleporte(j.id, p.x + 1.2, p.z), `${j.nome} foi trazido até você.`); });
  const valor = () => Math.min(2147483647, Math.floor(Number($('pValor').value)));   // limite do saldo (2,1 bilhões)
  on('pDar', () => { const v = valor(); if (v > 0) executar(() => rede.painel.moedas(j.id, v), `${v} moedas para ${j.nome}.`); else msg('Digite uma quantidade.', false); });
  on('pTirar', () => { const v = valor(); if (v > 0) executar(() => rede.painel.moedas(j.id, -v), `${v} moedas retiradas de ${j.nome}.`); else msg('Digite uma quantidade.', false); });
  on('pAlgemar', () => executar(() => rede.painel.algemar(j.id, !j.algemado), j.algemado ? 'Algemas retiradas.' : `${j.nome} foi algemado.`));
  on('pPrender', () => { const m = Math.floor(Number($('pMin').value)); if (m > 0) executar(() => rede.painel.prender(j.id, m), `${j.nome} preso por ${m} min.`); });
  on('pSoltar', () => executar(() => rede.painel.prender(j.id, 0), `${j.nome} foi solto.`));
  on('pPerdoar', () => executar(() => rede.perdoar(j.id), `${j.nome} foi perdoado.`));
  on('pBanir', () => { if (confirmarDuplo('pBanir')) executar(() => rede.painel.banir(j.id, $('pMotivo').value.trim()), `${j.nome} foi banido.`); });
  on('pDesbanir', () => executar(() => rede.painel.desbanir(j.id), `${j.nome} foi desbanido.`));
  on('pCargo', () => executar(() => rede.painel.definirCargo(j.id, j.cargo === 'moderador' ? 'jogador' : 'moderador', {}, 0),
    j.cargo === 'moderador' ? `${j.nome} voltou a ser jogador.` : `${j.nome} agora é moderador. Marque os poderes dele abaixo.`));
  on('pPresente', () => { const id = $('pPresSel').value, n = PERSONAGENS_EVENTO.find((x) => x.id === id)?.nome; executar(() => rede.personagens.presentear(j.id, id), `${n} foi dado para ${j.nome}.`); });
  on('pPrefeito', () => { if (confirmarDuplo('pPrefeito', '🏛️ Nomear prefeito')) executar(async () => { await rede.painel.nomearPrefeito(j.id); await ctx.prefeitoMudou?.(); }, `${j.nome} agora é o prefeito.`); });
  on('pSalvarMod', () => {
    const poderes = {}; c.querySelectorAll('[data-poder]').forEach((x) => { if (x.checked) poderes[x.dataset.poder] = true; });
    executar(() => rede.painel.definirCargo(j.id, 'moderador', poderes, Math.max(0, Math.floor(Number($('pSalario').value) || 0))), 'Poderes e salário salvos.');
  });
}
// banir pede um segundo toque para confirmar (sem diálogos do navegador)
function confirmarDuplo(id, texto = 'Banir') {
  const b = $(id);
  if (b.dataset.conf) return true;
  b.dataset.conf = '1'; b.textContent = 'Toque de novo para confirmar';
  setTimeout(() => { if (b.isConnected) { delete b.dataset.conf; b.textContent = texto; } }, 3000);
  return false;
}

// ------------------------------------------------------------ salários (só administrador)
async function abaSalarios() {
  const c = $('painelConteudo'); c.textContent = 'Carregando…';
  let d; try { d = await rede.painel.salarios(); } catch (e) { c.textContent = e.message; return; }
  const n = (v) => Number(v || 0).toLocaleString('pt-BR');
  const linha = (id, rotulo, valor, dica) => `<div class="botoes"><span style="flex:1"><b>${esc(rotulo)}</b>${dica ? `<br><small>${dica}</small>` : ''}</span>
    <input type="number" min="0" inputmode="numeric" value="${valor}" data-sal="${id}" style="max-width:110px"><button data-salvar="${id}">Salvar</button></div>`;
  c.innerHTML = `<p class="dica">Valores pagos pelo jogo. Nas carreiras, o valor é por minuto em serviço e é multiplicado pela patente (de ×1 no primeiro cargo até ×4,5 no topo).</p>
    <div class="sub">Serviço público</div>
    ${linha('policia', 'Polícia', d.policia, `Mesmo valor que o prefeito define (50 a 250). Paga ${n(Math.round(d.policia / 3))} por minuto.`)}
    ${(d.tabela || []).map((t) => linha(t.chave, t.rotulo, t.valor, t.chave === 'prefeito' ? 'Pago a cada ciclo em que o prefeito joga.' : '')).join('')}
    <div class="sub">Moderadores (por dia)</div>
    ${(d.moderadores || []).length ? d.moderadores.map((m) => linha('mod:' + m.id, m.nome, m.salario, 'Recebe uma vez a cada 24 h, quando entra no jogo.')).join('') : '<p class="dica">Nenhum moderador.</p>'}
    <p class="dica">Os salários das empresas são definidos pelos donos de cada empresa.</p>`;
  c.querySelectorAll('[data-salvar]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.salvar, v = Math.floor(Number(c.querySelector(`[data-sal="${id}"]`).value));
      if (!(v >= 0)) { msg('Digite um valor.', false); return; }
      executar(() => (id.startsWith('mod:') ? rede.painel.salarioModerador(id.slice(4), v) : rede.painel.definirSalario(id, v)), 'Salário salvo.');
    };
  });
}
// ------------------------------------------------------------ cidade: polícia robô e crimes de NPC (só o administrador)
async function abaCidade() {
  const c = $('painelConteudo'); c.textContent = 'Carregando…';
  let cf; try { cf = await rede.configJogo.ler(); } catch (e) { c.innerHTML = `<p class="dica">Não foi possível abrir as configurações da cidade.${/config_jogo|schema cache|does not exist/i.test(e.message || '') ? ' <b>Rode o 50a_reset_config.sql no SQL Editor do Supabase</b> e abra esta aba de novo.' : ''}</p><small>${esc(e.message || String(e))}</small>`; return; }
  cf = cf || { policia_robo: 12, crimes_npc: false, chance_crime: 30 };
  c.innerHTML = `<div class="sub">🚓 Polícia robô na rua</div>
    <p class="dica">Quantos policiais robô patrulham a metrópole (0 a 20). Os agentes robô da PRF continuam iguais.</p>
    <div class="botoes"><input id="cPol" type="range" min="0" max="20" value="${cf.policia_robo}" style="flex:1"><b id="cPolN" style="min-width:32px;text-align:center">${cf.policia_robo}</b></div>
    <div class="sub">🦹 Crimes de NPC</div>
    <p class="dica">Ligado, a cada 2 minutos pode acontecer um assalto de NPC numa loja (com a chance abaixo). O ladrão foge pelas ruas por até 3 minutos; Polícia, PRF e Exército em serviço recebem o alerta e prendem chegando perto (+300).</p>
    <div class="botoes"><label><input type="checkbox" id="cCrimes" ${cf.crimes_npc ? 'checked' : ''}> Ligado</label></div>
    <div class="botoes"><span style="flex:1">Chance de ocorrência por ciclo</span><input id="cChance" type="range" min="0" max="100" step="5" value="${cf.chance_crime}" style="flex:1"><b id="cChanceN" style="min-width:44px;text-align:center">${cf.chance_crime}%</b></div>
    <div class="sub">🏥 Tempo para renascer no hospital</div>
    <p class="dica">Quem morre e não é atendido (pela ambulância ou por um médico jogador) renasce dentro do hospital depois desse tempo. Atendido antes, levanta no mesmo lugar na hora.</p>
    <div class="botoes"><input id="cResp" type="range" min="15" max="300" step="5" value="${cf.respawn_seg ?? 90}" style="flex:1"><b id="cRespN" style="min-width:52px;text-align:center">${cf.respawn_seg ?? 90} s</b></div>
    <div class="botoes"><button id="cSalvar">Salvar</button></div>
    <div class="sub">👔 Farda</div>
    <p class="dica">Ajuste o tamanho e a posição do colete e do capacete/boné de cada corporação, uma por uma, vendo no seu personagem. Ao salvar, vale para todos.</p>
    <div class="botoes"><button id="cFarda">👔 Ajustar a farda</button></div>`;
  $('cFarda').onclick = () => { fechar(); ctx.ajustarFarda?.(); };
  $('cPol').oninput = () => { $('cPolN').textContent = $('cPol').value; };
  $('cChance').oninput = () => { $('cChanceN').textContent = $('cChance').value + '%'; };
  $('cResp').oninput = () => { $('cRespN').textContent = $('cResp').value + ' s'; };
  $('cSalvar').onclick = async () => {
    try {
      await rede.configJogo.salvar(Number($('cPol').value), $('cCrimes').checked, Number($('cChance').value));
      try { await rede.configJogo.salvarRespawn(Number($('cResp').value)); } catch (e) { if (/admin_respawn|schema cache|does not exist/i.test(e.message || '')) { msg('Rode o 63_heli_respawn.sql no SQL Editor do Supabase para salvar o tempo de renascer.', false); return; } throw e; }
      ctx.configMudou?.(); msg('Configuração salva. Vale para todos em alguns segundos.'); } catch (e) { msg(/admin_config|schema cache|does not exist/i.test(e.message || '') ? 'Rode o 50a_reset_config.sql no SQL Editor do Supabase.' : e.message, false); }
  };
}
// ------------------------------------------------------------ carreiras públicas (só o administrador)
// aba própria: escolha o jogador (online ou pela busca) e defina emprego e patentes
async function abaCarreiras(texto = '') {
  const c = $('painelConteudo'), online = ctx.online();
  c.innerHTML = `<p class="dica">Escolha um jogador para colocar em um emprego público (Polícia, PRF, Hospital, Bombeiros, Jornal, Exército) e promover em qualquer carreira.</p>
    <input id="cBusca" placeholder="Buscar jogador pelo nome" value="${esc(texto)}">
    <div class="sub">Online agora</div>
    <div class="chips">${online.length ? online.map((o) => `<button class="chip" data-car="${o.id}">${esc(o.nome)}</button>`).join('') : '<span class="vazio">Ninguém além de você.</span>'}</div>
    <div class="sub">Resultados</div><div id="cLista" class="lista">Carregando…</div>`;
  const ligar = (raiz) => raiz.querySelectorAll('[data-car]').forEach((b) => { b.onclick = () => telaCarreiraJogador(b.dataset.car); });
  ligar(c);
  const lista = async (t) => {
    const el = $('cLista'); if (!el) return;
    try {
      const l = (await rede.buscarJogadores(t)).filter((j) => j.cargo === 'jogador');
      el.innerHTML = l.length ? l.map((j) => `<button class="linha" data-car="${j.id}"><b>${esc(j.nome)}</b></button>`).join('') : '<span class="vazio">Nenhum jogador encontrado.</span>';
      ligar(el);
    } catch (e) { el.textContent = e.message; }
  };
  const busca = $('cBusca'); busca.oninput = () => { clearTimeout(busca.t); busca.t = setTimeout(() => lista(busca.value.trim()), 350); };
  lista(texto);
}
async function telaCarreiraJogador(id) {
  const c = $('painelConteudo'); c.textContent = 'Carregando…';
  let j; try { j = await rede.carregarPerfil(id); } catch (e) { c.textContent = e.message; return; }
  if (!j) { c.textContent = 'Jogador não encontrado.'; return; }
  c.innerHTML = `<button class="voltar" id="cVoltar">‹ Voltar</button><div class="sub">💼 ${esc(j.nome)}</div><div id="pCarreiras" class="dica">Carregando…</div>`;
  $('cVoltar').onclick = () => abaCarreiras();
  if (j.cargo !== 'jogador') { $('pCarreiras').textContent = 'Moderadores e o administrador não entram nas carreiras.'; return; }
  blocoCarreiras(j);
}
const NOME_CARREIRA = { policia: '🚓 Polícia', prf: '🚔 PRF', medico: '✚ Hospital', bombeiro: '🚒 Bombeiros', jornalista: '📰 Jornal', exercito: '🎖️ Exército' };
async function blocoCarreiras(j) {
  const c = $('pCarreiras'); if (!c) return;
  let d; try { d = await rede.painel.carreiras(j.id); } catch (e) { c.textContent = e.message; return; }
  c.innerHTML = `<p class="dica">Coloque ${esc(j.nome)} em qualquer emprego público e promova em qualquer carreira (a patente fica guardada mesmo fora do serviço). Empresas particulares ficam de fora.${d.empresa ? ' <b>Ele é funcionário de uma empresa particular: precisa sair dela para ter emprego público.</b>' : ''}</p>
    <div class="botoes"><select id="pEmprego"><option value="nenhum">Sem emprego público</option>${Object.entries(NOME_CARREIRA).map(([k, t]) => `<option value="${k}" ${d.emprego === k ? 'selected' : ''}>${t}</option>`).join('')}</select><button id="pEmpregoOk">Definir emprego</button></div>
    ${d.carreiras.map((k) => `<div class="botoes"><span style="flex:1"><b>${NOME_CARREIRA[k.carreira]}</b>${d.emprego === k.carreira ? ' · <i class="tag on">emprego atual</i>' : ''}</span>
      <select data-car="${k.carreira}">${k.cargos.map((g) => `<option value="${g.nivel}" ${g.nivel === k.nivel ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}</select><button data-promover="${k.carreira}">Promover</button></div>`).join('')}`;
  $('pEmpregoOk').onclick = async () => { const e = $('pEmprego').value; try { await rede.painel.definirEmprego(j.id, e); msg(e === 'nenhum' ? `${j.nome} saiu do emprego público.` : `${j.nome} agora trabalha em ${NOME_CARREIRA[e]}.`); blocoCarreiras(j); } catch (er) { msg(er.message, false); } };
  c.querySelectorAll('[data-promover]').forEach((b) => { b.onclick = async () => {
    const k = b.dataset.promover, n = Number(c.querySelector(`[data-car="${k}"]`).value);
    try { const nome = await rede.painel.promover(j.id, k, n); msg(`${j.nome} agora é ${nome} (${NOME_CARREIRA[k]}).`); blocoCarreiras(j); } catch (er) { msg(er.message, false); }
  }; });
}
// ------------------------------------------------------------ denúncias dos jogadores
const MOTIVO_TXT = { ofensa: 'Ofensa', assedio: 'Assédio/ameaça', trapaca: 'Trapaça', nome: 'Nome impróprio', voz: 'Chat de voz', outro: 'Outro' };
async function abaDenuncias() {
  const c = $('painelConteudo'); c.textContent = 'Carregando…';
  let l, fl = []; try { l = await rede.painel.denuncias(); fl = await rede.painel.faltas().catch(() => []); } catch (e) { c.textContent = e.message; return; }
  // anti-trapaça: faltas registradas pelo servidor (3 pontos em 10 min = ban automático)
  const porJog = new Map(); for (const f of fl) { const k = f.jogador; if (!porJog.has(k)) porJog.set(k, { nome: f.perfil?.nome || '?', itens: [] }); porJog.get(k).itens.push(f); }
  const blocoFaltas = `<div class="sub">🚨 Anti-trapaça</div>${porJog.size ? [...porJog.entries()].map(([id, j]) => `<div class="linha item" style="flex-direction:column;align-items:stretch"><span><b>${esc(j.nome)}</b> · ${j.itens.length} falta(s)</span>
      ${j.itens.slice(0, 4).map((f) => `<small>${new Date(f.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${esc(f.motivo)} (peso ${f.peso})</small>`).join('')}
      <div class="botoes"><button data-abrir="${id}">Abrir</button><button data-perdoar="${id}">Perdoar e desbanir</button></div></div>`).join('') : '<p class="dica">Nenhuma falta registrada.</p>'}<div class="sub">Denúncias</div>`;
  c.innerHTML = blocoFaltas + `<p class="dica">Denúncias abertas feitas pelos jogadores. Abra o jogador para agir (banir, prender, algemar…) e marque como resolvida.</p>
    ${l.length ? l.map((d) => `<div class="linha item" style="flex-direction:column;align-items:stretch"><span><b>${esc(d.alvo_nome)}</b> · ${MOTIVO_TXT[d.motivo] || d.motivo}${d.vezes > 1 ? ` · <i class="tag ruim">${d.vezes} denúncias</i>` : ''}</span>
      ${d.detalhes ? `<small style="white-space:pre-wrap">${esc(d.detalhes)}</small>` : ''}<small>por ${esc(d.autor_nome)} · ${new Date(d.criada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
      <div class="botoes">${ctx.online().some((o) => o.id === d.alvo) ? `<button data-averiguar="${d.alvo}" data-nome="${esc(d.alvo_nome)}">👁️ Averiguar</button>` : '<small>offline</small>'}<button data-abrir="${d.alvo}">Abrir jogador</button><button data-resolver="${d.id}">Resolvida ✓</button></div></div>`).join('') : '<p class="vazio">Nenhuma denúncia aberta. 🎉</p>'}`;
  c.querySelectorAll('[data-averiguar]').forEach((b) => { b.onclick = () => { fechar(); ctx.averiguar(b.dataset.averiguar, b.dataset.nome); }; });
  c.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => { aba = 'jogadores'; selecionado = b.dataset.abrir; desenhar(); }; });
  c.querySelectorAll('[data-perdoar]').forEach((b) => { b.onclick = async () => { try { await rede.painel.perdoarFaltas(b.dataset.perdoar); msg('Faltas apagadas e jogador desbanido (se o ban foi automático).'); abaDenuncias(); } catch (e) { msg(e.message, false); } }; });
  c.querySelectorAll('[data-resolver]').forEach((b) => { b.onclick = async () => { try { await rede.painel.resolverDenuncia(Number(b.dataset.resolver)); msg('Denúncia resolvida.'); abaDenuncias(); } catch (e) { msg(e.message, false); } }; });
}
// ------------------------------------------------------------ tempo (chuva, tempestade, neve)
function abaTempo() {
  const c = $('painelConteudo'), cf = ctx.climaConfig(), agora = ctx.climaAgora();
  const nomes = { limpo: '☀️ Limpo', chuva: '🌧️ Chuva', tempestade: '⛈️ Tempestade', neve: '❄️ Neve' };
  const manual = cf.manual && cf.manual_ate && Date.parse(cf.manual_ate) > Date.now();
  c.innerHTML = `<p class="dica">Agora: <b>${nomes[agora] || agora}</b>${manual ? ` (escolhido por você até ${new Date(cf.manual_ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})` : cf.auto ? ' (automático)' : ''}.</p>
    <div class="sub">🕒 Hora do dia (agora ${String(Math.floor(ctx.relogio().hora)).padStart(2, '0')}h${ctx.relogio().fixa !== null && ctx.relogio().fixa !== undefined ? ' · travada' : ''})</div>
    <p class="dica">Pular: a hora muda para todos e o ciclo continua dali. Travar: a hora fica parada até você voltar ao normal.</p>
    <div class="botoes">${[[6, '🌅 6h'], [12, '☀️ 12h'], [18, '🌇 18h'], [22, '🌙 22h'], [2, '🌑 2h']].map(([h, t]) => `<button data-hora="${h}">${t}</button>`).join('')}</div>
    <div class="botoes"><label><input type="checkbox" id="tTravar"> Travar na hora escolhida</label><button id="tHoraNormal">↩ Ciclo normal</button></div>
    <div class="sub">Mudar agora</div>
    <div class="botoes"><select id="tMin">${[[5, '5 min'], [10, '10 min'], [20, '20 min'], [32, '1 ciclo (32 min)'], [60, '1 h'], [120, '2 h'], [240, '4 h']].map(([m, t]) => `<option value="${m}" ${m === 10 ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="botoes">${Object.entries(nomes).map(([k, t]) => `<button data-tempo="${k}">${t}</button>`).join('')}</div>
    ${manual ? '<div class="botoes"><button id="tVoltar">↩ Voltar ao automático agora</button></div>' : ''}
    <div class="sub">Automático a cada ciclo</div>
    <p class="dica">A cada ciclo do dia (32 min) o jogo sorteia o tempo com estas chances. Quando cai chuva, tempestade ou neve, dura de 8 a 13 minutos dentro do ciclo. A soma não pode passar de 100%.</p>
    <div class="botoes"><label><input type="checkbox" id="tAuto" ${cf.auto ? 'checked' : ''}> Ligado</label></div>
    <div class="botoes"><span style="flex:1">🌧️ Chuva %</span><input type="number" id="tChuva" min="0" max="100" value="${cf.chance_chuva}" style="max-width:80px"></div>
    <div class="botoes"><span style="flex:1">⛈️ Tempestade %</span><input type="number" id="tTemp" min="0" max="100" value="${cf.chance_tempestade}" style="max-width:80px"></div>
    <div class="botoes"><span style="flex:1">❄️ Neve %</span><input type="number" id="tNeve" min="0" max="100" value="${cf.chance_neve}" style="max-width:80px"></div>
    <div class="botoes"><button id="tSalvar">Salvar automático</button></div>`;
  const depois = async (fn, ok) => { try { await fn(); await ctx.climaMudou(); msg(ok); setTimeout(abaTempo, 300); } catch (e) { msg(e.message, false); } };
  c.querySelectorAll('[data-tempo]').forEach((b) => { b.onclick = () => depois(() => rede.clima.agora(b.dataset.tempo, Number($('tMin').value)), `Tempo: ${nomes[b.dataset.tempo]}. Muda em alguns segundos para todos.`); });
  const v = $('tVoltar'); if (v) v.onclick = () => depois(() => rede.clima.agora(null, 0), 'Voltou ao automático.');
  const salvarHora = async (desloc, fixa, ok) => {
    try { await rede.configJogo.salvarHora(desloc, fixa); ctx.relogioMudou({ hora_desloc: desloc, hora_fixa: fixa }); msg(ok); setTimeout(abaTempo, 300); }
    catch (e) { msg(/admin_hora|schema cache|does not exist/i.test(e.message || '') ? 'Rode o 54_hora_do_dia.sql no SQL Editor do Supabase.' : e.message, false); }
  };
  c.querySelectorAll('[data-hora]').forEach((b) => {
    b.onclick = () => { const h = Number(b.dataset.hora), trava = $('tTravar').checked;
      salvarHora(trava ? 0 : ctx.deslocParaHora(h), trava ? h : null, trava ? `Hora travada às ${h}h para todos.` : `Agora são ${h}h para todos; o ciclo segue dali.`); };
  });
  $('tHoraNormal').onclick = () => salvarHora(0, null, 'Ciclo do dia normal de volta.');
  $('tSalvar').onclick = () => depois(() => rede.clima.auto($('tAuto').checked, Math.floor(Number($('tChuva').value) || 0), Math.floor(Number($('tTemp').value) || 0), Math.floor(Number($('tNeve').value) || 0)), 'Programação salva.');
}
// ------------------------------------------------------------ eu
async function blocoBueiro() {
  const c = $('pBueiro'); if (!c) return;
  let k; try { k = await rede.painel.bueiroSecreto(); } catch (e) { c.textContent = e.message; return; }
  const b = ctx.bueiro(k);
  c.innerHTML = `A entrada para novos membros é o <b>${esc(b?.nome || `Bueiro nº ${k + 1}`)}</b>. Só você vê isto.
    <div class="botoes"><button id="pBuIr">📍 Ir até ele</button><button id="pBuMapa">🗺️ Marcar no mapa</button><button id="pBuSortear">🎲 Sortear outro</button></div>`;
  $('pBuIr').onclick = () => { if (b) { ctx.irPara(b.x + 1.5, b.z); fechar(); } };
  $('pBuMapa').onclick = () => { if (b) { ctx.marcar({ nome: `🐀 ${b.nome}`, x: b.x, z: b.z }); msg('Marcado no mapa.'); } };
  $('pBuSortear').onclick = async () => { try { const n = await rede.painel.sortearBueiro(); msg(`Agora a entrada é o ${ctx.bueiro(n)?.nome || n + 1}.`); blocoBueiro(); } catch (e) { msg(e.message, false); } };
}
function abaEu() {
  const c = $('painelConteudo'); const eu = ctx.perfil();
  let h = '';
  if (pode('imortal')) h += `<div class="sub">Modo imortal</div><div class="botoes"><button id="pImortal" class="${eu.imortal ? 'ativo' : ''}">${eu.imortal ? 'Imortal: ligado' : 'Imortal: desligado'}</button></div>`;
  if (eu.cargo === 'admin') h += '<div class="sub">Evento: arma dourada</div><p class="dica">Esconde a arma dourada (2 balas) exatamente onde você está. Quem achar pega; depois dos 2 tiros ela some.</p><div class="botoes"><button id="pArmaPd">✨ Esconder a arma dourada aqui</button></div>';
  if (eu.cargo === 'admin') h += '<div class="sub">🐀 Bueiro secreto dos Lixeiros</div><div id="pBueiro" class="dica">Carregando…</div>';
  if (eu.cargo === 'admin') h += '<div class="sub">⚖️ Perdoar crimes</div><div id="pPerdao" class="dica">Carregando…</div>';
  if (eu.cargo === 'admin') h += '<div class="sub">Prefeitura</div><div id="pPref" class="dica">Carregando…</div>';
  if (eu.cargo === 'admin') {
    h += `<div class="sub">Evento: personagens especiais</div><p class="dica">Abre a vitrine para os jogadores comprarem. Marque quais (nenhum marcado = todos) e o tempo.</p>
      <div id="pEvLista" class="poderes">${PERSONAGENS_EVENTO.map((x) => `<label><input type="checkbox" data-ev="${x.id}"> ${esc(x.nome)}</label>`).join('')}</div>
      <div class="botoes"><select id="pEvTempo">${[[30, '30 min'], [60, '1 h'], [180, '3 h'], [720, '12 h'], [1440, '1 dia'], [4320, '3 dias'], [10080, '7 dias']].map(([m, t]) => `<option value="${m}" ${m === 60 ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <button id="pEvAbrir">✨ Abrir vitrine</button><button id="pEvFechar">Fechar vitrine</button></div>`;
    h += `<div class="sub">Resetar o mapa</div><p class="dica">Para deixar o mapa limpo antes de abrir para os jogadores. As contas continuam; a equipe mantém o cargo. <b>Não dá para desfazer.</b></p>
      <div class="poderes">${[['moradia', 'Casas, terrenos, prédios e baús'], ['empresas', 'Empresas, veículos, pedidos e carros dos jogadores'], ['clas', 'Clãs, guerras e territórios'],
        ['jogadores', 'Moedas, mochila, carreiras, crimes, banco e personagens comprados'], ['prefeitura', 'Prefeito, eleição, cofre, outdoors e notícias']]
        .map(([k, t]) => `<label><input type="checkbox" data-reset="${k}" checked> ${t}</label>`).join('')}</div>
      <div class="botoes"><input id="pResetConf" placeholder="Digite RESETAR"><button id="pReset" class="perigo">🧹 Resetar o mapa</button></div>`;
  }
  if (eu.cargo === 'admin' && ctx.objetosNaRua) {
    const lista = ctx.objetosNaRua();
    h += `<div class="sub">🧭 Objetos em cima da rua</div>${lista.length ? `<p class="dica">${lista.length} encontrado(s). Toque para ir até lá; "Copiar lista" para mandar a correção.</p>
      <div class="botoes">${lista.map((o, i) => `<button data-narua="${i}">${esc(o.tipo)} ${esc(o.nome)} · ${Math.round(o.x)}, ${Math.round(o.z)}</button>`).join('')}<button id="pNaRuaCopiar">📋 Copiar lista</button></div>`
      : '<p class="dica">Nada em cima da rua: casas, terrenos, territórios, lixeiras e pontos estão no lugar.</p>'}`;
  }
  if (eu.cargo === 'admin' && ctx.veiculosTeste) h += `<div class="sub">🧪 Testar veículo</div><p class="dica">Aparece aqui onde você está (aviões: na frota do Aeroporto da Metrópole). Para sair, use o botão de sair do veículo: ele some.</p><div class="botoes">${ctx.veiculosTeste().map((v) => `<button data-testar="${v.id}">${esc(v.nome)}</button>`).join('')}</div>`;
  if (pode('teleportar')) h += `<div class="sub">Teleportar para</div><div class="botoes">${ctx.locais().map((l, i) => `<button data-local="${i}">${esc(l.nome)}</button>`).join('')}</div>`;
  h += `<div class="sub">Skin (grátis para a equipe)</div><div class="skins">${[...ROBOS.map((id) => ({ id, nome: id === 'Rusty_Scout_Bot' ? 'Robô Batedor' : 'Robô Sentinela' })), ...PERSONAGENS, ...(eu.cargo === 'admin' ? PERSONAGENS_EVENTO : [])]
    .map((p) => `<button class="skin ${p.id === eu.personagem ? 'sel' : ''}" data-skin="${p.id}"><img src="assets/miniaturas/${p.id}.webp" alt=""><span>${esc(p.nome)}</span></button>`).join('')}</div>`;
  c.innerHTML = h;
  if ($('pBueiro')) blocoBueiro();
  const apd = $('pArmaPd'); if (apd) apd.onclick = () => executar(() => ctx.esconderArmaPd(), 'Arma dourada escondida aqui. Todos foram avisados do evento.');
  const b = $('pImortal'); if (b) b.onclick = () => executar(() => rede.painel.imortal(!eu.imortal), eu.imortal ? 'Modo imortal desligado.' : 'Modo imortal ligado.');
  c.querySelectorAll('[data-local]').forEach((x) => { x.onclick = () => { const l = ctx.locais()[x.dataset.local]; ctx.teleportar(l.x, l.z); msg('Teleportado: ' + l.nome); }; });
  if (ctx.objetosNaRua && $('pNaRuaCopiar')) {
    const lista = ctx.objetosNaRua();
    c.querySelectorAll('[data-narua]').forEach((x) => { x.onclick = () => { const o = lista[x.dataset.narua]; ctx.teleportar(o.x + 3, o.z + 3); msg(`Você foi até: ${o.tipo} ${o.nome}`); }; });
    $('pNaRuaCopiar').onclick = () => { const t = lista.map((o) => `${o.tipo} ${o.nome} @ ${o.x.toFixed(1)}, ${o.z.toFixed(1)}`).join('\n'); navigator.clipboard?.writeText(t).then(() => msg('Lista copiada.'), () => msg(t)); };
  }
  c.querySelectorAll('[data-testar]').forEach((x) => { x.onclick = () => { fechar(); ctx.testarVeiculo(x.dataset.testar); }; });
  c.querySelectorAll('[data-skin]').forEach((x) => { x.onclick = () => executar(() => rede.painel.skin(x.dataset.skin), 'Skin trocada.'); });
  if (eu.cargo === 'admin') { blocoPrefeitura(); blocoPerdao(); }
  const evSel = () => [...c.querySelectorAll('[data-ev]')].filter((x) => x.checked).map((x) => x.dataset.ev);
  const ba = $('pEvAbrir'); if (ba) ba.onclick = () => { const m = Number($('pEvTempo').value); executar(() => rede.personagens.liberarEvento(evSel(), m), 'Vitrine do evento aberta. Todos foram avisados.'); };
  const bf = $('pEvFechar'); if (bf) bf.onclick = () => executar(() => rede.personagens.liberarEvento(evSel(), 0), 'Vitrine fechada.');
  const br = $('pReset'); if (br) br.onclick = () => {
    const partes = [...c.querySelectorAll('[data-reset]')].filter((x) => x.checked).map((x) => x.dataset.reset);
    if (confirmarDuplo('pReset', '🧹 Resetar o mapa')) rede.painel.resetarMundo(partes, $('pResetConf').value.trim()).then((r) => {
      if (String(r).includes('⚠️')) { msg(`Reset incompleto: ${r}. Mande um print desta mensagem.`, false); return; }   // não recarrega: o admin precisa ler o motivo
      msg(`Mapa resetado: ${r || 'feito'}. O jogo de todos vai recarregar.`); ctx.resetFeito?.();
    }).catch((e) => msg(e.message, false));
  };
}
// todos com crime ou recompensa (inclusive você e a equipe); um toque perdoa tudo
async function blocoPerdao() {
  const el = $('pPerdao'); if (!el) return;
  let lista; try { lista = await rede.procuradosTodos(); } catch (e) { el.textContent = e.message; return; }
  el.className = '';
  el.innerHTML = (lista || []).length ? `<div class="lista">${lista.map((p) => `<div class="linha item"><span class="nm"><b>${esc(p.nome)}</b><small>${p.crimes} crime${p.crimes === 1 ? '' : 's'}${p.recompensa ? ` · recompensa ${Number(p.recompensa).toLocaleString('pt-BR')}` : ''}${p.pena_seg > 0 ? ' · preso' : ''}</small></span>
    <span class="bts"><button data-perdoar="${p.id}">Perdoar</button></span></div>`).join('')}</div>` : '<p class="dica">Ninguém com crimes agora.</p>';
  el.querySelectorAll('[data-perdoar]').forEach((b) => { b.onclick = () => executar(() => rede.perdoar(b.dataset.perdoar), 'Crimes perdoados. Ficha limpa!'); });
}
// estado da prefeitura e ações do administrador (nomear é na ficha do jogador)
async function blocoPrefeitura() {
  const el = $('pPref'); if (!el) return;
  let pf;
  try { pf = await rede.prefeitura.estado(); } catch (e) { el.textContent = e.message; return; }
  const eleicao = pf?.eleicao_ate && Date.parse(pf.eleicao_ate) > Date.now();
  const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  el.className = '';
  el.innerHTML = `<p class="dica">${pf?.prefeito ? `Prefeito: <b>${esc(pf.prefeito_perfil?.nome || '?')}</b>${pf.motivo ? ` (${esc(pf.motivo)})` : ''}` : 'Prefeitura <b>vaga</b>: a campanha fica aberta e o mais votado assume na virada do ciclo.'}
    ${eleicao ? `<br>🗳️ Eleição extraordinária até <b>${hora(pf.eleicao_ate)}</b>.` : ''}<br>Para nomear alguém, abra a ficha do jogador na aba Jogadores.</p>
    <div class="botoes">
      ${eleicao ? '<button id="pCancEl">Cancelar eleição extraordinária</button>' : `<select id="pCiclos">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n === 2 ? 'selected' : ''}>${n} ciclo${n > 1 ? 's' : ''} (${n * 32} min)</option>`).join('')}</select><button id="pConvocar">🗳️ Convocar eleição</button>`}
      ${pf?.prefeito ? '<button id="pAfastar" class="perigo">Afastar o prefeito</button>' : ''}
    </div>`;
  const on = (idb, fn) => { const b = $(idb); if (b) b.onclick = fn; };
  on('pConvocar', () => { const n = Number($('pCiclos').value); executar(() => rede.painel.convocarEleicao(n), `Eleição extraordinária convocada por ${n * 32} min. Todos foram avisados.`); });
  on('pCancEl', () => executar(() => rede.painel.cancelarEleicao(), 'Eleição extraordinária cancelada.'));
  on('pAfastar', () => { if (confirmarDuplo('pAfastar', 'Afastar o prefeito')) executar(async () => { await rede.painel.afastarPrefeito(); await ctx.prefeitoMudou?.(); }, 'Prefeito afastado. A prefeitura está vaga.'); });
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
