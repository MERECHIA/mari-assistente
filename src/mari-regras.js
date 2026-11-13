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
  /* Perda de dinheiro: cuidar do dinheiro e ajuda especializada; cor cinza-azulada, calma, sem alarme */
  perda_financeira:{acoes:['fin','aju'],         cor:0x8d99ae, velocidade:0.003,  pulso:0.04},
  critico:         {acoes:['cvv','samu','aju'],  cor:0xe63946, velocidade:0.004,  pulso:0.05},
  neutro:          {acoes:['resp','imp','aju'],  cor:0x00b4d8, velocidade:0.004,  pulso:0.06}
};
const MOODS_VALIDOS = Object.keys(MOODS);

/* Camada de segurança, fora do modelo, em duas listas, testadas no texto sem acento e em minúsculas.
   Cada item é uma expressão regular.
   EXPRESSOES_RISCO: risco explícito de suicídio ou autolesão. Mostra a mensagem de crise fixa no aparelho, sem chamar
   a IA. EXPRESSOES_ATENCAO: expressões que também aparecem em exageros do dia a dia ("me mata de raiva", "não aguento
   mais esse trânsito", "perdi tudo que escrevi"). Vão para a IA com um aviso de atenção, e ela decide o risco pelo
   sentido; se a IA falhar, a reserva mostra a mensagem de crise fixa, como antes. Juntas, as duas listas contêm todas
   as expressões de antes: sem a IA, nada deixa de acionar a crise */
const EXPRESSOES_RISCO = [
  // Suicídio e morte
  'suic', 'suissid', '\\bmatar a mim\\b',
  '(quero|queria|vou|vontade de|penso em|pensando em|pensei em|pensar em|melhor eu|prefiro|preferia|gostaria de) morrer\\b(?! de)',
  '(vou|quero|queria|vontade de|penso em|pensando em|pensei em|pensar em|planejando|planejo|tentar|tentei|coragem de|coragem pra) (me matar|me mata)\\b',
  'tirar (a )?(minha )?(propria )?vida', 'acabar com (a )?minha vida',
  '(nao|n|naum) quero mais (viver|existir|estar aqui)', 'cansei de viver',
  /* "acabar comigo" só com quem fala como sujeito ("vai acabar comigo"
     é exagero comum); "acordar" só depois de dormir ou com "mais" no fim, sem "mais tarde" e "mais cedo" */
  'acabar com (a )?(minha )?propria vida',
  '(nao|n|naum) quero (mais )?(estar|ficar|continuar|seguir) viv[oa]', '(nao|n|naum) quero viver mais',
  '(penso|pensando|pensei|pensar|quero|queria|vou|vontade de) (em )?acabar comigo', 'acabar comigo mesm[oa]',
  'dormir e (nao|n|naum) (mais )?acordar', '(nao|n|naum) acordar mais\\b(?! (tarde|cedo))', 'dormir (pra|para) sempre',
  '(quero|queria|preferia|prefiro|gostaria de) (nao|n|naum) (existir|ter nascido)', '(nao|n|naum) queria (mais )?existir',
  'vida (nao faz|sem|perdeu o) sentido',
  'melhor sem mim', 'melhor se eu (nao existisse|morresse|sumisse)', 'ninguem (vai )?sentir(ia)? (a )?minha falta',
  /* Falta de motivo ou de forças para viver, não ter nascido, desejo de não
     acordar, método e despedida */
  '(nao|n|naum) (tenho|vejo|tem|ha) (mais )?(motivo|motivos|razao|razoes|forca|forcas|por que|porque|pq) (pra |para |de )?(continuar )?viv',
  '(nunca|nao|n) ter nascido', 'se eu (nao acordasse|morresse|nao existisse)',
  'fechar os olhos e (nao|n|nunca mais) (abrir|acordar)',
  '\\bme (enforcar|enforco)\\b', '\\bme envenenar\\b', '\\boverdose\\b',
  'me jogar (d[aoe]|de uma|de um) (ponte|predio|janela|sacada|viaduto|laje|andar)', 'me jogar na frente d[eoa]',
  'tomar (todos os|todas as|tudo|um monte de|varios|varias|a cartela|uma cartela|a caixa|uma caixa) (de )?(meus |os )?(remedio|comprimido|pilula|calmante)',
  'remedios? (pra|para) tomar tudo',
  '(carta|bilhete) de despedida', 'me despedir de (todos|todo mundo|voces)',
  // Autolesão
  'me machucar', 'me cortar', 'me ferir', '\\bme machuco\\b', '\\bme corto\\b', '\\bme cortando\\b', 'automutil', 'autoles',
  'me (queim|cort|machuc|fer)\\w* de proposito',
];
const EXPRESSOES_ATENCAO = [
  // Morte e "me matar" fora das formas explícitas acima ("vou morrer de vergonha", "meu chefe vai me matar")
  '\\bmorrer\\b', '\\bme matar\\b', '\\bme mata\\b', 'acabar com tudo',
  // Desaparecer, desespero e falta de saída
  '\\bsumir\\b', 'quero desaparecer',
  '(nao|n|naum) aguento mais', 'perdi tudo', '\\bdesesper',
  'nao sei mais o que fazer d[ae] (minha )?vida',
  'nao (vejo|tem|ha) (mais )?saida', 'nao tem mais jeito', '\\bsem saida\\b',
  // Besteira, ir embora de vez, vida acabou e "me cortei"
  'fazer (uma )?besteira', '(ir|vou) embora de vez', '\\bvida acabou\\b', '\\bme cortei\\b',
];
const RE_RISCO = new RegExp(EXPRESSOES_RISCO.join('|'), 'i');
const RE_ATENCAO = new RegExp(EXPRESSOES_ATENCAO.join('|'), 'i');
// Sem a IA, as duas listas mostram a crise
const RE_CRISE_SEM_IA = new RegExp([...EXPRESSOES_RISCO, ...EXPRESSOES_ATENCAO].join('|'), 'i');

