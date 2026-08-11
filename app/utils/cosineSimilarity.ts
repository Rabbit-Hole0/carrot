import vectorData from '../data/ai-cliches-vectors.json';

export type FeatureVector = [number, number, number, number, number];
interface ReferenceVector { id: string; lang: string; label: string; source_text: string; vector: FeatureVector }
export interface SimilarityResult { score: number; matchedId: string | null; matchedText: string | null }

export const VECTOR_MODEL_VERSION = `${vectorData.version}:${vectorData.source_digest}`;
const references = (vectorData.vectors as ReferenceVector[]).filter((item) => item.label === 'ai_cliche' && item.vector.length === 5);

export function cosineSimilarity(a: FeatureVector, b: FeatureVector): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < 5; i++) { dot += a[i] * b[i]; normA += a[i] ** 2; normB += b[i] ** 2; }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

export function findMaximumClicheSimilarity(input: FeatureVector, lang?: string): SimilarityResult {
  const localized = lang ? references.filter((item) => item.lang === lang) : references;
  const candidates = localized.length ? localized : references;
  let best: ReferenceVector | undefined;
  let score = 0;
  for (const reference of candidates) {
    const similarity = cosineSimilarity(input, reference.vector);
    if (similarity > score) { score = similarity; best = reference; }
  }
  return { score: Number(score.toFixed(4)), matchedId: best?.id ?? null, matchedText: best?.source_text ?? null };
}

export function detectLanguage(text: string): 'ko' | 'en' | undefined {
  const korean = (text.match(/[가-힣]/g) || []).length;
  const latin = (text.match(/[a-z]/gi) || []).length;
  if (!korean && !latin) return undefined;
  return korean >= latin ? 'ko' : 'en';
}
