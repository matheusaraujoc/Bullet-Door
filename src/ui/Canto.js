/**
 * Os botões do canto: tela cheia, som e música.
 *
 * Ficam no alto à esquerda porque o alto à direita é do placar, e ficam sempre
 * na tela — não escondidos num submenu. Desligar o som é o tipo de coisa que se
 * quer fazer no segundo em que alguém entra na sala, não depois de navegar por
 * três telas.
 *
 * Som e música são dois interruptores porque são dois incômodos diferentes:
 * quem está ouvindo a própria playlist quer só a música fora, e quem está num
 * lugar silencioso quer tudo fora. Um botão só obrigaria a escolher errado.
 */

import { t } from './i18n.js';

/** Um botão do canto, já com o desenho dentro. */
function botao(id, titulo, svg) {
  const bt = document.createElement('button');
  bt.id = id;
  bt.type = 'button';
  bt.className = 'bt-canto';
  bt.title = titulo;
  bt.setAttribute('aria-label', titulo);
  bt.innerHTML = svg;
  return bt;
}

/* Os ícones são SVG inline: nítidos em qualquer tela e sem um arquivo a mais
   para baixar. O traço cortado é o estado "desligado", que é o desenho que
   qualquer pessoa já reconhece sem legenda. */
const ICONE_SOM = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path class="corpo" d="M4 9.5h3.6L12 5.4v13.2L7.6 14.5H4z"/>
    <path class="onda o1" d="M15.4 9.4a3.7 3.7 0 0 1 0 5.2"/>
    <path class="onda o2" d="M18 6.8a7.4 7.4 0 0 1 0 10.4"/>
    <line class="corte" x1="3.5" y1="20.5" x2="20.5" y2="3.5"/>
  </svg>`;

const ICONE_MUSICA = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path class="corpo" d="M9.5 17.5V6.2l9-2v11.3"/>
    <circle class="corpo" cx="7" cy="17.6" r="2.6"/>
    <circle class="corpo" cx="16" cy="15.6" r="2.6"/>
    <line class="corte" x1="3.5" y1="20.5" x2="20.5" y2="3.5"/>
  </svg>`;

const ICONE_TELA = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path class="corpo" d="M4 9V4h5"/>
    <path class="corpo" d="M15 4h5v5"/>
    <path class="corpo" d="M20 15v5h-5"/>
    <path class="corpo" d="M9 20H4v-5"/>
  </svg>`;

/**
 * Monta a fileira de botões.
 * @param {import('../core/AudioSys.js').AudioSys} audio
 */
export function criarBotoesDeCanto(audio) {
  const barra = document.createElement('div');
  barra.id = 'canto';

  const btTela = botao('telaCheia', t('canto.telaCheia'), ICONE_TELA);
  const btSom = botao('btSom', t('canto.somDesligar'), ICONE_SOM);
  const btMusica = botao('btMusica', t('canto.musicaDesligar'), ICONE_MUSICA);
  barra.append(btTela, btSom, btMusica);
  document.body.appendChild(barra);

  // ------------------------------------------------------------- tela cheia
  const alvo = document.documentElement;
  btTela.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await alvo.requestFullscreen({ navigationUI: 'hide' });
    } catch { /* o navegador pode recusar; não é motivo para quebrar nada */ }
  });
  document.addEventListener('fullscreenchange', () => {
    const cheia = !!document.fullscreenElement;
    btTela.classList.toggle('cheia', cheia);
    btTela.title = t(cheia ? 'canto.sairTelaCheia' : 'canto.telaCheia');
    if (cheia) travarTeclado(); else destravarTeclado();
  });

  // ------------------------------------------------------------ som e música
  const pintar = () => {
    btSom.classList.toggle('mudo', !audio.somLigado);
    btMusica.classList.toggle('mudo', !audio.musicaLigada);
    btSom.title = t(audio.somLigado ? 'canto.somDesligar' : 'canto.somLigar');
    btMusica.title = t(audio.musicaLigada ? 'canto.musicaDesligar' : 'canto.musicaLigar');
    btTela.title = t(document.fullscreenElement ? 'canto.sairTelaCheia' : 'canto.telaCheia');
    btSom.setAttribute('aria-pressed', String(audio.somLigado));
    btMusica.setAttribute('aria-pressed', String(audio.musicaLigada));
  };

  btSom.addEventListener('click', () => {
    audio.alternarSom();
    // o clique de confirmação só faz sentido ao LIGAR: é a prova de que voltou
    if (audio.somLigado) { audio.init(); audio.resume(); audio.play('click'); }
  });
  btMusica.addEventListener('click', () => audio.alternarMusica());

  audio.aoMudar = pintar;
  pintar();

  return { barra, btTela, btSom, btMusica, pintar };
}

/**
 * Em tela cheia, capturar os atalhos do navegador que colidem com o jogo.
 *
 * Fora da tela cheia a página não pode fazer nada: `preventDefault` não segura
 * Ctrl+W nem Ctrl+T, o navegador reserva os dois. A Keyboard Lock API só existe
 * em tela cheia, e ali resolve — a tecla chega ao jogo em vez de fechar a aba.
 *
 * O Escape fica **de fora** da lista de propósito. Travá-lo também é possível,
 * e seria péssimo: é a única tecla que garante ao jogador sair de tela cheia e
 * recuperar o mouse. A defesa contra atalho não pode custar a saída.
 */
function travarTeclado() {
  const teclas = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyC',
                  'KeyT', 'KeyN', 'KeyR', 'KeyP'];
  try { navigator.keyboard?.lock?.(teclas)?.catch?.(() => {}); } catch { /* sem suporte */ }
}

function destravarTeclado() {
  try { navigator.keyboard?.unlock?.(); } catch { /* sem suporte */ }
}
