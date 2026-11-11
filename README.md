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
