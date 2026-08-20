// Controles na tela, botão de tela cheia e o logo da abertura.
//   node tools/test-toque.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5170;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=900,520'] });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 520, isMobile: true, hasTouch: true });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) erros.push(m.text()); });

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };

// ---- o convite tem que aparecer DEPRESSA, antes de baixar logo e sons ----
const t0 = Date.now();
await p.goto(`http://localhost:${PORT}/?touch`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#intro .comecar b', { timeout: 30000 });
const demora = Date.now() - t0;
const convite = await p.evaluate(() => ({
  texto: document.querySelector('#intro .comecar b').textContent,
  temBarra: !!document.querySelector('#intro .comecar .carregando'),
}));
console.log(`convite em ${demora} ms:`, JSON.stringify(convite));
check(demora < 4000, `o convite demorou ${demora} ms para aparecer`);
check(/TOQUE/.test(convite.texto), `no toque o convite deveria falar em tocar: "${convite.texto}"`);
check(convite.temBarra, 'não há indicação de carregamento enquanto se espera');

await p.waitForSelector('#intro .comecar', { timeout: 30000 });
// pointerdown: é o que responde na hora no celular
await p.evaluate(() => {
  const c = document.querySelector('#intro .comecar');
  c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 9 }));
});
const respondeu = await p.waitForFunction(
  () => document.querySelector('#intro .comecar')?.classList.contains('indo')
     || !document.querySelector('#intro .comecar'),
  { timeout: 1500 }).then(() => true, () => false);
check(respondeu, 'o toque no convite não deu resposta imediata');

// a marca só é montada depois do toque, que é o que deixa o convite instantâneo
await p.waitForFunction(() => !!document.querySelector('#intro .logo, #intro .logo-texto'),
  { timeout: 20000 }).catch(() => {});
const logo = await p.evaluate(async () => {
  // com a imagem no lugar, a marca é um CANVAS: é nele que a lâmina de luz é
  // desenhada, sem depender de mistura de camada nem de máscara
  const cv = document.querySelector('#intro .marca canvas.logo');
  if (!cv) return { usouImagem: false };
  // e tem que ter pixel de verdade dentro, não só as medidas certas
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let opacos = 0;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 24) opacos++;
  return { usouImagem: true, largura: cv.width, altura: cv.height, opacos };
});
console.log('logo da abertura:', JSON.stringify(logo));
check(logo.usouImagem, 'a abertura caiu na marca de reserva — a imagem do logo não chegou');
check((logo.opacos ?? 0) > 20, 'o canvas da marca está em branco: o logo não foi desenhado nele');
check(logo.largura > 0, 'a imagem do logo não decodificou');

await p.waitForFunction(() => !document.getElementById('intro'), { timeout: 40000 }).catch(() => {});
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });
await p.click('#btnPlay');
await p.waitForFunction(() => window.game.rounds.state === 'playing', { timeout: 60000 });
await new Promise(r => setTimeout(r, 600));
await p.screenshot({ path: 'tools/_toque_tela.png' });
console.log('  tools/_toque_tela.png');

// ---- os controles aparecem e o botão de tela cheia existe ----
const naTela = await p.evaluate(() => ({
  controles: !!document.querySelector('#toque.ativo'),
  joystick: !!document.querySelector('#toque .joy'),
  botoes: document.querySelectorAll('#toque .bt').length,
  telaCheia: !!document.getElementById('telaCheia'),
  travaPonteiro: window.game.input.precisaTravar(),
}));
console.log('na tela:', JSON.stringify(naTela));
check(naTela.controles, 'os controles na tela não apareceram');
check(naTela.botoes >= 7, `só ${naTela.botoes} botões na tela`);
check(naTela.telaCheia, 'não há botão de tela cheia');
check(naTela.travaPonteiro === false, 'no toque o jogo não deveria exigir ponteiro travado');

// ---- andar com o joystick move o jogador de verdade ----
const andou = await p.evaluate(async () => {
  const g = window.game;
  const joy = document.querySelector('#toque .joy');
  const r = joy.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const antes = g.player.pos.clone();

  const ev = (tipo, x, y) => joy.dispatchEvent(new PointerEvent(tipo, {
    pointerId: 1, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch',
  }));
  joy.setPointerCapture = () => {};        // o capture real precisa de gesto de verdade
  ev('pointerdown', cx, cy);
  ev('pointermove', cx, cy - 60);          // empurra o joystick para frente
  const vetor = { ...g.input.toque.mover };
  for (let i = 0; i < 40; i++) g.player.update(1 / 60);
  const depois = g.player.pos.clone();
  ev('pointerup', cx, cy - 60);
  return { vetor, distancia: +antes.distanceTo(depois).toFixed(2), zerou: { ...g.input.toque.mover } };
});
console.log('joystick:', JSON.stringify(andou));
check(andou.vetor.y > 0.8, `o joystick para frente deu y=${andou.vetor.y}`);
check(andou.distancia > 1, `o jogador andou só ${andou.distancia} m com o joystick`);
check(andou.zerou.y === 0, 'o joystick não voltou ao centro ao soltar');

// ---- arrastar na metade direita gira a câmera ----
const olhou = await p.evaluate(() => {
  const g = window.game;
  const area = document.querySelector('#toque .olhar');
  area.setPointerCapture = () => {};
  const yaw0 = g.player.yaw;
  const ev = (tipo, x, y) => area.dispatchEvent(new PointerEvent(tipo, {
    pointerId: 2, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch',
  }));
  ev('pointerdown', 700, 260);
  ev('pointermove', 600, 260);
  g.player.update(1 / 60);
  ev('pointerup', 600, 260);
  return { girou: +(g.player.yaw - yaw0).toFixed(3) };
});
console.log('olhar:', JSON.stringify(olhou));
check(Math.abs(olhou.girou) > 0.05, `arrastar girou só ${olhou.girou} rad`);

// ---- o botão de atirar dispara ----
const atirou = await p.evaluate(() => {
  const g = window.game;
  g.player.setRole('hunter');
  g.player.fireTimer = 0;
  const bt = document.querySelector('#toque .bt-atirar');
  bt.setPointerCapture = () => {};
  let disparos = 0;
  const orig = g.onPlayerShoot.bind(g);
  g.onPlayerShoot = (...a) => { disparos++; return orig(...a); };
  bt.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, bubbles: true, cancelable: true }));
  g.player.update(1 / 60);
  bt.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, bubbles: true, cancelable: true }));
  g.onPlayerShoot = orig;
  return { disparos };
});
console.log('atirar:', JSON.stringify(atirou));
check(atirou.disparos > 0, 'o botão de atirar não disparou');

if (erros.length) { falhas++; console.log('\nERROS:'); erros.slice(0, 5).forEach(e => console.log('  ', e)); }
await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTOQUE, TELA CHEIA E LOGO OK\n');
process.exit(falhas ? 1 : 0);
