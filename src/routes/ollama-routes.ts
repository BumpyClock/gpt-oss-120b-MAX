/**
 * Ollama API Routes
 * Handles all /api/* endpoints
 */

import { API_PATHS, HTTP_STATUS } from '../constants';
import { getModelService } from '../services/container';
import { isRemoteModel, extractModelFromRequest, extractDigestFromPath } from '../ollama-utils';

/**
 * Handle unified model listing (/api/tags)
 */
export async function handleUnifiedTags(): Promise<Response> {
  try {
    const modelService = getModelService();
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
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle unified running models list (/api/ps)
 */
export async function handleMergedPs(): Promise<Response> {
  try {
    const modelService = getModelService();
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
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle version endpoint
 */
export async function handleOllamaVersion(): Promise<Response> {
  return new Response(JSON.stringify({
    version: '0.1.48-proxy',
    commit: 'proxy',
    upstream: 'ollama.com'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Route Ollama API requests to appropriate handlers
 */
export async function handleOllamaRoute(
  req: Request, 
  pathname: string
): Promise<Response | null> {
  // Handle unified model listing
  if (pathname === API_PATHS.OLLAMA_TAGS && req.method === 'GET') {
    return handleUnifiedTags();
  }

  // Handle unified running models list
  if (pathname === API_PATHS.OLLAMA_PS && req.method === 'GET') {
    return handleMergedPs();
  }

  // Handle version endpoint
  if (pathname === API_PATHS.OLLAMA_VERSION && req.method === 'GET') {
    return handleOllamaVersion();
  }

  // Handle blob endpoints (always local)
  if (pathname.startsWith(API_PATHS.OLLAMA_BLOBS + '/') && ['HEAD', 'POST'].includes(req.method)) {
    const digest = extractDigestFromPath(pathname);
    if (!digest) {
      return new Response('Invalid blob digest', { status: HTTP_STATUS.BAD_REQUEST });
    }
    // Will be forwarded by proxy
    return null;
  }

  // All other endpoints will be handled by proxy
  return null;
}

/**
 * Determine if request should be routed to remote Ollama
 */
export async function shouldUseRemoteOllama(req: Request, pathname: string): Promise<boolean> {
  // Determine if we should route to remote based on the model
  const model = await extractModelFromRequest(req);
  if (model) {
    return isRemoteModel(model);
  }

  // Check if it's a model operation that needs routing decision
  if (['/api/generate', '/api/chat', '/api/embed', '/api/embeddings', '/api/show'].includes(pathname)) {
    // Default to local for these operations if no model specified
    return false;
  }

  // Default to local for all other operations
  return false;
}