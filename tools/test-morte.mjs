// Como a morte aparece na tela: o bot caindo, e o que o jogador vê ao morrer.
//   node tools/test-morte.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5173;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
await p.goto(`http://localhost:${PORT}/?fast&seed=4242`, { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });
await p.click('#btnPlay');
await p.waitForFunction(() => window.game.rounds.state === 'playing', { timeout: 60000 });

// ---- o bot morrendo, quadro a quadro ----
const queda = await p.evaluate(async () => {
  const g = window.game, T = window.THREE;
  const { hasLineOfSight } = await import('/src/ai/Pathfinder.js');
  const { worldToCell } = await import('/src/world/MazeGen.js');
  g.paused = true;
  const C = 3.2;
  const r = g.map.rooms.reduce((a, b) => (a.w * a.h > b.w * b.h ? a : b));
  g.player.pos.set(r.cx * C, 0, r.cy * C);
  const me = worldToCell(g.player.pos);
  let alvo = null;
  for (let raio = 2; raio <= 4 && !alvo; raio++)
    for (const [dx, dy] of [[raio,0],[-raio,0],[0,raio],[0,-raio]]) {
      const c = { x: me.x + dx, y: me.y + dy };
      if (g.world.solid(c.x, c.y) || !hasLineOfSight(g.world, me, c)) continue;
      alvo = c; break;
    }
  g.bot.pos.set(alvo.x * C, 0, alvo.y * C);
  g.bot.actor.setPosition(g.bot.pos.x, 0, g.bot.pos.z);
  g.bot.yaw = Math.atan2(g.player.pos.x - g.bot.pos.x, g.player.pos.z - g.bot.pos.z);
  g.player.yaw = Math.atan2(-(g.bot.pos.x - g.player.pos.x), -(g.bot.pos.z - g.player.pos.z));
  g.player.pitch = -0.05;
  g.player._applyCamera(0.016);

  const antes = { y: g.bot.actor.object.position.y, clipe: g.bot.actor.current };
  g.bot.die();
  const amostras = [];
  for (let i = 0; i < 90; i++) {
    g.bot.actor.update(1 / 60, 0, g.bot.yaw);
    if (i % 15 === 0) {
      const o = g.bot.actor.object;
      amostras.push({
        t: +(i / 60).toFixed(2),
        clipe: g.bot.actor.current,
        y: +o.position.y.toFixed(3),
        rotX: +o.rotation.x.toFixed(2),
        // a cabeça é o que denuncia se o corpo foi ao chão
        cabeca: (() => {
          let h = null; o.traverse(n => { if (n.name === 'head') h = n; });
          if (!h) return null;
          o.updateWorldMatrix(true, true);
          return +h.getWorldPosition(new T.Vector3()).y.toFixed(2);
        })(),
      });
    }
  }
  g.renderer.render(g.scene, g.camera);
  return { antes, amostras, temClipeMorte: g.bot.actor.clips.has('death') };
});
console.log('bot morrendo:', JSON.stringify(queda, null, 1));
await p.screenshot({ path: 'tools/_morte_bot.png' });
console.log('  tools/_morte_bot.png');

// ---- o que o jogador vê quando morre ----
await p.evaluate(() => {
  const g = window.game;
  g.paused = false;
  g.rounds.state = 'playing';
  g.player.alive = true;
  g.onBotHitPlayer(g.bot, g.player);
});
await new Promise(r => setTimeout(r, 500));
await p.screenshot({ path: 'tools/_morte_jogador.png' });
console.log('  tools/_morte_jogador.png');

const naTela = await p.evaluate(() => {
  const vis = [];
  for (const id of ['bigmsg', 'flash', 'killfeed', 'crosshair', 'vignette', 'hud']) {
    const el = document.getElementById(id);
    if (!el) continue;
    const cs = getComputedStyle(el);
    vis.push({ id, display: cs.display, opacity: +cs.opacity, texto: (el.textContent || '').trim().slice(0, 40) });
  }
  return { elementos: vis, classesBody: document.body.className };
});
console.log('na tela:', JSON.stringify(naTela, null, 1));

if (erros.length) console.log('ERROS:', erros.slice(0, 5).join(' | '));
await b.close(); matarVite(vite, PORT);
process.exit(0);
