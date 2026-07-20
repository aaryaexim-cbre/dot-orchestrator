import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = join(process.cwd(), 'public');
const REQUEST_TIMEOUT_MS = 30000;

const RESPONSE_FIELDS = ['verdict', 'confidence', 'reasoning'];
const SYNTHESIS_FIELDS = ['agreement', 'conflict', 'missing_information', 'next_best_question'];

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getOpenRouterModel(envModelKey, fallback) {
  return process.env[envModelKey] || fallback;
}

function createOpenRouterService({ id, modelEnvKey, fallbackModel }) {
  return {
    id,
    name: getOpenRouterModel(modelEnvKey, fallbackModel),
    envKey: 'OPENROUTER_API_KEY',
    modelEnvKey,
    fallbackModel,
    async request(messages) {
      const model = getOpenRouterModel(modelEnvKey, fallbackModel);
      console.log(`[OpenRouter] Calling model: ${model}`);
      const response = await fetchWithTimeout(
        OPENROUTER_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0,
            response_format: { type: 'json_object' },
          }),
        },
        REQUEST_TIMEOUT_MS
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data.error?.message || `OpenRouter request failed with status ${response.status}`;
        console.log(`[OpenRouter] Error: ${message}`);
        throw new Error(`OpenRouter model ${model} failed: ${message}`);
      }

      console.log(`[OpenRouter] Success: ${model}`);
      return data.choices?.[0]?.message?.content || '';
    },
  };
}

function createOpenAIService({ id, modelEnvKey, fallbackModel }) {
  return {
    id,
    name: process.env[modelEnvKey] || fallbackModel,
    envKey: 'OPENAI_API_KEY',
    modelEnvKey,
    fallbackModel,
    async request(messages) {
      const model = process.env[modelEnvKey] || fallbackModel;
      console.log(`[OpenAI] Calling model: ${model}`);
      const response = await fetchWithTimeout(
        OPENAI_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages,
            response_format: { type: 'json_object' },
            reasoning_effort: 'low',
          }),
        },
        REQUEST_TIMEOUT_MS
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data.error?.message || `OpenAI request failed with status ${response.status}`;
        console.log(`[OpenAI] Error: ${message}`);
        throw new Error(`OpenAI model ${model} failed: ${message}`);
      }

      console.log(`[OpenAI] Success: ${model}`);
      return data.choices?.[0]?.message?.content || '';
    },
  };
}

const aiServices = [
  createOpenAIService({
    id: 'openai-a',
    modelEnvKey: 'OPENAI_MODEL',
    fallbackModel: 'gpt-5.6-terra',
  }),
  createOpenRouterService({
    id: 'openrouter-b',
    modelEnvKey: 'OPENROUTER_MODEL_B',
    fallbackModel: 'qwen/qwen3-coder:free',
  }),
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

function buildModelPrompt(question) {
  return [
    {
      role: 'system',
      content:
        'You answer user questions for a side-by-side AI comparison demo. Return only valid JSON with exactly these string fields: verdict, confidence, reasoning. Keep the answer useful, concise, and deterministic. Do not include markdown.',
    },
    {
      role: 'user',
      content: `Question: ${question}\n\nReturn JSON only in this shape: {"verdict":"...","confidence":"...","reasoning":"..."}`,
    },
  ];
}

function buildSynthesisPrompt(question, responses) {
  return [
    {
      role: 'system',
      content:
        'You synthesize two structured model answers. Return only valid JSON with exactly these string fields: agreement, conflict, missing_information, next_best_question. Do not summarize generically. Identify the underlying assumption, interpretation, or premise that causes disagreement. Do not include markdown.',
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          task:
            'Find where the models truly agree, where they differ by naming the specific differing assumption, what single missing fact would most reduce uncertainty, and what single follow-up question would best resolve that uncertainty.',
          critical_conflict_requirement:
            'The conflict field must explicitly name the specific differing assumption, interpretation, or premise causing disagreement. Do not merely say the models reached different conclusions.',
          question,
          model_outputs: responses.map(({ name, data }) => ({ model: name, ...data })),
          output_shape: {
            agreement: 'Where both models materially align.',
            conflict:
              'The specific differing assumption, interpretation, or premise causing disagreement, or a clear statement that no material conflict exists and why.',
            missing_information: 'The single most important missing fact or input.',
            next_best_question: 'The one follow-up question the user should ask next.',
          },
        },
        null,
        2
      ),
    },
  ];
}

function parseStructuredJson(text, fields) {
  const trimmed = String(text || '').trim();
  const jsonText = trimmed.startsWith('{') ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) {
    throw new Error('Model returned no JSON object.');
  }

  const parsed = JSON.parse(jsonText);
  const normalized = {};
  for (const field of fields) {
    if (typeof parsed[field] !== 'string' || !parsed[field].trim()) {
      throw new Error(`Model response is missing ${field}.`);
    }
    normalized[field] = parsed[field].trim();
  }
  return normalized;
}

async function runService(service, prompt) {
  if (!process.env[service.envKey]) {
    throw new Error(`Missing ${service.envKey} on the server.`);
  }

  const text = await service.request(prompt);
  return parseStructuredJson(text, RESPONSE_FIELDS);
}

async function runSynthesis(question, successfulResponses) {
  const service = aiServices.find(({ envKey }) => process.env[envKey]);
  if (!service) {
    throw new Error('Missing an AI API key for synthesis.');
  }

  const text = await service.request(buildSynthesisPrompt(question, successfulResponses));
  return {
    model: service.name,
    data: parseStructuredJson(text, SYNTHESIS_FIELDS),
  };
}

async function handleCompare(req, res) {
  try {
    const { message } = await parseJsonBody(req);
    const prompt = typeof message === 'string' ? message.trim() : '';

    if (!prompt) {
      sendJson(res, 400, { error: 'Please submit a message.' });
      return;
    }

    console.log(`[Compare] New question: ${prompt}`);

    const results = await Promise.allSettled(
      aiServices.map(async (service) => ({
        id: service.id,
        name: service.name,
        data: await runService(service, buildModelPrompt(prompt)),
      }))
    );

    const responses = results.map((result, index) => {
      const service = aiServices[index];
      return result.status === 'fulfilled'
        ? { ...result.value, status: 'success' }
        : { id: service.id, name: service.name, status: 'error', error: result.reason.message };
    });

    const successfulResponses = responses.filter((response) => response.status === 'success');
    const payload = { responses, synthesis: null };

    if (successfulResponses.length === aiServices.length) {
      try {
        console.log('[Synthesis] Both models succeeded, running synthesis...');
        payload.synthesis = { status: 'success', ...(await runSynthesis(prompt, successfulResponses)) };
        console.log('[Synthesis] Complete.');
      } catch (error) {
        console.log(`[Synthesis] Error: ${error.message}`);
        payload.synthesis = { status: 'error', error: error.message || 'Synthesis failed.' };
      }
    } else {
      console.log('[Synthesis] Skipped, not all models succeeded.');
    }

    sendJson(res, 200, payload);
  } catch (error) {
    console.log(`[Compare] Unexpected error: ${error.message}`);
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