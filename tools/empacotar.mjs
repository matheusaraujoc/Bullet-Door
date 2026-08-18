// Gera o zip para subir no itch.io (ou em qualquer host estático).
//   npm run itch
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SAIDA = 'bullet-door-web.zip';

if (!existsSync('dist') || !existsSync(join('dist', 'index.html'))) {
  console.error('dist/ não existe ou está sem index.html — rode "npm run build" antes.');
  process.exit(1);
}

// O itch.io exige index.html na RAIZ do zip: ele descompacta e abre esse
// arquivo direto. Zipar a pasta dist inteira colocaria tudo um nível abaixo e
// o portal não acharia nada.
if (existsSync(SAIDA)) rmSync(SAIDA);

if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Compress-Archive -Path 'dist\\*' -DestinationPath '${SAIDA}' -Force`], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-r', '-q', join('..', SAIDA), '.'], { cwd: 'dist', stdio: 'inherit' });
}

const mb = statSync(SAIDA).size / 1024 / 1024;

/** Lista o que foi parar no pacote, para conferência rápida. */
const andar = (dir, prefixo = '') => {
  for (const nome of readdirSync(dir, { withFileTypes: true })) {
    if (nome.isDirectory()) andar(join(dir, nome.name), `${prefixo}${nome.name}/`);
    else {
      const kb = statSync(join(dir, nome.name)).size / 1024;
      console.log(`   ${(prefixo + nome.name).padEnd(42)} ${kb.toFixed(0).padStart(6)} KB`);
    }
  }
};

console.log(`\n${SAIDA} — ${mb.toFixed(2)} MB\n`);
console.log('  conteúdo:');
andar('dist');

console.log(`
  Para publicar no itch.io:
    1. Novo projeto, "Kind of project" = HTML
    2. Suba ${SAIDA} e marque "This file will be played in the browser"
    3. Viewport sugerido: 1280 x 720, com "Fullscreen button" ligado
    4. "Mobile friendly" desmarcado — o jogo é de mouse e teclado
`);
