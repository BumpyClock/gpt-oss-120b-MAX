/**
 * Unified response headers utility
 * Single source of truth for all API response headers
 */

// Base CORS headers - used everywhere for consistency
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Organization',
} as const;

// Rate limiting headers - consistent across all responses
export const RATE_LIMIT_HEADERS = {
  'x-ratelimit-limit-requests': '10000',
  'x-ratelimit-remaining-requests': '9999',
  'x-ratelimit-reset-requests': new Date(Date.now() + 60000).toISOString(),
} as const;

// Base content headers
export const CONTENT_HEADERS = {
  'Content-Type': 'application/json',
} as const;

/**
 * Create complete API response headers with request ID
 */
export function createApiHeaders(requestId: string, contentType = 'application/json'): Record<string, string> {
  return {
    'Content-Type': contentType,
    'x-request-id': requestId,
    ...CORS_HEADERS,
    ...RATE_LIMIT_HEADERS,
  };
}

/**
 * Create CORS-only headers for preflight responses
 */
export function createCorsHeaders(): Record<string, string> {
  return { ...CORS_HEADERS };
}

/**
 * Create error response headers
 */
export function createErrorHeaders(requestId: string): Record<string, string> {
  return {
    ...createApiHeaders(requestId),
    'x-error': 'true'
  };
}

/**
 * Create simple response headers for proxied requests
 */
export function createProxyHeaders(): Record<string, string> {
  return {
    ...CONTENT_HEADERS,
    ...CORS_HEADERS,
  };
}