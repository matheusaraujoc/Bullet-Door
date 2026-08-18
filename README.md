# Bullet Door

Jogo de caça e fuga em mapas procedurais pequenos. Dois papéis, um tiro mata.
Você caça por 30 segundos, depois foge por 30. Melhor de três.

**Para jogar: clique duas vezes em `JOGAR.bat`.** Ele instala o que falta na
primeira vez e abre o navegador sozinho.

## Identidade

A abertura da **Kountera Games** é a assinatura do estúdio e roda antes de
tudo: a marca surge com o `kountera_games.mp3`, o brilho metálico atravessa
com o `metalico.mp3`, e a tela passa para o jogo. Ela é do estúdio, não do
jogo — é a mesma que abriria qualquer outro título da casa.

A cara do **Bullet Door** vem de outro lugar: da planta dos mapas. O fundo do
menu não é textura decorativa, é um mapa **de verdade**, gerado na hora pelo
mesmo código que monta a partida, desenhado em planta baixa — com as portas
piscando e duas linhas, vermelha e ciano, se perseguindo pelos corredores.
Cada vez que o jogo abre, a planta é outra. A marca fecha a ideia: uma
guilhotina listrada caindo entre BULLET e DOOR, que é literalmente a porta do
jogo. As cores são as dos dois papéis — vermelho caçador, ciano fugitivo,
laranja para porta e ação — todas tiradas da paleta do próprio mundo.

Se você puser `public/images/Kountera_Games_Logo.png`, a abertura usa a
imagem; sem ela, a marca sai em tipografia.

## A regra que amarra tudo

Uma rodada tem duas metades. Ganha a rodada **quem eliminou mais rápido**.

Isso faz a segunda metade valer alguma coisa: se você caçou e matou em 18
segundos, agora precisa sobreviver 18 segundos para vencer. O tempo da sua
caçada vira a sua meta de fuga, e a interface cobra isso o tempo todo.

Se ninguém acerta ninguém, a rodada segue sem veredito — a troca é o ritmo
natural da partida.

## Controles

| Tecla | Ação |
|---|---|
| `W` `A` `S` `D` | mover |
| `SHIFT` | correr (faz barulho longe) |
| `CTRL` ou `C` | agachar (silencioso, e mais difícil de ver) |
| `Q` `E` | espiar pela esquerda / direita |
| `F` | abrir e fechar portas |
| clique esquerdo | atirar (munição infinita, 0,7 s entre tiros) |
| clique direito | mira de ferro |
| `ESC` | pausar |

**Espiar** tira só a cabeça para o lado, sem expor o corpo: dá para conferir um
corredor antes de entrar nele. A câmera para onde a parede manda parar — num
canto apertado você vê menos, como seria de esperar.

**A mira de ferro** fecha o ângulo de visão, quase zera o balanço da arma e
deixa o mouse mais manso. Em troca, o passo encurta e não dá para correr: é
troca de mobilidade por precisão, para quando o alvo está longe.

## As portas

São comportas que **correm na vertical**, do chão ao teto. Correr na vertical
resolve de raiz o problema de uma porta girando: ela não tem para que lado
abrir, então nunca varre por cima de ninguém — e o vão não tem fresta em cima.
Nenhuma folha desce sobre quem está embaixo: o acionamento simplesmente recusa.

Existem em dois tipos:

- **Porta de sala** — sobe e desce. Fechada, corta passagem e visão.
  O comando é sempre aceito: se alguém está no vão, a folha **segura no alto e
  desce sozinha assim que o caminho limpa**. Você aciona correndo, passa por
  baixo, e ela fecha atrás de você — recusar o comando castigava justamente
  quem mais precisa dela.
- **Porta de desvio** — duas folhas numa junção: quando uma desce, a outra
  sobe. Há sempre um caminho aberto e outro fechado, e é isso que faz o mapa
  se reconfigurar no meio da caçada.

O bot usa as duas coisas: levanta o que está no caminho, confere cômodos
fechados quando patrulha e fecha portas atrás de si ao fugir. **Toda porta
acionada faz barulho** — sua e dele. É de longe a pista mais alta do jogo, e
por isso mexer numa porta é sempre uma decisão, não um reflexo.

## O mapa

Traçado em malha: nove blocos separados por faixas de corredor que se cruzam.
A malha existe para garantir **loops** — dá para dar a volta no mapa inteiro
sem repetir caminho.

**Não existe beco sem saída.** Toda célula pisável tem pelo menos duas saídas;
o gerador varre o mapa no fim e, onde encontra um beco, abre um atalho (o que
ainda cria um loop novo) ou apaga a célula. Beco é onde a caçada morre: o
fugitivo entra, descobre que não tem para onde ir, e vira tiro fácil.

Cada bloco sorteia o que vai ser: sala fechada com portas, sala com um canto
recortado, ou **pátio** — um bloco escancarado, sem paredes, que muda
completamente como aquele pedaço se joga. Alguns trechos de corredor nascem
com o dobro da largura, criando avenidas de visão longa.

Dentro das salas há dois patamares de cobertura, e os dois têm corpo: o
**pilar** tampa passagem e visão; o **caixote** para o corpo mas não o olho —
é atrás dele que você se agacha e continua enxergando. Nenhum dos dois nasce
perto de porta ou em passagem estreita, para não virar rolha.

