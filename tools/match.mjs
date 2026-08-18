// Joga uma partida inteira de ponta a ponta e vigia tudo:
// erros, travamentos, estados, portas em uso e o bot se mexendo.
//   node tools/match.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5182;
const vite = subirVite(PORT);
await esperarVite(PORT);
const browser = await puppeteer.launch({executablePath:exe,headless:'shell',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720']});
const page = await browser.newPage();
await page.setViewport({width:1280,height:720});
const erros=[];
page.on('pageerror',e=>erros.push('PAGEERROR: '+e.message));
page.on('console',m=>{ if(m.type()==='error') erros.push(m.text()); });

await page.goto(`http://localhost:${PORT}/?fast&seed=${process.env.SEED||2024}`,{waitUntil:'networkidle2'});
await page.waitForFunction(()=>window.game&&window.game.ready,{timeout:120000});
await page.click('#btnPlay');
console.log('partida iniciada\n');

const picoPortas = { ab: 0, desv: 0 };
const vistos = new Set();
const estadosBot = new Set();
const posBot = new Set();
let ultimo='';
for (let i=0;i<200;i++){
  const s = await page.evaluate(()=>{
    const g=window.game;
    const portas = g.world?.doors.list || [];
    return {
      estado:g.rounds.state, rodada:g.rounds.round, metade:g.rounds.half,
      voce:g.rounds.scoreYou, bot:g.rounds.scoreBot,
      papel:g.player.role, vivoJog:g.player.alive,
      botEstado:g.bot?.state, botVivo:g.bot?.alive,
      bx:+(g.bot?.pos.x??0).toFixed(1), bz:+(g.bot?.pos.z??0).toFixed(1),
      simplesAbertas: portas.filter(d=>d.kind==='simples'&&d.open).length,
      desviosEmB: portas.filter(d=>d.kind==='desvio'&&d.blocking==='B').length,
      draw:g.renderer.info.render.calls, tri:g.renderer.info.render.triangles,
      fim: g.rounds.state==='matchend',
    };
  });
  vistos.add(s.estado); estadosBot.add(s.botEstado); posBot.add(`${s.bx},${s.bz}`);
  picoPortas.ab = Math.max(picoPortas.ab, s.simplesAbertas);
  picoPortas.desv = Math.max(picoPortas.desv, s.desviosEmB);
  const linha = `r${s.rodada}.${s.metade} ${String(s.estado).padEnd(8)} ${String(s.papel).padEnd(6)} `+
    `${s.voce}-${s.bot} bot:${String(s.botEstado).padEnd(11)} portas:${s.simplesAbertas}ab/${s.desviosEmB}desv `+
    `draw:${s.draw} tri:${s.tri}`;
  if (linha.slice(0,30)!==ultimo.slice(0,30)) { console.log(' ',linha); ultimo=linha; }
  if (s.fim) break;
  await new Promise(r=>setTimeout(r,900));
}

const fim = await page.evaluate(()=>({
  estado:window.game.rounds.state,
  voce:window.game.rounds.scoreYou, bot:window.game.rounds.scoreBot,
  visivel: !document.getElementById('matchend').classList.contains('hidden'),
  titulo: document.getElementById('meTitle').textContent,
}));
console.log('\nfim:',JSON.stringify(fim));
console.log('estados da partida:',[...vistos].join(', '));
console.log('estados do bot   :',[...estadosBot].join(', '));
console.log('posições do bot  :',posBot.size);
console.log('pico de portas mexidas:', picoPortas.ab, 'levantadas /', picoPortas.desv, 'desvios virados');

let falhas=0;
const check=(c,m)=>{ if(!c){falhas++;console.log('FALHOU:',m);} };
check(erros.length===0, 'erros de console: '+erros.slice(0,5).join(' | '));
check(fim.estado==='matchend','a partida não chegou ao fim');
check(fim.visivel,'a tela de fim não apareceu');
check(posBot.size>=8,`o bot mal se moveu (${posBot.size} posições)`);
check(vistos.has('playing')&&vistos.has('swap'),'faltou alguma fase da rodada');
check(picoPortas.ab + picoPortas.desv > 0, 'nenhuma porta foi mexida na partida inteira');

await page.screenshot({path:'tools/_match_fim.png'});
await browser.close(); matarVite(vite, PORT);
console.log(falhas?`\n${falhas} FALHA(S)\n`:'\nPARTIDA COMPLETA OK\n');
process.exit(falhas?1:0);
