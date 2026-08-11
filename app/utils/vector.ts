/**
 * Linguistic Feature Extraction Engine
 * Extracts 5-dimensional normalized vector [0, 1] from raw text:
 * [v1: Burstiness / Sentence StdDev, v2: TTR Diversity, v3: Entropy, v4: Trigram Repetition, v5: Punctuation Repetitiveness]
 */

export interface TextMetrics {
  burstiness: number;
  ttr: number;
  entropy: number;
  ngram: number;
}

const AI_SYMBOL_PATTERN = /✅|✔️?|⭐|❤️?|⭕|❌|✨|⬇️?|❗|❣️?|♡|■|◈|●|★/gu;

/**
 * Treat AI-associated decorative symbols as a supporting signal.
 * Repetition strengthens the signal, while a single symbol is not decisive.
 */
export function calculateAISymbolSignal(text: string): number {
  const count = text.match(AI_SYMBOL_PATTERN)?.length ?? 0;
  return Math.min(count / 3, 1);
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
 * Calculates repeated character trigram ratio without a hard-coded phrase list.
 */
function calculateTrigramRepetition(text: string): number {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const size = 3;
  const total = Math.max(normalized.length - size + 1, 0);
  if (total === 0) return 0;

  const grams = new Set<string>();
  for (let i = 0; i < total; i++) {
    grams.add(normalized.slice(i, i + size));
  }
  return 1 - (grams.size / total);
}

/**
 * Calculates punctuation & sentence ending regularity.
 */
function calculatePunctuationRegularity(text: string): number {
  const puncts = text.match(/[~@#$%^&*()_+={}\[\]:;",.<>?/\\|`]/g) || [];
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
    ngram: Number(calculateTrigramRepetition(text).toFixed(4)),
  };
}

/**
 * Converts metrics and punctuation back to a 5-dimensional feature vector.
 */
export function metricsToVector(metrics: TextMetrics, punctuation: number): [number, number, number, number, number] {
  return [metrics.burstiness, metrics.ttr, metrics.entropy, metrics.ngram, punctuation];
}
