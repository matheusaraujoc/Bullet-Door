// Os três idiomas, do menu ao fim de partida.
//   node tools/test-idioma.mjs
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5181;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--window-size=1280,720'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };

await p.goto(`http://localhost:${PORT}/?fast&seed=5`, { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });
await p.evaluate(() => localStorage.removeItem('bulletdoor.idioma'));

// ------------------------------------------- 1. nenhuma chave escapou
const chaves = await p.evaluate(async () => {
  const { default: _ } = { default: null };
  const mod = await import('/src/ui/i18n.js');
  const idiomas = mod.listaDeIdiomas().map(i => i.cod);
  // reúne todas as chaves usadas no HTML e confere se cada idioma responde
  const usadas = new Set();
  for (const el of document.querySelectorAll('[data-i18n]')) usadas.add(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) usadas.add(el.dataset.i18nHtml);

  const faltando = [];
  for (const cod of idiomas) {
    mod.trocarIdioma(cod);
    for (const k of usadas) if (mod.t(k) === k) faltando.push(`${cod}:${k}`);
  }
  mod.trocarIdioma('pt');
  return { idiomas, usadas: usadas.size, faltando };
});
console.log(`idiomas  : ${chaves.idiomas.join(', ')} | ${chaves.usadas} chaves no HTML`);
check(chaves.idiomas.length === 3, `esperava 3 idiomas, achei ${chaves.idiomas.length}`);
check(chaves.faltando.length === 0, `chaves sem tradução: ${chaves.faltando.slice(0, 6).join(', ')}`);

// -------------------------------------- 2. o seletor está no menu, com bandeiras
const seletor = await p.evaluate(() => {
  const bts = [...document.querySelectorAll('#idiomas .id-bt')];
  return {
    quantos: bts.length,
    codigos: bts.map(b => b.dataset.idioma),
    bandeiras: bts.map(b => b.querySelector('img')?.getAttribute('src')?.split('/').pop()),
    carregadas: bts.map(b => b.querySelector('img')?.naturalWidth > 0),
    ativo: bts.filter(b => b.classList.contains('ativo')).map(b => b.dataset.idioma),
  };
});
console.log('seletor  :', JSON.stringify(seletor));
check(seletor.quantos === 3, `${seletor.quantos} botões de idioma`);
check(seletor.bandeiras.every(Boolean), `bandeira faltando: ${JSON.stringify(seletor.bandeiras)}`);
check(seletor.carregadas.every(Boolean), 'alguma bandeira não carregou (caminho errado?)');
check(seletor.ativo.length === 1, `${seletor.ativo.length} idiomas marcados como ativos`);

// ------------------------------------------- 3. trocar de idioma muda a tela
const ler = () => p.evaluate(() => ({
  jogar: document.getElementById('btnPlay').textContent.trim(),
  regra: document.querySelector('.regra').textContent.trim().slice(0, 40),
  mover: document.querySelector('.keys em').textContent.trim(),
  ativo: document.querySelector('#idiomas .id-bt.ativo')?.dataset.idioma,
  lang: document.documentElement.lang,
}));

for (const cod of ['en', 'es', 'pt']) {
  await p.click(`#idiomas .id-bt[data-idioma="${cod}"]`);
  const v = await ler();
  console.log(`${cod}       :`, JSON.stringify(v));
  check(v.ativo === cod, `cliquei em ${cod} e o ativo é ${v.ativo}`);
  check(v.lang.startsWith(cod === 'pt' ? 'pt' : cod), `<html lang> ficou "${v.lang}"`);
  const esperado = { en: 'PLAY', es: 'JUGAR', pt: 'JOGAR' }[cod];
  check(v.jogar === esperado, `o botão jogar em ${cod} saiu "${v.jogar}"`);
}

// --------------------- 3b. trocar de idioma não pode mexer no layout
/*
 * A queixa era essa: com o nome do idioma escrito ao lado da bandeira acesa, a
 * fileira mudava de largura a cada troca — "Português" e "English" não ocupam o
 * mesmo espaço — e o menu dava um pulo lateral justamente enquanto a pessoa
 * comparava as opções.
 */
