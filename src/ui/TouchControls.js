import './touch.css';
import { asset } from '../core/assets-url.js';
import { t, aoTrocarIdioma } from './i18n.js';

const PAD = asset('images/mobile/joystick_circle_pad_b.png');
const NUB = asset('images/mobile/joystick_circle_nub_b.png');
const BOTAO = asset('images/mobile/button_circle.png');

/**
 * Controles na tela, para jogar no toque.
 *
 * Cada dedo é rastreado pelo seu pointerId, então dá para andar, olhar e
 * atirar ao mesmo tempo — que é o mínimo para um jogo de tiro. Sem isso o
 * segundo toque cancelaria o primeiro e o jogador andaria sem poder mirar.
 *
 * O lado esquerdo anda, o lado direito olha, e os botões ficam por cima do
 * canto de baixo. Tudo escreve em `input.toque`, e o resto do jogo nem sabe
 * de onde veio o comando.
 */
export class TouchControls {
  constructor(input, jogo) {
    this.input = input;
    this.jogo = jogo;
    this.dedos = new Map();      // pointerId -> o que aquele dedo está fazendo
    this.raio = 52;              // curso do joystick, em pixels

    const el = document.createElement('div');
    el.id = 'toque';
    el.innerHTML = `
      <div class="olhar"></div>
      <div class="joy">
        <img class="pad" src="${PAD}" alt="">
        <img class="nub" src="${NUB}" alt="">
      </div>
      <div class="botoes">
        <button class="bt bt-correr"  data-acao="correr"  style="--img:url('${BOTAO}')"><span data-i18n="bt.correr">CORRER</span></button>
        <button class="bt bt-agachar" data-acao="agachar" style="--img:url('${BOTAO}')"><span data-i18n="bt.agachar">AGACHAR</span></button>
        <button class="bt bt-porta"   data-acao="porta"   style="--img:url('${BOTAO}')"><span data-i18n="bt.porta">PORTA</span></button>
        <button class="bt bt-mirar"   data-acao="mirar"   style="--img:url('${BOTAO}')"><span data-i18n="bt.mira">MIRA</span></button>
        <button class="bt bt-atirar"  data-acao="atirar"  style="--img:url('${BOTAO}')"><span data-i18n="bt.atirar">ATIRAR</span></button>
      </div>
      <div class="espiar">
        <button class="bt bt-esq" data-acao="esquerda" style="--img:url('${BOTAO}')"><span>&#10094;</span></button>
        <button class="bt bt-dir" data-acao="direita"  style="--img:url('${BOTAO}')"><span>&#10095;</span></button>
      </div>`;
    document.body.appendChild(el);

    this.el = el;
    this.joy = el.querySelector('.joy');
    this.nub = el.querySelector('.nub');
    this.areaOlhar = el.querySelector('.olhar');

    // os rótulos dos botões nascem no idioma escolhido e acompanham a troca
    const traduzir = () => {
      for (const s of el.querySelectorAll('[data-i18n]')) s.textContent = t(s.dataset.i18n);
    };
    traduzir();
    aoTrocarIdioma(traduzir);

    this._ligarJoystick();
    this._ligarOlhar();
    this._ligarBotoes();
    this.mostrar(false);
  }

  /** Aparece só quando há controles em uso, para não sujar a tela no desktop. */
  mostrar(v) {
    this.el.classList.toggle('ativo', !!v);
    this.input.toque.ativo = !!v;
    if (!v) this._zerar();
  }

  _zerar() {
    const t = this.input.toque;
    t.mover.x = 0; t.mover.y = 0;
    t.atirar = false; t.mirar = false; t.agachar = false; t.correr = false;
    t.inclinar = 0;
    this.nub.style.transform = 'translate(-50%, -50%)';
  }

