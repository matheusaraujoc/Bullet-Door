import { EDG } from './palette.js';

// Ajuste fino do jogo em um lugar só.
export const CFG = {
  // --- mundo ---
  CELL: 3.2,            // metros por célula
  WALL_H: 3.6,

  // --- rodada ---
  PHASE_TIME: 30,       // segundos caçando / fugindo
  // O ponto é a eliminação, não o tempo dela. Melhor de 3: duas eliminações
  // levam na hora, e três rodadas fecham a conta. Só empate estica a partida,
  // e o teto é o que impede o desempate de nunca terminar.
  ELIM_PARA_VENCER: 2,
  RODADAS_PADRAO: 3,
  MAX_RODADAS: 5,
  // Tempo generoso de propósito: a explicação de "você caça/foge" é uma frase
  // inteira agora, não só um título. Quem já sabe a regra pula com um clique
  // ou qualquer tecla (ver _bindMenus em Game.js) — ninguém fica preso
  // esperando, mas quem ainda está aprendendo tem tempo de ler antes de o
  // jogo empurrar para o próximo passo sozinho.
  INTRO_TIME: 6,
  SWAP_TIME: 6,

  // --- jogador ---
  EYE_H: 1.62,
  CROUCH_H: 1.05,
  RADIUS: 0.34,
  SPEED_WALK: 3.6,
  SPEED_RUN: 6.4,
  SPEED_CROUCH: 1.8,
  ACCEL: 15,
  FRICTION: 11,
  STAMINA_MAX: 4.5,
  STAMINA_REGEN: 1.2,
  MOUSE_SENS: 0.0022,

  // --- arma (munição infinita, o limite é a cadência) ---
  FIRE_COOLDOWN: 0.7,
  RANGE: 70,
  FOV: 80,
  FOV_ADS: 52,          // mira de ferro: fecha o ângulo e aproxima
  ADS_SENS: 0.5,        // e o mouse fica mais manso, para mirar de longe
  ADS_SPEED: 0.55,      // mirando, o passo encurta

  // --- visada pelos cantos ---
  LEAN_DIST: 0.62,      // quanto a cabeça sai para o lado, em metros
  LEAN_ROLL: 0.2,       // inclinação da imagem, em radianos

  // --- ruído: raio em metros em que o som é percebido ---
  NOISE: {
    walk: 7,
    run: 17,
    crouch: 0,
    door: 14,
    shot: 200,
    bump: 15,
  },
  NOISE_INTERVAL: 0.42,

  // --- bot ---
  BOT_FOV: 1.15,
  BOT_VIEW: 26,
  BOT_REACTION: 0.5,
  BOT_AIM_ERROR: 0.075,
  BOT_SPEED_WALK: 3.3,
  BOT_SPEED_RUN: 5.7,
  BOT_REPATH: 0.5,

  // --- render ---
  FOG_NEAR: 10,
  FOG_FAR: 62,
};

// O cenário todo sai da mesma paleta dos modelos voxel.
export const PAL = {
  fog:   EDG.ink,
  ceu:   EDG.black,
  hunter: EDG.red,
  runner: EDG.cyan,
};
