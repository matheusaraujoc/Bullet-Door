// A bala tem que respeitar o que está no caminho.
//   node tools/test-balistica.mjs
//
// O disparo do inimigo era resolvido só por ângulo: se a mira caísse dentro da
// largura angular do alvo, era acerto — parede no meio ou não. Este teste põe
// uma parede entre os dois e dispara mil vezes.
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5183;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));

await p.goto(`http://localhost:${PORT}/?fast&seed=77`, { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });
await p.click('#btnPlay');
await p.waitForFunction(() => window.game.rounds.state === 'playing', { timeout: 60000 });

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };

/**
 * Põe os dois em posições dadas e manda o inimigo atirar N vezes,
 * contando quantas acertaram.
 */
const fuzilar = (cenario, tiros = 400) => p.evaluate(async (cen, n) => {
  const { CFG } = await import('/src/core/config.js');
  const g = window.game;
  const bot = g.bot;

  /*
   * Parede de VERDADE, não `staticSolid`.
   *
   * `staticSolid` também é verdadeiro para caixote, que tem 1,1 m de altura —
   * e a bala passar por cima de um caixote é o comportamento certo, não o
   * defeito que este teste procura. Exigir a célula WALL é o que separa "atirou
   * através do muro" de "atirou por cima da caixa".
   */
  const { cellAt, WALL } = await import('/src/world/MazeGen.js');
  const parede = (cx, cy) => cellAt(g.world.map, cx, cy) === WALL;
  const solido = (cx, cy) => g.world.staticSolid(cx, cy);
  let atirador = null, alvoCel = null;
  busca:
  for (let cy = 2; cy < g.world.map.H - 2; cy++) {
    for (let cx = 2; cx < g.world.map.W - 2; cx++) {
      if (solido(cx, cy)) continue;
      for (const passo of [2, 3, 4]) {
        const ax = cx + passo * 2;
        if (ax >= g.world.map.W - 1 || solido(ax, cy)) continue;
        // conta o que há no trecho entre os dois
        let paredes = 0, obstaculos = 0;
        for (let k = cx + 1; k < ax; k++) {
          if (parede(k, cy)) paredes++;
          if (solido(k, cy)) obstaculos++;
        }
        const querParede = cen === 'parede';
        // no cenário aberto o caminho tem que estar limpo de tudo, inclusive
        // caixote — senão "acertou pouco" pode ser mira ruim ou pode ser a caixa
        if (querParede ? paredes >= 1 : obstaculos === 0) {
          atirador = { x: cx, y: cy }; alvoCel = { x: ax, y: cy };
          break busca;
        }
      }
    }
  }
  if (!atirador) return { achou: false };

  bot.pos.set(atirador.x * CFG.CELL, 0, atirador.y * CFG.CELL);
  bot.vel.set(0, 0, 0);
  bot.speed = 0;
  bot.aimWarm = 1;                       // pontaria já quente: o pior caso
  bot.actor.object.position.copy(bot.pos);
  bot.actor.object.updateMatrixWorld(true);

  g.player.pos.set(alvoCel.x * CFG.CELL, 0, alvoCel.y * CFG.CELL);
  g.player.alive = true;
  g.player.speed = 0;
  g.playerHitbox.position.set(g.player.pos.x, 0.9, g.player.pos.z);
  g.playerHitbox.updateMatrixWorld();

  // olha exatamente para o alvo
  bot.yaw = Math.atan2(g.player.pos.x - bot.pos.x, g.player.pos.z - bot.pos.z);

  let acertos = 0;
  const original = g.onBotHitPlayer.bind(g);
  g.onBotHitPlayer = () => { acertos++; };
  const semRodada = g.rounds.registerKill.bind(g.rounds);
  g.rounds.registerKill = () => {};

  for (let i = 0; i < n; i++) {
    bot.fireTimer = 0;
    bot._shoot(g.player, bot.pos.distanceTo(g.player.pos));
  }

  g.onBotHitPlayer = original;
  g.rounds.registerKill = semRodada;
  return { achou: true, acertos, tiros: n, dist: +bot.pos.distanceTo(g.player.pos).toFixed(1) };
}, cenario, tiros);

// ---------------------------------------------- 1. com parede no meio
const comParede = await fuzilar('parede');
console.log('com parede :', JSON.stringify(comParede));
check(comParede.achou, 'não achei um par de posições separadas por parede');
check(comParede.acertos === 0,
  `o inimigo acertou ${comParede.acertos} de ${comParede.tiros} tiros ATRAVÉS de uma parede`);

// ---------------------------------------------- 2. em campo aberto ele acerta
const semParede = await fuzilar('aberto');
console.log('sem parede :', JSON.stringify(semParede));
check(semParede.achou, 'não achei um par de posições em linha livre');
check(semParede.acertos > 0,
  'em linha livre o inimigo não acertou nada — a trajetória está barrando tudo');

