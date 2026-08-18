import * as THREE from 'three';
import { CFG } from '../core/config.js';
import { worldToCell, randomFloorCell, mulberry32, roomAt, DOOR, cellAt } from '../world/MazeGen.js';
import { findPath, hasLineOfSight, gridDistance } from '../ai/Pathfinder.js';
import { Actor } from './Actor.js';

const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * O bot não precisa ser brilhante — precisa ser legível e humano.
 * Ele investiga barulho, perde o rastro, chuta uma direção e às vezes erra.
 * É esse comportamento falível que transforma a caçada em jogo.
 */
export class Bot {
  constructor(assets, scene, world, audio, game, seed = 7) {
    this.world = world;
    this.audio = audio;
    this.game = game;
    this.rnd = mulberry32(seed ^ 0xbeef);

    this.actor = new Actor(assets, scene, 'runner');

    // hitbox usada pelo raycast do tiro do jogador
    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 1.75, 0.7),
      new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.y = 0.9;
    this.hitbox.userData.bot = this;
    this.actor.object.parent.add(this.hitbox);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.desired = new THREE.Vector3();   // para onde o cérebro quer ir
    this.lastPos = new THREE.Vector3();
    this.yaw = 0;
    this.role = 'runner';
    this.alive = true;
    this.state = 'idle';