/* Regras do fallback por palavras-chave, na ordem de prioridade. O mood de cada regra liga a resposta ao avatar.
   Os textos não prometem efeito ("passa", "ajuda muito"), como o prompt da IA também proíbe */
const REGRAS = [
  /* Crise: as duas listas, acima. A reserva só responde quando a IA falha, então a atenção também vira crise */
  {mood:'critico', re:RE_CRISE_SEM_IA, m:() => MENSAGEM_CRISE, a:['cvv','samu','aju']},
  {mood:'perda_financeira',
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
   O ritmo controla só os botões: os da reserva e os de apoio do humor que acompanham a resposta da IA. O exercício
   que a IA sugere aparece fora do ritmo */
const SUGERE_A_CADA = 3;
const novoRitmo = () => ({desde:Infinity, mood:null});
// É a vez de mostrar os botões? Usado só por registrarResposta; não vai para a IA
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
// Risco explícito: crise no aparelho, sem a IA
const ehCrise = (txt) => testa(RE_RISCO, txt);
// Sinal de atenção: a frase vai para a IA com o aviso (só faz sentido quando ehCrise é falso)
const ehAtencao = (txt) => testa(RE_ATENCAO, txt);
/* Trecho que acionou a atenção, sem acento e em minúsculas ("me matar"), para o aviso dizer à IA o que olhar; vazio
   se nenhum. Só letras, números e espaços, até 60 caracteres, como a função exige */
const trechoAtencao = (txt) => {
  const m = semAcento(txt).toLowerCase().match(RE_ATENCAO);
  return m ? m[0].replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
};

/* Botões de apoio que acompanham a resposta da IA, além do exercício que ela sugerir. Seguem o ritmo das sugestões
   (registrarResposta): aparecem na vez de sugerir ou quando o humor muda */
const APOIO_DO_HUMOR = {triste:['cvv'], vontade_apostar:['aju'], perda_financeira:['fin','aju']};

/* Rodapé de contatos: acompanha toda resposta da reserva por palavras-chave, menos a mensagem de crise, que já tem os
   contatos. As respostas da IA não têm rodapé */
const RODAPE_RESERVA = 'Se precisar de ajuda agora: CVV 188, SAMU 192 ou o CAPS da sua cidade.';
const rodapeDaReserva = (resposta) => resposta && resposta.m !== MENSAGEM_CRISE ? RODAPE_RESERVA : '';

export { A, EXPRESSOES_RISCO, EXPRESSOES_ATENCAO, APOIO_DO_HUMOR, MENSAGEM_CRISE, RODAPE_RESERVA, MOODS, MOODS_VALIDOS, REGRAS, orienta, rodapeDaReserva, ehCrise, ehAtencao, trechoAtencao, semAcento, novoRitmo, vezDeSugerir, registrarResposta };
