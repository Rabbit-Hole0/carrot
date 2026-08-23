export type GrammarSeverity = 'S1' | 'S2' | 'S3';

export interface GrammarMatch {
  id: string;
  severity: GrammarSeverity;
  phrase: string;
  count: number;
}

export interface GrammarAnalysis {
  score: number;
  matches: GrammarMatch[];
  s1Count: number;
  s2Count: number;
  s3Count: number;
}

type Rule = { id: string; severity: GrammarSeverity; pattern: RegExp };

const RULES: Rule[] = [
  { id: 'translation-ese', severity: 'S1', pattern: /(?:에\s*있어서|가지고\s*있(?:다|습니다)|되어진다|그녀가|그의\s|그녀의\s)/gu },
  { id: 'signature-conclusion', severity: 'S1', pattern: /(?:결론적으로|요약하면|종합하면|정리하자면|크게\s*세\s*가지로\s*나눌\s*수\s*있다)/gu },
  { id: 'ai-carrot-hedging', severity: 'S1', pattern: /(?:하나의\s*정답이\s*없습니다|꼭\s*그런\s*것은\s*아닙니다|A도\s*있지만\s*B도\s*있습니다)/gu },
  { id: 'comma-after-connective', severity: 'S1', pattern: /(?:고|며|지만|면서|아서|어서|는데),/gu },
  { id: 'translation-structure', severity: 'S2', pattern: /(?:에\s*대해(?:서)?|[을를]\s*통(?:해|하여)|에\s*기반하여|[을를]\s*바탕으로|에\s*의해(?:서)?|[을를]\s*수\s*있(?:다|습니다)|[을를]\s*위해|이루어졌다|만들어졌다)/gu },
  { id: 'signature-hype', severity: 'S2', pattern: /(?:혁신적인|획기적인|전례\s*없는|압도적인|막강한|폭발적인|파격적인|대대적인|새로운\s*장을\s*열|시대가\s*도래)/gu },
  { id: 'balance-hedging', severity: 'S2', pattern: /(?:양쪽\s*모두|두\s*가지\s*모두|장점도\s*있지만|신중하게|균형\s*잡힌)/gu },
  { id: 'meta-connective', severity: 'S2', pattern: /(?:^|[.!?]\s+)(?:또한|따라서|즉|나아가|아울러|게다가|더욱이)(?=\s|[,.:;!?]|$)/gmu },
  { id: 'formal-noun', severity: 'S2', pattern: /(?:라는\s*점에\s*있다|라는\s*뜻이다|할\s*필요가\s*있다|요구된다|혁신이\s*필요하다|변화가\s*필요하다)/gu },
  { id: 'carrot-abstraction', severity: 'S2', pattern: /(?:추상적인\s*교훈|거시적으로\s*관찰|구체적인\s*(?:행동|사물).*생략|완벽한\s*표준어|소설적\s*서사)/gu },
  { id: 'parallel-structure', severity: 'S3', pattern: /(?:첫째|둘째|셋째|먼저|반면|결국|첫\s*번째|두\s*번째)/gu },
  { id: 'decorative-markup', severity: 'S3', pattern: /(?:^|\n)\s*(?:#{2,6}|[-*•])\s+/gm },
];

function countMatches(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  return [...text.matchAll(pattern)].length;
}

export function analyzeAiGrammar(text: string): GrammarAnalysis {
  const matches: GrammarMatch[] = [];
  for (const rule of RULES) {
    const count = countMatches(text, rule.pattern);
    if (count > 0) matches.push({ id: rule.id, severity: rule.severity, phrase: rule.pattern.source, count });
  }

  const s1Count = matches.filter((match) => match.severity === 'S1').reduce((sum, match) => sum + match.count, 0);
  const s2Count = matches.filter((match) => match.severity === 'S2').reduce((sum, match) => sum + match.count, 0);
  const s3Count = matches.filter((match) => match.severity === 'S3').reduce((sum, match) => sum + match.count, 0);
  const repeatedS2 = matches.filter((match) => match.severity === 'S2' && match.count >= 3).length;
  const score = Math.min(1, s1Count > 0 ? 1 : repeatedS2 > 0 ? 0.9 : s2Count > 0 ? 0.65 : s3Count > 1 ? 0.45 : 0);

  return { score, matches, s1Count, s2Count, s3Count };
}