const medidas = [];
for (const cod of ['pt', 'es', 'en']) {
  await p.click(`#idiomas .id-bt[data-idioma="${cod}"]`);
  medidas.push(await p.evaluate(c => {
    const fila = document.querySelector('.id-fila').getBoundingClientRect();
    const bts = [...document.querySelectorAll('#idiomas .id-bt')].map(b => {
      const r = b.getBoundingClientRect();
      return { l: Math.round(r.left), w: Math.round(r.width) };
    });
    const ativo = document.querySelector('#idiomas .id-bt.ativo');
    const anel = getComputedStyle(ativo).boxShadow;
    return { cod: c, fila: Math.round(fila.width), bts, temAnel: anel !== 'none' && anel.length > 4 };
  }, cod));
}
for (const m of medidas) console.log(`layout ${m.cod}  : fileira ${m.fila}px | botões ${m.bts.map(b => b.w).join(',')}`);

const base = medidas[0];
for (const m of medidas.slice(1)) {
  check(m.fila === base.fila,
    `a fileira mudou de ${base.fila}px para ${m.fila}px ao escolher ${m.cod} — o layout pula`);
  m.bts.forEach((b, k) => {
    check(b.w === base.bts[k].w,
      `a bandeira ${k + 1} mudou de ${base.bts[k].w}px para ${b.w}px em ${m.cod}`);
    check(b.l === base.bts[k].l,
      `a bandeira ${k + 1} andou de x=${base.bts[k].l} para x=${b.l} em ${m.cod}`);
  });
}
// e todas as bandeiras têm que ter a mesma medida entre si
const larguras = new Set(base.bts.map(b => b.w));
check(larguras.size === 1, `as bandeiras têm larguras diferentes: ${[...larguras].join(', ')}`);
check(medidas.every(m => m.temAnel), 'a bandeira escolhida não tem contorno de destaque');

// nenhum texto de idioma pode aparecer na fileira
const textoNaFila = await p.evaluate(() =>
  [...document.querySelectorAll('#idiomas .id-bt')]
    .filter(b => b.offsetWidth && [...b.childNodes].some(n =>
      n.nodeType === 1 && n.tagName !== 'IMG' && getComputedStyle(n).display !== 'none'))
    .length);
check(textoNaFila === 0, 'ainda há texto visível dentro dos botões de idioma');

// ------------------------------------- 4. a escolha sobrevive a recarregar
await p.click('#idiomas .id-bt[data-idioma="en"]');
await p.reload({ waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });
const depois = await ler();
console.log('recarregou:', JSON.stringify(depois));
check(depois.ativo === 'en', 'recarregar esqueceu o idioma escolhido');
check(depois.jogar === 'PLAY', `o botão voltou para "${depois.jogar}"`);

// --------------------------- 5. o HUD e o fim de partida também traduzem
await p.click('#btnPlay');
await p.waitForFunction(() => window.game.rounds.state === 'playing', { timeout: 60000 });
const hud = await p.evaluate(() => ({
  papel: document.getElementById('role').textContent,
  objetivo: document.getElementById('objective').textContent,
  rodada: document.getElementById('roundLabel').textContent,
  ladoA: document.querySelector('.s-lab').textContent,
  ladoB: document.querySelectorAll('.s-lab')[1].textContent,
}));
console.log('hud (en) :', JSON.stringify(hud));
check(hud.papel === 'HUNTER', `o papel saiu "${hud.papel}"`);
check(/ROUND 1 OF 3/.test(hud.rodada), `a rodada saiu "${hud.rodada}"`);
check(hud.ladoB === 'ENEMY', `o adversário saiu "${hud.ladoB}"`);

const fim = await p.evaluate(async () => {
  const g = window.game;
  g.rounds.historico = [{ seu: 1, bot: 0 }, { seu: 1, bot: 0 }];
  g.rounds.scoreYou = 2; g.rounds.scoreBot = 0;
  g.onMatchEnded('you');
  await new Promise(r => setTimeout(r, 200));
  return {
    titulo: document.getElementById('meTitle').textContent,
    faixa: document.getElementById('meFaixa').textContent,
    lado: document.querySelectorAll('.me-lado b')[1].textContent,
    denovo: document.getElementById('btnAgain').textContent.trim(),
  };
});
console.log('fim (en) :', JSON.stringify(fim));
check(fim.titulo === 'VICTORY', `o título saiu "${fim.titulo}"`);
check(fim.lado === 'ENEMY', `o lado adversário saiu "${fim.lado}"`);
check(fim.denovo === 'PLAY AGAIN', `o botão saiu "${fim.denovo}"`);

