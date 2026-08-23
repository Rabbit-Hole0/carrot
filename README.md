2026 오픈소스 개발자대회 
팀명: Rabbit Hole 
프로젝트명: carrot   
> AI 텍스트 감별 및 실시간 필터링 웹 확장 프로그램 <br>
> 외부 서버 연동 없이 브라우저 로컬에서 AI 생성 컨텐츠를 감지하고, <br>
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
(2) 어휘 다양성(TTR) <br>
(3) 문자 엔트로피 <br>
(4) N-gram AI 상투어 패턴 정규식 <br>
(5) 단순 단어 대조 <br>

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

