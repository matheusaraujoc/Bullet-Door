// A arma não pode entrar na parede.
//   node tools/test-arma.mjs
//
// Com a arma dentro da cena do mundo, encostar numa parede fazia o cano
// atravessar o reboco: ela está a meio metro do olho, e qualquer parede mais
// perto que isso ganha o teste de profundidade. O conserto é desenhá-la numa
// segunda passada, depois de limpar o buffer — e é isso que este teste mede,
// contando quantos pixels da arma sobrevivem com o nariz colado no muro.
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync, writeFileSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5179;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));

await p.goto(`http://localhost:${PORT}/?fast&seed=31`, { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });
await p.click('#btnPlay');
await p.waitForFunction(() => window.game.rounds.state === 'playing', { timeout: 60000 });

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };

// a arma tem que estar numa cena própria, com câmera própria
const montagem = await p.evaluate(() => {
  const g = window.game;
  const arma = g.player.vm?.group;
  let raiz = arma;
  while (raiz?.parent) raiz = raiz.parent;
  return {
    temCenaDaArma: !!g.vmScene,
    armaNaCenaDaArma: raiz === g.vmScene,
    armaNoMundo: raiz === g.scene,
    autoClear: g.renderer.autoClear,
  };
});
console.log('montagem :', JSON.stringify(montagem));
check(montagem.temCenaDaArma, 'não existe cena separada para a arma');
check(montagem.armaNaCenaDaArma && !montagem.armaNoMundo,
  'a arma continua pendurada na cena do mundo — vai entrar em parede');
check(montagem.autoClear === false,
  'autoClear ligado apaga a primeira passada; o desenho em duas etapas não funciona');

/*
 * Quantos pixels a arma ocupa na tela, medidos por diferença.
 *
 * Contar "pixels escuros" não serve: ler o canvas de WebGL de fora devolve
 * preto, e mesmo funcionando o cenário muda de cor a cada mapa. A conta que
 * vale é tirar um quadro com a arma e outro sem, e contar o que mudou — isso é
 * a arma, seja qual for a cor da parede atrás dela.
 */
async function pixelsDaArma(rotulo) {
  const foto = async () => 'data:image/png;base64,' + await p.screenshot({ encoding: 'base64' });

  await p.evaluate(() => { window.game.player.vm.visible = true; });
  await new Promise(r => setTimeout(r, 220));
  const comArma = await foto();

  await p.evaluate(() => { window.game.player.vm.visible = false; });
  await new Promise(r => setTimeout(r, 220));
  const semArma = await foto();

  await p.evaluate(() => { window.game.player.vm.visible = true; });

  const n = await p.evaluate(async (a, b) => {
    const carregar = src => new Promise(ok => {
      const i = new Image(); i.onload = () => ok(i); i.src = src;
    });
    const [ia, ib] = await Promise.all([carregar(a), carregar(b)]);
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });

    ctx.drawImage(ia, 0, 0);
    const A = ctx.getImageData(0, 0, c.width, c.height).data;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(ib, 0, 0);
    const B = ctx.getImageData(0, 0, c.width, c.height).data;

    let n = 0;
    for (let i = 0; i < A.length; i += 4) {
      if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 24) n++;
    }
    return n;
  }, comArma, semArma);

  console.log(`${rotulo.padEnd(10)}: ${n} pixels de arma na tela`);
  return n;
}

// 1) em campo aberto: a arma inteira, e é a nossa referência
await p.evaluate(() => { window.game.player.setRole('hunter'); window.game.player.ads = 0; });
await new Promise(r => setTimeout(r, 250));
const emAberto = await pixelsDaArma('em aberto');
check(emAberto > 3000, `a arma nem aparece em campo aberto (${emAberto} pixels)`);

// 2) com o nariz colado numa parede, olhando para ela
const encostou = await p.evaluate(async () => {
  const g = window.game;
  const { CFG } = await import('/src/core/config.js');
  const solido = (cx, cy) => g.world.staticSolid(cx, cy);

  // uma célula livre com parede logo à frente
  for (let cy = 1; cy < 40; cy++) {
    for (let cx = 1; cx < 40; cx++) {
      if (solido(cx, cy) || !solido(cx, cy - 1)) continue;
      g.player.pos.set(cx * CFG.CELL, 0, cy * CFG.CELL);
      g.player.yaw = Math.PI;              // olhando para -Z, onde está a parede
      g.player.pitch = 0;
      g.player.vel.set(0, 0, 0);
      for (let i = 0; i < 40; i++) g.player.pos.z -= 0.05;   // empurra até encostar
      g.player.update(1 / 60);
      const d = g.player.pos.z - (cy * CFG.CELL - CFG.CELL / 2);
      return { achou: true, cx, cy, folgaAteAParede: +d.toFixed(2) };
    }
  }
  return { achou: false };
});
console.log('encostou  :', JSON.stringify(encostou));
check(encostou.achou, 'não achei uma parede para encostar');

await new Promise(r => setTimeout(r, 250));
const naParede = await pixelsDaArma('na parede');
const guardou = naParede / Math.max(1, emAberto);
console.log(`manteve   : ${(guardou * 100).toFixed(0)}% da arma com o nariz no muro`);
// a garantia de verdade é a estrutural, acima; esta aqui confere que a segunda
// passada de fato desenha a arma, em vez de a engolir junto com o mundo
check(guardou > 0.85,
  `encostado na parede sobrou ${(guardou * 100).toFixed(0)}% da arma — a segunda passada não está desenhando`);

await p.screenshot({ path: 'tools/_arma_parede.png' });
console.log('  tools/_arma_parede.png');

