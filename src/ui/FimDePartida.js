import { EDG } from '../core/palette.js';
import { t } from './i18n.js';
import { MenuArte } from './MenuArte.js';

/**
 * A comemoração do fim de partida.
 *
 * Antes o desfecho passava em branco: o cartão aparecia com um título e um
 * número, e pronto — ganhar e perder tinham exatamente o mesmo peso na tela.
 * Uma partida de três rodadas termina merecendo mais do que um aviso.
 *
 * O que acontece aqui, em ordem, é: a tela lava de cor, o título aterrissa com
 * um baque, o placar conta de zero até o número final, as rodadas aparecem uma
 * a uma como um extrato, e só então o botão de jogar de novo entra. A pausa
 * antes do botão é de propósito — sem ela o jogador clica por reflexo e nunca
 * vê nada disso.
 *
 * A chuva de quadradinhos só cai na vitória. Derrota não ganha festa; ganha
 * silêncio e uma tela mais fria, que é o contraste que faz a vitória valer.
 */

/** Cores da chuva: as mesmas do mundo, para a festa ser do jogo e não genérica. */
const CORES = ['amber', 'gold', 'orange', 'cyan', 'leaf', 'red', 'blush', 'sky']
  .map(nome => `#${EDG[nome].toString(16).padStart(6, '0')}`);

class Chuva {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pecas = [];
    this.rodando = false;
    this._quadro = this._quadro.bind(this);
  }

  comecar(quantas = 150) {
    const { canvas } = this;
    canvas.width = canvas.clientWidth || innerWidth;
    canvas.height = canvas.clientHeight || innerHeight;
    this.pecas = [];
    for (let i = 0; i < quantas; i++) this.pecas.push(this._nova(true));
    if (!this.rodando) { this.rodando = true; this.t0 = performance.now(); requestAnimationFrame(this._quadro); }
  }

  parar() {
    this.rodando = false;
    this.pecas = [];
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _nova(espalhada) {
    const lado = 5 + Math.random() * 11;
    return {
      x: Math.random() * this.canvas.width,
      // no primeiro punhado as peças já nascem espalhadas pela altura, senão a
      // tela fica vazia por um segundo inteiro esperando a primeira cair
      y: espalhada ? Math.random() * this.canvas.height - this.canvas.height * 0.4
                   : -lado * 2,
      lado,
      vy: 60 + Math.random() * 150,
      vx: (Math.random() - 0.5) * 70,
      giro: (Math.random() - 0.5) * 5,
      ang: Math.random() * Math.PI,
      cor: CORES[(Math.random() * CORES.length) | 0],
    };
  }

  _quadro(agora) {
    if (!this.rodando) return;
    const dt = Math.min((agora - (this.ultimo || agora)) / 1000, 0.05);
    this.ultimo = agora;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // depois de uns segundos a chuva para de repor: ela termina, não fica em laço
    const repor = agora - this.t0 < 4200;

    for (let i = 0; i < this.pecas.length; i++) {
      const p = this.pecas[i];
      p.y += p.vy * dt;
      p.x += p.vx * dt;
      p.ang += p.giro * dt;
      if (p.y > canvas.height + 30) {
        if (repor) this.pecas[i] = this._nova(false);
        else { this.pecas.splice(i, 1); i--; continue; }
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ang);
      ctx.fillStyle = p.cor;
      // achatada na horizontal conforme gira: dá volume sem custar nada
      ctx.fillRect(-p.lado / 2, -p.lado / 2, p.lado, p.lado * Math.abs(Math.cos(p.ang * 0.7)) + 2);
      ctx.restore();
    }

    if (this.pecas.length === 0) { this.rodando = false; return; }
    requestAnimationFrame(this._quadro);
  }
}

export class FimDePartida {
  constructor(audio) {
    this.audio = audio;
    this.el = document.getElementById('matchend');
    this.chuva = new Chuva(document.getElementById('meFesta'));
    /*
     * A mesma planta de mapa que corre atrás do menu.
     *
     * É o que faz esta tela pertencer ao jogo em vez de parecer uma caixa de
     * diálogo que aparece por cima dele: o fundo da vitória é o mesmo gerador
     * que acabou de montar as três rodadas. Só roda enquanto a tela está
     * visível — quadro de canvas parado custa caro à toa.
     */
    this.arte = new MenuArte(document.getElementById('meArte'));
    this.temporizadores = [];
  }

  _depois(ms, fn) { this.temporizadores.push(setTimeout(fn, ms)); }

  _limpar() {
    for (const t of this.temporizadores) clearTimeout(t);
    this.temporizadores = [];
  }

  esconder() {
    this._limpar();
    this.chuva.parar();
    this.arte.parar();
    this.el.classList.add('hidden');
  }

