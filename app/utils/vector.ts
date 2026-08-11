/**
 * Linguistic Feature Extraction Engine
 * Extracts 5-dimensional normalized vector [0, 1] from raw text:
 * [v1: Burstiness / Sentence StdDev, v2: TTR Diversity, v3: Entropy, v4: N-gram Cliché Matching, v5: Punctuation Repetitiveness]
 */

export interface TextMetrics {
  burstiness: number;
  ttr: number;
  entropy: number;
  ngram: number;
}

const AI_SYMBOL_PATTERN = /✅|✔️?|⭐|❤️?|⭕|❌|✨|⬇️?|❗|❣️?|♡|■|◈|●|★/gu;

/**
 * 지정된 장식 기호의 출현 횟수를 AI 보조 신호 [0, 1]로 변환합니다.
 * 3회 이상 등장하면 최대 신호로 처리합니다.
 */
export function calculateAISymbolSignal(text: string): number {
  const count = text.match(AI_SYMBOL_PATTERN)?.length ?? 0;
  return Math.min(count / 3, 1);
}


const AI_CLICHES_KOREAN = [
  '종합적으로 볼 때',
  '결론적으로 말해서',
  '결론적으로',
  '요약하자면',
  '중요한 점은',
  '다음과 같은 이유로',
  '살펴보겠습니다',
  '알아보겠습니다',
  '도움이 되었기를',
  '다양한 요소를 고려할 때',
  '이에 대해 자세히 알아보겠습니다',
];

const AI_CLICHES_ENGLISH = [
  'in conclusion',
  'to summarize',
  'overall',
  'it is important to note',
  'delve into',
  'tapestry of',
  'in summary',
  'furthermore',
  'moreover',
  'it is worth noting',
];

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
  const variance = lengths.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / lengths.length;

  // Normalize std dev: low std dev means monotonic (typical AI), mapped to normalized [0, 1]
  const stdDev = Math.sqrt(variance);
  // Cap max expected std dev at 50 chars
  return Math.min(stdDev / 50, 1);
}

/**
 * Calculates Type-Token Ratio (TTR) for vocabulary diversity.
 */
function calculateTTR(text: string): number {
  const words = text
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎ가-힣]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) return 0;

  const uniqueWords = new Set(words);
  return uniqueWords.size / words.length; // Range [0, 1]
}

/**
 * Calculates Shannon Entropy of word frequency distribution.
 */
function calculateEntropy(text: string): number {
  const words = text
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎ가-힣]/g, '')
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

  // Normalize entropy (log2(total) is theoretical max)
  const maxEntropy = Math.log2(total) || 1;
  return Math.min(entropy / maxEntropy, 1);
}

/**
 * Calculates N-gram cliché phrase matching score.
 */
function calculateNgramClichéScore(text: string): number {
  const lower = text.toLowerCase();
  let matches = 0;

  for (const phrase of AI_CLICHES_KOREAN) {
    if (text.includes(phrase)) matches++;
  }
  for (const phrase of AI_CLICHES_ENGLISH) {
    if (lower.includes(phrase)) matches++;
  }

  // Normalize matches: 3 or more matches maps to 1.0
  return Math.min(matches / 3, 1);
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

/**
 * Extracts a 5-dimensional feature vector normalized in [0, 1]
 */
export function extractFeatureVector(text: string): [number, number, number, number, number] {
  const metrics = extractTextMetrics(text);
  const punctuation = Number(calculatePunctuationRegularity(text).toFixed(4));
  return metricsToVector(metrics, punctuation);
}

/**
 * Extracts text metrics (4 features used for cache) normalized in [0, 1]
 */
export function extractTextMetrics(text: string): TextMetrics {
  return {
    burstiness: Number(calculateSentenceStdDev(text).toFixed(4)),
    ttr: Number(calculateTTR(text).toFixed(4)),
    entropy: Number(calculateEntropy(text).toFixed(4)),
    ngram: Number(calculateNgramClichéScore(text).toFixed(4)),
  };
}

/**
 * Converts metrics and punctuation back to a 5-dimensional feature vector.
 */
export function metricsToVector(metrics: TextMetrics, punctuation: number): [number, number, number, number, number] {
  return [metrics.burstiness, metrics.ttr, metrics.entropy, metrics.ngram, punctuation];
}
