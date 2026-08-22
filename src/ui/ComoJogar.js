import { t, aoTrocarIdioma } from './i18n.js';

const TOTAL_DICAS = 6;
const TOTAL_PAGINAS = 1 + TOTAL_DICAS;   // a página 0 é a regra; 1..6 são as dicas

/**
 * "Como jogar": a mesma caixa que já explicava rodada/partida ganhou seta e
 * virou um passo a passo — a regra é a primeira página, as dicas de jogo são
 * as seguintes.
 *
 * Existia uma caixa de dicas separada antes desta, rodando sozinha ao lado da
 * regra. Ela vivia na lista de itens sacrificados em telas baixas (junto da
 * tagline e do selo do estúdio) para a regra e os controles — a razão do menu
 * existir — nunca perderem espaço primeiro. Resultado: em qualquer tela mais
 * baixa a dica simplesmente sumia. A regra nunca esteve nessa lista de
 * sacrifício, então dicas morando dentro dela aparecem em qualquer altura de
 * tela em que o menu já aparecia — o mesmo lugar que sempre funcionou.
 *
 * Troca manual, não automática: a regra é lida com calma, não é a linha de
 * um rodapé rotativo. Botão de seta é ação deliberada, do jeito que também já
 * era pedido para a rolagem entre dicas.
 */
export function criarComoJogar(alvo = document.getElementById('comoJogar')) {
  if (!alvo) return null;

  let i = 0;

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'cj-seta cj-prev';
  prev.textContent = '‹';

  const corpo = document.createElement('div');
  corpo.className = 'cj-corpo';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'cj-seta cj-next';
  next.textContent = '›';

  const pintar = () => {
    if (i === 0) {
      corpo.innerHTML = t('menu.regra');
    } else {
      const rotulo = t('menu.dicaRotulo');
      const dica = t(`dica.${i}`);
      corpo.innerHTML = `<b class="cj-rotulo">${rotulo}</b> ${dica}`;
    }
    prev.setAttribute('aria-label', t('menu.passoAnterior'));
    next.setAttribute('aria-label', t('menu.passoProximo'));
  };

  const ir = passo => {
    i = (i + passo + TOTAL_PAGINAS) % TOTAL_PAGINAS;
    pintar();
  };

  prev.addEventListener('click', () => ir(-1));
  next.addEventListener('click', () => ir(1));

  alvo.replaceChildren(prev, corpo, next);
  pintar();
  // a página atual precisa reaparecer no idioma novo, venha a troca de onde vier
  aoTrocarIdioma(pintar);

  return { pintar };
}
