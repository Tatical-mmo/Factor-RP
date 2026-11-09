# Fator RP

MMO sandbox de negócios, conflito e vida urbana. Versão atual: **etapa 7**, completa: cidade, multiplayer, trabalho, logística, combate, polícia, clãs, territórios e casas.

## O que já funciona

- Tela de escolha com 17 personagens e nome do jogador (fica salvo no navegador).
- Cidade central 4 x 4 com 10 ruas nomeadas, calçadas, postes e árvores.
- Delegacia, lojas, empresas, transportadora e casas com a frente virada para a rua.
- Praça do Contratante, com o robô NPC.
- Duas bases de clã fora da cidade, com território marcado.
- Um caminhão circulando pelas ruas, que para quando há alguém na frente.
- Quatro moradores andando pelas calçadas.
- Personagem com andar, correr, pegar e soltar caixa, carregar, soco, sacar a arma, andar armado e atirar paintball (a tinta mancha o chão e as paredes).
- Câmera isométrica que acompanha o jogador, gira de 90 em 90 graus e tem zoom.
- Prédios ficam transparentes quando escondem o jogador.
- Minimapa e nome da rua onde o jogador está.
- Controles de PC (teclado e mouse) e de celular (joystick e botões).

## Etapa 2: contas e multiplayer

- Login e cadastro por e-mail e senha (Supabase Auth).
- Perfil salvo no banco: nome único, personagem, moedas, cargo e última posição.
- O jogador volta para onde parou (a posição é salva a cada 15 s e ao sair).
- Jogadores online aparecem na cidade com nome, animações, arma e caixa nas mãos.
- Tiros de paintball aparecem para todos.
- Contador de jogadores online e botão de sair da conta.

### Configuração do Supabase (uma vez só)

1. Em **SQL Editor → New query**, cole o conteúdo de `supabase/01_perfis.sql` e toque em **Run**. Depois faça o mesmo com `supabase/02_painel_admin.sql` `supabase/03_economia.sql`, `supabase/04_logistica.sql` as partes `supabase/05a…05d`, `06a`, `06b`, `07`, `08a`, `08b`, `09`, `10`, `11a`, `11b`, `11c`, `12`, `13`, `14a`, `14b`, `15`, `16a`, `16b`, `17`, `18`, `19`, `20a`, `20b`, `21a`, `21b`, `21c`, `22a`, `22b`, `23a`, `23b`, `23c`, `23d`, `24`, `25`, `26`, `27` e `28`, nessa ordem.
2. Em **Authentication → Sign In / Providers → Email**, desligue **Confirm email**. Sem isso, cada cadastro depende de um e-mail de confirmação, e o plano gratuito envia poucos por hora.

## Etapa 3: trabalho e produção

| Atividade | Onde | Rende | Limite (no banco) |
| --- | --- | --- | --- |
| Embalar e entregar | bancada no pátio da empresa → doca da transportadora | 20 moedas por entrega | 1 entrega a cada 50 s |
| Coletar sucata | 2 ferros-velhos da cidade | sucata na mochila, vendida por 15 | 1 coleta a cada 40 s, até 20 |

- Empresa da Rua do Comércio embala **chocolate**; a da Rua da Sucata embala **remédio**.
- **Loja:** compra chocolate (100), cereal (60) e remédio (300); compra de volta sucata e o que você tiver.
- **Mochila (tecla M):** itens guardados no banco; chocolate enche 60% da fome e cereal 35%.
- **Fome:** esvazia em 1 hora de jogo; vazia, o personagem anda 40% mais devagar.
- Valores ajustáveis na função `regra()` e na tabela `precos` (`supabase/03_economia.sql`).

## Etapa 4: logística

