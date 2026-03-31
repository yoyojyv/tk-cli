import type { Database } from "bun:sqlite";
import { VALID_TRANSITIONS, type TicketRow } from "../db/types";
import { parseArgs } from "../utils/parser";
import { detectProject } from "../utils/project";

const SUBCOMMAND_ALIASES: Record<string, string> = {
  c: "create",
  l: "list",
  v: "view",
  m: "move",
  d: "delete",
};

export function issueCommand(args: string[], db: Database): void {
  if (args.length === 0) {
    console.error("Usage: tk issue <create|list|view|move|delete> [options]");
    process.exit(1);
  }

  const subcommand = SUBCOMMAND_ALIASES[args[0]!] || args[0]!;
  const rest = args.slice(1);

  switch (subcommand) {
    case "create":
      issueCreate(rest, db);
      break;
    case "list":
      issueList(rest, db);
      break;
    case "view":
      issueView(rest, db);
      break;
    case "move":
      issueMove(rest, db);
      break;
    case "delete":
      issueDelete(rest, db);
      break;
    case "--help":
    case "-h":
      showIssueHelp();
      break;
    default:
      console.error(`Error: Unknown subcommand: ${args[0]}`);
      process.exit(1);
  }
}

function showIssueHelp(): void {
  console.log(`
Usage: tk issue <subcommand> [options]

Subcommands:
  create (c)  Create a new ticket
  list   (l)  List tickets
  view   (v)  View ticket details
  move   (m)  Move ticket to a new status
  delete (d)  Soft-delete a ticket

Options (create):
  -p, --priority  Priority: 0 (urgent), 1, 2 (default), 3 (low)
  -t, --tag       Tags: comma-separated or JSON array

Options (list):
  --status        Filter by status
  -p, --priority  Filter by priority
  --project       Filter by project name
  --tag, -t       Filter by tag
  --all           Show all projects
  --json          Output as JSON
`);
}

