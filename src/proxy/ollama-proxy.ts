/**
 * Ollama Proxy
 * Handles request forwarding to local or remote Ollama instances
 */

import { OLLAMA_HOST, OLLAMA_API_KEY, LOCAL_OLLAMA_HOST } from '../config';
import { HTTP_STATUS } from '../constants';

/**
 * Forward request to Ollama (local or remote)
 */
export async function forwardOllamaRequest(
  req: Request,
  targetHost: string,
  useAuth: boolean
): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = `${targetHost}${url.pathname}${url.search}`;
  
  console.log(`[${new Date().toISOString()}] Forwarding to ${targetUrl}`);

  try {
    // Clone request headers
    const headers = new Headers(req.headers);
    headers.delete('host');
    
    // Add auth for remote requests
    if (useAuth && OLLAMA_API_KEY) {
      headers.set('Authorization', `Bearer ${OLLAMA_API_KEY}`);
    }

    // Handle GET/HEAD/DELETE (no body) vs POST/PUT/PATCH (with body)
    let forwardOptions: RequestInit = {
      method: req.method,
      headers: headers,
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const body = await req.blob();
      forwardOptions.body = body;
    }

    const response = await fetch(targetUrl, forwardOptions);

    if (!response.ok) {
      console.warn(`Ollama returned ${response.status}: ${response.statusText}`);
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
      status: HTTP_STATUS.BAD_GATEWAY,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Forward to local Ollama instance
 */
export function forwardToLocalOllama(req: Request): Promise<Response> {
  return forwardOllamaRequest(req, LOCAL_OLLAMA_HOST, false);
}

/**
 * Forward to remote Ollama instance with authentication
 */
export function forwardToRemoteOllama(req: Request): Promise<Response> {
  return forwardOllamaRequest(req, OLLAMA_HOST, true);
}