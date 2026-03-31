import { initDb } from "../db/schema";
import type { TicketRow } from "../db/types";
import { parseArgs } from "../utils/parser";
import { detectProjectPath } from "../utils/project";

export function boardCommand(args: string[]): void {
  const { flags } = parseArgs(args);
  const db = initDb();
  const showAll = Boolean(flags.all);
  const currentProject = showAll ? null : findCurrentProjectName(db);

  let sql = "SELECT * FROM tickets WHERE status NOT IN ('deleted', 'done', 'aborted')";
  const params: string[] = [];

  if (!showAll) {
    if (!currentProject) {
      console.error('Not a registered project. Run "tk project init" first, or use "tk board --all".');
      process.exit(1);
    }
    sql += " AND project = ?";
    params.push(currentProject);
  }

  if (flags.status) {
    sql += " AND status = ?";
    params.push(String(flags.status));
  }
  if (flags.tag || flags.t) {
    sql += " AND tags LIKE ? ESCAPE '\\'";
    const tagVal = String(flags.tag ?? flags.t).replace(/[\\%_]/g, (c) => `\\${c}`);
    params.push(`%${tagVal}%`);
  }

  sql += " ORDER BY priority ASC, updated_at DESC";
  const tickets = db.query(sql).all(...params) as TicketRow[];

  // 완료/중단 티켓도 보여주기 (최근 5개)
  let doneSql = "SELECT * FROM tickets WHERE status IN ('done', 'aborted')";
  const doneParams: string[] = [];
  if (!showAll && currentProject) {
    doneSql += " AND project = ?";
    doneParams.push(currentProject);
  }
  doneSql += " ORDER BY completed_at DESC LIMIT 5";
  const doneTickets = db.query(doneSql).all(...doneParams) as TicketRow[];

  // 상태별 분류
  const columns: Record<string, TicketRow[]> = {
    BACKLOG: [],
    RUNNING: [],
    PAUSED: [],
    "DONE/ABT": [],
  };

  for (const t of tickets) {
    const col = t.status.toUpperCase();
    if (columns[col]) columns[col]?.push(t);
  }
  for (const t of doneTickets) {
    columns["DONE/ABT"]?.push(t);
  }

  // 타이틀
  const projectName = showAll ? "All Projects" : currentProject || "Unknown";
  const totalCount = tickets.length + doneTickets.length;
  console.log(`\n  ${projectName}${" ".repeat(Math.max(1, 45 - projectName.length))}${totalCount} tickets\n`);

  // 칸반 보드 렌더링
  renderBoard(columns, showAll);
}

function renderBoard(columns: Record<string, TicketRow[]>, showAll: boolean): void {
  const colWidth = 16;
  const colNames = ["BACKLOG", "RUNNING", "PAUSED", "DONE/ABT"];

  // 헤더
  const header = colNames.map((n) => ` ${n.padEnd(colWidth - 1)}`).join("│");
  const separator = colNames.map(() => "─".repeat(colWidth)).join("┼");

  console.log(`  ┌${colNames.map(() => "─".repeat(colWidth)).join("┬")}┐`);
  console.log(`  │${header}│`);
  console.log(`  ├${separator}┤`);

  // 최대 행 수
  const maxRows = Math.max(...colNames.map((n) => columns[n]?.length || 0), 1);

  for (let row = 0; row < maxRows; row++) {
    const idLine = colNames
      .map((col) => {
        const ticket = columns[col]?.[row];
        return ticket ? ` ${ticket.id.padEnd(colWidth - 1)}` : " ".repeat(colWidth);
      })
      .join("│");

    const titleLine = colNames
      .map((col) => {
        const ticket = columns[col]?.[row];
        if (!ticket) return " ".repeat(colWidth);
        const title = ticket.title.length > colWidth - 2 ? `${ticket.title.substring(0, colWidth - 3)}…` : ticket.title;
        return ` ${title.padEnd(colWidth - 1)}`;
      })
      .join("│");

    const metaLine = colNames
      .map((col) => {
        const ticket = columns[col]?.[row];
        if (!ticket) return " ".repeat(colWidth);
        let meta = `P${ticket.priority}`;
        if (ticket.status === "aborted") meta += " ABT";
        if (showAll) meta += ` ${ticket.project.substring(0, 8)}`;
        return ` ${meta.padEnd(colWidth - 1)}`;
      })
      .join("│");

    console.log(`  │${idLine}│`);
    console.log(`  │${titleLine}│`);
    console.log(`  │${metaLine}│`);

    if (row < maxRows - 1) {
      console.log(`  │${colNames.map(() => " ".repeat(colWidth)).join("│")}│`);
    }
  }

  console.log(`  └${colNames.map(() => "─".repeat(colWidth)).join("┴")}┘\n`);
}

function findCurrentProjectName(db: import("bun:sqlite").Database): string | null {
  const path = detectProjectPath();
  const row = db.query("SELECT name FROM projects WHERE path = ?").get(path) as { name: string } | null;
  return row?.name ?? null;
}
