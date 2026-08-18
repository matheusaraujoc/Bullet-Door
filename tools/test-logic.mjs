// Testes da lógica que não depende de WebGL: mapa, navegação, portas e rodadas.
//   node tools/test-logic.mjs
import { generateMap, cellAt, randomFloorCell, mulberry32, roomAt, DIRS, WALL, DOOR }
  from '../src/world/MazeGen.js';
import { findPath, hasLineOfSight, gridDistance } from '../src/ai/Pathfinder.js';
import { RoundManager } from '../src/core/RoundManager.js';
import { CFG } from '../src/core/config.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FALHOU:', msg); } };
const section = t => console.log(`\n== ${t}`);
const dirOf = k => DIRS.find(d => d.k === k);

/**
 * World falso com a mesma lógica de portas do jogo, sem nada de gráfico.
 * `estados` permite forçar portas abertas/fechadas para testar bloqueio.
 */
function fakeWorld(map, { abertas = false, desvioEmB = false } = {}) {
  const byIndex = new Map();
  for (const d of map.doors) {
    const idx = d.y * map.W + d.x;
    byIndex.set(idx, d.kind === 'simples'
      ? { ...d, idx, open: abertas }
      : { ...d, idx, A: dirOf(d.ladoA), B: dirOf(d.ladoB), blocking: desvioEmB ? 'B' : 'A' });
  }
  const doors = {
    get: i => byIndex.get(i),
    blocksCell: i => {
      const d = byIndex.get(i);
      return !!d && d.kind === 'simples' && !d.open;
    },
    edgeOpen: (x1, y1, x2, y2) => {
      const d = byIndex.get(y1 * map.W + x1);
      if (!d || d.kind !== 'simples' === false) { /* segue */ }
      if (!d || d.kind !== 'desvio') return true;
      const lado = d.blocking === 'A' ? d.A : d.B;
      return !(lado.dx === x2 - x1 && lado.dy === y2 - y1);
    },
    list: [...byIndex.values()],
  };
  const world = {
    map, doors,
    propCells: map.blocked,
    staticSolid(x, y) {
      return cellAt(map, x, y) === WALL || map.blocked.has(y * map.W + x);
    },
    solid(x, y) {
      if (this.staticSolid(x, y)) return true;
      return cellAt(map, x, y) === DOOR && doors.blocksCell(y * map.W + x);
    },
    opaque(x, y) { return this.solid(x, y); },
    edgeOpen(x1, y1, x2, y2) {
      if (this.solid(x2, y2)) return false;
      return doors.edgeOpen(x1, y1, x2, y2) && doors.edgeOpen(x2, y2, x1, y1);
    },
    doorCost(x1, y1, x2, y2) {
      let c = 0;
      if (doors.blocksCell(y2 * map.W + x2)) c += 2.5;
      if (!doors.edgeOpen(x1, y1, x2, y2)) c += 3;
      if (!doors.edgeOpen(x2, y2, x1, y1)) c += 3;
      return c;
    },
  };
  return world;
}