- **24 lotes à venda** (20.000 cada), com placa "Lote à venda". Quem compra escolhe nome e tipo: fábrica (chocolate ou remédio) ou transportadora. Cada jogador pode ter até **5 empresas**.
- **Caixa da empresa:** o dono deposita e saca; os pagamentos saem dele.
- **Funcionários:** o dono contrata pelo nome e define o pagamento por tarefa (0 a 500). Um jogador trabalha em uma empresa por vez.
- **Fábrica:** os membros embalam na bancada ao lado do prédio; cada caixa vai para o estoque (1 tarefa a cada 25 s por jogador).
- **Pedido de frete:** o dono da fábrica escolhe transportadora, quantidade e frete por caixa. O mercado paga 32 (chocolate) ou 60 (remédio) por caixa: a fábrica recebe o valor menos o frete; a transportadora recebe o frete.
- **Entrega à mão:** funcionário da transportadora retira a caixa no depósito (portão) da fábrica e leva ao destino (mínimo 15 s).
- **Caminhão** (15.000, até 5 por transportadora, 20 caixas): sai sozinho, busca na fábrica, entrega e volta. O horário de chegada é do servidor; todos veem o caminhão nas ruas.
- **Contratante:** até 3 missões abertas pagando o dobro do mercado, por 40 minutos. O dono de fábrica aceita e escolhe a transportadora.

### Níveis, robôs e fusões

| Nível | Custo para chegar | Robôs | Funcionários | Caminhões |
| --- | --- | --- | --- | --- |
| 1 | — | 2 | 5 | 2 |
| 2 | 30.000 | 4 | 10 | 3 |
| 3 | 60.000 | 8 | 20 | 5 |

- **Robôs:** comprar (8.000) ou alugar por 24 h (1.200). Na fábrica, cada robô embala 1 caixa a cada 90 s (acumula até 4 h). Na transportadora, cada robô soma 5 caixas à capacidade dos caminhões (máximo 60).
- **Fusão:** o dono junta duas empresas dele; a absorvida vira uma unidade da principal. Fábrica + transportadora vira um **grupo** (produz, transporta e não paga frete a si mesmo). Fábricas no nível 3 também podem ter caminhões.
- O jogo confere caminhões e empresas no banco a cada 10 s, além do tempo real.

## Etapa 5: combate

- **Vida 100.** Soco tira 10; tiro de paintball tira 20. Remédio (mochila) cura 50. Quem tem modo imortal ou está preso não leva dano.
- **Morte:** perde o que tem nas mãos e até 100 moedas, que vão para quem matou. Renasce em 5 s em casa (se tiver) ou na praça.
- **Marcação:** quem mata alguém que não o atacou nos últimos 2 minutos fica **PROCURADO** (etiqueta vermelha para todos).
- **Roubo de caminhão:** soco ou tiro no caminhão em viagem. Cada golpe tira 10 (1 por segundo por jogador). Vida: 100 + 60 por robô da transportadora + 200 com **escolta** (viatura, 400 do caixa). A carga vai para o clã de quem roubou (ou para a mochila), o caminhão volta amassado e o ladrão fica procurado.

## Etapa 6: polícia

- Na **delegacia**, qualquer jogador sem crimes e fora de clã entra em serviço: vira robô policial e ganha **100 moedas a cada 3 minutos**.
- Policial algema e prende procurados (E perto deles): pena de **7 min, dobrando por crime**, e **+800** de bônus. A prisão zera a ficha.
- O preso pode pagar **fiança de 2.000 por crime**. A pena só corre online.
- Policial que mata inocente perde o distintivo e vira procurado. A equipe pode **perdoar** pelo painel.
- Dois robôs policiais NPC patrulham o quarteirão da delegacia.

## Mercado dos jogadores e crime 2.0

- **Mercado dos jogadores** (na loja ou na mochila, botão 🤝): anuncie itens da mochila com quantidade e preço (até 10 ofertas). Quem compra paga você, e 5% vai para o cofre da prefeitura. Cada item mostra o menor preço à venda, quanto há em oferta, o preço médio das últimas vendas e se ele está subindo ▲ ou caindo ▼. Cancelar uma oferta devolve os itens.
- **Assalto a lojas:** armado no balcão de qualquer loja, toque em **Assaltar** e fique 20 s sem se afastar. Rende de 800 a 1.500 e dá 2 crimes (procurado). Cada loja só pode ser assaltada a cada 10 min.
- **Alarme:** a luz vermelha pisca no local por 2 min e todos veem.
- **Ocorrências:** assaltos e roubos de carga chamam a polícia. Policiais e agentes da PRF em serviço recebem o aviso com rastreio até o local, e quem chega e atende ganha 300. No minimapa da polícia, os procurados piscam em vermelho e as ocorrências aparecem em laranja.

## Prefeitura, eleição, PRF e carros

