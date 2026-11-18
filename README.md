# Fator RP

**Endereço principal:** https://fator-rp.kitsunesistems.workers.dev (Cloudflare Workers, publica sozinho a cada atualização do GitHub; comando de implantação `rm -rf .git .github && npx wrangler deploy --assets=. --name=fator-rp --compatibility-date=2026-11-01`). O GitHub Pages (https://tatical-mmo.github.io/Factor-RP/) continua no ar como reserva.

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

1. Em **SQL Editor → New query**, cole o conteúdo de `supabase/01_perfis.sql` e toque em **Run**. Depois faça o mesmo com `supabase/02_painel_admin.sql` `supabase/03_economia.sql`, `supabase/04_logistica.sql` as partes `supabase/05a…05d`, `06a`, `06b`, `07`, `08a`, `08b`, `09`, `10`, `11a`, `11b`, `11c`, `12`, `13`, `14a`, `14b`, `15`, `16a`, `16b`, `17`, `18`, `19`, `20a`, `20b`, `21a`, `21b`, `21c`, `22a`, `22b`, `23a`, `23b`, `23c`, `23d`, `24`, `25`, `26`, `27`, `28`, `29`, `30`, `31a`, `31b`, `31c`, `32` e `33`, nessa ordem.
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

## Chat de voz e aperto de mão

- **Voz (grátis):** no menu ☰, botão 🎙️ **Voz** troca entre *desligada → quem está perto (40 m) → clã*. O áudio vai direto de um jogador para o outro (WebRTC); o Supabase só passa o "aperto de mão" da conexão. Para falar, segure o botão 🎙️ redondo na tela (no PC, segure **V**). Perto, o volume cai com a distância; no clã, todos os membros online ouvem, em qualquer lugar. Até 8 pessoas por vez. O navegador pede permissão do microfone na primeira vez. Em algumas redes móveis muito fechadas a conexão direta pode não abrir (sem servidor pago de retransmissão).
- **Aperto de mão:** chegue perto de outro jogador, sem arma, e toque em **Mão**. Ele recebe o convite e toca em **Apertar** (10 s). Os dois se viram, estendem o braço direito e balançam a mão; quem está em volta vê.

## Tempo: chuva, tempestade e neve (SQL 40)

- **Chuva:** escurece um pouco, cai chuva fraca e aparecem poças nas ruas.
- **Tempestade:** mais escuro, chuva mais forte e relâmpagos que clareiam o mapa logo antes de cada trovão.
- **Neve:** flocos caindo e montinhos de neve espalhados pelo chão, com som de nevasca.
- Poças e neve somem 3 s depois que o tempo abre. Todo mundo vê o mesmo tempo.
- **Admin › Painel › Tempo:** muda o tempo na hora (por 5 min a 4 h) ou liga o automático com as chances de chuva, tempestade e neve; a cada ciclo de 32 min o jogo sorteia.

## Sons

Motores por veículo (carros comuns, esportivo, jipe, caminhões, vans; o tom sobe com a velocidade), partida ao entrar no carro, barulho da cidade grande e passarinhos nas cidades menores, nas praças e na mata. Os sons longos só baixam quando vão tocar.

## QG do clã e assalto ao cargueiro (SQL 41a e 41b)

O clã dono da Base Leste ou Oeste entra no **QG** pela porta marcada "🏴 QG do clã", no lado da base virado para a cidade.
- **Cofre:** qualquer membro guarda itens da mochila e deposita moedas; o líder e quem ele autorizar retiram e sacam.
- **Mesa de planejamento:** começa o assalto ao cargueiro do Porto Sul (15 min, 6 contêineres; um assalto por vez na cidade, cada clã a cada 2 h). Suba pelo píer e pela rampa, arrombe os contêineres (12 s, +2 crimes) e leve a carga ao cofre: 6.000 para o clã e 1.500 para quem entregou, por carga. Preso no caminho, a polícia confisca. Todo mundo recebe o alerta.
- **Arsenal:** pega a arma do clã (vale até sair do jogo).
- **Enfermaria:** cura a vida.
- **Refúgio:** procurado que fica 1 minuto no QG faz a polícia perder o rastro (e tem 2 minutos de folga ao sair).

## Algemas (SQL 42)

- **Quem algema:** Polícia, PRF, Exército, o prefeito, até 2 seguranças nomeados pelo prefeito (Prefeitura › Governo), moderadores e o administrador. Botão 🔗 (no PC, tecla **G**) perto do jogador ou de um pedestre. A equipe não pode ser algemada.
- **Algemado:** não ataca nem age, e perto de quem algemou não consegue andar. Algemas aparecem acima da cabeça.
- **Segurar:** quem algemou toca em 🔗 Segurar e o algemado vai junto (até dentro do carro). 🔗 Largar solta.
- **Fuga:** se quem algemou morrer ou ficar longe (30 m), o algemado consegue andar, ainda algemado.
- **Tirar as algemas:** quem algemou, moderadores e administrador (botão de ação, "Soltar"). Ou qualquer jogador com um **alicate de corte** (2.500 no contrabandista, não é crime; gasta 1 alicate).
- Pedestres algemados ficam parados, seguem quem segura e são soltos sozinhos depois de 5 minutos.

## Um emprego por jogador (SQL 43)

Polícia em serviço, PRF, Hospital, Bombeiros, Jornal, Exército e funcionário de empresa: só um por vez. Ser dono de empresa não conta. A equipe não tem essa regra. Cada jogador só fica em um clã.

## Jornal: redação, fotos e telões (SQL 43)

- Jornal (☰) › **Ir à redação**: escritório com **mesa de edição** (editor completo: foto, retrato de personagem, selo URGENTE/EXCLUSIVO…, cor de destaque, manchete grande, agendar), **estúdio de fotos** (quem fica na marca amarela é fotografado pelo jornalista) e mural.
- Jornal › **Tirar foto agora**: fotografa a cena do jogo (fica na galeria do aparelho, até 6 fotos).
- **Tocar num telão ou outdoor** amplia na tela; ✕ (ou tocar fora) fecha.

## Lixeiros: a sociedade do esgoto (SQL 44a)

- 16 bueiros pela cidade; um deles (secreto) aceita novos membros por 5.000. Membros descem e sobem por qualquer bueiro.
- No esgoto: **adicional de insalubridade** por minuto (valor na aba Salários do admin), **coleta de lixo** (+120), **contrabando** até um bueiro sorteado (+1.500; se a polícia estiver a 25 m na saída, perde e vira procurado), **ouvir os túneis** (procurados e assaltos; denúncia anônima à polícia +400), **resgate**: o lixeiro abre o bueiro para um procurado e o leva para sair longe (+800). A polícia não entra no esgoto.
- **Casas subterrâneas**: 8 casas, 8.000, não evoluem (cama para descansar; vender devolve 4.000).

## Interiores

Prefeitura (gabinete, urna, outdoors, sala de imprensa), quartel dos bombeiros (balcão, incêndios, vestiário, mastro, enfermaria), delegacia e posto da PRF (balcão, quadro de procurados, celas e **estande de tiro interno** só para a corporação) e empresas (dono e funcionários entram pelo portão; o interior cresce nos níveis 5, 10 e 15: mesa do dono, relógio de ponto, estoque, copa, sala de reuniões, linha de produção e sala VIP).

## Conta, denúncias e bloqueios (SQL 46)

- ☰ › **Conta**: política de privacidade, lista de bloqueados e **excluir minha conta** (digite EXCLUIR). Também pela página `conta.html` (login + exclusão) — útil para lojas de apps.
- ☰ › **Amigos** › Jogadores online: **Denunciar** (motivo + detalhes) ou **Bloquear** (some do seu chat e da sua voz).
- Painel da equipe › **Denúncias**: denúncias abertas, quantas vezes o jogador foi denunciado, abrir o jogador e marcar como resolvida.
- `privacidade.html`: política de privacidade.

## Ruas do horizonte e carros de rua (SQL 48)

- A metrópole não acaba mais num muro invisível: dá para andar e dirigir pelas ruas entre os prédios altos do horizonte até o fim do mapa (a ferrovia continua só de trem).
- Os **carros estacionados nas ruas** podem ser roubados (2,5 s arrombando, é crime). Largado, o carro fica onde parou e volta sozinho para a vaga depois de **5 minutos parado**. Outro jogador pode roubar o carro largado.

## Averiguar (moderadores e administrador)

No painel (página do jogador ou aba Denúncias), **👁️ Averiguar**: a câmera passa a seguir o jogador em qualquer lugar do mapa, com uma barra mostrando o que ele faz (andando, dirigindo, armado, crimes, rua), as mensagens que ele escreve (inclusive no modo privado) e botões para ir até ele, algemar, prender 10 min, banir (com motivo) ou abrir no painel. Seu personagem fica parado enquanto isso.

## Carceragem

Os presos não ficam mais na grade do lado de fora: vão para uma das 8 celas da **carceragem** (porta "🔒 Carceragem" dentro da delegacia e do posto da PRF) e só andam dentro da cela. Policiais e PRF em serviço (e o admin) entram e, na **guarita**, autorizam a visita de um jogador: ele recebe o convite e fica 3 minutos na área de visita, em frente às celas, para conversar (chat ou voz por perto).

## Uniformes, símbolo do clã e materializar veículo (SQL 49)

- Em serviço, cada corporação veste colete e boné/capacete: Polícia azul-escuro, PRF preto com faixa amarela, Bombeiros vermelho com faixa refletiva, Hospital branco com cruz vermelha, Exército verde.
- Quem é de clã tem o escudo do clã (cor e iniciais) ao lado do nome.
- ☰ › Veículos › **✨ Materializar (150)**: o carro ou veículo particular aparece do seu lado na hora. Carros também podem ficar estacionados nas ruas do horizonte.

## Expediente, cidade e prisão militar (SQL 50a e 50b)

- **Veículo do expediente:** em serviço (Polícia, PRF, Bombeiros, Hospital, Exército) aparece o botão 🚓/🚒/🚑/🪖 na tela: o veículo da corporação surge do seu lado na hora, grátis.
- **Painel › Cidade (admin):** quantos policiais robô na rua (0 a 20) e **crimes de NPC** (ligar/desligar e a chance a cada 2 minutos). O ladrão NPC assalta uma loja e foge por 3 minutos; Polícia, PRF e Exército recebem o alerta e prendem chegando perto (+300).
- **Prisão militar:** na ficha militar, quem tem patente maior (ou o General Supremo) manda um militar para a prisão do quartel por 15 min ou solta.
- **Reset do mapa:** mais completo (casas do esgoto, cofres de clã, assaltos, Lixeiros, residência oficial, seguranças) e mostra o que foi apagado; o jogo de todos recarrega em seguida.

## Esconderijos dos clãs e armas nas cadeias (SQL 51)

- 4 **esconderijos** na mata (2 em Vila Serra, 2 em Porto Sul), cada um com jaula, barraca e fogueira, ligados à cidade por uma **trilha de terra**.
- Membro de clã perto de um jogador **ferido** toca em **Sequestrar** e escolhe o esconderijo (crime +2). O refém vai para a jaula, não age nem atira, por até 15 min.
- Qualquer jogador que achar o esconderijo toca em **Libertar** (+200 se não for do clã sequestrador). Quem chegar pode atirar nos sequestradores.
- Nas cadeias (carceragem da Polícia/PRF e prisão militar) **visitantes e presos não usam armas nem brigam**.

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
| V (segurar) | falar no chat de voz |
| G | algemar, segurar, largar ou cortar algemas |

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

## Versão 08/11 (z) · carona com robô motorista e rendição no roubo
Rode no SQL Editor: `29_carona_rendicao.sql`.
- Vans e caminhões não são mais dirigidos à mão: o robô motorista dá carona, como o piloto do helicóptero. Perto do veículo (ou do portão da empresa) toque em Carona, ou peça pela janela 🚗 Veículos (ele vem buscar). Escolha o destino; ele leva pelas ruas, respeitando o trânsito, e volta sozinho para a garagem.
- Roubo: ao zerar a vida do veículo ele para e aparece RENDER MOTORISTA. O motorista rendido leva o ladrão e a carga até o território do clã ou a casa mais perto; lá a carga é descarregada e o robô volta com o veículo para a garagem do dono. Sem território nem casa, a carga vai direto para a mochila.
- O dono ainda pode Bloquear: o ladrão é jogado para fora e o veículo volta. Carros, ambulância e bombeiros continuam com volante.

## Versão 09/11 (a) · socorrista com ambulância e bombeiro com mapa
Rode no SQL Editor: `30_socorro_ambulancia.sql`.
- Socorrista: cada ferido aparece no minimapa (cruz piscando) com aviso e rastreio. Dirija até lá, pare, desça (a ambulância fica estacionada onde você desceu), socorra a pé e volte para ela. O ferido pode ser socorrido por até 90 s; com socorrista online, a ambulância NPC espera 40 s antes de sair.
- Bombeiro: os incêndios aparecem no minimapa (piscando) e o mais perto já é rastreado ao entrar no caminhão; o jato sai do caminhão, sem descer. O rastreio some quando o fogo apaga.
- A ambulância e o caminhão voltam para a base quando o jogador sai do serviço.

## Versão 09/11 (b) · carreiras, polícia robô pela cidade, viaturas e roubo de carros
Rode no SQL Editor, nessa ordem: `31a_carreiras.sql`, `31b_robos_policia.sql`, `31c_roubo_carros.sql`.
- Carreiras com patentes e salário por minuto em serviço (o salário sobe a cada promoção):
  - Polícia: Soldado, Cabo, 3º/2º/1º Sargento, Subtenente, Tenente, Capitão, Major, Tenente-Coronel, Coronel (base = salário definido pelo prefeito).
  - PRF: Agente, Agente Especial, Inspetor, Superintendente.
  - Médico: Socorrista, Enfermeiro, Doutor, Supervisor, Diretor (de Doutor em diante o turno só conta dentro do hospital).
  - Bombeiro: Recruta, Bombeiro, Cabo, Sargento, Tenente, Capitão, Comandante.
  - Jornalista: Estagiário, Repórter, Repórter Sênior, Editor, Editor-chefe.
  - O cargo aparece na etiqueta do jogador e numa faixa embaixo da tela; prefeito continua no topo.
- Polícia robô: 12 policiais a pé fazem ronda em quadras da cidade toda e 4 viaturas rodam pelas ruas. Todos veem os mesmos robôs no mesmo lugar, inclusive perseguições, cercos na porta de casa e robôs derrubados.
- Viaturas caçam os muito procurados (com recompensa): perseguem a até 90 m e prendem quem para a menos de 6 m.
- Roubo de carros de jogador: arrombe um carro parado de outro (2,5 s, é crime) e saia dirigindo. O dono vê ROUBADO na janela 🚗 Veículos e pode Bloquear (20 s depois o ladrão é jogado para fora). Policial devolve carro roubado largado (+300). O presidencial não pode ser roubado.
- Passageiros também em van e caminhão (clã do dono ou funcionários): descem quando o veículo chega.
- Gráfico: janelas da prefeitura e do banco não piscam mais; árvores nos cantos das quadras dos prédios públicos.

## Versão 09/11 (c) · chat, amigos, sons, conversas de NPCs, faixas da rua e tela nova
Rode no SQL Editor: `32_amigos.sql`.
- Chat (💬 ou Enter): mensagens aparecem no canto e num balão sobre a cabeça por alguns segundos. Modo 🔒 Amigos: só os amigos veem, em amarelo. Nada do chat fica salvo.
- 👥 Amigos: adicionar pelo nome, aceitar/recusar pedidos e remover.
- Sons (assets/sons, botão 🔊): sirenes da ambulância, bombeiros e polícia, helicóptero perto do chão e no alto (troca conforme a altura), buzina e barulho do trem, tiros e robôs conversando. Volume pela distância.
- NPCs (pessoas e policiais robôs) que se cruzam param para conversar, com balões de fala.
- Veículos guiados por robôs (entregas, carona, ambulância, bombeiros e viaturas, inclusive na perseguição) andam pela faixa da direita das ruas.
- Tela mais limpa: menu único ☰ no celular e coluna de ícones no computador; minimapa menor no celular; ajuda de teclas some sozinha.

## Versão 09/11 (d) · arma dourada (evento) e cemitério
Rode no SQL Editor: `33_arma_dourada.sql`.
- O administrador abre o Painel › Eu › "✨ Esconder a arma dourada aqui": a arma fica escondida onde ele está (só aparece de perto) e todos recebem o aviso do evento.
- Quem achar pega (E): a arma na mão fica dourada e tem só 2 balas; depois do 2º tiro ela some. Se quem está com ela morrer, ela cai no chão ali.
- Atingido pela bala dourada: morre na hora, ninguém socorre, e 7 s depois acorda no cemitério (novo, na quadra do canto sudeste da cidade). Quem morre de outro jeito continua sendo socorrido no lugar.
- Administrador e moderadores são imunes. Prefeito atingido perde o mandato na hora.
- Cada acerto vale 5 crimes para o atirador (mais que qualquer outra arma), e todos são avisados de quem foi.

## Versão 09/11 (e) · sons só em movimento
- Sirenes (ambulância, bombeiros e polícia) só tocam com o veículo andando; parado, fica em silêncio.
- Barulho do trem e buzina só com o trem andando (parado na estação não faz barulho).

## Versão 09/11 (f) · Agência de Empregos completa e botão 💼 Trabalho
- A Agência de Empregos (ao lado do Banco) mostra o serviço público, sempre com vaga para quem tem ficha limpa: Polícia, PRF, Hospital, Bombeiros e Jornal. Entrar já leva ao cargo inicial e marca o caminho até o trabalho no mapa (trocar de serviço sai do anterior).
- Também mostra as vagas que as empresas anunciaram (o dono anuncia na tela da empresa › Equipe › "📢 Anunciar vagas na Agência de Empregos").
- Novo botão 💼 Trabalho no menu: mostra seu cargo público (patente, tempo, próximo cargo) e seu emprego em empresa (função, salário, se está batendo ponto), com "📍 Ir" para o local de trabalho, sair do serviço ou pedir demissão.
- Quem trabalha em empresa vê "💼 nome da empresa" na faixa embaixo da tela.

## Versão 09/11 (g) · gráfico melhor
- Árvores novas: copa cheia (vários blocos, mais escura embaixo), tamanhos variados e pinheiros misturados.
- Calçadas com pavers em junta amarrada, rejunte e marcas de uso; a da metrópole estava com ladrilhos de quase 3 m e ficou do tamanho certo. Grama com manchas, fiapos e florzinhas (centro e metrópole usam a mesma textura agora).
- Carros estacionados: perto de você viram os modelos 3D dos carros; longe continuam leves.
- Casas que viram prédio (níveis 4 e 5): fachada com janelas desenhadas num bloco só, que acendem à noite. Antes eram centenas de peças (pesado e podia piscar).
- Sol um pouco mais forte e céu um pouco mais fraco, para dar mais contraste e sombra.
- Não tem SQL nesta versão.

## Versão 10/11 (a) · moradia nas cidades vizinhas e prefeito nomeado
- Vila Serra e Porto Sul ganharam moradia: cada uma tem um prédio com 10 apartamentos (11.000) na quadra da estação e 8 terrenos (9.000) em 2 loteamentos. Os terrenos evoluem igual aos do centro (casa, condomínio, prédio).
- Painel › Eu › Prefeitura (só administrador): convocar eleição extraordinária (1 a 6 ciclos), cancelar a eleição e afastar o prefeito. Para nomear, abra a ficha do jogador e toque em "🏛️ Nomear prefeito" (toque duas vezes para confirmar).
- Eleição extraordinária: a campanha abre na hora para o mandato atual. Na apuração o mais votado assume até o fim do mandato. Se ninguém votar, nada muda. Não dá para convocar perto da eleição normal (últimos 4 ciclos do mandato).
- SQL desta versão: rode **34a_moradia_cidades.sql** e **34b_prefeito_admin.sql**.

## Versão 10/11 (b) · mata e Exército
- Nas duas cidades vizinhas dá para sair da rua e entrar na mata (até uns 300 m para os lados). A mata tem mais árvores, com colisão, e arbustos. No Porto Sul o limite é o mar.
- Quartel do Exército na mata a leste de Porto Sul, com estrada até o portão (rua de baixo da cidade). Tem muro, guarita, 4 torres de vigia, comando, alojamento, garagem, paiol, pátio de formatura e mastro com bandeira.
- Carreira no Exército (Agência de Empregos ou 💼 Trabalho), com as mesmas regras da polícia e da PRF: ficha limpa, turno a cada minuto e 35/min × patente. Patentes: Recruta → Soldado → Cabo → Sargentos → Subtenente → Tenente → Capitão → Major → Tenente-Coronel → Coronel → General. Exceção: a equipe pode entrar, e o administrador é sempre o **General Supremo**.
- Soldados NPC: um pelotão marcha em volta do pátio, 2 sentinelas ficam no portão e 2 soldados patrulham a mata em volta do muro.
- Jipe do Exército (provisório, é o SUV verde-oliva até chegarem os GLB dos veículos militares). Fica na frente da garagem para quem é do Exército. Militares também veem os procurados no mapa.
- SQL desta versão: **34c_exercito.sql**. Se ainda não rodou, rode antes o 34a e o 34b.

## Versão 10/11 (c) · modelos 3D novos, helicópteros e caçada do Exército
- Modelos 3D novos:
  - Trem: o modelo 3D aparece por fora; quem está dentro vê o vagão com interior.
  - Árvores: comum, pinheiro e palmeira (no Porto Sul). As árvores perto do jogador viram os modelos 3D; as de longe continuam leves.
  - Jipe, caminhão e helicóptero do Exército, e o helicóptero executivo.
- Helicóptero executivo na concessionária por 1.500.000, o item mais caro do jogo. Acelere para decolar e pare para pousar. Dá para voar entre a metrópole e as cidades vizinhas, mas só dá para descer pousando numa cidade ou na mata. Leva até 4 passageiros.
- Veículos do Exército, ilimitados para militares: jipe (3 passageiros) e caminhão (8) na frente da garagem e helicóptero (6) no heliponto. Só Tenente para cima (ou o General Supremo) pilota o helicóptero. Só militares embarcam nos veículos do Exército.
- Passageiro: chegue perto do veículo de outro jogador (parado ou pousado) e toque em Embarcar. Você desce quando ele parar ou pousar.
- Caçada: em 💼 Trabalho, um militar de Tenente para cima vê os procurados online e pode "Autorizar caçada" por 10 min. O procurado é perseguido por 2 jipes e 4 soldados do Exército, mais rápidos que a polícia, e vai preso quando alcançado.
- Carros e helicópteros agora podem estacionar nas cidades vizinhas e na mata.
- SQL desta versão: **34d_helicoptero_cacada.sql** (rode depois do 34a, 34b e 34c).

## Versão 10/11 (d) · quartel completo, morro da Serra, General Supremo e reset do mapa
- Quartel:
  - O prédio do Comando agora tem porta e interior: balcão do Comando, bandeiras, mesa de mapas, escrivaninhas, armários e armas. O teto some quando você entra.
  - Garagem aberta com 2 jipes e 2 caminhões à mostra, e o helicóptero no heliponto, que ganhou o anel amarelo.
  - Tanque de exposição, sacos de areia no portão, pista de obstáculos, caixotes e tambores.
- No balcão do Comando, quem é militar abre ordens, caçadas e carreira; quem não é abre a Agência para se alistar.
- General Supremo: o administrador vê todos os militares em 💼 Trabalho (ou no balcão do Comando) e escolhe a patente de cada um.
- A caçada do Exército agora aparece para todos os jogadores, não só para o caçado.
- Morro da Serra: atrás de Vila Serra, depois da mata, o terreno sobe até uns 50 m, com árvores. Dá para subir a pé ou de carro. Os morros de enfeite que entravam no mapa foram removidos; a serra de fundo ficou bem mais longe.
- Painel › Eu › Resetar o mapa (só administrador): marque o que limpar (moradia, empresas, clãs, jogadores, prefeitura), digite RESETAR e toque duas vezes. As contas continuam e a equipe mantém o cargo.
- SQL desta versão: **34e_general_reset.sql**.

## Versão 10/11 (e) · personagens de evento
- 18 personagens novos, com as mesmas 13 animações dos atuais: a corrida e a caminhada são as do próprio modelo; o resto é copiado do robô, que tem o mesmo esqueleto. Texturas em JPEG 1024.
- São mais caros (45.000 a 90.000) e só ficam à venda quando o administrador abre a vitrine.
- Painel › Eu › Evento: marque os personagens (nenhum marcado = todos), escolha o tempo (30 min a 7 dias) e toque em "Abrir vitrine". Todos recebem um aviso. "Fechar vitrine" encerra antes.
- Painel › ficha do jogador › "🎁 Presentear" dá um personagem de evento para o jogador.
- O administrador usa todos de graça (Loja › Personagem e nome, ou as skins do painel).
- Na loja, os jogadores veem a seção "✨ Personagens de evento", com o preço e até quando a vitrine fica aberta.
- SQL desta versão: **35_personagens_evento.sql**.
- O pacote vem em 3 partes (código e 2 de personagens) porque os modelos somam ~58 MB.

