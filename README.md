# Fator RP

MMO sandbox de negócios, conflito e vida urbana. Versão atual: **etapa 2**, com contas, perfil salvo e jogadores se vendo na cidade em tempo real.

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

1. Em **SQL Editor → New query**, cole o conteúdo de `supabase/01_perfis.sql` e toque em **Run**. Depois faça o mesmo com `supabase/02_painel_admin.sql`.
2. Em **Authentication → Sign In / Providers → Email**, desligue **Confirm email**. Sem isso, cada cadastro depende de um e-mail de confirmação, e o plano gratuito envia poucos por hora.

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
supabase/               SQL do banco de dados
assets/personagens/     17 personagens com as 13 animações
assets/robos/           robôs (polícia, admin, moderadores, Contratante)
assets/modelos/         prédios, veículos e objetos
assets/miniaturas/      imagens da tela de escolha
```

Animações de cada personagem: `idle`, `idle_long`, `walk`, `run`, `carry_walk`, `pickup`, `punch_left`, `punch_right`, `punch_combo`, `shoot`, `walk_shoot`, `hit`, `death`.
