#!/usr/bin/env node
/**
 * vectorize-cliches.mjs
 *
 * ai-cliches.json을 읽어 각 문구를 3차원 cosine feature vector로 변환하고
 * ai-cliches-vectors.json으로 저장합니다.
 *
 * 사용법: npm run vectorize
 *
 * 3차원 벡터(N-gram 제외):
 *   [v1: burstiness, v2: entropy, v3: punctuation]
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, '../assets');
const INPUT_FILE = resolve(ASSETS_DIR, 'ai-cliches.json');
const OUTPUT_FILE = resolve(ASSETS_DIR, 'ai-cliches-vectors.json');

// ── Feature Extraction (vector.ts 로직 Node.js 포팅) ──────────────────────

function calculateSentenceStdDev(text) {
  const sentences = text.split(/[.!?]+|\n+/).map(s => s.trim()).filter(s => s.length > 0);
  if (sentences.length <= 1) return 0;
  const lengths = sentences.map(s => s.length);
  const mean = lengths.reduce((a, v) => a + v, 0) / lengths.length;
  const variance = lengths.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / lengths.length;
  return Math.min(Math.sqrt(variance) / 50, 1);
}

function calculateEntropy(text) {
  const words = text.toLowerCase().replace(/[^\w\sㄱ-ㅎ가-힣]/g, '').split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;
  const freqMap = {};
  for (const w of words) freqMap[w] = (freqMap[w] || 0) + 1;
  let entropy = 0;
  const total = words.length;
  for (const count of Object.values(freqMap)) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(total) || 1;
  return Math.min(entropy / maxEntropy, 1);
}

function calculatePunctuationRegularity(text) {
  const puncts = text.match(/[~@#$%^&*()_+={}[\]:;"',.<>?/\\|`]/g) || [];
  if (text.length === 0) return 0;
  return Math.min((puncts.length / text.length) * 10, 1);
}

function extractFeatureVector(text) {
  return [
    Number(calculateSentenceStdDev(text).toFixed(4)),
    Number(calculateEntropy(text).toFixed(4)),
    Number(calculatePunctuationRegularity(text).toFixed(4)),
  ];
}

// ── Main ──────────────────────────────────────────────────────────────────

console.log(`[vectorize] Reading: ${INPUT_FILE}`);
const dataset = JSON.parse(readFileSync(INPUT_FILE, 'utf-8'));

const vectors = dataset.phrases.map(phrase => {
  const vector = extractFeatureVector(phrase.text);
  console.log(`  [${phrase.id}] ${phrase.text.substring(0, 40)}... => [${vector.join(', ')}]`);
  return {
    id: phrase.id,
    lang: phrase.lang,
    label: 'ai_cliche',
    source_text: phrase.text,
    vector,
  };
});

const output = {
  version: dataset.version,
  generated_at: new Date().toISOString(),
  source: 'ai-cliches.json',
  count: vectors.length,
  vectors,
};

writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
console.log(`\n[vectorize] ✅ Done! Written ${vectors.length} vectors to: ${OUTPUT_FILE}`);
