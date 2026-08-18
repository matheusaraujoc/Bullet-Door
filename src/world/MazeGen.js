import { CFG } from '../core/config.js';

export const WALL = 0, FLOOR = 1, DOOR = 2;

// direções, sempre nesta ordem: N, S, L, O
export const DIRS = [
  { k: 'N', dx: 0, dy: -1 },
  { k: 'S', dx: 0, dy: 1 },
  { k: 'L', dx: 1, dy: 0 },
  { k: 'O', dx: -1, dy: 0 },
];

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SECT = 3;          // 3x3 blocos de sala
const BLOCK = 5;         // células por bloco
const STEP = BLOCK + 1;  // bloco + a faixa de corredor

/**
 * Identidade visual de cada sala. É o que permite decorar o mapa em 30
 * segundos: "a sala vermelha" gruda na cabeça, "a terceira à esquerda" não.
 */
export const THEMES = [
  { nome: 'oficina',    cor: 0xbe4a2f, luz: 0xfeae34 },
  { nome: 'frio',       cor: 0x124e89, luz: 0x2ce8f5 },
  { nome: 'estufa',     cor: 0x3e8948, luz: 0x63c74d },
  { nome: 'deposito',   cor: 0xb86f50, luz: 0xfee761 },
  { nome: 'reator',     cor: 0xa22633, luz: 0xf77622 },
  { nome: 'sala-limpa', cor: 0x8b9bb4, luz: 0xffffff },
  { nome: 'arquivo',    cor: 0x68386c, luz: 0xb55088 },
  { nome: 'hangar',     cor: 0x5a6988, luz: 0xc0cbdc },
  { nome: 'mina',       cor: 0x733e39, luz: 0xf77622 },
];

/**
 * Traçado em malha: nove salas separadas por faixas de corredor que se cruzam.
 *
 * A malha é o que faz o mapa funcionar. Ela cria loops grandes (dá para dar a
 * volta inteira sem passar duas vezes pelo mesmo lugar) e cruzamentos de três
 * ou quatro saídas — que é onde moram as portas de desvio. Sem isso o mapa
 * vira um punhado de becos e a caçada acaba no primeiro canto.
 */