  /**
   * @param {'you'|'bot'|'draw'} vencedor
   * @param {number} seu     eliminações suas
   * @param {number} dele    eliminações do bot
   * @param {{seu:number,bot:number}[]} historico rodada a rodada
   * @param {{sequencia:number,recorde:number,bateuRecorde:boolean,ativa:boolean,
   *          moedasGanhas:number,xpGanho:number,nivel:number,subiuNivel:boolean}} [sequencia]
   *   a corrida e a recompensa desta partida (ver Progresso.js) — `ativa`
   *   verdadeiro quando esta vitória ainda pode continuar; falso quando a
   *   corrida já fechou (derrota, empate, ou o jogador escolheu parar).
   */
  mostrar(vencedor, seu, dele, historico, sequencia) {
    this._limpar();

    const titulo = document.getElementById('meTitle');
    const faixa = document.getElementById('meFaixa');
    const rodadas = document.getElementById('meRodadas');
    const seqEl = document.getElementById('meSequencia');
    const premioEl = document.getElementById('mePremio');
    const btn = document.getElementById('btnAgain');

    if (seqEl) {
      seqEl.classList.toggle('recorde', !!sequencia?.bateuRecorde);
      seqEl.textContent = !sequencia ? '' : sequencia.ativa
        ? t('fim.sequenciaAtual', { n: sequencia.sequencia })
        : sequencia.bateuRecorde
          ? `${t('fim.novoRecorde')} ${t('fim.sequenciaFinal', { n: sequencia.sequencia })}`
          : `${t('fim.sequenciaFinal', { n: sequencia.sequencia })} · ${t('fim.melhorSequencia', { n: sequencia.recorde })}`;
    }

    if (premioEl) {
      premioEl.classList.toggle('subiu-nivel', !!sequencia?.subiuNivel);
      premioEl.textContent = !sequencia ? '' : sequencia.subiuNivel
        ? `${t('fim.premio', { moedas: sequencia.moedasGanhas, xp: sequencia.xpGanho })} · ${t('fim.subiuNivel', { n: sequencia.nivel })}`
        : t('fim.premio', { moedas: sequencia.moedasGanhas, xp: sequencia.xpGanho });
    }

    this.el.className = vencedor === 'you' ? 'ganhou' : vencedor === 'bot' ? 'perdeu' : 'empatou';
    titulo.textContent = t(vencedor === 'you' ? 'fim.vitoria'
      : vencedor === 'bot' ? 'fim.derrota' : 'fim.empate');
    faixa.textContent = t(vencedor === 'you' ? 'fim.faixaVitoria'
      : vencedor === 'bot' ? 'fim.faixaDerrota' : 'fim.faixaEmpate');

    // o extrato começa vazio e cada rodada entra na sua vez
    rodadas.innerHTML = '';
    historico.forEach((r, i) => {
      const chip = document.createElement('span');
      chip.className = 'me-rodada' +
        (r.seu > r.bot ? ' sua' : r.bot > r.seu ? ' dele' : ' igual');
      chip.innerHTML = `<b>${t('fim.rodada', { n: i + 1 })}</b><i>${r.seu}–${r.bot}</i>`;
      rodadas.appendChild(chip);
    });

    btn.classList.add('esperando');
    this.el.classList.remove('hidden');
    this.arte.iniciar();
    // reinicia as animações do cartão, senão a segunda partida entra sem baque
    void this.el.offsetWidth;
    this.el.classList.add('entrando');

    this.audio.play(vencedor === 'you' ? 'vitoria' : vencedor === 'bot' ? 'derrota' : 'lose');
    if (vencedor === 'you') this._depois(260, () => this.chuva.comecar());

    this._contar('meVoce', seu, 620);
    this._contar('meBot', dele, 620);

    // as pastilhas entram uma a uma, e o botão só depois de tudo assentar
    historico.forEach((_, i) => this._depois(760 + i * 170, () => {
      rodadas.children[i]?.classList.add('entrou');
      this.audio.play('click', { vol: 0.5 });
    }));
    this._depois(900 + historico.length * 170, () => btn.classList.remove('esperando'));
  }

  /** Conta de zero até o valor, para o número ser visto subindo. */
  _contar(id, alvo, ms) {
    const el = document.getElementById(id);
    el.textContent = '0';
    if (alvo <= 0) return;
    const passo = ms / alvo;
    for (let n = 1; n <= alvo; n++) {
      this._depois(passo * n, () => {
        el.textContent = String(n);
        el.classList.remove('bateu');
        void el.offsetWidth;
        el.classList.add('bateu');
        this.audio.play('tick', { vol: 0.6 });
      });
    }
  }
}
