import vectorDataset from '../assets/ai-cliches-vectors.json';

export interface DirectTextMatch {
  id: string;
  label: string;
  sourceText: string;
  coverage: number;
}

export interface DirectTextAnalysis {
  score: number;
  matches: DirectTextMatch[];
}

type DatasetEntry = {
  id: string;
  label: string;
  source_text?: string;
};

function normalizeText(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

const DIRECT_PATTERNS = (vectorDataset.vectors as DatasetEntry[])
  .filter((entry) => entry.source_text && entry.source_text.trim().length >= 6)
  .map((entry) => ({ ...entry, normalized: normalizeText(entry.source_text!) }));

/** source_text와 입력 텍스트의 정규화 부분 일치를 검사합니다. */
export function analyzeDirectTextMatch(text: string): DirectTextAnalysis {
  const normalizedText = normalizeText(text);
  const matches: DirectTextMatch[] = [];

  for (const pattern of DIRECT_PATTERNS) {
    if (!normalizedText.includes(pattern.normalized)) continue;
    matches.push({
      id: pattern.id,
      label: pattern.label,
      sourceText: pattern.source_text!,
      coverage: Math.min(pattern.normalized.length / Math.max(normalizedText.length, 1), 1),
    });
  }

  const strongestCoverage = matches.reduce((max, match) => Math.max(max, match.coverage), 0);
  const grammarMatches = matches.filter((match) => match.label === 'ai_grammar').length;
  const clicheMatches = matches.filter((match) => match.label === 'ai_cliche').length;
  const score = Math.min(
    1,
    strongestCoverage >= 0.8
      ? 1
      : Math.max(strongestCoverage, grammarMatches > 0 ? 0.75 : 0, clicheMatches > 0 ? 0.7 : 0),
  );

  return { score, matches };
}
