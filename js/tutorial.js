// Tutorial do jogo: aparece sozinho na primeira vez que o jogador entra e pode ser revisto no menu (📖 Tutorial).
// Páginas curtas (cabem na tela do celular), com Voltar / Próximo / Pular.
const CHAVE = 'fator_tutorial_v1';

const PAGINAS = [
  { ic: '👋', t: 'Bem-vindo a Fator RP', h: `<p>Uma cidade brasileira online: você mora, trabalha, abre empresa, faz política… ou se mete em confusão. Tudo o que você faz fica salvo e os outros jogadores veem.</p>
    <p>Este guia rápido mostra o essencial. Dá para rever quando quiser em <b>☰ Menu → 📖 Tutorial</b>.</p>` },
  { ic: '🎮', t: 'Controles', h: `<ul>
    <li><b>Joystick</b> (canto esquerdo): anda. Puxe até o fim para correr.</li>
    <li><b>Botão de ação</b>: muda com o lugar — Entrar, Pegar, Dirigir, Comprar, Socorrer… Chegue perto das coisas e veja o que ele diz.</li>
    <li><b>Soco</b>, <b>Arma</b> e <b>🦘 Pular</b> (pula muretas e carros baixos).</li>
    <li><b>Extra</b>: aparece quando dá para fazer algo especial ali (como crimes de clã).</li>
    <li><b>⟲ ⟳</b> giram a câmera. <b>💬</b> abre o chat e <b>☰</b> o menu.</li>
    <li>No computador: <b>WASD</b> anda, <b>E</b> ação, <b>Q</b> arma, <b>espaço</b> pula, <b>Enter</b> chat.</li></ul>` },
  { ic: '❤️', t: 'Vida e fome', h: `<ul>
    <li>Fique de olho nas barras de <b>Vida</b> e <b>Fome</b>. Com fome você fica lento: coma (chocolate, cereal) da <b>Loja</b>.</li>
    <li>O <b>remédio</b> da loja é caro (3.000). Vá ao <b>Hospital</b>: o tratamento é barato e os médicos medicam de graça lá dentro.</li>
    <li>Caiu ferido? Um <b>médico</b> ou a <b>ambulância</b> pode te socorrer. Sem socorro, você acorda no hospital.</li></ul>` },
  { ic: '💼', t: 'Empregos e carreiras', h: `<p>No menu <b>💼 Trabalho</b> estão todas as profissões. Você entra em serviço no balcão de cada uma, ganha <b>salário por minuto</b> e sobe de patente com o tempo.</p>
    <ul><li>🚓 Polícia · 🛡 PRF · 💀 BOPE (por indicação) · 🎖️ Exército</li>
    <li>✚ Hospital · 🚒 Bombeiros · 📰 Jornalista</li>
    <li>🚌 Motorista de ônibus · ✈️ Piloto · 🗼 Controlador de voo · 🔧 Mecânico de aviões</li>
    <li>♻️ Gari · 🧾 Fiscal da Rodoviária</li></ul>
    <p>Várias pedem <b>carteira da Autoescola</b> (B, C, D ou brevê) e <b>ficha limpa</b>.</p>` },
  { ic: '🏦', t: 'Dinheiro e banco', h: `<ul>
    <li>No <b>Banco Central</b> você guarda dinheiro na <b>poupança</b> e pega <b>empréstimos</b>.</li>
    <li>A <b>Agência de Empregos</b> mostra vagas nas empresas dos outros jogadores.</li>
    <li>No <b>Ferro-velho</b> dá para juntar e vender sucata.</li>
    <li>Fique de olho no <b>🏆 Metas</b>: tarefas que dão prêmios.</li></ul>` },
  { ic: '🏢', t: 'Empresas e licitações', h: `<ul>
    <li>No menu <b>🏢 Empresa</b> você abre a sua: compra um lote, produz e entrega caixas, contrata funcionários (jogadores ou robôs) e sobe de nível.</li>
    <li>Fábricas produzem; <b>transportadoras</b> levam a carga com caminhões e helicóptero.</li>
    <li>As transportadoras disputam a <b>licitação do Exército</b>: o contrato para levar as rações (jujubas) até os quartéis.</li></ul>` },
  { ic: '🏠', t: 'Casas, carros e viagens', h: `<ul>
    <li>Compre ou alugue uma <b>casa</b> (tem até nas favelas dos morros). Dentro dela você descansa e recupera a vida.</li>
    <li>A <b>Concessionária</b> vende carros (até 3 por jogador). Tire a carteira na <b>Autoescola</b>.</li>
    <li><b>Ônibus</b>, <b>trem</b> e <b>aviões</b> ligam a Metrópole às outras cidades.</li></ul>` },
  { ic: '🏛️', t: 'Prefeitura e política', h: `<ul>
    <li>A cada mandato tem <b>eleição</b>: candidate-se ou vote na <b>urna</b>, dentro da Prefeitura.</li>
    <li>O <b>prefeito</b> recebe o orçamento público: aumenta o salário dos servidores, faz <b>obras</b> (CRAS, Câmara dos Vereadores, Varredores) e doações.</li>
    <li>Tudo o que ele faz com o dinheiro aparece no computador da <b>PRF</b> e para os <b>jornalistas</b>. Desviar verba é crime!</li>
    <li>No <b>CRAS</b>, a atendente inscreve até 20 pessoas por mandato, que ganham uma doação a cada ciclo.</li>
    <li>Na <b>Câmara</b>, os 10 vereadores mais votados recebem salário.</li></ul>` },
  { ic: '⚔️', t: 'Clãs e crime', h: `<ul>
    <li>No menu <b>⚔️ Clã</b> você cria ou entra num clã: QG, arsenal e <b>territórios</b> para dominar.</li>
    <li>Clãs podem sequestrar ônibus e caminhões, assaltar, arrombar e incendiar carros…</li>
    <li>Cada crime dá <b>estrelas ★</b>: a polícia, a PRF e os robôs vão atrás de você. Preso, você cumpre pena ou paga fiança.</li>
    <li>Escondido e sem perseguição, as estrelas somem com o tempo.</li></ul>` },
  { ic: '✨', t: 'Eventos e segredos', h: `<ul>
    <li><b>Arma dourada</b>: a equipe esconde em algum lugar da cidade. Quem achar tem 2 balas poderosas, e quem cai vai para o purgatório.</li>
    <li><b>Pedra preciosa</b>: quem achar invoca o <b>Bruxo</b>, que concede UM pedido: voar como pássaro, perdão dos crimes, uma fortuna ou a arma dourada.</li>
    <li>Fique atento aos avisos de <b>EVENTO</b> e ao <b>📰 Jornal</b>. A cidade ainda guarda outros mistérios…</li></ul>` },
  { ic: '🎉', t: 'Pronto para começar!', h: `<p>Dicas para o começo:</p><ul>
    <li>Arrume um emprego no <b>💼 Trabalho</b> para ganhar dinheiro desde o início.</li>
    <li>Adicione <b>👥 Amigos</b> e converse no <b>💬 chat</b>.</li>
    <li>Respeite os outros jogadores: a equipe está de olho.</li></ul><p><b>Bom jogo! 🇧🇷</b></p>` },
];

