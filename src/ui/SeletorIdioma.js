import { asset } from '../core/assets-url.js';
import { listaDeIdiomas, idioma, trocarIdioma, aoTrocarIdioma, t } from './i18n.js';

/**
 * O seletor de idioma: as três bandeiras, lado a lado, no menu.
 *
 * Bandeira em lista suspensa obriga a abrir para descobrir o que tem dentro, e
 * quem não fala o idioma da tela ainda precisa achar o botão. Três bandeiras à
 * vista se resolvem num olhar, de qualquer idioma — inclusive de um que não
 * está aqui.
 *
 * O nome escrito ao lado não é enfeite: bandeira sozinha confunde quem fala
 * espanhol e não é da Espanha, ou inglês e não é dos Estados Unidos. A bandeira
 * chama o olho, a palavra confirma.
 */
export function criarSeletorDeIdioma(alvo = document.getElementById('idiomas'), aoTrocar) {
  if (!alvo) return null;

  const titulo = document.createElement('span');
  titulo.className = 'id-tit';
  titulo.dataset.i18n = 'menu.idioma';
  titulo.textContent = t('menu.idioma');

  const fila = document.createElement('div');
  fila.className = 'id-fila';

  const botoes = [];
  for (const { cod, nome, bandeira } of listaDeIdiomas()) {
    const bt = document.createElement('button');
    bt.type = 'button';
    bt.className = 'id-bt';
    bt.dataset.idioma = cod;
    bt.title = nome;
    bt.setAttribute('aria-label', nome);
    bt.innerHTML =
      `<img src="${asset(`images/flags/${bandeira}`)}" alt="" width="30" height="20">` +
      `<span>${nome}</span>`;
    bt.addEventListener('click', () => {
      trocarIdioma(cod);
      aoTrocar?.(cod);
    });
    fila.appendChild(bt);
    botoes.push(bt);
  }

  const pintar = () => {
    const agora = idioma();
    for (const bt of botoes) {
      const ativo = bt.dataset.idioma === agora;
      bt.classList.toggle('ativo', ativo);
      bt.setAttribute('aria-pressed', String(ativo));
    }
  };

  alvo.replaceChildren(titulo, fila);
  pintar();
  // o seletor se repinta sozinho a cada troca, venha ela de onde vier: sem isso
  // o texto mudava de idioma e a bandeira acesa continuava na anterior
  aoTrocarIdioma(pintar);
  return { pintar };
}
