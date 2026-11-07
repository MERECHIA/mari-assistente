/* Catálogo fixo dos exercícios do app: id da rota, nome do cartão e a frase da tela do exercício.
   No app completo ele é montado a partir dos cartões da tela inicial; aqui fica escrito à mão, com os mesmos textos. */
export const CATALOGO = [
  { id: 'ansiedade', nome: 'Controlar a ansiedade', frase: 'Segure o botão (ou o mar) e respire com a onda até ele acalmar.' },
  { id: 'copo', nome: "Segure o copo d'água", frase: 'A maré balança a água do copo. Mantenha tudo calmo, no seu ritmo, até a maré passar.' },
  { id: 'bolhas', nome: 'Bolhas da tensão', frase: 'Cada bolha carrega uma coisa que pesa. Segure o dedo em cima dela, sem pressa, até ela se desfazer.' },
  { id: 'devagar', nome: 'Devagar com a maré', frase: 'A pressa é o motor do impulso. Coloque o dedo na bolinha e acompanhe o ritmo dela até o fim do caminho. Se correr na frente, ela espera.' },
  { id: 'areia', nome: 'Areia calma', frase: 'Desenhe na areia com o dedo, do jeito que quiser. A cada respiração a maré sobe e vai apagando o desenho, devagar.' },
];

// Endereço do app completo, para os botões de exercício abrirem o exercício de verdade
export const APP = 'https://mare-app-delta.vercel.app/';
