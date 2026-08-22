/**
 * Os três idiomas do jogo.
 *
 * Tudo o que o jogador lê passa por aqui — nada de texto solto no meio da
 * lógica. As chaves descrevem o que a frase É, não o que ela diz em português,
 * senão traduzir vira adivinhação ("hunter.objetivo" continua fazendo sentido
 * em espanhol; "ELIMINE_VALE_UM_PONTO" não).
 *
 * Português é o idioma de origem e serve de rede: falta uma chave em espanhol
 * ou inglês, cai no português em vez de mostrar a chave crua na tela.
 */
const IDIOMAS = {
  pt: {
    _nome: 'Português', _bandeira: 'BR.png', _tags: ['pt'],

    // ---- menu
    'menu.regra': 'Cada <b>rodada</b> te dá uma caçada e uma fuga: eliminar vale <b>1 ponto</b>, sobreviver nega o ponto dele. A <b>partida</b> é melhor de 3 — <b>2 eliminações</b> levam.',
    'menu.jogar': 'JOGAR',
    'menu.carregando': 'CARREGANDO',
    'menu.erro': 'ERRO AO CARREGAR',
    'menu.dicaToque': 'use o botão no canto para jogar em tela cheia',
    'menu.idioma': 'IDIOMA',
    'menu.progresso': 'NÍVEL {nivel} · {moedas} MOEDAS · MELHOR SEQUÊNCIA: {sequencia}',

    // ---- dicas rotativas do menu
    'menu.dicaRotulo': 'DICA:',
    'menu.passoAnterior': 'passo anterior',
    'menu.passoProximo': 'próximo passo',
    'dica.1': '<b>Correr</b> é rápido, mas faz barulho alto — o inimigo pode ouvir seus passos a boa distância e vir direto na sua direção.',
    'dica.2': '<b>Agachado</b> você não faz nenhum barulho ao andar, mas o preço é a velocidade: fica bem mais lento que andando ou correndo.',
    'dica.3': 'Além de silencioso, ficar <b>agachado</b> também reduz bastante a distância em que o inimigo consegue te enxergar.',
    'dica.4': '<b>Abrir e fechar portas</b> faz barulho — tanto para você quanto para quem está do outro lado. É uma pista real da sua posição.',
    'dica.5': 'Um <b>tiro</b> é o som mais alto do jogo: é ouvido em quase todo o mapa, então nunca é uma ação discreta.',
    'dica.6': 'A borda da tela fica <b>vermelha</b> quando o inimigo está perto e ativamente te perseguindo — é o aviso de perigo.',

    // ---- controles
    'ctrl.mover': 'mover',
    'ctrl.correr': 'correr — faz barulho',
    'ctrl.agachar': 'agachar — silencioso',
    'ctrl.espiar': 'espiar pelos cantos',
    'ctrl.portas': 'abrir e fechar portas',
    'ctrl.atirar': 'atirar — munição infinita',
    'ctrl.mira': 'mira de ferro',
    'ctrl.pausar': 'pausar',
    'ctrl.clique': 'CLIQUE',
    'ctrl.botaoDireito': 'BOTÃO DIREITO',
    'ctrl.esquerda': 'ESQUERDA',
    'ctrl.direita': 'DIREITA',
    'ctrl.tqJoystick': 'joystick: andar',
    'ctrl.tqOlhar': 'arraste: olhar',
    'ctrl.tqAtirar': 'munição infinita',
    'ctrl.tqMira': 'fecha o ângulo',
    'ctrl.tqPorta': 'abre e fecha por perto',
    'ctrl.tqEspiar': 'espiar pelos cantos',
    'bt.correr': 'CORRER', 'bt.agachar': 'AGACHAR', 'bt.porta': 'PORTA',
    'bt.mira': 'MIRA', 'bt.atirar': 'ATIRAR',

    // ---- pausa
    'pausa.titulo': 'PAUSADO',
    'pausa.texto': 'O mouse está solto.<br><b>Continuar</b> volta ao jogo e prende o mouse de novo.',
    'pausa.continuar': 'CONTINUAR',
    'pausa.sair': 'SAIR DA PARTIDA',

    // ---- HUD
    'hud.cacador': 'CAÇADOR',
    'hud.fugitivo': 'FUGITIVO',
    'hud.objCacar': 'ELIMINE — VALE UM PONTO',
    'hud.objFugir': 'SOBREVIVA — NEGUE O PONTO',
    'hud.rodadaDe': 'RODADA {n} DE {total}',
    'hud.desempate': 'DESEMPATE · RODADA {n}',
    'hud.voce': 'VOCÊ',
    'hud.inimigo': 'INIMIGO',
    'hud.nota': 'ELIMINAÇÕES · 2 LEVAM A PARTIDA',
    'hud.porta': '[E] PORTA',
    'hud.soltaMouse': 'solta o mouse',
    'hud.alvoAbatido': 'ALVO ELIMINADO',
    'hud.passouPerto': 'PASSOU PERTO',

    // ---- momentos da partida
    'jogo.rodada': 'RODADA {n}',
    'jogo.voceCaca': 'VOCÊ CAÇA',
    'jogo.voceFoge': 'VOCÊ FOGE',
    'jogo.troca': 'TROCA',
    'jogo.agoraCaca': 'AGORA VOCÊ CAÇA',
    'jogo.agoraFoge': 'AGORA VOCÊ FOGE',
    'jogo.explicaCaca': 'Você tem {n} segundos para caçar e eliminar o inimigo — cada abate vale 1 ponto.',
    'jogo.explicaFoge': 'Agora você tem {n} segundos para fugir e sobreviver — sobreviver nega o ponto dele!',
    'jogo.alvoEliminado': 'ALVO ELIMINADO',
    'jogo.foiAbatido': 'VOCÊ FOI ABATIDO',
    'jogo.pontoSeu': '+1 PARA VOCÊ',
    'jogo.pontoDele': '+1 PARA O INIMIGO',
    // as quatro combinações da rodada, ditas do ponto de vista de quem joga
    'jogo.rodadaLimpa': 'VOCÊ ELIMINOU E SOBREVIVEU',
    'jogo.rodadaTrocada': 'VOCÊ ELIMINOU, MAS CAIU NA FUGA',
    'jogo.rodadaVazia': 'NINGUÉM ACERTOU O ALVO',
    'jogo.rodadaPerdida': 'VOCÊ ERROU A CAÇADA E CAIU NA FUGA',
    'jogo.placar': 'VOCÊ {seu} — {dele} INIMIGO',

    // ---- fim de partida
    'fim.vitoria': 'VITÓRIA',
    'fim.derrota': 'DERROTA',
    'fim.empate': 'EMPATE',
    'fim.faixaVitoria': 'A PARTIDA É SUA',
    'fim.faixaDerrota': 'O INIMIGO LEVOU',
    'fim.faixaEmpate': 'NINGUÉM ABRIU VANTAGEM',
    'fim.eliminacoes': 'ELIMINAÇÕES',
    'fim.sequenciaAtual': 'SEQUÊNCIA: {n}',
    'fim.sequenciaFinal': 'SEQUÊNCIA FINAL: {n}',
    'fim.melhorSequencia': 'MELHOR: {n}',
    'fim.novoRecorde': 'NOVO RECORDE!',
    'fim.premio': '+{moedas} moedas · +{xp} XP',
    'fim.subiuNivel': 'SUBIU PARA O NÍVEL {n}!',
    'fim.novamente': 'JOGAR NOVAMENTE',
    'fim.menu': 'VOLTAR AO MENU',
    'fim.rodada': 'R{n}',

    // ---- loja
    'loja.abrir': 'LOJA',
    'loja.titulo': 'LOJA',
    'loja.saldo': '{moedas} moedas',
    'loja.comprarPor': 'COMPRAR — {preco}',
    'loja.desbloqueado': 'DESBLOQUEADO',
    'loja.fechar': 'FECHAR',

    // ---- abertura e botões de canto
    'intro.comecarToque': 'TOQUE PARA COMEÇAR',
    'intro.comecarClique': 'CLIQUE PARA COMEÇAR',
    'intro.usaSom': 'O JOGO USA SOM',
    'intro.carregando': 'CARREGANDO {pct}%',
    'intro.pularToque': 'TOQUE PARA PULAR',
    'intro.pularClique': 'CLIQUE PARA PULAR',
    'canto.telaCheia': 'Tela cheia',
    'canto.sairTelaCheia': 'Sair da tela cheia',
    'canto.somLigar': 'Ligar efeitos sonoros',
    'canto.somDesligar': 'Desligar efeitos sonoros',
    'canto.musicaLigar': 'Ligar música',
    'canto.musicaDesligar': 'Desligar música',
  },

  es: {
    _nome: 'Español', _bandeira: 'ES.png', _tags: ['es'],

    'menu.regra': 'Cada <b>ronda</b> te da una cacería y una huida: eliminar vale <b>1 punto</b>, sobrevivir le niega el suyo. La <b>partida</b> es al mejor de 3 — <b>2 eliminaciones</b> ganan.',
    'menu.jogar': 'JUGAR',
    'menu.carregando': 'CARGANDO',
    'menu.erro': 'ERROR AL CARGAR',
    'menu.dicaToque': 'usa el botón de la esquina para pantalla completa',
    'menu.idioma': 'IDIOMA',
    'menu.progresso': 'NIVEL {nivel} · {moedas} MONEDAS · MEJOR RACHA: {sequencia}',

    'menu.dicaRotulo': 'CONSEJO:',
    'menu.passoAnterior': 'paso anterior',
    'menu.passoProximo': 'siguiente paso',
    'dica.1': '<b>Correr</b> es rápido, pero hace mucho ruido — el enemigo puede oír tus pasos desde lejos y venir directo hacia ti.',
    'dica.2': '<b>Agachado</b> no haces ningún ruido al moverte, pero pagas el precio en velocidad: te mueves mucho más lento que caminando o corriendo.',
    'dica.3': 'Además de silencioso, estar <b>agachado</b> también reduce mucho la distancia a la que el enemigo puede verte.',
    'dica.4': '<b>Abrir y cerrar puertas</b> hace ruido — tanto para ti como para quien está del otro lado. Es una pista real de tu posición.',
    'dica.5': 'Un <b>disparo</b> es el sonido más fuerte del juego: se oye en casi todo el mapa, así que nunca es una acción discreta.',
    'dica.6': 'El borde de la pantalla se pone <b>rojo</b> cuando el enemigo está cerca y persiguiéndote activamente — es la señal de peligro.',

    'ctrl.mover': 'moverse',
    'ctrl.correr': 'correr — hace ruido',
    'ctrl.agachar': 'agacharse — silencioso',
    'ctrl.espiar': 'asomarse por las esquinas',
    'ctrl.portas': 'abrir y cerrar puertas',
    'ctrl.atirar': 'disparar — munición infinita',
    'ctrl.mira': 'mira de hierro',
    'ctrl.pausar': 'pausar',
    'ctrl.clique': 'CLIC',
    'ctrl.botaoDireito': 'BOTÓN DERECHO',
    'ctrl.esquerda': 'IZQUIERDA',
    'ctrl.direita': 'DERECHA',
    'ctrl.tqJoystick': 'joystick: andar',
    'ctrl.tqOlhar': 'arrastra: mirar',
    'ctrl.tqAtirar': 'munición infinita',
    'ctrl.tqMira': 'cierra el ángulo',
    'ctrl.tqPorta': 'abre y cierra al lado',
    'ctrl.tqEspiar': 'asomarse por las esquinas',
    'bt.correr': 'CORRER', 'bt.agachar': 'AGACHAR', 'bt.porta': 'PUERTA',
    'bt.mira': 'MIRA', 'bt.atirar': 'DISPARAR',

    'pausa.titulo': 'EN PAUSA',
    'pausa.texto': 'El ratón está libre.<br><b>Continuar</b> vuelve al juego y lo captura de nuevo.',
    'pausa.continuar': 'CONTINUAR',
    'pausa.sair': 'SALIR DE LA PARTIDA',

    'hud.cacador': 'CAZADOR',
    'hud.fugitivo': 'FUGITIVO',
    'hud.objCacar': 'ELIMINA — VALE UN PUNTO',
    'hud.objFugir': 'SOBREVIVE — NIÉGALE EL PUNTO',
    'hud.rodadaDe': 'RONDA {n} DE {total}',
    'hud.desempate': 'DESEMPATE · RONDA {n}',
    'hud.voce': 'TÚ',
    'hud.inimigo': 'ENEMIGO',
    'hud.nota': 'ELIMINACIONES · 2 GANAN LA PARTIDA',
    'hud.porta': '[E] PUERTA',
    'hud.soltaMouse': 'suelta el ratón',
    'hud.alvoAbatido': 'OBJETIVO ELIMINADO',
    'hud.passouPerto': 'PASÓ CERCA',

    'jogo.rodada': 'RONDA {n}',
    'jogo.voceCaca': 'TÚ CAZAS',
    'jogo.voceFoge': 'TÚ HUYES',
    'jogo.troca': 'CAMBIO',
    'jogo.agoraCaca': 'AHORA CAZAS TÚ',
    'jogo.agoraFoge': 'AHORA HUYES TÚ',
    'jogo.explicaCaca': 'Tienes {n} segundos para cazar y eliminar al enemigo — cada baja vale 1 punto.',
    'jogo.explicaFoge': 'Ahora tienes {n} segundos para huir y sobrevivir — ¡sobrevivir le niega su punto!',
    'jogo.alvoEliminado': 'OBJETIVO ELIMINADO',
    'jogo.foiAbatido': 'TE HAN ABATIDO',
    'jogo.pontoSeu': '+1 PARA TI',
    'jogo.pontoDele': '+1 PARA EL ENEMIGO',
    'jogo.rodadaLimpa': 'ELIMINASTE Y SOBREVIVISTE',
    'jogo.rodadaTrocada': 'ELIMINASTE, PERO CAÍSTE HUYENDO',
    'jogo.rodadaVazia': 'NADIE ACERTÓ',
    'jogo.rodadaPerdida': 'FALLASTE LA CAZA Y CAÍSTE HUYENDO',
    'jogo.placar': 'TÚ {seu} — {dele} ENEMIGO',

    'fim.vitoria': 'VICTORIA',
    'fim.derrota': 'DERROTA',
    'fim.empate': 'EMPATE',
    'fim.faixaVitoria': 'LA PARTIDA ES TUYA',
    'fim.faixaDerrota': 'GANÓ EL ENEMIGO',
    'fim.faixaEmpate': 'NADIE SACÓ VENTAJA',
    'fim.eliminacoes': 'ELIMINACIONES',
    'fim.sequenciaAtual': 'RACHA: {n}',
    'fim.sequenciaFinal': 'RACHA FINAL: {n}',
    'fim.melhorSequencia': 'MEJOR: {n}',
    'fim.novoRecorde': '¡NUEVO RÉCORD!',
    'fim.premio': '+{moedas} monedas · +{xp} XP',
    'fim.subiuNivel': '¡SUBISTE AL NIVEL {n}!',
    'fim.novamente': 'JUGAR OTRA VEZ',
    'fim.menu': 'VOLVER AL MENÚ',
    'fim.rodada': 'R{n}',

    // ---- tienda
    'loja.abrir': 'TIENDA',
    'loja.titulo': 'TIENDA',
    'loja.saldo': '{moedas} monedas',
    'loja.comprarPor': 'COMPRAR — {preco}',
    'loja.desbloqueado': 'DESBLOQUEADO',
    'loja.fechar': 'CERRAR',

    'intro.comecarToque': 'TOCA PARA EMPEZAR',
    'intro.comecarClique': 'HAZ CLIC PARA EMPEZAR',
    'intro.usaSom': 'EL JUEGO USA SONIDO',
    'intro.carregando': 'CARGANDO {pct}%',
    'intro.pularToque': 'TOCA PARA SALTAR',
    'intro.pularClique': 'HAZ CLIC PARA SALTAR',
    'canto.telaCheia': 'Pantalla completa',
    'canto.sairTelaCheia': 'Salir de pantalla completa',
    'canto.somLigar': 'Activar efectos de sonido',
    'canto.somDesligar': 'Silenciar efectos de sonido',
    'canto.musicaLigar': 'Activar música',
    'canto.musicaDesligar': 'Silenciar música',
  },

  en: {
    _nome: 'English', _bandeira: 'US.png', _tags: ['en'],

    'menu.regra': 'Each <b>round</b> gives you one hunt and one escape: a kill is worth <b>1 point</b>, surviving denies them theirs. The <b>match</b> is best of 3 — <b>2 kills</b> win it.',
    'menu.jogar': 'PLAY',
    'menu.carregando': 'LOADING',
    'menu.erro': 'FAILED TO LOAD',
    'menu.dicaToque': 'use the corner button to go fullscreen',
    'menu.idioma': 'LANGUAGE',
    'menu.progresso': 'LEVEL {nivel} · {moedas} COINS · BEST STREAK: {sequencia}',

    'menu.dicaRotulo': 'TIP:',
    'menu.passoAnterior': 'previous step',
    'menu.passoProximo': 'next step',
    'dica.1': '<b>Running</b> is fast, but loud — the enemy can hear your footsteps from far away and come straight for you.',
    'dica.2': "<b>Crouching</b> makes no noise at all while moving, but costs you speed: you move a lot slower than walking or running.",
    'dica.3': 'Besides being silent, <b>crouching</b> also cuts down a lot how far away the enemy can spot you.',
    'dica.4': "<b>Opening and closing doors</b> makes noise — for you and for whoever's on the other side. It's a real clue to your position.",
    'dica.5': 'A <b>gunshot</b> is the loudest sound in the game: it\'s heard almost everywhere on the map, so it\'s never discreet.',
    'dica.6': "The screen edge turns <b>red</b> when the enemy is close and actively hunting you — that's the danger warning.",

    'ctrl.mover': 'move',
    'ctrl.correr': 'sprint — makes noise',
    'ctrl.agachar': 'crouch — silent',
    'ctrl.espiar': 'peek around corners',
    'ctrl.portas': 'open and close doors',
    'ctrl.atirar': 'shoot — infinite ammo',
    'ctrl.mira': 'iron sights',
    'ctrl.pausar': 'pause',
    'ctrl.clique': 'CLICK',
    'ctrl.botaoDireito': 'RIGHT BUTTON',
    'ctrl.esquerda': 'LEFT',
    'ctrl.direita': 'RIGHT',
    'ctrl.tqJoystick': 'joystick: move',
    'ctrl.tqOlhar': 'drag: look',
    'ctrl.tqAtirar': 'infinite ammo',
    'ctrl.tqMira': 'tightens your aim',
    'ctrl.tqPorta': 'opens and closes nearby',
    'ctrl.tqEspiar': 'peek around corners',
    'bt.correr': 'SPRINT', 'bt.agachar': 'CROUCH', 'bt.porta': 'DOOR',
    'bt.mira': 'AIM', 'bt.atirar': 'FIRE',

    'pausa.titulo': 'PAUSED',
    'pausa.texto': 'The mouse is free.<br><b>Resume</b> returns to the game and locks it again.',
    'pausa.continuar': 'RESUME',
    'pausa.sair': 'QUIT MATCH',

    'hud.cacador': 'HUNTER',
    'hud.fugitivo': 'RUNNER',
    'hud.objCacar': 'ELIMINATE — WORTH ONE POINT',
    'hud.objFugir': 'SURVIVE — DENY THE POINT',
    'hud.rodadaDe': 'ROUND {n} OF {total}',
    'hud.desempate': 'TIEBREAK · ROUND {n}',
    'hud.voce': 'YOU',
    'hud.inimigo': 'ENEMY',
    'hud.nota': 'KILLS · 2 WIN THE MATCH',
    'hud.porta': '[E] DOOR',
    'hud.soltaMouse': 'releases the mouse',
    'hud.alvoAbatido': 'TARGET ELIMINATED',
    'hud.passouPerto': 'CLOSE ONE',

    'jogo.rodada': 'ROUND {n}',
    'jogo.voceCaca': 'YOU HUNT',
    'jogo.voceFoge': 'YOU RUN',
    'jogo.troca': 'SWAP',
    'jogo.agoraCaca': 'NOW YOU HUNT',
    'jogo.agoraFoge': 'NOW YOU RUN',
    'jogo.explicaCaca': 'You have {n} seconds to hunt down and eliminate the enemy — every kill is worth 1 point.',
    'jogo.explicaFoge': "Now you have {n} seconds to run and survive — surviving denies them their point!",
    'jogo.alvoEliminado': 'TARGET ELIMINATED',
    'jogo.foiAbatido': 'YOU WERE KILLED',
    'jogo.pontoSeu': '+1 FOR YOU',
    'jogo.pontoDele': '+1 FOR THE ENEMY',
    'jogo.rodadaLimpa': 'YOU KILLED AND SURVIVED',
    'jogo.rodadaTrocada': 'YOU KILLED, THEN DIED FLEEING',
    'jogo.rodadaVazia': 'NOBODY LANDED A SHOT',
    'jogo.rodadaPerdida': 'YOU MISSED YOUR HUNT AND DIED FLEEING',
    'jogo.placar': 'YOU {seu} — {dele} ENEMY',

    'fim.vitoria': 'VICTORY',
    'fim.derrota': 'DEFEAT',
    'fim.empate': 'DRAW',
    'fim.faixaVitoria': 'THE MATCH IS YOURS',
    'fim.faixaDerrota': 'THE ENEMY TOOK IT',
    'fim.faixaEmpate': 'NEITHER PULLED AHEAD',
    'fim.eliminacoes': 'KILLS',
    'fim.sequenciaAtual': 'STREAK: {n}',
    'fim.sequenciaFinal': 'FINAL STREAK: {n}',
    'fim.melhorSequencia': 'BEST: {n}',
    'fim.novoRecorde': 'NEW RECORD!',
    'fim.premio': '+{moedas} coins · +{xp} XP',
    'fim.subiuNivel': 'LEVEL {n} REACHED!',
    'fim.novamente': 'PLAY AGAIN',
    'fim.menu': 'BACK TO MENU',
    'fim.rodada': 'R{n}',

    // ---- shop
    'loja.abrir': 'SHOP',
    'loja.titulo': 'SHOP',
    'loja.saldo': '{moedas} coins',
    'loja.comprarPor': 'BUY — {preco}',
    'loja.desbloqueado': 'UNLOCKED',
    'loja.fechar': 'CLOSE',

    'intro.comecarToque': 'TAP TO START',
    'intro.comecarClique': 'CLICK TO START',
    'intro.usaSom': 'THIS GAME HAS SOUND',
    'intro.carregando': 'LOADING {pct}%',
    'intro.pularToque': 'TAP TO SKIP',
    'intro.pularClique': 'CLICK TO SKIP',
    'canto.telaCheia': 'Fullscreen',
    'canto.sairTelaCheia': 'Exit fullscreen',
    'canto.somLigar': 'Turn sound effects on',
    'canto.somDesligar': 'Turn sound effects off',
    'canto.musicaLigar': 'Turn music on',
    'canto.musicaDesligar': 'Turn music off',
  },
};

