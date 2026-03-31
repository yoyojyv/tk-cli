import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIGRATIONS, SCHEMA_VERSION, getDbPath, initDb, migrate } from "../src/db/schema";

let db: Database;
let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `tk-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = new Database(dbPath, { create: true });
  db.exec("PRAGMA foreign_keys = ON");
});

afterEach(() => {
  db.close();
  try {
    unlinkSync(dbPath);
  } catch {}
});

describe("마이그레이션", () => {
  it("빈 DB에 마이그레이션을 적용한다", () => {
    migrate(db);

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
      name: string;
    }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain("projects");
    expect(names).toContain("tickets");
    expect(names).toContain("ticket_history");
    expect(names).toContain("schema_version");
  });

  it("schema_version이 현재 버전으로 기록된다", () => {
    migrate(db);

    const row = db.query("SELECT MAX(version) as v FROM schema_version").get() as { v: number };
    expect(row.v).toBe(SCHEMA_VERSION);
  });

  it("중복 마이그레이션을 실행해도 안전하다", () => {
    migrate(db);
    migrate(db); // 두 번째 실행

    const row = db.query("SELECT COUNT(*) as cnt FROM schema_version").get() as { cnt: number };
    expect(row.cnt).toBe(1);
  });

  it("MIGRATIONS 객체에 SCHEMA_VERSION까지의 키가 존재한다", () => {
    for (let v = 1; v <= SCHEMA_VERSION; v++) {
      expect(MIGRATIONS[v]).toBeDefined();
      expect(MIGRATIONS[v]?.length).toBeGreaterThan(0);
    }
  });
});

describe("tickets 테이블 제약조건", () => {
  beforeEach(() => {
    migrate(db);
    db.query("INSERT INTO projects (name, key, path) VALUES ('test', 'TEST', '/tmp/test')").run();
  });

  it("유효한 티켓을 삽입한다", () => {
    db.query("INSERT INTO tickets (id, project, title) VALUES ('TEST-001', 'test', 'My task')").run();
    const row = db.query("SELECT * FROM tickets WHERE id = 'TEST-001'").get() as Record<string, unknown>;
    expect(row.title).toBe("My task");
    expect(row.status).toBe("backlog");
    expect(row.priority).toBe(2);
  });

  it("유효하지 않은 status를 거부한다", () => {
    expect(() => {
      db.query("INSERT INTO tickets (id, project, title, status) VALUES ('TEST-002', 'test', 'Bad', 'invalid')").run();
    }).toThrow();
  });

  it("범위를 벗어난 priority를 거부한다", () => {
    expect(() => {
      db.query("INSERT INTO tickets (id, project, title, priority) VALUES ('TEST-003', 'test', 'Bad', 5)").run();
    }).toThrow();
  });

  it("존재하지 않는 프로젝트 참조 시 외래 키 위반이 발생한다", () => {
    expect(() => {
      db.query("INSERT INTO tickets (id, project, title) VALUES ('NONE-001', 'nonexistent', 'Bad')").run();
    }).toThrow();
  });
});

describe("ticket_history 테이블", () => {
  beforeEach(() => {
    migrate(db);
    db.query("INSERT INTO projects (name, key, path) VALUES ('test', 'TEST', '/tmp/test')").run();
    db.query("INSERT INTO tickets (id, project, title) VALUES ('TEST-001', 'test', 'My task')").run();
  });

  it("히스토리를 기록한다", () => {
    db.query(
      "INSERT INTO ticket_history (ticket_id, event_type, data) VALUES ('TEST-001', 'created', '{\"title\":\"My task\"}')",
    ).run();
    const rows = db.query("SELECT * FROM ticket_history WHERE ticket_id = 'TEST-001'").all() as Record<
      string,
      unknown
    >[];
    expect(rows.length).toBe(1);
    expect(rows[0]?.event_type).toBe("created");
  });
});

describe("getDbPath", () => {
  it("HOME 기반 경로를 반환한다", () => {
    const path = getDbPath();
    expect(path).toContain(".config/jerry-tickets/tickets.db");
    expect(path).toMatch(/^\/.*\.config\/jerry-tickets\/tickets\.db$/);
  });
});

describe("initDb", () => {
  it("DB를 생성하고 마이그레이션을 적용한다", () => {
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
