// A integração com o Poki SDK, pelos pontos que ela promete.
//   node tools/test-poki.mjs
//
// Não usa o SDK de verdade: bloqueia o script real e injeta um simulado antes
// de qualquer script da página rodar. Duas razões. A primeira é a que este
// arquivo existe para provar — o SDK real, depois do primeiro `gameplayStart`,
// pode decidir pedir um anúncio de vídeo de verdade a um leilão de verdade
// ("requesting video ad in house-ad mode"), e isso não tem por que responder
// rápido nem deveria: é o comportamento certo em produção, ruim num teste. A
// segunda é que só um SDK sob controle deixa simular o que importa: segurar o
// intervalo comercial ABERTO e conferir que o jogo espera de verdade, não só
// que ele chama os métodos certos.
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5206;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };

// bloqueia o SDK real e injeta o simulado ANTES de qualquer script da página
await p.setRequestInterception(true);
p.on('request', req => {
  if (req.url().includes('game-cdn.poki.com')) req.abort();
  else req.continue();
});
await p.evaluateOnNewDocument(() => {
  window.__poki = { chamadas: [], resolvers: [] };
  window.PokiSDK = {
    init: () => { window.__poki.chamadas.push('init'); return Promise.resolve(); },
    gameLoadingFinished: () => window.__poki.chamadas.push('gameLoadingFinished'),
    gameplayStart: () => window.__poki.chamadas.push('gameplayStart'),
    gameplayStop: () => window.__poki.chamadas.push('gameplayStop'),
    // fica pendurado até o teste mandar resolver — é o que prova que o jogo
    // ESPERA o intervalo, em vez de só avisar o SDK e seguir em frente
    commercialBreak: () => {
      window.__poki.chamadas.push('commercialBreak');
      return new Promise(resolve => window.__poki.resolvers.push(resolve));
    },
  };
});

await p.goto(`http://localhost:${PORT}/?fast&seed=13`, { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });

const chamadas = () => p.evaluate(() => window.__poki.chamadas.slice());
const resolverAnuncio = () => p.evaluate(() => { const r = window.__poki.resolvers.pop(); if (r) r(); });

// ------------------------------------------------------ 1. o boot avisa o Poki
const boot = await chamadas();
console.log('no boot        :', JSON.stringify(boot));
check(boot.includes('init'), 'PokiSDK.init() nunca foi chamado');
check(boot.includes('gameLoadingFinished'),
  'PokiSDK.gameLoadingFinished() nunca foi chamado — o loading do Poki ficaria preso');
check(boot.indexOf('init') < boot.indexOf('gameLoadingFinished'),
  'gameLoadingFinished chegou antes de init — a ordem que a documentação pede é a inversa');
check(!boot.includes('gameplayStart'), 'gameplayStart disparou antes de qualquer clique em JOGAR');

/*
 * 2. O PRIMEIRO jogar não passa por intervalo comercial.
 *
 * É o próprio erro que este arquivo existe para travar: pedir um
 * `commercialBreak` antes de qualquer `gameplayStart` da sessão fica preso no
 * SDK real por um bom tempo ("not possible before gameplayStart"). O primeiro
 * JOGAR tem que chamar gameplayStart DIRETO.
 */
await p.click('#btnPlay');
await p.waitForFunction(() => window.game.rounds.state === 'playing', { timeout: 60000 });
const primeiraEntrada = await chamadas();
console.log('1º JOGAR       :', JSON.stringify(primeiraEntrada));
check(primeiraEntrada.filter(c => c === 'gameplayStart').length === 1,
  `gameplayStart deveria ter disparado 1 vez, disparou ${primeiraEntrada.filter(c => c === 'gameplayStart').length}`);
check(!primeiraEntrada.includes('commercialBreak'),
  'o primeiro JOGAR chamou commercialBreak — é exatamente a sequência que trava no SDK real');

// ------------------------------------------------------- 3. pausar avisa o Poki
await p.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true })));
await p.waitForFunction(() => window.game.paused === true, { timeout: 5000 });
const pausou = await chamadas();
console.log('pausou         :', JSON.stringify(pausou));
check(pausou.at(-1) === 'gameplayStop', `o último aviso ao pausar devia ser gameplayStop, foi "${pausou.at(-1)}"`);

/*
 * 4. Continuar segura o jogo até o intervalo comercial resolver — e não antes.
 */
const antesDoClique = await p.evaluate(() => ({
  ctxSuspenso: window.game.audio.ctx?.state,
}));
await p.click('#btnResume');
await new Promise(r => setTimeout(r, 150));         // dá tempo do handler rodar

const duranteOAnuncio = await p.evaluate(() => ({
  paused: window.game.paused,
  travado: window.game._anuncio,
  ctxSuspenso: window.game.audio.ctx?.state,
  pauseVisivel: !document.getElementById('pause').classList.contains('hidden'),
}));
console.log('ctx antes      :', antesDoClique.ctxSuspenso);
console.log('durante o anúncio:', JSON.stringify(duranteOAnuncio));
check((await chamadas()).includes('commercialBreak'), 'Continuar não chamou commercialBreak');
check(duranteOAnuncio.paused === true,
  'o jogo já despausou ANTES do intervalo comercial resolver — não está esperando de verdade');
