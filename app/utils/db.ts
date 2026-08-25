import Dexie, { type Table } from 'dexie';
import type { TextMetrics } from './vector';
import type { UserRules } from './settings';

export interface TextCacheEntry {
  hash: string;
  text: string;
  vector: [number, number, number];
  score: number;
  is_ai: boolean;
  metrics: TextMetrics;
  created_at: number;
}

export interface FeatureVectorEntry {
  id?: number;
  label: string;
  vector: [number, number, number];
}

export interface UserRuleEntry {
  key: 'settings';
  value: UserRules;
  updated_at: number;
}

export interface DatabaseStatus {
  name: string;
  version: number;
  tables: string[];
  textCacheCount: number;
  featureVectorCount: number;
  userRulesCount: number;
}

export const DEFAULT_TEXT_CACHE_MAX_ITEMS = 10_000;
export const DEFAULT_TEXT_CACHE_PURGE_ITEMS = 2_000;
export const DEFAULT_TEXT_CACHE_TARGET_ITEMS =
  DEFAULT_TEXT_CACHE_MAX_ITEMS - DEFAULT_TEXT_CACHE_PURGE_ITEMS;

export class TextCacheDatabase extends Dexie {
  text_cache!: Table<TextCacheEntry, string>;
  feature_vectors!: Table<FeatureVectorEntry, number>;
  user_rules!: Table<UserRuleEntry, string>;
  constructor() {
    super('CarrotDB');

    // v1 schema
    this.version(1).stores({
      text_cache: 'hash, created_at',
    });

    // v2 schema. Keep text/vector in records because the content script uses
    // them for cache validation and AI-score input.
    this.version(2).stores({
      text_cache: 'hash, score, created_at', // is_ai is intentionally not an index for broad browser support
      feature_vectors: '++id, label',
    }).upgrade((trans) => {
      // Migrate v1 to v2
      // v1 TextCacheEntry had: hash, text, vector, created_at
      return trans.table('text_cache').toCollection().modify((entry: any) => {
        const oldVector = entry.vector;
        if (oldVector && oldVector.length >= 4) {
          entry.metrics = {
            burstiness: oldVector[0],
            entropy: oldVector[2],
            ngram: oldVector[3],
          };
        } else {
          entry.metrics = { burstiness: 0, entropy: 0, ngram: 0 };
        }
        
        entry.score = 0; // Default safe value
        entry.is_ai = false;

        // Keep text/vector for the runtime cache contract. Older records may
        // not have them, but new records must remain fully compatible.
      });
    });

    // v3 removes the unused feedback_logs object store entirely.
    this.version(3).stores({
      text_cache: 'hash, score, created_at',
      feature_vectors: '++id, label',
    });

    this.version(4).stores({
      text_cache: 'hash, score, created_at',
      feature_vectors: '++id, label',
      user_rules: 'key',
    });

    // v5 switches feature vectors from 5D to 4D after removing TTR.
    this.version(5).stores({
      text_cache: 'hash, score, created_at',
      feature_vectors: '++id, label',
      user_rules: 'key',
    }).upgrade((trans) => trans.table('feature_vectors').clear());

    // v6 removes N-gram from cosine vectors (4D → 3D).
    this.version(6).stores({
      text_cache: 'hash, score, created_at',
      feature_vectors: '++id, label',
      user_rules: 'key',
    }).upgrade((trans) => trans.table('feature_vectors').clear());
  }
}

let db: TextCacheDatabase | null = null;

export function getDB(): TextCacheDatabase | null {
  if (db) return db;
  try {
    db = new TextCacheDatabase();
    return db;
  } catch (err) {
    console.warn('[Carrot DB] Failed to initialize Dexie DB:', err);
    return null;
  }
}

/** Open CarrotDB and verify every table used by the extension exists. */
export async function openDB(): Promise<TextCacheDatabase> {
  const database = getDB();
  if (!database) throw new Error('CarrotDB is not available');
  await database.open();
  const requiredTables = ['text_cache', 'feature_vectors', 'user_rules'];
  const missingTables = requiredTables.filter(
    (name) => !database.tables.some((table) => table.name === name),
  );
  if (missingTables.length > 0) {
    throw new Error(`CarrotDB schema is incomplete: ${missingTables.join(', ')}`);
  }
  console.log(`[Carrot DB] Opened ${database.name} v${database.verno}.`);
  return database;
}

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  const database = await openDB();
  return {
    name: database.name,
    version: database.verno,
    tables: database.tables.map((table) => table.name),
    textCacheCount: await database.text_cache.count(),
    featureVectorCount: await database.feature_vectors.count(),
    userRulesCount: await database.user_rules.count(),
  };
}

// Repository API

export async function getTextCache(hash: string): Promise<TextCacheEntry | undefined> {
  const database = getDB();
  if (!database) throw new Error('CarrotDB is not available');
  try {
    return await database.text_cache.get(hash);
  } catch (err) {
    console.warn('[Carrot DB] getTextCache error:', err);
    throw err;
  }
}

export async function putTextCache(entry: TextCacheEntry): Promise<TextCacheEntry> {
  const database = getDB();
  if (!database) throw new Error('CarrotDB is not available');
  try {
    // The write and the limit check must be one transaction. Otherwise
    // concurrent content-script writes can all pass the count check before
    // any purge commits, leaving more than 10,000 rows in the store.
    return await database.transaction('rw', database.text_cache, async () => {
      await database.text_cache.put(entry);
      const stored = await database.text_cache.get(entry.hash);
      if (!stored) {
        throw new Error(`Stored text cache entry could not be read back: ${entry.hash}`);
      }

      await purgeTextCacheInTransaction(
        database,
        DEFAULT_TEXT_CACHE_MAX_ITEMS,
        DEFAULT_TEXT_CACHE_TARGET_ITEMS,
      );
      return stored;
    });
  } catch (err) {
    console.warn('[Carrot DB] putTextCache error:', err);
    throw err;
  }
}

