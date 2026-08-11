import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = process.argv[2] ? resolve(process.argv[2]) : resolve(appRoot, 'data/ai-cliches.json');
const outputPath = process.argv[3] ? resolve(process.argv[3]) : resolve(appRoot, 'data/ai-cliches-vectors.json');
const words = (text) => text.toLowerCase().replace(/[^\w\sㄱ-ㅎ가-힣]/g, '').split(/\s+/).filter(Boolean);

function ngramRepetition(text, size = 3) {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const total = Math.max(normalized.length - size + 1, 0);
  if (!total) return 0;
  const grams = new Set();
  for (let i = 0; i < total; i++) grams.add(normalized.slice(i, i + size));
  return 1 - (grams.size / total);
}

function vectorize(text) {
  const sentences = text.split(/[.!?]+|\n+/).map((s) => s.trim()).filter(Boolean);
  let burstiness = 0;
  if (sentences.length > 1) {
    const lengths = sentences.map((s) => s.length);
    const mean = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
    burstiness = Math.min(Math.sqrt(lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lengths.length) / 50, 1);
  }
  const tokens = words(text);
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  const ttr = tokens.length ? counts.size / tokens.length : 0;
  let entropy = 0;
  for (const count of counts.values()) { const p = count / tokens.length; entropy -= p * Math.log2(p); }
  entropy = tokens.length ? Math.min(entropy / (Math.log2(tokens.length) || 1), 1) : 0;
  const ngram = ngramRepetition(text);
  const punctuation = text.length ? Math.min(((text.match(/[~@#$%^&*()_+={}\[\]:;",.<>?/\\|`]/g) || []).length / text.length) * 10, 1) : 0;
  return [burstiness, ttr, entropy, ngram, punctuation].map((n) => Number(n.toFixed(4)));
}

const sourceText = await readFile(inputPath, 'utf8');
const source = JSON.parse(sourceText);
if (!Array.isArray(source.phrases)) throw new Error('Input must contain a phrases array');
const sourceIds = new Set();
for (const phrase of source.phrases) {
  if (!phrase?.id || !phrase?.lang || typeof phrase?.text !== 'string') {
    throw new Error('Every phrase must contain id, lang, and text');
  }
  if (sourceIds.has(phrase.id)) throw new Error(`Duplicate phrase id: ${phrase.id}`);
  sourceIds.add(phrase.id);
}
if (process.argv[2]) {
  const canonicalSource = resolve(appRoot, 'data/ai-cliches.json');
  await mkdir(dirname(canonicalSource), { recursive: true });
  await writeFile(canonicalSource, `${JSON.stringify(source, null, 2)}\n`);
}
const generated = {
  version: source.version,
  generated_at: new Date().toISOString(),
  source_digest: createHash('sha256').update(JSON.stringify(source)).digest('hex'),
  source: inputPath.split('/').pop(),
  vector_schema: ['burstiness', 'ttr', 'entropy', 'trigram_repetition', 'punctuation'],
  count: source.phrases.length,
  vectors: source.phrases.map(({ id, lang, text }) => ({ id, lang, label: 'ai_cliche', source_text: text, vector: vectorize(text) })),
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(generated, null, 2)}\n`);
console.log(`Replaced vectors with exactly ${generated.count} source phrases -> ${outputPath}`);
