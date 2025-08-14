/**
 * Service Container - Dependency Injection
 * Single source of truth for all service instances
 * Eliminates duplicate instantiations throughout the codebase
 */

import { OllamaClient } from '../clients/ollama-client';
import { ModelService } from './model-service';

// Singleton instances - created once, used everywhere
let ollamaClientInstance: OllamaClient | null = null;
let modelServiceInstance: ModelService | null = null;

/**
 * Get singleton OllamaClient instance
 */
export function getOllamaClient(): OllamaClient {
  if (!ollamaClientInstance) {
    ollamaClientInstance = new OllamaClient();
  }
  return ollamaClientInstance;
}

/**
 * Get singleton ModelService instance
 */
export function getModelService(): ModelService {
  if (!modelServiceInstance) {
    modelServiceInstance = new ModelService();
  }
  return modelServiceInstance;
}

/**
 * Service container object for easy destructuring
 */
export const services = {
  get ollamaClient() { return getOllamaClient(); },
  get modelService() { return getModelService(); }
};

/**
 * Reset all services (useful for testing)
 */
export function resetServices(): void {
  ollamaClientInstance = null;
  modelServiceInstance = null;
}