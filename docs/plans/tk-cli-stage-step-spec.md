# tk-cli: stage + step 컬럼 추가 스펙

Generated: 2026-04-01
Status: DRAFT
Target: tk-cli (별도 리포: /Users/jerry/Projects/tk-cli)
Related: jerry-sdlc-factory 통합 (이 리포)

## TL;DR

- tk-cli의 tickets 테이블에 `stage TEXT`, `step TEXT` 2개 nullable 컬럼 추가
- 범용 도구 정체성 유지: tk는 이 값의 의미를 모름 (opaque string)
- SDLC, 버그추적, 글쓰기 등 어떤 워크플로우든 수용 가능
- 실사용 데이터 없으므로 마이그레이션 불필요 — schema version 1 직접 수정

## 배경

Prism Council (5개 관점) 만장일치 결론:
- Jira식 커스텀 워크플로우 엔진은 과잉 설계 (non-goal)
- tk status 6개(backlog/running/paused/done/aborted/deleted)는 고정 유지
- 도메인별 세부 상태는 별도 컬럼으로 분리

## 변경 범위

### 1. 스키마 변경 (src/db/schema.ts)

tickets 테이블 CREATE 문에 2개 컬럼 추가:

```sql
stage TEXT,            -- 워크플로우 단계 (예: "spec", "editing", "triaging")
step TEXT,             -- 단계 내 세부 상태 (예: "reviewing", "drafting")
```

- 둘 다 nullable, 기본값 NULL
- CHECK 제약 없음 — tk는 값을 제한하지 않음
- 인덱스 추가: `CREATE INDEX idx_tickets_stage ON tickets(stage)`

### 2. 타입 변경 (src/db/types.ts)

TicketRow 인터페이스에 필드 추가:

```typescript
export interface TicketRow {
  // ... 기존 필드 ...
  stage: string | null;    // 추가
  step: string | null;     // 추가
}
```

### 3. CLI 인터페이스 변경

#### 3-1. issue create

```bash
tk issue create "검색 API" --stage spec --step drafting
tk issue create "버그 수정"                              # stage=null, step=null (기존과 동일)
```

- `--stage`, `--step` 플래그 추가 (둘 다 optional)
- step만 주고 stage를 안 줘도 허용 (tk는 의미를 모르니까)

#### 3-2. issue list

```bash
tk issue list --stage spec                    # stage로 필터
tk issue list --step reviewing                # step으로 필터
tk issue list --stage spec --step reviewing   # 둘 다 필터
```

- `--stage`, `--step` 필터 추가
- 테이블 출력에 stage 컬럼 추가 (step은 view에서만)

```
  ID           Title                          Status     Stage      P
  ─────────── ─────────────────────────────── ────────── ────────── ─
  APP-0001     검색 API 자동완성               running    spec       1
  APP-0002     버그 수정                       backlog    -          0
```

#### 3-3. issue view

```
  APP-0001  [RUNNING]  P1
  검색 API 자동완성
  ──────────────────────────────────────────────────
  Project:     my-app
  Stage:       spec
  Step:        reviewing
  Tags:        ["backend"]
  ...
```

#### 3-4. issue move (기존 status 전이)

변경 없음. `tk issue move APP-0001 done`은 status만 바꿈.

#### 3-5. 새 커맨드: issue update

```bash
tk issue update APP-0001 --stage dev --step coding
tk issue update APP-0001 --stage dev                   # step만 null로 리셋하지 않음
tk issue update APP-0001 --step ""                     # step을 명시적으로 null로
tk issue update APP-0001 --title "새 제목"              # title 수정도 지원
tk issue update APP-0001 --priority 0                  # priority 수정도 지원
```

- stage/step 변경은 update 커맨드로 (move는 status 전용)
- history에 `stage_changed` / `step_changed` 이벤트 기록
- CAS 불필요 — stage/step은 경합 대상이 아님 (status만 CAS)

#### 3-6. board (칸반 보드)

```bash
tk board                          # 기존: status 기준 4컬럼
tk board --by stage               # stage 기준 동적 컬럼 생성
```

`--by stage` 시:

```
┌──────────── ┬──────────── ┬──────────── ┬────────────┐
│  research   │    spec     │    dev      │   verify   │
├──────────── ┼──────────── ┼──────────── ┼────────────┤
│             │ APP-0001    │ APP-0003    │            │
│             │ reviewing   │ coding     │            │
│             │ P1          │ P2          │            │
└──────────── ┴──────────── ┴──────────── ┴────────────┘
```

