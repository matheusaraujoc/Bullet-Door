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
