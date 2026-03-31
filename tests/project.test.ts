import { describe, expect, it } from "bun:test";
import { mkdirSync } from "node:fs";
import { createTestEnv, run, seedProject, REAL_TMPDIR } from "./helpers";

describe("project init", () => {
  it("프로젝트를 초기화한다", () => {
    const { env } = createTestEnv("tk-proj-init");
    const projectDir = `${REAL_TMPDIR}/tk-proj-${Date.now()}`;
    mkdirSync(projectDir, { recursive: true });

    const { stdout, exitCode } = run(["project", "init"], env, projectDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Project initialized");
  });

  it("--key로 커스텀 프로젝트 키를 설정한다", () => {
    const { env } = createTestEnv("tk-proj-key");
    const projectDir = `${REAL_TMPDIR}/tk-proj-key-${Date.now()}`;
    mkdirSync(projectDir, { recursive: true });

    const { stdout, exitCode } = run(["project", "init", "--key", "MYKEY"], env, projectDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("MYKEY");
  });

  it("이미 등록된 프로젝트는 중복 등록하지 않는다", () => {
    const { env } = createTestEnv("tk-proj-dup");
    const projectDir = `${REAL_TMPDIR}/tk-proj-dup-${Date.now()}`;
    mkdirSync(projectDir, { recursive: true });

    run(["project", "init"], env, projectDir);
    const { stdout, exitCode } = run(["project", "init"], env, projectDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("already registered");
  });

  it("다른 프로젝트가 같은 key를 사용하면 에러를 반환한다", () => {
    const { env } = createTestEnv("tk-proj-keydup");
    const dirA = `${REAL_TMPDIR}/tk-proj-a-${Date.now()}`;
    const dirB = `${REAL_TMPDIR}/tk-proj-b-${Date.now()}`;
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });

    run(["project", "init", "--key", "SAME"], env, dirA);
    const { stderr, exitCode } = run(["project", "init", "--key", "SAME"], env, dirB);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("already used");
  });
});

describe("project list", () => {
  it("프로젝트 목록과 통계를 표시한다", () => {
    const { env, home } = createTestEnv("tk-proj-list");
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
    const { env } = createTestEnv("tk-proj-empty");
    const { stdout, exitCode } = run(["project", "list"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No projects");
  });
});

describe("project view", () => {
  it("프로젝트 상세 정보를 출력한다", () => {
    const { env, home } = createTestEnv("tk-proj-view");
    seedProject(home, "myapp", "APP", REAL_TMPDIR);

    run(["issue", "create", "Task 1"], env);

    const { stdout, exitCode } = run(["project", "view"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("myapp");
    expect(stdout).toContain("APP");
    expect(stdout).toContain("Tickets: 1");
  });

  it("미등록 경로에서 실행하면 에러를 반환한다", () => {
    const { env } = createTestEnv("tk-proj-noreg");
    const { stderr, exitCode } = run(["project", "view"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Not a registered project");
  });
});

describe("project aliases", () => {
  it("p l이 project list와 동일하게 동작한다", () => {
    const { env } = createTestEnv("tk-proj-alias1");
    const { exitCode } = run(["p", "l"], env);
    expect(exitCode).toBe(0);
  });

  it("p v가 project view를 실행한다", () => {
    const { env } = createTestEnv("tk-proj-alias2");
    const { stderr, exitCode } = run(["p", "v"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Not a registered project");
  });
});
