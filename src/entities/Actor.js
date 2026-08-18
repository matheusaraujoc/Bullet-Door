import * as THREE from 'three';

/**
 * O personagem voxel animado. O FBX traz 13 clipes prontos, então o trabalho
 * aqui é só escolher o clipe certo e trocar com transição suave — pose dura
 * entrega a máquina de estados e estraga a leitura do movimento.
 */
export class Actor {
  constructor(assets, parent, role = 'runner') {
    const { object, animations } = assets.newCharacter();
    this.assets = assets;
    this.object = object;
    this.object.rotation.order = 'YXZ';
    parent.add(object);

    this.mixer = new THREE.AnimationMixer(object);
    this.clips = new Map();
    for (const c of animations) this.clips.set(c.name, c);

    this.actions = new Map();
    this.current = null;
    this.locked = 0;              // trava a troca de clipe (tiro, morte)

    // osso da mão: é onde a arma mora
    object.traverse(o => { if (o.name === 'weaponHolderR') this.hand = o; });
    this.gun = this.hand ? assets.attachWeapon(this.hand, 'pistol') : null;
    if (this.gun) this.gun.visible = false;

    this.role = role;
    this.dead = false;
    this.setRole(role);
  }

  _action(name) {
    if (!this.clips.has(name)) return null;
    if (!this.actions.has(name)) {
      const a = this.mixer.clipAction(this.clips.get(name));
      this.actions.set(name, a);
    }
    return this.actions.get(name);
  }

  /** Troca de clipe com mistura; repetir o mesmo clipe não reinicia nada. */
  play(name, { fade = 0.18, once = false, lock = 0 } = {}) {
    const a = this._action(name);
    if (!a || this.current === name) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (prev) a.crossFadeFrom(prev, fade, false);
    a.play();
    this.current = name;
    this.locked = lock;
  }

  setRole(role) {
    this.role = role;
    if (this.gun) this.gun.visible = role === 'hunter';
    this.current = null;                       // força reavaliar o clipe
    this.play(role === 'hunter' ? 'idle with pistol' : 'idle', { fade: 0 });
  }

  /** Animação de disparo, sem interromper o deslocamento por muito tempo. */
  shoot() {
    if (this.dead) return;
    this.play('shoot with pistol', { fade: 0.05, once: true, lock: 0.3 });
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.play('death', { fade: 0.1, once: true, lock: 99 });
  }

  revive() {
    this.dead = false;
    this.locked = 0;
    this.object.rotation.x = 0;
    this.object.rotation.z = 0;
    this.object.position.y = 0;
    this.setRole(this.role);
  }

  /**
   * @param {number} speed velocidade horizontal em m/s
   * @param {number} yaw   para onde o corpo aponta (o modelo olha para +Z)
   */
  update(dt, speed, yaw) {
    this.mixer.update(dt);
    this.object.rotation.y = yaw;
    if (this.dead) return;

    this.locked -= dt;
    if (this.locked > 0) return;

    const armado = this.role === 'hunter';
    let alvo;
    if (speed > 4.2) alvo = armado ? 'run with pistol' : 'run';
    else if (speed > 0.5) alvo = armado ? 'walk with pistol' : 'walk';
    else alvo = armado ? 'idle with pistol' : 'idle';
    this.play(alvo);
  }

  /**
   * Onde está a boca do cano, no mundo. O clarão precisa sair daqui — preso a
   * uma altura fixa ele acendia na altura da cabeça, como se o tiro saísse do
   * rosto do boneco.
   */
  muzzleWorld(out = new THREE.Vector3(), avanco = 0.4) {
    if (!this.gun) return out.copy(this.object.position).setY(1.1);
    this.gun.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(this.gun.matrixWorld);
    // o cano aponta para onde o corpo está virado
    out.x += Math.sin(this.object.rotation.y) * avanco;
    out.z += Math.cos(this.object.rotation.y) * avanco;
    return out;
  }

  setPosition(x, y, z) { this.object.position.set(x, y, z); }
  set visible(v) { this.object.visible = v; }
  get visible() { return this.object.visible; }

  dispose() {
    this.mixer.stopAllAction();
    this.object.removeFromParent();
  }
}

/**
 * Clarão em cruz, no espírito do pixel art: um quadrado chapado não lê como
 * fogo saindo do cano. Duas camadas somadas (halo largo + núcleo claro) com
 * giro e tamanho sorteados a cada tiro, para nunca sair igual duas vezes.
 */