- 컬럼은 현재 티켓들의 stage 값에서 동적 생성
- stage가 null인 티켓은 "(no stage)" 컬럼에 표시

#### 3-7. JSON 출력

`--json` 출력에 stage, step 필드 자동 포함 (기존 TicketRow에 추가되므로).

### 4. 히스토리 추적

stage/step 변경 시 ticket_history에 이벤트 기록:

```jsonl
{"ts":"...","type":"stage_changed","data":{"from":"research","to":"spec"}}
{"ts":"...","type":"step_changed","data":{"from":"reviewing","to":"approved"}}
```

### 5. 워크플로우 검증 (선택사항, v2)

프로젝트 디렉토리에 `.tk/workflow.yaml`이 있으면 stage 전이를 검증:

```yaml
# .tk/workflow.yaml (optional)
stages:
  - research
  - prd
  - spec
  - dev
  - verify
  - complete
transitions:
  research: [prd, spec]     # research → prd 또는 spec
  prd: [spec]
  spec: [dev]
  dev: [verify]
  verify: [dev, complete]   # verify → dev (재작업) 또는 complete
```

- 파일이 없으면 자유 텍스트 (검증 안 함)
- 파일이 있으면 정의되지 않은 전이 시 경고 (에러가 아닌 warning)
- **이건 v2에서 구현. 지금은 만들지 않음.**

## 범용 사용 예시

### 버그 추적
```bash
tk issue create "로그인 실패" --stage triaging
tk issue update BUG-0001 --stage fixing --step reproducing
tk issue update BUG-0001 --step coding
tk issue update BUG-0001 --stage testing
tk issue move BUG-0001 done
```

### 글쓰기
```bash
tk issue create "블로그: AI 코드리뷰" --stage drafting
tk issue update POST-0001 --stage editing --step proofreading
tk issue update POST-0001 --stage review
tk issue move POST-0001 done
```

### SDLC (jerry-sdlc-factory 연동)
```bash
tk issue create "검색 API 자동완성" --stage research --step pending
tk issue update SDLC-0001 --step running
tk issue update SDLC-0001 --step reviewing
tk issue update SDLC-0001 --stage prd --step pending
# ... factory-run이 자동으로 호출
```

### 일반 TODO (stage 안 씀)
```bash
tk issue create "장보기"
tk issue move TODO-0001 running
tk issue move TODO-0001 done
# stage=null, step=null — 완전히 무시됨
```

## 테스트 계획

### 기존 테스트 영향
- 95개 기존 테스트는 stage/step을 사용하지 않으므로 **영향 없음**
- TicketRow 타입에 nullable 필드 추가뿐이라 타입 에러도 없음

### 추가 테스트

1. **create with stage/step**: `--stage`, `--step` 플래그 동작
2. **create without stage/step**: 기존과 동일하게 null
3. **update stage**: stage 변경 + history 기록 확인
4. **update step**: step 변경 + history 기록 확인
5. **update stage+step 동시**: 둘 다 한번에 변경
6. **update 기타 필드**: --title, --priority 수정
7. **list --stage 필터**: stage 기준 필터링
8. **list --step 필터**: step 기준 필터링
9. **list 복합 필터**: --stage + --status + --priority 조합
10. **board --by stage**: stage 기준 칸반 보드
11. **board --by stage (no stage 티켓)**: null stage 처리
12. **view에 stage/step 표시**: issue view 출력 확인
13. **JSON 출력에 stage/step 포함**: --json 필드 확인
14. **stage null로 리셋**: `--stage ""` 동작

## 구현 순서

1. schema.ts: tickets 테이블에 stage, step 컬럼 + 인덱스 추가
2. types.ts: TicketRow에 stage, step 필드 추가
3. issue.ts: create에 --stage, --step 플래그 추가
4. issue.ts: update 서브커맨드 신규 구현
5. issue.ts: list에 --stage, --step 필터 + 테이블 출력 수정
6. issue.ts: view에 Stage/Step 표시 추가
7. board.ts: --by stage 옵션 추가
8. 테스트 작성 (14개 케이스)
9. README.md 업데이트

## 비목표 (Non-goals)

- Jira식 커스텀 워크플로우 엔진
- stage/step에 대한 CHECK 제약 (tk는 opaque string)
- stage 전이 시 CAS 패턴 (status만 CAS 대상)
- workflow.yaml 파서 (v2에서)
- LLM용 JSON-stdin 모드 (v2에서, Security Analyst 제안)
