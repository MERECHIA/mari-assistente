/* Mari: regras do fallback por palavras-chave, ações (jogos e telefones) e MOODS da IA. Sem DOM, para os testes
   rodarem no Node (test/mari.mjs). A IA (api/mari.js) só devolve o texto e o mood; o jogo e a rota saem daqui. */

/* Ações que viram botões no chat: jogo do app (ir = rota em ROTAS) ou telefone */
const A = {
  resp:{t:'Respirar com a maré', ir:'ansiedade'}, imp:{t:"Segure o copo d'água", ir:'copo'}, bol:{t:'Soltar as bolhas', ir:'bolhas'},
  dev:{t:'Devagar com a maré', ir:'devagar'}, are:{t:'Areia calma', ir:'areia'}, fin:{t:'Cuidar do seu dinheiro', ir:'investimentos'},
  aju:{t:'Ajuda especializada', ir:'ajuda'}, cvv:{t:'Ligar 188 (CVV)', tel:'188'}, samu:{t:'Ligar 192 (SAMU)', tel:'192'}
};

/* Mensagem de crise fixa: mostrada sem depender da IA, e logo abaixo do texto da IA quando ela marca risco.
   Cita CVV (188), SAMU (192) e CAPS. Diz "sem apoio", e não "sozinho", porque a Mari não sabe o gênero da pessoa */
const MENSAGEM_CRISE =
  'Percebo que a situação está muito difícil agora, e você não precisa passar por isso sem apoio. ' +
  'Se você corre risco imediato, ligue para o SAMU (192) ou vá ao pronto-socorro ou UPA mais próximo. ' +
  'Para conversar agora com alguém, o CVV atende 24 horas pelo 188, de graça. ' +
  'Você também pode buscar atendimento gratuito no CAPS (Centro de Atenção Psicossocial) da sua região, ' +
  'ou procurar um psicólogo ou médico de sua confiança.';

/* Moods: jogo sugerido (ações do app) e comportamento do avatar; velocidade em radianos por quadro e pulso como
   fração da escala */
const MOODS = {
  em_paz:          {acoes:['are'],               cor:0x2ec4b6, velocidade:0.003,  pulso:0.04},
  ansioso:         {acoes:['resp'],              cor:0xff9f1c, velocidade:0.008,  pulso:0.10},
  vontade_apostar: {acoes:['imp','aju'],         cor:0xff7f11, velocidade:0.010,  pulso:0.08},
  triste:          {acoes:['bol','cvv'],         cor:0x4361ee, velocidade:0.002,  pulso:0.03},
  cansado:         {acoes:['dev'],               cor:0x9d4edd, velocidade:0.0015, pulso:0.02},
  critico:         {acoes:['cvv','samu','aju'],  cor:0xe63946, velocidade:0.004,  pulso:0.05},
  neutro:          {acoes:['resp','imp','aju'],  cor:0x00b4d8, velocidade:0.004,  pulso:0.06}
};
const MOODS_VALIDOS = Object.keys(MOODS);

/* Camada de segurança, fora do modelo: expressões de risco de suicídio, autolesão, desespero e falta de saída.
   Testadas no texto sem acento e em minúsculas, antes de qualquer chamada à IA; qualquer uma mostra a mensagem de
   crise fixa. Inclui variações comuns de escrita (abreviações e sem acento). Cada item é uma expressão regular */
const EXPRESSOES_RISCO = [
  // Suicídio e morte
  'suic', 'suissid', '\\bmorrer\\b',
  '\\bme matar\\b', '\\bme mata\\b', '\\bmatar a mim\\b',
  'tirar (a )?(minha )?(propria )?vida', 'acabar com (a )?minha vida', 'acabar com tudo',
  '(nao|n|naum) quero mais (viver|existir|estar aqui)', 'cansei de viver',
  /* "acabar comigo" só com quem fala como sujeito ("vai acabar comigo" é exagero comum); "acordar" só depois de
     dormir ou com "mais" no fim, sem "mais tarde" e "mais cedo" */
  'acabar com (a )?(minha )?propria vida',
  '(nao|n|naum) quero (mais )?(estar|ficar|continuar|seguir) viv[oa]', '(nao|n|naum) quero viver mais',
  '(penso|pensando|pensei|pensar|quero|queria|vou|vontade de) (em )?acabar comigo', 'acabar comigo mesm[oa]',
  'dormir e (nao|n|naum) (mais )?acordar', '(nao|n|naum) acordar mais\\b(?! (tarde|cedo))', 'dormir (pra|para) sempre',
  '(quero|queria|preferia|prefiro|gostaria de) (nao|n|naum) (existir|ter nascido)', '(nao|n|naum) queria (mais )?existir',
  'vida (nao faz|sem|perdeu o) sentido',
  'melhor sem mim', 'melhor se eu (nao existisse|morresse|sumisse)', 'ninguem (vai )?sentir(ia)? (a )?minha falta',
  // Desaparecer, desespero e falta de saída
  '\\bsumir\\b', 'quero desaparecer',
  '(nao|n|naum) aguento mais', 'perdi tudo', '\\bdesesper',
  'nao sei mais o que fazer d[ae] (minha )?vida',
  'nao (vejo|tem|ha) (mais )?saida', 'nao tem mais jeito', '\\bsem saida\\b',
  // Autolesão
  'me machucar', 'me cortar', 'me ferir', '\\bme machuco\\b', '\\bme corto\\b', 'automutil', 'autoles',
];
const RE_RISCO = new RegExp(EXPRESSOES_RISCO.join('|'), 'i');

