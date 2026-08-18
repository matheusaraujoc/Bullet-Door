// As regras da partida, sob todos os desfechos possíveis.
//   node tools/test-regras.mjs
import { RoundManager } from '../src/core/RoundManager.js';
import { CFG } from '../src/core/config.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FALHOU:', m); } };
const sec = t => console.log(`\n== ${t}`);

/**
 * Roda uma partida inteira registrando tudo o que aconteceu.
 * `matar(papel, rodada, metade)` devolve em quantos segundos o caçador daquela
 * metade acerta, ou null se ele erra a metade toda.
 */
function jogar(matar, limite = 200000) {
  const eventos = [];
  const jogo = {
    audio: { play() {} },
    buildLevel() { eventos.push({ tipo: 'mapa' }); },
    placeCombatants() {},
    onHalfPrepared(papel, metade) { eventos.push({ tipo: 'prep', papel, metade }); },
    onHalfStarted(papel) { eventos.push({ tipo: 'inicio', papel }); },
    onHalfEnded(papel, matou, t) { eventos.push({ tipo: 'fim', papel, matou, t }); },
    onRoundEnded(vencedor, y, b) { eventos.push({ tipo: 'rodada', vencedor, y, b }); },
    onMatchEnded(vencedor) { eventos.push({ tipo: 'partida', vencedor }); },
  };
  const rm = new RoundManager(jogo);
  jogo.rounds = rm;
  rm.startMatch();

  const dt = 1 / 60;
  let decorrido = 0;
  for (let i = 0; i < limite && rm.state !== 'matchend'; i++) {
    if (rm.state === 'playing') {
      decorrido += dt;
      const t = matar(rm.playerRoleThisHalf, rm.round, rm.half);
      if (t !== null && decorrido >= t) { rm.registerKill(); decorrido = 0; }
    } else {
      decorrido = 0;
    }
    rm.update(dt);
  }
  return { rm, eventos };
}

// ---------------------------------------------------------- 1. alternância
sec('quem caça alterna sem repetir');
{
  // ninguém acerta: a partida vai até o limite de rodadas, expondo todas as trocas
  const { eventos, rm } = jogar(() => null);
  const papeis = eventos.filter(e => e.tipo === 'inicio').map(e => e.papel);
  console.log('  sequência de papéis:', papeis.join(' → '));

  ok(papeis.length === rm.round * 2, `${papeis.length} metades em ${rm.round} rodadas`);
  for (let i = 1; i < papeis.length; i++) {
    ok(papeis[i] !== papeis[i - 1],
      `metade ${i}: papel repetido (${papeis[i - 1]} → ${papeis[i]}) — alguém caçou duas vezes seguidas`);
  }
  // e cada rodada tem uma caçada de cada lado
  for (let r = 0; r < rm.round; r++) {
    const dupla = papeis.slice(r * 2, r * 2 + 2);
    ok(dupla.includes('hunter') && dupla.includes('runner'),
      `rodada ${r + 1}: ${dupla.join(' e ')} — a rodada tem que ter os dois papéis`);
  }
}

// -------------------------------------------------------------- 2. o placar
sec('placar bate com o que aconteceu');
const casos = [
  ['você mata rápido sempre',        p => (p === 'hunter' ? 5 : null)],
  ['o bot mata rápido sempre',       p => (p === 'runner' ? 4 : null)],
  ['você é mais rápido',             p => (p === 'hunter' ? 6 : 12)],
  ['o bot é mais rápido',            p => (p === 'hunter' ? 12 : 6)],
  ['ninguém acerta',                 () => null],
  ['os dois no mesmo tempo',         () => 9],
  ['você mata só na primeira rodada', (p, r) => (p === 'hunter' && r === 1 ? 5 : null)],
  ['o bot mata só na primeira',      (p, r) => (p === 'runner' && r === 1 ? 5 : null)],
  ['alterna por rodada',             (p, r) => (r % 2 === 1 ? (p === 'hunter' ? 5 : null) : (p === 'runner' ? 5 : null))],
];

