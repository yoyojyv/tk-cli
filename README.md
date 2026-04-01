# tk - Personal Ticket Management CLI

로컬 SQLite 기반의 개인 티켓 관리 CLI 도구. 외부 의존성 없이 Bun 런타임만으로 동작한다.

## 설치

```bash
# 소스에서 빌드
bun install
bun run build

# dist/tk 바이너리를 PATH에 추가
cp dist/tk ~/.local/bin/
```

### 요구사항

- [Bun](https://bun.sh/) v1.0+
- Git (프로젝트 감지용, 선택)

## 빠른 시작

```bash
# 1. 현재 git 프로젝트 등록
tk project init

# 2. 티켓 생성
tk issue create "검색 자동완성 추가"

# 3. 상태 변경
tk issue move APP-001 in_progress

# 4. 칸반 보드 확인
tk board
```

## 명령어

### `tk project` (별칭: `p`)

| 명령어 | 설명 |
|--------|------|
| `tk project init [--key KEY]` | 현재 git 프로젝트를 등록한다. `--key`로 접두사 지정 가능 |
| `tk project list` | 등록된 프로젝트 목록과 티켓 통계를 출력한다 |
| `tk project view` | 현재 프로젝트 상세 정보를 출력한다 |

서브커맨드 별칭: `l`(list), `v`(view)

### `tk issue` (별칭: `i`)

| 명령어 | 설명 |
|--------|------|
| `tk issue create <제목> [-p 우선순위] [-t 태그] [--stage S] [--step S]` | 티켓을 생성한다 |
| `tk issue list [--status S] [-p P] [--project N] [--tag T] [--stage S] [--step S] [--all] [--json]` | 티켓 목록을 조회한다 |
| `tk issue view <티켓ID>` | 티켓 상세 정보를 출력한다 |
| `tk issue move <티켓ID> <상태>` | 티켓 상태를 변경한다 |
| `tk issue update <티켓ID> [--stage S] [--step S] [--title T] [-p P]` | 티켓 필드를 수정한다 |
| `tk issue delete <티켓ID>` | 티켓을 삭제한다 (soft delete) |

서브커맨드 별칭: `c`(create), `l`(list), `v`(view), `m`(move), `u`(update), `d`(delete)

**우선순위**: 0 (긴급) ~ 3 (낮음), 기본값 2

**태그**: `-t bug,urgent` 또는 `-t '["bug","urgent"]'`

**Stage/Step**: 워크플로우 단계를 나타내는 자유 텍스트 필드. tk는 값의 의미를 제한하지 않으므로 SDLC, 버그추적, 글쓰기 등 어떤 워크플로우에든 사용 가능하다.

```bash
# 예시: SDLC 워크플로우
tk issue create "검색 API" --stage research --step gathering
tk issue update APP-0001 --stage spec --step drafting
tk issue update APP-0001 --stage dev --step coding

# 예시: 빈 문자열로 stage/step 초기화
tk issue update APP-0001 --stage ""
```

### `tk board` (별칭: `b`)

```bash
tk board                    # 현재 프로젝트의 칸반 보드 (status 기준)
tk board --by stage         # stage 기준 동적 칸반 보드
tk board --all              # 전체 프로젝트의 칸반 보드
tk board --status in_progress   # 상태 필터
tk board --tag bug          # 태그 필터 (정확 매칭)
```

## 상태 전이

```
backlog → in_progress → paused ⇄ in_progress → done
backlog → aborted
paused  → aborted
```

`done`과 `aborted`는 종료 상태로, 더 이상 전이할 수 없다.

## 데이터 저장

- 경로: `~/.config/jerry-tickets/tickets.db`
- 포맷: SQLite (WAL 모드)
- 삭제: soft delete (status를 `deleted`로 변경)

## 개발

```bash
bun run dev           # 개발 실행 (bun run src/index.ts)
bun run build         # 바이너리 빌드 (dist/tk)
bun test              # 테스트 실행
```

## 라이선스

MIT
