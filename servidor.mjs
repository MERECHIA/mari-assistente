/* Servidor local, sem dependências: serve a página de public/, os módulos de src/ que o navegador usa e atende
   POST /api/mari chamando a mesma função que roda na Vercel (api/mari.js).
   A chave vem da variável de ambiente GEMINI_API_KEY ou de um arquivo .env na raiz (que o .gitignore ignora).
   Uso: npm start  (ou PORTA=3000 npm start) */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('.', import.meta.url));

// .env simples (NOME=valor por linha); não sobrescreve o que já veio do ambiente
const arquivoEnv = join(raiz, '.env');
if (existsSync(arquivoEnv)) {
  for (const linha of readFileSync(arquivoEnv, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const api = await import('./api/mari.js');

// Lista de permissão: só estes arquivos são servidos (nunca .env, testes ou a função)
const ARQUIVOS = {
  '/': 'public/index.html',
  '/index.html': 'public/index.html',
  '/chat.js': 'public/chat.js',
  '/src/mari-regras.js': 'src/mari-regras.js',
  '/src/mari-prompt.js': 'src/mari-prompt.js',
  '/src/mari-ia.js': 'src/mari-ia.js',
  '/src/config.js': 'src/config.js',
  '/src/catalogo.js': 'src/catalogo.js',
};
const TIPOS = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8' };

const servidor = createServer(async (req, res) => {
  const caminho = new URL(req.url, 'http://localhost').pathname;
  try {
    if (caminho === '/api/mari') {
      const partes = [];
      for await (const p of req) partes.push(p);
      const pedido = new Request('http://localhost/api/mari', {
        method: req.method,
        headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(partes),
      });
      const tratar = api[req.method] || api.GET;
      const r = await tratar(pedido);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(await r.text());
      return;
    }
    const arquivo = ARQUIVOS[caminho];
    if (!arquivo) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[arquivo.split('.').pop()], 'Cache-Control': 'no-store' });
    res.end(await readFile(join(raiz, arquivo)));
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Erro');
  }
});

const porta = Number(process.env.PORTA) || 3000;
servidor.listen(porta, '127.0.0.1', () => {
  console.log(`Mari em http://localhost:${porta}`);
  if (!process.env.GEMINI_API_KEY) console.log('Sem GEMINI_API_KEY: a Mari vai responder pela reserva por palavras-chave.');
});