## Versão 10/11 (f) · General Supremo sem alistar e quartel vivo
- O administrador conta como militar sem precisar se alistar: pega jipe, caminhão e helicóptero, embarca nos veículos do Exército e autoriza caçadas.
- O telhado da garagem do quartel some quando você chega perto, e dá para ver os veículos lá dentro.
- Mais NPCs no quartel: um pelotão de 8 correndo em volta do pátio e do heliponto, e uma turma de 6 recrutas que chega pela estrada, entra pelo portão e vai até o alojamento (a cada ~2 min chega outra turma).
- SQL desta versão: **36_general_sem_alistar.sql**.

## Versão 10/11 (g) · correção: o jogo não abria
- Se o modelo 3D do personagem escolhido ainda não estiver no repositório (por exemplo, um personagem de evento cujo pacote não subiu), o jogo usa um personagem padrão em vez de travar na tela de carregamento.
- Os 18 personagens de evento agora vêm em 6 pacotes menores (pacote-personagens-1 a 6, com 3 personagens cada).

## Versão 10/11 (h) · personagens de evento carregando
- O Robô separador colocou os 18 modelos em `personagens/` em vez de `assets/personagens/`: como o zip só tinha a pasta `assets`, o robô tirou essa pasta de cima. O jogo agora procura o modelo nos dois lugares.
- Daqui para a frente os pacotes sempre vêm com mais de uma coisa na raiz, para isso não acontecer de novo.

## Versão 10/11 (i) · pose parado e sons
- Todos os personagens usam a mesma pose de "parado" dos personagens novos (o idle do robô). Cada um fica na própria altura.
- Helicópteros dos jogadores (executivo e do Exército) tocam o mesmo som do primeiro helicóptero: rotor perto do chão e no alto, conforme a altura, para quem pilota, para os passageiros e para quem está perto.
- O jipe e o caminhão do Exército ficam sem som (antes tocavam a sirene dos bombeiros por engano).

## Versão 10/11 (j) · pés e corpo alinhados
- As animações que vêm do robô (parado, socos, tiro, pegar, levar dano, morrer, carregar, andar atirando) agora são adaptadas para o esqueleto de cada personagem ao carregar. Antes elas eram copiadas direto, e como cada esqueleto tem a pose de descanso um pouco diferente, os pés ficavam virados e o corpo torto.
- Correr e andar continuam sendo as animações próprias de cada personagem.

## Versão 10/11 (k) · armas das corporações, tanque e disciplina militar
- O nome acima da cabeça fica um pouco mais alto e acompanha a altura de cada personagem.
- Armas próprias de cada corporação, que só valem no expediente e substituem a arma básica. Todas atiram mais rápido e são mais letais que a básica:
  - Polícia: tinta amarela.
  - PRF: tinta azul.
  - Exército: tinta verde.
- Arma militar dos clãs: o Contrabandista, no Morro da Serra atrás de Vila Serra, vende por 60.000 só para membros de clã. A compra é ilegal (+1 crime). Ela substitui a arma básica e atira bolas coloridas, com mais dano e mais rápida.
- Arma pesada do Exército: fica no Arsenal do quartel (balcão na frente do paiol). Só sai com autorização de um Tenente para cima (ou do General Supremo), por 2 h, e só no expediente. Matar sem ordem tira a autorização na hora.
- Tanque do Exército: fica no pátio do quartel, só para militares. O botão Atirar (F no PC) dispara o canhão de tinta, com recarga de 2,5 s. Ele explode carros, helicópteros e caminhões: quem está dentro é jogado para fora e se machuca, e o carro volta para o dono 30 s depois. O tanque não tem som.
- Ficha militar (💼 Trabalho): quem tem patente maior vê as mortes causadas pelos militares abaixo, marcadas com ✔ (com ordem) ou ✖ (sem ordem). De Tenente para cima dá para autorizar ou tirar a arma pesada, expulsar do Exército e retirar a expulsão. Quem é expulso não consegue se alistar de novo sozinho.
- SQL desta versão: **37_armas_tanque.sql**.

## Versão 10/11 (l) · correção: armas novas não apareciam
- A troca de arma no meio do jogo encaixava a arma na mão contando com o personagem parado na origem e virado para a frente. Com o personagem em outro lugar ou virado, a arma ia parar fora da mão. Agora o encaixe é calculado com o personagem na origem e depois ele volta para onde estava.
- O General Supremo (administrador) usa sempre a arma do Exército.

## Versão 10/11 (m) · General Supremo armado
- O General Supremo (administrador) pega a arma pesada no Arsenal sem precisar de autorização, mesmo sem estar alistado. Tocar de novo no Arsenal guarda a arma pesada e volta para a arma do Exército.

## Versão 10/11 (n) · armas apontando para a frente
- A arma agora fica presa ao corpo do personagem, não ao osso da mão: aponta sempre para a frente, com a empunhadura na altura da mão direita, entre a cintura e o ombro, e sempre na frente do peito. Antes ela seguia a rotação da mão em cada animação, por isso apontava torta e, em personagens grandes, ficava dentro do corpo.

## Versão 10/11 (o) · estande de tiro do Exército
- O quartel cresceu para o norte e ganhou um estande de tiro no fundo, separado por uma mureta com passagem atrás do tanque. Só militares (e o General Supremo) entram: os outros são barrados na entrada.
- Quatro raias com alvos a 8, 15, 25 e 40 m, bancadas na linha de tiro e um barranco atrás dos alvos.
- Pontos pelo anel acertado (10 na mosca), multiplicados pela distância. O total da sessão aparece na tela.
- Virado para um alvo do estande, o tiro sai na curva certa para compensar a queda da tinta, assim os alvos de longe também podem ser acertados.
- Atalho "Estande de tiro" no teleporte do painel.

## Versão 10/11 (p) · mira das armas novas
- Com uma arma nova sacada (Polícia, PRF, Exército, militar ou pesada), ou dirigindo o tanque, aparece uma mira que só você vê: uma linha tracejada com a curva da tinta e um círculo onde o tiro vai cair.
- A mira tem a cor da sua tinta e fica vermelha quando o tiro vai pegar em alguém.
- A arma básica continua sem mira.

## Versão 10/11 (q) · salários no painel
- Nova aba "Salários" no painel (só administrador). Ela mostra e permite mudar:
  - Polícia: o mesmo valor que o prefeito define (50 a 250).
  - PRF, Hospital, Bombeiros, Jornal e Exército: valor base por minuto em serviço, multiplicado pela patente.
  - Prefeito: valor por ciclo jogado.
  - Moderadores: valor por dia, de cada um.
- SQL desta versão: **38_salarios.sql**.

## Versão 10/11 (r) · polícia mais perigosa
- Procurado que não atira continua sendo só perseguido e preso quando o policial robô encosta.
- Quem atira em um policial robô vira alvo de todos os policiais num raio de 70 m, por 60 s. Eles correm atrás atirando (tinta amarela), com mais alcance (26 m), tiros mais rápidos (menos de 1 s), mais dano (14) e mais pontaria. Dentro do carro é mais difícil de acertar.
- As viaturas também vêm atrás de quem atirou na polícia, por 2 minutos, mesmo sem recompensa, e prendem quando alcançam.

## Versão 10/11 (s) · PRF e Exército também revidam
- 4 agentes da PRF (robôs) patrulham quarteirões perto da Prefeitura, do Banco, do Hospital e dos Bombeiros. Seguem a mesma regra da polícia: prendem procurado que não atira e, se alguém atirar neles, todos por perto revidam com tinta azul e as viaturas vêm atrás.
- Exército: os soldados só agem com autorização, ou seja, numa caçada autorizada por um Tenente para cima ou pelo General Supremo. Durante a caçada, o procurado que não atira é preso. Quem atirar nos soldados ou nos jipes leva revide com tinta verde: tiros mais fortes (16) e mais certeiros que os da polícia, por 60 s.
- Os soldados do quartel (marcha, corrida, sentinelas, recrutas) não reagem sozinhos.

## Versão 11/11 (a) · perdão, jornal, telões, câmera de perto e rotor girando
- ⚖️ Perdão:
  - Painel › Eu › "Perdoar crimes" lista todos com crime ou recompensa, inclusive você, e perdoa com um toque.
  - Na ficha do jogador, o botão "Perdoar todos os crimes" agora também zera recompensa, pena, algemas, crime eleitoral e caçada. O administrador pode se perdoar.
- 📰 Jornal:
  - Novo botão "Jornal" no ☰, e bancas de jornal nas praças das estações de Vila Serra e Porto Sul.
  - Jornalistas (e o administrador) escrevem matérias na Redação: título, texto, link de imagem (https) e data para agendar. Eles podem editar ou apagar qualquer matéria.
  - A faixa de notícias no alto da tela abre o Jornal com um toque e pode ser minimizada com o "–".
- 📺 Telões de LED na frente da Prefeitura e nas praças de Vila Serra e Porto Sul mostram as matérias (com imagem, quando o site da imagem permite) e as reportagens, trocando a cada 10 s. As agendadas só entram na hora marcada.
- 🎥 Câmera de perto: ☰ › Câmera troca entre a câmera de cima (padrão) e uma câmera mais baixa e próxima, por cima do ombro, em perspectiva. Os botões ⟲ ⟳ giram as duas. A escolha fica salva.
- 🚁 Os helicópteros executivo e do Exército agora têm as pás do rotor separadas: giram quando alguém está pilotando (mais rápido no ar) e ficam paradas quando estacionados. Vale para quem pilota e para quem vê.
- 📱 Com o celular deitado, o menu ☰ vira uma grade de 2 colunas com rolagem e cabe na tela.
- SQL desta versão: **39_perdao_materias.sql**.

## Versão 12/11 (p) · Rodoviária, três linhas de ônibus, aeroporto completo e gráfico mais leve
- 🚌 Rodoviária no quarteirão a nordeste do centro (onde era uma praça), com três plataformas cobertas, uma por linha, e painéis com a próxima saída:
  - Linha 1 · Circular (azul): centro da Metrópole.
  - Linha 2 · Aeroporto (laranja): sobe a avenida até o terminal do aeroporto e volta.
  - Linha 3 · Leste (verde): Zona Leste e Cemitério.
- Os ônibus do sistema seguem a tabela pelo relógio do servidor. Quem volta antes da vez espera na fila atrás do que está na plataforma e só encosta quando ele sai. As três linhas chegam quase juntas, uma em cada plataforma. Ônibus indo e vindo se cruzam nas ruas de mão dupla.
- Passageiro: perto de um ônibus parado (ponto ou plataforma), toque em Embarcar (5 moedas, vão para a prefeitura). Toque em Descer para saltar no próximo ponto. No fim da linha você desce na rodoviária.
- Motorista: no 🚌 Despacho da rodoviária escolha a linha e assuma o ônibus que está na plataforma.
- As linhas e os pontos aparecem no mapa grande.
- ✈️ Aeroporto da Metrópole:
  - Cercado, com pórtico de entrada, estacionamento, terminal de vidro (o teto some quando você entra), atendente no balcão de passagens, painel de partidas, pontes de embarque, taxiway, pátio, torre com farol giratório e hangar.
  - Aviões parados e um voo internacional (avião grande) que sai e volta.
  - Luzes da pista acendem à noite. O aeroporto aparece no minimapa e no mapa grande (aba Aeroporto).
- Pistas de Vila Serra e Porto Sul: cercadas, com pátio, quiosque com atendente, avião parado e estrada de terra até a cidade. Os esconderijos que ficavam colados nelas foram afastados.
- 📻 Rádio: a torre conversa com os aviões (pushback, táxi, decolagem, final, pouso). O controlador responde aos pilotos com Autorizar, Aguarde ou Arremeter.
- Aviões e ônibus agora usam o modelo original com textura (antes eram reduzidos e manchados).
- 🎨 Gráfico: a qualidade Média ficou sem pós-processamento (mais leve). As cores ficaram mais vivas e os brancos não estouram mais. A Alta tem brilho só à noite.
- SQL desta versão: **58_tarifa_onibus.sql**.

## Versão 12/11 (q) · fiscal, autoescola, luzes dos veículos e rádio só para quem voa
- 🧾 Fiscal da Rodoviária (nova profissão, 20/min + 30 por atraso registrado):
  - Algumas saídas do sistema atrasam de 15 a 35 s. O painel da plataforma fica vermelho ("ATRASADO") e o ônibus corre mais na rua para recuperar o horário.
  - O fiscal recebe o aviso, vai até o ônibus e toca em Registrar. Vale também para motorista jogador parado na rodoviária depois do horário: ele perde o bônus de pontualidade.
  - O Quadro do fiscal (ponto 🧾 Fiscalização) mostra os horários e os atrasados.
  - Sem fiscal jogador, um fiscal NPC vai até o ônibus atrasado e anota.
- 🚗 Autoescola (oeste do centro):
  - Carteira B (carro, 300), C (caminhão, 600, precisa da B), D (ônibus, 900, precisa da C) e brevê (avião, 1500). O dinheiro vai para a prefeitura.
  - Prova prática: seguir os pontos 📍 dentro do tempo, sem bater 3 vezes. Na D também é preciso parar 2 s nos pontos de ônibus.
  - Brevê: pegue o avião da escola no hangar do aeroporto, decole e pouse numa pista sem cair.
  - Para entrar em serviço: médico precisa da B, bombeiro da C, motorista de ônibus da D e piloto do brevê. Quem já trabalha continua; a equipe não precisa.
- 💡 Luzes à noite (só com o veículo em uso):
  - Carros, caminhões e ônibus: faróis com luz no chão e lanternas vermelhas.
  - Aviões e helicópteros: luzes vermelha e verde nas pontas, estrobo branco piscando e farol vermelho girando.
  - Avião: farol de pouso iluminando a pista à frente. Helicóptero: holofote iluminando o chão embaixo.
- 📻 O rádio da torre agora só aparece para quem está na torre e para quem está num avião perto do aeroporto (decolando ou pousando).
- SQL desta versão: **59_fiscal_autoescola.sql**.

## Versão 12/11 (r) · rota amarela no chão
- 🟨 O motorista de ônibus vê uma faixa amarela no asfalto, com setas andando, mostrando o caminho da linha até o próximo ponto (e no fim, até a fila da plataforma). Ela acompanha o ônibus e, se ele sair do caminho, volta a apontar para a rota.
- Na prova da autoescola a faixa aponta para o próximo ponto 📍.
- Sem SQL nesta versão.

## Versão 12/11 (s) · novos ônibus e coleta de lixo
- 🚌 Quatro modelos novos de ônibus. As linhas alternam os modelos (cada ônibus da frota mantém o seu):
  - Circular e Leste: o ônibus de antes e o urbano moderno.
  - Aeroporto: dois executivos e o de dois andares.
  - O motorista jogador assume o mesmo modelo que estava na plataforma. Som padrão de ônibus.
- ♻️ Coleta de lixo (profissão gari, precisa da carteira C):
  - Central de Reciclagem no leste do centro, com garagem e descarga.
  - 14 lixeiras ao longo de uma volta pelo leste da cidade. Cheias, elas têm sacos em volta; enchem de novo em 4 minutos.
  - O gari pega o caminhão de lixo, segue a faixa amarela até as lixeiras cheias, para do lado para recolher e descarrega na Central.
  - Paga 15 por lixeira e +100 por descarga, além de 22 por minuto em serviço.
  - Sem gari jogador, o caminhão do sistema faz a volta e esvazia as lixeiras.
  - Caminhão com som de caminhão e giroflex laranja (duas lâmpadas no teto da cabine) piscando enquanto trabalha.
- SQL desta versão: **60_coleta_lixo.sql**.

## Versão 12/11 (t) · rodovias, ônibus intermunicipais, mais linhas e rotas com regras
- 🛣️ Duas rodovias: a Norte (rua x = -162) liga a Metrópole a Vila Serra; a Sul (rua x = 216) liga a Porto Sul.
- 🚌 Rodoviária com 5 plataformas: Circular (1), Vila Serra (7), Porto Sul (8), Leste (3) e Aeroporto (2). As intermunicipais usam os ônibus executivos e de dois andares.
- Rodoviárias de Vila Serra e Porto Sul: cobertura na praça da estação, com bancos e placa. A linha intermunicipal para nelas e dá uma volta pelo centro da cidade.
- Três linhas circulares novas, que passam na calçada leste da Rodoviária (ponto "Rodoviária") e rodam sem parar:
  - 4 · Oeste e Serviços: Prefeitura, Autoescola, Hospital, Bombeiros, Estação Sul e Banco.
  - 5 · Estações e Trabalho: Estação Norte, Mercado, Estação Sul e Central de Reciclagem.
  - 6 · Territórios: praças de território NO e SE e Território Oeste.
- 🟨 Faixa amarela:
  - Ônibus: agora só pela faixa da direita do caminho da linha, sem cortar calçada.
  - Autoescola: a prova segue um percurso pelas ruas. Fora da faixa da direita por mais de 1 s, subir na calçada ou não parar no ponto (prova D) é infração; 3 infrações ou 3 batidas reprovam.
  - Pilotos: no chão, a faixa leva pela taxiway até a cabeceira. No ar, mostra a aproximação, a descida e a pista do aeroporto de destino (o mais perto, escolhido na decolagem). Um painel no alto dá as instruções: altura, velocidade máxima, alinhamento e a hora de tocar em POUSAR.
- Sem SQL nesta versão.

## Versão 12/11 (u) · setores de coleta e garis NPC
- ♻️ A coleta tem 4 setores (rotas), todos saindo e voltando à Central de Reciclagem: Leste, Centro, Oeste e Norte. São 54 lixeiras pela cidade; as que ficam no mesmo lugar em dois setores são a mesma lixeira.
- Cada setor tem o seu caminhão do sistema, em horários diferentes, com dois garis NPC nos estribos de trás. Em cada lixeira eles descem, levam os sacos ao caminhão e sobem de novo.
- O gari jogador escolhe o setor na garagem (um gari por setor). O caminhão do sistema daquele setor sai de cena e os dois garis NPC trabalham com o jogador: ao parar do lado de uma lixeira cheia, eles descem e recolhem. Se o caminhão andar antes de eles voltarem, a coleta daquela lixeira é cancelada.
- Sem SQL nesta versão.

## Versão 12/11 (v) · objetos de rua em toda a cidade
- 🚦 Os semáforos em 3D agora estão em todos os cruzamentos da Metrópole (610 no total) e das cidades. Os hidrantes estão em todos os quarteirões (484 no total). Para não pesar no celular, só as cópias mais perto aparecem (até 56 de cada tipo), e elas trocam conforme você anda.
- 🌳 As árvores 3D perto do jogador agora usam os modelos novos (árvore e pinheiro); as de longe continuam leves.
- Sem SQL nesta versão.

## Versão 12/11 (w) · câmera 3D e primeira pessoa
- 🎥 ☰ › Câmera agora tem 4 opções (a escolha fica salva):
  - De cima (padrão).
  - De cima, atrás do personagem.
  - 🌆 3D livre: câmera em perspectiva em volta do personagem. Arraste para girar e inclinar; pinça ou rodinha aproxima. Dirigindo, ela fica atrás do veículo.
  - 👁️ Primeira pessoa: visão dos olhos do personagem, com mira no centro. Arraste para olhar; o joystick anda para onde você olha; o tiro vai na mira (inclusive para cima e para baixo). Em carro, ônibus, caminhão, avião ou helicóptero, a visão é do banco do motorista ou do piloto; arrastando vira a cabeça, que volta para a frente sozinha.
- Nas câmeras 3D os prédios não são mais cortados, e os botões ⟲ ⟳ giram 45°.
- 🏭 Os galpões de Porto Sul que invadiam as ruas agora ficam dentro do quarteirão.
- Sem SQL nesta versão.

## Versão 12/11 (x) · prédios 3D e sedes das empresas em 3D
- 🏙️ Os prédios e casas mais perto do jogador trocam a caixa pelo modelo 3D do tipo, esticado para o tamanho do lote e virado para a rua. Os de longe continuam caixas leves:
  - casa térrea (dois modelos que se alternam) e sobrado;
  - prédio residencial (até ~15 m) e prédio de escritórios de vidro (os mais altos);
  - galpão.
- A quantidade depende da qualidade gráfica: Baixa = nenhum; Média = até 10 num raio de 95 m; Alta = até 22 num raio de 150 m.
- Na câmera de cima, um prédio que tapa o personagem volta a ser a caixa cortada, como antes.
- 🏭 Sedes das empresas em 3D por fase: galpão (níveis 5–9), complexo com chaminés (10–14) e sede com torre de vidro (15). Docas, pátio dos caminhões e heliporto continuam iguais; uma placa na frente leva a cor da empresa.
- Sem SQL nesta versão.

## Versão 12/11 (y) · empresas: fase 1, transportadoras e placa com nome
- Fábricas de nível 1 a 4 usam o novo prédio 3D (prédio pequeno com placa e porta de enrolar atrás).
- Transportadoras têm modelos próprios nos níveis 5–9 (depósito com 3 docas), 10–14 (centro de distribuição) e 15 (sede com torre de vidro e detalhes laranja). Os níveis 1–4 continuam no modelo antigo até chegar o novo.
- A placa da fachada das sedes agora mostra o nome da empresa sobre a cor dela.
- Sem SQL nesta versão.

## Versão 12/11 (z) · rodoviárias, torre e quiosques em 3D
- 🚌 As coberturas das plataformas da Rodoviária da Metrópole e as rodoviárias de Vila Serra e Porto Sul usam o abrigo 3D (teto curvo, bancos e guichê).
- 🗼 A torre de controle do aeroporto é o modelo 3D, com o farol giratório no topo.
- ✈️ As pistas de Vila Serra e Porto Sul têm o quiosque 3D com cúpula e biruta; a atendente fica no balcão da frente.
- 🏭 Transportadoras de nível 1 a 4 usam o prédio novo. Fábricas de nível 5 a 9 usam o galpão com a frente aberta, mostrando a esteira e os braços robóticos.
- O terminal de passageiros e o hangar continuam os de antes: os modelos novos não ficaram bons (e as colunas da cobertura grande da rodoviária caíam em cima das faixas dos ônibus).
- Sem SQL nesta versão.

## Versão 13/11 (a) · primeira pessoa com mãos e cabines
- 👁️ A pé, na primeira pessoa, a câmera fica na cabeça do personagem, um pouco à frente do rosto. Aparecem os braços, as mãos e a arma (socar, carregar caixa, atirar). Chapéu, capacete e etiqueta do nome somem só para você.
- 🚗 No carro: o olho fica dentro da cabine e o capô aparece pelo para-brisa, com colunas, painel e volante desenhados na frente.
- 🚌 No ônibus e 🚚 no caminhão: posição do motorista atrás do para-brisa, com a moldura (no ônibus, a coluna do meio e o letreiro por dentro), painel e volante.
- ✈️ No avião e 🚁 no helicóptero: olho em cima do nariz, então o bico aparece embaixo da visão, com a moldura da cabine.
- Arrastando para virar a cabeça, o painel some; ao olhar para a frente de novo, ele volta.
- Sem SQL nesta versão.

## Versão 13/11 (b) · terminal e hangar em 3D
- ✈️ O terminal de passageiros do Aeroporto da Metrópole tem a fachada 3D de vidro. Ao entrar, a fachada some e aparece o salão (balcão, atendente, cadeiras e painel de voos).
- 🛩️ O hangar dos pilotos é o modelo 3D, com o portão fechado virado para o pátio dos aviões.
- Sem SQL nesta versão.

## Versão 13/11 (c) · direção mais suave
- 🚗 Carros, caminhões e ônibus fazem curva como veículo de verdade. O volante gira aos poucos e volta ao centro sozinho. O raio da curva depende do tamanho do veículo (o ônibus abre mais) e da velocidade: rápido, a curva fica mais aberta. Acabaram as curvas secas e o giro no próprio eixo. O helicóptero continua igual.
- 👁️ Primeira pessoa no veículo: o olho fica no banco do motorista, do lado esquerdo (antes estava no do passageiro). A visão acompanha o veículo com suavidade, olha um pouco para dentro da curva e fica mais aberta (campo de visão maior).
- Sem SQL nesta versão.

## Versão 13/11 (d) · passagem aérea e brevê mais claros
- 🎫 No balcão, cada destino mostra quando sai o próximo embarque. Depois de comprar, a marcação leva ao portão ✈️ e um painel no alto mostra quanto falta para o avião chegar ao portão ("chega em 3:20" ou "EMBARQUE AGORA, sai em 40 s"). Já em voo, o painel mostra quanto falta para chegar.
- O avião agora fica 75 s parado no portão (antes eram 35 s).
- A marcação (feixe amarelo) não some mais no caminho para o aeroporto.
- 🛩️ Brevê: ao pagar a aula, o instrutor leva você direto ao hangar e coloca você no avião da escola. A faixa amarela e o painel no alto guiam até a cabeceira, a decolagem e o pouso.
- Sem SQL nesta versão.

## Versão 13/11 · teste de veículos (20261113e)

