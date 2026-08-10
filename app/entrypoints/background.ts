import {
  getTextCache,
  putTextCache,
  deleteTextCache,
  countTextCache,
  purgeOldTextCache,
  addFeatureVector,
  getFeatureVector,
  getFeatureVectorsByLabel,
  getAllFeatureVectors,
  deleteFeatureVector,
  getUserRules,
  putUserRules,

  getDB,
  openDB,
  getDatabaseStatus,
} from "../utils/db";
import type { DBMessage, DBResponse } from "../utils/messaging";
import vectorDataset from "../assets/ai-cliches-vectors.json";
import { defaultUserRules, normalizeUserRules } from "../utils/settings";

export default defineBackground(() => {
  console.log("====================================");
  console.log("🥕 [Carrot Background] Service worker loaded successfully!");
  console.log("====================================");

  /**
   * DB 준비 완료 Promise.
   * 메시지 핸들러는 이 Promise가 resolve될 때까지 DB 작업을 대기합니다.
   * 이를 통해 Dexie 스키마 업그레이드(v1→v2) 완료 전에 Content Script의
   * 메시지가 도착했을 때 발생하는 InvalidStateError를 방지합니다.
   */
  let dbReadyResolve!: () => void;
  const dbReadyPromise = new Promise<void>((resolve) => {
    dbReadyResolve = resolve;
  });

  // DB를 명시적으로 열고 업그레이드가 완료될 때까지 기다립니다.
  const dbInstance = getDB();
  if (dbInstance) {
    openDB()
      .then(() => {
        console.log(
          "[Carrot Background] ✅ IndexedDB (CarrotDB) opened successfully.",
        );
        dbReadyResolve();
      })
      .catch((err) => {
        console.warn("[Carrot Background] ⚠️ IndexedDB open failed:", err);
        dbReadyResolve(); // 실패해도 unblock — 이후 작업이 각자 에러 처리함
      });
  } else {
    console.warn(
      "[Carrot Background] ⚠️ getDB() returned null. DB unavailable.",
    );
    dbReadyResolve();
  }

  /**
   * AI 전형 벡터 시딩 (최초 1회).
   * DB 준비 완료 후 실행됩니다.
   */
  async function seedFeatureVectors(): Promise<void> {
    try {
      const existing = await getAllFeatureVectors();
      if (existing.length > 0) {
        console.log(
          `[Carrot Background] Feature vector cache already seeded (${existing.length} entries). Skipping.`,
        );
        return;
      }

      const dataset = vectorDataset as {
        version: string;
        vectors: Array<{
          id: string;
          lang: string;
          label: string;
          vector: number[];
        }>;
      };

      let seeded = 0;
      for (const entry of dataset.vectors) {
        if (entry.vector.length === 5) {
          const id = await addFeatureVector(
            entry.label,
            entry.vector as [number, number, number, number, number],
          );
          if (id === undefined) {
            throw new Error(`Failed to insert vector ${entry.id}`);
          }
          seeded++;
        }
      }
      const seededEntries = await getAllFeatureVectors();
      if (seededEntries.length !== seeded) {
        throw new Error(
          `Vector seed verification failed: expected ${seeded}, got ${seededEntries.length}`,
        );
      }
      console.log(
        `[Carrot Background] ✅ Seeded ${seeded} AI cliché feature vectors from dataset v${dataset.version}.`,
      );
    } catch (err) {
      console.warn("[Carrot Background] Failed to seed feature vectors:", err);
    }
  }

  // DB 준비 후 시딩 실행. Content Script의 벡터 조회도 이 Promise를 기다립니다.
  const featureVectorsReady = dbReadyPromise.then(() => seedFeatureVectors());

  // Purge check interval (24 hours)
  const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

  async function checkAndPurge() {
    try {
      const data = await browser.storage.local.get("lastPurgeTimestamp");
      const lastPurge = (data.lastPurgeTimestamp as number) || 0;
      const now = Date.now();

      if (now - lastPurge > PURGE_INTERVAL_MS) {
        console.log("[Carrot Background] Running periodic cache purge...");
        await purgeOldTextCache();
        await browser.storage.local.set({ lastPurgeTimestamp: now });
      }
    } catch (err) {
      console.warn("[Carrot Background] Error during purge check:", err);
    }
  }

  // Run purge check after DB is ready
  dbReadyPromise.then(() => checkAndPurge());

  setInterval(
    () => {
      console.log(
        "🥕 [Carrot Background] Heartbeat: Background script is running...",
      );
      checkAndPurge();
    },
    60 * 60 * 1000,
  );

  // Register Message Listener
  browser.runtime.onMessage.addListener((message: any) => {
    if (
      !message ||
      typeof message.type !== "string" ||
      !message.type.startsWith("DB_")
    ) {
      return undefined;
    }

    const dbMsg = message as DBMessage;

    return (async (): Promise<DBResponse<any>> => {
      // DB 준비 및 벡터 시딩 완료 후 처리합니다.
      await featureVectorsReady;

      try {
        let result: any = undefined;

        switch (dbMsg.type) {
          case "DB_GET_TEXT_CACHE":
            result = await getTextCache(dbMsg.payload.hash);
            break;
          case "DB_PUT_TEXT_CACHE":
            result = await putTextCache(dbMsg.payload.entry);
            break;
          case "DB_DELETE_TEXT_CACHE":
            result = await deleteTextCache(dbMsg.payload.hash);
            break;
          case "DB_COUNT_TEXT_CACHE":
            result = await countTextCache();
            break;
          case "DB_PURGE_TEXT_CACHE":
            result = await purgeOldTextCache(
              dbMsg.payload.maxItems,
              dbMsg.payload.targetItems,
            );
            break;
          case "DB_ADD_FEATURE_VECTOR":
            result = await addFeatureVector(
              dbMsg.payload.label,
              dbMsg.payload.vector,
            );
            break;
          case "DB_GET_FEATURE_VECTOR":
            result = await getFeatureVector(dbMsg.payload.id);
            break;
          case "DB_GET_FEATURE_VECTORS_BY_LABEL":
            result = await getFeatureVectorsByLabel(dbMsg.payload.label);
            break;
          case "DB_GET_ALL_FEATURE_VECTORS":
            result = await getAllFeatureVectors();
            break;
          case "DB_DELETE_FEATURE_VECTOR":
            result = await deleteFeatureVector(dbMsg.payload.id);
            break;
          case "DB_GET_USER_RULES": {
            const stored = await getUserRules();
            result = stored ?? { key: 'settings', value: defaultUserRules, updated_at: Date.now() };
            break;
          }
          case "DB_PUT_USER_RULES":
            result = await putUserRules({
              key: 'settings',
              value: normalizeUserRules(dbMsg.payload.rules),
              updated_at: Date.now(),
            });
            break;

          case "DB_GET_STATUS":
            result = await getDatabaseStatus();
            console.log("[Carrot Background] DB status:", result);
            break;
          default:
            throw new Error(`Unknown DB message type: ${(dbMsg as any).type}`);
        }

        return { success: true, data: result };
      } catch (err) {
        console.error(
          `[Carrot Background] DB operation failed for ${dbMsg.type}:`,
          err,
        );
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })();
  });
});
