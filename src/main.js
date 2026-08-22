import * as THREE from 'three';
import { CFG } from './core/config.js';
import { Game } from './core/Game.js';
import { tocarIntro } from './ui/Intro.js';
import { MenuArte } from './ui/MenuArte.js';
import { t, aplicarNoDocumento } from './ui/i18n.js';
import { init as pokiInit, gameLoadingFinished as pokiCarregou, evitarRolagemDaPagina } from './core/Poki.js';

// Atalhos de teste pela URL:
//   ?fast      encurta as fases e pula a abertura
//   ?semintro  só pula a abertura
//   ?seed=123  fixa o mapa
const q = new URLSearchParams(location.search);
if (q.has('fast')) { CFG.PHASE_TIME = 8; CFG.INTRO_TIME = 1; CFG.SWAP_TIME = 1; }

evitarRolagemDaPagina();
/*
 * "Initialize the SDK at the start of your game" — chamado já na primeira
 * linha possível, mas SEM esperar a resposta aqui: `init()` só resolve de
 * verdade depois de um aperto de mão com quem embutiu o jogo, e o Inspector
 * simula login e gamesave por cima disso, o que pode levar mais que os
 * poucos segundos que os modelos já levam para carregar. Travar o boot
 * inteiro atrás dessa resposta (como era antes) arriscava chamar
 * `gameLoadingFinished()` cedo demais em qualquer host mais lento — e o
 * Inspector rejeita exatamente essa chamada se ela não veio depois do init
 * de verdade. `pokiPronto` é aguardado só ali embaixo, na hora de avisar que
 * o carregamento terminou, sem atrasar mais nada além disso.
 */
const pokiPronto = pokiInit();

const canvas = document.getElementById('scene');
const game = new Game(canvas);
if (q.has('seed')) game.seedBase = parseInt(q.get('seed'), 10) | 0;

const loading = document.getElementById('loading');
const menu = document.getElementById('menu');
const btn = document.getElementById('btnPlay');

// o menu só entra em cena quando a abertura sai
menu.classList.add('hidden');
loading.classList.add('hidden');

// os modelos carregam enquanto a abertura roda: quando ela termina, na maioria
// das vezes já está tudo pronto e o botão nasce habilitado
// o documento inteiro no idioma escolhido antes de qualquer coisa aparecer
aplicarNoDocumento();

btn.disabled = true;
btn.textContent = t('menu.carregando');

// a abertura mostra este progresso enquanto espera o primeiro toque, para o
// jogador saber que a espera tem fim
const carga = { progresso: 0, pronto: false };
const carregando = game.load(p => { carga.progresso = p; }).then(
  () => {
    carga.pronto = true; carga.progresso = 1; btn.disabled = false; btn.textContent = t('menu.jogar');
  },
  e => {
    carga.pronto = true; btn.textContent = t('menu.erro'); console.error('falha ao carregar os modelos:', e);
  });
// só avisa o Poki depois das DUAS coisas: os modelos (carregando, com erro ou
// sem) e o aperto de mão do SDK (pokiPronto). `.finally` não muda o valor nem
// o instante em que `carregando` resolve — quem espera por ela (mais abaixo)
// não fica preso à resposta do Poki.
carregando.finally(() => pokiPronto.then(pokiCarregou));

if (!q.has('fast') && !q.has('semintro')) await tocarIntro({ carga });
menu.classList.remove('hidden');
// a abertura já custou um toque do jogador, então o navegador deixa tocar
game.audio.tocarMusica('audios/menu.mp3');

// a planta de fundo do menu: um mapa real, gerado na hora
const arte = new MenuArte(document.getElementById('menuArte'));
arte.iniciar();
await carregando;

window.game = game;
window.THREE = THREE;   // usado pelos scripts de teste em tools/