- O aviso de cargo e tempo de carreira foi para o topo da tela, abaixo do nome da rua. Um toque minimiza (fica só o ícone) e outro toque mostra de novo. A escolha fica salva no aparelho.
- Os aviões parados no Aeroporto da Metrópole agora formam a frota dos pilotos: grande, médio e dois pequenos, cada um com uma placa. O piloto chega perto e toca em **Pilotar**. O avião sai da vaga já virado para a taxiway e volta para a vaga quando ele desce.
- Quem vira piloto recebe uma marca até a frota. O hangar também usa um avião da frota.
- O som do avião pequeno não se mistura mais com o do helicóptero, nem nos aviões dos outros jogadores.
- Admin: o painel ganhou **🧪 Testar veículo**, com todos os veículos do jogo. Carros, ônibus, caminhões, tanque e helicópteros aparecem onde você está. Aviões levam você à vaga na frota. Ao sair, o veículo de teste some. O teleporte tem também **🛩️ Aviões dos pilotos (frota)**.

## Versão 13/11 · manche (20261113f)

- O avião tem **manche** e não usa mais o controle de carro. No celular, o manche amarelo fica onde estavam as setas. Arrastar para baixo puxa (o nariz sobe) e para cima empurra (desce). Para os lados, o avião vira. Solto, ele mantém a altura. Os pedais continuam sendo o motor.
- No PC: W/S acelera e reduz, as setas ↑/↓ são o manche (↓ sobe) e A/D ou ←/→ viram.
- Decolagem: com a torre autorizando e na velocidade mínima, é preciso puxar o manche para sair do chão.
- No ar:
  - subir gasta velocidade e descer ganha;
  - devagar demais dá **estol** e o nariz cai;
  - o teto é de cerca de 300 m.
- Pouso:
  - o botão POUSAR virou piloto automático de descida, que segue a rampa da faixa amarela até a cabeceira, e o manche ainda corrige;
  - tocar o chão descendo a mais de 5 m/s é pouso duro;
  - sair da pista acima de 16 m/s é acidente.
- O painel de voo mostra a altura e a velocidade vertical.
- O som do avião agora só é ouvido por quem está do lado de fora. O piloto e os passageiros ficam em silêncio.

## Versão 13/11 · rodas (20261113g)

- **Rodas que giram** nos carros, ônibus, caminhões e no jipe e no caminhão do Exército, conforme o veículo anda. Elas giram para trás na ré, e as da frente viram nas curvas. Há cinco estilos:
  - aro de liga prateado (popular e presidencial);
  - aro escuro esportivo com pinça vermelha (esportivo);
  - aro grafite de 6 raios com pneu de cravos (SUV e ambulância);
  - aro de aço com furos e porcas (ônibus e caminhões);
  - aro verde-oliva com pneu de cravos (Exército).
- A roda original do modelo é apagada só dentro do círculo da roda nova, na hora de carregar. Os arquivos .glb dos veículos não foram alterados. As rodas novas ficam em `assets/modelos/roda_*.glb`.
- **Embaixo do veículo** não fica mais oco: tem assoalho escuro, caixas de roda, motor/cárter, escapamento e tanque, e nos pesados também eixos e diferencial.
- Os veículos longe usam uma roda simples e não giram, para não pesar no celular.
- **Primeira pessoa:**
  - cada veículo tem a posição do motorista medida no próprio modelo, e aparece o capô do carro que você dirige;
  - o painel não tampa mais a vista;
  - o volante fica à esquerda, e o console e o retrovisor ficam para a direita;
  - o popular, o jipe e os caminhões usam o interior do próprio modelo.
- **Jipe:** os vidros opacos do para-brisa foram tirados, e o motorista aparece sentado (você e os outros jogadores).

## Versão 13/11 · clássico V8 (20261113h)

- Carro novo na concessionária: **Clássico V8**, por 1.000.000 moedas. É o carro mais caro e o mais rápido (até ~58 km/h no jogo). Leva 3 passageiros e entra no limite de 3 veículos por jogador. Vender devolve a metade, como os outros.
- **Rode o SQL `supabase/61_carro_classico.sql`** no Supabase antes de vender o carro, ou a compra é recusada.
- O modelo está em `assets/modelos/carro_classico.glb`: frente +Z, 5 m de comprimento, textura de cor 1024.
- Rodas novas no estilo cromado de 5 janelas (`roda_classico.glb`), com o embaixo do carro preenchido.
- Primeira pessoa com o interior do próprio modelo: painel, volante à esquerda e o capô laranja aparecendo.
- Sons do motor tirados do áudio enviado:
  - `classico_partida`: ligando;
  - `classico_lenta`: marcha lenta, em loop;
  - `classico_alto`: rotação alta, em loop;
  - `classico_ronco`: acelerada curta.
- Parado, toca a marcha lenta. Conforme acelera, entra o ronco alto e o tom sobe com a velocidade. Pisar no acelerador devagar dá uma acelerada de vez em quando (no máximo uma a cada 5 s).
- A concessionária mostra o Clássico V8 laranja junto com os outros.

## Versão 13/11 · sons dos motores (20261113i)

- Sons novos dos motores, cortados dos áudios enviados. Cada veículo tem:
  - `_partida`: ligando;
  - `_lenta`: marcha lenta, em laço;
  - `_alto`: rotação alta, em laço;
  - `_ronco`: acelerada curta (os caminhões não têm).
- Qual som cada veículo usa:

| Veículos | Som |
|---|---|
| Popular e autoescola | V8 de NASCAR |
| Esportivo e Presidencial | Lamborghini |
| SUV e viatura | Viper |
| Jipe | jipe do Exército |
| Van e ambulância | pickup |
| Caminhões (autoescola, lixo, bombeiros, Exército, empresas) e tanque (mais grave) | caminhão |
| Todos os ônibus | os dois áudios de ônibus (partida, lenta e arrancada de um; andando do outro) |
| Avião grande | turbina de F-16 |
| Avião pequeno | motor de dois tempos |
| Avião médio | o mesmo motor de dois tempos, dobrado em estéreo (desencontrado e um pouco mais grave) |

- O Clássico V8 continua com o som dele.
- **Seu veículo:** parado toca a marcha lenta; acelerando entra a rotação alta e o tom sobe com a velocidade. Pisar no acelerador devagar dá uma acelerada de vez em quando.
- **Ônibus NPC:** fazem marcha lenta no ponto e dão a arrancada ao sair.
- **Outros jogadores:** o motor pega quando o veículo deles aparece perto; parados, fazem marcha lenta; andando, rotação alta.
- **Aviões:** só quem está fora ouve. No chão por perto é a marcha lenta; no ar é a rotação alta, que some com a distância.
- Os sons novos só são baixados quando tocam pela primeira vez. Os sons antigos de motor deixaram de ser baixados.

## Versão 13/11 · piloto automático (20261113j)

- O botão **🤖 AUTO** do avião (no lugar do antigo POUSAR) liga o piloto automático. Você escolhe o destino (o avião grande só pousa na Metrópole) e ele faz o voo inteiro:
  1. taxia pela faixa até a cabeceira;
  2. alinha e pede a decolagem à torre;
  3. decola e sobe até a altura de cruzeiro;
  4. voa até a entrada da reta final;
  5. alinha com a pista e desce pela rampa (10 m a cada 100 m);
  6. arredonda, toca e freia até parar.
- No ar, ele pousa no destino escolhido.
- Nas pistas de Vila Serra e Porto Sul, a chegada é pelo lado de dentro do mapa, no sentido contrário ao da decolagem.
- Ele arremete e tenta de novo se a chegada ficar torta, alta demais, longe do começo da pista, ou se a torre mandar.
- O painel mostra a fase, a altura, a velocidade e a distância até a pista.
- Mexer forte no manche ou nos pedais devolve o controle. Tocar em **DESLIGAR** também.
- Ao parar na pista, ele devolve o controle.
- Voo entre aeroportos paga igual ao manual. Na aula de voo, usar o piloto automático faz a aula não contar.
- **Jipe:** o motorista agora senta no banco da frente (antes ficava no de trás). Até 3 passageiros aparecem sentados: um ao lado e dois atrás, com as mãos no colo.

## Versão 13/11 · queda e revisão (20261113k)

**Rode no Supabase, nesta ordem: `supabase/62a_aviacao_seguranca.sql` e depois `supabase/62b_mecanico.sql`.**

- **Queda de avião ou helicóptero:**
  - Caiu de baixo (até uns 10 m, ou só tocou errado no chão): sobrevive com −40 de vida.
  - Caiu de mais alto (ou descendo muito rápido): morre. Os passageiros também, e se a queda for baixa eles levam −40.
- **Explosão do tamanho da aeronave** (pequeno ×2, helicóptero ×2,5, médio ×3, grande ×4,5): o raio, o tremor, o som e o dano em quem está perto aumentam junto. No lugar fica uma carcaça queimada por 3 minutos.
- **Foco de incêndio:** a queda abre um foco de incêndio de verdade (tabela `incendios`, tipo `queda`). Os bombeiros jogadores apagam e ganham +400; sem eles, os bombeiros NPC apagam em 3 minutos. Os jornalistas também podem reportar.
- **Paraquedas:** custa 5.000 no balcão de qualquer aeroporto (junto com a passagem) e fica na mochila.
  - Com ele, no avião ou helicóptero a mais de 8 m de altura, aparece o botão **🪂 EJETAR** (no PC, tecla **J**).
  - O piloto desce devagar (dá para guiar com o joystick) e o paraquedas é gasto.
  - A aeronave segue sem piloto, cai e explode sozinha.
- **Revisão da frota:**
  - Cada avião da frota da Metrópole conta os voos desde a última revisão (tabela `avioes_frota`), e a placa mostra "N/3 voos".
  - Com 3 ou mais voos a placa fica vermelha ("revisão vencida"). Cada voo além do 3º tem 15% a mais de chance de o motor falhar no ar (15%, 30%, 45%… até 90%).
  - Na falha, o motor para, o piloto automático desliga e o rádio chama Mayday: dá para planar até uma pista ou um campo aberto, ou ejetar.
- **Revisão no avião:** perto do avião, o piloto escolhe entre pilotar ou chamar o mecânico NPC do hangar, que cobra 2.000 (pequeno), 4.000 (médio) ou 8.000 (grande); metade vai para a prefeitura.
- **Profissão nova: mecânico de aviões.** Entra pelo mecânico NPC do hangar, sem requisito além da ficha limpa. Faz a revisão de graça para o piloto e ganha +300 por revisão. A carreira vai de Ajudante, Mecânico e Mecânico Chefe até Inspetor de Aeronaves.
- O helicóptero segue só as regras de queda, sem revisão.

## Versão 13/11 · helicóptero novo (20261113l)

**Rode no Supabase: `supabase/63_heli_respawn.sql`** (depois do 62b).

- **Travamento corrigido:** depois de uma explosão de avião ou helicóptero o jogo congelava; era um erro na pose do motorista sentado. O laço do jogo agora não para mais: se algum erro escapar, aparece um aviso e o jogo segue.
- **Helicóptero com controle novo:**
  - o analógico amarelo leva para a frente (ou de ré, devagar) e vira o nariz para os lados;
  - os pedais viram **⬆️ SUBIR** e **⬇️ DESCER**, devagar;
  - solto, ele fica parado no ar;
  - no PC: W/S frente e ré, A/D virar, R sobe, F desce;
  - descendo em cima de prédio ou obstáculo, ele para a 1,5 m ("lugar ocupado") em vez de explodir.
- **Avião:** a inclinação na curva estava invertida; agora a asa do lado da curva abaixa.
- **Prédios:**
  - avião ou helicóptero abaixo do telhado de um prédio bate e cai, com as regras de queda;
  - alarme "⚠️ PRÉDIO À FRENTE — SUBA!" quando há prédio no caminho dos próximos 3 s;
  - o piloto automático olha à frente e sobe para passar por cima dos prédios. Na decolagem ele sobe reto até passar da altura dos prédios em volta e só depois vira.
- **Pouso automático nas pistas de Vila Serra e Porto Sul:** a pista começa perto da beira do mapa, então o piloto automático chega pelo lado (perna do vento), passa da cabeceira, faz a curva de 180° e pousa no mesmo sentido da decolagem.
- **Revisão do helicóptero a cada 7 voos** (tabela `helis_revisao`): vale para os helicópteros comprados e o do Exército.
  - Pousado perto do mecânico do hangar do Aeroporto da Metrópole, aparece o botão **🔧 REVISÃO** (5.000).
  - Um jogador mecânico revisa helicópteros comprados em qualquer lugar e ganha +300.
  - Sem revisão, o motor pode falhar e o helicóptero cai a 7 m/s; dá para ejetar com o paraquedas.
- **Renascer:** quem morre e não é atendido renasce dentro do hospital depois de **90 s**. A ambulância ou um médico que chegam antes levantam a pessoa no mesmo lugar, na hora.
  - O tempo fica no painel do admin, em **Configurações da cidade → 🏥 Tempo para renascer no hospital** (15 s a 5 min).
  - Na tela aparece a contagem até renascer.

## Versão 13/11 · céu, trânsito e bombeiros (20261113m)
Rode o SQL **`supabase/64_bombeiros_queda.sql`** no Supabase.
- **Céu** (`js/ceu.js`):
  - nuvens que mudam com o clima: poucas e brancas no sol, muitas e escuras na chuva e na tempestade;
  - raio desenhado no céu a cada relâmpago da tempestade;
  - estrelas e lua à noite.
- **Veículos se respeitam:**
  - ônibus, viaturas, caminhões de lixo, bombeiros e ambulâncias param atrás de quem está parado na frente, inclusive de você e do seu carro;
  - o horário deles atrasa um pouco e depois é recuperado;
  - se ficarem travados muito tempo num cruzamento, um passa, para não travar a cidade.
- **Rodoviária:**
  - os ônibus fazem fila para entrar na plataforma, um atrás do outro, e só encostam quando a baia fica livre;
  - nos pontos divididos entre linhas, quem chega depois espera atrás;
  - as linhas circulares 4, 5 e 6 entram na esquina da rodoviária uma de cada vez.
- **Bombeiros:**
  - **3 caminhões dos bombeiros fazem ronda** pela cidade o tempo todo;
  - num incêndio, o caminhão da ronda mais perto vai atender, e os outros saem do quartel;
  - **queda de avião**: fogo de 30 jatos e 3 caminhões; **queda de helicóptero**: 20 jatos e 2 caminhões; casa e empresa continuam com 10 jatos e 1 caminhão;
  - os caminhões NPC **apagam de verdade**: o fogo vai baixando até sumir (queda: de 45 s a 150 s; casa e empresa: de 80 s a 180 s, com a taxa de sempre);
  - um bombeiro jogador que ajuda apaga bem antes e ganha os +400.
- **Segurança do jogo:** se acontecer um erro num quadro, o jogo não congela mais. Aparece um aviso pedindo print.

## Versão 13/11 · financiamento no banco (20261113n)
Rode **`supabase/65a_financiamento.sql`** e depois **`supabase/65b_financiamento.sql`** no Supabase.
- **Financiamento parcelado** no Banco Central (tabela Price, parcelas iguais):
  - o jogador escolhe o valor e o número de parcelas, e vê a simulação antes de confirmar;
  - **mais parcelas = mais juros** (+0,1% por parcela);
  - uma parcela a cada **64 min**, cobrada sozinha da poupança e depois da carteira (o jogo cobra de minuto em minuto, e o banco também cobra ao abrir);
  - dá para adiantar uma parcela ou quitar tudo com desconto dos juros que ainda não correram.
- **Níveis de crédito:**

  | Nível | Limite | Juros base | Máx. de parcelas |
  |---|---|---|---|
  | 1 | 10.000 | 2,2% | 10× |
  | 2 | 25.000 | 2,0% | 12× |
  | 3 | 50.000 | 1,8% | 20× |
  | 4 | 100.000 | 1,6% | 24× |
  | 5 | 200.000 | 1,4% | 30× |

  - Juros por parcela = base + 0,1% × (parcelas − 2).
  - Quitou sem atrasar e usou pelo menos metade do prazo: sobe 1 nível.
- **Inadimplência:**
  - parcela não paga: multa de 2% e INADIMPLENTE;
  - o atraso cresce 3% a cada 64 min, e o banco tira da poupança e de metade da carteira;
  - depois de acertar, volta ao nível 1 com +2% de juros e precisa de 2 financiamentos em dia para subir cada nível até o 3.
- O empréstimo à vista antigo continua, mas não dá para ter os dois ao mesmo tempo.

## Versão 13/11 · ruas e PRF (20261113o)
Rode **`supabase/66a_prf_computador.sql`** e depois **`supabase/66b_prf_sigilo.sql`** no Supabase.
- **Nada de ponto ou lixeira no meio da rua:**
  - o jogo confere o asfalto de verdade;
  - ponto de ônibus ou lixeira que caía numa esquina (encostando na rua que cruza) anda até a calçada mais perto, no máximo 30 m pelo mesmo trajeto;
  - o ônibus e o caminhão de lixo param no lugar novo.
- **NPCs só pelas ruas:**
  - bombeiros, ambulância, viatura, carona e veículos chamados seguem um mapa das ruas: saem pela rua mais perto, andam pelos cruzamentos na faixa da direita e param no meio-fio mais perto do destino, sem atravessar terrenos;
  - sem ligação por rua (rodovias), usam o caminho antigo.
- **Painel do admin → 🧭 Objetos em cima da rua:**
  - lista casas, terrenos, prédios, territórios, lixeiras e pontos que encostam no asfalto, com a posição;
  - toque para ir até lá; "📋 Copiar lista" para mandar a correção.
- **PRF · 🖥️ Computador da PRF** (aba PRF da Prefeitura, só em serviço):
  - mostra o diário de gastos do prefeito: salário dele, salário da polícia, seguranças, saídas do cofre, transferências e atos sobre territórios;
  - transferências e atos sobre território aparecem com o destino em **SIGILO BANCÁRIO**;
  - **🔓 Quebrar sigilo**: a Justiça leva 3 min e o agente precisa ficar em serviço; 1 pedido a cada 10 min por agente;
  - se o destino foi um clã, é a prova: o prefeito é cassado e fica procurado (+3.000). Contra um ex-prefeito, ele fica procurado;
  - o antigo "Investigar documentos" (sorte de 35%) saiu.
- **Prefeito · Obras e eventos (gastos legais):** obra pública, evento na praça ou bônus dividido entre os servidores em serviço (polícia, PRF, médicos e bombeiros). Também aparecem como transferência em sigilo, então a PRF precisa quebrar o sigilo para saber se foi legal.

## Versão 13/11 · semáforos (20261113p)
Sem SQL novo. **Arquivo novo: `js/semaforos.js`.** Confira se ele foi para a pasta `js/`; sem ele o jogo não passa do login.
- **Semáforos brasileiros funcionando:**
  - um poste por esquina, virado para quem chega, do outro lado do cruzamento e à direita;
  - caixa preta em pé com anteparo, três luzes (vermelho em cima, amarelo, verde) e pala;
  - estão nos 305 cruzamentos da Metrópole, de Vila Serra e de Porto Sul;
  - ciclo de 28 s (verde 10 s, amarelo 3 s, 1 s de tudo vermelho), igual para todos pelo horário do servidor, com "onda verde" entre cruzamentos vizinhos;
  - só os semáforos mais perto são desenhados, para ficar leve no celular.
- **NPCs respeitam o sinal:**
  - ônibus, viaturas em ronda, caminhões de lixo, bombeiros em ronda e os NPCs voltando de um chamado param antes da faixa no vermelho e no amarelo;
  - emergência indo com sirene passa;
  - longe de quem joga (onde ninguém vê) eles não param e recuperam o horário.
- **Céu:**
  - nuvens fofas, com base larga e "couve-flor" mais alta no meio (antes pareciam discos voadores);
  - o raio agora é um tubo com brilho, cai na frente de quem está olhando e dura um pouco mais. Assim dá para ver na primeira pessoa; antes era uma linha de 1 pixel que sumia na tela do celular;
  - estrelas e lua trazidas para dentro do alcance da câmera (antes ficavam longe demais e não apareciam).

## Versão 13/11 · cabines e para-brisas (20261113q)
Sem SQL novo. **Arquivo novo: `js/cabine.js`.** Confira se ele foi para a pasta `js/`; sem ele o jogo não passa do login.
- **Cabine completa na primeira pessoa** para esportivo antigo, SUV, viatura, presidencial, ambulância, bombeiros, lixo e todos os ônibus (o popular, o Clássico V8 e os caminhões continuam com o interior do próprio modelo):
  - a cabine fica presa no veículo, então olhando para o lado aparecem a porta, a janela, o retrovisor de fora e o banco do passageiro;
  - colunas, teto e portas na cor do veículo; forro claro, quebra-sóis e retrovisor interno;
  - painel até o assoalho (não aparece mais roda por baixo), com velocímetro e conta-giros, saídas de ar, rádio e console com câmbio;
  - o volante gira quando você vira;
  - nos ônibus: espelhos grandes, letreiro, catraca, mesa do cobrador, balaústres e porta de vidro.
- **Jipe**: a câmera fica mais para a frente e mais baixa, junto do volante.
- **Para-brisas**: nos 6 ônibus e no caminhão de lixo, a parte manchada da textura virou um vidro escuro e limpo, com brilho.

## Versão 13/11 · sons e painel (20261113r)
Sem SQL novo. Substitua também os sons em `assets/sons/`.
- **Ônibus**: o som de motor parado tinha um chiado de freio a ar que repetia em loop. Foi recortado de novo, de um trecho só com o motor em marcha lenta (`onibus_lenta.mp3`). O chiado do meio do som de aceleração também saiu (`onibus_alto.mp3`).
- **Esportivo antigo**: som novo do V6 que você mandou (`esportivo_partida`, `_lenta`, `_ronco`, `_alto`).
- **Presidencial**: som próprio, grave e suave como uma limusine. É o V8 do Hellcat abafado e mais baixo (`presidencial_partida`, `_lenta`, `_ronco`, `_alto`).
- **Esportivo antigo na primeira pessoa**: o painel desceu 16 cm e o teto subiu, então a rua aparece inteira.

## Versão 13/11 · cabines sem barras (20261113s)
Sem SQL novo.
- **Cabines na primeira pessoa**: a soleira da janela e a borda do teto (faixas na cor do carro) passavam da coluna do para-brisa e apareciam como barras indo para frente, por cima do capô. Agora vão só da coluna para trás. A porta continua até o painel, então a roda segue escondida.

## Versão 13/11 · ônibus urbanos novos (20261113t)
Sem SQL novo. **Modelos novos em `assets/modelos/`:** `onibus_apache.glb`, `onibus_busscar.glb` e `onibus_articulado.glb`.
- **Caio Apache Vip IV**: tirei a caixa gigante escondida e as rodas pesadas (o modelo foi de 134 mil para 30 mil triângulos, 1,1 MB). A cor muda conforme a linha. Cabine feita no jogo.
- **Busscar Ecoss**: reduzido de 28 MB para 3,7 MB. Usa o **interior de verdade** na primeira pessoa (painel, volante, catraca, balaústres).
- **Articulado** (18,6 m, no lugar do ônibus básico): reduzido de 91 MB para 2,7 MB. **Dobra na sanfona**: a parte de trás é puxada pela junta como um reboque, a sanfona gira a metade, e as rodas de trás acompanham. Isso vale para os NPCs e quando você dirige.
- **Linhas:**
  - 1 Circular: articulado, Apache e Busscar;
  - 3 Leste: urbano, articulado e Busscar;
  - 4, 5 e 6 (circulares): urbano, Apache e Busscar.
- A fila da plataforma e a espera nos pontos agora usam o comprimento de cada ônibus, então o articulado não encosta em ninguém.
- **📜 Créditos** no menu ☰: os modelos do Apache e do Busscar são do Sketchfab, com licença **CC-BY 4.0**, que exige o crédito:
  - "Caio Apache Vip IV" por lael.eugenio — https://sketchfab.com/3d-models/caio-apache-vip-iv-9d368d4f432b40a18f8882563043ee04
  - "Busscar Ecoss MB OF-1721 - FULL" por QCY — https://sketchfab.com/3d-models/busscar-ecoss-mb-of-1721-full-db6df9e45e17418c9f191f81af27bbcf

## Versão 13/11 · ônibus de viagem e caminhão (20261113u)
Sem SQL novo. **Modelos trocados em `assets/modelos/`:** `onibus_executivo2.glb`, `onibus_dois_andares.glb` e `caminhao.glb`.
- **Rodoviário amarelo** (no lugar do `onibus_executivo2`): 14 m e três eixos. Reduzido de 29 MB para 1,2 MB.
- **Dois andares azul** (no lugar do `onibus_dois_andares`): 14 m e quatro eixos. Reduzido de 54 MB para 1,5 MB.
- **Os nomes das empresas foram trocados por "FATOR RP"**: adesivos por cima dos letreiros nas laterais, na frente (letreiro luminoso) e na traseira. Esses dois ônibus mantêm a pintura original (não pegam a cor da linha).
- **Linhas 7 Vila Serra e 8 Porto Sul** (as mais longe) agora usam só esses dois ônibus de viagem. A linha 2 Aeroporto fica com o executivo.
- **Caminhão baú** (no lugar do `caminhao`): cabine amarela e baú branco, de 87 MB para 1,8 MB. É o caminhão das transportadoras e também o da autoescola. Ganhou cabine na primeira pessoa.
- Rodas que giram e cabines medidas em cada modelo novo. A fila e a espera nos pontos usam 14 m para os ônibus de viagem.

