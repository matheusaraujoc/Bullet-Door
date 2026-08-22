import './intro.css';
import { t } from './i18n.js';
import { asset } from '../core/assets-url.js';

const LOGO = asset('images/Kountera_Games_Logo.png');
const SOM_MARCA = asset('audios/kountera_games.mp3');
const SOM_METAL = asset('audios/metalico.mp3');

const espera = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => Math.random() * (b - a) + a;

/** Carrega um áudio e devolve o elemento pronto (ou null se faltar o arquivo). */
function carregarAudio(url) {
  return new Promise(resolve => {
    const a = new Audio();
    a.preload = 'auto';
    a.src = url;
    const pronto = () => resolve(a);
    a.addEventListener('canplaythrough', pronto, { once: true });
    a.addEventListener('error', () => resolve(null), { once: true });
    setTimeout(() => resolve(a), 4000);        // não trava a abertura por causa de som
  });
}

/** A imagem do logo existe? Se não, a marca sai em tipografia. */
function temLogo() {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = LOGO;
  });
}

/**
 * Troca a marca por um canvas com o logo desenhado, e devolve a função que
 * passa a lâmina de luz por cima dele.
 *
 * A faixa é um gradiente diagonal que atravessa a peça em pouco mais de um
 * segundo. `source-atop` é a peça-chave: ela recorta a faixa na silhueta do
 * logo sem máscara nenhuma, porque só pinta onde já existe pixel opaco.
 */
async function prepararMarca(marca) {
  const img = await new Promise(ok => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    i.src = LOGO;
  });
  if (!img) return null;

  const cv = document.createElement('canvas');
  cv.className = 'logo';
  // um teto de resolução: o arquivo é grande e a marca aparece com 460px
  const escala = Math.min(1, 1024 / img.naturalWidth);
  cv.width = Math.round(img.naturalWidth * escala);
  cv.height = Math.round(img.naturalHeight * escala);
  const ctx = cv.getContext('2d');
  const desenharLogo = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
  };
  desenharLogo();
  marca.replaceChildren(cv);

  return function passarLamina(duracao = 1250) {
    const t0 = performance.now();
    const larguraFaixa = cv.width * 0.42;
    const passo = agora => {
      const k = Math.min(1, (agora - t0) / duracao);
      desenharLogo();
      if (k < 1) {
        // a faixa entra pela direita e sai pela esquerda, inclinada
        const centro = cv.width * 1.3 - k * (cv.width * 2.6);
        const g = ctx.createLinearGradient(
          centro - larguraFaixa, cv.height, centro + larguraFaixa, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.42, 'rgba(255,240,214,.55)');
        g.addColorStop(0.5, 'rgba(255,255,255,.95)');
        g.addColorStop(0.58, 'rgba(255,240,214,.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        // só pinta onde o logo tem pixel: a silhueta faz o papel da máscara
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.globalCompositeOperation = 'source-over';
        requestAnimationFrame(passo);
      }
    };
    requestAnimationFrame(passo);
  };
}

/**
 * Abertura do estúdio.
 *
 * Roda uma vez e sai — o arquivo original ficava em laço infinito, o que fazia
 * sentido para uma página de vitrine, não para a porta de entrada de um jogo.
 *
 * O primeiro clique não é enfeite: navegador nenhum toca áudio antes de uma
 * interação, e a abertura inteira depende de dois sons entrando na hora certa.
 *
 * @returns {Promise<void>} resolve quando a tela estiver livre para o menu
 */
