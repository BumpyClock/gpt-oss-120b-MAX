import type { OpenAIErrorResponse } from './types';

export const generateId = () => `chatcmpl-${Math.random().toString(36).substring(2, 15)}`;
export const generateRequestId = () => `req_${Math.random().toString(36).substring(2, 15)}`;

export const createErrorResponse = (
  message: string,
  type: string,
  status = 400,
  param?: string,
  code?: string
): Response => {
  const errorResponse: OpenAIErrorResponse = {
    error: {
      message,
      type,
      ...(param && { param }),
      ...(code && { code })
    }
  };

  const requestId = generateRequestId();
  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': requestId,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Organization'
    }
  });
};