for (const [nome, matar] of casos) {
  const { rm, eventos } = jogar(matar);
  const rodadas = eventos.filter(e => e.tipo === 'rodada');
  const fim = eventos.find(e => e.tipo === 'partida');

  const contados = { you: 0, bot: 0, draw: 0 };
  for (const r of rodadas) contados[r.vencedor]++;

  const esperado = contados.you > contados.bot ? 'you'
    : contados.bot > contados.you ? 'bot' : 'draw';

  console.log(`  ${nome.padEnd(30)} ${rm.scoreYou}-${rm.scoreBot} ` +
    `em ${rodadas.length} rodada(s) | fim: ${fim?.vencedor}`);

  ok(rm.state === 'matchend', `${nome}: a partida não terminou`);
  ok(!!fim, `${nome}: nunca anunciou o fim`);
  ok(rm.scoreYou === contados.you,
    `${nome}: placar seu ${rm.scoreYou} mas venceu ${contados.you} rodada(s)`);
  ok(rm.scoreBot === contados.bot,
    `${nome}: placar do bot ${rm.scoreBot} mas venceu ${contados.bot} rodada(s)`);
  ok(rodadas.length === contados.you + contados.bot + contados.draw,
    `${nome}: rodadas não batem com os desfechos`);
  ok(fim?.vencedor === esperado,
    `${nome}: terminou como "${fim?.vencedor}" com placar ${rm.scoreYou}-${rm.scoreBot}`);
  ok(rm.scoreYou <= CFG.ROUNDS_TO_WIN && rm.scoreBot <= CFG.ROUNDS_TO_WIN,
    `${nome}: placar passou do necessário para vencer (${rm.scoreYou}-${rm.scoreBot})`);

  // a partida tem que parar assim que alguém alcança o alvo
  if (rm.scoreYou >= CFG.ROUNDS_TO_WIN || rm.scoreBot >= CFG.ROUNDS_TO_WIN) {
    const parcial = { you: 0, bot: 0 };
    let deveriaTerParado = -1;
    rodadas.forEach((r, i) => {
      if (r.vencedor === 'you') parcial.you++;
      if (r.vencedor === 'bot') parcial.bot++;
      if (deveriaTerParado < 0 &&
          (parcial.you >= CFG.ROUNDS_TO_WIN || parcial.bot >= CFG.ROUNDS_TO_WIN)) {
        deveriaTerParado = i + 1;
      }
    });
    ok(deveriaTerParado === rodadas.length,
      `${nome}: devia ter acabado na rodada ${deveriaTerParado}, mas jogou ${rodadas.length}`);
  }
}

// ------------------------------------------------- 3. quem matou, quem ganhou
sec('a rodada é de quem eliminou mais rápido');
{
  // você mata em 6s, o bot em 12s: a rodada é sua, sempre
  const { eventos } = jogar(p => (p === 'hunter' ? 6 : 12));
  for (const r of eventos.filter(e => e.tipo === 'rodada')) {
    ok(r.y !== null && r.b !== null, 'a rodada fechou sem os dois tempos');
    ok(r.vencedor === (r.y < r.b ? 'you' : r.b < r.y ? 'bot' : 'draw'),
      `rodada dada a "${r.vencedor}" com você ${r.y} e bot ${r.b}`);
  }
}
{
  // só você acerta: a rodada é sua mesmo sem o bot ter tempo
  const { eventos } = jogar(p => (p === 'hunter' ? 7 : null));
  for (const r of eventos.filter(e => e.tipo === 'rodada')) {
    ok(r.vencedor === 'you', `você eliminou e o bot não, mas a rodada foi para "${r.vencedor}"`);
  }
}
{
  // o tempo é sempre de quem estava caçando naquela metade
  const { eventos } = jogar(p => (p === 'hunter' ? 5 : 8));
  const fins = eventos.filter(e => e.tipo === 'fim' && e.matou);
  for (const f of fins) {
    ok(f.papel === 'hunter' ? Math.abs(f.t - 5) < 0.2 : Math.abs(f.t - 8) < 0.2,
      `tempo ${f.t?.toFixed(1)}s registrado para o papel ${f.papel}`);
  }
}

