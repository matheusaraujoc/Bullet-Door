import { asset } from './assets-url.js';

/** Onde a preferência de cada trilha fica guardada entre sessões. */
const CHAVE_SOM = 'bulletdoor.som';
const CHAVE_MUSICA = 'bulletdoor.musica';

const lerPreferencia = (chave, padrao) => {
  try {
    const v = localStorage.getItem(chave);
    return v === null ? padrao : v === '1';
  } catch { return padrao; }        // navegação privada pode barrar o storage
};
const gravarPreferencia = (chave, v) => {
  try { localStorage.setItem(chave, v ? '1' : '0'); } catch { /* sem storage */ }
};

/**
 * Som do jogo.
 *
 * Os efeitos são todos sintetizados na hora — osciladores e um buffer de ruído,
 * nenhum arquivo para baixar. Isso é o que faz o tiro soar igual em qualquer
 * aparelho: não há som do sistema envolvido, e o navegador não escolhe nada. A
 * única coisa que muda de um aparelho para outro é o alto-falante.
 *
 * Posicionamento é feito à mão (pan + atenuação) — mais barato que PannerNode e
 * suficiente para o que o jogo precisa: "veio da esquerda, longe".
 *
 * A música é a exceção: é arquivo, e por isso toca por um `<audio>` que
 * transmite aos poucos em vez de decodificar meio mega na memória. As duas
 * trilhas se desligam separadamente, porque são incômodos diferentes — quem
 * está ouvindo outra coisa quer só a música fora, e quem está num lugar
 * silencioso quer tudo fora.
 */
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.somLigado = lerPreferencia(CHAVE_SOM, true);
    this.musicaLigada = lerPreferencia(CHAVE_MUSICA, true);
    this.musica = null;
    this.musicaUrl = null;
    this.aoMudar = null;          // avisa a interface para redesenhar os botões
  }

  // ------------------------------------------------------------ liga/desliga
  ligarSom(v) {
    this.somLigado = !!v;
    gravarPreferencia(CHAVE_SOM, this.somLigado);
    this.aoMudar?.();
  }

  ligarMusica(v) {
    this.musicaLigada = !!v;
    gravarPreferencia(CHAVE_MUSICA, this.musicaLigada);
    if (this.musicaLigada) this._retomarMusica(); else this._pausarMusica();
    this.aoMudar?.();
  }

  alternarSom() { this.ligarSom(!this.somLigado); }
  alternarMusica() { this.ligarMusica(!this.musicaLigada); }

  // ---------------------------------------------------------------- música
  /**
   * Começa (ou troca) a música de fundo.
   *
   * O `<audio>` é criado na primeira chamada e reaproveitado: recriar o
   * elemento a cada ida ao menu recomeçaria o download toda vez.
   */
  tocarMusica(arquivo) {
    const url = asset(arquivo);
    if (!this.musica) {
      const el = document.createElement('audio');
      el.loop = true;
      el.preload = 'none';        // o menu aparece primeiro; a música chega depois
      el.volume = 0;
      this.musica = el;
    }
    if (this.musicaUrl !== url) {
      this.musica.src = url;
      this.musicaUrl = url;
    }
    if (this.musicaLigada) this._retomarMusica();
  }

  pararMusica() {
    if (!this.musica) return;
    this._esmaecer(0, 0.5, () => { this.musica.pause(); this.musica.currentTime = 0; });
  }

  _retomarMusica() {
    if (!this.musica || !this.musicaUrl) return;
    // pode ser recusado até o primeiro toque na página; não é erro que valha ruído
    this.musica.play().then(() => this._esmaecer(this.volumeMusica, 1.2), () => {});
  }

  _pausarMusica() {
    if (!this.musica) return;
    this._esmaecer(0, 0.35, () => this.musica.pause());
  }

  get volumeMusica() { return 0.42; }

  /** Sobe ou desce o volume aos poucos: corte seco em música soa como falha. */
  _esmaecer(alvo, segundos, aoFim) {
    const el = this.musica;
    if (!el) return;
    clearInterval(this._fade);
    const passo = 1 / 30;
    const delta = (alvo - el.volume) / Math.max(1, segundos / passo);
    this._fade = setInterval(() => {
      const v = el.volume + delta;
      const chegou = delta >= 0 ? v >= alvo : v <= alvo;
      el.volume = Math.max(0, Math.min(1, chegou ? alvo : v));
      if (chegou) { clearInterval(this._fade); aoFim?.(); }
    }, passo * 1000);
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
    if (!this.enabled || !this.somLigado) return;
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

      /*
       * Fim de partida. Os toques de rodada ('win'/'lose') são curtos de
       * propósito, porque acontecem no meio do jogo; estes dois podem ocupar
       * espaço, e devem — é o único momento em que a partida inteira acabou.
       */
      case 'vitoria': {
        const g = this._chain(0.6 * vol);
        // acorde subindo e alargando, com o baixo firmando embaixo
        [[523, 0], [659, 90], [784, 180], [1046, 270], [1319, 400]].forEach(([f, ms]) =>
          setTimeout(() => { this._tone(g, f, 0.55, 'triangle'); this._tone(g, f * 2, 0.3, 'sine'); }, ms));
        setTimeout(() => this._tone(g, 131, 1.1, 'triangle'), 270);
        break;
      }
      case 'derrota': {
        const g = this._chain(0.6 * vol);
        // desce em menor e desafina no fim: o som de algo desligando
        [[392, 0], [311, 190], [262, 380]].forEach(([f, ms]) =>
          setTimeout(() => this._tone(g, f, 0.5, 'triangle'), ms));
        setTimeout(() => { this._tone(g, 196, 1.4, 'sawtooth', 92); this._noiseBurst(g, 0.7, 240, 0.8, 'lowpass'); }, 520);
        break;
      }
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
