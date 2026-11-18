// Celular 📱: o personagem põe o celular no ouvido (quem está perto vê ele parado com o celular) e abre a tela com
// atalhos: Minha empresa, Minha casa, Meu clã (cada um com "📍 Ir até", que marca no mapa), Mecânico e Meu banco.
import * as rede from './rede.js';

let ctx = null, aberto = false, tela = 'inicio';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');

const CSS = `
#celular{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(330px,88vw);height:min(600px,80vh);z-index:40;
  background:#0d1117;border:10px solid #1b1f24;border-radius:34px;box-shadow:0 18px 50px rgba(0,0,0,.6),inset 0 0 0 2px #2b3138;display:flex;flex-direction:column;overflow:hidden;color:#e8edf3;font-family:system-ui,sans-serif}
#celular.oculto{display:none}
#celular .barra{display:flex;justify-content:space-between;align-items:center;padding:8px 16px 4px;font-size:12px;opacity:.85}
#celular .entalhe{width:90px;height:18px;background:#1b1f24;border-radius:0 0 12px 12px;position:absolute;left:50%;top:0;transform:translateX(-50%)}
#celular .corpo{flex:1;overflow:auto;padding:10px 14px 14px}
#celular .apps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px 8px;margin-top:18px}
#celular .app{display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:0;color:#e8edf3;font-size:11.5px;cursor:pointer}
#celular .app i{font-style:normal;font-size:28px;width:58px;height:58px;border-radius:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,.4)}
#celular h3{margin:4px 0 10px;font-size:17px}
#celular .card{background:#161b22;border:1px solid #262c35;border-radius:12px;padding:10px;margin-bottom:8px}
#celular .card b{display:block}
#celular .card small{opacity:.7}
#celular button.bt{background:#2f81f7;color:#fff;border:0;border-radius:10px;padding:8px 10px;margin:6px 6px 0 0;font-size:13px}
#celular button.bt.sec{background:#2b3138}
#celular input{width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #30363d;color:#e8edf3;border-radius:10px;padding:9px;font-size:15px;margin-top:6px}
#celular .volta{background:none;border:0;color:#58a6ff;font-size:14px;padding:0;margin-bottom:6px}
#celular .casa{width:110px;height:5px;border-radius:3px;background:#8b949e;margin:6px auto 8px;cursor:pointer}
#celular .msg{font-size:12.5px;min-height:16px;color:#7ee787}
#celular .msg.erro{color:#ff7b72}
#celular .saldo{font-size:26px;font-weight:800;margin:2px 0}
`;

export function iniciarCelular(contexto) {
  ctx = contexto;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'celular'; el.className = 'oculto';
  el.innerHTML = '<div class="entalhe"></div><div class="barra"><span id="celHora">--:--</span><span>📶 🔋</span></div><div class="corpo" id="celCorpo"></div><div class="casa" id="celCasa" title="Fechar"></div>';
  document.body.appendChild(el);
  $('celCasa').onclick = () => (tela === 'inicio' ? fechar() : ir('inicio'));
}
export const celularAberto = () => aberto;
export function abrir() { aberto = true; tela = 'inicio'; $('celular').classList.remove('oculto'); desenhar(); }
export function fechar() { if (!aberto) return; aberto = false; $('celular').classList.add('oculto'); ctx.aoFechar?.(); }
function ir(t) { tela = t; desenhar(); }
function msg(t, ok = true) { const m = $('celMsg'); if (m) { m.textContent = t; m.className = 'msg' + (ok ? '' : ' erro'); } }
async function executar(fn, sucesso) {
  try { const r = await fn(); msg(typeof sucesso === 'function' ? sucesso(r) : sucesso); desenhar(true); }
  catch (e) { msg(e.message, false); }
}
const voltar = '<button class="volta" data-ir="inicio">‹ Início</button>';
const lugar = (l) => `<div class="card"><b>${esc(l.icone || '')} ${esc(l.nome)}</b>${l.info ? `<small>${esc(l.info)}</small>` : ''}
  <div><button class="bt" data-ate="${l.x},${l.z}" data-nome="${esc(l.nome)}">📍 Ir até</button>${l.abrir ? `<button class="bt sec" data-abrir="${l.abrir}">Abrir</button>` : ''}</div></div>`;

