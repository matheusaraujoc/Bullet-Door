// As regras da partida, sob todos os desfechos possíveis.
//   node tools/test-regras.mjs
//
// A regra é contagem de eliminação, não tempo: cada metade em que o caçador
// acerta vale um ponto para ele, e duas eliminações levam a partida. Boa parte
// deste arquivo existe para garantir que o cronômetro não volte a decidir nada.
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
    placeCombatants(papel) { eventos.push({ tipo: 'recolocou', papel }); },
    trocarPapeis(papel) { eventos.push({ tipo: 'trocou', papel }); },
    onHalfPrepared(papel, metade) { eventos.push({ tipo: 'prep', papel, metade }); },
    onHalfStarted(papel) { eventos.push({ tipo: 'inicio', papel }); },
    onHalfEnded(papel, matou, t) { eventos.push({ tipo: 'fim', papel, matou, t }); },
    onRoundEnded(seu, bot, placarSeu, placarBot) {
      eventos.push({ tipo: 'rodada', seu, bot, placarSeu, placarBot });
    },
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

/** Quantas metades cada lado fechou com eliminação. */
function contarAbates(eventos) {
  const c = { you: 0, bot: 0 };
  for (const e of eventos) {
    if (e.tipo === 'fim' && e.matou) c[e.papel === 'hunter' ? 'you' : 'bot']++;
  }
  return c;
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
  // e cada rodada dá uma chance de pontuar para cada lado
  for (let r = 0; r < rm.round; r++) {
    const dupla = papeis.slice(r * 2, r * 2 + 2);
    ok(dupla.includes('hunter') && dupla.includes('runner'),
      `rodada ${r + 1}: ${dupla.join(' e ')} — a rodada tem que ter os dois papéis`);
  }
}

// ------------------------------------------------- 2. o placar é a contagem
sec('o placar é o número de eliminações');
const casos = [
  ['só você acerta',                 p => (p === 'hunter' ? 5 : null)],
  ['só o bot acerta',                p => (p === 'runner' ? 4 : null)],
  ['os dois acertam sempre',         () => 9],
  ['ninguém acerta',                 () => null],
  ['você acerta só na 1ª rodada',    (p, r) => (p === 'hunter' && r === 1 ? 5 : null)],
  ['o bot acerta só na 1ª rodada',   (p, r) => (p === 'runner' && r === 1 ? 5 : null)],
  ['você sempre, o bot só na 1ª',    (p, r) => (p === 'hunter' ? 5 : r === 1 ? 5 : null)],
  ['alterna por rodada',             (p, r) => (r % 2 === 1 ? (p === 'hunter' ? 5 : null) : (p === 'runner' ? 5 : null))],
];

for (const [nome, matar] of casos) {
  const { rm, eventos } = jogar(matar);
  const rodadas = eventos.filter(e => e.tipo === 'rodada');
  const fim = eventos.find(e => e.tipo === 'partida');
  const abates = contarAbates(eventos);

  const esperado = rm.scoreYou > rm.scoreBot ? 'you'
    : rm.scoreBot > rm.scoreYou ? 'bot' : 'draw';

  console.log(`  ${nome.padEnd(30)} ${rm.scoreYou}-${rm.scoreBot} ` +
    `em ${rodadas.length} rodada(s) | fim: ${fim?.vencedor}`);

  ok(rm.state === 'matchend', `${nome}: a partida não terminou`);
  ok(!!fim, `${nome}: nunca anunciou o fim`);
  ok(rm.scoreYou === abates.you,
    `${nome}: placar seu ${rm.scoreYou} para ${abates.you} eliminação(ões)`);
  ok(rm.scoreBot === abates.bot,
    `${nome}: placar do bot ${rm.scoreBot} para ${abates.bot} eliminação(ões)`);
  ok(fim?.vencedor === esperado,
    `${nome}: terminou como "${fim?.vencedor}" com placar ${rm.scoreYou}-${rm.scoreBot}`);

  // a rodada nunca pode dar mais de um ponto por lado: cada um caça uma vez
  for (const r of rodadas) {
    ok(r.seu <= 1 && r.bot <= 1,
      `${nome}: rodada com ${r.seu}-${r.bot} pontos — cada lado só caça uma vez`);
  }

  // e o placar reportado no fim da rodada tem que ser o acumulado até ali
  let accY = 0, accB = 0;
  for (const r of rodadas) {
    accY += r.seu; accB += r.bot;
    ok(r.placarSeu === accY && r.placarBot === accB,
      `${nome}: rodada anunciou ${r.placarSeu}-${r.placarBot}, acumulado é ${accY}-${accB}`);
  }
}

