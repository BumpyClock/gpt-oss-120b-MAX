/**
 * Error Handler Middleware
 * Global error handling for all routes
 */

import { createErrorResponse } from '../errors';
import { HTTP_STATUS, ERROR_MESSAGES } from '../constants';

/**
 * Global error handler
 * Catches all unhandled errors and returns appropriate responses
 */
export function handleError(error: unknown, requestId?: string): Response {
  console.error(`[${new Date().toISOString()}] Error:`, error);

  if (error instanceof Response) {
    return error;
  }

  if (error instanceof Error) {
    // Check for specific error types
    if (error.message.includes('OLLAMA_API_KEY')) {
      return createErrorResponse(
        ERROR_MESSAGES.MISSING_API_KEY,
        'auth_error',
        HTTP_STATUS.UNAUTHORIZED,
        requestId
      );
    }

    if (error.message.includes('Model') && error.message.includes('not found')) {
      return createErrorResponse(
        ERROR_MESSAGES.MODEL_NOT_FOUND,
        'invalid_request_error',
        HTTP_STATUS.NOT_FOUND,
        requestId
      );
    }

    if (error.message.includes('Failed to fetch') || error.message.includes('connection')) {
      return createErrorResponse(
        ERROR_MESSAGES.FAILED_TO_FETCH,
        'api_error',
        HTTP_STATUS.BAD_GATEWAY,
        requestId
      );
    }

    // Generic error response
    return createErrorResponse(
      error.message || ERROR_MESSAGES.INTERNAL_ERROR,
      'internal_server_error',
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      requestId
    );
  }

  // Unknown error type
  return createErrorResponse(
    ERROR_MESSAGES.INTERNAL_ERROR,
    'internal_server_error',
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    requestId
  );
}

/**
 * Wrap async route handlers with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  requestIdExtractor?: (args: Parameters<T>) => string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (error) {
      const requestId = requestIdExtractor ? requestIdExtractor(args) : undefined;
      return handleError(error, requestId);
    }
  }) as T;
}