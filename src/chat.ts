import { validateAuth } from './auth';
import { createErrorResponse, generateId, generateRequestId } from './errors';
import { logChatRequest, logChatResponse, logError, logStreamingChunk, logStreamingComplete, logStreamingStart } from './logger';
import { getModelService, getOllamaClient } from './services/container';
import { createApiHeaders } from './utils/headers';
import type {
  OllamaChatRequest,
  OllamaOptions,
  OpenAIChatRequest,
  OpenAIChatResponse,
  OpenAIStreamChunk
} from './types';
import { convertToOllamaMessages } from './utils';
import { validateModel, validateParameters, validateRequest } from './validation';
import { OLLAMA_STREAM } from './config';

export const handleChatCompletions = async (req: Request): Promise<Response> => {
  const authValidation = validateAuth(req);
  if (!authValidation.valid) {
    return authValidation.error as Response;
  }

  const requestId = generateRequestId();
  const responseHeaders = createApiHeaders(requestId);

  try {
    const body: OpenAIChatRequest = await req.json();
    
    logChatRequest(requestId, {
      model: body.model,
      messages: body.messages,
      stream: body.stream,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      top_p: body.top_p,
      tools: body.tools,
      response_format: body.response_format,
      user: body.user
    });

    const requestValidation = validateRequest(body);
    if (requestValidation) return requestValidation;

    const modelService = getModelService();
    const modelsResponse = await modelService.getOpenAIModels();
    const availableModels = modelsResponse.data.map((m) => m.id);
    
    if (!validateModel(body.model, availableModels)) {
      return createErrorResponse(
        `The model '${body.model}' does not exist`,
        'invalid_request_error',
        404,
        'model'
      );
    }

    const paramValidation = validateParameters(body);
    if (paramValidation) return paramValidation;

    const {
      model,
      messages,
      stream = false,
      temperature,
      max_tokens,
      top_p,
      frequency_penalty,
      presence_penalty,
      stop,
      response_format
    } = body;

    // Override streaming based on OLLAMA_STREAM environment variable
    const effectiveStream = stream && OLLAMA_STREAM;

    const ollamaMessages = convertToOllamaMessages(messages);
    
    const options: OllamaOptions = {};
    if (temperature !== undefined) options.temperature = temperature;
    if (max_tokens !== undefined) options.num_predict = max_tokens;
    if (top_p !== undefined) options.top_p = top_p;
    if (frequency_penalty !== undefined) options.frequency_penalty = frequency_penalty;
    if (presence_penalty !== undefined) options.presence_penalty = presence_penalty;
    if (stop !== undefined) options.stop = Array.isArray(stop) ? stop : [stop];

    const ollamaRequest: OllamaChatRequest = {
      model,
      messages: ollamaMessages,
      stream: effectiveStream
    };

    if (Object.keys(options).length > 0) {
      ollamaRequest.options = options;
    }

    if (response_format?.type === 'json_object') {
      ollamaRequest.format = 'json';
    }

    if (effectiveStream) {
      return handleStreamingChat(ollamaRequest, model, body, requestId);
    }

    return handleNonStreamingChat(ollamaRequest, model, body, requestId, responseHeaders);

  } catch (error) {
    logError(requestId, error);
    return createErrorResponse(
      (error as Error).message || 'Internal server error',
      'internal_server_error',
      500
    );
  }
};

