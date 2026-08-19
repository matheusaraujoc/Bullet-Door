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
      <span class="sub">O JOGO USA SOM</span>
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
  if (comLogo) {
    marca.innerHTML = `<img class="logo" src="${LOGO}" alt="Kountera Games">`;
    sweep.classList.add('mascara');
    sweep.style.setProperty('--logo-mask', `url('${LOGO}')`);
  } else {
    marca.innerHTML = `<div class="logo-texto">KOUNTERA<small>GAMES</small></div>`;
  }

  let saiuCedo = false;
  const sair = () => { saiuCedo = true; };
  if (pulavel) {
    pular.textContent = noToque ? t('intro.pularToque') : t('intro.pularClique');
    // cinto e suspensório: só arma o atalho no quadro seguinte
    setTimeout(() => {
      el.addEventListener('click', sair);
      addEventListener('keydown', sair);
    }, 60);
  }

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
  tocar(somMarca);
  setTimeout(() => { campo.innerHTML = ''; }, 900);

  await espera(reduzir ? 400 : 1150);
  if (saiuCedo) return encerrar(el, [somMarca, somMetal], calar);

  // ---- o brilho metálico atravessa a marca: segundo som ----
  sweep.classList.add('brilhar');
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
