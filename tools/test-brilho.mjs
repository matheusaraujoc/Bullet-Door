// O brilho metálico tem que CLAREAR a marca de verdade.
//
// Já esteve com mix-blend-mode: overlay, que escurece o que já é escuro — a
// marca é laranja sobre preto, então a faixa branca entrava e sumia. O efeito
// "existia" no DOM e não aparecia na tela, então aqui a medida é em pixel.
//   node tools/test-brilho.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5169;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1000,600'] });
const p = await b.newPage();
await p.setViewport({ width: 1000, height: 600 });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));

await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });
await p.waitForSelector('#intro .comecar');
await p.click('#intro .comecar');
await p.waitForFunction(() => document.querySelector('#intro .logo-stage')?.classList.contains('show'),
  { timeout: 20000 });
await new Promise(r => setTimeout(r, 300));

const estilo = await p.evaluate(() => {
  const sw = document.querySelector('#intro .sweep');
  const cs = getComputedStyle(sw);
  return { blend: cs.mixBlendMode, temMascara: sw.classList.contains('mascara') };
});
console.log('sweep:', JSON.stringify(estilo));

/** Recorta a área da marca e mede o brilho médio. */
const recorte = await p.evaluate(() => {
  const r = document.querySelector('#intro .logo-stage').getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
});

const medir = async () => {
  const png = await p.screenshot({ clip: recorte, encoding: 'base64' });
  return p.evaluate(async uri => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + uri;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let soma = 0, claros = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
      soma += lum;
      if (lum > 200) claros++;         // pixels quase brancos: é o reflexo
    }
    return { media: +(soma / (d.length / 4)).toFixed(2), claros };
  }, png);
};

// mede sem o brilho, depois no meio da passagem
const parado = await medir();
await p.evaluate(() => {
  const sw = document.querySelector('#intro .sweep');
  sw.classList.remove('brilhar');
  void sw.offsetWidth;
  sw.classList.add('brilhar');
});
let pico = { media: 0, claros: 0 };
for (let i = 0; i < 9; i++) {
  await new Promise(r => setTimeout(r, 90));
  const m = await medir();
  if (m.media > pico.media) pico = m;
}

console.log(`marca parada : brilho médio ${parado.media} | pixels claros ${parado.claros}`);
console.log(`durante      : brilho médio ${pico.media} | pixels claros ${pico.claros}`);
const ganho = pico.media - parado.media;
console.log(`ganho de brilho: +${ganho.toFixed(2)}`);

await p.screenshot({ path: 'tools/_brilho.png' });

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };
check(erros.length === 0, 'erros: ' + erros.slice(0, 3).join(' | '));
check(estilo.temMascara, 'o brilho não está mascarado pela marca');
check(estilo.blend !== 'overlay', 'o blend voltou a ser overlay, que apaga o reflexo no escuro');
check(ganho > 4, `o brilho quase não clareou a marca (ganho ${ganho.toFixed(2)})`);
check(pico.claros > parado.claros * 1.3 || pico.claros - parado.claros > 400,
  `poucos pixels acenderam (${parado.claros} → ${pico.claros})`);

await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nBRILHO METÁLICO APARECE\n');
process.exit(falhas ? 1 : 0);
