import * as THREE from 'three';
import { CFG } from '../core/config.js';
import { worldToCell } from '../world/MazeGen.js';
import { ViewModel } from './Actor.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Primeira pessoa. O mesmo corpo serve para caçador e fugitivo — muda só ter
 * arma na mão e o que a interface cobra de você. O movimento tem aceleração e
 * atrito porque deslizar um pouco nas curvas deixa a fuga bem mais gostosa.
 */
export class Player {
  constructor(camera, input, world, audio, game) {
    this.camera = camera;
    this.input = input;
    this.world = world;
    this.audio = audio;
    this.game = game;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.role = 'hunter';
    this.alive = true;
    this.crouching = false;
    this.stamina = CFG.STAMINA_MAX;
    this.eye = CFG.EYE_H;
    this.stepTimer = 0;
    this.fireTimer = 0;
    this.recoil = 0;
    this.bob = 0;
    this.speed = 0;
    this.correndo = false;
    this.lastLook = new THREE.Vector2();
    this.deathTilt = 0;
    this.rollAtual = 0;      // a inclinação do olhar, copiada pela câmera da arma
    this.ads = 0;            // 0 pela cintura, 1 na mira de ferro
    this.lean = 0;           // -1 espiando pela esquerda, +1 pela direita
    this.leanReal = 0;       // o quanto a parede deixou inclinar de fato
    this._tmp = new THREE.Vector3();

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = CFG.RANGE;
    this.vm = null;
  }

  /**
   * O viewmodel só existe depois que os modelos terminam de carregar.
   * Ele pendura numa câmera à parte — a da cena que é desenhada por cima do
   * mundo, para a arma nunca entrar em parede nenhuma.
   */
  attachViewModel(assets, cameraDaArma = this.camera) {
    this.vm = new ViewModel(assets, cameraDaArma);
    this.vm.visible = this.role === 'hunter';
  }

  spawn(cell, yaw = 0) {
    this.pos.set(cell.x * CFG.CELL, 0, cell.y * CFG.CELL);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.alive = true;
    this.stamina = CFG.STAMINA_MAX;
    this.crouching = false;
    this.fireTimer = 0;
    this.recoil = 0;
    this.deathTilt = 0;
    this.eye = CFG.EYE_H;
  }

  setRole(role) {
    this.role = role;
    if (this.vm) this.vm.visible = role === 'hunter';
    document.body.classList.toggle('hunter', role === 'hunter');
    document.body.classList.toggle('runner', role === 'runner');
  }

  get cell() { return worldToCell(this.pos); }
  get eyePos() { return new THREE.Vector3(this.pos.x, this.eye, this.pos.z); }

