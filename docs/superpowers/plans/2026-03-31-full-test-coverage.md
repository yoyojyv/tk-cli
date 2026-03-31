# tk-cli 전체 테스트 커버리지 확장 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tk-cli의 모든 코드 경로를 테스트하여 실질 커버리지를 100%에 가깝게 올린다.

**Architecture:** 두 가지 테스트 전략을 병행한다. (1) 순수 함수/DB 로직은 직접 import하여 유닛 테스트. (2) `process.exit()` 호출이 있는 CLI 명령어는 서브프로세스(`Bun.spawnSync`)로 통합 테스트. 모든 테스트는 임시 DB를 사용하여 격리한다.

**Tech Stack:** Bun test runner, bun:sqlite, Bun.spawnSync

**테스트 실행:** `bun test`
**커버리지 확인:** `bun test --coverage`

---

## 현재 상태

| 테스트 파일 | 테스트 수 | 커버 영역 |
|------------|----------|----------|
| cli.test.ts | 9 | CLI 기본 (help, version, aliases), 프로젝트 목록, 이슈 목록, 보드 기본 |
| parser.test.ts | 10 | parseArgs 전체 |
| schema.test.ts | 7 | 마이그레이션, 테이블 제약조건 |
| transitions.test.ts | 10 | 상태 전이 규칙, atomic CAS |

**미커버 영역:**
- `src/utils/project.ts` — `detectProjectPath()`, `detectProject()` 전혀 없음
- `src/db/schema.ts` — `getDbPath()`, `initDb()` (라인 52-70)
- `src/commands/issue.ts` — create 검증(priority, tags, MAX 번호), list 필터링, view, move 엣지케이스, delete
- `src/commands/board.ts` — 프로젝트 감지, tag LIKE escape, 컬럼 매핑
- `src/commands/project.ts` — init(key 생성, 중복), view

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `tests/project-util.test.ts` (생성) | `detectProjectPath()`, `detectProject()` 유닛 테스트 |
| `tests/schema.test.ts` (수정) | `getDbPath()`, `initDb()` 테스트 추가 |
| `tests/issue.test.ts` (생성) | issue 서브명령어 DB-level 유닛 테스트 (번호 생성, LIKE escape 등) |
| `tests/cli.test.ts` (수정) | CLI 통합 테스트 확장 (에러 케이스, 엣지케이스) |

---

### Task 1: detectProjectPath / detectProject 유닛 테스트

**Files:**
- Create: `tests/project-util.test.ts`
- Test target: `src/utils/project.ts`

- [ ] **Step 1: 테스트 파일 생성 — detectProjectPath**

```typescript
// tests/project-util.test.ts
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../src/db/schema";
import { detectProject, detectProjectPath } from "../src/utils/project";

describe("detectProjectPath", () => {
  it("git 저장소 내에서 git root를 반환한다", () => {
    // 현재 테스트가 tk-cli 내에서 실행되므로 git root를 반환해야 함
    const path = detectProjectPath();
    expect(path).toContain("tk-cli");
    expect(path).not.toContain(".git");
  });
});

let db: Database;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `tk-project-util-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = new Database(dbPath, { create: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
});

afterEach(() => {
  db.close();
  try { unlinkSync(dbPath); } catch {}
});

