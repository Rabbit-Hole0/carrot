2026 오픈소스 개발자대회 
팀명: Rabbit Hole 
프로젝트명: -  
> On-Device 기반 초경량 AI 텍스트 감별 및 실시간 필터링 웹 확장 프로그램
> 외부 서버 연동 없이 브라우저 로컬에서 AI 생성 컨텐츠를 감지하고, DOM 마스킹 및 XAI 툴팁을 제공합니다.

---

## 목차
1. [프로젝트 소개](#-프로젝트-소개)
2. [시스템 아키텍처 및 폴더 구조](#-시스템-아키텍처-및-폴더-구조)
3. [개발 환경 구성 및 패키지 설치](#-개발-환경-구성-및-패키지-설치)
4. [실행 방법](#-실행-방법)
5. [협업 가이드 및 Git 워크플로우](#-협업-가이드-및-git-워크플로우)

---

## 프로젝트 소개

* **Privacy-First:** 웹 서핑 데이터를 외부로 전송하지 않는 온디바이스(On-Device) 연산
* **Zero Server Cost:** 로컬 기반으로 서버 인프라 트래픽 비용 $0원
* **Lightweight & Fast:** 5MB 이하의 정적데이터 및 결정 트리(Decision Tree) 기반 연산으로 RAM < 100MB, 연산 시간 < 15ms 유지
* **Universal Compatibility:** React/Vue 기반 SPA 사이트 호환 (Shadow DOM 기반 스타일 격리 및 DOM 래핑)

---

## 시스템 아키텍처 및 폴더 구조

본 프로젝트는 역할별로 명확히 분리된 **통합 모노레포(Monorepo)** 구조를 따릅니다.

```text
carrot/
├── app/         # [APP] WXT 기반 브라우저 확장 프로그램 (TypeScript / Dexie.js)
├── server/      # [SERVER] FastAPI 백엔드 (DB 연동 / API)
├── model/       # [MODEL] N-gram, 피처 맵, Decision Tree 학습 및 export 파이프라인
├── db/          # [DB] IndexDB 또는 SQLite 설정 및 DB 초기화 스크립트


```

---

## 개발 환경 구성 및 패키지 설치

프로젝트를 클론한 후 각 모듈별 필요한 패키지를 설치합니다.

### 1. 전제 조건 (Prerequisites)

* Node.js v23.11.0+ 및 `pnpm` (`npm i -g pnpm`)
* Python Python 3.10.0rc2+

---

### 2. 모듈별 패키지 설치 안내

#### 1) APP (`app/`) - 브라우저 확장 프로그램

```bash
cd app
pnpm install
cd ..

```

#### 2) SERVER (`server/`) - FastAPI 백엔드

```bash
cd server
python -m venv .venv

# 가상환경 활성화
# macOS/Linux:
source .venv/bin/activate
# Windows:
# .venv\Scripts\activate

# Python 패키지 일괄 설치
pip install -r requirements.txt
deactivate
cd ..

```

#### 3) MODEL (`model/`) - 벡터 스토어 변환 및 거리 유사도 검사 파이프라인

```bash
cd model
python -m venv .venv

# 가상환경 활성화
source .venv/bin/activate

# Python 패키지 일괄 설치
pip install -r requirements.txt
deactivate
cd ..

```

---

## 실행 방법


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

