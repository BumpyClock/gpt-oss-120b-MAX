# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a unified API server that provides both OpenAI-compatible and complete Ollama API endpoints on a single port. It exposes powerful remote models (gpt-oss-120b and gpt-oss-20b) through Ollama's Turbo infrastructure while maintaining full compatibility with local Ollama models and the OpenAI ecosystem.

## Architecture

The codebase implements a single unified server that handles both APIs:

### Unified Server (Port 3304)
- **Entry Point**: `openai-server.ts` → `src/unified-server.ts`
- **Dual API Support**: Handles both OpenAI and Ollama protocols on one port
- **Route Separation**: 
  - OpenAI API: `/v1/*` routes
  - Ollama API: `/api/*` routes
- **Key Features**: 
  - **OpenAI v1 API**: Full compatibility including tools/function calling, streaming
  - **Complete Ollama API**: All 15+ endpoints with intelligent routing
  - **Unified responses**: Merge local and remote data where applicable
  - **Smart model routing**: Automatic local vs remote selection
  - **Single process**: Better performance and simpler deployment

### Core Components
- `src/config.ts` - Environment configuration and known endpoints
- `src/types.ts` - Complete TypeScript definitions for OpenAI and Ollama APIs
- `src/auth.ts` - Authentication validation
- `src/validation.ts` - Request parameter validation
- `src/utils.ts` - Message format conversion utilities
- `src/logger.ts` - Comprehensive logging for requests/responses/streaming
- `src/errors.ts` - OpenAI-compatible error response generation

## Development Commands

```bash
# Install dependencies
bun install

# Development server (unified OpenAI + Ollama APIs, auto-reload)
bun run dev

# Production server (unified APIs)
bun run start

# Start with vector database for code embedding
bun run start-with-qdrant

# Start only vector database
bun run start-qdrant
```

## Environment Setup

1. Copy `.env.example` to `.env`
2. Set `OLLAMA_API_KEY` with your Ollama Turbo subscription key
3. Optional: Set `OLLAMA_HOST` (default: https://ollama.com)
4. Optional: Set `LOCAL_OLLAMA_HOST` (default: http://localhost:11434)
5. Optional: Set `OPENAI_PORT` (default: 3304)

## API Integration Points

### For IDE/AI Tools (OpenAI-Compatible)
- **Base URL**: `http://localhost:3304/v1`
- **API Key**: Any value (not validated)
- **Available Models**: `gpt-oss:120b`, `gpt-oss:20b`
- **Endpoints**: `/v1/chat/completions`, `/v1/models`, `/v1/completions`, `/v1/embeddings`

### For Ollama-Compatible Tools
- **Base URL**: `http://localhost:3304/api`
- **Complete API**: All 15+ Ollama endpoints supported
- **Model Routing**: 
  - `gpt-oss:120b`, `gpt-oss:20b` → Remote Ollama.com (with auth)
  - All other models → Local Ollama (localhost:11434)
- **Unified Responses**: 
  - `/api/tags` - Combined local + remote models
  - `/api/ps` - Running models from both sources (marked with `_source`)
  - `/api/version` - Proxy version with upstream info
- **Model Management**: Create, copy, pull, push, delete work with local Ollama
- **Blob Support**: Upload/check model files for custom model creation
- **Full Compatibility**: Works with Ollama CLI, libraries, any client

### Single Port Advantage
Both APIs run on **port 3304** with different route prefixes - no need for multiple servers!

## OpenAI Compatibility

This server implements **strict OpenAI v1 API compatibility** following the detailed requirements in `OpenAI_requirements.md`. Key compatibility features:

- Complete `/v1/chat/completions` implementation with tools/function calling
- Proper streaming with Server-Sent Events
- JSON schema and structured output support
- OpenAI-style error envelopes and rate limiting headers
- Comprehensive request validation matching OpenAI's behavior

## Key Technical Details

### OpenAI API Request Flow
1. Request validation (auth, model, parameters)
2. Message format conversion (OpenAI → Ollama)
3. Upstream request to Ollama Turbo
4. Response transformation (Ollama → OpenAI)
5. Streaming or non-streaming response delivery

### Ollama Proxy Request Flow
1. Parse incoming request to extract model name
2. Route decision: remote (gpt-oss models) vs local (all others)
3. Forward request with appropriate authentication
4. Return response with preserved streaming
5. Special handling for `/api/tags` to merge model lists

### Streaming Architecture
- Uses ReadableStream with proper chunk handling
- Implements OpenAI's delta format for incremental updates
- Includes fallback mechanisms for compatibility with RooCode/KiloCode
- Comprehensive logging of streaming sessions

### Error Handling
- OpenAI-compatible error response format
- Detailed error logging with request IDs
- Graceful fallbacks for streaming failures

## TypeScript Configuration

- Uses Bun's modern TypeScript setup
- Module system: ESNext with bundler resolution
- Strict type checking enabled
- No build step required (runtime TypeScript)

## Testing Integration Points

When testing changes:
1. Verify `/v1/models` returns expected model list
2. Test non-streaming chat completions
3. Test streaming responses with various clients
4. Validate tool/function calling workflows
5. Check error response formats match OpenAI

The server is designed for maximum compatibility with OpenAI SDKs and IDE integrations like VS Code, Cursor, and JetBrains AI Assistant.