  update(dt) {
    if (!this.alive) { this._applyCamera(dt); return; }
    const inp = this.input;

    // ---- olhar ----
    const m = inp.takeMouse();
    const sens = 1 - this.ads * (1 - CFG.ADS_SENS);
    this.yaw -= m.x * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - m.y * sens));
    this.lastLook.set(m.x / Math.max(dt, 0.001) * 0.02, m.y / Math.max(dt, 0.001) * 0.02);

    // ---- intenção de movimento (teclado ou controle na tela) ----
    const mov = inp.vetorMovimento();
    const fwd = mov.frente, side = mov.lado, len = mov.tam;

    // mira de ferro no botão direito: fecha o ângulo, alenta o mouse e o passo
    const querMirar = inp.mirando() && this.role === 'hunter';
    this.ads += ((querMirar ? 1 : 0) - this.ads) * Math.min(1, dt * 11);

    // espiar o canto sem expor o corpo
    const leanAlvo = inp.inclinacao();
    this.lean += (leanAlvo - this.lean) * Math.min(1, dt * 9);

    this.crouching = inp.agachando();
    const querCorrer = inp.correndo()
      && !this.crouching && len > 0 && this.ads < 0.4;   // não se corre de arma no olho
    const correndo = querCorrer && this.stamina > 0.05;
    this.correndo = correndo;

    if (correndo) this.stamina = Math.max(0, this.stamina - dt);
    else this.stamina = Math.min(CFG.STAMINA_MAX, this.stamina + dt * CFG.STAMINA_REGEN);

    let alvo = this.crouching ? CFG.SPEED_CROUCH : correndo ? CFG.SPEED_RUN : CFG.SPEED_WALK;
    alvo *= 1 - this.ads * (1 - CFG.ADS_SPEED);

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wishX = (-sin * fwd + cos * side);
    const wishZ = (-cos * fwd - sin * side);
    if (len > 0) {
      this.vel.x += wishX * alvo * CFG.ACCEL * dt;
      this.vel.z += wishZ * alvo * CFG.ACCEL * dt;
    }
    const drag = Math.max(0, 1 - CFG.FRICTION * dt);
    this.vel.x *= drag; this.vel.z *= drag;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > alvo) { this.vel.x *= alvo / sp; this.vel.z *= alvo / sp; }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (this.world.collide(this.pos, CFG.RADIUS)) this.vel.multiplyScalar(0.72);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // ---- passos e ruído ----
    this.stepTimer -= dt;
    if (this.speed > 0.6 && this.stepTimer <= 0) {
      const tipo = this.crouching ? null : correndo ? 'run' : 'walk';
      this.stepTimer = CFG.NOISE_INTERVAL * (correndo ? 0.6 : 1) * (this.crouching ? 1.7 : 1);
      if (tipo) {
        this.audio.play(tipo === 'run' ? 'run' : 'step', { vol: 0.5 });
        this.game.emitNoise(this.pos, CFG.NOISE[tipo], this);
      }
    }

    // ---- tiro: munição infinita, o limite é a cadência ----
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.role === 'hunter' && inp.takeShoot() && this.fireTimer <= 0) this.shoot();

    this.recoil = Math.max(0, this.recoil - dt * 4.5);
    this._applyCamera(dt);
  }

  /**
    * Quanto dá para inclinar sem enfiar a cabeça na parede.
    * Testa o ponto de destino contra o cenário e devolve o que sobrou — assim
    * espiar um canto apertado mostra só o que caberia de fato.
    */
  _leanPossivel(quanto) {
    if (!this.world || Math.abs(quanto) < 0.001) return 0;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const t = this._tmp.set(this.pos.x + rx * quanto, 0, this.pos.z + rz * quanto);
    this.world.collide(t, 0.24);
    return (t.x - this.pos.x) * rx + (t.z - this.pos.z) * rz;   // sobra no eixo lateral
  }

  _applyCamera(dt) {
    const alvoEye = this.crouching ? CFG.CROUCH_H : CFG.EYE_H;
    if (this.alive) this.eye += (alvoEye - this.eye) * Math.min(1, dt * 12);
    else {
      // abatido: a câmera cai e tomba de lado
      this.eye += (0.45 - this.eye) * Math.min(1, dt * 4);
      this.deathTilt += (0.7 - this.deathTilt) * Math.min(1, dt * 3);
    }

    this.bob += dt * this.speed * 2.2;
    const bobY = Math.sin(this.bob * 2) * Math.min(this.speed / 8, 0.05);
    const bobX = Math.cos(this.bob) * Math.min(this.speed / 10, 0.035);

    // a cabeça sai para o lado, mas só até onde a parede deixa
    this.leanReal = this._leanPossivel(this.lean * CFG.LEAN_DIST);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);

    this.camera.position.set(
      this.pos.x + bobX + rx * this.leanReal,
      this.eye + bobY - Math.abs(this.leanReal) * 0.12,   // encolhe um pouco ao espiar
      this.pos.z + rz * this.leanReal);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateOnWorldAxis(UP, this.yaw);
    this.camera.rotateX(this.pitch + this.recoil * 0.075 * (1 - this.ads * 0.55));
    const roll = -(this.leanReal / CFG.LEAN_DIST) * CFG.LEAN_ROLL;
    // guardado porque a arma vive noutra cena e precisa herdar só a inclinação
    this.rollAtual = roll + this.deathTilt;
    if (this.rollAtual) this.camera.rotateZ(this.rollAtual);

    // fechar o ângulo é o que dá a sensação de aproximar na mira de ferro
    const fovAlvo = CFG.FOV - (CFG.FOV - CFG.FOV_ADS) * this.ads;
    if (Math.abs(this.camera.fov - fovAlvo) > 0.01) {
      this.camera.fov = fovAlvo;
      this.camera.updateProjectionMatrix();
    }

    this.vm?.update(dt, this.speed, this.lastLook, this.correndo, this.ads, this.lean);
    document.body.classList.toggle('mirando', this.ads > 0.5);
  }

  shoot() {
    this.fireTimer = CFG.FIRE_COOLDOWN;
    this.recoil = 1;
    this.vm?.kick();
    this.audio.play('shot', { vol: 1 });
    this.game.emitNoise(this.pos, CFG.NOISE.shot, this);
    this.game.onPlayerShoot(this);
  }

  /** Ponto de onde a bala sai visualmente (a boca do cano). */
  muzzleWorld(out = new THREE.Vector3()) {
    if (!this.vm) return out.copy(this.eyePos);
    return this.vm.muzzle.getWorldPosition(out);
  }

  /** Raio a partir do centro da tela. */
  aimRay() {
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    return this.raycaster;
  }
}