## Versão 13/11 · modelos sem rachaduras (20261113v)
Sem SQL e sem código novo: só os modelos em `assets/modelos/` (`onibus_apache`, `onibus_busscar`, `onibus_articulado`, `onibus_executivo2`, `onibus_dois_andares`, `caminhao`).
- **Rachaduras**: na redução dos modelos, os dois lados de cada costura da textura iam para pontos diferentes e abriam frestas na lataria. Agora os dois lados vão para o mesmo ponto e a malha fica fechada.
- **Caminhão por dentro**: as paredes da cabine vistas de dentro (as manchas amarelas) foram tiradas. Pela janela agora se vê a rua. Por fora a cabine continua igual.

## Versão 13/11 · curvas pelos eixos (20261113w)
Sem SQL novo. **Arquivo novo: `js/eixos.js`** (precisa estar no repositório, senão o jogo não abre). **Modelos novos em `assets/modelos/`:** `int_onibus`, `int_rodoviario`, `int_caminhao`, `int_van`, `int_carro` e `int_jipe`. **Modelos trocados:** `onibus_articulado`, `onibus_executivo2`, `onibus_dois_andares` e `caminhao`.
- **Curvas de verdade** (`js/eixos.js`): o eixo da frente segue a rua e o de trás vem puxado por ele. O veículo sempre aponta do eixo de trás para o da frente, então a traseira fecha para dentro aos poucos em vez de virar de uma vez. Vale para ônibus, caminhão de lixo, viaturas, bombeiros, ambulâncias e os carros e vans dos serviços. A parte de trás do articulado continua dobrando como reboque. É só o desenho: horário, filas e colisão usam a posição de sempre.
- **Esquinas arredondadas**: as rotas das viaturas, dos bombeiros e dos veículos chamados (`rotaRuas`) viram curva nas esquinas, com até 8 m de raio. Nas linhas de ônibus o raio passou de 7 para 9 m.
- **Ônibus não entram mais um no outro**: um ônibus que encosta em outro no mesmo sentido fica para trás até abrir espaço. Isso vale para linhas diferentes na fila da rodoviária, na saída dos pontos e quando o horário volta atrás. Dois veículos no mesmo lugar não andam mais juntos ("invisíveis"): um deles para até o outro sair. Longe da câmera também se respeitam, com checagem a cada meio segundo. O sinal vermelho é medido pelo bico do veículo, para um ônibus comprido não parar com a frente já dentro do cruzamento.
- **Sem nome de empresa**: os adesivos saíram. Os nomes foram cobertos com a tinta da lataria em volta, e "FATOR RP" foi pintado direto na textura. No rodoviário amarelo fica nas laterais, no letreiro da frente e na traseira; no dois andares, nas laterais e na traseira.
- **Menos rachaduras**: os modelos Meshy (articulado, rodoviário, dois andares e caminhão) agora usam textura 2048 e uma redução mais fina, então as bordas ficam mais limpas.
- **Visão de dentro em 3D**: na primeira pessoa aparece o interior novo (painel, volante e bancos) do ônibus urbano, do ônibus de viagem, do caminhão, da van, do carro e do jipe. Os modelos são carregados só quando alguém entra no veículo.

## Versão 13/11 · passageiro no ônibus e rodoviária (20261113x)
Sem SQL e sem arquivo novo; muda só `js/main.js` (e `index.html`). Este pacote já traz tudo do 20261113w também (o `js/eixos.js`, os interiores e os modelos), então pode subir só ele.
- **Passageiro dentro do ônibus**: o passageiro seguia o horário puro do ônibus. Quando o ônibus esperava (fila, ponto ocupado, sinal, trânsito), o passageiro ia na frente sozinho: o ônibus ficava para trás ("invisível") e a pessoa atravessava a cidade. Agora o passageiro anda colado no ônibus de verdade, e o sinal de descer também usa o horário com atraso.
- **Rodoviária, ônibus indo para trás e para frente**: quem esperava a vez (esquina das circulares, ponto ocupado, saída da rodoviária) era recuado de meio em meio segundo, passava do ponto e voltava a andar. Isso virava um vai e vem de 5 a 8 m. Agora o ônibus para exatamente no limite e espera ali. No teste de 5 minutos, as voltas para trás caíram de 659 para 127, e as que sobraram são quase todas menores que 10 cm.
- **Saindo da plataforma**: o ônibus só põe o bico para fora quando a rua está livre; quem vem pela rua tem a vez.
- **Longe de você os ônibus também se respeitam**: antes, a mais de 320 m eles andavam só pelo horário e podiam chegar perto de você já um dentro do outro. Agora continuam freando e esperando mesmo sem aparecer na tela.

## Versão 13/11 · arrancada e luzes (20261113y)
Sem SQL e sem arquivo novo. Mudam `js/main.js`, `js/civico.js`, `js/servicos.js`, `js/mundo.js` e `index.html`.
- **Luzes dos prédios**: as vitrines do térreo brilhavam forte (todas acesas, força 1,3) e ofuscavam a rua. Agora só parte delas acende, com luz quente e fraca (0,45). As janelas de cima também baixaram, de 1,05 para 0,7.
- **Arrancada gradual**: cada veículo tem a sua aceleração. Ela é forte no começo e mais fraca perto da velocidade máxima. Tempos para chegar perto da máxima: esportivo e clássico 3 s; popular e viatura 5 s; ambulância e presidencial 5,5 s; SUV, jipe e van 6,5 s; caminhões, bombeiros e lixo 11 s; tanque e ônibus urbano 12 s; executivo 14 s; rodoviário e dois andares 15 s; articulado 16 s.
  - Quem você dirige usa essa tabela, no lugar da aceleração igual para todos.
  - Os veículos do sistema (ônibus, viaturas, bombeiros, lixo, ambulâncias e caminhões chamados) também saem devagar depois de cada parada ou espera. O tempo perdido arrancando vira atraso, como no trânsito, e o horário é recuperado depois. Todos os aparelhos continuam vendo igual.
  - Na fila e na plataforma da rodoviária o ônibus arranca devagar, anda no máximo 5 m/s e freia chegando na vaga.
- **Saída da rodoviária**: o ônibus da plataforma só espera quem está andando na rua, e não mais quem está entrando na plataforma atrás dele. Isso travava os dois por mais de um minuto. Quem já pôs o bico na rua termina de sair.

## Versão 13/11 · fogo em veículo (20261113z) · etapa 1 dos crimes de clã
**SQL novo: `supabase/67_incendio_veiculo.sql`** (rode antes de subir o jogo). Mudam `js/main.js`, `js/servicos.js`, `js/rede.js` e `index.html`.
- **Incendiar**: quem é de clã, logo depois de largar um veículo (por enquanto o carro roubado da rua), tem 90 s para tocar em **Incendiar** perto dele. Conta como crime (fica procurado). Dá para incendiar no máximo 1 veículo a cada 45 s.
- **O fogo cresce**: começa com uma chama pequena, vai aumentando, e o veículo escurece até virar uma carcaça preta, em uns 90 s.
- **Apagar**:
  - Nos primeiros 20 s, qualquer jogador perto toca em **Abafar** (umas 3 abafadas).
  - Depois disso, só os bombeiros. Os caminhões NPC saem em 10 s: 1 para carro e van, 2 para ônibus e caminhão. Eles apagam de 40 s até 150 s. O bombeiro jogador que ajuda ganha +400.
- Carro em chamas ou queimado não pode ser arrombado.
- As próximas etapas (sequestro de ônibus, caminhão e van; saque; viatura abandonada; assalto a NPC; NPCs nos pontos) usam este mesmo fogo.

## Versão 13/11 · sequestro de ônibus (20261113za) · etapa 2 dos crimes de clã (parte 1)
**SQL novo: `supabase/68_sequestro_onibus.sql`** (o 67 já precisa ter rodado). Mudam `js/main.js`, `js/rede.js`, `js/sons.js` e `index.html`. Também vão os sons que não tinham chegado ao repositório: `assets/sons/esportivo_*` (esportivo antigo, V6 novo), `assets/sons/presidencial_*` e `assets/sons/onibus_alto`/`onibus_lenta` (sem o chiado de freio parado).
- **Botão extra de crime** (vermelho, ao lado do botão de ação; no PC, a tecla C): **🔥 Incendiar** e **🔫 Sequestrar** aparecem nele, e o botão de ação continua com Arrombar, Entrar e Dirigir.
- **Sequestrar ônibus**: o membro de clã armado fica na frente do ônibus, a até 9 m, olhando para ele.
  - O motorista NPC desce e foge correndo. Os passageiros descem um a um, a cada 0,75 s, e fogem também.
  - Depois disso quem sequestrou assume a direção. A saída some da linha para todos, e quem estava de passageiro desce.
  - Conta como crime, com no máximo 1 sequestro por minuto.
- **Ônibus largado**: quem largou pode tocar em Incendiar (o fogo é de porte grande, então saem 2 caminhões de bombeiro). Alguém do mesmo clã pode tocar em Dirigir para pegar de novo.
- Parado 7 minutos sem ninguém mexer, o ônibus some e a saída volta para a linha.
- **Ônibus longe**: viraram um marcador vazio, que só monta o modelo quando chega perto. Isso deixa a abertura do jogo mais leve.
- **Erro na tela**: se algo quebrar ao abrir, o erro aparece numa caixa vermelha embaixo. Toque nela para fechar. Mande um print dela se acontecer.

## Versão 13/11 · sequestro de caminhão e van (20261113zb) · etapa 2 (parte 2) e etapa 3 (saque)
**SQL novo: `supabase/69_sequestro_caminhao.sql`**. Mudam `js/main.js`, `js/rede.js` e `index.html`.
- **Sequestrar caminhão ou van de empresa em entrega**: o membro de clã armado fica na frente do veículo, olhando para ele, e usa o botão extra **🔫 Sequestrar**.
  - O robô motorista desce e foge correndo, e quem sequestrou assume o volante na hora, sem precisar bater até zerar a vida.
  - O pedido da empresa perde as caixas, e o dono recebe o aviso.
  - Conta como crime, com no máximo 1 sequestro por minuto (somando ônibus e caminhão).
- **Saque**: com carga, leve até o território do seu clã ou a sua casa e toque em **Descarregar**. As caixas vão para o estoque do clã e o robô leva o veículo de volta para a garagem do dono.
- **Largado**: dá para pôr fogo (🔥 Incendiar). Caminhão é porte grande (2 caminhões de bombeiro); van é porte pequeno.
- Parado por **7 min** (antes eram 5), o veículo volta para a garagem do dono, já sem a pintura de queimado.
- O roubo antigo (bater até zerar a vida e o robô levar a carga) continua funcionando.

## Versão 13/11 · crimes de clã completos (20261113zc) · etapas 4, 5 e 6
**SQL novo: `supabase/70_assalto_npc.sql`**. Mudam `js/main.js`, `js/rede.js` e `index.html`.
- **Viatura que encosta (etapa 4)**: na perseguição, se você sai da pista (terreno, entre prédios), a viatura encosta no fim da rua e descem 2 policiais robôs que seguem a pé.
  - Encostam em você: você é preso. Se você se afasta 60 m, pega um carro e vai para a rua, ou passa 1 min e meio, eles voltam para a viatura.
  - Enquanto estão fora, a viatura fica destrancada e o botão de ação mostra **Roubar** (conta como crime).
  - Se voltam e a viatura sumiu, chamam reforço: outra viatura vem atrás de você.
  - A viatura roubada e largada pode ser incendiada; em 3 min a polícia recolhe.
- **Assalto a pedestre NPC (etapa 5)**: armado, perto de um pedestre e virado para ele, use o botão extra **💰 Assaltar**. Ele levanta as mãos, entrega de 50 a 300 moedas e sai correndo.
  - Em 40% das vezes ele chama a polícia, e uma viatura vem atrás de você.
  - Conta como crime, com no máximo 1 assalto a cada 3 min.
- **Gente nos pontos e na rodoviária (etapa 6)**:
  - Quanto mais tempo sem ônibus, mais gente espera no ponto (até 3; na plataforma, até 4). Elas ficam olhando para a rua.
  - Quando o ônibus da linha para, sobem uma por vez pela porta da frente.
  - Às vezes alguém desce, anda pela calçada e entra numa casa.
  - Isso só aparece perto de você, com até 14 pessoas ao mesmo tempo, para não pesar o celular.

## Versão 13/11 · saque, vans e passageiros (20261113zd)
**SQL novo: `supabase/71_saque_prejuizo.sql`**. Mudam `js/main.js`, `js/rede.js`, `js/civico.js` e `index.html`.
- **Passageiros de verdade**: cada saída de ônibus tem a sua lotação. Quem sobe no ponto entra na conta e quem desce sai dela; na rodoviária desce todo mundo. No sequestro, desce quem estava dentro.
- **Denúncia para todos**: quando o pedestre assaltado chama a polícia, os policiais e a PRF on-line recebem o chamado com a rua e o rastreio do local. Quem está perto vê o aviso.
- **Saque em qualquer lugar**: com o caminhão ou a van sequestrada parados, o botão **Saquear** descarrega a carga onde o clã quiser. Ela vai para o estoque do clã, ou para a mochila de quem não tem clã.
- **Prejuízo do veículo queimado**: se o veículo da empresa queimou (fogo de mais de 90 s), ele volta para a garagem e a empresa paga 8.000 de conserto. O dono recebe o aviso.
- **Vans NPC**: 4 vans de entrega rodam pela cidade e podem ser sequestradas (botão extra **🔫 Sequestrar**). O motorista desce e foge.
  - Largada, a van pode ser incendiada, e alguém pode tocar em **Dirigir** para pegar de novo.
  - Parada por 7 min, ela volta para a rota.

## Versão 13/11 · rações do Exército (20261113ze)
**SQL novos: `supabase/72a_jujubas.sql` e `supabase/72b_jujubas_transporte.sql`** (rode os dois, nessa ordem). **Arquivo novo: `js/racoes.js`**. Mudam `js/main.js`, `js/rede.js`, `js/loja.js` e `index.html`.
- **Jujuba (ração militar)**: na mochila, **Usar ração**. Por exatos 5 min você fica 10% mais rápido, o soco bate 30% mais forte (ganha a briga de quem não comeu) e recupera 20% da vida aos poucos.
- **Armazéns**: Polícia, PRF e Bombeiros têm um armazém cada, de até 10.000.
  - No balcão da corporação, o botão extra **🍬 Rações** abre o armazém.
  - Cada membro pega 5 por vez, com espera de 5 min.
  - Quando o estoque fica baixo, qualquer membro pede reposição.
- **Central do Exército** (no balcão do Quartel, botão **🍬 Rações**): mostra o estoque dos 3 armazéns em tempo real e os pedidos. Para cada pedido dá para mandar **o que falta** ou **1 caminhão cheio**, com até 5.000 por caminhão.
- **Licitação** (no balcão do Quartel, botão **📄 Licitação**):
  - Transportadoras nível 5 ou mais dão lances, e ganha o menor.
  - Quando a licitação fecha (10 min), o valor do contrato vai na hora para o caixa da vencedora.
  - O contrato vale 5 caminhões, e cada caminhão despachado paga mais o valor atual (50.000).
  - Depois dos 5 caminhões abre uma licitação nova. O administrador muda o valor na mesma janela.
- **Placa no Quartel**: mostra o valor atual por caminhão e é refeita quando ele muda.
- **Caminhão de rações**: sai do Quartel (Porto Sul), pega a rodovia e entra na cidade até a corporação, com hora de chegada igual para todos.
  - Membro de clã armado, na frente dele, pode **🔫 Sequestrar**. O motorista foge e o pedido volta a ficar aberto para o Exército mandar outro.
  - Trava: essa carga não dá para saquear para o clã.
  - Largado e parado por 7 min, a carga se perde.
- **Comprador ilegal (Seu Tonho)**: tem um armazém ao lado da loja de Vila Serra.
  - Compra a carga sequestrada por 9 moedas cada jujuba (45.000 por 5.000) e revende aos membros de clã por 500 cada.
  - Fecha o armazém (porta abaixada, placa FECHADO) quando tem Exército, Polícia ou PRF por perto.

## Versão 13/11 · rua obstruída e explosões (20261113zf)
**SQL novo: `supabase/73_fogo_explosao.sql`**. Mudam `js/main.js`, `js/mundo.js`, `js/rede.js`, `js/governo.js` e `index.html`.
- **Rua obstruída**: um veículo pegando fogo (e a carcaça depois) fecha a faixa.
  - Os NPCs param antes e nunca atravessam, nem depois da espera longa.
  - Quem dirige bate nele como numa parede.
  - A obstrução some quando o veículo sai dali.
- **Desvio**: o mapa de ruas marca o trecho como fechado.
  - Caminhões dos serviços, viaturas e o caminhão de rações recalculam o caminho pela rua mais perto.
  - O ônibus que ainda não entrou no trecho contorna pela quadra ao lado, na velocidade normal (o horário espera a volta mais longa), e retoma a linha depois.
  - Quem já estava dentro espera.
  - O caminhão dos bombeiros continua chegando até o fogo.
- **Explosão**: se ninguém apagar, o carro e a van explodem aos 75 s de fogo e o ônibus e o caminhão aos 100 s. Não explode se o fogo já tiver caído abaixo de 40% (bombeiros apagando).
  - A explosão deixa clarão, tremor e carcaça.
  - Quem está a até 6 m perde 50 de vida; quem está a até 10 m perde 20.
  - O fogo pula para os veículos parados a até 8 m (largados, sequestrados, viatura ou van roubada, caminhão de rações largado e carros dos jogadores), e eles também podem explodir.
- **Carro de jogador queimado**: fica preto e não anda. O dono paga **5.000** de conserto na **concessionária** (botão 🔧 Consertar em "Seus carros").

## Versão 13/11 · fogo nos carros das vagas (20261113zg)
Sem SQL. Mudam `js/main.js`, `js/mundo.js` e `index.html`.
- A explosão também incendeia os **carros estacionados nas vagas da rua** a até 8 m, além dos carros dos jogadores e dos veículos largados. O carro sai da vaga e queima ali mesmo, e também pode explodir. Uns 6 min depois a vaga volta com um carro novo.

## Versão 13/11 · anti-trapaça e auditoria (20261113zh)
**SQL novos: `supabase/74a_antitrapaca.sql`, `74b_ligar_assinatura.sql`, `74c_auditoria.sql` e `74d_auditoria_leitura.sql`.** Mudam `js/rede.js`, `js/main.js`, `js/painel.js` e `index.html`.

**Ordem (importante):**
1. Suba este pacote e espere o jogo atualizar (abra e confira a versão 20261113zh).
2. Rode o **74a** e depois o **74c**.
3. Jogue um pouco e confira se está tudo normal.
4. Rode o **74b**, que liga a exigência da assinatura.
5. Rode o **74d**, que só lê e não muda nada, e mande o resultado.

**Emergência:** se o jogo parar de responder depois do 74a, rode isto para desligar a vigia:
`alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`

- **Vigia** (74a): roda antes de todo pedido ao banco.
  - Pedido sem a assinatura do jogo é recusado (depois do 74b).
  - Mais de 30 pedidos por segundo conta 1 falta, e acima de 60 o pedido é recusado.
  - Conta banida só consegue ler.
- **Armadilhas**: funções com nomes tentadores que o jogo nunca chama (`admin_dar_moedas`, `admin_definir_cargo`, `liberar_vip`, `dar_item_gratis`, `zerar_pena`, `modo_imortal`). Quem chama é banido na hora.
- **Ban automático**: 3 pontos de falta em 10 min. Admin nunca é banido automaticamente.
  - No painel, em **Denúncias → 🚨 Anti-trapaça**, aparecem as faltas de cada jogador, com o botão **Perdoar e desbanir**.
- **Assinatura**: o jogo manda o cabeçalho `x-fator` em todo pedido. Para trocar a assinatura, mude em `js/rede.js` (ASSINATURA) e na tabela `seguranca` (assinaturas) juntos.
- **Auditoria** (74c):
  - A função de log do painel (`registrar`) podia ser chamada por qualquer jogador; agora não pode mais.
  - Funções internas (dar item, avisar, devolver veículo…) foram fechadas de vez.
  - 17 funções do jogo deixaram de aceitar chamada de quem não fez login.
  - Na venda da carga de rações, o servidor confere se deu tempo de levar o caminhão até o comprador. Quem teleporta leva falta.
- **No jogo**:
  - Golpes e atropelos que chegam rápido demais do mesmo jogador (mais de 8 por segundo) são ignorados.
  - O aviso de "mapa resetado" só recarrega a página se veio de um admin on-line.

## Versão 13/11 · armazém do Seu Tonho (20261113zi)

- **Caminhão "transparente"**: o modelo novo do caminhão tem muitas faces viradas para dentro. Agora os modelos de caminhão são desenhados dos dois lados, e a cabine e o baú ficam inteiros.
- **Comprador em destaque**: quando um membro de clã sequestra ou pega de volta o caminhão de rações, o armazém do Seu Tonho é marcado no mapa, com o feixe amarelo. A marca some depois da venda.
- **Armazém novo**: galpão de tijolo com telhado de zinco em duas águas, porta de enrolar de metal, toldo, lâmpada, janelas com grade, caixotes, palete e balcão. As árvores da frente foram tiradas, e o galpão agora tem colisão.
- **Seu Tonho**: fica atrás do balcão, de frente para a rua, com o nome em cima. Ele some quando a loja fecha porque há Exército, Polícia ou PRF a menos de 45 m.
- **Ônibus e veículo em chamas**: nenhum ônibus passa pelo fogo. Eles param antes ou desviam, e os que estão saindo da rodoviária também esperam.

## Versão 13/11 · barra de voo (20261113zj)

- No avião, as instruções de voo e o piloto automático ficam numa barra fina no topo da tela, e não mais no meio.
- O rádio também aparece dentro dessa barra, só a última mensagem, sem empilhar na tela.
- Tocar na barra minimiza ou abre. Minimizada, ela vira uma pílula pequena de uma linha. A escolha fica salva no aparelho.
- Quando a torre fala, ou na autorização de decolagem e na arremetida, a barra abre por uns 3 segundos, mesmo minimizada.
- Fora do avião o rádio e os avisos continuam como antes.

## Versão 13/11 · cabines do caminhão e do rodoviário (20261113zk)

- **Visão de dentro do caminhão**: desde que a lataria passou a ser desenhada dos dois lados, o avesso dela aparecia em volta do para-brisa. Agora, só no veículo que você dirige e só na visão de dentro, a lataria volta a ter um lado só. Por fora o caminhão continua inteiro.
- **Ônibus rodoviários** (executivo, executivo 2 e dois andares): o interior `int_rodoviario.glb` tem o volante ao lado do banco do motorista. Por enquanto eles usam o interior do ônibus urbano, que tem o volante na frente do banco. Se o `int_rodoviario.glb` for refeito, é só trocar `int: 'int_onibus'` por `int: 'int_rodoviario'` nesses três ônibus, na tabela CABINE do `main.js`.

## Versão 13/11 · Área 51 e o óvni (20261113zl)

- **Área 51**: base secreta do Exército no deserto, a oeste da Metrópole. Para chegar, siga a Avenida Central (z = 0) para o oeste até o fim. Tem muro com arame, portão com cancela, guarita, placas de acesso restrito, pista, heliponto, holofotes que acendem à noite, dunas e cactos.
- **Quem entra**: só militares do Exército de Tenente para cima (e o admin). Para os outros, o portão não abre e quem cair lá dentro volta para fora. Helicóptero de fora não consegue pousar.
- **Óvni do Exército** (novo `js/ovni.js`): fica guardado no Hangar 18. É um disco metálico com cúpula, anel de luzes coloridas girando, luzes piscando por baixo e um halo que brilha mais à noite.
  - Voa como o helicóptero, mas sobe, desce e anda mais rápido e quase não inclina.
  - Faz um zumbido próprio, gerado na hora, sem arquivo de som.
  - Só Tenente para cima pilota. Leva mais 2 militares de passageiro.
  - Todos os jogadores veem o óvni voando.
  - Se existir `assets/modelos/ovni.glb`, o casco vem dele e as luzes ficam por cima.
