import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../src/db/schema";

const CLI = join(import.meta.dir, "..", "src", "index.ts");
const REAL_TMPDIR = realpathSync(tmpdir());

function createTestEnv(): { env: Record<string, string>; home: string } {
  const home = join(REAL_TMPDIR, `tk-project-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return {
    home,
    env: { ...process.env, HOME: home } as Record<string, string>,
  };
}

function run(
  args: string[],
  env: Record<string, string>,
  cwd?: string,
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", CLI, ...args], { env, cwd: cwd ?? REAL_TMPDIR });
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

describe("project init", () => {
  it("프로젝트를 초기화한다", () => {
    const { env } = createTestEnv();
    const projectDir = join(REAL_TMPDIR, `tk-proj-${Date.now()}`);
    mkdirSync(projectDir, { recursive: true });

    const { stdout, exitCode } = run(["project", "init"], env, projectDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Project initialized");
  });

  it("--key로 커스텀 프로젝트 키를 설정한다", () => {
    const { env } = createTestEnv();
    const projectDir = join(REAL_TMPDIR, `tk-proj-key-${Date.now()}`);
    mkdirSync(projectDir, { recursive: true });

    const { stdout, exitCode } = run(["project", "init", "--key", "MYKEY"], env, projectDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("MYKEY");
  });

  it("이미 등록된 프로젝트는 중복 등록하지 않는다", () => {
    const { env } = createTestEnv();
    const projectDir = join(REAL_TMPDIR, `tk-proj-dup-${Date.now()}`);
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
    seedProject(home, "myapp", "APP", REAL_TMPDIR);

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
    seedProject(home, "myapp", "APP", REAL_TMPDIR);

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
    const { stderr, exitCode } = run(["p", "v"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Not a registered project");
  });
});