export function generateMap(seed) {
  const rnd = mulberry32(seed);
  const W = SECT * STEP + 1, H = W;            // 19x19
  const g = new Uint8Array(W * H);
  const at = (x, y) => y * W + x;
  const inb = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? WALL : g[at(x, y)]);

  // linhas da malha de corredor: x = 6, 12  e  y = 6, 12
  const lanesX = [], lanesY = [];
  for (let i = 1; i < SECT; i++) { lanesX.push(i * STEP); lanesY.push(i * STEP); }

  // ------------------------------------------------------- 1. corredores
  // a malha inteira é escavada; depois alguns trechos são fechados para o
  // desenho não ficar quadriculado demais
  for (const lx of lanesX) for (let y = 1; y < H - 1; y++) g[at(lx, y)] = FLOOR;
  for (const ly of lanesY) for (let x = 1; x < W - 1; x++) g[at(x, ly)] = FLOOR;

  // ------------------------------------------------- 1b. avenidas
  // alguns trechos da malha ganham o dobro de largura: quebra a sensação de
  // "tudo igual" e cria linhas de visão longas, que pedem outro tipo de jogo
  const avenidas = [];
  for (const lx of lanesX) {
    if (rnd() > 0.45) continue;
    const lado = rnd() < 0.5 ? -1 : 1;
    const de = 1 + Math.floor(rnd() * 6), ate = de + 5 + Math.floor(rnd() * 7);
    for (let y = de; y <= Math.min(ate, H - 2); y++) {
      const nx = lx + lado;
      if (nx > 0 && nx < W - 1) g[at(nx, y)] = FLOOR;
    }
    avenidas.push({ eixo: 'x', linha: lx, lado });
  }
  for (const ly of lanesY) {
    if (rnd() > 0.45) continue;
    const lado = rnd() < 0.5 ? -1 : 1;
    const de = 1 + Math.floor(rnd() * 6), ate = de + 5 + Math.floor(rnd() * 7);
    for (let x = de; x <= Math.min(ate, W - 2); x++) {
      const ny = ly + lado;
      if (ny > 0 && ny < H - 1) g[at(x, ny)] = FLOOR;
    }
    avenidas.push({ eixo: 'y', linha: ly, lado });
  }

  // -------------------------------------------------------- 2. as salas
  // Cada bloco sorteia um tipo. Sala fechada é o padrão; pátio é um bloco
  // aberto sem paredes, que muda completamente como aquele pedaço se joga.
  const rooms = [];
  const themes = THEMES.slice();
  for (let i = themes.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [themes[i], themes[j]] = [themes[j], themes[i]];
  }

  for (let sy = 0; sy < SECT; sy++) {
    for (let sx = 0; sx < SECT; sx++) {
      const ox = 1 + sx * STEP, oy = 1 + sy * STEP;   // canto do bloco 5x5
      const idx = sy * SECT + sx;
      const sorte = rnd();
      const patio = sorte < 0.18;                     // bloco escancarado
      const recorte = !patio && sorte < 0.38;         // sala com canto comido

      // no máximo 4 das 5 células: a folga é a parede onde a porta vai morar
      const w = patio ? BLOCK : 3 + Math.floor(rnd() * 2);
      const h = patio ? BLOCK : 3 + Math.floor(rnd() * 2);
      const x = ox + Math.floor(rnd() * (BLOCK - w + 1));
      const y = oy + Math.floor(rnd() * (BLOCK - h + 1));

      const r = {
        x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1),
        sx, sy, idx, tema: themes[idx], patio,
      };
      rooms.push(r);
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) g[at(xx, yy)] = FLOOR;

      // recorte em L: come um canto da sala, dando formato irregular
      if (recorte && w >= 4 && h >= 4) {
        const cx0 = rnd() < 0.5 ? x : x + w - 1;
        const cy0 = rnd() < 0.5 ? y : y + h - 1;
        g[at(cx0, cy0)] = WALL;
        r.recorte = [cx0, cy0];
      }
    }
  }

  const inRoom = new Uint8Array(g.length);
  for (const r of rooms)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) inRoom[at(x, y)] = 1;

  // ------------------------------- 3. ligar cada sala à malha de corredor
  // Cada ligação é um furo na parede da sala, e é ali que a porta vai nascer.
  // Nem todo lado dá certo: o de fora do mapa acaba na borda. Por isso a
  // tentativa é feita lado a lado até conseguir DUAS saídas de verdade —
  // sala com saída única é ratoeira, e ratoeira acaba com a graça de fugir.
  const stubs = [];

  /** Escava da parede da sala até tocar o corredor. Devolve a célula do furo. */
  const abrirLado = (l, tema, sala) => {
    let x = l.x, y = l.y, passos = 0;
    const caminho = [];
    while (inb(x, y) && passos < 4 && g[at(x, y)] === WALL) {
      g[at(x, y)] = FLOOR;
      caminho.push([x, y]);
      x += l.dx; y += l.dy; passos++;
    }
    // não chegou a lugar nenhum: desfaz, senão fica um beco cego
    if (!caminho.length || !inb(x, y) || g[at(x, y)] === WALL) {
      for (const [cx2, cy2] of caminho) g[at(cx2, cy2)] = WALL;
      return null;
    }
    stubs.push({ cel: caminho[0], dir: l.k, tema, sala });
    return caminho[0];
  };

  const ladosDe = r => [
    { k: 'O', x: r.x - 1, y: r.cy, dx: -1, dy: 0 },
    { k: 'L', x: r.x + r.w, y: r.cy, dx: 1, dy: 0 },
    { k: 'N', x: r.cx, y: r.y - 1, dx: 0, dy: -1 },
    { k: 'S', x: r.cx, y: r.y + r.h, dx: 0, dy: 1 },
  ].filter(l => inb(l.x, l.y) && g[at(l.x, l.y)] === WALL);

  for (const r of rooms) {
    if (r.patio) continue;             // pátio já é aberto para os corredores
    const lados = ladosDe(r);
    for (let i = lados.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [lados[i], lados[j]] = [lados[j], lados[i]];
    }
    // alterna eixo para as saídas não saírem todas pelo mesmo lado
    const fila = [];
    const h = lados.filter(l => l.dx !== 0), v = lados.filter(l => l.dy !== 0);
    while (h.length || v.length) {
      if (h.length) fila.push(h.shift());
      if (v.length) fila.push(v.shift());
    }

    const alvo = 2 + (rnd() < 0.3 ? 1 : 0);
    let feitas = 0;
    for (const l of fila) {
      if (feitas >= alvo) break;
      if (abrirLado(l, r.tema, r.idx)) feitas++;
    }
    r.saidas = feitas;
  }

  // rede de segurança: se alguma sala ficou mal servida, insiste nos lados
  // que sobraram antes de seguir adiante
  for (const r of rooms) {
    if (r.patio || r.saidas >= 2) continue;
    for (const l of ladosDe(r)) {
      if (r.saidas >= 2) break;
      if (abrirLado(l, r.tema, r.idx)) r.saidas++;
    }
  }

  // ------------------------------------------- 4. quebrar a rigidez da malha
  // fecha alguns trechos de corredor, desde que o mapa siga inteiro
  const conectado = extra => {
    const solid = i => g[i] === WALL || i === extra;
    let start = -1, total = 0;
    for (let i = 0; i < g.length; i++) if (!solid(i)) { total++; if (start < 0) start = i; }
    if (start < 0) return false;
    const vis = new Uint8Array(g.length), st = [start];
    vis[start] = 1; let reach = 0;
    while (st.length) {
      const i = st.pop(); reach++;
      const x = i % W, y = (i / W) | 0;
      for (const d of DIRS) {
        const nx = x + d.dx, ny = y + d.dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = at(nx, ny);
        if (!vis[j] && !solid(j)) { vis[j] = 1; st.push(j); }
      }
    }
    return reach === total;
  };

  const candidatos = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = at(x, y);
    if (g[i] !== FLOOR || inRoom[i]) continue;
    if (stubs.some(s => s.cel[0] === x && s.cel[1] === y)) continue;
    candidatos.push(i);
  }
  let fechados = 0;
  const limite = Math.floor(candidatos.length * 0.14);
  for (let n = candidatos.length - 1; n > 0 && fechados < limite; n--) {
    const k = Math.floor(rnd() * (n + 1));
    [candidatos[k], candidatos[n]] = [candidatos[n], candidatos[k]];
    const i = candidatos[n];
    if (!conectado(i)) continue;
    g[i] = WALL; fechados++;
  }

  // ------------------------------------------------- 4b. nada de beco sem saída
  // Toda célula pisável precisa de pelo menos DUAS saídas. Beco é onde a
  // caçada morre: o fugitivo entra, descobre que não tem para onde ir e vira
  // tiro fácil. Aqui cada beco vira atalho (o que ainda cria um loop novo) e,
  // quando não dá para abrir nada, a célula some.
  const grau = (x, y) => DIRS.reduce((n, d) => n + (get(x + d.dx, y + d.dy) !== WALL ? 1 : 0), 0);
  let mexeu = true, voltas = 0;
  while (mexeu && voltas++ < 60) {
    mexeu = false;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (g[at(x, y)] === WALL || grau(x, y) >= 2) continue;
        let abriu = false;
        for (const d of DIRS) {
          const nx = x + d.dx, ny = y + d.dy;
          if (!inb(nx, ny) || g[at(nx, ny)] !== WALL) continue;
          // furar esta parede alcança outro trecho já pisável?
          const ax = x + d.dx * 2, ay = y + d.dy * 2;
          if (!inb(ax, ay) || g[at(ax, ay)] === WALL) continue;
          g[at(nx, ny)] = FLOOR;
          abriu = true; mexeu = true;
          break;
        }
        if (!abriu) { g[at(x, y)] = WALL; mexeu = true; }
      }
    }
  }

  // ------------------------------------------------------------ 5. portas
  const exitsOf = (x, y) => DIRS.filter(d => get(x + d.dx, y + d.dy) !== WALL);
  const doors = [];
  const usada = new Uint8Array(g.length);
  const pertoDePorta = (x, y) => {
    for (const d of DIRS) if (inb(x + d.dx, y + d.dy) && usada[at(x + d.dx, y + d.dy)]) return true;
    return usada[at(x, y)] === 1;
  };

  // 5a. porta simples em cada ligação sala-corredor
  for (const s of stubs) {
    const [x, y] = s.cel;
    if (g[at(x, y)] !== FLOOR || pertoDePorta(x, y)) continue;
    const ex = exitsOf(x, y);
    if (ex.length !== 2) continue;
    const vertical = ex.every(d => d.k === 'N' || d.k === 'S');
    const horizontal = ex.every(d => d.k === 'L' || d.k === 'O');
    if (!vertical && !horizontal) continue;
    g[at(x, y)] = DOOR;
    usada[at(x, y)] = 1;
    doors.push({ kind: 'simples', x, y, axis: vertical ? 'z' : 'x', tema: s.tema });
  }

  // 5b. portas de desvio nos cruzamentos: fecham um caminho e abrem outro
  const cruzamentos = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = at(x, y);
    if (g[i] !== FLOOR || inRoom[i] || pertoDePorta(x, y)) continue;
    if (exitsOf(x, y).length < 3) continue;
    cruzamentos.push({ x, y });
  }
  // usa parte dos cruzamentos, não todos: o mapa tem que continuar previsível
  for (let n = cruzamentos.length - 1; n > 0; n--) {
    const k = Math.floor(rnd() * (n + 1));
    [cruzamentos[k], cruzamentos[n]] = [cruzamentos[n], cruzamentos[k]];
  }
  const quantos = Math.max(2, Math.round(cruzamentos.length * 0.28));
  for (const c of cruzamentos.slice(0, quantos)) {
    if (pertoDePorta(c.x, c.y)) continue;
    const ex = exitsOf(c.x, c.y);
    const pares = [];
    for (const a of ex) for (const b of ex) if ((a.dx === 0) !== (b.dx === 0)) pares.push([a, b]);
    if (!pares.length) continue;
    const [a, b] = pares[Math.floor(rnd() * pares.length)];
    g[at(c.x, c.y)] = DOOR;
    usada[at(c.x, c.y)] = 1;
    doors.push({ kind: 'desvio', x: c.x, y: c.y, ladoA: a.k, ladoB: b.k, tema: null });
  }

  // ---------------------------------------- 6. cobertura em dois patamares
  const props = [];
  const blocked = new Set();
  const conectadoCom = extra => {
    const solid = i => g[i] === WALL || blocked.has(i) || i === extra;
    let start = -1, total = 0;
    for (let i = 0; i < g.length; i++) if (!solid(i)) { total++; if (start < 0) start = i; }
    if (start < 0) return false;
    const vis = new Uint8Array(g.length), st = [start];
    vis[start] = 1; let reach = 0;
    while (st.length) {
      const i = st.pop(); reach++;
      const x = i % W, y = (i / W) | 0;
      for (const d of DIRS) {
        const nx = x + d.dx, ny = y + d.dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = at(nx, ny);
        if (!vis[j] && !solid(j)) { vis[j] = 1; st.push(j); }
      }
    }
    return reach === total;
  };

  // Todo obstáculo tem corpo — inclusive o caixote baixo. O que muda entre os
  // dois é a VISÃO: o pilar alto tampa, o caixote não. É isso que faz dele
  // cobertura de verdade: você se abaixa atrás dele, mas continua enxergando.
  const opacos = new Set();
  for (const r of rooms) {
    const n = 1 + Math.floor(rnd() * 2 + (r.w * r.h > 12 ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const x = r.x + Math.floor(rnd() * r.w);
      const y = r.y + Math.floor(rnd() * r.h);
      const idx = at(x, y);
      if (g[idx] !== FLOOR || props.some(q => q.x === x && q.y === y)) continue;

      // Agora que toda peça tem corpo, ela não pode nascer em cima de uma
      // passagem: longe de porta, e só onde há espaço de sobra em volta.
      // Caixote entalado num vão vira rolha, não cobertura.
      const grau = DIRS.filter(d => g[at(x + d.dx, y + d.dy)] !== WALL).length;
      if (grau < 3) continue;
      const perto = DIRS.some(d => {
        const j = at(x + d.dx, y + d.dy);
        return g[j] === DOOR;
      }) || g[idx] === DOOR;
      if (perto) continue;

      // e o mapa tem que continuar inteiro com ela no lugar
      if (!conectadoCom(idx)) continue;
      const miolo = x > r.x && x < r.x + r.w - 1 && y > r.y && y < r.y + r.h - 1;
      const alto = miolo && rnd() < 0.5;
      blocked.add(idx);
      if (alto) opacos.add(idx);
      props.push({ x, y, alto, tema: r.tema });
    }
  }

  return { grid: g, W, H, rooms, doors, props, blocked, opacos, seed, inRoom };
}

