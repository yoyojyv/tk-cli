import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * CLI 통합 테스트: 실제 바이너리를 서브프로세스로 실행하여 검증한다.
 * process.exit() 호출이 있는 명령어들은 이 방식으로 테스트해야 안전하다.
 */

const CLI = join(import.meta.dir, "..", "src", "index.ts");
const TEST_DB_DIR = join(tmpdir(), `tk-cli-test-${Date.now()}`);
const _TEST_DB = join(TEST_DB_DIR, "tickets.db");

// 테스트용 프로젝트 디렉토리 (git repo 시뮬레이션 불필요 — --all 플래그 사용)
const env = {
  ...process.env,
  HOME: tmpdir(), // DB 경로를 임시 디렉토리로 우회
};

function run(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", CLI, ...args], {
    env,
    cwd: tmpdir(),
  });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

describe("CLI 기본", () => {
  it("--help를 출력한다", () => {
    const { stdout, exitCode } = run(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("tk - Personal Ticket Management CLI");
    expect(stdout).toContain("Commands:");
  });

  it("--version을 출력한다", () => {
    const { stdout, exitCode } = run(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/tk v\d+\.\d+\.\d+/);
  });

  it("없는 명령어에 에러를 반환한다", () => {
    const { stderr, exitCode } = run(["nonexistent"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown command");
  });
});

describe("프로젝트 관리", () => {
  it("프로젝트 목록 조회 (빈 상태)", () => {
    const { stdout, exitCode } = run(["project", "list"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No projects");
  });

  it("별칭 p가 동작한다", () => {
    const { exitCode } = run(["p", "list"]);
    expect(exitCode).toBe(0);
  });
});

describe("이슈 명령어", () => {
  it("서브커맨드 없이 실행하면 사용법을 안내한다", () => {
    const { stderr, exitCode } = run(["issue"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage");
  });

  it("이슈 목록 조회 (--all)", () => {
    const { exitCode } = run(["issue", "list", "--all"]);
    expect(exitCode).toBe(0);
  });

  it("별칭 i가 동작한다", () => {
    const { exitCode } = run(["i", "list", "--all"]);
    expect(exitCode).toBe(0);
  });
});

describe("보드 명령어", () => {
  it("--all로 전체 보드를 표시한다", () => {
    const { stdout, exitCode } = run(["board", "--all"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("BACKLOG");
    expect(stdout).toContain("RUNNING");
    expect(stdout).toContain("DONE");
  });

  it("별칭 b가 동작한다", () => {
    const { exitCode } = run(["b", "--all"]);
    expect(exitCode).toBe(0);
  });
});
