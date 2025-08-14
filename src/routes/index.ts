/**
 * Route Registry
 * Central routing logic for all API endpoints
 */

import { handleOpenAIRoute } from './openai-routes';
import { handleOllamaRoute } from './ollama-routes';
import { API_PATHS } from '../constants';

/**
 * Main routing function
 * Determines which API to route to based on path
 */
export async function routeRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // OpenAI API routes (/v1/*)
  if (pathname.startsWith(API_PATHS.OPENAI_BASE)) {
    return handleOpenAIRoute(req, pathname);
  }

  // Ollama API routes (/api/*)
  if (pathname.startsWith(API_PATHS.OLLAMA_BASE)) {
    return handleOllamaRoute(req, pathname);
  }

  // Root endpoint
  if (pathname === '/') {
    return new Response(JSON.stringify({
      message: 'Unified OpenAI + Ollama API Server',
      apis: {
        openai: `${API_PATHS.OPENAI_BASE}/*`,
        ollama: `${API_PATHS.OLLAMA_BASE}/*`
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // No matching route
  return null;
}

export { handleOpenAIRoute } from './openai-routes';
export { handleOllamaRoute } from './ollama-routes';
export { shouldUseRemoteOllama } from './ollama-routes';