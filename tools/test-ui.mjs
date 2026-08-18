// Fotografa menu, HUD e abertura, para conferir a identidade visual.
//   node tools/test-ui.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5175;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });

await p.goto(`http://localhost:${PORT}/?semintro&seed=4242`, { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });
await new Promise(r => setTimeout(r, 2500));       // deixa a planta animar
await p.screenshot({ path: 'tools/_ui_menu.png' });
console.log('  tools/_ui_menu.png');

// confere que a planta é um mapa real, e não um padrão decorativo
const arte = await p.evaluate(() => {
  const c = document.getElementById('menuArte');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let pintados = 0;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 8) pintados++;
  return { largura: c.width, altura: c.height, amostrasPintadas: pintados };
});
console.log('  planta:', JSON.stringify(arte));

await p.click('#btnPlay');
await p.waitForFunction(() => window.game.rounds.state === 'playing', { timeout: 60000 });
await new Promise(r => setTimeout(r, 600));
await p.evaluate(() => {
  const g = window.game;
  const r = g.map.rooms.reduce((a, b) => (a.w * a.h > b.w * b.h ? a : b));
  g.player.pos.set(r.cx * 3.2, 0, r.cy * 3.2);
  g.player.yaw = 0.6; g.player.pitch = -0.02;
  g.player._applyCamera(0.016);
  g.hud.addNoise({ x: g.player.pos.x + 12, z: g.player.pos.z - 4 }, 0.9);
  g.hud.feed('ALVO ABATIDO');
  g.hud.update(0.016, g.player.pos, g.player.yaw);
});
await new Promise(r => setTimeout(r, 700));
await p.screenshot({ path: 'tools/_ui_hud.png' });
console.log('  tools/_ui_hud.png');

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };
check(erros.length === 0, 'erros: ' + erros.slice(0, 4).join(' | '));
check(arte.amostrasPintadas > 40, 'a planta do menu saiu vazia');
await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nUI OK\n');
process.exit(falhas ? 1 : 0);
