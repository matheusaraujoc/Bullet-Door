### Loop principal

**Partida → 2 jogadores → mapa pequeno → 1 tiro mata → troca de papel → melhor de 3.**

Cada rodada teria algo como **30–90 segundos**.

Existem dois estados:

* **CAÇADOR**

  * Tem arma.
  * Deve localizar e matar o fugitivo.
  * Munição infinita.
  * Um tiro = morte.
* **FUGITIVO**

  * Não tem arma.
  * Pode correr.
  * Abrir portas.
  * Fechar portas.
  * Se esconder.
  * Tentar despistar o caçador.

Depois de determinado tempo, **os papéis trocam**.

Exemplo:

```text
RODADA 1

[ 10 segundos ]

Você → CAÇADOR
Bot → FUGITIVO

        ↓

CAÇADOR encontra e mata
        OU
tempo acaba

        ↓

TROCA

Você → FUGITIVO
Bot → CAÇADOR
```

### O detalhe que eu acho mais interessante

Eu **não faria a troca simplesmente a cada X segundos**.

Faria um sistema de **"contador de caça"**.

Por exemplo:

**60 segundos totais**

```text
00:00 ─────────────── 00:30 ─────────────── 01:00
        VOCÊ CAÇA                BOT CAÇA
```

Isso cria uma situação muito boa:

> “Tenho 30 segundos para encontrar ele antes que ele vire o caçador.”

E depois:

> “Agora eu tenho que sobreviver 30 segundos.”

Isso deixa cada rodada com dois momentos completamente diferentes.

---

## O mapa

Aqui está provavelmente o ponto mais importante do projeto.

Não faça mapas grandes.

Faça **pequenos labirintos procedurais**, talvez algo entre:

**20 × 20 até 40 × 40 células.**

Com:

* corredores;
* salas;
* portas;
* paredes;
* becos;
* pequenas áreas abertas;
* portas que podem ser abertas/fechadas;
* alguns obstáculos.

