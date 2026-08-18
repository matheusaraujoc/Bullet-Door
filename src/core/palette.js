/**
 * Endesga 32 — a mesma paleta das texturas dos modelos voxel.
 * Tudo no jogo sai daqui: cenário, personagens e interface. É o que faz o
 * conjunto parecer uma coisa só, fofa nas cores e sombria no ambiente.
 */
export const EDG = {
  brick:    0xbe4a2f,
  clay:     0xd77643,
  sand:     0xead4aa,
  tan:      0xe4a672,
  cocoa:    0xb86f50,
  bark:     0x733e39,
  soil:     0x3e2731,
  wine:     0xa22633,
  red:      0xe43b44,
  orange:   0xf77622,
  amber:    0xfeae34,
  gold:     0xfee761,
  leaf:     0x63c74d,
  moss:     0x3e8948,
  pine:     0x265c42,
  deepPine: 0x193c3e,
  navy:     0x124e89,
  sky:      0x0099db,
  cyan:     0x2ce8f5,
  white:    0xffffff,
  fog:      0xc0cbdc,
  steel:    0x8b9bb4,
  slate:    0x5a6988,
  denim:    0x3a4466,
  ink:      0x262b44,
  black:    0x181425,
  hot:      0xff0044,
  plum:     0x68386c,
  orchid:   0xb55088,
  blush:    0xf6757a,
  peach:    0xe8b796,
  bronze:   0xc28569,
};

/** Versão em CSS, injetada como variáveis para a interface usar as mesmas cores. */
export function injectCssPalette() {
  const hex = v => '#' + v.toString(16).padStart(6, '0');
  const vars = Object.entries(EDG).map(([k, v]) => `--edg-${k}:${hex(v)}`).join(';');
  document.documentElement.style.cssText += ';' + vars;
}
