import { t, aoTrocarIdioma } from './i18n.js';
import { obterProgresso } from '../core/Progresso.js';

/**
 * A linha discreta de progresso no rodapé do menu — nível, moedas, melhor
 * sequência. Existe pra dar ao jogador um motivo visível de ter jogado antes,
 * não só a partida de agora (Fase 2 do Roadmap de Progressão).
 */
export function criarProgressoJogador(alvo = document.getElementById('progressoJogador')) {
  if (!alvo) return null;

  const pintar = () => {
    const p = obterProgresso();
    alvo.textContent = t('menu.progresso', { nivel: p.nivel, moedas: p.moedas, sequencia: p.melhorSequencia });
  };

  pintar();
  // troca de idioma reaplica os números no texto novo
  aoTrocarIdioma(pintar);
  return { pintar };
}
