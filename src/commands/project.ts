import { parseArgs } from "../utils/parser";
import { initDb } from "../db/schema";

export function projectCommand(args: string[]): void {
  if (args.length === 0) {
    console.error('Usage: tk project <init|list|view> [options]');
    process.exit(1);
  }

  const subcommand = args[0] === "l" ? "list" : args[0] === "v" ? "view" : args[0]!;
  const rest = args.slice(1);

  switch (subcommand) {
    case "init":
      projectInit(rest);
      break;
    case "list":
      projectList(rest);
      break;
    case "view":
      projectView(rest);
      break;
    default:
      console.error(`Unknown subcommand: ${args[0]}`);
      process.exit(1);
  }
}

function projectInit(args: string[]): void {
  const { flags } = parseArgs(args);
  const db = initDb();

  // git root 감지
  let path = process.cwd();
  let name = "";
  try {
    const result = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]);
    const gitRoot = result.stdout.toString().trim();
    if (gitRoot) {
      path = gitRoot;
      name = gitRoot.split("/").pop() || "unknown";
    }
  } catch {
    name = path.split("/").pop() || "unknown";
  }

  const prefix = String(flags.prefix || name.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 6) || "TK");

  // 이미 등록된 프로젝트인지 확인
  const existing = db.query("SELECT * FROM projects WHERE path = ?").get(path);
  if (existing) {
    console.log(`Project already registered: ${name} (${prefix})`);
    return;
  }

  db.query("INSERT INTO projects (name, prefix, path) VALUES (?, ?, ?)").run(name, prefix, path);
  console.log(`Project initialized: ${name}`);
  console.log(`  Prefix: ${prefix}`);
  console.log(`  Path:   ${path}`);
  console.log(`\nCreate your first ticket: tk issue create "My first task"`);
}

function projectList(args: string[]): void {
  const db = initDb();
  const projects = db.query("SELECT * FROM projects ORDER BY name").all() as Array<{
    name: string;
    prefix: string;
    path: string;
    created_at: string;
  }>;

  if (projects.length === 0) {
    console.log('No projects found. Run "tk project init" in a project directory.');
    return;
  }

  console.log("\n  Projects:\n");
  for (const p of projects) {
    const stats = db.query(`
      SELECT status, COUNT(*) as cnt FROM tickets
      WHERE project = ? AND status != 'deleted'
      GROUP BY status
    `).all(p.name) as Array<{ status: string; cnt: number }>;

    const summary = stats.map(s => `${s.cnt} ${s.status}`).join(", ") || "no tickets";
    console.log(`  ${p.name.padEnd(25)} ${p.prefix.padEnd(8)} ${summary}`);
  }
  console.log();
}

function projectView(args: string[]): void {
  const db = initDb();

  let path = process.cwd();
  try {
    const result = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]);
    const gitRoot = result.stdout.toString().trim();
    if (gitRoot) path = gitRoot;
  } catch {}

  const project = db.query("SELECT * FROM projects WHERE path = ?").get(path) as {
    name: string;
    prefix: string;
    path: string;
    created_at: string;
  } | null;

  if (!project) {
    console.error('Not a registered project. Run "tk project init" first.');
    process.exit(1);
  }

  const stats = db.query(`
    SELECT status, COUNT(*) as cnt FROM tickets
    WHERE project = ? AND status != 'deleted'
    GROUP BY status
  `).all(project.name) as Array<{ status: string; cnt: number }>;

  const total = stats.reduce((sum, s) => sum + s.cnt, 0);

  console.log(`
  Project: ${project.name}
  Prefix:  ${project.prefix}
  Path:    ${project.path}
  Created: ${project.created_at}
  Tickets: ${total}
  ${stats.map(s => `  ${s.status}: ${s.cnt}`).join("\n")}
`);
}
