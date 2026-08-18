export default {
  // Caminhos relativos ao index.html, e não à raiz do domínio. Sem isto o jogo
  // só funciona hospedado na raiz; em portais como o itch.io, que servem numa
  // subpasta, o navegador procuraria /assets na raiz do domínio e abriria uma
  // tela preta.
  base: './',
  // Nada de abrir o navegador sozinho: os testes sobem este mesmo servidor
  // várias vezes, e com `open` cada um deles abria uma aba do jogo no
  // navegador de quem estivesse usando a máquina — uma delas chega a capturar
  // o ponteiro do mouse. Quem abre o navegador é o script `dev`.
  server: { open: false },
  build: { target: 'esnext' },
};