- **Invisível**: pilotando, o botão **👻 Invisível** (no PC, tecla I) faz o óvni sumir para todo mundo, no céu ou em qualquer lugar: sem luzes, sem zumbido e sem avistamento. Quem pilota continua vendo o óvni, sem o halo. Pousado fora do hangar, ele fica invisível sozinho.
- **Nunca fica exposto**: o teto do Hangar 18 tem duas folhas que abrem em 3 s quando um óvni chega perto e fecham quando ele vai embora. Se o piloto desce do óvni fora do hangar, ele volta sozinho, invisível, para o Hangar 18.
- **Abdução**: com o óvni a menos de 45 m de altura, devagar e em cima de um jogador, aparece **👽 Abduzir**. Sai um feixe de luz que todos veem. O abduzido sobe no feixe, a tela dele fica branca e depois preta, e ele acorda numa rua qualquer da Metrópole sem lembrar de nada.
  - Não funciona em quem está num lugar fechado, num veículo, caído, preso ou algemado.
  - O mesmo jogador só pode ser abduzido de novo depois de 10 min. O feixe recarrega em 2 min.
- **Jornalistas**: à noite, com o óvni voando alto, quem está a menos de 320 m recebe "🛸 Luzes estranhas no céu…".
  - Os jornalistas recebem o avistamento com a região aproximada, cerca de 60 m de erro, e uma marca no mapa por 3 min, para correr e fotografar pelo Jornal › Tirar foto.
  - Cada abdução vira um "Relato de abdução" para os jornalistas, com a região, sem dizer quem foi.

## Versão 13/11 · botões do óvni (20261113zm)

- Pilotando o óvni, aparecem dois botões grandes do lado esquerdo, no meio da tela: **👻 Invisível** (ou 👁️ Visível) e **👽 Abduzir**. Antes o botão de invisibilidade ficava atrás do Sair e das setas da câmera.
- O botão Abduzir fica sempre à mostra e diz o estado: o nome do alvo, "sem alvo" ou o tempo de recarga. Tocado sem alvo, ele explica o que falta: subir, descer, parar ou chegar mais perto de um jogador, com a distância do mais perto.

## Versão 13/11 · óvni abduz moradores (20261113zn)

- **Teleportar → 🛸 Área 51 (portão)** no painel de admin. O lugar continua fora do mapa para os jogadores.
- O óvni também abduz os **moradores da calçada**, mas não os robôs da polícia nem os bandidos. Quando não há jogador embaixo, o alvo é o morador mais perto, a menos de 7,5 m.
  - O morador sobe girando no feixe, some e volta à calçada depois de 3 min.
  - Todos veem, e os jornalistas recebem o relato de abdução.
  - A recarga do feixe depois de abduzir um morador é de 30 s. Depois de abduzir um jogador continua 2 min.

## Versão 13/11 · estrelas e perdão automático (20261113zo)

**Rode o SQL `supabase/75_perdao_automatico.sql`** (depois do 74d).

- **Estrelas**: os crimes viram estrelas, 1 crime = 1 estrela, no máximo **5**. Quem tinha mais de 5 fica com 5. Elas aparecem no seu painel (★★★☆☆), na etiqueta em cima da cabeça, na lista de procurados, na denúncia, na ficha do jogador e no painel de admin.
- **Perdão automático**: até 3 estrelas, some 1 a cada **5 min**. Acima de 3, cada estrela extra leva **20 min**. Com 5 estrelas, a ficha limpa em 55 min.
  - Só conta o tempo **online**.
  - O relógio **pausa** enquanto a polícia persegue ou cerca você e enquanto você está preso ou algemado.
  - **Crime novo zera o relógio.**
  - No painel aparece "próxima some em 4:32" ou "perdão pausado".
- A conta é feita no servidor (`perdao_tick`, chamado a cada 30 s). Um intervalo maior que 50 s, por estar offline, não conta. Não dá para apressar mexendo no jogo.
- A recompensa (🎯) não é mexida: ela só sai quando alguém cobra ou pelo perdão do admin.

## Versão 13/11 · Área 51 vigiada (20261113zp)

- **12 soldados robôs armados** ("Exército · Área 51"): 4 no portão (2 fora e 2 dentro), 4 em plataformas de vigia nas quinas e 4 fazendo ronda por dentro. Eles se viram e apontam para quem se aproxima.
- **Quem não tem acesso** (civil, polícia, PRF ou Exército abaixo de Tenente):
  - a menos de **40 m do muro**: aviso "⚠️ Área militar restrita. Dê meia-volta ou será abatido";
  - a menos de **15 m do muro**, no portão: 3 s de **ÚLTIMO AVISO** com contagem. Depois disso, o soldado mais perto atira a cada 0,7 s, com tiros que todos veem, tirando 25 de vida por tiro. A morte segue o fluxo normal, sem crime. Recuando para fora da zona, eles param.
- **Antiaéreo**: 2 baterias com canhão duplo que acompanha o alvo, radar girando e luz vermelha.
  - Avião ou helicóptero sem permissão a menos de **250 m** da base recebe o alerta com contagem de 10 s.
  - Depois disso, o antiaéreo dispara traçantes e estouros no céu e derruba a aeronave, com explosão, carcaça e incêndio. Dá para ejetar com paraquedas.
- O óvni, o admin e o Exército de Tenente para cima passam livres.
- Quem cai dentro da base sem permissão volta para 30 m do portão, ainda na zona de aviso.

## Versão 13/11 · Base Aérea e caças (20261113zq)

**Rode o SQL `supabase/76_alistamento.sql`** (depois do 75). Arquivo novo no jogo: **`js/jato.js`**.

- **Base Aérea**: fica a leste do quartel, em Porto Sul. Para chegar, siga pela rua z = 945 a partir da rodovia até o portão norte.
  - Tem pista com marcações, pátio, 3 hangares, torre, muro e cancela.
  - Guardas: 8 soldados armados. Antiaéreo: 2 baterias com raio de 120 m.
  - Todos do Exército entram.
- **Quartel**: ganhou cancela no portão (abre só para o Exército), 8 sentinelas armadas (4 no portão e 4 nas torres) e antiaéreo de 120 m.
- **Regra das bases** (Área 51, Quartel e Base Aérea): primeiro vem o aviso. Na zona de tiro há 3 s de último aviso, e depois os soldados atiram.
  - Aeronave sem permissão tem 10 s para sair e depois é abatida.
  - Quem insiste fica marcado como **invasor** por 5 min.
- **Alistamento com aprovação**: o balcão saiu de dentro do quartel e foi para a **guarita do lado de fora do portão**.
  - O civil pede ali. Um **oficial do Exército** (Tenente para cima) ou o admin aprova ou recusa, também na guarita.
  - Os oficiais online recebem aviso de pedidos pendentes a cada 1,5 min.
  - A licitação das rações também foi para a guarita.
- **Caças** (só Tenente para cima pilota):
  - **Caça leve**: 95 m/s, 4 mísseis.
  - **Caça furtivo**: 120 m/s, 6 mísseis.
  - **Asa furtiva**: 80 m/s, sem mísseis e com botão 👻 Invisível.
  - Decolagem e pouso na pista da Base Aérea ou de qualquer aeroporto. Fora da pista em velocidade alta, eles batem.
  - Ao descer fora da base, o caça volta sozinho para a Base Aérea.
  - Se existirem `assets/modelos/caca_leve.glb`, `caca_furtivo.glb`, `asa_furtiva.glb` ou `missil.glb`, o jogo usa esses modelos.
- **Mísseis teleguiados**:
  - **🎯 Travar** mira a aeronave mais próxima à frente, a até 700 m. Só vale para aeronave de **procurado** (com estrelas) ou de **invasor** de base militar.
  - Depois de 1,5 s fica travado, e o alvo recebe "⚠️ Um caça TRAVOU míssil em você!".
  - **🚀 Disparar** lança o míssil, que persegue o alvo com rastro de fumaça visível para todos e derruba a aeronave.
  - Um caça rápido em curva fechada escapa; helicóptero e avião em linha reta não.
  - Os mísseis recarregam ao pousar na Base Aérea.
- **Correção**: o chão da Área 51 não cintila mais.

## Versão 14/11 · modelos dos caças (20261114a)

- Entraram os modelos 3D enviados: `assets/modelos/caca_leve.glb`, `caca_furtivo.glb`, `asa_furtiva.glb` e `missil.glb`.
- Os modelos vieram com o nariz para o lado, e o do míssil para trás. O jogo agora gira cada um, põe as rodas no chão e ajusta o tamanho:
  - caça leve: 14 m de comprimento;
  - caça furtivo: 18 m;
  - asa furtiva: 20 m de comprimento e cerca de 33 m de envergadura;
  - míssil: 3,5 m.
- Os dois caças ganharam a chama de pós-combustão atrás, que cresce ao acelerar.

## Versão 14/11 · Marinha e pouso automático (20261114b)

**Rode o SQL `supabase/77_forcas_marinha.sql`** (depois do 76). Modelos novos: `assets/modelos/porta_avioes.glb`, `destroier.glb` e `missil_cruzeiro.glb`.

- **Forças Armadas**: no painel de promoções, o General Supremo escolhe a Força de cada militar: 🪖 Exército, ⚓ Marinha ou ✈️ Aeronáutica. A pessoa recebe um aviso.
  - **Caças**: só a **Aeronáutica** (e o General Supremo) pilota.
  - **Míssil de cruzeiro**: só um **General da Marinha** pede, e o **General Supremo autoriza**. O General Supremo também pode lançar direto.
- **Base Naval**: no litoral, a leste da Base Aérea, com portão ao norte pela rua z = 945. Tem Comando Naval com a **🚀 Central de Mísseis**, alojamento, cais e 3 píeres. Ancorados no mar ficam o **porta-aviões** (200 m) e **2 destróieres** (110 m).
- **Bases interligadas**: passagens com cancela azul ligam Quartel ↔ Base Aérea ↔ Base Naval (z de 1048 a 1060). Só militares passam.
- **Míssil de cruzeiro**:
  1. Marque o alvo tocando no mapa grande.
  2. Vá à Central de Mísseis.
  3. O General da Marinha pede. O General Supremo recebe a janela "Autorizar / Recusar / Ver no mapa".
  - O míssil sai de um destróier, voa em arco com rastro e leva 20 s.
  - Quem está a menos de 160 m do alvo recebe o alerta com contagem.
  - No impacto: explosão grande, morte a menos de 25 m (com o veículo destruído) e ferimento até 45 m.
  - Espera de 10 min entre lançamentos.
  - Sem alvo no hospital, na prefeitura ou nos bombeiros.
  - Todos os lançamentos ficam registrados no painel do General Supremo.
- **🛬 Pouso automático**: voando a menos de 2 km da Base Aérea ou do porta-aviões, aparece o botão.
  - O caça vai até a reta final, alinha, desce na rampa, pousa e freia até parar. Se chegar alto demais, arremete e tenta de novo.
  - Mexer no manche cancela.
  - No porta-aviões também dá para decolar. Os mísseis recarregam lá.
- **Mais soldados**:
  - Área 51: 28;
  - Quartel: 16;
  - Base Aérea: 16;
  - Base Naval: 16, sendo 4 no convés do porta-aviões.
  - A Base Naval também tem antiaéreo, com raio de 210 m cobrindo os navios.

## Versão 14/11 · teste de defesa (20261114c)

- No painel de admin entrou a seção **🧪 Teste de defesa das bases**. Para cada base (Área 51, Quartel, Base Aérea e Base Naval) há três botões: **🚶 A pé**, **🚁 Helicóptero** e **✈️ Avião**. Também há o **⏹ Parar teste**.
- **A pé**: um invasor ("INVASOR (teste)") nasce a 60 m do portão e corre até ele. Ele passa pela zona de aviso e pelo último aviso de 3 s. Depois o soldado mais perto atira a cada 0,7 s, 25 de vida por tiro, e o invasor cai.
- **Helicóptero e avião**: a aeronave nasce fora da base, entra no espaço aéreo e fica rodando por cima. O radar detecta e os canhões seguem a aeronave. Depois de 10 s, o antiaéreo dispara 5 vezes e ela cai girando e explode.
- No fim aparece o **relatório** com os tempos de cada etapa. Se ninguém for abatido em 90 s, o relatório marca "a defesa falhou".
- É tudo só na tela do admin: não mexe no banco e os outros não veem.

## Versão 14/11 · soldados no seu controle (20261114d)

**Rode o SQL `supabase/78_guardas_bases.sql`** (depois do 77).

- No painel de admin entrou a seção **💂 Soldados vigiando cada base**. Para cada base (Área 51, Quartel, Base Aérea e Base Naval) há um número de **0 a 60** e o botão **Salvar**. A mudança vale para todos os jogadores.
- Os números de agora continuam como padrão: 28 na Área 51 e 16 em cada uma das outras.
  - Soldados acima do padrão ficam espalhados no contorno de dentro do muro, olhando para fora, e um em cada três faz ronda.
  - Abaixo do padrão, o jogo tira primeiro os da ronda e deixa os do portão.
- **Economia para o celular**: soldado a mais de 120 m de você fica parado em pose de guarda, sem animação. Ele continua aparecendo até 260 m.
- Os jogadores recebem o número novo em até 1 minuto. Você vê na hora.

## Versão 14/11 · navios em patrulha (20261114e)

**Rode o SQL `supabase/79_navios.sql`** (depois do 78).

- **Patrulha automática**: o porta-aviões e os 2 destróieres saem sozinhos do cais da Base Naval e dão a volta pelo mar do sul, de uma ponta do mapa à outra.
  - O porta-aviões faz uma rota mais por dentro, a 4 m/s, e a volta leva uns 18 min.
  - Os destróieres fazem uma rota mais por fora, a 6 m/s, e a volta leva uns 15 min. Eles saem defasados para não andarem juntos.
  - A cada volta, cada navio **fica 2 min atracado** no cais, que é a hora de embarcar.
  - Todos os jogadores veem o mesmo navio no mesmo lugar, porque a rota sai do relógio do servidor.
- **Embarque**: no fim do píer de cada navio, com ele atracado, aparece **⚓ Embarcar**.
  - Entram até **15 militares por navio**, de qualquer Força.
  - Embarcados, ficam em pé no convés e andam junto com o navio.
  - **Desembarcar** só com o navio atracado.
- **Tripulado**: a Marinha assume o **leme**, no embarque ou já a bordo.
  - Tenente para cima pilota os destróieres; o porta-aviões é de Capitão para cima. O General Supremo pilota todos.
  - Controles: acelerar, freio/ré e virar.
  - O navio não entra em terra e para antes de bater em outro navio.
  - Os outros jogadores veem o movimento ao vivo.
  - Ao largar o leme, o navio vai sozinho até o cais e volta para a patrulha.
  - Se o piloto cair do jogo, o leme fica livre em 40 s.
- **Porta-aviões em movimento**:
  - Os caças pousam e decolam com ele andando, e o caça pousado anda e gira junto.
  - O 🛬 Pouso automático segue o navio e se alinha com a direção dele.
  - O porta-aviões leva 4 guardas da Marinha no convés, e cada destróier leva 2.
- O míssil de cruzeiro sai do destróier, de onde ele estiver.

## Versão 14/11 · bases no mapa (20261114f)

- **Erro ao abrir** ("Cannot read properties of undefined (reading 'toLowerCase') · main.js:880"): alguns teclados de celular mandam um evento de tecla sem a tecla. O jogo agora ignora esse evento e a faixa vermelha não aparece mais.
- **Mapa**:
  - Nova aba **Bases militares**: mostra Quartel, Base Aérea (pista, pátio, hangares e torre), Base Naval (comando, cais e píeres), a passagem entre as bases e os **navios onde estiverem**.
  - Nova aba **Área 51**: só aparece para quem tem acesso.
  - O minimapa também desenha as bases e os navios.
- **Teleportar** (painel): entraram **🪖 Quartel do Exército (portão)**, **✈️ Base Aérea (portão)** e **⚓ Base Naval (portão)**.

## Versão 14/11 · recuperar senha (20261114g)

- Na tela de login entrou o **Esqueci minha senha**. A pessoa digita o e-mail no campo de cima e toca nele.
  - O Supabase manda o link por e-mail.
  - A resposta na tela é a mesma para qualquer e-mail, para não revelar quem tem conta.
  - Dá para pedir 1 link por minuto em cada aparelho.
- O link abre o jogo na tela **🔑 Senha nova**, com dois campos. Ao salvar, a pessoa entra no jogo direto.
- **Configuração no Supabase (uma vez)**:
  1. Em **Authentication → URL Configuration → Redirect URLs**, adicione o endereço do jogo com `**` no fim. Exemplo: `https://seu-usuario.github.io/factor-rp/**`.
  2. Opcional: em **Authentication → Emails → Reset Password**, troque o texto do e-mail para português.

## Versão 14/11 · píeres da Marinha (20261114h)

- **Teletransporte indo para os navios**: o cais e os 3 píeres da Base Naval não eram área andável. Quem passava do muro era jogado para a borda de Porto Sul. Agora dá para andar no cais e até a ponta de cada píer, onde se embarca.
- **Onde estão os navios**: para militares e para o admin, a lista do mapa grande mostra cada navio **(agora)**, com rastreio até ele, e o **Píer do navio** com o estado. Exemplos: "atraca em 10 min", "atracado agora (sai em 1 min)", "voltando ao cais" ou "com piloto".
- Na ponta do píer, o botão mostra o mesmo estado do navio, para saber quanto falta.

## Versão 14/11 · a bordo dos navios (20261114i)

**Rode o SQL `supabase/80_chamar_navio.sql`** (depois do 79).

- **Teleportar a bordo** (painel): entraram **⚓ Porta-aviões (a bordo)**, **⚓ Destróier 1 (a bordo)** e **⚓ Destróier 2 (a bordo)**.
  - Você cai no convés do navio onde ele estiver, mesmo em alto-mar.
  - Lá o botão vira **Leme**, para assumir o controle na hora.
  - Para sair em alto-mar, use o Teleportar para qualquer lugar. Se você estiver no leme, o navio volta sozinho para a patrulha.
- **Comando Naval** (no prédio da Central de Mísseis): o botão agora abre **🚀 Míssil de cruzeiro** e **⚓ Chamar** cada navio.
  - Cada opção mostra o estado do navio.
  - O navio chamado sai da patrulha, vem direto ao cais (aparece o tempo estimado) e fica atracado esperando o próximo ciclo da patrulha.
  - Chama quem pode pilotar aquele navio: Marinha, Tenente para cima nos destróieres, Capitão para cima no porta-aviões, e o General Supremo.

## Versão 14/11 · favelas e mar em volta da ilha (20261114n)

**Rode o SQL `supabase/82_favelas.sql`** (depois do 81, que corrige a vigia). Mudam `js/main.js`, `js/mundo.js`, `js/config.js` e `index.html`.

- **Favela do Morro da Serra**: no morro atrás de Vila Serra. Rua principal subindo do centro da cidade, três travessas e becos entre as casas.
- **Favela do Morro do Porto**: no litoral leste, depois da Base Naval (siga a rua z = 945). Termina num paredão de pedra sobre o mar.
- As casas já existem e ninguém constrói. As casas perto do jogador usam os modelos 3D `assets/modelos/favela_casa1.glb` a `favela_casa4.glb` (texturas reduzidas para 512 px: ~400 KB cada), com a frente virada para a rua mais perto.
- **Base de clã no alto** de cada morro: laje com mureta, QG, caixa d'água e mastro. São territórios novos (Morro da Serra e Morro do Porto) que os clãs capturam como os outros.
- **8 lotes de empresa** (4 na rua de baixo de cada favela).
- **Ônibus**: Linha 9 · Morro da Serra (sai do centro de Vila Serra) e Linha 10 · Morro do Porto (sai do centro de Porto Sul).
- **Mar em volta da ilha inteira**. O destróier 2 agora dá a volta na ilha, e o navio que volta sozinho ao cais contorna a terra.
- **Teleportar** (painel): entrada e base de cada favela.
- **Casas da favela à venda e para alugar** (rode `supabase/83_casas_favela.sql`): as 1017 casas dos dois morros. Toque na porta: **Alugar** por 200 a cada 15 ciclos (8 h, cobrado sozinho; sem dinheiro, você sai e o baú volta para a mochila) ou **Comprar** por 60.000 (vende pela metade). Conta no limite de 3 moradias, com cama, baú e renascer em casa. O aluguel vai para o cofre da prefeitura. O administrador muda os dois valores em Painel › Cidade.
- **Casas 3D no barranco**: o modelo fica em cima de um alicerce (do ponto mais baixo ao mais alto do terreno), sem afundar no morro.
- **Veículos na ladeira**: carros, ônibus, caminhões, viaturas e vans inclinam acompanhando o morro (frente/trás e de lado), inclusive os parados e os dos outros jogadores.
- **Prédios em 3D**: os modelos `predio_*.glb` agora ficam em pé no chão e do tamanho certo (antes ficavam meio enterrados), e mais prédios perto do jogador viram 3D (Baixa 10, Média 26, Alta 48).

## Versão 14/11 · mapa novo e incêndios em qualquer lugar (20261114s)

**Rode o SQL `supabase/84_incendios_aleatorios.sql`** (depois do 83).

- **Mapa (toque no minimapa)**:
  - **Zoom**: com dois dedos (pinça), com a roda do mouse ou com os botões ＋ e －. **⌖** centraliza em você.
  - **Arrastar** com um dedo move o mapa; **um toque** (sem arrastar) marca o ponto e começa o rastreio.
  - **Busca**: procura qualquer lugar pelo nome (sem precisar de acento), inclusive os pontos de ônibus.
  - **Em destaque (dourado)**: **Minha empresa “nome”**, **Empresa onde trabalho “nome”**, **Minha casa** e **Casa alugada**. Aparecem no mapa, no topo da lista e como pontos dourados no minimapa.
  - **Rota do rastreio (estilo GTA)**: uma linha roxa mostra o caminho pelas ruas até o destino, no mapa e no minimapa, e se refaz conforme você anda.
  - O mapa de Bases militares agora inclui o Morro do Porto (o minimapa não fica mais vazio lá).
- **Incêndios em qualquer lugar**: além de empresas e casas, o fogo começa em ruas da metrópole (lixo e entulho), na mata de Vila Serra e de Porto Sul e em qualquer casa das favelas. Até 3 focos ao mesmo tempo, no máximo 1 novo a cada 4 minutos.
  - **Todos veem ao mesmo tempo**: o jogo recebe o aviso do banco na hora (não espera a próxima leitura), e quem está a até 220 m recebe "🔥 Fogo na …, a X m de você!".
  - Sem bombeiros, a prefeitura apaga em 3 minutos; quem tem dono (empresa, casa, casa da favela) paga a taxa de 300.
- **Casas da favela**: a parte de baixo agora é um alicerce de concreto liso (sem janelas), do chão do barranco até o piso da casa. À noite, as janelas da frente das casas acendem (também nas casas em 3D).

## Versão 14/11 · polícia e armas, patrocinadores, Saveiro com som e equipe invisível (20261114u)

**Rode os SQL `supabase/85a_policia_armas.sql`, `85b_barricadas_patrocinio.sql` e `85c_saveiro_equipe.sql`**, nessa ordem (depois do 84). Novo botão no menu: **🎯 Tático**.

- **Armas airsoft**: **espingarda** (7 chumbos espalhados, forte de perto, alcance curto) e **fuzil** (rápido e de longe). Equipe pelo 🎯 Tático ou pela mochila e saque com o botão Arma.
- **Granadas de airsoft**: botão 💣 na tela (no PC, tecla **H**). Estoura 2,3 s depois e mancha de tinta tudo num raio de 6 m (dano maior no centro). Estragam barricadas e a blindagem do Caveirão.
- **Barricadas dos clãs** (🎯 Tático): membros de clã compram (2.000) e colocam na frente; bloqueiam a passagem de todos (a pé e de carro). Até 6 por clã, somem em 3 h; o clã recolhe.
- **BOPE**: policiais de 3º Sargento para cima entram pelo 🎯 Tático. Etiqueta "💀 BOPE". Pegam o kit (espingarda, fuzil e granadas) perto da delegacia, a cada 10 min, do armamento da Polícia.
- **Caveirão** (só BOPE, no botão de viatura): blindado, preto, com escotilha.
  - Leva **5 atiradores** (policiais), que sacam a arma e atiram de dentro pela escotilha e descem quando quiserem.
  - **Trocar de lugar**: o atirador toca em "🔄 Assumir o volante"; o motorista aceita e vira atirador.
  - **Blindagem com limite** (mostrada na tela): tiros e granadas gastam; em 0, o Caveirão é destruído. Quem está dentro não leva tiro.
  - **Rompe barricadas**: acelere contra ela; a barricada vai cedendo aos poucos (com dificuldade).
- **Viaturas novas**: Polícia Civil (sedã cinza-chumbo com faixas brancas) e PRF (azul-escuro com faixa amarela), com giroflex.
- **Forças Armadas** (Exército, Marinha e Aeronáutica): pegam espingarda, fuzil e granadas no Arsenal do Quartel, no Comando Naval ou na Base Aérea.
- **Kit de armas de caminhão**: na Central de rações do Exército, "Caminhão cheio + kit de armas" (junto das jujubas) ou "Só o kit de armas". Cada kit põe 10 espingardas, 10 fuzis e 30 granadas no armamento da Polícia ou da PRF.
- **Patrocinadores**: quem tem 1.000.000 de moedas pode virar patrocinador (100.000). Patrocina clãs (vai para o caixa do clã), fabrica espingardas (8.000), fuzis (15.000) e granadas (2.000) e vende na loja dele, com o preço que quiser; só membros de clã compram.
  - **Radar da PRF** (🎯 Tático): toda fabricação, venda e patrocínio aparece no radar (sem o nome, com a região aproximada). A PRF investiga: se achar (65%), o patrocinador vira **procurado** (+2 estrelas e 5.000 de recompensa) e a PRF ganha 500.
