// Colisão: ninguém pode terminar dentro de parede, nem quando a porta desce
// bem ao lado. Roda sem navegador — three funciona em Node para geometria.
//   node tools/test-colisao.mjs
import * as THREE from 'three';
import { generateMap, cellAt, WALL } from '../src/world/MazeGen.js';
import { World } from '../src/world/World.js';
import { CFG } from '../src/core/config.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FALHOU:', m); } };
const C = CFG.CELL, R = CFG.RADIUS;

/** A posição caiu dentro de algo sólido? */
function dentroDeParede(world, pos) {
  const cx = Math.round(pos.x / C), cy = Math.round(pos.z / C);
  if (!world.staticSolid(cx, cy)) return false;
  // dentro da célula sólida de verdade, não só encostado na borda
  const bx = cx * C, bz = cy * C, meia = C / 2;
  return Math.abs(pos.x - bx) < meia - 0.02 && Math.abs(pos.z - bz) < meia - 0.02;
}

console.log('== colisão: porta descendo ao lado de quem está no vão\n');

let testados = 0, presos = 0;
for (let s = 0; s < 12; s++) {
  const map = generateMap(s * 811 + 3);
  const world = new World(map, new THREE.Group());

  for (const d of world.doors.list) {
    if (d.kind !== 'simples') continue;

    // Cerca o vão de posições: o jogador encostado nas laterais, nos cantos e
    // logo à frente. É de onde ele aciona a porta na prática.
    const eixoZ = d.painel.rotY === 0;          // folha atravessa em X
    const pontos = [];
    for (const along of [-0.42, -0.2, 0, 0.2, 0.42]) {
      for (const fundo of [-0.62, -0.45, 0.45, 0.62]) {
        pontos.push(eixoZ
          ? { x: d.cx + along * C, z: d.cz + fundo * C }
          : { x: d.cx + fundo * C, z: d.cz + along * C });
      }
    }

    for (const p0 of pontos) {
      // abre, põe o jogador ali, e manda fechar
      world.doors.reset();
      world.doors.toggle(d, { x: d.cx, z: d.cz - C }, []);
      for (let i = 0; i < 200; i++) world.doors.update(1 / 60);

      const pos = new THREE.Vector3(p0.x, 0, p0.z);
      world.collide(pos, R);                     // assenta antes de começar
      if (dentroDeParede(world, pos)) continue;  // ponto inválido, ignora

      // a folha desce por cima dele, quadro a quadro, com a colisão rodando
      world.doors.toggle(d, pos, []);
      for (let i = 0; i < 200; i++) {
        world.doors.update(1 / 60);
        world.collide(pos, R);
      }

      testados++;
      if (dentroDeParede(world, pos)) {
        presos++;
        if (presos <= 4) {
          console.log(`  FALHOU: preso na parede em ${pos.x.toFixed(2)},${pos.z.toFixed(2)} ` +
            `(porta ${d.x},${d.y})`);
        }
      }
    }
  }
}
ok(presos === 0, `${presos} de ${testados} posições terminaram dentro da parede`);
console.log(`  posições testadas: ${testados} | presas: ${presos}`);

// e o básico: empurrar contra parede nunca deve atravessar
console.log('\n== colisão: empurrando contra as paredes');
{
  const map = generateMap(4242);
  const world = new World(map, new THREE.Group());
  let vazamentos = 0, tentativas = 0;
  for (let y = 1; y < map.H - 1; y++) {
    for (let x = 1; x < map.W - 1; x++) {
      if (cellAt(map, x, y) === WALL) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const pos = new THREE.Vector3(x * C, 0, y * C);
        for (let i = 0; i < 40; i++) {          // empurra forte contra o vizinho
          pos.x += dx * 0.25; pos.z += dz * 0.25;
          world.collide(pos, R);
        }
        tentativas++;
        if (dentroDeParede(world, pos)) vazamentos++;
      }
    }
  }
  ok(vazamentos === 0, `${vazamentos} de ${tentativas} empurrões atravessaram a parede`);
  console.log(`  empurrões: ${tentativas} | vazaram: ${vazamentos}`);
}

console.log(fails === 0 ? '\nTUDO OK\n' : `\n${fails} FALHA(S)\n`);
process.exit(fails ? 1 : 0);
