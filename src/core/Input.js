import { CFG } from './config.js';

/**
 * As teclas que o jogo usa.
 *
 * Existe para duas coisas. Uma é barrar o comportamento padrão do navegador —
 * Tab troca o foco, Espaço rola a página, e no meio de um tiroteio isso é
 * desastre. A outra é reconhecer, junto com `ctrlKey`, quando a tecla na
 * verdade não é do jogo.
 */
const TECLAS_DO_JOGO = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyC',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space', 'Tab',
]);

/**
 * Entrada do jogo, vindo de teclado e mouse ou dos controles na tela.
 *
 * As duas fontes escrevem no mesmo lugar e o resto do jogo só pergunta pelo
 * significado — "para onde ele quer andar", "está mirando?" — em vez de olhar
 * teclas. É o que permite o toque funcionar sem espalhar condicional por todo
 * o Player.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.shootQueued = false;
    this.shooting = false;
    this.aiming = false;        // botão direito: mira de ferro
    this.locked = false;
    this.onLockChange = null;
    this.onLockFail = null;
    this.onInteract = null;

    // o que os controles na tela preenchem
    this.toque = {
      mover: { x: 0, y: 0 },    // -1..1, já normalizado pelo joystick
      olhar: { x: 0, y: 0 },    // delta acumulado, consumido junto com o mouse
      atirar: false,
      mirar: false,
      agachar: false,
      correr: false,
      inclinar: 0,              // -1 esquerda, +1 direita
      ativo: false,             // há controles na tela em uso
    };

    addEventListener('keydown', e => {
      // Com um modificador segurado, a tecla é do navegador e não do jogo.
      // Ctrl+W fecha a aba, Ctrl+F abre a busca, Ctrl+D salva o favorito — e
      // registrar a tecla mesmo assim fazia o personagem sair andando enquanto
      // a aba se fechava. Soltar tudo é o comportamento certo: quem apertou
      // Ctrl não estava jogando naquele instante.
      if (e.ctrlKey || e.metaKey || e.altKey) { this.keys.clear(); return; }
      if (TECLAS_DO_JOGO.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF') this.onInteract?.();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockerror', () => this.onLockFail?.());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    });
    addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.mouseDX += e.movementX * CFG.MOUSE_SENS;
      this.mouseDY += e.movementY * CFG.MOUSE_SENS;
    });
    addEventListener('mousedown', e => {
      if (!this.locked) return;
      if (e.button === 0) { this.shooting = true; this.shootQueued = true; }
      if (e.button === 2) this.aiming = true;
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.shooting = false;
      if (e.button === 2) this.aiming = false;
    });
    // sem isto o botão direito abre o menu do navegador no meio do tiroteio
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  /**
   * Pede o ponteiro de volta.
   *
   * Pode falhar, e falha justamente na hora mais provável: o navegador recusa
   * o pedido por cerca de um segundo depois de o usuário ter solto o ponteiro
   * com ESC. Sem tratar, o jogo voltava a rodar com a câmera parada e sem
   * nenhuma explicação na tela.
   */
  lock() {
    const p = this.canvas.requestPointerLock?.();
    if (p?.catch) p.catch(() => this.onLockFail?.());
  }
  unlock() { document.exitPointerLock?.(); }

  down(code) { return this.keys.has(code); }

  // ------------------------------------------------------------ intenções
  /** Para onde o jogador quer andar: y para frente, x para o lado. */
  vetorMovimento() {
    let frente = 0, lado = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) frente += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) frente -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) lado += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) lado -= 1;
    frente += this.toque.mover.y;
    lado += this.toque.mover.x;
    const tam = Math.hypot(frente, lado);
    if (tam > 1) { frente /= tam; lado /= tam; }
    return { frente, lado, tam: Math.min(tam, 1) };
  }

  mirando() { return this.aiming || this.toque.mirar; }
  /**
   * Agachar é no C, e só no C.
   *
   * O Ctrl saiu de propósito. Ele é o modificador de quase todo atalho do
   * navegador, e as teclas do jogo são justamente as que doem: Ctrl+W fecha a
   * aba, Ctrl+F abre a busca, Ctrl+D salva o favorito, Ctrl+S baixa a página.
   * Agachar andando é a coisa mais natural do mundo num jogo de tiro, então
   * "agachar" na tecla Ctrl era um botão de fechar a aba disfarçado.
   */
  agachando() { return this.down('KeyC') || this.toque.agachar; }
  correndo() { return this.down('ShiftLeft') || this.down('ShiftRight') || this.toque.correr; }

  /** Espiar canto: -1 pela esquerda, +1 pela direita. */
  inclinacao() {
    const teclado = (this.down('KeyE') ? 1 : 0) - (this.down('KeyQ') ? 1 : 0);
    return Math.max(-1, Math.min(1, teclado + this.toque.inclinar));
  }

  /** Consome o quanto o olhar girou desde o último quadro. */
  takeMouse() {
    const d = {
      x: this.mouseDX + this.toque.olhar.x,
      y: this.mouseDY + this.toque.olhar.y,
    };
    this.mouseDX = 0; this.mouseDY = 0;
    this.toque.olhar.x = 0; this.toque.olhar.y = 0;
    return d;
  }

  takeShoot() {
    const s = this.shootQueued || this.toque.atirar;
    this.shootQueued = false;
    return s;
  }

  /** O jogo só precisa do ponteiro travado quando é jogado com mouse. */
  precisaTravar() { return !this.toque.ativo; }
}