let el = null, pag = 0;
function montar() {
  el = document.createElement('div'); el.id = 'tutorialJanela'; el.className = 'modal';
  el.style.zIndex = '40';
  el.innerHTML = `<div class="topo"><b id="tutTitulo"></b><button id="tutFechar" aria-label="Fechar">✕</button></div>
    <div class="conteudo" id="tutConteudo" style="font-size:15px;line-height:1.5"></div>
    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--borda)">
      <button id="tutVoltar" style="padding:10px 14px;border-radius:9px;border:0;background:#2d3650;color:#fff;font-weight:700">‹ Voltar</button>
      <div id="tutPontos" style="flex:1;text-align:center;letter-spacing:3px;color:#7d879c"></div>
      <button id="tutProximo" style="padding:10px 16px;border-radius:9px;border:0;background:#e9a23b;color:#20160a;font-weight:800">Próximo ›</button></div>`;
  document.body.appendChild(el);
  el.querySelector('#tutFechar').onclick = fechar;
  el.querySelector('#tutVoltar').onclick = () => { if (pag > 0) { pag--; desenhar(); } };
  el.querySelector('#tutProximo').onclick = () => { if (pag < PAGINAS.length - 1) { pag++; desenhar(); } else fechar(); };
}
function desenhar() {
  const p = PAGINAS[pag];
  el.querySelector('#tutTitulo').textContent = `${p.ic} ${p.t}`;
  el.querySelector('#tutConteudo').innerHTML = `<div style="font-size:52px;text-align:center;margin:4px 0 8px">${p.ic}</div>${p.h}`;
  el.querySelector('#tutConteudo').scrollTop = 0;
  el.querySelector('#tutPontos').innerHTML = PAGINAS.map((_, k) => (k === pag ? '<b style="color:#e9a23b">●</b>' : '●')).join('');
  el.querySelector('#tutVoltar').style.visibility = pag ? 'visible' : 'hidden';
  el.querySelector('#tutProximo').textContent = pag === PAGINAS.length - 1 ? 'Começar a jogar ✓' : 'Próximo ›';
  el.querySelector('#tutFechar').textContent = pag === PAGINAS.length - 1 ? '✕' : 'Pular';
  el.querySelector('#tutFechar').style.fontSize = pag === PAGINAS.length - 1 ? '20px' : '14px';
}
function fechar() { el?.classList.add('oculto'); try { localStorage.setItem(CHAVE, '1'); } catch { /* sem armazenamento */ } }
export function abrirTutorial() { if (!el) montar(); pag = 0; el.classList.remove('oculto'); desenhar(); }
// primeira vez neste aparelho (ou conta nova): abre sozinho
export function tutorialPrimeiraVez(contaNova) {
  let visto = false; try { visto = localStorage.getItem(CHAVE) === '1'; } catch { /* nada */ }
  if (!visto || contaNova) abrirTutorial();
}
