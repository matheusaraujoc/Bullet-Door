/**
 * O progresso do jogador entre sessões: dificuldade progressiva, sequência de
 * corrida, e agora moedas/XP/nível (Fase 2 do Roadmap de Progressão). Tudo no
 * mesmo objeto versionado (`v`) — trocar o formato depois sem quebrar quem já
 * tem progresso salvo é só migrar por versão, nunca reescrever direto.
 */
const CHAVE = 'bulletdoor.progresso';

function ler() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE));
    if (bruto && typeof bruto === 'object' && typeof bruto.v === 'number') {
      // remendo pra quem salvou antes da Fase 2 existir
      if (typeof bruto.moedas !== 'number') bruto.moedas = 0;
      if (typeof bruto.xp !== 'number') bruto.xp = 0;
      if (typeof bruto.nivel !== 'number') bruto.nivel = 1;
      if (!Array.isArray(bruto.catalogo)) bruto.catalogo = [];   // remendo pra quem salvou antes da Fase 3
      return bruto;
    }
  } catch { /* sem storage, ou dado corrompido — recomeça do zero */ }
  return { v: 1, vitoriasNaVida: 0, melhorSequencia: 0, moedas: 0, xp: 0, nivel: 1, catalogo: [] };
}

function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(progresso)); } catch { /* sem storage, sem persistir */ }
}

const progresso = ler();
// a sequência da corrida ATUAL não é salva — só existe enquanto a aba está
// aberta, e reseta a cada corrida por definição (ver roadmap: "de corrida",
// não "permanente"). O melhor valor já alcançado é que vai para `progresso`.
let vitoriasNestaCorrida = 0;

/**
 * Quanto de XP separa um nível do próximo cresce a cada nível (80, depois
 * 120, 160...) — chute inicial de curva, não ciência exata, igual o resto da
 * dificuldade progressiva.
 */
function calcularNivel(xpTotal) {
  let nivel = 1, restante = xpTotal, custo = 80;
  while (restante >= custo) { restante -= custo; nivel++; custo += 40; }
  return nivel;
}

function ganharRecompensa(moedas, xp) {
  progresso.moedas += moedas;
  progresso.xp += xp;
  const nivelAntes = progresso.nivel;
  progresso.nivel = calcularNivel(progresso.xp);
  return {
    moedasGanhas: moedas, xpGanho: xp,
    moedas: progresso.moedas, nivel: progresso.nivel,
    subiuNivel: progresso.nivel > nivelAntes,
  };
}

function fecharSequencia() {
  const sequencia = vitoriasNestaCorrida;
  const bateuRecorde = sequencia > progresso.melhorSequencia;
  if (bateuRecorde) progresso.melhorSequencia = sequencia;
  vitoriasNestaCorrida = 0;
  return { sequencia, recorde: progresso.melhorSequencia, bateuRecorde };
}

export function obterProgresso() {
  return {
    vitoriasNaVida: progresso.vitoriasNaVida, melhorSequencia: progresso.melhorSequencia,
    vitoriasNestaCorrida, moedas: progresso.moedas, xp: progresso.xp, nivel: progresso.nivel,
    catalogo: progresso.catalogo,
  };
}

export function estaDesbloqueado(id) {
  return progresso.catalogo.includes(id);
}

/**
 * Compra um item do catálogo pra sempre — a única forma de gastar moeda por
 * enquanto (lootbox é a Fase 4). Não deixa comprar duas vezes nem gastar
 * moeda que não existe.
 * @returns {{ok:boolean, motivo?:'jaTem'|'semMoeda', moedas:number}}
 */
export function comprarItem(id, preco) {
  if (progresso.catalogo.includes(id)) return { ok: false, motivo: 'jaTem', moedas: progresso.moedas };
  if (progresso.moedas < preco) return { ok: false, motivo: 'semMoeda', moedas: progresso.moedas };
  progresso.moedas -= preco;
  progresso.catalogo = [...progresso.catalogo, id];
  salvar();
  return { ok: true, moedas: progresso.moedas };
}

/**
 * Uma partida vencida: soma na vida inteira, estende a corrida atual, e paga
 * moedas/XP — mais quanto mais longa a sequência em andamento, pra sustentar
 * o "vale a pena continuar" do roguelike (com teto, pra não disparar).
 */
export function registrarVitoriaDaPartida() {
  progresso.vitoriasNaVida++;
  vitoriasNestaCorrida++;
  const bonus = Math.min(vitoriasNestaCorrida - 1, 10);
  const premio = ganharRecompensa(50 + bonus * 5, 30 + bonus * 5);
  salvar();
  return { sequencia: vitoriasNestaCorrida, recorde: progresso.melhorSequencia, bateuRecorde: false, ativa: true, ...premio };
}

/**
 * A corrida termina por perder ou empatar — chamar exatamente uma vez por
 * partida de verdade encerrada (é o `onMatchEnded` quem chama). Ainda paga
 * uma recompensa de participação, bem menor que vencer: perder não pode
 * parecer que a sessão inteira foi em vão.
 */
export function finalizarCorrida() {
  const { sequencia, recorde, bateuRecorde } = fecharSequencia();
  const premio = ganharRecompensa(15, 10);
  salvar();
  return { sequencia, recorde, bateuRecorde, ativa: false, ...premio };
}

/**
 * Só fecha a contagem da corrida (banca a sequência contra o recorde) — SEM
 * pagar recompensa de novo. É o botão "voltar ao menu" depois de uma vitória
 * chamando isto: nenhuma partida nova terminou, só a decisão de parar por
 * conta própria, e a vitória que já rendeu moeda/XP não pode pagar duas vezes.
 */
export function encerrarCorridaSemPremio() {
  fecharSequencia();
  salvar();
}
