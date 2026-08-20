// Os sons do jogo, medidos em vez de ouvidos.
//   node tools/test-som.mjs
//
// Cada efeito é renderizado fora do tempo real e conferido contra as marcas do
// som "de oito bits" — que é um conjunto de escolhas, não um estilo:
//
//   · onda quadrada ou dente de serra cruas, sem filtro;
//   · ataque instantâneo, o sinal saltando de zero ao pico numa amostra;
//   · repetição literal, dois disparos seguidos idênticos;
//   · tudo abafado, sem energia nenhuma acima de dois quilohertz.
//
// E contra o defeito que a primeira tentativa de conserto introduziu: uma
// reverberação artificial que soava como eco metálico dentro de um tambor.
// Aqui ela vira um limite — som curto tem que TERMINAR, não ficar zunindo.
//
// Nenhuma dessas medidas prova que o som é bonito. Todas provam que ele deixou
// de ter a assinatura que estava incomodando.
import puppeteer from 'puppeteer-core';
import { subirVite, matarVite, esperarVite } from './_servidor.mjs';
import { existsSync, readFileSync, statSync } from 'node:fs';

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
             'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const PORT = 5185;
const vite = subirVite(PORT); await esperarVite(PORT);
const b = await puppeteer.launch({ executablePath: exe, headless: 'shell',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));

let falhas = 0;
const check = (c, m) => { if (!c) { falhas++; console.log('FALHOU:', m); } };

// -------------------------------------- 1. nenhum oscilador cru no código
const fonte = readFileSync('src/core/AudioSys.js', 'utf8');
const crus = [...fonte.matchAll(/type\s*=?:?\s*'(square|sawtooth)'/g)].map(m => m[1]);
console.log(`osciladores crus no código: ${crus.length ? crus.join(', ') : 'nenhum'}`);
check(crus.length === 0,
  `ainda há oscilador ${crus.join('/')} cru — é o timbre de fliperama que incomodava`);

// -------------------------------------- 1b. o tiro vem de arquivo
{
  const embutido = 'src/core/tiro-embutido.js';
  const existe = existsSync(embutido);
  const kb = existe ? statSync(embutido).size / 1024 : 0;
  console.log(`tiro no código : ${existe ? kb.toFixed(0) + ' KB' : 'NÃO EXISTE'}`);
  check(existe, 'o tiro embutido não foi gerado — rode npm run audio');
  check(kb < 120, `o tiro embutido tem ${kb.toFixed(0)} KB; é som curto, devia caber em bem menos`);

  // e nada de mandar no pacote uma cópia que o jogo não busca
  check(!existsSync('public/audios/shot.mp3'),
    'public/audios/shot.mp3 voltou a existir — o jogo não o busca, seria peso morto no pacote');
}

await p.goto(`http://localhost:${PORT}/?fast`, { waitUntil: 'networkidle2' });
await p.waitForFunction(() => window.game && window.game.ready, { timeout: 120000 });

/**
 * Renderiza um efeito fora do tempo real e devolve as medidas.
 *
 * Cada som sorteia a velocidade de leitura do ruído a cada disparo — é de
 * propósito, para dois tiros seguidos não saírem idênticos. Só que isso torna
 * cada medida uma amostra de uma distribuição, e conferir uma amostra só contra
 * um limiar é como decidir no cara ou coroa. Daí a MEDIANA de várias passadas:
 * mede a tendência do som, não a sorte de uma renderização.
 */