![Image](https://images.openai.com/static-rsc-4/fBBqDhyKRxp_d08vH4VBA-q1ZL_gR-C56H9FXCx-kLxERcBJRGIt22eXeRtVTP0LiBabKF1GMVLuv1dykhfqatcbrd67OwxhH-lMf-2IJ05t7JMQsKBH2Wn5RchZ8_H8RL9-TjF77linlfzbEl6_-KN0PvP4pddCGkBzxUoyCnyAgWBYvhkjL1iqVyvt_MFc?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/cUykmhHn-hnvJqSvg0kIa5qtW6HgBNHyeuIL6v4rwYgtUK3BZU_kiexmKi362vBzY5PPHki9ajLD0J9WEUxux01_j2FxmY6z4Inj0p4AI_VgGsgczFykO7F02njlgi8TkshF66Nx0zhkfm9GX6MLUqXQM-gdd_K-iTUsNV1r9hX4ltoUtYIlbD2OdnkBwiOd?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/QJ8gIDTdxOh0atxJIwCsTkQz88aRX9k9uo2uXwlhDQVgatRZSyTePsuOUZ5tG968PrinVhv2qTpKVJJL-j7HoCfYYmjs3mA_HpEI-KojiMzAnQO21_QyWpm1hRsWnEwrIqcmBAiNloyofC2pw0BONgsYi3x2tRG1OaxbeHfigjTL6XBeGIWWUI2e2J86c_Yp?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/DiT8WWgNSROzaGpCPTyvrmh3vGdxT3lx6cKBkpVHc904hSrRoH40CauaNYTibGkG52jySIjpnz0ZIbHj-G6MqjMAHV-raGv7gPo4_vWA80RSEXgKeoe750SJzrFVPQ08FZwHzv2APgIv_GmFTAQfn_Q8BsApgEzqyPSHvaj5uEY5hKtBWg-Caug7Q15MG01q?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/sKzB83sXsGqIH7dil2_sAd__9yxAVW101J2CBTnV0Y8l0QeiAjHmj0pj0XW5BKoPdzDjNXyd8H2AKtQJzi73-fj36D2jhK8fOiB_XVSTSWUJttSUILM3jrBQeXMmS1GYKrTnxb2DVPJES3PABOVhEdDZT7YrA0eYidOlvJS02RSAjuS6VeHBltli0U-CvMTO?purpose=fullsize)

![Image](https://images.openai.com/static-rsc-4/3WAfRfh-4oXBitvGtGf4cbVleDDQ8fdlbJ7zoJxALBqdDCtVarv6M5AhLAEIB-iMuFtJ75gp5Yi_wvALFcR31OK-VCyY-YBXAFQY3TiRX351EbpmadGJDlC2hzypdDkzVktD7_KeS9jV_t1h4WuRJL4BDLhkqMzw-sB8ep4vJJHr6JKDWi_iX8-l2owMA4og?purpose=fullsize)

A graça é que o jogador precisa **aprender o mapa rapidamente**.

Não precisa existir uma cidade inteira.

Um pequeno prédio, fábrica, hospital, depósito, estação, bunker etc. já funciona.

---

# As portas são fundamentais

Eu faria as portas serem **parte da estratégia**, não apenas decoração.

O fugitivo pode:

**Abrir → passar → fechar.**

O caçador vê uma porta fechada e pensa:

> “Ele passou por aqui?”

Mas pode ser que não.

Isso cria pequenas decisões psicológicas.

Por exemplo:

```text
          ┌─────────┐
          │         │
          │   SALA  │
          │         │
          └────┬────┘
               │
             PORTA
               │
       ┌───────┴───────┐
       │               │
       │   CORREDOR    │
       │               │
       └───────────────┘
```

O fugitivo entra na sala e fecha a porta.

O caçador chega.

**Ele entra?**

Talvez o fugitivo esteja escondido.

Talvez tenha saído por outra porta.

Talvez esteja esperando o caçador passar.

É aí que começa a surgir a diversão.

---

# O bot não precisa ser extremamente inteligente

Isso é ótimo para você.

Você não precisa criar uma IA absurda.

O bot fugitivo pode trabalhar com **estados**:

```text
FUGITIVO

    ↓
Escolher destino
    ↓
Correr até destino
    ↓
Detectou caçador?
    ├── NÃO → continuar
    └── SIM
          ↓
      fugir
          ↓
      procurar rota
          ↓
      fechar porta
          ↓
      esconder
```

E o bot caçador:

```text
CAÇADOR

    ↓
Recebe última posição conhecida
    ↓
Investiga
    ↓
Procura portas abertas
    ↓
Procura sons
    ↓
Encontra jogador
    ↓
PERSEGUE
```

Isso já seria suficiente para uma primeira versão.

---

# Mas eu adicionaria uma mecânica simples: SOM

Isso pode transformar completamente o jogo.

O fugitivo não precisa aparecer no mapa.

Mas determinadas ações geram ruído:

| Ação            | Ruído      |
| --------------- | ---------- |
| Caminhar        | baixo      |
| Correr          | alto       |
| Abrir porta     | médio      |
| Fechar porta    | médio      |
| Bater em objeto | alto       |
| Disparo         | muito alto |

Então o caçador pode receber algo como:

```text
           🔊
      "Ruído detectado"
       18 metros →
```

Não precisa revelar exatamente onde o fugitivo está.

Só dar uma **pista direcional**.

Isso cria uma mecânica muito simples, mas bastante interessante.

---

# E o tiro

Eu manteria extremamente simples.

**Um tiro = morte.**

Sem:

* vida;
* armadura;
* headshot;
* dano;
* recarga;
* tipos de munição.

A arma poderia ter **munição infinita**, mas eu colocaria talvez uma pequena limitação:

**tempo entre disparos.**

Por exemplo:

```text
DISPARO
  ↓
0.7s
  ↓
pode disparar novamente
```

Isso impede o jogador de simplesmente ficar segurando o botão e transforma o tiro em uma decisão.

---

# Melhor de 3

Eu faria assim:

### Partida

**Rodada 1**

Você começa caçador.

Bot começa fugitivo.

↓

Troca de papéis.

↓

Fim da rodada.

---

**Rodada 2**

Bot começa caçador.

Você começa fugitivo.

↓

Troca.

↓

Fim.

---

**Rodada 3**

Se necessário, uma rodada final.

E aí você pode ter um placar:

```text
          CAÇADOR

      VOCÊ      BOT

        1   —   1

       RODADA 3
```

---

# Uma coisa que eu mudaria

Em vez de simplesmente:

> "o contador muda e troca os jogadores"

eu faria o contador ser **visível e extremamente importante**.

Algo como:

```text
              00:07

             CAÇADOR

        VOCÊ ESTÁ CAÇANDO
```

Quando chega a zero:

```text
               3
               2
               1

              TROCA!
```

E imediatamente:

```text
              00:30

             FUGITIVO

        SOBREVIVA
```

Isso dá uma sensação muito boa de ritmo.

---

# Estrutura técnica

Para o jogo web que você vem pensando, eu faria:

**Three.js**

```text
Game
│
├── ProceduralMap
│   ├── Rooms
│   ├── Corridors
│   ├── Walls
│   └── Doors
│
├── Player
│   ├── Movement
│   ├── Camera
│   ├── Weapon
│   └── Interaction
│
├── Bot
│   ├── Navigation
│   ├── Perception
│   ├── Hearing
│   └── StateMachine
│
├── RoundManager
│   ├── Timer
│   ├── RoleSwap
│   └── Score
│
└── ProceduralGenerator
    ├── Seed
    ├── Rooms
    └── Connections
```

E **não colocaria multiplayer inicialmente**.

Primeiro:

**Jogador vs Bot.**

Quando estiver divertido, aí você pode transformar o mesmo sistema em:

**Jogador vs Jogador online.**

Isso seria particularmente interessante porque o jogo já possui uma estrutura naturalmente adequada para multiplayer.

---

# O conceito resumido

Eu definiria o jogo como:

> **Um jogo de caça e fuga em mapas procedurais pequenos, onde dois jogadores alternam entre caçador e fugitivo. O caçador possui uma arma de morte instantânea, enquanto o fugitivo utiliza portas, corredores e esconderijos para despistar o adversário. Após um curto período, os papéis são invertidos. A partida termina em melhor de três.**