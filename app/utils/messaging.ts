import type { TextCacheEntry, FeatureVectorEntry, DatabaseStatus, UserRuleEntry } from './db';
import type { UserRules } from './settings';

// DB Message Types
export type DBMessage =
  | { type: 'DB_GET_TEXT_CACHE'; payload: { hash: string } }
  | { type: 'DB_PUT_TEXT_CACHE'; payload: { entry: TextCacheEntry } }
  | { type: 'DB_DELETE_TEXT_CACHE'; payload: { hash: string } }
  | { type: 'DB_COUNT_TEXT_CACHE'; payload: undefined }
  | { type: 'DB_PURGE_TEXT_CACHE'; payload: { maxItems?: number; targetItems?: number } }
  | { type: 'DB_ADD_FEATURE_VECTOR'; payload: { label: string; vector: [number, number, number, number, number] } }
  | { type: 'DB_GET_FEATURE_VECTOR'; payload: { id: number } }
  | { type: 'DB_GET_FEATURE_VECTORS_BY_LABEL'; payload: { label: string } }
  | { type: 'DB_GET_ALL_FEATURE_VECTORS'; payload: undefined }
  | { type: 'DB_DELETE_FEATURE_VECTOR'; payload: { id: number } }
  | { type: 'DB_GET_USER_RULES'; payload: undefined }
  | { type: 'DB_PUT_USER_RULES'; payload: { rules: UserRules } }
  | { type: 'DB_GET_STATUS'; payload: undefined };

export type DBResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

// Client API wrappers for content script
export async function sendDBMessage<T>(msg: DBMessage): Promise<T> {
  if (typeof browser === 'undefined') {
    throw new Error('Browser extension runtime is not available');
  }
  try {
    const response = (await browser.runtime.sendMessage(msg)) as DBResponse<T>;
    if (response?.success) {
      return response.data;
    }
    throw new Error(response?.error || `No valid response for ${msg.type}`);
  } catch (err) {
    console.warn(`[Carrot Messaging] Error sending ${msg.type}:`, err);
    throw err;
  }
}

export const dbClient = {
  getTextCache: (hash: string) => sendDBMessage<TextCacheEntry>({ type: 'DB_GET_TEXT_CACHE', payload: { hash } }),
  putTextCache: (entry: TextCacheEntry) => sendDBMessage<TextCacheEntry>({ type: 'DB_PUT_TEXT_CACHE', payload: { entry } }),
  deleteTextCache: (hash: string) => sendDBMessage<void>({ type: 'DB_DELETE_TEXT_CACHE', payload: { hash } }),
  countTextCache: () => sendDBMessage<number>({ type: 'DB_COUNT_TEXT_CACHE', payload: undefined }),
  purgeOldTextCache: (options?: { maxItems?: number; targetItems?: number }) => sendDBMessage<void>({ type: 'DB_PURGE_TEXT_CACHE', payload: options || {} }),
  addFeatureVector: (label: string, vector: [number, number, number, number, number]) => sendDBMessage<number>({ type: 'DB_ADD_FEATURE_VECTOR', payload: { label, vector } }),
  getFeatureVector: (id: number) => sendDBMessage<FeatureVectorEntry>({ type: 'DB_GET_FEATURE_VECTOR', payload: { id } }),
  getFeatureVectorsByLabel: (label: string) => sendDBMessage<FeatureVectorEntry[]>({ type: 'DB_GET_FEATURE_VECTORS_BY_LABEL', payload: { label } }),
  getAllFeatureVectors: () => sendDBMessage<FeatureVectorEntry[]>({ type: 'DB_GET_ALL_FEATURE_VECTORS', payload: undefined }),
  deleteFeatureVector: (id: number) => sendDBMessage<void>({ type: 'DB_DELETE_FEATURE_VECTOR', payload: { id } }),
  getUserRules: () => sendDBMessage<UserRuleEntry | undefined>({ type: 'DB_GET_USER_RULES', payload: undefined }),
  putUserRules: (rules: UserRules) => sendDBMessage<UserRuleEntry>({ type: 'DB_PUT_USER_RULES', payload: { rules } }),
  getDatabaseStatus: () => sendDBMessage<DatabaseStatus>({ type: 'DB_GET_STATUS', payload: undefined }),
};
