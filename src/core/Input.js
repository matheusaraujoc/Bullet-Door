import { CFG } from './config.js';

/** Teclado + mouse com pointer lock. Sem dependência de addons. */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.shootQueued = false;
    this.shooting = false;
    this.locked = false;
    this.onLockChange = null;
    this.onInteract = null;

    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.onInteract?.();
      if (['Space', 'ShiftLeft', 'ControlLeft', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

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
      if (!this.locked || e.button !== 0) return;
      this.shooting = true; this.shootQueued = true;
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.shooting = false; });
  }

  lock() { this.canvas.requestPointerLock?.(); }
  unlock() { document.exitPointerLock?.(); }

  down(code) { return this.keys.has(code); }
  /** Consome o delta acumulado do mouse desde o último frame. */
  takeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  }
  takeShoot() { const s = this.shootQueued; this.shootQueued = false; return s; }
}
