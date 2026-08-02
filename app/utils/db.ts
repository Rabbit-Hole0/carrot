import Dexie, { type Table } from 'dexie';

export interface TextCacheEntry {
  hash: string;
  text: string;
  vector: number[];
  created_at: number;
}

export class TextCacheDatabase extends Dexie {
  text_cache!: Table<TextCacheEntry, string>;

  constructor() {
    super('CarrotDB');
    this.version(1).stores({
      text_cache: 'hash, created_at',
    });
  }
}

export let db: TextCacheDatabase | null = null;

export function getDB(): TextCacheDatabase | null {
  if (db) return db;
  try {
    db = new TextCacheDatabase();
    return db;
  } catch (err) {
    console.warn('[Carrot] Failed to initialize Dexie DB (likely blocked by privacy settings):', err);
    return null;
  }
}

export async function getCacheByHash(hash: string): Promise<TextCacheEntry | undefined> {
  const database = getDB();
  if (!database) return undefined;
  try {
    return await database.text_cache.get(hash);
  } catch (err) {
    console.warn('[Carrot DB] get error:', err);
    return undefined;
  }
}

export async function saveCache(hash: string, text: string, vector: number[]): Promise<void> {
  const database = getDB();
  if (!database) return;
  try {
    await database.text_cache.put({
      hash,
      text,
      vector,
      created_at: Date.now(),
    });
  } catch (err) {
    console.warn('[Carrot DB] save error:', err);
  }
}
