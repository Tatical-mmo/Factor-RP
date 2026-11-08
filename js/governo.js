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

async function telaEmpregos(c) {
  const eu = ctx.perfil();
  const [meu, mural] = await Promise.all([rede.empregos.meu(eu.id), rede.empregos.mural()]);
  const souDono = meu && meu.emp?.dono === eu.id;
  const emprego = meu && !souDono ? `<div class="cartoes"><div><small>Empresa</small><b>${esc(meu.emp?.nome)}</b></div><div><small>Cargo</small><b>${FUNCOES[meu.funcao] || meu.funcao}</b></div>
      <div><small>Salário</small><b>${num(meu.salario)}/min</b></div><div><small>Minutos trabalhados</small><b>${num(meu.minutos)}</b></div></div>
    <p class="dica">Fique perto de um prédio da empresa: o ponto é batido sozinho a cada minuto e o salário sai do caixa dela.${meu.funcao === 'operario' ? ' Como operário, você também produz 1 caixa por minuto.' : ''}</p>
    <div class="botoes"><button id="vDemissao" class="perigo">Pedir demissão</button></div>` : souDono ? '<p class="dica">Você é dono de empresa. Abra vagas na tela da empresa, aba Equipe.</p>' : '<p class="dica">Você está sem emprego. Escolha uma vaga abaixo: a contratação é na hora.</p>';
  c.innerHTML = `${emprego}<div class="sub">Vagas abertas (${mural.length})</div>
    <div class="lista">${mural.length ? mural.map((v) => `<div class="linha item"><span class="nm"><b>${esc(v.nome)} · Nv ${v.nivel}</b>
      <small>${FUNCOES[v.funcao] || v.funcao} · ${num(v.salario)}/min · ${v.vagas} vaga${v.vagas === 1 ? '' : 's'} · dono ${esc(v.dono)}${v.caixa_ok ? '' : ' · ⚠️ caixa baixo'}</small></span>
      <span class="bts">${meu ? '' : `<button data-vaga="${v.empresa}">Candidatar</button>`}</span></div>`).join('') : '<span class="vazio">Nenhuma vaga agora. Volte mais tarde.</span>'}</div>`;
  const d = $('vDemissao'); if (d) d.onclick = () => confirmar(d, () => executar(() => rede.logistica.sair(), 'Você pediu demissão.'));
  c.querySelectorAll('[data-vaga]').forEach((b) => { b.onclick = () => executar(() => rede.empregos.candidatar(Number(b.dataset.vaga)), () => { ctx.pontoMudou?.(); return 'Contratado! Vá até a empresa para começar a trabalhar.'; }); });
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
  c.innerHTML = `<div class="sub">Tratamento</div>
    <p class="dica">Recupere toda a vida na hora por <b>150</b> (o valor vai para o cofre da prefeitura). Quem morre sem socorro acorda aqui e paga até 100 de conta.</p>
    <div class="botoes"><button id="hTratar">Tratar (150)</button></div>
    <div class="sub">Plantão médico</div>
    ${telaProfissao(c, 'medico', 'Médico', 'Médicos em serviço veem os feridos (✚ FERIDO) pela cidade. Chegue perto em até 20 s e toque em <b>Socorrer</b>: a pessoa levanta ali mesmo e você ganha <b>250</b>. Procurados não podem trabalhar no serviço público.')}`;
  $('hTratar').onclick = () => (ctx.vida?.() >= 100 ? msg('Sua vida já está cheia.', false) : executar(async () => { const v = await rede.saude.tratar(); ctx.curar?.(); return v; }, 'Vida cheia!'));
  ligarProfissao('medico');
}

async function telaBombeiros(c) {
  const fogos = await rede.saude.incendios();
  c.innerHTML = `${telaProfissao(c, 'bombeiro', 'Bombeiro', 'Incêndios aparecem em empresas e casas. Bombeiros em serviço recebem o alerta, vão até lá e tocam em <b>Apagar</b>: 10 jatos d\'água (1 por segundo) e o fogo acaba. Cada fogo apagado vale <b>400</b>. O dono também pode apagar o próprio imóvel. Fogo que dura 8 minutos queima: a empresa perde 5% do caixa e a casa custa 500 de reforma.')}
    <div class="sub">Incêndios agora (${fogos.length})</div>
    <div class="lista">${fogos.length ? fogos.map((f) => `<div class="linha item"><span class="ic">🔥</span><span class="nm"><b>${esc(f.nome)}</b><small>${f.tipo === 'empresa' ? 'empresa' : 'casa'} · começou há ${Math.max(0, Math.round((Date.now() - Date.parse(f.inicio)) / 60000))} min · força ${f.vida}/10</small></span></div>`).join('') : '<span class="vazio">Nenhum fogo na cidade.</span>'}</div>`;
  ligarProfissao('bombeiro');
}