// ------------------ 5b. cada desfecho de rodada diz o que de fato houve
/*
 * A rodada fecha logo depois da metade de fuga, então esta é a primeira coisa
 * que se lê depois de escapar — e ela precisa falar do que a PESSOA fez, não do
 * placar. As quatro saídas vêm das duas perguntas da rodada: acertou na
 * caçada? escapou na fuga?
 *
 * Já houve aqui um "ELIMINARAM OS DOIS", que nem português direito é: lê como
 * se duas pessoas tivessem caído, quando o que houve foi um ponto para cada
 * lado.
 */
const mensagens = await p.evaluate(async () => {
  const g = window.game;
  const mod = await import('/src/ui/i18n.js');
  const ler = (seu, dele) => {
    g.onRoundEnded(seu, dele, seu, dele);
    return document.querySelector('.bm-sub').textContent;
  };
  const porIdioma = {};
  for (const cod of ['pt', 'es', 'en']) {
    mod.trocarIdioma(cod);
    porIdioma[cod] = {
      limpa: ler(1, 0),      // eliminou e escapou
      trocada: ler(1, 1),    // eliminou e caiu
      vazia: ler(0, 0),      // ninguém acertou
      perdida: ler(0, 1),    // errou e caiu
    };
  }
  mod.trocarIdioma('en');
  return porIdioma;
});

for (const [cod, m] of Object.entries(mensagens)) {
  console.log(`rodadas ${cod} :`, JSON.stringify(m));

  // as quatro têm que ser DIFERENTES entre si: duas iguais quer dizer que um
  // desfecho está sendo contado como outro
  const distintas = new Set(Object.values(m));
  check(distintas.size === 4,
    `${cod}: só ${distintas.size} frases distintas para 4 desfechos de rodada`);
  for (const [caso, frase] of Object.entries(m)) {
    check(frase.length > 6 && frase !== 'jogo.rodada' + caso,
      `${cod}: o desfecho "${caso}" saiu como "${frase}"`);
  }
}

// e o conteúdo, no idioma que este teste está usando
{
  const en = mensagens.en;
  check(/SURVIVED/i.test(en.limpa), `eliminou e escapou, e a tela disse "${en.limpa}"`);
  check(/KILLED/i.test(en.trocada) && /(DIED|FLEE)/i.test(en.trocada),
    `eliminou mas caiu na fuga, e a tela disse "${en.trocada}"`);
  check(!/SURVIVED/i.test(en.perdida),
    `errou a caçada e foi abatido, mas a tela fala em sobreviver: "${en.perdida}"`);
  check(!/SURVIVED/i.test(en.trocada),
    `foi abatido na fuga, mas a tela fala em sobreviver: "${en.trocada}"`);
}

// ------------------------------- 6. "BOT" não pode ter sobrado em lugar nenhum
const sobrouBot = await p.evaluate(() => {
  const achados = [];
  const anda = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = anda.nextNode(); n; n = anda.nextNode()) {
    if (/\bBOT\b/i.test(n.nodeValue) && n.parentElement?.offsetParent !== null) {
      achados.push(n.nodeValue.trim().slice(0, 40));
    }
  }
  return achados;
});
console.log('sobrou "bot":', JSON.stringify(sobrouBot));
check(sobrouBot.length === 0, `ainda aparece "BOT" na tela: ${sobrouBot.join(' | ')}`);

await p.screenshot({ path: 'tools/_idioma.png' });
console.log('  tools/_idioma.png');

if (erros.length) { falhas++; console.log('ERROS:', erros.slice(0, 4).join(' | ')); }
await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTRÊS IDIOMAS OK\n');
process.exit(falhas ? 1 : 0);
