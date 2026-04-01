import type { Database } from "bun:sqlite";
import { VALID_TRANSITIONS, type TicketRow } from "../db/types";
import { parseArgs } from "../utils/parser";
import { detectProject } from "../utils/project";

const SUBCOMMAND_ALIASES: Record<string, string> = {
  c: "create",
  l: "list",
  v: "view",
  m: "move",
  u: "update",
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
    case "update":
      issueUpdate(rest, db);
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
  update (u)  Update ticket fields (stage, step, title, priority)
  delete (d)  Soft-delete a ticket

Options (create):
  -p, --priority  Priority: 0 (urgent), 1, 2 (default), 3 (low)
  -t, --tag       Tags: comma-separated or JSON array
  --stage         Workflow stage (e.g., spec, dev, testing)
  --step          Step within stage (e.g., drafting, reviewing)

Options (update):
  --stage         Set stage (empty string to clear)
  --step          Set step (empty string to clear)
  --title         Set title
  -p, --priority  Set priority

Options (list):
  --status        Filter by status
  -p, --priority  Filter by priority
  --project       Filter by project name
  --tag, -t       Filter by tag
  --stage         Filter by stage
  --step          Filter by step
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

  const stage = flags.stage ? String(flags.stage) : null;
  const step = flags.step ? String(flags.step) : null;

  db.transaction(() => {
    db.query(`
      INSERT INTO tickets (id, project, title, priority, tags, stage, step)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, project.name, title, priority, tagsJson, stage, step);

    db.query(`
      INSERT INTO ticket_history (ticket_id, event_type, data)
      VALUES (?, 'created', ?)
    `).run(id, JSON.stringify({ title, priority, stage, step }));
  })();

  const stageSuffix = stage ? ` [${stage}${step ? `/${step}` : ""}]` : "";
  console.log(`Created: ${id} "${title}" (P${priority})${stageSuffix}`);
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
  if (flags.stage) {
    sql += " AND stage = ?";
    params.push(String(flags.stage));
  }
  if (flags.step) {
    sql += " AND step = ?";
    params.push(String(flags.step));
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
  console.log(`\n  ${"ID".padEnd(12)} ${"Title".padEnd(30)} ${"Status".padEnd(10)} ${"Stage".padEnd(10)} ${"P"}`);
  console.log(`  ${"─".repeat(12)} ${"─".repeat(30)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─"}`);
  for (const row of rows) {
    const title = row.title.length > 28 ? `${row.title.substring(0, 27)}…` : row.title;
    const stage = (row.stage || "-").padEnd(10);
    console.log(`  ${row.id.padEnd(12)} ${title.padEnd(30)} ${row.status.padEnd(10)} ${stage} ${row.priority}`);
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
  Stage:       ${ticket.stage || "-"}
  Step:        ${ticket.step || "-"}
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
  const startedAt = targetStatus === "in_progress" && !ticket.started_at ? now : ticket.started_at;
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

function issueUpdate(args: string[], db: Database): void {
  const { positional, flags } = parseArgs(args);
  const id = positional[0];
  if (!id) {
    console.error("Usage: tk issue update <ticket-id> [--stage <s>] [--step <s>] [--title <t>] [--priority <n>]");
    process.exit(1);
  }

  const ticket = db.query("SELECT * FROM tickets WHERE id = ?").get(id) as TicketRow | null;
  if (!ticket) {
    console.error(`Error: Ticket not found: ${id}`);
    process.exit(1);
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  const historyEvents: { type: string; from: string | number | null; to: string | number | null }[] = [];

  // stage: 플래그가 있으면 변경 (빈 문자열 = null 리셋)
  if ("stage" in flags) {
    const newStage = flags.stage === "" || flags.stage === true ? null : String(flags.stage);
    updates.push("stage = ?");
    params.push(newStage);
    if (newStage !== ticket.stage) {
      historyEvents.push({ type: "stage_changed", from: ticket.stage, to: newStage });
    }
  }

  if ("step" in flags) {
    const newStep = flags.step === "" || flags.step === true ? null : String(flags.step);
    updates.push("step = ?");
    params.push(newStep);
    if (newStep !== ticket.step) {
      historyEvents.push({ type: "step_changed", from: ticket.step, to: newStep });
    }
  }

  if ("title" in flags) {
    const newTitle = String(flags.title);
    if (!newTitle) {
      console.error("Error: title cannot be empty.");
      process.exit(1);
    }
    updates.push("title = ?");
    params.push(newTitle);
    if (newTitle !== ticket.title) {
      historyEvents.push({ type: "title_changed", from: ticket.title, to: newTitle });
    }
  }

  if ("priority" in flags || "p" in flags) {
    const newPriority = Number(flags.priority ?? flags.p);
    if (!Number.isInteger(newPriority) || newPriority < 0 || newPriority > 3) {
      console.error("Error: priority must be 0 (urgent), 1, 2 (default), or 3 (low).");
      process.exit(1);
    }
    updates.push("priority = ?");
    params.push(newPriority);
    if (newPriority !== ticket.priority) {
      historyEvents.push({ type: "priority_changed", from: ticket.priority, to: newPriority });
    }
  }

  if (updates.length === 0) {
    console.error("Error: Nothing to update. Use --stage, --step, --title, or --priority.");
    process.exit(1);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id); // WHERE id = ?

  db.transaction(() => {
    db.query(`UPDATE tickets SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    for (const event of historyEvents) {
      db.query(`
        INSERT INTO ticket_history (ticket_id, event_type, data)
        VALUES (?, ?, ?)
      `).run(id, event.type, JSON.stringify({ from: event.from, to: event.to }));
    }
  })();

  const changes = historyEvents.map((e) => `${e.type.replace("_changed", "")}: ${e.from ?? "-"} → ${e.to ?? "-"}`);
  console.log(`Updated: ${id}${changes.length > 0 ? ` (${changes.join(", ")})` : ""}`);
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
    running: "[IN_PROGRESS]",
    paused: "[PAUSED]",
    done: "[DONE]",
    aborted: "[ABORTED]",
    deleted: "[DELETED]",
  };
  return badges[status] ?? `[${status.toUpperCase()}]`;
}
