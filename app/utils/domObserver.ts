import { generateSHA256 } from './crypto';
import { calculateAISymbolSignal, extractFeatureVector, extractTextMetrics, type TextMetrics } from './vector';
import { dbClient } from './messaging';
import { defaultUserRules, isDomainExcluded, normalizeUserRules, type UserRules } from './settings';
import {
  updateFeatureVectorCache,
  isFeatureVectorCacheLoaded,
  computeMaxCosineSimilarity,
  computeCompositeAIScore,
} from './cosine';

const TARGET_SELECTOR = 'p, article, section, div, span, li, h1, h2, h3, h4, h5, h6';
const CARROT_UI_SELECTOR = '[data-carrot-ui]';
const COUPANG_REVIEW_SELECTOR = [
  '.sdp-review__article__list__review__content',
  '.js_reviewArticleContent',
  '[data-component="review-content"]',
].join(', ');
/** 공백 정리 후 50자 이상인 텍스트만 AI 분석 대상으로 삼습니다. */
const MIN_TEXT_LENGTH = 50;
const SCROLL_DEBOUNCE_MS = 200;
const CARROT_MASK_STYLE_ID = 'carrot-ai-mask-styles';
/** 이모티콘 신호의 최종 점수 가산 한도: 최대 15%p. */
const AI_SYMBOL_WEIGHT = 0.15;
const SCORE_MODEL_VERSION = 'ko-ngram-symbol-v4';

