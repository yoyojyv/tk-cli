import type { Database } from "bun:sqlite";
import type { ProjectRow } from "../db/types";

/**
 * git root 또는 cwd 기반으로 현재 프로젝트를 감지한다.
 */
export function detectProject(db: Database): ProjectRow | null {
  const path = detectProjectPath();
  return db.query("SELECT * FROM projects WHERE path = ?").get(path) as ProjectRow | null;
}

/**
 * git root 또는 cwd 경로를 반환한다.
 */
export function detectProjectPath(): string {
  try {
    const result = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]);
    const gitRoot = result.stdout.toString().trim();
    if (gitRoot) return gitRoot;
  } catch {
    // git이 없으면 cwd로 fallback
  }
  return process.cwd();
}
