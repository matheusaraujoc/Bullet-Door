// Ensaio da publicação: serve O PRÓPRIO ZIP que vai para o itch.io, de uma
// SUBPASTA funda e dentro de um iframe com sandbox — que é como o portal
// entrega o jogo.
//
// Testar a pasta dist/ não bastava: o pacote saiu daqui uma vez com os caminhos
// internos usando barra invertida (herança do Compress-Archive do PowerShell) e
// o jogo subiu sem CSS nem JS, com o dist perfeito. Quem vai para o ar é o zip,
// então é o zip que se testa.
//   npm run test:itch
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5171;
const PACOTE = 'bullet-door-web.zip';
// caminho fundo de propósito: é assim que o portal serve
const SUB = '/html/1234567/bullet-door';

const TIPOS = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.fbx': 'application/octet-stream',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};

/** Lê um zip inteiro para a memória: caminho -> conteúdo. */
function lerZip(caminho) {
  const buf = readFileSync(caminho);
  // acha o fim do diretório central, varrendo de trás para frente
  let fim = -1;
  for (let i = buf.length - 22; i >= 0 && fim < 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) fim = i;
  }
  if (fim < 0) throw new Error('zip inválido: sem diretório central');
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);

  const arquivos = new Map();
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('entrada corrompida no zip');
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const tamNome = buf.readUInt16LE(p + 28);
    const tamExtra = buf.readUInt16LE(p + 30);
    const tamCom = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + tamNome);

    // pula o cabeçalho local para chegar aos dados
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

// O pacote precisa abrir por index.html na raiz, e sem nome torto. Estas duas
// checagens são as que pegariam de novo o erro que derrubou a primeira subida.
const tortos = [...conteudo.keys()].filter(k => k.includes('\\'));
if (tortos.length) {
  console.error('caminho com barra invertida dentro do zip:', tortos.slice(0, 5));
  process.exit(1);
}
if (!conteudo.has('index.html')) {
  console.error('o zip não tem index.html na raiz — o portal não saberia o que abrir');
  process.exit(1);
}

/** Servidor estático mínimo, servindo o ZIP debaixo de SUB. */
const servidor = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
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
  let rel = url.slice(SUB.length).replace(/^\//, '');
  if (rel === '') rel = 'index.html';
  const dados = conteudo.get(rel);
  if (!dados) { res.writeHead(404); res.end('não achei ' + rel); return; }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(rel)] || 'application/octet-stream' });
  res.end(dados);
});
await new Promise(r => servidor.listen(PORT, r));

const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });

const erros = [], faltando = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
p.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/404|Failed to load resource/.test(t)) return;   // já contados abaixo
  erros.push(t);
});
p.on('response', r => {
  const nome = r.url().split('/').pop();
  // o logo do estúdio é opcional (a abertura tem marca de reserva) e o
  // favicon.ico é pedido pelo próprio navegador, não pelo jogo
  if (nome === 'Kountera_Games_Logo.png' || nome === 'favicon.ico') return;
  if (r.status() >= 400) faltando.push(`${r.status()} ${nome}`);
});

console.log(`servindo ${PACOTE} (${conteudo.size} arquivos) em http://localhost:${PORT}${SUB}/\n`);
await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });

// tudo daqui para baixo acontece DENTRO do iframe, como no portal
const quadro = p.frames().find(f => f.url().includes(SUB));
let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };
check(!!quadro, 'o jogo não carregou dentro do iframe');

if (quadro) {
  await quadro.waitForFunction(() => !!document.getElementById('intro'), { timeout: 30000 })
    .catch(() => {});

  // A prova de que o CSS chegou: sem ele a folha de estilo não existe e o HUD
  // aparece como texto cru — que foi exatamente o que o portal mostrou.
  const estilo = await quadro.evaluate(() => {
    const el = document.querySelector('#hud') || document.body;
    return {
      folhas: document.styleSheets.length,
      hudEscondido: getComputedStyle(document.getElementById('hud')).display === 'none',
      fundoCorpo: getComputedStyle(document.body).backgroundColor,
    };
  });
  console.log('estilo:', JSON.stringify(estilo));
  check(estilo.folhas > 0, 'nenhuma folha de estilo carregou (o CSS não chegou)');
  check(estilo.hudEscondido, 'o HUD não está escondido — o CSS não foi aplicado');

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
    /*
     * `renderer.info.render` reflete só a ÚLTIMA chamada a `render()`, e
     * `_desenhar()` faz duas por quadro: o mundo primeiro, a arma depois numa
     * segunda passada (é o que mantém a arma por cima de tudo, sem entrar em
     * parede). Ler o contador depois do quadro normal pega só a arma — poucas
     * dezenas de triângulos — e não o mundo inteiro atrás dela. Para medir o
     * mundo de verdade, renderiza ele sozinho aqui, fora da dupla passada.
     */
    g.renderer.render(g.scene, g.camera);
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
  console.log('estado dentro do iframe:', JSON.stringify(estado));
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
console.log(falhas ? `\n${falhas} FALHA(S) — o pacote não está pronto para o portal\n`
                   : '\nO PACOTE RODA EM SUBPASTA E DENTRO DE IFRAME\n');
process.exit(falhas ? 1 : 0);
