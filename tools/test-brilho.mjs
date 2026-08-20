// O brilho metálico tem que CLAREAR a marca — no pacote publicado.
//   npm run test:brilho     (exige um zip: rode "npm run itch" antes)
//
// Duas armadilhas já pegaram este efeito, e as duas estão cobertas aqui.
//
// A primeira foi de mistura: com `mix-blend-mode: overlay`, que escurece o que
// já é escuro, a faixa branca entrava numa marca laranja sobre preto e sumia.
// O efeito existia no DOM e não aparecia na tela — daí a medida ser em pixel.
//
// A segunda foi de MÉTODO, e é a que fez esta versão existir: o teste rodava
// contra o servidor de desenvolvimento, e o defeito só acontecia no zip dentro
// de um iframe, que é como o portal serve. Testar o artefato errado é o mesmo
// que não testar.
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { extname } from 'node:path';

const PACOTE = 'bullet-door-web.zip';
const PORT = 5169;
const SUB = '/html/1234567/bullet-door';
const TIPOS = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.fbx': 'application/octet-stream',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};

/** Lê um zip inteiro para a memória: caminho -> conteúdo. */
function lerZip(caminho) {
  const buf = readFileSync(caminho);
  let fim = -1;
  for (let i = buf.length - 22; i >= 0 && fim < 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) fim = i;
  }
  if (fim < 0) throw new Error('zip inválido: sem diretório central');
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);

  const arquivos = new Map();
  for (let n = 0; n < total; n++) {
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const tamNome = buf.readUInt16LE(p + 28);
    const tamExtra = buf.readUInt16LE(p + 30);
    const tamCom = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + tamNome);
    const nomeLocal = buf.readUInt16LE(offset + 26);
    const extraLocal = buf.readUInt16LE(offset + 28);
    const ini = offset + 30 + nomeLocal + extraLocal;
    const dados = buf.subarray(ini, ini + tamComp);
    arquivos.set(nome, metodo === 0 ? dados : inflateRawSync(dados));
    p += 46 + tamNome + tamExtra + tamCom;
  }
  return arquivos;
}

if (!existsSync(PACOTE)) {
  console.error(`${PACOTE} não existe — rode "npm run itch" antes.`);
  process.exit(1);
}
const conteudo = lerZip(PACOTE);