// ---------------------------------------------- 3. porta fechada também barra
const comPorta = await p.evaluate(async () => {
  const { CFG } = await import('/src/core/config.js');
  const g = window.game;
  const bot = g.bot;
  const portas = g.world.doors;

  // uma porta simples, com célula livre dos dois lados no eixo da passagem
  for (const d of portas.list) {
    if (d.kind !== 'simples') continue;
    // eixo 'z' quer dizer que a folha atravessa Z, então se passa por X
    const eixoX = d.axis === 'z';
    const ax = d.x - (eixoX ? 1 : 0), ay = d.y - (eixoX ? 0 : 1);
    const bx = d.x + (eixoX ? 1 : 0), by = d.y + (eixoX ? 0 : 1);
    if (g.world.staticSolid(ax, ay) || g.world.staticSolid(bx, by)) continue;

    // garante a porta baixada até o chão
    d.open = false;
    d.painel.alvo = 0;
    d.painel.y = 0;
    portas._write(d.painel);

    bot.pos.set(ax * CFG.CELL, 0, ay * CFG.CELL);
    bot.vel.set(0, 0, 0); bot.speed = 0; bot.aimWarm = 1;
    bot.actor.object.position.copy(bot.pos);
    bot.actor.object.updateMatrixWorld(true);

    g.player.pos.set(bx * CFG.CELL, 0, by * CFG.CELL);
    g.player.alive = true; g.player.speed = 0;
    g.playerHitbox.position.set(g.player.pos.x, 0.9, g.player.pos.z);
    g.playerHitbox.updateMatrixWorld();
    bot.yaw = Math.atan2(g.player.pos.x - bot.pos.x, g.player.pos.z - bot.pos.z);

    let acertos = 0;
    const original = g.onBotHitPlayer.bind(g);
    g.onBotHitPlayer = () => { acertos++; };
    const semRodada = g.rounds.registerKill.bind(g.rounds);
    g.rounds.registerKill = () => {};
    for (let i = 0; i < 300; i++) { bot.fireTimer = 0; bot._shoot(g.player, 6.4); }
    g.onBotHitPlayer = original;
    g.rounds.registerKill = semRodada;

    // e com a porta erguida a bala volta a passar: a folha é que barra, não o mapa
    d.painel.y = 3.6;
    portas._write(d.painel);
    let comAberta = 0;
    g.onBotHitPlayer = () => { comAberta++; };
    g.rounds.registerKill = () => {};
    for (let i = 0; i < 300; i++) { bot.fireTimer = 0; bot._shoot(g.player, 6.4); }
    g.onBotHitPlayer = original;
    g.rounds.registerKill = semRodada;

    return { achou: true, fechada: acertos, aberta: comAberta, porta: `${d.x},${d.y} eixo ${d.axis}` };
  }
  return { achou: false };
});
console.log('porta      :', JSON.stringify(comPorta));
check(comPorta.achou, 'não achei uma porta simples com folga dos dois lados');
if (comPorta.achou) {
  check(comPorta.fechada === 0,
    `o inimigo acertou ${comPorta.fechada} de 300 tiros através de uma porta FECHADA`);
  check(comPorta.aberta > 0,
    'com a porta erguida a bala continuou barrada — quem barra tem que ser a folha');
}

// ------------------------------- 4. o clarão não pode ficar preso na tela
const clarao = await p.evaluate(async () => {
  const g = window.game;
  g.player.setRole('hunter');
  g.player.vm.flash.disparar();
  const aceso = g.player.vm.flash.grupo.visible;

  // a rodada acaba no mesmo instante do tiro
  g.rounds.state = 'roundend';
  for (let i = 0; i < 40; i++) {
    g.player.update(0.016 * 0.0001);
    g.player.vm.flash.update(0.016);
    await new Promise(r => requestAnimationFrame(r));
  }
  return { aceso, aindaAceso: g.player.vm.flash.grupo.visible };
});
console.log('clarão     :', JSON.stringify(clarao));
check(clarao.aceso, 'o clarão nem chegou a acender');
check(!clarao.aindaAceso,
  'o clarão continua aceso depois da rodada — é a estrela plantada por cima da arma');

// e fechar a metade tem que apagar na hora
const apagou = await p.evaluate(() => {
  const g = window.game;
  g.player.vm.flash.disparar();
  g.onHalfEnded('hunter', true);
  return g.player.vm.flash.grupo.visible;
});
console.log('meia-volta :', apagou ? 'ficou aceso' : 'apagou na hora');
check(!apagou, 'terminar a metade não apagou o clarão');

// ------------------- 5. nenhum aviso pode encavalar em cima de outro
/*
 * "PASSOU PERTO" nascia num `top` contado à mão e encostava em "SOBREVIVA —
 * NEGUE O PONTO" toda vez que a tipografia crescia um ponto.
 */
const encavalou = await p.evaluate(async () => {
  const g = window.game;
  g.rounds.state = 'playing';
  g.player.setRole('runner');
  g.hud.setRole('runner', g._objetivo('runner'));
  for (let i = 0; i < 3; i++) g.hud.feed('PASSOU PERTO');
  await new Promise(r => setTimeout(r, 260));

  const caixas = [
    ['painel do topo', document.querySelector('#top .painel')],
    ['objetivo', document.getElementById('objective')],
    ['avisos', document.getElementById('killfeed')],
    ['placar', document.querySelector('#score .painel')],
  ].filter(([, e]) => e && e.offsetParent !== null)
   .map(([nome, e]) => { const r = e.getBoundingClientRect(); return { nome, r }; });

  const cruza = (a, b) => a.r.left < b.r.right - 1 && b.r.left < a.r.right - 1
                       && a.r.top < b.r.bottom - 1 && b.r.top < a.r.bottom - 1;
  const pares = [];
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) {
      if (cruza(caixas[i], caixas[j])) pares.push(`${caixas[i].nome} × ${caixas[j].nome}`);
    }
  }
  return {
    pares,
    avisos: document.querySelectorAll('#killfeed div').length,
    ordem: caixas.map(c => `${c.nome}@${Math.round(c.r.top)}`),
  };
});
console.log('sobreposto :', JSON.stringify(encavalou));
check(encavalou.avisos > 0, 'os avisos nem apareceram');
check(encavalou.pares.length === 0, `elementos do HUD sobrepostos: ${encavalou.pares.join(', ')}`);

if (erros.length) { falhas++; console.log('ERROS:', erros.slice(0, 4).join(' | ')); }
await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nBALÍSTICA E CLARÃO OK\n');
process.exit(falhas ? 1 : 0);