- **Prefeitura** (ao noroeste do centro): na porta ficam o prefeito, a eleição, os outdoors e a PRF.
- **Mandato:** 20 ciclos de dia e noite (cerca de 10 h 40 min). O prefeito recebe **9.500 por ciclo em que joga**, mora na residência oficial (porta lateral), usa o carro presidencial, define o salário da polícia (de 50 a 250 a cada 3 min) e pode renunciar. Ficar offline não interrompe o mandato.
- **Eleição:** a campanha abre nos últimos 4 ciclos do mandato. A candidatura custa 5.000 e quem tem crimes não pode se candidatar. Cada jogador tem 1 voto e pode mudar até a apuração. Com a prefeitura vaga, a cada virada de dia o mais votado assume até o fim do mandato.
- **Outdoors:** 8 pela cidade e nas cidades vizinhas, a 40 moedas por minuto (de 10 min a 4 h), para campanha ou propaganda de empresa. O dinheiro vai para o cofre da prefeitura.
- **Crime eleitoral:** o prefeito pode repassar verba do cofre a um clã ou entregar um território a ele, mas é ilegal.
- **PRF:** é a polícia eleitoral. Não obedece ao prefeito e paga 120 a cada 3 min. Os agentes investigam documentos na prefeitura (35% de chance por tentativa, a cada 90 s). Com prova, o prefeito é cassado e fica procurado: achar a prova rende 3.000 e prender rende 2.000.
- **Carros** (concessionária, a nordeste do centro): Popular 12.000, SUV 30.000 e Esportivo 55.000, até 3 por jogador. Chegue perto e toque em **Dirigir**; o controle aponta para onde o carro vai. Ele fica estacionado onde você descer. O carro presidencial é do prefeito.
- **Tela cheia e instalar:** o botão ⛶ (ao lado do minimapa) põe o jogo em tela cheia, e **📲 Instalar** coloca o jogo no celular ou no computador como aplicativo (no iPhone: Compartilhar → Adicionar à Tela de Início).

## Metas, ranking e conquistas (botão 🏆)

- **Metas do dia:** 3 metas sorteadas por dia (renovam à meia-noite de Brasília). Exemplos: coletar sucata, entregar cargas, embalar, levar encomendas, fazer parafusos ou vender na loja. Cada meta paga de 300 a 600; resgatar as 3 dá mais 1.000. O botão pisca quando há meta para resgatar.
- **Ranking:** os 10 mais ricos (sem a equipe), as 10 maiores empresas e os 10 maiores clãs, mais a sua posição.
- **Conquistas:** 14 medalhas (moedas, níveis de empresa, helicóptero, moradia, prédio, clã, território, personagens).

## Personagens e cidades vizinhas

- **Loja de personagens** (Mochila → Personagem e nome): 8 personagens são grátis desde a criação da conta, e os outros 9 custam 8.000 cada. Personagem comprado fica seu para sempre e pode ser trocado de graça. **Trocar o nome** custa 1.000. Quem já tinha escolhido um personagem pago continua com ele.
- **Agências de Encomendas** nas estações Norte e Sul da metrópole, em Vila Serra e em Porto Sul. Pegue uma caixa e leve **de trem** até a agência da outra cidade, em até 20 min. Paga 400 entre a metrópole e uma cidade, e 700 entre Vila Serra e Porto Sul. O rastreio aponta o caminho sozinho.
- **Oficina de Parafusos** em Porto Sul: 3 sucatas viram 2 parafusos, que a loja compra por 30 cada.

## Vans e helicópteros

- Na aba **Veículos** da empresa:
  - **Van:** 9.000. Rápida, leva 10 caixas mais 2 por robô (máximo 20), mas aguenta menos ataques.
  - **Caminhão:** 15.000. Leva 20 caixas mais 5 por robô (máximo 60).
  - **Helicóptero:** 75.000, a partir do nível 10. Voa em linha reta, é o mais rápido, leva até 30 caixas e **não pode ser roubado**.
- Quem tem helicóptero ganha **heliporto no telhado** (até 2 plataformas), de onde ele decola e onde pousa.
- **Fábricas de veículos:** ao fundar uma fábrica, escolha Vans, Caminhões ou Helicópteros. Os robôs montam 1 van a cada 25 min, 1 caminhão a cada 40 min ou 1 helicóptero a cada 2 h (mais rápido com o nível). Outras empresas compram delas por 20% menos que o preço de fora, e o dinheiro vai para o caixa da fábrica.