export async function tocarIntro({ pulavel = true, carga = null } = {}) {
  const noToque = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const el = document.createElement('div');
  el.id = 'intro';
  el.innerHTML = `
    <div class="grid-bg"></div>
    <div class="vinheta"></div>
    <div class="shard-field"></div>
    <div class="flash"></div>
    <div class="logo-stage">
      <div class="marca"></div>
      <div class="sweep"></div>
    </div>
    <div class="pular"></div>
    <div class="comecar">
      <b>${noToque ? t('intro.comecarToque') : t('intro.comecarClique')}</b>
      <span class="sub">${t('intro.usaSom')}</span>
      <div class="carregando"><i></i></div>
    </div>`;
  document.body.appendChild(el);

  const campo = el.querySelector('.shard-field');
  const flash = el.querySelector('.flash');
  const palco = el.querySelector('.logo-stage');
  const marca = el.querySelector('.marca');
  const sweep = el.querySelector('.sweep');
  const comecar = el.querySelector('.comecar');
  const pular = el.querySelector('.pular');

  // Logo e sons carregam POR BAIXO do convite, não antes dele. Esperar aqui
  // deixava a tela parada por segundos numa rede de celular, e o jogador via
  // um preto sem explicação — parecia que o jogo não tinha aberto.
  const prontos = Promise.all([
    temLogo(), carregarAudio(SOM_MARCA), carregarAudio(SOM_METAL),
  ]);

  const barra = comecar.querySelector('.carregando i');
  const sub = comecar.querySelector('.sub');
  const acompanhar = setInterval(() => {
    if (!carga) return;
    const pct = Math.round((carga.progresso || 0) * 100);
    barra.style.transform = `scaleX(${(carga.progresso || 0).toFixed(3)})`;
    sub.textContent = carga.pronto ? t('intro.usaSom') : t('intro.carregando', { pct });
  }, 120);

  // ---- espera o primeiro toque, que é o que libera o áudio ----
  await new Promise(resolve => {
    const ir = ev => {
      // Sem isto, o mesmo gesto sobe até #intro e aciona o "pular" logo
      // abaixo: a continuação do await roda no microtask, ou seja, ANTES do
      // evento terminar de borbulhar, e a abertura pulava inteira sozinha.
      ev?.stopPropagation();
      ev?.preventDefault();
      comecar.classList.add('indo');       // resposta imediata ao dedo
      clearInterval(acompanhar);
      removeEventListener('keydown', ir);
      setTimeout(() => comecar.remove(), 120);
      resolve();
    };
    // pointerdown responde na hora; click no celular ainda espera o gesto
    comecar.addEventListener('pointerdown', ir, { once: true });
    comecar.addEventListener('click', ir, { once: true });
    addEventListener('keydown', ir, { once: true });
  });

  // agora sim: usa o que já chegou, e o resto entra em cima da hora
  const [comLogo, somMarca, somMetal] = await prontos;

  /*
   * A lâmina de luz é DESENHADA, não composta pelo navegador.
   *
   * A versão anterior era CSS puro: uma faixa em gradiente com
   * `mix-blend-mode: screen` e `mask-image` apontando para o arquivo do logo.
   * Funciona na bancada e falhava no ar. Os dois recursos dependem de
   * composição de camadas, e ali havia tudo para dar errado ao mesmo tempo: a
   * marca tem `filter` animado (que promove a camada), o brilho tem mistura
   * (que exige recompor com o fundo) e a máscara é um segundo pedido de rede
   * que precisa ter chegado antes da animação começar. Qualquer um dos três
   * falhando em silêncio deixa a faixa invisível, e nada disso aparece como
   * erro — só como um efeito que não acontece.
   *
   * Num canvas não há camada, mistura nem segundo pedido: desenha-se o logo e
   * depois a faixa em `source-atop`, que por definição só pinta onde o logo
   * tem pixel. É o mesmo desenho, sem depender de nada que possa não estar
   * pronto. E como a imagem já foi baixada para o teste de existência, ela
   * entra aqui de memória.
   */
  const brilharNaMarca = comLogo ? await prepararMarca(marca) : null;
  if (!comLogo) {
    marca.innerHTML = `<div class="logo-texto">KOUNTERA<small>GAMES</small></div>`;
  }

  /*
   * Pular a abertura precisa ser um gesto DELIBERADO.
   *
   * Era um clique em qualquer lugar da tela, armado 60 ms depois de começar — e
   * isso matava a abertura antes da parte que ela existe para mostrar. Quem
   * entra por um portal clica na moldura para dar foco, clica de novo porque
   * nada pareceu acontecer, e o segundo clique caía aqui: o brilho metálico da
   * marca só acontece por volta de um segundo e meio, e nunca chegava a
   * aparecer. Foi assim que o efeito "não funcionava no itch.io" — ele
   * funcionava, e era descartado antes de rodar.
   *
   * Agora só pula quem mira no aviso de pular ou aperta uma tecla. Clique solto
   * na tela não faz mais nada, que é o comportamento certo para uma coisa que
   * dura quatro segundos e roda uma vez por sessão.
   */
  let saiuCedo = false;
  const sair = ev => { ev?.stopPropagation(); saiuCedo = true; };
  const armarPular = () => {
    if (!pulavel) return;
    pular.textContent = noToque ? t('intro.pularToque') : t('intro.pularClique');
    pular.classList.add('armado');
    pular.addEventListener('click', sair);
    pular.addEventListener('pointerdown', sair);
    addEventListener('keydown', sair);
  };

  const tocar = som => {
    if (!som) return;
    try { som.currentTime = 0; som.volume = 0.85; som.play().catch(() => {}); } catch { /* sem som */ }
  };
  const calar = som => { try { som?.pause(); } catch { /* ok */ } };

  // ---- detonação ----
  if (!reduzir) {
    const n = innerWidth < 560 ? 10 : 16;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'shard';
      const ang = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
      const dist = rand(240, 620);
      s.style.setProperty('--sx', `${Math.cos(ang) * dist}px`);
      s.style.setProperty('--sy', `${Math.sin(ang) * dist}px`);
      s.style.setProperty('--srot', `${rand(-120, 120)}deg`);
      s.style.setProperty('--w', `${rand(50, 130)}px`);
      s.style.setProperty('--h', `${rand(8, 22)}px`);
      s.style.setProperty('--dur', `${rand(0.6, 1.0)}s`);
      s.style.setProperty('--delay', `${rand(0, 0.08)}s`);
      s.style.setProperty('--peak', `${rand(0.7, 1)}`);
      campo.appendChild(s);
    }
    flash.classList.add('pulse');
  }
  await espera(reduzir ? 120 : 220);
  if (saiuCedo) return encerrar(el, [somMarca, somMetal], calar);

  // ---- a marca aparece: primeiro som ----
  palco.classList.add('show');
  armarPular();
  tocar(somMarca);
  setTimeout(() => { campo.innerHTML = ''; }, 900);

  await espera(reduzir ? 400 : 1150);
  if (saiuCedo) return encerrar(el, [somMarca, somMetal], calar);

  // ---- o brilho metálico atravessa a marca: segundo som ----
  // com imagem, a lâmina é desenhada no canvas; sem ela, a marca é tipografia
  // e aí o brilho em CSS por cima do texto ainda serve
  if (brilharNaMarca) brilharNaMarca(); else sweep.classList.add('brilhar');
  tocar(somMetal);

  // segura o tempo do som principal, com teto para não arrastar
  const restante = somMarca && isFinite(somMarca.duration)
    ? Math.max(0, (somMarca.duration - 1.4) * 1000)
    : 1800;
  await espera(Math.min(reduzir ? 600 : 2600, restante + 700));
  if (saiuCedo) return encerrar(el, [somMarca, somMetal], calar);

  // ---- sai de cena ----
  palco.classList.remove('show');
  palco.classList.add('exiting');
  await espera(reduzir ? 250 : 560);
  return encerrar(el, [somMarca, somMetal], calar);
}

function encerrar(el, sons, calar) {
  el.classList.add('saindo');
  setTimeout(() => {
    for (const s of sons) calar(s);
    el.remove();
  }, 620);
}
