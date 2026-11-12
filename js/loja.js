// Loja e mochila (etapa 3). Toda compra, venda e refeição é feita no banco.
import * as rede from './rede.js';
import { PERSONAGENS, PERSONAGENS_GRATIS, PERSONAGENS_EVENTO, PRECO_PERSONAGEM, PRECO_NOME } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONES = { sucata: '⚙️', chocolate: '🍫', cereal: '🥣', remedio: '💊', desbloqueio: '🔓', parafuso: '🔩' };

let ctx = null;
let precos = [];
let inv = {};
let modo = null;          // 'loja' | 'mochila'

export async function iniciarLoja(contexto) {
  ctx = contexto;
  $('fecharJanela').onclick = fechar;
  $('janela').addEventListener('focusout', () => setTimeout(() => { if (pendenteJanela && modo && !digitandoJanela()) { pendenteJanela = false; desenhar(); } }, 400));
  $('btMochila').onclick = () => abrir('mochila');
  try { precos = await rede.carregarPrecos(); } catch (e) { console.warn('preços', e); }
  await recarregarInventario();
}
export const qtdItem = (k) => inv?.[k] || 0;
export async function recarregarInventario() {
  try { inv = await rede.carregarInventario(ctx.perfil().id); } catch { /* tenta depois */ }
  if (modo && digitandoJanela()) { pendenteJanela = true; return; }
  if (modo) desenhar();
}
let pendenteJanela = false;
const digitandoJanela = () => { const f = document.activeElement; return !!f && ['INPUT', 'SELECT', 'TEXTAREA'].includes(f.tagName) && !!$('janela')?.contains(f); };
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

// porta da sua moradia: entrar, construir/evoluir (terreno), gerenciar apartamentos, sair do aluguel ou vender
const VALOR_VENDA = { simples: 10000, sobrado: 22500, mansao: 45000 };
const EVOLUIR = [60000, 150000, 350000, 800000];
const ESTAGIOS = ['', 'Casa', 'Casa ampliada', 'Condomínio (4 aptos)', 'Prédio pequeno (8 aptos)', 'Prédio grande (20 aptos)'];
const real = (n) => Number(n || 0).toLocaleString('pt-BR');
function valorVenda(c) {
  if (c.tipo === 'apto') return 8000;
  if (c.tipo === 'unidade') return Math.floor((c.preco || 0) / 2);
  if (c.tipo !== 'terreno') return 20000;
  let v = 6000 + (VALOR_VENDA[c.modelo] || 0);
  for (let k = 1; k < (c.nivel || 1); k++) v += EVOLUIR[k - 1] / 2;
  return v;
}
const restaAluguel = (u) => { const ms = Date.parse(u.pago_ate) - ctx.agora(); return ms > 0 ? `${Math.floor(ms / 3600000)} h ${Math.floor((ms % 3600000) / 60000)} min` : 'vencido'; };
function desenharPorta(c) {
  const m = ctx.portaAtual?.();
  if (!m) { fechar(); return; }
  const eu = ctx.perfil().id, inquilino = m.inquilino === eu && m.dono !== eu, nv = m.nivel || 1;
  const nome = m.tipo === 'unidade' ? (inquilino ? 'Apartamento alugado' : 'Seu apartamento') : m.tipo === 'apto' ? 'Seu apartamento' : m.tipo === 'terreno' ? (m.modelo ? ESTAGIOS[nv] : 'Seu terreno') : 'Sua casa';
  $('janelaTitulo').textContent = m.rotulo || nome;
  const podeEvoluir = m.tipo === 'terreno' && m.modelo && nv < 5;
  c.innerHTML = `<p class="dica">${esc(nome)}. Você pode ter até 3 moradias (contando aluguéis), cada uma com cama e baú.</p>
    ${inquilino ? `<p class="dica">Aluguel: <b>${real(m.aluguel)}</b> por dia, cobrado sozinho da sua carteira. Pago por mais ${restaAluguel(m)}. Se faltar dinheiro na renovação, você sai e o baú volta para a mochila.</p>` : ''}
    <div class="botoes">${m.tipo !== 'terreno' || m.modelo ? '<button id="pEntrar">Entrar</button>' : ''}
      ${m.tipo === 'terreno' && nv < 3 ? `<button id="pConstruir">${m.modelo ? 'Trocar a casa' : 'Construir a casa'}</button>` : ''}
      ${m.tipo === 'terreno' && nv >= 3 ? '<button id="pGerenciar">Apartamentos e aluguéis</button>' : ''}</div>
    ${podeEvoluir ? `<div class="sub">Evoluir o imóvel</div>
      <p class="dica">Próximo: <b>${ESTAGIOS[nv + 1]}</b> por ${real(EVOLUIR[nv - 1])}.${nv + 1 >= 3 ? ' Você define o aluguel por dia ou o preço de venda de cada apartamento.' : ''}</p>
      <div class="botoes"><button id="pEvoluir">Evoluir</button></div>` : ''}
    <div class="sub">${inquilino ? 'Sair' : 'Vender'}</div>
    ${inquilino ? '<p class="dica">Ao sair, o que estiver no baú volta para a sua mochila.</p><div class="botoes"><button id="pSair" class="perigo">Sair do aluguel</button></div>'
      : `<p class="dica">Recebe <b>${real(valorVenda(m))}</b>. O que estiver no baú volta para a sua mochila.${m.tipo === 'terreno' && nv >= 3 ? ' Só dá para vender o prédio sem apartamentos vendidos ou alugados.' : ''}</p>
         <div class="botoes"><button id="pVender" class="perigo">Vender</button></div>`}`;
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  const confirmar = (id, fn) => on(id, () => { const b = $(id); if (!b.dataset.conf) { b.dataset.conf = '1'; b.textContent = 'Toque de novo para confirmar'; return; } fn(); });
  on('pEntrar', () => { fechar(); ctx.entrarMoradia(m); });
  on('pConstruir', () => abrir('terreno'));
  on('pGerenciar', () => abrir('gerenciar'));
  confirmar('pEvoluir', () => executar(() => rede.casas.evoluir(m.id), (n) => { ctx.casaVendida?.(); return `Imóvel evoluiu: ${ESTAGIOS[n]}!`; }));
  confirmar('pSair', () => executar(() => rede.casas.sairAluguel(m.id), () => { ctx.casaVendida?.(); fechar(); return 'Você saiu do aluguel.'; }));
  confirmar('pVender', () => executar(() => rede.casas.vender(m.id), (v) => { ctx.casaVendida?.(); fechar(); return `Vendido por ${real(v)}.`; }));
}

