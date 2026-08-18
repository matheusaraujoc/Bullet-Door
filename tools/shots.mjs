// Fotografa o jogo em situações reais: sala, corredor, porta, junção.
//   node tools/shots.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5189;
const vite = subirVite(PORT);
await esperarVite(PORT);
const browser = await puppeteer.launch({executablePath:exe,headless:'shell',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720']});
const page = await browser.newPage();
await page.setViewport({width:1280,height:720});
const erros=[];
page.on('pageerror',e=>erros.push('PAGEERROR: '+e.message));
page.on('console',m=>{ if(m.type()==='error') erros.push(m.text()); });

const seed = process.env.SEED || '4242';
await page.goto(`http://localhost:${PORT}/?fast&seed=${seed}`,{waitUntil:'networkidle2'});
await page.waitForFunction(()=>window.game && window.game.ready,{timeout:120000});
console.log('modelos carregados');
await page.click('#btnPlay');
await page.waitForFunction(()=>window.game.rounds.state==='playing',{timeout:60000});
console.log('em jogo');

const info = await page.evaluate(()=>{
  const g=window.game;
  return {
    salas:g.map.rooms.length,
    portasSimples:g.map.doors.filter(d=>d.kind==='simples').length,
    portasDesvio:g.map.doors.filter(d=>d.kind==='desvio').length,
    props:g.map.props.length,
    luminarias:g.world.lamps.length,
    draw:g.renderer.info.render.calls,
    tri:g.renderer.info.render.triangles,
  };
});
console.log(JSON.stringify(info));

// põe o jogador em pontos escolhidos e fotografa
const cenas = [
  ['sala', `const r=g.map.rooms.reduce((a,b)=>a.w*a.h>b.w*b.h?a:b);
            g.player.pos.set(r.cx*3.2,0,r.cy*3.2); g.player.yaw=0.7;`],
  ['sala2', `const r=g.map.rooms[4];
            g.player.pos.set(r.cx*3.2,0,r.cy*3.2); g.player.yaw=2.4;`],
  ['porta', `const d=g.map.doors.find(x=>x.kind==='simples')||g.map.doors[0];
            const ax=d.axis==='z'?0:-2.4, az=d.axis==='z'?-2.4:0;
            g.player.pos.set(d.x*3.2+ax,0,d.y*3.2+az);
            g.player.yaw=Math.atan2(-(d.x*3.2-g.player.pos.x),-(d.y*3.2-g.player.pos.z));`],
  ['juncao', `const d=g.map.doors.find(x=>x.kind==='desvio');
            if(d){ g.player.pos.set(d.x*3.2-3.2,0,d.y*3.2);
            g.player.yaw=Math.atan2(-(3.2),0); }`],
  ['corredor', `let alvo=null;
            for(let y=1;y<g.map.H-1&&!alvo;y++)for(let x=1;x<g.map.W-1;x++){
              const i=y*g.map.W+x;
              if(g.map.grid[i]===1&&!g.map.inRoom[i]){alvo={x,y};break;}}
            if(alvo){g.player.pos.set(alvo.x*3.2,0,alvo.y*3.2); g.player.yaw=0;}`],
];

for (const [nome, code] of cenas) {
  await page.evaluate(src => {
    const g = window.game;
    new Function('g', src)(g);
    g.player.pitch = -0.02;
    g.player._applyCamera(0.016);
  }, code);
  await new Promise(r=>setTimeout(r,700));
  await page.screenshot({path:`tools/_cena_${nome}.png`});
  console.log('  tools/_cena_'+nome+'.png');
}

// vista do bot de frente, para conferir o modelo em jogo
await page.evaluate(()=>{
  const g=window.game;
  const f=new (g.player.pos.constructor)(-Math.sin(g.player.yaw),0,-Math.cos(g.player.yaw));
  g.bot.pos.copy(g.player.pos).addScaledVector(f,4.5);
  g.bot.actor.setPosition(g.bot.pos.x,0,g.bot.pos.z);
  g.bot.yaw = g.player.yaw + Math.PI;
  g.bot.actor.update(0.3, 0, g.bot.yaw);
  g.player._applyCamera(0.016);
});
await new Promise(r=>setTimeout(r,600));
await page.screenshot({path:'tools/_cena_bot.png'});
console.log('  tools/_cena_bot.png');

if (erros.length) { console.log('\nERROS:'); erros.slice(0,10).forEach(e=>console.log(' *',e)); }
else console.log('\nsem erros de console');
await browser.close(); matarVite(vite, PORT); process.exit(erros.length?1:0);