## Mapa e rastreio

- Toque no minimapa para abrir o **mapa grande** (abas Metrópole, Vila Serra e Porto Sul). Escolha um destino (suas empresas, suas moradias, os territórios do seu clã, as estações ou o Contratante) ou toque em qualquer ponto do mapa.
- Durante o rastreio aparecem um feixe de luz no destino, uma seta no minimapa e a distância embaixo dele. Se o destino fica em outra cidade, o rastreio leva primeiro até a estação certa. Toque na distância para parar.
- Empresas também mudam nos níveis 2 (bandeiras), 3 (cerca e vagas pintadas) e 4 (contêineres e holofote), antes das fases grandes 5, 10 e 15.
- O administrador pode definir o nível de uma empresa ou clã na própria janela, para conferir o visual de cada fase (SQL `15`).

## Moradia e territórios

- **Apartamentos:** o Edifício Aurora (norte do centro) e o Edifício Horizonte (sul) têm 10 apartamentos cada, a 15.000. Use a portaria do prédio. Por dentro é igual à casa, com cama e baú.
- **Terrenos:** 16 terrenos em 4 loteamentos ao lado do centro, a 12.000 cada. Depois de comprar, aperte na placa e escolha a casa: simples (20.000), sobrado (45.000) ou mansão (90.000, com piscina). À noite as janelas acendem.
- Cada jogador pode ter até **3 moradias** (casa, apartamento ou terreno), cada uma com o seu baú. Toque na porta da sua moradia para **Entrar**, **Construir** (terreno) ou **Vender**. A casa devolve 20.000, o apartamento 8.000 e o terreno 6.000 mais metade da construção; o que estava no baú volta para a mochila.
- **Imóveis que evoluem (terrenos):** casa → casa ampliada (60.000) → condomínio com 4 apartamentos (150.000) → prédio pequeno com 8 (350.000) → prédio grande de 12 andares com 20 (800.000). Na porta, **Apartamentos e aluguéis** permite definir, para cada apartamento, o aluguel por dia e/ou o preço de venda.
- **Aluguel:** quem não tem casa toca na portaria do prédio e aluga ou compra um apartamento. O aluguel é cobrado sozinho a cada 24 h e cai na carteira do dono. Se o inquilino ficar sem dinheiro, ele sai e o que estava no baú volta para a mochila. Aluguéis contam no limite de 3 moradias.
- **Territórios novos:** Praça Norte, Praça Sul, Vila Serra e Porto Sul, somando 6 para os clãs disputarem.

## Gráfico e níveis até 15

- **Dia e noite** iguais para todos (um dia dura 32 min: 22 de dia e 10 de noite). À noite as janelas dos prédios acendem, os postes iluminam a rua e o céu escurece. Para ver a noite na hora, abra o jogo com `?hora=22` no fim do endereço.
- Ruas novas com faixas, meio-fio, postes, carros estacionados e térreo de lojas nos prédios. O mar de Porto Sul se mexe.
- **Empresas e clãs vão até o nível 15.** Para chegar nos níveis **5, 10 e 15** é preciso um **Desbloqueio Corporativo** (loja, 50.000) na mochila do dono ou do líder.
- **Visual da empresa:** no nível 5 vira galpão com docas, onde os caminhões entram de ré e saem carregados. No 10 vira complexo industrial, com escritório no telhado, chaminés e linha de produção com braços robóticos atrás da vitrine. No 15 vira uma torre de 34 m com heliponto, 4 docas e linha dupla. Fábricas também têm docas, com metade da frota de uma transportadora.
- **Filiais:** no nível 10 a empresa pode ter 2 lotes; no 15, a matriz e mais 4 filiais. Abra pela placa "Lote à venda".
- **Fábrica de robôs:** ao fundar uma fábrica, escolha o produto "Robôs". Cada robô dela monta 1 robô a cada 20 min. Empresas e clãs compram robôs das fábricas por 8.000, e o dinheiro vai para o caixa da fábrica. Sem estoque em nenhuma fábrica, o robô vem de fora por 12.000. Limites: até 50 robôs por empresa e 90 por clã no nível 15.
- **Clãs:** cada nível dá mais membros (até 57) e robôs. A base do território ganha muralha no 5, torres no 10 e vira fortaleza no 15.