// ------------------------------------------------------------------ 1. mapa
section('geração de mapa (40 seeds)');
let minS = 99, maxS = 0, minD = 99, maxD = 0;
for (let s = 0; s < 40; s++) {
  const map = generateMap(s * 977 + 13);

  // o espaço jogável tem que ser uma peça só
  let total = 0, start = -1;
  for (let i = 0; i < map.grid.length; i++) {
    if (map.grid[i] !== WALL) { total++; if (start < 0) start = i; }
  }
  const seen = new Uint8Array(map.grid.length);
  const st = [start]; seen[start] = 1; let reach = 0;
  while (st.length) {
    const i = st.pop(); reach++;
    const x = i % map.W, y = (i / map.W) | 0;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (cellAt(map, nx, ny) === WALL) continue;
      const j = ny * map.W + nx;
      if (!seen[j]) { seen[j] = 1; st.push(j); }
    }
  }
  ok(reach === total, `seed ${map.seed}: mapa partido (${reach}/${total})`);
  ok(map.rooms.length === 9, `seed ${map.seed}: ${map.rooms.length} salas`);

  const simples = map.doors.filter(d => d.kind === 'simples');
  const desvios = map.doors.filter(d => d.kind === 'desvio');
  // pátios são blocos abertos e não têm porta, então o piso é mais baixo do
  // que quando toda sala era fechada; o que importa é ter os dois tipos
  ok(simples.length >= 3, `seed ${map.seed}: só ${simples.length} portas de sala`);
  ok(desvios.length >= 2, `seed ${map.seed}: só ${desvios.length} portas de desvio`);
  ok(map.doors.length >= 8, `seed ${map.seed}: só ${map.doors.length} portas no total`);
  minS = Math.min(minS, simples.length); maxS = Math.max(maxS, simples.length);
  minD = Math.min(minD, desvios.length); maxD = Math.max(maxD, desvios.length);

  // corredores de verdade: sem eles não há junção nem rota alternativa
  let corredor = 0;
  for (let i = 0; i < map.grid.length; i++) if (map.grid[i] !== WALL && !map.inRoom[i]) corredor++;
  ok(corredor >= 40, `seed ${map.seed}: só ${corredor} células de corredor`);

  // Nada de beco: toda célula pisável tem que ter pelo menos duas saídas.
  // Com uma só, quem entra ali é obrigado a voltar pelo mesmo caminho — é onde
  // a fuga acaba e o jogo perde a graça.
  for (let y = 1; y < map.H - 1; y++) {
    for (let x = 1; x < map.W - 1; x++) {
      if (cellAt(map, x, y) === WALL) continue;
      const saidas = DIRS.filter(d => cellAt(map, x + d.dx, y + d.dy) !== WALL).length;
      ok(saidas >= 2, `seed ${map.seed}: beco sem saída em ${x},${y} (${saidas} saída)`);
    }
  }

  // borda sempre fechada
  for (let x = 0; x < map.W; x++) {
    ok(cellAt(map, x, 0) === WALL && cellAt(map, x, map.H - 1) === WALL, 'buraco na borda');
  }

  // porta simples só vale em passagem estreita, senão a folha não fecha o vão
  for (const d of simples) {
    const n = cellAt(map, d.x, d.y - 1) !== WALL, s2 = cellAt(map, d.x, d.y + 1) !== WALL;
    const w = cellAt(map, d.x - 1, d.y) !== WALL, e = cellAt(map, d.x + 1, d.y) !== WALL;
    ok((n && s2 && !w && !e) || (w && e && !n && !s2), `porta ${d.x},${d.y} fora de passagem estreita`);
    ok(d.axis === (n && s2 ? 'z' : 'x'), `porta ${d.x},${d.y} com eixo errado`);
  }

  // porta de desvio precisa de duas saídas perpendiculares para alternar
  for (const d of desvios) {
    const A = dirOf(d.ladoA), B = dirOf(d.ladoB);
    ok(!!A && !!B, `desvio ${d.x},${d.y} com lado inválido`);
    ok((A.dx === 0) !== (B.dx === 0), `desvio ${d.x},${d.y} com lados não perpendiculares`);
    ok(cellAt(map, d.x + A.dx, d.y + A.dy) !== WALL, `desvio ${d.x},${d.y} lado A dá em parede`);
    ok(cellAt(map, d.x + B.dx, d.y + B.dy) !== WALL, `desvio ${d.x},${d.y} lado B dá em parede`);
  }

  // duas portas nunca coladas: senão uma folha bate na outra
  for (const a of map.doors) {
    for (const b of map.doors) {
      if (a === b) continue;
      const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      ok(dist > 1, `portas coladas em ${a.x},${a.y} e ${b.x},${b.y}`);
    }
  }

  // toda sala precisa de pelo menos duas saídas: uma só vira ratoeira
  for (const r of map.rooms) {
    let saidas = 0;
    for (let x = r.x; x < r.x + r.w; x++) {
      if (cellAt(map, x, r.y - 1) !== WALL) saidas++;
      if (cellAt(map, x, r.y + r.h) !== WALL) saidas++;
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      if (cellAt(map, r.x - 1, y) !== WALL) saidas++;
      if (cellAt(map, r.x + r.w, y) !== WALL) saidas++;
    }
    ok(saidas >= 2, `seed ${map.seed}: sala ${r.idx} com ${saidas} saída(s)`);
  }
}
console.log(`  portas de sala: ${minS}..${maxS} | desvios: ${minD}..${maxD}`);

