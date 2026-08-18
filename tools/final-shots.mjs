// Capturas finais: menu, personagem em jogo, porta de desvio e tiro.
//   node tools/final-shots.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5179;
const vite = subirVite(PORT);
await esperarVite(PORT);
const b = await puppeteer.launch({executablePath:exe,headless:'shell',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720']});
const p = await b.newPage();
await p.setViewport({width:1280,height:720});
const erros=[];
p.on('pageerror',e=>erros.push(e.message));
p.on('console',m=>{if(m.type()==='error')erros.push(m.text());});

await p.goto(`http://localhost:${PORT}/?fast&seed=${process.env.SEED||909}`,{waitUntil:'networkidle2'});
await p.waitForFunction(()=>window.game&&window.game.ready&&window.THREE,{timeout:120000});
await p.screenshot({path:'tools/_final_menu.png'});
console.log('  tools/_final_menu.png');

await p.click('#btnPlay');
await p.waitForFunction(()=>window.game.rounds.state==='playing',{timeout:60000});

// --- personagem em jogo: coloca o bot numa célula livre com linha de visão ---
console.log(JSON.stringify(await p.evaluate(async ()=>{
  const g=window.game, T=window.THREE;
  const { hasLineOfSight } = await import('/src/ai/Pathfinder.js');
  const { worldToCell } = await import('/src/world/MazeGen.js');
  const C=3.2;
  // acha uma sala grande e põe jogador e bot dentro dela, frente a frente
  const r=g.map.rooms.reduce((a,b)=>a.w*a.h>b.w*b.h?a:b);
  g.player.pos.set(r.x*C, 0, r.y*C);
  g.world.collide(g.player.pos, 0.34);
  let alvo=null;
  for(let y=r.y;y<r.y+r.h&&!alvo;y++)for(let x=r.x;x<r.x+r.w;x++){
    if(g.world.solid(x,y))continue;
    const d=Math.hypot(x*C-g.player.pos.x, y*C-g.player.pos.z);
    if(d<3.5||d>11)continue;
    if(!hasLineOfSight(g.world, worldToCell(g.player.pos), {x,y}))continue;
    alvo={x,y};break;
  }
  if(alvo){
    g.bot.pos.set(alvo.x*C,0,alvo.y*C);
    g.bot.actor.setPosition(g.bot.pos.x,0,g.bot.pos.z);
    g.bot.yaw=Math.atan2(g.player.pos.x-g.bot.pos.x, g.player.pos.z-g.bot.pos.z);
    g.bot.actor.update(0.5,0,g.bot.yaw);
    g.player.yaw=Math.atan2(-(g.bot.pos.x-g.player.pos.x),-(g.bot.pos.z-g.player.pos.z));
    g.player.pitch=-0.03;
    g.player._applyCamera(0.016);
  }
  return {sala:`${r.w}x${r.h}`, alvo, papelBot:g.bot.role, papelJog:g.player.role};
})));
await new Promise(r=>setTimeout(r,800));
await p.screenshot({path:'tools/_final_bot.png'});
console.log('  tools/_final_bot.png');

// --- porta de desvio: olha para ela e aciona ---
await p.evaluate(()=>{
  const g=window.game, C=3.2;
  const d=g.world.doors.list.find(x=>x.kind==='desvio');
  if(!d)return;
  // fica no corredor, a duas células, olhando para a junção
  // fica no lado que está aberto agora, olhando para a junção
  const livre = d.blocking==='A' ? d.B : d.A;
  g.player.pos.set(d.cx + livre.dx*C*1.6, 0, d.cz + livre.dy*C*1.6);
  g.world.collide(g.player.pos, 0.34);
  g.player.yaw=Math.atan2(-(d.cx-g.player.pos.x),-(d.cz-g.player.pos.z));
  g.player.pitch=0;
  g.player._applyCamera(0.016);
});
await new Promise(r=>setTimeout(r,700));
await p.screenshot({path:'tools/_final_desvio_A.png'});
await p.evaluate(()=>{
  const g=window.game;
  const d=g.world.doors.list.find(x=>x.kind==='desvio');
  if(d){ g.world.doors.toggle(d, g.player.pos, []);
    for(let i=0;i<120;i++) g.world.doors.update(1/60); }
});
await new Promise(r=>setTimeout(r,600));
await p.screenshot({path:'tools/_final_desvio_B.png'});
console.log('  tools/_final_desvio_A.png / _B.png  (mesma junção, caminho trocado)');

// --- o bot atirando: animação, clarão e traçante ---
const tiroBot = await p.evaluate(async ()=>{
  const g=window.game, T=window.THREE;
  const { hasLineOfSight } = await import('/src/ai/Pathfinder.js');
  const { worldToCell } = await import('/src/world/MazeGen.js');
  const C=3.2;
  g.paused = true;
  g.bot.setRole('hunter');
  g.player.setRole('runner');
  // põe o bot de frente para o jogador, com linha livre
  const me = worldToCell(g.player.pos);
  let posto=null;
  for (let raio=2; raio<=4 && !posto; raio++)
    for (const [dx,dy] of [[raio,0],[-raio,0],[0,raio],[0,-raio]]) {
      const c={x:me.x+dx,y:me.y+dy};
      if (g.world.solid(c.x,c.y) || !hasLineOfSight(g.world, c, me)) continue;
      posto=c; break;
    }
  if (!posto) return { ok:false };
  g.bot.pos.set(posto.x*C,0,posto.y*C);
  g.bot.yaw = Math.atan2(g.player.pos.x-g.bot.pos.x, g.player.pos.z-g.bot.pos.z);
  g.bot.actor.setPosition(g.bot.pos.x,0,g.bot.pos.z);
  g.player.yaw = Math.atan2(-(g.bot.pos.x-g.player.pos.x), -(g.bot.pos.z-g.player.pos.z));
  g.player.pitch = 0;

  // dispara e avança a animação até o meio do coice
  g.bot.fireTimer = 0;
  g.bot.aimWarm = 1;
  g.bot._shoot(g.player, g.bot.pos.distanceTo(g.player.pos));
  for (let i=0;i<8;i++) g.bot.actor.update(1/60, 0, g.bot.yaw);
  g.worldFlash.disparar();
  g.player._applyCamera(0.016);
  g.renderer.render(g.scene, g.camera);
  return { ok:true, clipe: g.bot.actor.current, dist:+g.bot.pos.distanceTo(g.player.pos).toFixed(1) };
});
console.log('  tiro do bot:', JSON.stringify(tiroBot));
await p.screenshot({path:'tools/_final_bot_atira.png'});
console.log('  tools/_final_bot_atira.png');
await p.evaluate(()=>{ window.game.paused = false; });

// --- setas de direção: dispara barulhos em volta e captura ---
await p.evaluate(()=>{
  const g=window.game, T=window.THREE;
  const c=g.player.pos;
  // três fontes de barulho em direções diferentes, com forças diferentes
  g.hud.addNoise(new T.Vector3(c.x+14,0,c.z-3), 0.95);
  g.hud.addNoise(new T.Vector3(c.x-9,0,c.z-11), 0.55);
  g.hud.addNoise(new T.Vector3(c.x-2,0,c.z+13), 0.3);
  g.hud.update(0.016, g.player.pos, g.player.yaw);
});
await new Promise(r=>setTimeout(r,450));
await p.screenshot({path:'tools/_final_setas.png'});
console.log('  tools/_final_setas.png');

// --- tiro: congela o quadro exato do disparo ---
// O clarão dura poucos quadros de propósito; no headless, que roda devagar,
// ele morreria antes da captura. Então pausa-se o laço e desenha-se à mão.
await p.evaluate(()=>{
  const g=window.game;
  g.paused = true;
  g.player.fireTimer=0;
  g.player.shoot();
  g.player.vm.flash.disparar();
  g.player._applyCamera(0.016);
  g.renderer.render(g.scene, g.camera);
});
await p.screenshot({path:'tools/_final_tiro.png'});
await p.evaluate(()=>{ window.game.paused = false; });
console.log('  tools/_final_tiro.png');

console.log(erros.length?('ERROS: '+erros.slice(0,5).join(' | ')):'sem erros');
await b.close(); matarVite(vite, PORT); process.exit(erros.length?1:0);