// -------------------------------------------- 3. a partida para na hora certa
sec('duas eliminações levam, mas empate no alvo joga mais uma');
{
  // você sempre acerta, o bot nunca: 1-0, 2-0 e acabou na segunda rodada
  const { rm, eventos } = jogar(p => (p === 'hunter' ? 5 : null));
  const rodadas = eventos.filter(e => e.tipo === 'rodada').length;
  ok(rm.scoreYou === 2 && rm.scoreBot === 0, `placar ${rm.scoreYou}-${rm.scoreBot} (esperado 2-0)`);
  ok(rodadas === 2, `parou em ${rodadas} rodada(s), devia parar em 2`);
}
{
  // os dois acertam toda metade: 1-1, 2-2, 3-3... nunca alguém abre vantagem,
  // então vai até o teto e termina empatado
  const { rm, eventos } = jogar(() => 9);
  const rodadas = eventos.filter(e => e.tipo === 'rodada').length;
  const fim = eventos.find(e => e.tipo === 'partida');
  console.log(`  os dois sempre acertam: ${rm.scoreYou}-${rm.scoreBot} em ${rodadas} rodadas → ${fim.vencedor}`);
  ok(rm.scoreYou === rm.scoreBot, 'empatado a cada rodada, o placar tinha que ficar igual');
  ok(rodadas === CFG.MAX_RODADAS, `empate no alvo devia jogar até o teto (jogou ${rodadas})`);
  ok(fim.vencedor === 'draw', `terminou como "${fim.vencedor}" com placar igual`);
}
{
  // 1-1 na primeira, 2-1 na segunda: decidiu, e o exemplo é justamente o que
  // "melhor de 3" quer dizer — 2 eliminações levam
  const { rm, eventos } = jogar((p, r) => (p === 'hunter' ? 5 : r === 1 ? 5 : null));
  const rodadas = eventos.filter(e => e.tipo === 'rodada');
  ok(rodadas.length === 2, `devia decidir na 2ª rodada, jogou ${rodadas.length}`);
  ok(rm.scoreYou === 2 && rm.scoreBot === 1, `placar ${rm.scoreYou}-${rm.scoreBot} (esperado 2-1)`);
  ok(eventos.find(e => e.tipo === 'partida').vencedor === 'you', 'quem eliminou mais tinha que levar');
}
{
  // 1 a 0 nunca alcança o alvo, mas o melhor de 3 fecha na terceira rodada
  // assim mesmo: esticar até a quinta com alguém na frente só cansa
  const { rm, eventos } = jogar((p, r) => (p === 'hunter' && r === 1 ? 5 : null));
  const rodadas = eventos.filter(e => e.tipo === 'rodada').length;
  console.log(`  1 a 0 sem ninguém chegar a 2: ${rodadas} rodadas → ${eventos.find(e => e.tipo === 'partida').vencedor}`);
  ok(rodadas === CFG.RODADAS_PADRAO, `o melhor de 3 devia fechar em 3 rodadas (jogou ${rodadas})`);
  ok(rm.scoreYou === 1 && rm.scoreBot === 0, `placar ${rm.scoreYou}-${rm.scoreBot} (esperado 1-0)`);
}
{
  // empatado no fim das três, aí sim estica até alguém abrir vantagem
  const { rm, eventos } = jogar((p, r) => (r <= 3 ? 9 : p === 'hunter' ? 5 : null));
  const rodadas = eventos.filter(e => e.tipo === 'rodada').length;
  console.log(`  3-3 e desempate na quarta: ${rodadas} rodadas → ${rm.scoreYou}-${rm.scoreBot}`);
  ok(rodadas === 4, `empate na terceira devia esticar para a quarta (jogou ${rodadas})`);
  ok(rm.scoreYou === 4 && rm.scoreBot === 3, `placar ${rm.scoreYou}-${rm.scoreBot} (esperado 4-3)`);
}
{
  // 1-1 depois de duas rodadas: ninguém chegou a 2, então a 3ª é o desempate
  const { rm, eventos } = jogar((p, r) => {
    if (r === 1) return p === 'hunter' ? 5 : null;      // você marca
    if (r === 2) return p === 'runner' ? 5 : null;      // o bot marca
    return p === 'hunter' ? 5 : null;                   // você desempata
  });
  const rodadas = eventos.filter(e => e.tipo === 'rodada');
  console.log(`  1-1 e desempate: ${rodadas.map(r => `${r.placarSeu}-${r.placarBot}`).join(' → ')}`);
  ok(rodadas.length === 3, `o desempate devia acontecer na 3ª rodada (foram ${rodadas.length})`);
  ok(rm.scoreYou === 2 && rm.scoreBot === 1, `placar ${rm.scoreYou}-${rm.scoreBot} (esperado 2-1)`);
}

