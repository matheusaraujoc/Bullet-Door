import { CFG } from './config.js';

/**
 * A dificuldade progressiva: uma fórmula só, dois contadores diferentes.
 *
 * `onboarding` suaviza as primeiras partidas da VIDA do jogador (satura no
 * teto de sempre depois de `ONBOARDING_MAX` vitórias, não fica fácil pra
 * sempre). `escalada` sobe sem teto dentro da corrida ATUAL — é o que faz uma
 * sequência roguelike ficar difícil de verdade quanto mais ela dura. Somados,
 * o mesmo `fator` cobre os dois papéis (ver Roadmap de Progressão, item 02).
 *
 * Os números de PISO e de PASSO_ESCALADA são chute inicial pra começar a
 * jogar com isto — ajustam com playtest, não são ciência exata.
 */
const ONBOARDING_MAX = 4;
const PASSO_ESCALADA = 0.18;

export function calcularFator(vitoriasNaVida, vitoriasNestaCorrida) {
  const onboarding = Math.min(vitoriasNaVida, ONBOARDING_MAX) / ONBOARDING_MAX;
  const escalada = vitoriasNestaCorrida * PASSO_ESCALADA;
  return onboarding + escalada;
}

/*
 * O TETO é capturado uma vez, na primeira vez que este módulo é importado —
 * antes de qualquer partida ter mexido em CFG. É o comportamento do bot que
 * já existia antes desta curva, intocado: o topo de sempre, não um valor novo
 * pensado pra esta feature.
 */
const TETO = {
  view: CFG.BOT_VIEW, fov: CFG.BOT_FOV, reaction: CFG.BOT_REACTION,
  aimError: CFG.BOT_AIM_ERROR, speedRun: CFG.BOT_SPEED_RUN,
};
/*
 * `reaction` no piso original (0.9s) deixava o bot congelado quase um
 * segundo inteiro depois de já ter visto o jogador — "fácil" virou "quebrado":
 * de frente um pro outro e nada acontecia. Fácil precisa continuar sendo uma
 * ameaça de verdade, só que perdoável; 0.65s ainda dá bastante vantagem sobre
 * o 0.5s do teto sem parecer que a IA travou.
 */
const PISO = { view: 18, fov: 0.9, reaction: 0.65, aimError: 0.16, speedRun: 4.6 };
const SPAWN = { piso: 5, teto: 11 };

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Mexe direto em `CFG.BOT_*` — o resto do jogo (Bot.js) já lê esses campos a
 * cada quadro, então não precisa saber que a dificuldade progressiva existe.
 * Chamar uma vez por partida, antes de `placeCombatants`.
 *
 * Além do fator 1.0 (o teto de sempre) os números continuam subindo, com
 * limite — é o que dá o "cada vez mais difícil" de uma corrida roguelike sem
 * o bot virar impossível de escapar.
 */
export function aplicarDificuldade(fator) {
  const base = Math.min(Math.max(fator, 0), 1);
  const alem = Math.max(fator - 1, 0);

  CFG.BOT_VIEW = Math.min(lerp(PISO.view, TETO.view, base) + alem * 3, 34);
  CFG.BOT_FOV = Math.min(lerp(PISO.fov, TETO.fov, base) + alem * 0.1, 1.4);
  CFG.BOT_REACTION = Math.max(lerp(PISO.reaction, TETO.reaction, base) - alem * 0.06, 0.3);
  CFG.BOT_AIM_ERROR = Math.max(lerp(PISO.aimError, TETO.aimError, base) - alem * 0.012, 0.04);
  CFG.BOT_SPEED_RUN = Math.min(lerp(PISO.speedRun, TETO.speedRun, base) + alem * 0.2, 6.3);

  // a distância de spawn não passa do teto de hoje — mais que isso só faz o
  // caçador perder tempo andando, não é mais "difícil" de verdade
  const minDist = Math.round(lerp(SPAWN.piso, SPAWN.teto, base));
  return {
    spawnMinDist: minDist,
    spawnCandidato: Math.max(2, Math.round(minDist * 0.73)),
    spawnFallback: Math.max(2, Math.round(minDist * 0.64)),
    /*
     * Nas primeiras partidas o inimigo não só nasce perto — nasce À VISTA,
     * de propósito. "Perto, mas atrás de uma parede" ainda deixa o jogador
     * sem entender o que fazer nos primeiros segundos; ver o alvo na cara é
     * o que ensina "isto é uma caçada" mais rápido que qualquer texto. A
     * chance cai a zero no mesmo ritmo do resto da curva — deixa de ser
     * garantido assim que o `fator` alcança o teto.
     */
    chanceVisao: Math.max(0, 1 - fator),
  };
}
