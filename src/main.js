import * as THREE from 'three';
import { CFG } from './core/config.js';
import { Game } from './core/Game.js';
import { tocarIntro } from './ui/Intro.js';
import { MenuArte } from './ui/MenuArte.js';

// Atalhos de teste pela URL:
//   ?fast      encurta as fases e pula a abertura
//   ?semintro  só pula a abertura
//   ?seed=123  fixa o mapa
const q = new URLSearchParams(location.search);
if (q.has('fast')) { CFG.PHASE_TIME = 8; CFG.INTRO_TIME = 1; CFG.SWAP_TIME = 1; }

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
btn.disabled = true;
btn.textContent = 'CARREGANDO';
const carregando = game.load().then(
  () => { btn.disabled = false; btn.textContent = 'JOGAR'; },
  e => { btn.textContent = 'ERRO AO CARREGAR'; console.error('falha ao carregar os modelos:', e); });

if (!q.has('fast') && !q.has('semintro')) await tocarIntro();
menu.classList.remove('hidden');

// a planta de fundo do menu: um mapa real, gerado na hora
const arte = new MenuArte(document.getElementById('menuArte'));
arte.iniciar();
await carregando;

window.game = game;
window.THREE = THREE;   // usado pelos scripts de teste em tools/
