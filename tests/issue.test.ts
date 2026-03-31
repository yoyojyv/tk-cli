import { Database } from "bun:sqlite";
import { describe, expect, it, beforeEach } from "bun:test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../src/db/schema";

const CLI = join(import.meta.dir, "..", "src", "index.ts");

// tmpdir()은 /tmp 또는 /var/folders/... 등 실제 경로를 반환하는데
// macOS에서 /tmp -> /private/tmp 심볼릭 링크가 있어 git이 /private/tmp를 반환할 수 있다.
// 따라서 실제 경로로 정규화한다.
const WORK_DIR = (() => {
  const result = Bun.spawnSync(["realpath", tmpdir()]);
  return result.stdout.toString().trim() || tmpdir();
})();

function createTestEnv(): { env: Record<string, string>; home: string } {
  const home = join(
    WORK_DIR,
    `tk-issue-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(home, { recursive: true });
  return {
    home,
    env: { ...process.env, HOME: home } as Record<string, string>,
  };
}

function run(
  args: string[],
  env: Record<string, string>,
  cwd?: string
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", CLI, ...args], {
    env,
    cwd: cwd ?? WORK_DIR,
  });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

function seedProject(
  home: string,
  name: string,
  key: string,
  path: string
): void {
  const dbDir = join(home, ".config", "jerry-tickets");
  mkdirSync(dbDir, { recursive: true });
  const db = new Database(join(dbDir, "tickets.db"), { create: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  db.query(
    "INSERT INTO projects (name, key, path) VALUES (?, ?, ?)"
  ).run(name, key, path);
  db.close();
}

function openTestDb(home: string): Database {
  return new Database(
    join(home, ".config", "jerry-tickets", "tickets.db")
  );
}

// ────────────────────────────────────────────────────────────
// issue create
// ────────────────────────────────────────────────────────────
describe("issue create", () => {
  let env: Record<string, string>;
  let home: string;

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    // CLI가 tmpdir에서 실행되면 git root가 없어 cwd를 project path로 사용한다
    seedProject(home, "Test Project", "TEST", WORK_DIR);
  });

  it("기본 티켓을 생성한다", () => {
    const { stdout, exitCode } = run(["issue", "create", "Basic ticket"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("TEST-001");
  });

  it("우선순위를 지정할 수 있다", () => {
    const { stdout, exitCode } = run(
      ["issue", "create", "Urgent ticket", "-p", "0"],
      env
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("P0");
  });

  it("잘못된 우선순위를 거부한다 (범위 초과)", () => {
    const { stderr, exitCode } = run(
      ["issue", "create", "Bad priority", "-p", "5"],
      env
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("priority must be");
  });

  it("잘못된 우선순위를 거부한다 (숫자 아님)", () => {
    const { exitCode } = run(
      ["issue", "create", "Bad priority", "-p", "high"],
      env
    );
    expect(exitCode).toBe(1);
  });

  it("콤마 구분 태그를 JSON으로 변환한다", () => {
    const { exitCode } = run(
      ["issue", "create", "Tagged ticket", "-t", "bug,urgent"],
      env
    );
    expect(exitCode).toBe(0);

    const db = openTestDb(home);
    const row = db
      .query("SELECT tags FROM tickets WHERE id = 'TEST-001'")
      .get() as { tags: string } | null;
    db.close();

    expect(row).not.toBeNull();
    expect(JSON.parse(row!.tags)).toEqual(["bug", "urgent"]);
  });

  it("JSON 배열 태그를 그대로 사용한다", () => {
    const { exitCode } = run(
      ["issue", "create", "JSON tag ticket", "-t", '["a","b"]'],
      env
    );
    expect(exitCode).toBe(0);

    const db = openTestDb(home);
    const row = db
      .query("SELECT tags FROM tickets WHERE id = 'TEST-001'")
      .get() as { tags: string } | null;
    db.close();

    expect(row).not.toBeNull();
    expect(JSON.parse(row!.tags)).toEqual(["a", "b"]);
  });

  it("잘못된 JSON 태그를 거부한다", () => {
    const { stderr, exitCode } = run(
      ["issue", "create", "Bad tag ticket", "-t", "[invalid"],
      env
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("invalid JSON");
  });

  it("제목 없이 실행하면 에러를 반환한다", () => {
    const { exitCode } = run(["issue", "create"], env);
    expect(exitCode).toBe(1);
  });

  it("프로젝트 없이 실행하면 에러를 반환한다", () => {
    // 새 환경 — 프로젝트 시드 없음
    const { env: freshEnv } = createTestEnv();
    const { exitCode, stderr } = run(
      ["issue", "create", "No project ticket"],
      freshEnv
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("No project found");
  });
});

// ────────────────────────────────────────────────────────────
// issue create — 번호 생성
// ────────────────────────────────────────────────────────────
describe("issue create — 번호 생성", () => {
  let env: Record<string, string>;
  let home: string;

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "Test Project", "TEST", WORK_DIR);
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

    // TEST-001을 DB에서 hard delete
    const db = openTestDb(home);
    db.query("DELETE FROM ticket_history WHERE ticket_id = 'TEST-001'").run();
    db.query("DELETE FROM tickets WHERE id = 'TEST-001'").run();
    db.close();

    const { stdout } = run(["issue", "create", "Third"], env);
    expect(stdout).toContain("TEST-003");
  });
});

// ────────────────────────────────────────────────────────────
// issue list
// ────────────────────────────────────────────────────────────
describe("issue list", () => {
  let env: Record<string, string>;
  let home: string;

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "Test Project", "TEST", WORK_DIR);

    // 3개 티켓 생성 (다양한 priority, tag)
    run(["issue", "create", "Alpha ticket", "-p", "0", "-t", "bug"], env);
    run(["issue", "create", "Beta ticket", "-p", "2", "-t", "feature"], env);
    run(["issue", "create", "Gamma ticket", "-p", "3", "-t", "bug,docs"], env);
  });

  it("--all로 전체 티켓을 나열한다", () => {
    const { stdout, exitCode } = run(["issue", "list", "--all"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("TEST-001");
    expect(stdout).toContain("TEST-002");
    expect(stdout).toContain("TEST-003");
  });

  it("--status로 필터링한다", () => {
    // TEST-001을 running으로 이동
    run(["issue", "move", "TEST-001", "running"], env);

    const { stdout, exitCode } = run(
      ["issue", "list", "--status", "running", "--all"],
      env
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("TEST-001");
    expect(stdout).not.toContain("TEST-002");
  });

  it("--priority로 필터링한다", () => {
    const { stdout, exitCode } = run(
      ["issue", "list", "-p", "0", "--all"],
      env
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("TEST-001");
    expect(stdout).not.toContain("TEST-002");
    expect(stdout).not.toContain("TEST-003");
  });

  it("--json으로 JSON 출력한다", () => {
    const { stdout, exitCode } = run(
      ["issue", "list", "--all", "--json"],
      env
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(3);
  });

  it("결과 없으면 안내 메시지를 출력한다", () => {
    const { stdout, exitCode } = run(
      ["issue", "list", "--status", "done", "--all"],
      env
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No tickets");
  });

  it("--tag로 필터링한다", () => {
    const { stdout, exitCode } = run(
      ["issue", "list", "--tag", "bug", "--all"],
      env
    );
    expect(exitCode).toBe(0);
    // bug 태그가 있는 TEST-001, TEST-003
    expect(stdout).toContain("TEST-001");
    expect(stdout).toContain("TEST-003");
    expect(stdout).not.toContain("TEST-002");
  });
});

// ────────────────────────────────────────────────────────────
// issue view
// ────────────────────────────────────────────────────────────
describe("issue view", () => {
  let env: Record<string, string>;
  let home: string;

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "Test Project", "TEST", WORK_DIR);
    run(["issue", "create", "View test ticket", "-p", "1"], env);
  });

  it("티켓 상세 정보를 출력한다", () => {
    const { stdout, exitCode } = run(["issue", "view", "TEST-001"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("TEST-001");
    expect(stdout).toContain("View test ticket");
    expect(stdout).toContain("BACKLOG");
    expect(stdout).toContain("P1");
  });

  it("존재하지 않는 티켓은 에러를 반환한다", () => {
    const { stderr, exitCode } = run(["issue", "view", "NONE-999"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("NONE-999");
  });

  it("인자 없이 실행하면 사용법을 안내한다", () => {
    const { stderr, exitCode } = run(["issue", "view"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage");
  });
});

// ────────────────────────────────────────────────────────────
// issue move
// ────────────────────────────────────────────────────────────
describe("issue move", () => {
  let env: Record<string, string>;
  let home: string;

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "Test Project", "TEST", WORK_DIR);
    run(["issue", "create", "Move test ticket"], env);
  });

  it("backlog → running 전이에 성공한다", () => {
    const { stdout, exitCode } = run(
      ["issue", "move", "TEST-001", "running"],
      env
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("backlog → running");
  });

  it("started_at이 최초 running 전환 시 기록된다", () => {
    run(["issue", "move", "TEST-001", "running"], env);

    const db = openTestDb(home);
    const row = db
      .query("SELECT started_at FROM tickets WHERE id = 'TEST-001'")
      .get() as { started_at: string | null } | null;
    db.close();

    expect(row?.started_at).toBeTruthy();
  });

  it("running → paused → running 시 started_at이 보존된다", () => {
    run(["issue", "move", "TEST-001", "running"], env);

    const db1 = openTestDb(home);
    const first = db1
      .query("SELECT started_at FROM tickets WHERE id = 'TEST-001'")
      .get() as { started_at: string } | null;
    db1.close();

    const originalStartedAt = first?.started_at;

    run(["issue", "move", "TEST-001", "paused"], env);
    run(["issue", "move", "TEST-001", "running"], env);

    const db2 = openTestDb(home);
    const after = db2
      .query("SELECT started_at FROM tickets WHERE id = 'TEST-001'")
      .get() as { started_at: string } | null;
    db2.close();

    expect(after?.started_at).toBe(originalStartedAt);
  });

  it("허용되지 않은 전이를 거부한다 (backlog → done)", () => {
    const { stderr, exitCode } = run(
      ["issue", "move", "TEST-001", "done"],
      env
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Cannot move");
  });

  it("terminal 상태(done)에서 전이를 거부한다", () => {
    run(["issue", "move", "TEST-001", "running"], env);
    run(["issue", "move", "TEST-001", "done"], env);

    const { stderr, exitCode } = run(
      ["issue", "move", "TEST-001", "backlog"],
      env
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Terminal state");
  });

  it("완료 시 completed_at이 기록된다", () => {
    run(["issue", "move", "TEST-001", "running"], env);
    run(["issue", "move", "TEST-001", "done"], env);

    const db = openTestDb(home);
    const row = db
      .query("SELECT completed_at FROM tickets WHERE id = 'TEST-001'")
      .get() as { completed_at: string | null } | null;
    db.close();

    expect(row?.completed_at).toBeTruthy();
  });

  it("인자 부족 시 사용법을 안내한다", () => {
    const { stderr, exitCode } = run(
      ["issue", "move", "TEST-001"],
      env
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage");
  });

  it("존재하지 않는 티켓은 에러를 반환한다", () => {
    const { stderr, exitCode } = run(
      ["issue", "move", "NONE-999", "running"],
      env
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("NONE-999");
  });

  it("히스토리에 전이 이벤트가 기록된다", () => {
    run(["issue", "move", "TEST-001", "running"], env);

    const db = openTestDb(home);
    const rows = db
      .query(
        "SELECT event_type FROM ticket_history WHERE ticket_id = 'TEST-001'"
      )
      .all() as { event_type: string }[];
    db.close();

    const eventTypes = rows.map((r) => r.event_type);
    expect(eventTypes).toContain("created");
    expect(eventTypes).toContain("running");
  });
});

// ────────────────────────────────────────────────────────────
// issue delete
// ────────────────────────────────────────────────────────────
describe("issue delete", () => {
  let env: Record<string, string>;
  let home: string;

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "Test Project", "TEST", WORK_DIR);
    run(["issue", "create", "Delete test ticket"], env);
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
    const row = db
      .query("SELECT status FROM tickets WHERE id = 'TEST-001'")
      .get() as { status: string } | null;
    db.close();

    expect(row?.status).toBe("deleted");
  });

  it("삭제 후 list에서 보이지 않는다", () => {
    run(["issue", "delete", "TEST-001"], env);

    const { stdout, exitCode } = run(["issue", "list", "--all"], env);
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("TEST-001");
  });

  it("존재하지 않는 티켓은 에러를 반환한다", () => {
    const { stderr, exitCode } = run(["issue", "delete", "NONE-999"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("NONE-999");
  });

  it("인자 없이 실행하면 사용법을 안내한다", () => {
    const { stderr, exitCode } = run(["issue", "delete"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage");
  });
});
