// Gera o zip para subir no Poki for Developers.
//   npm run poki
//
// O conteúdo é o mesmo `dist/` do itch (o SDK do Poki já está embutido no
// index.html de qualquer build, e é inofensivo fora do Poki — ver
// src/core/Poki.js); o que muda aqui é só o nome do pacote e as instruções.
import { existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { zipar } from './zip.mjs';

const SAIDA = 'bullet-door-poki.zip';

if (!existsSync('dist') || !existsSync(join('dist', 'index.html'))) {
  console.error('dist/ não existe ou está sem index.html — rode "npm run build" antes.');
  process.exit(1);
}

// O Poki, como o itch, exige index.html na RAIZ do zip.
if (existsSync(SAIDA)) rmSync(SAIDA);
const { arquivos, bytes } = zipar('dist', SAIDA);

console.log(`\n${SAIDA} — ${(bytes / 1024 / 1024).toFixed(2)} MB\n`);
console.log('  conteúdo:');
for (const a of arquivos) {
  const kb = statSync(join('dist', a)).size / 1024;
  console.log(`   ${a.padEnd(42)} ${kb.toFixed(0).padStart(6)} KB`);
}

const barrasErradas = arquivos.filter(a => a.includes('\\'));
if (barrasErradas.length) {
  console.error('\nERRO: caminho com barra invertida no pacote:', barrasErradas);
  process.exit(1);
}

console.log(`
  Para publicar no Poki:
    1. poki.com/developer -> Games -> Add Game (ou o jogo já existente)
    2. Suba ${SAIDA} no Poki for Developers
    3. Abra no Inspector deles ANTES de pedir revisão: o Inspector ativa o
       "debug mode" do SDK (login e gamesave simulados) e é onde dá para ver
       de verdade o intervalo comercial, o Poki Pill e o jogo no celular
    4. No Inspector, cheque em especial:
         - o botão de tela cheia e os de som/música não ficam embaixo do
           Poki Pill (o pill entra por cima do jogo; mova com
           PokiSDK.movePill(topPercent, topPx) em src/core/Poki.js se cobrir
           o placar no canto superior direito)
         - o HUD no modo celular (o jogo já escala por altura de tela; teste
           num par de resoluções deitadas)
    5. Peça revisão quando estiver satisfeito — Discord ou
       developersupport@poki.com se travar em algo

  O que já está integrado (ver src/core/Poki.js):
    PokiSDK.init()                antes de qualquer coisa, em src/main.js
    PokiSDK.gameLoadingFinished() quando os modelos terminam de carregar
    PokiSDK.gameplayStart/Stop()  em jogar, pausar, continuar, fim de partida
    PokiSDK.commercialBreak()     em Continuar e Jogar de novo (não no
                                   primeiro Jogar — não há "intervalo" ainda
                                   nesse ponto, e o SDK recusa com atraso)
    tela cheia, ESC, roda do mouse e as setas não rolam a página por baixo

  O que NÃO foi implementado, e por quê:
    rewardedBreak()  o jogo não tem economia (moedas, vidas extras) para
                     trocar por um anúncio assistido
    login / getUser  não há progresso ligado a conta — cada partida é
                     independente, então não há o que persistir por jogador
`);