Cada sala tem cor e luz próprias (paleta Endesga 32, a mesma dos modelos), o
que serve de ponto de referência: em 30 segundos dá para decorar "a sala
vermelha", nunca "a terceira à esquerda". Corredores ficam em penumbra e salas
acesas — é onde o fugitivo some e onde o caçador precisa chegar perto.

O mapa é refeito a cada rodada.

## O duelo

Um tiro mata, mas o caçador não é uma sentença. A mira dele **vai assentando**
enquanto mantém você à vista: o primeiro disparo de cada contato sai bem torto,
e só depois de uns dois segundos de linha de visão limpa ele fica preciso.
Perdeu você de vista, esfria e recomeça torto.

Na prática isso dá em média **oito disparos e uns cinco segundos** entre o
primeiro tiro e o abate, contra um alvo que reage. O primeiro tiro é o aviso —
é para ele que você corre, quebra a linha de visão e some. Ficar parado à vista
dele é que mata.

Correr atrapalha a mira dele e a sua. Atirar em quem está correndo é bem mais
difícil do que em quem está parado.

## Som

Nada é revelado no mapa; o que entrega alguém é o barulho. Correr, abrir porta
e atirar têm raios de audição diferentes. Quando algo soa perto de você, um
marcador aponta a direção — nunca a posição exata.

## Modelos

`public/models/` — personagem e armas voxel de **Raphael Gonçalves**
(@rgs_dev), domínio público. O personagem traz 13 animações e ossos de mão,
usadas direto do FBX. As texturas são paletas de 256×1 e precisam de filtro
`Nearest`; qualquer interpolação mistura cores que não existem no modelo.

Para inspecionar os modelos e testar animações: abra `/preview.html` com o
servidor rodando.

## Desenvolvimento

```bash
npm run dev            # servidor de desenvolvimento
npm test               # mapa, navegação, portas e rodadas (sem navegador)
npm run test:portas    # nenhuma folha desce sobre quem está no vão
npm run test:regras    # papéis, placar e desfecho, inclusive 2000 partidas ao acaso
npm run test:colisao   # ninguém termina dentro de parede, nem com a porta descendo
npm run test:morte     # o corpo cai de verdade quando abatido
npm run test:mira      # mira de ferro e visada pelos cantos
npm run test:fuga      # o bot foge mesmo ao bater o olho no caçador
npm run test:intro     # a abertura roda uma vez, pede os dois áudios e sai
npm run test:ui        # fotografa menu e HUD para conferência
npm run test:ia        # mede a taxa de captura do caçador em 30s simulados
npm run test:partida   # joga uma partida inteira num navegador headless
npm run fotos          # capturas do jogo em tools/
npm run build          # build de produção
```

Atalhos de URL: `?fast` encurta as fases para 8 s, `?seed=123` fixa o mapa.

Os testes que precisam de navegador sobem o Vite como processo Node direto
(`tools/_servidor.mjs`), nunca via shell, e **nunca com `--open`**. Os dois
detalhes têm motivo: no Windows, subir por shell encadeia cmd → npx → node e o
`kill` encerra só o cmd, deixando o servidor pendurado; e um servidor
pendurado com `open` ligado abre abas do jogo no navegador de quem estiver
usando a máquina — uma delas chega a capturar o ponteiro do mouse.

## Publicar na web (itch.io)

```bash
npm run itch          # build + bullet-door-web.zip, pronto para subir
npm run test:itch     # confere o build servido de uma subpasta, dentro de iframe
```

O pacote sai com **cerca de 0,4 MB**. No itch.io: projeto do tipo **HTML**,
subir o zip, marcar *"This file will be played in the browser"*, viewport
**1280×720** com o botão de tela cheia ligado, e *mobile friendly* desmarcado —
o jogo é de mouse e teclado.

Dois detalhes que fazem o jogo funcionar lá e que é fácil quebrar sem perceber:

- **Caminhos relativos.** O portal serve o jogo de uma subpasta funda, então
  tudo é resolvido a partir do `index.html` (`base: './'` no Vite e o helper
  `asset()` para os arquivos de `public/`). Com caminho absoluto o navegador
  procuraria `/models` na raiz do domínio e a tela abriria preta.
- **O clique de entrada.** Navegador nenhum toca áudio antes de uma interação,
  e a abertura depende de dois sons entrando na hora certa.

`npm run test:itch` sobe o build numa subpasta dentro de um iframe com o mesmo
sandbox do portal e confere que os modelos chegam, a partida começa e a cena é
desenhada — é o ensaio da publicação.

## Como está montado

```
src/
  core/     config, paleta, áudio, entrada, rodadas e o laço principal
  world/    geração do mapa, geometria do cenário e as portas
  entities/ carregamento dos modelos, jogador, bot e o ator animado
  ai/       A* e linha de visão, cientes das portas
  ui/       HUD e estilo
```

O cenário inteiro sai em cerca de 16 draw calls: tudo que se repete é
`InstancedMesh` e a iluminação vem pré-calculada nas cores das instâncias, sem
nenhuma sombra dinâmica. O áudio é sintetizado em tempo real — não há um único
arquivo de som para baixar.
