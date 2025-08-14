/**
 * CORS Middleware
 * Handles Cross-Origin Resource Sharing for both APIs
 */

import { createCorsHeaders } from '../utils/headers';

/**
 * Handle CORS preflight requests
 */
export function handleCorsPreflightRequest(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: createCorsHeaders(),
    });
  }
  return null;
}

/**
 * Add CORS headers to response
 */
export function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  const corsHeaders = createCorsHeaders();
  
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}