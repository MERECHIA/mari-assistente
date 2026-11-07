/* Chat mínimo com a Mari, com o mesmo fluxo do app: crise detectada no navegador mostra a mensagem fixa sem chamar
   a IA; senão a IA responde (POST /api/mari); com risco, a mensagem de crise fixa vem logo abaixo; se a IA falhar,
   responde o fallback por palavras-chave. Tudo fica só na memória da página. */
import { A, MENSAGEM_CRISE, MOODS, orienta, ehCrise, novoRitmo, registrarResposta } from './src/mari-regras.js';
import { sugestaoValida } from './src/mari-prompt.js';
import { perguntarIA, MAX_HISTORICO } from './src/mari-ia.js';
import { CATALOGO, APP } from './src/catalogo.js';

const SAUDACAO = 'Oi! Sou a Mari. Se a vontade de apostar estiver difícil de lidar, podemos conversar. Também posso ajudar você a encontrar opções de atendimento e outros recursos de apoio.';
const box = document.getElementById('msgs'), form = document.getElementById('form'), inp = document.getElementById('msg');
const hist = [], sugeridos = [], ritmo = novoRitmo();
let ultimoChip = null;

function bolha(txt, quem, origem){
  const d = document.createElement('div'); d.className = 'mm ' + quem; d.textContent = txt;
  if (origem){ const o = document.createElement('small'); o.className = 'origem'; o.textContent = origem; d.appendChild(o); }
  box.appendChild(d); box.scrollTop = box.scrollHeight; return d;
}
// Botões: telefone vira link tel:, exercício abre o exercício no app completo, em outra aba
function acoes(lista){
  if (!lista || !lista.length) return;
  const w = document.createElement('div'); w.className = 'acoes';
  for (const k of lista){
    const x = A[k], a = document.createElement('a');
    a.textContent = x.tel ? x.t : x.t + ' →';
    if (x.tel) a.href = 'tel:' + x.tel; else { a.href = APP + '#' + x.ir; a.target = '_blank'; a.rel = 'noopener'; }
    w.appendChild(a);
    if (CATALOGO.some((c) => c.id === x.ir)){ sugeridos.push(x.ir); ultimoChip = x.ir; }
  }
  box.appendChild(w); box.scrollTop = box.scrollHeight;
}
const acaoDo = (id) => Object.keys(A).find((k) => A[k].ir === id);

async function envia(txt){
  txt = (txt || '').trim(); if (!txt) return;
  const anteriores = hist.slice(-MAX_HISTORICO);
  bolha(txt, 'eu'); hist.push({ role: 'user', content: txt });
  const dig = bolha('Mari está digitando…', 'ela dig');
  let registro;
  if (ehCrise(txt)){
    dig.remove(); bolha(MENSAGEM_CRISE, 'ela crise', 'crise detectada no navegador, sem chamar a IA'); acoes(MOODS.critico.acoes);
    registro = MENSAGEM_CRISE;
  } else {
    const ia = await perguntarIA(txt, anteriores, { catalogo: CATALOGO, feitos: [], sugeridos });
    dig.remove();
    if (ia){
      bolha(ia.texto, 'ela', 'IA (Gemini)' + (ia.humor ? ', humor: ' + ia.humor : ''));
      registro = ia.texto;
      if (ia.risco){ bolha(MENSAGEM_CRISE, 'ela crise', 'risco marcado pela IA'); acoes(MOODS.critico.acoes); registro += '\n\n' + MENSAGEM_CRISE; }
      else { const id = sugestaoValida(ia.sugestao, CATALOGO, ultimoChip); if (id) acoes([acaoDo(id)]); }
    } else {
      const o = orienta(txt);
      bolha(o.m, 'ela', 'resposta de reserva por palavras-chave (a IA não respondeu)');
      if (registrarResposta(ritmo, o.mood)) acoes(o.a);
      registro = o.m;
    }
  }
  hist.push({ role: 'assistant', content: registro });
}

form.addEventListener('submit', (e) => { e.preventDefault(); const v = inp.value; inp.value = ''; envia(v); });
document.querySelectorAll('.rapidos button').forEach((b) => b.addEventListener('click', () => envia(b.textContent)));
bolha(SAUDACAO, 'ela');
