import { Database } from "bun:sqlite";
import { mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../src/db/schema";

export const CLI = join(import.meta.dir, "..", "src", "index.ts");

export const REAL_TMPDIR = (() => {
  try {
    return realpathSync(tmpdir());
  } catch {
    return tmpdir();
  }
})();

export function createTestEnv(prefix = "tk-test"): { env: Record<string, string>; home: string } {
  const home = join(REAL_TMPDIR, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(home, { recursive: true });
  return {
    home,
    env: { ...process.env, HOME: home } as Record<string, string>,
  };
}

export function run(
  args: string[],
  env: Record<string, string>,
  cwd?: string,
): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", CLI, ...args], {
    env,
    cwd: cwd ?? REAL_TMPDIR,
  });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

export function seedProject(home: string, name: string, key: string, path: string): void {
  const dbDir = join(home, ".config", "jerry-tickets");
  mkdirSync(dbDir, { recursive: true });
  const db = new Database(join(dbDir, "tickets.db"), { create: true });
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  db.query("INSERT INTO projects (name, key, path) VALUES (?, ?, ?)").run(name, key, path);
  db.close();
}

export function openTestDb(home: string): Database {
  return new Database(join(home, ".config", "jerry-tickets", "tickets.db"));
}
