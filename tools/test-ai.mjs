// Mede a IA rodando o bot em passo fixo, sem depender do relógio do navegador.
// Assim dá para simular 30s de caçada em menos de um segundo real.
//   node tools/test-ai.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5181;
const vite = subirVite(PORT);
await esperarVite(PORT);
const browser = await puppeteer.launch({executablePath:exe,headless:'shell',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page = await browser.newPage();
const erros=[];
page.on('pageerror',e=>erros.push(e.message));
await page.goto(`http://localhost:${PORT}/?fast&seed=101`,{waitUntil:'networkidle2'});
await page.waitForFunction(()=>window.game&&window.game.ready&&window.THREE,{timeout:120000});
await page.click('#btnPlay');
await page.waitForFunction(()=>window.game.rounds.state==='playing',{timeout:60000});

/**
 * Roda N rodadas simuladas. Em cada uma, sorteia posições e deixa o bot caçar
 * por 30s de tempo de jogo, com o alvo parado ou andando por aí.
 */
const r = await page.evaluate(async (opts) => {
  const g = window.game, T = window.THREE;
  const { tentativas, alvoAndando } = opts;
  // desliga a máquina de rodadas para controlar a simulação na mão
  g.rounds.state = 'playing';
  g.rounds.phaseTime = 1e9;

  const achou = [], tempos = [], margens = [], disparosAteAcertar = [];
  let travou = 0, tiros = 0, portasUsadas = 0;
  const origHit = g.onBotHitPlayer.bind(g);
  const origMiss = g.onBotMissed.bind(g);
  // conta o barulho de porta: é a pista que o bot deixa para o jogador
  const origPorta = g.onDoorUsed.bind(g);
  g.onDoorUsed = (porta, quem) => { if (quem === g.bot) portasUsadas++; return origPorta(porta, quem); };

  for (let n = 0; n < tentativas; n++) {
    g.seedBase = 1000 + n * 137;
    g.rounds.round = 1 + (n % 3);
    g.buildLevel();
    g.placeCombatants('runner');          // o bot é o caçador
    g.rounds.state = 'playing';
    g.rounds.phaseTime = 1e9;
    g.player.alive = true;
    g.bot.alive = true;

    let morreu = false, quando = null, tirosNesta = 0, primeiroTiro = null;
    let assustado = 0;                    // segundos restantes de correria
    g.onBotHitPlayer = () => { morreu = true; tirosNesta++; };
    // um jogador atento ouve o tiro e sai correndo: é isso que o teste imita
    g.onBotMissed = () => { tiros++; tirosNesta++; assustado = 2.5; };

    const dt = 1/60;
    const passos = 30 * 60;               // 30 segundos de jogo
    const inicio = g.bot.pos.clone();
    let andou = 0;
    let alvoRumo = new T.Vector3();

    for (let i = 0; i < passos && !morreu; i++) {
      if (alvoAndando) {
        // o alvo circula pelo mapa, fazendo barulho de passo como um jogador
        if (i % 90 === 0) {
          const ang = Math.random() * Math.PI * 2;
          alvoRumo.set(Math.sin(ang), 0, Math.cos(ang));
        }
        if (assustado > 0) {
          // levou um tiro perto: vira de costas para o bot e corre
          assustado -= dt;
          const fx = g.player.pos.x - g.bot.pos.x, fz = g.player.pos.z - g.bot.pos.z;
          const len = Math.hypot(fx, fz) || 1;
          alvoRumo.set(fx / len, 0, fz / len);
        }
        const vel = assustado > 0 ? 6.4 : 3.2;
        g.player.pos.addScaledVector(alvoRumo, vel * dt);
        g.world.collide(g.player.pos, 0.34);
        g.player.speed = vel;
        if (i % 25 === 0) g.emitNoise(g.player.pos, assustado > 0 ? 17 : 7, g.player);
      }
      const antes = g.bot.pos.clone();
      g.bot.update(dt, g.player);
      g.world.doors.update(dt);
      andou += antes.distanceTo(g.bot.pos);
      if (tirosNesta > 0 && primeiroTiro === null) primeiroTiro = i / 60;
      if (morreu) quando = i / 60;
    }
    if (morreu && primeiroTiro !== null) {
      margens.push(+(quando - primeiroTiro).toFixed(2));
      disparosAteAcertar.push(tirosNesta);
    }
    if (andou < 5) travou++;
    achou.push(morreu);
    if (morreu) tempos.push(quando);
  }
  g.onBotHitPlayer = origHit;
  g.onBotMissed = origMiss;
  g.onDoorUsed = origPorta;

  return {
    tentativas,
    encontrou: achou.filter(Boolean).length,
    tempoMedio: tempos.length ? +(tempos.reduce((a,b)=>a+b,0)/tempos.length).toFixed(1) : null,
    tempoMin: tempos.length ? +Math.min(...tempos).toFixed(1) : null,
    tempoMax: tempos.length ? +Math.max(...tempos).toFixed(1) : null,
    botTravado: travou,
    tirosErrados: tiros,
    portasUsadasPeloBot: portasUsadas,
    // do primeiro tiro até a morte: é o tempo que o jogador tem para sumir
    margemSegundos: margens.length
      ? +(margens.reduce((a,b)=>a+b,0)/margens.length).toFixed(2) : null,
    disparosAteAcertar: disparosAteAcertar.length
      ? +(disparosAteAcertar.reduce((a,b)=>a+b,0)/disparosAteAcertar.length).toFixed(1) : null,
  };
}, { tentativas: Number(process.env.N||12), alvoAndando: process.env.PARADO!=='1' });

console.log('alvo', process.env.PARADO==='1' ? 'PARADO' : 'ANDANDO');
console.log(JSON.stringify(r,null,1));

let falhas=0;
const check=(c,m)=>{ if(!c){falhas++;console.log('FALHOU:',m);} };
check(erros.length===0,'erros: '+erros.slice(0,3).join(' | '));
check(r.botTravado===0,`o bot ficou parado em ${r.botTravado} rodada(s)`);
const taxa = r.encontrou / r.tentativas;
check(taxa >= 0.35, `caçador acha o alvo em só ${(taxa*100).toFixed(0)}% das rodadas`);
check(taxa <= 0.95, `caçador acha em ${(taxa*100).toFixed(0)}% — está implacável demais`);
check(r.portasUsadasPeloBot > 0, 'o bot não acionou nenhuma porta em nenhuma rodada');
check(r.disparosAteAcertar === null || r.disparosAteAcertar >= 1.8,
  `o bot acerta com ${r.disparosAteAcertar} tiro(s) em média — não dá tempo de reagir`);

await browser.close(); matarVite(vite, PORT);
console.log(falhas?`\n${falhas} FALHA(S)\n`:'\nIA OK\n');
process.exit(falhas?1:0);
