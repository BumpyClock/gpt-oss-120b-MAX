import { REMOTE_MODELS } from './config';
import type { OllamaRequest } from './types';

export const isRemoteModel = (model: string): boolean => {
  return REMOTE_MODELS.includes(model);
};

export const extractModelFromRequest = async (req: Request): Promise<string | null> => {
  if (!['POST', 'DELETE'].includes(req.method)) return null;
  
  try {
    const body = await req.json() as OllamaRequest;
    return body.model || null;
  } catch {
    return null;
  }
};

export const extractDigestFromPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/api\/blobs\/(.+)$/);
  return match ? match[1] : null;
};