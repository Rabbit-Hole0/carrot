2026 오픈소스 개발자대회<br>
팀명: Rabbit Hole <br>
프로젝트명: carrot <br> 

AI 텍스트 감별 및 실시간 필터링 웹 확장 프로그램 <br>

> 외부 서버 연동 없이 브라우저 로컬에서 AI 생성 컨텐츠를 감지하고, 
> DOM 마스킹 및 XAI 툴팁을 제공합니다. <br>

---

## 목차
1. [프로젝트 소개](#-프로젝트-소개)
2. [개발 환경 구성 및 패키지 설치](#-개발-환경-구성-및-패키지-설치)
3. [실행 방법](#-실행-방법)
4. [협업 가이드 및 Git 워크플로우](#-협업-가이드-및-git-워크플로우)

---

## 프로젝트 소개

브라우저의 컨텐츠를 DOM 객체로 변환 후 

(1) 문장 길이 변동성(Burstiness) <br>
(2) 문자 엔트로피 <br>
(3) N-gram AI 상투어 패턴 정규식 <br>
(4) 단순 단어 대조 <br>

연산을 통한 1차 필터링을 합니다. 

이후 무거운 딥러닝 추론 없이 원본 컨텐츠와 AI 패턴 데이터를 <br>
각각 벡터 스토어 형태로 변환하여 두 비교군 간의 <br> 
거리 유사도 검사 기반의 결정 트리 방식으로 최종 AI 확률 점수를 도출합니다.


---

## 개발 환경 구성 및 패키지 설치

프로젝트를 클론한 후 각 모듈별 필요한 패키지를 설치합니다.

### 1. 전제 조건 (Prerequisites)

* Node.js v23.11.0+ 및 `pnpm` (`npm i -g pnpm`)

---

### 2. 모듈별 패키지 설치 안내

#### 1) APP (`app/`) - 브라우저 확장 프로그램

```bash
cd app
pnpm install

```

---

## 실행 방법

### 일반 사용자 

Chrome

1. Github 저장소의 Releases 클릭 
2. 최신 버전 선택 
3. Chrome용 ZIP 다운로드 
4. ZIP 압축 해제 
5. Chrome 주소창에 다음 텍스트 입력:

text
chrome://extensions 

6. 우측 상단 개발자 모드 활성화 
7.압축해제된 확장 프로그램을 로드 클릭 
8. 압축 해제한 Chrome 폴더 선택 

로드 후 

시크릿 모드 사용시에는 

chrome://extensions에서 해당 확장 프로그램 - 세부정보 탭 이동 후 
'시크릿 모드에서 허용' 활성화 필요 

### 개발자 

1. git clone 후 /app 폴더에서 pnpm install 
2. npm run build 
3. 이후는 일반 사용자와 동일 

## DOM 기반 AI 콘텐츠 감지 흐름

```text
[ 사용자가 웹페이지 접속 / 스크롤 ]
              │
              ▼
[ DOMTextScanner 초기화 ]
  • 사용자 규칙 로드
  • 제외 도메인 여부 확인
  • AI 전형 feature vector를 Background DB에서 로드
              │
              ├──────────────────────────────────────────────┐
              │                                              │
              ▼                                              ▼
[ 초기 DOM 스캔 ]                              [ DOM 변경 / 스크롤 감시 ]
  • document.body 하위 요소 탐색                  • MutationObserver
  • p, article, section, div, span, li             • IntersectionObserver
  • h1 ~ h6 등록                                  • scroll listener
  • Carrot UI 영역 제외                           • 200ms debounce
  • 텍스트 길이 50자 미만 제외                    │
              │                                    │
              └──────────────────────┬─────────────┘
                                     │
                                     ▼
                    [ IntersectionObserver ]
                      • 뷰포트에 들어온 요소만 수집
                      • threshold: 0.1
                      • visibleElements에 저장
                                     │
                                     ▼
                    [ 화면 내 텍스트 처리 예약 ]
                      • 스크롤/DOM 변경 후 200ms 대기
                      • 중복 타이머 취소 후 재예약
                                     │
                                     ▼
                    [ 텍스트 정리 및 대상 검증 ]
                      • textContent 추출
                      • trim()
                      • 길이 50자 이상인지 확인
                      • Carrot UI 내부인지 재확인
                                     │
                                     ▼
                    [ SHA-256 캐시 키 생성 ]
                      hash = SHA256(
                        SCORE_MODEL_VERSION + ":" + text
                      )
                                     │
                                     ▼
                    [ IndexedDB text_cache 조회 ]
                                     │
                  ┌──────────────────┴──────────────────┐
                  ▼                                     ▼
          [ Cache Hit ]                         [ Cache Miss ]
          • 저장된 vector 재사용                 • 새 feature 계산
          • 저장된 metrics 재사용                • 새 score 계산
          • 사용자 규칙 재적용                    • text_cache 저장
          • grammar/direct match 재계산
                  │                                     │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                    [ AI 감지 신호 계산 ]
                      ├─ 3차원 문체 feature vector
                      ├─ AI 전형 vector와 cosine similarity
                      ├─ 직접 source_text 대조
                      ├─ AI 문법 정규식 분석
                      ├─ N-gram / entropy / burstiness
                      ├─ AI 특수기호 signal
                      └─ 사용자 blockedWords
                                     │
                                     ▼
                             [ AI Score 계산 ]
                                     │
                                     ▼
                    [ 사용자 threshold(임계값)와 비교 ]
                                     │
                  ┌──────────────────┴──────────────────┐
                  ▼                                     ▼
          [ AI 콘텐츠 판정 ]                     [ 일반 콘텐츠 판정 ]
          • is_ai = true                         • is_ai = false
          • autoMask면 blur 적용                  • 기존 mask 제거
          • tooltip에 분석 사유 표시               • 원래 title 복원
          • 클릭 시 blur 해제
```

### 1. DOM 후보 탐색

분석 후보 선택자는 다음과 같습니다.

```text
p, article, section, div, span, li, h1, h2, h3, h4, h5, h6
```

다음 요소는 분석에서 제외됩니다.

```text
• [data-carrot-ui] 내부 요소
• 텍스트 길이가 50자 미만인 요소
• 화면에 보이지 않는 요소
• 하위 블록 요소를 포함한 불필요한 상위 컨테이너
• 사용자 설정으로 제외된 도메인
```

### 2. 벡터 캐시 준비

초기화 시 Background DB에서 feature vector를 읽어 메모리에 캐시합니다.

```text
feature_vectors → 메모리 featureVectorCache
```

벡터 캐시가 준비되지 않은 동안에는 텍스트 처리 pass를 건너뜁니다.

```text
vectorCacheReady === false
    → Processing pass skipped
```

현재 구현의 `getAllFeatureVectors()`는 DB의 모든 feature vector를 읽습니다. `updateFeatureVectorCache()`는 3차원 vector를 가진 항목을 메모리에 저장합니다.

### 3. 캐시 키 생성 및 Cache Hit/Miss

텍스트 캐시 키는 모델 버전과 원문을 결합한 SHA-256 해시입니다.

```text
hash = SHA256("ko-ngram-grammar-symbol-v6:" + text)
```

캐시가 있으면 다음 값을 재사용합니다.

```text
• vector
• metrics
• text
• 기존 score/is_ai 저장값
```

다만 다음 값은 현재 사용자 규칙과 데이터셋을 반영하기 위해 다시 계산합니다.

```text
• blockedWords
• AI grammar
• direct text match
• cosine score
• hybrid score
```

### 4. 텍스트 특징 추출

텍스트에서 다음 세 가지 메트릭을 추출합니다.

```typescript
TextMetrics = {
  burstiness: number,
  entropy: number,
  ngram: number
}
```

#### 4.1 Burstiness

문장 길이 표준편차를 계산합니다.

```text
μ = Σ Li / n
σ = √(Σ(Li - μ)² / n)
burstiness = min(σ / 50, 1)
```

문장 길이 변화가 작을수록 AI 특성으로 간주하므로 최종 점수에서는 반전하여 사용합니다.

```text
AI 신호 = 1 - burstiness
```

#### 4.2 Shannon Entropy

단어 분포의 다양성을 계산합니다.

```text
H = -Σ pi × log₂(pi)
entropy = min(H / log₂(totalWords + 1), 1)
```

단어 다양성이 낮을수록 AI 의심 신호가 커집니다.

```text
AI 신호 = 1 - entropy
```

#### 4.3 N-gram 상투어 점수

`ai-patterns.json`의 고정 어구와 한국어 단어 N-gram 매칭 횟수를 합산합니다.

```text
matches < 2:
  ngram = 0

matches >= 2:
  ngram = min(matches / 3, 1)
```

따라서 2회 매칭은 약 0.667, 3회 이상 매칭은 1.0이 됩니다.

N-gram은 3차원 코사인 벡터에는 포함하지 않고, 최종 문체 점수에서만 사용합니다.

### 5. 3차원 문체 벡터와 코사인 유사도

텍스트의 3차원 벡터는 다음과 같습니다.

```text
Vtext = [burstiness, entropy, punctuationRegularity]
```

구두점 규칙성은 다음 방식으로 계산합니다.

```text
punctuationDensity = punctuationCount / text.length
punctuationRegularity = min(punctuationDensity × 10, 1)
```

AI 전형 벡터 `VAI`와의 코사인 유사도는 다음과 같습니다.

```text
cosine(Vtext, VAI)
  = (Vtext · VAI) / (|Vtext| × |VAI|)
```

3차원으로 풀면 다음과 같습니다.

```text
cosine(Vtext, VAI)
  = (t1a1 + t2a2 + t3a3)
    /
    (√(t1² + t2² + t3²) × √(a1² + a2² + a3²))
```

여러 AI 전형 벡터 중 가장 높은 유사도를 사용합니다.

```text
maxCosine = max(cosine(Vtext, VAI1), ..., cosine(Vtext, VAIN))
```

코사인 유사도를 `[0, 1]`로 정규화합니다.

```text
cosineScore = max(0, (maxCosine + 1) / 2)
```

### 6. 직접 source_text 대조

`ai-cliches-vectors.json`의 `source_text`를 입력 텍스트와 직접 비교합니다.

정규화 과정은 다음과 같습니다.

```text
lowercase
→ 연속 공백을 하나로 변경
→ 앞뒤 공백 제거
```

이후 다음 부분 문자열 검사를 수행합니다.

```text
normalizedText.includes(normalizedSourceText)
```

각 매칭의 coverage는 다음과 같습니다.

```text
coverage = sourceTextLength / max(inputTextLength, 1)
```

직접 대조 점수는 다음 공식으로 계산합니다.

```text
if strongestCoverage >= 0.8:
  directScore = 1
else:
  directScore = max(
    strongestCoverage,
    aiGrammarMatchCount > 0 ? 0.75 : 0,
    aiClicheMatchCount > 0 ? 0.70 : 0
  )
```

### 7. AI 문법 정규식 분석

`aiGrammar.ts`의 정규식 규칙을 S1~S3으로 나누어 검사합니다.

```text
S1: 강한 AI 의심
  • 결론적으로
  • 요약하면
  • 하나의 정답이 없습니다
  • 에 있어서
  • 연결어 뒤의 비정상적인 쉼표

S2: 중간 수준 의심
  • 혁신적인
  • 전례 없는
  • 균형 잡힌
  • 또한 / 따라서
  • 구체적인 행동 생략

S3: 보조 신호
  • 첫째 / 둘째 / 먼저 / 반면
  • 장식 목록 문법
```

문법 점수는 다음과 같습니다.

```text
if s1Count > 0:
  grammarScore = 1.00
else if S2 규칙 중 하나가 3회 이상 반복:
  grammarScore = 0.90
else if s2Count > 0:
  grammarScore = 0.65
else if s3Count > 1:
  grammarScore = 0.45
else:
  grammarScore = 0
```

S1이 하나라도 있으면 최종 점수에 별도 하한값을 적용합니다.

```text
s1Boost = s1Count > 0 ? 0.85 : 0
```

### 8. 특수기호 

`ai-patterns.json`의 AI 특수기호 패턴을 검색합니다.

```text
symbolSignal = min(symbolMatchCount / 3, 1)
```

```text
0회 → 0
1회 → 0.333
2회 → 0.667
3회 이상 → 1
```

이 신호는 최종 점수의 5%만 반영됩니다.

### 9. 문체 종합 점수

코사인 유사도와 텍스트 메트릭을 먼저 `metricScore`로 결합합니다.

```text
metricScore =
    0.40 × cosineScore
  + 0.20 × (1 - burstiness)
  + 0.20 × ngram
  + 0.20 × (1 - entropy)
```

각 항목의 의미는 다음과 같습니다.

```text
cosineScore         → AI 전형 문체와의 유사성
1 - burstiness      → 문장 길이의 단조로움
ngram               → AI 상투어 반복
1 - entropy         → 단어 다양성 부족
```

### 10. 최종 AI Score

최종 점수는 다음 다섯 가지 요소의 가중합입니다.

```text
C = cosineScore
D = directScore
G = grammarScore
M = metricScore
S = symbolSignal
```

```text
weightedScore =
    0.35 × C
  + 0.25 × D
  + 0.20 × G
  + 0.15 × M
  + 0.05 × S
```

최종 점수는 다음과 같이 계산됩니다.

```text
score = round(
  min(1, max(weightedScore, s1Boost)),
  6
)
```

즉 S1 문법 패턴이 발견되면 최종 score는 최소 0.85가 됩니다.

### 11. 계산 예시

다음 입력값을 가정합니다.

```text
cosineScore = 0.82
directScore = 0.70
grammarScore = 0.65
burstiness = 0.30
entropy = 0.72
ngram = 0.667
symbolSignal = 0.333
```

먼저 문체 종합 점수입니다.

```text
metricScore =
    0.40 × 0.82
  + 0.20 × (1 - 0.30)
  + 0.20 × 0.667
  + 0.20 × (1 - 0.72)
  ≈ 0.657333
```

그 다음 최종 가중합입니다.

```text
weightedScore =
    0.35 × 0.82
  + 0.25 × 0.70
  + 0.20 × 0.65
  + 0.15 × 0.657333
  + 0.05 × 0.333
  ≈ 0.707267
```

S1 패턴이 없으면:

```text
finalScore = 0.707267
```

S1 패턴이 있으면:

```text
finalScore = max(0.707267, 0.85)
           = 0.85
```

### 12. 최종 판정

사용자 차단 단어가 발견되면 score와 무관하게 AI 콘텐츠로 처리합니다.

```text
if blockedWordExists:
  finalScore = 1
  is_ai = true
else:
  is_ai = finalScore >= userRules.threshold
```

사용자 threshold는 다음 범위로 정규화됩니다.

```text
0.5 <= threshold <= 0.95
```

기본 threshold는 다음과 같습니다.

```text
threshold = 0.6
```

현재 실제 판정 공식은 다음과 같이 요약할 수 있습니다.

```text
if blockedWordExists:
  finalScore = 1
  is_ai = true
else:
  finalScore = max(
      0.35C
    + 0.25D
    + 0.20G
    + 0.15M
    + 0.05S,
    0.85 if S1 exists else 0
  )

  is_ai = finalScore >= threshold
```

### 13. 결과 적용

`is_ai === true`이고 `autoMask`가 활성화되어 있으면 해당 DOM 요소에 Blur를 적용합니다.

```css
.carrot-ai-masked {
  filter: blur(5px) !important;
  cursor: pointer !important;
}
```

Tooltip이 활성화된 경우 다음 정보를 표시합니다.

```text
• AI 확신도
• 문장 변동성
• 상투어 반복
• 사용자 차단 단어
• AI 문법 정규식 감지 수
• 직접 대조 건수
```

마스킹된 요소를 클릭하면 Blur가 제거됩니다.


### 사용자 설정 

크룸 상단바의 확장 프로그램 버튼 클릭 후 해당 프로그램 선택 

다음 기능을 제공합니다.  

1. 감도 임계값 

2. 커스텀 차단 단어 

3. 예외 도메인 

4. 콘텐츠 Blur 마스킹 비활성화/활성화 

5. XAI 사유 툴팁 표시 비활성화/활성화 


```

---

## 협업 가이드 및 Git 워크플로우

본 프로젝트 내의 모든 작업은 PR(Pull Request)을 거쳐 검수 후 병합됩니다.

```text
[ main 브랜치 ] ───────────────────────────────────────────► (최종 병합)
       │                                                     ▲
       └─► [ feature/기능명 ] ─► (작업 & Commit) ─► [ PR 생성 & 리뷰 ] ─┘

```

### 1. 기본 작업 수칙

* Remote(원격) 상의 영구 브랜치는 main 입니다.
* `main` 브랜치에 직접 `commit` 또는 `push`하는 것은 금지됩니다.
* 작업 시 반드시 기능 단위의 작업 브랜치를 새로 생성하여 진행합니다.

### 2. 단계별 Git 작업 프로세스

#### ① 최신 `main` 상태 동기화 및 작업 브랜치 생성

```bash
git checkout main
git pull origin main
git checkout -b feature/issue-description
# 예시: git checkout -b feature/login-api
# 예시: git checkout -b fix/dom-mask-bug

```

#### ② 작업 수행 및 커밋 (Commit Convention 준수)

```bash
git add .
git commit -m "feat: 사용자 감도 설정 UI 구현"

```

> **커밋 메시지 태그 예시:**
> * `feat:` 새로운 기능 추가
> * `fix:` 버그 수정
> * `refactor:` 코드 리팩토링
> * `docs:` 문서 수정 (README 등)
> * `chore:` 패키지 설치, 빌드 설정 변경 등
> 
> 

#### ③ 원격 저장소로 PUSH 및 PR 생성

```bash
git push origin feature/issue-description

```

이후 GitHub에서 PR 생성
1. GitHub 저장소의 Pull requests 탭으로 이동하여 New pull request 버튼을 클릭합니다.
2. base: main $\leftarrow$ compare: [본인의 작업 브랜치] 상태인지 확인합니다.
3. 자동으로 적용된 PR 템플릿에 맞추어 상세 작업 내용을 작성합니다.
4. 오른편 사이드바 메뉴를 설정합니다:
    Reviewers: 프로젝트 관리자 지정
    Assignees: 본인 지정
    Labels: 해당 작업 라벨 선택 (e.g. enhancement, bug)
5. 작성 완료 

* GitHub 저장소로 이동하여 `main` 브랜치를 타겟으로 Pull Request(PR)를 생성합니다.
* PR 내용에 작업 상세 항목 및 테스트 여부를 명시합니다.

#### ④ 코드 리뷰 및 PUSH (Merge)

* 리뷰어(검수자)는 작성된 코드를 확인하고 승인(Approve)을 진행합니다.
* 검수가 완료되면 `main` 에 병합합니다.
* 병합이 완료된 로컬 및 원격의 `feature/` 브랜치는 삭제합니다.

```bash
# 병합 완료 후 로컬 정리
git checkout main
git pull origin main
git push origin --delete feature/[본인의 작업 브랜치]
git branch -d feature/[본인의 작업 브랜치]