// dono do prédio: aluguel por dia e preço de venda de cada apartamento
function desenharGerenciar(c) {
  const p = ctx.portaAtual?.();
  if (!p || p.tipo !== 'terreno') { fechar(); return; }
  const us = ctx.unidadesDe(p.id), agora = ctx.agora();
  $('janelaTitulo').textContent = `${ESTAGIOS[p.nivel]} · apartamentos`;
  c.innerHTML = `<p class="dica">Deixe o aluguel vazio para não alugar e o preço vazio para não vender. O aluguel cai na sua carteira todo dia; a venda, na hora.</p>
    <div class="lista">${us.map((u, i) => {
      const alugado = u.inquilino && Date.parse(u.pago_ate) > agora;
      const estado = u.dono ? `vendido para ${esc(u.dono_perfil?.nome || '?')}` : alugado ? `alugado por ${esc(u.inquilino_perfil?.nome || '?')} · ${real(u.aluguel)}/dia` : u.aluguel || u.a_venda ? 'disponível' : 'vazio';
      return `<div class="linha"><b>Apto ${i + 1}</b> <small>${estado}</small>
        ${u.dono ? '' : `<div class="form linha-form"><input type="number" inputmode="numeric" placeholder="Aluguel/dia" data-al="${u.id}" value="${u.aluguel || ''}">
          <input type="number" inputmode="numeric" placeholder="Preço de venda" data-pv="${u.id}" value="${u.a_venda ? u.preco : ''}" ${alugado ? 'disabled' : ''}>
          <button data-salvar="${u.id}">Salvar</button></div>`}</div>`;
    }).join('')}</div>
    <div class="botoes"><button id="gVoltar">Voltar</button></div>`;
  c.querySelectorAll('[data-salvar]').forEach((b) => {
    b.onclick = () => {
      const id = Number(b.dataset.salvar), al = Number(c.querySelector(`[data-al="${id}"]`).value) || null, pv = Number(c.querySelector(`[data-pv="${id}"]`).value) || null;
      executar(() => rede.casas.definirUnidade(id, al, pv), () => { ctx.casaVendida?.(); return 'Apartamento atualizado.'; });
    };
  });
  $('gVoltar').onclick = () => abrir('porta');
}

