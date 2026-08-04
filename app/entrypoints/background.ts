import {
  getTextCache,
  putTextCache,
  deleteTextCache,
  countTextCache,
  purgeOldTextCache,
  addFeatureVector,
  getFeatureVector,
  getFeatureVectorsByLabel,
  deleteFeatureVector,
  putFeedbackLog,
  getFeedbackLog,
  getDB
} from '../utils/db';
import type { DBMessage, DBResponse } from '../utils/messaging';

export default defineBackground(() => {
  console.log('====================================');
  console.log('🥕 [Carrot Background] Service worker loaded successfully!');
  console.log('====================================');

  // Initialize DB gracefully on startup
  getDB();

  // Purge check interval (24 hours)
  const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
  
  async function checkAndPurge() {
    try {
      const data = await browser.storage.local.get('lastPurgeTimestamp');
      const lastPurge = (data.lastPurgeTimestamp as number) || 0;
      const now = Date.now();
      
      if (now - lastPurge > PURGE_INTERVAL_MS) {
        console.log('[Carrot Background] Running periodic cache purge...');
        await purgeOldTextCache();
        await browser.storage.local.set({ lastPurgeTimestamp: now });
      }
    } catch (err) {
      console.warn('[Carrot Background] Error during purge check:', err);
    }
  }

  // Run purge check on startup
  checkAndPurge();

  setInterval(() => {
    console.log('🥕 [Carrot Background] Heartbeat: Background script is running...');
    checkAndPurge();
  }, 60 * 60 * 1000); // Heartbeat and check every hour

  // Register Message Listener
  browser.runtime.onMessage.addListener((message: any) => {
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('DB_')) {
      return undefined; // Not a DB message, allow others to handle it
    }

    const dbMsg = message as DBMessage;

    // Returning the Promise keeps the message channel open until the DB work
    // and the read-back verification have both completed.
    return (async (): Promise<DBResponse<any>> => {
      try {
        let result: any = undefined;

        switch (dbMsg.type) {
          case 'DB_GET_TEXT_CACHE':
            result = await getTextCache(dbMsg.payload.hash);
            break;
          case 'DB_PUT_TEXT_CACHE':
            result = await putTextCache(dbMsg.payload.entry);
            break;
          case 'DB_DELETE_TEXT_CACHE':
            result = await deleteTextCache(dbMsg.payload.hash);
            break;
          case 'DB_COUNT_TEXT_CACHE':
            result = await countTextCache();
            break;
          case 'DB_PURGE_TEXT_CACHE':
            result = await purgeOldTextCache(dbMsg.payload.maxItems, dbMsg.payload.targetItems);
            break;
          case 'DB_ADD_FEATURE_VECTOR':
            result = await addFeatureVector(dbMsg.payload.label, dbMsg.payload.vector);
            break;
          case 'DB_GET_FEATURE_VECTOR':
            result = await getFeatureVector(dbMsg.payload.id);
            break;
          case 'DB_GET_FEATURE_VECTORS_BY_LABEL':
            result = await getFeatureVectorsByLabel(dbMsg.payload.label);
            break;
          case 'DB_DELETE_FEATURE_VECTOR':
            result = await deleteFeatureVector(dbMsg.payload.id);
            break;
          case 'DB_PUT_FEEDBACK_LOG':
            result = await putFeedbackLog(dbMsg.payload.entry);
            break;
          case 'DB_GET_FEEDBACK_LOG':
            result = await getFeedbackLog(dbMsg.payload.hash);
            break;
          default:
            throw new Error(`Unknown DB message type: ${(dbMsg as any).type}`);
        }

        return { success: true, data: result };
      } catch (err) {
        console.error(`[Carrot Background] DB operation failed for ${dbMsg.type}:`, err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    })();
  });
});
