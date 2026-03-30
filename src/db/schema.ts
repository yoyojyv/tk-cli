import { Database } from "bun:sqlite";

const SCHEMA_VERSION = 1;

const MIGRATIONS: Record<number, string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      name TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'backlog',
      priority INTEGER NOT NULL DEFAULT 2,
      tags TEXT DEFAULT '[]',
      pipeline TEXT,
      estimated_hours REAL,
      started_at TEXT,
      completed_at TEXT,
      paused_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project) REFERENCES projects(name),
      CHECK (status IN ('backlog', 'running', 'paused', 'done', 'aborted', 'deleted')),
      CHECK (priority BETWEEN 0 AND 3)
    )`,
    `CREATE TABLE IF NOT EXISTS ticket_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      data TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project)`,
    `CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)`,
    `CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority)`,
    `CREATE INDEX IF NOT EXISTS idx_history_ticket ON ticket_history(ticket_id)`,
  ],
};

export function getDbPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  return `${home}/.config/jerry-tickets/tickets.db`;
}

export function initDb(): Database {
  const dbPath = getDbPath();

  // 디렉토리 생성
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  require("fs").mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  // 마이그레이션 실행
  migrate(db);

  return db;
}

function migrate(db: Database): void {
  // schema_version 테이블이 없으면 첫 실행
  const hasVersionTable = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get();

  let currentVersion = 0;
  if (hasVersionTable) {
    const row = db.query("SELECT MAX(version) as v FROM schema_version").get() as { v: number } | null;
    currentVersion = row?.v ?? 0;
  }

  // 필요한 마이그레이션 실행
  for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
    const statements = MIGRATIONS[v];
    if (!statements) continue;

    db.transaction(() => {
      for (const sql of statements) {
        db.exec(sql);
      }
      db.exec(`INSERT INTO schema_version (version) VALUES (${v})`);
    })();
  }
}
