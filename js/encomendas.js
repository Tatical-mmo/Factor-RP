// 23a: quadro de encomendas e tabela de preços da cidade.
// Jogador ou clã encomenda; as fábricas do produto dão lances por 10 min; o menor preço vence e entrega por uma transportadora.
import * as rede from './rede.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
export const PRODUTOS_CIDADE = {
  chocolate: { nome: 'Chocolate', ic: '🍫' },
  remedio: { nome: 'Remédio', ic: '💊' },
  hamburguer: { nome: 'Hambúrguer', ic: '🍔' },
  refeicao: { nome: 'Refeição completa', ic: '🍽️' },
};
const nomeP = (p) => `${PRODUTOS_CIDADE[p]?.ic || '📦'} ${PRODUTOS_CIDADE[p]?.nome || p}`;
const restaTxt = (t) => { const s = Math.max(0, Math.round((Date.parse(t) - Date.now()) / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// tabela "a cidade paga por caixa" (usada no quadro e na aba Vendas da empresa)
export function tabelaCidade(est, destaque = null) {
  const ls = (est || []).filter((m) => PRODUTOS_CIDADE[m.produto]);
  if (!ls.length) return '';
  return `<div class="lista">${ls.map((m) => {
    const cheio = m.estoque + (m.a_caminho || 0) >= m.capacidade, pct = Math.round((m.estoque / Math.max(1, m.capacidade)) * 100);
    return `<div class="linha item${m.produto === destaque ? ' sel' : ''}"><span class="ic">${PRODUTOS_CIDADE[m.produto].ic}</span>
      <span class="nm"><b>${PRODUTOS_CIDADE[m.produto].nome}: ${fmt(m.valor_caixa)} por caixa</b>
      <small>estoque ${fmt(m.estoque)}/${fmt(m.capacidade)} (${pct}%)${m.a_caminho ? ` · ${fmt(m.a_caminho)} a caminho` : ''}${cheio ? ' · <b>cheio: a cidade não compra agora</b>' : m.estoque <= 0 ? ' · <b>em falta!</b>' : ''}</small></span></div>`;
  }).join('')}</div>`;
}

let filtroProduto = '';
export async function desenharEncomendas(c, api) {
  c.innerHTML = '<p class="dica">Carregando o quadro…</p>';
  let lista = [], est = [], empresas = [];
  try {
    [lista, est, empresas] = await Promise.all([rede.quadroEncomendas.quadro(), rede.cidade.estoque(), rede.listarEmpresas()]);
  } catch (e) { c.innerHTML = `<p class="dica">O quadro de encomendas precisa dos SQL 160a a 160d no Supabase. (${esc(e.message)})</p><div class="botoes"><button id="encVoltar">Voltar</button></div>`; c.querySelector('#encVoltar').onclick = api.voltar; return; }
  if (!api.aberto()) return;
  const eu = api.perfil().id;
  const minhasFab = empresas.filter((e) => e.dono === eu && e.fabrica && PRODUTOS_CIDADE[e.produto]);
  const base = Object.fromEntries((est || []).map((m) => [m.produto, m]));
  const precoLoja = { chocolate: 100, remedio: 300, hamburguer: 250, refeicao: 450 };
  const transp = (f) => empresas.filter((x) => x.transporte || (x.id === f.id && x.nivel >= 3));
  const ls = (lista || []).filter((e) => !filtroProduto || e.produto === filtroProduto);
  const cartao = (e) => {
    const quem = e.do_cla ? `clã ${esc(e.cla_nome || '?')}` : esc(e.comprador_nome || '?');
    let st = '', acoes = '';
    if (e.status === 'leilao') {
      st = `lances fecham em ${restaTxt(e.fecha_em)} · ${e.lances ? `menor lance <b>${fmt(e.menor_lance)}</b> (${e.lances})` : 'nenhum lance ainda'}${e.meu_lance ? ` · seu lance ${fmt(e.meu_lance)}` : ''}`;
      const fabs = minhasFab.filter((f) => f.produto === e.produto);
      if (!e.minha && fabs.length) {
        acoes = `<span class="bts" style="flex-wrap:wrap">${fabs.length > 1 ? `<select data-lfab="${e.id}">${fabs.map((f) => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select>` : `<input type="hidden" data-lfab="${e.id}" value="${fabs[0].id}">`}
          <input data-lpreco="${e.id}" type="number" min="1" max="${e.preco_max}" value="${Math.max(1, Math.min(e.preco_max, (e.menor_lance || e.preco_max + 1) - 1))}" inputmode="numeric" style="width:80px">
          <button data-lance="${e.id}">Dar lance</button></span>`;
      } else if (e.minha && !e.lances) acoes = `<span class="bts"><button data-cancenc="${e.id}">Cancelar</button></span>`;
    } else if (e.status === 'aguardando') {
      st = `vencedor: <b>${esc(e.vencedor_nome || '?')}</b> a ${fmt(e.preco)}/un · ${e.entregues ? `${e.entregues}/${e.qtd} entregues · ` : ''}enviar em até ${restaTxt(e.prazo)}`;
      if (e.venci) {
        const f = empresas.find((x) => x.id === e.vencedor), ts = f ? transp(f) : [];
        acoes = ts.length ? `<span class="bts" style="flex-wrap:wrap"><select data-etra="${e.id}">${ts.map((x) => `<option value="${x.id}">${esc(x.nome)}${x.dono === eu ? ' (sua, sem frete)' : ''}</option>`).join('')}</select>
          <input data-efrete="${e.id}" type="number" min="0" max="${e.preco}" value="${Math.round(e.preco * 0.3)}" inputmode="numeric" style="width:70px" title="frete por caixa">
          <button data-enviar="${e.id}">Enviar (estoque ${fmt(f?.estoque)})</button></span>` : '<small>Nenhuma transportadora disponível.</small>';
      }
    } else if (e.status === 'entregando') st = `a caminho com <b>${esc(e.vencedor_nome || '?')}</b> a ${fmt(e.preco)}/un · ${e.entregues}/${e.qtd} entregues · prazo ${restaTxt(e.prazo)}`;
    else if (e.status === 'concluida') st = `✔ entregue${e.entregues < e.qtd ? ` (${e.entregues}/${e.qtd}, o resto foi devolvido)` : ''}`;
    else if (e.status === 'expirada') st = 'expirou: dinheiro devolvido';
    else st = 'cancelada';
    return `<div class="linha item"><span class="ic">${PRODUTOS_CIDADE[e.produto]?.ic || '📦'}</span>
      <span class="nm"><b>#${e.id} · ${fmt(e.qtd)}x ${PRODUTOS_CIDADE[e.produto]?.nome || e.produto} · até ${fmt(e.preco_max)}/un</b>
      <small>${e.minha ? 'sua encomenda' : `por ${quem}`}${e.minha && e.do_cla ? ' (pelo clã)' : ''} · ${st}</small></span>${acoes}</div>`;
  };
  c.innerHTML = `<p class="dica">Encomende em quantidade: o dinheiro fica guardado, as fábricas dão lances por 10 min e o <b>menor preço</b> vence. Ela tem 24 h para entregar; o que não chegar volta para você. Moedas: <b>${fmt(api.perfil().moedas)}</b>.</p>
    <div class="sub">Nova encomenda</div>
    <div class="form">
      <label>Produto <select id="encProd">${Object.keys(PRODUTOS_CIDADE).map((p) => `<option value="${p}">${nomeP(p)}</option>`).join('')}</select></label>
      <label>Quantidade <input id="encQtd" type="number" min="1" max="200" value="20" inputmode="numeric"></label>
      <label>Preço máximo por unidade <input id="encPreco" type="number" min="1" inputmode="numeric"></label>
      <label style="flex-direction:row;align-items:center;gap:8px"><input id="encCla" type="checkbox" style="width:auto"> Pagar com o caixa do clã (só o líder; vai para o cofre do clã)</label>
      <small id="encTotal"></small>
      <button id="encCriar">Publicar encomenda</button></div>
    <div class="sub">Quadro</div>
    <div class="chips seletor"><button class="chip ${filtroProduto ? '' : 'sel'}" data-fprod="">Todas</button>${Object.keys(PRODUTOS_CIDADE).map((p) => `<button class="chip ${filtroProduto === p ? 'sel' : ''}" data-fprod="${p}">${PRODUTOS_CIDADE[p].ic}</button>`).join('')}</div>
    <div class="lista">${ls.length ? ls.map(cartao).join('') : '<span class="vazio">Nenhuma encomenda aberta agora.</span>'}</div>
    <div class="sub">🏙️ Estoque da cidade (quanto ela paga às fábricas)</div>${tabelaCidade(est)}
    <div class="botoes"><button id="encAtual">🔄 Atualizar</button><button id="encVoltar">Voltar</button></div>`;
  const $ = (id) => c.querySelector('#' + id);
  const ajustar = () => {
    const p = $('encProd').value, m = base[p], max = (m?.valor_base || 50) * 4;
    $('encPreco').max = max;
    if (!$('encPreco').dataset.mexeu) $('encPreco').value = Math.min(max, Math.round(precoLoja[p] * 0.6));
    const tot = (Math.floor(Number($('encQtd').value)) || 0) * (Math.floor(Number($('encPreco').value)) || 0);
    $('encTotal').textContent = `Total guardado agora: ${fmt(tot)} (máximo ${fmt(max)} por unidade; na loja sai ${fmt(precoLoja[p])}).`;
  };
  $('encProd').onchange = () => { delete $('encPreco').dataset.mexeu; ajustar(); };
  $('encQtd').oninput = ajustar;
  $('encPreco').oninput = () => { $('encPreco').dataset.mexeu = '1'; ajustar(); };
  ajustar();
  $('encCriar').onclick = () => {
    const p = $('encProd').value, q = Math.floor(Number($('encQtd').value)) || 0, pr = Math.floor(Number($('encPreco').value)) || 0, cla = $('encCla').checked;
    api.executar(() => rede.quadroEncomendas.criar(p, q, pr, cla), (id) => { api.saldo?.(); return `Encomenda #${id} publicada! Lances por 10 minutos.`; });
  };
  $('encAtual').onclick = () => desenharEncomendas(c, api);
  $('encVoltar').onclick = api.voltar;
  c.querySelectorAll('[data-fprod]').forEach((b) => { b.onclick = () => { filtroProduto = b.dataset.fprod; desenharEncomendas(c, api); }; });
  c.querySelectorAll('[data-cancenc]').forEach((b) => { b.onclick = () => api.executar(() => rede.quadroEncomendas.cancelar(Number(b.dataset.cancenc)), () => { api.saldo?.(); return 'Encomenda cancelada; dinheiro devolvido.'; }); });
  c.querySelectorAll('[data-lance]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.lance, fab = Number(c.querySelector(`[data-lfab="${id}"]`)?.value), pr = Math.floor(Number(c.querySelector(`[data-lpreco="${id}"]`)?.value)) || 0;
      api.executar(() => rede.quadroEncomendas.lance(Number(id), fab, pr), `Lance de ${fmt(pr)} por unidade registrado.`);
    };
  });
  c.querySelectorAll('[data-enviar]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.enviar, t = Number(c.querySelector(`[data-etra="${id}"]`)?.value), fr = Math.floor(Number(c.querySelector(`[data-efrete="${id}"]`)?.value)) || 0;
      api.executar(() => rede.quadroEncomendas.enviar(Number(id), t, fr), 'Encomenda enviada à transportadora.');
    };
  });
}