const medir = kind => p.evaluate(async k => {
  const { AudioSys } = await import('/src/core/AudioSys.js');

  const render = async () => {
    const taxa = 44100, segundos = 1.6;
    const off = new OfflineAudioContext(2, taxa * segundos, taxa);
    const a = new AudioSys();
    a.init(off);
    a.play(k, { vol: 1 });
    const buf = await off.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const mono = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) / 2;
    return { mono, taxa };
  };

  const passadas = [];
  for (let n = 0; n < 7; n++) passadas.push(await render());
  const { mono, taxa } = passadas[0];
  const segunda = passadas[1].mono;

  const medirUma = som => {
    let pico = 0;
    for (let i = 0; i < som.length; i++) pico = Math.max(pico, Math.abs(som[i]));

    let iInicio = 0;
    for (let i = 0; i < som.length; i++) {
      if (Math.abs(som[i]) > pico * 0.05) { iInicio = i; break; }
    }

    /*
     * O ARRANQUE: quanto do pico já está lá meio milissegundo depois do som
     * começar.
     *
     * "Tempo até o pico" parecia a medida óbvia e não é: num som de quatro
     * camadas, o pico da soma cai onde as fases baterem, e como o ruído é
     * sorteado a cada disparo a medida pula de 13 ms para 90 ms entre duas
     * execuções. Estava medindo sorte.
     *
     * Isto aqui mede o que realmente importa: bipe de chip sai de zero a cheio
     * na primeira amostra, então o arranque dele é ~1. Som com envelope começa
     * baixo, e o arranque fica bem abaixo disso.
     */
    const meioMs = Math.floor(taxa * 0.0005);
    let arranque = 0;
    for (let i = iInicio; i < Math.min(som.length, iInicio + meioMs); i++) {
      arranque = Math.max(arranque, Math.abs(som[i]));
    }
    arranque /= (pico + 1e-12);

    /*
     * O DIRETO CONTRA A SALA: energia dos primeiros 60 ms contra a de 200 a
     * 600 ms. Reflexão mais alta que a fonte não soa como sala, soa como eco de
     * desenho animado — e esta razão pega isso sem depender de onde caiu o pico.
     */
    const janelaRms = (deMs, ateMs) => {
      const a = Math.floor(taxa * deMs / 1000), b = Math.min(som.length, Math.floor(taxa * ateMs / 1000));
      if (b <= a) return 0;
      let acc = 0;
      for (let i = a; i < b; i++) acc += som[i] * som[i];
      return Math.sqrt(acc / (b - a));
    };
    const direto = janelaRms(0, 60);
    const sala = janelaRms(200, 600);

    /*
     * BRILHO: quanta energia vive acima de ~1,8 kHz.
     *
     * "Abafado" é uma palavra, e palavra não entra em teste. Isto entra: uma
     * média móvel curta devolve o que há de grave, e o que sobra ao subtrair é
     * o agudo. A razão entre os dois é o que o ouvido chama de brilho, e um
     * som com cobertor por cima tem esse número perto de zero.
     */
    const K = 24;                       // ~1,8 kHz
    const ate = Math.min(som.length, Math.floor(taxa * 0.3));
    let grave = 0, agudo = 0;
    for (let i = K; i < ate; i++) {
      let acc = 0;
      for (let j = 0; j < K; j++) acc += som[i - j];
      const baixa = acc / K;
      grave += baixa * baixa;
      const alta = som[i] - baixa;
      agudo += alta * alta;
    }
    const brilho = Math.sqrt(agudo) / (Math.sqrt(grave) + Math.sqrt(agudo) + 1e-12);
    const janela = Math.floor(taxa * 0.01);
    const rms = [];
    for (let i = 0; i + janela < som.length; i += janela) {
      let acc = 0;
      for (let j = 0; j < janela; j++) acc += som[i + j] * som[i + j];
      rms.push(Math.sqrt(acc / janela));
    }
    const rmsPico = Math.max(...rms);
    let ultima = 0;
    rms.forEach((v, i) => { if (v > rmsPico * 0.02) ultima = i; });
    const tarde = rms.slice(20);
    const rmsTarde = tarde.length
      ? Math.sqrt(tarde.reduce((acc, v) => acc + v * v, 0) / tarde.length) : 0;
    return {
      pico,
      arranque,
      brilho,
      diretoVsSala: direto / (sala + 1e-12),
      duracaoMs: ultima * 10,
      cauda: rmsTarde / (rmsPico + 1e-12),
    };
  };

  const todas = passadas.map(pa => medirUma(pa.mono));
  if (todas[0].pico < 1e-6) return { silencio: true };
  const mediana = campo => {
    const v = todas.map(t => t[campo]).sort((x, y) => x - y);
    return v[Math.floor(v.length / 2)];
  };

  // pico e onde ele acontece
  let pico = 0, iPico = 0;
  for (let i = 0; i < mono.length; i++) {
    const v = Math.abs(mono[i]);
    if (v > pico) { pico = v; iPico = i; }
  }
  if (pico < 1e-6) return { silencio: true };

  // início: a primeira amostra que passa de 5% do pico
  let iInicio = 0;
  for (let i = 0; i < mono.length; i++) {
    if (Math.abs(mono[i]) > pico * 0.05) { iInicio = i; break; }
  }
  const ataqueMs = ((iPico - iInicio) / taxa) * 1000;

  // energia por janela de 10 ms, para achar a duração e a cauda
  const janela = Math.floor(taxa * 0.01);
  const rms = [];
  for (let i = 0; i + janela < mono.length; i += janela) {
    let s = 0;
    for (let k = 0; k < janela; k++) s += mono[i + k] * mono[i + k];
    rms.push(Math.sqrt(s / janela));
  }
  const rmsPico = Math.max(...rms);
  let ultima = 0;
  rms.forEach((v, i) => { if (v > rmsPico * 0.02) ultima = i; });
  const duracaoMs = ultima * 10;

  // a energia que sobra bem depois do golpe: 200 ms adiante já é só sala
  const janelasDepois = rms.slice(20);
  const rmsTarde = janelasDepois.length
    ? Math.sqrt(janelasDepois.reduce((s, v) => s + v * v, 0) / janelasDepois.length) : 0;
  const proporcaoCauda = rmsTarde / (rmsPico + 1e-12);

  // dois disparos do mesmo som são idênticos amostra a amostra?
  let iguais = true;
  for (let i = 0; i < Math.min(mono.length, segunda.length); i += 37) {
    if (Math.abs(mono[i] - segunda[i]) > 1e-7) { iguais = false; break; }
  }

  return {
    pico: +mediana('pico').toFixed(3),
    arranque: +mediana('arranque').toFixed(3),
    brilho: +mediana('brilho').toFixed(3),
    diretoVsSala: +mediana('diretoVsSala').toFixed(1),
    duracaoMs: mediana('duracaoMs'),
    cauda: +mediana('cauda').toFixed(3),
    iguais,
  };
}, kind);

