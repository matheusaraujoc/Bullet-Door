import { t } from './i18n.js';

const $ = id => document.getElementById(id);

/** Toda a interface é DOM: mais leve e mais nítida que desenhar em canvas. */
export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), timer: $('timer'), role: $('role'), objective: $('objective'),
      phasebar: $('phasebar').firstElementChild,
      scoreYou: $('scoreYou'), scoreBot: $('scoreBot'), roundLabel: $('roundLabel'),
      pendYou: $('pendYou'), pendBot: $('pendBot'),
      prompt: $('prompt'), weapon: $('weapon'), cooldown: $('cooldown'),
      stamina: $('stamina'), staminaBar: $('stamina').firstElementChild,
      killfeed: $('killfeed'), flash: $('flash'), noisering: $('noisering'),
      dicaMouse: $('dicaMouse'),
      bigmsg: $('bigmsg'), crosshair: $('crosshair'),
    };
    this.el.bigSub = this.el.bigmsg.querySelector('.bm-sub');
    this.el.bigMain = this.el.bigmsg.querySelector('.bm-main');
    this.el.bigExplica = this.el.bigmsg.querySelector('.bm-explica');

    /*
     * Seta de direção do oponente. É desenhada em SVG para ter ponta de
     * verdade e contorno grosso — barra retangular não comunica direção.
     *
     * Uma seta só, não um bando delas: era um POOL de 6, e um passo puxa
     * ruído a cada fração de segundo (ver NOISE_INTERVAL) — cada passo
     * pegava um slot livre novo em vez de atualizar o que já apontava para a
     * mesma origem, e a tela enchia de setas quase sobrepostas apontando
     * para o mesmo lugar. Um slot só faz a seta sempre saltar para o ruído
     * mais recente, que é a única direção que importa num dado instante.
     */
    this.blips = [];
    const NS = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 1; i++) {
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 32 34');
      svg.setAttribute('class', 'blip');
      const seta = document.createElementNS(NS, 'polygon');
      seta.setAttribute('points', '16,1 31,31 16,23 1,31');   // ponta com base recortada
      svg.appendChild(seta);
      this.el.noisering.appendChild(svg);
      this.blips.push({ el: svg, life: 0, pos: null, strength: 0, maxLife: 1 });
    }
    this.flashAmount = 0;
    this.lastTick = -1;
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  /** Mostra por alguns segundos como devolver o mouse ao sistema. */
  lembrarMouse() {
    const el = this.el.dicaMouse;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;                 // reinicia a animação
    el.style.animation = '';
    clearTimeout(this._dicaTimer);
    this._dicaTimer = setTimeout(() => el.classList.add('hidden'), 6200);
  }

  setTimer(sec) {
    const s = Math.max(0, Math.ceil(sec));
    this.el.timer.textContent = `00:${String(s).padStart(2, '0')}`;
    this.el.timer.classList.toggle('urgent', s <= 5);
  }

  setPhase(frac) {
    this.el.phasebar.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  setRole(role, objective) {
    this.el.role.textContent = t(role === 'hunter' ? 'hud.cacador' : 'hud.fugitivo');
    this.el.objective.textContent = objective;
    this.el.weapon.classList.toggle('hidden', role !== 'hunter');
  }

  /**
   * O placar: eliminações de cada lado, e em que rodada a partida está.
   *
   * São os dois únicos números que decidem alguma coisa, então são os dois
   * únicos que aparecem. O rótulo embaixo diz o que eles são e quanto falta —
   * sem ele o jogador vê "1 — 0" e não sabe se aquilo é rodada, ponto ou vida.
   */
  /**
   * @param {number} you  eliminações suas, incluindo as da rodada em curso
   * @param {number} bot  idem, do inimigo
   * @param {number} roundNum
   * @param {number} [deQuantas]
   * @param {number} [pendSeu] quantas das suas foram NESTA rodada, ainda aberta
   * @param {number} [pendBot] idem
   */
  setScore(you, bot, roundNum, deQuantas = 3, pendSeu = 0, pendBot = 0) {
    /*
     * O número grande conta só rodada FECHADA; o que aconteceu na rodada em
     * curso aparece ao lado, como "+1".
     *
     * O placar somava a eliminação no instante do tiro, e aí ele passava a
     * dizer "2" embaixo de um rótulo que promete "2 levam a partida" — com a
     * rodada ainda aberta e podendo virar 2 a 2. O número estava certo sobre
     * eliminações e errado sobre o que ele parecia anunciar.
     *
     * Separar os dois resolve sem tirar a resposta imediata: o "+1" aparece no
     * mesmo instante do tiro, e o número que decide a partida só se mexe quando
     * a rodada de fato fecha.
     */
    this.el.scoreYou.textContent = you - pendSeu;
    this.el.scoreBot.textContent = bot - pendBot;
    this.el.pendYou.textContent = pendSeu > 0 ? `+${pendSeu}` : '';
    this.el.pendBot.textContent = pendBot > 0 ? `+${pendBot}` : '';
    // passado o melhor de 3, a partida só continua porque empatou: dizer
    // "RODADA 4 DE 3" seria mentira, e "DESEMPATE" já explica por que ainda
    // se está jogando
    this.el.roundLabel.textContent = roundNum > deQuantas
      ? t('hud.desempate', { n: roundNum })
      : t('hud.rodadaDe', { n: roundNum, total: deQuantas });
    // quem está na frente acende — pelo confirmado, não pelo que ainda pende
    const fSeu = you - pendSeu, fBot = bot - pendBot;
    this.el.scoreYou.classList.toggle('lidera', fSeu > fBot);
    this.el.scoreBot.classList.toggle('lidera', fBot > fSeu);
  }

  big(sub, main, explica = '', cls = '') {
    this.el.bigSub.textContent = sub;
    this.el.bigMain.textContent = main;
    this.el.bigExplica.textContent = explica;
    this.el.bigmsg.className = `${cls} pop`;
    // reinicia a animação
    void this.el.bigMain.offsetWidth;
    this.el.bigmsg.classList.add('pop');
  }
  hideBig() { this.el.bigmsg.className = 'hidden'; }

  feed(text) {
    const d = document.createElement('div');
    d.textContent = text;
    this.el.killfeed.appendChild(d);
    setTimeout(() => d.remove(), 2700);
  }

  prompt(text) {
    this.el.prompt.classList.toggle('hidden', !text);
    if (text) this.el.prompt.textContent = text;
  }

  setCooldown(frac) { this.el.cooldown.style.setProperty('--cd', frac.toFixed(3)); }

  setStamina(frac) {
    this.el.staminaBar.style.transform = `scaleX(${frac.toFixed(3)})`;
    this.el.stamina.classList.toggle('show', frac < 0.995);
    this.el.stamina.classList.toggle('low', frac < 0.25);
  }

  setCrosshairWide(v) { this.el.crosshair.classList.toggle('wide', v); }
  setDanger(v) { document.body.classList.toggle('danger', v); }
  hit() { this.flashAmount = 1; }

  /** Um barulho chegou: registra a direção para o anel de ruído. */
  addNoise(worldPos, strength) {
    // barulho forte marca por mais tempo: um tiro fica na tela, um passo não
    const dura = 1.2 + strength * 1.4;
    let slot = this.blips.find(b => b.life <= 0)
      || this.blips.reduce((a, b) => (a.life < b.life ? a : b));
    slot.pos = { x: worldPos.x, z: worldPos.z };
    slot.life = dura;
    slot.maxLife = dura;
    slot.strength = strength;
    slot.el.classList.remove('bater');
    void slot.el.getBoundingClientRect();     // reinicia a animação de entrada
    slot.el.classList.add('bater');
  }

  update(dt, playerPos, playerYaw) {
    const sin = Math.sin(playerYaw), cos = Math.cos(playerYaw);
    for (const b of this.blips) {
      if (b.life <= 0) { b.el.style.opacity = 0; continue; }
      b.life -= dt;
      const dx = b.pos.x - playerPos.x, dz = b.pos.z - playerPos.z;
      // frente da câmera é (-sin, -cos); direita é (cos, -sin)
      const fwd = dx * -sin + dz * -cos;
      const right = dx * cos + dz * -sin;
      const ang = Math.atan2(right, fwd);
      const dist = Math.hypot(dx, dz);
      // perto a seta chega mais para o centro e cresce: dá noção de distância
      const raio = 110 + Math.min(dist, 34) * 3.1;
      const tam = 0.75 + b.strength * 0.85;
      b.el.style.transform =
        `rotate(${ang}rad) translateY(${-raio}px) scale(${tam.toFixed(2)})`;
      b.el.style.opacity = Math.min(1, b.life / (b.maxLife * 0.55)) * (0.5 + b.strength * 0.5);
    }

    if (this.flashAmount > 0) {
      this.flashAmount = Math.max(0, this.flashAmount - dt * 2.4);
      this.el.flash.style.opacity = (this.flashAmount * 0.55).toFixed(3);
    }
  }
}
