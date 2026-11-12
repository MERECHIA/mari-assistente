/* Mari: chamada à IA (POST /api/mari, Vercel Function com o Gemini). Envia a mensagem, as últimas 16 mensagens da
   conversa, o catálogo de exercícios e o contexto da visita (exercícios feitos, sugestões da Mari e, quando a mensagem
   tem uma expressão de EXPRESSOES_ATENCAO, o aviso de atenção), tudo só da memória da página. Devolve { texto, sugestao, risco, humor } ou null em qualquer falha (sem rede, sem chave, timeout,
   JSON inválido); quem chama usa então o fallback por palavras-chave. A chave nunca passa pelo navegador. */
const TIMEOUT_MS = 12000;   // acima do tempo total do servidor com os dois modelos do Gemini (10,5 s)
const MAX_HISTORICO = 16;
const MAX_TEXTO = 500;

async function perguntarIA(mensagem, historico, {catalogo, feitos = [], sugeridos = [], atencao = ''}){
  try{
    const r = await fetch('/api/mari', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        mensagem:String(mensagem).slice(0, MAX_TEXTO),
        historico:historico.slice(-MAX_HISTORICO).map(h => ({role:h.role, content:String(h.content).slice(0, 1200)})),
        catalogo,
        contexto:{feitos, sugeridos:sugeridos.slice(-30), ...(atencao ? {atencao} : {})}
      }),
      signal:AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || typeof d.texto !== 'string' || !d.texto.trim() || typeof d.risco !== 'boolean') return null;
    return {texto:d.texto.trim(), sugestao:typeof d.sugestao === 'string' ? d.sugestao : null, risco:d.risco, humor:typeof d.humor === 'string' ? d.humor : null};
  }catch(_){ return null; }
}

export { perguntarIA, MAX_HISTORICO, TIMEOUT_MS };