// ------------------------------------------------------------------ helpers
export function cellAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.W || y >= map.H) return WALL;
  return map.grid[y * map.W + x];
}
export function worldToCell(v) {
  return { x: Math.round(v.x / CFG.CELL), y: Math.round(v.z / CFG.CELL) };
}
export function cellToWorld(cx, cy, out = { x: 0, z: 0 }) {
  out.x = cx * CFG.CELL; out.z = cy * CFG.CELL; return out;
}

/** Célula de chão livre dentro de uma sala, opcionalmente longe de um ponto. */
export function randomFloorCell(map, rnd, awayFrom = null, minDist = 0) {
  const pool = [];
  for (const r of map.rooms)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        if (cellAt(map, x, y) === FLOOR && !map.blocked.has(y * map.W + x)) pool.push({ x, y });
  if (!pool.length) return { x: 1, y: 1 };
  for (let i = 0; i < 300; i++) {
    const c = pool[Math.floor(rnd() * pool.length)];
    if (!awayFrom) return c;
    if (Math.hypot(c.x - awayFrom.x, c.y - awayFrom.y) >= minDist) return c;
  }
  return pool[Math.floor(rnd() * pool.length)];
}

/** Em que sala está a célula (ou null se for corredor). */
export function roomAt(map, x, y) {
  for (const r of map.rooms)
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
  return null;
}
