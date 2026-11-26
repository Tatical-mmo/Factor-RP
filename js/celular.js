// Celular 📱: o personagem põe o celular no ouvido (quem está perto vê ele parado com o celular) e abre a tela com
// atalhos: Minha empresa, Minha casa, Meu clã (cada um com "📍 Ir até", que marca no mapa), Mecânico e Meu banco.
import * as rede from './rede.js';
import * as voz from './voz.js';
import * as papo from './paporeto.js';

let ctx = null, aberto = false, tela = 'inicio', modoPc = false, corOnline = '#c0392b';
let conversaCom = null, naoLidas = new Map(), relogioLig = null, toque = null, chamadaUI = null;   // 👥 Contatos
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');

const CSS = `
#celular{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(330px,88vw);height:min(600px,80vh);z-index:40;
  background:#0d1117;border:10px solid #1b1f24;border-radius:34px;box-shadow:0 18px 50px rgba(0,0,0,.6),inset 0 0 0 2px #2b3138;display:flex;flex-direction:column;overflow:hidden;color:#e8edf3;font-family:system-ui,sans-serif}
#celular.oculto,#celFundo.oculto{display:none}
#celFundo{position:fixed;inset:0;z-index:39;background:rgba(0,0,0,.25)}
#celular .fechaX{position:absolute;right:10px;top:22px;width:34px;height:34px;border-radius:50%;border:0;background:#2b3138;color:#fff;font-size:18px;z-index:2;cursor:pointer}
#celular.pc{width:min(760px,94vw);height:min(500px,86vh);border:14px solid #20242a;border-bottom-width:30px;border-radius:12px}
#celular.pc .entalhe{display:none}
#celular.pc .apps{grid-template-columns:repeat(auto-fill,minmax(92px,1fr))}
#celular .carro{display:flex;align-items:center;justify-content:space-between;gap:8px}
#celular .carro .bt{flex:none;margin:0;align-self:center}
#celular img.mini{display:block;width:100%;aspect-ratio:12/7;object-fit:cover;border-radius:8px;background:#e9edf2;margin-bottom:6px}
#celular .cores{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
#celular .cores button{width:30px;height:30px;border-radius:50%;border:2px solid #30363d}
#celular .cores button.sel{border-color:#fff;box-shadow:0 0 0 2px #2f81f7}
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
#celular .casa{width:100%;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none}
#celular .casa::after{content:'';width:120px;height:6px;border-radius:3px;background:#8b949e}
#celular .msg{font-size:12.5px;min-height:16px;color:#7ee787}
#celular .msg.erro{color:#ff7b72}
#celular .saldo{font-size:26px;font-weight:800;margin:2px 0}
#celular .app{position:relative}
#celular .badge{position:absolute;top:-4px;right:12px;background:#f85149;color:#fff;border-radius:10px;font-size:11px;font-weight:700;padding:1px 6px}
#celular .ponto{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:#6e7681}
#celular .ponto.on{background:#3fb950}
#celular .msgs{display:flex;flex-direction:column;gap:6px;min-height:200px;margin-bottom:8px}
#celular .bolha{max-width:78%;padding:7px 10px;border-radius:14px;font-size:14px;line-height:1.3;word-wrap:break-word}
#celular .bolha.eu{align-self:flex-end;background:#1f6feb;border-bottom-right-radius:4px}
#celular .bolha.ele{align-self:flex-start;background:#262c35;border-bottom-left-radius:4px}
#celular .bolha small{display:block;opacity:.6;font-size:10px;margin-top:2px}
#celular .digitar{display:flex;gap:6px;position:sticky;bottom:0;background:#0d1117;padding-top:6px}
#celular .digitar input{margin:0}
#celular .lig{text-align:center;padding-top:30px}
#celular .lig .foto{width:96px;height:96px;border-radius:50%;background:#30363d;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:46px}
#celular .lig .nome{font-size:22px;font-weight:700}
#celular .lig .bts{display:flex;justify-content:center;gap:34px;margin-top:40px}
#celular .lig .bts button{width:66px;height:66px;border-radius:50%;border:0;font-size:28px;color:#fff}
#celular .verde{background:#2ea043}#celular .vermelho{background:#da3633}
#btCelular{position:relative}
#btCelular .badge{position:absolute;top:-2px;right:-2px;background:#f85149;color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:0 5px}
`;

