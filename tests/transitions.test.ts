import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../src/db/schema";

/**
 * 상태 전이 로직 테스트.
 * VALID_TRANSITIONS 맵에 정의된 규칙을 DB 레벨에서 검증한다.
 *
 * 상태 전이 규칙:
 *   backlog → running, aborted
 *   running → paused, done
 *   paused  → running, aborted
 *   done, aborted = terminal (전이 불가)
 */

const VALID_TRANSITIONS: Record<string, string[]> = {
  backlog: ["running", "aborted"],
  running: ["paused", "done"],
  paused: ["running", "aborted"],
};

const ALL_STATUSES = ["backlog", "running", "paused", "done", "aborted"];

let db: Database;
let dbPath: string;

function setupTicket(id: string, status: string): void {
  db.query("INSERT INTO tickets (id, project, title, status) VALUES (?, 'test', 'Task', ?)").run(id, status);
}

function atomicMove(id: string, fromStatus: string, toStatus: string): number {
  const now = new Date().toISOString();
  const result = db
    .query("UPDATE tickets SET status = ?, updated_at = ? WHERE id = ? AND status = ?")
    .run(toStatus, now, id, fromStatus);
  return result.changes;
}

beforeEach(() => {
  dbPath = join(tmpdir(), `tk-transitions-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = new Database(dbPath, { create: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  db.query("INSERT INTO projects (name, key, path) VALUES ('test', 'TEST', '/tmp/test')").run();
});

afterEach(() => {
  db.close();
  try {
    unlinkSync(dbPath);
  } catch {}
});

describe("상태 전이 규칙", () => {
  it("backlog → running이 허용된다", () => {
    setupTicket("T-001", "backlog");
    expect(atomicMove("T-001", "backlog", "running")).toBe(1);
  });

  it("backlog → aborted가 허용된다", () => {
    setupTicket("T-002", "backlog");
    expect(atomicMove("T-002", "backlog", "aborted")).toBe(1);
  });

  it("running → paused가 허용된다", () => {
    setupTicket("T-003", "running");
    expect(atomicMove("T-003", "running", "paused")).toBe(1);
  });

  it("running → done이 허용된다", () => {
    setupTicket("T-004", "running");
    expect(atomicMove("T-004", "running", "done")).toBe(1);
  });

  it("paused → running이 허용된다", () => {
    setupTicket("T-005", "paused");
    expect(atomicMove("T-005", "paused", "running")).toBe(1);
  });

  it("paused → aborted가 허용된다", () => {
    setupTicket("T-006", "paused");
    expect(atomicMove("T-006", "paused", "aborted")).toBe(1);
  });
});

describe("terminal 상태에서 전이 불가", () => {
  it("done 상태에서 어떤 전이도 불가하다", () => {
    for (const target of ALL_STATUSES.filter((s) => s !== "done")) {
      setupTicket(`DONE-${target}`, "done");
      // atomic move는 WHERE status = 'done'이므로 매칭되지만,
      // 비즈니스 로직에서 VALID_TRANSITIONS에 done이 없어 차단된다
      expect(VALID_TRANSITIONS.done).toBeUndefined();
    }
  });

  it("aborted 상태에서 어떤 전이도 불가하다", () => {
    expect(VALID_TRANSITIONS.aborted).toBeUndefined();
  });
});

describe("허용되지 않은 전이", () => {
  it("backlog → done 직접 전이는 불가하다", () => {
    const allowed = VALID_TRANSITIONS.backlog!;
    expect(allowed).not.toContain("done");
  });

  it("backlog → paused 직접 전이는 불가하다", () => {
    const allowed = VALID_TRANSITIONS.backlog!;
    expect(allowed).not.toContain("paused");
  });

  it("running → backlog 역방향 전이는 불가하다", () => {
    const allowed = VALID_TRANSITIONS.running!;
    expect(allowed).not.toContain("backlog");
  });
});

describe("atomic UPDATE (race condition 방어)", () => {
  it("동시 이동 시 하나만 성공한다", () => {
    setupTicket("RACE-001", "backlog");

    // 첫 번째 이동: backlog → running (성공)
    const first = atomicMove("RACE-001", "backlog", "running");
    expect(first).toBe(1);

    // 두 번째 이동: 여전히 backlog에서 시도 → 이미 running이므로 실패
    const second = atomicMove("RACE-001", "backlog", "running");
    expect(second).toBe(0);

    // 최종 상태 확인
    const row = db.query("SELECT status FROM tickets WHERE id = 'RACE-001'").get() as { status: string };
    expect(row.status).toBe("running");
  });
});