## Metrópole e ferrovia

- A cidade central agora fica no meio de uma metrópole: bairros com prédios, casas e praças em volta, e um horizonte de arranha-céus nas bordas. Os prédios que ficam na frente do jogador são cortados para ele continuar visível.
- **Ferrovia:** duas linhas saem da cidade. A **Linha Norte** parte da Estação Norte e vai até **Vila Serra**. A **Linha Sul** parte da Estação Sul e vai até **Porto Sul**, que tem cais e navio. Cada linha tem uma via de ida e outra de volta.
- **Como usar:** vá até a plataforma e aperte **Embarcar** quando o trem estiver parado. O botão mostra quanto falta para o trem chegar. A viagem leva cerca de 50 s, e ao chegar você desce sozinho na plataforma. Antes da partida dá para **Descer**.
- As outras cidades só se alcançam de trem. Cada uma tem uma loja.
- Os trens seguem o relógio do servidor, então todos os jogadores veem o mesmo trem no mesmo lugar. Não precisa de SQL novo.

## Etapa 7: clãs, territórios e casas

- **Clã** (botão ⚔ Clã): fundar custa 5.000; até 15 membros; caixa do clã; estoque das cargas roubadas (membros pegam, o líder vende).
- **Territórios Leste e Oeste:** cada um rende **400 por hora** ao clã dono. Para tomar, o clã fica dentro do círculo por **60 s + 20 s por robô defensor**. Ou o líder **ataca com robôs** (8.000 cada, até 20): vence quem tiver mais força, e os defensores valem 30% a mais.
- **Casas:** 12 casas à venda por **35.000** (uma por jogador). Quem tem casa renasce nela.
- **Dentro de casa** (só o dono entra; para os outros a porta fica trancada): **cama** (descansar 3 s recupera toda a vida), **baú** (guarda até 200 itens fora da mochila, protegidos da morte) e **porta** para sair. Dá para vender a casa pelo baú (devolve 20.000 e os itens voltam para a mochila).
- **Caminhões estacionados:** ficam no pátio atrás do depósito (4 vagas por empresa) e entram e saem por um corredor lateral, sem parar no cruzamento. Só o 5º e 6º caminhão param na frente, fora da esquina.

## Painel da equipe

O botão **🛡 Painel** aparece só para o administrador e os moderadores. Todas as ações são conferidas no banco (`supabase/02_painel_admin.sql`), então um jogo modificado não consegue usar poderes.

- **Jogadores:** buscar, ver quem está online, ir até um jogador, trazer até você, dar ou tirar moedas, algemar, prender (a pena só corre com o jogador online), soltar, banir e desbanir.
- **Eu:** modo imortal, teleporte para pontos da cidade e troca de skin (robôs inclusos) de graça.
- **Equipe** (só admin): lista de moderadores, com poderes e salário. Para nomear, abra o jogador e toque em **Tornar moderador**.
- **Histórico** (só admin): tudo o que a equipe fez.

Regras: algemas e prisão não funcionam na equipe, o admin não pode ser banido, moderadores só agem sobre jogadores e só com os poderes que o admin marcou, e o salário do moderador cai uma vez a cada 24 horas, ao entrar no jogo.

## Controles no PC

| Tecla | Ação |
| --- | --- |
| W A S D ou setas | andar |
| Shift | correr |
| Clique no chão | ir até o ponto |
| E | pegar ou soltar caixa, falar com o Contratante |
| F | soco |
| Q | sacar ou guardar a arma |
| Clique (armado) | atirar |
| Z / X | girar a câmera |
| Roda do mouse | zoom |

No celular: joystick à esquerda (empurrar até o fim corre), botões à direita, toque no chão para andar até o ponto e pinça para zoom.

## Como publicar no GitHub Pages

1. Envie todo o conteúdo desta pasta para a raiz do repositório.
2. No GitHub, abra **Settings → Pages**.
3. Em **Source**, escolha **Deploy from a branch**, a branch principal e a pasta **/ (root)**.
4. Em um ou dois minutos o jogo fica em `https://<usuário>.github.io/<repositório>/`.

## Como testar no computador

O jogo precisa de um servidor (abrir o `index.html` direto não funciona). Na pasta do jogo:

```
npx serve .
```

ou

```
python -m http.server 8000
```

