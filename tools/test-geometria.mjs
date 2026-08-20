// Nenhuma peça do cenário pode ocupar o mesmo volume que outra.
//   node tools/test-geometria.mjs
//
// Duas superfícies no mesmo lugar disputam profundidade e cintilam — é o que
// aparece na tela como "erro de textura", com metade de uma peça brotando de
// dentro da outra. O caso que motivou este teste era a viga de teto cruzando o
// topo de uma parede; procurando direito, ela também cruzava porta, pilar e
// luminária, que ocupam a mesma faixa de altura logo abaixo do teto.
import { generateMap, cellAt, WALL, DOOR } from '../src/world/MazeGen.js';
import { planejarVigas, planejarLuminarias, FOLGA_VIGA } from '../src/world/World.js';
import { CFG } from '../src/core/config.js';

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('  FALHOU:', m); } };

// As duas decisões vêm das MESMAS funções que o jogo usa. Reescrevê-las aqui
// deixaria o teste conferir uma cópia contra si mesma, que é o jeito mais
// confortável de não descobrir nada.
const vigasDe = map => planejarVigas(map, planejarLuminarias(map));

console.log('\n== vigas de teto contra o resto do cenário');

let totalVigas = 0, totalCelulas = 0, maiorVao = 0;
const problemas = { parede: 0, porta: 0, pilar: 0, luminaria: 0 };

for (let seed = 1; seed <= 60; seed++) {
  const map = generateMap(seed * 7919);
  const vigas = vigasDe(map);
  const luzes = new Set(planejarLuminarias(map).map(L => L.y * map.W + L.x));
  totalVigas += vigas.length;

  for (const v of vigas) {
    maiorVao = Math.max(maiorVao, v.fim - v.inicio + 1);
    for (let x = v.inicio; x <= v.fim; x++) {
      totalCelulas++;
      const i = v.y * map.W + x;
      const c = cellAt(map, x, v.y);
      if (c === WALL) problemas.parede++;
      if (c === DOOR) problemas.porta++;
      if (map.opacos?.has(i)) problemas.pilar++;
      if (luzes.has(i)) problemas.luminaria++;
    }
  }
}

console.log(`  ${totalVigas} vigas em 60 mapas, cobrindo ${totalCelulas} células ` +
            `(o maior vão tem ${maiorVao})`);
console.log(`  dentro de parede: ${problemas.parede} | de porta: ${problemas.porta} | ` +
            `de pilar: ${problemas.pilar} | de luminária: ${problemas.luminaria}`);
check(totalVigas > 100, `só ${totalVigas} vigas em 60 mapas — o teto ficou vazio`);
check(problemas.parede === 0, `${problemas.parede} células de viga dentro de parede`);
check(problemas.porta === 0, `${problemas.porta} células de viga cruzando porta (a travessa do umbral)`);
check(problemas.pilar === 0, `${problemas.pilar} células de viga atravessando pilar`);
check(problemas.luminaria === 0, `${problemas.luminaria} células de viga dentro de luminária`);

// ------------------------------------------------------------------------
console.log('\n== as pontas param antes de encostar');
{
  const C = CFG.CELL;
  let encostadas = 0, medidas = 0, folgaMinima = Infinity;
  for (let seed = 1; seed <= 30; seed++) {
    const map = generateMap(seed * 104729);
    for (const v of vigasDe(map)) {
      const comprimento = (v.fim - v.inicio + 1) * C - FOLGA_VIGA * 2;
      const centro = ((v.inicio + v.fim) / 2) * C;
      const esq = centro - comprimento / 2;
      const dir = centro + comprimento / 2;
      // a face da parede vizinha fica na borda da célula
      const faceEsq = (v.inicio - 0.5) * C;
      const faceDir = (v.fim + 0.5) * C;
      folgaMinima = Math.min(folgaMinima, esq - faceEsq, faceDir - dir);
      medidas++;
      if (esq <= faceEsq + 1e-6 || dir >= faceDir - 1e-6) encostadas++;
    }
  }
  console.log(`  ${medidas} vigas medidas | folga mínima ${folgaMinima.toFixed(3)}m | ` +
              `encostando: ${encostadas}`);
  check(encostadas === 0, `${encostadas} vigas com a ponta rente à face da parede (cintila)`);
  check(folgaMinima > 0.02, `a folga de ${folgaMinima.toFixed(3)}m é curta demais para separar`);
}

// ------------------------------------------------------------------------
console.log('\n== por que a separação precisa ser no plano');
{
  const VAO = CFG.WALL_H;
  const faixa = (centro, altura) => [centro - altura / 2, centro + altura / 2];
  const viga = faixa(VAO - 0.15, 0.28);
  const umbral = faixa(VAO - 0.17, 0.34);        // travessa do topo da porta
  const luminaria = faixa(VAO - 0.1, 0.16);
  const cruza = (a, b) => a[0] < b[1] && b[0] < a[1];
  const fmt = f => f.map(v => v.toFixed(2)).join('..');

  console.log(`  viga ${fmt(viga)} | umbral ${fmt(umbral)} | luminária ${fmt(luminaria)}`);
  // Elas SE cruzam em altura, e é por isso que a separação tem que ser feita
  // no plano, tirando a viga dessas células. Se um dia alguém mudar as alturas
  // e elas deixarem de se cruzar, estas regras viram peso morto — e é bom que
  // o teste avise, em vez de deixá-las lá para sempre.
  check(cruza(viga, umbral),
    'viga e umbral não dividem mais a mesma altura: a regra de pular portas ' +
    'virou desnecessária e pode sair');
  check(cruza(viga, luminaria),
    'viga e luminária não dividem mais a mesma altura: a regra de pular ' +
    'luminárias virou desnecessária e pode sair');
}

console.log(falhas === 0 ? '\nGEOMETRIA LIMPA\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas ? 1 : 0);
