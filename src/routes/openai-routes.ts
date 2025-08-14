/**
 * OpenAI API Routes
 * Handles all /v1/* endpoints
 */

import { handleChatCompletions } from '../chat';
import { handleModels } from '../models';
import { handleEmbeddings } from '../embeddings';
import { createErrorResponse } from '../errors';
import { API_PATHS, HTTP_STATUS, ERROR_MESSAGES } from '../constants';

/**
 * Route OpenAI API requests to appropriate handlers
 */
export async function handleOpenAIRoute(req: Request, pathname: string): Promise<Response | null> {
  // Models endpoint
  if (pathname === API_PATHS.OPENAI_MODELS && req.method === 'GET') {
    return handleModels(req);
  }

  // Chat completions endpoint
  if (pathname === API_PATHS.OPENAI_CHAT && req.method === 'POST') {
    return handleChatCompletions(req);
  }

  // Legacy completions endpoint
  if (pathname === API_PATHS.OPENAI_COMPLETIONS && req.method === 'POST') {
    return createErrorResponse(
      'Completions endpoint is not supported. Please use /v1/chat/completions instead.',
      'invalid_request_error',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // Embeddings endpoint
  if (pathname === API_PATHS.OPENAI_EMBEDDINGS && req.method === 'POST') {
    return handleEmbeddings(req);
  }

  // OpenAI API root
  if (pathname === API_PATHS.OPENAI_BASE + '/' && req.method === 'GET') {
    return new Response(JSON.stringify({
      message: 'OpenAI-compatible API server',
      version: '1.0.0',
      endpoints: [
        'GET /v1/models',
        'POST /v1/chat/completions',
        'POST /v1/embeddings',
      ]
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // No matching route
  return null;
}