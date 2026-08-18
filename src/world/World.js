import * as THREE from 'three';
import { CFG } from '../core/config.js';
import { EDG } from '../core/palette.js';
import { WALL, DOOR, DIRS, cellAt, mulberry32, roomAt } from './MazeGen.js';
import { Doors } from './Doors.js';

/**
 * Sombreamento assado nos vértices: cada face da caixa ganha um tom fixo e a
 * base escurece um pouco. É o que dá volume ao voxel sem nenhuma sombra
 * dinâmica — custo zero por quadro, e os cantos ficam legíveis de longe.
 */
function shadeBox(geo, height) {
  const FACE = [0.92, 0.82, 1.12, 0.55, 1.0, 0.76];   // +X -X +Y -Y +Z -Z
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let f = FACE[Math.floor(i / 4)] ?? 1;
    const t = (pos.getY(i) + height / 2) / height;
    f *= 0.78 + 0.22 * Math.min(1, Math.max(0, t));
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * O cenário usa material SEM cálculo de luz: a iluminação inteira já está
 * assada nas cores de instância (pools de luminária) e nos vértices (volume
 * das faces). Assim a face virada para baixo do teto aparece do jeito que foi
 * pintada, em vez de apagar por não receber a direcional — e ainda sai mais
 * barato. Luz dinâmica fica só para o que se move: personagens e portas.
 */
const flat = (opts = {}) => new THREE.MeshBasicMaterial({ color: 0xffffff, ...opts });
const lambert = (opts = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, ...opts });

/**
 * A geometria do mapa. Tudo que se repete é InstancedMesh e a iluminação vem
 * assada nas cores de instância: o cenário inteiro sai em ~10 draw calls e
 * nenhuma luz dinâmica pesa no quadro.
 */
export class World {
  constructor(map, scene) {
    this.map = map;
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.propCells = map.blocked;
    this.doors = null;
    this._buildLamps();
    this._build();
    this.doors = new Doors(map, this.root);
  }

  // ------------------------------------------------------------ iluminação
  _buildLamps() {
    const { map } = this;
    const rnd = mulberry32(map.seed ^ 0x1a3b);
    const lamps = [];
    for (const r of map.rooms) {
      const cor = new THREE.Color(r.tema.luz);
      lamps.push({ x: r.cx, y: r.cy, p: 1.45, cor });
      if (r.w >= 5 || r.h >= 5) {
        lamps.push({
          x: r.x + (rnd() < 0.5 ? 0 : r.w - 1),
          y: r.y + (rnd() < 0.5 ? 0 : r.h - 1),
          p: 0.7, cor,
        });
      }
    }
    // Corredor é penumbra: luminária esparsa e fraca. Essa diferença entre
    // sala clara e corredor escuro é de gameplay, não só de enfeite — é onde
    // o fugitivo some e onde o caçador precisa chegar perto para ter certeza.
    const corridor = new THREE.Color(EDG.steel);
    for (let y = 1; y < map.H - 1; y++) {
      for (let x = 1; x < map.W - 1; x++) {
        const i = y * map.W + x;
        if (map.grid[i] === WALL || map.inRoom[i]) continue;
        if ((x * 5 + y * 11) % 7 !== 0) continue;
        lamps.push({ x, y, p: 0.5, cor: corridor });
      }
    }
    this.lamps = lamps;
  }

  /**
   * Luz numa célula: intensidade e cor. O piso é alto de propósito — o mapa
   * precisa ser lido de relance, escuridão só atrapalha a caçada.
   */
  _lightAt(x, y, out = new THREE.Color()) {
    // O piso baixo é de propósito: é ele que cria canto escuro para se esconder.
    // A queda rápida das luminárias faz poças de luz separadas por penumbra —
    // dá para enxergar o mapa, mas não tudo ao mesmo tempo.
    let i = 0.34;
    out.setRGB(0.42, 0.46, 0.58);                   // penumbra levemente azulada
    let wsum = 0.42;
    for (const L of this.lamps) {
      const dx = x - L.x, dy = y - L.y;
      const w = L.p * 2.4 / (1 + (dx * dx + dy * dy) * 0.85);
      if (w < 0.02) continue;
      i += w;
      out.r += L.cor.r * w; out.g += L.cor.g * w; out.b += L.cor.b * w;
      wsum += w;
    }
    out.multiplyScalar(1 / wsum);                   // cor média da luz que chega
    return Math.min(1.6, i);
  }

