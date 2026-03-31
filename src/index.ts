#!/usr/bin/env bun

import { boardCommand } from "./commands/board";
import { issueCommand } from "./commands/issue";
import { projectCommand } from "./commands/project";

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

Examples:
  tk issue create "Add search autocomplete"
  tk issue list --status running
  tk issue move APP-001 done
  tk board
  tk board --all
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
    console.log("tk v0.1.0");
    process.exit(0);
  }

  const command = ALIASES[args[0]!] || args[0]!;
  const rest = args.slice(1);

  switch (command) {
    case "issue":
      issueCommand(rest);
      break;
    case "project":
      projectCommand(rest);
      break;
    case "board":
      boardCommand(rest);
      break;
    default:
      console.error(`Unknown command: ${args[0]}`);
      console.error('Run "tk --help" for usage.');
      process.exit(1);
  }
}

main();
