import './style.css';
import { dbClient } from '@/utils/messaging';
import { defaultUserRules, normalizeUserRules, type UserRules } from '@/utils/settings';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Popup root not found');

app.innerHTML = `
  <main class="settings">
    <h1>🥕 Carrot 설정</h1>
    <p class="description">AI 콘텐츠 필터링 규칙을 설정합니다.</p>

    <label class="field" for="threshold">
      <span>감도 임계값 <output id="threshold-value">0.75</output></span>
      <input id="threshold" type="range" min="0.50" max="0.95" step="0.01" value="0.75" />
      <small>확률이 이 값 이상이면 AI 콘텐츠로 판정합니다.</small>
    </label>

    <label class="field" for="blocked-words">
      <span>커스텀 차단 단어</span>
      <textarea id="blocked-words" rows="5" placeholder="단어를 한 줄에 하나씩 입력"></textarea>
      <small>단어가 포함된 콘텐츠는 확률과 무관하게 AI 콘텐츠로 판정합니다.</small>
    </label>

    <label class="field" for="excluded-domains">
      <span>예외 도메인</span>
      <textarea id="excluded-domains" rows="4" placeholder="example.com&#10;shop.example.com"></textarea>
      <small>입력한 도메인과 하위 도메인에서는 Carrot을 실행하지 않습니다.</small>
    </label>

    <label class="toggle"><input id="auto-mask" type="checkbox" checked /> <span>AI 콘텐츠 CSS Blur 마스킹</span></label>
    <label class="toggle"><input id="show-tooltip" type="checkbox" checked /> <span>XAI 사유 툴팁 표시</span></label>

    <button id="save" type="button">설정 저장</button>
    <p id="status" role="status"></p>
  </main>
`;

const threshold = document.querySelector<HTMLInputElement>('#threshold')!;
const thresholdValue = document.querySelector<HTMLOutputElement>('#threshold-value')!;
const blockedWords = document.querySelector<HTMLTextAreaElement>('#blocked-words')!;
const excludedDomains = document.querySelector<HTMLTextAreaElement>('#excluded-domains')!;
const autoMask = document.querySelector<HTMLInputElement>('#auto-mask')!;
const showTooltip = document.querySelector<HTMLInputElement>('#show-tooltip')!;
const save = document.querySelector<HTMLButtonElement>('#save')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;

function lines(value: string): string[] {
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim().toLocaleLowerCase()).filter(Boolean))];
}

function renderRules(rules: UserRules): void {
  threshold.value = rules.threshold.toFixed(2);
  thresholdValue.value = rules.threshold.toFixed(2);
  blockedWords.value = rules.blockedWords.join('\n');
  excludedDomains.value = rules.excludedDomains.join('\n');
  autoMask.checked = rules.autoMask;
  showTooltip.checked = rules.showTooltip;
}

threshold.addEventListener('input', () => {
  thresholdValue.value = Number(threshold.value).toFixed(2);
});

async function load(): Promise<void> {
  try {
    const stored = await dbClient.getUserRules();
    renderRules(normalizeUserRules(stored?.value ?? defaultUserRules));
  } catch (error) {
    renderRules(defaultUserRules);
    status.textContent = `설정을 불러오지 못했습니다: ${String(error)}`;
  }
}

save.addEventListener('click', async () => {
  save.disabled = true;
  status.textContent = '저장 중...';
  try {
    const rules = normalizeUserRules({
      threshold: Number(threshold.value),
      blockedWords: lines(blockedWords.value),
      excludedDomains: lines(excludedDomains.value),
      autoMask: autoMask.checked,
      showTooltip: showTooltip.checked,
    });
    await dbClient.putUserRules(rules);
    await browser.storage.local.set({ user_rules: rules });
    renderRules(rules);
    status.textContent = '저장되었습니다. 새 페이지부터 적용됩니다.';
  } catch (error) {
    status.textContent = `저장 실패: ${String(error)}`;
  } finally {
    save.disabled = false;
  }
});

void load();
