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

1. Em **SQL Editor → New query**, cole o conteúdo de `supabase/01_perfis.sql` e toque em **Run**. Depois faça o mesmo com `supabase/02_painel_admin.sql` `supabase/03_economia.sql`, `supabase/04_logistica.sql` as partes `supabase/05a…05d`, `06a`, `06b`, `07`, `08a`, `08b`, `09`, `10`, `11a`, `11b`, `11c`, `12`, `13`, `14a`, `14b` e `15`, nessa ordem.
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