const servidor = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><meta charset="utf-8"><title>moldura</title>
      <style>html,body{margin:0;height:100%;background:#111}
             iframe{border:0;width:100%;height:100%;display:block}</style>
      <iframe id="jogo" src="${SUB}/index.html"
              sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-forms"
              allow="autoplay; fullscreen; pointer-lock"></iframe>`);
    return;
  }
  if (!url.startsWith(SUB)) { res.writeHead(404); res.end('fora da subpasta'); return; }
  let rel = url.slice(SUB.length).replace(/^\//, '');
  if (rel === '') rel = 'index.html';
  const dados = conteudo.get(rel);
  if (!dados) { res.writeHead(404); res.end('não achei ' + rel); return; }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(rel)] ?? 'application/octet-stream' });
  res.end(dados);
});
await new Promise(r => servidor.listen(PORT, r));

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1000,600'] });
const p = await b.newPage();
await p.setViewport({ width: 1000, height: 600 });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };

await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });

// tudo daqui para baixo acontece DENTRO do iframe, como no portal
const quadro = await (await p.$('#jogo')).contentFrame();
check(!!quadro, 'o jogo não carregou dentro do iframe');

await quadro.waitForSelector('#intro .comecar', { timeout: 30000 });
await quadro.click('#intro .comecar');
await quadro.waitForFunction(
  () => document.querySelector('#intro .logo-stage')?.classList.contains('show'),
  { timeout: 30000 });
// a marca entra com uma transição de opacidade: mede depois que ela assentou,
// e ANTES da lâmina, que só passa perto de um segundo depois
await new Promise(r => setTimeout(r, 450));

// ---------------------------------------------- 1. o efeito existe e é claro
const estilo = await quadro.evaluate(() => {
  const marca = document.querySelector('#intro .marca')?.firstElementChild;
  return {
    marca: marca ? marca.tagName.toLowerCase() : null,
    classe: marca?.className ?? null,
    largura: marca?.width ?? marca?.offsetWidth ?? 0,
  };
});
console.log('marca     :', JSON.stringify(estilo));
check(estilo.marca === 'canvas',
  `a marca saiu como <${estilo.marca}> — com a imagem no lugar ela tem que ser canvas, ` +
  'que é o que desenha a lâmina sem depender de mistura de camada nem de máscara');
check(estilo.largura > 100, `o canvas da marca saiu com ${estilo.largura}px`);

/** Mede o brilho médio e quantos pixels claros há na área da marca. */
const medir = () => quadro.evaluate(() => {
  const alvo = document.querySelector('#intro .logo-stage').getBoundingClientRect();
  return { x: alvo.x, y: alvo.y, w: alvo.width, h: alvo.height };
});

const area = await medir();
let fotoMaisClara = null;
const amostrar = async rotulo => {
  const foto = await p.screenshot({ encoding: 'base64' });
  const r0 = await quadro.evaluate(async (b64, a, r) => {
    const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(Math.max(0, a.x | 0), Math.max(0, a.y | 0), a.w | 0, a.h | 0).data;
    let soma = 0, claros = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      soma += l; n++;
      if (l > 150) claros++;
    }
    return { rotulo: r, medio: +(soma / n).toFixed(2), claros };
  }, foto, area, rotulo);
  // guarda o quadro mais claro da passagem: é ele que mostra a lâmina
  if (!fotoMaisClara || r0.medio > fotoMaisClara.medio) fotoMaisClara = { ...r0, foto };
  return r0;
};

/*
 * A lâmina passa sozinha, no tempo dela.
 *
 * O teste NÃO dispara mais o efeito à mão. Disparar à mão prova que o efeito
 * existe; o que precisa ser provado é que ele acontece durante a abertura — foi
 * justamente aí que ele falhou no ar, com o desenho certo e o gatilho nunca
 * chegando. Então aqui a abertura corre e a tela é amostrada o tempo todo.
 */
const parado = await amostrar('antes da lâmina');
console.log('marca parada :', JSON.stringify(parado));

/*
 * A amostragem para quando a abertura sai de cena.
 *
 * Sem esse limite o laço continuava depois da abertura e pegava o MENU, que é
 * bem mais claro que a marca no escuro — o "quadro mais claro" virava o menu e
 * o teste passava medindo a coisa errada. Uma medida que continua verde por
 * acidente é pior que medida nenhuma.
 */
let melhor = { medio: 0, claros: 0 };
let amostras = 0;
for (let i = 0; i < 26; i++) {
  const aindaNaAbertura = await quadro.evaluate(
    () => !!document.getElementById('intro') &&
          !document.getElementById('intro').classList.contains('saindo'),
  ).catch(() => false);
  if (!aindaNaAbertura) break;

  const m = await amostrar('durante');
  amostras++;
  if (m.medio > melhor.medio) melhor = m;
  await new Promise(r => setTimeout(r, 80));
}
console.log(`durante      : ${JSON.stringify(melhor)} (${amostras} amostras dentro da abertura)`);
check(amostras >= 6, `só ${amostras} amostras couberam na abertura — janela curta demais para medir`);

/*
 * E um clique solto na tela NÃO pode matar a abertura.
 *
 * Era assim que o efeito "não funcionava no itch.io": pular estava armado num
 * clique em qualquer lugar, 60 ms depois de começar. Quem entra por um portal
 * clica na moldura para dar foco e clica de novo porque nada pareceu
 * acontecer — e o segundo clique descartava a abertura antes da lâmina.
 *
 * A medida é a mesma de cima, em pixel: procurar uma classe no DOM diria só
 * que o gatilho foi puxado, e o que interessa é a marca ter clareado.
 */
{
  const p2 = await b.newPage();
  await p2.setViewport({ width: 1000, height: 600 });
  await p2.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });
  const q2 = await (await p2.$('#jogo')).contentFrame();
  await q2.waitForSelector('#intro .comecar', { timeout: 30000 });
  await q2.click('#intro .comecar');

  await q2.waitForFunction(
    () => document.querySelector('#intro .logo-stage')?.classList.contains('show'),
    { timeout: 30000 });

  // dois cliques soltos, nos dois piores instantes
  await q2.evaluate(() => document.getElementById('intro')?.click());
  await new Promise(r => setTimeout(r, 450));
  await q2.evaluate(() => document.getElementById('intro')?.click());

  const area2 = await q2.evaluate(() => {
    const r = document.querySelector('#intro .logo-stage').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }).catch(() => null);

  let base = null, pico = 0;
  if (area2) {
    const ler = async () => {
      const foto = await p2.screenshot({ encoding: 'base64' });
      return q2.evaluate(async (b64, a) => {
        const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(Math.max(0, a.x | 0), Math.max(0, a.y | 0), a.w | 0, a.h | 0).data;
        let soma = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { soma += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
        return +(soma / n).toFixed(2);
      }, foto, area2).catch(() => null);
    };
    base = await ler();
    for (let k = 0; k < 22; k++) {
      const v = await ler();
      if (v !== null && v > pico) pico = v;
      await new Promise(r => setTimeout(r, 80));
    }
  }

  const ganhou = base !== null && pico - base > 3;
  console.log(`com cliques soltos: ${base ?? '—'} → ${pico || '—'} ` +
              `(${ganhou ? 'a lâmina ainda passou' : 'ABERTURA DESCARTADA'})`);
  check(ganhou, 'um clique solto na tela descartou a abertura antes da lâmina de luz');
  await p2.close();
}

writeFileSync('tools/_brilho.png', Buffer.from(fotoMaisClara.foto, 'base64'));
console.log('  tools/_brilho.png');

if (erros.length) { falhas++; console.log('ERROS:', erros.slice(0, 4).join(' | ')); }
await b.close();
servidor.close();
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nBRILHO METÁLICO APARECE NO PACOTE\n');
process.exit(falhas ? 1 : 0);