function ensureMaskStyles(): void {
  if (document.getElementById(CARROT_MASK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = CARROT_MASK_STYLE_ID;
  style.textContent = `
    .carrot-ai-masked {
      filter: blur(5px) !important;
      cursor: pointer !important;
      transition: filter 160ms ease;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

class DOMTextScanner {
  private intersectionObserver: IntersectionObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private observedElements = new Set<Element>();
  private visibleElements = new Set<Element>();
  private scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private vectorCacheReady = false;
  private vectorCacheRetryInFlight = false;
  private initStarted = false;
  private userRules: UserRules = defaultUserRules;
  private originalFilters = new WeakMap<Element, string>();
  private originalTitles = new WeakMap<Element, string | null>();
  public async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    if (this.initStarted || this.intersectionObserver || this.mutationObserver) {
      console.warn('[Carrot Scanner] init() ignored: scanner is already initialized.');
      return;
    }

    // Content scripts can run before <body> exists. The caller normally uses
    // document_idle, but keeping this guard makes initialization deterministic
    // for pages that replace their document during navigation.
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => void this.init(), { once: true });
      return;
    }

    try {
      const storedRules = await dbClient.getUserRules();
      this.userRules = normalizeUserRules(storedRules?.value);
    } catch (error) {
      console.warn('[Carrot Scanner] Failed to load user rules; using defaults.', error);
      this.userRules = defaultUserRules;
    }
    if (isDomainExcluded(location.hostname, this.userRules.excludedDomains)) {
      console.log('[Carrot Scanner] Domain excluded by user rule:', location.hostname);
      return;
    }

    this.initStarted = true;
    this.setupIntersectionObserver();
    this.setupMutationObserver();
    this.setupScrollListener();
    this.scanInitialDOM();

    // Background에서 AI 전형 벡터 세트를 비동기로 로드하여 메모리 캐시에 저장.
    // DOM 감지는 벡터 로드 실패와 무관하게 계속 유지합니다.
    try {
      await this.loadFeatureVectorCache();
      this.vectorCacheReady = true;
    } catch (err) {
      console.error('[Carrot Scanner] Vector cache is not ready; retrying on the next DOM update:', err);
    }

    this.scheduleDebouncedProcessing();

    const msg = '[Carrot] DOM Text Scanner initialized with 200ms scroll debounce.';
    console.log(msg);
    console.warn(msg);
  }

  /**
   * Background DB에서 feature_vectors(ai_cliche)를 로드하여 메모리 캐시를 준비합니다.
   * 이후 processVisibleElements에서 코사인 유사도 계산에 사용됩니다.
   */
  private async loadFeatureVectorCache(): Promise<void> {
    try {
      const entries = await dbClient.getAllFeatureVectors();
      const status = await dbClient.getDatabaseStatus();
      console.log('[Carrot DB] Runtime status:', status);
      updateFeatureVectorCache(entries);
      if (entries.length === 0) {
        throw new Error('Feature vector DB is empty after seed verification');
      }
      if (!entries.some((entry) => entry.label === 'ai_cliche')) {
        throw new Error('Feature vector DB has no ai_cliche entries');
      }
    } catch (err) {
      console.warn('[Carrot] Failed to load feature vector cache:', err);
      throw err;
    }
  }

  private retryFeatureVectorCache(): void {
    if (this.vectorCacheReady || this.vectorCacheRetryInFlight) return;
    this.vectorCacheRetryInFlight = true;
    void this.loadFeatureVectorCache()
      .then(() => {
        this.vectorCacheReady = true;
        console.log('[Carrot Scanner] Vector cache became ready after retry.');
        this.scheduleDebouncedProcessing();
      })
      .catch(() => undefined)
      .finally(() => {
        this.vectorCacheRetryInFlight = false;
      });
  }

  /**
   * 뷰포트 내 요소 감지를 위한 IntersectionObserver 설정
   */
  private setupIntersectionObserver(): void {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.visibleElements.add(entry.target);
          } else {
            this.visibleElements.delete(entry.target);
          }
        }
        this.scheduleDebouncedProcessing();
      },
      {
        root: null, // Viewport
        rootMargin: '0px',
        threshold: 0.1,
      }
    );
  }

  /**
   * 동적 DOM(무한 스크롤)의 childList 및 subtree 변경을 모니터링하기 위한 MutationObserver 설정
   */
  private setupMutationObserver(): void {
    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldProcess = false;
      let addedElements = 0;
      this.retryFeatureVectorCache();
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.observeElementTree(node as Element);
              addedElements++;
              shouldProcess = true;
            }
          }
        } else if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement;
          if (parent && !parent.closest(CARROT_UI_SELECTOR)) {
            this.observeElementTree(parent);
            shouldProcess = true;
          }
        }
      }
      if (shouldProcess) {
        console.log(`[Carrot DOM] Mutation detected: ${addedElements} element(s) queued.`);
        this.scheduleDebouncedProcessing();
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /**
   * 스크롤 이벤트를 수신하고 디바운싱된 분석을 트리거(200ms 정지)
   */
  private setupScrollListener(): void {
    window.addEventListener(
      'scroll',
      () => {
        this.scheduleDebouncedProcessing();
      },
      { passive: true }
    );
  }

  /**
   * 스크롤/DOM 업데이트가 멈춘 후 200ms 후에 벡터 연산 트리거를 예약
   */
  private scheduleDebouncedProcessing(): void {
    if (this.scrollDebounceTimer) {
      clearTimeout(this.scrollDebounceTimer);
    }

    this.scrollDebounceTimer = setTimeout(() => {
      this.processVisibleElements();
    }, SCROLL_DEBOUNCE_MS);
  }

  /**
   * 페이지에 처음부터 존재하는 요소를 스캔
   */
  private scanInitialDOM(): void {
    this.observeElementTree(document.body);
    console.log(`[Carrot DOM] Initial scan registered ${this.observedElements.size} text element(s).`);
  }

  /**
   * 요소 트리를 탐색하고 IntersectionObserver에 텍스트 컨테이너를 등록
   */
  private observeElementTree(root: Element): void {
    if (!this.intersectionObserver) return;
    if (root.matches(CARROT_UI_SELECTOR) || root.closest(CARROT_UI_SELECTOR)) return;

    const candidates: Element[] = [];
    const isCoupangProduct = location.hostname.endsWith('coupang.com') && location.pathname.startsWith('/vp/products/');
    const reviewRoot = root.matches('#sdpReview') ? root : root.closest('#sdpReview');

    if (isCoupangProduct && !reviewRoot && !root.querySelector('#sdpReview')) {
      return;
    }

    if (isCoupangProduct) {
      if (root.matches(COUPANG_REVIEW_SELECTOR)) candidates.push(root);
      candidates.push(...Array.from(root.querySelectorAll(COUPANG_REVIEW_SELECTOR)));

      // Coupang has changed review class names several times. Fall back to
      // paragraph-level nodes under a review-like container.
      if (candidates.length === 0) {
        candidates.push(...Array.from(root.querySelectorAll(
          '#sdpReview p, #sdpReview li, [class*="review"] p, [class*="review"] li'
        )));
      }
    }

    // Keep a generic fallback for Coupang DOM variants and other websites.
    if (candidates.length === 0) {
      if (root.matches(TARGET_SELECTOR)) candidates.push(root);
      candidates.push(...Array.from(root.querySelectorAll(TARGET_SELECTOR)));
    }

    for (const el of candidates) {
      if (el.matches(CARROT_UI_SELECTOR) || el.closest(CARROT_UI_SELECTOR)) continue;
      if (
        isCoupangProduct &&
        !el.closest('#sdpReview') &&
        !el.closest('[class*="review"]')
      ) continue;

      // p, h1~h6, li 태그이거나 자식 내부에 하위 블록 태그(p, div, article 등)가 없는 단락 수준 요소 선택
      const hasSubBlocks = el.querySelector('p, article, section, div, h1, h2, h3, h4, h5, h6') !== null;
      if (hasSubBlocks && !['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'].includes(el.tagName)) {
        continue;
      }

      const text = el.textContent?.trim() || '';
      if (text.length >= MIN_TEXT_LENGTH) {
        if (!this.observedElements.has(el)) {
          this.observedElements.add(el);
          this.intersectionObserver.observe(el);
        }
      }
    }
  }

  private applyAnalysisResult(el: Element, score: number, isAi: boolean, metrics: TextMetrics, blockedWord?: string): void {
    const htmlElement = el as HTMLElement;
    if (!this.originalTitles.has(el)) this.originalTitles.set(el, htmlElement.title || null);

    if (isAi && this.userRules.autoMask) {
      ensureMaskStyles();
      if (!this.originalFilters.has(el)) this.originalFilters.set(el, htmlElement.style.filter);
      htmlElement.classList.add('carrot-ai-masked');
      if (!htmlElement.dataset.carrotMaskBound) {
        htmlElement.dataset.carrotMaskBound = 'true';
        htmlElement.addEventListener('click', () => {
          htmlElement.classList.remove('carrot-ai-masked');
          htmlElement.style.filter = this.originalFilters.get(el) || '';
          delete htmlElement.dataset.carrotMaskBound;
        }, { once: true });
      }
    } else {
      htmlElement.classList.remove('carrot-ai-masked');
      htmlElement.style.filter = this.originalFilters.get(el) || '';
    }

    if (isAi && this.userRules.showTooltip) {
      const variation = Math.round(metrics.burstiness * 100);
      const cliché = Math.round(metrics.ngram * 100);
      const reasons = [
        `문장 변동성 ${variation}% - ${metrics.burstiness < 0.5 ? '변동성 낮음' : '변동성 높음'}`,
        `상투어 반복 ${cliché}%`,
      ];
      if (blockedWord) reasons.unshift(`커스텀 차단 단어: ${blockedWord}`);
      htmlElement.title = `AI 확신도: ${Math.round(score * 100)}% (${reasons.join(', ')})\n클릭하면 Blur가 해제됩니다.`;
    } else {
      const originalTitle = this.originalTitles.get(el);
      if (originalTitle) htmlElement.title = originalTitle;
      else htmlElement.removeAttribute('title');
    }
  }

  /**
   * 뷰포트 내 모든 텍스트 요소 처리.
   * SHA-256 해시 생성, Dexie 캐시 확인, 5D 벡터 계산 및 로컬 저장 수행.
   * 코사인 유사도 기반 복합 AI 확률 점수 산출 후 is_ai 결정.
   */
  private async processVisibleElements(): Promise<void> {
    if (!this.vectorCacheReady) {
      console.log('[Carrot DOM] Processing pass skipped: vector cache is not ready.');
      return;
    }

    const elementsToProcess = Array.from(this.visibleElements);
    if (elementsToProcess.length === 0) {
      console.log('[Carrot DOM] Processing pass: no visible text elements.');
      return;
    }

    console.log(`[Carrot DOM] Processing ${elementsToProcess.length} visible text element(s).`);

    for (const el of elementsToProcess) {
      if (el.matches(CARROT_UI_SELECTOR) || el.closest(CARROT_UI_SELECTOR)) continue;
      const text = el.textContent?.trim();
      if (!text || text.length < MIN_TEXT_LENGTH) continue;

      try {
        // 1. 웹 Crypto API를 사용한 SHA-256 해시 생성
        const hash = await generateSHA256(`${SCORE_MODEL_VERSION}:${text}`);

        // 2. Background DB Client 캐시 조회
        const cached = await dbClient.getTextCache(hash);
        if (cached?.text === text && cached.vector?.length === 3) {
          const normalizedCachedText = cached.text.toLocaleLowerCase();
          const cachedBlockedWord = this.userRules.blockedWords.find((word) => normalizedCachedText.includes(word));
          const effectiveScore = cachedBlockedWord ? 1 : cached.score;
          const effectiveIsAi = cachedBlockedWord !== undefined || effectiveScore >= this.userRules.threshold;
          if (cached.score !== effectiveScore || cached.is_ai !== effectiveIsAi) {
            await dbClient.putTextCache({ ...cached, score: effectiveScore, is_ai: effectiveIsAi });
          }
          this.applyAnalysisResult(el, effectiveScore, effectiveIsAi, cached.metrics, cachedBlockedWord);
          const msg = `[Carrot] Cache Hit for hash ${hash.substring(0, 8)}... Score: ${effectiveScore} | threshold: ${this.userRules.threshold} | is_ai: ${effectiveIsAi}`;
          console.log(msg);
          continue;
        }

        // 3. 메트릭 추출 및 3차원 코사인 벡터 계산(N-gram 제외)
        const metrics = extractTextMetrics(text);
        const vector = extractFeatureVector(text);

        // 4. 코사인 유사도 계산 (메모리 캐시 사용, 비동기 없음)
        //    캐시가 아직 로드 안 됐으면 0으로 처리 (graceful degradation)
        const cosineMax = isFeatureVectorCacheLoaded()
          ? computeMaxCosineSimilarity(vector)
          : 0;

        // 5. 복합 AI 확률 점수 산출
        //    score = 0.40*cosineMax + 0.20*(1-burstiness) + 0.20*ngram + 0.20*(1-entropy)
        const baseScore = computeCompositeAIScore({
          cosineMax,
          burstiness: metrics.burstiness,
          entropy: metrics.entropy,
          ngram: metrics.ngram,
        });
        const symbolSignal = calculateAISymbolSignal(text);
        const score = Number(Math.min(baseScore + symbolSignal * AI_SYMBOL_WEIGHT, 1).toFixed(4));

        // 사용자 차단 단어는 확률 계산 결과와 무관하게 AI 콘텐츠로 판정합니다.
        const normalizedText = text.toLocaleLowerCase();
        const matchedBlockedWord = this.userRules.blockedWords.find((word) => normalizedText.includes(word));
        const finalScore = matchedBlockedWord ? 1 : score;
        const is_ai = matchedBlockedWord !== undefined || finalScore >= this.userRules.threshold;

        // 7. 로컬 DB 저장 (Background로 메시지 전송)
        const stored = await dbClient.putTextCache({
          hash,
          text,
          vector,
          score: finalScore,
          is_ai,
          metrics,
          created_at: Date.now()
        });

        if (stored.hash !== hash) {
          throw new Error(`DB verification failed for ${hash}`);
        }

        this.applyAnalysisResult(el, finalScore, is_ai, metrics, matchedBlockedWord);
        const msg = `[Carrot] Analyzed ${hash.substring(0, 8)}... | cosine: ${cosineMax.toFixed(3)} | score: ${finalScore.toFixed(3)} | threshold: ${this.userRules.threshold.toFixed(2)} | is_ai: ${is_ai} | metrics: ${JSON.stringify(metrics)}`;
        console.log(msg);
        if (is_ai) console.warn(`🥕 [Carrot AI DETECTED] ${hash.substring(0, 8)}... Score: ${finalScore.toFixed(3)}`);
      } catch (err) {
        console.error('[Carrot] Error processing element:', err);
      }
    }
  }

  public destroy(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    if (this.scrollDebounceTimer) {
      clearTimeout(this.scrollDebounceTimer);
    }
    this.observedElements.clear();
    this.visibleElements.clear();
    this.initStarted = false;
  }
}

export const domTextScanner = new DOMTextScanner();
