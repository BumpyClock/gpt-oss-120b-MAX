import {serve} from 'bun';
import {handleChatCompletions} from './chat';
import {KNOWN_ENDPOINTS, loadEnvFile, OLLAMA_API_KEY, PORT} from './config';
import {createErrorResponse} from './errors';
import {handleModels} from './models';

loadEnvFile();

if (!OLLAMA_API_KEY) {
  console.error('OLLAMA_API_KEY environment variable is required');
  process.exit(1);
}

const server = serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    console.log(`${new Date().toISOString()} - ${req.method} ${url.pathname}`);

    if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
      return handleChatCompletions(req);
    }

    if (url.pathname === '/v1/models' && req.method === 'GET') {
      return handleModels(req);
    }

    if (url.pathname === '/v1/completions' && req.method === 'POST') {
      return createErrorResponse(
        'The Completions API is deprecated. Please use /v1/chat/completions instead.',
        'invalid_request_error',
        400
      );
    }

    if (url.pathname === '/v1/embeddings' && req.method === 'POST') {
      return createErrorResponse(
        'Embeddings are not supported by this proxy.',
        'invalid_request_error',
        400
      );
    }

    if (url.pathname === '/' && req.method === 'GET') {
      return new Response(JSON.stringify({
        message: 'OpenAI-compatible API server',
        version: '1.0.0',
        endpoints: KNOWN_ENDPOINTS.map(e => `${e.method} ${e.path}`)
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      error: {
        message: 'Not found',
        type: 'invalid_request_error'
      },
      endpoints: KNOWN_ENDPOINTS.map(e => `${e.method} ${e.path}`)
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  },
});

console.log('🚀 OpenAI-compatible v1 API server running on http://localhost:3304');
