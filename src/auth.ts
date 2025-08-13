import { createErrorResponse } from './errors';

export const validateAuth = (req: Request): { valid: boolean; error?: Response } => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { valid: true };
  if (!authHeader.startsWith('Bearer ')) {
    return {
      valid: false,
      error: createErrorResponse(
        'Incorrect API key provided. You can find your API key at https://platform.openai.com/account/api-keys.',
        'invalid_request_error',
        401
      )
    };
  }
  const token = authHeader.substring(7);
  if (token.length === 0) {
    return {
      valid: false,
      error: createErrorResponse(
        'Incorrect API key provided. You can find your API key at https://platform.openai.com/account/api-keys.',
        'invalid_request_error',
        401
      )
    };
  }
  return { valid: true };
};