export function crossGeometry(braco = 1, esp = 0.26) {
  const b = braco, e = esp;
  const s = new THREE.Shape();
  s.moveTo(-e, -b); s.lineTo(e, -b); s.lineTo(e, -e); s.lineTo(b, -e);
  s.lineTo(b, e); s.lineTo(e, e); s.lineTo(e, b); s.lineTo(-e, b);
  s.lineTo(-e, e); s.lineTo(-b, e); s.lineTo(-b, -e); s.lineTo(-e, -e);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/** As duas camadas do clarão, prontas para pendurar em qualquer cano. */
export function makeFlash(escala = 1) {
  const grupo = new THREE.Group();
  const mat = cor => new THREE.MeshBasicMaterial({
    color: cor, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(crossGeometry(1, 0.3), mat(0xf77622));
  const nucleo = new THREE.Mesh(crossGeometry(0.55, 0.34), mat(0xfee761));
  halo.renderOrder = 900; nucleo.renderOrder = 901;
  nucleo.position.z = 0.01;
  halo.scale.setScalar(escala);
  nucleo.scale.setScalar(escala);
  grupo.add(halo, nucleo);
  grupo.visible = false;
  return {
    grupo, halo, nucleo, escala,
    disparar() {
      grupo.visible = true;
      const g = 0.8 + Math.random() * 0.6;
      halo.material.opacity = 0.95;
      nucleo.material.opacity = 1;
      halo.scale.setScalar(escala * g);
      nucleo.scale.setScalar(escala * g * 0.62);
      halo.rotation.z = Math.random() * Math.PI;
      nucleo.rotation.z = Math.random() * Math.PI;
    },
    /** Some depressa: clarão que demora vira lanterna. */
    update(dt) {
      if (!grupo.visible) return;
      const queda = dt * 10;
      halo.material.opacity = Math.max(0, halo.material.opacity - queda);
      nucleo.material.opacity = Math.max(0, nucleo.material.opacity - queda * 1.3);
      if (halo.material.opacity <= 0) grupo.visible = false;
    },
  };
}

/**
 * A arma em primeira pessoa. Fica pendurada na câmera com um pouco de atraso
 * no balanço — arma grudada rígida na tela é o que faz o tiro parecer morto.
 */
export class ViewModel {
  constructor(assets, camera) {
    this.group = new THREE.Group();
    this.gun = assets.newWeapon('pistol', 'view');
    this.gun.scale.setScalar(assets.charScale * 0.46);
    this.group.add(this.gun);

    // clarão na boca do cano
    const len = assets.pistol.size.x * assets.charScale * 0.46;
    this.flash = makeFlash(0.19);
    this.flash.grupo.position.set(0, 0.15, -len * 1.25);
    this.group.add(this.flash.grupo);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.copy(this.flash.grupo.position);
    this.group.add(this.muzzle);

    this.base = new THREE.Vector3(0.3, -0.52, -0.5);
    this.group.position.copy(this.base);
    this.group.rotation.set(0, -0.09, 0.05);
    this.baseRot = this.group.rotation.clone();
    camera.add(this.group);

    this.recoil = 0;
    this.sway = new THREE.Vector2();
  }

  kick() {
    this.recoil = 1;
    this.flash.disparar();
  }

  update(dt, speed, look) {
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.flash.update(dt);

    // o balanço persegue o movimento do mouse com atraso
    this.sway.x += (look.x * 0.06 - this.sway.x) * Math.min(1, dt * 9);
    this.sway.y += (look.y * 0.06 - this.sway.y) * Math.min(1, dt * 9);

    const bob = speed > 0.5 ? Math.sin(performance.now() * 0.008 * speed) * 0.012 * speed / 3 : 0;
    this.group.position.set(
      this.base.x - this.sway.x,
      this.base.y - this.sway.y + bob - this.recoil * 0.02,
      this.base.z + this.recoil * 0.07);
    this.group.rotation.set(
      this.baseRot.x + this.recoil * 0.3 + this.sway.y * 0.4,
      this.baseRot.y - this.sway.x * 0.5,
      this.baseRot.z);
  }

  set visible(v) { this.group.visible = v; }
  get visible() { return this.group.visible; }
}
