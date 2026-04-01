import { describe, expect, it, beforeEach } from "bun:test";
import { createTestEnv, run, seedProject, openTestDb, REAL_TMPDIR } from "./helpers";

// ────────────────────────────────────────────────────────────
// issue create with stage/step
// ────────────────────────────────────────────────────────────
describe("issue create — stage/step", () => {
  let env: Record<string, string>;
  let home: string;

  beforeEach(() => {
    ({ env, home } = createTestEnv("tk-stage"));
    seedProject(home, "Test Project", "TEST", REAL_TMPDIR);
  });

  it("--stage와 --step으로 티켓을 생성한다", () => {
    const { stdout, exitCode } = run(
      ["issue", "create", "검색 API", "--stage", "spec", "--step", "drafting"],
      env,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("TEST-0001");
    expect(stdout).toContain("[spec/drafting]");

    const db = openTestDb(home);
    const row = db.query("SELECT stage, step FROM tickets WHERE id = 'TEST-0001'").get() as {
      stage: string | null;
      step: string | null;
    };
    db.close();
    expect(row.stage).toBe("spec");
    expect(row.step).toBe("drafting");
  });

  it("stage/step 없이 생성하면 null이다", () => {
    const { exitCode } = run(["issue", "create", "버그 수정"], env);
    expect(exitCode).toBe(0);

    const db = openTestDb(home);
    const row = db.query("SELECT stage, step FROM tickets WHERE id = 'TEST-0001'").get() as {
      stage: string | null;
      step: string | null;
    };
    db.close();
    expect(row.stage).toBeNull();
    expect(row.step).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// issue update
// ────────────────────────────────────────────────────────────
describe("issue update", () => {
  let env: Record<string, string>;
  let home: string;

  beforeEach(() => {
    ({ env, home } = createTestEnv("tk-update"));
    seedProject(home, "Test Project", "TEST", REAL_TMPDIR);
    run(["issue", "create", "원본 티켓", "--stage", "research", "--step", "gathering"], env);
  });

  it("stage를 변경한다", () => {
    const { stdout, exitCode } = run(["issue", "update", "TEST-0001", "--stage", "dev"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("stage: research → dev");

    const db = openTestDb(home);
    const row = db.query("SELECT stage FROM tickets WHERE id = 'TEST-0001'").get() as { stage: string | null };
    db.close();
    expect(row.stage).toBe("dev");
  });

  it("step을 변경한다", () => {
    const { stdout, exitCode } = run(["issue", "update", "TEST-0001", "--step", "coding"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("step: gathering → coding");

    const db = openTestDb(home);
    const row = db.query("SELECT step FROM tickets WHERE id = 'TEST-0001'").get() as { step: string | null };
    db.close();
    expect(row.step).toBe("coding");
  });

  it("stage와 step을 동시에 변경한다", () => {
    const { stdout, exitCode } = run(
      ["issue", "update", "TEST-0001", "--stage", "dev", "--step", "coding"],
      env,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("stage: research → dev");
    expect(stdout).toContain("step: gathering → coding");
  });

  it("title을 수정한다", () => {
    const { stdout, exitCode } = run(["issue", "update", "TEST-0001", "--title", "새 제목"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("title: 원본 티켓 → 새 제목");
  });

  it("priority를 수정한다", () => {
    const { stdout, exitCode } = run(["issue", "update", "TEST-0001", "--priority", "0"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("priority: 2 → 0");
  });

  it("stage를 빈 문자열로 null 리셋한다", () => {
    const { exitCode } = run(["issue", "update", "TEST-0001", "--stage", ""], env);
    expect(exitCode).toBe(0);

    const db = openTestDb(home);
    const row = db.query("SELECT stage FROM tickets WHERE id = 'TEST-0001'").get() as { stage: string | null };
    db.close();
    expect(row.stage).toBeNull();
  });

  it("history에 stage_changed 이벤트가 기록된다", () => {
    run(["issue", "update", "TEST-0001", "--stage", "spec"], env);

    const db = openTestDb(home);
    const rows = db
      .query("SELECT event_type, data FROM ticket_history WHERE ticket_id = 'TEST-0001' AND event_type = 'stage_changed'")
      .all() as { event_type: string; data: string }[];
    db.close();

    expect(rows.length).toBe(1);
    const data = JSON.parse(rows[0]!.data);
    expect(data.from).toBe("research");
    expect(data.to).toBe("spec");
  });

  it("history에 step_changed 이벤트가 기록된다", () => {
    run(["issue", "update", "TEST-0001", "--step", "reviewing"], env);

    const db = openTestDb(home);
    const rows = db
      .query("SELECT event_type, data FROM ticket_history WHERE ticket_id = 'TEST-0001' AND event_type = 'step_changed'")
      .all() as { event_type: string; data: string }[];
    db.close();

    expect(rows.length).toBe(1);
    const data = JSON.parse(rows[0]!.data);
    expect(data.from).toBe("gathering");
    expect(data.to).toBe("reviewing");
  });

  it("변경할 필드 없으면 에러를 반환한다", () => {
    const { stderr, exitCode } = run(["issue", "update", "TEST-0001"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Nothing to update");
  });

  it("존재하지 않는 티켓은 에러를 반환한다", () => {
    const { stderr, exitCode } = run(["issue", "update", "NONE-999", "--stage", "dev"], env);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("NONE-999");
  });
});

// ────────────────────────────────────────────────────────────
// issue list — stage/step 필터
// ────────────────────────────────────────────────────────────
describe("issue list — stage/step 필터", () => {
  let env: Record<string, string>;

  beforeEach(() => {
    ({ env } = createTestEnv("tk-list-stage"));
    seedProject(env.HOME!, "Test Project", "TEST", REAL_TMPDIR);
    run(["issue", "create", "A", "--stage", "spec", "--step", "reviewing"], env);
    run(["issue", "create", "B", "--stage", "dev", "--step", "coding"], env);
    run(["issue", "create", "C"], env); // no stage/step
  });

  it("--stage로 필터링한다", () => {
    const { stdout, exitCode } = run(["issue", "list", "--stage", "spec", "--all"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("TEST-0001");
    expect(stdout).not.toContain("TEST-0002");
    expect(stdout).not.toContain("TEST-0003");
  });

  it("--step으로 필터링한다", () => {
    const { stdout, exitCode } = run(["issue", "list", "--step", "coding", "--all"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("TEST-0002");
    expect(stdout).not.toContain("TEST-0001");
  });

  it("--stage + --status 복합 필터", () => {
    run(["issue", "move", "TEST-0001", "in_progress"], env);
    const { stdout, exitCode } = run(
      ["issue", "list", "--stage", "spec", "--status", "in_progress", "--all"],
      env,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("TEST-0001");
  });

  it("테이블 출력에 Stage 컬럼이 포함된다", () => {
    const { stdout } = run(["issue", "list", "--all"], env);
    expect(stdout).toContain("Stage");
    expect(stdout).toContain("spec");
    expect(stdout).toContain("dev");
  });
});

// ────────────────────────────────────────────────────────────
// issue view — stage/step 표시
// ────────────────────────────────────────────────────────────
describe("issue view — stage/step 표시", () => {
  let env: Record<string, string>;

  beforeEach(() => {
    ({ env } = createTestEnv("tk-view-stage"));
    seedProject(env.HOME!, "Test Project", "TEST", REAL_TMPDIR);
    run(["issue", "create", "View test", "--stage", "spec", "--step", "reviewing"], env);
  });

  it("view에 Stage와 Step이 표시된다", () => {
    const { stdout, exitCode } = run(["issue", "view", "TEST-0001"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Stage:       spec");
    expect(stdout).toContain("Step:        reviewing");
  });
});

// ────────────────────────────────────────────────────────────
// JSON 출력
// ────────────────────────────────────────────────────────────
describe("JSON 출력 — stage/step 포함", () => {
  let env: Record<string, string>;

  beforeEach(() => {
    ({ env } = createTestEnv("tk-json-stage"));
    seedProject(env.HOME!, "Test Project", "TEST", REAL_TMPDIR);
    run(["issue", "create", "JSON test", "--stage", "dev", "--step", "coding"], env);
  });

  it("--json 출력에 stage, step 필드가 포함된다", () => {
    const { stdout, exitCode } = run(["issue", "list", "--all", "--json"], env);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed[0].stage).toBe("dev");
    expect(parsed[0].step).toBe("coding");
  });
});

// ────────────────────────────────────────────────────────────
// board --by stage
// ────────────────────────────────────────────────────────────
describe("board --by stage", () => {
  let env: Record<string, string>;

  beforeEach(() => {
    ({ env } = createTestEnv("tk-board-stage"));
    seedProject(env.HOME!, "Test Project", "TEST", REAL_TMPDIR);
    run(["issue", "create", "A", "--stage", "spec"], env);
    run(["issue", "create", "B", "--stage", "dev", "--step", "coding"], env);
    run(["issue", "create", "C"], env); // no stage
  });

  it("stage 기준 칸반 보드를 렌더링한다", () => {
    const { stdout, exitCode } = run(["board", "--by", "stage"], env);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("spec");
    expect(stdout).toContain("dev");
    expect(stdout).toContain("(no stage)");
  });

  it("null stage 티켓이 (no stage) 컬럼에 표시된다", () => {
    const { stdout } = run(["board", "--by", "stage"], env);
    expect(stdout).toContain("(no stage)");
    expect(stdout).toContain("TEST-0003");
  });
});