  // ---------------------------------------------------------------- build
  _build() {
    const { map } = this;
    const C = CFG.CELL;
    const rnd = mulberry32(map.seed ^ 0x9e37);
    const m = new THREE.Matrix4();
    const col = new THREE.Color(), lightCol = new THREE.Color(), base = new THREE.Color();

    /** Tema da sala mais próxima — é o que dá identidade de cor à região. */
    const themeNear = (x, y) => {
      const r = roomAt(map, x, y);
      if (r) return r.tema;
      let best = null, bd = 1e9;
      for (const q of map.rooms) {
        const d = Math.hypot(q.cx - x, q.cy - y);
        if (d < bd) { bd = d; best = q; }
      }
      return best.tema;
    };

    const paint = (x, y, hex, mul = 1) => {
      const inten = this._lightAt(x, y, lightCol);
      base.setHex(hex);
      // a cor da luz tinge a superfície, mas sem lavar a cor própria dela
      col.copy(base).lerp(lightCol.clone().multiply(base).multiplyScalar(1.9), 0.55);
      return col.multiplyScalar(inten * mul);
    };

    // ------------------------------------------------------------- paredes
    const wallCells = [];
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
      if (cellAt(map, x, y) !== WALL) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && cellAt(map, x + dx, y + dy) !== WALL) { touches = true; break; }
      if (touches) wallCells.push([x, y]);
    }

    this.walls = new THREE.InstancedMesh(
      shadeBox(new THREE.BoxGeometry(C, CFG.WALL_H, C), CFG.WALL_H),
      flat({ vertexColors: true }), wallCells.length);
    wallCells.forEach(([x, y], i) => {
      m.makeTranslation(x * C, CFG.WALL_H / 2, y * C);
      this.walls.setMatrixAt(i, m);
      this.walls.setColorAt(i, paint(x, y, EDG.slate, 0.92 + rnd() * 0.16));
    });
    this.walls.instanceMatrix.needsUpdate = true;
    this.root.add(this.walls);

    // faixa na altura do peito com a cor da sala: o landmark que orienta
    this.band = new THREE.InstancedMesh(
      new THREE.BoxGeometry(C * 1.02, 0.34, C * 1.02),
      flat(), wallCells.length);
    wallCells.forEach(([x, y], i) => {
      m.makeTranslation(x * C, 1.62, y * C);
      this.band.setMatrixAt(i, m);
      this.band.setColorAt(i, paint(x, y, themeNear(x, y).cor, 1.15));
    });
    this.band.instanceMatrix.needsUpdate = true;
    this.root.add(this.band);

    // rodapé escuro: acabamento e ancoragem visual no chão
    this.skirt = new THREE.InstancedMesh(
      new THREE.BoxGeometry(C * 1.04, 0.42, C * 1.04), flat(), wallCells.length);
    wallCells.forEach(([x, y], i) => {
      m.makeTranslation(x * C, 0.21, y * C);
      this.skirt.setMatrixAt(i, m);
      this.skirt.setColorAt(i, paint(x, y, EDG.ink, 1.0));
    });
    this.skirt.instanceMatrix.needsUpdate = true;
    this.root.add(this.skirt);

    // ---------------------------------------------------------- chão e teto
    const floorCells = [];
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++)
      if (cellAt(map, x, y) !== WALL) floorCells.push([x, y]);

    const tile = new THREE.BoxGeometry(C, 0.2, C);
    this.floor = new THREE.InstancedMesh(tile, flat(), floorCells.length);
    floorCells.forEach(([x, y], i) => {
      m.makeTranslation(x * C, -0.1, y * C);
      this.floor.setMatrixAt(i, m);
      const emSala = map.inRoom[y * map.W + x];
      const xadrez = ((x + y) & 1) ? 1.12 : 0.94;
      // piso da sala puxa para a cor do tema; corredor fica neutro e mais escuro
      const hex = emSala ? themeNear(x, y).cor : EDG.denim;
      const c = paint(x, y, hex, xadrez * (emSala ? 0.62 : 0.5));
      this.floor.setColorAt(i, c);
    });
    this.floor.instanceMatrix.needsUpdate = true;
    this.root.add(this.floor);

    this.ceil = new THREE.InstancedMesh(
      new THREE.BoxGeometry(C, 0.26, C), flat(), floorCells.length);
    floorCells.forEach(([x, y], i) => {
      m.makeTranslation(x * C, CFG.WALL_H + 0.13, y * C);
      this.ceil.setMatrixAt(i, m);
      this.ceil.setColorAt(i, paint(x, y, EDG.denim, 0.85));
    });
    this.ceil.instanceMatrix.needsUpdate = true;
    this.root.add(this.ceil);

    // vigas atravessando o teto: profundidade e ritmo ao olhar para cima
    const beamCells = floorCells.filter(([x, y]) => (x + y * 2) % 4 === 0);
    if (beamCells.length) {
      this.beams = new THREE.InstancedMesh(
        shadeBox(new THREE.BoxGeometry(C, 0.28, 0.42), 0.28), flat({ vertexColors: true }), beamCells.length);
      beamCells.forEach(([x, y], i) => {
        m.makeTranslation(x * C, CFG.WALL_H - 0.15, y * C);
        this.beams.setMatrixAt(i, m);
        this.beams.setColorAt(i, paint(x, y, EDG.bark, 1.25));
      });
      this.beams.instanceMatrix.needsUpdate = true;
      this.root.add(this.beams);
    }

    // ---------------------------------------------------------- luminárias
    const lampGeo = new THREE.BoxGeometry(C * 0.46, 0.12, C * 0.26);
    this.lampGlow = new THREE.InstancedMesh(
      lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.lamps.length);
    this.lampBody = new THREE.InstancedMesh(
      new THREE.BoxGeometry(C * 0.56, 0.16, C * 0.36), flat(), this.lamps.length);
    this.lamps.forEach((L, i) => {
      m.makeTranslation(L.x * C, CFG.WALL_H - 0.2, L.y * C);
      this.lampGlow.setMatrixAt(i, m);
      col.copy(L.cor).multiplyScalar(0.75 + L.p * 0.5);
      this.lampGlow.setColorAt(i, col);
      m.makeTranslation(L.x * C, CFG.WALL_H - 0.1, L.y * C);
      this.lampBody.setMatrixAt(i, m);
      this.lampBody.setColorAt(i, col.setHex(EDG.ink).multiplyScalar(1.1));
    });
    this.lampGlow.instanceMatrix.needsUpdate = true;
    this.lampBody.instanceMatrix.needsUpdate = true;
    this.root.add(this.lampGlow, this.lampBody);

    // -------------------------------------------------- cobertura em camadas
    const altos = map.props.filter(p => p.alto);
    const baixos = map.props.filter(p => !p.alto);

    if (altos.length) {
      this.pillars = new THREE.InstancedMesh(
        shadeBox(new THREE.BoxGeometry(C * 0.56, CFG.WALL_H, C * 0.56), CFG.WALL_H),
        flat({ vertexColors: true }), altos.length);
      altos.forEach((p, i) => {
        m.makeTranslation(p.x * C, CFG.WALL_H / 2, p.y * C);
        this.pillars.setMatrixAt(i, m);
        this.pillars.setColorAt(i, paint(p.x, p.y, p.tema.cor, 0.85));
      });
      this.pillars.instanceMatrix.needsUpdate = true;
      this.root.add(this.pillars);
    }

    if (baixos.length) {
      this.crates = new THREE.InstancedMesh(
        shadeBox(new THREE.BoxGeometry(C * 0.62, 1.1, C * 0.62), 1.1),
        flat({ vertexColors: true }), baixos.length);
      baixos.forEach((p, i) => {
        m.makeRotationY((Math.floor(rnd() * 4) * Math.PI) / 2 + (rnd() - 0.5) * 0.3);
        m.setPosition(p.x * C, 0.55, p.y * C);
        this.crates.setMatrixAt(i, m);
        this.crates.setColorAt(i, paint(p.x, p.y, EDG.cocoa, 1.05));
      });
      this.crates.instanceMatrix.needsUpdate = true;
      this.root.add(this.crates);
    }

    this.solidMeshes = [this.walls, this.floor, this.band, this.skirt];
    if (this.pillars) this.solidMeshes.push(this.pillars);
    if (this.crates) this.solidMeshes.push(this.crates);
  }

  // ------------------------------------------------------------- consultas
  /**
   * Obstáculo permanente: parede ou pilar. Portas não entram aqui — elas são
   * pedágio para a navegação, não muro.
   */
  staticSolid(cx, cy) {
    if (cellAt(this.map, cx, cy) === WALL) return true;
    return this.propCells.has(cy * this.map.W + cx);
  }

  /**
   * Custo extra de atravessar esta aresta por causa de porta.
   * Baixo de propósito: o mapa tem loops demais, e um pedágio caro fazia o bot
   * contornar sempre e nunca encostar numa porta — o que tirava do jogo justo
   * o barulho que denuncia por onde ele andou.
   */
  doorCost(x1, y1, x2, y2) {
    if (!this.doors) return 0;
    let c = 0;
    if (this.doors.blocksCell(y2 * this.map.W + x2)) c += 1.2;   // precisa levantar
    if (!this.doors.edgeOpen(x1, y1, x2, y2)) c += 1.5;          // precisa virar o desvio
    if (!this.doors.edgeOpen(x2, y2, x1, y1)) c += 1.5;
    return c;
  }

  /** A célula barra movimento? (parede, pilar alto ou porta simples fechada) */
  solid(cx, cy) {
    const t = cellAt(this.map, cx, cy);
    if (t === WALL) return true;
    if (this.propCells.has(cy * this.map.W + cx)) return true;
    if (t === DOOR && this.doors) return this.doors.blocksCell(cy * this.map.W + cx);
    return false;
  }

  /** Dá para ir da célula A para a vizinha B? (porta de desvio barra arestas) */
  edgeOpen(x1, y1, x2, y2) {
    if (this.solid(x2, y2)) return false;
    if (!this.doors) return true;
    return this.doors.edgeOpen(x1, y1, x2, y2) && this.doors.edgeOpen(x2, y2, x1, y1);
  }

  /**
   * A célula barra a VISÃO?
   * Difere de `solid`: caixote baixo para o corpo mas não tapa o olho, que é
   * justamente o que o torna cobertura e não parede.
   */
  opaque(cx, cy) {
    const t = cellAt(this.map, cx, cy);
    if (t === WALL) return true;
    if (this.map.opacos.has(cy * this.map.W + cx)) return true;
    if (t === DOOR && this.doors) return this.doors.blocksCell(cy * this.map.W + cx);
    return false;
  }

  /**
   * Empurra um círculo para fora do cenário e das folhas de porta.
   *
   * A resolução roda algumas vezes seguidas, e não uma só. Numa quina, tirar o
   * corpo de uma parede costuma enfiá-lo na outra; com um passe único ele saía
   * do outro lado e ficava preso dentro do bloco. O mesmo vale para a folha da
   * porta descendo ao lado do vão: ela empurra, e é a passada seguinte que
   * conserta o resultado contra a parede.
   */
  collide(pos, radius) {
    let bateu = false;
    for (let passe = 0; passe < 3; passe++) {
      let mexeu = this._colidirCelulas(pos, radius);
      if (this.doors?.collide(pos, radius)) mexeu = true;
      if (mexeu) bateu = true;
      else break;                      // nada encostou: não precisa repetir
    }
    return bateu;
  }

  /** Um passe de resolução contra as células sólidas em volta. */
  _colidirCelulas(pos, radius) {
    const C = CFG.CELL, half = C / 2;
    const cx = Math.round(pos.x / C), cy = Math.round(pos.z / C);
    let bateu = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gy = cy + dy;
        if (!this.solid(gx, gy)) continue;
        const bx = gx * C, bz = gy * C;
        const nx = Math.max(bx - half, Math.min(pos.x, bx + half));
        const nz = Math.max(bz - half, Math.min(pos.z, bz + half));
        const ox = pos.x - nx, oz = pos.z - nz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= radius * radius) continue;
        bateu = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = radius - d;
          pos.x += (ox / d) * push; pos.z += (oz / d) * push;
        } else {
          // centro dentro do bloco: sai pela face que exige menos deslocamento,
          // mas só entre as faces que dão para espaço livre
          const saidas = [
            { eixo: 'x', s: 1, custo: bx + half + radius - pos.x, livre: !this.solid(gx + 1, gy) },
            { eixo: 'x', s: -1, custo: pos.x - (bx - half - radius), livre: !this.solid(gx - 1, gy) },
            { eixo: 'z', s: 1, custo: bz + half + radius - pos.z, livre: !this.solid(gx, gy + 1) },
            { eixo: 'z', s: -1, custo: pos.z - (bz - half - radius), livre: !this.solid(gx, gy - 1) },
          ].filter(o => o.livre);
          const alvo = (saidas.length ? saidas : [{ eixo: 'x', s: 1, custo: 0 }])
            .reduce((a, b) => (a.custo <= b.custo ? a : b));
          if (alvo.eixo === 'x') pos.x = bx + alvo.s * (half + radius);
          else pos.z = bz + alvo.s * (half + radius);
        }
      }
    }
    return bateu;
  }

  dispose() {
    this.doors?.dispose();
    this.root.traverse(o => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); o.dispose?.(); }
    });
    this.root.removeFromParent();
  }
}
