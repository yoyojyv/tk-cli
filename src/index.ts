#!/usr/bin/env bun

import { boardCommand } from "./commands/board";
import { issueCommand } from "./commands/issue";
import { projectCommand } from "./commands/project";
import { initDb } from "./db/schema";
import pkg from "../package.json";

const ALIASES: Record<string, string> = {
  i: "issue",
  p: "project",
  b: "board",
};

function showHelp(): void {
  console.log(`
tk - Personal Ticket Management CLI

Usage: tk <command> [subcommand] [options]

Commands:
  issue   (i)   Manage tickets (create, list, view, move, delete)
  project (p)   Manage projects (init, list, view)
  board   (b)   Show kanban board

Options:
  --help, -h    Show help
  --version     Show version

Board Options:
  --all           Show all projects
  --by stage      Group by stage instead of status
  --status <s>    Filter by status
  --tag, -t <tag> Filter by tag

Examples:
  tk issue create "Add search autocomplete" --stage spec
  tk issue update APP-001 --stage dev --step coding
  tk issue list --status in_progress
  tk issue move APP-001 done
  tk board
  tk board --by stage
  tk project list
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    showHelp();
    process.exit(0);
  }

  if (args[0] === "--version") {
    console.log(`tk v${pkg.version}`);
    process.exit(0);
  }

  const command = ALIASES[args[0]!] || args[0]!;
  const rest = args.slice(1);

  const db = initDb();
  try {
    switch (command) {
      case "issue":
        issueCommand(rest, db);
        break;
      case "project":
        projectCommand(rest, db);
        break;
      case "board":
        boardCommand(rest, db);
        break;
      default:
        console.error(`Error: Unknown command: ${args[0]}`);
        console.error('Run "tk --help" for usage.');
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

main();
