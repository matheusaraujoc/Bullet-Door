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

  /**
    * Morrer.
    *
    * O clipe de morte do modelo é discreto demais — o boneco encolhe um pouco
    * e para de pé, e quem atirou fica sem saber se acertou. Então o clipe roda
    * junto de uma queda própria: o corpo tomba para o lado e vai ao chão em
    * meio segundo. É a queda que confirma o abate.
    */
  die() {
    if (this.dead) return;
    this.dead = true;
    this.play('death', { fade: 0.1, once: true, lock: 99 });
    this.queda = 0;
    this.ladoQueda = Math.random() < 0.5 ? -1 : 1;
  }

  revive() {
    this.dead = false;
    this.locked = 0;
    this.queda = 0;
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

    if (this.dead) {
      // tomba e assenta no chão, desacelerando no fim para não bater seco
      this.queda = Math.min(1, (this.queda ?? 0) + dt * 2.1);
      const k = 1 - (1 - this.queda) * (1 - this.queda);
      this.object.rotation.z = this.ladoQueda * k * (Math.PI / 2) * 0.94;
      this.object.rotation.x = k * 0.16;
      this.object.position.y = -k * 0.06;      // encosta o ombro no piso
      return;
    }

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
 * Uma estrela de clarão: pontas de comprimento irregular saindo de um miolo.
 *
 * A versão anterior era uma cruz de braços retos e iguais, e duas delas
 * sobrepostas liam como um "X" desenhado na tela, não como fogo saindo do
 * cano. Fogo não tem simetria: são as pontas desiguais que vendem a explosão.
 */
function estrelaGeometry(pontas, sorteio) {
  const s = new THREE.Shape();
  let semente = sorteio;
  const rnd = () => {
    semente = (semente * 16807) % 2147483647;
    return semente / 2147483647;
  };
  for (let i = 0; i < pontas * 2; i++) {
    const fora = i % 2 === 0;
    const r = fora ? 0.55 + rnd() * 0.75 : 0.16 + rnd() * 0.14;
    const a = (i / (pontas * 2)) * Math.PI * 2 + rnd() * 0.18;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/**
 * O clarão: um miolo claro e quente por dentro, uma estrela larga e alaranjada
 * por fora. Sorteia entre algumas estrelas diferentes a cada tiro, então dois
 * disparos seguidos nunca desenham a mesma forma.
 */
export function makeFlash(escala = 1) {
  const grupo = new THREE.Group();
  const mat = cor => new THREE.MeshBasicMaterial({
    color: cor, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });

  const halos = [5, 6, 7].map((pontas, i) => {
    const m = new THREE.Mesh(estrelaGeometry(pontas, 7919 + i * 104729), mat(0xf77622));
    m.renderOrder = 900;
    m.visible = false;
    grupo.add(m);
    return m;
  });
  const nucleo = new THREE.Mesh(estrelaGeometry(6, 31337), mat(0xfff0b0));
  nucleo.renderOrder = 901;
  nucleo.position.z = 0.012;
  grupo.add(nucleo);
  grupo.visible = false;

  let halo = halos[0];
  return {
    grupo, nucleo, escala,
    disparar() {
      grupo.visible = true;
      for (const h of halos) h.visible = false;
      halo = halos[(Math.random() * halos.length) | 0];
      halo.visible = true;

      const g = 0.85 + Math.random() * 0.5;
      halo.material.opacity = 0.9;
      nucleo.material.opacity = 1;
      halo.scale.setScalar(escala * g);
      nucleo.scale.setScalar(escala * g * 0.5);
      halo.rotation.z = Math.random() * Math.PI * 2;
      nucleo.rotation.z = Math.random() * Math.PI * 2;
    },
    /** Some depressa: clarão que demora vira lanterna. */
    update(dt) {
      if (!grupo.visible) return;
      const queda = dt * 11;
      halo.material.opacity = Math.max(0, halo.material.opacity - queda);
      // o miolo apaga antes, deixando só o rastro alaranjado por um instante
      nucleo.material.opacity = Math.max(0, nucleo.material.opacity - queda * 1.6);
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
    // mira de ferro: a arma sobe para o centro, alinhada com a linha do olho
    this.baseAds = new THREE.Vector3(0, -0.255, -0.4);
    this.group.position.copy(this.base);
    this.group.rotation.set(0, -0.09, 0.05);
    this.baseRot = this.group.rotation.clone();
    camera.add(this.group);

    this.recoil = 0;
    this.sway = new THREE.Vector2();
    this.fase = 0;          // fase do passo, acumulada (não deriva do relógio)
    this.corridaK = 0;      // 0 andando, 1 em corrida aberta
    this.passoAnt = 0;
    this.tranco = 0;        // solavanco curto a cada pisada
  }

  kick() {
    this.recoil = 1;
    this.flash.disparar();
  }

  /**
   * O balanço da arma.
   *
   * O caminho do punho é um oito deitado: o horizontal oscila na metade da
   * frequência do vertical, que é como o corpo de fato se move a cada passo.
   * Um seno só, na vertical, lê como elevador — foi o que existia aqui antes.
   *
   * A fase é acumulada em vez de tirada do relógio: assim mudar de velocidade
   * não faz a arma pular de posição no meio do movimento.
   *
   * Correr troca a POSE, não só a amplitude. Ninguém corre de arma apontada:
   * ela desce, gira para dentro e balança bem mais.
   */
  update(dt, speed, look, correndo = false, ads = 0, lean = 0) {
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.flash.update(dt);
    this.tranco = Math.max(0, this.tranco - dt * 7);

    // transição suave entre a postura de andar e a de corrida
    this.corridaK += ((correndo && speed > 1 ? 1 : 0) - this.corridaK) * Math.min(1, dt * 6);

    const andando = speed > 0.4;
    const cadencia = 2.2 + speed * 1.45;
    if (andando) this.fase += dt * cadencia;
    else this.fase += dt * 1.1;                    // respiração de quem está parado

    // a cada pisada, um solavanco curto
    const passo = Math.floor(this.fase / Math.PI);
    if (andando && passo !== this.passoAnt) { this.tranco = 1; this.passoAnt = passo; }

    const amp = andando ? Math.min(speed / 6.4, 1) : 0.12;
    const oito = 1 + this.corridaK * 0.9;          // correndo, o oito abre
    const bx = Math.sin(this.fase) * 0.02 * amp * oito;
    const by = Math.cos(this.fase * 2) * 0.013 * amp * oito - this.tranco * 0.006;

    // o balanço persegue o movimento do mouse com atraso
    this.sway.x += (look.x * 0.06 - this.sway.x) * Math.min(1, dt * 9);
    this.sway.y += (look.y * 0.06 - this.sway.y) * Math.min(1, dt * 9);

    // mirando, o balanço quase some: é o que faz a mira de ferro valer a pena
    const calma = 1 - ads * 0.88;
    const k = this.corridaK * (1 - ads);

    const px = this.base.x + (this.baseAds.x - this.base.x) * ads;
    const py = this.base.y + (this.baseAds.y - this.base.y) * ads;
    const pz = this.base.z + (this.baseAds.z - this.base.z) * ads;

    this.group.position.set(
      px - (this.sway.x - bx) * calma + k * 0.06 - lean * 0.05,
      py - (this.sway.y - by) * calma - this.recoil * 0.02 - k * 0.12,
      pz + this.recoil * 0.07 + k * 0.1);
    this.group.rotation.set(
      this.baseRot.x * (1 - ads) + this.recoil * 0.3 + (this.sway.y * 0.4 + by * 1.2) * calma + k * 0.55,
      this.baseRot.y * (1 - ads) - this.sway.x * 0.5 * calma + k * 0.42,
      this.baseRot.z * (1 - ads) + (k * 0.3 + bx * 2.2) * calma + lean * 0.12);
  }

  set visible(v) { this.group.visible = v; }
  get visible() { return this.group.visible; }
}