function issueCreate(args: string[], db: Database): void {
  const { positional, flags } = parseArgs(args);
  const title = positional[0];
  if (!title) {
    console.error("Usage: tk issue create <title> [-p priority] [-t tags]");
    process.exit(1);
  }

  const project = detectProject(db);
  if (!project) {
    console.error('Error: No project found. Run "tk project init" first.');
    process.exit(1);
  }

  const priority = Number(flags.p ?? flags.priority ?? 2);
  if (!Number.isInteger(priority) || priority < 0 || priority > 3) {
    console.error("Error: priority must be 0 (urgent), 1, 2 (default), or 3 (low).");
    process.exit(1);
  }

  const tags = flags.t ?? flags.tag ?? "[]";
  let tagsJson: string;
  if (typeof tags === "string" && !tags.startsWith("[")) {
    tagsJson = JSON.stringify(tags.split(","));
  } else if (typeof tags === "string") {
    try {
      JSON.parse(tags); // 유효성 검증
      tagsJson = tags;
    } catch {
      console.error('Error: invalid JSON for tags. Use -t bug,urgent or -t \'["bug","urgent"]\'');
      process.exit(1);
    }
  } else {
    tagsJson = "[]";
  }

  // 다음 티켓 번호 생성 (MAX 기반 — hard delete에도 안전)
  // 키 길이 + 하이픈(1) 이후의 숫자 부분을 추출 (키에 하이픈이 있어도 안전)
  const row = db
    .query("SELECT MAX(CAST(SUBSTR(id, LENGTH(?) + 2) AS INTEGER)) as max_num FROM tickets WHERE project = ?")
    .get(project.key, project.name) as { max_num: number | null };
  const num = String((row.max_num ?? 0) + 1).padStart(4, "0");
  const id = `${project.key}-${num}`;

  db.transaction(() => {
    db.query(`
      INSERT INTO tickets (id, project, title, priority, tags)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, project.name, title, priority, tagsJson);

    db.query(`
      INSERT INTO ticket_history (ticket_id, event_type, data)
      VALUES (?, 'created', ?)
    `).run(id, JSON.stringify({ title, priority }));
  })();

  console.log(`Created: ${id} "${title}" (P${priority})`);
}

function issueList(args: string[], db: Database): void {
  const { flags } = parseArgs(args);

  let sql = "SELECT * FROM tickets WHERE status != 'deleted'";
  const params: string[] = [];

  if (flags.status) {
    sql += " AND status = ?";
    params.push(String(flags.status));
  }
  if (flags.priority || flags.p) {
    sql += " AND priority = ?";
    params.push(String(flags.priority ?? flags.p));
  }
  if (flags.project) {
    sql += " AND project = ?";
    params.push(String(flags.project));
  } else if (!flags.all) {
    const project = detectProject(db);
    if (!project) {
      console.error('Error: Not a registered project. Run "tk project init" first, or use --all.');
      process.exit(1);
    }
    sql += " AND project = ?";
    params.push(project.name);
  }
  if (flags.tag || flags.t) {
    sql += " AND EXISTS (SELECT 1 FROM json_each(tags) WHERE json_each.value = ?)";
    params.push(String(flags.tag ?? flags.t));
  }

  sql += " ORDER BY priority ASC, updated_at DESC";

  const rows = db.query(sql).all(...params) as TicketRow[];

  if (flags.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log("No tickets found.");
    return;
  }

  // 테이블 출력
  console.log(`\n  ${"ID".padEnd(12)} ${"Title".padEnd(30)} ${"Status".padEnd(10)} ${"P"}`);
  console.log(`  ${"─".repeat(12)} ${"─".repeat(30)} ${"─".repeat(10)} ${"─"}`);
  for (const row of rows) {
    const title = row.title.length > 28 ? `${row.title.substring(0, 27)}…` : row.title;
    console.log(`  ${row.id.padEnd(12)} ${title.padEnd(30)} ${row.status.padEnd(10)} ${row.priority}`);
  }
  console.log();
}

function issueView(args: string[], db: Database): void {
  const { positional } = parseArgs(args);
  const id = positional[0];
  if (!id) {
    console.error("Usage: tk issue view <ticket-id>");
    process.exit(1);
  }

  const ticket = db.query("SELECT * FROM tickets WHERE id = ?").get(id) as TicketRow | null;
  if (!ticket) {
    console.error(`Error: Ticket not found: ${id}`);
    process.exit(1);
  }

  console.log(`
  ${ticket.id}  ${statusBadge(ticket.status)}  P${ticket.priority}
  ${ticket.title}
  ${"─".repeat(50)}
  Project:     ${ticket.project}
  Tags:        ${ticket.tags}
  Created:     ${ticket.created_at}
  Updated:     ${ticket.updated_at}
  Started:     ${ticket.started_at || "-"}
  Completed:   ${ticket.completed_at || "-"}
  Description: ${ticket.description || "-"}
`);
}

function issueMove(args: string[], db: Database): void {
  const { positional } = parseArgs(args);
  const [id, targetStatus] = positional;
  if (!id || !targetStatus) {
    console.error("Usage: tk issue move <ticket-id> <status>");
    console.error("Statuses: backlog, running, paused, done, aborted");
    process.exit(1);
  }

  const ticket = db.query("SELECT * FROM tickets WHERE id = ?").get(id) as TicketRow | null;
  if (!ticket) {
    console.error(`Error: Ticket not found: ${id}`);
    process.exit(1);
  }

  const allowed = VALID_TRANSITIONS[ticket.status];
  if (!allowed) {
    console.error(`Error: ${id} is '${ticket.status}'. Terminal state, cannot move.`);
    process.exit(1);
  }
  if (!allowed.includes(targetStatus)) {
    console.error(`Error: ${id} is '${ticket.status}'. Cannot move to '${targetStatus}'.`);
    console.error(`Allowed: ${allowed.join(", ")}`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const startedAt = targetStatus === "running" && !ticket.started_at ? now : ticket.started_at;
  const pausedAt = targetStatus === "paused" ? now : ticket.paused_at;
  const completedAt = targetStatus === "done" || targetStatus === "aborted" ? now : ticket.completed_at;

  try {
    db.transaction(() => {
      const result = db
        .query(
          `UPDATE tickets
           SET status = ?, updated_at = ?, started_at = ?, paused_at = ?, completed_at = ?
           WHERE id = ? AND status = ?`,
        )
        .run(targetStatus, now, startedAt, pausedAt, completedAt, id, ticket.status);

      if (result.changes === 0) {
        throw new Error("concurrent_update");
      }

      db.query(`
        INSERT INTO ticket_history (ticket_id, event_type, data)
        VALUES (?, ?, ?)
      `).run(id, targetStatus, JSON.stringify({ from: ticket.status, to: targetStatus }));
    })();
  } catch (e) {
    if (e instanceof Error && e.message === "concurrent_update") {
      console.error(`Error: ${id} status changed concurrently. Please retry.`);
      process.exit(1);
    }
    throw e;
  }

  console.log(`${id}: ${ticket.status} → ${targetStatus}`);
}

function issueDelete(args: string[], db: Database): void {
  const { positional } = parseArgs(args);
  const id = positional[0];
  if (!id) {
    console.error("Usage: tk issue delete <ticket-id>");
    process.exit(1);
  }

  const ticket = db.query("SELECT * FROM tickets WHERE id = ?").get(id) as TicketRow | null;
  if (!ticket) {
    console.error(`Error: Ticket not found: ${id}`);
    process.exit(1);
  }
  if (ticket.status === "deleted") {
    console.error(`Error: Ticket already deleted: ${id}`);
    process.exit(1);
  }

  db.query("UPDATE tickets SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").run(id);
  db.query("INSERT INTO ticket_history (ticket_id, event_type) VALUES (?, 'deleted')").run(id);

  console.log(`Deleted: ${id} (soft delete)`);
}

// Helpers

function statusBadge(status: string): string {
  const badges: Record<string, string> = {
    backlog: "[BACKLOG]",
    running: "[RUNNING]",
    paused: "[PAUSED]",
    done: "[DONE]",
    aborted: "[ABORTED]",
    deleted: "[DELETED]",
  };
  return badges[status] ?? `[${status.toUpperCase()}]`;
}
