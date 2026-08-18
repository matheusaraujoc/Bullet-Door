// O bot fugitivo tem que largar tudo e correr quando bate o olho no caçador.
//   node tools/test-flee.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5178;
const vite = subirVite(PORT);
await esperarVite(PORT);
const b = await puppeteer.launch({executablePath:exe,headless:'shell',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p = await b.newPage();
const erros=[];
p.on('pageerror',e=>erros.push(e.message));
await p.goto(`http://localhost:${PORT}/?fast&seed=505`,{waitUntil:'networkidle2'});
await p.waitForFunction(()=>window.game&&window.game.ready&&window.THREE,{timeout:120000});
await p.click('#btnPlay');
await p.waitForFunction(()=>window.game.rounds.state==='playing',{timeout:60000});

const r = await p.evaluate(async (n) => {
  const g = window.game, T = window.THREE;
  const { hasLineOfSight } = await import('/src/ai/Pathfinder.js');
  const { worldToCell } = await import('/src/world/MazeGen.js');
  const C = 3.2;
  const casos = [];

  for (let k = 0; k < n; k++) {
    g.seedBase = 400 + k * 91;
    g.rounds.round = 1 + (k % 3);
    g.buildLevel();
    g.placeCombatants('hunter');          // o BOT é o fugitivo
    g.rounds.state = 'playing';
    g.rounds.phaseTime = 1e9;
    g.player.alive = true; g.bot.alive = true;

    // encosta os dois: caçador vendo o fugitivo, com linha livre
    const alvo = worldToCell(g.bot.pos);
    let posto = null;
    for (let raio = 2; raio <= 4 && !posto; raio++) {
      for (const [dx,dy] of [[raio,0],[-raio,0],[0,raio],[0,-raio]]) {
        const c = { x: alvo.x+dx, y: alvo.y+dy };
        if (g.world.solid(c.x,c.y)) continue;
        if (!hasLineOfSight(g.world, c, alvo)) continue;
        posto = c; break;
      }
    }
    if (!posto) continue;
    g.player.pos.set(posto.x*C, 0, posto.y*C);
    g.player.yaw = Math.atan2(-(g.bot.pos.x-g.player.pos.x), -(g.bot.pos.z-g.player.pos.z));
    // o fugitivo começa olhando para o outro lado, de costas
    g.bot.yaw = g.player.yaw;
    g.bot.state = 'hide';
    g.bot.path = null;
    g.bot.alertness = 0;

    const dist0 = g.bot.pos.distanceTo(g.player.pos);
    const dt = 1/60;
    let virouFuga = -1, distMin = dist0;
    for (let i = 0; i < 3*60; i++) {
      g.bot.update(dt, g.player);
      g.world.doors.update(dt);
      if (g.bot.state === 'flee' && virouFuga < 0) virouFuga = i/60;
      distMin = Math.min(distMin, g.bot.pos.distanceTo(g.player.pos));
    }
    const dist1 = g.bot.pos.distanceTo(g.player.pos);
    casos.push({
      inicio:+dist0.toFixed(1), fim:+dist1.toFixed(1), minima:+distMin.toFixed(1),
      reagiuEm: virouFuga < 0 ? null : +virouFuga.toFixed(2),
      estado: g.bot.state,
    });
  }
  return casos;
}, Number(process.env.N || 10));

console.log('caso | dist inicial -> final | mais perto que chegou | reagiu em');
let fugiu=0, reagiu=0;
for (const c of r) {
  console.log(`  ${String(c.inicio).padStart(5)} -> ${String(c.fim).padStart(5)} m | ` +
    `${String(c.minima).padStart(5)} m | ${c.reagiuEm===null?'NUNCA':c.reagiuEm+'s'} (${c.estado})`);
  if (c.fim > c.inicio) fugiu++;
  if (c.reagiuEm !== null) reagiu++;
}
console.log(`\nreagiu: ${reagiu}/${r.length} | terminou mais longe: ${fugiu}/${r.length}`);

let falhas=0;
const check=(c,m)=>{ if(!c){falhas++;console.log('FALHOU:',m);} };
check(erros.length===0,'erros: '+erros.slice(0,3).join(' | '));
check(r.length>=5, 'poucos casos válidos montados');
check(reagiu === r.length, `o fugitivo não reagiu em ${r.length-reagiu} caso(s)`);
check(fugiu >= Math.ceil(r.length*0.8), `só ${fugiu} de ${r.length} terminaram mais longe`);
await b.close(); matarVite(vite, PORT);
console.log(falhas?`\n${falhas} FALHA(S)\n`:'\nFUGA OK\n');
process.exit(falhas?1:0);