// visitante na portaria: apartamentos para alugar ou comprar
function desenharPredio(c) {
  const p = ctx.predioAberto?.();
  if (!p) { fechar(); return; }
  const us = ctx.unidadesDe(p.id), agora = ctx.agora();
  const livres = us.filter((u) => !u.dono && !(u.inquilino && Date.parse(u.pago_ate) > agora) && (u.aluguel || u.a_venda));
  $('janelaTitulo').textContent = `${ESTAGIOS[p.nivel]} de ${p.dono_perfil?.nome || '?'}`;
  c.innerHTML = `<p class="dica">Moedas: <b>${moedas()}</b>. O aluguel é cobrado por dia, sozinho, enquanto você tiver dinheiro. Você pode ter até 3 moradias.</p>
    <div class="lista">${livres.length ? livres.map((u) => `<div class="linha item"><span class="nm"><b>Apto ${us.indexOf(u) + 1}</b>
      <small>${u.aluguel ? `aluguel ${real(u.aluguel)}/dia` : ''}${u.aluguel && u.a_venda ? ' · ' : ''}${u.a_venda ? `venda ${real(u.preco)}` : ''}</small></span>
      <span class="bts">${u.aluguel ? `<button data-alugar="${u.id}">Alugar</button>` : ''}${u.a_venda ? `<button data-comprar="${u.id}">Comprar</button>` : ''}</span></div>`).join('')
      : '<span class="vazio">Nenhum apartamento disponível agora.</span>'}</div>`;
  c.querySelectorAll('[data-alugar]').forEach((b) => { b.onclick = () => executar(() => rede.casas.alugar(Number(b.dataset.alugar)), () => { ctx.casaVendida?.(); fechar(); return 'Apartamento alugado! Toque na portaria para entrar.'; }); });
  c.querySelectorAll('[data-comprar]').forEach((b) => {
    b.onclick = () => { if (!b.dataset.conf) { b.dataset.conf = '1'; b.textContent = 'Confirmar'; return; }
      executar(() => rede.casas.comprarUnidade(Number(b.dataset.comprar)), () => { ctx.casaVendida?.(); fechar(); return 'Apartamento comprado! Toque na portaria para entrar.'; }); };
  });
}