export function iniciarCelular(contexto) {
  ctx = contexto;
  const st = document.createElement('style'); st.textContent = CSS + papo.CSS; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'celular'; el.className = 'oculto';
  el.innerHTML = '<div class="entalhe"></div><button class="fechaX" id="celX" title="Fechar">✕</button><div class="barra"><span id="celHora">--:--</span><span id="celSinal">📶 🔋</span></div><div class="corpo" id="celCorpo"></div><div class="casa" id="celCasa" title="Início / fechar"></div>';
  const fundo = document.createElement('div'); fundo.id = 'celFundo'; fundo.className = 'oculto';
  document.body.append(fundo, el);
  // fecha pelo ✕, tocando fora da tela ou com Esc; a barrinha de baixo volta ao início (e fecha se já estiver nele)
  $('celX').onclick = (ev) => { ev.stopPropagation(); fechar(); };
  fundo.onclick = () => fechar();
  $('celCasa').onclick = () => (tela === 'inicio' ? fechar() : ir('inicio'));
  for (const id of ['celular', 'celFundo']) for (const t of ['pointerdown', 'touchstart', 'wheel']) $(id).addEventListener(t, (ev) => ev.stopPropagation(), { passive: true });
  addEventListener('keydown', (ev) => { if (aberto && ev.key === 'Escape') fechar(); });
}
export const celularAberto = () => aberto;
// pc = true: computador da empresa (tela larga, sem animação, com o caixa da empresa)
export function abrir(pc = false) {
  aberto = true; modoPc = pc; tela = chamadaUI ? 'ligacao' : !pc && !ctx.celular?.() ? 'escolhercel' : 'inicio';   // 22a: a primeira vez escolhe o celular
  $('celular').classList.toggle('pc', pc); $('celSinal').textContent = pc ? '💻 Computador da empresa' : '📶 🔋';
  $('celular').classList.remove('oculto'); $('celFundo').classList.remove('oculto'); desenhar();
}
export function fechar() { if (!aberto) return; aberto = false; $('celular').classList.add('oculto'); $('celFundo').classList.add('oculto'); ctx.aoFechar?.(); }
function ir(t) { tela = t; ctx.telaMudou?.(t); desenhar(); }
// 22a: abre direto numa tela (a câmera volta para a Galeria / Papo Reto)
export function abrirEm(t, v) { if (v) papo.abrirPapo(v); abrir(); if (tela !== 'escolhercel' && tela !== 'ligacao') ir(t); }
export const telaAtual = () => tela;
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
        <button class="app" data-ir="contatos"><i style="background:#0f7b6c">👥</i>Contatos${totalNaoLidas() ? `<span class="badge">${totalNaoLidas()}</span>` : ''}</button>
        <button class="app" data-ir="loja"><i style="background:#8250df">🛒</i>Concessionária</button>
        <button class="app" id="celEncom"><i style="background:#9a6700">📋</i>Encomendas</button>
        ${modoPc ? '<button class="app" data-ir="caixa"><i style="background:#bf8700">💼</i>Caixa da empresa</button>' : `<button class="app" id="celCamera"><i style="background:#30363d">📷</i>Câmera</button>
        <button class="app" data-ir="papo"><i style="background:linear-gradient(135deg,#ffd166,#ef476f)">💬</i>Papo Reto</button>
        <button class="app" data-ir="galeria"><i style="background:#2b6cb0">🖼️</i>Galeria</button>
        <button class="app" data-ir="lojacel"><i style="background:#1b1f24;border:1px solid #444">📱</i>Loja de celulares</button>`}
      </div>`;
  } else if (tela === 'empresa') {
    c.innerHTML = `${voltar}<h3>🏢 Minha empresa</h3>${L.empresas.length ? L.empresas.map((l) => lugar(l.icone === '🔧' ? l : { ...l, abrir: 'empresa' })).join('') : '<p>Você não tem empresa nem emprego. Os lotes à venda aparecem no mapa; terrenos para oficina têm placa amarela "VENDE-SE" (150.000).</p>'}`;
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
      ${(() => { const pf = ctx.pneuFurado?.(); return pf ? `<div class="card"><b>🛞 Pneu furado</b><small>${pf.n} pneu${pf.n > 1 ? 's' : ''} no seu carro. O mecânico vem ${pf.n > 1 ? 'de guincho' : 'de Saveiro'} até onde você está e troca em 1 minuto (200 por pneu).</small><div><button class="bt" data-pneuaqui="1">🛞 Trocar aqui (${fmt(pf.n * 200)})</button></div></div>` : ''; })()}
      ${vs.length ? vs.map((v) => `<div class="card"><b>${esc(v.nome)}</b><small>${esc(v.info)}</small><div>${v.longe ? `<button class="bt" data-mec="${v.id}">🔧 Chamar (${fmt(v.preco)})</button>` : ''}<button class="bt sec" data-ate="${v.x},${v.z}" data-nome="${esc(v.nome)}">📍 Onde está</button></div></div>`).join('') : '<p>Você não tem veículo comprado. Compre na Concessionária.</p>'}`;
  } else if (tela === 'estac') {
    const e = ctx.estacionamentoPerto?.();
    c.innerHTML = `${voltar}<h3>🅿️ Estacionamentos</h3><p><small>Guichê grátis: chegue no guichê e escolha o carro, ele aparece na vaga do estacionamento.</small></p>
      ${e ? lugar({ icone: '🅿️', nome: e.nome, info: `${fmt(e.dist)} m daqui`, x: e.x, z: e.z }) : '<p>Nenhum estacionamento perto.</p>'}`;
  } else if (tela === 'contatos') {
    c.innerHTML = `${voltar}<h3>👥 Contatos</h3><div class="card"><small>carregando…</small></div>`;
    try {
      const lista = ((await rede.amigos.listar()) || []).filter((a) => a.aceita); if (tela !== 'contatos' || !aberto) return;
      lista.sort((a, b) => (ctx.online(b.id) - ctx.online(a.id)) || (naoLidas.get(b.id) || 0) - (naoLidas.get(a.id) || 0) || a.nome.localeCompare(b.nome));
      c.innerHTML = `${voltar}<h3>👥 Contatos</h3><p><small>Seus amigos. 💬 manda mensagem (fica 7 dias); 📞 liga para quem está on-line (conversa por voz em qualquer lugar). Adicione amigos pelo menu 👥 Amigos.</small></p>
        ${lista.length ? lista.map((a) => `<div class="card carro"><span><b><span class="ponto ${ctx.online(a.id) ? 'on' : ''}"></span>${esc(a.nome)}${naoLidas.get(a.id) ? ` <span class="badge" style="position:static">${naoLidas.get(a.id)}</span>` : ''}</b><small>${ctx.online(a.id) ? 'on-line' : 'off-line'}</small></span>
          <span><button class="bt sec" data-msg="${a.id}" data-nome="${esc(a.nome)}">💬</button>${ctx.online(a.id) ? `<button class="bt" data-lig="${a.id}" data-nome="${esc(a.nome)}">📞</button>` : ''}</span></div>`).join('') : '<p>Você ainda não tem amigos. Adicione pelo menu ☰ → 👥 Amigos.</p>'}`;
      c.querySelectorAll('[data-msg]').forEach((b) => { b.onclick = () => { conversaCom = { id: b.dataset.msg, nome: b.dataset.nome }; ir('conversa'); }; });
      c.querySelectorAll('[data-lig]').forEach((b) => { b.onclick = () => voz.ligar(b.dataset.lig, b.dataset.nome).catch((e) => msg(e.message, false)); });
    } catch (e) { c.innerHTML = `${voltar}<h3>👥 Contatos</h3><p>${esc(e.message)}</p>`; }
  } else if (tela === 'conversa' && conversaCom) {
    const outro = conversaCom;
    c.innerHTML = `<button class="volta" data-ir="contatos">‹ Contatos</button><h3>💬 ${esc(outro.nome)}</h3><div class="msgs"><small>carregando…</small></div>`;
    try {
      const ms = (await rede.contatos.conversa(outro.id)) || []; if (tela !== 'conversa' || conversaCom?.id !== outro.id || !aberto) return;
      naoLidas.delete(outro.id); atualizarBadge();
      const eu = ctx.euId(), hora = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      c.innerHTML = `<button class="volta" data-ir="contatos">‹ Contatos</button><h3>💬 ${esc(outro.nome)} ${ctx.online(outro.id) ? `<button class="bt" data-lig="${outro.id}" data-nome="${esc(outro.nome)}" style="float:right;margin:0">📞</button>` : ''}</h3>
        <div class="msgs">${ms.length ? ms.map((m) => `<div class="bolha ${m.de === eu ? 'eu' : 'ele'}">${esc(m.texto)}<small>${hora(m.em)}</small></div>`).join('') : '<small style="opacity:.7">Nenhuma mensagem ainda. Diga oi!</small>'}</div>
        <div class="digitar"><input id="celTexto" maxlength="300" placeholder="Mensagem" autocomplete="off"><button class="bt" id="celEnviar" style="margin:0">➤</button></div>`;
      const enviar = () => {
        const t = $('celTexto').value.trim(); if (!t) return;
        $('celTexto').value = '';
        rede.contatos.enviar(outro.id, t).then(() => { ctx.avisarMensagem?.(outro.id); desenhar(); }).catch((e) => { msg(e.message, false); $('celTexto').value = t; });
      };
      $('celEnviar').onclick = enviar;
      $('celTexto').onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') enviar(); };
      $('celTexto').onkeyup = (ev) => ev.stopPropagation();
      c.querySelectorAll('[data-lig]').forEach((b) => { b.onclick = () => voz.ligar(b.dataset.lig, b.dataset.nome).catch((e) => msg(e.message, false)); });
      c.scrollTop = c.scrollHeight;
    } catch (e) { msg(e.message, false); }
  } else if (tela === 'ligacao') {
    const ch = chamadaUI;
    if (!ch) { tela = 'inicio'; desenhar(); return; }
    const seg = Math.floor((Date.now() - ch.t0) / 1000), dur = `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
    const estado = ch.estado === 'chamando' ? 'Chamando…' : ch.estado === 'tocando' ? '📞 Ligando para você…' : ch.conectada ? `Em ligação · ${dur}` : 'Conectando o áudio…';
    c.innerHTML = `<div class="lig"><div class="foto">🙂</div><div class="nome">${esc(ch.nome)}</div><div style="opacity:.75;margin-top:6px" id="celLigEstado">${estado}</div>
      <div class="bts">${ch.estado === 'tocando' ? '<button class="vermelho" id="celRecusar">✆</button><button class="verde" id="celAtender">📞</button>' : '<button class="vermelho" id="celDesligar">✆</button>'}</div>
      ${ch.estado === 'ativa' ? '<p><small>Microfone aberto: é só falar. Você pode fechar o celular, a ligação continua.</small></p>' : ''}</div>`;
    if ($('celAtender')) $('celAtender').onclick = () => voz.atender();
    if ($('celRecusar')) $('celRecusar').onclick = () => voz.recusar();
    if ($('celDesligar')) $('celDesligar').onclick = () => voz.desligar();
  } else if (tela === 'loja') {
    const est = ctx.estacionamentoPerto?.(), L2 = ctx.lojaOnline();
    c.innerHTML = `${voltar}<h3>🛒 Concessionária online</h3><p><small>Os mesmos carros da loja, <b>15% mais caros</b>. O carro novo já aparece no estacionamento mais perto${est ? ` (${fmt(est.dist)} m daqui)` : ''}. Pago da carteira (${fmt(ctx.moedas())}). Helicóptero só na loja.</small></p>
      <div class="cores">${L2.cores.map((k) => `<button data-cor="${k}" class="${k === corOnline ? 'sel' : ''}" style="background:${k}"></button>`).join('')}</div>
      ${L2.carros.map((k) => `<div class="card"><img class="mini" data-mini="${k.id}" alt="${esc(k.nome)}"><div class="carro"><span><b>${esc(k.nome)}</b><small>${fmt(k.preco)} · até ${k.kmh} km/h</small></span><button class="bt" data-online="${k.id}">Comprar</button></div></div>`).join('')}`;
    // fotos dos carros na cor escolhida (uma por quadro, para não travar o jogo)
    const fotos = () => { const l = [...c.querySelectorAll('[data-mini]')]; let i = 0; const um = () => { if (i >= l.length || !aberto || tela !== 'loja') return; const im = l[i++]; im.src = ctx.miniaturaCarro?.(im.dataset.mini, corOnline) || ''; requestAnimationFrame(um); }; um(); };
    fotos();
    c.querySelectorAll('[data-cor]').forEach((b) => { b.onclick = () => { corOnline = b.dataset.cor; c.querySelectorAll('[data-cor]').forEach((x) => x.classList.toggle('sel', x === b)); fotos(); }; });
    c.querySelectorAll('[data-online]').forEach((b) => { b.onclick = () => {
      if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Confirmar?'; setTimeout(() => { b.dataset.ok = ''; b.textContent = 'Comprar'; }, 3000); return; }
      executar(() => ctx.comprarOnline(b.dataset.online, corOnline), (r) => { ctx.saldoMudou?.(); return r; });
    }; });
  } else if (['escolhercel', 'lojacel', 'galeria', 'papo'].includes(tela)) {   // 22a
    await papo.desenhar(tela, c, { ctx, ir, msg, voltar, desenhar: () => desenhar(), executar });
    if (!aberto) return;
  } else if (tela === 'caixa') {
    c.innerHTML = `${voltar}<h3>💼 Caixa da empresa</h3><div class="card"><small>carregando…</small></div>`;
    try {
      const es = await ctx.minhasEmpresas(); if (tela !== 'caixa' || !aberto) return;
      c.innerHTML = `${voltar}<h3>💼 Caixa da empresa</h3><p><small>Passe dinheiro entre a sua carteira (${fmt(ctx.moedas())}) e o caixa das suas empresas.</small></p>
        ${es.length ? es.map((e) => `<div class="card"><b>🏭 ${esc(e.nome)}</b><div class="saldo">${fmt(e.caixa)}</div>
          <input type="number" min="1" inputmode="numeric" placeholder="valor" data-val="${e.id}">
          <div><button class="bt" data-edep="${e.id}">⬇️ Depositar</button><button class="bt sec" data-esac="${e.id}">⬆️ Sacar</button></div></div>`).join('') : '<p>Você não é dono de empresa.</p>'}`;
      const val = (id) => Math.floor(Number(c.querySelector(`[data-val="${id}"]`)?.value) || 0);
      c.querySelectorAll('[data-edep]').forEach((b) => { b.onclick = () => executar(() => rede.logistica.depositar(Number(b.dataset.edep), val(b.dataset.edep)), () => { ctx.saldoMudou?.(); return 'Depositado no caixa da empresa.'; }); });
      c.querySelectorAll('[data-esac]').forEach((b) => { b.onclick = () => executar(() => rede.logistica.sacar(Number(b.dataset.esac), val(b.dataset.esac)), () => { ctx.saldoMudou?.(); return 'Sacado para a sua carteira.'; }); });
    } catch (e) { c.innerHTML = `${voltar}<h3>💼 Caixa da empresa</h3><p>${esc(e.message)}</p>`; }
  }
  if (m) c.insertAdjacentHTML('afterbegin', m); else c.insertAdjacentHTML('afterbegin', '<div class="msg" id="celMsg"></div>');
  c.querySelectorAll('[data-ir]').forEach((b) => { b.onclick = () => ir(b.dataset.ir); });
  if ($('celCamera')) $('celCamera').onclick = () => ctx.abrirCamera?.();
  if ($('celEncom')) $('celEncom').onclick = () => { fechar(); ctx.abrirEncomendas?.(); };
  c.querySelectorAll('[data-ate]').forEach((b) => { b.onclick = () => { const [x, z] = b.dataset.ate.split(',').map(Number); ctx.marcar({ nome: b.dataset.nome, x, z }); msg('📍 Marcado no mapa.'); }; });
  c.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => { fechar(); ctx.abrirJanela(b.dataset.abrir); }; });
  c.querySelectorAll('[data-pneuaqui]').forEach((b) => { b.onclick = () => { ctx.trocarPneuAqui?.(); fechar?.(); }; });
  c.querySelectorAll('[data-mec]').forEach((b) => { b.onclick = () => executar(() => ctx.chamarMecanico(Number(b.dataset.mec)), (r) => r || '🔧 O mecânico está trazendo o veículo.'); });
}

// ---------------------------------------------------------------- 👥 Contatos: mensagens não lidas e ligação
const totalNaoLidas = () => [...naoLidas.values()].reduce((a, b) => a + b, 0);
function atualizarBadge() {
  const b = $('btCelular'); if (!b) return;
  let el = b.querySelector('.badge'); const n = totalNaoLidas() + (chamadaUI?.estado === 'tocando' ? 1 : 0);
  if (!n) { el?.remove(); return; }
  if (!el) { el = document.createElement('span'); el.className = 'badge'; b.appendChild(el); }
  el.textContent = n;
}
export async function recarregarNaoLidas() {
  try { const l = (await rede.contatos.naoLidas()) || []; naoLidas = new Map(l.map((x) => [x.de, x.n])); } catch { return; }
  atualizarBadge();
  if (aberto && tela === 'inicio') desenhar(true);
}
// chegou mensagem (aviso pelo canal da cidade): atualiza a conversa aberta ou mostra o aviso
export async function mensagemChegou(de, nome) {
  if (aberto && tela === 'conversa' && conversaCom?.id === de) { desenhar(); return; }
  await recarregarNaoLidas();
  if (aberto && tela === 'contatos') desenhar(true);
  ctx.aviso?.(`💬 Mensagem de ${nome || 'um amigo'}. Abra o 📱 → 👥 Contatos.`, 3.5);
}
function tocar(on) {
  // 20j: com o som do jogo ligado toca o toque do Fator RP (quem está perto também ouve, mais baixo); senão, o bipe
  const doJogo = ctx.toqueCelular?.(on);
  if (doJogo && on) { if (toque) { clearInterval(toque.i); toque.ac.close?.().catch(() => {}); toque = null; } return; }
  if (!on) { if (toque) { clearInterval(toque.i); toque.ac.close?.().catch(() => {}); toque = null; } return; }
  if (toque) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const bip = () => { for (const [t, f] of [[0, 880], [0.25, 660]]) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.value = 0.08; o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.2); } };
    bip(); toque = { ac, i: setInterval(bip, 1600) };
  } catch { /* sem áudio */ }
}
// a ligação mudou de estado (voz.js avisa): abre a tela da ligação, toca, mostra o tempo
export function chamadaMudou(ch, motivo) {
  chamadaUI = ch;
  tocar(ch?.estado === 'tocando');
  atualizarBadge();
  clearInterval(relogioLig); relogioLig = null;
  if (ch) {
    if (!aberto) { ctx.abrirParaLigacao?.(); aberto = true; modoPc = false; $('celular').classList.remove('pc'); $('celSinal').textContent = '📶 🔋'; $('celular').classList.remove('oculto'); $('celFundo').classList.remove('oculto'); }
    tela = 'ligacao'; desenhar();
    if (ch.estado === 'ativa') relogioLig = setInterval(() => { if (aberto && tela === 'ligacao') desenhar(); }, 1000);
    if (ch.estado === 'tocando') ctx.aviso?.(`📞 ${ch.nome} está ligando!`, 3);
  } else {
    if (aberto && tela === 'ligacao') { tela = 'inicio'; desenhar(); }
    ctx.aoFimLigacao?.();
    if (motivo) ctx.aviso?.(`📞 ${motivo}`, 3.5);
  }
}
