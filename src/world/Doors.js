import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CFG } from '../core/config.js';
import { EDG } from '../core/palette.js';
import { DIRS } from './MazeGen.js';

const VAO = CFG.WALL_H;                  // do chão ao teto: nada de fresta em cima
const LARG = CFG.CELL * 0.99;
const T_D = 0.22;
const SPEED = 5.2;                       // m/s de subida
const ABERTA = 0.55;                     // fração da altura a partir da qual já dá para passar

const dirOf = k => DIRS.find(d => d.k === k);

// tons pintados nos vértices; multiplicam a cor da instância
const TOM = { corpo: 1.0, ripa: 1.2, funda: 0.62, escura: 0.4, aviso: 1.5 };
const FACE = [0.94, 0.86, 1.14, 0.6, 1.04, 0.8];   // +X -X +Y -Y +Z -Z

function peca(w, h, d, x, y, z, tom) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const cores = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const f = tom * (FACE[Math.floor(i / 4)] ?? 1);
    cores[i * 3] = cores[i * 3 + 1] = cores[i * 3 + 2] = f;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  return g;
}

/**
 * A folha: uma comporta que corre na vertical, com a base na origem.
 * Ripas horizontais em relevo, como porta de galpão, e faixas de advertência
 * na barra de baixo — é a parte que o jogador vê descendo na frente dele.
 */
function leafGeometry() {
  const p = [peca(LARG, VAO, T_D, 0, VAO / 2, 0, TOM.corpo)];

  // ripas horizontais: dão a leitura do movimento enquanto a folha corre
  const nRipas = 6;
  for (let i = 0; i < nRipas; i++) {
    const y = VAO * ((i + 0.5) / nRipas);
    p.push(peca(LARG - 0.16, VAO / nRipas - 0.1, T_D + 0.07, 0, y, 0, TOM.ripa));
  }
  // guias laterais, encaixadas nos trilhos do batente
  for (const s of [-1, 1]) {
    p.push(peca(0.14, VAO, T_D + 0.12, s * (LARG / 2 - 0.06), VAO / 2, 0, TOM.funda));
  }
  // barra inferior reforçada, com listras de advertência
  p.push(peca(LARG, 0.34, T_D + 0.12, 0, 0.17, 0, TOM.escura));
  for (let i = -2; i <= 2; i++) {
    p.push(peca(0.2, 0.22, T_D + 0.16, i * 0.5, 0.17, 0, TOM.aviso));
  }
  // puxador central, para dar escala
  p.push(peca(0.7, 0.12, T_D + 0.16, 0, VAO * 0.42, 0, TOM.aviso));
  return mergeGeometries(p);
}

/**
 * O batente: dois trilhos laterais e a caixa de recolhimento no alto.
 * A caixa existe para a folha aberta ter onde sumir sem ficar boiando.
 */
function frameGeometry() {
  const half = CFG.CELL / 2;
  return mergeGeometries([
    peca(0.26, VAO, T_D + 0.3, -half + 0.13, VAO / 2, 0, TOM.funda),
    peca(0.26, VAO, T_D + 0.3, half - 0.13, VAO / 2, 0, TOM.funda),
    peca(CFG.CELL, 0.34, T_D + 0.42, 0, VAO - 0.17, 0, TOM.escura),
  ]);
}

/**
 * Portas em guilhotina: sobem e descem dentro do próprio vão.
 *
 * Correr na vertical resolve de raiz o problema que a porta de girar tinha —
 * ela não tem para que lado abrir, então nunca varre por cima de ninguém — e
 * o vão vai do chão até o teto, sem fresta em cima.
 *
 * São de dois tipos:
 *  - simples: fecha uma passagem.
 *  - desvio: duas folhas numa junção; quando uma desce a outra sobe, então há
 *    sempre um caminho aberto e outro fechado. É o que reconfigura o mapa.
 *
 * Nenhuma folha desce sobre quem está embaixo dela: `toggle` recusa.
 */
