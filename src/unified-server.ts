import { serve } from 'bun';
import { handleChatCompletions } from './chat';
import { KNOWN_ENDPOINTS, loadEnvFile, OLLAMA_API_KEY, PORT, LOCAL_OLLAMA_HOST, OLLAMA_HOST, REMOTE_MODELS } from './config';
import { createErrorResponse, generateRequestId } from './errors';
import { handleModels } from './models';
import { handleEmbeddings } from './embeddings';
import { createCorsHeaders } from './utils/headers';
import { OllamaClient } from './clients/ollama-client';
import { ModelService } from './services/model-service';
import { isRemoteModel, extractModelFromRequest, extractDigestFromPath } from './ollama-utils';
import type { OllamaModel } from './types';

loadEnvFile();

// Service instances
const ollamaClient = new OllamaClient();
const modelService = new ModelService();

if (!OLLAMA_API_KEY) {
  console.error('OLLAMA_API_KEY environment variable is required');
  process.exit(1);
}

const UNIFIED_VERSION = '1.0.0';

// ============================================================================
// OLLAMA API HELPER FUNCTIONS
// ============================================================================

// Forward request to either local or remote Ollama
const forwardOllamaRequest = async (req: Request, targetHost: string, useAuth: boolean): Promise<Response> => {
  const url = new URL(req.url);
  const targetUrl = new URL(url.pathname + url.search, targetHost);

  const headers = new Headers(req.headers);
  headers.set('host', targetUrl.hostname);
  
  if (useAuth && OLLAMA_API_KEY) {
    headers.set('Authorization', `Bearer ${OLLAMA_API_KEY}`);
  }

  console.log(`[${new Date().toISOString()}] Ollama ${req.method} ${targetUrl.href} (${useAuth ? 'remote' : 'local'})`);

  try {
    const response = await fetch(targetUrl.href, {
      method: req.method,
      headers,
      body: req.body,
    });

    if (!response.ok && useAuth) {
      const errorText = await response.text();
      return new Response(JSON.stringify({
        error: `Remote authentication failed: ${response.status} ${response.statusText}`,
        details: errorText
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return response with original headers (but update host back)
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('host');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`Error forwarding to ${targetHost}:`, error);
    return new Response(JSON.stringify({
      error: `Failed to connect to ${useAuth ? 'remote' : 'local'} Ollama: ${(error as Error).message}`
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Handle unified model listing (/api/tags)
const handleUnifiedTags = async (): Promise<Response> => {
  try {
    const models = await modelService.getUnifiedModels();
    return new Response(JSON.stringify({ models }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to get unified tags:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch models',
      models: [] 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Handle unified running models list (/api/ps)
const handleMergedPs = async (): Promise<Response> => {
  try {
    const result = await modelService.getRunningModels();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to get running models:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch running models',
      models: [] 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Handle version endpoint
const handleOllamaVersion = async (): Promise<Response> => {
  let localVersion = 'unknown';
  let remoteVersion = 'unknown';
  
  // Get local version
  try {
    const localResponse = await fetch(`${LOCAL_OLLAMA_HOST}/api/version`);
    if (localResponse.ok) {
      const localVersionData = await localResponse.json();
      localVersion = localVersionData.version || 'unknown';
    }
  } catch (error) {
    console.warn('Failed to fetch local version:', (error as Error).message);
  }

  // Get remote version (if API key available)
  if (OLLAMA_API_KEY) {
    try {
      const remoteResponse = await fetch(`${OLLAMA_HOST}/api/version`, {
        headers: {
          'Authorization': `Bearer ${OLLAMA_API_KEY}`,
        },
      });
      if (remoteResponse.ok) {
        const remoteVersionData = await remoteResponse.json();
        remoteVersion = remoteVersionData.version || 'unknown';
      }
    } catch (error) {
      console.warn('Failed to fetch remote version:', (error as Error).message);
    }
  }

  return new Response(JSON.stringify({
    version: UNIFIED_VERSION,
    proxy: 'gpt-oss-120b-max-unified-server',
    local_ollama: localVersion,
    remote_ollama: remoteVersion,
    supported_apis: ['OpenAI v1', 'Ollama'],
    supported_endpoints: [
      // OpenAI endpoints
      'POST /v1/chat/completions',
      'GET /v1/models',
      'POST /v1/completions',
      'POST /v1/embeddings',
      // Ollama endpoints
      'POST /api/generate',
      'POST /api/chat',
      'POST /api/embed',
      'POST /api/embeddings',
      'GET /api/tags',
      'POST /api/show',
      'POST /api/create',
      'POST /api/copy',
      'DELETE /api/delete',
      'POST /api/pull',
      'POST /api/push',
      'GET /api/ps',
      'GET /api/version',
      'HEAD /api/blobs/:digest',
      'POST /api/blobs/:digest'
    ]
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
};

// ============================================================================
// UNIFIED SERVER
// ============================================================================

const server = serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);

    // Handle CORS preflight for both APIs
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: createCorsHeaders(),
      });
    }

    console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname}`);

    // ========================================================================
    // OPENAI API ROUTES (/v1/*)
    // ========================================================================
    if (url.pathname.startsWith('/v1/')) {
      console.log(`[${new Date().toISOString()}] OpenAI API: ${req.method} ${url.pathname}`);

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
        return handleEmbeddings(req);
      }

      // OpenAI API root
      if (url.pathname === '/v1/' && req.method === 'GET') {
        return new Response(JSON.stringify({
          message: 'OpenAI-compatible API server',
          version: '1.0.0',
          endpoints: KNOWN_ENDPOINTS.map(e => `${e.method} ${e.path}`)
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // OpenAI API 404
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
    }

    // ========================================================================
    // OLLAMA API ROUTES (/api/*)
    // ========================================================================
    else if (url.pathname.startsWith('/api/')) {
      console.log(`[${new Date().toISOString()}] Ollama API: ${req.method} ${url.pathname}`);

      // Handle unified model listing
      if (url.pathname === '/api/tags' && req.method === 'GET') {
        return handleUnifiedTags();
      }

      // Handle unified running models list
      if (url.pathname === '/api/ps' && req.method === 'GET') {
        return handleMergedPs();
      }

      // Handle version endpoint
      if (url.pathname === '/api/version' && req.method === 'GET') {
        return handleOllamaVersion();
      }

      // Handle blob endpoints (always local)
      if (url.pathname.startsWith('/api/blobs/') && ['HEAD', 'POST'].includes(req.method)) {
        const digest = extractDigestFromPath(url.pathname);
        if (digest) {
          return forwardOllamaRequest(req, LOCAL_OLLAMA_HOST, false);
        } else {
          return new Response('Invalid blob digest', { status: 400 });
        }
      }

      // For requests that include a model, route based on model type
      if (['POST'].includes(req.method) && 
          ['/api/generate', '/api/chat', '/api/embed', '/api/embeddings', '/api/show'].includes(url.pathname)) {
        
        // Clone request to read body (since we'll need to forward it)
        const clonedReq = req.clone();
        const model = await extractModelFromRequest(clonedReq);
        
        if (model) {
          if (isRemoteModel(model)) {
            return forwardOllamaRequest(req, OLLAMA_HOST, true);
          } else {
            return forwardOllamaRequest(req, LOCAL_OLLAMA_HOST, false);
          }
        }
        // If no model specified, default to local
        return forwardOllamaRequest(req, LOCAL_OLLAMA_HOST, false);
      }

      // For model management endpoints (always use local)
      if (['POST', 'DELETE'].includes(req.method) && 
          ['/api/pull', '/api/push', '/api/create', '/api/delete', '/api/copy'].includes(url.pathname)) {
        return forwardOllamaRequest(req, LOCAL_OLLAMA_HOST, false);
      }

      // For other Ollama endpoints, use local by default
      return forwardOllamaRequest(req, LOCAL_OLLAMA_HOST, false);
    }

    // ========================================================================
    // ROOT AND OTHER ROUTES
    // ========================================================================
    
    // Server root - show both APIs
    if (url.pathname === '/' && req.method === 'GET') {
      return new Response(JSON.stringify({
        message: 'Unified OpenAI + Ollama API Server',
        version: UNIFIED_VERSION,
        apis: {
          openai: {
            base_url: '/v1',
            description: 'OpenAI-compatible API',
            endpoints: KNOWN_ENDPOINTS.map(e => `${e.method} ${e.path}`)
          },
          ollama: {
            base_url: '/api',
            description: 'Complete Ollama API',
            models: {
              local: `Available from ${LOCAL_OLLAMA_HOST}`,
              remote: REMOTE_MODELS
            }
          }
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 404 for everything else
    return new Response(JSON.stringify({
      error: 'Not found - try /v1/* for OpenAI API or /api/* for Ollama API'
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  },
});

console.log(`🚀 Unified OpenAI + Ollama server running on http://localhost:${PORT}`);
console.log(`📍 OpenAI API: http://localhost:${PORT}/v1`);
console.log(`📍 Ollama API: http://localhost:${PORT}/api`);
console.log(`📍 Local Ollama: ${LOCAL_OLLAMA_HOST}`);
console.log(`☁️  Remote Ollama: ${OLLAMA_HOST}`);
console.log(`🎯 Remote models: ${REMOTE_MODELS.join(', ')}`);
console.log(`🔑 Auth configured: ${OLLAMA_API_KEY ? 'Yes' : 'No'}`);
console.log(`🎭 APIs: OpenAI v1 + Complete Ollama (20+ endpoints)`);

process.on('SIGINT', () => {
  console.log('\nShutting down unified server...');
  server.stop();
  process.exit(0);
});