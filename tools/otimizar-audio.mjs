// Converte os áudios de WAV para MP3.
//   npm run audio
//
// WAV é PCM cru, e os originais aqui somam quase 9 MB — mais de dez vezes o
// pacote inteiro do jogo. Não existe motivo para mandar isso pela rede. O MP3
// toca em qualquer navegador, incluindo Safari e iOS, que é onde OGG e WebM
// falham.
//
// O leitor entende PCM de 16 bits e ponto flutuante de 32, e reamostra o que
// vier fora das taxas que o MP3 aceita — o tiro veio em 96 kHz, que não é uma
// delas.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createContext, runInContext } from 'node:vm';

/*
 * O lamejs entra pelo pacote já empacotado, não pelo `main` do package.json.
 * A versão em `src/` foi traduzida do Java e conta com um punhado de nomes
 * soltos no escopo global (`MPEGMode` e companhia), que nunca chegam a existir
 * quando o Node carrega os módulos um a um — o construtor estoura na primeira
 * linha. O `lame.min.js` é o mesmo código numa peça só, e ali os nomes se
 * encontram. Um contexto de vm dá a ele o `window` que ele espera.
 */
const escopo = {
  console, Math, Date, ArrayBuffer,
  Uint8Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array,
};
escopo.window = escopo; escopo.self = escopo; escopo.global = escopo;
createContext(escopo);
runInContext(readFileSync('node_modules/lamejs/lame.min.js', 'utf8'), escopo);
const lamejs = escopo.lamejs;

const ENTRADA = 'audios/sounds/musics/menu.wav';
const SAIDA = 'public/audios/menu.mp3';
const KBPS = 96;

