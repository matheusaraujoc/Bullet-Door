import { generateMap, cellAt, DIRS, WALL, DOOR } from '../world/MazeGen.js';
import { EDG } from '../core/palette.js';

const hex = v => '#' + v.toString(16).padStart(6, '0');

/**
 * A identidade do jogo é a planta dos mapas.
 *
 * O fundo do menu não é um padrão decorativo: é um mapa DE VERDADE, saído do
 * mesmo gerador que o jogo usa, desenhado em planta baixa. Cada vez que o jogo
 * abre, a planta é outra — que é exatamente a promessa da partida.
 *
 * Por cima dela correm duas varreduras, uma vermelha e uma ciano, que se
 * perseguem pelos corredores. Caçador e fugitivo, reduzidos a duas linhas.
 */
export class MenuArte {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
    this.trocaEm = 0;
    this.rodando = false;
    this._novoMapa();
    addEventListener('resize', () => this._ajustar());
  }

  _novoMapa() {
    this.map = generateMap((Math.random() * 1e9) | 0);
    this.portas = this.map.doors.map(d => ({
      x: d.x, y: d.y, kind: d.kind,
      // cada porta pisca no seu próprio ritmo, como se alguém as usasse
      fase: Math.random() * Math.PI * 2,
      ritmo: 0.5 + Math.random() * 0.7,
    }));
    // dois caminhantes soltos pela planta: o caçador e quem foge dele
    const chao = [];
    for (let y = 0; y < this.map.H; y++)
      for (let x = 0; x < this.map.W; x++)
        if (cellAt(this.map, x, y) !== WALL) chao.push({ x, y });
    this.andarilhos = [
      { cor: EDG.red, cel: chao[(Math.random() * chao.length) | 0], prox: null, p: 0, vel: 2.1, rastro: [] },
      { cor: EDG.cyan, cel: chao[(Math.random() * chao.length) | 0], prox: null, p: 0, vel: 2.4, rastro: [] },
    ];
    this.trocaEm = 14 + Math.random() * 6;
  }

  _ajustar() {
    const c = this.canvas;
    const r = Math.min(devicePixelRatio || 1, 2);
    c.width = Math.floor(c.clientWidth * r);
    c.height = Math.floor(c.clientHeight * r);
    this.ctx.setTransform(r, 0, 0, r, 0, 0);
  }

  iniciar() {
    if (this.rodando) return;
    this.rodando = true;
    this._ajustar();
    let ant = performance.now();
    const laco = agora => {
      if (!this.rodando) return;
      const dt = Math.min((agora - ant) / 1000, 0.05);
      ant = agora;
      this._passo(dt);
      this._desenhar();
      requestAnimationFrame(laco);
    };
    requestAnimationFrame(laco);
  }

  parar() { this.rodando = false; }

  /** Escolhe a próxima célula de um andarilho, sem voltar por onde veio. */
  _proxima(a) {
    const saidas = DIRS
      .map(d => ({ x: a.cel.x + d.dx, y: a.cel.y + d.dy }))
      .filter(c => cellAt(this.map, c.x, c.y) !== WALL);
    if (!saidas.length) return a.cel;
    const frente = saidas.filter(c => !a.veio || c.x !== a.veio.x || c.y !== a.veio.y);
    const pool = frente.length ? frente : saidas;
    return pool[(Math.random() * pool.length) | 0];
  }

  _passo(dt) {
    this.t += dt;
    this.trocaEm -= dt;
    if (this.trocaEm <= 0) this._novoMapa();     // outra planta, outra partida

    for (const a of this.andarilhos) {
      if (!a.prox) a.prox = this._proxima(a);
      a.p += dt * a.vel;
      while (a.p >= 1) {
        a.p -= 1;
        a.veio = a.cel;
        a.cel = a.prox;
        a.prox = this._proxima(a);
        a.rastro.push({ x: a.cel.x, y: a.cel.y, vida: 1 });
        if (a.rastro.length > 26) a.rastro.shift();
      }
      for (const r of a.rastro) r.vida -= dt * 0.42;
      a.rastro = a.rastro.filter(r => r.vida > 0);
    }
  }

  _desenhar() {
    const { ctx, map } = this;
    const L = this.canvas.clientWidth, A = this.canvas.clientHeight;
    ctx.clearRect(0, 0, L, A);

    // a planta ocupa a tela inteira, sangrando pelas bordas
    const passo = Math.max(L / map.W, A / map.H) * 1.02;
    const ox = (L - map.W * passo) / 2, oy = (A - map.H * passo) / 2;
    const px = (x) => ox + x * passo, py = (y) => oy + y * passo;

    // ---- o chão jogável, em blocos ----
    ctx.fillStyle = 'rgba(74, 90, 138, 1)';
    for (let y = 0; y < map.H; y++) {
      for (let x = 0; x < map.W; x++) {
        if (cellAt(map, x, y) === WALL) continue;
        const dentro = map.inRoom[y * map.W + x];
        ctx.globalAlpha = dentro ? 0.62 : 0.34;   // sala mais firme que corredor
        ctx.fillRect(px(x) + 1, py(y) + 1, passo - 2, passo - 2);
      }
    }
    ctx.globalAlpha = 1;

    // ---- contorno das salas: é o que dá leitura de planta baixa ----
    ctx.strokeStyle = 'rgba(160, 178, 208, .55)';
    ctx.lineWidth = 2;
    for (const r of map.rooms) {
      ctx.strokeRect(px(r.x), py(r.y), r.w * passo, r.h * passo);
    }

    // ---- as portas, o símbolo do jogo ----
    for (const d of this.portas) {
      const aberto = (Math.sin(this.t * d.ritmo + d.fase) + 1) / 2;   // 0 fechada, 1 aberta
      const cx = px(d.x) + passo / 2, cy = py(d.y) + passo / 2;
      const meia = passo * 0.42;
      const vertical = cellAt(map, d.x, d.y - 1) !== WALL && cellAt(map, d.x, d.y + 1) !== WALL;
      ctx.strokeStyle = d.kind === 'desvio' ? hex(EDG.amber) : hex(EDG.orange);
      ctx.globalAlpha = 0.5 + (1 - aberto) * 0.5;
      ctx.lineWidth = 4;
      ctx.beginPath();
      // a barra encolhe conforme "abre": a porta virando símbolo
      const t = meia * (1 - aberto * 0.75);
      if (vertical) { ctx.moveTo(cx - t, cy); ctx.lineTo(cx + t, cy); }
      else { ctx.moveTo(cx, cy - t); ctx.lineTo(cx, cy + t); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ---- os dois andarilhos ----
    for (const a of this.andarilhos) {
      const cor = hex(a.cor);
      for (const r of a.rastro) {
        ctx.fillStyle = cor;
        ctx.globalAlpha = r.vida * 0.5;
        ctx.fillRect(px(r.x) + passo * 0.3, py(r.y) + passo * 0.3, passo * 0.4, passo * 0.4);
      }
      const x = px(a.cel.x + (a.prox.x - a.cel.x) * a.p) + passo / 2;
      const y = py(a.cel.y + (a.prox.y - a.cel.y) * a.p) + passo / 2;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = cor;
      ctx.shadowColor = cor;
      ctx.shadowBlur = 22;
      ctx.fillRect(x - passo * 0.17, y - passo * 0.17, passo * 0.34, passo * 0.34);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
}
