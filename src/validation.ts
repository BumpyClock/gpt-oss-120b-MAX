import type { OpenAIChatRequest } from './types';
import { convertContentToString } from './utils';
import { createErrorResponse } from './errors';

export const validateModel = (model: string, availableModels: string[]): boolean => 
  availableModels.includes(model);

export const validateRequest = (body: OpenAIChatRequest) => {
  if (!body.model) {
    return createErrorResponse('Missing required parameter: model', 'invalid_request_error', 400, 'model');
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return createErrorResponse('Missing required parameter: messages', 'invalid_request_error', 400, 'messages');
  }

  for (let i = 0; i < body.messages.length; i++) {
    const message = body.messages[i];
    
    if (!message.role) {
      return createErrorResponse(
        `Missing required parameter: messages[${i}].role`,
        'invalid_request_error',
        400,
        `messages[${i}].role`
      );
    }

    if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) {
      return createErrorResponse(
        `Invalid value for messages[${i}].role: ${message.role}`,
        'invalid_request_error',
        400,
        `messages[${i}].role`
      );
    }

    if (message.role === 'tool' && !message.tool_call_id) {
      return createErrorResponse(
        `Missing required parameter: messages[${i}].tool_call_id`,
        'invalid_request_error',
        400,
        `messages[${i}].tool_call_id`
      );
    }

    if (message.content) {
      const contentStr = convertContentToString(message.content);
      if (contentStr.length > 200000) {
        return createErrorResponse(
          'Message content too large (max 200000 characters)',
          'invalid_request_error',
          400,
          `messages[${i}].content`
        );
      }
    }
  }

  return null;
};

export const validateParameters = (body: OpenAIChatRequest) => {
  if (body.temperature !== undefined && (body.temperature < 0 || body.temperature > 2)) {
    return createErrorResponse(
      'Temperature must be between 0 and 2',
      'invalid_request_error',
      400,
      'temperature'
    );
  }

  if (body.top_p !== undefined && (body.top_p < 0 || body.top_p > 1)) {
    return createErrorResponse(
      'Top_p must be between 0 and 1',
      'invalid_request_error',
      400,
      'top_p'
    );
  }

  if (body.max_tokens !== undefined && body.max_tokens < 1) {
    return createErrorResponse(
      'Max_tokens must be greater than 0',
      'invalid_request_error',
      400,
      'max_tokens'
    );
  }

  if (body.n !== undefined && body.n !== 1) {
    return createErrorResponse(
      'Only n=1 is supported',
      'invalid_request_error',
      400,
      'n'
    );
  }

  return null;
};