// ------------------------------------------------------------ 4. a meta de fuga
sec('a meta de sobrevivência é o seu próprio tempo de caçada');
{
  const jogo = {
    audio: { play() {} }, buildLevel() {}, placeCombatants() {},
    onHalfPrepared() {}, onHalfStarted() {}, onHalfEnded() {},
    onRoundEnded() {}, onMatchEnded() {},
  };
  const rm = new RoundManager(jogo);
  rm.startMatch();
  ok(rm.playerRoleThisHalf === 'hunter', 'a rodada devia começar com você caçando');
  ok(rm.survivalTarget === null, 'caçando não existe meta de fuga');

  rm.state = 'playing'; rm.phaseTime = CFG.PHASE_TIME - 12.5;
  rm.registerKill();
  ok(Math.abs(rm.youTime - 12.5) < 0.01, `seu tempo ficou ${rm.youTime}`);
  rm.half = 1;
  ok(rm.playerRoleThisHalf === 'runner', 'a segunda metade devia ser de fuga');
  ok(Math.abs(rm.survivalTarget - 12.5) < 0.01,
    `a meta devia ser 12.5s e ficou ${rm.survivalTarget}`);
}

// ------------------------------------------------------------- 5. mapa por rodada
sec('um mapa novo a cada rodada');
{
  const { eventos, rm } = jogar(() => null);
  const mapas = eventos.filter(e => e.tipo === 'mapa').length;
  ok(mapas === rm.round, `${mapas} mapas para ${rm.round} rodadas`);
}

// ------------------------------------------------- 6. muitas partidas ao acaso
sec('2000 partidas com desfechos sorteados');
{
  let semear = 12345;
  const rnd = () => {
    semear = (semear * 1103515245 + 12345) & 0x7fffffff;
    return semear / 0x7fffffff;
  };

  let piorCaso = null;
  for (let n = 0; n < 2000 && !piorCaso; n++) {
    // cada metade sorteia se houve abate e em quanto tempo
    const plano = new Map();
    const matar = (papel, rodada, metade) => {
      const chave = `${rodada}.${metade}`;
      if (!plano.has(chave)) {
        plano.set(chave, rnd() < 0.55 ? +(1 + rnd() * 28).toFixed(2) : null);
      }
      return plano.get(chave);
    };

    const { rm, eventos } = jogar(matar);
    const rodadas = eventos.filter(e => e.tipo === 'rodada');
    const fim = eventos.find(e => e.tipo === 'partida');
    const papeis = eventos.filter(e => e.tipo === 'inicio').map(e => e.papel);

    const contados = { you: 0, bot: 0, draw: 0 };
    for (const r of rodadas) contados[r.vencedor]++;

    const problemas = [];
    if (rm.state !== 'matchend') problemas.push('não terminou');
    if (!fim) problemas.push('sem anúncio de fim');
    if (rm.scoreYou !== contados.you) problemas.push('placar seu não bate');
    if (rm.scoreBot !== contados.bot) problemas.push('placar do bot não bate');

    const esperado = rm.scoreYou > rm.scoreBot ? 'you'
      : rm.scoreBot > rm.scoreYou ? 'bot' : 'draw';
    if (fim && fim.vencedor !== esperado) problemas.push(`fim "${fim.vencedor}" com ${rm.scoreYou}-${rm.scoreBot}`);

    for (let i = 1; i < papeis.length; i++) {
      if (papeis[i] === papeis[i - 1]) { problemas.push('papel repetido'); break; }
    }
    if (papeis.length !== rodadas.length * 2) problemas.push('metades não fecham com rodadas');
    if (rm.round > 5) problemas.push('passou de 5 rodadas');

    // cada rodada tem que ser coerente com os dois tempos dela
    for (const r of rodadas) {
      const certo = r.y !== null && r.b !== null
        ? (r.y < r.b ? 'you' : r.b < r.y ? 'bot' : 'draw')
        : r.y !== null ? 'you' : r.b !== null ? 'bot' : 'draw';
      if (r.vencedor !== certo) { problemas.push(`rodada para "${r.vencedor}" com y=${r.y} b=${r.b}`); break; }
    }

    if (problemas.length) {
      piorCaso = { n, problemas, placar: `${rm.scoreYou}-${rm.scoreBot}`, papeis: papeis.join('→') };
    }
  }

  ok(!piorCaso, piorCaso ? `partida ${piorCaso.n}: ${piorCaso.problemas.join('; ')} (placar ${piorCaso.placar})` : '');
  if (!piorCaso) console.log('  nenhuma inconsistência em 2000 partidas');
}

console.log(fails === 0 ? '\nTUDO OK\n' : `\n${fails} FALHA(S)\n`);
process.exit(fails ? 1 : 0);
