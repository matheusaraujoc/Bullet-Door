import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5201;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });

// celulares comuns, deitados (é como se joga um FPS)
const telas = [[667,375,'iPhone SE'],[844,390,'iPhone 12/13'],[915,412,'Android grande'],[740,360,'Android pequeno']];
for (const [w,h,nome] of telas) {
  const p = await b.newPage();
  await p.setViewport({ width:w, height:h, hasTouch:true, isMobile:true, deviceScaleFactor:2 });
  await p.goto(`http://localhost:${PORT}/?fast&touch&seed=9`, { waitUntil:'networkidle2' });
  await p.waitForFunction(() => window.game && window.game.ready, { timeout:120000 });
  await p.click('#btnPlay');
  await p.waitForFunction(() => window.game.rounds.state === 'playing', { timeout:60000 });
  await p.evaluate(() => { const g=window.game; g.hud.feed('PASSOU PERTO'); g.hud.big('TROCA','AGORA VOCÊ FOGE','runner'); });
  await new Promise(r=>setTimeout(r,250));
  const m = await p.evaluate(() => {
    const pct = (v, t) => +(v / t * 100).toFixed(1);
    const cx = (sel) => { const e = document.querySelector(sel); if(!e||e.offsetParent===null) return null;
      const r = e.getBoundingClientRect(); return { w: pct(r.width, innerWidth), h: pct(r.height, innerHeight), fs: getComputedStyle(e).fontSize }; };
    return {
      topo: cx('#top .painel'), relogio: cx('#timer'), objetivo: cx('#objective'),
      placar: cx('#score .painel'), aviso: cx('#killfeed div'),
      msgGrande: cx('.bm-main'), dica: cx('#dicaMouse'),
      botoes: cx('#toque .botoes'), joystick: cx('#toque .joy'), atirar: cx('#toque .bt-atirar'),
    };
  });
  console.log(`\n${nome} ${w}x${h}`);
  for (const [k,v] of Object.entries(m)) if (v) console.log(`  ${k.padEnd(10)} ${String(v.w).padStart(5)}% larg  ${String(v.h).padStart(5)}% alt  fonte ${v.fs}`);
  await p.screenshot({ path: `tools/_mob_${w}.png` });
  await p.close();
}
await b.close(); matarVite(vite, PORT);
