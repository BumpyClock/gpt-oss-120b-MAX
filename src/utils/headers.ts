/**
 * Unified response headers utility
 * Single source of truth for all API response headers
 */

export function createApiHeaders(requestId: string, contentType = 'application/json'): Record<string, string> {
  return {
    'Content-Type': contentType,
    'x-request-id': requestId,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Organization',
    'x-ratelimit-limit-requests': '10000',
    'x-ratelimit-remaining-requests': '9999',
    'x-ratelimit-reset-requests': new Date(Date.now() + 60000).toISOString(),
  };
}

export function createCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Organization',
  };
}

export function createErrorHeaders(requestId: string): Record<string, string> {
  return {
    ...createApiHeaders(requestId),
    'x-error': 'true'
  };
}