Depois abra o endereço que aparecer no terminal.

## Estrutura

```
index.html              telas, HUD e estilos
js/config.js            personagens, ruas, layout da cidade, velocidades
js/main.js              motor do jogo (Three.js 0.170 via CDN)
js/rede.js              contas, perfis e tempo real (Supabase)
js/painel.js            painel da equipe
js/loja.js              loja e mochila
js/empresa.js           empresas, pedidos, caminhões e missões
js/cla.js               clãs e territórios
supabase/               SQL do banco de dados
assets/personagens/     17 personagens com as 13 animações
assets/robos/           robôs (polícia, admin, moderadores, Contratante)
assets/modelos/         prédios, veículos e objetos
assets/miniaturas/      imagens da tela de escolha
```

Animações de cada personagem: `idle`, `idle_long`, `walk`, `run`, `carry_walk`, `pickup`, `punch_left`, `punch_right`, `punch_combo`, `shoot`, `walk_shoot`, `hit`, `death`.


## Versão 08/11 (p) · tela do clã
- A tela do clã agora tem abas: Resumo, Territórios, Estoque e Membros.
- Ela só se redesenha quando algo muda de verdade, então não pula mais enquanto você rola ou digita.
- Não precisa rodar SQL novo.

## Versão 08/11 (q) · guerra de clãs, empregos, banco, hospital e bombeiros
Rode no SQL Editor, nessa ordem e cada um numa consulta limpa: `23a_guerra_clas.sql`, `23b_empregos.sql`, `23c_banco.sql`, `23d_hospital_bombeiros.sql`.
- **Guerra de clãs** (aba Guerra do clã): o líder desafia outro clã, marca o horário (10 a 120 min) e aposta do caixa. O outro líder aceita ou recusa. A guerra dura 15 min; cada abate de inimigo vale 1 ponto e não é crime. O vencedor leva as duas apostas. Placar no topo da tela e etiqueta ⚔️ INIMIGO.
- **Empregos**: o dono publica vagas (função e salário por minuto) na aba Equipe. Jogadores se candidatam na Agência de Empregos (ao lado do banco). Perto da empresa o ponto é batido a cada minuto; operário de fábrica também produz 1 caixa por minuto.
- **Banco Central**: poupança que rende 1% por ciclo e não se perde na morte; empréstimo de até 20.000 com 10% de juros e prazo de 3 ciclos, com cobrança automática.
- **Hospital**: quem morre fica ferido por 20 s. Médico em serviço socorre (+250). Sem socorro, acorda no hospital e paga até 100. Tratamento no balcão por 150.
- **Bombeiros**: incêndios aparecem em empresas e casas. Bombeiro em serviço apaga com 10 jatos (+400). O dono também pode apagar. Fogo de 8 min causa prejuízo.

## Versão 08/11 (r) · veículos 3D, robô motorista e sequestro
Rode no SQL Editor: `24_veiculos_roubo.sql`.
- Modelos 3D novos: van, helicóptero, carros (popular, SUV, esportivo, presidencial) e robô motorista (`assets/modelos/`, com compressão meshopt).
- Todo veículo de empresa tem um robô motorista. Quem zera a vida do veículo arranca o robô do banco (ele cai e some em 3 s) e assume a direção com a carga.
- A carga roubada é descarregada num território do clã ou na casa do ladrão (botão Descarregar, parado no lugar).
- Helicóptero só pode ser atacado no chão, enquanto carrega na fábrica.
- Veículo parado por 5 minutos volta sozinho para a garagem. Policial que acha um veículo roubado abandonado devolve ao dono (+300).
- O dono dirige qualquer veículo dele quando quiser: chegue perto do veículo, ou do portão da empresa para tirar um da garagem. Ao descer, o robô leva de volta.
- Prefeitura e Concessionária aparecem no mapa grande para rastrear.

