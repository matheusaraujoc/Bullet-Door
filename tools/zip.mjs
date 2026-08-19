import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

/**
 * Escreve um .zip sem depender de ferramenta externa.
 *
 * Existe porque o Compress-Archive do Windows PowerShell 5.1 grava os caminhos
 * internos com barra INVERTIDA. O formato ZIP exige barra normal, e quem
 * descompacta um pacote assim (o itch.io, por exemplo) cria um arquivo chamado
 * literalmente "assets\index.css" na raiz, em vez da pasta assets com o arquivo
 * dentro. O jogo então sobe sem CSS e sem JS: só o HTML cru na tela.
 */

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Data/hora no formato MS-DOS que o cabeçalho do zip usa. */
function dataDos(d = new Date()) {
  const hora = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xFFFF;
  const data = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  return { hora, data };
}

/** Lista os arquivos de um diretório, com caminho relativo e barra normal. */
export function listar(raiz, prefixo = '') {
  const saida = [];
  for (const item of readdirSync(join(raiz, prefixo), { withFileTypes: true })) {
    const rel = prefixo ? posix.join(prefixo, item.name) : item.name;
    if (item.isDirectory()) saida.push(...listar(raiz, rel));
    else saida.push(rel);
  }
  return saida;
}

/**
 * Compacta os arquivos de `raiz` para `destino`, mantendo a estrutura.
 * Os nomes vão SEMPRE com "/", como manda o formato.
 */
export function zipar(raiz, destino) {
  const arquivos = listar(raiz);
  const { hora, data } = dataDos();
  const pedacos = [];
  const central = [];
  let offset = 0;

  for (const rel of arquivos) {
    const nome = Buffer.from(rel.split('\\').join('/'), 'utf8');   // nunca barra invertida
    const cru = readFileSync(join(raiz, rel));
    const comprimido = deflateRawSync(cru, { level: 9 });
    const crc = crc32(cru);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // versão necessária
    local.writeUInt16LE(0, 6);           // sem flags
    local.writeUInt16LE(8, 8);           // deflate
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(cru.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    pedacos.push(local, nome, comprimido);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);             // versão de quem criou
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(hora, 12);
    cd.writeUInt16LE(data, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comprimido.length, 20);
    cd.writeUInt32LE(cru.length, 24);
    cd.writeUInt16LE(nome.length, 28);
    cd.writeUInt16LE(0, 30);             // extra
    cd.writeUInt16LE(0, 32);             // comentário
    cd.writeUInt16LE(0, 34);             // disco
    cd.writeUInt16LE(0, 36);             // atributos internos
    cd.writeUInt32LE(0, 38);             // atributos externos
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nome);

    offset += local.length + nome.length + comprimido.length;
  }

  const corpoCentral = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(0, 4);
  fim.writeUInt16LE(0, 6);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(corpoCentral.length, 12);
  fim.writeUInt32LE(offset, 16);
  fim.writeUInt16LE(0, 20);

  writeFileSync(destino, Buffer.concat([...pedacos, corpoCentral, fim]));
  return { arquivos, bytes: statSync(destino).size };
}