export class Doors {
  constructor(map, scene) {
    this.map = map;
    this.list = [];
    this.byIndex = new Map();
    this.panels = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    const C = CFG.CELL, half = C / 2;

    // conta os painéis: porta simples tem um, desvio tem dois
    let total = 0;
    for (const d of map.doors) total += d.kind === 'desvio' ? 2 : 1;

    const vc = { vertexColors: true, color: 0xffffff };
    this.leaves = new THREE.InstancedMesh(leafGeometry(), new THREE.MeshLambertMaterial(vc), total);
    this.frames = new THREE.InstancedMesh(frameGeometry(), new THREE.MeshLambertMaterial(vc), total);
    this.leaves.frustumCulled = false;
    this.frames.frustumCulled = false;
    this.group.add(this.frames, this.leaves);

    const m = new THREE.Matrix4(), col = new THREE.Color();
    let slot = 0;

    /** Cria um painel: posição no mundo, orientação e altura inicial. */
    const novoPainel = (door, x, z, rotY, fechado, lado) => {
      const p = { i: slot++, door, x, z, rotY, y: fechado ? 0 : VAO, alvo: fechado ? 0 : VAO, lado };
      this.panels.push(p);
      m.makeRotationY(rotY);
      m.setPosition(x, 0, z);
      this.frames.setMatrixAt(p.i, m);
      return p;
    };

    map.doors.forEach(d => {
      const cx = d.x * C, cz = d.y * C;
      const door = {
        kind: d.kind, x: d.x, y: d.y, idx: d.y * map.W + d.x, cx, cz, tema: d.tema,
      };

      if (d.kind === 'simples') {
        // a folha atravessa a passagem: perpendicular ao sentido de quem passa
        const rot = d.axis === 'z' ? 0 : Math.PI / 2;
        door.open = false;
        door.painel = novoPainel(door, cx, cz, rot, true, null);

        const tema = new THREE.Color(d.tema?.cor ?? EDG.cocoa);
        this.leaves.setColorAt(door.painel.i, col.copy(tema).lerp(new THREE.Color(EDG.tan), 0.3));
        this.frames.setColorAt(door.painel.i, col.copy(tema).lerp(new THREE.Color(EDG.soil), 0.6));
      } else {
        const A = dirOf(d.ladoA), B = dirOf(d.ladoB);
        door.A = A; door.B = B;
        door.blocking = 'A';
        // cada folha fica na borda do lado que ela fecha, virada para a passagem
        const mk = (dir, fechado, lado) => {
          const px = cx + dir.dx * half, pz = cz + dir.dy * half;
          const rot = dir.dx !== 0 ? Math.PI / 2 : 0;
          const p = novoPainel(door, px, pz, rot, fechado, lado);
          this.leaves.setColorAt(p.i, col.setHex(EDG.steel));
          this.frames.setColorAt(p.i, col.setHex(EDG.ink));
          return p;
        };
        door.painelA = mk(A, true, 'A');
        door.painelB = mk(B, false, 'B');
      }

      this.list.push(door);
      this.byIndex.set(door.idx, door);
    });

    this.frames.instanceMatrix.needsUpdate = true;
    this._m = new THREE.Matrix4();
    for (const p of this.panels) this._write(p);
  }

  _write(p) {
    const m = this._m;
    m.makeRotationY(p.rotY);
    m.setPosition(p.x, p.y, p.z);
    this.leaves.setMatrixAt(p.i, m);
    this.leaves.instanceMatrix.needsUpdate = true;
  }

  get(idx) { return this.byIndex.get(idx); }

  // ---------------------------------------------------------------- lógica
  /** A célula está barrada por uma folha baixada? */
  blocksCell(idx) {
    const d = this.byIndex.get(idx);
    if (!d || d.kind !== 'simples') return false;
    return d.painel.y < VAO * ABERTA;
  }

  /** Dá para passar desta célula para a vizinha? (o desvio barra arestas) */
  edgeOpen(x1, y1, x2, y2) {
    const d = this.byIndex.get(y1 * this.map.W + x1);
    if (!d || d.kind !== 'desvio') return true;
    const dx = x2 - x1, dy = y2 - y1;
    for (const p of [d.painelA, d.painelB]) {
      const lado = p.lado === 'A' ? d.A : d.B;
      if (lado.dx === dx && lado.dy === dy) return p.y >= VAO * ABERTA;
    }
    return true;
  }

