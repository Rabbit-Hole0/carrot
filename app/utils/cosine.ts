/**
 * cosine.ts
 *
 * 코사인 유사도 계산 엔진.
 * - feature_vectors 테이블(ai_cliche 레이블)을 메모리에 캐싱
 * - 신규 텍스트 벡터와 캐시된 AI 전형 벡터 세트 간의 최대 코사인 유사도 반환
 *
 * 데이터셋 교체 방법:
 *   1. app/assets/ai-cliches.json 수정
 *   2. npm run vectorize 실행 → ai-cliches-vectors.json 갱신
 *   3. 확장 프로그램 리빌드 후 재로드
 *   (캐시는 다음 시작 시 자동 재로드됨)
 */

import type { FeatureVectorEntry } from './db';

/** 캐시된 AI 전형 벡터 목록 (메모리) */
let featureVectorCache: Array<[number, number, number]> = [];
let cacheLoaded = false;

/**
 * 두 3차원 벡터 간 코사인 유사도를 계산합니다.
 * 반환값: [-1, 1] (1에 가까울수록 유사)
 */
export function cosineSimilarity(
  a: [number, number, number],
  b: [number, number, number]
): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < 3; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dot / denominator;
}

/**
 * Background에서 전달된 feature_vectors 목록으로 메모리 캐시를 갱신합니다.
 * Background가 DB에서 가져온 'ai_cliche' 레이블 벡터들을 받아 캐싱합니다.
 */
export function updateFeatureVectorCache(entries: FeatureVectorEntry[]): void {
  featureVectorCache = entries
    .filter((e) => e.vector && e.vector.length === 3)
    .map((e) => e.vector as [number, number, number]);
  cacheLoaded = true;
  console.log(`[Carrot Cosine] Feature vector cache updated: ${featureVectorCache.length} vectors loaded.`);
}

/**
 * 캐시가 로드되었는지 확인합니다.
 */
export function isFeatureVectorCacheLoaded(): boolean {
  return cacheLoaded;
}

/**
 * 캐시된 AI 전형 벡터 세트 전체와의 코사인 유사도를 계산하고,
 * 가장 높은(가장 유사한) 유사도 값을 반환합니다.
 *
 * @param vector - 분석 대상 텍스트의 3차원 feature vector(N-gram 제외)
 * @returns 최대 코사인 유사도 [0, 1]. 캐시가 비어있으면 0 반환.
 */
export function computeMaxCosineSimilarity(
  vector: [number, number, number]
): number {
  if (featureVectorCache.length === 0) return 0;

  let maxSim = -1;
  for (const cachedVec of featureVectorCache) {
    const sim = cosineSimilarity(vector, cachedVec);
    if (sim > maxSim) maxSim = sim;
  }

  // Normalize from [-1, 1] to [0, 1]
  return Math.max(0, (maxSim + 1) / 2);
}

/**
 * AI 확률 복합 점수 계산 (임시 공식).
 *
 * 공식:
 *   score = w1*cosineMax + w2*(1-burstiness) + w3*ngram + w4*(1-entropy)
 *
 * 각 가중치:
 *   w1=0.40  코사인 유사도 (AI 상용어구와의 거리)  — 가장 중요한 신호
 *   w2=0.20  문장 길이 단조로움 (burstiness 낮을수록 AI 특징)
 *   w3=0.20  AI 클리셰 N-gram 매칭 점수
 *   w4=0.20  Shannon 엔트로피 부족 (entropy 낮을수록 단순 패턴)
 *
 * @param cosineMax - computeMaxCosineSimilarity() 결과 [0, 1]
 * @param burstiness - 문장 길이 표준편차 정규화값 [0, 1]
 * @param entropy - Shannon 엔트로피 정규화값 [0, 1]
 * @param ngram - AI 클리셰 N-gram 매칭 점수 [0, 1]
 * @returns AI 확률 점수 [0, 1]
 */
export function computeCompositeAIScore(params: {
  cosineMax: number;
  burstiness: number;
  entropy: number;
  ngram: number;
}): number {
  const W1 = 0.40; // cosine similarity weight
  const W2 = 0.20; // burstiness weight (inverted)
  const W3 = 0.20; // ngram weight
  const W4 = 0.20; // entropy weight (inverted)

  const score =
    W1 * params.cosineMax +
    W2 * (1 - params.burstiness) +
    W3 * params.ngram +
    W4 * (1 - params.entropy);

  return Math.min(Math.max(score, 0), 1);
}

/** AI 판별 임계값. 이 값 이상이면 is_ai = true */
export const AI_SCORE_THRESHOLD = 0.65;
