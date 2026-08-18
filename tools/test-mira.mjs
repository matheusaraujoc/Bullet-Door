// Mira de ferro e visada pelos cantos.
//   node tools/test-mira.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5174;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });

await p.goto(`http://localhost:${PORT}/?fast&seed=4242`, { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });
await p.click('#btnPlay');
await p.waitForFunction(() => window.game.rounds.state === 'playing', { timeout: 60000 });

/** Congela o jogo numa sala grande e força um estado do jogador. */
const pose = async estado => p.evaluate(e => {
  const g = window.game;
  g.paused = true;
  const r = g.map.rooms.reduce((a, b) => (a.w * a.h > b.w * b.h ? a : b));
  g.player.pos.set(r.cx * 3.2, 0, r.cy * 3.2);
  g.player.yaw = 0.5; g.player.pitch = 0;
  g.player.setRole('hunter');
  g.player.ads = e.ads; g.player.lean = e.lean;
  for (let i = 0; i < 30; i++) g.player._applyCamera(1 / 60);   // assenta a pose
  g.renderer.render(g.scene, g.camera);
  return {
    fov: +g.camera.fov.toFixed(1),
    leanReal: +g.player.leanReal.toFixed(3),
    camX: +g.camera.position.x.toFixed(2),
    camZ: +g.camera.position.z.toFixed(2),
    roll: +g.camera.rotation.z.toFixed(3),
    armaX: +g.player.vm.group.position.x.toFixed(3),
    armaY: +g.player.vm.group.position.y.toFixed(3),
  };
}, estado);

const quadril = await pose({ ads: 0, lean: 0 });
await p.screenshot({ path: 'tools/_mira_quadril.png' });
console.log('quadril  ', JSON.stringify(quadril));

const mirando = await pose({ ads: 1, lean: 0 });
await p.screenshot({ path: 'tools/_mira_ferro.png' });
console.log('mira     ', JSON.stringify(mirando));

const esquerda = await pose({ ads: 0, lean: -1 });
await p.screenshot({ path: 'tools/_mira_esquerda.png' });
console.log('espia esq', JSON.stringify(esquerda));

const direita = await pose({ ads: 0, lean: 1 });
await p.screenshot({ path: 'tools/_mira_direita.png' });
console.log('espia dir', JSON.stringify(direita));

// espiar contra uma parede não pode atravessar
const contraParede = await p.evaluate(() => {
  const g = window.game, C = 3.2;
  // encosta o jogador na parede à direita dele
  const r = g.map.rooms[0];
  g.player.pos.set(r.x * C, 0, r.cy * C);
  g.world.collide(g.player.pos, 0.34);
  g.player.yaw = 0; g.player.lean = 1;
  for (let i = 0; i < 40; i++) g.player._applyCamera(1 / 60);
  const cx = Math.round(g.camera.position.x / C), cy = Math.round(g.camera.position.z / C);
  return { leanReal: +g.player.leanReal.toFixed(3), camDentroDeParede: g.world.staticSolid(cx, cy) };
});
console.log('encostado', JSON.stringify(contraParede));

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };
check(erros.length === 0, 'erros: ' + erros.slice(0, 4).join(' | '));
check(mirando.fov < quadril.fov - 20, `o ângulo não fechou na mira (${quadril.fov} -> ${mirando.fov})`);
check(Math.abs(mirando.armaX) < 0.05, `a arma não centralizou na mira (x=${mirando.armaX})`);
check(esquerda.leanReal < -0.1 && direita.leanReal > 0.1, 'a visada não deslocou a câmera');
check(esquerda.roll > 0.05 && direita.roll < -0.05, 'a visada não inclinou a imagem');
check(contraParede.camDentroDeParede === false, 'espiar colocou a câmera dentro da parede');

await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nMIRA E VISADA OK\n');
process.exit(falhas ? 1 : 0);