    this.path = null;
    this.pathTimer = 0;
    this.lastKnown = null;        // onde o alvo foi visto/ouvido por último
    this.targetVel = new THREE.Vector3();
    this.alertness = 0;
    this.seenTime = -99;
    this.reaction = 0;
    this.aimWarm = 0;             // 0 = acabou de avistar, 1 = mira assentada
    this.fireTimer = 0;
    this.lookTimer = 0;
    this.lookYaw = 0;
    this.stepTimer = 0;
    this.doorCooldown = 0;
    this.lastDoorIdx = -1;
    this.stuckTimer = 0;
    this.speed = 0;
    this.time = 0;
    this.roomSeen = new Map();    // sala -> instante da última visita
  }

  spawn(cell, yaw = 0) {
    this.pos.set(cell.x * CFG.CELL, 0, cell.y * CFG.CELL);
    this.lastPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.alive = true;
    this.path = null;
    this.lastKnown = null;
    this.alertness = 0; this.seenTime = -99; this.reaction = 0;
    this.fireTimer = 0; this.lookTimer = 0; this.stuckTimer = 0; this.aimWarm = 0;
    this.roomSeen.clear();
    this.actor.revive();
    this.actor.setPosition(this.pos.x, 0, this.pos.z);
    this.actor.visible = true;
    this.hitbox.visible = true;
    this.hitbox.position.set(this.pos.x, 0.9, this.pos.z);
  }

  setRole(role) {
    this.role = role;
    this.state = role === 'hunter' ? 'patrol' : 'wander';
    this.actor.setRole(role);
    this.path = null;
    this.lastKnown = null;
    this.alertness = 0;
  }

  get cell() { return worldToCell(this.pos); }
  get eyePos() { return new THREE.Vector3(this.pos.x, 1.5, this.pos.z); }

  /** Ouviu algo: guarda a pista, com erro proporcional à distância. */
  hearNoise(pos, radius) {
    const d = this.pos.distanceTo(pos);
    if (d > radius) return;
    const blur = Math.min(d * 0.14, CFG.CELL * 1.4);
    this.lastKnown = new THREE.Vector3(
      pos.x + (this.rnd() - 0.5) * blur, 0, pos.z + (this.rnd() - 0.5) * blur);
    this.alertness = Math.min(1, this.alertness + 0.6);
    if (this.role === 'hunter' && this.state !== 'chase') {
      this.state = 'investigate';
      this.seenTime = this.time;
      this.path = null;
    }
    if (this.role === 'runner' && d < radius * 0.75) {
      this.state = 'flee';
      this.path = null;
    }
  }

  // ------------------------------------------------------------- percepção
  _canSee(target) {
    const d = this.pos.distanceTo(target.pos);
    let range = CFG.BOT_VIEW;
    if (target.crouching) range *= 0.6;         // agachado é bem mais difícil de ver
    if (d > range) return false;
    const toT = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    let fov = CFG.BOT_FOV;
    if (this.state === 'chase') fov *= 1.5;
    // quem está fugindo olha em volta o tempo todo, inclusive por cima do ombro
    if (this.role === 'runner') fov = Math.PI * 0.92;
    if (Math.abs(angDiff(this.yaw, toT)) > fov) return false;
    return hasLineOfSight(this.world, this.cell, worldToCell(target.pos));
  }

  // ------------------------------------------------------------- navegação
  _repath(goal, evitar = null) {
    if (!goal) return false;
    this.path = findPath(this.world, this.cell, goal, evitar);
    this.pathTimer = CFG.BOT_REPATH;
    return !!this.path;
  }

  /** Destino de patrulha: prioriza a sala vista há mais tempo. */
  _patrolGoal() {
    let best = null, bestScore = -Infinity;
    for (const r of this.world.map.rooms) {
      const visto = this.roomSeen.get(r.idx) ?? -999;
      const d = Math.hypot(r.cx - this.cell.x, r.cy - this.cell.y);
      if (d < 3) continue;
      const score = (this.time - visto) * 2.2 + d * 0.4 + this.rnd() * 4;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (!best) return randomFloorCell(this.world.map, this.rnd);
    return { x: best.cx, y: best.cy };
  }

  /**
   * Aciona a porta que está no caminho: abre a fechada, vira o desvio que
   * está barrando a passagem.
   */
  _useDoorAt(cellA, cellB) {
    if (this.doorCooldown > 0) return false;
    const W = this.world.map.W;
    for (const c of [cellB, cellA]) {
      const idx = c.y * W + c.x;
      const door = this.world.doors.get(idx);
      if (!door) continue;
      const precisa = door.kind === 'simples'
        ? this.world.doors.blocksCell(idx)
        : !this.world.doors.edgeOpen(cellA.x, cellA.y, cellB.x, cellB.y)
          || !this.world.doors.edgeOpen(cellB.x, cellB.y, cellA.x, cellA.y);
      if (!precisa) continue;
      if (!this.world.doors.toggle(door, this.pos, this.game.ocupantes())) continue;
      this.doorCooldown = 0.55;
      this.lastDoorIdx = idx;
      this.game.onDoorUsed(door, this);
      return true;
    }
    return false;
  }

  /** Segue o caminho. Devolve true ao chegar ao fim. */
  _follow(dt, speed) {
    if (!this.path || !this.path.length) return true;
    const wp = this.path[0];
    const tx = wp.x * CFG.CELL, tz = wp.y * CFG.CELL;
    let dx = tx - this.pos.x, dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // abre o que estiver trancando, antes de esbarrar
    if (dist < CFG.CELL * 1.5) this._useDoorAt(this.cell, wp);

    if (dist < CFG.CELL * 0.4) {
      this.path.shift();
      return this.path.length === 0;
    }
    dx /= dist; dz /= dist;
    this.desired.set(dx * speed, 0, dz * speed);
    return false;
  }

  _turnTo(dt, yawTarget, rate = 7) {
    this.yaw += angDiff(this.yaw, yawTarget) * Math.min(1, dt * rate);
  }

  // ---------------------------------------------------------------- update
  update(dt, target) {
    if (!this.alive) { this.actor.update(dt, 0, this.yaw); return; }
    this.time += dt;
    this.doorCooldown -= dt;
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.pathTimer -= dt;

    // marca a sala atual como vista agora
    const r = roomAt(this.world.map, this.cell.x, this.cell.y);
    if (r) this.roomSeen.set(r.idx, this.time);

    // passou por uma porta? guarda para poder fechá-la atrás de si depois
    const aqui = this.cell.y * this.world.map.W + this.cell.x;
    if (this.world.doors.get(aqui)) this.lastDoorIdx = aqui;

    const sees = target.alive && this._canSee(target);
    if (sees) {
      this.seenTime = this.time;
      this.lastKnown = target.pos.clone();
      this.targetVel.set(target.vel?.x || 0, 0, target.vel?.z || 0);
      this.alertness = 1;
      // a mira vai assentando enquanto ele te mantém à vista
      this.aimWarm = Math.min(1, this.aimWarm + dt * 0.62);
    } else {
      this.alertness = Math.max(0, this.alertness - dt * 0.16);
      // perdeu de vista: esfria rápido, e o próximo contato recomeça torto
      this.aimWarm = Math.max(0, this.aimWarm - dt * 1.6);
    }

    if (this.role === 'hunter') this._hunterBrain(dt, target, sees);
    else this._runnerBrain(dt, target, sees);

    // Segue a velocidade desejada. Antes havia um atrito aplicado por cima da
    // aproximação, e os dois juntos estabilizavam em metade da velocidade
    // pedida — o caçador patrulhava devagar demais para achar alguém em 30s.
    const k = Math.min(1, dt * 12);
    this.vel.x += (this.desired.x - this.vel.x) * k;
    this.vel.z += (this.desired.z - this.vel.z) * k;
    this.desired.set(0, 0, 0);            // cada quadro pede de novo
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (this.world.collide(this.pos, 0.36)) this.vel.multiplyScalar(0.55);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // travou? recalcula em vez de raspar na parede para sempre
    if (this.pos.distanceToSquared(this.lastPos) < 0.0004) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.55) {
        this.stuckTimer = 0;
        this.path = null;
        this.pathTimer = 0;
        this._useDoorAt(this.cell, this.cell);
      }
    } else {
      this.stuckTimer = 0;
      this.lastPos.copy(this.pos);
    }

    if (this.speed > 0.4 && this.state !== 'chase' && this.state !== 'look') {
      const rumo = Math.atan2(this.vel.x, this.vel.z);
      // olha de um lado para o outro enquanto caminha, como quem procura
      const varredura = this.role === 'hunter' && this.state === 'patrol'
        ? Math.sin(this.time * 1.3) * 0.55
        : 0;
      this._turnTo(dt, rumo + varredura, 6);
    }

    // passos: correr entrega posição, andar quase não
    this.stepTimer -= dt;
    if (this.speed > 0.6 && this.stepTimer <= 0) {
      const correndo = this.speed > CFG.BOT_SPEED_WALK + 0.6;
      this.stepTimer = CFG.NOISE_INTERVAL * (correndo ? 0.6 : 1);
      this.game.emitNoise(this.pos, CFG.NOISE[correndo ? 'run' : 'walk'], this);
      this.audio.playAt(correndo ? 'run' : 'step', this.pos, target.pos, target.yaw, 24, 0.9);
    }

    this.actor.setPosition(this.pos.x, 0, this.pos.z);
    this.actor.update(dt, this.speed, this.yaw);
    this.hitbox.position.set(this.pos.x, 0.9, this.pos.z);
  }

  // -------------------------------------------------------------- CAÇADOR
  _hunterBrain(dt, target, sees) {
    if (sees) {
      this.state = 'chase';
      const d = this.pos.distanceTo(target.pos);
      const toT = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
      this._turnTo(dt, toT, 9);

      const mirado = Math.abs(angDiff(this.yaw, toT)) < 0.15;
      if (mirado && d < CFG.RANGE) {
        this.reaction += dt;
        if (this.reaction >= CFG.BOT_REACTION && this.fireTimer <= 0) this._shoot(target, d);
      } else {
        this.reaction = Math.max(0, this.reaction - dt * 0.5);
      }

      if (d > 7) {
        if (this.pathTimer <= 0 || !this.path) this._repath(worldToCell(target.pos));
        this._follow(dt, CFG.BOT_SPEED_RUN);
      }                                      // perto o bastante: firma a mira
      return;
    }

    this.reaction = 0;

    // perdeu de vista: vai para onde ele PROVAVELMENTE está, não onde estava
    if (this.lastKnown && this.time - this.seenTime < 10) {
      this.state = 'investigate';
      const chegou = this.pos.distanceTo(this.lastKnown) < CFG.CELL;
      if (chegou) {
        this.lastKnown = null;
        this.state = 'look';
        this.lookTimer = 1.3;
        this.lookYaw = this.yaw + (this.rnd() < 0.5 ? -1 : 1) * 2.4;
        this.path = null;
      } else {
        if (this.pathTimer <= 0 || !this.path || !this.path.length) {
          const dt2 = Math.min(1.6, this.time - this.seenTime);
          const prev = this.lastKnown.clone().addScaledVector(this.targetVel, dt2);
          let alvo = worldToCell(prev);
          if (this.world.staticSolid(alvo.x, alvo.y)) alvo = worldToCell(this.lastKnown);
          if (!this._repath(alvo)) this._repath(worldToCell(this.lastKnown));
        }
        if (this._follow(dt, CFG.BOT_SPEED_RUN)) this.lastKnown = null;
      }
      return;
    }

    if (this.state === 'look') {
      this.lookTimer -= dt;
      this._turnTo(dt, this.lookYaw, 2.6);
      if (this.lookTimer <= 0) { this.state = 'patrol'; this.path = null; }
      return;
    }

    // Corre os trechos longos e vai andando ao se aproximar: assim cobre o
    // mapa em 30 segundos, mas ainda chega devagar onde pode haver alguém.
    this.state = 'patrol';
    // porta fechada ao lado é cômodo não conferido: levanta e olha
    if (this.doorCooldown <= 0) {
      const perto = this.world.doors.nearest(this.pos, CFG.CELL * 1.2);
      if (perto && perto.kind === 'simples' && !perto.open
          && this.world.doors.toggle(perto, this.pos, this.game.ocupantes())) {
        this.doorCooldown = 0.8;
        this.lastDoorIdx = perto.idx;
        this.game.onDoorUsed(perto, this);
      }
    }
    if (!this.path || !this.path.length) this._repath(this._patrolGoal());
    const longe = (this.path?.length ?? 0) > 3;
    if (this._follow(dt, longe ? CFG.BOT_SPEED_RUN * 0.85 : CFG.BOT_SPEED_WALK)) {
      this.path = null;
      this.state = 'look';
      this.lookTimer = 0.7;
      this.lookYaw = this.yaw + (this.rnd() - 0.5) * 3.2;
    }
  }

  /**
   * Um tiro. O primeiro de cada contato sai bem torto de propósito.
   *
   * Sem isso o encontro virava sentença: ele te via e você morria antes de
   * poder reagir. Agora o primeiro disparo é quase um susto — serve para você
   * saber que foi visto e ter tempo de quebrar a linha de visão. Quem fica
   * parado à vista dele por dois segundos aí sim leva.
   */
  _shoot(target, dist) {
    this.fireTimer = CFG.FIRE_COOLDOWN;
    this.reaction = 0;
    this.actor.shoot();                          // animação de disparo do modelo
    this.audio.playAt('shot', this.pos, target.pos, target.yaw, 100, 1);
    this.game.emitNoise(this.pos, CFG.NOISE.shot, this);
    const boca = this.actor.muzzleWorld(new THREE.Vector3());
    this.game.spawnTracer(boca, target.pos.clone().setY(1.1));
    this.game.spawnMuzzleFlash(boca, target.pos);

    const frieza = 2.6 - 1.6 * this.aimWarm;     // 2,6x de erro no primeiro tiro
    const err = CFG.BOT_AIM_ERROR * frieza
      * (1 + dist / 22)
      * (1 + (target.speed || 0) / 5.5)          // alvo correndo é bem mais difícil
      * (1 + this.speed / 5);                    // e atirar em movimento também atrapalha
    const toT = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
    const off = Math.abs(angDiff(this.yaw + (this.rnd() - 0.5) * err * 2, toT));
    const largura = Math.atan2(0.42, Math.max(1, dist));
    if (off < largura) this.game.onBotHitPlayer(this, target);
    else this.game.onBotMissed(this, target);
  }

  // ------------------------------------------------------------- FUGITIVO
  _runnerBrain(dt, target, sees) {
    const dist = this.pos.distanceTo(target.pos);
    const ameacado = sees || (this.alertness > 0.45 && dist < 17);

    if (ameacado) {
      // ao ser avistado, o plano velho não vale mais nada: refaz a rota já
      if (this.state !== 'flee') {
        this.state = 'flee';
        this.path = null;
        this.pathTimer = 0;
      }
      if (this.pathTimer <= 0 || !this.path || !this.path.length) {
        // foge do caçador contornando ele, não passando por cima
        this._repath(this._escapeGoal(target), worldToCell(target.pos));
      }
      // enquanto o A* não responde, já sai na direção contrária a ele
      if (!this.path || !this.path.length) {
        const fx = this.pos.x - target.pos.x, fz = this.pos.z - target.pos.z;
        const len = Math.hypot(fx, fz) || 1;
        this.desired.set((fx / len) * CFG.BOT_SPEED_RUN, 0, (fz / len) * CFG.BOT_SPEED_RUN);
      } else {
        this._follow(dt, CFG.BOT_SPEED_RUN);
      }
      this._slamDoor(target);
      return;
    }

    // sem ameaça: anda (silencioso) e procura canto com cobertura
    if (dist > 24 && this.alertness < 0.2) {
      this.state = 'hide';
      if (!this.path || !this.path.length) {
        if (this.pathTimer <= 0) this._repath(this._hideGoal(target));
        else return;                         // quieto no canto, sem fazer barulho
      }
      if (this._follow(dt, CFG.BOT_SPEED_WALK)) { this.path = null; this.pathTimer = 2.5; }
      return;
    }

    this.state = 'wander';
    if (!this.path || !this.path.length) this._repath(this._hideGoal(target));
    if (this._follow(dt, CFG.BOT_SPEED_WALK * 1.2)) this.path = null;
    this._slamDoor(target);
  }

  /** Fugir para longe pelo caminho, não em linha reta: o mapa é que manda. */
  _escapeGoal(target) {
    const hunter = worldToCell(target.pos);
    const me = this.cell;
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 12; i++) {
      const c = randomFloorCell(this.world.map, this.rnd);
      const dCaçador = gridDistance(this.world, hunter, c, 40);
      if (dCaçador < 0) continue;
      const dMeu = Math.hypot(c.x - me.x, c.y - me.y);
      // longe dele, perto de mim, e de preferência fora da linha de visão dele
      let score = dCaçador * 1.6 - dMeu * 0.4 + this.rnd() * 2;
      if (!hasLineOfSight(this.world, hunter, c)) score += 4;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best || randomFloorCell(this.world.map, this.rnd);
  }

  /** Esconderijo: longe do caçador e atrás de alguma coisa. */
  _hideGoal(target) {
    const hunter = worldToCell(target.pos);
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 10; i++) {
      const c = randomFloorCell(this.world.map, this.rnd);
      const d = Math.hypot(c.x - hunter.x, c.y - hunter.y);
      if (d < 5) continue;
      let score = d * 1.1 + this.rnd() * 3;
      if (!hasLineOfSight(this.world, hunter, c)) score += 5;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best || randomFloorCell(this.world.map, this.rnd);
  }

  /**
   * Fecha a porta atrás de si. Ganha tempo, corta a linha de visão e planta a
   * dúvida — o caçador nunca sabe se a porta fechada significa alguma coisa.
   */
  _slamDoor(target) {
    if (this.lastDoorIdx < 0 || this.doorCooldown > 0) return;
    const d = this.world.doors.get(this.lastDoorIdx);
    if (!d) { this.lastDoorIdx = -1; return; }
    const dd = Math.hypot(d.cx - this.pos.x, d.cz - this.pos.z);
    if (dd < CFG.CELL * 0.9 || dd > CFG.CELL * 2.6) {
      if (dd > CFG.CELL * 2.6) this.lastDoorIdx = -1;
      return;
    }
    // só vale se o caçador está do outro lado
    const meuLado = Math.hypot(d.cx - this.pos.x, d.cz - this.pos.z);
    const ladoDele = Math.hypot(d.cx - target.pos.x, d.cz - target.pos.z);
    if (ladoDele < meuLado) return;
    if (d.kind === 'simples' && !d.open) { this.lastDoorIdx = -1; return; }
    if (!this.world.doors.toggle(d, this.pos, this.game.ocupantes())) return;
    this.doorCooldown = 1.0;
    this.lastDoorIdx = -1;
    this.game.onDoorUsed(d, this);
  }

  die() {
    this.alive = false;
    this.vel.set(0, 0, 0);
    this.actor.die();
    this.hitbox.visible = false;
  }
}
