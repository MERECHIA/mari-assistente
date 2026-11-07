/* Vercel Function POST /api/mari: recebe a mensagem, o histórico da conversa, o catálogo de exercícios e o contexto
   da visita, chama o Gemini e devolve { texto, sugestao, risco, humor }. A chave fica só no servidor, na variável de
   ambiente GEMINI_API_KEY. O conteúdo das mensagens nunca vai para os logs: são dados sensíveis de saúde. */
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { montarInstrucao, blocoContexto } from '../src/mari-prompt.js';
import { MOODS_VALIDOS } from '../src/mari-regras.js';

/* Humor: usado só na animação do avatar do app. Vai no esquema, fora do texto das regras; crise fica com "risco" */
const HUMORES = MOODS_VALIDOS.filter((m) => m !== 'critico');

const LIMITES = { mensagem: 500, historico: 16, corpo: 32000, resposta: 1200, catalogo: 12, nome: 80, frase: 300 };
/* Tempo limite por modelo: o principal tem até 6 s e a reserva fica com o que sobrar do total de 10,5 s (no mínimo
   4,5 s; depois de um 503 rápido, perto de 9 s). O total fica abaixo do corte do navegador (12 s, src/mari-ia.js) e do
   limite da função (maxDuration 15 s, vercel.json) */
const TIMEOUT_MS = { principal: 6000, total: 10500 };
// Erros da própria requisição (payload, chave): a reserva falharia igual, então não troca de modelo
const SEM_TROCA = new Set([400, 401, 403]);

/* Parâmetros de geração, ajustáveis por variável de ambiente sem mexer no código. GEMINI_RACIOCINIO aceita minimal,
   low ou padrao (padrao não envia o nível e usa o do modelo) */
function parametros(env = process.env){
  const num = (v, min, max, padrao) => { const n = Number(v); return v && n >= min && n <= max ? n : padrao; };
  const nivel = { minimal: ThinkingLevel.MINIMAL, low: ThinkingLevel.LOW }[(env.GEMINI_RACIOCINIO || 'minimal').toLowerCase()];
  return {
    temperature: num(env.GEMINI_TEMPERATURA, 0, 2, 0.8),
    maxOutputTokens: num(env.GEMINI_MAX_SAIDA, 64, 2048, 300),
    ...(nivel ? { thinkingConfig: { thinkingLevel: nivel } } : {}),
  };
}

const esquema = (ids) => ({
  type: Type.OBJECT,
  properties: {
    texto: { type: Type.STRING, description: 'Fala da Mari, em português do Brasil' },
    sugestao: { type: Type.STRING, enum: ids, nullable: true, description: 'Id de um exercício do catálogo, ou null' },
    risco: { type: Type.BOOLEAN, description: 'Verdadeiro se houver sinal de risco' },
    humor: { type: Type.STRING, enum: HUMORES, description: 'Estado emocional da pessoa na última mensagem, só para a animação do avatar. Considere negações: "não estou ansioso, estou bem" é em_paz. Sem estado claro, neutro' },
  },
  required: ['texto', 'sugestao', 'risco', 'humor'],
  propertyOrdering: ['texto', 'sugestao', 'risco', 'humor'],
});

const json = (status, corpo, extra = {}) => new Response(JSON.stringify(corpo), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});

const texto = (v, max) => typeof v === 'string' && v.trim() && v.length <= max;

// Valida o corpo; devolve null se algo estiver fora do formato ou dos limites
function validar(corpo) {
  if (!corpo || typeof corpo !== 'object') return null;
  const { mensagem, historico = [], catalogo, contexto = {} } = corpo;
  if (!texto(mensagem, LIMITES.mensagem)) return null;
  if (!Array.isArray(historico) || historico.length > LIMITES.historico) return null;
  for (const h of historico) {
    if (!h || (h.role !== 'user' && h.role !== 'assistant') || typeof h.content !== 'string' || h.content.length > LIMITES.resposta) return null;
  }
  if (!Array.isArray(catalogo) || !catalogo.length || catalogo.length > LIMITES.catalogo) return null;
  for (const x of catalogo) {
    if (!x || typeof x.id !== 'string' || !/^[a-z0-9-]{1,30}$/.test(x.id) || !texto(x.nome, LIMITES.nome) || typeof x.frase !== 'string' || x.frase.length > LIMITES.frase) return null;
  }
  const ids = catalogo.map((x) => x.id);
  const listaDeIds = (v) => Array.isArray(v) && v.length <= 30 && v.every((id) => ids.includes(id));
  const { feitos = [], sugeridos = [] } = contexto || {};
  if (!listaDeIds(feitos) || !listaDeIds(sugeridos)) return null;
  return { mensagem: mensagem.trim(), historico, catalogo, feitos, sugeridos, ids };
}

