/**
 * A ponte com o Poki SDK.
 *
 * Todo método aqui é seguro de chamar mesmo quando `PokiSDK` não existe — que é
 * o caso normal em desenvolvimento, no build do itch.io, ou em qualquer host
 * que não seja o Poki: o script vem de um CDN externo (`game-cdn.poki.com`) e
 * só está presente quando o jogo roda dentro do portal deles ou do Inspector.
 * Sem essa proteção, cada chamada quebraria o jogo fora do Poki.
 *
 * `emJogo` existe para não disparar `gameplayStart`/`gameplayStop` fora de uma
 * transição de verdade — apertar ESC duas vezes seguidas, por exemplo, não
 * pode mandar dois `gameplayStop` para o SDK.
 */
const sdk = () => (typeof window !== 'undefined' ? window.PokiSDK : null);

let emJogo = false;

/**
 * Nunca deixa uma promessa do SDK travar o jogo além de um tempo razoável.
 *
 * Descoberta testando este pacote antes de publicar: `PokiSDK.init()` resolve
 * na hora quando o jogo é a página do topo do navegador, mas TRAVA PARA SEMPRE
 * quando roda dentro de um iframe qualquer que não seja a página de verdade do
 * Poki — o SDK provavelmente espera um aperto de mão com quem o embutiu, que
 * nunca chega fora do lugar certo. E isso inclui o itch.io, que também entrega
 * jogos dentro de um iframe. Sem este limite, o boot inteiro travaria atrás de
 * um SDK que nunca ia responder, em qualquer host que não fosse o Poki mesmo.
 *
 * `alvo` pode rejeitar, travar, ou até lançar antes de virar promessa — as três
 * coisas viram "sem resposta a tempo, seguimos sem ela".
 */
function comLimite(criarPromessa, ms) {
  return new Promise(resolve => {
    let decidido = false;
    const decidir = v => { if (!decidido) { decidido = true; resolve(v); } };
    try { Promise.resolve(criarPromessa()).then(decidir, decidir); } catch { decidir(undefined); }
    setTimeout(() => decidir(undefined), ms);
  });
}

/** Chama primeiro que tudo. Continua para o jogo em qualquer desfecho. */
export function init() {
  const s = sdk();
  if (!s) return Promise.resolve();
  return comLimite(() => s.init(), 4000);
}

/** Sinaliza que o carregamento acabou: é o que faz o loading do Poki sumir. */
export function gameLoadingFinished() {
  try { sdk()?.gameLoadingFinished(); } catch { /* sem sdk de verdade por perto */ }
}

export function gameplayStart() {
  if (emJogo) return;
  emJogo = true;
  try { sdk()?.gameplayStart(); } catch { /* idem */ }
}

export function gameplayStop() {
  if (!emJogo) return;
  emJogo = false;
  try { sdk()?.gameplayStop(); } catch { /* idem */ }
}

/**
 * Um intervalo comercial, com a casa em ordem antes e depois de propósito.
 *
 * A documentação pede três coisas ao redor de todo `commercialBreak`: parar o
 * jogo, calar o áudio e travar a entrada — e refazer tudo isso na volta, porque
 * "a função de pausar o áudio pode não ser chamada sempre" (nem todo break
 * mostra anúncio de verdade; o timer do Poki decide). Fica tudo dentro desta
 * função para as três chamadas de gameplay (jogar, continuar, jogar de novo)
 * não repetirem a mesma sequência cada uma à sua moda.
 *
 * O limite de tempo aqui é bem mais generoso que o do `init()` — um anúncio de
 * vídeo de verdade pode legitimamente demorar alguns segundos para carregar, e
 * cortar cedo demais derrubaria anúncios que estavam prestes a aparecer. Ele
 * existe só como rede de segurança para quando algo trava de verdade, não como
 * limite normal de espera.
 *
 * @param {import('./Game.js').Game} game
 * @param {() => void} continuar o que fazer depois do intervalo (retomar a
 *   partida, começar uma nova rodada, etc.) — roda sempre, com anúncio ou sem.
 */
export async function comIntervaloComercial(game, continuar) {
  const s = sdk();
  if (!s) { continuar(); gameplayStart(); return; }

  gameplayStop();
  game.travarParaAnuncio(true);

  await comLimite(() => new Promise(resolve => {
    s.commercialBreak(() => {
      // onStart: o anúncio de fato começou a tocar
    }).then(resolve, resolve);   // uma falha aqui não pode travar o jogo
  }), 15000);

  game.travarParaAnuncio(false);
  continuar();
  gameplayStart();
}

/**
 * O aparelho do jogador, segundo o próprio Poki.
 * @returns {{category: 'mobile'|'tablet'|'desktop'}|null}
 */
export function getDeviceInfo() {
  try { return sdk()?.getDeviceInfo() ?? null; } catch { return null; }
}

/**
 * Impede que espaço e as setas rolem a página por baixo do jogo.
 *
 * Em desenvolvimento o jogo ocupa a janela inteira e isso nunca aparece; no
 * Poki o jogo fica dentro de uma página mais alta que pode rolar, e aí a tecla
 * que devia mover o personagem move a página. `Input.js` já bloqueia teclado
 * para as teclas do próprio jogo; isto aqui é a rede de segurança que a
 * documentação do Poki pede, cobrindo também a roda do mouse.
 */
export function evitarRolagemDaPagina() {
  addEventListener('keydown', ev => {
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', ' '].includes(ev.key)) ev.preventDefault();
  });
  addEventListener('wheel', ev => ev.preventDefault(), { passive: false });
}
