// Janela da prefeitura (prefeito, eleição, outdoors, PRF) e da concessionária. Tudo é conferido no banco.
import * as rede from './rede.js';
import { cartao, carregarImagens } from './jornal.js';
import { CARROS, CORES_CARRO } from './civico.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const CICLO = 1920;

let ctx = null, modo = null, aba = 'prefeito';

export function iniciarGoverno(contexto) {
  ctx = contexto;
  $('fecharGoverno').onclick = fechar;
}
export function abrirPrefeitura(abaInicial = 'prefeito') { modo = 'prefeitura'; aba = abaInicial; mostrar(); }
export function abrirConcessionaria() { modo = 'concessionaria'; mostrar(); }
export function abrirServico(m) { modo = m; mostrar(); }
export function governoAberto() { return !!modo; }
export function atualizarGoverno() { if (modo && !digitando()) desenhar(); }
function mostrar() { $('governoJanela').classList.remove('oculto'); desenhar(); }
function fechar() { modo = null; $('governoJanela').classList.add('oculto'); }
const digitando = () => { const f = document.activeElement; return !!f && ['INPUT', 'SELECT', 'TEXTAREA'].includes(f.tagName) && $('governoJanela').contains(f); };
function msg(t, ok = true) { const m = $('governoMsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'erro'); clearTimeout(msg.t); msg.t = setTimeout(() => { m.textContent = ''; }, 4500); }
async function executar(fn, sucesso) {
  try { const r = await fn(); msg(typeof sucesso === 'function' ? sucesso(r) : sucesso); ctx.recarregar(); await desenhar(); }
  catch (e) { msg(e.message, false); }
}
const confirmar = (b, fn) => { if (!b.dataset.conf) { b.dataset.conf = '1'; b.textContent = 'Toque de novo para confirmar'; return; } fn(); };

async function desenhar() {
  const c = $('governoConteudo'), abas = $('governoAbas'), rolagem = c.scrollTop;
  try {
    if (modo === 'concessionaria') { abas.innerHTML = ''; $('governoTitulo').textContent = 'Concessionária'; await telaCarros(c); return; }
    if (SERVICOS[modo]) {
      abas.innerHTML = ''; $('governoTitulo').textContent = SERVICOS[modo][0]; await SERVICOS[modo][1](c); c.scrollTop = rolagem;
      c.querySelectorAll('[data-farda]').forEach((b) => { b.onclick = () => { fechar(); ctx.vestiario?.(); }; });   // vestiário do QG
      c.querySelectorAll('[data-treino]').forEach((b) => { b.onclick = () => { fechar(); ctx.treino?.(); }; });
      return;
    }
    $('governoTitulo').textContent = 'Prefeitura';
    abas.innerHTML = [['prefeito', 'Prefeito'], ['eleicao', 'Eleição'], ['outdoors', 'Outdoors'], ['prf', 'PRF']]
      .map(([k, t]) => `<button data-aba="${k}" class="${aba === k ? 'sel' : ''}">${t}</button>`).join('');
    abas.querySelectorAll('button').forEach((b) => { b.onclick = () => { aba = b.dataset.aba; desenhar(); }; });
    const pf = await rede.prefeitura.estado();
    if (aba === 'prefeito') telaPrefeito(c, pf);
    else if (aba === 'eleicao') await telaEleicao(c, pf);
    else if (aba === 'outdoors') await telaOutdoors(c);
    else await telaPrf(c, pf);
    c.scrollTop = rolagem;
  } catch (e) { c.textContent = e.message; }
}

function tempoMandato(pf) {
  const ciclo = Math.floor(ctx.agora() / 1000 / CICLO), fim = (pf.mandato + 1) * 20;
  const min = Math.max(0, Math.round((fim * CICLO - ctx.agora() / 1000) / 60));
  return { ciclos: Math.max(0, fim - ciclo), min, campanha: ciclo % 20 >= 16 };
}

function telaPrefeito(c, pf) {
  const eu = ctx.perfil(), souPrefeito = pf.prefeito === eu.id, t = tempoMandato(pf);
  const clas = ctx.clas(), terr = ctx.territorios();
  c.innerHTML = `<div class="cartoes"><div><small>Prefeito</small><b>${pf.prefeito ? esc(pf.prefeito_perfil?.nome || '?') : 'vago'}</b></div>
      <div><small>Fim do mandato</small><b>${t.ciclos} ciclos (${Math.floor(t.min / 60)} h ${t.min % 60} min)</b></div>
      <div><small>Cofre</small><b>${num(pf.cofre)}</b></div><div><small>Salário da polícia</small><b>${pf.salario_policia}/3 min</b></div></div>
    ${pf.prefeito ? '' : `<p class="dica">Prefeitura vaga${pf.motivo ? ` (${esc(pf.motivo)})` : ''}. Com a prefeitura vaga a campanha fica aberta e, a cada virada de dia, o candidato mais votado assume.</p>`}
    <p class="dica">O prefeito governa por 20 ciclos de dia e noite e recebe <b>9.500 por ciclo em que joga</b>. Ele mora na residência oficial (porta lateral), usa o carro presidencial e define o salário da polícia. Pode renunciar quando quiser.</p>
    ${souPrefeito ? `<div class="sub">Governo</div>
      <div class="botoes"><input id="gSal" type="number" min="50" max="250" value="${pf.salario_policia}" inputmode="numeric"><button id="gSalOk">Definir salário da polícia</button></div>
      <div class="sub">Seguranças (podem algemar)</div>
      <p class="dica">Até 2 jogadores de confiança. Eles usam algemas como a polícia. Deixe o nome vazio para tirar.</p>
      ${[1, 2].map((k) => `<div class="botoes"><input id="gSeg${k}" placeholder="Nome do jogador" value="${esc(pf['seg' + k]?.nome || '')}"><button data-seg="${k}">Salvar ${k}º segurança</button></div>`).join('')}
      <div class="sub">Obras e eventos (gastos legais do cofre)</div>
      <p class="dica">Tudo o que você faz fica no computador da PRF. Transferências do cofre aparecem com o destino em sigilo bancário.</p>
      <div class="form linha-form"><select id="gGastoTipo"><option value="obra">🏗️ Obra pública</option><option value="evento">🎉 Evento na praça</option><option value="bonus">🎖️ Bônus aos servidores em serviço</option></select>
        <input id="gGasto" type="number" min="100" placeholder="Valor do cofre" inputmode="numeric"><button id="gGastoOk">Pagar do cofre</button></div>
      <div class="sub" style="color:#ff8a80">Favores a clãs (crime eleitoral)</div>
      <p class="aviso-item">⚠️ Isto é ilegal. A transferência fica no computador da PRF em sigilo bancário; se a PRF quebrar o sigilo, você perde o mandato e vira procurado.</p>
      <div class="form linha-form"><select id="gCla">${clas.map((k) => `<option value="${k.id}">${esc(k.nome)}</option>`).join('')}</select>
        <input id="gVerba" type="number" min="1" placeholder="Valor do cofre" inputmode="numeric"><button id="gVerbaOk">Repassar verba</button></div>
      <div class="form linha-form"><select id="gTerr">${terr.map((k) => `<option value="${k.id}">${esc(k.nome)}</option>`).join('')}</select><button id="gTerrOk">Entregar território ao clã</button></div>
      <div class="botoes" style="margin-top:12px"><button id="gRenuncia" class="perigo">Renunciar ao mandato</button></div>` : ''}`;
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('gSalOk', () => executar(() => rede.prefeitura.salarioPolicia(Math.floor(Number($('gSal').value))), 'Salário da polícia atualizado.'));
  c.querySelectorAll('[data-seg]').forEach((b) => { b.onclick = () => { const k = Number(b.dataset.seg), nome = $('gSeg' + k).value.trim(); executar(() => rede.algemas.seguranca(k, nome), nome ? `${nome} agora é seu segurança.` : 'Segurança removido.'); }; });
  on('gGastoOk', () => { const tipo = $('gGastoTipo').value, v = Math.floor(Number($('gGasto').value)); if (v > 0) confirmar($('gGastoOk'), () => executar(() => rede.prefeitura.gasto(tipo, v), (r) => (tipo === 'bonus' ? `Bônus pago: ${num(r)} para cada servidor em serviço.` : `Pago do cofre: ${num(v)}.`))); });
  on('gVerbaOk', () => { const b = $('gVerbaOk'); confirmar(b, () => executar(() => rede.prefeitura.verba(Number($('gCla').value), Math.floor(Number($('gVerba').value))), 'Verba repassada... discretamente.')); });
  on('gTerrOk', () => { const b = $('gTerrOk'); confirmar(b, () => executar(() => rede.prefeitura.territorio($('gTerr').value, Number($('gCla').value)), 'Território entregue ao clã.')); });
  on('gRenuncia', () => { const b = $('gRenuncia'); confirmar(b, () => executar(() => rede.prefeitura.renunciar(), 'Você renunciou. A prefeitura está vaga.')); });
}

async function telaEleicao(c, pf) {
  const m = await rede.prefeitura.campanha();
  const eu = ctx.perfil();
  if (m === null || m === undefined) {
    const t = tempoMandato(pf), falta = Math.max(0, t.ciclos - 4);
    c.innerHTML = `<p class="dica">A campanha abre nos últimos 4 ciclos do mandato: faltam <b>${falta} ciclos</b> (cerca de ${Math.round(falta * 32 / 60)} h). Quem tiver crimes não pode se candidatar.</p>`;
    return;
  }
  const [cands, voto] = await Promise.all([rede.prefeitura.candidatos(m), rede.prefeitura.meuVoto(m)]);
  const souCand = cands.some((k) => k.jogador === eu.id);
  const extra = pf.eleicao_ate && Date.parse(pf.eleicao_ate) > Date.now();
  c.innerHTML = `<p class="dica">${extra ? `🗳️ <b>Eleição extraordinária</b> convocada pela administração: a apuração é às <b>${new Date(pf.eleicao_ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b> e o mais votado assume até o fim do mandato.` : `Campanha aberta${pf.prefeito ? ' para o próximo mandato' : ' (prefeitura vaga)'}.`} Cada jogador tem 1 voto e pode mudar até a apuração. Anuncie nos outdoors da cidade!</p>
    <div class="lista">${cands.length ? cands.map((k, i) => `<div class="linha item"><span class="ic">${['🥇', '🥈', '🥉'][i] || '🗳'}</span>
      <span class="nm"><b>${esc(k.perfil?.nome)}</b><small>${esc(k.slogan) || 'sem slogan'} · ${k.votos} voto${k.votos === 1 ? '' : 's'}</small></span>
      <span class="bts">${voto === k.jogador ? '<small>✔ seu voto</small>' : `<button data-votar="${k.jogador}">Votar</button>`}</span></div>`).join('') : '<span class="vazio">Nenhum candidato ainda.</span>'}</div>
    ${souCand ? '<p class="dica">Você é candidato. Alugue outdoors na aba ao lado.</p>' : `<div class="sub">Candidatar-se (5.000)</div>
      <div class="botoes"><input id="eSlogan" maxlength="60" placeholder="Seu slogan"><button id="eCand">Registrar candidatura</button></div>`}`;
  c.querySelectorAll('[data-votar]').forEach((b) => { b.onclick = () => executar(() => rede.prefeitura.votar(b.dataset.votar), 'Voto registrado!'); });
  const bc = $('eCand'); if (bc) bc.onclick = () => executar(() => rede.prefeitura.candidatar($('eSlogan').value.trim()), 'Candidatura registrada! Boa campanha.');
}

async function telaOutdoors(c) {
  const lista = await rede.prefeitura.outdoors(), agora = Date.now(), eu = ctx.perfil();
  const empresas = ctx.minhasEmpresas();
  const LUGAR = { 1: 'Praça da Estação Norte', 2: 'Praça da Estação Sul', 3: 'Prefeitura', 4: 'Concessionária', 5: 'Praça do Contratante (norte)', 6: 'Praça do Contratante (sul)', 7: 'Vila Serra', 8: 'Porto Sul' };
  c.innerHTML = `<p class="dica">Outdoors custam <b>40 moedas por minuto</b> (10 min a 4 h) e o dinheiro vai para o cofre da prefeitura. Candidatos fazem campanha; empresas fazem propaganda.</p>
    <div class="lista">${lista.map((o) => { const ativo = o.ate && Date.parse(o.ate) > agora, meu = ativo && o.anunciante === eu.id;
      return `<div class="linha"><b>${LUGAR[o.id] || 'Outdoor ' + o.id}</b> <small>${ativo ? `${esc(o.titulo)} · até ${new Date(o.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'livre'}</small>
        ${!ativo || meu ? `<div class="form linha-form"><select data-tipo="${o.id}"><option value="candidato">Campanha</option>${empresas.map((e) => `<option value="e${e.id}">${esc(e.nome)}</option>`).join('')}</select>
          <select data-min="${o.id}"><option value="10">10 min</option><option value="30">30 min</option><option value="60">1 h</option><option value="120">2 h</option><option value="240">4 h</option></select>
          <input data-txt="${o.id}" maxlength="50" placeholder="Frase do anúncio"><button data-alugar="${o.id}">${meu ? 'Estender' : 'Alugar'}</button></div>` : ''}</div>`; }).join('')}</div>`;
  c.querySelectorAll('[data-alugar]').forEach((b) => {
    b.onclick = () => {
      const id = Number(b.dataset.alugar), tipo = c.querySelector(`[data-tipo="${id}"]`).value, min = Number(c.querySelector(`[data-min="${id}"]`).value);
      const texto = c.querySelector(`[data-txt="${id}"]`).value.trim();
      const empresa = tipo.startsWith('e') ? Number(tipo.slice(1)) : null;
      executar(() => rede.prefeitura.alugarOutdoor(id, min, empresa ? 'empresa' : 'candidato', empresa, texto), `Anúncio no ar por ${min} min (${num(min * 40)}).`);
    };
  });
}

async function telaPrf(c, pf) {
  const eu = ctx.perfil();
  const topo = `<p class="dica">A <b>PRF</b> é a polícia eleitoral: não obedece ao prefeito e paga <b>120 a cada 3 min</b> de serviço. No <b>🖥️ computador da PRF</b> aparecem todos os gastos do prefeito. As transferências do cofre ficam em <b>sigilo bancário</b>: peça a quebra do sigilo (a Justiça leva 3 min e você precisa continuar em serviço; 1 pedido a cada 10 min). Se o dinheiro foi para um clã, o prefeito é cassado e vira procurado (+3.000).</p>
    <p class="dica">Quem tem crimes, é de clã, é policial ou é o prefeito não entra.</p>
    <div class="botoes">${eu.prf ? '<button id="pSair" class="perigo">Sair de serviço</button>' : '<button id="pEntrar">Entrar em serviço na PRF</button>'}</div>`;
  let comp = '';
  if (eu.prf) {
    try {
      const d = await rede.prf.computador(), agora = ctx.agora();
      const prox = d.proximo_pedido && Date.parse(d.proximo_pedido) > agora ? Math.ceil((Date.parse(d.proximo_pedido) - agora) / 60000) : 0;
      const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      comp = `<div class="sub">🖥️ Computador da PRF · gastos do prefeito</div>
        <p class="dica">Prefeito: <b>${esc(d.prefeito || 'vago')}</b> · Cofre: <b>${num(d.cofre)}</b>${prox ? ` · seu próximo pedido de quebra em ${prox} min` : ''}</p>
        ${d.gastos.length ? `<div class="lista">${d.gastos.map((g) => {
          let acao = '';
          if (g.sigiloso && !g.destino) {
            if (g.pedido) {
              const falta = Math.ceil((Date.parse(g.pedido.pronto) - agora) / 1000);
              acao = g.pedido.meu ? (falta > 0 ? `<small>⚖️ Justiça analisando… ${falta} s</small>` : `<button data-ver="${g.pedido.id}">📄 Ver resultado</button>`) : '<small>⚖️ outro agente pediu a quebra</small>';
            } else acao = `<button data-quebrar="${g.id}"${prox ? ' disabled' : ''}>🔓 Quebrar sigilo</button>`;
          }
          return `<div class="linha item"><span class="ic">${g.sigiloso ? (g.destino ? '🔓' : '🔒') : '🧾'}</span><span class="nm"><b>${esc(g.descricao)}${g.valor ? ` · ${num(g.valor)}` : ''}</b><small>${hora(g.criado)} · ${esc(g.quem || '')} · ${g.sigiloso ? (g.destino ? `destino: ${esc(g.destino)}` : 'destino: SIGILO BANCÁRIO') : 'público'}</small></span><span class="bts">${acao}</span></div>`;
        }).join('')}</div>` : '<p class="dica">Nenhum gasto registrado neste mandato.</p>'}`;
    } catch (e) { comp = `<p class="aviso-item">${esc(e.message)}</p>`; }
  }
  c.innerHTML = topo + comp + (pf.prefeito ? '' : '<p class="dica">Sem prefeito no cargo agora.</p>');
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('pEntrar', () => executar(() => rede.prf.entrar(), 'Você está em serviço na PRF.'));
  on('pSair', () => executar(() => rede.prf.sair(), (v) => `Saiu de serviço.${v ? ` +${num(v)}` : ''}`));
  c.querySelectorAll('[data-quebrar]').forEach((b) => { b.onclick = () => confirmar(b, () => executar(() => rede.prf.pedirSigilo(Number(b.dataset.quebrar)), '⚖️ Pedido enviado à Justiça: resultado em 3 min. Fique em serviço.')); });
  c.querySelectorAll('[data-ver]').forEach((b) => { b.onclick = () => executar(() => rede.prf.verSigilo(Number(b.dataset.ver)), (r) => (r.resultado === 'cassado' ? `🚨 PROVA! ${r.destino}. O prefeito foi cassado e está procurado. +3.000`
    : r.resultado === 'ex-prefeito' ? `🚨 PROVA contra o ex-prefeito: ${r.destino}. Ele está procurado. +3.000` : r.resultado === 'ja provado' ? `Destino: ${r.destino} (o crime já tinha sido provado).` : `Tudo legal: ${r.destino}.`)); });
}

async function telaCarros(c) {
  const meus = ctx.meusCarros();
  c.innerHTML = `<p class="dica">Moedas: <b>${num(ctx.perfil().moedas)}</b>. Até 3 carros por jogador. O carro novo fica estacionado aqui na frente: chegue perto e toque em <b>Dirigir</b>. Ele fica onde você descer.</p>
    <div class="sub">Cor</div><div class="cores">${CORES_CARRO.map((k, i) => `<button data-cor="${k}" class="${i === 0 ? 'sel' : ''}" style="background:${k}"></button>`).join('')}</div>
    <div class="lista">${['popular', 'suv', 'esportivo', 'classico', 'helicoptero'].map((m) => `<div class="linha item"><span class="nm"><b>${CARROS[m].nome}</b><small>${num(CARROS[m].preco)} · até ${Math.round(CARROS[m].vel * 3.6)} km/h</small></span>
      <span class="bts"><button data-carro="${m}">Comprar</button></span></div>`).join('')}</div>
    <div class="sub">Seus carros</div>
    <div class="lista">${meus.length ? meus.map((k) => `<div class="linha item"><span class="nm"><b style="color:${esc(k.cor)}">■</b> <b>${CARROS[k.modelo]?.nome}</b><small>${k.modelo === 'presidencial' ? 'do cargo de prefeito' : `vende por ${num(CARROS[k.modelo].preco / 2)}`}</small></span>
      <span class="bts">${k.queimado ? `<button data-consertar="${k.id}">🔧 Consertar (5.000)</button>` : ''}${k.modelo === 'presidencial' ? '' : `<button data-vender="${k.id}">Vender</button>`}</span></div>`).join('') : '<span class="vazio">Nenhum carro.</span>'}</div>`;
  let cor = CORES_CARRO[0];
  c.querySelectorAll('[data-cor]').forEach((b) => { b.onclick = () => { cor = b.dataset.cor; c.querySelectorAll('[data-cor]').forEach((x) => x.classList.toggle('sel', x === b)); }; });
  c.querySelectorAll('[data-carro]').forEach((b) => { b.onclick = () => confirmar(b, () => executar(() => rede.carros.comprar(b.dataset.carro, cor), 'Carro comprado! Ele está estacionado na frente da loja.')); });
  c.querySelectorAll('[data-vender]').forEach((b) => { b.onclick = () => confirmar(b, () => executar(() => rede.carros.vender(Number(b.dataset.vender)), (v) => `Vendido por ${num(v)}.`)); });
  c.querySelectorAll('[data-consertar]').forEach((b) => { b.onclick = () => confirmar(b, () => executar(() => rede.consertarCarro(Number(b.dataset.consertar)), 'Carro consertado: pode dirigir de novo.')); });
}

// ---------------------------------------------------------------- banco, empregos, hospital e bombeiros
const inteiro = (id) => Math.floor(Number($(id)?.value) || 0);
const FUNCOES = { operario: 'Operário', motorista: 'Motorista', seguranca: 'Segurança', gerente: 'Gerente' };
const SERVICOS = {
  banco: ['Banco Central', telaBanco],
  empregos: ['Agência de Empregos', telaEmpregos],
  hospital: ['Hospital', telaHospital],
  bombeiros: ['Quartel dos Bombeiros', telaBombeiros],
  veiculos: ['Meus veículos', telaVeiculos],
  jornal: ['📰 Jornal da Cidade', telaJornal],
  amigos: ['👥 Amigos', telaAmigos],
  conta: ['⚙️ Conta e segurança', telaConta],
  trabalho: ['💼 Seu trabalho', telaTrabalho],
  taxi: ['Carona: para onde?', telaTaxi],
  onibus: ['🚌 Rodoviária', telaOnibus],
  piloto: ['🛩️ Hangar dos pilotos', telaPiloto],
  torre: ['🗼 Torre de controle', telaTorre],
  fiscal: ['🧾 Fiscalização da Rodoviária', telaFiscal],
  lixo: ['♻️ Central de Reciclagem', telaLixo],
  mecanico: ['🔧 Oficina do hangar', telaMecanico],
};

// parcela da tabela Price (igual ao servidor)
const parcelaPrice = (v, n, i) => Math.ceil(v * i / (1 - Math.pow(1 + i, -n)));
const taxaFin = (f, n) => Math.round((f.cond.base + 0.1 * (n - 2) + f.extra) * 100) / 10000;
function blocoFinanciamento(f) {
  const estrelas = '★'.repeat(f.nivel) + '☆'.repeat(5 - f.nivel);
  const topo = `<div class="sub">Financiamento parcelado</div>
    <p class="dica">Seu crédito: <b>${estrelas}</b> (nível ${f.nivel}) · até <b>${num(f.cond.limite)}</b> em até <b>${f.cond.max}×</b>.
    Uma parcela a cada <b>64 min</b>, cobrada da poupança e depois da carteira. Mais parcelas = mais juros.
    ${f.restrito ? '<br>⚠️ Crédito restrito por atraso: +2% de juros e são 2 financiamentos em dia para subir cada nível.' : '<br>Quitou sem atrasar (e usou pelo menos metade do prazo)? Seu crédito sobe de nível.'}</p>`;
  const x = f.fin;
  if (!x) return topo + `<div class="botoes"><input id="fValor" type="number" min="1000" max="${f.cond.limite}" placeholder="Valor" inputmode="numeric">
      <select id="fN">${Array.from({ length: f.cond.max - 1 }, (_, k) => k + 2).map((n) => `<option value="${n}"${n === Math.min(10, f.cond.max) ? ' selected' : ''}>${n}×</option>`).join('')}</select></div>
    <p class="dica" id="fSim">Digite o valor para ver a simulação.</p>
    <div class="botoes"><button id="fPegar">Financiar</button></div>`;
  const prox = Math.max(0, Math.round((Date.parse(x.proxima) - Date.now()) / 60000));
  return topo + `<div class="cartoes"><div><small>Parcelas</small><b>${x.pagas}/${x.n}</b></div><div><small>Parcela</small><b>${num(x.parcela)}</b></div>
      <div><small>Juros</small><b>${(x.taxa * 100).toFixed(1).replace('.', ',')}%</b></div><div><small>Em atraso</small><b>${num(x.atraso)}</b></div></div>
    ${x.inadimplente ? `<p class="aviso-item">⚠️ INADIMPLENTE: o atraso cresce 3% a cada 64 min e o banco tira da poupança e de metade da carteira. Acerte para voltar a ter crédito.</p>
      <div class="botoes"><input id="fAtr" type="number" min="1" value="${x.atraso}" inputmode="numeric"><button id="fPagAtr">Pagar atraso</button></div>`
    : `<p class="dica">${x.pagas < x.n ? `Próxima parcela em ${prox} min.` : ''} Quitar hoje (sem os juros que ainda não correram): <b>${num(x.quitar)}</b>.</p>
      <div class="botoes">${x.pagas < x.n ? '<button id="fAdiantar">Adiantar 1 parcela</button>' : ''}<button id="fQuitar">Quitar tudo</button></div>`}`;
}
async function telaBanco(c) {
  const [b, f] = await Promise.all([rede.banco.estado(), rede.banco.financiamento().catch(() => null)]);
  const faltam = b.vence_ciclo != null ? b.vence_ciclo - b.ciclo : null;
  c.innerHTML = `<div class="cartoes"><div><small>Carteira</small><b>${num(b.carteira)}</b></div><div><small>Poupança</small><b>${num(b.saldo)}</b></div>
      <div><small>Rendeu até hoje</small><b>${num(b.rendeu)}</b></div><div><small>Dívida</small><b>${num(b.divida)}</b></div></div>
    ${b.negativado ? '<p class="aviso-item">⚠️ Empréstimo vencido: o banco cobra da poupança e da carteira até quitar.</p>' : ''}
    <div class="sub">Poupança</div>
    <p class="dica">Rende <b>1% por ciclo</b> de dia e noite (sobre até 200.000). Dinheiro guardado aqui não se perde quando você morre.</p>
    <div class="botoes"><input id="bValor" type="number" min="1" placeholder="Valor" inputmode="numeric"><button id="bDep">Depositar</button><button id="bSaq">Sacar</button></div>
    <div class="sub">Empréstimo</div>
    ${b.divida > 0 ? `<p class="dica">Você deve <b>${num(b.divida)}</b>${faltam != null ? (faltam > 0 ? `, vence em ${faltam} ciclo${faltam === 1 ? '' : 's'}` : ', já venceu') : ''}.</p>
      <div class="botoes"><input id="bPag" type="number" min="1" value="${b.divida}" inputmode="numeric"><button id="bPagar">Pagar</button></div>`
    : `<p class="dica">De 500 a ${num(b.limite)}, com <b>10% de juros</b> e prazo de 3 ciclos. Depois do prazo o banco cobra sozinho.</p>
      <div class="botoes"><input id="bEmp" type="number" min="500" max="${b.limite}" placeholder="Valor" inputmode="numeric"><button id="bPegar">Pegar empréstimo</button></div>`}
    ${f ? blocoFinanciamento(f) : ''}`;
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('bDep', () => { const v = inteiro('bValor'); if (v > 0) executar(() => rede.banco.depositar(v), `Depositado: ${num(v)}.`); });
  on('bSaq', () => { const v = inteiro('bValor'); if (v > 0) executar(() => rede.banco.sacar(v), `Sacado: ${num(v)}.`); });
  on('bPagar', () => { const v = inteiro('bPag'); if (v > 0) executar(() => rede.banco.pagar(v), (r) => (r > 0 ? `Pago. Ainda deve ${num(r)}.` : 'Empréstimo quitado!')); });
  on('bPegar', () => { const v = inteiro('bEmp'); if (v > 0) executar(() => rede.banco.emprestimo(v), (t) => `Você recebeu ${num(v)}. Vai pagar ${num(t)}.`); });
  if (!f) return;
  const sim = () => {
    const el = $('fSim'); if (!el) return;
    const v = inteiro('fValor'), n = Number($('fN').value), i = taxaFin(f, n);
    if (v < 1000 || v > f.cond.limite) { el.innerHTML = `Valor de 1.000 a ${num(f.cond.limite)}.`; return; }
    const p = parcelaPrice(v, n, i);
    el.innerHTML = `${n}× de <b>${num(p)}</b> (juros de ${(i * 100).toFixed(1).replace('.', ',')}% por parcela) · total <b>${num(p * n)}</b>, juros ${num(p * n - v)}. A primeira vence em 64 min.`;
  };
  if ($('fValor')) { $('fValor').oninput = sim; $('fN').onchange = sim; }
  on('fPegar', (ev) => { const v = inteiro('fValor'), n = Number($('fN').value); if (v > 0) confirmar(ev.currentTarget, () => executar(() => rede.banco.financiar(v, n), (p) => `🏦 Você recebeu ${num(v)}: ${n}× de ${num(p)}, uma a cada 64 min.`)); });
  on('fPagAtr', () => { const v = inteiro('fAtr'); if (v > 0) executar(() => rede.banco.pagarFin('atraso', v), 'Atraso pago.'); });
  on('fAdiantar', () => executar(() => rede.banco.pagarFin('parcela'), (r) => (r > 0 ? `Parcela adiantada. Faltam ${r}.` : '🏦 Financiamento quitado!')));
  on('fQuitar', (ev) => confirmar(ev.currentTarget, () => executar(() => rede.banco.pagarFin('quitar'), '🏦 Financiamento quitado!')));
}

// serviço público: polícia, PRF, hospital, bombeiros e jornal (ficha limpa; entra na hora)
const PUBLICOS = [
  { id: 'policia', nome: '🚓 Polícia', inicio: 'Soldado', req: 'ficha limpa', onde: 'Delegacia', base: 'salário definido pelo prefeito' },
  { id: 'prf', nome: '🛡 PRF · Polícia Eleitoral', inicio: 'Agente', req: 'ficha limpa, sem clã e sem ser prefeito', onde: 'Prefeitura', base: '40/min' },
  { id: 'medico', nome: '✚ Hospital', inicio: 'Socorrista', req: 'ficha limpa e carteira B (autoescola)', onde: 'Hospital', base: '30/min' },
  { id: 'bombeiro', nome: '🚒 Bombeiros', inicio: 'Recruta', req: 'ficha limpa e carteira C (autoescola)', onde: 'Quartel dos Bombeiros', base: '30/min' },
  { id: 'jornalista', nome: '📰 Jornal da Cidade', inicio: 'Estagiário', req: 'ficha limpa', onde: 'Prefeitura (balcão do jornal)', base: '24/min' },
  { id: 'motorista', nome: '🚌 Ônibus (motorista)', inicio: 'Motorista', req: 'ficha limpa e carteira D (autoescola)', onde: 'Rodoviária (Despacho)', base: '18/min + 12 por passageiro' },
  { id: 'piloto', nome: '✈️ Piloto de avião', inicio: 'Copiloto', req: 'ficha limpa e brevê (autoescola)', onde: 'Hangar do Aeroporto da Metrópole', base: '30/min + 250 a 600 por voo' },
  { id: 'gari', nome: '♻️ Coleta de lixo (gari)', inicio: 'Gari', req: 'ficha limpa e carteira C (autoescola)', onde: 'Central de Reciclagem (leste do centro)', base: '22/min + 15 por lixeira e 100 por descarga' },
  { id: 'fiscal', nome: '🧾 Fiscal da Rodoviária', inicio: 'Fiscal', req: 'ficha limpa', onde: 'Rodoviária (Fiscalização)', base: '20/min + 30 por atraso registrado' },
  { id: 'mecanico', nome: '🔧 Mecânico de aviões', inicio: 'Ajudante', req: 'ficha limpa', onde: 'Hangar do Aeroporto da Metrópole (mecânico)', base: '+300 por revisão de avião' },
  { id: 'controlador', nome: '🗼 Controlador de voo', inicio: 'Controlador Trainee', req: 'ficha limpa', onde: 'Torre do Aeroporto da Metrópole', base: '26/min + 40 por autorização' },
  { id: 'exercito', nome: '🎖️ Exército', inicio: 'Recruta', req: 'ficha limpa (a equipe também pode entrar)', onde: 'Quartel do Exército (Porto Sul)', base: '35/min' },
];
const servicoAtual = (eu) => (eu.policial ? 'policia' : eu.prf ? 'prf' : eu.profissao || null);
async function sairDoServico(eu) {
  if (eu.policial) await rede.policia.sair();
  else if (eu.prf) await rede.prf.sair();
  else if (eu.profissao) await rede.saude.sair();
}
async function entrarNoServico(id) {
  const eu = ctx.perfil();
  if (servicoAtual(eu) && servicoAtual(eu) !== id) await sairDoServico(eu);
  if (id === 'policia') await rede.policia.entrar();
  else if (id === 'prf') await rede.prf.entrar();
  else await rede.saude.entrar(id);
  const l = ctx.locaisTrabalho?.()[id]; if (l) ctx.rastrear?.({ nome: `Trabalho: ${PUBLICOS.find((x) => x.id === id).onde}`, x: l.x, z: l.z });
}
// quadro "seu trabalho" (usado na Agência e no botão 💼 Trabalho)
async function quadroTrabalho() {
  const eu = ctx.perfil();
  const [meu, carreiras] = await Promise.all([rede.empregos.meu(eu.id).catch(() => null), rede.carreiras.minhas().catch(() => [])]);
  const atual = servicoAtual(eu), pub = PUBLICOS.find((x) => x.id === atual), car = (carreiras || []).find((x) => x.carreira === atual);
  const souDono = meu && meu.emp?.dono === eu.id;
  let h = '';
  if (pub) h += `<div class="linha item"><span class="ic">🎖️</span><span class="nm"><b>${pub.nome} · ${esc(car?.nome || pub.inicio)}</b>
      <small>${car ? `${Math.floor(car.minutos / 60)}h${String(car.minutos % 60).padStart(2, '0')} em serviço · ${car.proximo ? `${esc(car.proximo)} em ${car.falta} min` : 'topo da carreira'}` : 'recém-contratado'} · trabalha em: ${pub.onde}</small></span>
      <span class="bts"><button data-rastrear="${atual}">📍 Ir</button><button data-sairpub="1">Sair</button></span></div>`;
  if (meu && !souDono) h += `<div class="linha item"><span class="ic">💼</span><span class="nm"><b>${esc(meu.emp?.nome)} · ${FUNCOES[meu.funcao] || meu.funcao}</b>
      <small>${num(meu.salario)}/min · ${num(meu.minutos)} min trabalhados${meu.ponto_em && Date.now() - Date.parse(meu.ponto_em) < 150000 ? ' · 🟢 trabalhando agora' : ' · fique perto da empresa para bater ponto'}</small></span>
      <span class="bts"><button data-irempresa="${meu.empresa}">📍 Ir</button><button data-demissao="1" class="perigo">Demissão</button></span></div>`;
  if (souDono) h += `<div class="linha item"><span class="ic">🏢</span><span class="nm"><b>Dono da ${esc(meu.emp?.nome)}</b><small>Anuncie vagas na tela da empresa › Equipe.</small></span></div>`;
  if (atual === 'exercito') h += await blocoExercito(car);
  else if (eu.cargo === 'admin') h += await blocoExercito(null);
  return h ? `<div class="lista">${h}</div>` : '<p class="dica">Você está sem trabalho. Escolha uma vaga abaixo: a contratação é na hora.</p>';
}
// Exército: veículos e, para Tenente para cima, as ordens de caçada aos procurados
async function blocoExercito(car) {
  const cmd = ctx.perfil().cargo === 'admin' || (car?.nivel || 0) >= 8;
  let h = `<div class="botoes"><button data-farda="1">👔 Vestiário (farda)</button><button data-treino="1">🏋️ Centro de treinamento</button></div><div class="linha"><small>🚙 Jipe (3 passageiros), 🚚 caminhão (8) e 🚁 helicóptero (6, só Tenente para cima pilota) ficam no quartel, em Porto Sul. São ilimitados: chegue perto e toque em Dirigir. Militares embarcam como passageiros.</small></div>`;
  if (ctx.perfil().cargo === 'admin') h += await blocoGeneral();
  h += await blocoFicha(cmd);
  if (!cmd) return h + '<div class="linha"><small>A partir de Tenente você pode autorizar os soldados a caçar procurados.</small></div>';
  const [lista, cacadas] = await Promise.all([rede.exercito.procurados().catch(() => []), rede.exercito.cacadas().catch(() => [])]);
  const ativa = new Map((cacadas || []).map((k) => [k.alvo, k]));
  h += `<div class="linha"><b>🎖️ Ordens de caçada</b><small>Os soldados e jipes do Exército vão atrás do procurado por 10 min e prendem quando alcançam.</small></div>`;
  h += (lista || []).length ? lista.map((p) => `<div class="linha item"><span class="ic">🚨</span><span class="nm"><b>${esc(p.nome)}</b><small>${'★'.repeat(Math.min(5, p.crimes || 0))}${ativa.has(p.id) ? ` · caçada até ${new Date(ativa.get(p.id).ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</small></span>
    <span class="bts">${ativa.has(p.id) ? `<button data-cancelacaca="${p.id}">Suspender</button>` : `<button data-caca="${p.id}">Autorizar caçada</button>`}</span></div>`).join('') : '<div class="linha"><small>Nenhum procurado online agora.</small></div>';
  return h;
}
// ficha militar: quem está abaixo de mim, as mortes que causou (com ou sem ordem), arma pesada e expulsão
async function blocoFicha(cmd) {
  const lista = await rede.exercito.ficha().catch(() => []);
  if (!(lista || []).length) return '';
  const quando = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  let h = '<div class="linha"><b>📋 Ficha militar</b><small>Militares abaixo de você. Toda morte causada por eles aparece aqui; "sem ordem" é quando a vítima não era procurada nem estava sendo caçada.</small></div>';
  h += lista.map((m) => `<div class="linha item"><span class="ic">${m.expulso ? '⛔' : m.sem_ordem > 0 ? '⚠️' : '🎖️'}</span><span class="nm"><b>${esc(m.jogador)}</b>
    <small>${m.expulso ? 'EXPULSO' : esc(m.patente || 'Recruta')} · ${m.mortes} morte${m.mortes === 1 ? '' : 's'}${m.sem_ordem ? ` (${m.sem_ordem} sem ordem)` : ''}${m.pesada ? ' · 💥 arma pesada liberada' : ''}</small>
    ${(m.ultimas || []).map((u) => `<small>${u.autorizada ? '✔' : '✖'} ${esc(u.vitima || '?')} · ${quando(u.quando)}</small>`).join('')}</span>
    ${cmd ? `<span class="bts">${m.expulso ? `<button data-readmitir="${m.id}">Readmitir</button>` : `${m.pesada ? `<button data-pesada="${m.id}" data-h="0">Tirar arma pesada</button>` : `<button data-pesada="${m.id}" data-h="2">Arma pesada 2 h</button>`}<button data-prisao="${m.id}" data-min="15">⛓️ Prisão 15 min</button><button data-prisao="${m.id}" data-min="0">Soltar</button><button class="perigo" data-expulsar="${m.id}">Expulsar</button>`}</span>` : ''}</div>`).join('');
  return h;
}
const PATENTES_EX = ['Recruta', 'Soldado', 'Cabo', '3º Sargento', '2º Sargento', '1º Sargento', 'Subtenente', 'Tenente', 'Capitão', 'Major', 'Tenente-Coronel', 'Coronel', 'General'];
// General Supremo (administrador): promove ou rebaixa quem já está no Exército
async function blocoGeneral() {
  const lista = await rede.exercito.membros().catch(() => []);
  let h = '<div class="linha"><b>⭐ General Supremo · promoções</b><small>Escolha a patente de cada militar. O salário acompanha a patente.</small></div>';
  h += (lista || []).length ? lista.map((m) => `<div class="linha item"><span class="ic">🎖️</span><span class="nm"><b>${esc(m.jogador)}</b><small>${esc(m.patente)} · ${Math.floor(m.minutos / 60)}h${String(m.minutos % 60).padStart(2, '0')} de serviço</small></span>
    <span class="bts"><select data-patsel="${m.id}">${PATENTES_EX.map((n, i) => `<option value="${i + 1}" ${i + 1 === m.nivel ? 'selected' : ''}>${n}</option>`).join('')}</select><button data-promover="${m.id}">Salvar</button></span></div>`).join('')
    : '<div class="linha"><small>Ninguém no Exército ainda.</small></div>';
  return h;
}
function ligarQuadroTrabalho(c) {
  c.querySelectorAll('[data-prisao]').forEach((b) => { b.onclick = () => executar(() => rede.exercito.prisao(b.dataset.prisao, Number(b.dataset.min)), Number(b.dataset.min) ? 'Militar mandado para a prisão militar (15 min).' : 'Militar solto da prisão militar.'); });
  c.querySelectorAll('[data-pesada]').forEach((b) => { b.onclick = () => executar(() => rede.exercito.armaPesada(b.dataset.pesada, Number(b.dataset.h)), Number(b.dataset.h) ? 'Arma pesada autorizada por 2 h.' : 'Autorização retirada.'); });
  c.querySelectorAll('[data-expulsar]').forEach((b) => { b.onclick = () => confirmar(b, () => executar(() => rede.exercito.expulsar(b.dataset.expulsar, true), 'Militar expulso do Exército.')); });
  c.querySelectorAll('[data-readmitir]').forEach((b) => { b.onclick = () => executar(() => rede.exercito.expulsar(b.dataset.readmitir, false), 'Expulsão retirada.'); });
  c.querySelectorAll('[data-promover]').forEach((b) => { b.onclick = () => { const n = Number(c.querySelector(`[data-patsel="${b.dataset.promover}"]`).value); executar(() => rede.exercito.promover(b.dataset.promover, n), (nome) => `Patente salva: ${nome}.`); }; });
  c.querySelectorAll('[data-caca]').forEach((b) => { b.onclick = () => executar(() => rede.exercito.ordenar(b.dataset.caca), 'Caçada autorizada! Os soldados estão a caminho.'); });
  c.querySelectorAll('[data-cancelacaca]').forEach((b) => { b.onclick = () => executar(() => rede.exercito.cancelar(b.dataset.cancelacaca), 'Caçada suspensa.'); });
  c.querySelectorAll('[data-rastrear]').forEach((b) => { b.onclick = () => { const l = ctx.locaisTrabalho?.()[b.dataset.rastrear]; if (l) { ctx.rastrear?.({ nome: 'Seu trabalho', x: l.x, z: l.z }); fechar(); } }; });
  c.querySelectorAll('[data-sairpub]').forEach((b) => { b.onclick = () => executar(() => sairDoServico(ctx.perfil()), 'Você saiu do serviço.'); });
  c.querySelectorAll('[data-irempresa]').forEach((b) => { b.onclick = () => { const p = ctx.portaoEmpresa?.(Number(b.dataset.irempresa)); if (p) { ctx.rastrear?.({ nome: 'Seu trabalho (empresa)', x: p.x, z: p.z }); fechar(); } else msg('Não achei o prédio da empresa.', false); }; });
  c.querySelectorAll('[data-demissao]').forEach((b) => { b.onclick = () => confirmar(b, () => executar(() => rede.logistica.sair(), 'Você pediu demissão.')); });
}
async function telaTrabalho(c) {
  c.innerHTML = `<div class="sub">Seu trabalho</div>${await quadroTrabalho()}
    <p class="dica">Vagas no serviço público e nas empresas ficam na <b>Agência de Empregos</b>, ao lado do Banco.</p>
    <div class="botoes"><button id="tbAgencia">Ver vagas</button><button id="tbIrAgencia">📍 Ir até a Agência</button></div>`;
  ligarQuadroTrabalho(c);
  $('tbAgencia').onclick = () => { modo = 'empregos'; desenhar(); };
  $('tbIrAgencia').onclick = () => { const l = ctx.locaisTrabalho?.().agencia; if (l) { ctx.rastrear?.({ nome: 'Agência de Empregos', x: l.x, z: l.z }); fechar(); } };
}
async function telaEmpregos(c) {
  const eu = ctx.perfil();
  const [mural, meu, quadro] = await Promise.all([rede.empregos.mural(), rede.empregos.meu(eu.id).catch(() => null), quadroTrabalho()]);
  const atual = servicoAtual(eu), limpa = !(eu.crimes > 0);
  c.innerHTML = `<div class="sub">Seu trabalho</div>${quadro}
    <div class="sub">Serviço público (${PUBLICOS.length} vagas sempre abertas)</div>
    <div class="lista">${PUBLICOS.map((v) => `<div class="linha item"><span class="nm"><b>${v.nome}</b>
      <small>começa como ${v.inicio} · ${v.base} · requisito: ${v.req} · trabalha em: ${v.onde}</small></span>
      <span class="bts">${atual === v.id ? '<small class="dica">seu cargo</small>' : `<button data-pub="${v.id}" ${limpa ? '' : 'disabled title="Procurado não entra no serviço público"'}>${atual ? 'Trocar' : 'Entrar'}</button>`}</span></div>`).join('')}</div>
    ${limpa ? '' : '<p class="aviso-item">Você está procurado: pague a pena ou a fiança para entrar no serviço público.</p>'}
    <div class="sub">Vagas nas empresas (${mural.length})</div>
    <div class="lista">${mural.length ? mural.map((v) => `<div class="linha item"><span class="nm"><b>${esc(v.nome)} · Nv ${v.nivel}</b>
      <small>${FUNCOES[v.funcao] || v.funcao} · ${num(v.salario)}/min · ${v.vagas} vaga${v.vagas === 1 ? '' : 's'} · dono ${esc(v.dono)}${v.caixa_ok ? '' : ' · ⚠️ caixa baixo'}</small></span>
      <span class="bts">${meu ? '' : `<button data-vaga="${v.empresa}">Candidatar</button>`}</span></div>`).join('') : '<span class="vazio">Nenhuma empresa anunciou vaga agora. Donos de empresa anunciam na tela da empresa › Equipe.</span>'}</div>`;
  ligarQuadroTrabalho(c);
  c.querySelectorAll('[data-pub]').forEach((b) => { b.onclick = () => executar(() => entrarNoServico(b.dataset.pub), 'Contratado! O caminho até o trabalho está no mapa.'); });
  c.querySelectorAll('[data-vaga]').forEach((b) => {
    b.onclick = () => executar(async () => {
      await rede.empregos.candidatar(Number(b.dataset.vaga)); ctx.pontoMudou?.();
      const p = ctx.portaoEmpresa?.(Number(b.dataset.vaga)); if (p) ctx.rastrear?.({ nome: 'Seu trabalho (empresa)', x: p.x, z: p.z });
    }, 'Contratado! O caminho até a empresa está no mapa.');
  });
}

const CARGOS = {
  medico: 'Socorrista → Enfermeiro → Doutor → Supervisor → Diretor (Doutor em diante trabalha dentro do hospital)',
  bombeiro: 'Recruta → Bombeiro → Cabo → Sargento → Tenente → Capitão → Comandante',
  jornalista: 'Estagiário → Repórter → Repórter Sênior → Editor → Editor-chefe',
  exercito: 'Recruta → Soldado → Cabo → Sargentos → Subtenente → Tenente → Capitão → Major → Tenente-Coronel → Coronel → General (o administrador é o General Supremo)',
};
async function cartaoCarreira(prof) {
  const lista = await rede.carreiras.minhas().catch(() => []);
  const r = (lista || []).find((x) => x.carreira === prof);
  const h = (m) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  return `<div class="sub">Carreira</div>
    <div class="cartoes"><div><small>Cargo</small><b>${esc(r?.nome || CARGOS[prof].split(' → ')[0])}</b></div><div><small>Tempo em serviço</small><b>${h(r?.minutos || 0)}</b></div>
      <div><small>Salário</small><b>× ${Number(r?.mult || 1).toFixed(1)}</b></div><div><small>Próximo cargo</small><b>${r?.proximo ? `${esc(r.proximo)} em ${r.falta} min` : r ? 'topo' : `em ${prof === 'bombeiro' ? 60 : 120} min`}</b></div></div>
    <p class="dica">Cada minuto em serviço conta para a carreira e paga o salário do cargo; o salário sobe a cada promoção. ${CARGOS[prof]}.</p>`;
}
function telaProfissao(c, prof, titulo, texto) {
  const eu = ctx.perfil(), nela = eu.profissao === prof;
  return `<p class="dica">${texto}</p>
    <div class="cartoes"><div><small>Situação</small><b>${nela ? 'Em serviço' : eu.profissao ? 'Em outro serviço' : 'Fora de serviço'}</b></div></div>
    <div class="botoes">${nela ? `<button id="pSair">Sair do serviço</button>` : `<button id="pEntrar">Entrar em serviço: ${titulo}</button>`}${nela || ['admin', 'moderador'].includes(eu.cargo) ? '<button data-farda="1">👔 Vestiário (farda)</button>' : ''}</div>`;
}
function ligarProfissao(prof) {
  const e = $('pEntrar'), s = $('pSair');
  if (e) e.onclick = () => executar(() => rede.saude.entrar(prof), 'Você entrou em serviço.');
  if (s) s.onclick = () => executar(() => rede.saude.sair(), 'Você saiu do serviço.');
}

async function telaOnibus(c) {
  const carreira = await cartaoCarreira('motorista');
  c.innerHTML = `${carreira}${telaProfissao(c, 'motorista', 'Motorista de ônibus', 'Três linhas saem da <b>Rodoviária</b> (nordeste do centro), cada uma da sua plataforma: <b>1 · Circular</b> (centro), <b>2 · Aeroporto</b> e <b>3 · Leste</b>. Em serviço, vá ao <b>Despacho</b> da rodoviária e escolha a linha: você assume o ônibus que está na plataforma e sai no horário dele. Siga os pontos (🚏 no mapa), pare em cada um para os passageiros, respeite os horários (nem adiantado, nem atrasado) e volte para a fila da sua plataforma. Cada passageiro vale <b>12</b> e a volta no horário dá <b>+150</b>. Quando não há motorista, ônibus do sistema fazem as linhas.')}`;
  ligarProfissao('motorista');
}
async function telaPiloto(c) {
  const carreira = await cartaoCarreira('piloto');
  c.innerHTML = `${carreira}${telaProfissao(c, 'piloto', 'Piloto de avião', 'Pegue o avião no hangar (Copiloto: pequeno · Piloto: médio · Comandante: grande). Na pista, a torre autoriza a decolagem; acelere e suba. Para pousar, toque em <b>🛬 POUSAR</b> alinhado com uma pista, devagar. Fora da pista, torto ou rápido demais, o avião cai e explode. O avião grande só pousa no Aeroporto da Metrópole. Cada voo entre aeroportos paga <b>250 a 600</b>.')}`;
  ligarProfissao('piloto');
}
async function telaTorre(c) {
  const carreira = await cartaoCarreira('controlador');
  c.innerHTML = `${carreira}${telaProfissao(c, 'controlador', 'Controlador de voo', 'Fique na <b>torre de controle</b> do Aeroporto da Metrópole: os pedidos de pouso e decolagem dos pilotos chegam com aviso. Toque em <b>Torre</b> e responda pelo rádio: <b>autorizar</b> (vale <b>40</b>), <b>aguarde</b> ou <b>arremeter</b> (manda o avião subir de novo). O rádio também mostra os voos do sistema. Sem controlador na torre, a autorização é automática.')}`;
  ligarProfissao('controlador');
}
async function telaLixo(c) {
  const carreira = await cartaoCarreira('gari');
  c.innerHTML = `${carreira}${telaProfissao(c, 'gari', 'Gari · coleta de lixo', 'Na <b>Central de Reciclagem</b> (leste do centro), escolha um dos 4 setores na garagem e pegue o caminhão de lixo. A faixa amarela leva às lixeiras cheias (com sacos em volta): pare do lado e espere os dois garis NPC descerem, levarem os sacos e subirem de novo. Cabem 14 lixeiras; depois volte à Central e pare na <b>Descarga</b>. Cada lixeira vale <b>15</b> e cada descarga <b>+100</b>. As lixeiras enchem de novo em 4 minutos. Em cada setor sem gari jogador, um caminhão do sistema faz a coleta com os seus garis NPC.')}`;
  ligarProfissao('gari');
}
async function telaMecanico(c) {
  const carreira = await cartaoCarreira('mecanico');
  c.innerHTML = `${carreira}${telaProfissao(c, 'mecanico', 'Mecânico de aviões', 'Os aviões da frota do <b>Aeroporto da Metrópole</b> precisam de revisão a cada <b>3 voos</b>; a placa em cima de cada um mostra quantos voos ele tem. Sem revisão, o motor pode falhar no ar. Chegue perto de um avião com voos e toque em <b>Revisar</b>: você ganha <b>+300</b> por revisão. Sem mecânico jogador, o mecânico NPC do hangar faz a revisão cobrando do piloto (2.000 / 4.000 / 8.000).')}`;
  ligarProfissao('mecanico');
}
async function telaFiscal(c) {
  const carreira = await cartaoCarreira('fiscal');
  c.innerHTML = `${carreira}${telaProfissao(c, 'fiscal', 'Fiscal da Rodoviária', 'Fique nas plataformas da <b>Rodoviária</b>. Quando um ônibus não sai no horário, o painel da plataforma fica vermelho (<b>ATRASADO</b>) e você recebe um aviso: vá até o ônibus e toque em <b>Registrar</b> (vale <b>30</b>). Vale para os ônibus do sistema e para motoristas jogadores (quem atrasa perde o bônus de horário da volta). O <b>Quadro do fiscal</b> mostra os horários e os atrasados. Sem fiscal jogador, um fiscal NPC faz o serviço.')}`;
  ligarProfissao('fiscal');
}
async function telaHospital(c) {
  const carreira = await cartaoCarreira('medico');
  c.innerHTML = `${carreira}<div class="sub">Tratamento</div>
    <p class="dica">Recupere toda a vida na hora por <b>150</b> (o valor vai para o cofre da prefeitura). Quem morre sem socorro acorda aqui e paga até 100 de conta.</p>
    <div class="botoes"><button id="hTratar">Tratar (150)</button></div>
    <div class="sub">Plantão médico</div>
    ${telaProfissao(c, 'medico', 'Médico', 'Médicos em serviço veem os feridos (✚ FERIDO) pela cidade. Chegue perto em até 20 s e toque em <b>Socorrer</b>: a pessoa levanta ali mesmo e você ganha <b>250</b>. Procurados não podem trabalhar no serviço público.')}`;
  $('hTratar').onclick = () => (ctx.vida?.() >= 100 ? msg('Sua vida já está cheia.', false) : executar(async () => { const v = await rede.saude.tratar(); ctx.curar?.(); return v; }, 'Vida cheia!'));
  ligarProfissao('medico');
}

async function telaBombeiros(c) {
  const fogos = await rede.saude.incendios();
  const carreira = await cartaoCarreira('bombeiro');
  c.innerHTML = `${carreira}${telaProfissao(c, 'bombeiro', 'Bombeiro', 'Incêndios aparecem em empresas e casas. Bombeiros em serviço recebem o alerta, vão até lá e tocam em <b>Apagar</b>: 10 jatos d\'água (1 por segundo) e o fogo acaba. Cada fogo apagado vale <b>400</b>. O dono também pode apagar o próprio imóvel. Fogo que dura 8 minutos queima: a empresa perde 5% do caixa e a casa custa 500 de reforma.')}
    <div class="sub">Incêndios agora (${fogos.length})</div>
    <div class="lista">${fogos.length ? fogos.map((f) => `<div class="linha item"><span class="ic">🔥</span><span class="nm"><b>${esc(f.nome)}</b><small>${f.tipo === 'empresa' ? 'empresa' : 'casa'} · começou há ${Math.max(0, Math.round((Date.now() - Date.parse(f.inicio)) / 60000))} min · força ${f.vida}/10</small></span></div>`).join('') : '<span class="vazio">Nenhum fogo na cidade.</span>'}</div>`;
  ligarProfissao('bombeiro');
}

// ---------------------------------------------------------------- meus veículos e táxi aéreo
const BOTAO = { chamar: '📍 Chamar', materializar: '✨ Materializar (150)', recolher: '🅿️ Recolher', bloquear: '🔒 Bloquear', taxi: '🚐 Pedir carona' };
async function telaVeiculos(c) {
  const { carros, frota } = ctx.veiculos();
  const item = (v, tipo) => `<div class="linha item"><span class="nm"><b>${esc(v.nome)}</b><small>${esc(v.info)}</small></span>
    <span class="bts">${v.acoes.map((a) => `<button data-va="${a}" data-vt="${tipo}" data-vid="${v.id}" ${a === 'bloquear' ? 'class="perigo"' : ''}>${BOTAO[a]}</button>`).join('')}</span></div>`;
  c.innerHTML = `<p class="dica"><b>Chamar</b>: o robô motorista traz o veículo pelas ruas até você (grátis). <b>Materializar</b>: o veículo aparece do seu lado na hora, por 150 moedas. <b>Recolher</b>: leva de volta para a garagem (carros vão para a Concessionária).
      <b>Bloquear</b>: trava um veículo roubado; em 20 s o ladrão é jogado para fora e ele volta para a garagem. <b>Pedir carona</b>: o robô motorista (ou piloto, no helicóptero) busca você e leva aonde pedir.</p>
    <div class="sub">Carros (${carros.length})</div><div class="lista">${carros.length ? carros.map((v) => item(v, 'carro')).join('') : '<span class="vazio">Nenhum carro. Compre na Concessionária.</span>'}</div>
    <div class="sub">Veículos das empresas (${frota.length})</div><div class="lista">${frota.length ? frota.map((v) => item(v, 'frota')).join('') : '<span class="vazio">Nenhum veículo de empresa.</span>'}</div>`;
  c.querySelectorAll('[data-va]').forEach((b) => { b.onclick = () => { ctx.acaoVeiculo(b.dataset.va, b.dataset.vt, Number(b.dataset.vid)); fechar(); }; });
}
async function telaTaxi(c) {
  const lista = ctx.destinosTaxi();
  c.innerHTML = `<p class="dica">Escolha o destino. O robô leva você até lá e volta sozinho para a garagem.</p>
    <div class="lista">${lista.map((d, i) => `<div class="linha item"><span class="ic">${d.icone}</span><span class="nm"><b>${esc(d.nome)}</b></span><span class="bts"><button data-dest="${i}">Voar</button></span></div>`).join('')}</div>
    <div class="botoes" style="margin-top:12px"><button id="tDescer">Descer aqui</button></div>`;
  c.querySelectorAll('[data-dest]').forEach((b) => { b.onclick = () => { ctx.voarPara(Number(b.dataset.dest)); fechar(); }; });
  $('tDescer').onclick = () => { ctx.voarPara(-1); fechar(); };
}

async function telaJornal(c) {
  const eu = ctx.perfil(), redator = eu.profissao === 'jornalista' || eu.cargo === 'admin';
  const [lista, materias, carreira] = await Promise.all([rede.jornal.ultimas().catch(() => []), (redator ? rede.jornal.redacao() : rede.jornal.materias()).catch(() => []), cartaoCarreira('jornalista')]);
  const quando = (t) => { const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 0 ? `agendada para ${new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.floor(m / 60)} h` : `há ${Math.floor(m / 1440)} d`; };
  const local = (t) => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  c.innerHTML = `${redator ? `<div class="sub">✍️ Redação</div>
      <p class="dica">Escreva uma matéria (aparece no Jornal, na faixa do alto da tela e nos telões da cidade). Para foto, retrato de personagem, selo e destaque, use a <b>mesa de edição na redação</b>. Jornalistas podem editar ou apagar qualquer matéria.</p>
      <div class="lista"><input id="mtTitulo" maxlength="90" placeholder="Título"><textarea id="mtTexto" maxlength="600" rows="4" placeholder="Texto (até 600 letras)"></textarea>
      <input id="mtImagem" placeholder="Link de uma imagem (https://…, opcional)"><label class="dica">Publicar em: <input id="mtQuando" type="datetime-local"></label>
      <div class="botoes"><button id="mtSalvar">📰 Publicar</button><button id="mtLimpar">Limpar</button></div><input id="mtId" type="hidden"></div>` : ''}
    <div class="botoes"><button id="mtRedacao">🏢 Ir à redação (escritório e estúdio de fotos)</button>${redator ? '<button id="mtFoto">📷 Tirar foto agora</button><button id="mtConvidar">📨 Convidar para o estúdio</button>' : ''}</div>
    <div class="sub">📰 Matérias</div>
    <div class="lista" id="mtLista">${materias.length ? materias.map((m) => `<div class="materia">${cartao(m)}<small style="opacity:.6">${quando(m.publicar_em)}${m.editada_em ? ` · editada por ${esc(m.editor_nome || '')}` : ''}</small>
      ${redator ? `<div class="botoes"><button data-editar="${m.id}">Editar texto</button><button class="perigo" data-apagar="${m.id}">Apagar</button></div>` : ''}</div>`).join('') : '<span class="vazio">Nenhuma matéria ainda.</span>'}</div>
    <div class="sub">🚨 Reportagens da rua</div>
    <div class="lista">${lista.length ? lista.map((n) => `<div class="linha item"><span class="nm"><b>${esc(n.titulo)}</b><small>por ${esc(n.autor_nome)} · ${quando(n.criada_em)}</small></span></div>`).join('') : '<span class="vazio">Nenhuma notícia ainda.</span>'}</div>
    ${carreira}${telaProfissao(c, 'jornalista', 'Jornalista', 'Jornalistas em serviço vão até os acontecimentos da cidade (incêndio, ocorrência policial ou alguém ferido) e tocam em <b>Reportar</b>. A manchete sai no jornal para todos e a reportagem vale <b>200</b>. Cada acontecimento só rende uma reportagem: chegue primeiro! Na Redação, escrevem matérias para o Jornal e os telões.')}`;
  ligarProfissao('jornalista');
  carregarImagens($('mtLista'), materias);
  $('mtRedacao').onclick = () => { fechar(); ctx.irRedacao(); };
  if ($('mtFoto')) $('mtFoto').onclick = () => { fechar(); ctx.tirarFoto(); };
  if ($('mtConvidar')) $('mtConvidar').onclick = () => { fechar(); ctx.convidarEstudio(); };
  if (!redator) return;
  const pegar = (id) => materias.find((m) => String(m.id) === String(id));
  c.querySelectorAll('[data-editar]').forEach((b) => { b.onclick = () => { const m = pegar(b.dataset.editar); $('mtId').value = m.id; $('mtTitulo').value = m.titulo; $('mtTexto').value = m.texto || ''; $('mtImagem').value = m.imagem || ''; $('mtQuando').value = local(m.publicar_em); $('mtSalvar').textContent = '💾 Salvar edição'; $('mtTitulo').scrollIntoView({ block: 'center' }); }; });
  c.querySelectorAll('[data-apagar]').forEach((b) => { b.onclick = () => confirmar(b, () => executar(() => rede.jornal.apagar(Number(b.dataset.apagar)), 'Matéria apagada.')); });
  $('mtLimpar').onclick = () => { for (const k of ['mtId', 'mtTitulo', 'mtTexto', 'mtImagem', 'mtQuando']) $(k).value = ''; $('mtSalvar').textContent = '📰 Publicar'; };
  $('mtSalvar').onclick = () => {
    const q = $('mtQuando').value ? new Date($('mtQuando').value).toISOString() : null;
    executar(() => rede.jornal.salvar(Number($('mtId').value) || null, $('mtTitulo').value, $('mtTexto').value, $('mtImagem').value.trim(), q), () => { ctx.jornalMudou?.(); return q && Date.parse(q) > Date.now() ? 'Matéria agendada.' : 'Matéria publicada!'; });
  };
}

async function telaAmigos(c) {
  const lista = (await rede.amigos.listar()) || [];
  const amigos = lista.filter((a) => a.aceita), recebidos = lista.filter((a) => !a.aceita && !a.pediu_eu), enviados = lista.filter((a) => !a.aceita && a.pediu_eu);
  c.innerHTML = `<p class="dica">No chat (💬), o modo <b>🔒 Amigos</b> manda mensagens que só seus amigos veem, em amarelo. Nada do chat fica salvo.</p>
    <div class="botoes"><input id="amNome" placeholder="Nome do jogador"><button id="amPedir">Adicionar</button></div>
    ${recebidos.length ? `<div class="sub">Pedidos para você (${recebidos.length})</div><div class="lista">${recebidos.map((a) => `<div class="linha item"><span class="nm"><b>${esc(a.nome)}</b></span>
      <span class="bts"><button data-aceitar="${a.id}">Aceitar</button><button data-recusar="${a.id}">Recusar</button></span></div>`).join('')}</div>` : ''}
    <div class="sub">Amigos (${amigos.length})</div>
    <div class="lista">${amigos.length ? amigos.map((a) => `<div class="linha item"><span class="nm"><b>${esc(a.nome)}</b></span><span class="bts"><button data-desfazer="${a.id}">Remover</button></span></div>`).join('') : '<span class="vazio">Nenhum amigo ainda.</span>'}</div>
    <div class="sub">Jogadores online</div>
    <p class="dica">Alguém ofendendo, assediando ou trapaceando? <b>Denuncie</b> (a equipe recebe) ou <b>bloqueie</b> (some do seu chat e da sua voz).</p>
    <div class="lista">${ctx.online().length ? ctx.online().map((o) => `<div class="linha item"><span class="nm"><b>${esc(o.nome)}</b>${ctx.bloqueado(o.id) ? '<small>bloqueado</small>' : ''}</span>
      <span class="bts"><button data-denunciar="${o.id}" data-nome="${esc(o.nome)}">Denunciar</button><button data-bloq="${o.id}" data-sim="${ctx.bloqueado(o.id) ? 0 : 1}">${ctx.bloqueado(o.id) ? 'Desbloquear' : 'Bloquear'}</button></span></div>`).join('') : '<span class="vazio">Ninguém online além de você.</span>'}</div>
    <div id="amDenuncia"></div>
    ${enviados.length ? `<div class="sub">Esperando resposta</div><div class="lista">${enviados.map((a) => `<div class="linha item"><span class="nm"><b>${esc(a.nome)}</b><small>pedido enviado</small></span><span class="bts"><button data-desfazer="${a.id}">Cancelar</button></span></div>`).join('')}</div>` : ''}`;
  const depois = (txt) => (r) => { ctx.amigosMudaram?.(); return typeof txt === 'function' ? txt(r) : txt; };
  $('amPedir').onclick = () => { const n = $('amNome').value.trim(); if (n) executar(() => rede.amigos.pedir(n), depois((r) => (r === 'aceita' ? `Agora você e ${n} são amigos!` : `Pedido enviado para ${n}.`))); };
  c.querySelectorAll('[data-aceitar]').forEach((b) => { b.onclick = () => executar(() => rede.amigos.responder(b.dataset.aceitar, true), depois('Amizade aceita!')); });
  c.querySelectorAll('[data-recusar]').forEach((b) => { b.onclick = () => executar(() => rede.amigos.responder(b.dataset.recusar, false), depois('Pedido recusado.')); });
  c.querySelectorAll('[data-desfazer]').forEach((b) => { b.onclick = () => executar(() => rede.amigos.desfazer(b.dataset.desfazer), depois('Removido.')); });
  ligarDenunciaBloqueio(c);
}
const MOTIVOS = [['ofensa', 'Ofensa ou xingamento'], ['assedio', 'Assédio ou ameaça'], ['trapaca', 'Trapaça ou bug abusado'], ['nome', 'Nome impróprio'], ['voz', 'Abuso no chat de voz'], ['outro', 'Outro']];
function ligarDenunciaBloqueio(c) {
  c.querySelectorAll('[data-bloq]').forEach((b) => { b.onclick = () => executar(() => rede.conta.bloquear(b.dataset.bloq, b.dataset.sim === '1').then(() => ctx.bloqueiosMudaram()), b.dataset.sim === '1' ? 'Bloqueado: ele some do seu chat e da sua voz.' : 'Desbloqueado.'); });
  c.querySelectorAll('[data-denunciar]').forEach((b) => { b.onclick = () => {
    const f = $('amDenuncia'); if (!f) return;
    f.innerHTML = `<div class="sub">Denunciar ${b.dataset.nome}</div><div class="lista"><select id="dnMotivo">${MOTIVOS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
      <textarea id="dnTexto" maxlength="400" rows="3" placeholder="O que aconteceu? (opcional)"></textarea><div class="botoes"><button id="dnEnviar">Enviar denúncia</button><button id="dnCancelar">Cancelar</button></div></div>`;
    f.scrollIntoView({ block: 'center' });
    $('dnCancelar').onclick = () => { f.innerHTML = ''; };
    $('dnEnviar').onclick = () => executar(() => rede.conta.denunciar(b.dataset.denunciar, $('dnMotivo').value, $('dnTexto').value), 'Denúncia enviada. A equipe vai analisar. Obrigado!');
  }; });
}
async function telaConta(c) {
  const eu = ctx.perfil(), bl = (await rede.conta.bloqueios().catch(() => [])) || [];
  c.innerHTML = `<div class="sub">Sua conta</div><p class="dica">Jogador: <b>${esc(eu.nome)}</b></p>
    <div class="botoes"><a href="privacidade.html" target="_blank" rel="noopener"><button>📄 Política de privacidade</button></a></div>
    <div class="sub">Bloqueados (${bl.length})</div>
    <div class="lista">${bl.length ? bl.map((x) => `<div class="linha item"><span class="nm"><b>${esc(x.perfil?.nome || '?')}</b></span><span class="bts"><button data-bloq="${x.alvo}" data-sim="0">Desbloquear</button></span></div>`).join('') : '<span class="vazio">Ninguém bloqueado.</span>'}</div>
    <div class="sub" style="color:#ff8a80">Excluir minha conta</div>
    ${eu.cargo === 'admin' ? '<p class="dica">O administrador não pode excluir a própria conta.</p>' : `<p class="aviso-item">⚠️ Apaga para sempre o seu login e tudo do jogo: moedas, casas, carros, empresas, personagens e progresso. Não dá para desfazer.</p>
    <div class="botoes"><input id="exConf" placeholder="Digite EXCLUIR"><button id="exOk" class="perigo">Excluir minha conta</button></div>`}`;
  ligarDenunciaBloqueio(c);
  const ok = $('exOk');
  if (ok) ok.onclick = async () => {
    if ($('exConf').value.trim().toUpperCase() !== 'EXCLUIR') { msg('Digite EXCLUIR para confirmar.', false); return; }
    try { await rede.conta.excluir(); msg('Conta excluída. Até mais!'); setTimeout(() => ctx.sairDaConta(), 1500); } catch (e) { msg(e.message, false); }
  };
}