// ------------------------------------------------------------- 2. navegação
section('A*, visão e portas');
for (let s = 0; s < 15; s++) {
  const map = generateMap(s * 313 + 5);
  const fechado = fakeWorld(map, { abertas: false });
  const aberto = fakeWorld(map, { abertas: true });
  const rnd = mulberry32(s + 1);

  // mesmo com tudo fechado o bot precisa achar rota (ele abre no caminho)
  for (let i = 0; i < 25; i++) {
    const a = randomFloorCell(map, rnd);
    const b = randomFloorCell(map, rnd);
    const path = findPath(fechado, a, b);
    ok(path !== null, `seed ${map.seed}: sem rota de ${a.x},${a.y} para ${b.x},${b.y}`);
    if (path?.length) {
      const last = path[path.length - 1];
      ok(last.x === b.x && last.y === b.y, 'A* terminou fora do destino');
      let prev = a;
      for (const step of path) {
        ok(Math.abs(step.x - prev.x) + Math.abs(step.y - prev.y) === 1, 'A* pulou célula');
        ok(!fechado.staticSolid(step.x, step.y), 'A* atravessou parede ou pilar');
        prev = step;
      }
    }
  }

  // porta simples fechada corta a visão
  let cortou = 0;
  const simples = map.doors.filter(d => d.kind === 'simples');
  for (const d of simples) {
    const a = d.axis === 'z' ? { x: d.x, y: d.y - 1 } : { x: d.x - 1, y: d.y };
    const b = d.axis === 'z' ? { x: d.x, y: d.y + 1 } : { x: d.x + 1, y: d.y };
    if (hasLineOfSight(aberto, a, b) && !hasLineOfSight(fechado, a, b)) cortou++;
  }
  ok(cortou === simples.length,
    `seed ${map.seed}: ${cortou}/${simples.length} portas cortam a visão`);

  // desvio: bloqueia exatamente um lado, e o outro fica livre
  const emA = fakeWorld(map, { abertas: true, desvioEmB: false });
  const emB = fakeWorld(map, { abertas: true, desvioEmB: true });
  for (const d of map.doors.filter(x => x.kind === 'desvio')) {
    const A = dirOf(d.ladoA), B = dirOf(d.ladoB);
    ok(!emA.edgeOpen(d.x, d.y, d.x + A.dx, d.y + A.dy), `desvio ${d.x},${d.y} não fecha o lado A`);
    ok(emA.edgeOpen(d.x, d.y, d.x + B.dx, d.y + B.dy), `desvio ${d.x},${d.y} fechou os dois lados`);
    ok(emB.edgeOpen(d.x, d.y, d.x + A.dx, d.y + A.dy), `desvio ${d.x},${d.y} não liberou o lado A`);
    ok(!emB.edgeOpen(d.x, d.y, d.x + B.dx, d.y + B.dy), `desvio ${d.x},${d.y} não fecha o lado B`);
  }

  // com tudo aberto, distância BFS e comprimento do A* têm que bater
  // O BFS ignora o pedágio das portas, então ele é o piso absoluto: o A* pode
  // dar uma volta maior para não ter que abrir nada, mas nunca ser mais curto.
  const a = randomFloorCell(map, rnd), b = randomFloorCell(map, rnd);
  const bfs = gridDistance(aberto, a, b, 200);
  const astar = findPath(aberto, a, b)?.length ?? -1;
  ok(astar >= bfs, `A* (${astar}) mais curto que o mínimo possível (${bfs})`);
}

// ---------------------------------------------------------------- 3. rodadas
section('máquina de rodadas');

function fakeGame() {
  const log = [];
  return {
    log,
    audio: { play: () => {} },
    buildLevel() { log.push('build'); },
    placeCombatants(role) { log.push(`place:${role}`); },
    onHalfPrepared(role, half) { log.push(`prep:${role}:${half}`); },
    onHalfStarted(role) { log.push(`start:${role}`); },
    onHalfEnded(role, killed, t) { log.push(`end:${role}:${killed ? t.toFixed(1) : 'timeout'}`); },
    onRoundEnded(w) { log.push(`round:${w}`); },
    onMatchEnded(w) { log.push(`match:${w}`); },
  };
}

