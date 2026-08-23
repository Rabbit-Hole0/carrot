/**
 * Linguistic Feature Extraction Engine
 * Extracts a 3-dimensional cosine vector [0, 1] from raw text:
 * [v1: Burstiness / Sentence StdDev, v2: Entropy, v3: Punctuation Repetitiveness]
 * N-gram은 코사인 벡터에 넣지 않고 최종 복합 점수에서만 20% 반영합니다.
 */

import aiPatterns from '../assets/ai-patterns.json';

export interface TextMetrics {
  burstiness: number;
  entropy: number;
  ngram: number;
}

const AI_SYMBOL_PATTERN = new RegExp(aiPatterns.symbolPattern, 'gu');
const AI_FIXED_PHRASES_KOREAN = aiPatterns.fixedPhrasesKorean;
const AI_WORD_NGRAMS_KOREAN = aiPatterns.wordNgramsKorean.map(
  (pattern) => new RegExp(pattern, 'gu'),
);

/** 지정된 장식 기호의 출현 횟수를 AI 보조 신호로 변환합니다. */
export function calculateAISymbolSignal(text: string): number {
  const count = text.match(AI_SYMBOL_PATTERN)?.length ?? 0;
  return Math.min(count / 3, 1);
}

/** N-gram은 합산 2회부터 유효하며 3회 이상이면 최대점수입니다. */
const NGRAM_MIN_MATCHES = 2;
const NGRAM_FULL_SCORE_MATCHES = 3;

function countLiteralOccurrences(text: string, phrase: string): number {
  let count = 0;
  let fromIndex = 0;
  while ((fromIndex = text.indexOf(phrase, fromIndex)) !== -1) {
    count++;
    fromIndex += phrase.length;
  }
  return count;
}

/**
 * Calculates standard deviation of sentence lengths (Burstiness metric).
 */
function calculateSentenceStdDev(text: string): number {
  const sentences = text
    .split(/[.!?]+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length <= 1) return 0;

  const lengths = sentences.map((s) => s.length);
  const mean = lengths.reduce((acc, val) => acc + val, 0) / lengths.length;
  const variance =
    lengths.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
    lengths.length;

  // Normalize std dev: low std dev means monotonic (typical AI), mapped to normalized [0, 1]
  const stdDev = Math.sqrt(variance);
  // Cap max expected std dev at 50 chars
  return Math.min(stdDev / 50, 1);
}

/**
 * Calculates Shannon Entropy of word frequency distribution.
 */
function calculateEntropy(text: string): number {
  const words = text
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎ가-힣]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) return 0;

  const freqMap: Record<string, number> = {};
  for (const word of words) {
    freqMap[word] = (freqMap[word] || 0) + 1;
  }

  let entropy = 0;
  const total = words.length;
  for (const count of Object.values(freqMap)) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }

  // Use log2(total + 1) so short/unique texts do not all saturate at 1.
  // This preserves decimal differences between source_text entries.
  const maxEntropy = Math.log2(total + 1) || 1;
  return Math.min(entropy / maxEntropy, 1);
}

/**
 * 한국어 고정 어구와 단어 N-gram의 출현 횟수를 합산해 [0, 1] 점수로 변환합니다.
 * 이 함수가 N-gram을 계산하는 단일 위치이며, 결과는 최종 공식의 20% 항목에만 쓰입니다.
 */
function calculateNgramClichéScore(text: string): number {
  let matches = 0;

  for (const phrase of AI_FIXED_PHRASES_KOREAN) {
    matches += countLiteralOccurrences(text, phrase);
  }
  for (const pattern of AI_WORD_NGRAMS_KOREAN) {
    matches += text.match(pattern)?.length ?? 0;
  }

  if (matches < NGRAM_MIN_MATCHES) return 0;
  return Math.min(matches / NGRAM_FULL_SCORE_MATCHES, 1);
}

/**
 * Calculates punctuation & sentence ending regularity.
 */
function calculatePunctuationRegularity(text: string): number {
  const puncts = text.match(/[\text{~@#$%^&*()_+={}\[\]:;",.<>?/\\|`}]/g) || [];
  if (text.length === 0) return 0;
  const density = puncts.length / text.length;
  // Normalized density score
  return Math.min(density * 10, 1);
}

/** source_text 기반 결정적 미세값으로 동일한 문체 벡터를 구분합니다. */
function applySourceTextPrecision(
  vector: [number, number, number],
  text: string,
): [number, number, number] {
  const epsilon = 0.00001;
  const hash = (seed: number): number => {
    let value = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619) >>> 0;
    }
    return value / 0xFFFFFFFF;
  };
  return vector.map((value, index) =>
    Number((value * (1 - epsilon) + hash(index) * epsilon).toFixed(9)),
  ) as [number, number, number];
}

/**
 * Extracts a 3-dimensional cosine feature vector normalized in [0, 1].
 * N-gram은 의도적으로 제외합니다.
 */
export function extractFeatureVector(text: string): [number, number, number] {
  const metrics = extractTextMetrics(text);
  const punctuation = Number(calculatePunctuationRegularity(text).toFixed(6));
  return applySourceTextPrecision(metricsToVector(metrics, punctuation), text);
}

/**
 * Extracts text metrics (3 features used for cache) normalized in [0, 1]
 */
export function extractTextMetrics(text: string): TextMetrics {
  return {
    burstiness: Number(calculateSentenceStdDev(text).toFixed(6)),
    entropy: Number(calculateEntropy(text).toFixed(6)),
    ngram: Number(calculateNgramClichéScore(text).toFixed(6)),
  };
}

/**
 * Converts metrics and punctuation to a 3-dimensional cosine vector.
 */
export function metricsToVector(
  metrics: TextMetrics,
  punctuation: number,
): [number, number, number] {
  return [metrics.burstiness, metrics.entropy, punctuation];
}