/*
 * O tiro gravado.
 *
 * Ele viaja EMBUTIDO no código, não como pedido de rede, e é isso que o teste
 * exercita: o mesmo caminho que o jogo usa de verdade. A razão de ser assim
 * está em tools/otimizar-audio.mjs — neste computador dá para ver o motivo ao
 * vivo, com o mesmo arquivo chegando inteiro servido como ".dat" e voltando
 * vazio servido como ".mp3".
 */
{
  const amostra = await p.evaluate(async () => {
    try {
      const a = window.game.audio;
      a.init();
      await a.carregarGravados();
      const buf = a.amostras.get('shot');
      if (!buf) return { erro: 'a amostra não entrou no mapa' };
      window.__tiro = buf;
      return { seg: +buf.duration.toFixed(2), canais: buf.numberOfChannels, taxa: buf.sampleRate };
    } catch (e) { return { erro: String(e.message || e) }; }
  });

  console.log('tiro embutido  :', JSON.stringify(amostra));
  check(!amostra.erro, `o tiro embutido não decodifica: ${amostra.erro}`);
  if (!amostra.erro) {
    check(amostra.seg > 0.2 && amostra.seg < 6,
      `a amostra tem ${amostra.seg}s — não parece um disparo`);
    check(amostra.taxa === 44100 || amostra.taxa === 48000,
      `a amostra saiu a ${amostra.taxa} Hz, fora das taxas que o MP3 aceita`);
  }

  /*
   * Com a amostra no lugar, o disparo tem que usá-la.
   *
   * O que separa os dois caminhos é o OSCILADOR: a amostra é um buffer e não
   * cria nenhum; a síntese empilha duas notas. Contar chamadas de `_chain` não
   * serviria — os dois abrem exatamente uma cadeia.
   */
  const usou = await p.evaluate(() => {
    const a = window.game.audio;
    a.init();
    const contar = () => {
      let osc = 0, buffers = 0;
      const oOsc = a.ctx.createOscillator.bind(a.ctx);
      const oBuf = a.ctx.createBufferSource.bind(a.ctx);
      a.ctx.createOscillator = () => { osc++; return oOsc(); };
      a.ctx.createBufferSource = () => { buffers++; return oBuf(); };
      a.play('shot', { vol: 0.02 });
      a.ctx.createOscillator = oOsc;
      a.ctx.createBufferSource = oBuf;
      return { osc, buffers };
    };

    a.amostras.delete('shot');
    const sintetizado = contar();
    a.amostras.set('shot', window.__tiro);
    const gravado = contar();
    return { sintetizado, gravado };
  });
  console.log('sem amostra    :', JSON.stringify(usou.sintetizado));
  console.log('com amostra    :', JSON.stringify(usou.gravado));
  check(usou.sintetizado.osc > 0, 'a reserva sintetizada do tiro parou de funcionar');
  check(usou.gravado.osc === 0 && usou.gravado.buffers === 1,
    'o jogo tocou o tiro sintetizado mesmo com a amostra carregada');
}

