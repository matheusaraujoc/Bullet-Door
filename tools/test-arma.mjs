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
import { existsSync } from 'node:fs';

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

if (erros.length) { falhas++; console.log('ERROS:', erros.slice(0, 4).join(' | ')); }
await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nA ARMA FICA POR CIMA\n');
process.exit(falhas ? 1 : 0);
