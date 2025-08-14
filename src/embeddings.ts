import { createErrorResponse } from './errors';
import { OllamaClient } from './clients/ollama-client';
import { createApiHeaders } from './utils/headers';

export interface OpenAIEmbeddingRequest {
  model: string;
  input: string | string[];
  encoding_format?: 'float' | 'base64';
  dimensions?: number;
  user?: string;
}

export interface OpenAIEmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
  options?: Record<string, unknown>;
  keep_alive?: string;
}

export interface OllamaEmbeddingResponse {
  embedding: number[];
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

// Service instance
const ollamaClient = new OllamaClient();

export async function handleEmbeddings(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  
  try {
    const body = await req.json() as OpenAIEmbeddingRequest;
    
    // Validate request
    if (!body.model || !body.input) {
      return createErrorResponse(
        'Missing required fields: model and input',
        'invalid_request_error',
        400,
        requestId
      );
    }

    // Convert input to array format for processing
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    
    if (inputs.length === 0) {
      return createErrorResponse(
        'Input cannot be empty',
        'invalid_request_error',
        400,
        requestId
      );
    }

    // Process each input text
    const embeddings: Array<{ object: 'embedding'; embedding: number[]; index: number }> = [];
    let totalTokens = 0;

    for (let i = 0; i < inputs.length; i++) {
      const text = inputs[i];
      if (typeof text !== 'string') {
        return createErrorResponse(
          'All input items must be strings',
          'invalid_request_error',
          400,
          requestId
        );
      }

      // Prepare Ollama request
      const ollamaRequest: OllamaEmbeddingRequest = {
        model: body.model,
        prompt: text,
        keep_alive: '5m'
      };

      // Call Ollama embeddings API using client
      try {
        const ollamaResult = await ollamaClient.generateEmbeddings(body.model, text);

        if (!ollamaResult.embedding || !Array.isArray(ollamaResult.embedding)) {
          return createErrorResponse(
            'Invalid embedding response from Ollama',
            'api_error',
            500,
            requestId
          );
        }

        embeddings.push({
          object: 'embedding',
          embedding: ollamaResult.embedding,
          index: i
        });

        totalTokens += estimateTokens(text);
      } catch (embedError) {
        console.error(`[${new Date().toISOString()}] Embedding error for text ${i}:`, embedError);
        
        if ((embedError as Error).message.includes('Model')) {
          return createErrorResponse(
            `Model '${body.model}' not found. Make sure it's pulled in Ollama.`,
            'invalid_request_error',
            404,
            requestId
          );
        }
        
        return createErrorResponse(
          'Failed to generate embeddings',
          'api_error',
          500,
          requestId
        );
      }
    }

    // Build OpenAI-compatible response
    const response: OpenAIEmbeddingResponse = {
      object: 'list',
      data: embeddings,
      model: body.model,
      usage: {
        prompt_tokens: totalTokens,
        total_tokens: totalTokens
      }
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: createApiHeaders(requestId)
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Embeddings handler error:`, error);
    return createErrorResponse(
      'Failed to process embeddings request',
      'api_error',
      500,
      requestId
    );
  }
}