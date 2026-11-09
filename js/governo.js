// Janela da prefeitura (prefeito, eleição, outdoors, PRF) e da concessionária. Tudo é conferido no banco.
import * as rede from './rede.js';
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
    if (SERVICOS[modo]) { abas.innerHTML = ''; $('governoTitulo').textContent = SERVICOS[modo][0]; await SERVICOS[modo][1](c); c.scrollTop = rolagem; return; }
    $('governoTitulo').textContent = 'Prefeitura';
    abas.innerHTML = [['prefeito', 'Prefeito'], ['eleicao', 'Eleição'], ['outdoors', 'Outdoors'], ['prf', 'PRF']]
      .map(([k, t]) => `<button data-aba="${k}" class="${aba === k ? 'sel' : ''}">${t}</button>`).join('');
    abas.querySelectorAll('button').forEach((b) => { b.onclick = () => { aba = b.dataset.aba; desenhar(); }; });
    const pf = await rede.prefeitura.estado();
    if (aba === 'prefeito') telaPrefeito(c, pf);
    else if (aba === 'eleicao') await telaEleicao(c, pf);
    else if (aba === 'outdoors') await telaOutdoors(c);
    else telaPrf(c, pf);
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
      <div class="sub" style="color:#ff8a80">Favores a clãs (crime eleitoral)</div>
      <p class="aviso-item">⚠️ Isto é ilegal. A PRF investiga a prefeitura e, se achar prova, você perde o mandato e vira procurado.</p>
      <div class="form linha-form"><select id="gCla">${clas.map((k) => `<option value="${k.id}">${esc(k.nome)}</option>`).join('')}</select>
        <input id="gVerba" type="number" min="1" placeholder="Valor do cofre" inputmode="numeric"><button id="gVerbaOk">Repassar verba</button></div>
      <div class="form linha-form"><select id="gTerr">${terr.map((k) => `<option value="${k.id}">${esc(k.nome)}</option>`).join('')}</select><button id="gTerrOk">Entregar território ao clã</button></div>
      <div class="botoes" style="margin-top:12px"><button id="gRenuncia" class="perigo">Renunciar ao mandato</button></div>` : ''}`;
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('gSalOk', () => executar(() => rede.prefeitura.salarioPolicia(Math.floor(Number($('gSal').value))), 'Salário da polícia atualizado.'));
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
  c.innerHTML = `<p class="dica">Campanha aberta${pf.prefeito ? ' para o próximo mandato' : ' (prefeitura vaga)'}. Cada jogador tem 1 voto e pode mudar até a apuração. Anuncie nos outdoors da cidade!</p>
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

function telaPrf(c, pf) {
  const eu = ctx.perfil();
  c.innerHTML = `<p class="dica">A <b>PRF</b> é a polícia eleitoral: não obedece ao prefeito e paga <b>120 a cada 3 min</b> de serviço. Agentes investigam documentos aqui na prefeitura (a cada 90 s). Se acharem prova de favor a clãs, o prefeito é cassado e fica procurado: prender rende 2.000, e achar a prova rende 3.000.</p>
    <p class="dica">Quem tem crimes, é de clã, é policial ou é o prefeito não entra.</p>
    <div class="botoes">${eu.prf ? '<button id="pInvest">🔍 Investigar documentos</button><button id="pSair" class="perigo">Sair de serviço</button>' : '<button id="pEntrar">Entrar em serviço na PRF</button>'}</div>
    ${pf.prefeito ? '' : '<p class="dica">Sem prefeito no cargo agora: não há o que investigar.</p>'}`;
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('pEntrar', () => executar(() => rede.prf.entrar(), 'Você está em serviço na PRF.'));
  on('pSair', () => executar(() => rede.prf.sair(), (v) => `Saiu de serviço.${v ? ` +${num(v)}` : ''}`));
  on('pInvest', () => executar(() => rede.prf.investigar(), (r) => r === 'cassado' ? '🚨 PROVA ENCONTRADA! O prefeito foi cassado e está procurado. +3.000' : r === 'sem prefeito' ? 'Não há prefeito no cargo.' : 'Nenhuma prova encontrada desta vez.'));
}

async function telaCarros(c) {
  const meus = ctx.meusCarros();
  c.innerHTML = `<p class="dica">Moedas: <b>${num(ctx.perfil().moedas)}</b>. Até 3 carros por jogador. O carro novo fica estacionado aqui na frente: chegue perto e toque em <b>Dirigir</b>. Ele fica onde você descer.</p>
    <div class="sub">Cor</div><div class="cores">${CORES_CARRO.map((k, i) => `<button data-cor="${k}" class="${i === 0 ? 'sel' : ''}" style="background:${k}"></button>`).join('')}</div>
    <div class="lista">${['popular', 'suv', 'esportivo'].map((m) => `<div class="linha item"><span class="nm"><b>${CARROS[m].nome}</b><small>${num(CARROS[m].preco)} · até ${Math.round(CARROS[m].vel * 3.6)} km/h</small></span>
      <span class="bts"><button data-carro="${m}">Comprar</button></span></div>`).join('')}</div>
    <div class="sub">Seus carros</div>
    <div class="lista">${meus.length ? meus.map((k) => `<div class="linha item"><span class="nm"><b style="color:${esc(k.cor)}">■</b> <b>${CARROS[k.modelo]?.nome}</b><small>${k.modelo === 'presidencial' ? 'do cargo de prefeito' : `vende por ${num(CARROS[k.modelo].preco / 2)}`}</small></span>
      <span class="bts">${k.modelo === 'presidencial' ? '' : `<button data-vender="${k.id}">Vender</button>`}</span></div>`).join('') : '<span class="vazio">Nenhum carro.</span>'}</div>`;
  let cor = CORES_CARRO[0];
  c.querySelectorAll('[data-cor]').forEach((b) => { b.onclick = () => { cor = b.dataset.cor; c.querySelectorAll('[data-cor]').forEach((x) => x.classList.toggle('sel', x === b)); }; });
  c.querySelectorAll('[data-carro]').forEach((b) => { b.onclick = () => confirmar(b, () => executar(() => rede.carros.comprar(b.dataset.carro, cor), 'Carro comprado! Ele está estacionado na frente da loja.')); });
  c.querySelectorAll('[data-vender]').forEach((b) => { b.onclick = () => confirmar(b, () => executar(() => rede.carros.vender(Number(b.dataset.vender)), (v) => `Vendido por ${num(v)}.`)); });
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
  trabalho: ['💼 Seu trabalho', telaTrabalho],
  taxi: ['Carona: para onde?', telaTaxi],
};

async function telaBanco(c) {
  const b = await rede.banco.estado();
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
      <div class="botoes"><input id="bEmp" type="number" min="500" max="${b.limite}" placeholder="Valor" inputmode="numeric"><button id="bPegar">Pegar empréstimo</button></div>`}`;
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('bDep', () => { const v = inteiro('bValor'); if (v > 0) executar(() => rede.banco.depositar(v), `Depositado: ${num(v)}.`); });
  on('bSaq', () => { const v = inteiro('bValor'); if (v > 0) executar(() => rede.banco.sacar(v), `Sacado: ${num(v)}.`); });
  on('bPagar', () => { const v = inteiro('bPag'); if (v > 0) executar(() => rede.banco.pagar(v), (r) => (r > 0 ? `Pago. Ainda deve ${num(r)}.` : 'Empréstimo quitado!')); });
  on('bPegar', () => { const v = inteiro('bEmp'); if (v > 0) executar(() => rede.banco.emprestimo(v), (t) => `Você recebeu ${num(v)}. Vai pagar ${num(t)}.`); });
}

// serviço público: polícia, PRF, hospital, bombeiros e jornal (ficha limpa; entra na hora)
const PUBLICOS = [
  { id: 'policia', nome: '🚓 Polícia', inicio: 'Soldado', req: 'ficha limpa', onde: 'Delegacia', base: 'salário definido pelo prefeito' },
  { id: 'prf', nome: '🛡 PRF · Polícia Eleitoral', inicio: 'Agente', req: 'ficha limpa, sem clã e sem ser prefeito', onde: 'Prefeitura', base: '40/min' },
  { id: 'medico', nome: '✚ Hospital', inicio: 'Socorrista', req: 'ficha limpa', onde: 'Hospital', base: '30/min' },
  { id: 'bombeiro', nome: '🚒 Bombeiros', inicio: 'Recruta', req: 'ficha limpa', onde: 'Quartel dos Bombeiros', base: '30/min' },
  { id: 'jornalista', nome: '📰 Jornal da Cidade', inicio: 'Estagiário', req: 'ficha limpa', onde: 'Prefeitura (balcão do jornal)', base: '24/min' },
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
  return h ? `<div class="lista">${h}</div>` : '<p class="dica">Você está sem trabalho. Escolha uma vaga abaixo: a contratação é na hora.</p>';
}
function ligarQuadroTrabalho(c) {
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
    <div class="botoes">${nela ? `<button id="pSair">Sair do serviço</button>` : `<button id="pEntrar">Entrar em serviço: ${titulo}</button>`}</div>`;
}
function ligarProfissao(prof) {
  const e = $('pEntrar'), s = $('pSair');
  if (e) e.onclick = () => executar(() => rede.saude.entrar(prof), 'Você entrou em serviço.');
  if (s) s.onclick = () => executar(() => rede.saude.sair(), 'Você saiu do serviço.');
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
const BOTAO = { chamar: '📍 Chamar', recolher: '🅿️ Recolher', bloquear: '🔒 Bloquear', taxi: '🚐 Pedir carona' };
async function telaVeiculos(c) {
  const { carros, frota } = ctx.veiculos();
  const item = (v, tipo) => `<div class="linha item"><span class="nm"><b>${esc(v.nome)}</b><small>${esc(v.info)}</small></span>
    <span class="bts">${v.acoes.map((a) => `<button data-va="${a}" data-vt="${tipo}" data-vid="${v.id}" ${a === 'bloquear' ? 'class="perigo"' : ''}>${BOTAO[a]}</button>`).join('')}</span></div>`;
  c.innerHTML = `<p class="dica"><b>Chamar</b>: o robô motorista traz o veículo pelas ruas até você. <b>Recolher</b>: leva de volta para a garagem (carros vão para a Concessionária).
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
  const lista = await rede.jornal.ultimas();
  const carreira = await cartaoCarreira('jornalista');
  const quando = (t) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60000)); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h`; };
  c.innerHTML = `${carreira}${telaProfissao(c, 'jornalista', 'Jornalista', 'Jornalistas em serviço vão até os acontecimentos da cidade (incêndio, ocorrência policial ou alguém ferido) e tocam em <b>Reportar</b>. A manchete sai no jornal para todos e a reportagem vale <b>200</b>. Cada acontecimento só rende uma reportagem: chegue primeiro!')}
    <div class="sub">Últimas notícias</div>
    <div class="lista">${lista.length ? lista.map((n) => `<div class="linha item"><span class="nm"><b>${esc(n.titulo)}</b><small>por ${esc(n.autor_nome)} · ${quando(n.criada_em)}</small></span></div>`).join('') : '<span class="vazio">Nenhuma notícia ainda.</span>'}</div>`;
  ligarProfissao('jornalista');
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
    ${enviados.length ? `<div class="sub">Esperando resposta</div><div class="lista">${enviados.map((a) => `<div class="linha item"><span class="nm"><b>${esc(a.nome)}</b><small>pedido enviado</small></span><span class="bts"><button data-desfazer="${a.id}">Cancelar</button></span></div>`).join('')}</div>` : ''}`;
  const depois = (txt) => (r) => { ctx.amigosMudaram?.(); return typeof txt === 'function' ? txt(r) : txt; };
  $('amPedir').onclick = () => { const n = $('amNome').value.trim(); if (n) executar(() => rede.amigos.pedir(n), depois((r) => (r === 'aceita' ? `Agora você e ${n} são amigos!` : `Pedido enviado para ${n}.`))); };
  c.querySelectorAll('[data-aceitar]').forEach((b) => { b.onclick = () => executar(() => rede.amigos.responder(b.dataset.aceitar, true), depois('Amizade aceita!')); });
  c.querySelectorAll('[data-recusar]').forEach((b) => { b.onclick = () => executar(() => rede.amigos.responder(b.dataset.recusar, false), depois('Pedido recusado.')); });
  c.querySelectorAll('[data-desfazer]').forEach((b) => { b.onclick = () => executar(() => rede.amigos.desfazer(b.dataset.desfazer), depois('Removido.')); });
}