// ------------------------------------------- 2. cada som, um por um
console.log('');
const mundo = ['shot', 'hit', 'door', 'step', 'run', 'bump', 'swap'];
const interface_ = ['tick', 'click'];

/*
 * Impacto contra sustentado.
 *
 * Só faz sentido exigir "o pico é o som direto" de quem TEM som direto: tiro,
 * baque, passo, lasca. Porta correndo no trilho e a virada de papel são atrito
 * e sopro — a energia deles cresce ao longo de um décimo de segundo, e o pico
 * tardio é o comportamento certo, não a sala passando por cima.
 */
const impactos = ['shot', 'hit', 'step', 'run', 'bump', 'tick', 'click'];

for (const kind of [...mundo, ...interface_]) {
  const m = await medir(kind);
  if (m.silencio) { falhas++; console.log(`FALHOU: "${kind}" não produziu som nenhum`); continue; }

  console.log(`${kind.padEnd(6)} pico ${String(m.pico).padEnd(6)} | brilho ${(m.brilho * 100).toFixed(0).padStart(3)}% | ` +
              `arranque ${(m.arranque * 100).toFixed(0).padStart(3)}% | começo/resto ${String(m.diretoVsSala).padStart(6)}x | ` +
              `cauda ${(m.cauda * 100).toFixed(0).padStart(3)}% | ${m.iguais ? 'SEMPRE IGUAL' : 'varia'}`);

  // nada pode estourar: o colador existe justamente para isso
  check(m.pico <= 1.001, `"${kind}" estourou em ${m.pico}`);
  check(m.pico > 0.02, `"${kind}" saiu quase inaudível (${m.pico})`);

  // e nada pode soar com cobertor por cima
  check(m.brilho > 0.16,
    `"${kind}" tem só ${(m.brilho * 100).toFixed(0)}% de energia no agudo — está abafado`);

  // arranque cheio na primeira amostra é a assinatura do bipe
  check(m.arranque < 0.9,
    `"${kind}" já sai com ${(m.arranque * 100).toFixed(0)}% do pico em meio milissegundo — é o ataque de bipe`);

  // e o corpo do som tem que estar no começo, não arrastando atrás
  if (impactos.includes(kind)) {
    check(m.diretoVsSala > 8,
      `"${kind}" tem o começo só ${m.diretoVsSala}x acima do que sobra depois — está arrastando`);
  }

  // e o sustentado tem mesmo que subir devagar
  if (!impactos.includes(kind)) {
    check(m.arranque < 0.35,
      `"${kind}" é som de atrito e já nasce com ${(m.arranque * 100).toFixed(0)}% do pico — virou impacto`);
  }

  /*
   * Som curto tem que acabar.
   *
   * Houve aqui uma reverberação sintética, e o que ela devolvia tinha um
   * zumbido afinado por cima — reflexão discreta é filtro pente. Todo o jogo
   * passou a soar como eco metálico. Esta medida é o contrário da que existia
   * antes: em vez de exigir cauda, ela proíbe que sobre energia muito depois do
   * golpe. Passo e clique não podem ecoar.
   */
  if (impactos.includes(kind)) {
    check(m.cauda < 0.06,
      `"${kind}" ainda tem ${(m.cauda * 100).toFixed(0)}% do pico tocando depois de 200 ms — está ecoando`);
  }

  // repetição literal denuncia síntese; tiro e passo tocam muitas vezes seguidas
  if (['shot', 'step', 'run', 'bump'].includes(kind)) {
    check(!m.iguais, `"${kind}" sai idêntico a cada disparo — repetição literal`);
  }
}