// ------------------------------------------- 4. o tempo não decide mais nada
sec('o relógio não influencia o placar');
{
  // Este é o teste da regra que estava errada: a rodada era dada a quem
  // eliminasse mais rápido. Duas partidas com os MESMOS acertos e tempos
  // opostos têm que terminar exatamente iguais.
  const rapidoVoce = jogar(p => (p === 'hunter' ? 2 : 27));
  const rapidoBot = jogar(p => (p === 'hunter' ? 27 : 2));

  const resumo = r => `${r.rm.scoreYou}-${r.rm.scoreBot} → ${r.eventos.find(e => e.tipo === 'partida').vencedor}`;
  console.log(`  você elimina em 2s e o bot em 27s: ${resumo(rapidoVoce)}`);
  console.log(`  você elimina em 27s e o bot em 2s: ${resumo(rapidoBot)}`);

  ok(resumo(rapidoVoce) === resumo(rapidoBot),
    `ser mais rápido mudou o resultado: ${resumo(rapidoVoce)} contra ${resumo(rapidoBot)}`);
  ok(rapidoVoce.rm.scoreYou === rapidoVoce.rm.scoreBot,
    'os dois eliminaram o mesmo tanto, o placar tinha que empatar');
}
{
  // e o tempo continua sendo reportado certo para quem eliminou — ele só não
  // vale ponto, ainda serve para a mensagem na tela
  const { eventos } = jogar(p => (p === 'hunter' ? 5 : 8));
  for (const f of eventos.filter(e => e.tipo === 'fim' && e.matou)) {
    ok(f.papel === 'hunter' ? Math.abs(f.t - 5) < 0.2 : Math.abs(f.t - 8) < 0.2,
      `tempo ${f.t?.toFixed(1)}s registrado para o papel ${f.papel}`);
  }
}
{
  // o ponto entra no placar na hora da eliminação, não no fim da rodada
  const jogo = {
    audio: { play() {} }, buildLevel() {}, placeCombatants() {}, trocarPapeis() {},
    onHalfPrepared() {}, onHalfStarted() {}, onHalfEnded() {},
    onRoundEnded() {}, onMatchEnded() {},
  };
  const rm = new RoundManager(jogo);
  rm.startMatch();
  ok(rm.playerRoleThisHalf === 'hunter', 'a rodada devia começar com você caçando');
  ok(rm.scoreYou === 0, 'o placar devia começar zerado');

  rm.state = 'playing'; rm.phaseTime = CFG.PHASE_TIME - 12.5;
  rm.registerKill();
  ok(rm.scoreYou === 1, `eliminou e o placar ficou ${rm.scoreYou} (esperado 1)`);
  ok(rm.pontoSeu === 1 && rm.pontoBot === 0, `pontos da rodada ${rm.pontoSeu}-${rm.pontoBot}`);
}

