# tk-cli

개인 티켓 관리 CLI. Bun + TypeScript + SQLite.

## 빌드 & 실행

```bash
bun run dev                    # 개발 실행
bun run build                  # 바이너리 빌드 (dist/tk)
bun test                       # 테스트
```

## 구조

```
src/
  index.ts                     # CLI 엔트리포인트 + 라우터
  commands/
    issue.ts                   # tk issue create/list/view/move/delete
    project.ts                 # tk project init/list/view
    board.ts                   # tk board (칸반)
  db/
    schema.ts                  # SQLite 스키마 + 마이그레이션
    types.ts                   # 타입 정의 (TicketRow, ProjectRow, 상태 전이 규칙)
  utils/
    parser.ts                  # CLI 인자 파서
    project.ts                 # 프로젝트 감지 (git root 기반, 캐싱)
```

## DB

- 경로: ~/.config/jerry-tickets/tickets.db
- bun:sqlite 내장, 외부 의존성 없음
- 마이그레이션: schema.ts의 MIGRATIONS 객체에 버전별 SQL 추가

## 규칙

- TypeScript strict mode (tsconfig.json)
- 상태 전이: backlog→running→paused⇄running→done, backlog/paused→aborted
- soft delete (status='deleted')
- 프로젝트 감지: git root 기반
- `db.exec()` 사용 금지 → `db.run()` 사용 (exec는 run의 deprecated alias)
- PRAGMA 설정: `db.run("PRAGMA ...")` 패턴 사용
