// Gera o zip para subir no itch.io (ou em qualquer host estático).
//   npm run itch
import { existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { zipar } from './zip.mjs';

const SAIDA = 'bullet-door-web.zip';

if (!existsSync('dist') || !existsSync(join('dist', 'index.html'))) {
  console.error('dist/ não existe ou está sem index.html — rode "npm run build" antes.');
  process.exit(1);
}

// O itch.io exige index.html na RAIZ do zip: ele descompacta e abre esse
// arquivo direto. Zipar a pasta dist inteira deixaria tudo um nível abaixo.
if (existsSync(SAIDA)) rmSync(SAIDA);
const { arquivos, bytes } = zipar('dist', SAIDA);

console.log(`\n${SAIDA} — ${(bytes / 1024 / 1024).toFixed(2)} MB\n`);
console.log('  conteúdo:');
for (const a of arquivos) {
  const kb = statSync(join('dist', a)).size / 1024;
  console.log(`   ${a.padEnd(42)} ${kb.toFixed(0).padStart(6)} KB`);
}

const barrasErradas = arquivos.filter(a => a.includes('\\'));
if (barrasErradas.length) {
  console.error('\nERRO: caminho com barra invertida no pacote:', barrasErradas);
  process.exit(1);
}

console.log(`
  Para publicar no itch.io:
    1. Novo projeto, "Kind of project" = HTML
    2. Suba ${SAIDA} e marque "This file will be played in the browser"
    3. Viewport sugerido: 1280 x 720, com "Fullscreen button" ligado
    4. "Mobile friendly" desmarcado — o jogo é de mouse e teclado
`);
