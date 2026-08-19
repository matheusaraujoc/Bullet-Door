// Reduz o logo do estúdio para um tamanho de web.
// O original tem 3072x2048 e quase 6 MB — mais de dez vezes o pacote inteiro
// do jogo, para uma imagem que aparece por três segundos com 460px de largura.
//   node tools/otimizar-logo.mjs
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const ORIGEM = 'images/Kountera_Games_Logo.png';
const DESTINO = 'public/images/Kountera_Games_Logo.png';
const LARGURA = 1024;          // o dobro do maior tamanho que a intro usa

if (!existsSync(ORIGEM)) { console.error('não achei', ORIGEM); process.exit(1); }

const b = await puppeteer.launch({ executablePath: exe, headless: 'shell', args: ['--no-sandbox'] });
const p = await b.newPage();
const dataUri = 'data:image/png;base64,' + readFileSync(ORIGEM).toString('base64');

const saida = await p.evaluate(async (uri, larguraAlvo) => {
  const img = new Image();
  img.src = uri;
  await img.decode();
  const escala = Math.min(1, larguraAlvo / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { png: c.toDataURL('image/png'), w: c.width, h: c.height, ow: img.width, oh: img.height };
}, dataUri, LARGURA);

await b.close();
writeFileSync(DESTINO, Buffer.from(saida.png.split(',')[1], 'base64'));

const antes = statSync(ORIGEM).size / 1024;
const depois = statSync(DESTINO).size / 1024;
console.log(`${saida.ow}x${saida.oh} (${antes.toFixed(0)} KB)  →  ` +
            `${saida.w}x${saida.h} (${depois.toFixed(0)} KB)`);
console.log(`gravado em ${DESTINO}`);
