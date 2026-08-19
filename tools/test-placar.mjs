// O placar tem que responder "quem está ganhando?" — e a resposta é contagem
// de eliminações, não tempo.
//   node tools/test-placar.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5168;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));

await p.goto(`http://localhost:${PORT}/?fast&seed=4242`, { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };

// o menu é onde partida e rodada são explicadas, com calma, uma vez só
const regra = await p.$eval('.regra', e => e.textContent.replace(/\s+/g, ' ').trim());
console.log('menu      :', regra);
check(/partida/i.test(regra) && /rodada/i.test(regra),
      `o menu não explica partida e rodada: "${regra}"`);
check(/ponto/i.test(regra) && /2 elimina/i.test(regra),
      `o menu não diz como se pontua nem quanto leva a partida: "${regra}"`);
check(!/mais rápido/i.test(regra) && !/tempo/i.test(regra),
      `o menu ainda promete a regra antiga, por tempo: "${regra}"`);

await p.click('#btnPlay');
await p.waitForFunction(() => window.game.rounds.state === 'playing', { timeout: 60000 });

const ler = () => p.evaluate(() => ({
  rodada: document.getElementById('roundLabel').textContent,
  voce: document.getElementById('scoreYou').textContent,
  bot: document.getElementById('scoreBot').textContent,
  nota: document.querySelector('.s-nota').textContent,
  lideraY: document.getElementById('scoreYou').classList.contains('lidera'),
  lideraB: document.getElementById('scoreBot').classList.contains('lidera'),
}));

const inicio = await ler();
console.log('no começo :', JSON.stringify(inicio));
check(/RODADA 1 DE 3/.test(inicio.rodada), `o formato da disputa não aparece: "${inicio.rodada}"`);
check(/ELIMINA/i.test(inicio.nota), `o placar não diz o que os números são: "${inicio.nota}"`);
check(inicio.voce === '0' && inicio.bot === '0', 'a partida não começou zerada');
check(!inicio.lideraY && !inicio.lideraB, 'alguém já lidera antes de qualquer eliminação');

// você elimina: o ponto entra no placar na hora, sem esperar o fim da rodada
const seuAbate = await p.evaluate(() => {
  const g = window.game;
  g.player.setRole('hunter');
  g.rounds.state = 'playing';
  g.rounds.registerKill();
  g.hud.setScore(g.rounds.scoreYou, g.rounds.scoreBot, g.rounds.round);
  return { voce: g.rounds.scoreYou, bot: g.rounds.scoreBot };
});
const comPonto = await ler();
console.log('você matou:', JSON.stringify({ ...seuAbate, tela: `${comPonto.voce}-${comPonto.bot}` }));
check(comPonto.voce === '1', `o placar na tela ficou "${comPonto.voce}" depois da sua eliminação`);
check(comPonto.lideraY && !comPonto.lideraB, 'você eliminou e não aparece na frente');

// o bot empata: ninguém lidera
await p.evaluate(() => {
  const g = window.game;
  g.rounds.scoreBot = 1;
  g.hud.setScore(g.rounds.scoreYou, g.rounds.scoreBot, g.rounds.round);
});
const empate = await ler();
console.log('empatou   :', JSON.stringify(empate));
check(!empate.lideraY && !empate.lideraB, 'placar igual não pode ter alguém aceso');

// o bot passa na frente
await p.evaluate(() => {
  const g = window.game;
  g.rounds.scoreBot = 2;
  g.hud.setScore(g.rounds.scoreYou, g.rounds.scoreBot, g.rounds.round);
});
const botNaFrente = await ler();
console.log('bot 2-1   :', JSON.stringify(botNaFrente));
check(botNaFrente.lideraB && !botNaFrente.lideraY, 'o bot eliminou mais e não aparece na frente');

// rodada de desempate: "RODADA 4 DE 3" seria mentira
const desempate = await p.evaluate(() => {
  const g = window.game;
  g.hud.setScore(2, 2, 4);
  return document.getElementById('roundLabel').textContent;
});
console.log('4ª rodada :', desempate);
check(/DESEMPATE/.test(desempate), `a rodada extra saiu como "${desempate}"`);

await p.evaluate(() => window.game.hud.setScore(0, 0, 1));
await p.screenshot({ path: 'tools/_placar.png' });
console.log('  tools/_placar.png');

if (erros.length) { falhas++; console.log('ERROS:', erros.slice(0, 4).join(' | ')); }
await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nPLACAR POR ELIMINAÇÃO OK\n');
process.exit(falhas ? 1 : 0);