function desenhar() {
  const c = $('janelaConteudo');
  if (modo === 'bau') { desenharBau(c); return; }
  if (modo === 'terreno') { desenharTerreno(c); return; }
  if (modo === 'visual') { desenharVisual(c); return; }
  if (modo === 'mercado') { desenharMercado(c); return; }
  if (modo === 'porta') { desenharPorta(c); return; }
  if (modo === 'gerenciar') { desenharGerenciar(c); return; }
  if (modo === 'predio') { desenharPredio(c); return; }
  if (modo === 'loja') {
    $('janelaTitulo').textContent = 'Loja';
    const venda = precos.filter((p) => p.compra != null);
    const compra = precos.filter((p) => p.venda != null);
    c.innerHTML = `<p class="dica">Você tem <b>${moedas()}</b> moedas.</p>
      <div class="botoes" style="margin-bottom:10px"><button id="lMercado">🤝 Mercado dos jogadores</button></div>
      <div class="sub">Comprar</div><div class="lista">${venda.map((p) => `
        <div class="linha item"><span class="ic">${ICONES[p.item] || '📦'}</span>
          <span class="nm"><b>${esc(p.nome)}</b><small>${p.compra} moedas${p.fome ? ` · enche ${p.fome}% da fome` : ''}${p.item === 'remedio' ? ' · cura 50 de vida' : ''}${p.item === 'desbloqueio' ? ' · libera os níveis 5, 10 e 15 de empresas e clãs' : ''}</small></span>
          <span class="bts"><button data-comprar="${p.item}" data-q="1">+1</button><button data-comprar="${p.item}" data-q="5">+5</button></span></div>`).join('')}</div>
      <div class="sub">Vender</div><div class="lista">${compra.map((p) => `
        <div class="linha item"><span class="ic">${ICONES[p.item] || '📦'}</span>
          <span class="nm"><b>${esc(p.nome)}</b><small>${p.venda} moedas cada · você tem ${inv[p.item] || 0}</small></span>
          <span class="bts"><button data-vender="${p.item}" data-q="1" ${inv[p.item] ? '' : 'disabled'}>1</button><button data-vender="${p.item}" data-q="${inv[p.item] || 0}" ${inv[p.item] ? '' : 'disabled'}>Todos</button></span></div>`).join('')}</div>`;
    $('lMercado').onclick = () => abrir('mercado');
    c.querySelectorAll('[data-comprar]').forEach((b) => { b.onclick = () => executar(() => rede.economia.comprar(b.dataset.comprar, Number(b.dataset.q)), `Comprado: ${b.dataset.q}x ${nomeDe(b.dataset.comprar)}.`); });
    c.querySelectorAll('[data-vender]').forEach((b) => { b.onclick = () => { const q = Number(b.dataset.q); if (q > 0) executar(() => rede.economia.vender(b.dataset.vender, q), (r) => `Vendido por ${r} moedas.`); }; });
  } else {
    $('janelaTitulo').textContent = 'Mochila';
    const itens = precos.filter((p) => inv[p.item] > 0);
    c.innerHTML = `<p class="dica">Vida: <b>${Math.round(ctx.vida?.() ?? 100)}</b> · Fome: <b>${Math.round(ctx.fome())}%</b> · Moedas: <b>${moedas()}</b></p>
      <div class="botoes" style="margin-bottom:10px"><button id="mVisual">👕 Personagem e nome</button><button id="mMercado">🤝 Mercado</button></div>
      <div class="lista">${itens.length ? itens.map((p) => `
        <div class="linha item"><span class="ic">${ICONES[p.item] || '📦'}</span>
          <span class="nm"><b>${esc(p.nome)}</b><small>${inv[p.item]} na mochila</small></span>
          <span class="bts">${p.fome ? `<button data-comer="${p.item}">Comer</button>` : ''}${p.item === 'remedio' ? '<button data-curar="1">Usar (+50 vida)</button>' : ''}</span></div>`).join('') : '<span class="vazio">Mochila vazia. Colete sucata no ferro-velho ou compre na loja.</span>'}</div>`;
    $('mVisual').onclick = () => abrir('visual');
    $('mMercado').onclick = () => abrir('mercado');
    c.querySelectorAll('[data-curar]').forEach((b) => {
      b.onclick = () => executar(async () => { if (!(await ctx.curar())) throw new Error('Sua vida já está cheia.'); }, 'Remédio usado: +50 de vida.');
    });
    c.querySelectorAll('[data-comer]').forEach((b) => {
      b.onclick = () => executar(async () => { const f = await rede.economia.consumir(b.dataset.comer); ctx.definirFome(Number(f)); return f; }, (f) => `Fome agora: ${Math.round(f)}%.`);
    });
  }
}
// personagens: 8 grátis, os outros comprados uma vez e usados quando quiser; trocar o nome custa 1.000
async function desenharVisual(c) {
  $('janelaTitulo').textContent = 'Personagem e nome';
  const p = ctx.perfil();
  let meus = [], evento = [];
  try { [meus, evento] = await Promise.all([rede.personagens.comprados(p.id), rede.personagens.evento().catch(() => [])]); } catch (e) { c.textContent = e.message; return; }
  if (modo !== 'visual') return;
  const ev = new Map((evento || []).map((x) => [x.id, x])), admin = p.cargo === 'admin', agora = Date.now();
  const aberto = (id) => { const x = ev.get(id); return x?.liberado_ate && Date.parse(x.liberado_ate) > agora; };
  const hora = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const algumAberto = PERSONAGENS_EVENTO.some((x) => aberto(x.id));
  const tem = (id) => PERSONAGENS_GRATIS.includes(id) || meus.includes(id);
  c.innerHTML = `<p class="dica">Moedas: <b>${moedas()}</b>. Personagem comprado fica seu para sempre: troque quando quiser, de graça.</p>
    <div class="sub">Nome</div>
    <div class="botoes"><input id="vNome" maxlength="16" value="${esc(p.nome)}"><button id="vNomeOk">Trocar nome (${PRECO_NOME.toLocaleString('pt-BR')})</button></div>
    <div class="sub">Personagens</div>
    <div class="grade pequena">${PERSONAGENS.map((x) => `<div class="carta"><img src="assets/miniaturas/${x.id}.webp" alt="" loading="lazy"><div>${esc(x.nome)}</div>
      ${p.personagem === x.id ? '<button class="acao em-uso" disabled>Em uso</button>'
        : tem(x.id) ? `<button class="acao" data-usar="${x.id}">Usar</button>`
        : `<button class="acao" data-comprar-p="${x.id}">🔒 ${PRECO_PERSONAGEM.toLocaleString('pt-BR')}</button>`}</div>`).join('')}</div>
    <div class="sub">✨ Personagens de evento</div>
    <p class="dica">${algumAberto ? '<b>Vitrine aberta!</b> Compre antes que feche.' : 'Só ficam à venda quando a administração abre a vitrine do evento. Fique de olho nos avisos.'}</p>
    <div class="grade pequena">${PERSONAGENS_EVENTO.map((x) => { const e = ev.get(x.id), meu = meus.includes(x.id) || admin;
      return `<div class="carta"><img src="assets/miniaturas/${x.id}.webp" alt="" loading="lazy"><div>${esc(x.nome)}</div>
      ${p.personagem === x.id ? '<button class="acao em-uso" disabled>Em uso</button>'
        : meu ? `<button class="acao" data-usar${admin ? '-adm' : ''}="${x.id}">Usar</button>`
        : aberto(x.id) ? `<button class="acao" data-comprar-p="${x.id}">✨ ${Number(e.preco).toLocaleString('pt-BR')}</button><small>até ${hora(e.liberado_ate)}</small>`
        : `<button class="acao" disabled>🔒 Fora da vitrine</button>`}</div>`; }).join('')}</div>`;
  $('vNomeOk').onclick = () => {
    const n = $('vNome').value.trim(), b = $('vNomeOk');
    if (!/^[\p{L}\p{N} _.-]{3,16}$/u.test(n)) { msg('Use de 3 a 16 letras, números, espaço, ponto, hífen ou _.', false); return; }
    if (!b.dataset.conf) { b.dataset.conf = '1'; b.textContent = 'Confirmar (1.000)'; return; }
    executar(() => rede.personagens.trocarNome(n), `Agora você se chama ${n}.`);
  };
  c.querySelectorAll('[data-usar]').forEach((b) => { b.onclick = () => executar(() => rede.personagens.usar(b.dataset.usar), 'Personagem trocado!'); });
  c.querySelectorAll('[data-usar-adm]').forEach((b) => { b.onclick = () => executar(() => rede.painel.skin(b.dataset.usarAdm), 'Personagem trocado!'); });
  c.querySelectorAll('[data-comprar-p]').forEach((b) => {
    b.onclick = () => { if (!b.dataset.conf) { b.dataset.conf = '1'; b.textContent = 'Confirmar'; return; }
      executar(() => rede.personagens.comprar(b.dataset.comprarP), 'Personagem comprado e em uso!'); };
  });
}
// mercado entre jogadores: comprar ofertas, anunciar itens da mochila, cancelar ofertas
let abaMercado = 'comprar', itemMercado = null;
async function desenharMercado(c) {
  $('janelaTitulo').textContent = 'Mercado dos jogadores';
  const eu = ctx.perfil();
  const abas = [['comprar', 'Comprar'], ['vender', 'Vender'], ['minhas', 'Minhas ofertas']]
    .map(([k, t]) => `<button data-am="${k}" class="${abaMercado === k ? 'sel' : ''}">${t}</button>`).join('');
  let corpo = '';
  try {
    if (abaMercado === 'comprar' && !itemMercado) {
      const r = await rede.mercado.resumo();
      corpo = `<p class="dica">Preço médio das últimas vendas e a tendência. 5% de cada venda vai para a prefeitura.</p><div class="lista">${r.map((x) => {
        const seta = x.medio && x.anterior ? (x.medio > x.anterior ? ' <span style="color:#7bd88f">▲</span>' : x.medio < x.anterior ? ' <span style="color:#ff8a80">▼</span>' : '') : '';
        return `<div class="linha item"><span class="ic">${ICONES[x.item] || '📦'}</span><span class="nm"><b>${esc(nomeDe(x.item))}</b>
          <small>${x.em_oferta > 0 ? `a partir de ${x.menor} · ${x.em_oferta} à venda` : 'nada à venda'}${x.medio ? ` · média ${x.medio}${seta}` : ''}</small></span>
          <span class="bts">${x.em_oferta > 0 ? `<button data-ver="${x.item}">Ver ofertas</button>` : ''}</span></div>`; }).join('')}</div>`;
    } else if (abaMercado === 'comprar') {
      const os = await rede.mercado.ofertas(itemMercado);
      corpo = `<div class="botoes" style="margin-bottom:8px"><button id="mVoltar">← Todos os itens</button></div><p class="dica">${ICONES[itemMercado] || '📦'} <b>${esc(nomeDe(itemMercado))}</b> · você tem ${moedas()} moedas.</p>
        <div class="lista">${os.length ? os.map((o) => `<div class="linha"><b>${o.preco} cada</b> <small>${o.qtd} disponível · ${esc(o.vendedor_perfil?.nome)}</small>
          ${o.vendedor === eu.id ? '<small> (sua)</small>' : `<div class="form linha-form"><input type="number" min="1" max="${o.qtd}" value="${Math.min(o.qtd, 1)}" data-q="${o.id}" inputmode="numeric"><button data-comprar-o="${o.id}">Comprar</button></div>`}</div>`).join('') : '<span class="vazio">Acabaram as ofertas.</span>'}</div>`;
    } else if (abaMercado === 'vender') {
      const itens = precos.filter((p) => inv[p.item] > 0);
      corpo = `<p class="dica">Os itens anunciados saem da mochila e voltam se você cancelar. Até 10 ofertas.</p><div class="lista">${itens.length ? itens.map((p) => `<div class="linha"><b>${ICONES[p.item] || '📦'} ${esc(p.nome)}</b> <small>você tem ${inv[p.item]}${p.venda ? ` · a loja paga ${p.venda}` : ''}</small>
        <div class="form linha-form"><input type="number" min="1" max="${inv[p.item]}" value="${inv[p.item]}" data-vq="${p.item}" inputmode="numeric" placeholder="Qtd">
          <input type="number" min="1" value="${Math.max(1, (p.venda || 10) + Math.ceil((p.venda || 10) * 0.3))}" data-vp="${p.item}" inputmode="numeric" placeholder="Preço"><button data-anunciar="${p.item}">Anunciar</button></div></div>`).join('') : '<span class="vazio">Mochila vazia.</span>'}</div>`;
    } else {
      const ms = await rede.mercado.minhas(eu.id);
      corpo = `<div class="lista">${ms.length ? ms.map((o) => `<div class="linha item"><span class="ic">${ICONES[o.item] || '📦'}</span><span class="nm"><b>${esc(nomeDe(o.item))}</b><small>${o.qtd} a ${o.preco} cada</small></span>
        <span class="bts"><button data-cancelar="${o.id}">Cancelar</button></span></div>`).join('') : '<span class="vazio">Você não tem ofertas.</span>'}</div>`;
    }
  } catch (e) { corpo = `<p class="erro">${esc(e.message)}</p>`; }
  if (modo !== 'mercado') return;
  c.innerHTML = `<div class="abas" style="padding:0 0 10px">${abas}</div>${corpo}`;
  c.querySelectorAll('[data-am]').forEach((b) => { b.onclick = () => { abaMercado = b.dataset.am; itemMercado = null; desenhar(); }; });
  c.querySelectorAll('[data-ver]').forEach((b) => { b.onclick = () => { itemMercado = b.dataset.ver; desenhar(); }; });
  const v = $('mVoltar'); if (v) v.onclick = () => { itemMercado = null; desenhar(); };
  c.querySelectorAll('[data-comprar-o]').forEach((b) => { b.onclick = () => { const id = Number(b.dataset.comprarO), q = Math.floor(Number(c.querySelector(`[data-q="${id}"]`).value));
    executar(() => rede.mercado.comprar(id, q), (t) => `Comprado por ${Number(t).toLocaleString('pt-BR')}.`); }; });
  c.querySelectorAll('[data-anunciar]').forEach((b) => { b.onclick = () => { const it = b.dataset.anunciar, q = Math.floor(Number(c.querySelector(`[data-vq="${it}"]`).value)), pr = Math.floor(Number(c.querySelector(`[data-vp="${it}"]`).value));
    executar(() => rede.mercado.criar(it, q, pr), `Anunciado: ${q}x ${nomeDe(it)} a ${pr}.`); }; });
  c.querySelectorAll('[data-cancelar]').forEach((b) => { b.onclick = () => executar(() => rede.mercado.cancelar(Number(b.dataset.cancelar)), 'Oferta cancelada; itens de volta na mochila.'); });
}
function nomeDe(item) { return precos.find((p) => p.item === item)?.nome || item; }