export async function deleteTextCache(hash: string): Promise<void> {
  const database = getDB();
  if (!database) return;
  try {
    await database.text_cache.delete(hash);
  } catch (err) {
    console.warn('[Carrot DB] deleteTextCache error:', err);
  }
}

export async function countTextCache(): Promise<number> {
  const database = getDB();
  if (!database) return 0;
  try {
    return await database.text_cache.count();
  } catch (err) {
    console.warn('[Carrot DB] countTextCache error:', err);
    return 0;
  }
}

/** Purge helper. The caller owns the transaction. */
async function purgeTextCacheInTransaction(
  database: TextCacheDatabase,
  maxItems: number,
  targetItems: number,
): Promise<number> {
  const count = await database.text_cache.count();
  if (count <= maxItems) return 0;

  // Keep the existing oldest-first eviction policy: once the high-water
  // mark is crossed, remove 2,000 rows (or the configured reduction amount).
  const rowsToDelete = Math.min(count, maxItems - targetItems);
  if (rowsToDelete <= 0) return 0;

  const oldestKeys = await database.text_cache
    .orderBy('created_at')
    .limit(rowsToDelete)
    .primaryKeys();
  if (oldestKeys.length > 0) {
    await database.text_cache.bulkDelete(oldestKeys as string[]);
  }
  return oldestKeys.length;
}

/**
 * Remove the oldest cache rows after the high-water mark is crossed.
 *
 * With the default configuration, text_cache is allowed to reach 10,000
 * rows. The next write removes the oldest 2,000 rows, leaving at most
 * 10,000 rows (10,001 rows becomes 8,001 rows).
 */
export async function purgeOldTextCache(
  maxItems = DEFAULT_TEXT_CACHE_MAX_ITEMS,
  targetItems = Math.max(0, maxItems - DEFAULT_TEXT_CACHE_PURGE_ITEMS),
): Promise<void> {
  const database = getDB();
  if (!database) return;

  if (!Number.isSafeInteger(maxItems) || maxItems < 0) {
    throw new RangeError(`maxItems must be a non-negative safe integer: ${maxItems}`);
  }
  if (!Number.isSafeInteger(targetItems) || targetItems < 0) {
    throw new RangeError(`targetItems must be a non-negative safe integer: ${targetItems}`);
  }
  if (targetItems > maxItems) {
    throw new RangeError(
      `targetItems must be less than or equal to maxItems: ${targetItems} > ${maxItems}`,
    );
  }

  try {
    await database.transaction('rw', database.text_cache, async () => {
      const deleted = await purgeTextCacheInTransaction(
        database,
        maxItems,
        targetItems,
      );
      if (deleted > 0) {
        console.log(`[Carrot DB] Purged ${deleted} old cache entries.`);
      }
    });
  } catch (err) {
    console.warn('[Carrot DB] purgeOldTextCache error:', err);
    throw err;
  }
}

export async function addFeatureVector(label: string, vector: [number, number, number]): Promise<number | undefined> {
  if (!label) {
    console.warn('[Carrot DB] Empty label is not allowed.');
    return undefined;
  }
  if (vector.length !== 3 || !vector.every(Number.isFinite)) {
     console.warn('[Carrot DB] Invalid feature vector length or content.');
     return undefined;
  }
  
  // Normalize vector values to [0, 1] bounds if needed
  const normalizedVector = vector.map(v => Math.max(0, Math.min(1, v))) as [number, number, number];

  const database = getDB();
  if (!database) return undefined;
  try {
    return await database.feature_vectors.add({ label, vector: normalizedVector });
  } catch (err) {
    console.warn('[Carrot DB] addFeatureVector error:', err);
    return undefined;
  }
}

export async function getFeatureVector(id: number): Promise<FeatureVectorEntry | undefined> {
  const database = getDB();
  if (!database) return undefined;
  try {
    return await database.feature_vectors.get(id);
  } catch (err) {
    console.warn('[Carrot DB] getFeatureVector error:', err);
    return undefined;
  }
}

export async function getFeatureVectorsByLabel(label: string): Promise<FeatureVectorEntry[]> {
  const database = getDB();
  if (!database) return [];
  try {
    return await database.feature_vectors.where('label').equals(label).toArray();
  } catch (err) {
    console.warn('[Carrot DB] getFeatureVectorsByLabel error:', err);
    return [];
  }
}

export async function getAllFeatureVectors(): Promise<FeatureVectorEntry[]> {
  const database = getDB();
  if (!database) throw new Error('CarrotDB is not available');
  try {
    return await database.feature_vectors.toArray();
  } catch (err) {
    console.warn('[Carrot DB] getAllFeatureVectors error:', err);
    throw err;
  }
}

export async function deleteFeatureVector(id: number): Promise<void> {
  const database = getDB();
  if (!database) return;
  try {
    await database.feature_vectors.delete(id);
  } catch (err) {
    console.warn('[Carrot DB] deleteFeatureVector error:', err);
  }
}

export async function getUserRules(): Promise<UserRuleEntry | undefined> {
  const database = getDB();
  if (!database) throw new Error('CarrotDB is not available');
  return database.user_rules.get('settings');
}

export async function putUserRules(entry: UserRuleEntry): Promise<UserRuleEntry> {
  const database = getDB();
  if (!database) throw new Error('CarrotDB is not available');
  await database.user_rules.put(entry);
  const stored = await database.user_rules.get(entry.key);
  if (!stored) throw new Error('User rules could not be read back');
  return stored;
}
