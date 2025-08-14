/**
 * Unified model service
 * Single source of truth for fetching and managing models from local and remote Ollama
 */

import { OllamaClient } from '../clients/ollama-client';
import { REMOTE_MODELS } from '../config';
import type { OllamaModel, OllamaTagsResponse, ModelsList, ModelData } from '../types';

export class ModelService {
  private client: OllamaClient;

  constructor() {
    this.client = new OllamaClient();
  }

  /**
   * Get unified list of models from both local and remote sources
   * Deduplicates models (prefers local over remote if same name)
   */
  async getUnifiedModels(): Promise<OllamaModel[]> {
    const models: OllamaModel[] = [];

    // Fetch local models
    try {
      const localModels = await this.getLocalModels();
      models.push(...localModels);
      console.log(`Found ${localModels.length} local models`);
    } catch (error) {
      console.warn('Failed to fetch local models:', (error as Error).message);
    }

    // Fetch remote models
    try {
      const remoteModels = await this.getRemoteModels();
      models.push(...remoteModels);
      console.log(`Found ${remoteModels.length} remote models`);
    } catch (error) {
      console.warn('Failed to fetch remote models:', (error as Error).message);
    }

    // Remove duplicates (prefer local over remote)
    const uniqueModels = this.deduplicateModels(models);
    console.log(`Returning ${uniqueModels.length} unified models`);
    
    return uniqueModels;
  }

  /**
   * Get models from local Ollama instance only
   */
  async getLocalModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.client.getLocalTags();
      return response.models || [];
    } catch (error) {
      console.warn('Local Ollama not available:', (error as Error).message);
      return [];
    }
  }

  /**
   * Get models from remote Ollama instance only
   * Filters to only include known remote models
   */
  async getRemoteModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.client.getRemoteTags();
      const allRemoteModels = response.models || [];
      
      // Only include models that are in our REMOTE_MODELS list
      return allRemoteModels.filter((model: OllamaModel) => 
        REMOTE_MODELS.includes(model.name)
      );
    } catch (error) {
      console.warn('Remote Ollama not available:', (error as Error).message);
      return [];
    }
  }

  /**
   * Convert Ollama models to OpenAI format
   */
  async getOpenAIModels(): Promise<ModelsList> {
    const ollamaModels = await this.getUnifiedModels();
    
    const models: ModelData[] = ollamaModels.map((model) => ({
      id: model.name,
      object: 'model' as const,
      created: Math.floor(new Date(model.modified_at || Date.now()).getTime() / 1000),
      owned_by: this.isRemoteModel(model.name) ? 'ollama-turbo' : 'local',
      permission: [],
      root: model.name,
      parent: null
    }));

    return {
      object: 'list',
      data: models
    };
  }

  /**
   * Check if a model is available (either locally or remotely)
   */
  async isModelAvailable(modelName: string): Promise<boolean> {
    const models = await this.getUnifiedModels();
    return models.some(model => model.name === modelName);
  }

  /**
   * Check if a model should use remote routing
   */
  isRemoteModel(modelName: string): boolean {
    return REMOTE_MODELS.includes(modelName);
  }

  /**
   * Remove duplicate models, preferring local over remote
   */
  private deduplicateModels(models: OllamaModel[]): OllamaModel[] {
    const seen = new Set<string>();
    const uniqueModels: OllamaModel[] = [];

    // Process local models first (they take priority)
    const localModels = models.filter(model => !this.isRemoteModel(model.name));
    const remoteModels = models.filter(model => this.isRemoteModel(model.name));

    for (const model of [...localModels, ...remoteModels]) {
      if (!seen.has(model.name)) {
        seen.add(model.name);
        uniqueModels.push(model);
      }
    }

    return uniqueModels;
  }

  /**
   * Get running models from both local and remote (for /api/ps endpoint)
   */
  async getRunningModels(): Promise<any> {
    const models: any[] = [];

    // Fetch local running models
    try {
      const localResponse = await this.client.fetchLocal('/api/ps');
      if (localResponse.ok) {
        const localPs = await localResponse.json();
        const localModels = (localPs.models || []).map((model: any) => ({
          ...model,
          _source: 'local' as const
        }));
        models.push(...localModels);
      }
    } catch (error) {
      console.warn('Failed to fetch local running models:', (error as Error).message);
    }

    // Note: Remote Ollama doesn't support /api/ps endpoint typically
    // But we could extend this if needed

    return { models };
  }
}