describe("detectProject", () => {
  it("등록된 프로젝트가 있으면 ProjectRow를 반환한다", () => {
    const path = detectProjectPath();
    db.query("INSERT INTO projects (name, key, path) VALUES (?, ?, ?)").run("tk-cli", "TKCLI", path);

    const project = detectProject(db);
    expect(project).not.toBeNull();
    expect(project!.name).toBe("tk-cli");
    expect(project!.key).toBe("TKCLI");
    expect(project!.path).toBe(path);
  });

  it("등록되지 않은 경로면 null을 반환한다", () => {
    const project = detectProject(db);
    expect(project).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행하여 통과 확인**

Run: `bun test tests/project-util.test.ts`
Expected: 3 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/project-util.test.ts
git commit -m "test: detectProjectPath, detectProject 유닛 테스트 추가"
```

---

### Task 2: schema.ts 나머지 커버리지 (getDbPath, initDb)

**Files:**
- Modify: `tests/schema.test.ts`
- Test target: `src/db/schema.ts:52-70`

- [ ] **Step 1: getDbPath 테스트 추가**

`tests/schema.test.ts` 끝에 추가:

```typescript
import { getDbPath, initDb } from "../src/db/schema";

describe("getDbPath", () => {
  it("HOME 기반 경로를 반환한다", () => {
    const path = getDbPath();
    expect(path).toContain(".config/jerry-tickets/tickets.db");
    expect(path).toMatch(/^\/.*\.config\/jerry-tickets\/tickets\.db$/);
  });
});
```

- [ ] **Step 2: initDb 통합 테스트 추가**

`tests/schema.test.ts` 끝에 추가:

```typescript
describe("initDb", () => {
  it("DB를 생성하고 마이그레이션을 적용한다", () => {
    // 임시 HOME을 사용하여 실제 DB에 영향 없이 테스트
    const originalHome = process.env.HOME;
    const tempHome = join(tmpdir(), `tk-initdb-${Date.now()}`);
    process.env.HOME = tempHome;

    try {
      const testDb = initDb();
      const tables = testDb.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
      const names = tables.map((t) => t.name);

      expect(names).toContain("projects");
      expect(names).toContain("tickets");
      expect(names).toContain("schema_version");

      testDb.close();
    } finally {
      process.env.HOME = originalHome;
    }
  });
});
```

- [ ] **Step 3: 테스트 실행**

Run: `bun test tests/schema.test.ts`
Expected: 기존 7 + 신규 2 = 9 tests PASS

- [ ] **Step 4: 커밋**

```bash
git add tests/schema.test.ts
git commit -m "test: getDbPath, initDb 커버리지 추가"
```

---

### Task 3: Issue create — DB-level 유닛 테스트

**Files:**
- Create: `tests/issue.test.ts`
- Test target: `src/commands/issue.ts` (create 관련 로직)

이 태스크는 CLI 서브프로세스를 사용하여 issue create의 다양한 경로를 테스트한다.
테스트마다 임시 HOME을 사용해 격리된 DB를 쓴다.

- [ ] **Step 1: 테스트 헬퍼 및 기본 create 테스트**

```typescript
// tests/issue.test.ts
import { describe, expect, it, beforeEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { migrate } from "../src/db/schema";

const CLI = join(import.meta.dir, "..", "src", "index.ts");

// 매 테스트마다 고유한 임시 HOME — DB 격리
function createTestEnv(): { env: Record<string, string>; home: string } {
  const home = join(tmpdir(), `tk-issue-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return {
    home,
    env: { ...process.env, HOME: home } as Record<string, string>,
  };
}

function run(args: string[], env: Record<string, string>): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", CLI, ...args], { env, cwd: tmpdir() });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

// 테스트용 DB에 프로젝트를 직접 삽입하는 헬퍼
function seedProject(home: string, name: string, key: string, path: string): void {
  const dbDir = join(home, ".config", "jerry-tickets");
  mkdirSync(dbDir, { recursive: true });
  const db = new Database(join(dbDir, "tickets.db"), { create: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  db.query("INSERT INTO projects (name, key, path) VALUES (?, ?, ?)").run(name, key, path);
  db.close();
}

// DB를 열어서 조회하는 헬퍼
function openTestDb(home: string): Database {
  return new Database(join(home, ".config", "jerry-tickets", "tickets.db"));
}

describe("issue create", () => {
  let env: Record<string, string>;
  let home: string;
  const projectPath = tmpdir();

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "test", "TEST", projectPath);
  });

  it("기본 티켓을 생성한다", () => {
    const { stdout, exitCode } = run(["issue", "create", "My task"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("TEST-001");
    expect(stdout).toContain("My task");
  });

  it("우선순위를 지정할 수 있다", () => {
    const { stdout, exitCode } = run(["issue", "create", "Urgent", "-p", "0"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("P0");
  });

  it("잘못된 우선순위를 거부한다 (범위 초과)", () => {
    const { stderr, exitCode } = run(["issue", "create", "Bad", "-p", "5"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("priority must be");
  });

  it("잘못된 우선순위를 거부한다 (숫자 아님)", () => {
    const { stderr, exitCode } = run(["issue", "create", "Bad", "-p", "high"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("priority must be");
  });

  it("콤마 구분 태그를 JSON으로 변환한다", () => {
    const { exitCode } = run(["issue", "create", "Tagged", "-t", "bug,urgent"], env);
    expect(exitCode).toBe(0);

    const db = openTestDb(home);
    const row = db.query("SELECT tags FROM tickets WHERE id = 'TEST-001'").get() as { tags: string };
    expect(JSON.parse(row.tags)).toEqual(["bug", "urgent"]);
    db.close();
  });

  it("JSON 배열 태그를 그대로 사용한다", () => {
    const { exitCode } = run(["issue", "create", "Tagged", "-t", '["a","b"]'], env);
    expect(exitCode).toBe(0);

    const db = openTestDb(home);
    const row = db.query("SELECT tags FROM tickets WHERE id = 'TEST-001'").get() as { tags: string };
    expect(JSON.parse(row.tags)).toEqual(["a", "b"]);
    db.close();
  });

  it("잘못된 JSON 태그를 거부한다", () => {
    const { stderr, exitCode } = run(["issue", "create", "Bad", "-t", "[invalid"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("invalid JSON");
  });

  it("제목 없이 실행하면 에러를 반환한다", () => {
    const { stderr, exitCode } = run(["issue", "create"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
  });

  it("프로젝트 없이 실행하면 에러를 반환한다", () => {
    const noProjectEnv = createTestEnv();
    const { stderr, exitCode } = run(["issue", "create", "Orphan"], noProjectEnv.env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("No project");
  });
});

describe("issue create — 번호 생성", () => {
  let env: Record<string, string>;
  let home: string;
  const projectPath = tmpdir();

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "test", "TEST", projectPath);
  });

  it("연속 생성 시 번호가 순차 증가한다", () => {
    run(["issue", "create", "First"], env);
    run(["issue", "create", "Second"], env);
    const { stdout } = run(["issue", "create", "Third"], env);
    expect(stdout).toContain("TEST-003");
  });

  it("중간 티켓이 삭제되어도 번호가 증가한다 (MAX 기반)", () => {
    run(["issue", "create", "First"], env);
    run(["issue", "create", "Second"], env);

    // TEST-001을 hard delete (DB 직접 조작)
    const db = openTestDb(home);
    db.query("DELETE FROM ticket_history WHERE ticket_id = 'TEST-001'").run();
    db.query("DELETE FROM tickets WHERE id = 'TEST-001'").run();
    db.close();

    const { stdout } = run(["issue", "create", "Third"], env);
    // MAX(2) + 1 = 3 이어야 함 (COUNT 기반이었다면 2가 되어 충돌)
    expect(stdout).toContain("TEST-003");
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `bun test tests/issue.test.ts`
Expected: 11 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/issue.test.ts
git commit -m "test: issue create 검증 — 우선순위, 태그, 번호 생성"
```

---

### Task 4: Issue list/view/move/delete 통합 테스트

**Files:**
- Modify: `tests/issue.test.ts`
- Test target: `src/commands/issue.ts` (list, view, move, delete)

- [ ] **Step 1: issue list 테스트 추가**

`tests/issue.test.ts` 끝에 추가:

```typescript
describe("issue list", () => {
  let env: Record<string, string>;
  let home: string;
  const projectPath = tmpdir();

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "test", "TEST", projectPath);
    run(["issue", "create", "Task A", "-p", "0", "-t", "bug"], env);
    run(["issue", "create", "Task B", "-p", "2", "-t", "feature"], env);
    run(["issue", "create", "Task C", "-p", "1"], env);
  });

  it("--all로 전체 티켓을 나열한다", () => {
    const { stdout, exitCode } = run(["issue", "list", "--all"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Task A");
    expect(stdout).toContain("Task B");
    expect(stdout).toContain("Task C");
  });

  it("--status로 필터링한다", () => {
    run(["issue", "move", "TEST-001", "running"], env);
    const { stdout } = run(["issue", "list", "--all", "--status", "running"], env);
    expect(stdout).toContain("Task A");
    expect(stdout).not.toContain("Task B");
  });

  it("--priority로 필터링한다", () => {
    const { stdout } = run(["issue", "list", "--all", "--priority", "0"], env);
    expect(stdout).toContain("Task A");
    expect(stdout).not.toContain("Task B");
  });

  it("--json으로 JSON 출력한다", () => {
    const { stdout, exitCode } = run(["issue", "list", "--all", "--json"], env);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(3);
  });

  it("결과 없으면 안내 메시지를 출력한다", () => {
    const { stdout } = run(["issue", "list", "--all", "--status", "done"], env);
    expect(stdout).toContain("No tickets");
  });

  it("--tag로 필터링한다", () => {
    const { stdout } = run(["issue", "list", "--all", "--tag", "bug"], env);
    expect(stdout).toContain("Task A");
    expect(stdout).not.toContain("Task B");
  });
});
```

- [ ] **Step 2: issue view 테스트 추가**

```typescript
describe("issue view", () => {
  let env: Record<string, string>;
  let home: string;
  const projectPath = tmpdir();

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "test", "TEST", projectPath);
    run(["issue", "create", "View me", "-p", "1", "-t", "ui,ux"], env);
  });

  it("티켓 상세 정보를 출력한다", () => {
    const { stdout, exitCode } = run(["issue", "view", "TEST-001"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("TEST-001");
    expect(stdout).toContain("View me");
    expect(stdout).toContain("P1");
    expect(stdout).toContain("[BACKLOG]");
  });

  it("존재하지 않는 티켓은 에러를 반환한다", () => {
    const { stderr, exitCode } = run(["issue", "view", "NONE-999"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Ticket not found");
  });

  it("인자 없이 실행하면 사용법을 안내한다", () => {
    const { stderr, exitCode } = run(["issue", "view"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
  });
});
```

- [ ] **Step 3: issue move 테스트 추가**

```typescript
describe("issue move", () => {
  let env: Record<string, string>;
  let home: string;
  const projectPath = tmpdir();

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "test", "TEST", projectPath);
    run(["issue", "create", "Move me"], env);
  });

  it("backlog → running 전이에 성공한다", () => {
    const { stdout, exitCode } = run(["issue", "move", "TEST-001", "running"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("backlog → running");
  });

  it("started_at이 최초 running 전환 시 기록된다", () => {
    run(["issue", "move", "TEST-001", "running"], env);
    const db = openTestDb(home);
    const row = db.query("SELECT started_at FROM tickets WHERE id = 'TEST-001'").get() as { started_at: string | null };
    expect(row.started_at).not.toBeNull();
    db.close();
  });

  it("running → paused → running 시 started_at이 보존된다", () => {
    run(["issue", "move", "TEST-001", "running"], env);

    const db = openTestDb(home);
    const first = db.query("SELECT started_at FROM tickets WHERE id = 'TEST-001'").get() as { started_at: string };
    const firstStarted = first.started_at;
    db.close();

    run(["issue", "move", "TEST-001", "paused"], env);
    run(["issue", "move", "TEST-001", "running"], env);

    const db2 = openTestDb(home);
    const second = db2.query("SELECT started_at FROM tickets WHERE id = 'TEST-001'").get() as { started_at: string };
    expect(second.started_at).toBe(firstStarted);
    db2.close();
  });

  it("허용되지 않은 전이를 거부한다 (backlog → done)", () => {
    const { stderr, exitCode } = run(["issue", "move", "TEST-001", "done"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Cannot move");
  });

  it("terminal 상태(done)에서 전이를 거부한다", () => {
    run(["issue", "move", "TEST-001", "running"], env);
    run(["issue", "move", "TEST-001", "done"], env);
    const { stderr, exitCode } = run(["issue", "move", "TEST-001", "running"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Terminal state");
  });

  it("완료 시 completed_at이 기록된다", () => {
    run(["issue", "move", "TEST-001", "running"], env);
    run(["issue", "move", "TEST-001", "done"], env);

    const db = openTestDb(home);
    const row = db.query("SELECT completed_at FROM tickets WHERE id = 'TEST-001'").get() as { completed_at: string | null };
    expect(row.completed_at).not.toBeNull();
    db.close();
  });

  it("인자 부족 시 사용법을 안내한다", () => {
    const { stderr, exitCode } = run(["issue", "move", "TEST-001"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
  });

  it("존재하지 않는 티켓은 에러를 반환한다", () => {
    const { stderr, exitCode } = run(["issue", "move", "NONE-999", "running"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Ticket not found");
  });

  it("히스토리에 전이 이벤트가 기록된다", () => {
    run(["issue", "move", "TEST-001", "running"], env);

    const db = openTestDb(home);
    const rows = db.query("SELECT * FROM ticket_history WHERE ticket_id = 'TEST-001' ORDER BY id").all() as Array<{
      event_type: string;
      data: string;
    }>;
    // created + running 이벤트
    expect(rows.length).toBe(2);
    expect(rows[1]!.event_type).toBe("running");
    const data = JSON.parse(rows[1]!.data);
    expect(data.from).toBe("backlog");
    expect(data.to).toBe("running");
    db.close();
  });
});
```

- [ ] **Step 4: issue delete 테스트 추가**

```typescript
describe("issue delete", () => {
  let env: Record<string, string>;
  let home: string;
  const projectPath = tmpdir();

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "test", "TEST", projectPath);
    run(["issue", "create", "Delete me"], env);
  });

  it("soft delete에 성공한다", () => {
    const { stdout, exitCode } = run(["issue", "delete", "TEST-001"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Deleted");
    expect(stdout).toContain("soft delete");
  });

  it("삭제 후 status가 deleted로 변경된다", () => {
    run(["issue", "delete", "TEST-001"], env);

    const db = openTestDb(home);
    const row = db.query("SELECT status FROM tickets WHERE id = 'TEST-001'").get() as { status: string };
    expect(row.status).toBe("deleted");
    db.close();
  });

  it("삭제 후 list에서 보이지 않는다", () => {
    run(["issue", "delete", "TEST-001"], env);
    const { stdout } = run(["issue", "list", "--all"], env);
    expect(stdout).not.toContain("TEST-001");
  });

  it("존재하지 않는 티켓은 에러를 반환한다", () => {
    const { stderr, exitCode } = run(["issue", "delete", "NONE-999"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Ticket not found");
  });

  it("인자 없이 실행하면 사용법을 안내한다", () => {
    const { stderr, exitCode } = run(["issue", "delete"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
  });
});
```

- [ ] **Step 5: 테스트 실행**

Run: `bun test tests/issue.test.ts`
Expected: 모든 테스트 PASS

- [ ] **Step 6: 커밋**

```bash
git add tests/issue.test.ts
git commit -m "test: issue list/view/move/delete 통합 테스트"
```

---

### Task 5: Board 통합 테스트

**Files:**
- Create: `tests/board.test.ts`
- Test target: `src/commands/board.ts`

- [ ] **Step 1: board 테스트 파일 생성**

```typescript
// tests/board.test.ts
import { Database } from "bun:sqlite";
import { describe, expect, it, beforeEach } from "bun:test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../src/db/schema";

const CLI = join(import.meta.dir, "..", "src", "index.ts");

function createTestEnv(): { env: Record<string, string>; home: string } {
  const home = join(tmpdir(), `tk-board-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return {
    home,
    env: { ...process.env, HOME: home } as Record<string, string>,
  };
}

function run(args: string[], env: Record<string, string>): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", CLI, ...args], { env, cwd: tmpdir() });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

function seedProject(home: string, name: string, key: string, path: string): void {
  const dbDir = join(home, ".config", "jerry-tickets");
  mkdirSync(dbDir, { recursive: true });
  const db = new Database(join(dbDir, "tickets.db"), { create: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  db.query("INSERT INTO projects (name, key, path) VALUES (?, ?, ?)").run(name, key, path);
  db.close();
}

function openTestDb(home: string): Database {
  return new Database(join(home, ".config", "jerry-tickets", "tickets.db"));
}

describe("board", () => {
  let env: Record<string, string>;
  let home: string;
  const projectPath = tmpdir();

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "test", "TEST", projectPath);
    run(["issue", "create", "Task A"], env);
    run(["issue", "create", "Task B"], env);
    run(["issue", "move", "TEST-001", "running"], env);
  });

  it("--all로 칸반 보드를 렌더링한다", () => {
    const { stdout, exitCode } = run(["board", "--all"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("BACKLOG");
    expect(stdout).toContain("RUNNING");
    expect(stdout).toContain("PAUSED");
    expect(stdout).toContain("DONE/ABT");
    expect(stdout).toContain("TEST-001");
    expect(stdout).toContain("TEST-002");
  });

  it("done 티켓이 DONE/ABT 컬럼에 표시된다", () => {
    run(["issue", "move", "TEST-001", "done"], env);
    const { stdout } = run(["board", "--all"], env);
    expect(stdout).toContain("TEST-001");
    expect(stdout).toContain("DONE/ABT");
  });

  it("aborted 티켓이 ABT 마크와 함께 표시된다", () => {
    run(["issue", "move", "TEST-002", "aborted"], env);
    const { stdout } = run(["board", "--all"], env);
    expect(stdout).toContain("ABT");
  });

  it("프로젝트 미등록 상태에서 --all 없이 실행하면 에러를 반환한다", () => {
    const noProjectEnv = createTestEnv();
    const { stderr, exitCode } = run(["board"], noProjectEnv.env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Not a registered project");
  });

  it("티켓이 없으면 빈 보드를 표시한다", () => {
    const emptyEnv = createTestEnv();
    seedProject(emptyEnv.home, "empty", "EMP", tmpdir());
    const { stdout, exitCode } = run(["board", "--all"], emptyEnv.env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("0 tickets");
  });

  it("ticket count를 정확히 표시한다", () => {
    const { stdout } = run(["board", "--all"], env);
    expect(stdout).toContain("2 tickets");
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `bun test tests/board.test.ts`
Expected: 6 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/board.test.ts
git commit -m "test: board 칸반 보드 통합 테스트"
```

---

### Task 6: Project 통합 테스트

**Files:**
- Create: `tests/project.test.ts`
- Test target: `src/commands/project.ts`

- [ ] **Step 1: project 테스트 파일 생성**

```typescript
// tests/project.test.ts
import { Database } from "bun:sqlite";
import { describe, expect, it, beforeEach } from "bun:test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../src/db/schema";

const CLI = join(import.meta.dir, "..", "src", "index.ts");

function createTestEnv(): { env: Record<string, string>; home: string } {
  const home = join(tmpdir(), `tk-project-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return {
    home,
    env: { ...process.env, HOME: home } as Record<string, string>,
  };
}

function run(args: string[], env: Record<string, string>, cwd?: string): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", CLI, ...args], { env, cwd: cwd ?? tmpdir() });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

function seedProject(home: string, name: string, key: string, path: string): void {
  const dbDir = join(home, ".config", "jerry-tickets");
  mkdirSync(dbDir, { recursive: true });
  const db = new Database(join(dbDir, "tickets.db"), { create: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  db.query("INSERT INTO projects (name, key, path) VALUES (?, ?, ?)").run(name, key, path);
  db.close();
}

function openTestDb(home: string): Database {
  return new Database(join(home, ".config", "jerry-tickets", "tickets.db"));
}

describe("project init", () => {
  it("프로젝트를 초기화한다", () => {
    const { env, home } = createTestEnv();
    // git이 아닌 디렉토리에서 실행 — cwd가 프로젝트 경로가 됨
    const projectDir = join(tmpdir(), `tk-proj-${Date.now()}`);
    mkdirSync(projectDir, { recursive: true });

    const { stdout, exitCode } = run(["project", "init"], env, projectDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Project initialized");
  });

  it("--key로 커스텀 프로젝트 키를 설정한다", () => {
    const { env, home } = createTestEnv();
    const projectDir = join(tmpdir(), `tk-proj-key-${Date.now()}`);
    mkdirSync(projectDir, { recursive: true });

    const { stdout, exitCode } = run(["project", "init", "--key", "MYKEY"], env, projectDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("MYKEY");
  });

  it("이미 등록된 프로젝트는 중복 등록하지 않는다", () => {
    const { env } = createTestEnv();
    const projectDir = join(tmpdir(), `tk-proj-dup-${Date.now()}`);
    mkdirSync(projectDir, { recursive: true });

    run(["project", "init"], env, projectDir);
    const { stdout, exitCode } = run(["project", "init"], env, projectDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("already registered");
  });
});

describe("project list", () => {
  it("프로젝트 목록과 통계를 표시한다", () => {
    const { env, home } = createTestEnv();
    seedProject(home, "myapp", "APP", tmpdir());

    // 티켓 추가
    run(["issue", "create", "Task 1"], env);
    run(["issue", "create", "Task 2"], env);

    const { stdout, exitCode } = run(["project", "list"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("myapp");
    expect(stdout).toContain("APP");
    expect(stdout).toContain("2 backlog");
  });

  it("프로젝트 없으면 안내 메시지를 출력한다", () => {
    const { env } = createTestEnv();
    const { stdout, exitCode } = run(["project", "list"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No projects");
  });
});

describe("project view", () => {
  it("프로젝트 상세 정보를 출력한다", () => {
    const { env, home } = createTestEnv();
    const projectDir = tmpdir();
    seedProject(home, "myapp", "APP", projectDir);

    run(["issue", "create", "Task 1"], env);

    const { stdout, exitCode } = run(["project", "view"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("myapp");
    expect(stdout).toContain("APP");
    expect(stdout).toContain("Tickets: 1");
  });

  it("미등록 경로에서 실행하면 에러를 반환한다", () => {
    const { env } = createTestEnv();
    const { stderr, exitCode } = run(["project", "view"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Not a registered project");
  });
});

describe("project aliases", () => {
  it("p l이 project list와 동일하게 동작한다", () => {
    const { env } = createTestEnv();
    const { exitCode } = run(["p", "l"], env);
    expect(exitCode).toBe(0);
  });

  it("p v가 project view를 실행한다", () => {
    const { env } = createTestEnv();
    // 프로젝트 미등록이므로 에러를 반환하되, view가 실행된 것
    const { stderr, exitCode } = run(["p", "v"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Not a registered project");
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `bun test tests/project.test.ts`
Expected: 8 tests PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/project.test.ts
git commit -m "test: project init/list/view 통합 테스트"
```

---

### Task 7: 전체 테스트 실행 및 커버리지 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 실행**

Run: `bun test`
Expected: 전체 PASS, 0 fail

- [ ] **Step 2: 커버리지 확인**

Run: `bun test --coverage`
Expected: Lines 커버리지 90%+ (서브프로세스 테스트는 bun --coverage에 안 잡히므로 수치는 다소 낮을 수 있음)

- [ ] **Step 3: 최종 커밋**

```bash
git add -A
git commit -m "test: tk-cli 전체 테스트 커버리지 확장 완료"
```
