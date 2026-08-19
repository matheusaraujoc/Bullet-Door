import { CFG } from './config.js';

/**
 * O placar da partida.
 *
 * Uma rodada tem duas metades: você caça 30s, depois foge 30s. Cada metade é
 * uma chance de eliminar, e **eliminar é o que vale ponto** — um ponto por
 * eliminação, nada mais. Duas eliminações levam a partida (melhor de 3).
 *
 * Já foi por tempo: ganhava a rodada quem tivesse eliminado mais rápido. Era
 * uma regra que só existia na cabeça de quem escreveu — no meio da fuga
 * ninguém consegue comparar dois cronômetros e concluir quem está na frente.
 * Contar eliminação é o que o jogador já faz sozinho enquanto joga.
 *
 * A consequência é que as duas metades passam a ter um objetivo direto e
 * simétrico: caçando você marca um ponto, fugindo você nega o ponto dele.
 * Empate não decide nada — 1 a 1 vai para a rodada seguinte.
 */
export class RoundManager {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.scoreYou = 0;          // eliminações suas na partida
    this.scoreBot = 0;          // eliminações do bot na partida
    this.round = 1;
    this.state = 'idle';
    this.timer = 0;
    this.phaseTime = 0;
    this.half = 0;              // 0 = primeira metade, 1 = segunda
    this.pontoSeu = 0;          // o que cada lado marcou NESTA rodada
    this.pontoBot = 0;
    this.historico = [];        // {seu, bot} de cada rodada fechada
    this.houveAbate = false;    // decide se a próxima metade recomeça posições
    this.lastTick = -1;
  }

  /**
   * Você caça a primeira metade, foge a segunda — em toda rodada.
   *
   * Já foi alternado por rodada (ímpar você começa, par o bot), e aquilo
   * quebrava a alternância justamente na virada: a rodada terminava com o bot
   * caçando e a seguinte começava com o bot caçando de novo. Quem jogava via o
   * adversário caçar duas vezes seguidas e perdia a conta de quem estava
   * ganhando o quê.
   *
   * Fixando a ordem, a partida inteira alterna sem falha — caça, foge, caça,
   * foge — e cada rodada dá exatamente uma chance de pontuar para cada lado,
   * que é o que torna a contagem justa.
   */
  get playerRoleThisHalf() {
    return this.half === 0 ? 'hunter' : 'runner';
  }

  startMatch() {
    this.reset();
    this.startRound();
  }

  startRound() {
    this.pontoSeu = 0;
    this.pontoBot = 0;
    this.houveAbate = false;
    this.half = 0;
    this.game.buildLevel();
    this._beginHalf(true);
  }

  /**
   * Começa uma metade.
   *
   * `recolocar` só é verdadeiro quando faz sentido pôr os dois em cantos
   * opostos do mapa: no começo da rodada, e depois de alguém cair. Se o tempo
   * apenas esgotou, a caçada NÃO recomeça — os papéis se invertem no lugar
   * onde cada um estava. Quem estava encurralando passa a ser encurralado, sem
   * corte. Teleportar os dois ali quebraria a única coisa que dá tensão à
   * virada: a distância entre vocês naquele instante.
   */
  _beginHalf(withIntro, recolocar = true) {
    const role = this.playerRoleThisHalf;
    if (recolocar) this.game.placeCombatants(role);
    else this.game.trocarPapeis(role);
    this.phaseTime = CFG.PHASE_TIME;
    this.timer = withIntro ? CFG.INTRO_TIME : CFG.SWAP_TIME;
    this.state = withIntro ? 'intro' : 'swap';
    this.lastTick = -1;
    this.game.onHalfPrepared(role, this.half, withIntro);
  }

  /**
   * A metade acabou. Se houve eliminação, o ponto é de quem estava caçando e
   * entra no placar na hora — esperar o fim da rodada para somar deixava o
   * jogador sem saber se aquilo que ele acabou de fazer valeu alguma coisa.
   *
   * Quando houve eliminação vale uma pausa curta para o jogador ver o que
   * aconteceu; quando o tempo simplesmente esgotou, a partida segue direto —
   * a troca é o ritmo natural, não um julgamento.
   */
  _endHalf(killed, elapsed) {
    const role = this.playerRoleThisHalf;
    this.houveAbate = killed;
    if (killed) {
      // quem caçava nesta metade marcou; o outro deixou de negar o ponto
      if (role === 'hunter') { this.pontoSeu++; this.scoreYou++; }
      else { this.pontoBot++; this.scoreBot++; }
    }

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
    if (this.half === 0) {
      this.half = 1;
      // sem abate, a partida continua exatamente de onde estava
      this._beginHalf(false, this.houveAbate === true);
    } else this._finishRound();
  }

  /**
   * Fecha a rodada. Não há "vencedor da rodada" para calcular: o placar já foi
   * somado eliminação por eliminação. Aqui é só o intervalo em que o jogador
   * lê como ficou.
   */
  _finishRound() {
    // guardado para o fim da partida poder contar a história rodada a rodada,
    // em vez de despejar só o número final
    this.historico.push({ seu: this.pontoSeu, bot: this.pontoBot });
    this.state = 'roundend';
    this.timer = 3.4;
    this.game.onRoundEnded(this.pontoSeu, this.pontoBot, this.scoreYou, this.scoreBot);
  }

  /**
   * A partida acabou?
   *
   * Três saídas, nesta ordem:
   *
   * 1. Alguém chegou a duas eliminações **e está na frente** — é o "melhor de
   *    3" acabando cedo, como em qualquer melhor de 3. A segunda condição não
   *    é detalhe: sem ela um 2 a 2 encerraria a partida em empate com as duas
   *    metades tendo dado certo para os dois lados, o que não decide nada.
   * 2. As três rodadas terminaram e alguém está na frente, mesmo com um placar
   *    magro como 1 a 0.
   * 3. O teto de rodadas, que existe só para o desempate não durar para sempre.
   *
   * Empate segue jogando. É o que responde ao caso de sempre: 1 a 1 depois de
   * duas rodadas vai para a terceira.
   */
  get decidida() {
    const lider = Math.max(this.scoreYou, this.scoreBot);
    return lider >= CFG.ELIM_PARA_VENCER && this.scoreYou !== this.scoreBot;
  }

  get empatada() { return this.scoreYou === this.scoreBot; }

  _afterRound() {
    const fim = this.decidida
      || (this.round >= CFG.RODADAS_PADRAO && !this.empatada)
      || this.round >= CFG.MAX_RODADAS;
    if (fim) {
      this.state = 'matchend';
      this.game.onMatchEnded(
        this.scoreYou > this.scoreBot ? 'you' : this.scoreBot > this.scoreYou ? 'bot' : 'draw');
    } else {
      this.round++;
      this.startRound();
    }
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
