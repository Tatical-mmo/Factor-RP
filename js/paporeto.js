// 22a: 📱 celular de verdade, 🖼️ Galeria, 📱 Loja de celulares e 💬 Papo Reto (a rede social dos personagens).
// As telas desenham dentro do celular (celular.js chama desenhar). As fotos tiradas com a 📷 Câmera ficam na Galeria
// deste aparelho (IndexedDB); ao postar, a foto sobe para o bucket "papo" do Supabase.
import * as rede from './rede.js';

export const CELULARES = [
  { id: 'vision', nome: 'Midnight Vision', info: '4 câmeras redondas' },
  { id: 'shield', nome: 'Midnight Shield', info: 'câmera em barra' },
  { id: 'crest', nome: 'Midnight Crest', info: '3 câmeras quadradas' },
];
export const PRECO_CELULAR = 2500;
const MOTIVOS = [['ofensa', 'Ofensa'], ['nudez', 'Conteúdo adulto'], ['violencia', 'Violência'], ['spam', 'Spam'], ['outro', 'Outro']];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const $ = (id) => document.getElementById(id);

export const CSS = `
#celular .corpo button.bt{white-space:nowrap;width:auto;display:inline-block}
#celular .esc{display:flex;gap:10px;align-items:center;cursor:pointer}
#celular .esc img{width:46px;height:94px;object-fit:contain;flex:none}
#celular .esc.sel{border-color:#2ea043;box-shadow:0 0 0 1px #2ea043}
#celular .preco{color:#3fb950;font-weight:800}
#celular .grade3{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:8px}
#celular .grade3 img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:3px;cursor:pointer;background:#161b22}
#celular .pr{margin:-10px -14px -14px;padding:0 12px 56px;min-height:100%;background:#101418;position:relative}
#celular .prTopo{display:flex;justify-content:space-between;align-items:center;padding:8px 2px;border-bottom:1px solid #222a33;position:sticky;top:-10px;background:#101418;z-index:1}
#celular .logoPR{font-weight:900;font-size:19px;letter-spacing:-.5px;background:linear-gradient(90deg,#ffd166,#ef476f);-webkit-background-clip:text;background-clip:text;color:transparent}
#celular .abas{display:flex;gap:6px;margin:8px 0}
#celular .abas button{flex:1;background:#1b2128;border:1px solid #2b3138;color:#c9d1d9;border-radius:9px;padding:6px;font-size:12.5px}
#celular .abas button.on{background:#2b3138;color:#ffd166;font-weight:700}
#celular .post{margin:10px 0 14px}
#celular .cab{display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer}
#celular .av{width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #ffd166;flex:none;background:#30363d;display:flex;align-items:center;justify-content:center;font-size:16px}
#celular .avG{margin:0 auto;width:78px;height:78px;border-radius:50%;object-fit:cover;border:3px solid #ffd166;flex:none;background:#30363d;display:flex;align-items:center;justify-content:center;font-size:36px}
#celular .ft{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:10px;margin-top:6px;background:#161b22;display:block}
#celular .acoes{display:flex;gap:16px;font-size:14px;margin-top:6px;align-items:center}
#celular .acoes button{background:none;border:0;color:#e8edf3;font-size:14px;padding:0}
#celular .leg2{font-size:12.5px;margin-top:4px;word-wrap:break-word}
#celular .navPR{position:sticky;bottom:-14px;margin:0 -12px;height:46px;background:#0b0e12;border-top:1px solid #222a33;display:flex;justify-content:space-around;align-items:center}
#celular .navPR button{background:none;border:0;font-size:20px;padding:6px 10px}
#celular .nums{display:flex;gap:12px;text-align:center;font-size:11px}
#celular .nums b{display:block;font-size:15px}
#celular textarea,#celular select{width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #30363d;color:#e8edf3;border-radius:10px;padding:8px;font-size:14px;margin-top:6px;font-family:inherit}
#celular label{font-size:11.5px;opacity:.75;display:block;margin-top:6px}
#celular .com{font-size:13px;margin:6px 0;display:flex;gap:6px;align-items:flex-start}
#celular .com .av{width:24px;height:24px;font-size:12px}
#celular .tag{font-size:10.5px;background:#2b3138;border-radius:6px;padding:1px 6px;margin-left:4px;opacity:.85}
`;