// ------------------------------- 2b. o conjunto não pode estar alto demais
{
  const picos = [];
  for (const kind of [...mundo, ...interface_]) {
    const m = await medir(kind);
    if (!m.silencio) picos.push({ kind, pico: m.pico });
  }
  const maior = picos.reduce((a, b) => (b.pico > a.pico ? b : a));
  console.log(`
mais alto: "${maior.kind}" em ${maior.pico}`);
  check(maior.pico < 0.75,
    `"${maior.kind}" chega a ${maior.pico} — sobra pouco espaço antes do estouro e o conjunto sai gritando`);
}

// ------------------------- 3. o tiro precisa de grave, não só de chiado
console.log('');
const espectro = await p.evaluate(async () => {
  const { AudioSys } = await import('/src/core/AudioSys.js');
  const taxa = 44100;
  const off = new OfflineAudioContext(1, taxa, taxa);
  const a = new AudioSys();
  a.init(off);
  a.play('shot', { vol: 1 });
  const buf = await off.startRendering();
  const d = buf.getChannelData(0);

  // divide a energia em três faixas por filtragem grosseira no tempo:
  // média móvel curta = agudo removido; a diferença é o agudo
  const N = Math.min(d.length, taxa * 0.3);
  let grave = 0, agudo = 0, acc = 0;
  const K = 24;                       // ~1,8 kHz de corte
  for (let i = K; i < N; i++) {
    acc = 0;
    for (let k = 0; k < K; k++) acc += d[i - k];
    const baixa = acc / K;
    grave += baixa * baixa;
    const alta = d[i] - baixa;
    agudo += alta * alta;
  }
  return { grave: +Math.sqrt(grave / N).toFixed(4), agudo: +Math.sqrt(agudo / N).toFixed(4) };
});
const equilibrio = espectro.grave / (espectro.grave + espectro.agudo);
console.log(`tiro: grave ${espectro.grave} | agudo ${espectro.agudo} | ` +
            `${(equilibrio * 100).toFixed(0)}% da energia é grave`);
check(equilibrio > 0.25,
  `o tiro tem só ${(equilibrio * 100).toFixed(0)}% de grave — vira estalo de chicote, sem calibre`);
check(equilibrio < 0.92,
  `o tiro tem ${(equilibrio * 100).toFixed(0)}% de grave — virou baque abafado, sem o estalo`);

// ----------------------------------- 4. os sinos não são harmônicos exatos
const sino = await p.evaluate(async () => {
  const { AudioSys } = await import('/src/core/AudioSys.js');
  const a = new AudioSys();
  // as razões vêm da própria implementação, lidas pelo que ela agenda
  const usadas = [];
  const off = new OfflineAudioContext(1, 44100, 44100);
  a.init(off);
  const originalNota = a._nota.bind(a);
  a._nota = (dest, opt) => { usadas.push(opt.freq); return originalNota(dest, opt); };
  a._sino(a._chain(0.5), 440, 1, 0.5);
  return usadas.map(f => +(f / 440).toFixed(2));
});
console.log(`sino: parciais em ${sino.join(', ')} × a fundamental`);
const inteiros = sino.filter(r => Math.abs(r - Math.round(r)) < 0.02);
check(sino.length >= 3, `o sino tem só ${sino.length} parciais — soa como oscilador solto`);
check(inteiros.length <= 1,
  `${inteiros.length} parciais do sino são múltiplos inteiros — série harmônica exata soa como órgão barato`);

if (erros.length) { falhas++; console.log('ERROS:', erros.slice(0, 4).join(' | ')); }
await b.close(); matarVite(vite, PORT);
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nSOM SEM CARA DE OITO BITS\n');
process.exit(falhas ? 1 : 0);