// Valida o JSON do modelo: texto não vazio, risco verdadeiro ou falso; sugestão fora do catálogo vira null e humor
// fora da lista vira neutro
function resposta(bruto, ids) {
  let r;
  try { r = JSON.parse(bruto); } catch { return null; }
  if (!r || !texto(r.texto, LIMITES.resposta) || typeof r.risco !== 'boolean') return null;
  return { texto: r.texto.trim(), sugestao: ids.includes(r.sugestao) ? r.sugestao : null, risco: r.risco, humor: HUMORES.includes(r.humor) ? r.humor : 'neutro' };
}

/* Modelos em ordem de prioridade: GEMINI_MODEL (vazio usa o apelido do Flash mais recente) e GEMINI_MODEL_RESERVA,
   usado quando o principal falha (503 de alta demanda, demora, resposta vazia) */
/* Só aceita nome de modelo (minúsculas, números, ponto e hífen). Um valor fora do formato é ignorado e troca pelo
   padrão; o log diz só o nome da variável, nunca o valor, para não expor um segredo colado no campo errado */
const NOME_MODELO = /^[a-z0-9][a-z0-9.-]{0,63}$/;
function nomeModelo(env, variavel, padrao){
  const v = (env[variavel] || '').trim();
  if (!v) return padrao;
  if (NOME_MODELO.test(v)) return v;
  console.error('mari: '+variavel+' fora do formato de nome de modelo, usando o padrão');
  return padrao;
}
function modelos(env = process.env){
  const principal = nomeModelo(env, 'GEMINI_MODEL', 'gemini-flash-latest');
  const reserva = nomeModelo(env, 'GEMINI_MODEL_RESERVA', 'gemini-3.1-flash-lite');
  return reserva === principal ? [principal] : [principal, reserva];
}

// Junta o texto de todas as partes do primeiro candidato, sem as de raciocínio ("thought": true)
function juntarTexto(r){
  const partes = r?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(partes)) return '';
  return partes.filter((p) => p && !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
}

const ehTimeout = (e) => e?.name === 'TimeoutError' || e?.name === 'AbortError';

export async function POST(request) {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) return json(503, { erro: 'indisponivel' });

  const bruto = await request.text();
  if (bruto.length > LIMITES.corpo) return json(413, { erro: 'grande_demais' });
  let corpo;
  try { corpo = JSON.parse(bruto); } catch { return json(400, { erro: 'formato' }); }
  const entrada = validar(corpo);
  if (!entrada) return json(400, { erro: 'formato' });

  const contents = [
    ...entrada.historico.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: entrada.mensagem }] },
  ];
  const ai = new GoogleGenAI({ apiKey: chave });
  const lista = modelos();
  let ultimo = 'erro';
  const inicio = Date.now();
  for (let i = 0; i < lista.length; i++) {
    const modelo = lista[i];
    try {
      const r = await ai.models.generateContent({
        model: modelo,
        contents,
        config: {
          systemInstruction: montarInstrucao(entrada.catalogo) + '\n\n' + blocoContexto(entrada.catalogo, entrada.feitos, entrada.sugeridos),
          responseMimeType: 'application/json',
          responseSchema: esquema(entrada.ids),
          ...parametros(),
          // O corte é só do nosso lado: httpOptions.timeout também vira o prazo pedido ao Google, que exige no mínimo 10 s
          abortSignal: AbortSignal.timeout(i === 0 ? TIMEOUT_MS.principal : TIMEOUT_MS.total - (Date.now() - inicio)),
        },
      });
      if (r?.error) throw Object.assign(new Error('erro no JSON'), { name: 'ErroNoJSON', status: r.error.code });
      const bruto = juntarTexto(r);
      if (!bruto.trim()) { ultimo = 'vazio'; console.error('mari: modelo falhou', modelo, 'resposta sem texto', r?.candidates?.[0]?.finishReason || ''); continue; }
      const valida = resposta(bruto, entrada.ids);
      if (!valida) { ultimo = 'invalida'; console.error('mari: modelo falhou', modelo, 'resposta fora do formato'); continue; }
      return json(200, valida);
    } catch (e) {
      // Só o modelo, o tipo do erro e o status, nunca a mensagem da pessoa, o texto do modelo ou a chave
      console.error('mari: modelo falhou', modelo, e?.name || 'erro', e?.status || '');
      if (SEM_TROCA.has(e?.status)) return json(502, { erro: 'indisponivel' });
      ultimo = ehTimeout(e) ? 'timeout' : 'erro';
    }
  }
  if (ultimo === 'invalida' || ultimo === 'vazio') return json(502, { erro: 'resposta_invalida' });
  return json(ultimo === 'timeout' ? 504 : 502, { erro: 'indisponivel' });
}

export { parametros, modelos, juntarTexto, TIMEOUT_MS };

// Qualquer outro método: 405
const naoPermitido = () => json(405, { erro: 'metodo' }, { Allow: 'POST' });
export { naoPermitido as GET, naoPermitido as PUT, naoPermitido as PATCH, naoPermitido as DELETE };
