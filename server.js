import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = join(process.cwd(), 'public');

const aiServices = [
  {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    async request(message) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: message }],
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error?.message || `OpenAI request failed with status ${response.status}`);
      }

      return data.choices?.[0]?.message?.content || 'No text response returned.';
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    async request(message) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
          max_tokens: 500,
          messages: [{ role: 'user', content: message }],
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error?.message || `Anthropic request failed with status ${response.status}`);
      }

      return data.content?.map((block) => block.text).filter(Boolean).join('\n') || 'No text response returned.';
    },
  },
];

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

async function handleCompare(req, res) {
  try {
    const { message } = await parseJsonBody(req);
    const prompt = typeof message === 'string' ? message.trim() : '';

    if (!prompt) {
      sendJson(res, 400, { error: 'Please submit a message.' });
      return;
    }

    const results = await Promise.allSettled(
      aiServices.map(async (service) => {
        if (!process.env[service.envKey]) {
          throw new Error(`Missing ${service.envKey} on the server.`);
        }

        return {
          id: service.id,
          name: service.name,
          text: await service.request(prompt),
        };
      })
    );

    sendJson(res, 200, {
      responses: results.map((result, index) => {
        const service = aiServices[index];
        return result.status === 'fulfilled'
          ? { ...result.value, status: 'success' }
          : { id: service.id, name: service.name, status: 'error', text: result.reason.message };
      }),
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Unexpected server error.' });
  }
}

async function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const safePath = normalize(requestPath === '/' ? '/index.html' : requestPath).replace(/^\.\.(\/|\\|$)/, '');
  const filePath = join(PUBLIC_DIR, safePath);
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
  };

  try {
    const file = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/compare') {
    handleCompare(req, res);
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`AI orchestrator running at http://localhost:${PORT}`);
});
