import { describe, expect, it, beforeEach } from "bun:test";
import { createTestEnv, run, seedProject, REAL_TMPDIR } from "./helpers";

describe("board", () => {
  let env: Record<string, string>;
  let home: string;

  beforeEach(() => {
    ({ env, home } = createTestEnv("tk-board"));
    seedProject(home, "test", "TEST", REAL_TMPDIR);
    run(["issue", "create", "Task A"], env);
    run(["issue", "create", "Task B"], env);
    run(["issue", "move", "TEST-0001", "running"], env);
  });

  it("--all로 칸반 보드를 렌더링한다", () => {
    const { stdout, exitCode } = run(["board", "--all"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("BACKLOG");
    expect(stdout).toContain("RUNNING");
    expect(stdout).toContain("PAUSED");
    expect(stdout).toContain("DONE/ABT");
    expect(stdout).toContain("TEST-0001");
    expect(stdout).toContain("TEST-0002");
  });

  it("done 티켓이 DONE/ABT 컬럼에 표시된다", () => {
    run(["issue", "move", "TEST-0001", "done"], env);
    const { stdout } = run(["board", "--all"], env);
    expect(stdout).toContain("TEST-0001");
    expect(stdout).toContain("DONE/ABT");
  });

  it("aborted 티켓이 ABT 마크와 함께 표시된다", () => {
    run(["issue", "move", "TEST-0002", "aborted"], env);
    const { stdout } = run(["board", "--all"], env);
    expect(stdout).toContain("ABT");
  });

  it("프로젝트 미등록 상태에서 --all 없이 실행하면 에러를 반환한다", () => {
    const noProjectEnv = createTestEnv("tk-board-noproj");
    const { stderr, exitCode } = run(["board"], noProjectEnv.env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Not a registered project");
  });

  it("티켓이 없으면 빈 보드를 표시한다", () => {
    const emptyEnv = createTestEnv("tk-board-empty");
    seedProject(emptyEnv.home, "empty", "EMP", REAL_TMPDIR);
    const { stdout, exitCode } = run(["board", "--all"], emptyEnv.env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("0 tickets");
  });

  it("ticket count를 정확히 표시한다", () => {
    const { stdout } = run(["board", "--all"], env);
    expect(stdout).toContain("2 tickets");
  });

  it("--tag 필터가 정확 매칭으로 동작한다", () => {
    // Task A에 "ui" 태그를 주고 생성
    const tagEnv = createTestEnv("tk-board-tag");
    seedProject(tagEnv.home, "tagtest", "TAG", REAL_TMPDIR);
    run(["issue", "create", "UI work", "-t", "ui"], tagEnv.env);
    run(["issue", "create", "UI bug fix", "-t", "ui-fix"], tagEnv.env);

    const { stdout } = run(["board", "--all", "--tag", "ui"], tagEnv.env);
    expect(stdout).toContain("TAG-0001");
    expect(stdout).not.toContain("TAG-0002");
  });
});
