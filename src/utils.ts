import type { OpenAIMessage, OllamaChatMessage } from './types';

export const convertContentToString = (
  content: string | Array<{ type: string; text?: string; image_url?: unknown } | undefined> | null | undefined
): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = content.filter(Boolean) as Array<{ type: string; text?: string }>;
    return parts.filter(p => p.type === 'text' && !!p.text).map(p => p.text as string).join(' ');
  }
  return '';
};

export const convertToOllamaMessages = (messages: OpenAIMessage[]): OllamaChatMessage[] =>
  messages.map(msg => ({
    role: msg.role,
    content: convertContentToString(msg.content)
  }));


