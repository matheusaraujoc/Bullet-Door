/**
 * O catálogo da loja — Fase 3 do Roadmap de Progressão.
 *
 * Cada item aqui é só metadado: id (bate com o arquivo em
 * public/models/BastlersKit), nome de exibição e preço em moedas. Comprar um
 * item só marca ele como desbloqueado pra sempre (ver Progresso.js) — usar de
 * verdade numa partida é a Fase 5 (equipamento por corrida), fora do escopo
 * daqui.
 *
 * Só uma fração dos 18 blasters do pacote entrou nesta primeira leva — dá pra
 * completar o resto depois sem mexer em mais nada além desta lista.
 */
export const CATALOGO = [
  { id: 'blaster-a', nome: 'Blaster Mk.I', preco: 100 },
  { id: 'blaster-b', nome: 'Blaster Mk.II', preco: 150 },
  { id: 'blaster-c', nome: 'Blaster Mk.III', preco: 200 },
  { id: 'blaster-d', nome: 'Blaster Mk.IV', preco: 275 },
  { id: 'blaster-e', nome: 'Blaster Mk.V', preco: 350 },
  { id: 'blaster-f', nome: 'Blaster Mk.VI', preco: 450 },
  { id: 'blaster-g', nome: 'Blaster Mk.VII', preco: 600 },
  { id: 'blaster-h', nome: 'Blaster Mk.VIII', preco: 800 },
  { id: 'grenade-a', nome: 'Granada', preco: 1000 },
];

export function itemDoCatalogo(id) {
  return CATALOGO.find(i => i.id === id) ?? null;
}