function simulate(killAt, maxSteps = 60000) {
  const g = fakeGame();
  const rm = new RoundManager(g);
  g.rounds = rm;
  rm.startMatch();
  const dt = 1 / 60;
  let elapsed = 0;
  for (let i = 0; i < maxSteps && rm.state !== 'matchend'; i++) {
    if (rm.state === 'playing') {
      elapsed += dt;
      const t = killAt(rm.playerRoleThisHalf, rm.round, rm.half);
      if (t !== null && elapsed >= t) { rm.registerKill(); elapsed = 0; }
    } else {
      elapsed = 0;
    }
    rm.update(dt);
  }
  return { g, rm };
}

{
  const { rm, g } = simulate(role => (role === 'hunter' ? 5 : null));
  ok(rm.state === 'matchend', 'partida não terminou');
  ok(rm.scoreYou === 2 && rm.scoreBot === 0, `placar ${rm.scoreYou}-${rm.scoreBot} (esperado 2-0)`);
  ok(g.log.filter(l => l === 'build').length === 2, 'mapa não foi refeito a cada rodada');
  ok(g.log[g.log.length - 1] === 'match:you', 'vencedor errado');
}
{
  const { rm } = simulate(role => (role === 'runner' ? 4 : null));
  ok(rm.scoreBot === 2 && rm.scoreYou === 0, `placar ${rm.scoreYou}-${rm.scoreBot} (esperado 0-2)`);
}
{
  const { rm } = simulate(() => null);
  ok(rm.state === 'matchend', 'partida sem eliminação não terminou');
  ok(rm.round === 5, `parou na rodada ${rm.round} (esperado 5)`);
  ok(rm.scoreYou === 0 && rm.scoreBot === 0, 'empate não deveria pontuar');
}
{
  const { rm } = simulate(role => (role === 'hunter' ? 9 : 4));
  ok(rm.scoreBot === 2, `bot mais rápido deveria vencer (${rm.scoreYou}-${rm.scoreBot})`);
}
{
  const { rm } = simulate(role => (role === 'hunter' ? 4 : 9));
  ok(rm.scoreYou === 2, `você mais rápido deveria vencer (${rm.scoreYou}-${rm.scoreBot})`);
}

// sem eliminação a troca é imediata: nada de tela de veredito no meio
{
  const g = fakeGame();
  const rm = new RoundManager(g);
  rm.startMatch();
  rm.state = 'playing'; rm.phaseTime = 0.001; rm.half = 0;
  rm.update(1 / 60);
  ok(rm.state === 'swap', `esgotar o tempo deveria ir direto para a troca (foi para ${rm.state})`);
}
// com eliminação, uma pausa curta para o jogador ver o que houve
{
  const g = fakeGame();
  const rm = new RoundManager(g);
  rm.startMatch();
  rm.state = 'playing'; rm.phaseTime = 20; rm.half = 0;
  rm.registerKill();
  ok(rm.state === 'halfend', `eliminação deveria pausar (foi para ${rm.state})`);
}

{
  const g = fakeGame();
  const rm = new RoundManager(g);
  rm.startMatch();
  ok(rm.playerRoleThisHalf === 'hunter', 'rodada 1 começa com você caçando');
  rm.round = 2; rm.half = 0;
  ok(rm.playerRoleThisHalf === 'runner', 'rodada 2 começa com o bot caçando');
  rm.half = 1;
  ok(rm.playerRoleThisHalf === 'hunter', 'a segunda metade inverte');
}
{
  const g = fakeGame();
  const rm = new RoundManager(g);
  rm.startMatch();
  rm.half = 1; rm.youTime = 12.5;
  ok(rm.survivalTarget === 12.5, `meta ${rm.survivalTarget} (esperado 12.5)`);
  rm.youTime = null;
  ok(rm.survivalTarget === null, 'sem eliminação a meta é o tempo cheio');
}
ok(CFG.PHASE_TIME * 2 <= 90 && CFG.PHASE_TIME * 2 >= 30, 'rodada fora da janela de 30–90s');

console.log(fails === 0 ? '\nTUDO OK\n' : `\n${fails} FALHA(S)\n`);
process.exit(fails ? 1 : 0);
