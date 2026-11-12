// Mari com IA, sem navegador: detecção do fallback (crise, moods, formas femininas e falsos positivos), botões rápidos
// e ações dos jogos, limites da função api/mari.js e nenhuma chave nos arquivos do repositório.
// A instrução de sistema e o catálogo (src/mari-prompt.js) e o pedido ao Google, com a rede simulada.
// Uso: node test/mari.mjs   (as conversas com o Gemini de verdade ficam em test/mari-dialogos.mjs)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { A, MOODS, REGRAS, MENSAGEM_CRISE, EXPRESSOES_RISCO, EXPRESSOES_ATENCAO, APOIO_DO_HUMOR, orienta, ehCrise, ehAtencao, trechoAtencao, semAcento, novoRitmo, vezDeSugerir, registrarResposta } from '../src/mari-regras.js';
import { TEXTO_RISCO, avisoAtencao, duracaoCopo, montarInstrucao, blocoContexto, sugestaoValida } from '../src/mari-prompt.js';
import { CONFIG } from '../src/config.js';
import { CATALOGO } from '../src/catalogo.js';

const root = fileURLToPath(new URL('..', import.meta.url));
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${name}${detail ? ' | ' + detail : ''}`);
  if (!ok) failures += 1;
};

// Crise em duas camadas. Risco explícito: crise no aparelho, sem chamar a IA
for (const t of ['quero morrer', 'penso em suicídio', 'penso em suicidio',
  'vou me mata', 'quero tirar minha propria vida', 'as vezes eu me corto', 'penso em me ferir',
  'não quero mais viver', 'cansei de viver',
  'a vida não faz sentido', 'todo mundo fica melhor sem mim', 'ninguém sentiria minha falta', 'tenho vontade de me machucar']) {
  check(`crise no aparelho: "${t}"`, ehCrise(t) && orienta(t).mood === 'critico');
}
// Expressões ambíguas: vão para a IA com o aviso de atenção; sem a IA, a reserva mostra a crise como antes
for (const t of ['Não aguento mais', 'n aguento mais', 'perdi tudo', 'Estou desesperada', 'não sei mais o que fazer da minha vida',
  'Não vejo mais saída', 'estou sem saída', 'quero desaparecer', 'quero sumir', 'meu chefe vai me matar', 'vou morrer de vergonha',
  'me mata de raiva', 'acho que vou fazer uma besteira']) {
  check(`atenção: "${t}"`, !ehCrise(t) && ehAtencao(t) && orienta(t).mood === 'critico', `crise=${ehCrise(t)} atencao=${ehAtencao(t)} ${orienta(t).mood}`);
}
// Trecho que acionou a atenção, para o aviso à IA: sem acento, minúsculo, só letras, números e espaços
check('trecho da atenção: "me matar"', trechoAtencao('Meu chefe vai me MATAR!') === 'me matar', trechoAtencao('Meu chefe vai me MATAR!'));
check('trecho da atenção: "nao aguento mais"', trechoAtencao('Não aguento mais') === 'nao aguento mais', trechoAtencao('Não aguento mais'));
check('trecho da atenção vazio sem expressão', trechoAtencao('Estou em paz') === '');
// Nenhuma expressão de antes das duas camadas se perdeu: todas estão numa das listas
const ANTES = ['suic', 'suissid', '\\bmorrer\\b', '\\bme matar\\b', '\\bme mata\\b', '\\bmatar a mim\\b', 'tirar (a )?(minha )?(propria )?vida',
  'acabar com (a )?minha vida', 'acabar com tudo', '\\bsumir\\b', 'quero desaparecer', '(nao|n|naum) aguento mais', 'perdi tudo', '\\bdesesper',
  'nao sei mais o que fazer d[ae] (minha )?vida', 'nao (vejo|tem|ha) (mais )?saida', 'nao tem mais jeito', '\\bsem saida\\b',
  'me machucar', 'me cortar', 'me ferir', '\\bme machuco\\b', '\\bme corto\\b', 'automutil', 'autoles'];
const juntas = [...EXPRESSOES_RISCO, ...EXPRESSOES_ATENCAO];
check('as duas listas contêm todas as expressões de antes', ANTES.every((e) => juntas.includes(e)), ANTES.filter((e) => !juntas.includes(e)).join(', '));
// Categorias novas de risco explícito
for (const t of ['não tenho mais motivo pra viver', 'não vejo razão para continuar vivendo', 'preferia nunca ter nascido', 'queria me enforcar',
  'vou tomar todos os remédios', 'escrevi uma carta de despedida', 'estou me cortando', 'me queimei de propósito', 'vou me jogar da ponte']) {
  check(`crise no aparelho (nova): "${t}"`, ehCrise(t) && orienta(t).mood === 'critico');
}
// Formas comuns que só passam pela atenção, sem crise no aparelho
for (const t of ['vou morrer de rir', 'quero morrer de vergonha', 'esse sapato vai me matar', 'vou me jogar na cama', 'tomar o remédio da pressão', 'me cortei com papel']) {
  check(`sem crise no aparelho: "${t}"`, !ehCrise(t), orienta(t).mood);
}
const crise = orienta('quero morrer');
check('mensagem de crise cita CVV 188, SAMU 192 e CAPS', /188/.test(crise.m) && /192/.test(crise.m) && /CAPS/.test(crise.m));
check('crise oferece ligar 188, ligar 192 e a ajuda especializada', JSON.stringify(crise.a) === '["cvv","samu","aju"]', crise.a.join(','));

// Outras formas de falar em morrer ou não existir, com e sem acento e nas formas "vivo" e "viva"
for (const t of ['quero dormir e não acordar mais', 'quero dormir e nao acordar mais', 'queria dormir e não acordar nunca mais',
  'não quero mais estar vivo', 'não quero mais estar viva', 'nao quero mais estar vivo', 'n quero mais ficar viva', 'não quero viver mais',
  'pensando em acabar comigo', 'penso em acabar comigo mesma', 'vou acabar comigo', 'quero acabar com a minha vida', 'pensei em acabar com a minha própria vida',
  'queria não existir', 'queria nao existir', 'preferia não ter nascido', 'eu não queria mais existir']) {
  check(`crise: "${t}"`, ehCrise(t) && orienta(t).mood === 'critico');
}
// Frases comuns, inclusive parecidas com essas expressões, que não acionam a crise
for (const t of ['morri de rir', 'estou cansado de esperar', 'não aguento esse calor', 'esse trabalho vai acabar comigo',
  'essa fila vai acabar comigo', 'amanhã quero acordar cedo', 'não quero acordar cedo amanhã', 'prefiro não acordar mais tarde que as 8',
  'quero estar viva no show de sábado', 'acabou comigo esse jogo na TV', 'hoje vou dormir cedo']) {
  check(`não é crise: "${t}"`, !ehCrise(t), orienta(t).mood);
}

// Textos fixos da reserva: sem promessa de efeito (como o prompt da IA) e sem formas com gênero
const PROMESSA = /\b(passa|pode ajudar|vai ajudar|ajuda muito|ajuda a|acalma|alivia|relaxa|faz passar|baixa em poucos minutos|diminu\w* a vontade|vai melhorar)\b/i;
const textosFixos = [...REGRAS.map((r) => r.m('')), orienta('xyz').m, MENSAGEM_CRISE];
for (const t of textosFixos) {
  const p = semAcento(t).match(PROMESSA);
  check(`reserva sem promessa de efeito: "${t.slice(0, 40)}…"`, !p, p && p[0]);
  check(`reserva sem gênero: "${t.slice(0, 40)}…"`, !/\bsozinh[oa]s?\b/i.test(t));
}

// Moods do fallback, com formas femininas
const CASOS = {
  'Estou ansiosa': 'ansioso', 'Estou ansioso': 'ansioso', 'estou agitada': 'ansioso',
  'Estou cansada': 'cansado', 'sem energia nenhuma': 'cansado',
  'Estou triste': 'triste', 'me sinto culpada': 'triste', 'Estou mal': 'triste',
  'Estou em paz': 'em_paz', 'Estou bem também': 'em_paz',
  'Estou com vontade de apostar': 'vontade_apostar', 'deu uma fissura agora': 'vontade_apostar',
  'perdi 200 reais ontem': 'perda_financeira', 'estou cheio de dívidas': 'perda_financeira',
  'oi': 'neutro',
};
for (const [t, mood] of Object.entries(CASOS)) check(`mood "${t}" → ${mood}`, orienta(t).mood === mood, orienta(t).mood);
// Frases comuns parecidas com as de crise não disparam a crise
for (const t of ['não tem jeito de arrumar a geladeira', 'não sei mais o que fazer com o jantar', 'vou cortar o cabelo', 'saí da reunião sem sono']) {
  check(`não é crise: "${t}"`, !ehCrise(t), orienta(t).mood);
}
// Palavras dentro de outras não disparam mood
for (const t of ['tambem', 'Tudo normal por aqui', 'No fim de semana fui à praia', 'Meu rapaz chegou', 'Aprendi o alfabeto',
  'Vou matar o tempo vendo série', 'Quero jogar bola', 'Guardei dinheiro hoje']) {
  check(`sem falso positivo: "${t}"`, orienta(t).mood === 'neutro', orienta(t).mood);
}

// Ritmo das sugestões: sugere na primeira resposta e depois a cada três; humor novo e crise sempre mostram
const ritmo = (moods) => { const r = novoRitmo(); return moods.map((m) => [vezDeSugerir(r), registrarResposta(r, m)]); };
const mesmo = ritmo(['ansioso', 'ansioso', 'ansioso', 'ansioso', 'ansioso', 'ansioso', 'ansioso']);
check('mesmo humor: sugere, pula, pula, sugere, pula, pula, sugere', mesmo.map(([, m]) => m).join() === 'true,false,false,true,false,false,true', mesmo.map(([, m]) => m).join());
check('a IA só é avisada para sugerir quando é a vez', mesmo.map(([v]) => v).join() === 'true,false,false,true,false,false,true');
check('humor novo mostra o exercício na hora', ritmo(['ansioso', 'triste', 'triste']).map(([, m]) => m).join() === 'true,true,false');
check('crise sempre mostra os telefones', ritmo(['ansioso', 'critico', 'critico']).map(([, m]) => m).join() === 'true,true,true');
check('neutro não conta como humor novo', ritmo(['ansioso', 'neutro', 'neutro', 'neutro']).map(([, m]) => m).join() === 'true,false,false,true');

// Botões rápidos da página: cada um leva ao mood e ao jogo certos; e toda ação de jogo aponta para um exercício do
// catálogo ou para uma tela do app completo (ajuda e finanças)
const html = readFileSync(join(root, 'public', 'index.html'), 'utf8');
const JOGO = { em_paz: 'areia', ansioso: 'ansiedade', vontade_apostar: 'copo', triste: 'bolhas', cansado: 'devagar' };
const rapidos = html.match(/<div class="rapidos"[\s\S]*?<\/div>/)[0];
const chips = [...rapidos.matchAll(/<button type="button">([^<]+)<\/button>/g)].map((m) => m[1]);
const ESPERADO_CHIP = { 'Estou ansioso': 'ansioso', 'Estou com vontade de apostar': 'vontade_apostar', 'Estou triste': 'triste', 'Estou cansado': 'cansado', 'Estou em paz': 'em_paz' };
for (const [chip, mood] of Object.entries(ESPERADO_CHIP)) {
  const o = orienta(chip);
  check(`botão "${chip}" → ${mood} → ${JOGO[mood]}`, chips.includes(chip) && o.mood === mood && o.a.map((k) => A[k].ir).includes(JOGO[mood]), `${o.mood} ${o.a.join(',')}`);
  check(`MOODS.${mood} leva ao jogo ${JOGO[mood]}`, A[MOODS[mood].acoes[0]].ir === JOGO[mood]);
}
const TELAS_DO_APP = ['ajuda', 'investimentos'];
for (const [k, x] of Object.entries(A)) if (x.ir) check(`ação ${k} → ${x.ir} é exercício do catálogo ou tela do app`, CATALOGO.some((c) => c.id === x.ir) || TELAS_DO_APP.includes(x.ir));

// Instrução de sistema (src/mari-prompt.js): catálogo fixo (src/catalogo.js), sem lacunas
const catalogo = CATALOGO;
const idsCartoes = catalogo.map((x) => x.id);
check('catálogo com ids únicos no formato aceito pela função', new Set(idsCartoes).size === idsCartoes.length && idsCartoes.every((id) => /^[a-z0-9-]{1,30}$/.test(id)), idsCartoes.join(','));
check('cada item do catálogo tem nome e frase da tela', catalogo.every((x) => x.nome && x.frase.length > 20), JSON.stringify(catalogo.find((x) => !x.frase)));
check('nome do catálogo é o do cartão', (catalogo.find((x) => x.id === 'bolhas') || {}).nome === 'Bolhas da tensão');
const instrucao = montarInstrucao(catalogo);
check('instrução sem colchetes por preencher', !/\[(CAT|BLOCO|PREENCHER)/.test(instrucao));
check('instrução lista cada exercício do catálogo', catalogo.every((x) => instrucao.includes('- ' + x.id + ': ' + x.nome)));
check('ids dos exemplos existem no catálogo', [...instrucao.matchAll(/"sugestao":"([^"]+)"/g)].every((m) => catalogo.some((x) => x.id === m[1])));
check('duração do copo vem de config.sessionSeconds', instrucao.includes("copo d'água, de " + duracaoCopo(CONFIG.sessionSeconds)) && duracaoCopo(90) === '90 segundos' && duracaoCopo(180) === '3 minutos');
const aviso = (html.match(/<p class="aviso">(.*?)<\/p>/) || [, ''])[1].replace(/<[^>]+>/g, '');
check('texto de risco é o do aviso da página', aviso.endsWith(TEXTO_RISCO), aviso);
check('contexto destaca a última sugestão', /Última sugestão: Bolhas da tensão\. Não sugira/.test(blocoContexto(catalogo, [], ['areia', 'bolhas'])) && !/Última sugestão/.test(blocoContexto(catalogo, ['areia'], [])));
check('contexto lista feitos e sugeridos com nome', /já fez nesta visita: Areia calma \(areia\)\./.test(blocoContexto(catalogo, ['areia'], [])) && /sugeriu.*: nenhum\./.test(blocoContexto(catalogo, ['areia'], [])));
check('chip: id do catálogo e diferente do último', sugestaoValida('bolhas', catalogo, 'areia') === 'bolhas' && sugestaoValida('areia', catalogo, 'areia') === null && sugestaoValida('aposta', catalogo, null) === null && sugestaoValida(null, catalogo, null) === null);
check('aviso de atenção só quando pedido', blocoContexto(CATALOGO, [], [], true).includes(avisoAtencao(true)) && !/Atenção:/.test(blocoContexto(CATALOGO, [], [])));
check('aviso de atenção cita o trecho', blocoContexto(CATALOGO, [], [], 'me matar').includes('o trecho "me matar"'));
check('botões de apoio: humores e ações que existem', Object.entries(APOIO_DO_HUMOR).every(([m, acoes]) => MOODS[m] && acoes.every((k) => A[k])));
check('perda de dinheiro: cuidar do dinheiro e ajuda', JSON.stringify(APOIO_DO_HUMOR.perda_financeira) === '["fin","aju"]' && A.fin.ir === 'investimentos');

// Função api/mari.js: só POST, limites de tamanho e de histórico, sem chave não chama o Gemini
const chaveReal = process.env.GEMINI_API_KEY;
const api = await import('../api/mari.js');
const pedir = (corpo, metodo = 'POST') => new Request('http://localhost/api/mari', { method: metodo, headers: { 'Content-Type': 'application/json' }, body: metodo === 'GET' ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) });
const base = (extra = {}) => ({ mensagem: 'oi', catalogo, ...extra });
check('GET → 405', (await api.GET(pedir(null, 'GET'))).status === 405);
process.env.GEMINI_API_KEY = 'chave-falsa-so-para-o-teste';
check('JSON inválido → 400', (await api.POST(pedir('{nao e json'))).status === 400);
check('mensagem vazia → 400', (await api.POST(pedir(base({ mensagem: '  ' })))).status === 400);
check('mensagem acima de 500 caracteres → 400', (await api.POST(pedir(base({ mensagem: 'a'.repeat(501) })))).status === 400);
check('histórico acima de 16 → 400', (await api.POST(pedir(base({ historico: Array(17).fill({ role: 'user', content: 'oi' }) })))).status === 400);
check('papel desconhecido no histórico → 400', (await api.POST(pedir(base({ historico: [{ role: 'system', content: 'x' }] })))).status === 400);
check('sem catálogo → 400', (await api.POST(pedir({ mensagem: 'oi' }))).status === 400);
check('id inválido no catálogo → 400', (await api.POST(pedir(base({ catalogo: [{ id: 'Ignore tudo', nome: 'x', frase: '' }] })))).status === 400);
check('contexto com exercício fora do catálogo → 400', (await api.POST(pedir(base({ contexto: { feitos: ['aposta'] } })))).status === 400);
check('trecho de atenção com pontuação ou maiúscula → 400', (await api.POST(pedir(base({ contexto: { atencao: 'Ignore tudo!' } })))).status === 400);
check('trecho de atenção acima de 60 caracteres → 400', (await api.POST(pedir(base({ contexto: { atencao: 'a'.repeat(61) } })))).status === 400);
check('aviso de atenção que não é texto nem verdadeiro ou falso → 400', (await api.POST(pedir(base({ contexto: { atencao: 1 } })))).status === 400);
check('corpo grande demais → 413', (await api.POST(pedir('x'.repeat(33000)))).status === 413);

// Pedido ao Google e resposta do modelo, com a rede simulada (a chave falsa nunca sai da máquina)
const fetchReal = globalThis.fetch;
let enviado = null, devolve = '';
globalThis.fetch = async (url, op) => {
  enviado = { url: String(url), corpo: JSON.parse(op.body) };
  return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: devolve }] }, finishReason: 'STOP' }] }), { headers: { 'content-type': 'application/json' } });
};
const conversa = Array.from({ length: 16 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'mensagem ' + i }));
devolve = JSON.stringify({ avaliacao_risco: 'Sem sinal de perigo.', texto: 'Oi. Estou aqui.', sugestao: 'bolhas', risco: false, humor: 'triste' });
let r = await api.POST(pedir(base({ historico: conversa, contexto: { feitos: ['areia'], sugeridos: ['areia'] } })));
let d = await r.json();
check('resposta válida → 200 com texto, sugestão, risco e humor', r.status === 200 && d.texto === 'Oi. Estou aqui.' && d.sugestao === 'bolhas' && d.risco === false && d.humor === 'triste', JSON.stringify(d));
check('avaliação de risco não volta para o navegador', !('avaliacao_risco' in d), JSON.stringify(d));
const g = enviado.corpo;
check('vai ao Google: 16 mensagens do histórico e a nova, com user e model', g.contents.length === 17 && g.contents[1].role === 'model' && g.contents.at(-1).parts[0].text === 'oi');
check('vai ao Google: instrução com o catálogo e o contexto do app', g.systemInstruction.parts[0].text.includes('- areia: Areia calma') && /já fez nesta visita: Areia calma/.test(g.systemInstruction.parts[0].text));
check('vai ao Google: esquema com texto, sugestao e risco, sugestão só do catálogo', JSON.stringify(g.generationConfig.responseSchema.required) === '["avaliacao_risco","risco","texto","sugestao","humor"]' && JSON.stringify(g.generationConfig.responseSchema.propertyOrdering) === '["avaliacao_risco","risco","texto","sugestao","humor"]' && !g.generationConfig.responseSchema.properties.humor.enum.includes('critico') && JSON.stringify(g.generationConfig.responseSchema.properties.sugestao.enum) === JSON.stringify(idsCartoes));
check('vai ao Google: parâmetros propostos (0,8, 300 tokens, raciocínio mínimo)', g.generationConfig.temperature === 0.8 && g.generationConfig.maxOutputTokens === 300 && g.generationConfig.thinkingConfig.thinkingLevel === 'MINIMAL', JSON.stringify({ t: g.generationConfig.temperature, m: g.generationConfig.maxOutputTokens, th: g.generationConfig.thinkingConfig }));
check('chave no cabeçalho, nunca na URL', !enviado.url.includes('chave-falsa'));
check('raciocínio "padrao" não envia o nível', !('thinkingConfig' in api.parametros({ GEMINI_RACIOCINIO: 'padrao' })) && api.parametros({ GEMINI_TEMPERATURA: '0.7' }).temperature === 0.7 && api.parametros({ GEMINI_TEMPERATURA: '9' }).temperature === 0.8);
devolve = JSON.stringify({ texto: 'Oi.', sugestao: 'site-de-aposta', risco: false, humor: 'critico' });
d = await (await api.POST(pedir(base()))).json();
check('sugestão fora do catálogo vira null', d.sugestao === null);
check('humor fora da lista (ou "critico") vira neutro', d.humor === 'neutro');
for (const [nome, txt] of [['JSON quebrado', '{texto: sem aspas'], ['sem risco', '{"texto":"Oi.","sugestao":null}'], ['texto vazio', '{"texto":" ","sugestao":null,"risco":false}']]) {
  devolve = txt;
  check(`modelo devolve ${nome} → 502`, (await api.POST(pedir(base()))).status === 502);
}

// Modelo de reserva: o fetch simulado responde por modelo (o nome vem na URL)
process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
process.env.GEMINI_MODEL_RESERVA = 'gemini-3.1-flash-lite';
const OK = JSON.stringify({ texto: 'Oi. Estou aqui.', sugestao: null, risco: false, humor: 'neutro' });
const corpoOk = (partes) => JSON.stringify({ candidates: [{ content: { role: 'model', parts: partes }, finishReason: 'STOP' }] });
let chamados = [], plano = {};
globalThis.fetch = async (url, op) => {
  const m = String(url).match(/models\/([^:]+):generateContent/)[1];
  chamados.push(m);
  const p = plano[m];
  if (p === 'timeout') return new Promise((_, rej) => op.signal.addEventListener('abort', () => rej(op.signal.reason)));
  if (p === 'rede') throw new TypeError('fetch failed');
  if (typeof p === 'number') return new Response(JSON.stringify({ error: { code: p, message: 'x', status: 'X' } }), { status: p, headers: { 'content-type': 'application/json' } });
  if (p === 'vazio') return new Response(corpoOk([]), { headers: { 'content-type': 'application/json' } });
  return new Response(corpoOk(Array.isArray(p) ? p : [{ text: OK }]), { headers: { 'content-type': 'application/json' } });
};
const errosReais = console.error; const logs = []; console.error = (...a) => logs.push(a.join(' '));
const cenario = async (p) => { plano = p; chamados = []; const r = await api.POST(pedir(base())); return { status: r.status, d: await r.json(), chamados: chamados.join(',') }; };
const P = 'gemini-3.5-flash-lite', R = 'gemini-3.1-flash-lite';
check('lista de modelos: principal e reserva, sem repetir', JSON.stringify(api.modelos({ GEMINI_MODEL: P, GEMINI_MODEL_RESERVA: R })) === JSON.stringify([P, R]) && JSON.stringify(api.modelos({ GEMINI_MODEL: R, GEMINI_MODEL_RESERVA: R })) === JSON.stringify([R]) && api.modelos({})[1] === R);
{ const falso = 'AQ.chave-de-teste_X';
  const antes = logs.length, m = api.modelos({ GEMINI_MODEL: P, GEMINI_MODEL_RESERVA: falso });
  check('reserva fora do formato (como uma chave) usa o padrão e não vai para o log', JSON.stringify(m) === JSON.stringify([P, R]) && logs.length === antes + 1 && !logs.slice(antes).join(' ').includes(falso)); }
const { MAX_HISTORICO, TIMEOUT_MS: TIMEOUT_NAVEGADOR } = await import('../src/mari-ia.js');
check('timeouts somados abaixo do corte do navegador (src/mari-ia.js)', api.TIMEOUT_MS.principal < api.TIMEOUT_MS.total && api.TIMEOUT_MS.total < TIMEOUT_NAVEGADOR, `${api.TIMEOUT_MS.total} < ${TIMEOUT_NAVEGADOR}`);
check('navegador e função usam o mesmo limite de histórico (16)', MAX_HISTORICO === 16);
let c = await cenario({});
check('a) 3.5 ok → usa só o 3.5', c.status === 200 && c.chamados === P, c.chamados);
c = await cenario({ [P]: 503 });
check('b) 3.5 com 503 → resposta do 3.1', c.status === 200 && c.d.texto === 'Oi. Estou aqui.' && c.chamados === `${P},${R}`, c.chamados);
c = await cenario({ [P]: 429 });
check('b) 3.5 com 429 → resposta do 3.1', c.status === 200 && c.chamados === `${P},${R}`, c.chamados);
const tempos = { ...api.TIMEOUT_MS }; api.TIMEOUT_MS.principal = 80; api.TIMEOUT_MS.total = 200;
// O timer do AbortSignal.timeout não segura o processo do Node; o intervalo segura enquanto espera
const vivo = setInterval(() => {}, 1000);
const t0 = Date.now(); c = await cenario({ [P]: 'timeout' });
check('c) 3.5 com timeout → resposta do 3.1', c.status === 200 && c.chamados === `${P},${R}` && Date.now() - t0 < 2000, `${c.chamados} ${Date.now() - t0} ms`);
const t1 = Date.now(); c = await cenario({ [P]: 'timeout', [R]: 'timeout' });
check('c) os dois com timeout → 504 dentro do tempo total', c.status === 504 && c.chamados === `${P},${R}` && Date.now() - t1 < 400, `${c.status} ${Date.now() - t1} ms`);
clearInterval(vivo);
Object.assign(api.TIMEOUT_MS, tempos);
c = await cenario({ [P]: 'rede' });
check('c) 3.5 com erro de rede → resposta do 3.1', c.status === 200 && c.chamados === `${P},${R}`, c.chamados);
c = await cenario({ [P]: 'vazio' });
check('d) 3.5 com resposta vazia → resposta do 3.1', c.status === 200 && c.chamados === `${P},${R}`, c.chamados);
for (const st of [400, 401, 403]) {
  c = await cenario({ [P]: st });
  check(`e) 3.5 com ${st} → não tenta o 3.1`, c.status === 502 && c.d.erro === 'indisponivel' && c.chamados === P, c.chamados);
}
c = await cenario({ [P]: 503, [R]: 503 });
check('f) os dois com 503 → 502 indisponível (o app usa o fallback por palavras-chave)', c.status === 502 && c.d.erro === 'indisponivel' && c.chamados === `${P},${R}`, `${c.status} ${c.chamados}`);
const meio = Math.floor(OK.length / 2);
c = await cenario({ [P]: [{ text: 'pensando...', thought: true }, { text: OK.slice(0, meio) }, { text: OK.slice(meio) }] });
check('g) várias partes → texto juntado, sem a parte de raciocínio', c.status === 200 && c.d.texto === 'Oi. Estou aqui.' && c.chamados === P, JSON.stringify(c.d));
check('juntarTexto ignora thought e lê todas as partes', api.juntarTexto({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'x', thought: true }, { text: 'b' }] } }] }) === 'ab' && api.juntarTexto({}) === '');
check('log diz qual modelo falhou e por quê, sem a chave', logs.some((l) => l.includes(P) && l.includes('503')) && logs.every((l) => !l.includes('chave-falsa')), logs.slice(0, 2).join(' / '));
console.error = errosReais;
delete process.env.GEMINI_MODEL; delete process.env.GEMINI_MODEL_RESERVA;
globalThis.fetch = fetchReal;
delete process.env.GEMINI_API_KEY;
check('sem chave → 503, sem chamar o Gemini', (await api.POST(pedir(base()))).status === 503);

// Nenhuma chave nos arquivos do repositório (fora de node_modules e dos .env locais, que o .gitignore ignora).
// Este arquivo fica de fora: ele usa chaves falsas de propósito ('chave-falsa-so-para-o-teste')
const CHAVES = /AIza[0-9A-Za-z_-]{35}|\bAQ\.[0-9A-Za-z_-]{20,}|\bsk-[0-9A-Za-z_-]{20,}|GEMINI_API_KEY\s*=\s*['"]?[A-Za-z0-9_.-]{20,}/;
const arquivos = (p) => { const c = join(root, p); return statSync(c).isDirectory() ? readdirSync(c).filter((f) => f !== 'node_modules' && !(f.startsWith('.env') && f !== '.env.example')).flatMap((f) => arquivos(join(p, f))) : [p]; };
const comChave = arquivos('.').filter((f) => f !== join('test', 'mari.mjs') && CHAVES.test(readFileSync(join(root, f), 'utf8')));
check('nenhum arquivo do repositório com chave ou token', comChave.length === 0, comChave.join(', '));
check('.gitignore ignora .env* e libera só o .env.example', /^\.env\*$/m.test(readFileSync(join(root, '.gitignore'), 'utf8')) && /^!\.env\.example$/m.test(readFileSync(join(root, '.gitignore'), 'utf8')));

// Gemini de verdade: as conversas de teste ficam em test/mari-dialogos.mjs (precisa da chave no ambiente)
if (chaveReal) console.log('--    Gemini de verdade: rode node test/mari-dialogos.mjs');

console.log(failures ? `\n${failures} verificação(ões) falharam` : '\ntodas as verificações passaram');
process.exitCode = failures ? 1 : 0;
