// Som, música e a comemoração do fim de partida.
//   node tools/test-audio.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync, statSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5177;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox',
         '--autoplay-policy=no-user-gesture-required','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };

// ------------------------------------------------- 1. a música cabe no pacote
const mp3 = 'public/audios/menu.mp3';
check(existsSync(mp3), 'a música do menu não foi convertida — rode npm run musica');
const kb = statSync(mp3).size / 1024;
console.log(`música   : ${kb.toFixed(0)} KB`);
check(kb < 900, `a música ficou com ${kb.toFixed(0)} KB — grande demais para carregar na web`);

await p.goto(`http://localhost:${PORT}/?fast&seed=7`, { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });

// -------------------------------------------------- 2. os botões existem
const botoes = await p.evaluate(() => ({
  som: !!document.getElementById('btSom'),
  musica: !!document.getElementById('btMusica'),
  tela: !!document.getElementById('telaCheia'),
  noCanto: !!document.querySelector('#canto #btSom'),
}));
console.log('botões   :', JSON.stringify(botoes));
check(botoes.som, 'não há botão de som');
check(botoes.musica, 'não há botão de música');
check(botoes.tela, 'o botão de tela cheia sumiu');
check(botoes.noCanto, 'os botões não estão na fileira do canto');

// ------------------------------------- 3. desligar o som cala os efeitos
const som = await p.evaluate(() => {
  const a = window.game.audio;
  a.init();
  let tocou = 0;
  const orig = a._chain.bind(a);
  a._chain = (...args) => { tocou++; return orig(...args); };

  document.getElementById('btSom').click();          // desliga
  const ligadoDepoisDoPrimeiro = a.somLigado;
  tocou = 0;
  a.play('shot'); a.play('door'); a.play('hit');
  const comSomDesligado = tocou;

  document.getElementById('btSom').click();          // liga de volta
  tocou = 0;
  a.play('shot');
  const comSomLigado = tocou;

  a._chain = orig;
  return { ligadoDepoisDoPrimeiro, comSomDesligado, comSomLigado, guardado: localStorage.getItem('bulletdoor.som') };
});
console.log('som      :', JSON.stringify(som));
check(som.ligadoDepoisDoPrimeiro === false, 'o botão não desligou o som');
check(som.comSomDesligado === 0, `com o som desligado ainda saíram ${som.comSomDesligado} sons`);
check(som.comSomLigado > 0, 'religar o som não voltou a tocar nada');
check(som.guardado === '1', 'a preferência de som não foi guardada');

// ------------------------------- 4. a música é independente e é um arquivo
const musica = await p.evaluate(async () => {
  const a = window.game.audio;
  a.tocarMusica('audios/menu.mp3');
  await new Promise(r => setTimeout(r, 400));
  const el = a.musica;
  const antes = { existe: !!el, src: el?.src?.split('/').pop(), emLaco: el?.loop, tocando: el && !el.paused };

  document.getElementById('btMusica').click();       // desliga a música
  await new Promise(r => setTimeout(r, 700));
  const desligada = { musicaLigada: a.musicaLigada, pausada: a.musica.paused, somAinda: a.somLigado };

  document.getElementById('btMusica').click();       // liga de novo
  await new Promise(r => setTimeout(r, 400));
  return { antes, desligada, religou: a.musicaLigada, guardado: localStorage.getItem('bulletdoor.musica') };
});
console.log('música   :', JSON.stringify(musica));
check(musica.antes.existe, 'a música do menu não chegou a ser criada');
check(musica.antes.src === 'menu.mp3', `a música aponta para "${musica.antes.src}"`);
check(musica.antes.emLaco, 'a música do menu tem que tocar em laço');
check(musica.desligada.musicaLigada === false && musica.desligada.pausada,
  'o botão de música não pausou a música');
check(musica.desligada.somAinda === true,
  'desligar a música desligou os efeitos junto — são dois interruptores separados');
check(musica.guardado === '1', 'a preferência de música não foi guardada');

// -------------------------------- 5. a preferência sobrevive a recarregar
await p.evaluate(() => { document.getElementById('btSom').click(); });   // desliga
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });
const lembrou = await p.evaluate(() => ({
  som: window.game.audio.somLigado,
  botaoMudo: document.getElementById('btSom').classList.contains('mudo'),
}));
console.log('lembrou  :', JSON.stringify(lembrou));
check(lembrou.som === false, 'recarregar a página esqueceu que o som estava desligado');
check(lembrou.botaoMudo, 'o botão não mostra que o som está desligado');
await p.evaluate(() => { document.getElementById('btSom').click(); });