- **Saveiro** (55.000) e **Saveiro com som** (150.000) na concessionária. No som, o dono cola um link https de MP3 e um anúncio: quem está a até 80 m ouve e o anúncio aparece em cima do carro (festas, reuniões, empresas). Aviso de que música proibida dá ban; todo link fica registrado e a equipe vê a lista no Painel (com o botão Banir).
- **Carros estacionam na ilha inteira** (antes eram puxados de volta para a metrópole).
- **Equipe invisível**: o administrador e os moderadores com o poder "Modo invisível" ligam no Painel; os jogadores não veem (nem no minimapa), a equipe continua vendo. O modo imortal continua como antes.
- **Mini rodoviárias das favelas**: as linhas 9 (Morro da Serra) e 10 (Morro do Porto) saem da mini rodoviária de Vila Serra e de Porto Sul (onde para o intermunicipal da Metrópole), dão a volta no morro e voltam para ela, onde ficam paradas até a hora da próxima saída (em loop). Correção: elas não somem mais no ponto final.
- **Modelos 3D novos** (`assets/modelos/`): `caveirao`, `viatura_civil`, `viatura_prf`, `saveiro`, `saveiro_som`, `arma_espingarda` e `arma_fuzil` (texturas reduzidas para 512 px). O jogo gira cada um para a frente, põe as rodas no chão e ajusta o tamanho (Caveirão 6 m, viaturas ~4,7 m, Saveiro 4,4 m, armas ~0,9 m). A Saveiro pega a cor escolhida na concessionária. Sem o arquivo, volta o modelo feito por código.

## Versão 14/11 · correção e mais leve (20261114x)

- **Correção**: o jogo não abria na 14v (uma função declarada duas vezes travava o carregamento).
- **Distância de visão na câmera 3D** (atrás do personagem e primeira pessoa), como no Minecraft: o que está longe some na neblina e não é desenhado; conforme você anda, o que está na frente aparece e o de trás some. Baixa 140 m, Média 190 m, Alta 260 m.
- **Mais leve no celular**: na qualidade Média a resolução vai a 1,25x (antes 1,5x); menos prédios em 3D ao mesmo tempo (Baixa 6, Média 16, Alta 36); casas 3D da favela só bem perto (até 45 m) e no máximo metade do total.
- **Som do ônibus (14y)**: novo som de viagem (`assets/sons/onibus_viagem.mp3`, motor a diesel e estrada, com emenda suave para repetir). Toca só com o ônibus andando: parado no ponto, no trânsito ou esperando na rodoviária fica em silêncio (a partida e a arrancada continuam). Vale para os ônibus do sistema, o que você dirige, o dos outros jogadores e quando você vai de passageiro.
- **BOPE e granada com mira (14za)** · SQL: rode o `supabase/86_bope.sql`.
  - **Sede do BOPE**: a delegacia em preto ao pé do Morro do Porto (rua z = 945), com armaria (kit), quadro tático (treino da tática), treino, celas e estande. Aparece no mapa e na busca.
  - **Farda do BOPE**: colete e capacete pretos com BOPE escrito no peito e nas costas.
  - **Entrada por indicação**: o General Supremo ou um oficial (Polícia de Tenente para cima, PRF de Inspetor para cima, Forças Armadas de Tenente para cima) indica no 🎯 Tático.
  - **Radar do BOPE**: mostra procurados nas favelas e cidades menores, ou com 3 estrelas ou mais. O BOPE não patrulha.
  - **Incursão dos robôs**: só sai quando não há BOPE de verdade por perto, com o Caveirão e 6 policiais (2 distraem com tiros não letais, 2 abatem, 2 cercam e prendem). Abatido, o procurado é cercado até a ambulância chegar e, quando volta, vai preso (vale também para quem é morto por um jogador do BOPE, que ganha +500). Se um policial cai, os outros se abrigam atrás do Caveirão e chegam mais 12 de reforço. Todos os jogadores por perto veem a incursão.
  - **Granada com mira**: segure o botão 💣, arraste para escolher a direção e a força (aparece o caminho e onde cai) e solte para lançar. Para cancelar, volte o dedo ao botão e solte.
- **Armas desviadas e purgatório (14zb)** · SQL: rode o `supabase/87_desvio_purgatorio.sql`.
  - **Desvio para o Seu Tonho**: o caminhão do Exército com kit de armas pode ser sequestrado e vendido ao Seu Tonho (230.000 por kit). As armas vão para o estoque dele, que vende cada arma a 70.000 e cada granada a 7.000, só para quem é de clã. A arma desviada tem 80 balas e depois é descartada. Equipe no 🎯 Tático.
  - **Licitação no jornal**: a abertura sai como manchete. Quando fecha, sai a empresa vencedora, sem valores nem critérios.
  - **Arma dourada**: quem morre por ela vai 5 minutos para o purgatório e o jornal publica a nota de falecimento (nome e Cemitério Municipal). O administrador revive qualquer um (🎯 Tático ou perto de quem caiu) e pode ir ao purgatório oferecer a segunda chance. O jogador escolhe: voltar na hora, voltar com outro nome (+2.000.000, uma vez por nome, sem somar com o dinheiro do antigo) ou esperar o portão abrir.
  - **Lápide dos nomes**: o nome antigo fica numa lápide no cemitério, ao lado do portão, e ninguém mais pode usá-lo. Só o dono reavê, morrendo de novo pela arma dourada e escolhendo o nome antigo no portão do purgatório.
- **Animações novas (14zc)**: `assets/personagens/animacoes_base.glb` guarda as animações do personagem modelo do Meshy: parado, andar, correr, soco, dano, morrer, rendido, levantar as mãos, algemado (parado e andando), carregando caixa (parado e andando) e arremessar. Personagem novo que vem só com esqueleto pega as animações daqui, e as de atirar e pegar vêm do robô. O algemado ganhou animação própria e a granada usa o arremesso. Os personagens antigos continuam como estão.
- **Personagem novo (14zd)** · SQL: rode o `supabase/88_personagens_novos.sql`. A lista de personagens agora fica numa tabela (`personagens_jogo`: id, grátis, ativo); trocar ou acrescentar personagem é só mudar a tabela e a lista do `js/config.js`. Entrou o primeiro personagem novo: **Jovem da Cidade** (grátis), com as animações do `animacoes_base.glb`.
- **Animações em todos (14ze)**: os personagens antigos também ganharam rendido, levantar as mãos, algemado (parado e andando), carregar caixa parado e arremessar, adaptadas do `animacoes_base.glb`.
- **Correção (14zf)**: o arquivo das animações se chamava `_animacoes.glb`, e o GitHub Pages não publica arquivos que começam com `_`. Por isso o personagem novo ficava de braços abertos e os antigos não ganhavam as animações novas. Agora é `assets/personagens/animacoes_base.glb`. Se ele não carregar, o personagem usa as animações que vieram no próprio arquivo.
- **Personagens novos (15a)** · SQL: rode o `supabase/89_troca_personagens.sql`.
  - **27 personagens brasileiros** (Meshy) no lugar dos 17 antigos, 12 deles grátis. Quem usava um antigo ganhou um novo grátis, e quem tinha comprado um antigo recebeu as 8.000 moedas de volta. Os arquivos antigos ficam no repositório, mas o jogo não usa mais (dá para apagar).
  - **Animações** em `animacoes_base`, `animacoes_caixa` (pegar caixa, soltar caixa, embalar), `animacoes_pulo` (pular, pular correndo, pular e agarrar, pular para descer) e `animacoes_queda` (queda livre, paraquedas, salto militar, pular armado). O jogo adapta todas para cada personagem.
  - **Botão 🦘 Pular** (espaço no PC): pula parado ou correndo. Carro, barricada ou mureta: salta por cima (armado, salta com a arma; com treino militar, o salto é melhor). Muro de até ~3 m: agarra, sobe e desce do outro lado. Prédio ou muro mais alto: não dá.
  - **Botão vermelho 🏳️ Render-se** (R no PC): aparece em confronto com polícia, BOPE, Exército ou PRF. Rendido, ninguém da polícia atira (robôs e jogadores): ele só é preso. Quem se rende e saca a arma de novo (ou até 1 min depois de baixar as mãos) vira alvo de força letal por 3 minutos.
  - **Paraquedas**: ejetando de alto, primeiro vem a queda livre e depois o paraquedas abre.
  - **Funcionários NPC**: os robôs que as empresas contratavam agora aparecem como pessoas (👷 Funcionário).
  - **Médico de jaleco e máscara**: quando os arquivos `assets/modelos/farda_jaleco.glb` e `farda_mascara.glb` existirem, o médico veste jaleco e máscara no lugar do colete e do boné. O admin ajusta no editor da farda, que agora também tem "Girar".
- **Personagens limitados (15b)** · SQL: rode o `supabase/90_limitados.sql`. 12 limitados novos: Patrocinador, Dona da Empresa, Soldado, Soldada, Maloqueiro, Maloqueira, Empresário, Médica, Médico, Dona do Morro, Mascarado do Morro e Dono do Morro. Eles substituem os 18 de evento antigos, e quem tinha comprado um antigo recebe o preço de volta. Só vêm por presente do administrador (ele não perde o dele) ou pela vitrine aberta por tempo limitado. O administrador usa todos de graça.
- **Máscaras (15c)** · SQL: rode o `supabase/91_mascaras.sql`. 10 máscaras vendidas na loja: camisa enrolada (cinza e vermelha), bandana, balaclava, lenço do deserto, estrela, caveira, camuflada, onça e coroa dourada. O jogador usa e tira pela mochila, e todo mundo vê. A máscara some de longe (mais de 45 m) para não pesar. O admin ajusta cada máscara no editor da farda, na linha "😷 Máscaras".
- **Ônibus novos (15d)**: 5 ônibus do Meshy no lugar de todos os antigos. Os urbanos (amarelo, branco e laranja) fazem as linhas da cidade, as circulares e as das favelas. Os de viagem (dois andares "Brasil Sul" e executivo "Viação Brasil") fazem as linhas para Vila Serra e Porto Sul, e o executivo também a do Aeroporto. As pinturas ficam como vieram, e os créditos (menu 📜) citam os fabricantes e as marcas. Os arquivos dos ônibus antigos (`onibus_urbano`, `_apache`, `_busscar`, `_articulado`, `_executivo`, `_executivo2`, `_dois_andares`, `_grande`) não são mais carregados e podem ser apagados do repositório. O `int_onibus.glb` continua (é o interior).
- **Arma parado (15e)**: parado com a arma, o personagem fica na pose de mira do "andar atirando" (tronco e braços firmes), com as pernas da animação parada.
- **Rodas e curvas (15f)**: os 5 ônibus novos ganharam rodas que giram e viram na curva. Os veículos NPC fazem a curva como motorista profissional: ficam alinhados com a faixa (a traseira não fecha mais para dentro), e a curva à direita é rente à faixa, longe da quina da calçada.
- **Roda de ônibus (15g)**: roda nova (modelo Meshy) para ônibus e caminhões (estilo "pesado"): pneu com banda e aro de aço, girando; de longe continua a roda simples.
- **Rodas e calçadas (15h)**: as rodas originais dos ônibus novos (inclusive a dianteira e o rodado duplo de dentro) são apagadas por inteiro; ficam só as rodas novas, que giram e viram. As calçadas fora do centro (bairros, quartel, praças) agora têm altura de chão: ninguém afunda nelas. Pulo simples armado usa a animação de pular segurando a arma.
- **Curvas com eixo (15i)**: volta o arrasto de verdade: o eixo da frente vira e o de trás é arrastado (com dois eixos atrás, arrasta mais difícil e fecha mais). Para não subir na calçada, os NPCs compridos abrem a curva à direita como motorista de ônibus (entram no cruzamento e viram fechado), quanto maior o veículo, mais abrem. No volante: o veículo gira em volta do eixo de trás, as rodas viram até ~48° em ônibus/caminhão e o volante responde mais rápido; as rodas da frente desenhadas viram no ângulo certo.
- **Amortecedor (15j)**: a carroceria de todos os veículos de rua (seu, NPC e dos outros jogadores) fica numa mola com amortecedor: segue o chão com atraso, balança e assenta; freando mergulha o nariz, acelerando agacha, na curva tomba para fora; meio-fio, lombada e rampa dão tranco e podem lançar o veículo (no ar só a gravidade, e na volta comprime e quica). As rodas ficam no chão. Cada tipo tem a sua: ônibus macio e caprichado (balança devagar), caminhão, carro, esportivo firme e blindado/tanque/jipe bem duro.
- **Tamanho e máscaras (15k)**: todos os personagens com o mesmo tamanho de corpo (pescoço a 1,40 m; antes quem tinha cabelo alto ou boné ficava menor). Editor do admin com duas abas: "Fardas" e "Máscaras (sem farda)"; na de máscaras o personagem tira a farda para ver o rosto.
- **Sem primeira pessoa (15l)**: a câmera de primeira pessoa (personagem e veículo) saiu; quem usava vai para a 3D livre. Chão sem piscar na câmera 3D (mais precisão de profundidade e asfalto/faixas mais separados). Médico: a mão esquerda estava presa num osso da cabeça e esticava; agora segue a mão.
- **Cara nova (15m)**: ícone novo com o Dono do Morro; logo do nome no estilo GTA com as cores do Brasil (assets/telas/logo.webp) no login, na escolha de personagem e no carregamento; login com foto do Morro do Porto de fundo; carregamento com cenas do jogo (rodoviária, centro, morro, aeroporto, fim de tarde, cargueiro e noite) trocando a cada 5 s.
- **Editor de perto (15n)**: no ajuste de farda/máscara a câmera vai para perto, de frente para o personagem, e mostra a parte ajustada na metade de cima da tela (tronco para colete/jaleco, cabeça para capacete/boné/máscara); o HUD de cima some enquanto o editor está aberto; "Girar" vira o personagem para ver lados e costas. Máscaras de cabeça inteira começam maiores (antes ficavam escondidas dentro da cabeça).
- **Máscara igual (15o)**: a máscara é encaixada pela mesma medida em todos os personagens (altura e tamanho fixos a partir do pescoço e a frente pela ponta do nariz); cabelo alto, tranças, coque, chapéu e óculos não bagunçam mais. Painel do admin: depois de trocar a skin (ou qualquer ação) a lista volta para o mesmo ponto da rolagem, sem "correr".
- **Amortecedor e incendiar (15p)**: corrigida a conta da aceleração do amortecedor (dava ~7x a real e a traseira ficava arriada andando); agora freando o nariz mergulha e volta, saindo a traseira agacha de leve e volta, andando fica reto. Ônibus mais contido. Botão "🔥 Incendiar" volta a aparecer perto de ônibus e caminhões largados (mede pela lataria, não pelo centro).
- **Fumaça e fogo (15q)**: veículo batido solta fumaça cinza (50%+) e preta (80%+); em 100% pega fogo com chamas e explode 5 s depois (dentro ou fora dele). Carregamento: as fotos baixam no começo e só entram quando estão prontas (não ficam mais em branco). Horizonte da metrópole (perto do Aeroporto e da Área 51): dá para andar e dirigir nos quarteirões; só os prédios têm colisão.
- **Pulo e incendiar (15r)**: pulo por cima de obstáculo na altura certa (a animação já sobe o quadril; antes somava e o personagem voava); veículos na frente usam a altura do próprio modelo (ônibus/caminhão alto vira escalada ou "alto demais", não atravessa mais a lataria); pulo simples mais baixo. Incendiar: também no carro arrombado; o admin pode incendiar sem clã (rodar supabase/92_incendiar_admin.sql).
- **Veículos sólidos (15s)**: todo veículo (dos jogadores, largados, ônibus, caminhões, viaturas, vans, bombeiros, NPCs) bloqueia pela lataria inteira, numa caixa virada para onde ele aponta; antes era um círculo no meio e dava para entrar pela frente/traseira.
- **Sons de explosão (15t)**: assets/sons/explosao_carro (veículos), explosao_grande (avião, helicóptero, bomba, míssil), explosao_agua (no mar) e explosao_longe (estouro abafado para quem está longe: ~1,5 quarteirão nas de veículo e ~2 quarteirões nas grandes).
- **Arrombar e incendiar (15u)**: animações novas (assets/personagens/animacoes_crime.glb, adaptadas para todos): "arrombar" (agacha e dá cotovelada no vidro) ao arrombar carro de jogador ou estacionado na rua; "incendiar" (derrama o combustível e joga o fogo) ao pôr fogo em veículo.
- **Variações de crime (15v)**: animacoes_crime.glb com 4 animações; ao arrombar sorteia entre forçar a fechadura e a cotovelada no vidro; ao incendiar, entre o galão e o coquetel molotov.
- **Onda de choque (15w)**: explosões grandes (avião, helicóptero, bomba) soltam uma onda: anel de ar correndo pelo chão, cúpula clara e anel de poeira; quando a frente passa por você a tela treme e, a pé, você é empurrado e cambaleia. O míssil de cruzeiro da Marinha faz a maior (~110 m, 2 quarteirões).
- **Hospital, prefeitura e obras (15x)** · SQL: rode, nesta ordem, `supabase/93a_hospital_remedios.sql`, `93b_prefeitura_verba.sql`, `93c_obras_publicas.sql`, `93d_sequestro_admin.sql` e `93e_obras_admin.sql` (botões do ADM: ⏩ Terminar agora a obra e ⏩ Avançar fase da Câmara, em Painel → Cidade).
  - Remédio na loja: 3.000. Almoxarifado (anexo leste do hospital, só funcionários; os outros são postos para fora): o médico em serviço pega até 20 remédios. Do nível Enfermeiro em diante, medica de graça dentro do hospital (+50 de vida no paciente) e ganha a comissão que o ADM define (Painel → Cidade).
  - Orçamento público: cai no cofre na posse de cada mandato (padrão 500.000, o ADM muda no painel). O prefeito paga do cofre um adicional de 0–100% no salário de Polícia, BOPE, PRF, Bombeiros e Hospital. Doação do cofre a um jogador: legal; para membro de clã ou para ele mesmo é crime (sigilo bancário no computador da PRF). Na prisão do prefeito com crime provado, a PRF apreende o dinheiro desviado e divide igual entre os agentes em serviço.
  - Obras (aba Obras da prefeitura): CRAS, Gabinete dos Varredores e Câmara dos Vereadores em 3 terrenos perto da prefeitura (os prédios do quarteirão saem). Pago pelo cofre = patrimônio da prefeitura (só o ADM demole); pago pelo prefeito = dele. Canteiro com tapume, estrutura subindo e pedreiros NPC só de dia. O próximo prefeito pode descontinuar (placa "Programa descontinuado") ou retomar. Câmara: 1 ciclo de candidatura, 1 de votação, os 10 mais votados ficam 40 ciclos com salário do cofre.
  - Tudo o que a prefeitura faz com o dinheiro aparece no computador da PRF e na pauta do jornalista (Reportar vale 200).
  - Correções: sequestro com a arma volta para o admin sem clã (e quem não é de clã vê o botão explicando a regra); o pé não afunda mais no morro (o chão segue a malha do relevo e o asfalto das ruas), nas ilhas da Rodoviária, nas Mini Rodoviárias e no piso da concessionária.
- **Menos memória de vídeo (15z)**: fumaça e chamas dos veículos reaproveitam os sprites (antes criava e descartava um material por partícula) e têm teto (110 no celular); carro só soltando fumaça a mais de 110 m não gera partículas. Se a placa de vídeo do celular cair com o jogo aberto, o jogo reinicia já com um nível de qualidade abaixo e avisa.
- **Evento de doação e abertura mais firme (16a)** · SQL: rode o `supabase/94_evento_doacao.sql`. Painel → Cidade → "🎁 Evento de doação": o admin dá o mesmo valor para todos online, todos da cidade ou uma lista de nomes; cada um recebe um aviso com o nome do evento. Ao abrir o jogo, se a internet oscilar, ele tenta de novo carregar a conta (antes caía na tela de login). A qualidade gráfica só baixa sozinha se a placa de vídeo cair 2 vezes em 10 minutos.
- **CRAS e Câmara por dentro (16b)** · SQL: rode o `supabase/95_cras_vagas.sql`. Prédios novos (CRAS de dois andares com fachada verde e amarela, marquise e rampa; Câmara clássica com pódio, escadaria andável, 8 colunas, frontão e cúpula). Se existir `assets/modelos/obra_cras.glb`, `obra_camara.glb` ou `obra_varredores.glb`, o modelo 3D entra no lugar. CRAS: entra pela porta; a atendente NPC faz a inscrição (20 vagas por mandato); cheio, ela avisa que acabaram as vagas; cada inscrito recebe a doação a cada ciclo até o fim do mandato; mandato novo zera as vagas; descontinuado fecha as inscrições. Câmara: plenário com mesa diretora, tribuna, 10 bancadas e galeria; só entram vereadores eleitos, o prefeito e o admin.
- **Pulo em movimento (16c)**: animação nova (assets/personagens/animacoes_pulo2.glb, "pular_movendo", adaptada para todos) no pulo correndo sem arma; a altura do pulo desconta o quanto a animação já sobe o quadril. Prefeitura: se existir `assets/modelos/predio_prefeitura.glb`, o modelo 3D entra no lugar do prédio feito por código.
- **Prédios 3D (16d)**: assets/modelos/predio_prefeitura.glb, obra_cras.glb, obra_camara.glb e obra_varredores.glb (Meshy, frente virada no código). Escadarias da Prefeitura e da Câmara e o pórtico da Prefeitura são chão de verdade (alturas medidas no modelo): o personagem sobe sem afundar; a porta da Prefeitura agora fica no pórtico.
- **Base da PRF (16e)**: assets/modelos/predio_prf.glb no quarteirão (-135, -405), na saída norte para a rodovia, virada para a rua da rodovia, com 3 viaturas da PRF estacionadas no pátio. O posto da PRF (balcão, computador, estande) sai da calçada da Prefeitura e passa a ser a porta da base.
- **PRF sem o pátio (16f)**: o pátio de concreto do modelo (na frente da garagem) é cortado com planos de corte; as viaturas ficam na calçada do quarteirão. SQL 96_demolir_fix.sql: demolir/descontinuar o CRAS não dá mais "DELETE requires a WHERE clause".
- **Pássaros e o Bruxo (16g)** · SQL: rode o `supabase/97_bruxo.sql`.
  - Pássaros NPC (pombos em bandos nas praças, corvos no alto), feitos por código com asas batendo.
  - Administrador (corvo) e moderador (pombo): botão 🐦 fixo ao lado do ☰/💬 para virar pássaro e voltar; ⬆️/⬇️ sobem e descem; pousa no chão e nos telhados; só volta a ser gente pousado no chão. Botão 👁️/🙈 esconde o nome (passa por NPC), a pé ou voando.
  - Helicóptero pousa em laje de prédio (casa de telhado inclinado não). Para sair do helicóptero, pouse no chão.
  - Pedra preciosa do Bruxo: o admin esconde (Painel → Eu/eventos, igual à arma dourada). Quem acha invoca o Bruxo (não pode ser morto), que aparece na frente dele e concede UM pedido: virar pássaro por um ciclo (botão Extra "🐦 Voar", bom para fugir), perdão de todos os crimes, 1 a 10 milhões de moedas ou a arma dourada (2 balas). Depois do pedido ele some na fumaça. Se existir `assets/modelos/npc_bruxo.glb`, ele usa o modelo 3D.
