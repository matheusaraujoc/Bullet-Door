// O menu inicial tem que caber na tela, sem rolagem, em toda tela plausível.
//   node tools/test-menu.mjs
//
// Rolar um menu é o tipo de coisa que ninguém faz: o jogador vê o botão JOGAR,
// clica, e nunca descobre que havia instrução abaixo da dobra.
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5175;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const p = await b.newPage();

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };

// notebook comum, notebook grande, monitor, netbook, e celular deitado
const telas = [
  [1280, 720, 0], [1366, 768, 0], [1920, 1080, 0],
  [1024, 600, 0], [900, 506, 1], [740, 360, 1],
];

for (const [w, h, toque] of telas) {
  await p.setViewport({ width: w, height: h, hasTouch: !!toque, isMobile: !!toque });
  await p.goto(`http://localhost:${PORT}/?fast${toque ? '&touch' : ''}`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });

  const m = await p.evaluate(() => {
    const card = document.querySelector('#menu .m-card');
    const r = card.getBoundingClientRect();
    const visivel = el => el && el.offsetParent !== null;
    const jogar = document.getElementById('btnPlay').getBoundingClientRect();
    return {
      sobra: card.scrollHeight - card.clientHeight,
      dentroDaTela: r.top >= -1 && r.bottom <= innerHeight + 1,
      // o que não pode faltar em nenhum tamanho
      temRegra: visivel(document.querySelector('.regra')),
      temControles: visivel(document.querySelector('.keys')) || visivel(document.querySelector('.keys-toque')),
      jogarVisivel: jogar.top >= 0 && jogar.bottom <= innerHeight,
    };
  });

  const cabe = m.sobra <= 1;
  console.log(`${w}x${h}${toque ? ' toque' : ''}`.padEnd(16),
    cabe ? 'cabe' : `ROLA (+${m.sobra}px)`,
    `| regra:${m.temRegra ? 'sim' : 'NÃO'} controles:${m.temControles ? 'sim' : 'NÃO'}`);

  check(cabe, `${w}x${h}: o menu precisa de rolagem (${m.sobra}px além da caixa)`);
  check(m.dentroDaTela, `${w}x${h}: o cartão do menu passa da borda da tela`);
  check(m.jogarVisivel, `${w}x${h}: o botão JOGAR não está visível`);
  check(m.temRegra, `${w}x${h}: a explicação das regras sumiu`);
  check(m.temControles, `${w}x${h}: a lista de controles sumiu`);
}

// ------------------------------------------- a marca: DOOR sob BULLET
await p.setViewport({ width: 1280, height: 720 });
await p.goto(`http://localhost:${PORT}/?fast`, { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });

const marca = await p.evaluate(() => {
  const centro = sel => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { c: r.left + r.width / 2, l: r.left, w: r.width };
  };
  return { bullet: centro('.linha-1'), door: centro('.linha-2') };
});
const desvio = Math.abs(marca.bullet.c - marca.door.c);
console.log(`\nmarca: BULLET centro ${marca.bullet.c.toFixed(0)} | DOOR centro ${marca.door.c.toFixed(0)} | desvio ${desvio.toFixed(1)}px`);
check(desvio <= 4, `DOOR está ${desvio.toFixed(1)}px fora do eixo de BULLET`);

// ------------------------------------------------- a mira é branca
const mira = await p.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('#crosshair span'));
  return cs.backgroundColor;
});
const [, r, g, bl] = mira.match(/(\d+),\s*(\d+),\s*(\d+)/).map(Number);
const cinza = Math.abs(r - g) < 14 && Math.abs(g - bl) < 14 && r > 200;
console.log(`mira : ${mira} → ${cinza ? 'branca' : 'COLORIDA'}`);
check(cinza, `a mira saiu colorida (${mira}) — ela tem que ser branca`);

await p.screenshot({ path: 'tools/_menu.png' });
console.log('  tools/_menu.png');

await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nMENU CABE NA TELA\n');
process.exit(falhas ? 1 : 0);