// ------------------------------------- 4b. a virada não teleporta ninguém
sec('sem abate, a troca mantém todo mundo onde está');
{
  // ninguém acerta: toda virada de metade é por tempo esgotado
  const { eventos, rm } = jogar(() => null);
  const recolocou = eventos.filter(e => e.tipo === 'recolocou').length;
  const trocou = eventos.filter(e => e.tipo === 'trocou').length;
  console.log(`  recolocou: ${recolocou} | só trocou papéis: ${trocou}`);

  // uma recolocação por rodada (o começo dela), e uma troca simples no meio
  ok(recolocou === rm.round, `recolocou ${recolocou} vezes em ${rm.round} rodadas`);
  ok(trocou === rm.round, `trocou papéis ${trocou} vezes em ${rm.round} rodadas`);

  // e a ordem tem que ser: recoloca, troca, recoloca, troca...
  const seq = eventos.filter(e => e.tipo === 'recolocou' || e.tipo === 'trocou').map(e => e.tipo);
  for (let i = 0; i < seq.length; i += 2) {
    ok(seq[i] === 'recolocou', `metade ${i}: devia recolocar no início da rodada`);
    ok(seq[i + 1] === 'trocou', `metade ${i + 1}: virada por tempo não pode teleportar`);
  }
}
{
  // com abate, aí sim: alguém caiu, então a metade seguinte recomeça posições
  const { eventos } = jogar(p => (p === 'hunter' ? 5 : null));
  const seq = eventos.filter(e => e.tipo === 'recolocou' || e.tipo === 'trocou').map(e => e.tipo);
  console.log('  com abate na primeira metade:', seq.join(' → '));
  ok(!seq.includes('trocou'),
    'depois de um abate a metade seguinte precisa recolocar, não só trocar papéis');
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
    const abates = contarAbates(eventos);

    const problemas = [];
    if (rm.state !== 'matchend') problemas.push('não terminou');
    if (!fim) problemas.push('sem anúncio de fim');
    if (rm.scoreYou !== abates.you) problemas.push('placar seu não conta as eliminações');
    if (rm.scoreBot !== abates.bot) problemas.push('placar do bot não conta as eliminações');

    const esperado = rm.scoreYou > rm.scoreBot ? 'you'
      : rm.scoreBot > rm.scoreYou ? 'bot' : 'draw';
    if (fim && fim.vencedor !== esperado) problemas.push(`fim "${fim.vencedor}" com ${rm.scoreYou}-${rm.scoreBot}`);

    for (let i = 1; i < papeis.length; i++) {
      if (papeis[i] === papeis[i - 1]) { problemas.push('papel repetido'); break; }
    }
    if (papeis.length !== rodadas.length * 2) problemas.push('metades não fecham com rodadas');
    if (rm.round > CFG.MAX_RODADAS) problemas.push(`passou de ${CFG.MAX_RODADAS} rodadas`);

    // parou cedo demais, ou tarde demais?
    let accY = 0, accB = 0, paradaCerta = -1;
    rodadas.forEach((r, i) => {
      if (r.seu > 1 || r.bot > 1) problemas.push(`rodada com ${r.seu}-${r.bot} pontos`);
      accY += r.seu; accB += r.bot;
      if (r.placarSeu !== accY || r.placarBot !== accB) problemas.push('placar anunciado fora do acumulado');
      const n = i + 1;
      const naFrente = accY !== accB;
      const acabou = (Math.max(accY, accB) >= CFG.ELIM_PARA_VENCER && naFrente)
        || (n >= CFG.RODADAS_PADRAO && naFrente)
        || n >= CFG.MAX_RODADAS;
      if (paradaCerta < 0 && acabou) paradaCerta = n;
    });
    if (rodadas.length !== paradaCerta) {
      problemas.push(`jogou ${rodadas.length} rodadas, devia parar em ${paradaCerta}`);
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
