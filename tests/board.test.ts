import { Database } from "bun:sqlite";
import { describe, expect, it, beforeEach } from "bun:test";
import { mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../src/db/schema";

const CLI = join(import.meta.dir, "..", "src", "index.ts");
const REAL_TMPDIR = realpathSync(tmpdir());

function createTestEnv(): { env: Record<string, string>; home: string } {
  const home = join(REAL_TMPDIR, `tk-board-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return {
    home,
    env: { ...process.env, HOME: home } as Record<string, string>,
  };
}

function run(args: string[], env: Record<string, string>): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", CLI, ...args], { env, cwd: REAL_TMPDIR });
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

describe("board", () => {
  let env: Record<string, string>;
  let home: string;

  beforeEach(() => {
    ({ env, home } = createTestEnv());
    seedProject(home, "test", "TEST", REAL_TMPDIR);
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
    seedProject(emptyEnv.home, "empty", "EMP", REAL_TMPDIR);
    const { stdout, exitCode } = run(["board", "--all"], emptyEnv.env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("0 tickets");
  });

  it("ticket count를 정확히 표시한다", () => {
    const { stdout } = run(["board", "--all"], env);
    expect(stdout).toContain("2 tickets");
  });
});
