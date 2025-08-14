import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const LOGS_DIR = 'logs';
const CHAT_LOG_FILE = join(LOGS_DIR, 'chat-completions.log');

const ensureLogsDir = () => {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
};

const formatTimestamp = () => new Date().toISOString();

export const logChatRequest = (requestId: string, input: any) => {
  ensureLogsDir();
  const logEntry = {
    timestamp: formatTimestamp(),
    type: 'REQUEST',
    requestId,
    input
  };
  
  const logLine = JSON.stringify(logEntry, null, 2) + '\n' + '='.repeat(80) + '\n';
  appendFileSync(CHAT_LOG_FILE, logLine);
  
  console.log(`🔵 CHAT REQUEST: ${requestId} - logged to ${CHAT_LOG_FILE}`);
};

export const logChatResponse = (requestId: string, output: any, isStreaming: boolean = false) => {
  ensureLogsDir();
  const logEntry = {
    timestamp: formatTimestamp(),
    type: isStreaming ? 'STREAMING_RESPONSE' : 'RESPONSE',
    requestId,
    output
  };
  
  const logLine = JSON.stringify(logEntry, null, 2) + '\n' + '='.repeat(80) + '\n';
  appendFileSync(CHAT_LOG_FILE, logLine);
  
  console.log(`📤 CHAT RESPONSE: ${requestId} - logged to ${CHAT_LOG_FILE}`);
};

export const logStreamingStart = (requestId: string, model: string) => {
  ensureLogsDir();
  const logEntry = {
    timestamp: formatTimestamp(),
    type: 'STREAMING_START',
    requestId,
    model
  };
  
  const logLine = JSON.stringify(logEntry, null, 2) + '\n' + '~'.repeat(40) + '\n';
  appendFileSync(CHAT_LOG_FILE, logLine);
  
  console.log(`🌊 STREAMING START: ${requestId} - logged to ${CHAT_LOG_FILE}`);
};

export const logStreamingComplete = (requestId: string, summary: any) => {
  ensureLogsDir();
  const logEntry = {
    timestamp: formatTimestamp(),
    type: 'STREAMING_COMPLETE',
    requestId,
    summary
  };
  
  const logLine = JSON.stringify(logEntry, null, 2) + '\n' + '='.repeat(80) + '\n';
  appendFileSync(CHAT_LOG_FILE, logLine);
  
  console.log(`✅ STREAMING COMPLETE: ${requestId} - logged to ${CHAT_LOG_FILE}`);
};

export const logStreamingChunk = (requestId: string, chunk: any, chunkIndex: number) => {
  ensureLogsDir();
  const logEntry = {
    timestamp: formatTimestamp(),
    type: 'STREAMING_CHUNK',
    requestId,
    chunkIndex,
    chunk
  };
  
  const logLine = JSON.stringify(logEntry, null, 2) + '\n' + '-'.repeat(40) + '\n';
  appendFileSync(CHAT_LOG_FILE, logLine);
};

export const logError = (requestId: string, error: any) => {
  ensureLogsDir();
  const logEntry = {
    timestamp: formatTimestamp(),
    type: 'ERROR',
    requestId,
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    }
  };
  
  const logLine = JSON.stringify(logEntry, null, 2) + '\n' + '!'.repeat(80) + '\n';
  appendFileSync(CHAT_LOG_FILE, logLine);
  
  console.error(`❌ CHAT ERROR: ${requestId} - logged to ${CHAT_LOG_FILE}`);
};
