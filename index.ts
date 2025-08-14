/**
 * GPT-OSS 120B Unified API Server
 * 
 * Entry point for the unified OpenAI + Ollama API server.
 * Provides both OpenAI-compatible endpoints (/v1/*) and 
 * complete Ollama API endpoints (/api/*) on a single port.
 * 
 * Features:
 * - Dual API support (OpenAI + Ollama) 
 * - Local + remote model routing
 * - Streaming and non-streaming responses
 * - Function calling support
 * - Embeddings with mxbai-embed-large
 * 
 * Usage: bun run index.ts
 */

import './src/unified-server';