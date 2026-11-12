// Detecção de crise do app inteiro, frase por frase, como no chat (public/chat.js):
// - crise no aparelho (ehCrise): mensagem de crise fixa, sem chamar a IA (crise_local);
// - sinal de atenção (ehAtencao, quando existe): a frase vai para a IA com o aviso de atenção; se a IA falhar, a
//   reserva por palavras-chave mostra a mensagem fixa;
// - o resto vai para a IA sem aviso. Com a IA respondendo, a mensagem fixa aparece quando ela devolve risco
//   verdadeiro; se a IA falhar, aparece só se a reserva (orienta) cair na regra de crise.
// Cada frase é a primeira mensagem de uma conversa nova. Também mede o app sem a IA (mensagem_sem_ia): o que a
// reserva mostraria com a IA fora do ar. Funciona com o código de antes das duas camadas (sem ehAtencao).
// Mesmo modelo, espera e regras de "não verificada" de test/metricas.mjs. Grava deteccao_crise_app<sufixo>.csv e
// acrescenta o bloco deteccao_crise_app<sufixo> ao resumo.json da pasta, sem mexer no resto (rode depois de
// metricas.mjs, que grava o resumo.json do zero). As frases são de roteiro, nunca de pessoas.
// A chave vem só do ambiente do terminal, nunca de arquivo:  GEMINI_API_KEY=... node test/metricas-crise-completa.mjs
// Opcionais: FRASES=frases-avaliacao-2.json (padrão frases-avaliacao.json), SUFIXO=_conjunto_2, PASTA=resultados/antes
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as regras from '../src/mari-regras.js';
import { CATALOGO } from '../src/catalogo.js';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const pastaSaida = join(raiz, process.env.PASTA || 'resultados');
const arquivoFrases = process.env.FRASES || 'frases-avaliacao.json';
const sufixo = process.env.SUFIXO || '';
if (!/^[a-z0-9_-]*$/.test(sufixo)) { console.log('SUFIXO só com letras minúsculas, números, _ e -'); process.exit(1); }
if (!process.env.GEMINI_API_KEY) {
  console.log('Sem GEMINI_API_KEY no ambiente: nada foi chamado.');
  process.exit(1);
}
process.env.GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const api = await import('../api/mari.js');
const [MODELO_PRINCIPAL, MODELO_RESERVA = ''] = api.modelos();
const ehAtencao = regras.ehAtencao || (() => false);
// Aviso enviado à IA: o trecho, quando o código já o calcula; senão, verdadeiro ou nada
const aviso = (t) => regras.trechoAtencao ? regras.trechoAtencao(t) : ehAtencao(t);
const versao = regras.trechoAtencao ? 'duas camadas, trecho e avaliação' : regras.ehAtencao ? 'duas camadas' : 'uma camada';
const ESPERA_MS = Number(process.env.ESPERA_MS) || 4000;
const ESPERAS_NOVA_TENTATIVA = [20000, 40000];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const execucaoId = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
// A reserva por palavras-chave mostra a mensagem de crise quando cai na regra de crise
const reservaMostraCrise = (frase) => regras.orienta(frase).mood === 'critico';

// Só o modelo e o status de cada pedido ao Google, nunca a conversa nem a chave
let chamadasGoogle = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, op) => {
  const m = String(url?.url ?? url).match(/models\/([^:/?]+):/);
  try {
    const r = await fetchReal(url, op);
    if (m) chamadasGoogle.push({ modelo: m[1], status: r.status });
    return r;
  } catch (e) {
    if (m) chamadasGoogle.push({ modelo: m[1], status: 0 });
    throw e;
  }
};

async function pedir(corpo) {
  await espera(ESPERA_MS);
  chamadasGoogle = [];
  const r = await api.POST(new Request('http://localhost/api/mari', { method: 'POST', body: JSON.stringify(corpo) }));
  const d = await r.json();
  const transitorio = r.status !== 200 && d?.erro === 'indisponivel' && chamadasGoogle.some((c) => c.status === 429 || c.status === 503);
  return { status: r.status, d, transitorio, statusGoogle: chamadasGoogle.map((c) => c.status).join('/') };
}

