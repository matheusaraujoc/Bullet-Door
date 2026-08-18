// A abertura tem que rodar uma vez, pedir os dois áudios e entregar o menu.
//   node tools/test-intro.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5176;
const vite = subirVite(PORT);
await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox',
         '--autoplay-policy=no-user-gesture-required','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });

const erros = [], pedidos = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
p.on('request', r => { const u = r.url(); if (/\.(mp3|png)$/i.test(u)) pedidos.push(u.split('/').pop()); });

await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });
await p.waitForSelector('#intro .comecar', { timeout: 20000 });
await p.screenshot({ path: 'tools/_intro_0_comecar.png' });
console.log('  tools/_intro_0_comecar.png  (tela de entrada)');

const menuVisivelAntes = await p.evaluate(() =>
  !document.getElementById('menu').classList.contains('hidden'));

await p.click('#intro .comecar');

// acompanha a abertura e fotografa os dois momentos marcados
let pegouLogo = false, pegouSweep = false;
for (let i = 0; i < 90; i++) {
  const st = await p.evaluate(() => {
    const el = document.getElementById('intro');
    if (!el) return { fim: true };
    return {
      fim: false,
      logo: el.querySelector('.logo-stage')?.classList.contains('show') || false,
      sweep: el.querySelector('.sweep')?.classList.contains('brilhar') || false,
    };
  });
  if (st.fim) break;
  if (st.logo && !pegouLogo) {
    pegouLogo = true;
    await p.screenshot({ path: 'tools/_intro_1_logo.png' });
    console.log('  tools/_intro_1_logo.png  (marca na tela)');
  }
  if (st.sweep && !pegouSweep) {
    pegouSweep = true;
    await p.screenshot({ path: 'tools/_intro_2_metal.png' });
    console.log('  tools/_intro_2_metal.png  (brilho metálico)');
  }
  await new Promise(r => setTimeout(r, 120));
}

await p.waitForFunction(() => !document.getElementById('intro'), { timeout: 20000 });
const menuDepois = await p.evaluate(() =>
  !document.getElementById('menu').classList.contains('hidden'));
await p.screenshot({ path: 'tools/_intro_3_menu.png' });
console.log('  tools/_intro_3_menu.png  (menu do jogo)');

console.log('\narquivos pedidos:', pedidos.join(', ') || '(nenhum)');
let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };
check(erros.length === 0, 'erros: ' + erros.slice(0, 4).join(' | '));
check(menuVisivelAntes === false, 'o menu aparecia por baixo da abertura');
check(pegouLogo, 'a marca nunca entrou em cena');
check(pegouSweep, 'o brilho metálico nunca disparou');
check(pedidos.includes('kountera_games.mp3'), 'o áudio da marca não foi pedido');
check(pedidos.includes('metalico.mp3'), 'o áudio metálico não foi pedido');
check(menuDepois, 'o menu não apareceu depois da abertura');

await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nABERTURA OK\n');
process.exit(falhas ? 1 : 0);
