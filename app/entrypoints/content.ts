import { dbClient } from "../utils/messaging";
import {
  defaultUserRules,
  isDomainExcluded,
  normalizeUserRules,
} from "../utils/settings";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  async main() {
    const loc = typeof window !== "undefined" ? window.location?.href : "";
    let rules = defaultUserRules;
    // 사용자 설정 값 가져오기
    try {
      const stored = await dbClient.getUserRules();
      rules = normalizeUserRules(stored?.value);
    } catch (error) {
      console.warn(
        "[Carrot] Failed to load user rules; using defaults.",
        error,
      );
    }
    if (
      typeof window !== "undefined" &&
      isDomainExcluded(window.location.hostname, rules.excludedDomains)
    ) {
      console.log(
        "[Carrot] Domain excluded by user rule:",
        window.location.hostname,
      );
      return;
    }
    console.error("[Carrot Runtime] content script main() entered:", loc);
    console.log("[Carrot Main] main() function executing on:", loc);

    // DOM 감지 초기화
    const initScanner = async () => {
      try {
        const { domTextScanner } = await import("../utils/domObserver");
        await domTextScanner.init();
      } catch (err) {
        console.error("[Carrot Scanner Error]:", err);
      }
    };

    if (document.body) {
      initScanner();
    } else {
      document.addEventListener("DOMContentLoaded", () => void initScanner(), {
        once: true,
      });
    }
  },
});
