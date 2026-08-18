// Testa as portas fora do navegador: three funciona em Node para vetores e
// matrizes — só o WebGL é que não.
//   node tools/test-doors.mjs
import * as THREE from 'three';
import { generateMap } from '../src/world/MazeGen.js';
import { Doors } from '../src/world/Doors.js';
import { CFG } from '../src/core/config.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FALHOU:', m); } };
const C = CFG.CELL;

/** Roda a animação até as folhas pararem. */
const assentar = doors => { for (let i = 0; i < 400; i++) doors.update(1 / 60); };

console.log('== portas em guilhotina\n');

let simples = 0, desvios = 0, recusas = 0;
for (let s = 0; s < 25; s++) {
  const map = generateMap(s * 613 + 7);
  const doors = new Doors(map, new THREE.Group());

  // a folha fechada tem que cobrir do chão ao teto, sem fresta em cima
  const geo = doors.leaves.geometry;
  geo.computeBoundingBox();
  ok(geo.boundingBox.min.y <= 0.001, 'a folha não encosta no chão');
  ok(geo.boundingBox.max.y >= CFG.WALL_H - 0.001,
    `a folha para em ${geo.boundingBox.max.y.toFixed(2)} e o teto está em ${CFG.WALL_H}`);

  for (const d of doors.list) {
    if (d.kind === 'simples') {
      simples++;
      doors.reset();
      ok(doors.blocksCell(d.idx), `porta ${d.x},${d.y} deveria começar fechada`);

      // colisão: fechada empurra, aberta deixa passar
      const dentro = { x: d.cx, z: d.cz };
      ok(doors.collide({ ...dentro }, 0.34), `porta ${d.x},${d.y} fechada não colide`);

      doors.toggle(d, { x: d.cx, z: d.cz - C }, []);
      assentar(doors);
      ok(d.open, `porta ${d.x},${d.y} não abriu`);
      ok(!doors.blocksCell(d.idx), `porta ${d.x},${d.y} aberta ainda bloqueia`);
      ok(!doors.collide({ ...dentro }, 0.34), `porta ${d.x},${d.y} aberta ainda colide`);

      // não pode descer em cima de quem está no vão
      const mexeu = doors.toggle(d, { x: d.cx, z: d.cz - C }, [{ x: d.cx, z: d.cz }]);
      assentar(doors);
      ok(mexeu === false, `porta ${d.x},${d.y} tentou fechar com alguém embaixo`);
      ok(d.open, `porta ${d.x},${d.y} fechou por cima de alguém`);
      recusas++;

      // com o vão livre, fecha normalmente
      ok(doors.toggle(d, { x: d.cx, z: d.cz - C }, [{ x: d.cx + C * 3, z: d.cz }]) === true,
        `porta ${d.x},${d.y} não fechou com o vão livre`);
      assentar(doors);
      ok(doors.blocksCell(d.idx), `porta ${d.x},${d.y} não voltou a bloquear`);
    } else {
      desvios++;
      doors.reset();
      assentar(doors);

      const ladoA = { x: d.x + d.A.dx, y: d.y + d.A.dy };
      const ladoB = { x: d.x + d.B.dx, y: d.y + d.B.dy };
      // exatamente um caminho fechado por vez, nunca os dois
      const abertoA = () => doors.edgeOpen(d.x, d.y, ladoA.x, ladoA.y);
      const abertoB = () => doors.edgeOpen(d.x, d.y, ladoB.x, ladoB.y);
      ok(abertoA() !== abertoB(), `desvio ${d.x},${d.y}: os dois lados no mesmo estado`);
      ok(!abertoA(), `desvio ${d.x},${d.y} deveria começar barrando o lado A`);

      // alterna quando acionado de longe
      const longe = { x: d.cx + d.A.dx * C * 2, z: d.cz + d.A.dy * C * 2 };
      ok(doors.toggle(d, longe, []) === true, `desvio ${d.x},${d.y} não alternou`);
      assentar(doors);
      ok(abertoA() && !abertoB(), `desvio ${d.x},${d.y} não trocou os lados`);
      ok(abertoA() !== abertoB(), `desvio ${d.x},${d.y}: os dois lados no mesmo estado`);

      // e não desce sobre quem está no vão que ia fechar
      const noVao = { x: d.cx + d.A.dx * (C / 2), z: d.cz + d.A.dy * (C / 2) };
      ok(doors.toggle(d, longe, [noVao]) === false,
        `desvio ${d.x},${d.y} desceu sobre quem estava no vão`);
      assentar(doors);
      ok(abertoA(), `desvio ${d.x},${d.y} fechou mesmo assim`);
      recusas++;
    }
  }
}
console.log(`  portas simples: ${simples} | desvios: ${desvios} | recusas de esmagar: ${recusas}`);
console.log(fails === 0 ? '\nTUDO OK\n' : `\n${fails} FALHA(S)\n`);
process.exit(fails ? 1 : 0);