## Versão 08/11 (s) · volante, ré, ambulância e bombeiros NPC
Rode no SQL Editor: `25_servicos_npc.sql`.
- Dentro de qualquer veículo o controle vira volante: setas ◀ ▶ à esquerda, ACELERAR e FREIO/RÉ à direita (no PC: W/S/A/D ou setas). Ao descer, volta o joystick.
- Ré: segure FREIO com o veículo parado.
- Fogo novo: partículas de chama, fumaça subindo e brilho no chão.
- Carros: Popular 40.000, SUV 95.000, Esportivo 180.000.
- Ambulância e caminhão dos bombeiros em 3D. Médico em serviço dirige a ambulância (fica na frente do hospital); bombeiro dirige o caminhão (na frente do quartel), com jato de alcance maior.
- NPCs: quem morre recebe uma ambulância NPC, que vem pelas ruas e atende no local (conta de até 100). Fogo sem bombeiro é atendido pelo caminhão NPC depois de 1 min; a prefeitura apaga em 3 min e cobra 300 do dono.

## Versão 08/11 (t) · chamar veículos, bloqueio, táxi aéreo, trânsito e polícia NPC
Rode no SQL Editor: `26_chamar_bloquear.sql`.
- Botão **🚗 Veículos** (lado esquerdo): lista seus carros e os veículos das empresas.
  - **Chamar**: o robô motorista traz o veículo pelas ruas até você (veículo de empresa espera 5 min).
  - **Recolher**: volta para a garagem (carros vão para a Concessionária).
  - **Bloquear**: trava um veículo roubado; em 20 s o ladrão é jogado para fora e o veículo volta para a garagem.
  - **Táxi aéreo** (helicóptero parado): o piloto robô busca você, você embarca, escolhe o destino na lista e ele leva, pousa e volta sozinho. Membros do clã do dono e funcionários da empresa podem embarcar como passageiros quando ele pousa.
- Trânsito: caminhões de entrega, ambulância e bombeiros NPC param quando há veículo ou pessoa na frente e recuperam o atraso depois.
- Batidas: quem dirige bate nos outros veículos (a câmera treme); atropelar tira vida de jogadores e da polícia NPC.
- Polícia NPC: dá para bater e atirar nela. Cada agressão é crime; ela persegue e atira de volta por 30 s; derrubada, levanta em 20 s.

## Versão 08/11 (u) · atropelamentos, muito procurados e cerco da polícia robô
Rode no SQL Editor: `27_recompensas.sql`.
- Atropelar mata: a partir de ~43 km/h é morte na hora (abaixo disso tira vida). Vale para carros, vans, caminhões, ambulância e bombeiros. O trem em movimento mata quem estiver no trilho, a pé ou de carro.
- Muito procurados: a cada 5 mortes de jogadores sem ser preso (fora de guerra e sem legítima defesa) somam 10.000 de recompensa. O nome aparece nos 2 outdoors mais perto de onde a pessoa foi vista e na etiqueta 🎯 PROCURADO. Quem matar ou prender leva a recompensa (matar um procurado com recompensa não é crime). Ser preso zera a sequência.
- Polícia robô: persegue o procurado que vê (25 m) e prende quem alcança a pé. Se ele se esconder em casa durante a perseguição, o robô espera na porta por até 1 ciclo (32 min), mesmo se o jogador sair do jogo e voltar.

## Versão 08/11 (w) · direção suave
- Velocidades menores (Popular 36 km/h, SUV 40, Esportivo 50, caminhão 32, van 38, ambulância 43, bombeiros 36, helicóptero 65), aceleração e freio graduais e ré lenta.
- Volante com resposta gradual e menos giro em alta velocidade.
- Dirigindo, a câmera fica atrás do veículo: ◀ ▶ viram sempre para a esquerda/direita da tela. Ao descer, a câmera volta ao normal.
- Atropelamento mata a partir de ~29 km/h.

## Versão 08/11 (x) · direção corrigida e jornalista
Rode no SQL Editor: `28_jornalista.sql`.
- Veículos não atravessam mais prédios e casas (as paredes são resolvidas por último) e os pedais soltam mesmo se o dedo escorregar para fora do botão.
- Jornalista: entre em serviço no balcão "Jornal da Cidade" (ao lado da Prefeitura). Perto de um incêndio, ocorrência policial ou alguém ferido, toque em Reportar: +200 e a manchete aparece para todos na faixa do alto da tela e na lista do jornal. Cada acontecimento rende uma reportagem só.

## Versão 08/11 (y) · caminhão e van dirigíveis como o carro
- Ao assumir um veículo encostado em outros (doca, garagem, fila), os vizinhos não empurram mais: ele sai normalmente.
- Empurrão entre veículos limitado ao quanto o veículo andou no quadro (não dispara mais).
