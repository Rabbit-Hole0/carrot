import { getCacheByHash, saveCache } from './db';
import { generateSHA256 } from './crypto';
import { extractFeatureVector } from './vector';

const TARGET_SELECTOR = 'p, article, section, div, span, li, h1, h2, h3, h4, h5, h6';
const MIN_TEXT_LENGTH = 15;
const SCROLL_DEBOUNCE_MS = 200;

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
      let hasNewNodes = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.observeElementTree(node as Element);
              hasNewNodes = true;
            }
          }
        }
      }
      if (hasNewNodes) {
        this.scheduleDebouncedProcessing();
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
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

    const candidates: Element[] = [];
    if (root.matches && root.matches(TARGET_SELECTOR)) {
      candidates.push(root);
    }
    candidates.push(...Array.from(root.querySelectorAll(TARGET_SELECTOR)));

    for (const el of candidates) {
      if (this.observedElements.has(el)) continue;

      // p, h1~h6, li 태그이거나 자식 내부에 하위 블록 태그(p, div, article 등)가 없는 단락 수준 요소 선택
      const hasSubBlocks = el.querySelector('p, article, section, div, h1, h2, h3, h4, h5, h6') !== null;
      if (hasSubBlocks && !['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'].includes(el.tagName)) {
        continue;
      }

      const text = el.textContent?.trim() || '';
      if (text.length >= MIN_TEXT_LENGTH) {
        this.observedElements.add(el);
        this.intersectionObserver.observe(el);
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
      const text = el.textContent?.trim();
      if (!text || text.length < MIN_TEXT_LENGTH) continue;

      try {
        // 1. 웹 Crypto API를 사용한 SHA-256 해시 생성
        const hash = await generateSHA256(text);

        // 2. Dexie IndexedDB 캐시 조회
        const cached = await getCacheByHash(hash);
        if (cached) {
          const msg = `[Carrot] Cache Hit for hash ${hash.substring(0, 8)}... Vector: ${JSON.stringify(cached.vector)}`;
          console.log(msg);
          console.warn(msg);
          continue;
        }

        // 3. 5차원 특징 벡터 추출
        const vector = extractFeatureVector(text);

        // 4. 로컬 DB 저장
        await saveCache(hash, text, vector);
        const msg = `[Carrot] Cache Miss -> Stored Vector for ${hash.substring(0, 8)}...: ${JSON.stringify(vector)}`;
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
