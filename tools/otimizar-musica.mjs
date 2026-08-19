// Converte a música do menu de WAV para MP3.
//   npm run musica
//
// O arquivo de origem tem 7,5 MB — onze vezes o pacote inteiro do jogo, para
// 45 segundos que tocam em laço atrás de um menu. WAV é PCM cru: não existe
// motivo para mandar isso pela rede. O MP3 fica em torno de meio mega e toca
// em qualquer navegador, incluindo Safari e iOS, que é onde OGG e WebM falham.
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
  if (fmt.formato !== 1 || fmt.bits !== 16) {
    throw new Error(`só sei ler PCM de 16 bits (veio formato ${fmt.formato}, ${fmt.bits} bits)`);
  }

  const quadros = Math.floor(dados.length / (2 * fmt.canais));
  const canais = Array.from({ length: fmt.canais }, () => new Int16Array(quadros));
  for (let i = 0; i < quadros; i++) {
    for (let c = 0; c < fmt.canais; c++) {
      canais[c][i] = dados.readInt16LE((i * fmt.canais + c) * 2);
    }
  }
  return { ...fmt, quadros, canais };
}

const wav = lerWav(ENTRADA);
const dur = wav.quadros / wav.taxa;
console.log(`entrada : ${ENTRADA}`);
console.log(`          ${wav.canais.length} canal(is), ${wav.taxa} Hz, ${dur.toFixed(1)}s, ` +
            `${(readFileSync(ENTRADA).length / 1048576).toFixed(2)} MB`);

const canais = Math.min(wav.canais.length, 2);
const enc = new lamejs.Mp3Encoder(canais, wav.taxa, KBPS);
const pedacos = [];
const BLOCO = 1152;                       // um quadro de MP3

for (let i = 0; i < wav.quadros; i += BLOCO) {
  const esq = wav.canais[0].subarray(i, i + BLOCO);
  const dir = canais === 2 ? wav.canais[1].subarray(i, i + BLOCO) : undefined;
  const buf = canais === 2 ? enc.encodeBuffer(esq, dir) : enc.encodeBuffer(esq);
  if (buf.length > 0) pedacos.push(Buffer.from(buf));
}
const fim = enc.flush();
if (fim.length > 0) pedacos.push(Buffer.from(fim));

const mp3 = Buffer.concat(pedacos);
if (!existsSync(dirname(SAIDA))) mkdirSync(dirname(SAIDA), { recursive: true });
writeFileSync(SAIDA, mp3);

const kb = mp3.length / 1024;
console.log(`saída   : ${SAIDA}`);
console.log(`          ${canais === 2 ? 'estéreo' : 'mono'}, ${KBPS} kbps, ${kb.toFixed(0)} KB ` +
            `(${(readFileSync(ENTRADA).length / mp3.length).toFixed(1)}x menor)`);
