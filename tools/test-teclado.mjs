// Teclado e ponteiro: o jogo não pode disparar atalho do navegador nem
// sequestrar o mouse.
//   node tools/test-teclado.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5172;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));

await p.goto(`http://localhost:${PORT}/?fast&seed=99`, { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };

// ------------------------------------------------- 1. o menu não pede Ctrl
const teclasDoMenu = await p.$$eval('.keys kbd', els => els.map(e => e.textContent.trim()));
console.log('teclas no menu :', teclasDoMenu.join(' '));
check(!teclasDoMenu.includes('CTRL'),
  'o menu ainda manda usar CTRL — que é o modificador de Ctrl+W, Ctrl+F, Ctrl+D');
check(teclasDoMenu.includes('C'), 'o menu não mostra a tecla de agachar');

await p.click('#btnPlay');
await p.waitForFunction(() => window.game.rounds.state === 'playing', { timeout: 60000 });

// ------------------------------------- 2. Ctrl não é tecla de jogo nenhuma
const comCtrl = await p.evaluate(() => {
  const i = window.game.input;
  const bater = (code, ctrl) => dispatchEvent(new KeyboardEvent('keydown',
    { code, ctrlKey: ctrl, bubbles: true, cancelable: true }));

  i.keys.clear();
  bater('ControlLeft', true);
  const agachouComCtrl = i.agachando();

  i.keys.clear();
  bater('KeyC', false);
  const agachouComC = i.agachando();

  // e direto na intenção, sem passar pelo filtro de evento: mesmo que a tecla
  // chegue por outro caminho, CTRL não pode significar agachar
  i.keys.clear();
  i.keys.add('ControlLeft');
  const ctrlNaIntencao = i.agachando();

  i.keys.clear();
  return { agachouComCtrl, agachouComC, ctrlNaIntencao };
});
console.log('agachar        :', JSON.stringify(comCtrl));
check(!comCtrl.agachouComCtrl, 'CTRL ainda agacha — segurar CTRL e andar fecha a aba com Ctrl+W');
check(!comCtrl.ctrlNaIntencao, 'agachando() ainda aceita ControlLeft');
check(comCtrl.agachouComC, 'a tecla C não agacha');

// ---------------------- 3. tecla de jogo com Ctrl é do navegador, não do jogo
const atalhos = await p.evaluate(() => {
  const i = window.game.input;
  const bater = (code, ctrl) => {
    const e = new KeyboardEvent('keydown', { code, ctrlKey: ctrl, bubbles: true, cancelable: true });
    dispatchEvent(e);
    return e;
  };

  // andando para a frente, o jogador aperta Ctrl+W
  i.keys.clear();
  bater('KeyW', false);
  const andandoAntes = i.vetorMovimento().frente;
  bater('KeyW', true);
  const andandoComCtrl = i.vetorMovimento().frente;

  // e as teclas do jogo não podem acionar o comportamento padrão do navegador
  i.keys.clear();
  const barradas = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyC', 'Tab', 'Space']
    .filter(c => !bater(c, false).defaultPrevented);
  // menos o ESC: barrar a saída seria pior que o problema
  const escBarrado = bater('Escape', false).defaultPrevented;

  i.keys.clear();
  return { andandoAntes, andandoComCtrl, barradas, escBarrado };
});
console.log('Ctrl+W         :', JSON.stringify(atalhos));
check(atalhos.andandoAntes === 1, 'W sozinho devia andar para a frente');
check(atalhos.andandoComCtrl === 0,
  'com Ctrl segurado o jogo continua andando — o personagem corre enquanto a aba fecha');
check(atalhos.barradas.length === 0,
  `teclas do jogo sem preventDefault: ${atalhos.barradas.join(', ')}`);
check(!atalhos.escBarrado, 'o ESC não pode ser barrado: é a saída do jogador');

// ------------------------------------------- 4. o ESC nunca prende o mouse
/*
 * O defeito: o navegador solta o ponteiro ao ver ESC, o pointerlockchange
 * pausa o jogo, e o keydown do MESMO ESC chegava com o jogo já pausado e
 * retomava — travando o ponteiro de novo. Só se saía com alt+tab.
 */
const escape = await p.evaluate(async () => {
  const g = window.game;
  let pedidos = 0;
  const original = g.input.lock.bind(g.input);
  g.input.lock = () => { pedidos++; };

  g.running = true; g.paused = false;
  document.getElementById('pause').classList.add('hidden');

  const esc = () => dispatchEvent(new KeyboardEvent('keydown',
    { code: 'Escape', bubbles: true, cancelable: true }));

  esc();
  const depoisDoPrimeiro = { pausado: g.paused, pedidos };

  // a pausa já veio pelo pointerlockchange? o segundo ESC não pode desfazê-la
  esc();
  const depoisDoSegundo = { pausado: g.paused, pedidos };

  // e o pointerlockchange chegando depois do ESC também não pode retomar
  g.input.onLockChange?.(false);
  const depoisDoEvento = { pausado: g.paused, pedidos };

  g.input.lock = original;
  return { depoisDoPrimeiro, depoisDoSegundo, depoisDoEvento };
});
console.log('ESC 1x         :', JSON.stringify(escape.depoisDoPrimeiro));
console.log('ESC 2x         :', JSON.stringify(escape.depoisDoSegundo));
console.log('lockchange     :', JSON.stringify(escape.depoisDoEvento));
check(escape.depoisDoPrimeiro.pausado, 'ESC devia pausar o jogo');
check(escape.depoisDoPrimeiro.pedidos === 0, 'ESC pediu o ponteiro de volta na hora');
check(escape.depoisDoSegundo.pausado, 'o segundo ESC despausou o jogo');
check(escape.depoisDoSegundo.pedidos === 0,
  `ESC pediu o ponteiro ${escape.depoisDoSegundo.pedidos}x — é isso que prende o mouse`);
check(escape.depoisDoEvento.pedidos === 0, 'o evento de lock atrasado pediu o ponteiro de volta');

// e o botão Continuar, esse sim, pode pedir o ponteiro
const continuar = await p.evaluate(() => {
  const g = window.game;
  let pedidos = 0;
  const original = g.input.lock.bind(g.input);
  g.input.lock = () => { pedidos++; };
  document.getElementById('btnResume').click();
  const r = { pausado: g.paused, pedidos };
  g.input.lock = original;
  return r;
});
console.log('Continuar      :', JSON.stringify(continuar));
check(!continuar.pausado, 'o botão Continuar não retomou o jogo');
check(continuar.pedidos === 1, 'o botão Continuar devia pedir o ponteiro de volta');

if (erros.length) { falhas++; console.log('ERROS:', erros.slice(0, 4).join(' | ')); }
await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTECLADO E PONTEIRO OK\n');
process.exit(falhas ? 1 : 0);
