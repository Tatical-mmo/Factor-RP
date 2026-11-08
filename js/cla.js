// Clãs e territórios (etapa 7). Toda ação é conferida no banco.
import * as rede from './rede.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const limCla = (n) => ({ membros: 15 + (n - 1) * 3, robos: 20 + (n - 1) * 5, evoluir: n >= 15 ? null : 15000 * n * (n + 1) / 2 });
const FASES_CLA = { 5: 'a base ganha muralha', 10: 'a base ganha torres de vigia', 15: 'a base vira uma fortaleza' };
const CORES = ['#c43b3b', '#3b6fd2', '#2f9e5b', '#c98a1c', '#8a3bc4', '#2a2f3a'];

let ctx = null;
let aberta = false;
let aba = 'resumo', ultimaAssinatura = '';

export function iniciarCla(contexto) {
  ctx = contexto;
  $('btCla').onclick = abrir;
  $('fecharCla').onclick = fechar;
  $('claJanela').addEventListener('focusout', depoisDeDigitar);
}
export function abrir() { aberta = true; $('claJanela').classList.remove('oculto'); desenhar(); }
function fechar() { aberta = false; $('claJanela').classList.add('oculto'); }
const digitando = (id) => { const f = document.activeElement; return !!f && ['INPUT', 'SELECT', 'TEXTAREA'].includes(f.tagName) && !!$(id)?.contains(f); };
// não redesenha enquanto o jogador digita (as atualizações em tempo real apagavam o campo)
// atualizações automáticas esperam o jogador sair do campo (redesenhar fecha o teclado do celular)
let pendente = false;
export function atualizarCla() { if (aberta) desenhar(true); }
function depoisDeDigitar() { setTimeout(() => { if (pendente && aberta && !digitando('claJanela')) { pendente = false; desenhar(true); } }, 400); }