- **Corvo com bando (16h)**: modelos do Meshy do corvo e do pombo (assets/modelos/ave_corvo.glb, ave_pombo.glb; pernas/pedra cortadas e trocadas por pernas feitas por código, que somem no voo; asas por código só voando, com penas recortadas). Bruxo em 3D animado (assets/personagens/Bruxo.glb). Fumaça preta ao virar e desvirar pássaro (todos veem). Pombos NPC no mesmo lugar para todos. Corvo: 📣 grasna (só quando você aperta; todos ouvem) e 🐦‍⬛ chama o bando (8 corvos que voam em volta e pousam em roda; o bando grasna junto de vez em quando) — sons assets/sons/corvo.mp3 (um corvo) e corvos.mp3 (o bando, 9 s).
- **Óvni silencioso (16i)**: o óvni não faz mais som nenhum (o zumbido pulsante parecia helicóptero).
- **Moradores e pombos (16j)** · SQL: rode o `supabase/98_npcs_rua.sql`. Painel → Cidade → "🚶 Moradores na rua": de 0 a 40 NPCs nas calçadas (centro e bairros em volta; longe de você ficam escondidos). Óvni abduz também os policiais robô (não o BOPE nem os bandidos); a abdução usa uma chave fixa do NPC (igual em todos os celulares). Pombos no chão das praças: bicam o chão e fogem voando quando um jogador ou NPC chega perto (do corvo/pássaro da equipe não fogem), depois voltam e pousam. Pés do corvo refeitos (canela comprida até dentro do corpo, dedos abertos com unhas).
- **Tutorial (16l)**: js/tutorial.js. 11 páginas (controles, vida e fome, empregos, banco, empresas e licitação, casas e veículos, prefeitura, clãs e crime, eventos: arma dourada e Bruxo). Abre sozinho na primeira vez no aparelho (e em conta nova); dá para rever em ☰ → 📖 Tutorial.
- **Telhado (16m)**: pousado em cima de um prédio (helicóptero, pássaro, corvo) o prédio não é mais "cortado" pela câmera; o corte usa a altura real de quem voa.
- **Favelas e rodas (16n)**: tirados os postes, árvores e carros estacionados que ficavam no meio das ruas das favelas. Carros estacionados voltaram a ter rodas (o corte das rodas giratórias passou a ser feito numa cópia do modelo, não no original compartilhado) e a tinta leve não deixa mais as rodas coloridas/roxas.
- **Luz nos prédios (16o)** · SQL: `supabase/99_mascara_vermelha.sql`. Dentro de qualquer prédio (casas, delegacia, PRF, bombeiros, prefeitura, CRAS, Câmara, cadeia, QG...) a luz é das lâmpadas: igual de dia e de noite, e a chuva não escurece lá dentro. Menu ☰ rola quando não cabe na tela (celular em pé) e fica por cima do joystick. Pernas do corvo e do pombo saem do toco das pernas do modelo (perna dobrada, sem perna solta ao lado). Máscara camisa enrolada vermelha com o mesmo ajuste da cinza.
- **Sol, lua e hospital (16p)** · SQL: `supabase/100_dez_carros.sql`. Sol e lua no céu (câmera 3D): o sol nasce às 6h e se põe às 18h (laranja no horizonte), a lua faz o caminho oposto à noite, com crateras e brilho; antes o céu ficava atrás do limite de visão da câmera e não aparecia (estrelas e nuvens também voltaram). Hospital por dentro: recepção, enfermaria, farmácia, consultório e vestiário. Toda construção é sólida para quem voa (modelos 3D também): pássaro e helicóptero não atravessam e pousam em cima (helicóptero só em laje plana). Rondas dos bombeiros, viaturas e vans seguem as ruas de verdade (não cortam mais o terreno do QG). Viatura da polícia usa o modelo de viatura (não o SUV laranja; `viatura_pm.glb` entra no lugar quando existir). Veículos do jogo respeitam o comprimento do veículo do jogador e não "atravessam" veículo de jogador parado. Até 10 carros por jogador.
- **Hospital 3D e helicópteros (16q)**: `predio_hospital.glb` (Meshy) no lugar do hospital antigo. Helicóptero de resgate no heliponto do hospital (médicos em plantão sobem pela escada da recepção) e helicóptero dos bombeiros na laje do quartel (bombeiros em serviço sobem pela escada do quartel): voa até o fogo, fica abaixo de 40 m e joga água do alto (Água, +400). Pousado no próprio heliponto, o piloto desce pela escada; largado em outro lugar, volta sozinho em 3 min. Helicóptero NPC dos bombeiros: sai da laje quando tem incêndio, joga água e volta. Viatura da PM nova (`viatura_pm.glb`) com os vidros escurecidos. Os modelos `helicoptero_resgate.glb` e `helicoptero_bombeiros.glb` entram sozinhos quando existirem.
- **Quartel e caminhões novos (16r)**: modelos do Meshy: quartel dos bombeiros (`predio_bombeiros.glb`, helicóptero no H da laje), caminhão dos bombeiros e caminhão de lixo novos (rodas geradas no lugar das do modelo, com eixo duplo atrás), helicópteros de resgate e dos bombeiros próprios (as pás viraram um rotor que gira). Vidros escurecidos onde o modelo veio manchado (cabines dos caminhões, bico dos helicópteros). Garis nos estribos do caminhão novo levam o saco de lixo (`sacola_lixo.glb`) na mão até o caminhão. Ferramenta: `glbtool/raiz.py` (gira, escala e põe o chão em y=0).
- **Forças Armadas 3D (16s)**: modelos do Meshy: QG do Exército (lado oeste do pátio do quartel), hangar e torre da Aeronáutica (Base Aérea, sem a laje branca do modelo), Comando Naval (Base Naval, no lugar do bloco antigo, sem o cais e a água do modelo) e bunker da Área 51 (a sudoeste do hangar). Óvni novo (`ovni.glb`) sem o feixe de abdução grudado embaixo e sem o anel de luzes coloridas (o modelo já tem as luzes vermelhas). `predioGLB()` coloca qualquer prédio do Meshy num ponto, com corte da laje e parede sólida no meio.
- **Prédios principais 3D (16t)**: o QG do Exército é a casca 3D do Comando (por fora o modelo; entrando, ele some e aparecem as paredes e o interior de sempre); a Área 51 é o bunker 3D por fora do Hangar 18 (some quando você entra ou quando o teto abre para o óvni); a Aeronáutica é o hangar principal da Base Aérea (o maior). Hospital e quartel dos bombeiros: sem a barraquinha da frente (entra direto pela porta do prédio) e a praça/base de concreto do modelo virou chão (o personagem não afunda).
- **Helicópteros (16u)**: luzes só na cauda (pisca-pisca na ponta e em cima da deriva) e um embaixo da barriga; nada nas pás. Helicóptero dos bombeiros: a bolsa de água vira peça separada, aparece só voando (acima de 2,5 m) e some para pousar; o modelo desceu para os esquis tocarem o chão.
- **Óvni e Marinha (16v)**: o óvni (e o feixe dele) contava como "construção sólida" e se empurrava para cima sozinho (subia depois da abdução e ficava difícil de controlar); veículos, óvni e feixe não contam mais. Óvni 3D sem o halo e sem o emissor verde da barriga (tampa escura no lugar). Comando Naval: tira só a laje em volta do prédio (antes cortava a base do prédio). Área 51: a porta de pessoal do hangar foi para o meio da parede leste, onde fica a porta blindada do bunker 3D.
- **Óvni (16w)**: silencioso também no teste do admin (lá ele era tratado como helicóptero comum e fazia o barulho); mais rápido (62 m/s, sobe 12 e desce 10 m/s), arranca e para na hora e vira firme, sem atraso no comando.
- **Comando Naval (16x)**: prédio da Marinha no chão (antes flutuava a altura da laje), virado para o portão, sem o guindaste solto do cais; para usar os mísseis e chamar navio é preciso entrar no prédio (sala nova com a Central de Mísseis e a mesa de operações). Óvni do teste de veículos do admin com os botões de abdução e invisível (ehOvni).
- **Míssil (16y)** · SQL: `supabase/101_missil_admin.sql`. O General Supremo lança sem esperar a recarga de 10 min. Na Central de Mísseis, o admin tem "🧪 Testar": só ele vê o míssil, o impacto e a explosão (não fere ninguém) e é levado para 70 m do alvo para assistir.
- **Míssil atômico (16z)**: a explosão do míssil de cruzeiro virou a de uma bomba atômica: clarão que ofusca a tela (de longe também), bola de fogo que sobe, coluna e o chapéu do cogumelo que fica no céu ~1 min, anel de poeira; a onda de choque vai a 324 m (6 quarteirões: tela treme e empurra quem está a pé). Mata até 60 m e fere até 120 m; o alerta de fuga vale para quem está a até 340 m. O teste do admin leva para 230 m do alvo.
- **Nome da aeronave (16aa)**: o registro da queda (caixa vermelha do incêndio) e os avisos de batida usam o veículo de verdade: avião, caça, óvni, helicóptero de resgate, dos bombeiros, do Exército ou helicóptero (antes tudo o que não era avião virava "helicóptero").
- **Cogumelo e arremesso (16ab)**: o cogumelo do míssil é feito de muitas bolas de fumaça irregulares (couve-flor): bola de fogo fervendo que sobe e se apaga, chapéu que rola para fora, coluna, gola, poeira abrindo na base, anel de condensação e marca queimada no chão. A onda de choque arremessa quem está a pé até 110 m da explosão: 1 quarteirão (54 m) no epicentro, num arco, parando antes de bater numa parede; o dano vem na queda. Mais longe (até 324 m) só arrasta um pouco. Miniatura do Médico refeita (a antiga era do modelo com a mão errada).
- **Gráfico Ultra (16ac)**: novo nível ☰ → Gráficos: Ultra. Resolução cheia, sombra 4096 cobrindo área maior, visão até ~380 m (7 quarteirões) e neblina mais longe, prédios 3D até 240 m, árvores 3D até 220 m e carros 3D até 130 m; texturas nítidas de longe (anisotrópico 16x) e com relevo (grama, asfalto, terra, calçada e paredes); água mais lisa e espelhada com ondas mais marcadas; à noite o poste mais perto vira uma luz de verdade que projeta a sombra do personagem. Holofotes da Área 51 varrem o pátio (todos os níveis). Se o aparelho perder o gráfico duas vezes em 10 min, desce de Ultra para Alta.
- **Ultra realista (16ad)**: holofotes da Área 51 com o cone certo (fino na lâmpada). Caças sem a chama laranja parada: só um fogo azul fraco ao acelerar e só no Ultra. No Ultra: explosões com bolas de fogo que fervem e esfriam, fumaça subindo e faíscas em arco; incêndios com brasas, miolo branco-amarelado, fumaça mais densa e luz laranja tremendo em volta; prédios 3D com vidro espelhado, relevo na textura e janelas que acendem à noite; aviões médios e grandes deixam rastro branco no céu acima de ~90 m, que some em ~30 s. Em qualquer gráfico: pisar ou passar de carro numa poça de chuva espirra água (gotas + ondinha), também para outros jogadores.
- **Rotor suave (16ae)**: helicópteros novos (resgate e bombeiros) giram como o primeiro: parados mostram as pás do modelo; com o motor girando as pás somem e entra o disco translúcido com duas pás apagadas, centrado no eixo de verdade (calculado pelas pontas das pás). Some sozinho quando o rotor para.
- **Sombra firme (16af)**: a sombra do sol fica presa ao chão embaixo da câmera (não na altura de quem voa) e anda de texel em texel: acabou o pisca-pisca voando de ovni/avião no ultra. Luz do poste (ultra) apaga quando você voa e troca de poste com fade. Gráfico Alto agora vê tão longe quanto o Ultra (neblina, alcance, prédios/árvores/carros 3D), mas com a resolução e a sombra do Alto.
- **Preferências na conta (16ag)**: gráfico, câmera e tutorial visto ficam salvos na conta (perfis.prefs, supabase/102_prefs.sql), não só no navegador: valem em qualquer aparelho e não somem quando o celular limpa o armazenamento. Tutorial abre sozinho uma vez por jogador (conta nova sempre vê); dá para rever em ☰ → 📖 Tutorial.
- **Trânsito calmo (16ah)**: ônibus e veículos NPC parados no trânsito não tremem nem balançam mais: o desenho passa por um filtro de posição e velocidade (sem atraso andando) e, quase parado, trava como desligado até andar de verdade (30 cm). O amortecedor ignora os tranquinhos de poucos centímetros; freada e arrancada de verdade continuam.
- **Teste admin (16ai)**: a lista 🧪 Testar veículo do painel só mostra veículos com arquivo 3D carregado (o "Ônibus" genérico, sem arquivo, aparecia como o modelo do sistema).
- **Ambulância nova (16aj)**: modelo novo (van tipo Sprinter do SAMU, assets/modelos/ambulancia.glb, 6 m, frente +z), rodas que giram medidas no modelo (eixos -1,34 e 1,88, raio 0,38) e a sirene piscando na barra de luz do teto. Vale para a ambulância do hospital e a dos médicos.
- **Proteção ECA (16ak)**: ECA Digital (Lei 15.211/2025) e LGPD. Classificação indicativa 16 na tela de entrada e na Conta; páginas termos.html (novos Termos de Uso) e privacidade.html (atualizada). Filtro do chat (js/seguranca.js): telefone, e-mail, links, @perfis, redes sociais, endereço, CEP, CPF e Pix bloqueiam a mensagem; palavrões viram ***; o filtro vale também no que chega. Tocar numa mensagem do chat abre Denunciar (o texto vai junto) / Bloquear. ☰ Modo protegido: os pais ligam com PIN (4 a 8 números) e somem chat de texto e voz em qualquer aparelho; 5 PINs errados travam 15 min; a equipe destrava com admin_dados_privados. ☰ Apoie o jogo: só maiores de 18 (data de nascimento pedida uma vez, guardada na tabela dados_privados que ninguém lê), doação voluntária sem recompensa (link do GitHub Sponsors em APOIO_URL). Rode supabase/103_eca_digital.sql.
- **Contato (16al)**: e-mail de contato approtaos@gmail.com nos Termos, na Política de Privacidade e na janela do modo protegido (pais que esqueceram o PIN).
- **Apoio Pix (16am)**: a janela 💖 Apoie o jogo (só maiores de 18) mostra a chave Pix aleatória (APOIO_PIX em js/seguranca.js) com botão Copiar, além do link do GitHub Sponsors.
- **Idade no cadastro (16an)**: na primeira entrada (antes do tutorial) o jogo pede a data de nascimento, uma vez e obrigatória. Menor de 16: o modo protegido já começa ligado sem PIN (sem chat e sem voz) até um responsável liberar em ☰ › Modo protegido (marca a autorização; fica registrado em dados_privados.liberado_responsavel_em). Termos e Política atualizados. Rode supabase/104_idade_cadastro.sql (depois do 103).
- **Trânsito com regras (16ao)**: veículos do sistema não atravessam mais uns aos outros à vista de quem joga (o destrave de nó só acontece longe, ou depois de 4 min); não fecham o cruzamento (antes de entrar, esperam na faixa de retenção se do outro lado não cabe o veículo inteiro ou se tem alguém atravessando no meio: quem já está dentro tem a vez; semaforos.cruzamentoAFrente); param para quem pisa na faixa de pedestre (art. 70 do CTB; naFaixaPedestre). Corvo/pássaro pousa no teto de veículos e vai junto (veiculoSob, caixaDoVeiculo agora tem y1). Avião internacional espera no taxiamento quando o regular está logo à frente e recupera o atraso na vaga. Prédios 3D com folga de 20 m no alcance (sem pisca-pisca na borda). 💖 Apoie: GitHub Sponsors oculto (APOIO_URL vazio), só Pix.
- **Medidor (16ap)**: 📊 medidor de desempenho: abra o jogo com ?diag=1 no fim do endereço (fica lembrado; ?diag=0 desliga). Mostra quadros por segundo, travadas (>50 ms), a pior pausa, desenhos/triângulos/shaders e quanto cada parte do jogo gastou no quadro da pior pausa (marcas diag() no quadroJogo). Menos peso: ônibus monta no máximo um modelo por quadro; só o pássaro de quem joga pousa em veículos (os bandos NPC não testam veículos).
- **Rodoviária em ordem (16aq)**: cada vão cabe dois ônibus (plataforma + fila); o terceiro espera fora, no próprio caminho a 22 m da rodoviária (esperaFora), e entra quando abre vaga. Perto da rodoviária (30 m) os ônibus testam o retângulo inteiro em qualquer direção (retangulosBatem): ninguém avança para dentro de outro; quem está saindo da plataforma deixa passar quem está chegando (olha 8 m à frente de quem chega).
- **Terminal rodoviário (16ar)**: inspirado no Tietê. A rodoviária ganhou o quarteirão a leste (TERMINAL_RODO, x 113..211): a rua x = 162 entre os dois foi fechada (mundo.js) e os prédios saíram (liberarQuadra). Saguão 3D (assets/modelos/terminal_rodoviario.glb, 49 × 22 m, de frente para a rua de baixo) e pátio de espera (PATIO): uma faixa por linha, até 3 ônibus, portão leste para entrar e oeste para sair. Com o vão cheio (2), o terceiro vai pelas ruas até o pátio, espera na faixa da linha (o primeiro que chegou sai primeiro) e, quando o vão libera, sai, contorna pela rua de cima e encosta na plataforma (entrarPatio/andarPatio; o horário fica segurado). Circulares (4, 5, 6) não entram: param no ponto coberto da calçada da frente (x 188, z -216). Linha 2 sai por baixo e contorna o terminal. Pontos de ônibus em 3D por região (PONTOS3D, carregados só perto): ponto_cidade (metrópole), ponto_pichado (cidades do interior, morros e rodovias) e ponto_aeroporto (aeroporto e perto das estações das cidades menores); modelos do Meshy reduzidos (cidade de 135 mil para 44 mil triângulos; tirada a bolinha solta do ponto do aeroporto).
- **Leveza e saguão (16as)**: o medidor (?diag=1) mostrou que as travadas eram no desenho (render 35–150 ms), com até 10 milhões de triângulos por quadro no alto. Os modelos do Meshy tinham ~47 mil triângulos cada, até postes, máscaras e armas. Agora 120 modelos de assets/modelos foram simplificados por erro quadrático (colapso de meia-aresta: posição e UV originais, costuras de UV e bordas preservadas, normais refeitas). Alvos: acessórios 3 mil, postes e árvore 1,5–3 mil, prédios 7 mil (escritório 16 mil, prefeitura/PRF 18 mil), veículos 12 mil, interiores 15 mil, ponto pichado 9 mil (era 176 mil). Texturas 2048 viraram 1024. Os modelos ficaram com 93 MB (eram 139 MB), e perto da rodoviária no alto o desenho caiu de 10,1 para ~4,2 milhões de triângulos. No "alto", os prédios 3D vão até 40 a 190 m; o "ultra" segue com 64 a 240 m. Texturas sobem para a placa de vídeo uma por quadro, logo que o modelo chega (aquecer/aquecerQuadro). Shaders são compilados em segundo plano (compileAsync) aos 4, 15 e 40 s de jogo. O medidor agora soma todas as passadas (sombra, cena e pós) e mostra a fila de texturas. Saguão por dentro (SALAS.saguao, entrada pelo tapete da frente do terminal), com:
  - guichês das viações (nomes inventados), um por linha com plataforma, mais o de informações;
  - painel de partidas ao vivo (todas as linhas, plataforma, contagem e situação);
  - sala de espera e lanchonete (+25 de fome, a cada 5 min);
  - sanitários.

  O guichê e o painel levam o jogador direto para a plataforma da linha (ou para o ponto das circulares).

- **Árvores, grama e ruas (16at)**:
  - **Árvore comum:** o carvalho do Meshy (assets/modelos/arvore_carvalho.glb) saiu de 4 milhões para 6 mil triângulos (agrupamento de vértices e depois QEM em modo livre, que pode passar pelas costuras de UV da folhagem). Ele entra no lugar de prop_arvore nas árvores 3D (mundo.js) com 5,6 m de altura.
  - **Grama em tufos:** tufo feito por código (18 folhas curvas, ~100 triângulos), num InstancedMesh, só nos gramados perto do jogador. São 1.100 tufos no ultra, 700 no alto, 260 no médio e nenhum no baixo (mundo.gramaPerto). O tufo do Meshy tinha 684 mil triângulos e as folhas finas se desfaziam na simplificação.
  - **Texturas de asfalto, calçada e grama:** tiradas dos modelos de rua e do tufo do Meshy, desenhados de cima e emendados sem costura (assets/texturas/). Elas trocam a imagem das texturas desenhadas por código (imagemReal), na metrópole e no centro.
  - **Faixa dupla amarela contínua** no meio das ruas; para antes da faixa de pedestre.
- **Ônibus no terminal (16at)**:
  - Saída das plataformas é de um por vez (SAIDA_RODO): antes saíam juntos de plataformas vizinhas e se embolavam na esquina.
  - Ônibus esperando fora não fica em cima de ônibus de outra linha (espera atrás).
  - Encostado em outro ônibus, só anda se o passo afastar os dois (antes entrava de vez).
  - O ônibus que sai do pátio espera a rua de baixo ficar livre, e quem vem pela rua deixa passar quem já saiu.
  - A vaga da fila do vão recua para ônibus de 14 m e articulados.
  - As circulares partem e chegam em x = 200 (antes 212, colado na esquina x = 216).
- **Tela de apagado e preso + Beta (16au)**:
  - **Ao morrer:** câmera lenta, imagem cinza e escura nas bordas, **APAGADO** em vermelho e som próprio (whoosh, estrondo grave e zumbido). O resto do jogo abaixa enquanto toca.
  - **Ao ser preso:** **EM CANA** em azul, com a sirene enviada pelo dono (Pixabay) metalizada e uma porta de ferro batendo. O jogador vai para a cela na pancada.
  - Fonte Bangers (licença OFL, assets/fontes, com o texto da licença). Sons em assets/sons/apagado.mp3 e em_cana.mp3 (sons.tocarTela).
  - **Selo BETA** na tela de entrada, na de personagem e na de abertura, mais no título da aba e na versão.
- **Preferência no cruzamento (16av)**: quando dois veículos se travam (um à frente do outro, como no cruzamento), vale a preferência de quem vem pela direita (CTB, art. 29, III, c), em frearAtras/cedeAVez.
  - Quem cede espera. Se estiver no caminho do outro, dá uma ré de ~2,5 m, só com espaço atrás (verifica quem está atrás), e depois segura 5 s para o outro passar.
  - Perto de quem joga, o "atravessar o outro" de emergência só acontece depois de 10 min (antes era 4).
  - Quem espera para entrar num cruzamento travado aguenta 60 s (antes entrava aos 25 s e fechava o cruzamento).
- **Menos memória (16aw)**: o jogo passou a fechar sozinho no celular quando travava muito. Era a memória de vídeo cheia, e o Android matava a aba.
  - Todas as texturas dos modelos (assets/modelos, personagens e robos, 198 arquivos) agora têm no máximo 512 px. Com tudo carregado, a memória de vídeo cai de ~1,9 GB para ~0,66 GB.
  - Saiu o envio antecipado de todas as texturas para a placa (aquecer, da 16as): com ~200 modelos ele enchia a memória. As texturas voltam a subir só quando o modelo aparece. A compilação de shaders em segundo plano continua.
- **Fim de tarde, reflexo do céu e rotor do Exército (16ax)**:
  - **Alto e ultra, fora dos interiores:** céu em degradê (cúpula com shader em ceu.js). O zênite vai para o horizonte e o sol tem brilho espalhado em volta. No fim de tarde o horizonte fica laranja e o alto do céu azul-escuro; de manhã, rosado; com chuva, cinza.
    - A cor do horizonte vai para o fundo e para a neblina.
    - O sol desce mais (sombras compridas) e a luz fica dourada à tarde.
  - **Reflexo do céu:** o ambiente das reflexões (poças, asfalto molhado, lataria) vem da cúpula e é refeito a cada 6 s com as cores da hora, então as poças refletem o céu do momento. Nos interiores continua o ambiente de sala.
  - **Helicóptero do Exército** (glbtool/heli_exercito.py): saíram do corpo a pá solta e o caco flutuante. O rotor virou o cubo mais 4 cópias da melhor pá, a cada 90°, centrado no cubo. Girando rápido aparece o borrão, como nos outros helicópteros (montado na primeira vez em rotorRapido).
  - **Robô separador:** zip só com a pasta assets/ era "achatado" (o robô usa o conteúdo da pasta única de cima), e os modelos caíam em /modelos, /personagens e /robos na raiz. Agora todo pacote leva também o README.md na raiz. As pastas modelos/, personagens/ e robos/ e os main.js, mundo.js e config.js soltos na raiz são lixo e podem ser apagados.