const classifica = (exibida, deveria) => exibida ? (deveria ? 'verdadeiro_positivo' : 'falso_positivo') : (deveria ? 'falso_negativo' : 'verdadeiro_negativo');
const { frases } = JSON.parse(readFileSync(join(raiz, 'test', arquivoFrases), 'utf8'));
console.log(`Execução ${execucaoId} | ${versao} | ${arquivoFrases} | modelo principal ${MODELO_PRINCIPAL}, reserva ${MODELO_RESERVA || '-'} | ${frases.length} frases`);
const linhas = [];
for (const { frase, esperado } of frases) {
  const local = regras.ehCrise(frase);
  const atencao = !local && ehAtencao(frase);
  let riscoIa = '';
  if (!local) {
    // Conversa nova: sem histórico, nada feito nem sugerido
    const contexto = { feitos: [], sugeridos: [], ...(atencao ? { atencao: aviso(frase) } : {}) };
    const corpo = { mensagem: frase, historico: [], catalogo: CATALOGO, contexto };
    let r = await pedir(corpo);
    for (const ms of ESPERAS_NOVA_TENTATIVA) {
      if (!r.transitorio) break;
      console.log(`  Google ${r.statusGoogle}: nova tentativa em ${ms / 1000} s`);
      await espera(ms); r = await pedir(corpo);
    }
    riscoIa = r.status === 200 ? (r.d.risco ? 'sim' : 'nao') : r.transitorio ? 'nao_verificada' : 'sem_resposta';
  }
  const deveria = esperado === 'crise';
  // Sem resposta da IA, o app mostra a reserva
  const exibida = local || riscoIa === 'sim' || (riscoIa === 'sem_resposta' && reservaMostraCrise(frase));
  const resultado = riscoIa === 'nao_verificada' ? 'nao_verificada' : classifica(exibida, deveria);
  const semIa = local || reservaMostraCrise(frase);
  linhas.push({ execucao_id: execucaoId, versao, frase, esperado, crise_local: local ? 'sim' : 'nao', atencao: atencao ? 'sim' : 'nao',
    risco_ia: riscoIa, mensagem_de_crise_exibida: resultado === 'nao_verificada' ? '' : exibida ? 'sim' : 'nao', resultado,
    mensagem_sem_ia: semIa ? 'sim' : 'nao', resultado_sem_ia: classifica(semIa, deveria) });
  console.log(`  ${resultado.padEnd(20)} local=${local ? 'sim' : 'nao'} atencao=${atencao ? 'sim' : 'nao'} ia=${riscoIa || '-'} | ${frase}`);
}

mkdirSync(pastaSaida, { recursive: true });
const campo = (v) => `"${String(v ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;
const colunas = ['execucao_id', 'versao', 'frase', 'esperado', 'crise_local', 'atencao', 'risco_ia', 'mensagem_de_crise_exibida', 'resultado',
  'mensagem_sem_ia', 'resultado_sem_ia'];
writeFileSync(join(pastaSaida, `deteccao_crise_app${sufixo}.csv`),
  [colunas.join(','), ...linhas.map((l) => colunas.map((c) => campo(l[c])).join(','))].join('\n') + '\n', 'utf8');

const fracao = (a, b) => (b ? Number((a / b).toFixed(4)) : null);
function medidas(campoResultado) {
  const n = (r) => linhas.filter((l) => l[campoResultado] === r).length;
  const vp = n('verdadeiro_positivo'), fp = n('falso_positivo'), vn = n('verdadeiro_negativo'), fn = n('falso_negativo');
  return { precisao: fracao(vp, vp + fp), recall: fracao(vp, vp + fn),
    matriz_de_confusao: { verdadeiro_positivo: vp, falso_positivo: fp, verdadeiro_negativo: vn, falso_negativo: fn, nao_verificada: n('nao_verificada') } };
}
const bloco = {
  execucao_id: execucaoId,
  versao,
  frases_arquivo: arquivoFrases,
  modelo_principal: MODELO_PRINCIPAL,
  frases: linhas.length,
  frases_enviadas_a_ia: linhas.filter((l) => l.crise_local === 'nao').length,
  frases_com_atencao: linhas.filter((l) => l.atencao === 'sim').length,
  frases_sem_resposta_da_ia: linhas.filter((l) => l.risco_ia === 'sem_resposta').length,
  ...medidas('resultado'),
  sem_ia: medidas('resultado_sem_ia'),
};
const arquivoResumo = join(pastaSaida, 'resumo.json');
const resumo = existsSync(arquivoResumo) ? JSON.parse(readFileSync(arquivoResumo, 'utf8')) : {};
resumo[`deteccao_crise_app${sufixo}`] = bloco;
writeFileSync(arquivoResumo, JSON.stringify(resumo, null, 2) + '\n', 'utf8');

console.log('\n' + JSON.stringify(bloco, null, 2));
const lista = (r, c = 'resultado') => linhas.filter((l) => l[c] === r).map((l) => `\n- ${l.frase}${l.risco_ia === 'sem_resposta' ? ' (sem resposta da IA)' : ''}`).join('') || ' nenhuma';
console.log(`\nCom a IA, frases de crise sem a mensagem:${lista('falso_negativo')}`);
console.log(`Com a IA, frases comuns com a mensagem:${lista('falso_positivo')}`);
const naoVerif = linhas.filter((l) => l.resultado === 'nao_verificada');
if (naoVerif.length) console.log(`Não verificadas (Google 429 ou 503): ${naoVerif.map((l) => l.frase).join('; ')}`);
