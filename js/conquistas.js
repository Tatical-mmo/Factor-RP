// Ranking, metas do dia e conquistas. Metas e ranking vêm do banco; conquistas são calculadas aqui.
import * as rede from './rede.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const META = {
  sucata: ['⚙️', (n) => `Colete ${n} sucatas no ferro-velho`],
  entrega: ['📦', (n) => `Entregue ${n} cargas (doca ou pedido)`],
  trabalho: ['🏭', (n) => `Embale ${n} caixas numa fábrica`],
  encomenda: ['🚆', (n) => `Leve ${n} encomenda${n > 1 ? 's' : ''} para outra cidade`],
  parafuso: ['🔩', (n) => `Faça ${n} parafusos na oficina de Porto Sul`],
  venda: ['🛒', (n) => `Venda ${num(n)} moedas em itens na loja`],
};

let ctx = null, aba = 'metas', aberta = false, avisadas = new Set();

export function iniciarConquistas(contexto) {
  ctx = contexto;
  $('btRanking').onclick = abrir;
  $('fecharRanking').onclick = () => { aberta = false; $('rankingJanela').classList.add('oculto'); };
  const ciclo = () => { verificar(); setTimeout(ciclo, 45000); };
  setTimeout(ciclo, 8000);
}
function abrir() { aberta = true; $('rankingJanela').classList.remove('oculto'); $('btRanking').classList.remove('alerta'); desenhar(); }
function msg(t, ok = true) { const m = $('rankingMsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'erro'); clearTimeout(msg.t); msg.t = setTimeout(() => { m.textContent = ''; }, 4000); }

// avisa quando uma meta fica pronta para resgatar
async function verificar() {
  try {
    const ms = await rede.metas.minhas();
    for (const m of ms) {
      const k = `${m.dia}|${m.tipo}`;
      if (m.progresso >= m.alvo && !m.resgatada && !avisadas.has(k)) { avisadas.add(k); ctx.aviso('🏆 Meta do dia cumprida! Toque no troféu para resgatar.', 4); $('btRanking').classList.add('alerta'); }
    }
    if (aberta && aba === 'metas') desenhar();
  } catch { /* tenta depois */ }
}

async function desenhar() {
  const abas = $('rankingAbas'), c = $('rankingConteudo');
  abas.innerHTML = [['metas', 'Metas do dia'], ['ranking', 'Ranking'], ['conquistas', 'Conquistas']]
    .map(([k, t]) => `<button data-aba="${k}" class="${aba === k ? 'sel' : ''}">${t}</button>`).join('');
  abas.querySelectorAll('button').forEach((b) => { b.onclick = () => { aba = b.dataset.aba; desenhar(); }; });
  try {
    if (aba === 'metas') await telaMetas(c);
    else if (aba === 'ranking') await telaRanking(c);
    else await telaConquistas(c);
  } catch (e) { c.textContent = e.message; }
}

async function telaMetas(c) {
  const ms = await rede.metas.minhas();
  const feitas = ms.filter((m) => m.resgatada).length;
  c.innerHTML = `<p class="dica">3 metas novas todo dia à meia-noite. Resgatando as 3 você ganha mais <b>1.000</b> de bônus (${feitas}/3).</p>
    <div class="lista">${ms.map((m) => { const [ic, txt] = META[m.tipo] || ['🎯', (n) => `${m.tipo} ${n}`], pct = Math.min(100, Math.round(m.progresso / m.alvo * 100));
      return `<div class="linha item"><span class="ic">${ic}</span><span class="nm"><b>${esc(txt(m.alvo))}</b>
        <small>${num(m.progresso)}/${num(m.alvo)} · recompensa ${num(m.recompensa)}</small><span class="barra"><i style="width:${pct}%"></i></span></span>
        <span class="bts">${m.resgatada ? '<small>✔ resgatada</small>' : `<button data-resg="${m.tipo}" ${pct < 100 ? 'disabled' : ''}>Resgatar</button>`}</span></div>`; }).join('')}</div>`;
  c.querySelectorAll('[data-resg]').forEach((b) => {
    b.onclick = async () => { try { const v = await rede.metas.resgatar(b.dataset.resg); msg(`+${num(v)} moedas!${v > 1000 ? ' (com o bônus das 3 metas)' : ''}`); desenhar(); } catch (e) { msg(e.message, false); } };
  });
}

async function telaRanking(c) {
  const r = await rede.metas.ranking(), eu = ctx.perfil();
  const linha = (i, a, b) => `<div class="linha item"><span class="ic">${['🥇', '🥈', '🥉'][i] || `${i + 1}º`}</span><span class="nm"><b>${a}</b><small>${b}</small></span></div>`;
  c.innerHTML = `<p class="dica">Sua posição entre os mais ricos: <b>${num(r.minha_posicao)}º</b> com ${num(eu.moedas)} moedas.</p>
    <div class="sub">Mais ricos</div><div class="lista">${r.ricos.map((x, i) => linha(i, esc(x.nome) + (x.nome === eu.nome ? ' (você)' : ''), `${num(x.moedas)} moedas`)).join('') || '<span class="vazio">Ninguém ainda.</span>'}</div>
    <div class="sub">Maiores empresas</div><div class="lista">${r.empresas.map((x, i) => linha(i, esc(x.nome), `nível ${x.nivel} · ${x.lotes} lote${x.lotes > 1 ? 's' : ''} · caixa ${num(x.caixa)} · dono ${esc(x.dono)}`)).join('') || '<span class="vazio">Nenhuma empresa ainda.</span>'}</div>
    <div class="sub">Maiores clãs</div><div class="lista">${r.clas.map((x, i) => linha(i, `<span style="color:${esc(x.cor)}">■</span> ${esc(x.nome)}`, `nível ${x.nivel} · ${x.territorios} território${x.territorios === 1 ? '' : 's'} · ${x.membros} membro${x.membros === 1 ? '' : 's'}`)).join('') || '<span class="vazio">Nenhum clã ainda.</span>'}</div>`;
}

async function telaConquistas(c) {
  const d = ctx.dados();
  let comprados = [];
  try { comprados = await rede.personagens.comprados(d.perfil.id); } catch { /* sem a tabela ainda */ }
  const lista = [
    ['💰', 'Primeiro milhar', 'Juntar 1.000 moedas', d.perfil.moedas >= 1000],
    ['💵', 'Bolso cheio', 'Juntar 50.000 moedas', d.perfil.moedas >= 50000],
    ['💎', 'Magnata', 'Juntar 500.000 moedas', d.perfil.moedas >= 500000],
    ['🏭', 'Empresário', 'Ter uma empresa', d.empresas.length > 0],
    ['⭐', 'Galpão com docas', 'Empresa no nível 5', d.empresas.some((e) => e.nivel >= 5)],
    ['🌟', 'Complexo industrial', 'Empresa no nível 10', d.empresas.some((e) => e.nivel >= 10)],
    ['👑', 'Arranha-céu', 'Empresa no nível 15', d.empresas.some((e) => e.nivel >= 15)],
    ['🚁', 'Céu é o limite', 'Ter um helicóptero', d.helis > 0],
    ['🏠', 'Lar doce lar', 'Ter uma moradia', d.moradias.length > 0],
    ['🏢', 'Senhorio', 'Ter um condomínio ou prédio', d.moradias.some((m) => m.tipo === 'terreno' && (m.nivel || 1) >= 3)],
    ['⚔️', 'Fundador', 'Ser líder de um clã', !!d.cla && d.cla.lider === d.perfil.id],
    ['🚩', 'Conquistador', 'Seu clã ter um território', d.territorios > 0],
    ['🏰', 'Fortaleza', 'Clã no nível 15', (d.cla?.nivel || 0) >= 15],
    ['🎭', 'Colecionador', 'Comprar 3 personagens', comprados.length >= 3],
  ];
  const ok = lista.filter((x) => x[3]).length;
  c.innerHTML = `<p class="dica">${ok} de ${lista.length} conquistas.</p>
    <div class="grade-conq">${lista.map(([ic, nome, txt, feito]) => `<div class="conq ${feito ? 'feita' : ''}"><span>${ic}</span><b>${nome}</b><small>${txt}</small></div>`).join('')}</div>`;
}