// ---------------------------------------------------------------- 🖼️ Galeria (no aparelho)
let bancoP = null;
function banco() {
  bancoP ||= new Promise((ok, erro) => {
    const r = window.indexedDB.open('fr_galeria', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fotos', { keyPath: 'id' });
    r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
  });
  return bancoP;
}
async function tx(modo, fn) { const db = await banco(); return new Promise((ok, erro) => { const t = db.transaction('fotos', modo); const r = fn(t.objectStore('fotos')); t.oncomplete = () => ok(r?.result); t.onerror = () => erro(t.error); }); }
export async function salvarFoto(blob, local) {
  const id = Date.now();
  await tx('readwrite', (s) => s.put({ id, blob, local: local || '' }));
  const todas = await listarFotos(); if (todas.length > 40) for (const f of todas.slice(40)) await tx('readwrite', (s) => s.delete(f.id));   // guarda as 40 mais novas
  return id;
}
export async function listarFotos() { try { const l = (await tx('readonly', (s) => s.getAll())) || []; return l.sort((a, b) => b.id - a.id); } catch { return []; } }
const urls = new Map();
const urlDe = (f) => { if (!urls.has(f.id)) urls.set(f.id, URL.createObjectURL(f.blob)); return urls.get(f.id); };
export async function ultimaFotoUrl() { const l = await listarFotos(); return l[0] ? urlDe(l[0]) : null; }

// ---------------------------------------------------------------- telas
let papoV = { v: 'feed', modo: 'todos' }, fotoSel = null, escolhido = null, meuPerfil;
const tempo = (t) => { const s = (Date.now() - Date.parse(t)) / 1000; return s < 60 ? 'agora' : s < 3600 ? `há ${Math.floor(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} d`; };
const avatar = (url, cls = 'av') => (url ? `<img class="${cls}" src="${esc(url)}" alt="">` : `<span class="${cls}">🙂</span>`);
export function abrirPapo(v) { papoV = v || { v: 'feed', modo: 'todos' }; }

export async function desenhar(tela, c, u) {
  const { ctx, ir, msg } = u;
  if (tela === 'escolhercel' || tela === 'lojacel') {
    const tenho = ctx.celulares(), atual = ctx.celular(), primeiro = !atual;
    escolhido ||= atual || 'vision';
    c.innerHTML = `${primeiro ? '' : u.voltar}<h3>📱 ${primeiro ? 'Escolha o seu celular' : 'Loja de celulares'}</h3>
      <p><small>${primeiro ? 'O primeiro é de graça. Depois dá para comprar outro modelo aqui na Loja de celulares.' : `Cada modelo custa ${fmt(PRECO_CELULAR)} (da carteira: ${fmt(ctx.moedas())}). Os que você já tem, é só usar.`}</small></p>
      ${CELULARES.map((m) => `<div class="card esc ${(primeiro ? escolhido === m.id : atual === m.id) ? 'sel' : ''}" data-cel="${m.id}"><img src="assets/celulares/${m.id}.webp" alt=""><div style="flex:1"><b>${m.nome}</b><small>${m.info}</small>
        <div>${primeiro ? (escolhido === m.id ? '<span class="preco">✔ escolhido</span>' : '') : atual === m.id ? '<span class="preco">✔ o seu</span>' : tenho.includes(m.id) ? `<button class="bt sec" data-usar="${m.id}">Usar</button>` : `<span class="preco">${fmt(PRECO_CELULAR)}</span><button class="bt" data-comprar="${m.id}" style="padding:5px 10px;margin:0 0 0 8px">Comprar</button>`}</div></div></div>`).join('')}
      ${primeiro ? '<button class="bt" id="celFicar" style="width:100%;background:#2ea043">Ficar com este</button><p><small>O modelo aparece na mão do personagem quando ele usa o celular, tira foto ou faz selfie.</small></p>' : ''}`;
    if (primeiro) {
      c.querySelectorAll('[data-cel]').forEach((b) => { b.onclick = () => { escolhido = b.dataset.cel; u.desenhar(); }; });
      $('celFicar').onclick = () => u.executar(async () => { await rede.papo.escolherCelular(escolhido); ctx.celularMudou(escolhido, [escolhido]); u.ir('inicio'); }, '📱 Celular escolhido!');
    }
    c.querySelectorAll('[data-usar]').forEach((b) => { b.onclick = () => u.executar(async () => { await rede.papo.escolherCelular(b.dataset.usar); ctx.celularMudou(b.dataset.usar); }, '📱 Trocado!'); });
    c.querySelectorAll('[data-comprar]').forEach((b) => { b.onclick = () => {
      if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Confirmar?'; setTimeout(() => { b.dataset.ok = ''; b.textContent = 'Comprar'; }, 3000); return; }
      u.executar(async () => { await rede.papo.comprarCelular(b.dataset.comprar); ctx.celularMudou(b.dataset.comprar, [...ctx.celulares(), b.dataset.comprar]); ctx.saldoMudou?.(); }, '📱 Celular novo comprado!');
    }; });
    return;
  }
  if (tela === 'galeria') {
    const l = await listarFotos();
    if (fotoSel) {
      const f = l.find((x) => x.id === fotoSel); if (!f) { fotoSel = null; u.desenhar(); return; }
      c.innerHTML = `<button class="volta" id="galVolta">‹ Galeria</button><img class="ft" src="${urlDe(f)}" alt="">
        ${f.local ? `<small>📍 ${esc(f.local)}</small>` : ''}
        <div><button class="bt" id="galPostar">💬 Postar no Papo Reto</button><button class="bt sec" id="galPerfil">👤 Usar no perfil</button>
        <button class="bt sec" id="galBaixar">⬇️ Baixar</button><button class="bt sec" id="galApagar">🗑️ Apagar</button></div>`;
      $('galVolta').onclick = () => { fotoSel = null; u.desenhar(); };
      $('galPostar').onclick = () => { papoV = { v: 'postar', foto: f.id }; ir('papo'); };
      $('galPerfil').onclick = () => { papoV = { v: 'editar', foto: f.id }; ir('papo'); };
      $('galBaixar').onclick = () => { const a = document.createElement('a'); a.href = urlDe(f); a.download = `fator-rp-${f.id}.jpg`; a.click(); };
      $('galApagar').onclick = async () => { await tx('readwrite', (s) => s.delete(f.id)); fotoSel = null; u.desenhar(); };
      return;
    }
    c.innerHTML = `${u.voltar}<h3>🖼️ Galeria</h3><p><small>As fotos da 📷 Câmera ficam aqui (neste aparelho, até 40). Toque numa para postar, usar no perfil ou baixar.</small></p>
      ${l.length ? `<div class="grade3">${l.map((f) => `<img src="${urlDe(f)}" data-foto="${f.id}" alt="">`).join('')}</div>` : '<p>Nenhuma foto ainda. Abra a 📷 Câmera!</p>'}
      <div><button class="bt" id="galCam">📷 Abrir a Câmera</button></div>`;
    c.querySelectorAll('[data-foto]').forEach((b) => { b.onclick = () => { fotoSel = Number(b.dataset.foto); u.desenhar(); }; });
    $('galCam').onclick = () => ctx.abrirCamera();
    return;
  }
  if (tela !== 'papo') return;
  // ---- 💬 Papo Reto
  const nav = `<div class="navPR"><button data-pv="feed">🏠</button><button data-pv="busca">🔍</button><button data-pv="novo">➕</button><button data-pv="eu">👤</button></div>`;
  const ligar = () => {
    c.querySelectorAll('[data-pv]').forEach((b) => { b.onclick = () => {
      const k = b.dataset.pv; papoV = k === 'feed' ? { v: 'feed', modo: papoV.modo || 'todos' } : k === 'busca' ? { v: 'busca' } : k === 'novo' ? { v: 'escolherFoto' } : { v: 'perfil', usuario: '' }; u.desenhar();
    }; });
    c.querySelectorAll('[data-u]').forEach((b) => { b.onclick = () => { papoV = { v: 'perfil', usuario: b.dataset.u }; u.desenhar(); }; });
    c.querySelectorAll('[data-curtir]').forEach((b) => { b.onclick = async () => {
      const sim = b.dataset.on !== '1';
      try { const n = await rede.papo.curtir(Number(b.dataset.curtir), sim); b.dataset.on = sim ? '1' : ''; b.innerHTML = `${sim ? '🔥' : '🤍'} ${n}`; } catch (e) { msg(e.message, false); }
    }; });
    c.querySelectorAll('[data-com]').forEach((b) => { b.onclick = () => { papoV = { v: 'com', post: Number(b.dataset.com), de: papoV }; u.desenhar(); }; });
    c.querySelectorAll('[data-denunciar]').forEach((b) => { b.onclick = () => { const d = c.querySelector(`[data-den="${b.dataset.denunciar}"]`); if (d) d.style.display = d.style.display === 'none' ? '' : 'none'; }; });
    c.querySelectorAll('[data-mot]').forEach((b) => { b.onclick = async () => {
      try { await rede.papo.denunciar(Number(b.dataset.post), b.dataset.mot); b.parentElement.innerHTML = '<small>🚩 Denúncia enviada para a equipe. Obrigado!</small>'; } catch (e) { msg(e.message, false); }
    }; });
    c.querySelectorAll('[data-apagar]').forEach((b) => { b.onclick = () => {
      if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Apagar mesmo?'; return; }
      u.executar(() => rede.papo.apagar(Number(b.dataset.apagar)), '🗑️ Post apagado.');
    }; });
  };
  const posts = (l, eu) => l.map((p) => `<div class="post"><div class="cab" data-u="${esc(p.usuario)}">${avatar(p.avatar)}<div><b>${esc(p.usuario)}</b>${p.publico ? '' : '<span class="tag">👥 seguidores</span>'}<br><small>${esc(p.local || 'Fator RP')} · ${tempo(p.criado)}</small></div></div>
    <img class="ft" src="${esc(p.foto)}" loading="lazy" alt="">
    <div class="acoes"><button data-curtir="${p.id}" data-on="${p.curti ? '1' : ''}">${p.curti ? '🔥' : '🤍'} ${p.curtidas}</button>${p.comentarios !== 'ninguem' || p.ncom ? `<button data-com="${p.id}">💬 ${p.ncom}</button>` : '<small style="opacity:.6">🔒 sem comentários</small>'}
      <span style="margin-left:auto">${p.autor !== eu ? `<button data-denunciar="${p.id}" style="font-size:12px;opacity:.7" title="Denunciar">🚩</button>` : ''}${p.autor === eu || ctx.moderador() ? `<button data-apagar="${p.id}" style="font-size:12px;opacity:.7;margin-left:10px">🗑️</button>` : ''}</span></div>
    <div class="denuncia" data-den="${p.id}" style="display:none"><small>Denunciar por:</small><br>${MOTIVOS.map(([k, t]) => `<button class="bt sec" data-mot="${k}" data-post="${p.id}" style="padding:4px 8px;font-size:12px">${t}</button>`).join('')}</div>
    ${p.legenda ? `<div class="leg2"><b>${esc(p.usuario)}</b> ${esc(p.legenda)}</div>` : ''}</div>`).join('');
  const topo = (t, voltarPara) => `<div class="prTopo">${voltarPara ? `<button class="volta" id="prVolta" style="margin:0">‹</button>` : '<button class="volta" data-ir="inicio" style="margin:0">‹ Início</button>'}${t}<span style="width:40px"></span></div>`;
  const ligarVolta = (para) => { const b = $('prVolta'); if (b) b.onclick = () => { papoV = para; u.desenhar(); }; };
  c.innerHTML = `<div class="pr">${topo('<span class="logoPR">Papo Reto</span>')}<p><small>carregando…</small></p></div>`;
  try {
    if (meuPerfil === undefined || papoV.v === 'editar') meuPerfil = await rede.papo.perfil('');
    if (!meuPerfil && papoV.v !== 'editar') papoV = { v: 'editar' };
    const eu = meuPerfil?.id;
    if (papoV.v === 'editar') {
      const f = papoV.foto ? (await listarFotos()).find((x) => x.id === papoV.foto) : null, p = meuPerfil || {};
      c.innerHTML = `<div class="pr">${topo(`<b>${meuPerfil ? 'Editar perfil' : 'Criar perfil'}</b>`, meuPerfil ? { v: 'perfil', usuario: '' } : null)}
        <div style="text-align:center;margin-top:10px">${f ? `<img class="avG" src="${urlDe(f)}" style="margin:0 auto">` : avatar(p.foto, 'avG')}<br><small>${f ? 'foto nova escolhida' : '📷 escolha uma selfie na 🖼️ Galeria para o perfil'}</small>
        ${f ? '' : '<div><button class="bt sec" id="prGal">🖼️ Galeria</button><button class="bt sec" id="prCam">📷 Câmera</button></div>'}</div>
        <label>Nome do personagem</label><input id="prNome" maxlength="30" value="${esc(p.nome || ctx.nome())}">
        <label>@usuário (letras, números, ponto e _)</label><input id="prUser" maxlength="21" value="${esc(p.usuario ? '@' + p.usuario : '')}" placeholder="@seu.nome">
        <label>Idade do personagem</label><input id="prIdade" type="number" min="12" max="99" inputmode="numeric" value="${p.idade || ''}" placeholder="27">
        <label>Bio</label><textarea id="prBio" rows="3" maxlength="150" placeholder="Quem é o seu personagem?">${esc(p.bio || '')}</textarea>
        <button class="bt" id="prSalvar" style="width:100%;background:#2ea043">${meuPerfil ? 'Salvar' : 'Criar perfil'}</button></div>`;
      ligarVolta({ v: 'perfil', usuario: '' });
      if ($('prGal')) $('prGal').onclick = () => ir('galeria');
      if ($('prCam')) $('prCam').onclick = () => ctx.abrirCamera('selfie');
      for (const id of ['prNome', 'prUser', 'prIdade', 'prBio']) { $(id).onkeydown = (ev) => ev.stopPropagation(); $(id).onkeyup = (ev) => ev.stopPropagation(); }
      $('prSalvar').onclick = () => u.executar(async () => {
        const usuario = $('prUser').value.trim().replace(/^@/, '').toLowerCase();
        if (!/^[a-z0-9._]{3,20}$/.test(usuario)) throw new Error('O @usuário precisa de 3 a 20 letras, números, ponto ou _.');
        const idade = Math.floor(Number($('prIdade').value)); if (!(idade >= 12 && idade <= 99)) throw new Error('Idade de 12 a 99 anos.');
        const nome = $('prNome').value.trim(); if (nome.length < 2) throw new Error('Escreva o nome do personagem.');
        if (!f && !meuPerfil) throw new Error('Escolha uma foto para o perfil (tire uma selfie 📷).');
        const foto = f ? await rede.papo.enviarFoto(f.blob) : null;
        await rede.papo.salvarPerfil(usuario, nome, idade, $('prBio').value, foto);
        meuPerfil = await rede.papo.perfil(''); papoV = { v: 'perfil', usuario: '' };
      }, '✅ Perfil salvo!');
      return;
    }
    if (papoV.v === 'feed') {
      const l = await rede.papo.feed(papoV.modo);
      c.innerHTML = `<div class="pr">${topo('<span class="logoPR">Papo Reto</span>')}
        <div class="abas"><button data-modo="todos" class="${papoV.modo === 'todos' ? 'on' : ''}">🌎 Para todos</button><button data-modo="seguindo" class="${papoV.modo === 'seguindo' ? 'on' : ''}">👥 Seguindo</button></div>
        ${l.length ? posts(l, eu) : `<p><small>${papoV.modo === 'todos' ? 'Ninguém postou ainda. Seja o primeiro: toque em ➕.' : 'Siga alguém (🔍) para ver os posts aqui.'}</small></p>`}${nav}</div>`;
      c.querySelectorAll('[data-modo]').forEach((b) => { b.onclick = () => { papoV = { v: 'feed', modo: b.dataset.modo }; u.desenhar(); }; });
      ligar(); return;
    }
    if (papoV.v === 'perfil') {
      const p = papoV.usuario ? await rede.papo.perfil(papoV.usuario) : meuPerfil;
      if (!p) { c.innerHTML = `<div class="pr">${topo('<b>Perfil</b>', { v: 'feed', modo: 'todos' })}<p>Perfil não encontrado.</p>${nav}</div>`; ligarVolta({ v: 'feed', modo: 'todos' }); ligar(); return; }
      c.innerHTML = `<div class="pr">${topo(`<b>@${esc(p.usuario)}</b>`, { v: 'feed', modo: papoV.modo || 'todos' })}
        <div style="display:flex;gap:12px;align-items:center;margin-top:8px">${avatar(p.foto, 'avG').replace('class="avG"', 'class="avG" style="margin:0"')}<div class="nums"><div><b>${p.nposts}</b>posts</div><div><b>${p.seguidores}</b>seguidores</div><div><b>${p.seguindo}</b>seguindo</div></div></div>
        <div style="margin-top:8px;font-size:13px"><b>${esc(p.nome)}</b> · ${p.idade} anos<br>${esc(p.bio).replace(/\n/g, '<br>')}</div>
        <div style="display:flex;gap:6px">${p.eu ? '<button class="bt sec" id="prEditar" style="flex:1">✏️ Editar perfil</button>' : `<button class="bt" id="prSeguir" style="flex:1;${p.sigo ? 'background:#2b3138' : 'background:#2ea043'}">${p.sigo ? 'Seguindo ✔' : 'Seguir'}</button>`}</div>
        ${p.posts.length ? `<div class="grade3">${p.posts.map((x) => `<img src="${esc(x.foto)}" data-ver="${x.id}" loading="lazy" alt="">`).join('')}</div>` : '<p><small>Nenhum post ainda.</small></p>'}${nav}</div>`;
      ligarVolta({ v: 'feed', modo: 'todos' });
      if ($('prEditar')) $('prEditar').onclick = () => { papoV = { v: 'editar' }; u.desenhar(); };
      if ($('prSeguir')) $('prSeguir').onclick = () => u.executar(() => rede.papo.seguir(p.usuario, !p.sigo), p.sigo ? 'Deixou de seguir.' : `Seguindo @${p.usuario}!`);
      c.querySelectorAll('[data-ver]').forEach((b) => { b.onclick = () => { papoV = { v: 'post', post: p.posts.find((x) => x.id === Number(b.dataset.ver)), de: { v: 'perfil', usuario: papoV.usuario } }; u.desenhar(); }; });
      ligar(); return;
    }
    if (papoV.v === 'post') {
      c.innerHTML = `<div class="pr">${topo('<b>Post</b>', papoV.de)}${posts([papoV.post], eu)}${nav}</div>`;
      ligarVolta(papoV.de); ligar(); return;
    }
    if (papoV.v === 'busca') {
      c.innerHTML = `<div class="pr">${topo('<b>🔍 Buscar</b>', { v: 'feed', modo: 'todos' })}<input id="prBusca" placeholder="nome ou @usuário" autocomplete="off"><div id="prRes"></div>${nav}</div>`;
      ligarVolta({ v: 'feed', modo: 'todos' });
      const b = $('prBusca'); let t = 0;
      b.onkeydown = (ev) => ev.stopPropagation();
      b.onkeyup = (ev) => { ev.stopPropagation(); clearTimeout(t); t = setTimeout(async () => {
        try { const l = await rede.papo.buscar(b.value.trim()); $('prRes').innerHTML = l.map((x) => `<div class="card cab" data-u="${esc(x.usuario)}">${avatar(x.foto)}<div><b>@${esc(x.usuario)}</b><br><small>${esc(x.nome)}</small></div></div>`).join('') || '<p><small>Ninguém encontrado.</small></p>'; ligar(); } catch (e) { msg(e.message, false); }
      }, 300); };
      ligar(); b.focus(); return;
    }
    if (papoV.v === 'escolherFoto') {
      const l = await listarFotos();
      c.innerHTML = `<div class="pr">${topo('<b>Nova postagem</b>', { v: 'feed', modo: 'todos' })}<p><small>Escolha uma foto da Galeria ou tire uma agora.</small></p>
        <button class="bt" id="prCam">📷 Abrir a Câmera</button>${l.length ? `<div class="grade3">${l.map((f) => `<img src="${urlDe(f)}" data-foto="${f.id}" alt="">`).join('')}</div>` : ''}${nav}</div>`;
      ligarVolta({ v: 'feed', modo: 'todos' });
      $('prCam').onclick = () => ctx.abrirCamera();
      c.querySelectorAll('[data-foto]').forEach((b) => { b.onclick = () => { papoV = { v: 'postar', foto: Number(b.dataset.foto) }; u.desenhar(); }; });
      ligar(); return;
    }
    if (papoV.v === 'postar') {
      const f = (await listarFotos()).find((x) => x.id === papoV.foto); if (!f) { papoV = { v: 'escolherFoto' }; u.desenhar(); return; }
      c.innerHTML = `<div class="pr">${topo('<b>Nova postagem</b>', { v: 'escolherFoto' })}
        <img class="ft" src="${urlDe(f)}" alt="" style="width:60%;margin:8px auto 0">
        <label>Legenda</label><textarea id="prLeg" rows="3" maxlength="220" placeholder="Escreva algo…"></textarea>
        <small>📍 ${esc(f.local || ctx.local())}</small>
        <label>Quem vê</label><select id="prVis"><option value="1">🌎 Todos</option><option value="0">👥 Só seguidores</option></select>
        <label>Quem pode comentar</label><select id="prComs"><option value="todos">Todos</option><option value="seguidores">Só seguidores</option><option value="ninguem">Ninguém</option></select>
        <button class="bt" id="prPub" style="width:100%;background:#2ea043;margin-top:10px">Postar</button></div>`;
      ligarVolta({ v: 'escolherFoto' });
      $('prLeg').onkeydown = (ev) => ev.stopPropagation(); $('prLeg').onkeyup = (ev) => ev.stopPropagation();
      $('prVis').onchange = () => { if ($('prVis').value === '0' && $('prComs').value === 'todos') $('prComs').value = 'seguidores'; };
      $('prPub').onclick = () => { $('prPub').disabled = true; u.executar(async () => {
        try {
          const url = await rede.papo.enviarFoto(f.blob);
          await rede.papo.postar(url, $('prLeg').value, f.local || ctx.local(), $('prVis').value === '1', $('prComs').value);
          papoV = { v: 'feed', modo: $('prVis').value === '1' ? 'todos' : 'seguindo' };
        } finally { const b = $('prPub'); if (b) b.disabled = false; }
      }, '✅ Postado!'); };
      return;
    }
    if (papoV.v === 'com') {
      const l = await rede.papo.comentarios(papoV.post), de = papoV.de || { v: 'feed', modo: 'todos' };
      c.innerHTML = `<div class="pr">${topo('<b>💬 Comentários</b>', de)}
        ${l.length ? l.map((x) => `<div class="com">${avatar(x.avatar)}<div style="flex:1"><b data-u="${esc(x.usuario)}" style="cursor:pointer">${esc(x.usuario)}</b> ${esc(x.texto)}<br><small>${tempo(x.criado)}</small></div>${x.meu ? `<button class="volta" data-apcom="${x.id}" style="margin:0">🗑️</button>` : ''}</div>`).join('') : '<p><small>Nenhum comentário ainda.</small></p>'}
        <div class="digitar"><input id="prCom" maxlength="200" placeholder="Comentar…" autocomplete="off"><button class="bt" id="prEnv" style="margin:0">➤</button></div></div>`;
      ligarVolta(de); ligar();
      c.querySelectorAll('[data-apcom]').forEach((b) => { b.onclick = () => u.executar(() => rede.papo.apagarComentario(Number(b.dataset.apcom)), 'Comentário apagado.'); });
      const enviar = () => { const t = $('prCom').value.trim(); if (!t) return; u.executar(() => rede.papo.comentar(papoV.post, t), '💬 Comentado!'); };
      $('prEnv').onclick = enviar;
      $('prCom').onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') enviar(); };
      $('prCom').onkeyup = (ev) => ev.stopPropagation();
    }
  } catch (e) { c.innerHTML = `<div class="pr">${topo('<span class="logoPR">Papo Reto</span>')}<p>${esc(e.message)}</p>${nav}</div>`; ligar(); }
}
export function esquecerPerfil() { meuPerfil = undefined; }