/* Regras do fallback por palavras-chave, na ordem de prioridade. O mood de cada regra liga a resposta ao avatar.
   Os textos não prometem efeito ("passa", "ajuda muito"), como o prompt da IA também proíbe */
const REGRAS = [
  /* Crise: a lista EXPRESSOES_RISCO, acima */
  {mood:'critico', re:RE_RISCO, m:() => MENSAGEM_CRISE, a:['cvv','samu','aju']},
  {mood:'vontade_apostar',
   re:/perdi|d[ií]vida|devendo|recuperar o que|preju[ií]zo/i,
   m:() => 'Perder dinheiro dói, e a vontade de recuperar é muito forte. Mas tentar recuperar apostando pode puxar você para novas apostas e perdas ainda maiores. Hoje, não aposte mais nada. Respire, e amanhã, com calma, organize as contas uma de cada vez.', a:['fin','aju']},
  {mood:'vontade_apostar',
   re:/apost|\bbets?\b|vontade de (jogar|apostar)|cassino|tigrinho|aviator|fissura|reca[ií]|tenta[cç][aã]o/i,
   m:(n) => 'Obrigada por me contar antes de apostar'+com(n)+'. Agora: feche o app de aposta, deixe o celular longe por 5 minutos e beba um copo d’água. Quer gastar essa energia num jogo sem dinheiro?', a:['imp','aju']},
  {mood:'ansioso',
   re:/ansios|ansiedade|nervos|aflit|preocupad|p[aâ]nico|cora[cç][aã]o acelerado|agitad|inquiet/i,
   m:() => 'Entendi, a ansiedade está apertando. Vamos fazer agora: inspire contando até 4, solte o ar contando até 4. Repita três vezes. Se quiser, eu te guio com a onda.', a:['resp']},
  {mood:'triste',
   re:/trist|sozinh|chorar|chorando|vazio|desabaf|\bmal\b|deprimid|desanimad|culpad|pra baixo/i,
   m:() => 'Sinto muito que esteja pesado. Pode falar, estou aqui para ouvir. Você não precisa resolver tudo agora. Se fizer sentido, mande uma mensagem para alguém de confiança. Se quiser conversar com uma pessoa, o CVV atende 24 horas no 188.', a:['bol','cvv']},
  {mood:'cansado',
   re:/cansad|cansa[cç]o|exaust|esgotad|\bsono\b|estressad|estresse|sem energia/i,
   m:() => 'O cansaço deixa a gente mais vulnerável à vontade de apostar. Tente desacelerar: beba água, alongue o pescoço e os ombros e, se puder, descanse um pouco.', a:['dev']},
  {mood:'em_paz',
   re:/\bpaz\b|\bbem\b|feliz|tranquil|\bcalm[oa]\b|[oó]tim[oa]/i,
   m:(n) => 'Que bom ouvir isso'+com(n)+'! Aproveite para guardar esse momento: o que te ajudou hoje? E se quiser, dá para dar um passo pelo seu dinheiro.', a:['are','fin']},
  {mood:'neutro',
   re:/ajuda|psic[oó]log|tratamento|cl[ií]nica|\bonde\b|terapia|caps/i,
   m:() => 'Dá para conseguir ajuda de graça pelo SUS, com psicólogos particulares ou online e em clínicas de reabilitação. Eu te levo até lá.', a:['aju','cvv']}
];

/* \b do JavaScript não conhece letras acentuadas ("também" teria um "bem" solto): o texto é testado sem acento.
   Toda regra aceita a forma sem acento ([aã], [ií]...) */
const semAcento = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const testa = (re, txt) => re.test(semAcento(txt));
/* Nome da pessoa só quando ela informou (?nome= no endereço): ", Ana" ou nada */
const com = (n) => n ? ', '+n : '';

/* Ritmo das sugestões: para não repetir exercício em toda resposta, a Mari sugere na primeira resposta e depois só a
   cada três (sugere, pula, pula, sugere). Também sugere quando o humor muda, e a crise sempre mostra os telefones.
   Nas respostas sem sugestão, a IA só acolhe e conversa (api/mari.js) e os botões de exercício não aparecem */
const SUGERE_A_CADA = 3;
const novoRitmo = () => ({desde:Infinity, mood:null});
// Antes de responder: é a vez de sugerir? (vai para a IA como "sugerir")
const vezDeSugerir = (r) => r.desde >= SUGERE_A_CADA - 1;
// Depois da resposta: mostra os botões? Atualiza o ritmo
function registrarResposta(r, mood){
  const mostra = mood === 'critico' || vezDeSugerir(r) || (mood !== r.mood && mood !== 'neutro');
  if (mostra){ r.desde = 0; r.mood = mood; } else r.desde += 1;
  return mostra;
}

function orienta(txt, nome = ''){
  for (const r of REGRAS) if (testa(r.re, txt)) return {m:r.m(nome), a:r.a, mood:r.mood};
  return {m:'Obrigada por me contar'+com(nome)+'. Estou aqui com você. Se quiser, escolha uma destas opções:', a:MOODS.neutro.acoes, mood:'neutro'};
}
const ehCrise = (txt) => testa(REGRAS[0].re, txt);

export { A, EXPRESSOES_RISCO, MENSAGEM_CRISE, MOODS, MOODS_VALIDOS, REGRAS, orienta, ehCrise, semAcento, novoRitmo, vezDeSugerir, registrarResposta };
