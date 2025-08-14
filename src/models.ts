import type { ModelsList } from './types';
import { generateRequestId, createErrorResponse } from './errors';
import { createApiHeaders } from './utils/headers';
import { getModelService } from './services/container';

export const handleModelsInternal = async (): Promise<ModelsList> => {
  try {
    const modelService = getModelService();
    return await modelService.getOpenAIModels();
  } catch (error) {
    console.error('Models error:', error);
    throw error;
  }
};

export const handleModels = async (req: Request): Promise<Response> => {
  const requestId = generateRequestId();

  try {
    const modelsData = await handleModelsInternal();
    return new Response(JSON.stringify(modelsData), {
      headers: createApiHeaders(requestId)
    });
  } catch (error) {
    console.error('Models error:', error);
    return createErrorResponse(
      (error as Error).message || 'Failed to fetch models',
      'internal_server_error',
      500
    );
  }
};
