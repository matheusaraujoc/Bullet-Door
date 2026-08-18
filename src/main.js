import * as THREE from 'three';
import { CFG } from './core/config.js';
import { Game } from './core/Game.js';

// Atalhos de teste pela URL:  ?fast  encurta as fases,  ?seed=123  fixa o mapa.
const q = new URLSearchParams(location.search);
if (q.has('fast')) { CFG.PHASE_TIME = 8; CFG.INTRO_TIME = 1; CFG.SWAP_TIME = 1; }

const canvas = document.getElementById('scene');
const game = new Game(canvas);
if (q.has('seed')) game.seedBase = parseInt(q.get('seed'), 10) | 0;

const loading = document.getElementById('loading');
const btn = document.getElementById('btnPlay');
btn.disabled = true;
btn.textContent = 'CARREGANDO';

try {
  await game.load(p => { loading.dataset.progresso = Math.round(p * 100); });
  btn.disabled = false;
  btn.textContent = 'JOGAR';
} catch (e) {
  btn.textContent = 'ERRO AO CARREGAR';
  console.error('falha ao carregar os modelos:', e);
}
loading.classList.add('hidden');

window.game = game;
window.THREE = THREE;   // usado pelos scripts de teste em tools/