// ---------------------------------------- 6. o fim de partida é uma cena
const fim = await p.evaluate(async () => {
  const g = window.game;
  g.rounds.historico = [{ seu: 1, bot: 0 }, { seu: 0, bot: 1 }, { seu: 1, bot: 0 }];
  g.rounds.scoreYou = 2; g.rounds.scoreBot = 1;
  g.onMatchEnded('you');

  const el = document.getElementById('matchend');
  const btn = document.getElementById('btnAgain');
  const logo = {
    visivel: !el.classList.contains('hidden'),
    classe: el.className,
    titulo: document.getElementById('meTitle').textContent,
    faixa: document.getElementById('meFaixa').textContent,
    placarInicial: document.getElementById('meVoce').textContent,
    botaoEsperando: btn.classList.contains('esperando'),
    pastilhas: document.querySelectorAll('.me-rodada').length,
    pastilhasVisiveis: document.querySelectorAll('.me-rodada.entrou').length,
  };

  await new Promise(r => setTimeout(r, 2000));
  const depois = {
    placarFinal: document.getElementById('meVoce').textContent,
    placarBot: document.getElementById('meBot').textContent,
    botaoEsperando: btn.classList.contains('esperando'),
    pastilhasVisiveis: document.querySelectorAll('.me-rodada.entrou').length,
    confete: g.fim.chuva.pecas.length > 0 || !g.fim.chuva.rodando,
    festaDesenhou: (() => {
      const c = document.getElementById('meFesta');
      return c.width > 0 && c.height > 0;
    })(),
  };
  return { logo, depois };
});
console.log('fim (0s) :', JSON.stringify(fim.logo));
console.log('fim (2s) :', JSON.stringify(fim.depois));
check(fim.logo.visivel, 'a tela de fim de partida não apareceu');
check(fim.logo.classe.includes('ganhou'), `a tela não marcou a vitória: "${fim.logo.classe}"`);
check(fim.logo.titulo === 'VITÓRIA', `título "${fim.logo.titulo}"`);
check(fim.logo.faixa.length > 0, 'a faixa acima do título ficou vazia');
check(fim.logo.placarInicial === '0', 'o placar tem que começar em zero e contar até o final');
check(fim.logo.botaoEsperando, 'o botão apareceu de cara — o jogador clica antes de ver o resultado');
check(fim.logo.pastilhas === 3, `${fim.logo.pastilhas} pastilhas para 3 rodadas`);
check(fim.logo.pastilhasVisiveis === 0, 'as pastilhas apareceram todas de uma vez');
check(fim.depois.placarFinal === '2' && fim.depois.placarBot === '1',
  `o placar parou em ${fim.depois.placarFinal}-${fim.depois.placarBot}, devia ser 2-1`);
check(!fim.depois.botaoEsperando, 'o botão nunca chegou a aparecer');
check(fim.depois.pastilhasVisiveis === 3, `só ${fim.depois.pastilhasVisiveis} pastilhas entraram`);
check(fim.depois.festaDesenhou, 'o canto da chuva de confete não foi dimensionado');

await p.screenshot({ path: 'tools/_fim.png' });
console.log('  tools/_fim.png');

// e a derrota não pode ter a mesma cara
const derrota = await p.evaluate(async () => {
  const g = window.game;
  g.fim.esconder();
  g.rounds.historico = [{ seu: 0, bot: 1 }, { seu: 0, bot: 1 }];
  g.rounds.scoreYou = 0; g.rounds.scoreBot = 2;
  g.onMatchEnded('bot');
  await new Promise(r => setTimeout(r, 1800));
  const el = document.getElementById('matchend');
  return {
    classe: el.className,
    pastilhas: document.querySelectorAll('.me-rodada.entrou').length,
    botao: !document.getElementById('btnAgain').classList.contains('esperando'),
    titulo: document.getElementById('meTitle').textContent,
    confete: g.fim.chuva.rodando,
  };
});
console.log('derrota  :', JSON.stringify(derrota));
check(derrota.classe.includes('perdeu'), `a derrota não foi marcada: "${derrota.classe}"`);
check(derrota.titulo === 'DERROTA', `título "${derrota.titulo}"`);
check(!derrota.confete, 'caiu confete na derrota');
check(derrota.pastilhas === 2, `${derrota.pastilhas} pastilhas para 2 rodadas`);
check(derrota.botao, 'o botão de jogar de novo não apareceu na derrota');

await p.screenshot({ path: 'tools/_fim_derrota.png' });
console.log('  tools/_fim_derrota.png');

if (erros.length) { falhas++; console.log('ERROS:', erros.slice(0, 4).join(' | ')); }
await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nSOM, MÚSICA E FIM DE PARTIDA OK\n');
process.exit(falhas ? 1 : 0);
