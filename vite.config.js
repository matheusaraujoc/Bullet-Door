export default {
  // Nada de abrir o navegador sozinho: os testes sobem este mesmo servidor
  // várias vezes, e com `open` cada um deles abria uma aba do jogo no
  // navegador de quem estivesse usando a máquina — uma delas chega a capturar
  // o ponteiro do mouse. Quem abre o navegador é o script `dev`.
  server: { open: false },
  build: { target: 'esnext' },
};