async function desenhar(manterMsg = false) {
  if (!aberto) return;
  const c = $('celCorpo'), m = manterMsg ? $('celMsg')?.outerHTML || '' : '';
  const h = ctx.hora?.(); $('celHora').textContent = h || new Date().toTimeString().slice(0, 5);
  const L = ctx.lugares();
  if (tela === 'inicio') {
    c.innerHTML = `<div style="text-align:center;margin-top:8px"><div style="font-size:42px;font-weight:200">${esc(h || '')}</div><small style="opacity:.7">Fator RP</small></div>
      <div class="apps">
        <button class="app" data-ir="empresa"><i style="background:#e39b3a">🏢</i>Minha empresa</button>
        <button class="app" data-ir="casa"><i style="background:#8c5a3c">🏠</i>Minha casa</button>
        <button class="app" data-ir="cla"><i style="background:#c43b3b">⚔️</i>Meu clã</button>
        <button class="app" data-ir="mecanico"><i style="background:#57606a">🔧</i>Mecânico</button>
        <button class="app" data-ir="banco"><i style="background:#238636">🏦</i>Meu banco</button>
        <button class="app" data-ir="estac"><i style="background:#1f6feb">🅿️</i>Estacionar</button>
      </div>`;
  } else if (tela === 'empresa') {
    c.innerHTML = `${voltar}<h3>🏢 Minha empresa</h3>${L.empresas.length ? L.empresas.map((l) => lugar({ ...l, abrir: 'empresa' })).join('') : '<p>Você não tem empresa nem emprego. Os lotes à venda aparecem no mapa.</p>'}`;
  } else if (tela === 'casa') {
    c.innerHTML = `${voltar}<h3>🏠 Minha casa</h3>${L.casas.length ? L.casas.map(lugar).join('') : '<p>Você ainda não tem casa. Compre ou alugue uma: as placas ficam nas portas.</p>'}`;
  } else if (tela === 'cla') {
    c.innerHTML = `${voltar}<h3>⚔️ Meu clã</h3>${L.cla ? `<div class="card"><b>${esc(L.cla.nome)}</b><small>${esc(L.cla.info || '')}</small><div><button class="bt sec" data-abrir="cla">Abrir o clã</button></div></div>
      ${L.cla.lugares.length ? L.cla.lugares.map(lugar).join('') : '<p><small>O clã ainda não tem território.</small></p>'}` : '<p>Você não está em um clã. Entre em um pelo menu ⚔️ Clã.</p>'}`;
  } else if (tela === 'banco') {
    c.innerHTML = `${voltar}<h3>🏦 Meu banco</h3><div class="card"><small>carregando…</small></div>`;
    try {
      const b = await rede.banco.estado(); if (tela !== 'banco' || !aberto) return;
      c.innerHTML = `${voltar}<h3>🏦 Meu banco</h3>
        <div class="card"><small>💵 Carteira (é o que você gasta; morto, o bandido pode levar até 500)</small><div class="saldo">${fmt(b.carteira)}</div></div>
        <div class="card"><small>🐷 Poupança (protegida; rende 1% por dia do jogo até 200.000)</small><div class="saldo">${fmt(b.saldo)}</div>${b.divida ? `<small>Dívida: ${fmt(b.divida)}</small>` : ''}</div>
        <input id="celValor" type="number" min="1" inputmode="numeric" placeholder="valor">
        <div><button class="bt" id="celDep">⬇️ Depositar</button><button class="bt" id="celSac">⬆️ Sacar</button><button class="bt sec" id="celTudo">Depositar tudo</button></div>
        <p><small>Para comprar, o dinheiro precisa estar na carteira: saque antes.</small></p>`;
      const v = () => Math.floor(Number($('celValor').value) || 0);
      $('celDep').onclick = () => executar(() => rede.banco.depositar(v()), (s) => { ctx.saldoMudou?.(); return `Depositado. Poupança: ${fmt(s)}`; });
      $('celSac').onclick = () => executar(() => rede.banco.sacar(v()), () => { ctx.saldoMudou?.(); return 'Sacado para a carteira.'; });
      $('celTudo').onclick = () => executar(() => rede.banco.depositar(b.carteira), (s) => { ctx.saldoMudou?.(); return `Tudo na poupança: ${fmt(s)}`; });
    } catch (e) { c.innerHTML = `${voltar}<h3>🏦 Meu banco</h3><p>${esc(e.message)}</p>`; }
  } else if (tela === 'mecanico') {
    const vs = ctx.veiculos();
    c.innerHTML = `${voltar}<h3>🔧 Mecânico</h3><p><small>O mecânico traz o veículo e deixa na rua mais perto de você. Cobra 100 + 1 moeda a cada 10 m (da carteira). Grátis: busque no guichê 🅿️ de um estacionamento.</small></p>
      ${vs.length ? vs.map((v) => `<div class="card"><b>${esc(v.nome)}</b><small>${esc(v.info)}</small><div>${v.longe ? `<button class="bt" data-mec="${v.id}">🔧 Chamar (${fmt(v.preco)})</button>` : ''}<button class="bt sec" data-ate="${v.x},${v.z}" data-nome="${esc(v.nome)}">📍 Onde está</button></div></div>`).join('') : '<p>Você não tem veículo comprado. Compre na Concessionária.</p>'}`;
  } else if (tela === 'estac') {
    const e = ctx.estacionamentoPerto?.();
    c.innerHTML = `${voltar}<h3>🅿️ Estacionamentos</h3><p><small>Guichê grátis: chegue no guichê e escolha o carro, ele aparece na vaga do estacionamento.</small></p>
      ${e ? lugar({ icone: '🅿️', nome: e.nome, info: `${fmt(e.dist)} m daqui`, x: e.x, z: e.z }) : '<p>Nenhum estacionamento perto.</p>'}`;
  }
  if (m) c.insertAdjacentHTML('afterbegin', m); else c.insertAdjacentHTML('afterbegin', '<div class="msg" id="celMsg"></div>');
  c.querySelectorAll('[data-ir]').forEach((b) => { b.onclick = () => ir(b.dataset.ir); });
  c.querySelectorAll('[data-ate]').forEach((b) => { b.onclick = () => { const [x, z] = b.dataset.ate.split(',').map(Number); ctx.marcar({ nome: b.dataset.nome, x, z }); msg('📍 Marcado no mapa.'); }; });
  c.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => { fechar(); ctx.abrirJanela(b.dataset.abrir); }; });
  c.querySelectorAll('[data-mec]').forEach((b) => { b.onclick = () => executar(() => ctx.chamarMecanico(Number(b.dataset.mec)), (r) => r || '🔧 O mecânico está trazendo o veículo.'); });
}