export const handleNonStreamingChat = async (
  ollamaRequest: OllamaChatRequest, 
  model: string, 
  originalRequest: OpenAIChatRequest, 
  requestId: string, 
  responseHeaders: Record<string, string>
): Promise<Response> => {
  try {
    const ollamaClient = getOllamaClient();
    const response = await ollamaClient.chatCompletion(model, ollamaRequest.messages, {
      stream: false,
      ...ollamaRequest
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Ollama error ${response.status}:`, errorText);
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const ollamaResponse = await response.json();

    let content = ollamaResponse.message?.content || '';
    
    if (originalRequest.response_format?.type === 'json_object') {
      try {
        JSON.parse(content);
      } catch {
        content = JSON.stringify({ response: content });
      }
    }

    if (!content && !originalRequest.tools) {
      content = 'Response received from model.';
    }

    const openaiResponse: OpenAIChatResponse = {
      id: generateId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      system_fingerprint: 'fp_ollama_proxy',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: ollamaResponse.prompt_eval_count || 0,
        completion_tokens: ollamaResponse.eval_count || 0,
        total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0)
      }
    };

    logChatResponse(requestId, openaiResponse, false);

    return new Response(JSON.stringify(openaiResponse), {
      headers: responseHeaders
    });
  } catch (error) {
    logError(requestId, error);
    return createErrorResponse(
      (error as Error).message || 'Internal server error',
      'internal_server_error',
      500
    );
  }
};

export const handleStreamingChat = async (
  ollamaRequest: OllamaChatRequest, 
  model: string, 
  originalRequest: OpenAIChatRequest, 
  requestId: string
): Promise<Response> => {
  const completionId = generateId();
  const timestamp = Math.floor(Date.now() / 1000);
  let chunkCounter = 0;
  let streamingContent = '';
  let streamingStartTime = Date.now();
  
  logStreamingStart(requestId, model);
  
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let controllerClosed = false;
      let ollamaReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      
      const writeChunk = (data: OpenAIStreamChunk) => {
        try {
          if (controllerClosed) {
            return;
          }
          
          // Track content for final summary
          if (data.choices?.[0]?.delta?.content) {
            streamingContent += data.choices[0].delta.content;
          }
          
          logStreamingChunk(requestId, data, chunkCounter++);
          const chunk = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch (error) {
          controllerClosed = true;
          console.warn('Controller closed, stopping writes');
        }
      };
      
      const safeClose = () => {
        try {
          if (!controllerClosed) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            controllerClosed = true;
            
            const streamingSummary = {
              completionId,
              model,
              totalChunks: chunkCounter,
              contentLength: streamingContent.length,
              fullContent: streamingContent,
              durationMs: Date.now() - streamingStartTime,
              finishReason: 'stop'
            };
            
            logStreamingComplete(requestId, streamingSummary);
          }
        } catch (error) {
          controllerClosed = true;
        }
      };
      
      const writeError = (message: string) => {
        if (controllerClosed) return;
        
        const assistantRoleChunk: OpenAIStreamChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: timestamp,
          model,
          system_fingerprint: 'fp_ollama_proxy',
          choices: [{
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null
          }]
        };
        writeChunk(assistantRoleChunk);
        
        const errorContentChunk: OpenAIStreamChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: timestamp,
          model,
          system_fingerprint: 'fp_ollama_proxy',
          choices: [{
            index: 0,
            delta: { content: `Error: ${message}` },
            finish_reason: null
          }]
        };
        writeChunk(errorContentChunk);
        
        const finalChunk: OpenAIStreamChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: timestamp,
          model,
          system_fingerprint: 'fp_ollama_proxy',
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop'
          }]
        };
        writeChunk(finalChunk);
        
        safeClose();
      };

      try {
        const ollamaClient = getOllamaClient();
        const response = await ollamaClient.chatCompletion(model, ollamaRequest.messages, {
          stream: true,
          ...ollamaRequest
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Ollama error ${response.status}:`, errorText);
          writeError(`Ollama request failed: ${response.status}`);
          return;
        }

        ollamaReader = response.body?.getReader() || null;
        if (!ollamaReader) {
          writeError('No response body from Ollama');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let hasFinished = false;
        let hasContentBeenSent = false;

        const ensureMinimalResponse = () => {
          try {
            if (!controllerClosed && !hasFinished) {
              console.log('Using backup minimal response for RooCode/KiloCode compatibility');
              
              if (!hasContentBeenSent && !controllerClosed) {
                const backupContentChunk: OpenAIStreamChunk = {
                  id: completionId,
                  object: 'chat.completion.chunk',
                  created: timestamp,
                  model,
                  system_fingerprint: 'fp_ollama_proxy',
                  choices: [{
                    index: 0,
                    delta: { content: 'Response received from model.' },
                    finish_reason: null
                  }]
                };
                writeChunk(backupContentChunk);
                hasContentBeenSent = true;
              }
              
              if (!controllerClosed) {
                const backupFinalChunk: OpenAIStreamChunk = {
                  id: completionId,
                  object: 'chat.completion.chunk',
                  created: timestamp,
                  model,
                  system_fingerprint: 'fp_ollama_proxy',
                  choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: 'stop'
                  }]
                };
                writeChunk(backupFinalChunk);
                hasFinished = true;
                
                const streamingSummary = {
                  completionId,
                  model,
                  totalChunks: chunkCounter,
                  contentLength: streamingContent.length,
                  fullContent: streamingContent || 'Response received from model.',
                  durationMs: Date.now() - streamingStartTime,
                  finishReason: 'stop',
                  fallback: true
                };
                
                logStreamingComplete(requestId, streamingSummary);
                safeClose();
              }
            }
          } catch (error) {
            controllerClosed = true;
          }
        };

        const assistantRoleChunk: OpenAIStreamChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: timestamp,
          model,
          system_fingerprint: 'fp_ollama_proxy',
          choices: [{
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null
          }]
        };
        writeChunk(assistantRoleChunk);

        try {
          while (!hasFinished && !controllerClosed) {
            const { done, value } = await ollamaReader.read();
            
            if (done || controllerClosed) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() && !hasFinished && !controllerClosed) {
                try {
                  const ollamaData = JSON.parse(line);

                  if (ollamaData.message?.content && !controllerClosed) {
                    const contentChunk: OpenAIStreamChunk = {
                      id: completionId,
                      object: 'chat.completion.chunk',
                      created: timestamp,
                      model,
                      system_fingerprint: 'fp_ollama_proxy',
                      choices: [{
                        index: 0,
                        delta: { content: ollamaData.message.content },
                        finish_reason: null
                      }]
                    };
                    writeChunk(contentChunk);
                    hasContentBeenSent = true;
                  }

                  if (ollamaData.done && !controllerClosed) {
                    const finalChunk: OpenAIStreamChunk = {
                      id: completionId,
                      object: 'chat.completion.chunk',
                      created: timestamp,
                      model,
                      system_fingerprint: 'fp_ollama_proxy',
                      choices: [{
                        index: 0,
                        delta: {},
                        finish_reason: 'stop'
                      }]
                    };
                    writeChunk(finalChunk);
                    hasFinished = true;
                    safeClose();
                    return;
                  }
                } catch (parseError) {
                  console.error('JSON parse error:', parseError, 'Line:', line);
                }
              }
              
              if (controllerClosed) break;
            }
          }

          if (buffer.trim() && !hasFinished && !controllerClosed) {
            try {
              const ollamaData = JSON.parse(buffer.trim());
              
              if (ollamaData.message?.content && !controllerClosed) {
                const contentChunk: OpenAIStreamChunk = {
                  id: completionId,
                  object: 'chat.completion.chunk',
                  created: timestamp,
                  model,
                  system_fingerprint: 'fp_ollama_proxy',
                  choices: [{
                    index: 0,
                    delta: { content: ollamaData.message.content },
                    finish_reason: null
                  }]
                };
                writeChunk(contentChunk);
                hasContentBeenSent = true;
              }
              
              if (ollamaData.done) {
                hasFinished = true;
              }
            } catch (parseError) {
              console.error('Final buffer parse error:', parseError);
            }
          }

          if (!hasFinished && !controllerClosed) {
            ensureMinimalResponse();
          } else if (!controllerClosed) {
            safeClose();
          }
          
        } finally {
          if (ollamaReader) {
            try {
              ollamaReader.releaseLock();
            } catch (e) {
              // Reader may already be released
            }
          }
        }
      } catch (error) {
        logError(requestId, error);
        if (!controllerClosed) {
          writeError((error as Error).message || 'Internal streaming error');
        }
      }
    },
    cancel() {
      console.log('Stream cancelled by client');
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Organization',
      'X-Accel-Buffering': 'no',
      'x-request-id': requestId,
      'x-ratelimit-limit-requests': '10000',
      'x-ratelimit-remaining-requests': '9999',
      'x-ratelimit-reset-requests': new Date(Date.now() + 60000).toISOString(),
    },
  });
};
