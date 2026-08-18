// Simula a hospedagem do itch.io: o build servido de uma SUBPASTA e dentro de
// um iframe com sandbox, que é como o portal entrega o jogo.
//   node tools/build:itch primeiro, ou npm run build
//   node tools/test-itch.mjs
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5171;
// o caminho fundo de propósito: é assim que o portal serve
const SUB = '/html/1234567/bullet-door';

const TIPOS = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.fbx': 'application/octet-stream',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};

/** Servidor estático mínimo, servindo dist/ debaixo de SUB. */
const servidor = createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') {
    // a página de fora, que embute o jogo igual ao portal faz
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
  const rel = url.slice(SUB.length) || '/index.html';
  const arquivo = normalize(join('dist', rel === '/' ? '/index.html' : rel));
  if (!arquivo.startsWith('dist') || !existsSync(arquivo) || !statSync(arquivo).isFile()) {
    res.writeHead(404); res.end('não achei ' + rel); return;
  }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream' });
  res.end(readFileSync(arquivo));
});
await new Promise(r => servidor.listen(PORT, r));

const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });

const erros = [], faltando = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
p.on('console', m => {
  const t = m.text();
  if (m.type() !== 'error') return;
  if (/404|Failed to load resource/.test(t)) return;   // já contados acima
  erros.push(t);
});
p.on('response', r => {
  const nome = r.url().split('/').pop();
  // o logo do estúdio é opcional (a abertura tem marca de reserva) e o
  // favicon.ico é pedido pelo próprio navegador, não pelo jogo
  if (nome === 'Kountera_Games_Logo.png' || nome === 'favicon.ico') return;
  if (r.status() >= 400) faltando.push(`${r.status()} ${nome}`);
});

console.log(`servindo dist/ em http://localhost:${PORT}${SUB}/\n`);
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });

// tudo daqui para baixo acontece DENTRO do iframe, como no portal
const quadro = p.frames().find(f => f.url().includes(SUB));
let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };
check(!!quadro, 'o jogo não carregou dentro do iframe');

if (quadro) {
  await quadro.waitForFunction(() => !!document.getElementById('intro'), { timeout: 30000 })
    .catch(() => {});
  await p.screenshot({ path: 'tools/_itch_1_entrada.png' });
  console.log('  tools/_itch_1_entrada.png');

  // clica para começar: é o gesto que libera o áudio
  await quadro.click('#intro .comecar').catch(() => {});
  await quadro.waitForFunction(() => !document.getElementById('intro'), { timeout: 40000 })
    .catch(() => {});

  // espera os modelos: se algum caminho quebrou, isto nunca fica pronto
  const carregou = await quadro.waitForFunction(() => window.game && window.game.ready,
    { timeout: 120000 }).then(() => true, () => false);
  check(carregou, 'os modelos não carregaram na subpasta (caminho quebrado)');

  await quadro.click('#btnPlay').catch(() => {});
  const jogando = await quadro.waitForFunction(() => window.game.rounds.state === 'playing',
    { timeout: 60000 }).then(() => true, () => false);
  check(jogando, 'a partida não começou');

  await new Promise(r => setTimeout(r, 1200));
  await p.screenshot({ path: 'tools/_itch_2_jogando.png' });
  console.log('  tools/_itch_2_jogando.png');

  const estado = await quadro.evaluate(() => {
    const g = window.game;
    return {
      modelosProntos: !!g.assets.ready,
      temPersonagem: !!g.bot?.actor?.object,
      temArma: !!g.player.vm,
      draw: g.renderer.info.render.calls,
      tri: g.renderer.info.render.triangles,
      // pointer lock dentro de iframe com sandbox é o que decide se dá para mirar
      pointerLockPermitido: typeof document.body.requestPointerLock === 'function',
    };
  });
  console.log('\nestado dentro do iframe:', JSON.stringify(estado, null, 1));
  check(estado.modelosProntos && estado.temPersonagem && estado.temArma,
    'algum recurso não chegou');
  check(estado.draw > 5 && estado.tri > 1000, 'a cena não está sendo desenhada');
}

if (faltando.length) {
  falhas++;
  console.log('\nARQUIVOS QUE NÃO CARREGARAM:');
  [...new Set(faltando)].slice(0, 12).forEach(f => console.log('  ', f));
}
if (erros.length) { falhas++; console.log('\nERROS:'); erros.slice(0, 6).forEach(e => console.log('  ', e)); }

await b.close();
servidor.close();
console.log(falhas ? `\n${falhas} FALHA(S) — ainda não está pronto para o portal\n`
                   : '\nRODA EM SUBPASTA E DENTRO DE IFRAME\n');
process.exit(falhas ? 1 : 0);
