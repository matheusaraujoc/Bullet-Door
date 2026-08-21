import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VITE = path.join(RAIZ, 'node_modules', 'vite', 'bin', 'vite.js');

/**
 * Sobe e derruba o servidor de desenvolvimento para os testes.
 *
 * O node é lançado DIRETO, sem `shell: true`. Com shell, o Windows encadeia
 * cmd.exe -> npx -> node, e matar o filho imediato encerra só o cmd: o node
 * fica servindo para sempre. Foi assim que uma bateria de testes deixou quatro
 * servidores pendurados — e, como o vite estava configurado para abrir o
 * navegador, cada um deles tinha aberto uma aba do jogo na máquina de quem
 * estava usando o computador.
 *
 * Sem shell, o processo que temos em mãos é o próprio servidor, e `kill`
 * resolve.
 */
export function subirVite(porta) {
  const proc = spawn(process.execPath, [VITE, '--port', String(porta), '--strictPort'], {
    cwd: RAIZ,
    stdio: 'ignore',
    windowsHide: true,
  });
  const derrubar = () => matarVite(proc, porta);
  process.on('exit', derrubar);
  process.on('SIGINT', () => { derrubar(); process.exit(130); });
  return proc;
}

/** Encerra o servidor. Com o node lançado direto, o pid é o do próprio vite. */
export function matarVite(proc, porta) {
  if (!proc || proc.killed) return;
  try { proc.kill('SIGKILL'); } catch { /* já morreu */ }
  if (process.platform === 'win32' && proc.pid) {
    // cinto e suspensório: leva junto qualquer filho que o vite tenha criado
    try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch { /* ok */ }
  }
}

/**
 * Impede a página de teste de carregar o SDK real do Poki.
 *
 * `index.html` inclui o script deles direto de `game-cdn.poki.com`, como a
 * própria documentação pede — e nesta máquina, com internet de verdade, ele
 * carrega e FUNCIONA fora do site do Poki também. O problema é `commercialBreak`
 * especificamente: depois de um `gameplayStart` de verdade, o SDK decide por
 * conta própria pedir um anúncio de vídeo real ("requesting video ad in
 * house-ad mode") a um leilão de anúncio de verdade — que não tem por que
 * responder rápido, e não deveria: é exatamente o comportamento certo em
 * produção, só que indesejável num teste automatizado, que precisa ser rápido
 * e não depender de rede de terceiro para passar.
 *
 * Bloquear o script inteiro é mais simples e mais robusto que tentar simular
 * um `PokiSDK` falso: sem ele, `src/core/Poki.js` cai sozinho no caminho sem
 * SDK, que é determinístico e não faz pedido nenhum de rede.
 *
 * Só é preciso chamar isto nos testes que de fato CLICAM em Continuar ou
 * Jogar de novo — os que só leem texto/classe do botão não disparam nada.
 */
export async function bloquearPoki(page) {
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().includes('game-cdn.poki.com')) req.abort();
    else req.continue();
  });
}

/** Espera o servidor responder, em vez de dormir um tempo fixo e torcer. */
export async function esperarVite(porta, timeoutMs = 40000) {
  const alvo = `http://localhost:${porta}/`;
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(alvo, { method: 'GET' });
      if (r.ok) return true;
    } catch { /* ainda subindo */ }
    if (Date.now() - t0 > timeoutMs) throw new Error(`vite não subiu na porta ${porta}`);
    await new Promise(r => setTimeout(r, 200));
  }
}
