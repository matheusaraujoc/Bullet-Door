# Bullet Door

Jogo de caça e fuga em mapas procedurais pequenos. Dois papéis, um tiro mata.
Você caça por 30 segundos, depois foge por 30. Melhor de três.

**Para jogar: clique duas vezes em `JOGAR.bat`.** Ele instala o que falta na
primeira vez e abre o navegador sozinho.

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
| `E` | abrir/fechar porta, virar passagem |
| clique | atirar (munição infinita, 0,7 s entre tiros) |
| `ESC` | pausar |

## As portas

São comportas que **correm na vertical**, do chão ao teto. Correr na vertical
resolve de raiz o problema de uma porta girando: ela não tem para que lado
abrir, então nunca varre por cima de ninguém — e o vão não tem fresta em cima.
Nenhuma folha desce sobre quem está embaixo: o acionamento simplesmente recusa.

Existem em dois tipos:

- **Porta de sala** — sobe e desce. Fechada, corta passagem e visão.
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
npm run test:portas    # nenhuma folha pode descer sobre quem está no vão
npm run test:fuga      # o bot foge mesmo ao bater o olho no caçador
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