// ------------------- 3. o clarão sai da boca, não por cima da arma
/*
 * O clarão do disparo estava com o teste de profundidade desligado e desenhava
 * por cima de tudo, inclusive das partes da arma que estão na FRENTE dele. Na
 * tela isso lê como um clarão saindo por trás da arma e vazando pelo cano.
 *
 * A medida: fotografa com e sem clarão e vê onde os pixels mudaram. Se algum
 * deles cair na metade de baixo da arma — o punho e o carregador, que estão
 * bem mais perto da câmera que a boca — é porque o clarão está atravessando.
 */
{
  const montagem = await p.evaluate(() => {
    const f = window.game.player.vm.flash;
    const mats = [...f.grupo.children].map(m => m.material).filter(Boolean);
    return {
      testaProfundidade: mats.every(m => m.depthTest === true),
      escreveProfundidade: mats.some(m => m.depthWrite === true),
    };
  });
  console.log('clarão   :', JSON.stringify(montagem));
  check(montagem.testaProfundidade,
    'o clarão ignora profundidade — desenha por cima da arma inteira');
  check(!montagem.escreveProfundidade,
    'o clarão escreve profundidade: uma ponta da estrela vai recortar a outra');

  /*
   * A pergunta é "o clarão pinta EM CIMA da arma?", e a resposta tem que ser
   * medida contra a arma, não contra um retângulo.
   *
   * A versão anterior chutava a região do punho como "terço de baixo, metade
   * da direita" — e ali cabe muito espaço vazio ao lado da arma. As pontas da
   * estrela caindo nesse vazio contavam como se estivessem por cima da peça, e
   * o teste acusava atravessamento quando o clarão só estava grande.
   *
   * Três quadros resolvem: com arma e sem clarão, SEM arma e sem clarão (a
   * diferença é a silhueta exata da arma), e com arma e com clarão (a diferença
   * é o clarão). Aí é só ver quanto do clarão caiu dentro da silhueta.
   */
  const foto = async () => 'data:image/png;base64,' + await p.screenshot({ encoding: 'base64' });

  await p.evaluate(() => {
    const g = window.game;
    g.player.setRole('hunter');
    g.player.vm.visible = true;
    g.player.vel.set(0, 0, 0);
    g.player.speed = 0;
    g.player.vm.flash.apagar();
    g.paused = true;                        // nada mais se mexe daqui em diante
    g._desenhar();
  });
  await new Promise(r => setTimeout(r, 150));
  const comArma = await foto();

  await p.evaluate(() => { window.game.player.vm.visible = false; window.game._desenhar(); });
  await new Promise(r => setTimeout(r, 150));
  const semArma = await foto();

  await p.evaluate(() => {
    const g = window.game;
    g.player.vm.visible = true;
    g.player.vm.flash.disparar();
    g._desenhar();
  });
  await new Promise(r => setTimeout(r, 150));
  const comClarao = await foto();
  await p.evaluate(() => { window.game.paused = false; });

  const onde = await p.evaluate(async (aSrc, bSrc, cSrc) => {
    const carregar = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const [ia, ib, ic] = await Promise.all([carregar(aSrc), carregar(bSrc), carregar(cSrc)]);
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const pixels = img => { ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0);
                            return ctx.getImageData(0, 0, c.width, c.height).data; };
    const A = pixels(ia), B = pixels(ib), C = pixels(ic);
    const dif = (X, Y, i) => Math.abs(X[i] - Y[i]) + Math.abs(X[i + 1] - Y[i + 1]) + Math.abs(X[i + 2] - Y[i + 2]);

    let arma = 0, clarao = 0, porCima = 0;
    let cx0 = 1e9, cy0 = 1e9, cx1 = -1, cy1 = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const ehArma = dif(A, B, i) > 24;          // some quando a arma some
        const ehClarao = dif(C, A, i) > 40;        // aparece quando o clarão acende
        if (ehArma) arma++;
        if (ehClarao) {
          clarao++;
          if (ehArma) porCima++;
          if (x < cx0) cx0 = x; if (x > cx1) cx1 = x;
          if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
        }
      }
    }
    return {
      arma, clarao, porCima, tela: `${c.width}x${c.height}`,
      caixa: clarao ? { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 } : null,
    };
  }, comArma, semArma, comClarao);

  const fracao = onde.clarao ? onde.porCima / onde.clarao : 0;
  console.log(`arma na tela  : ${onde.arma} pixels`);
  console.log(`clarão na tela: ${onde.clarao} pixels em ${JSON.stringify(onde.caixa)} | ` +
              `${onde.porCima} sobre a arma (${(fracao * 100).toFixed(1)}%)`);
  check(onde.arma > 3000, `a arma nem apareceu para comparar (${onde.arma} pixels)`);
  check(onde.clarao > 300, `o clarão mal apareceu (${onde.clarao} pixels)`);
  check(fracao < 0.05,
    `${(fracao * 100).toFixed(0)}% do clarão cai sobre a silhueta da arma — está atravessando ela`);

  // grava o quadro ACESO, não um novo: quando esta linha roda o clarão já
  // apagou faz tempo, e a foto mostraria uma arma sem clarão nenhum
  writeFileSync('tools/_clarao.png', Buffer.from(comClarao.split(',')[1], 'base64'));
  console.log('  tools/_clarao.png');
}

if (erros.length) { falhas++; console.log('ERROS:', erros.slice(0, 4).join(' | ')); }
await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nA ARMA FICA POR CIMA\n');
process.exit(falhas ? 1 : 0);