  // ------------------------------------------------------------- interação
  /** Porta ao alcance da mão: a célula dela ou uma colada. */
  nearest(pos, maxDist = 3.0) {
    const cx = Math.round(pos.x / CFG.CELL), cy = Math.round(pos.z / CFG.CELL);
    let best = null, bd = maxDist * maxDist;
    for (const d of this.list) {
      if (Math.abs(cx - d.x) + Math.abs(cy - d.y) > 1) continue;
      const ddx = d.cx - pos.x, ddz = d.cz - pos.z;
      const s = ddx * ddx + ddz * ddz;
      if (s < bd) { bd = s; best = d; }
    }
    return best;
  }

  /** Alguém está debaixo desta folha? Guilhotina não desce sobre ninguém. */
  _livre(p, ocupantes) {
    for (const o of ocupantes) {
      if (!o) continue;
      const dx = Math.abs(o.x - p.x), dz = Math.abs(o.z - p.z);
      if (dx < CFG.CELL * 0.55 && dz < CFG.CELL * 0.55) return false;
    }
    return true;
  }

  /**
   * Aciona a porta. `ocupantes` são as posições que não podem ser esmagadas —
   * se alguém está debaixo da folha que ia descer, nada acontece.
   * Devolve true se algo se mexeu (é o que decide se sai barulho).
   */
  toggle(door, opener, ocupantes = []) {
    if (door.kind === 'simples') {
      const p = door.painel;
      if (door.open) {
        if (!this._livre(p, ocupantes)) return false;    // tem gente no vão
        door.open = false; p.alvo = 0;
      } else {
        door.open = true; p.alvo = VAO;
      }
      return true;
    }

    // desvio: a folha que está em cima desce e a de baixo sobe
    const vaiFechar = door.blocking === 'A' ? door.painelB : door.painelA;
    const vaiAbrir = door.blocking === 'A' ? door.painelA : door.painelB;
    if (!this._livre(vaiFechar, ocupantes)) return false;
    door.blocking = door.blocking === 'A' ? 'B' : 'A';
    vaiFechar.alvo = 0;
    vaiAbrir.alvo = VAO;
    return true;
  }

  update(dt) {
    const passo = SPEED * dt;
    for (const p of this.panels) {
      if (p.y === p.alvo) continue;
      const d = p.alvo - p.y;
      p.y += Math.abs(d) <= passo ? d : Math.sign(d) * passo;
      this._write(p);
    }
  }

  /**
   * Empurra um círculo para fora das folhas baixadas. Cada folha é uma parede
   * fina no seu lugar; a altura só decide se ela conta ou não.
   */
  collide(pos, radius) {
    let bateu = false;
    for (const p of this.panels) {
      if (p.y >= VAO * ABERTA) continue;                 // já subiu: passa por baixo
      if (Math.abs(p.x - pos.x) > CFG.CELL || Math.abs(p.z - pos.z) > CFG.CELL) continue;
      // meia-extensão da folha nos eixos do mundo
      const ex = p.rotY === 0 ? LARG / 2 : T_D / 2;
      const ez = p.rotY === 0 ? T_D / 2 : LARG / 2;
      const nx = Math.max(p.x - ex, Math.min(pos.x, p.x + ex));
      const nz = Math.max(p.z - ez, Math.min(pos.z, p.z + ez));
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      bateu = true;
      if (d2 > 1e-8) {
        const dist = Math.sqrt(d2), empurra = radius - dist;
        pos.x += (dx / dist) * empurra;
        pos.z += (dz / dist) * empurra;
      } else {
        // exatamente no plano da folha: sai pela face mais próxima
        const px = ex + radius - Math.abs(pos.x - p.x);
        const pz = ez + radius - Math.abs(pos.z - p.z);
        if (px < pz) pos.x += Math.sign(pos.x - p.x || 1) * px;
        else pos.z += Math.sign(pos.z - p.z || 1) * pz;
      }
    }
    return bateu;
  }

  reset() {
    for (const d of this.list) {
      if (d.kind === 'simples') {
        d.open = false;
        d.painel.y = 0; d.painel.alvo = 0;
      } else {
        d.blocking = 'A';
        d.painelA.y = 0; d.painelA.alvo = 0;
        d.painelB.y = VAO; d.painelB.alvo = VAO;
      }
    }
    for (const p of this.panels) this._write(p);
  }

  dispose() {
    this.group.removeFromParent();
    for (const im of [this.leaves, this.frames]) {
      im.geometry.dispose(); im.material.dispose(); im.dispose();
    }
  }
}
