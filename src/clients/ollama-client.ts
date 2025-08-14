/**
 * Unified Ollama API client
 * Centralizes all communication with local and remote Ollama instances
 */

import { OLLAMA_HOST, OLLAMA_API_KEY, LOCAL_OLLAMA_HOST } from '../config';

export interface OllamaClientOptions {
  timeout?: number;
  retries?: number;
}

export class OllamaClient {
  private defaultOptions: OllamaClientOptions = {
    timeout: 30000, // 30 seconds
    retries: 1
  };

  constructor(private options: OllamaClientOptions = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Fetch from local Ollama instance (localhost:11434)
   */
  async fetchLocal(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${LOCAL_OLLAMA_HOST}${endpoint}`;
    console.log(`[${new Date().toISOString()}] Local Ollama: ${options.method || 'GET'} ${endpoint}`);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok && response.status !== 404) {
        console.warn(`Local Ollama ${endpoint} returned ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      console.error(`Local Ollama ${endpoint} error:`, (error as Error).message);
      throw new Error(`Local Ollama connection failed: ${(error as Error).message}`);
    }
  }

  /**
   * Fetch from remote Ollama instance (ollama.com) with authentication
   */
  async fetchRemote(endpoint: string, options: RequestInit = {}): Promise<Response> {
    if (!OLLAMA_API_KEY) {
      throw new Error('OLLAMA_API_KEY required for remote requests');
    }

    const url = `${OLLAMA_HOST}${endpoint}`;
    console.log(`[${new Date().toISOString()}] Remote Ollama: ${options.method || 'GET'} ${endpoint}`);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OLLAMA_API_KEY}`,
          ...options.headers
        }
      });

      if (!response.ok && response.status !== 404) {
        console.warn(`Remote Ollama ${endpoint} returned ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      console.error(`Remote Ollama ${endpoint} error:`, (error as Error).message);
      throw new Error(`Remote Ollama connection failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get tags (models) from local Ollama
   */
  async getLocalTags(): Promise<any> {
    const response = await this.fetchLocal('/api/tags');
    if (!response.ok) {
      throw new Error(`Local tags failed: ${response.status}`);
    }
    return await response.json();
  }

  /**
   * Get tags (models) from remote Ollama
   */
  async getRemoteTags(): Promise<any> {
    const response = await this.fetchRemote('/api/tags');
    if (!response.ok) {
      throw new Error(`Remote tags failed: ${response.status}`);
    }
    return await response.json();
  }

  /**
   * Generate embeddings using local Ollama
   */
  async generateEmbeddings(model: string, prompt: string, options: any = {}): Promise<any> {
    const response = await this.fetchLocal('/api/embeddings', {
      method: 'POST',
      body: JSON.stringify({
        model,
        prompt,
        keep_alive: '5m',
        ...options
      })
    });

    if (!response.ok) {
      throw new Error(`Embeddings failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Chat completion with automatic routing (local vs remote)
   */
  async chatCompletion(model: string, messages: any[], options: any = {}): Promise<Response> {
    const isRemoteModel = ['gpt-oss:120b', 'gpt-oss:20b'].includes(model);
    
    const requestBody = {
      model,
      messages,
      ...options
    };

    if (isRemoteModel) {
      return this.fetchRemote('/api/chat', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });
    } else {
      return this.fetchLocal('/api/chat', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });
    }
  }

  /**
   * Generic proxy method for any Ollama endpoint with automatic routing
   */
  async proxy(endpoint: string, options: RequestInit = {}, useRemote = false): Promise<Response> {
    if (useRemote) {
      return this.fetchRemote(endpoint, options);
    } else {
      return this.fetchLocal(endpoint, options);
    }
  }
}