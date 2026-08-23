import type { DirectTextAnalysis } from './directTextMatcher';
import type { GrammarAnalysis } from './aiGrammar';
import type { TextMetrics } from './vector';
import { computeCompositeAIScore } from './cosine';

export interface HybridScoreInput {
  cosineScore: number;
  directText: DirectTextAnalysis;
  grammar: GrammarAnalysis;
  metrics: TextMetrics;
  symbolSignal: number;
}

export interface HybridScoreResult {
  score: number;
  metricScore: number;
}

/** 벡터·직접 대조·정규식 반복·기존 문체 신호를 독립적으로 결합합니다. */
export function computeHybridAIScore(input: HybridScoreInput): HybridScoreResult {
  const metricScore = computeCompositeAIScore({
    cosineMax: input.cosineScore,
    burstiness: input.metrics.burstiness,
    entropy: input.metrics.entropy,
    ngram: input.metrics.ngram,
  });
  const directScore = input.directText.score;
  const regexScore = input.grammar.score;
  const weighted =
    0.35 * input.cosineScore +
    0.25 * directScore +
    0.20 * regexScore +
    0.15 * metricScore +
    0.05 * input.symbolSignal;

  // S1은 반복 횟수에만 의존하지 않는 강한 후보 신호로 반영합니다.
  const s1Boost = input.grammar.s1Count > 0 ? 0.85 : 0;
  return {
    score: Number(Math.min(1, Math.max(weighted, s1Boost)).toFixed(6)),
    metricScore,
  };
}