const CHAVE = 'bulletdoor.idioma';
/*
 * Inglês é o idioma inicial, sempre — não mais "detecta o navegador e cai no
 * português se não achar nada". A ideia de adivinhar pelo `navigator
 * .languages` parecia razoável, mas na prática o público joga em qualquer
 * lugar (Poki, itch.io) e vem de qualquer nacionalidade; adivinhar errado
 * (ou um tester com o sistema em pt-BR concluindo "o jogo só abre em
 * português") é pior do que simplesmente começar no idioma mais universal e
 * deixar a escolha manual, com as três bandeiras bem à vista no menu. Quem já
 * trocou de idioma uma vez continua voltando para ele — só quem nunca abriu
 * o jogo (ou limpou os dados do site) cai aqui.
 */
const PADRAO = 'en';

function lerGuardado() {
  try {
    const v = localStorage.getItem(CHAVE);
    return IDIOMAS[v] ? v : null;
  } catch { return null; }
}

let atual = lerGuardado() || PADRAO;
const ouvintes = new Set();

/**
 * O texto de uma chave, com os buracos preenchidos.
 * @param {string} chave
 * @param {Record<string, string|number>} [vars] valores para os {marcadores}
 */
export function t(chave, vars) {
  const bruto = IDIOMAS[atual]?.[chave] ?? IDIOMAS[PADRAO][chave] ?? chave;
  if (!vars) return bruto;
  return bruto.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function idioma() { return atual; }
export function listaDeIdiomas() {
  return Object.entries(IDIOMAS).map(([cod, d]) => ({ cod, nome: d._nome, bandeira: d._bandeira }));
}

/** Troca o idioma, guarda a escolha e avisa quem estiver ouvindo. */
export function trocarIdioma(cod) {
  if (!IDIOMAS[cod] || cod === atual) return;
  atual = cod;
  try { localStorage.setItem(CHAVE, cod); } catch { /* sem storage */ }
  document.documentElement.lang = cod === 'pt' ? 'pt-BR' : cod;
  for (const fn of ouvintes) fn(cod);
}

/** Chama `fn` a cada troca de idioma. Devolve como parar de ouvir. */
export function aoTrocarIdioma(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/**
 * Traduz o que está marcado no HTML.
 *
 * `data-i18n` troca o texto; `data-i18n-html` troca aceitando marcação, para as
 * frases que têm negrito no meio; `data-i18n-attr` cuida de title e aria-label.
 */
export function aplicarNoDocumento(raiz = document) {
  for (const el of raiz.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of raiz.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of raiz.querySelectorAll('[data-i18n-attr]')) {
    for (const par of el.dataset.i18nAttr.split(',')) {
      const [attr, chave] = par.split(':').map(s => s.trim());
      if (attr && chave) el.setAttribute(attr, t(chave));
    }
  }
}

// o idioma inicial vale desde o primeiro quadro
document.documentElement.lang = atual === 'pt' ? 'pt-BR' : atual;
