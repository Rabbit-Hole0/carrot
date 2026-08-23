/**
 * Linguistic Feature Extraction Engine
 * Extracts a 3-dimensional cosine vector [0, 1] from raw text:
 * [v1: Burstiness / Sentence StdDev, v2: Entropy, v3: Punctuation Repetitiveness]
 * N-gram은 코사인 벡터에 넣지 않고 최종 복합 점수에서만 20% 반영합니다.
 */

export interface TextMetrics {
  burstiness: number;
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

// 긴 문구는 그대로 매칭해 정밀도를 확보합니다.
const AI_FIXED_PHRASES_KOREAN = [
  "종합적으로 볼 때",
  "결론적으로 말해서",
  "다음과 같은 이유로",
  "도움이 되었기를",
  "다양한 요소를 고려할 때",
  "이에 대해 자세히 알아보겠습니다",
  "크게 세 가지로 나눌 수 있다",
  "다음과 같이 요약할 수 있다",
];

// 조사·어미 활용형을 하나의 단어 N-gram으로 묶습니다.
// 단독 단어는 오탐이 많으므로 문두/어절 경계 또는 둘 이상의 단어가 있는 패턴만 사용합니다.
const AI_WORD_NGRAMS_KOREAN = [
  /(?:^|[.!?]\s+)(?:결론적으로|요약하자면|종합하면|정리하자면|따라서|그러므로|또한|나아가|아울러|게다가|더욱이)(?=\s|[,.:;!?]|$)/gu,
  /(?:에\s*대해(?:서)?|[을를]\s*통(?:해|하여)|에\s*있어(?:서)?|(?:라|다)는\s*점에서)/gu,
  /(?:에\s*기반하여|[을를]\s*바탕으로|가지고\s*있(?:다|습니다|었다)|에\s*의해(?:서)?)/gu,
  /(?:[을를]\s*수\s*있(?:다|습니다|었다)|[을를]\s*위해|(?:라|다)고\s*(?:할|볼)\s*수\s*있)/gu,
  /(?:것으로\s*(?:보이|판단되)|(?:라|다)고\s*여겨지|인\s*듯하)/gu,
  /(?:시사하는\s*바가\s*크다|주목할\s*만하다|간과할\s*수\s*없다|무시할\s*수\s*없다)/gu,
  /(?:(?:다)는\s*(?:것이다|뜻이다)|주목할\s*점은|(?:라|다)는\s*점에\s*있다)/gu,
];

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