/** Lê um WAV PCM de 16 bits e devolve os canais separados. */
function lerWav(caminho) {
  const b = readFileSync(caminho);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${caminho} não é um WAV`);
  }

  let fmt = null, dados = null;
  let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const tam = b.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = {
        formato: b.readUInt16LE(off + 8),
        canais: b.readUInt16LE(off + 10),
        taxa: b.readUInt32LE(off + 12),
        bits: b.readUInt16LE(off + 22),
      };
    } else if (id === 'data') {
      dados = b.subarray(off + 8, off + 8 + tam);
    }
    off += 8 + tam + (tam % 2);          // os chunks são alinhados em 2 bytes
  }
  if (!fmt || !dados) throw new Error('WAV sem fmt ou sem data');
  // 1 = PCM inteiro, 3 = ponto flutuante. Os dois aparecem em editor comum.
  const bytesPorAmostra = fmt.bits / 8;
  const lerAmostra =
    fmt.formato === 1 && fmt.bits === 16 ? (b, o) => b.readInt16LE(o) / 32768 :
    fmt.formato === 1 && fmt.bits === 24 ? (b, o) => (b.readIntLE(o, 3)) / 8388608 :
    fmt.formato === 1 && fmt.bits === 32 ? (b, o) => b.readInt32LE(o) / 2147483648 :
    fmt.formato === 3 && fmt.bits === 32 ? (b, o) => b.readFloatLE(o) :
    fmt.formato === 3 && fmt.bits === 64 ? (b, o) => b.readDoubleLE(o) : null;
  if (!lerAmostra) {
    throw new Error(`não sei ler formato ${fmt.formato} de ${fmt.bits} bits`);
  }

  const quadros = Math.floor(dados.length / (bytesPorAmostra * fmt.canais));
  const canais = Array.from({ length: fmt.canais }, () => new Float32Array(quadros));
  for (let i = 0; i < quadros; i++) {
    for (let c = 0; c < fmt.canais; c++) {
      canais[c][i] = lerAmostra(dados, (i * fmt.canais + c) * bytesPorAmostra);
    }
  }
  return { ...fmt, quadros, canais };
}

/** O MP3 só aceita estas taxas; qualquer outra é reamostrada para 44,1 kHz. */
const TAXAS_MP3 = [32000, 44100, 48000];

/** Reamostragem linear. Basta: a origem tem taxa mais alta que o destino. */
function reamostrar(canais, de, para) {
  if (de === para) return canais;
  const razao = de / para;
  const saida = canais[0].length / razao | 0;
  return canais.map(c => {
    const novo = new Float32Array(saida);
    for (let i = 0; i < saida; i++) {
      const p = i * razao;
      const a = p | 0, f = p - a;
      novo[i] = c[a] * (1 - f) + (c[a + 1] ?? c[a]) * f;
    }
    return novo;
  });
}

/** Converte um WAV em MP3, devolvendo um resumo do que aconteceu. */
function converter(entrada, saida, kbps) {
  const wav = lerWav(entrada);
  const bytesEntrada = readFileSync(entrada).length;
  const dur = wav.quadros / wav.taxa;

  const taxa = TAXAS_MP3.includes(wav.taxa) ? wav.taxa : 44100;
  const canais = reamostrar(wav.canais, wav.taxa, taxa).slice(0, 2);

  // o codificador quer inteiros de 16 bits
  const inteiros = canais.map(c => {
    const out = new Int16Array(c.length);
    for (let i = 0; i < c.length; i++) {
      out[i] = Math.max(-32768, Math.min(32767, Math.round(c[i] * 32767)));
    }
    return out;
  });

  const enc = new lamejs.Mp3Encoder(inteiros.length, taxa, kbps);
  const pedacos = [];
  const BLOCO = 1152;                       // um quadro de MP3
  for (let i = 0; i < inteiros[0].length; i += BLOCO) {
    const esq = inteiros[0].subarray(i, i + BLOCO);
    const dir = inteiros[1]?.subarray(i, i + BLOCO);
    const buf = dir ? enc.encodeBuffer(esq, dir) : enc.encodeBuffer(esq);
    if (buf.length > 0) pedacos.push(Buffer.from(buf));
  }
  const fim = enc.flush();
  if (fim.length > 0) pedacos.push(Buffer.from(fim));

  const mp3 = Buffer.concat(pedacos);
  if (!existsSync(dirname(saida))) mkdirSync(dirname(saida), { recursive: true });
  writeFileSync(saida, mp3);

  return {
    entrada, saida, dur, kbps,
    taxaOriginal: wav.taxa, taxa, canais: inteiros.length,
    mb: bytesEntrada / 1048576, kb: mp3.length / 1024,
    reducao: bytesEntrada / mp3.length,
  };
}

const TRABALHOS = [
  // a música toca em laço atrás do menu: vale gastar um pouco mais nela
  { de: 'audios/sounds/musics/menu.wav', para: 'public/audios/menu.mp3', kbps: 96 },
  /*
   * O tiro NÃO vai para public/: ele viaja embutido no código, então mandar uma
   * cópia junto do pacote seria peso que ninguém baixa. O mp3 fica ao lado do
   * wav original, como registro do que foi embutido e para o teste conferir.
   */
  { de: 'audios/sounds/shot.wav', para: 'audios/sounds/shot.mp3', kbps: 128,
    embutirEm: 'src/core/tiro-embutido.js' },
];

/**
 * O tiro também sai embutido no código, como texto.
 *
 * É o som mais importante do jogo e o que toca mais vezes; deixá-lo dependendo
 * de um pedido de rede significa que qualquer coisa entre o navegador e o
 * arquivo — extensão, antivírus, proxy, um portal que sirva mídia de outro
 * domínio — pode deixar o jogo sem tiro. Trinta e um quilobytes viram quarenta
 * e dois em base64, num pacote de mais de um mega: é barato para uma coisa que
 * passa a não poder falhar.
 *
 * A música não entra nesse arranjo: meio mega embutido atrasaria a primeira
 * tela, e música que não toca é um contratempo, não um jogo quebrado.
 */
function embutir(mp3, destino) {
  const b64 = readFileSync(mp3).toString('base64');
  const texto = `// GERADO POR tools/otimizar-audio.mjs — não edite à mão.
//
// O disparo, embutido como texto para não depender de pedido de rede. Ver o
// porquê em tools/otimizar-audio.mjs.
export const TIRO_MP3 = 'data:audio/mpeg;base64,\
${b64.match(/.{1,100}/g).join('\
')}';
`;
  writeFileSync(destino, texto);
  return b64.length / 1024;
}

for (const t of TRABALHOS) {
  if (!existsSync(t.de)) { console.log(`(pulando ${t.de}: não existe)`); continue; }
  const r = converter(t.de, t.para, t.kbps);
  const reamostrou = r.taxa !== r.taxaOriginal ? ` (${r.taxaOriginal} Hz → ${r.taxa} Hz)` : '';
  console.log(`${r.entrada}`);
  console.log(`  ${r.canais === 2 ? 'estéreo' : 'mono'}, ${r.dur.toFixed(1)}s, ` +
              `${r.mb.toFixed(2)} MB${reamostrou}`);
  console.log(`  → ${r.saida}  ${r.kb.toFixed(0)} KB a ${r.kbps} kbps ` +
              `(${r.reducao.toFixed(1)}x menor)`);

  if (t.embutirEm) {
    const kb = embutir(t.para, t.embutirEm);
    console.log(`  → ${t.embutirEm}  ${kb.toFixed(0)} KB embutidos no código`);
  }
  console.log('');
}