  _ligarJoystick() {
    const alvo = this.joy;
    alvo.addEventListener('pointerdown', e => {
      e.preventDefault();
      alvo.setPointerCapture(e.pointerId);
      const r = alvo.getBoundingClientRect();
      this.dedos.set(e.pointerId, {
        tipo: 'joy', cx: r.left + r.width / 2, cy: r.top + r.height / 2,
      });
      this._moverJoy(e);
    });
    alvo.addEventListener('pointermove', e => {
      if (this.dedos.get(e.pointerId)?.tipo === 'joy') { e.preventDefault(); this._moverJoy(e); }
    });
    const soltar = e => {
      if (this.dedos.get(e.pointerId)?.tipo !== 'joy') return;
      this.dedos.delete(e.pointerId);
      this.input.toque.mover.x = 0;
      this.input.toque.mover.y = 0;
      this.nub.style.transform = 'translate(-50%, -50%)';
    };
    alvo.addEventListener('pointerup', soltar);
    alvo.addEventListener('pointercancel', soltar);
  }

  _moverJoy(e) {
    const d = this.dedos.get(e.pointerId);
    if (!d) return;
    let dx = e.clientX - d.cx, dy = e.clientY - d.cy;
    const dist = Math.hypot(dx, dy);
    if (dist > this.raio) { dx *= this.raio / dist; dy *= this.raio / dist; }
    this.nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.input.toque.mover.x = dx / this.raio;
    this.input.toque.mover.y = -dy / this.raio;      // tela cresce para baixo
  }

  _ligarOlhar() {
    const alvo = this.areaOlhar;
    alvo.addEventListener('pointerdown', e => {
      e.preventDefault();
      alvo.setPointerCapture(e.pointerId);
      this.dedos.set(e.pointerId, { tipo: 'olhar', x: e.clientX, y: e.clientY });
    });
    alvo.addEventListener('pointermove', e => {
      const d = this.dedos.get(e.pointerId);
      if (d?.tipo !== 'olhar') return;
      e.preventDefault();
      // a mesma escala do mouse, para o jogo se comportar igual nos dois
      this.input.toque.olhar.x += (e.clientX - d.x) * 0.0042;
      this.input.toque.olhar.y += (e.clientY - d.y) * 0.0042;
      d.x = e.clientX; d.y = e.clientY;
    });
    const soltar = e => { if (this.dedos.get(e.pointerId)?.tipo === 'olhar') this.dedos.delete(e.pointerId); };
    alvo.addEventListener('pointerup', soltar);
    alvo.addEventListener('pointercancel', soltar);
  }

  _ligarBotoes() {
    for (const bt of this.el.querySelectorAll('.bt')) {
      const acao = bt.dataset.acao;
      const t = this.input.toque;

      const apertar = e => {
        e.preventDefault();
        bt.setPointerCapture?.(e.pointerId);
        bt.classList.add('apertado');
        switch (acao) {
          case 'atirar': t.atirar = true; break;
          case 'mirar': t.mirar = !t.mirar; bt.classList.toggle('ligado', t.mirar); break;
          case 'agachar': t.agachar = !t.agachar; bt.classList.toggle('ligado', t.agachar); break;
          case 'correr': t.correr = true; break;
          case 'porta': this.input.onInteract?.(); break;
          case 'esquerda': t.inclinar = -1; break;
          case 'direita': t.inclinar = 1; break;
        }
      };
      const soltar = e => {
        e.preventDefault();
        bt.classList.remove('apertado');
        switch (acao) {
          case 'atirar': t.atirar = false; break;
          case 'correr': t.correr = false; break;
          case 'esquerda': case 'direita': t.inclinar = 0; break;
          // mira e agachar são de travar: continuam como estavam
        }
      };
      bt.addEventListener('pointerdown', apertar);
      bt.addEventListener('pointerup', soltar);
      bt.addEventListener('pointercancel', soltar);
      bt.addEventListener('pointerleave', e => { if (bt.classList.contains('apertado')) soltar(e); });
      bt.addEventListener('contextmenu', e => e.preventDefault());
    }
  }
}

/** O aparelho é de toque? */
export function ehToque() {
  return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}
