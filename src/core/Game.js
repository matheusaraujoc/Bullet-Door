import * as THREE from 'three';
import { CFG } from './config.js';
import { EDG, injectCssPalette } from './palette.js';
import { AudioSys } from './AudioSys.js';
import { Input } from './Input.js';
import { RoundManager } from './RoundManager.js';
import { HUD } from '../ui/HUD.js';
import { World } from '../world/World.js';
import { generateMap, randomFloorCell, mulberry32 } from '../world/MazeGen.js';
import { gridDistance } from '../ai/Pathfinder.js';
import { Assets } from '../entities/Assets.js';
import { makeFlash } from '../entities/Actor.js';
import { Player } from '../entities/Player.js';
import { Bot } from '../entities/Bot.js';

const TRACERS = 8;
const SPARKS = 60;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: window.devicePixelRatio < 1.5, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(EDG.black);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(EDG.ink, CFG.FOG_NEAR, CFG.FOG_FAR);

    this.camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 140);
    this.scene.add(this.camera);

    // Luz clara, sem sombra dinâmica: o cenário já carrega a iluminação assada
    // nas cores das instâncias, e estas luzes existem para dar volume aos
    // personagens e às portas em movimento.
    this.scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x3a3550, 1.5));
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.0);
    sun.position.set(0.5, 1, 0.3);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fb6d8, 0.45);
    fill.position.set(-0.6, 0.4, -0.5);
    this.scene.add(fill);
    this.torch = new THREE.PointLight(0xffe2b0, 0.7, 16, 1.8);
    this.camera.add(this.torch);
    this.muzzleLight = new THREE.PointLight(EDG.amber, 0, 9, 2.4);
    this.muzzleLight.position.set(0.25, -0.05, -1.1);
    this.camera.add(this.muzzleLight);

    this.audio = new AudioSys();
    this.input = new Input(canvas);
    this.hud = new HUD();
    this.rounds = new RoundManager(this);
    this.assets = new Assets();

    this.world = null;
    this.player = new Player(this.camera, this.input, null, this.audio, this);
    this.bot = null;
    this.seedBase = (Math.random() * 1e9) | 0;

    this.running = false;
    this.paused = false;
    this.ready = false;
    this.clock = new THREE.Clock();
    this.raycastTargets = [];

    this._buildEffects();

    this.input.onInteract = () => this.tryDoor();
    this.input.onLockChange = locked => {
      if (!locked && this.running && !this.paused && this.rounds.state !== 'matchend') this.pause();
    };
    addEventListener('resize', () => this.resize());
    injectCssPalette();
    this._bindMenus();
  }

  // -------------------------------------------------------------- efeitos
  _buildEffects() {
    // traçantes: caixas finas esticadas do cano até o ponto atingido
    this.tracerPool = [];
    const tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
    tracerGeo.translate(0, 0, -0.5);
    for (let i = 0; i < TRACERS; i++) {
      const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
        color: EDG.gold, transparent: true, opacity: 0, depthWrite: false,
      }));
      m.visible = false;
      m.frustumCulled = false;
      this.scene.add(m);
      this.tracerPool.push({ mesh: m, life: 0 });
    }

    // estilhaços: cubinhos que saltam do impacto, no espírito voxel
    this.sparks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.09),
      new THREE.MeshBasicMaterial({ color: 0xffffff }), SPARKS);
    this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    this.sparkData = Array.from({ length: SPARKS }, () => ({
      life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), cor: EDG.sand,
    }));
    this._m4 = new THREE.Matrix4();
    this._c = new THREE.Color();
    const hide = this._m4.makeScale(0.0001, 0.0001, 0.0001);
    for (let i = 0; i < SPARKS; i++) {
      this.sparks.setMatrixAt(i, hide);
      this.sparks.setColorAt(i, this._c.setHex(EDG.sand));
    }
    this.sparks.instanceMatrix.needsUpdate = true;

    // clarão solto no mundo: é o que denuncia de onde partiu o tiro do bot
    this.worldFlash = makeFlash(0.36);
    this.scene.add(this.worldFlash.grupo);
    this.worldFlashLight = new THREE.PointLight(EDG.amber, 0, 14, 2);
    this.scene.add(this.worldFlashLight);
  }

  /** Acende o clarão exatamente na boca do cano de quem atirou. */
  spawnMuzzleFlash(boca, alvo) {
    this.worldFlash.grupo.position.copy(boca);
    this.worldFlash.grupo.lookAt(alvo.x, boca.y, alvo.z);
    this.worldFlash.disparar();
    this.worldFlashLight.position.copy(boca);
    this.worldFlashLight.intensity = 7;
  }

  spawnTracer(from, to) {
    const slot = this.tracerPool.find(t => t.life <= 0) || this.tracerPool[0];
    const m = slot.mesh;
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(1, 1, Math.max(0.2, from.distanceTo(to)));
    m.material.opacity = 0.95;
    m.visible = true;
    slot.life = 0.075;
  }

  spawnImpact(point, cor = EDG.sand) {
    let n = 0;
    for (const s of this.sparkData) {
      if (n >= 7) break;
      if (s.life > 0) continue;
      s.life = 0.35 + Math.random() * 0.3;
      s.pos.copy(point);
      s.vel.set((Math.random() - 0.5) * 5, Math.random() * 4 + 1.2, (Math.random() - 0.5) * 5);
      s.cor = cor;
      n++;
    }
  }

  _updateEffects(dt) {
    for (const t of this.tracerPool) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.075) * 0.95;
      if (t.life <= 0) t.mesh.visible = false;
    }

    let sujo = false;
    this.sparkData.forEach((s, i) => {
      if (s.life <= 0) return;
      sujo = true;
      s.life -= dt;
      s.vel.y -= 14 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < 0.06) { s.pos.y = 0.06; s.vel.y *= -0.35; s.vel.x *= 0.7; s.vel.z *= 0.7; }
      const k = s.life > 0 ? Math.max(0.05, Math.min(1, s.life * 2.4)) : 0.0001;
      this._m4.makeScale(k, k, k);
      this._m4.setPosition(s.pos.x, s.pos.y, s.pos.z);
      this.sparks.setMatrixAt(i, this._m4);
      this.sparks.setColorAt(i, this._c.setHex(s.cor));
    });
    if (sujo) {
      this.sparks.instanceMatrix.needsUpdate = true;
      if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
    }

    this.worldFlash.update(dt);
    if (this.muzzleLight.intensity > 0) {
      this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 34);
    }
    if (this.worldFlashLight.intensity > 0) {
      this.worldFlashLight.intensity = Math.max(0, this.worldFlashLight.intensity - dt * 40);
    }
  }

  // ---------------------------------------------------------------- setup
  async load(onProgress) {
    await this.assets.load(onProgress);
    this.player.attachViewModel(this.assets);
    this.ready = true;
  }

  _bindMenus() {
    const menu = document.getElementById('menu');
    const pause = document.getElementById('pause');
    const matchend = document.getElementById('matchend');

    document.getElementById('btnPlay').onclick = () => {
      if (!this.ready) return;
      this.audio.init(); this.audio.resume(); this.audio.play('click');
      menu.classList.add('hidden');
      this.startMatch();
    };
    document.getElementById('btnResume').onclick = () => { this.audio.play('click'); this.resume(); };
    document.getElementById('btnQuit').onclick = () => {
      this.audio.play('click');
      pause.classList.add('hidden');
      this.running = false;
      this.hud.show(false);
      menu.classList.remove('hidden');
    };
    document.getElementById('btnAgain').onclick = () => {
      this.audio.play('click');
      matchend.classList.add('hidden');
      this.startMatch();
    };
    addEventListener('keydown', e => {
      if (e.code !== 'Escape' || !this.running) return;
      if (this.paused) this.resume(); else this.pause();
    });
    this.canvas.addEventListener('click', () => {
      if (this.running && !this.paused && !this.input.locked) this.input.lock();
    });
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  startMatch() {
    this.hud.show(true);
    this.running = true;
    this.paused = false;
    this.rounds.startMatch();
    this.input.lock();
    this.clock.getDelta();
    if (!this._loop) { this._loop = true; this.renderer.setAnimationLoop(() => this.frame()); }
  }

  pause() {
    this.paused = true;
    this.input.unlock();
    document.getElementById('pause').classList.remove('hidden');
  }

  resume() {
    this.paused = false;
    document.getElementById('pause').classList.add('hidden');
    this.input.lock();
    this.clock.getDelta();
  }

  // ----------------------------------------------------------------- nível
  buildLevel() {
    if (this.world) this.world.dispose();
    const seed = (this.seedBase + this.rounds.round * 7919) | 0;
    this.map = generateMap(seed);
    this.world = new World(this.map, this.scene);
    this.player.world = this.world;
    this.rnd = mulberry32(seed ^ 0x5151);

    if (!this.bot) this.bot = new Bot(this.assets, this.scene, this.world, this.audio, this, seed);
    else this.bot.world = this.world;

    this.raycastTargets = [...this.world.solidMeshes, this.world.doors.leaves, this.bot.hitbox];
  }

  /** Põe os dois no mapa, longe um do outro, e devolve as portas ao estado inicial. */
  placeCombatants(playerRole) {
    this.world.doors.reset();

    const a = randomFloorCell(this.map, this.rnd);
    let b = null;
    for (let i = 0; i < 40; i++) {
      const c = randomFloorCell(this.map, this.rnd, a, 8);
      if (gridDistance(this.world, a, c, 80) >= 11) { b = c; break; }
    }
    b = b || randomFloorCell(this.map, this.rnd, a, 7);

    const pCell = playerRole === 'runner' ? a : b;
    const bCell = playerRole === 'runner' ? b : a;
    // a câmera olha para -Z; o boneco voxel olha para +Z
    const yawPlayer = (f, t) => Math.atan2(-(t.x - f.x), -(t.y - f.y));
    const yawBot = (f, t) => Math.atan2(t.x - f.x, t.y - f.y);

    this.player.spawn(pCell, yawPlayer(pCell, bCell) + (this.rnd() - 0.5) * 2.2);
    this.player.setRole(playerRole);

    this.bot.spawn(bCell, yawBot(bCell, pCell) + (this.rnd() - 0.5) * 2.2);
    this.bot.setRole(playerRole === 'hunter' ? 'runner' : 'hunter');

    this.hud.setDanger(false);
  }

  // --------------------------------------------------------------- eventos
  onHalfPrepared(role, half, comIntro) {
    this.hud.setRole(role, this._objetivo(role));
    this.hud.setScore(this.rounds.scoreYou, this.rounds.scoreBot, this.rounds.round);
    this.hud.setTimer(CFG.PHASE_TIME);
    this.hud.setPhase(1);
    if (comIntro) {
      this.hud.big(`RODADA ${this.rounds.round}`, role === 'hunter' ? 'VOCÊ CAÇA' : 'VOCÊ FOGE', role);
    } else {
      this.audio.play('swap');
      this.hud.big('TROCA', role === 'hunter' ? 'AGORA VOCÊ CAÇA' : 'AGORA VOCÊ FOGE', role);
    }
  }

  onHalfStarted(role) {
    this.hud.hideBig();
    this.hud.setRole(role, this._objetivo(role));
  }

  /**
   * Fim de metade. A troca é o ritmo natural da partida, não um veredito:
   * se ninguém foi atingido, a rodada simplesmente segue para a próxima metade.
   */
  onHalfEnded(role, abateu, tempo) {
    this.player.vel.set(0, 0, 0);
    if (!abateu) return;
    if (role === 'hunter') this.hud.big('ALVO ELIMINADO', `${tempo.toFixed(1)}s`, 'hunter');
    else this.hud.big('VOCÊ FOI ABATIDO', `${tempo.toFixed(1)}s`, 'runner');
  }

  onRoundEnded(vencedor, y, b) {
    const linha = `VOCÊ ${y === null ? '--' : y.toFixed(1) + 's'}   ·   BOT ${b === null ? '--' : b.toFixed(1) + 's'}`;
    if (vencedor === 'you') { this.audio.play('win'); this.hud.big(linha, 'RODADA SUA', 'runner'); }
    else if (vencedor === 'bot') { this.audio.play('lose'); this.hud.big(linha, 'RODADA DO BOT', 'hunter'); }
    else this.hud.big(linha, 'EMPATE');
    this.hud.setScore(this.rounds.scoreYou, this.rounds.scoreBot, this.rounds.round);
  }

  onMatchEnded(vencedor) {
    this.hud.hideBig();
    this.hud.show(false);
    this.input.unlock();
    this.running = false;
    document.getElementById('meTitle').textContent =
      vencedor === 'you' ? 'VITÓRIA' : vencedor === 'bot' ? 'DERROTA' : 'EMPATE';
    document.getElementById('meScore').textContent =
      `${this.rounds.scoreYou} — ${this.rounds.scoreBot}`;
    document.getElementById('matchend').classList.remove('hidden');
    this.audio.play(vencedor === 'you' ? 'win' : 'lose');
  }

  _objetivo(role) {
    if (role === 'hunter') {
      const b = this.rounds.botTime;
      return b === null ? 'ENCONTRE E ELIMINE' : `ELIMINE EM MENOS DE ${Math.ceil(b)}s`;
    }
    const t = this.rounds.survivalTarget;
    if (t === null) return 'SOBREVIVA ATÉ O FIM';
    const passou = CFG.PHASE_TIME - this.rounds.phaseTime;
    return passou > t ? 'AGUENTE — A RODADA É SUA' : `SOBREVIVA ${Math.ceil(t)}s PARA VENCER`;
  }

  // ----------------------------------------------------------------- ruído
  emitNoise(pos, radius, origem) {
    if (!radius || this.rounds.state !== 'playing') return;
    if (origem !== this.bot && this.bot?.alive) this.bot.hearNoise(pos, radius);
    if (origem !== this.player && this.player.alive) {
      const d = Math.hypot(pos.x - this.player.pos.x, pos.z - this.player.pos.z);
      if (d <= radius) this.hud.addNoise(pos, 1 - d / radius);
    }
  }

  onDoorUsed(door, quem) {
    const p = new THREE.Vector3(door.cx, 1, door.cz);
    this.audio.playAt('door', p, this.player.pos, this.player.yaw, 28, 1);
    this.emitNoise(p, CFG.NOISE.door, quem);
  }

  /** Quem não pode ser esmagado por uma folha descendo. */
  ocupantes() {
    return [
      this.player.alive ? this.player.pos : null,
      this.bot?.alive ? this.bot.pos : null,
    ];
  }

  tryDoor() {
    if (!this.running || this.paused || !this.player.alive) return;
    if (this.rounds.state !== 'playing') return;
    const d = this.world?.doors.nearest(this.player.pos, 3.0);
    if (!d) return;
    // só faz barulho se a folha realmente se mexeu
    if (this.world.doors.toggle(d, this.player.pos, this.ocupantes())) {
      this.onDoorUsed(d, this.player);
    } else {
      this.hud.feed('TEM ALGUÉM NO VÃO');
    }
  }

  // ----------------------------------------------------------------- tiros
  onPlayerShoot() {
    this.muzzleLight.intensity = 3.2;
    const ray = this.player.aimRay();
    const hits = ray.intersectObjects(this.raycastTargets, false);
    const muzzle = this.player.muzzleWorld();

    if (!hits.length) {
      this.spawnTracer(muzzle, ray.ray.at(CFG.RANGE, new THREE.Vector3()));
      return;
    }
    const first = hits[0];
    this.spawnTracer(muzzle, first.point);

    if (first.object === this.bot.hitbox && this.bot.alive && this.rounds.state === 'playing') {
      this.spawnImpact(first.point, EDG.red);
      this.killBot();
    } else {
      this.spawnImpact(first.point, EDG.sand);
      this.audio.playAt('bump', first.point, this.player.pos, this.player.yaw, 30, 0.6);
      this.emitNoise(first.point, CFG.NOISE.bump * 0.5, this.player);
    }
  }

  killBot() {
    this.bot.die();
    this.audio.play('hit', { vol: 0.9 });
    this.hud.feed('ALVO ABATIDO');
    this.rounds.registerKill();
  }

  onBotHitPlayer() {
    if (!this.player.alive || this.rounds.state !== 'playing') return;
    this.player.alive = false;
    this.audio.play('hit', { vol: 1 });
    this.hud.hit();
    this.rounds.registerKill();
  }

  onBotMissed(bot) {
    this.hud.feed('PASSOU PERTO');
    this.audio.playAt('bump', bot.pos, this.player.pos, this.player.yaw, 22, 0.5);
  }

  // ------------------------------------------------------------------ loop
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.running) { this.renderer.render(this.scene, this.camera); return; }

    if (!this.paused) {
      this.rounds.update(dt);
      const vivo = this.rounds.state === 'playing';

      if (vivo) {
        this.player.update(dt);
      } else {
        this.input.takeShoot();                  // descarta cliques fora da fase
        this.player.update(dt * 0.0001);
      }
      if (this.bot && vivo) this.bot.update(dt, this.player);
      else if (this.bot) this.bot.actor.update(dt, 0, this.bot.yaw);

      this.world?.doors.update(dt);
      this._updateEffects(dt);
      this._updateHud(dt, vivo);
    }
    this.renderer.render(this.scene, this.camera);
  }

  _updateHud(dt, vivo) {
    const r = this.rounds;
    if (vivo) {
      this.hud.setTimer(r.phaseTime);
      this.hud.setPhase(r.phaseTime / CFG.PHASE_TIME);
      this.hud.setRole(this.player.role, this._objetivo(this.player.role));
    }
    this.hud.setCooldown(1 - this.player.fireTimer / CFG.FIRE_COOLDOWN);
    this.hud.setStamina(this.player.stamina / CFG.STAMINA_MAX);
    this.hud.setCrosshairWide(this.player.speed > CFG.SPEED_WALK + 0.5);
    this.hud.update(dt, this.player.pos, this.player.yaw);

    if (vivo && this.player.role === 'runner' && this.bot?.alive) {
      const d = this.player.pos.distanceTo(this.bot.pos);
      this.hud.setDanger(d < 12 && this.bot.state === 'chase');
    } else if (!vivo) {
      this.hud.setDanger(false);
    }

    const perto = vivo && this.player.alive ? this.world?.doors.nearest(this.player.pos, 3.0) : null;
    this.hud.prompt(perto
      ? (perto.kind === 'desvio' ? '[E] VIRAR PASSAGEM' : perto.open ? '[E] FECHAR PORTA' : '[E] ABRIR PORTA')
      : null);
  }
}
