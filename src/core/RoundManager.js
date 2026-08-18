import { CFG } from './config.js';

/**
 * Uma rodada tem duas metades: você caça 30s, depois foge 30s.
 * Quem eliminou mais rápido ganha a rodada.
 *
 * É essa regra que faz a segunda metade valer alguma coisa: se você matou em
 * 18s, agora precisa sobreviver 18s. O tempo da caçada vira a sua meta de fuga.
 */
export class RoundManager {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.scoreYou = 0;
    this.scoreBot = 0;
    this.round = 1;
    this.state = 'idle';
    this.timer = 0;
    this.phaseTime = 0;
    this.half = 0;              // 0 = primeira metade, 1 = segunda
    this.youTime = null;        // segundos que VOCÊ levou para eliminar
    this.botTime = null;        // segundos que o BOT levou para eliminar
    this.lastTick = -1;
  }

  /** Na rodada ímpar você caça primeiro; na par, o bot. */
  get youHuntFirst() { return this.round % 2 === 1; }
  get playerRoleThisHalf() {
    const youHunt = this.half === 0 ? this.youHuntFirst : !this.youHuntFirst;
    return youHunt ? 'hunter' : 'runner';
  }

  startMatch() {
    this.reset();
    this.startRound();
  }

  startRound() {
    this.youTime = null;
    this.botTime = null;
    this.half = 0;
    this.game.buildLevel();
    this._beginHalf(true);
  }

  _beginHalf(withIntro) {
    const role = this.playerRoleThisHalf;
    this.game.placeCombatants(role);
    this.phaseTime = CFG.PHASE_TIME;
    this.timer = withIntro ? CFG.INTRO_TIME : CFG.SWAP_TIME;
    this.state = withIntro ? 'intro' : 'swap';
    this.lastTick = -1;
    this.game.onHalfPrepared(role, this.half, withIntro);
  }

  /**
   * A metade acabou. Quando houve eliminação vale uma pausa curta para o
   * jogador ver o que aconteceu; quando o tempo simplesmente esgotou, a
   * partida segue direto — a troca é o ritmo natural, não um julgamento.
   */
  _endHalf(killed, elapsed) {
    const role = this.playerRoleThisHalf;
    if (role === 'hunter') this.youTime = killed ? elapsed : null;
    else this.botTime = killed ? elapsed : null;

    this.game.onHalfEnded(role, killed, elapsed);
    if (killed) {
      this.state = 'halfend';
      this.timer = 1.6;
    } else {
      this._advance();
    }
  }

  /** Vai para a próxima metade, ou fecha a rodada. */
  _advance() {
    if (this.half === 0) { this.half = 1; this._beginHalf(false); }
    else this._finishRound();
  }

  _finishRound() {
    const y = this.youTime, b = this.botTime;
    let winner;                        // 'you' | 'bot' | 'draw'
    if (y !== null && b !== null) winner = y < b ? 'you' : b < y ? 'bot' : 'draw';
    else if (y !== null) winner = 'you';
    else if (b !== null) winner = 'bot';
    else winner = 'draw';

    if (winner === 'you') this.scoreYou++;
    else if (winner === 'bot') this.scoreBot++;

    this.state = 'roundend';
    this.timer = 3.4;
    this.game.onRoundEnded(winner, y, b);
  }

  _afterRound() {
    const done = this.scoreYou >= CFG.ROUNDS_TO_WIN
      || this.scoreBot >= CFG.ROUNDS_TO_WIN
      || this.round >= 5;
    if (done) {
      this.state = 'matchend';
      this.game.onMatchEnded(
        this.scoreYou > this.scoreBot ? 'you' : this.scoreBot > this.scoreYou ? 'bot' : 'draw');
    } else {
      this.round++;
      this.startRound();
    }
  }

  /** Quanto tempo você precisa sobreviver nesta metade para vencer a rodada. */
  get survivalTarget() {
    if (this.playerRoleThisHalf !== 'runner') return null;
    return this.youTime;   // null = precisa aguentar até o fim
  }

  update(dt) {
    const g = this.game;
    switch (this.state) {
      case 'intro':
      case 'swap': {
        this.timer -= dt;
        const n = Math.ceil(this.timer);
        if (n !== this.lastTick && n > 0) { this.lastTick = n; g.audio.play('tick'); }
        if (this.timer <= 0) {
          this.state = 'playing';
          this.phaseTime = CFG.PHASE_TIME;
          g.onHalfStarted(this.playerRoleThisHalf, this.half);
        }
        break;
      }

      case 'playing': {
        this.phaseTime -= dt;
        if (this.phaseTime <= 0) this._endHalf(false, CFG.PHASE_TIME);
        break;
      }

      case 'halfend': {
        this.timer -= dt;
        if (this.timer <= 0) this._advance();
        break;
      }

      case 'roundend': {
        this.timer -= dt;
        if (this.timer <= 0) this._afterRound();
        break;
      }
    }
  }

  /** Alguém foi eliminado durante a metade em andamento. */
  registerKill() {
    if (this.state !== 'playing') return;
    this._endHalf(true, CFG.PHASE_TIME - this.phaseTime);
  }
}
