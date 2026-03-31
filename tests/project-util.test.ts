import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../src/db/schema";
import { detectProject, detectProjectPath } from "../src/utils/project";

describe("detectProjectPath", () => {
  it("git 저장소 내에서 git root를 반환한다", () => {
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
