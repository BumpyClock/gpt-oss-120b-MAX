import { serve } from 'bun';
import { readFileSync } from 'fs';

const loadEnvFile = () => {
  try {
    const envContent = readFileSync('.env', 'utf-8');
    const envVars = envContent.split('\n').reduce((acc, line) => {
      const [key, value] = line.split('=');
      if (key && value) {
        acc[key.trim()] = value.trim();
      }
      return acc;
    }, {} as Record<string, string>);

    Object.entries(envVars).forEach(([key, value]) => {
      process.env[key] = value;
    });
  } catch (error) {
    console.warn('Could not load .env file:', error.message);
  }
};

loadEnvFile();

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const PORT = 3304;
const OLLAMA_HOST = 'https://ollama.com';

if (!OLLAMA_API_KEY) {
  console.error('OLLAMA_API_KEY environment variable is required');
  process.exit(1);
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{type: string; text?: string; image_url?: any}>;
}

interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

interface OpenAIChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: 'stop' | 'length' | null;
}

interface OpenAIChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const convertContentToString = (content: string | Array<{type: string; text?: string; image_url?: any}>): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(item => item.type === 'text' && item.text)
      .map(item => item.text)
      .join(' ');
  }

  return '';
};

const convertToOllamaMessages = (messages: OpenAIMessage[]) => {
  return messages.map(msg => ({
    role: msg.role,
    content: convertContentToString(msg.content)
  }));
};

const generateId = () => 'chatcmpl-' + Math.random().toString(36).substring(2, 15);

const handleChatCompletions = async (req: Request) => {
  try {
    const body: OpenAIChatRequest = await req.json();
    const { model, messages, stream = false, temperature, max_tokens } = body;

    if (!model || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Invalid request: model and messages are required',
            type: 'invalid_request_error'
          }
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    for (const message of messages) {
      if (!message.role || !message.content) {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Invalid message format: role and content are required',
              type: 'invalid_request_error'
            }
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      const contentStr = convertContentToString(message.content);
      if (contentStr.length > 200000) {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Message content too large (max 200000 characters)',
              type: 'invalid_request_error'
            }
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    }

    const ollamaMessages = convertToOllamaMessages(messages);

    const options: any = {};
    if (temperature !== undefined) options.temperature = temperature;
    if (max_tokens !== undefined) options.num_predict = max_tokens;

    const ollamaRequest: any = {
      model,
      messages: ollamaMessages,
      stream
    };

    if (Object.keys(options).length > 0) {
      ollamaRequest.options = options;
    }

    if (stream) {
      return handleStreamingChat(ollamaRequest, model);
    }

    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OLLAMA_API_KEY}`,
      },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Ollama error ${response.status}:`, errorText);
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }
    const ollamaResponse = await response.json();

    const openaiResponse: OpenAIChatResponse = {
      id: generateId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: ollamaResponse.message?.content || ''
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: ollamaResponse.prompt_eval_count || 0,
        completion_tokens: ollamaResponse.eval_count || 0,
        total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0)
      }
    };

    return new Response(JSON.stringify(openaiResponse), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Chat completions error:', error);
    return new Response(
      JSON.stringify({
        error: {
          message: error.message || 'Internal server error',
          type: 'internal_server_error'
        }
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

const handleStreamingChat = async (ollamaRequest: any, model: string) => {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isControllerClosed = false;
      let hasReturned = false;

      const safeEnqueue = (data: Uint8Array) => {
        try {
          if (!isControllerClosed && !hasReturned) {
            controller.enqueue(data);
          }
        } catch (error) {
          if (!isControllerClosed) {
            isControllerClosed = true;
          }
        }
      };

      const safeClose = () => {
        try {
          if (!isControllerClosed && !hasReturned) {
            isControllerClosed = true;
            controller.close();
          }
        } catch (error) {
          isControllerClosed = true;
        }
      };

      const cleanup = () => {
        if (!hasReturned) {
          hasReturned = true;
          safeClose();
        }
      };

      try {
        const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OLLAMA_API_KEY}`,
          },
          body: JSON.stringify(ollamaRequest),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Ollama streaming error ${response.status}:`, errorText);
          throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
        }

        const reader = response.body?.getReader();

        if (!reader) {
          throw new Error('No response body');
        }

        let buffer = '';

        try {
          while (!hasReturned) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += new TextDecoder().decode(value);
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() && !hasReturned) {
                try {
                  const ollamaChunk = JSON.parse(line);

                  const openaiChunk = {
                    id: generateId(),
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model,
                    choices: [{
                      index: 0,
                      delta: ollamaChunk.message?.content ?
                        { content: ollamaChunk.message.content } : {},
                      finish_reason: ollamaChunk.done ? 'stop' : null
                    }]
                  };

                  const chunk = `data: ${JSON.stringify(openaiChunk)}\n\n`;
                  safeEnqueue(encoder.encode(chunk));

                  if (ollamaChunk.done) {
                    safeEnqueue(encoder.encode('data: [DONE]\n\n'));
                    cleanup();
                    return;
                  }
                } catch (parseError) {
                  console.error('Error parsing Ollama chunk:', parseError);
                }
              }
            }
          }
        } finally {
          try {
            reader.releaseLock();
          } catch (e) {
          }
        }

        cleanup();
      } catch (error) {
        console.error('Streaming error:', error);
        
        if (!hasReturned) {
          try {
            const errorChunk = {
              error: {
                message: error.message || 'Streaming error',
                type: 'internal_server_error'
              }
            };
            safeEnqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
          } catch (e) {
          }
          cleanup();
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};

const handleModels = async () => {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OLLAMA_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const ollamaResponse = await response.json();

    const models = ollamaResponse.models?.map((model: any) => ({
      id: model.name,
      object: 'model',
      created: Math.floor(new Date(model.modified_at || Date.now()).getTime() / 1000),
      owned_by: 'ollama',
      permission: [],
      root: model.name,
      parent: null
    })) || [];

    return new Response(JSON.stringify({
      object: 'list',
      data: models
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Models error:', error);
    return new Response(
      JSON.stringify({
        error: {
          message: error.message || 'Failed to fetch models',
          type: 'internal_server_error'
        }
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

const server = serve({
  port: PORT,
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
      return handleModels();
    }

    if (url.pathname === '/' && req.method === 'GET') {
      return new Response(JSON.stringify({
        message: 'OpenAI-compatible API server',
        version: '1.0.0',
        endpoints: [
          'POST /v1/chat/completions',
          'GET /v1/models'
        ]
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      error: {
        message: 'Not found',
        type: 'invalid_request_error'
      }
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  },
});

console.log('🚀 OpenAI-compatible API server running on http://localhost:3304');
console.log('');
console.log('📡 API ENDPOINTS:');
console.log('  • POST /v1/chat/completions');
console.log('  • GET /v1/models');
console.log('');
console.log('⚙️  IDE CONFIGURATION:');
console.log('  Base URL: http://localhost:3304/v1');
console.log('  API Key: any-key (not required)');
console.log('');
console.log('🔗 Proxying requests to Ollama Turbo with authentication');
