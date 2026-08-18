/**
 * Todo o som é sintetizado na hora: nenhum arquivo de áudio para baixar.
 * Posicionamento é feito à mão (pan + atenuação) — mais barato que PannerNode
 * e suficiente para o que o jogo precisa: "veio da esquerda, longe".
 */
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    // buffer de ruído reaproveitado por todos os sons
    const n = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  _chain(gainValue, pan) {
    const g = this.ctx.createGain();
    g.gain.value = gainValue;
    if (pan !== undefined && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); p.connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  _noiseBurst(dest, dur, freq, q, type = 'bandpass') {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const env = this.ctx.createGain();
    const t = this.ctx.currentTime;
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(env); env.connect(dest);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _tone(dest, freq, dur, type = 'sine', slideTo = null) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const env = this.ctx.createGain();
    const t = this.ctx.currentTime;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(env); env.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /**
   * @param {string} kind shot|door|step|run|hit|tick|swap|win|lose|click
   * @param {{vol?:number, pan?:number}} opt
   */
  play(kind, opt = {}) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const vol = opt.vol ?? 1, pan = opt.pan;
    if (vol <= 0.005) return;

    switch (kind) {
      case 'shot': {
        const g = this._chain(0.9 * vol, pan);
        this._noiseBurst(g, 0.14, 1600, 0.7, 'lowpass');
        this._tone(g, 160, 0.1, 'square', 40);
        break;
      }
      case 'door': {
        const g = this._chain(0.5 * vol, pan);
        this._noiseBurst(g, 0.3, 420, 3);
        this._tone(g, 90, 0.16, 'triangle', 55);
        break;
      }
      case 'step': {
        const g = this._chain(0.28 * vol, pan);
        this._noiseBurst(g, 0.07, 260, 1.4);
        break;
      }
      case 'run': {
        const g = this._chain(0.42 * vol, pan);
        this._noiseBurst(g, 0.09, 340, 1.2);
        break;
      }
      case 'hit': {
        const g = this._chain(0.9 * vol, pan);
        this._noiseBurst(g, 0.5, 700, 0.6, 'lowpass');
        this._tone(g, 300, 0.4, 'sawtooth', 60);
        break;
      }
      case 'tick': { const g = this._chain(0.5 * vol); this._tone(g, 880, 0.07, 'square'); break; }
      case 'swap': {
        const g = this._chain(0.6 * vol);
        this._tone(g, 320, 0.5, 'sawtooth', 760);
        break;
      }
      case 'win': {
        const g = this._chain(0.5 * vol);
        [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(g, f, 0.22, 'triangle'), i * 95));
        break;
      }
      case 'lose': {
        const g = this._chain(0.5 * vol);
        [392, 330, 262].forEach((f, i) => setTimeout(() => this._tone(g, f, 0.34, 'triangle'), i * 150));
        break;
      }
      case 'bump': {
        const g = this._chain(0.55 * vol, pan);
        this._noiseBurst(g, 0.12, 900, 1.1);
        break;
      }
      case 'click': { const g = this._chain(0.3 * vol); this._tone(g, 1200, 0.04, 'square'); break; }
    }
  }

  /** Toca um som do mundo, atenuado e panorâmico em relação ao ouvinte. */
  playAt(kind, pos, listenerPos, listenerYaw, maxDist = 30, gain = 1) {
    const dx = pos.x - listenerPos.x, dz = pos.z - listenerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > maxDist) return;
    const vol = gain * (1 - dist / maxDist) ** 1.7;
    // ângulo relativo ao olhar: -1 = esquerda, +1 = direita
    const ang = Math.atan2(dx, dz) - listenerYaw;
    this.play(kind, { vol, pan: Math.sin(ang) * 0.85 });
  }
}