function msg(t, ok = true) { const m = $('claMsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'erro'); clearTimeout(msg.t); msg.t = setTimeout(() => { m.textContent = ''; }, 4000); }
async function executar(fn, sucesso) {
  try { const r = await fn(); msg(typeof sucesso === 'function' ? sucesso(r) : sucesso); ctx.recarregar(); await desenhar(); }
  catch (e) { msg(e.message, false); }
}
const inteiro = (id) => Math.floor(Number($(id)?.value) || 0);

async function desenhar(auto = false) {
  const c = $('claConteudo'), rolagem = c.scrollTop;
  const travado = () => { if (auto && digitando('claJanela')) { pendente = true; return true; } return false; };
  if (travado()) return;
  try {
    const eu = ctx.perfil().id;
    const [clas, meuId, territorios] = await Promise.all([rede.listarClas(), rede.meuClaId(eu), rede.listarTerritorios()]);
    if (travado()) return;
    ctx.definirCla(meuId, clas.find((x) => x.id === meuId) || null);
    const meu = clas.find((x) => x.id === meuId);
    const nomeCla = (id) => clas.find((x) => x.id === id)?.nome;
    if (!meu) {
      $('claTitulo').textContent = 'Clãs';
      c.innerHTML = `<p class="dica">Clãs disputam territórios (cada um rende <b>400 moedas por hora</b> ao caixa do clã), roubam cargas e guardam o que roubaram. Policiais não podem estar em clã.</p>
        <div class="sub">Fundar um clã (5.000 moedas)</div>
        <div class="form"><label>Nome <input id="cNomeCla" maxlength="20" placeholder="Ex.: Lobos do Deserto"></label>
          <label>Cor <select id="cCor">${CORES.map((k, i) => `<option value="${k}">${['Vermelho', 'Azul', 'Verde', 'Laranja', 'Roxo', 'Preto'][i]}</option>`).join('')}</select></label>
          <button id="cCriar">Fundar clã</button></div>
        <div class="sub">Clãs da cidade</div>
        <div class="lista">${clas.length ? clas.map((x) => `<div class="linha"><b style="color:${esc(x.cor)}">■</b> <b>${esc(x.nome)}</b><br><small>Líder: ${esc(x.lider_perfil?.nome)} · ${territorios.filter((t) => t.dono_cla === x.id).length} território(s)</small></div>`).join('') : '<span class="vazio">Nenhum clã ainda.</span>'}</div>
        <p class="dica">Para entrar num clã existente, peça ao líder que adicione você pelo nome.</p>`;
      $('cCriar').onclick = () => executar(() => rede.cla.criar($('cNomeCla').value.trim(), $('cCor').value), 'Clã fundado!');
      return;
    }
    const lider = meu.lider === eu;
    const membros = await rede.membrosDoCla(meu.id);
    if (travado()) return;
    // só redesenha quando algo mudou (evita a tela pulando enquanto rola)
    const assinatura = JSON.stringify([aba, meu, membros.map((m) => m.jogador), territorios.map((t) => [t.id, t.dono_cla, t.defesa])]);
    if (auto && assinatura === ultimaAssinatura) return;
    ultimaAssinatura = assinatura;
    $('claTitulo').textContent = `${meu.nome} · Nv ${meu.nivel || 1}`;
    const nv = meu.nivel || 1, L = limCla(nv), prox = nv + 1;
    const meus = territorios.filter((t) => t.dono_cla === meu.id), outros = territorios.filter((t) => t.dono_cla !== meu.id);
    const naDefesa = meus.reduce((a, t) => a + (t.defesa || 0), 0);
    const abas = [['resumo', 'Resumo'], ['territorios', `Territórios (${meus.length})`], ['estoque', 'Estoque'], ['membros', `Membros (${membros.length})`]];
    let corpo = '';
    if (aba === 'resumo') {
      corpo = `<div class="cartoes"><div><small>Nível</small><b>${nv}</b></div><div><small>Caixa</small><b>${num(meu.caixa)}</b></div>
          <div><small>Robôs livres</small><b>${meu.robos}</b></div><div><small>Robôs (total)</small><b>${meu.robos + naDefesa}/${L.robos}</b></div></div>
        <div class="sub">Caixa do clã</div>
        <div class="botoes"><input id="clValor" type="number" min="1" placeholder="Valor" inputmode="numeric"><button id="clDep">Depositar</button>${lider ? '<button id="clSaq">Sacar</button>' : ''}</div>
        ${lider ? '<div class="sub">Robôs de combate</div><p class="dica" id="clPreco">Consultando o preço…</p><div class="botoes"><button id="clRobo">Comprar robô</button></div>' : ''}
        <div class="sub">Nível do clã</div>
        ${L.evoluir ? `<p class="dica">Nível ${prox}: até ${limCla(prox).membros} membros e ${limCla(prox).robos} robôs${FASES_CLA[prox] ? `; ${FASES_CLA[prox]}` : ''}. Custa ${num(L.evoluir)} do caixa.</p>
          ${prox % 5 === 0 ? '<p class="aviso-item">🔓 Precisa de 1 <b>Desbloqueio Corporativo</b> na mochila do líder (vende na loja).</p>' : ''}
          ${lider ? `<div class="botoes"><button id="clEvoluir">Evoluir para o nível ${prox}</button></div>` : ''}` : '<p class="dica">Nível máximo.</p>'}
        ${ctx.perfil().cargo === 'admin' ? `<div class="sub">Administrador</div><div class="botoes"><input id="admNvCla" type="number" min="1" max="15" value="${nv}" inputmode="numeric"><button id="admNvClaOk">Definir nível (teste)</button></div>` : ''}
        <div class="botoes" style="margin-top:14px"><button id="clSair" class="perigo">Sair do clã</button></div>`;
    } else if (aba === 'territorios') {
      const linhaT = (t, nosso) => `<div class="linha item"><span class="nm"><b>${esc(t.nome)}</b><small>${nosso ? `${t.defesa} robô${t.defesa === 1 ? '' : 's'} na defesa · rende 400/h`
          : t.dono_cla ? `do ${esc(nomeCla(t.dono_cla) || '?')} · ${t.defesa ? 'com defesa' : 'sem defesa'}` : 'livre'}</small></span>
        ${lider ? `<span class="bts">${nosso ? `<button data-def="${t.id}" data-n="1">+1</button><button data-def="${t.id}" data-n="-1">−1</button>` : `<button data-atk="${t.id}">Atacar</button>`}</span>` : ''}</div>`;
      corpo = `<p class="dica">Cada território rende <b>400/h</b> ao caixa. Para tomar um, fique com o clã dentro do círculo: 60 s, mais 20 s por robô defensor.${lider ? ' Ou ataque com robôs: vence quem tiver mais força (defensores valem 30% a mais).' : ''}</p>
        ${lider ? `<div class="botoes"><span class="dica" style="align-self:center">Robôs no ataque:</span><input id="clAtkN" type="number" min="1" max="${Math.max(1, meu.robos)}" value="${Math.max(1, meu.robos)}" inputmode="numeric" style="max-width:6em"><small class="dica" style="align-self:center">(${meu.robos} livres)</small></div>` : ''}
        <div class="sub">Do clã</div><div class="lista">${meus.length ? meus.map((t) => linhaT(t, true)).join('') : '<span class="vazio">Nenhum ainda.</span>'}</div>
        <div class="sub">Outros</div><div class="lista">${outros.map((t) => linhaT(t, false)).join('')}</div>`;
    } else if (aba === 'estoque') {
      corpo = `<p class="dica">Cargas roubadas por membros vêm para cá. Qualquer membro pega para a mochila; o líder vende tudo para o caixa.</p>
        <div class="lista">${[['chocolate', '🍫', 'Chocolate'], ['remedio', '💊', 'Remédio']].map(([k, ic, n]) => `<div class="linha item"><span class="ic">${ic}</span><span class="nm"><b>${n}</b><small>${meu[k] || 0} no estoque</small></span>
          <span class="bts"><button data-ret="${k}" ${meu[k] ? '' : 'disabled'}>Pegar 1</button>${lider ? `<button data-vend="${k}" ${meu[k] ? '' : 'disabled'}>Vender tudo</button>` : ''}</span></div>`).join('')}</div>`;
    } else {
      corpo = `<p class="dica">${membros.length} de ${L.membros} membros.</p>
        ${lider ? '<div class="botoes"><input id="clNome" placeholder="Nome do jogador"><button id="clAdd">Adicionar</button></div>' : ''}
        <div class="lista">${membros.map((m) => `<div class="linha item"><span class="nm"><b>${esc(m.perfil?.nome)}</b><small>${m.jogador === meu.lider ? '👑 líder' : 'membro'}</small></span>
          <span class="bts">${lider && m.jogador !== meu.lider ? `<button data-exp="${m.jogador}">Expulsar</button>` : ''}</span></div>`).join('')}</div>`;
    }
    c.innerHTML = `<div class="abas" style="padding:0 0 10px">${abas.map(([k, t]) => `<button data-abacla="${k}" class="${aba === k ? 'sel' : ''}">${t}</button>`).join('')}</div>${corpo}`;
    c.querySelectorAll('[data-abacla]').forEach((b) => { b.onclick = () => { aba = b.dataset.abacla; c.scrollTop = 0; desenhar(); }; });
    const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
    on('clDep', () => { const v = inteiro('clValor'); if (v > 0) executar(() => rede.cla.depositar(v), `Depositado: ${num(v)}.`); });
    on('clSaq', () => { const v = inteiro('clValor'); if (v > 0) executar(() => rede.cla.sacar(v), `Sacado: ${num(v)}.`); });
    on('clRobo', () => executar(() => rede.cla.comprarRobo(), 'Robô de combate comprado.'));
    on('admNvClaOk', () => executar(() => rede.painel.nivelCla(meu.id, Math.floor(Number($('admNvCla').value))), 'Nível do clã definido.'));
    on('clEvoluir', () => executar(() => rede.cla.evoluir(), (n) => `O clã chegou ao nível ${n}!`));
    if (lider && aba === 'resumo') rede.precoRobo().then((p) => { const el = $('clPreco'); if (el) el.innerHTML = p <= 8000 ? 'Robô de uma fábrica de robôs da cidade: <b>8.000</b>.' : 'Sem estoque nas fábricas de robôs: vem de fora por <b>12.000</b>.'; const b = $('clRobo'); if (b) b.textContent = `Comprar robô (${num(p)})`; }).catch(() => {});
    on('clAdd', () => { const n = $('clNome').value.trim(); if (n) executar(() => rede.cla.adicionar(n), `${n} entrou no clã.`); });
    on('clSair', () => { const b = $('clSair'); if (!b.dataset.conf) { b.dataset.conf = '1'; b.textContent = 'Toque de novo para sair'; return; } executar(() => rede.cla.sair(), 'Você saiu do clã.'); });
    c.querySelectorAll('[data-ret]').forEach((b) => { b.onclick = () => executar(() => rede.cla.retirar(b.dataset.ret, 1), 'Item na sua mochila.'); });
    c.querySelectorAll('[data-vend]').forEach((b) => { b.onclick = () => { const q = meu[b.dataset.vend]; if (q > 0) executar(() => rede.cla.vender(b.dataset.vend, q), (r) => `Vendido por ${num(r)} (caixa do clã).`); else msg('Nada para vender.', false); }; });
    c.querySelectorAll('[data-exp]').forEach((b) => { b.onclick = () => executar(() => rede.cla.expulsar(b.dataset.exp), 'Membro expulso.'); });
    c.querySelectorAll('[data-def]').forEach((b) => { b.onclick = () => executar(() => rede.cla.defender(b.dataset.def, Number(b.dataset.n)), 'Defesa atualizada.'); });
    c.querySelectorAll('[data-atk]').forEach((b) => {
      b.onclick = () => { const n = inteiro('clAtkN'); if (n < 1) { msg('Escolha quantos robôs.', false); return; }
        executar(() => rede.cla.atacar(b.dataset.atk, n), (r) => r.startsWith('vitoria') ? `Vitória! O território é seu, com ${r.split(':')[1]} robôs na defesa.` : 'Derrota: os robôs foram destruídos.'); };
    });
    c.scrollTop = rolagem;
  } catch (e) { c.textContent = e.message; }
}
