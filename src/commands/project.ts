import type { Database } from "bun:sqlite";
import type { ProjectRow } from "../db/types";
import { parseArgs } from "../utils/parser";
import { detectProjectPath } from "../utils/project";

const SUBCOMMAND_ALIASES: Record<string, string> = {
  l: "list",
  v: "view",
};

export function projectCommand(args: string[], db: Database): void {
  if (args.length === 0) {
    showProjectHelp();
    process.exit(1);
  }

  const subcommand = SUBCOMMAND_ALIASES[args[0]!] || args[0]!;
  const rest = args.slice(1);

  switch (subcommand) {
    case "init":
      projectInit(rest, db);
      break;
    case "list":
      projectList(db);
      break;
    case "view":
      projectView(db);
      break;
    case "--help":
    case "-h":
      showProjectHelp();
      break;
    default:
      console.error(`Error: Unknown subcommand: ${args[0]}`);
      process.exit(1);
  }
}

function showProjectHelp(): void {
  console.log(`
Usage: tk project <subcommand> [options]

Subcommands:
  init  Initialize current directory as a project
  list  (l)  List all projects
  view  (v)  View current project details

Options (init):
  --key  Custom project key (default: auto-generated from directory name)
`);
}

function projectInit(args: string[], db: Database): void {
  const { flags } = parseArgs(args);

  const path = detectProjectPath();
  const name = path.split("/").pop() || "unknown";
  const key = String(
    flags.key ||
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .substring(0, 6) ||
      "TK",
  );

  // 이미 등록된 프로젝트인지 확인
  const existing = db.query("SELECT * FROM projects WHERE path = ?").get(path) as ProjectRow | null;
  if (existing) {
    console.log(`Project already registered: ${existing.name} (${existing.key})`);
    return;
  }

  // key 충돌 확인
  const keyConflict = db.query("SELECT name FROM projects WHERE key = ?").get(key) as { name: string } | null;
  if (keyConflict) {
    console.error(`Error: Key "${key}" is already used by project "${keyConflict.name}".`);
    console.error("Use --key <OTHER_KEY> to specify a different key.");
    process.exit(1);
  }

  db.query("INSERT INTO projects (name, key, path) VALUES (?, ?, ?)").run(name, key, path);
  console.log(`Project initialized: ${name}`);
  console.log(`  Key:    ${key}`);
  console.log(`  Path:   ${path}`);
  console.log(`\nCreate your first ticket: tk issue create "My first task"`);
}

function projectList(db: Database): void {
  const projects = db.query("SELECT * FROM projects ORDER BY name").all() as ProjectRow[];

  if (projects.length === 0) {
    console.log('No projects found. Run "tk project init" in a project directory.');
    return;
  }

  console.log("\n  Projects:\n");
  for (const p of projects) {
    const stats = db
      .query(`
      SELECT status, COUNT(*) as cnt FROM tickets
      WHERE project = ? AND status != 'deleted'
      GROUP BY status
    `)
      .all(p.name) as Array<{ status: string; cnt: number }>;

    const summary = stats.map((s) => `${s.cnt} ${s.status}`).join(", ") || "no tickets";
    console.log(`  ${p.name.padEnd(25)} ${p.key.padEnd(8)} ${summary}`);
  }
  console.log();
}

function projectView(db: Database): void {
  const path = detectProjectPath();
  const project = db.query("SELECT * FROM projects WHERE path = ?").get(path) as ProjectRow | null;

  if (!project) {
    console.error('Error: Not a registered project. Run "tk project init" first.');
    process.exit(1);
  }

  const stats = db
    .query(`
    SELECT status, COUNT(*) as cnt FROM tickets
    WHERE project = ? AND status != 'deleted'
    GROUP BY status
  `)
    .all(project.name) as Array<{ status: string; cnt: number }>;

  const total = stats.reduce((sum, s) => sum + s.cnt, 0);

  console.log(`
  Project: ${project.name}
  Key:     ${project.key}
  Path:    ${project.path}
  Created: ${project.created_at}
  Tickets: ${total}
  ${stats.map((s) => `  ${s.status}: ${s.cnt}`).join("\n")}
`);
}