check(duranteOAnuncio.travado === true, 'this._anuncio devia estar true durante o intervalo');
check(duranteOAnuncio.ctxSuspenso === 'suspended',
  `o áudio devia estar suspenso durante o anúncio, estado é "${duranteOAnuncio.ctxSuspenso}"`);

// só agora o teste deixa o "anúncio" terminar
await resolverAnuncio();
await p.waitForFunction(() => window.game.paused === false, { timeout: 5000 });
// AudioContext.resume() muda de estado de forma assíncrona — o pedido já foi
// feito na mesma volta, mas o navegador leva um instante para de fato religar
await p.waitForFunction(() => window.game.audio.ctx?.state === 'running', { timeout: 3000 }).catch(() => {});
const depoisDoAnuncio = await p.evaluate(() => ({
  paused: window.game.paused,
  travado: window.game._anuncio,
  ctxSuspenso: window.game.audio.ctx?.state,
}));
console.log('depois do anúncio:', JSON.stringify(depoisDoAnuncio));
check(!depoisDoAnuncio.paused, 'o jogo continuou pausado depois do anúncio resolver');
check(!depoisDoAnuncio.travado, 'this._anuncio ficou true depois do anúncio terminar');
check(depoisDoAnuncio.ctxSuspenso === 'running',
  `o áudio devia voltar a rodar depois do anúncio, estado é "${depoisDoAnuncio.ctxSuspenso}"`);

const aposContinuar = await chamadas();
console.log('após Continuar :', JSON.stringify(aposContinuar));
check(aposContinuar.filter(c => c === 'gameplayStart').length === 2,
  `gameplayStart devia somar 2 chamadas (jogar + continuar), somou ${aposContinuar.filter(c => c === 'gameplayStart').length}`);
check(aposContinuar.indexOf('gameplayStart') < aposContinuar.lastIndexOf('gameplayStop')
  && aposContinuar.lastIndexOf('gameplayStop') < aposContinuar.lastIndexOf('commercialBreak')
  && aposContinuar.lastIndexOf('commercialBreak') < aposContinuar.lastIndexOf('gameplayStart'),
  `a ordem saiu fora do esperado (stop → anúncio → start): ${aposContinuar.join(' → ')}`);

// ------------------------------------------------- 5. fim de partida avisa o Poki
await p.evaluate(() => {
  const g = window.game;
  g.rounds.historico = [{ seu: 1, bot: 0 }, { seu: 1, bot: 0 }];
  g.rounds.scoreYou = 2; g.rounds.scoreBot = 0;
  g.onMatchEnded('you');
});
const fimDePartida = await chamadas();
console.log('fim de partida :', JSON.stringify(fimDePartida));
check(fimDePartida.at(-1) === 'gameplayStop', `o fim de partida devia terminar em gameplayStop, terminou em "${fimDePartida.at(-1)}"`);

/*
 * 6. Jogar de novo também passa pelo intervalo — e desta vez o anúncio é
 * recusado/falha, e o jogo tem que seguir em frente mesmo assim.
 */
const jogarDeNovo = await p.evaluate(async () => {
  const g = window.game;
  document.getElementById('btnAgain').click();
  await new Promise(r => setTimeout(r, 120));
  return { rodando: g.running, travado: g._anuncio };
});
console.log('jogar de novo, durante:', JSON.stringify(jogarDeNovo));
check(jogarDeNovo.travado, 'Jogar de novo não travou o jogo enquanto o anúncio "carregava"');
await resolverAnuncio();
await p.waitForFunction(() => window.game.running === true, { timeout: 5000 });
console.log('jogar de novo: partida recomeçou depois do intervalo resolver — ok');

// -------------------------------------- 7. a página não pode rolar por baixo
/*
 * No Poki o jogo fica dentro de uma página mais alta que pode rolar; espaço e
 * as setas por padrão rolam a página, e a roda do mouse também. `Input.js` já
 * barra as teclas do próprio jogo; isto aqui confere a rede de segurança extra
 * que `evitarRolagemDaPagina()` adiciona por cima.
 */
const rolagem = await p.evaluate(() => {
  const roda = new WheelEvent('wheel', { cancelable: true });
  dispatchEvent(roda);
  const seta = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
  dispatchEvent(seta);
  return { rodaBarrada: roda.defaultPrevented, setaBarrada: seta.defaultPrevented };
});
console.log('rolagem        :', JSON.stringify(rolagem));
check(rolagem.rodaBarrada, 'a roda do mouse não é barrada — pode rolar a página do Poki por baixo do jogo');
check(rolagem.setaBarrada, 'a seta para baixo não é barrada');

if (erros.length) { falhas++; console.log('ERROS:', erros.slice(0, 4).join(' | ')); }
await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nPOKI SDK INTEGRADO CORRETAMENTE\n');
process.exit(falhas ? 1 : 0);
