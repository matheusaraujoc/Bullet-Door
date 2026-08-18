// Fotografa o personagem voxel de vários ângulos usando a página /preview.html.
//   node tools/preview-model.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5195;
const vite = subirVite(PORT);
await esperarVite(PORT);

const browser = await puppeteer.launch({
  executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 640 });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));

await page.goto(`http://localhost:${PORT}/preview.html`, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => !!window.preview, { timeout: 60000 });
await page.evaluate(() => { window.preview.freeze(); window.preview.chrome(false); });

console.log(await page.$eval('#info', el => el.textContent));

await page.evaluate(() => { window.preview.play('idle with pistol'); window.preview.step(0.6); });

const views = [
  ['frente', 0, 1.0, 4],
  ['costas', 0, 1.0, -4],
  ['lado', 4, 1.0, 0],
  ['diagonal', 3, 2.2, 3],
];
for (const [name, x, y, z] of views) {
  await page.evaluate((a, b, c) => window.preview.view(a, b, c), x, y, z);
  await page.screenshot({ path: `tools/_model_${name}.png` });
  console.log('  tools/_model_' + name + '.png');
}

await browser.close();
matarVite(vite, PORT);
process.exit(0);
