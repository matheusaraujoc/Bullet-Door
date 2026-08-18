/**
 * Caminho de um arquivo em public/, respeitando onde a página está hospedada.
 *
 * Existe por causa de portais como o itch.io, que servem o jogo dentro de um
 * subcaminho (algo como .../html/1234567/index.html). Um caminho começando com
 * "/" aponta para a RAIZ do domínio e some — o jogo abre numa tela preta, sem
 * modelo nenhum. Com a base relativa do build, tudo continua sendo resolvido a
 * partir da pasta onde o index.html estiver.
 *
 * @param {string} caminho relativo a public/, sem barra inicial
 */
export function asset(caminho) {
  const base = import.meta.env?.BASE_URL ?? './';
  return `${base}${base.endsWith('/') ? '' : '/'}${caminho.replace(/^\//, '')}`;
}
