import { EDG } from './palette.js';

// Ajuste fino do jogo em um lugar só.
export const CFG = {
  // --- mundo ---
  CELL: 3.2,            // metros por célula
  WALL_H: 3.6,

  // --- rodada ---
  PHASE_TIME: 30,       // segundos caçando / fugindo
  ROUNDS_TO_WIN: 2,     // melhor de 3
  INTRO_TIME: 3,
  SWAP_TIME: 2.2,       // pausa curta da troca de papéis

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
