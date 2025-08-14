/**
 * Application Constants
 * Single source of truth for all magic numbers and strings
 */

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
} as const;

// API Versions
export const API_VERSIONS = {
  OPENAI: 'v1',
  OLLAMA: 'api',
} as const;

// API Paths
export const API_PATHS = {
  // OpenAI endpoints
  OPENAI_BASE: '/v1',
  OPENAI_MODELS: '/v1/models',
  OPENAI_CHAT: '/v1/chat/completions',
  OPENAI_COMPLETIONS: '/v1/completions',
  OPENAI_EMBEDDINGS: '/v1/embeddings',
  
  // Ollama endpoints
  OLLAMA_BASE: '/api',
  OLLAMA_TAGS: '/api/tags',
  OLLAMA_GENERATE: '/api/generate',
  OLLAMA_CHAT: '/api/chat',
  OLLAMA_EMBEDDINGS: '/api/embeddings',
  OLLAMA_EMBED: '/api/embed',
  OLLAMA_PS: '/api/ps',
  OLLAMA_VERSION: '/api/version',
  OLLAMA_SHOW: '/api/show',
  OLLAMA_BLOBS: '/api/blobs',
  OLLAMA_PULL: '/api/pull',
  OLLAMA_PUSH: '/api/push',
  OLLAMA_CREATE: '/api/create',
  OLLAMA_COPY: '/api/copy',
  OLLAMA_DELETE: '/api/delete',
} as const;

// Default Values
export const DEFAULTS = {
  TIMEOUT: 30000, // 30 seconds
  IDLE_TIMEOUT: 255,
  RATE_LIMIT: 10000,
  RATE_LIMIT_WINDOW: 60000, // 1 minute
  MAX_MESSAGE_LENGTH: 200000,
  LOG_DIR: './logs',
  STREAM_CHUNK_SIZE: 1024,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  MISSING_API_KEY: 'OLLAMA_API_KEY environment variable is required',
  INVALID_MODEL: 'The specified model does not exist',
  INVALID_REQUEST: 'Invalid request format',
  FAILED_TO_FETCH: 'Failed to fetch from upstream',
  NOT_FOUND: 'Endpoint not found',
  INTERNAL_ERROR: 'Internal server error',
  MODEL_NOT_FOUND: 'Model not found. Make sure it\'s pulled in Ollama.',
  EMBEDDINGS_FAILED: 'Failed to generate embeddings',
  AUTH_FAILED: 'Authentication failed',
} as const;

// Server Messages
export const SERVER_MESSAGES = {
  STARTUP: '🚀 Unified OpenAI + Ollama server running',
  OPENAI_API: '📍 OpenAI API',
  OLLAMA_API: '📍 Ollama API',
  LOCAL_OLLAMA: '📍 Local Ollama',
  REMOTE_OLLAMA: '☁️  Remote Ollama',
  REMOTE_MODELS: '🎯 Remote models',
} as const;