import { generateSHA256 } from './crypto';
import { calculateAISymbolSignal, extractFeatureVector, extractTextMetrics, type TextMetrics } from './vector';
import { dbClient } from './messaging';
import { detectLanguage, findMaximumClicheSimilarity, VECTOR_MODEL_VERSION } from './cosineSimilarity';


const TARGET_SELECTOR = 'p, article, section, div, span, li, h1, h2, h3, h4, h5, h6';
const CARROT_UI_SELECTOR = '#carrot-detector-badge, [data-carrot-ui]';
const COUPANG_REVIEW_SELECTOR = [
  '.sdp-review__article__list__review__content',
  '.js_reviewArticleContent',
  '[data-component="review-content"]',
].join(', ');
const MIN_TEXT_LENGTH = 15;
const SCROLL_DEBOUNCE_MS = 200;

/**
 * 임시 AI 확률 계산기
 * TODO: 실제 ML 모델이나 의사결정 트리로 교체할 것.
 */
const AI_SIMILARITY_THRESHOLD = 0.95;
const AI_SYMBOL_WEIGHT = 0.08;
const SCORE_MODEL_VERSION = `${VECTOR_MODEL_VERSION}:symbols-v1`;

class DOMTextScanner {
  private intersectionObserver: IntersectionObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private observedElements = new Set<Element>();
  private visibleElements = new Set<Element>();
  private scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  public init(): void {
    if (typeof window === 'undefined') return;

    // Content scripts can run before <body> exists. The caller normally uses
    // document_idle, but keeping this guard makes initialization deterministic
    // for pages that replace their document during navigation.
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => this.init(), { once: true });
      return;
    }

    this.setupIntersectionObserver();
    this.setupMutationObserver();
    this.setupScrollListener();
    this.scanInitialDOM();
    this.scheduleDebouncedProcessing();

    const msg = '[Carrot] DOM Text Scanner initialized with 200ms scroll debounce.';
    console.log(msg);
    console.warn(msg);
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
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.observeElementTree(node as Element);
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
    }

    // Keep a generic fallback for Coupang DOM variants and other websites.
    if (candidates.length === 0) {
      if (root.matches(TARGET_SELECTOR)) candidates.push(root);
      candidates.push(...Array.from(root.querySelectorAll(TARGET_SELECTOR)));
    }

    for (const el of candidates) {
      if (el.matches(CARROT_UI_SELECTOR) || el.closest(CARROT_UI_SELECTOR)) continue;
      if (isCoupangProduct && !el.closest('#sdpReview')) continue;

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

  /**
   * 뷰포트 내 모든 텍스트 요소 처리.
   * SHA-256 해시 생성, Dexie 캐시 확인, 5D 벡터 계산 및 로컬 저장 수행.
   */
  private async processVisibleElements(): Promise<void> {
    const elementsToProcess = Array.from(this.visibleElements);
    if (elementsToProcess.length === 0) return;

    for (const el of elementsToProcess) {
      if (el.matches(CARROT_UI_SELECTOR) || el.closest(CARROT_UI_SELECTOR)) continue;
      const text = el.textContent?.trim();
      if (!text || text.length < MIN_TEXT_LENGTH) continue;

      try {
        // 1. 웹 Crypto API를 사용한 SHA-256 해시 생성
        const hash = await generateSHA256(`${SCORE_MODEL_VERSION}:${text}`);

        // 2. Background DB Client 캐시 조회
        const cached = await dbClient.getTextCache(hash);
        if (cached?.text === text) {
          const msg = `[Carrot] Cache Hit for hash ${hash.substring(0, 8)}... Score: ${cached.score}`;
          console.log(msg);
          console.warn(msg);
          continue;
        }

        // 3. 메트릭 추출 및 임시 판정
        const metrics = extractTextMetrics(text);
        const vector = extractFeatureVector(text);
        const match = findMaximumClicheSimilarity(vector, detectLanguage(text));
        const symbolSignal = calculateAISymbolSignal(text);
        const score = Number(Math.min(match.score + symbolSignal * AI_SYMBOL_WEIGHT, 1).toFixed(4));
        const is_ai = score >= AI_SIMILARITY_THRESHOLD;

        // 4. 로컬 DB 저장 (Background로 메시지 전송)
        const stored = await dbClient.putTextCache({
          hash,
          text,
          score,
          is_ai,
          metrics,
          created_at: Date.now()
        });

        if (stored.hash !== hash) {
          throw new Error(`DB verification failed for ${hash}`);
        }

        const msg = `[Carrot] Cache Miss -> Stored and verified ${hash.substring(0, 8)}...: ${JSON.stringify(metrics)} (Score: ${score})`;
        console.log(msg);
        console.warn(msg);
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
  }
}

export const domTextScanner = new DOMTextScanner();
