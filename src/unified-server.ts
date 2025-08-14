import { serve } from 'bun';
import { handleChatCompletions } from './chat';
import { KNOWN_ENDPOINTS, loadEnvFile, OLLAMA_API_KEY, PORT, OLLAMA_HOST, LOCAL_OLLAMA_HOST, REMOTE_MODELS } from './config';
import { createErrorResponse, generateRequestId } from './errors';
import { handleModels } from './models';

loadEnvFile();

console.log(`Debug: OLLAMA_API_KEY loaded: ${OLLAMA_API_KEY ? 'Yes' : 'No'}`);
console.log(`Debug: OLLAMA_API_KEY length: ${OLLAMA_API_KEY?.length || 0}`);

if (!OLLAMA_API_KEY) {
  console.error('OLLAMA_API_KEY environment variable is required');
  process.exit(1);
}

const UNIFIED_VERSION = '1.0.0';

// ============================================================================
// OLLAMA API TYPES AND INTERFACES
// ============================================================================

interface OllamaRequest {
  model?: string;
}

interface OllamaModel {
  name: string;
  model?: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
  expires_at?: string;
  size_vram?: number;
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

interface OllamaRunningResponse {
  models: OllamaModel[];
}

// ============================================================================
// OLLAMA API HELPER FUNCTIONS
// ============================================================================

// Determine if a model should be routed to remote Ollama.com
const isRemoteModel = (model: string): boolean => {
  return REMOTE_MODELS.includes(model);
};

// Extract model from request body
const extractModelFromRequest = async (req: Request): Promise<string | null> => {
  if (!['POST', 'DELETE'].includes(req.method)) return null;
  
  try {
    const body = await req.json() as OllamaRequest;
    return body.model || null;
  } catch {
    return null;
  }
};

// Extract digest from blob URL path
const extractDigestFromPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/api\/blobs\/(.+)$/);
  return match ? match[1] : null;
};

// Forward request to either local or remote Ollama
const forwardOllamaRequest = async (req: Request, targetHost: string, useAuth: boolean): Promise<Response> => {
  const url = new URL(req.url);
  const targetUrl = new URL(url.pathname + url.search, targetHost);

  const headers = new Headers(req.headers);
  headers.set('host', targetUrl.hostname);
  
  if (useAuth && OLLAMA_API_KEY) {
    headers.set('Authorization', `Bearer ${OLLAMA_API_KEY}`);
    console.log(`[${new Date().toISOString()}] Adding auth header for remote request`);
  } else if (useAuth && !OLLAMA_API_KEY) {
    console.error('Remote routing requested but no OLLAMA_API_KEY found!');
  }

  console.log(`[${new Date().toISOString()}] Ollama ${req.method} ${targetUrl.href} (${useAuth ? 'remote' : 'local'})`);

  try {
    const response = await fetch(targetUrl.href, {
      method: req.method,
      headers,
      body: req.body,
    });

    // Log response status for debugging
    console.log(`[${new Date().toISOString()}] Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok && useAuth) {
      // Log the response body for auth errors
      const errorText = await response.text();
      console.error(`[${new Date().toISOString()}] Remote auth error: ${errorText}`);
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
  const models: OllamaModel[] = [];
  
  // Fetch local models
  try {
    console.log(`[${new Date().toISOString()}] Fetching local models from ${LOCAL_OLLAMA_HOST}`);
    const localResponse = await fetch(`${LOCAL_OLLAMA_HOST}/api/tags`);
    if (localResponse.ok) {
      const localTags: OllamaTagsResponse = await localResponse.json();
      models.push(...localTags.models);
      console.log(`Found ${localTags.models.length} local models`);
    } else {
      console.warn('Local Ollama not available or returned error:', localResponse.status);
    }
  } catch (error) {
    console.warn('Failed to fetch local models:', (error as Error).message);
  }

  // Fetch remote models (only if API key is available)
  if (OLLAMA_API_KEY) {
    try {
      console.log(`[${new Date().toISOString()}] Fetching remote models from ${OLLAMA_HOST}`);
      const remoteResponse = await fetch(`${OLLAMA_HOST}/api/tags`, {
        headers: {
          'Authorization': `Bearer ${OLLAMA_API_KEY}`,
        },
      });
      if (remoteResponse.ok) {
        const remoteTags: OllamaTagsResponse = await remoteResponse.json();
        // Only include models that are in our REMOTE_MODELS list
        const filteredRemoteModels = remoteTags.models.filter(model => 
          REMOTE_MODELS.includes(model.name)
        );
        models.push(...filteredRemoteModels);
        console.log(`Found ${filteredRemoteModels.length} remote models`);
      } else {
        console.warn('Remote Ollama returned error:', remoteResponse.status);
      }
    } catch (error) {
      console.warn('Failed to fetch remote models:', (error as Error).message);
    }
  } else {
    console.warn('No OLLAMA_API_KEY provided, skipping remote models');
  }

  // Remove duplicates (prefer local over remote if same name)
  const uniqueModels = models.reduce((acc: OllamaModel[], current) => {
    const existing = acc.find(model => model.name === current.name);
    if (!existing) {
      acc.push(current);
    }
    return acc;
  }, []);

  console.log(`Returning ${uniqueModels.length} unified models`);
  
  return new Response(JSON.stringify({ models: uniqueModels }), {
    headers: { 'Content-Type': 'application/json' }
  });
};

// Handle unified running models list (/api/ps)
const handleMergedPs = async (): Promise<Response> => {
  const models: OllamaModel[] = [];
  
  // Fetch local running models
  try {
    console.log(`[${new Date().toISOString()}] Fetching local running models from ${LOCAL_OLLAMA_HOST}`);
    const localResponse = await fetch(`${LOCAL_OLLAMA_HOST}/api/ps`);
    if (localResponse.ok) {
      const localPs: OllamaRunningResponse = await localResponse.json();
      // Mark local models
      const localModels = localPs.models.map(model => ({
        ...model,
        _source: 'local' // Add metadata
      }));
      models.push(...localModels);
      console.log(`Found ${localModels.length} local running models`);
    } else {
      console.warn('Local Ollama not available or returned error:', localResponse.status);
    }
  } catch (error) {
    console.warn('Failed to fetch local running models:', (error as Error).message);
  }

  // Fetch remote running models (only if API key is available)
  if (OLLAMA_API_KEY) {
    try {
      console.log(`[${new Date().toISOString()}] Fetching remote running models from ${OLLAMA_HOST}`);
      const remoteResponse = await fetch(`${OLLAMA_HOST}/api/ps`, {
        headers: {
          'Authorization': `Bearer ${OLLAMA_API_KEY}`,
        },
      });
      if (remoteResponse.ok) {
        const remotePs: OllamaRunningResponse = await remoteResponse.json();
        // Only include remote models in our list and mark them
        const filteredRemoteModels = remotePs.models
          .filter(model => REMOTE_MODELS.includes(model.name))
          .map(model => ({
            ...model,
            _source: 'remote' // Add metadata
          }));
        models.push(...filteredRemoteModels);
        console.log(`Found ${filteredRemoteModels.length} remote running models`);
      } else {
        console.warn('Remote Ollama returned error:', remoteResponse.status);
      }
    } catch (error) {
      console.warn('Failed to fetch remote running models:', (error as Error).message);
    }
  }

  console.log(`Returning ${models.length} total running models`);
  
  return new Response(JSON.stringify({ models }), {
    headers: { 'Content-Type': 'application/json' }
  });
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
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Organization',
        },
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
        return createErrorResponse(
          'Embeddings are not supported by this proxy.',
          'invalid_request_error',
          400
        );
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