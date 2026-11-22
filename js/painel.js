// Painel da equipe (administrador e moderadores)
// Toda ação é conferida no banco; aqui só mostramos os botões que fazem sentido.
import * as rede from './rede.js';
import { PERSONAGENS, PERSONAGENS_EVENTO, ROBOS } from './config.js';
import { ICONES as ICONES_ITEM } from './loja.js';

const $ = (id) => document.getElementById(id);
const PODERES = [
  ['banir', 'Banir e desbanir'],
  ['moedas', 'Dar e tirar moedas'],
  ['algemar', 'Algemar'],
  ['prender', 'Prender e soltar'],
  ['teleportar', 'Teleportar'],
  ['imortal', 'Modo imortal'],
  ['invisivel', 'Modo invisível'],
  ['nome_oculto', 'Esconder o nome (🙈)'],
];
const ACOES = {
  perdoar: 'perdoou', congelar: 'congelou', descongelar: 'descongelou', forcar_visivel: 'deixou visível à força', evento_doacao: 'fez um evento de doação',
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
// depois de uma ação o painel é redesenhado: guarda a rolagem e volta para o mesmo lugar (antes voltava ao topo
// ou "corria" e o próximo toque caía em outro botão, por exemplo em outra skin)
function rolagens() { const l = []; for (let el = $('painelConteudo'); el; el = el.parentElement) if (el.scrollHeight > el.clientHeight + 2) l.push([el, el.scrollTop]); return l; }
function voltarRolagem(l) { const por = () => { for (const [el, t] of l) el.scrollTop = t; }; por(); requestAnimationFrame(por); setTimeout(por, 120); setTimeout(por, 450); setTimeout(por, 1000); }
async function executar(fn, sucesso) {
  const rol = rolagens();
  try { await fn(); msg(sucesso); if (selecionado) await abrirJogador(selecionado); else desenhar(); voltarRolagem(rol); }
  catch (e) { msg(e.message, false); voltarRolagem(rol); }
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
  if (j.crimes > 0) t.push(`<i class="tag ruim">procurado ${'★'.repeat(Math.min(5, j.crimes || 0))}</i>`);
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

  // 21c: perdão no topo
  if ((j.crimes > 0 || j.recompensa > 0) && (eu.cargo === 'admin' || (!souEu && !equipe && pode('prender')))) h += '<div class="sub">Crimes</div><div class="botoes"><button id="pPerdoar">⚖️ Perdoar todos os crimes</button></div>';
  if (!souEu && pode('banir') && !j.banido && (eu.cargo === 'admin' ? j.cargo !== 'admin' : !equipe)) {
    h += `<div class="sub">🧊 Estátua (hack)</div><p class="dica">Congela o jogador: todos passam a ver uma estátua parada, e o que ele fizer (andar, atirar, bater) é ignorado.</p><div class="botoes">
      ${j.congelado ? '<button id="pDescongelar">🔥 Descongelar</button>' : '<button id="pCongelar">🧊 Congelar</button>'}
      <button id="pCongBan" class="perigo">🧊⛔ Congelar e banir em 30 s</button></div>`;
  }
  if (eu.cargo === 'admin' && j.cargo === 'moderador' && (j.invisivel || online?.oc)) h += '<div class="sub">Visibilidade</div><div class="botoes"><button id="pForcarVis">👁️ Forçar visível (corpo e nome)</button></div>';
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
</div>`;
  }
  if (!souEu && pode('banir') && (eu.cargo === 'admin' ? j.cargo !== 'admin' : !equipe)) {
    h += `<div class="sub">Banimento</div><div class="botoes">
      ${j.banido ? '<button id="pDesbanir">Desbanir</button>' : '<input id="pMotivo" placeholder="Motivo"><button id="pBanir" class="perigo">Banir</button>'}</div>
      <p class="dica">O banimento pega a conta e o aparelho dela (conta nova no mesmo celular também não entra).</p>
      <div class="sub">Contas no mesmo aparelho ou IP</div><div id="pLigadas" class="dica">Carregando…</div>`;
  }
  if (eu.cargo === 'admin' && !j.banido) {
    h += `<div class="sub">Presentear personagem limitado (você não perde o seu)</div><div class="botoes"><select id="pPresSel">${PERSONAGENS_EVENTO.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select><button id="pPresente">🎁 Presentear</button></div>`;
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
  if ($('pLigadas')) rede.painel.contasLigadas(j.id).then((l) => { const el = $('pLigadas'); if (!el) return; el.innerHTML = l?.length ? l.map((x) => `<div class="botoes"><span style="flex:1">${esc(x.nome)} · <small>mesmo ${x.via}</small>${x.banido ? ' <i class="tag ruim">banido</i>' : ''}</span><button data-ligada="${x.id}">Abrir</button></div>`).join('') + '<p class="dica">IP é só pista: no celular muita gente divide o mesmo IP.</p>' : 'Nenhuma outra conta encontrada.'; el.querySelectorAll('[data-ligada]').forEach((b) => { b.onclick = () => abrirJogador(b.dataset.ligada); }); }).catch((e) => { const el = $('pLigadas'); if (el) el.textContent = e.message; });

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
  on('pCongelar', () => executar(() => ctx.congelar(j.id, true), `🧊 ${j.nome} virou estátua.`));
  on('pDescongelar', () => executar(() => ctx.congelar(j.id, false), `🔥 ${j.nome} foi descongelado.`));
  on('pCongBan', () => {
    if (!confirmarDuplo('pCongBan', '🧊⛔ Congelar e banir em 30 s')) return;
    const motivo = ($('pMotivo')?.value || '').trim() || 'Uso de hack';
    executar(async () => {
      if (!j.congelado) await ctx.congelar(j.id, true);
      setTimeout(() => rede.painel.banir(j.id, motivo).then(() => msg(`⛔ ${j.nome} foi banido.`)).catch((e) => msg(e.message, false)), 30000);
    }, `🧊 ${j.nome} virou estátua. O banimento sai em 30 s (deixe o jogo aberto).`);
  });
  on('pForcarVis', () => executar(() => rede.painel.forcarVisivel(j.id), `${j.nome} está visível de novo.`));
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
    <div class="sub">🚶 Moradores na rua</div>
    <p class="dica">Quantos moradores (NPCs) andam nas calçadas, de 0 a 40. Cada um dá a volta num quarteirão (centro e bairros em volta); longe de você ficam escondidos para não pesar no celular.</p>
    <div class="botoes"><input id="cRua" type="range" min="0" max="40" value="${cf.npc_rua ?? 4}" style="flex:1"><b id="cRuaN" style="min-width:32px;text-align:center">${cf.npc_rua ?? 4}</b><button id="cRuaOk">Salvar</button></div>
    <div class="sub">🦹 Crimes de NPC</div>
    <p class="dica">Ligado, a cada 2 minutos pode acontecer um assalto de NPC numa loja (com a chance abaixo). O ladrão foge pelas ruas por até 3 minutos; Polícia, PRF e Exército em serviço recebem o alerta e prendem chegando perto (+300).</p>
    <div class="botoes"><label><input type="checkbox" id="cCrimes" ${cf.crimes_npc ? 'checked' : ''}> Ligado</label></div>
    <div class="botoes"><span style="flex:1">Chance de ocorrência por ciclo</span><input id="cChance" type="range" min="0" max="100" step="5" value="${cf.chance_crime}" style="flex:1"><b id="cChanceN" style="min-width:44px;text-align:center">${cf.chance_crime}%</b></div>
    <div class="sub">🏥 Tempo para renascer no hospital</div>
    <p class="dica">Quem morre e não é atendido (pela ambulância ou por um médico jogador) renasce dentro do hospital depois desse tempo. Atendido antes, levanta no mesmo lugar na hora.</p>
    <div class="botoes"><input id="cResp" type="range" min="15" max="300" step="5" value="${cf.respawn_seg ?? 90}" style="flex:1"><b id="cRespN" style="min-width:52px;text-align:center">${cf.respawn_seg ?? 90} s</b></div>
    <div class="botoes"><button id="cSalvar">Salvar</button></div>
    <div class="sub">🏚️ Casas das favelas</div>
    <p class="dica">Preço de compra e aluguel (cobrado a cada 15 ciclos, 8 h) das casas dos morros que ainda não foram vendidas.</p>
    <div class="botoes"><label style="flex:1">Compra <input id="cFavP" type="number" inputmode="numeric" min="1000" value="${cf.favela_preco ?? 60000}" style="width:100%"></label>
      <label style="flex:1">Aluguel <input id="cFavA" type="number" inputmode="numeric" min="50" value="${cf.favela_aluguel ?? 200}" style="width:100%"></label></div>
    <div class="botoes"><button id="cFavSalvar">Salvar preços das favelas</button></div>
    <div class="sub">🎁 Evento de doação</div>
    <p class="dica">Dá o mesmo valor para vários jogadores de uma vez. Cada um recebe um aviso com o nome do evento. Fica no registro do painel.</p>
    <div class="botoes"><select id="cEvQuem" style="flex:1"><option value="online">Todos online agora</option><option value="todos">Todos os jogadores da cidade</option><option value="lista">Uma lista de nomes</option></select></div>
    <div class="botoes" id="cEvNomesL" style="display:none"><input id="cEvNomes" placeholder="Nomes separados por vírgula" style="flex:1"></div>
    <div class="botoes"><input id="cEvTit" maxlength="60" placeholder="Nome do evento (ex.: Festa de domingo)" style="flex:1"></div>
    <div class="botoes"><input id="cEvValor" type="number" inputmode="numeric" min="1" placeholder="Moedas para cada um" style="flex:1"><button id="cEvOk">🎁 Doar</button></div>
    <div class="sub">💊 Hospital e 🏛️ prefeitura</div>
    <p class="dica">Comissão que o médico ganha por medicação gratuita dada no hospital, e o orçamento público que cai no cofre da prefeitura a cada mandato (na posse do prefeito).</p>
    <div class="botoes"><label style="flex:1">Comissão por medicação <input id="cCom" type="number" inputmode="numeric" min="0" value="${cf.comissao_remedio ?? 150}" style="width:100%"></label>
      <label style="flex:1">Orçamento por mandato <input id="cOrc" type="number" inputmode="numeric" min="0" step="10000" value="${cf.orcamento_mandato ?? 500000}" style="width:100%"></label></div>
    <div class="botoes"><button id="cHospSalvar">Salvar comissão e orçamento</button></div>
    <div class="sub">🏗️ Obras públicas</div>
    <p class="dica">Patrimônio da prefeitura só o administrador desfaz. Demolir apaga o prédio e o programa. <b>⏩ Terminar agora</b> deixa a obra pronta sem esperar os ciclos; na Câmara, <b>⏩ Avançar fase</b> pula candidatura → votação → mandato.</p>
    <div class="lista" id="cObras"><span class="vazio">Carregando…</span></div>
    <div class="sub">👔 Farda</div>
    <p class="dica">Ajuste o tamanho e a posição do colete e do capacete/boné de cada corporação, uma por uma, vendo no seu personagem. Ao salvar, vale para todos.</p>
    <div class="botoes"><button id="cFarda">👔 Ajustar a farda</button></div>`;
  $('cFarda').onclick = () => { fechar(); ctx.ajustarFarda?.(); };
  $('cEvQuem').onchange = () => { $('cEvNomesL').style.display = $('cEvQuem').value === 'lista' ? '' : 'none'; };
  $('cEvOk').onclick = async () => {
    const b = $('cEvOk'), quem = $('cEvQuem').value, v = Math.floor(Number($('cEvValor').value));
    if (!(v > 0)) { msg('Digite quantas moedas cada um recebe.', false); return; }
    if (!b.dataset.conf) { b.dataset.conf = '1'; b.textContent = 'Toque de novo para confirmar'; return; }
    delete b.dataset.conf; b.textContent = '🎁 Doar';
    try {
      const r = await rede.painel.eventoDoacao(quem, v, $('cEvNomes').value, $('cEvTit').value.trim());
      msg(`🎁 ${r.jogadores} jogador(es) receberam ${v.toLocaleString('pt-BR')} (total ${Number(r.total).toLocaleString('pt-BR')}).${r.faltou?.length ? ` Não achei: ${r.faltou.join(', ')}.` : ''}`);
    } catch (e) { msg(/admin_evento_doacao|schema cache|does not exist/i.test(e.message || '') ? 'Rode o 94_evento_doacao.sql no SQL Editor do Supabase.' : e.message, false); }
  };
  $('cHospSalvar').onclick = async () => {
    try { await rede.hospital.comissao(Number($('cCom').value)); await rede.hospital.orcamento(Number($('cOrc').value)); msg('Comissão e orçamento salvos.'); }
    catch (e) { msg(/admin_comissao|admin_orcamento|schema cache|does not exist/i.test(e.message || '') ? 'Rode os SQL 93a, 93b e 93c no SQL Editor do Supabase.' : e.message, false); }
  };
  const NOMES_OBRA = { cras: '🤝 CRAS', varredores: '🧹 Gabinete dos Varredores', camara: '🏛️ Câmara dos Vereadores' };
  const listarObras = async () => {
    const el = $('cObras'); if (!el) return;
    let ob = []; try { ob = await rede.obras.lista(); } catch { el.innerHTML = '<span class="vazio">Rode o 93c_obras_publicas.sql.</span>'; return; }
    el.innerHTML = ob.length ? ob.map((o) => `<div class="linha item"><span class="nm"><b>${NOMES_OBRA[o.tipo] || o.tipo}</b><small>terreno ${o.terreno} · ${o.status} · ${o.publica ? 'patrimônio da prefeitura' : 'particular do prefeito'}</small></span><span class="bts">${o.status === 'construindo' ? `<button data-terminar="${o.id}">⏩ Terminar agora</button>` : ''}${o.tipo === 'camara' && o.status === 'ativa' ? '<button data-camara="1">⏩ Avançar fase</button>' : ''}<button data-demolir="${o.id}">Demolir</button></span></div>`).join('') : '<span class="vazio">Nenhuma obra.</span>';
    el.querySelectorAll('[data-terminar]').forEach((b) => { b.onclick = async () => { try { await rede.obras.terminar(Number(b.dataset.terminar)); msg('Obra pronta! O prédio aparece em instantes.'); ctx.obrasMudaram?.(); listarObras(); } catch (e) { msg(/admin_terminar|schema cache|does not exist/i.test(e.message || '') ? 'Rode o 93e_obras_admin.sql.' : e.message, false); } }; });
    el.querySelectorAll('[data-camara]').forEach((b) => { b.onclick = async () => { try { const f = await rede.obras.avancarCamara(); msg(`Câmara agora em: ${{ candidatura: 'candidaturas abertas', votacao: 'votação aberta', mandato: 'mandato dos vereadores' }[f] || f}.`); } catch (e) { msg(/admin_avancar|schema cache|does not exist/i.test(e.message || '') ? 'Rode o 93e_obras_admin.sql.' : e.message, false); } }; });
    el.querySelectorAll('[data-demolir]').forEach((b) => { b.onclick = async () => { try { await rede.obras.demolir(Number(b.dataset.demolir)); msg('Obra demolida.'); ctx.obrasMudaram?.(); listarObras(); } catch (e) { msg(e.message, false); } }; });
  };
  listarObras();
  $('cFavSalvar').onclick = async () => {
    try { await rede.configJogo.salvarFavela(Number($('cFavP').value), Number($('cFavA').value)); ctx.configMudou?.(); msg('Preços das favelas salvos.'); }
    catch (e) { msg(/admin_favela|schema cache|does not exist/i.test(e.message || '') ? 'Rode o 83_casas_favela.sql no SQL Editor do Supabase.' : e.message, false); }
  };
  $('cPol').oninput = () => { $('cPolN').textContent = $('cPol').value; };
  $('cRua').oninput = () => { $('cRuaN').textContent = $('cRua').value; };
  $('cRuaOk').onclick = async () => {
    try { await rede.configJogo.npcRua(Number($('cRua').value)); ctx.configMudou?.(); msg(`Moradores na rua: ${$('cRua').value}. Os novos vão aparecendo aos poucos.`); }
    catch (e) { msg(/admin_npc_rua|schema cache|does not exist/i.test(e.message || '') ? 'Rode o 98_npcs_rua.sql no SQL Editor do Supabase.' : e.message, false); }
  };
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
// caça ao tesouro (20q): monta o conteúdo do baú e esconde
function blocoTesouro() {
  const itens = {}; let nomes = {};
  const desenharItens = () => { const l = Object.entries(itens); $('pBauItens').innerHTML = l.length ? 'No baú: ' + l.map(([k, q]) => `<button data-bautira="${k}">${ICONES_ITEM[k] || '📦'} ${q}× ${esc(nomes[k] || k)} ✕</button>`).join(' ') : 'Nenhum item no baú. Toque num item acima para pôr.';
    $('pBauItens').querySelectorAll('[data-bautira]').forEach((b) => { b.onclick = () => { delete itens[b.dataset.bautira]; desenharItens(); }; }); };
  desenharItens();
  // 20o: itens com o ícone (igual ao catálogo do Papai Noel): tocar põe a quantidade escolhida no baú
  rede.tesouro.itens().then((l) => {
    nomes = Object.fromEntries(l.map((x) => [x.item, x.nome])); const g = $('pBauGrade'); if (!g) return;
    g.innerHTML = l.map((x) => `<button data-bauitem="${x.item}" style="display:flex;align-items:center;gap:6px;text-align:left"><span style="font-size:24px;width:34px;text-align:center">${ICONES_ITEM[x.item] || '📦'}</span>${esc(x.nome)}</button>`).join('');
    g.querySelectorAll('[data-bauitem]').forEach((b) => { b.onclick = () => { const k = b.dataset.bauitem, q = Math.max(1, Math.round(Number($('pBauQtd').value) || 1)); itens[k] = (itens[k] || 0) + q; desenharItens(); }; });
  }).catch(() => { const g = $('pBauGrade'); if (g) g.textContent = 'Não carregou os itens.'; });
  const b0 = ctx.estadoBau(); $('pBauAtual').innerHTML = b0?.ativo ? `<b>Baú ativo</b> até ${new Date(b0.expira_em).toLocaleString('pt-BR').slice(0, 17)}.` : b0?.aberto_nome ? `Último baú: aberto por <b>${esc(b0.aberto_nome)}</b>.` : 'Nenhum baú ativo.';
  const montar = () => {
    const r = {}, m = Math.max(0, Math.round(Number($('pBauMoedas').value) || 0)); if (m) r.moedas = m;
    if (Object.keys(itens).length) r.itens = { ...itens };
    const ps = [...document.querySelectorAll('[data-baup]:checked')].map((x) => x.dataset.baup); if (ps.length) r.personagens = ps;
    return r;
  };
  const esconder = (aqui) => { const r = montar(); if (!Object.keys(r).length) { msg('Coloque alguma coisa dentro do baú.', false); return; } executar(() => ctx.criarBau(r, Number($('pBauTempo').value), aqui), aqui ? 'Baú escondido aqui. Todos foram avisados.' : 'Baú escondido num lugar sorteado. Todos foram avisados.'); };
  $('pBauSortear').onclick = () => esconder(false);
  $('pBauAqui').onclick = () => esconder(true);
  $('pBauCancelar').onclick = () => executar(() => ctx.cancelarBau(), 'Caça ao tesouro encerrada.');
  $('pSirenes').onclick = () => { ctx.testarSirenes(); msg('Sirenes tocando por 15 s para todos.'); };
  if ($('pFoto')) $('pFoto').onclick = () => { fechar(); setTimeout(() => ctx.modoFoto(), 150); };
}
const MOD_VIACAO = [['onibus_rod_dourado', 'Rodoviário Dourado'], ['onibus_rod_amarelo', 'Rodoviário Amarelo'], ['onibus_rod_vermelho', 'Executivo Vermelho'], ['onibus_rod_branco', 'Micro Executivo Branco']];
async function blocoViacao() {
  const c = $('pViacao'); if (!c) return;
  let e; try { e = await ctx.viacaoEstado(); } catch (er) { c.textContent = er.message; return; }
  const uso = new Set(e.em_uso || []);
  c.innerHTML = `<div class="cartoes"><div><small>Pagamento por viagem</small><input id="pVSal" type="number" min="0" value="${e.salario}"></div>
      <div><small>Experiência mínima (horas)</small><input id="pVExp" type="number" min="0" step="0.5" value="${(e.exp_min / 60).toFixed(1)}"></div></div>
    <div class="sub">Vagas do pátio</div>${(e.vagas || []).map((m, i) => `<div class="botoes"><span style="min-width:70px">Vaga ${i + 1}${uso.has(i) ? ' 🚌 em viagem' : ''}</span><select data-vaga="${i}"><option value="">— vazia —</option>${MOD_VIACAO.map(([id, n]) => `<option value="${id}" ${id === m ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`).join('')}
    <div class="sub">Preço de venda</div>${MOD_VIACAO.map(([id, n]) => `<div class="botoes"><span style="min-width:150px">${n}</span><input data-preco="${id}" type="number" min="0" value="${e.precos?.[id] ?? 0}"></div>`).join('')}
    <div class="botoes"><button id="pVSalvar">💾 Salvar Viação</button></div>`;
  $('pVSalvar').onclick = () => {
    const vagas = [...c.querySelectorAll('[data-vaga]')].map((s) => s.value), precos = {};
    c.querySelectorAll('[data-preco]').forEach((i) => { precos[i.dataset.preco] = Math.max(0, Math.round(Number(i.value) || 0)); });
    executar(() => ctx.viacaoAdmin({ salario: Math.round(Number($('pVSal').value) || 0), exp_min: Math.round((Number($('pVExp').value) || 0) * 60), precos, vagas }), '🚌 Viação salva.');
  };
}
async function blocoNatal() {
  const est = () => { const n = ctx.estadoNatal(), el = $('pNatalEstado'); if (!el) return;
    el.innerHTML = n?.ativo ? (n.teste ? `<b>🟢 Em teste</b> até ${new Date(n.teste_ate).toLocaleString('pt-BR').slice(0, 17)}.` : '<b>🟢 No ar (Natal)</b>.') + ` Muda de lugar às ${new Date(n.troca_em).toLocaleTimeString('pt-BR').slice(0, 5)}.` : '⚪ Desligado (liga sozinho em 20/12).'; };
  est();
  let cat = [];
  try { cat = await ctx.catalogoNatal(); } catch { cat = []; }
  let marcados = new Set(ctx.estadoNatal()?.catalogo || []);
  try { const o = await rede.natal.onde(); if (o?.catalogo) marcados = new Set(o.catalogo); } catch { /* sem permissão */ }
  const c = $('pNatalCat'); if (!c) return;
  c.innerHTML = cat.map((x) => `<label style="display:flex;align-items:center;gap:6px"><input type="checkbox" data-natal="${x.id}" ${marcados.has(x.id) ? 'checked' : ''}>${x.img ? `<img src="${x.img}" alt="" style="width:34px;height:34px;border-radius:6px;object-fit:cover">` : `<span style="font-size:24px;width:34px;text-align:center">${x.ic}</span>`} ${esc(x.nome)}</label>`).join('');
  const caixas = () => [...c.querySelectorAll('[data-natal]')];
  $('pNatalTudo').onclick = () => caixas().forEach((b) => { b.checked = true; });
  $('pNatalNada').onclick = () => caixas().forEach((b) => { b.checked = false; });
  $('pNatalSalvar').onclick = () => { const l = caixas().filter((b) => b.checked).map((b) => b.dataset.natal); if (!l.length) { msg('Marque pelo menos um presente.', false); return; }
    executar(async () => { await ctx.natalAdmin(l, null); est(); }, `Catálogo salvo: ${l.length} presente(s).`); };
  const teste = (min, t) => executar(async () => { await ctx.natalAdmin(null, min); est(); }, t);
  $('pNatal1h').onclick = () => teste(60, '🎅 Papai Noel no ar por 1 h (teste). Todos foram avisados.');
  $('pNatal1d').onclick = () => teste(1440, '🎅 Papai Noel no ar por 1 dia (teste).');
  $('pNatalFim').onclick = () => teste(0, 'Teste do Papai Noel encerrado.');
  $('pNatalIr').onclick = () => executar(async () => { await ctx.natalIr(); fechar(); }, '📍 Você está do lado do Papai Noel.');
}
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
  if (pode('invisivel')) h += `<div class="sub">Modo invisível</div><p class="dica">Os jogadores não veem você (nem no minimapa). A equipe continua vendo.</p><div class="botoes"><button id="pInvis" class="${eu.invisivel ? 'ativo' : ''}">${eu.invisivel ? '👻 Invisível: ligado' : '👻 Invisível: desligado'}</button></div>`;
  if (eu.cargo === 'admin' || eu.cargo === 'moderador') h += '<div class="sub">🔊 Som das Saveiros (últimos links)</div><div id="pSons" class="dica">Carregando…</div>';
  if (eu.cargo === 'admin') h += '<div class="sub">Evento: arma dourada</div><p class="dica">Esconde a arma dourada (2 balas) exatamente onde você está. Quem achar pega; depois dos 2 tiros ela some.</p><div class="botoes"><button id="pArmaPd">✨ Esconder a arma dourada aqui</button></div><div class="sub">Evento: pedra do Bruxo</div><p class="dica">Esconde a pedra preciosa exatamente onde você está. Quem achar invoca o Bruxo e faz UM pedido: virar pássaro por um ciclo, perdão de todos os crimes, 1 a 10 milhões ou a arma dourada.</p><div class="botoes"><button id="pPedra">💎 Esconder a pedra do Bruxo aqui</button></div>';
  if (eu.cargo === 'admin' && ctx.criarBau) {   // 20q: caça ao tesouro e teste das sirenes
    const todos = [...PERSONAGENS, ...PERSONAGENS_EVENTO];
    h += `<div class="sub">🗝️ Caça ao tesouro</div><p class="dica">Monte o baú: moedas, itens da mochila e personagens (qualquer um, inclusive os 🗝️ só do baú). O primeiro que abrir leva tudo. Todos veem só o círculo de busca no minimapa.</p>
      <div id="pBauAtual" class="dica"></div>
      <div class="botoes"><label>💰 Moedas <input id="pBauMoedas" type="number" min="0" step="100" value="0" style="width:110px"></label></div>
      <div class="botoes"><label>Quantidade por toque <input id="pBauQtd" type="number" min="1" value="1" style="width:64px"></label></div>
      <div id="pBauGrade" class="poderes" style="max-height:200px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:6px">Carregando itens…</div>
      <div id="pBauItens" class="dica"></div>
      <div class="sub">Personagens no baú</div>
      <div class="poderes" style="max-height:220px;overflow:auto">${todos.map((x) => `<label style="display:flex;align-items:center;gap:6px"><input type="checkbox" data-baup="${x.id}"><img src="assets/miniaturas/${x.id}.webp" alt="" loading="lazy" style="width:34px;height:34px;border-radius:6px;object-fit:cover"> ${x.bau ? '🗝️ ' : ''}${esc(x.nome)}</label>`).join('')}</div>
      <div class="botoes"><select id="pBauTempo">${[[30, '30 min'], [60, '1 h'], [180, '3 h'], [720, '12 h'], [1440, '1 dia'], [4320, '3 dias']].map(([m, t]) => `<option value="${m}" ${m === 180 ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button id="pBauSortear">🎲 Esconder em lugar sorteado</button><button id="pBauAqui">📍 Esconder aqui</button><button id="pBauCancelar" class="perigo">Encerrar caça</button></div>
      <div class="sub">📢 Sirenes de alarme</div><p class="dica">Tocam sozinhas quando a Marinha lança o míssil de cruzeiro. O teste toca 15 s para todos os jogadores.</p>
      <div class="botoes"><button id="pSirenes">📢 Testar sirenes</button></div>
      <div class="sub">📸 Modo foto</div><p class="dica">Esconde os botões, o minimapa e os nomes para tirar print da tela. Toque na tela para voltar.</p>
      <div class="botoes"><button id="pFoto">📸 Modo foto</button></div>`;
  }
  if (eu.cargo === 'admin' && ctx.viacaoAdmin) {   // 20e: Viação Expresso Fator
    h += `<div class="sub">🚌 Viação Expresso Fator</div><p class="dica">Pátio a leste da Rodoviária. Escolha o ônibus de cada vaga (vazia = sem ônibus), o pagamento por viagem, a experiência mínima e os preços de venda.</p>
      <div id="pViacao" class="dica">Carregando…</div>`;
  }
  if (eu.cargo === 'admin' && ctx.natalAdmin) {   // 20w: Papai Noel
    h += `<div class="sub">🎅 Papai Noel (Natal)</div><p class="dica">Aparece sozinho de <b>20 a 25 de dezembro</b> e muda de lugar a cada 2 h. Quem encontrar escolhe 1 presente do catálogo (1 por Natal). Para testar antes, antecipe aqui: os presentes do teste não contam para o Natal de verdade.</p>
      <div id="pNatalEstado" class="dica">Carregando…</div>
      <div class="botoes"><button id="pNatal1h">▶️ Testar agora (1 h)</button><button id="pNatal1d">▶️ Testar (1 dia)</button><button id="pNatalFim" class="perigo">⏹️ Encerrar teste</button><button id="pNatalIr">📍 Ir até o Papai Noel</button></div>
      <div class="dica">Catálogo: marque o que o Papai Noel oferece.</div>
      <div class="botoes"><button id="pNatalTudo">☑️ Marcar tudo</button><button id="pNatalNada">⬜ Desmarcar tudo</button><button id="pNatalSalvar">💾 Salvar catálogo</button></div>
      <div id="pNatalCat" class="poderes" style="max-height:260px;overflow:auto">Carregando…</div>`;
  }
  if (eu.cargo === 'admin') h += '<div class="sub">🐀 Bueiro secreto dos Lixeiros</div><div id="pBueiro" class="dica">Carregando…</div>';
  if (eu.cargo === 'admin') h += '<div class="sub">⚖️ Perdoar crimes</div><div id="pPerdao" class="dica">Carregando…</div>';
  if (eu.cargo === 'admin') h += '<div class="sub">Prefeitura</div><div id="pPref" class="dica">Carregando…</div>';
  if (eu.cargo === 'admin') {
    h += `<div class="sub">Personagens limitados: vitrine</div><p class="dica">Abre a vitrine para os jogadores comprarem. Marque quais (nenhum marcado = todos) e o tempo.</p>
      <div id="pEvLista" class="poderes">${PERSONAGENS_EVENTO.filter((x) => !x.soPresente).map((x) => `<label><input type="checkbox" data-ev="${x.id}"> ${esc(x.nome)}</label>`).join('')}</div>
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
  if (eu.cargo === 'admin' && ctx.testeDefesa) h += `<div class="sub">🧪 Teste de defesa das bases</div><p class="dica">Um NPC tenta invadir: só na sua tela, não vale para os outros nem para o banco. Teleporte para perto da base para assistir.</p>
    ${[['a51', '👽 Área 51'], ['quartel', '🪖 Quartel'], ['aerea', '✈️ Base Aérea'], ['naval', '⚓ Base Naval']].map(([id, n]) => `<div class="botoes"><b style="min-width:110px">${n}</b><button data-tdef="${id}:pe">🚶 A pé</button><button data-tdef="${id}:heli">🚁 Helicóptero</button><button data-tdef="${id}:aviao">✈️ Avião</button></div>`).join('')}
    <div class="botoes"><button data-tdef="parar">⏹ Parar teste</button></div>`;
  if (eu.cargo === 'admin' && ctx.guardasBases) { const gb = ctx.guardasBases(); h += `<div class="sub">💂 Soldados vigiando cada base (0 a 60)</div><p class="dica">Vale para todos os jogadores. Muitos soldados juntos pesam no celular: quem passa perto do Quartel, da Base Aérea e da Base Naval vê os três grupos.</p>
    ${[['a51', '👽 Área 51'], ['quartel', '🪖 Quartel'], ['aerea', '✈️ Base Aérea'], ['naval', '⚓ Base Naval']].map(([id, n]) => `<div class="botoes"><b style="min-width:110px">${n}</b><input type="number" min="0" max="60" value="${gb[id]}" data-gnum="${id}" style="width:70px"><button data-gsalvar="${id}">Salvar</button></div>`).join('')}`; }
  if (pode('teleportar')) h += `<div class="sub">Teleportar para</div><div class="botoes">${ctx.locais().map((l, i) => `<button data-local="${i}">${esc(l.nome)}</button>`).join('')}</div>`;
  h += `<div class="sub">Skin (grátis para a equipe)</div><div class="skins">${[...ROBOS.map((id) => ({ id, nome: id === 'Rusty_Scout_Bot' ? 'Robô Batedor' : 'Robô Sentinela' })), ...PERSONAGENS, ...(eu.cargo === 'admin' ? PERSONAGENS_EVENTO : [])]
    .map((p) => `<button class="skin ${p.id === eu.personagem ? 'sel' : ''}" data-skin="${p.id}"><img src="assets/miniaturas/${p.id}.webp" alt=""><span>${esc(p.nome)}</span></button>`).join('')}</div>`;
  c.innerHTML = h;
  if ($('pBueiro')) blocoBueiro();
  if ($('pBauSortear')) blocoTesouro();
  if ($('pNatalCat')) blocoNatal();
  if ($('pViacao')) blocoViacao();
  const apd = $('pArmaPd'); if (apd) apd.onclick = () => executar(() => ctx.esconderArmaPd(), 'Arma dourada escondida aqui. Todos foram avisados do evento.');
  const ppd = $('pPedra'); if (ppd) ppd.onclick = () => executar(() => ctx.esconderPedra(), 'Pedra do Bruxo escondida aqui. Todos foram avisados do evento.');
  const b = $('pImortal'); if (b) b.onclick = () => executar(() => rede.painel.imortal(!eu.imortal), eu.imortal ? 'Modo imortal desligado.' : 'Modo imortal ligado.');
  const bi = $('pInvis'); if (bi) bi.onclick = () => executar(() => rede.tatica.invisivel(!eu.invisivel), eu.invisivel ? 'Modo invisível desligado.' : 'Modo invisível ligado: os jogadores não veem você.');
  if ($('pSons')) rede.tatica.sonsRecentes().then((l) => {
    const el = $('pSons'); if (!el) return;
    el.innerHTML = (l || []).length ? l.map((x) => `<div class="botoes"><span style="flex:1"><b>${esc(x.nome)}</b> · ${new Date(x.em).toLocaleString('pt-BR').slice(0, 17)}<br><small>${esc(x.texto || '')} · <a href="${esc(x.url)}" target="_blank" rel="noopener">ouvir</a></small></span>${pode('banir') ? `<button class="perigo" data-bansom="${x.jogador}" data-nome="${esc(x.nome)}">Banir</button>` : ''}</div>`).join('') : 'Nenhum som tocado ainda.';
    el.querySelectorAll('[data-bansom]').forEach((k) => { k.onclick = () => { if (!k.dataset.conf) { k.dataset.conf = '1'; k.textContent = 'Confirmar ban'; return; } executar(() => rede.painel.banir(k.dataset.bansom, 'Música proibida no som da Saveiro'), `${k.dataset.nome} banido.`); }; });
  }).catch((e) => { const el = $('pSons'); if (el) el.textContent = /sons_recentes|schema cache|does not exist/i.test(e.message || '') ? 'Rode o 85 no Supabase.' : e.message; });
  c.querySelectorAll('[data-gsalvar]').forEach((x) => { x.onclick = () => { const id = x.dataset.gsalvar, n = Math.round(Number(c.querySelector(`[data-gnum="${id}"]`).value)); executar(() => ctx.definirGuardas(id, n), `Soldados na base: ${n}.`); }; });
  c.querySelectorAll('[data-tdef]').forEach((x) => { x.onclick = () => { const [base, tipo] = x.dataset.tdef.split(':'); const r = ctx.testeDefesa(base, tipo); msg(r || 'Teste iniciado.'); if (base !== 'parar') fechar(); }; });
  c.querySelectorAll('[data-local]').forEach((x) => { x.onclick = () => { const l = ctx.locais()[x.dataset.local]; if (l.navio && ctx.embarcarNavio) { ctx.embarcarNavio(l.navio); fechar(); return; } ctx.teleportar(l.x, l.z); msg('Teleportado: ' + l.nome); }; });
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
  el.innerHTML = (lista || []).length ? `<div class="lista">${lista.map((p) => `<div class="linha item"><span class="nm"><b>${esc(p.nome)}</b><small>${p.crimes > 0 ? '★'.repeat(Math.min(5, p.crimes)) : 'sem estrelas'}${p.recompensa ? ` · recompensa ${Number(p.recompensa).toLocaleString('pt-BR')}` : ''}${p.pena_seg > 0 ? ' · preso' : ''}</small></span>
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
