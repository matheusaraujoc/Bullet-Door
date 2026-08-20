import { asset } from './assets-url.js';
import { TIRO_MP3 } from './tiro-embutido.js';

/** Onde a preferência de cada trilha fica guardada entre sessões. */
const CHAVE_SOM = 'bulletdoor.som';
const CHAVE_MUSICA = 'bulletdoor.musica';

const lerPreferencia = (chave, padrao) => {
  try {
    const v = localStorage.getItem(chave);
    return v === null ? padrao : v === '1';
  } catch { return padrao; }        // navegação privada pode barrar o storage
};
const gravarPreferencia = (chave, v) => {
  try { localStorage.setItem(chave, v ? '1' : '0'); } catch { /* sem storage */ }
};

/**
 * Som do jogo.
 *
 * Os efeitos são todos sintetizados na hora — nenhum arquivo para baixar. Isso
 * é o que faz o tiro soar igual em qualquer aparelho: não há som do sistema
 * envolvido, e o navegador não escolhe nada. A única coisa que muda de um
 * aparelho para outro é o alto-falante.
 *
 * **Sintetizado não quer dizer oito bits.** O ar de brinquedo vinha de um
 * conjunto de escolhas, não da técnica: onda quadrada e dente de serra cruas,
 * ataque instantâneo em tudo, afinação exata demais, e nenhum espaço em volta.
 * Aqui não há mais oscilador cru — só senoide e triângulo passando por filtro
 * que fecha, ruído moldado, e sinos com parciais desafinados de propósito. Todo
 * som do mundo manda uma parte de si para uma reverberação curta, então eles
 * acontecem no mesmo lugar em vez de colados na cara de quem joga.
 *
 * Posicionamento é feito à mão (pan + atenuação) — mais barato que PannerNode e
 * suficiente para o que o jogo precisa: "veio da esquerda, longe".
 *
 * A música é a exceção: é arquivo, e por isso toca por um `<audio>` que
 * transmite aos poucos em vez de decodificar meio mega na memória. As duas
 * trilhas se desligam separadamente, porque são incômodos diferentes — quem
 * está ouvindo outra coisa quer só a música fora, e quem está num lugar
 * silencioso quer tudo fora.
 */
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.somLigado = lerPreferencia(CHAVE_SOM, true);
    this.musicaLigada = lerPreferencia(CHAVE_MUSICA, true);
    this.musica = null;
    this.musicaUrl = null;
    this.aoMudar = null;          // avisa a interface para redesenhar os botões
    this.amostras = new Map();    // sons que vêm de arquivo, já decodificados
  }

  /**
   * Decodifica os sons que vêm gravados.
   *
   * O tiro vem embutido no próprio código, em base64, e não por pedido de rede.
   * É o som mais importante do jogo e o que mais toca; um pedido de rede o
   * deixa à mercê de qualquer coisa entre o navegador e o arquivo — extensão,
   * antivírus, portal servindo mídia de outro domínio. Neste computador dá para
   * ver o efeito: o mesmo arquivo chega inteiro servido como ".dat" e volta
   * vazio servido como ".mp3".
   *
   * Falhando mesmo assim, não faz mal: a versão sintetizada continua no lugar
   * e o jogo não fica sem tiro.
   */
  async carregarGravados() {
    this.init();
    if (!this.ctx || this.amostras.has('shot')) return;
    try {
      // do texto direto para bytes, sem passar por fetch nem por rede
      const bruto = atob(TIRO_MP3.slice(TIRO_MP3.indexOf(',') + 1));
      const bytes = new Uint8Array(bruto.length);
      for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
      this.amostras.set('shot', await this.ctx.decodeAudioData(bytes.buffer));
    } catch (e) {
      console.warn('o tiro gravado não decodificou, seguindo com o sintetizado:', e.message ?? e);
    }
  }

  /** Toca uma amostra já carregada. Devolve false se ela não estiver pronta. */
  _tocarAmostra(nome, ganho, pan) {
    const buf = this.amostras.get(nome);
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    // uma variação pequena de altura para dois tiros seguidos não saírem iguais
    src.playbackRate.value = 0.96 + Math.random() * 0.08;
    src.connect(this._chain(ganho, pan));
    src.start(this.ctx.currentTime);
    return true;
  }

  // ------------------------------------------------------------ liga/desliga
  ligarSom(v) {
    this.somLigado = !!v;
    gravarPreferencia(CHAVE_SOM, this.somLigado);
    this.aoMudar?.();
  }

  ligarMusica(v) {
    this.musicaLigada = !!v;
    gravarPreferencia(CHAVE_MUSICA, this.musicaLigada);
    if (this.musicaLigada) this._retomarMusica(); else this._pausarMusica();
    this.aoMudar?.();
  }

  alternarSom() { this.ligarSom(!this.somLigado); }
  alternarMusica() { this.ligarMusica(!this.musicaLigada); }

  // ---------------------------------------------------------------- música
  /**
   * Começa (ou troca) a música de fundo.
   *
   * O `<audio>` é criado na primeira chamada e reaproveitado: recriar o
   * elemento a cada ida ao menu recomeçaria o download toda vez.
   */
  tocarMusica(arquivo) {
    const url = asset(arquivo);
    if (!this.musica) {
      const el = document.createElement('audio');
      el.loop = true;
      // 'none' até ter uma fonte: o menu aparece primeiro e a música chega
      // depois. Assim que ela existe, passa a 'auto' — com 'none' o navegador
      // descarta o que já baixou a cada pausa, e o jogo pedia o arquivo de novo
      // toda vez que voltava ao menu.
      el.preload = 'none';
      el.volume = 0;
      this.musica = el;
    }
    if (this.musicaUrl !== url) {
      this.musica.src = url;
      this.musica.preload = 'auto';
      this.musicaUrl = url;
    }
    if (this.musicaLigada) this._retomarMusica();
  }

  pararMusica() {
    if (!this.musica) return;
    // pausa sem rebobinar: voltar ao começo faz o navegador jogar fora o que
    // baixou, e a próxima ida ao menu vira um download novo
    this._esmaecer(0, 0.5, () => this.musica.pause());
  }

  _retomarMusica() {
    if (!this.musica || !this.musicaUrl) return;
    if (!this.musica.paused) { this._esmaecer(this.volumeMusica, 1.2); return; }
    // pode ser recusado até o primeiro toque na página; não é erro que valha ruído
    this.musica.play().then(() => this._esmaecer(this.volumeMusica, 1.2), () => {});
  }

  _pausarMusica() {
    if (!this.musica) return;
    this._esmaecer(0, 0.35, () => this.musica.pause());
  }

  get volumeMusica() { return 0.42; }

  /** Sobe ou desce o volume aos poucos: corte seco em música soa como falha. */
  _esmaecer(alvo, segundos, aoFim) {
    const el = this.musica;
    if (!el) return;
    clearInterval(this._fade);
    const passo = 1 / 30;
    const delta = (alvo - el.volume) / Math.max(1, segundos / passo);
    this._fade = setInterval(() => {
      const v = el.volume + delta;
      const chegou = delta >= 0 ? v >= alvo : v <= alvo;
      el.volume = Math.max(0, Math.min(1, chegou ? alvo : v));
      if (chegou) { clearInterval(this._fade); aoFim?.(); }
    }, passo * 1000);
  }

  // ------------------------------------------------------------------ saída
  /**
   * Monta a cadeia de saída.
   *
   *     fonte → brilho → colador → volume → alto-falante
   *
   * O BRILHO devolve o agudo que os passa-baixa das camadas comem pelo caminho.
   *
   * O COLADOR é uma tangente hiperbólica quase reta: rede de segurança para
   * quando várias camadas somam no mesmo instante, e não um saturador. Fica por
   * último de propósito — realce depois do limitador é realce que o limitador
   * não viu.
   */
  init(contexto = null) {
    if (this.ctx) return;
    // o contexto entra por fora nos testes, que renderizam fora do tempo real
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!contexto && !AC) { this.enabled = false; return; }
    this.ctx = contexto || new AC();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.34;
    this.master.connect(ctx.destination);

    const colador = ctx.createWaveShaper();
    const n = 1024, curva = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const x = (k / (n - 1)) * 2 - 1;
      // 1.1 é quase reta: o colador vira rede de segurança contra o estouro
      // de quatro camadas somadas, e não um saturador. Em 1.7 ele comprimia o
      // transiente de todo som e devolvia harmônico grave no lugar — que é
      // exatamente a receita de "alto e abafado".
      curva[k] = Math.tanh(x * 1.1) / Math.tanh(1.1);
    }
    colador.curve = curva;
    colador.oversample = '2x';
    colador.connect(this.master);

    /*
     * Realce de brilho, ANTES do limitador.
     *
     * Quase toda camada deste arquivo passa por um passa-baixa — é o que dá
     * corpo e tira a aspereza de ruído puro. Somadas, porém, essas dezenas de
     * quedas de agudo deixaram o jogo inteiro soando com um cobertor por cima.
     * Consertar filtro por filtro seria caçar o mesmo erro em vinte lugares;
     * uma prateleira de agudos resolve de uma vez.
     *
     * A ordem importa: realce DEPOIS do limitador é realce que o limitador não
     * viu, e volta a empurrar o pico para cima justamente nos sons mais densos.
     * Quem fala por último tem que ser o limitador.
     */
    const brilho = ctx.createBiquadFilter();
    brilho.type = 'highshelf';
    brilho.frequency.value = 2600;
    brilho.gain.value = 6;
    brilho.connect(colador);
    this.saida = brilho;

    // buffer de ruído reaproveitado por todos os sons
    const amostras = ctx.sampleRate * 0.6;
    this.noise = ctx.createBuffer(1, amostras, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let k = 0; k < amostras; k++) d[k] = Math.random() * 2 - 1;
  }

  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  /**
   * Um destino para uma camada de som: volume e posição.
   *
   * Houve aqui uma reverberação, para os sons "acontecerem no mesmo lugar".
   * Saiu. A resposta ao impulso era feita de reflexões discretas, e reflexão
   * discreta é filtro pente: o que ela devolve tem um zumbido afinado por cima,
   * e a coisa toda passou a soar como eco metálico dentro de um tambor. Numa
   * sala de verdade as reflexões chegam aos milhares e se dissolvem; simular
   * meia dúzia soa pior do que não simular nenhuma.
   *
   * @param {number} ganho
   * @param {number} [pan] -1 esquerda, +1 direita
   */
  _chain(ganho, pan) {
    const g = this.ctx.createGain();
    g.gain.value = ganho;
    let ponta = g;
    if (pan !== undefined && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      ponta = p;
    }
    ponta.connect(this.saida);
    return g;
  }

  // --------------------------------------------------------------- tijolos
  /**
   * Ruído filtrado com envelope moldável.
   *
   * O parâmetro que mais importa é `ataque`: com zero o som começa de estalo;
   * com poucos milissegundos, começa de sopro. Envelope de ataque zero em TUDO
   * é a assinatura sonora do chip de oito bits, e era o que este jogo tinha.
   */
  _ruido(dest, { dur, freq, q = 1, tipo = 'bandpass', pico = 1, ataque = 0.001,
                 curva = 1, varreduraAte = null, taxa = null }) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = taxa ?? (0.85 + Math.random() * 0.4);
    src.loop = true;

    const f = ctx.createBiquadFilter();
    f.type = tipo;
    f.frequency.setValueAtTime(freq, t);
    if (varreduraAte) f.frequency.exponentialRampToValueAtTime(varreduraAte, t + dur);
    f.Q.value = q;

    const env = ctx.createGain();
    const sobe = Math.max(0.0006, ataque);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(pico, t + sobe);
    env.gain.setTargetAtTime(0.0001, t + sobe, dur / (3.2 * curva));

    src.connect(f); f.connect(env); env.connect(dest);
    src.start(t); src.stop(t + dur + 0.1);
    return env;
  }

  /**
   * O rajo de ruído original, preservado como estava.
   *
   * Ataque instantâneo e queda por rampa exponencial até um ponto fixo. É o
   * envelope que dá o "tec" seco da pisada, e a razão de ele continuar aqui em
   * vez de virar um caso de `_ruido` é que já tentei unificar os dois e o
   * caráter do passo se perdeu. Duas funções parecidas custam menos que um som
   * pior.
   */
  _pisada(dest, dur, freq, q, pico = 1, tipo = 'bandpass') {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = tipo; f.frequency.value = freq; f.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(pico, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(env); env.connect(dest);
    src.start(t); src.stop(t + dur + 0.02);
    return env;
  }

  /**
   * Uma nota com corpo, não um bipe.
   *
   * Três coisas separam esta função de um oscilador cru: o ataque em rampa, o
   * filtro que fecha ao longo da nota (é o que faz som acústico soar acústico),
   * e a segunda voz levemente desafinada, que cria o batimento lento que o
   * ouvido lê como "instrumento" em vez de "gerador de sinal".
   */
  _nota(dest, { freq, dur, tipo = 'sine', pico = 1, ataque = 0.006,
                desce = null, corte = 4200, detune = 6 }) {
    const ctx = this.ctx, t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(corte, t);
    // fecha, mas até a metade: em 22% a nota terminava surda, e como toda
    // camada tonal do jogo passa por aqui, o efeito somava em tudo
    f.frequency.exponentialRampToValueAtTime(Math.max(400, corte * 0.5), t + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(pico, t + ataque);
    env.gain.setTargetAtTime(0.0001, t + ataque, dur / 3.4);
    f.connect(env); env.connect(dest);

    for (const cents of [0, detune]) {
      const o = ctx.createOscillator();
      o.type = tipo;
      o.frequency.setValueAtTime(freq, t);
      o.detune.value = cents;
      if (desce) o.frequency.exponentialRampToValueAtTime(desce, t + dur);
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.12);
      if (!detune) break;
    }
    return env;
  }

  /**
   * Um sino de metal: parciais que NÃO são múltiplos inteiros da fundamental.
   *
   * É a diferença entre um acorde de videogame e o som de um objeto real. A
   * série harmônica exata soa como órgão barato; estas razões quebradas são as
   * de uma barra de metal batida, e cada parcial morre numa velocidade
   * diferente, que é o que dá a impressão de o som "abrir".
   */
  _sino(dest, freq, dur, pico = 1) {
    const parciais = [[1, 1, 1], [2.76, 0.4, 0.75], [5.4, 0.22, 0.5], [8.9, 0.12, 0.32]];
    for (const [razao, amp, vida] of parciais) {
      this._nota(dest, {
        freq: freq * razao, dur: dur * vida, tipo: 'sine',
        pico: pico * amp, ataque: 0.004, corte: 9000, detune: razao === 1 ? 4 : 0,
      });
    }
  }

  /**
   * Os ganhos abaixo são relativos entre si, e só fazem sentido junto com o
   * volume geral: tiro é o mais alto porque é o mais alto, e o passo fica quase
   * no chão porque ouvir passo é vantagem de jogo, não ambiente. Mexer no
   * volume geral sem refazer esta escala afunda o passo em silêncio e deixa o
   * tiro raspando o teto — foi o que aconteceu ao baixar o mestre de 0,55 para
   * 0,34 e não tocar em mais nada.
   *
   * O passo em especial não pode ser tratado como ambiente: ouvir o adversário
   * andando é a única pista de posição que o jogo dá, e um passo dezesseis
   * vezes abaixo do tiro simplesmente não chega ao ouvido durante a partida.
   *
   * @param {string} kind shot|door|step|run|hit|tick|swap|win|lose|click|vitoria|derrota|bump
   * @param {{vol?:number, pan?:number}} opt
   */
  play(kind, opt = {}) {
    if (!this.enabled || !this.somLigado) return;
    this.init();
    if (!this.ctx) return;
    const vol = opt.vol ?? 1, pan = opt.pan;
    if (vol <= 0.005) return;
    const sorte = (a, b) => a + Math.random() * (b - a);

    switch (kind) {
      /*
       * O disparo, em quatro camadas.
       *
       * Um tiro tem uma ordem que o ouvido reconhece, e é a ordem que faz o som
       * ser lido como tiro em vez de como estalo genérico:
       *
       *   1. o CLIQUE do mecanismo, na frente de tudo — curtíssimo e seco.
       *   2. o ESTALO da onda de choque saindo do cano: alto, agudo, e tão
       *      curto que quase não tem duração. É ele que faz a pessoa piscar.
       *   3. o CORPO, o estouro grave logo atrás com o tom despencando. É o que
       *      dá calibre; sem ele o tiro vira estalo de chicote.
       *   4. a SALA devolvendo tudo, que aqui vem de graça pelo envio.
       *
       * O grave é uma senoide despencando, não uma serra. Serra tem harmônico
       * ímpar até o teto e é exatamente o timbre de fliperama que incomodava.
       */
      case 'shot': {
        // o arquivo, quando houver; a síntese abaixo é a reserva
        if (this._tocarAmostra('shot', 0.9 * vol, pan)) break;

        const g = this._chain(0.74 * vol, pan);

        this._ruido(g, { dur: 0.014, freq: 5000, q: 0.7, tipo: 'highpass', pico: 0.7, curva: 0.4 });
        this._ruido(g, { dur: 0.055, freq: 2000, q: 0.5, tipo: 'highpass', pico: 1,
                         curva: 0.55, varreduraAte: 800 });
        this._ruido(g, { dur: 0.13, freq: 1100, q: 0.7, tipo: 'lowpass', pico: 0.8,
                         curva: 1.2, varreduraAte: 220 });
        this._nota(g, { freq: sorte(150, 190), dur: 0.15, tipo: 'sine', pico: 0.6,
                        ataque: 0.0008, desce: 42, corte: 1400, detune: 0 });
        this._nota(g, { freq: sorte(80, 95), dur: 0.2, tipo: 'triangle', pico: 0.3,
                        ataque: 0.001, desce: 34, corte: 700, detune: 0 });
        break;
      }

      /* Impacto no corpo: grave, abafado e curto. */
      case 'hit': {
        const g = this._chain(1.25 * vol, pan);
        this._ruido(g, { dur: 0.09, freq: 1800, q: 0.6, tipo: 'lowpass', pico: 0.9, curva: 0.8 });
        this._ruido(g, { dur: 0.35, freq: 420, q: 0.8, tipo: 'lowpass', pico: 0.45,
                         curva: 1.8, varreduraAte: 140 });
        this._nota(g, { freq: 140, dur: 0.3, tipo: 'sine', pico: 0.75, ataque: 0.001,
                        desce: 40, corte: 900, detune: 0 });
        break;
      }

      /*
       * Porta: o passa-faixa estreito de antes, de volta.
       *
       * A revisão alargou o filtro (Q de 3 para 1.6) e pôs um ataque de 20 ms.
       * O Q estreito era justamente o que dava o timbre de metal ressoando no
       * trilho; alargado, virou um chiado sem identidade, e o ataque lento
       * tirou o arranque da folha destravando.
       */
      case 'door': {
        const g = this._chain(1.15 * vol, pan);
        this._ruido(g, { dur: 0.3, freq: 420, q: 3, pico: 1, ataque: 0.0015, curva: 1 });
        this._nota(g, { freq: 90, dur: 0.16, tipo: 'triangle', pico: 0.5, ataque: 0.002,
                        desce: 55, corte: 1200, detune: 0 });
        break;
      }

      /*
       * O passo, em três tempos.
       *
       * Uma banda estreita de ruído sozinha — que é o que havia aqui — dá um
       * som seco e chocho: tem miolo e não tem nem a batida nem o arrastar. Pé
       * em piso duro faz três coisas em menos de cem milissegundos, e é a
       * ordem delas que o ouvido reconhece como pisada:
       *
       *   1. o CALCANHAR bate: um golpe grave e curtíssimo, com o tom caindo.
       *      É o peso do corpo chegando ao chão.
       *   2. o CORPO do som: a banda média, que dá o material do piso.
       *   3. a SOLA arrasta: um chiado agudo e muito curto, logo depois. É a
       *      camada que faltava — sem ela o passo vira batida de tambor.
       *
       * E a ponta do pé assenta alguns milissegundos depois do calcanhar, mais
       * baixa: são duas batidas, não uma. Esse segundo toque é o que separa um
       * passo de uma percussão qualquer.
       *
       * Tudo sorteado a cada passo: altura, duração e volume. Passo idêntico
       * repetido vinte vezes seguidas é o que mais denuncia som de máquina, e
       * numa corrida eles saem quase colados.
       */
      case 'step':
      case 'run': {
        const correndo = kind === 'run';
        const saida = this._chain((correndo ? 0.85 : 0.55) * vol, pan);

        /*
         * Um teto de agudo em cima do passo inteiro.
         *
         * A camada de sola arrastando entrou aqui numa faixa alta e alta demais
         * — passa-alta em 2,6 kHz com um terço do volume — e o passo virou um
         * chiado afiado. Um passo em piso é um som REDONDO: a energia mora
         * embaixo, e o agudo só marca a borda do ataque.
         *
         * O teto resolve isso de uma vez para as quatro camadas, em vez de eu
         * caçar o excesso em cada uma. E a inclinação suave (Q baixo) é de
         * propósito: filtro ressonante no corte devolveria um assobio bem onde
         * estou tentando tirar aspereza.
         */
        const teto = this.ctx.createBiquadFilter();
        teto.type = 'lowpass';
        teto.frequency.value = correndo ? 3400 : 3000;
        teto.Q.value = 0.5;
        teto.connect(saida);
        const g = teto;

        const t = sorte(0.9, 1.12);                     // variação de altura
        const peso = correndo ? 1 : 0.72;

        // 1. o calcanhar: o peso do corpo chegando ao chão
        this._nota(g, {
          freq: sorte(92, 122) * t, dur: 0.085 * t, tipo: 'sine',
          pico: 0.5 * peso, ataque: 0.0018, desce: sorte(42, 56), corte: 600, detune: 0,
        });
        // 2. o corpo, na banda que dá o material do piso — larga, não estreita
        this._pisada(g, (correndo ? 0.085 : 0.072) * t,
                     sorte(220, 320) * t, sorte(0.7, 1.1), 1.15);
        // 3. a sola, agora numa faixa média e discreta: marca a borda, não apita
        this._ruido(g, {
          dur: sorte(0.035, 0.055), freq: sorte(900, 1500), q: 0.8,
          pico: 0.22 * peso, ataque: 0.005, curva: 0.6,
        });

        // a ponta do pé assentando, logo atrás e mais baixa
        setTimeout(() => {
          if (!this.ctx) return;
          this._pisada(g, 0.05, sorte(230, 320), 0.9, 0.45);
          this._ruido(g, {
            dur: 0.024, freq: sorte(1000, 1600), q: 0.8,
            pico: 0.11 * peso, ataque: 0.004, curva: 0.5,
          });
        }, sorte(24, 40));
        break;
      }

      /* Bala batendo no cenário: lasca seca, com um pouco de zunido. */
      case 'bump': {
        const g = this._chain(0.84 * vol, pan);
        this._ruido(g, { dur: 0.07, freq: sorte(1400, 2300), q: 1.4, pico: 1,
                         ataque: 0.0008, curva: 0.6 });
        this._ruido(g, { dur: 0.16, freq: 620, q: 0.9, tipo: 'lowpass', pico: 0.4, curva: 1.3 });
        break;
      }

      /*
       * O relógio da contagem.
       *
       * Era uma onda quadrada de 880 Hz — o bipe de despertador, e o pior
       * ofensor da lista, porque toca três vezes seguidas antes de cada metade.
       * Virou uma batida de madeira: ruído estreito e curtíssimo com um corpo
       * ressonante grave logo atrás. Marca o tempo sem apitar.
       */
      case 'tick': {
        const g = this._chain(0.42 * vol, undefined);
        this._ruido(g, { dur: 0.028, freq: 2100, q: 3.5, pico: 0.55, curva: 0.5 });
        this._nota(g, { freq: 420, dur: 0.09, tipo: 'sine', pico: 0.5, ataque: 0.0012,
                        desce: 300, corte: 2200, detune: 0 });
        break;
      }

      /* Clique de interface: um toque seco, sem altura definida e sem sala. */
      case 'click': {
        const g = this._chain(0.42 * vol, undefined);
        this._ruido(g, { dur: 0.022, freq: 2800, q: 2.2, pico: 0.7, curva: 0.5 });
        this._nota(g, { freq: 760, dur: 0.045, tipo: 'sine', pico: 0.35, ataque: 0.001,
                        desce: 520, corte: 3000, detune: 0 });
        break;
      }

      /*
       * A troca de papéis: um sopro que sobe e passa.
       * Antes era uma serra varrendo de 320 a 760 Hz, que é literalmente o
       * efeito de "power-up" de fliperama. Agora é ar, com o filtro abrindo.
       */
      case 'swap': {
        const g = this._chain(0.5 * vol, undefined);
        this._ruido(g, { dur: 0.5, freq: 240, q: 0.9, pico: 0.7, ataque: 0.09,
                         curva: 1.5, varreduraAte: 2400 });
        this._nota(g, { freq: 110, dur: 0.5, tipo: 'sine', pico: 0.45, ataque: 0.06,
                        desce: 220, corte: 900, detune: 0 });
        break;
      }

      /*
       * Fim de rodada. Dois sinos, não um arpejo.
       *
       * O arpejo de triângulos subindo era a fanfarra de plataforma de 1988. Um
       * intervalo de dois sinos de metal diz a mesma coisa — subiu, ganhou;
       * desceu, perdeu — sem citar nenhum outro jogo.
       */
      case 'win': {
        const g = this._chain(0.5 * vol, undefined);
        this._sino(g, 587, 0.7, 0.5);
        setTimeout(() => this.ctx && this._sino(g, 880, 1.1, 0.45), 130);
        break;
      }
      case 'lose': {
        const g = this._chain(0.5 * vol, undefined);
        this._sino(g, 330, 0.8, 0.45);
        setTimeout(() => this.ctx && this._sino(g, 233, 1.3, 0.4), 150);
        break;
      }

      /*
       * Fim de PARTIDA. Pode ocupar espaço, e deve: é o único momento em que
       * tudo acabou. Um acorde de sinos por cima de um grave que sustenta.
       */
      case 'vitoria': {
        const g = this._chain(0.6 * vol, undefined);
        [[587, 0], [740, 90], [880, 180], [1175, 300]].forEach(([f, ms], k) =>
          setTimeout(() => this.ctx && this._sino(g, f, 1.6 - k * 0.15, 0.42), ms));
        setTimeout(() => this.ctx && this._nota(g, {
          freq: 147, dur: 1.9, tipo: 'triangle', pico: 0.5, ataque: 0.06, corte: 700, detune: 8,
        }), 180);
        break;
      }
      case 'derrota': {
        const g = this._chain(0.6 * vol, undefined);
        [[392, 0], [311, 200], [233, 400]].forEach(([f, ms]) =>
          setTimeout(() => this.ctx && this._sino(g, f, 1.2, 0.36), ms));
        setTimeout(() => {
          if (!this.ctx) return;
          // o grave despencando e o ruído escuro: a coisa desligando
          this._nota(g, { freq: 110, dur: 1.8, tipo: 'triangle', pico: 0.55,
                          ataque: 0.05, desce: 52, corte: 500, detune: 10 });
          this._ruido(g, { dur: 1.1, freq: 300, q: 0.7, tipo: 'lowpass', pico: 0.3,
                           ataque: 0.15, curva: 2.6, varreduraAte: 110 });
        }, 430);
        break;
      }
    }
  }

  /** Toca um som do mundo, atenuado e panorâmico em relação ao ouvinte. */
  playAt(kind, pos, listenerPos, listenerYaw, maxDist = 30, gain = 1) {
    const dx = pos.x - listenerPos.x, dz = pos.z - listenerPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > maxDist) return;
    const vol = gain * (1 - dist / maxDist) ** 1.7;
    // ângulo relativo ao olhar: -1 = esquerda, +1 = direita
    const ang = Math.atan2(dx, dz) - listenerYaw;
    this.play(kind, { vol, pan: Math.sin(ang) * 0.85 });
  }
}