- **Sem placas voando (16ay)**: quando um prédio vira modelo 3D, o telhado e as caixas do teto do prédio-caixa (caixa d'água, casa de máquinas) eram "escondidos" achatando a altura para 0,01. Sobravam placas finas e escuras na altura do prédio-caixa, voando em cima do 3D (mais visíveis desde que o alto passou a ter prédios 3D). Agora matrizTelha e matrizDet zeram a escala quando escondidos.
- **Emotes e gestos de conversa (16az)**: animações do Mixamo enviadas pelo dono (terno, 20 animações) viraram assets/personagens/animacoes_emotes.glb: só esqueleto e animações, sem dedos, quadril no lugar, 1,3 MB (glbtool/extrair_anims.py). O arquivo baixa na primeira vez que alguém usa, e cada personagem adapta cada animação só quando precisa (Avatar.garantir, cache por modelo).
  - **Conversa:** NPCs conversando gesticulam na vez de falar (4 gestos sorteados, sem repetir em seguida). O jogador parado gesticula enquanto fala no chat de voz e alguns segundos depois de mandar mensagem no chat de texto. Falando na voz sem ninguém a menos de 14 m, fala ao celular.
  - **Botão 😀 (ao lado do 💬):** 4 danças, empolgado, dança das contas, bronca, "não, não", dor de cabeça, beber, exercício (burpee) e equilibrar. Andar para o emote, e os outros jogadores veem (vai no estado "a"). O breakdance ficou de fora, a pedido.
- **Flexão e mais danças (16ba)**: animacoes_emotes.glb agora junta os dois arquivos do dono (22 animações, 1,7 MB). Quadril no x/z da pose de descanso, então as 3 partes da flexão se encaixam.
  - **Flexão em 3 partes:** escolher 💪 desce (uma vez) e segue fazendo flexões em repetição. Tocar 😀 de novo levanta (uma vez) e volta ao normal. Andar cancela na hora.
  - **Danças novas:** Dança 5 (bolhas) e Dança 6. O burpee continua, com o nome "Burpee".
- **Corridas, socorro e poça de tinta (16bb)**: assets/personagens/animacoes_corrida.glb tem 7 animações do Mixamo do dono, com outro esqueleto de origem (ARQ_EXTRA/obterBaseExtra) e carregadas sob demanda.
  - **Corrida:** com fome (abaixo de 20) usa a corrida sem força. Treino de corrida no máximo + jujuba usa "correr rápido". Treino no máximo OU jujuba usa a carga de cabeça baixa. O normal continua igual.
  - **Treino no máximo:** só Polícia, PRF, Exército e BOPE. O treino agora vai até 8 níveis (+0,8%).
  - **Armado:** correndo com treino no máximo ou jujuba, corre com a arma (carga de rifle, 92% da corrida). Sem isso, continua andando armado.
  - **Parada brusca:** quem vinha correndo há mais de 1,2 s e para de vez faz a parada (1,7 s).
  - **Socorro:**
    - A ambulância NPC agora traz um socorrista (Enfermeiro ou Enfermeira) que desce, vai até o ferido, faz o salvamento (coletar objeto) e volta para a ambulância, que só então vai embora.
    - O socorrido levanta com a animação "Levante-se" (~7 s).
    - O médico jogador vê "✚ SALVAR" em cima de cada ferido; o botão vira "✚ Salvar" e faz a mesma animação.
  - **Poça de tinta** (assets/modelos/poca_tinta.glb, simplificada de 49 mil para 400 triângulos) embaixo de quem cai, jogador ou outros jogadores. Some quando ele levanta.
- **Anti-ácido, depósitos e caminhões do contrato (16bc + SQL 105)**:
  - **Anti-ácido** (item `antiacido`, bebida/suplemento): por 7 min a fome cai no máximo 3% (atualizarFome usa no máximo 3/420 por segundo). Não enche a barrinha; tomar de novo renova.
  - **Depósitos:** Polícia, PRF, **BOPE** (novo, na sede) e Bombeiros, com até 10.000 jujubas e 10.000 anti-ácidos cada. Todos começam vazios (só na 1ª vez que o 105 roda). Pegar 5 de cada, com 5 min de espera por produto. Cada pedido é de um produto.
  - **Despacho:** o quartel chama um caminhão livre da transportadora do contrato. Ele fica ocupado (status em_rota, sem rota) até voltar, e a empresa recebe o valor por caminhão. Sem caminhão livre, a empresa paga 20.000 de multa para o **cofre do Exército** e vai um caminhão do Exército.
  - **Licitação:** exige 5 caminhões. A tela mostra os caminhões da empresa a serviço do Exército (x/5).
  - **Roubo e venda:** a carga de anti-ácido é sequestrável como as outras e vai para o estoque de anti-ácido do Seu Tonho (500 cada, só clã).
  - **Cofre do Exército:** exercito_cofre e exercito_recompensas. Coronel para cima (ou o admin) recompensa soldados pela central de rações (recompensar_militar).
- **Caminhão baú novo (16bd)**:
  - `assets/modelos/caminhao.glb` foi trocado pelo modelo novo do Meshy: cabine cara-chata e baú branco liso. Tem 8,4 m, 16 mil triângulos e textura de 512. Carrega com `?v=bau1`.
  - Os caminhões das empresas (e o da autoescola) agora têm **rodas que giram e viram** (RODAS.caminhao, eixo duplo atrás), pelo `civico.veiculoComRodas`.
  - O caminhão roubado usa o mesmo modelo, escurecido e sujo. O `caminhao_danificado.glb` deixou de ser carregado.
  - A cabine do motorista (olho e capô) foi medida de novo para o modelo.
  - O baú liso vai receber a lona com a logo de cada empresa na próxima etapa.
- **Refletores nas bases, estrelas e polícia humana (16be)**:
  - **Refletores tipo estádio:** torres de 22 m no Quartel (4), na Base Aérea (6) e na Base Naval (6), em `montarRefletores`/`atualizarRefletores`. Ao escurecer, as lâmpadas acendem, aparece um facho leve e uma poça de luz no chão (aditiva, sem luz de verdade, para não pesar no celular). Longe (700 m+), as torres não são desenhadas.
  - **Estrelas que não sumiam:** o perdão usava o relógio do jogo, limitado a 0,05 s por quadro. No celular a 12 FPS, os 30 s viravam 50 s reais e o servidor descartava o tique, então as estrelas nunca saíam. Agora usa o relógio real, com um tique a cada 25 s.
  - **Fim dos robôs fardados:** polícia, PRF, BOPE, Exército (pátio, sentinelas, caçada, esquadra, recrutador) e Marinha viraram NPCs humanos, por `npcFardado(papel, i, arma)`. Usam rostos variados dos personagens, com colete e boné ou capacete da corporação e arma na mão. A polícia e a PRF sacam a arma só em ação (perseguindo ou revidando) e miram com a pose `mirar`.
  - O jogador em serviço na polícia continua com o próprio personagem e a farda (antes virava o robô).
  - O robô só ficou como fonte das animações e como boneco de luta.
- **Farda padrão, NPCs armados e caminhão acabado (16bf)**:
  - **Farda igual em todos:** colete e boné/capacete têm tamanho padrão pela altura do personagem, em unidades do osso. Antes eram medidos na malha de cada um, e por isso mudavam de personagem para personagem. Só crescem se o corpo for mais largo que o padrão (grandalhão), para não atravessar. Vale para jogadores e NPCs.
  - **NPC armado anima como o jogador armado:** com a arma à mostra, `walk` vira `walk_shoot`, `idle` vira `mirar` e `run` vira `corrida_rifle` (wrapper em `npcFardado`). A arma não fica mais "voando". A polícia e a PRF trocam a animação na hora em que sacam ou guardam a arma.
  - **Policial NPC derrubado:** a arma some, ele cai e fica a poça de tinta embaixo (`porPoca`). A poça sai quando ele levanta, depois de 20 s.
  - **Caminhão:** a textura passou para 1024, sem o mapa metálico (refletia o céu e ficava rosado). O baú agora é branco liso (`civico.bauLiso`). A traseira ganhou moldura, portas com trancas e dobradiças, para-choque e lanternas (`traseiraBau`), e a cabine ganhou para-brisa curvo e janelas de vidro novas. Carrega com `?v=bau2`.
- **Farda no padrão do Jovem da Cidade e moradores que caem (16bg)**:
  - **Farda:** colete e boné/capacete usam as proporções medidas no Jovem da Cidade (largura 0,176, fundura 0,158 e altura 0,235 da altura do corpo; cabeça 0,097). Ficam iguais em todos os personagens e NPCs. O colete só alarga em corpo mais largo ou fundo que isso, para não sumir dentro do corpo.
  - **Moradores da rua:** levam tiro, soco e atropelo (`acertarCivil`). Ferido, o morador foge. Derrubado, cai na poça de tinta, conta como crime e levanta depois de 30 s (`civilCaido`).
  - `rede.logos` e `supabase/106_logos_empresas.sql` já estão no código: são a base da próxima etapa (logo das empresas). O jogo ainda não usa.
- **Hospital à noite e boneco duplicado (18a)**:
  - **Hospital:** no gráfico ultra, o "prédio ultra" (janelas acesas em blocos e vidro-espelho) recortava as janelas deste modelo em triângulos amarelos e escurecia a fachada. Os meshes do hospital agora têm `userData.semUltra` e ficam fora desse efeito. A sombra do poste (SpotLight do ultra) ganhou `normalBias`.
  - **Boneco duplicado:** ao entrar ou sair de serviço, o jogo recriava o personagem (antes trocava pelo robô). Às vezes a cópia velha ficava parada na rua, com a farda torta. Agora só recria quando o personagem muda de fato, e o velho sai de onde estiver (`removeFromParent`).
- **Ajuste da farda por personagem e Visual na mochila (18b + SQL 107)**:
  - **Editor da farda (admin, ☰ › painel › farda):** ganhou a escolha de personagem (◀ lista ▶). O admin vira aquele personagem só para ver; ao fechar, volta o seu. Também escolhe para onde vai o ajuste: **👥 Todos os personagens** (ajuste geral da corporação) ou **👤 Só este**, guardado em `farda[papel].pers[id][peça]` por cima do geral. Vale para colete, capacete/boné e máscaras. Na lista, ★ marca personagem com ajuste próprio. `ajusteDe(papel, peça, personagem)` junta tudo, e `av.personagemId` vem do `criarAvatar`.
  - **SQL 107:** `admin_farda` aceita até 200.000 caracteres (eram 8.000). Cada máscara é única (gatilho `mascara_unica` no inventário: loja, mercado, doação...). Quem tinha cópias extras fica com uma e recebe o preço da loja das outras.
  - **Mochila:** as máscaras saíram da lista de itens e foram para a seção **🎭 Visual** (Usar/Tirar). Na loja, a máscara que você já tem aparece como "✔ Já é sua".
- **Logo das empresas nos caminhões (18c + SQL 106)**:
  - **Lona** (`js/logos.js`): é um painel com a logo nas duas laterais do baú branco, em `porLona(obj, logo, nome)`. O jogo lê `empresa_logos` a cada 45 s (`atualizarLogos`) e aplica nos caminhões de cada empresa. Logo aprovada, todos veem. Em avaliação, só o dono vê.
  - **Aba 🎨 Logo** (dono da transportadora): 6 logos prontas (escudo, seta, globo, raio, estrela, roda) com 8 cores e o nome da empresa, que entram no ar na hora. Ou o envio de uma imagem: o celular recorta para 1024×384 em JPEG, ela vai para o Storage (pasta `logos/<empresa>/`) e fica pendente. Tem também o botão "Tirar logo".
  - **🗳️ Avaliar logos** (botão na janela de empresas, para todos): 👍/👎 dos moradores. Com 5 👍 (e o dobro de 👍 sobre 👎) a logo é aprovada. Com 5 👎 é recusada, ou volta para a avaliação se já estava no ar. Admin e moderadores aprovam, recusam, removem e bloqueiam a empresa por 7 dias.
  - **SQL 106:** cria o bucket público `logos` (até 400 KB, jpeg/webp/png) e as políticas do storage (só o dono envia na pasta da empresa). Cria as tabelas `empresa_logos`, `empresa_logo_bloqueio` e `logo_votos` e as funções `enviar_logo`, `escolher_logo_pronta`, `tirar_logo`, `votar_logo`, `logos_painel` e `moderar_logo`.
- **Postes do Brasil (18d)**:
  - **Cidade** (`montarPostes` em mundo.js, tudo instanciado): poste de concreto de 9,6 m (haste afinando), braço curvo sobre a rua com luminária de sódio (laranja, 60%) ou LED (branca, 40%), cruzeta com a rede de cima, rede de baixo e transformador em 1 de cada 6 postes. Os fios vão de um poste ao próximo da mesma calçada (curva de catenária, um único `LineSegments`).
  - **Mais postes:** nas ruas, a cada 16 m alternando os lados. Antes eram 27 m. Agora usam a meia largura da própria rua e pulam qualquer ponto em cima de outra rua ou de prédio, então não ficam mais no asfalto. Nos quarteirões do centro, onde as ruas não estão na lista de `mundo`, entram 2 postes por lado da quadra, com fio, além dos da esquina. O GLB `poste` saiu.
  - **À noite:** poça de luz maior (7,5 m) com a cor da lâmpada (cor por instância) e brilho na lâmpada (`Points` aditivo). A luz de verdade do ultra subiu para a altura do poste novo.
  - **Favela** (`montarPostesFavela`): poste baixo (6,2 a 7,4 m) e torto, com lâmpada amarela fraca. De 3 a 6 fios embolados de cada poste aos dois seguintes (cruzando a rua), fio solto pendurado em 1 de cada 4 postes, e o "padrão" de cada casa: caixinha do medidor na frente da casa, com o fio vindo do poste e descendo pela parede.
- **Anti-ácido na mão e postes fora do asfalto (18e)**:
  - **Beber o anti-ácido:** ao tomar pela mochila, o personagem guarda a arma e toca a animação `beber` (que era o emote "Beber" e saiu da lista de emotes), com uma garrafa azul de rótulo branco na mão esquerda (`garrafaNaMao`). Os outros jogadores também veem: a garrafa aparece quando a animação remota é `beber`. Andar para de beber.
  - **Postes:** a checagem de asfalto (`naRuaRet`) agora vale também para as ruas dos morros (`ruasMorro`). Os postes da favela e os da cidade perto dos morros não caem mais no meio da rua, como acontecia na rua dos lotes do Morro do Porto e nos cruzamentos.
- **Rações pelo Quartel (18f + SQL 108)**:
  - **Caminhão da transportadora faz a viagem inteira:** `despachar_jujubas` grava em `caminhoes.rota` um roteiro `jj`: garagem (`lote_base`), círculo amarelo de carga no pátio do Quartel (178, 1018), 12 s carregando, corporação, 6 s descarregando e volta. No jogo, `pernas()` monta o caminho: ruas até (216, 641), rodovia, portão, pátio, e depois o `rotaJujuba` até a corporação. No pátio do Quartel o caminhão não espera obstáculo. A `jujuba_viagens.chegada` é a hora em que esse caminhão chega. O caminhão do Exército só faz a entrega quando a empresa não tem caminhão livre (multa).
  - **Sequestro:** é o próprio caminhão da empresa (`sequestrar_veiculo_empresa`), e só depois de carregado (antes disso dá "caminhão ainda vazio"). A viagem de rações vira `sequestrada` com quem sequestrou, a carga vai junto e o Seu Tonho compra. Ao vender ou largar, o caminhão fica e volta para a empresa como os outros sequestrados.
  - **Central do Exército manda sem pedido:** `enviar_racao(corp, produto, modo, segundos)` cria o pedido e despacha. Na Central, cada corporação tem "🚚 Mandar jujubas/anti-ácidos (1 caminhão)" e "Completar" (só quando falta mais de 5.000).
  - Círculo amarelo "CARGA" com placa no pátio do Quartel (`montarCirculoCarga`).
- **Celular, mecânico, estacionamentos e saque (18g + SQL 109)**:
  - **Celular 📱** (`js/celular.js`, botão ao lado do 😀): o personagem toca a animação `celular` com o aparelho na mão direita (`celularNaMao`, que os outros também veem) e, depois de 0,65 s, abre a tela. Apps: Minha empresa, Minha casa e Meu clã (com "📍 Ir até", que marca no mapa, e "Abrir"), Mecânico, Meu banco (carteira e poupança, depositar e sacar pelo `rede.banco`) e Estacionar (o guichê mais perto). Andar ou tocar na barrinha fecha o celular e ele tira o aparelho da orelha.
  - **Mecânico** (`chamar_mecanico`): cobra 100 + 1 moeda a cada 10 m da carteira e deixa o carro na faixa junto ao meio-fio da rua mais perto (`mundo.pontoRuaPerto`). O helicóptero vem voando em linha reta (`chamada.voa`). Na chegada, o veículo fica marcado no mapa. O Materializar saiu dos carros comprados (continua nos veículos das empresas).
  - **Estacionamentos grátis:** um guichê azul 🅿️ por quarteirão (`mundo.listaQuadras`, 226 no total), no mapa em azul. No guichê, o jogador escolhe o carro e ele aparece na vaga em frente.
  - **Saque do morto:** `morrer` não passa mais 100 moedas na hora. Quem matou tem 90 s para saquear o corpo (`saquear_jogador`, até 500 da carteira). Morador ou policial NPC caído dá de 20 a 150 (`saquear_npc`, um a cada 25 s). Usa a animação `coletar`, a mesma do socorro. A poupança fica protegida.
- **Oficinas no mapa (18z)**: o fundo do mapa era desenhado antes das oficinas existirem (elas não apareciam). Agora as oficinas (Zé, Premium e as dos jogadores) e os terrenos à venda aparecem no mapa, na lista de rastreio (📍) e no Teleportar do painel.
- **Música do celular na Saveiro (18y + SQL 119)**: no 🔊 Som da Saveiro, botão "📁 Enviar MP3 do celular" (até 10 MB; MP3, M4A, AAC, OGG, WAV). Vai para o Storage do Supabase (pasta `musicas/<id do jogador>`), uma música por jogador (a anterior é apagada), e toca na hora. Só dono de Saveiro com som envia; o link fica registrado para a moderação como antes.
- **Revisão militar grátis (18x + SQL 118)**: a revisão do helicóptero do Exército (e de aeronaves da Aeronáutica) é de graça para militares e o admin, no Quartel, na Base Aérea ou no aeroporto.
- **Holofote dos helicópteros (18w)**: o holofote (e o farol de pouso dos aviões) agora tem luz de verdade: uma luz acompanha a aeronave acesa mais perto de quem joga e ilumina trem, carros e gente embaixo, não só o chão. A mancha no chão ficou rente (não cobre rodas e pés).
- **Pintura dos carros (18v)**: carros de jogador (Popular, SUV, Esportivo, Clássico, Saveiro, Saveiro com som, Van) agora trocam de cor de verdade: o jogo acha a cor da lataria na textura (ou o branco/prata) e troca só ela, mantendo luz e sombra; vidro, pneu e detalhes ficam. Antes só multiplicava uma cor por cima (o Popular azul pintado de vermelho ficava azul escuro).
- **Alcance das armas e rações do Exército (18u + SQL 117)**: cada arma tem alcance e queda de bala próprios (paintball 40 m, polícia/PRF 60 m, militar 75 m, Exército 80 m, pesada 95 m, fuzil 130 m; espingarda curta); antes todas caíam com a gravidade inteira e batiam no chão a uns 15–20 m. Armado e turbinado (treino no máximo ou ração ativa) agora corre com o fuzil para baixo (a animação nunca tocava). Militares do Exército pegam 5 jujubas e 5 anti-ácidos na Central de rações do Quartel (direto da produção, a cada 5 min).
- **Aviso vermelho dos shaders (18t)**: o pré-carregamento de shaders (compileAsync do three.js) quebrava quando um material trocava de shader no meio da espera e mostrava "Cannot read properties of undefined (reading 'isReady')". Agora a espera é feita pelo jogo e ignora esses casos.
- **Limite do Morro do Porto (18s)**: quem saía da área permitida perto das bases ou da favela do Morro do Porto (atrás das empresas da rua da favela) era jogado para x = 300, do lado da Base Aérea/Marinha. Agora para no limite mais perto, onde estava.
- **Coletes, fotos dos carros e mecânico do Exército (18r)**: nome da corporação estampado no colete (projetado na malha, maior, acompanha a curva; antes era uma plaquinha voando). Sentinelas das bases com uma arma só. Concessionária online com a foto de cada carro na cor escolhida. Helicóptero do Exército faz a revisão pousado no Quartel ou na Base Aérea (mecânico do Exército).
- **Sede nova e ultrapassagem (18q)**: modelo novo da sede nível 15 (`assets/modelos/empresa_f3.glb`): galpão com 3 portas de doca no fundo e torre de vidro; os caminhões do modelo foram tirados e os caminhões da empresa encostam de ré nas portas quando estão livres. Trânsito: vans, viaturas, bombeiros e caminhões das empresas ultrapassam só em reta, longe de cruzamento, pela esquerda e com a contramão livre por ~50 m (depois de 3 s atrás de um veículo parado ou lento); voltam para a faixa depois de passar ou se aparecer alguém vindo. Veículos encostados de lado (curva) também esperam um ao outro.
- **Rotas, helicópteros e sede (18p)**: caminhão das rações para o BOPE vai e volta pela rua z 947 (não corta mais o mato nem a ferrovia); caminhões andam um pouco mais para o meio da faixa e os carros estacionados ficam colados no meio-fio. Pontas das pás do helicóptero dos bombeiros giram junto (não ficam paradas no ar). Prédios 3D das bases (Marinha, Aeronáutica, Área 51) fora do efeito de janelas do ultra (não brilham mais). Sede nível 15: torre de vidro feita por código no lugar do modelo escuro.
- **Trânsito e atropelamento (18o)**: caminhões das empresas seguem as mesmas regras dos outros veículos (sinal, cruzamento, quem tem a vez); caminhões, viaturas, bombeiros, ambulâncias e vans contam com o comprimento todo; à vista do jogador nenhum veículo atravessa outro. NPC não empurra mais o carro; atropelamento em cheio (rápido) mata, de raspão machuca. Manchas de luz dos postes rentes ao asfalto (rodas não afundam). Sombra do refletor com mais definição.
- **Caminhões das rações e refletores (18n + SQL 116)**: os caminhões vão ao Quartel pelo asfalto (rodovia, rua z 947, rua x 81 e a rua do portão), na mão certa; um espera o outro (não entram um dentro do outro, nem no círculo de carga); a cancela do Quartel abre para eles. Na fusão, a logo da empresa absorvida passa para a principal. Refletores: sombra de verdade, mancha mais fraca e o facho some quando a câmera está dentro dele (a tela não fica mais branca).
- **Refletores e licitação do grupo (18m + SQL 115)**: nas bases, quem anda embaixo dos refletores agora é iluminado (uma luz de verdade acompanha o refletor mais perto) e a mancha de luz fica rente ao chão (pés e rodas não parecem mais afundados). Empresa fundida (grupo: fábrica + transportadora) aparece na licitação e pode dar lance.
- **Contatos, ligação, reboque e oficinas dos jogadores (18l + SQL 113 e 114)**: app 👥 Contatos no celular com os amigos (on-line/off-line), mensagens privadas (só entre amigos, ficam 7 dias, aviso e contador de não lidas no 📱) e 📞 ligação 1:1 por voz em qualquer lugar (o outro celular toca: atender ou recusar; microfone aberto; funciona com a voz desligada). Reboque: carro comprado parado 30 min na rua vai sozinho para o estacionamento mais perto e o dono é avisado. Oficinas dos jogadores: 8 terrenos com placa amarela "VENDE-SE" (150.000, um por jogador); o dono dá o nome, define os preços (70% a 200% da tabela por serviço), fica com o lucro (peças custam metade da tabela) e evolui o galpão (nível 2 por 100.000: motor 2, blindagem, 1 min; nível 3 por 250.000: motor 3, na hora, galpão premium). Rodas que giram e viram na Saveiro, Saveiro com som, viaturas (PM, Civil, PRF) e Caveirão.
- **Licitação no painel do Exército (18k + SQL 112)**: a Central de rações mostra a licitação (empresa do contrato, caminhões usados, lances com o nome das empresas) e tem os botões 🆕 Abrir nova licitação, ⏩ Fechar agora e 💔 Quebrar contrato (encerra e já abre outra), para admin e Coronel para cima. O admin dá lance com qualquer transportadora dele, sem exigir nível 5 e 5 caminhões (para testes).
- **Concessionária online e computador da empresa (18i/18j + SQL 111)**: Central de rações ganhou o botão 📄 Abrir a licitação (o admin também dá lance). app 🛒 Concessionária no celular e no computador, mesmos carros da loja por +15% (helicóptero só na loja); o carro novo aparece no estacionamento mais perto e fica marcado no mapa. 💻 Computador na mesa do dono (só o dono): a tela do celular sem animação, com a aba 💼 Caixa da empresa (depositar e sacar). Celular fecha pelo ✕, tocando fora, pela barra de baixo ou Esc. Oficinas viraram galpões de verdade (paredes, telhado, porta de enrolar, vaga, elevador, ferramentas e balcão), montados num canto livre do quarteirão com a frente para a rua (Zé: nível 1, tijolo e zinco; Premium: nível 3, vidro e alumínio). Central de rações avisa quando não há contrato de transporte vigente (aí quem leva é o caminhão do Exército, direto do Quartel).
- **Oficinas autorizadas (18h + SQL 110)**:
  - Duas oficinas de NPC com cobertura, balcão e placa, laranja no mapa (`montarOficinas`): **Oficina do Zé** em Vila Serra (preço base, o carro fica 2 min na oficina e some do mapa) e **Garagem Premium** no quarteirão ao lado da Concessionária (30% mais cara, na hora). Para usar, o jogador estaciona o carro na vaga embaixo da cobertura e toca em 🔧 Oficina no balcão.
  - **Serviços** (`oficina_servico`, pago da carteira): pintura em 10 cores (2.000); motor 1, 2 e 3 com +10, +20 e +30% de velocidade máxima (8.000, 20.000, 45.000; `max` no `entrarCarro`); blindagem leve (30.000). O carro blindado aguenta a primeira explosão de tanque e gasta a blindagem; refazer custa a metade. Para arrombar, são 3 golpes no vidro. A janela 🚗 Veículos mostra o motor, a blindagem e se o carro está na oficina.