const $ = id => document.getElementById(id);

/** Toda a interface é DOM: mais leve e mais nítida que desenhar em canvas. */
export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), timer: $('timer'), role: $('role'), objective: $('objective'),
      phasebar: $('phasebar').firstElementChild,
      scoreYou: $('scoreYou'), scoreBot: $('scoreBot'), roundLabel: $('roundLabel'),
      prompt: $('prompt'), weapon: $('weapon'), cooldown: $('cooldown'),
      stamina: $('stamina'), staminaBar: $('stamina').firstElementChild,
      killfeed: $('killfeed'), flash: $('flash'), noisering: $('noisering'),
      bigmsg: $('bigmsg'), crosshair: $('crosshair'),
    };
    this.el.bigSub = this.el.bigmsg.querySelector('.bm-sub');
    this.el.bigMain = this.el.bigmsg.querySelector('.bm-main');

    // Setas de direção do oponente. São desenhadas em SVG para terem ponta de
    // verdade e contorno grosso — barra retangular não comunica direção.
    this.blips = [];
    const NS = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 6; i++) {
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

  setTimer(sec) {
    const s = Math.max(0, Math.ceil(sec));
    this.el.timer.textContent = `00:${String(s).padStart(2, '0')}`;
    this.el.timer.classList.toggle('urgent', s <= 5);
  }

  setPhase(frac) {
    this.el.phasebar.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  setRole(role, objective) {
    this.el.role.textContent = role === 'hunter' ? 'CAÇADOR' : 'FUGITIVO';
    this.el.objective.textContent = objective;
    this.el.weapon.classList.toggle('hidden', role !== 'hunter');
  }

  setScore(you, bot, roundNum) {
    this.el.scoreYou.textContent = you;
    this.el.scoreBot.textContent = bot;
    this.el.roundLabel.textContent = `RODADA ${roundNum}`;
  }

  big(sub, main, cls = '') {
    this.el.bigSub.textContent = sub;
    this.el.bigMain.textContent = main;
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
