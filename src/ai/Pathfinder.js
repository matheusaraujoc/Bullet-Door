import { WALL, DOOR, DIRS, cellAt } from '../world/MazeGen.js';

/**
 * A* em grid de 4 direções.
 *
 * Portas não são muro: são pedágio. Uma porta fechada (ou um desvio virado
 * para o lado errado) custa mais caro, então o bot prefere o caminho livre —
 * mas ainda considera abrir a porta quando isso encurta a rota de verdade.
 *
 * `evitar` é uma célula que encarece a vizinhança. Quem está fugindo passa
 * por perto do caçador só se não houver mesmo outro jeito — sem isso o A*
 * traça a rota mais curta e faz o fugitivo raspar nele.
 */
export function findPath(world, start, goal, evitar = null) {
  const map = world.map;
  if (start.x === goal.x && start.y === goal.y) return [];
  const W = map.W, N = W * map.H;
  const si = start.y * W + start.x, gi = goal.y * W + goal.x;
  if (world.staticSolid(goal.x, goal.y)) return null;

  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  gScore[si] = 0;

  const heap = [{ i: si, f: 0 }];
  const push = n => {
    heap.push(n); let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p].f <= heap[c].f) break;
      [heap[p], heap[c]] = [heap[c], heap[p]]; c = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let p = 0;
      for (;;) {
        const l = 2 * p + 1, r = l + 1; let s = p;
        if (l < heap.length && heap[l].f < heap[s].f) s = l;
        if (r < heap.length && heap[r].f < heap[s].f) s = r;
        if (s === p) break;
        [heap[p], heap[s]] = [heap[s], heap[p]]; p = s;
      }
    }
    return top;
  };
  const h = i => Math.abs((i % W) - goal.x) + Math.abs(((i / W) | 0) - goal.y);

  let guard = 0;
  while (heap.length && guard++ < 30000) {
    const cur = pop();
    if (closed[cur.i]) continue;
    closed[cur.i] = 1;
    if (cur.i === gi) {
      const path = []; let i = gi;
      while (i !== si) { path.push({ x: i % W, y: (i / W) | 0 }); i = came[i]; }
      return path.reverse();
    }
    const cx = cur.i % W, cy = (cur.i / W) | 0;
    for (const d of DIRS) {
      const nx = cx + d.dx, ny = cy + d.dy;
      if (world.staticSolid(nx, ny)) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      let medo = 0;
      if (evitar) {
        const perto = Math.abs(nx - evitar.x) + Math.abs(ny - evitar.y);
        if (perto <= 3) medo = (4 - perto) * 3;
      }
      const ng = gScore[cur.i] + 1 + world.doorCost(cx, cy, nx, ny) + medo;
      if (ng < gScore[ni]) {
        gScore[ni] = ng; came[ni] = cur.i;
        push({ i: ni, f: ng + h(ni) });
      }
    }
  }
  return null;
}

/**
 * Linha de visão célula a célula (Bresenham). Para em parede, pilar,
 * porta fechada e em desvio virado contra a passagem.
 */
export function hasLineOfSight(world, a, b) {
  let x0 = a.x, y0 = a.y;
  const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, guard = 0;
  for (;;) {
    if (guard++ > 200) return false;
    if (x0 === x1 && y0 === y1) return true;
    const px = x0, py = y0;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
    if (world.opaque(x0, y0)) return false;
    if (!world.edgeOpen(px, py, x0, y0)) return false;
  }
}

/** Distância real em passos, respeitando o que está fechado agora. */
export function gridDistance(world, from, to, limit = 60) {
  const map = world.map, W = map.W;
  const dist = new Int16Array(W * map.H).fill(-1);
  const si = from.y * W + from.x;
  dist[si] = 0;
  const q = [si];
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    if (dist[i] > limit) break;
    if (i === to.y * W + to.x) return dist[i];
    const x = i % W, y = (i / W) | 0;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (world.staticSolid(nx, ny)) continue;
      const ni = ny * W + nx;
      if (dist[ni] >= 0) continue;
      dist[ni] = dist[i] + 1; q.push(ni);
    }
  }
  return -1;
}
