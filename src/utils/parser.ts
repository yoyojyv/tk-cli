/**
 * 간단한 CLI 인자 파서
 * --flag value, --flag=value, -f value, 위치 인자 지원
 */
export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        // --flag=value
        flags[arg.substring(2, eqIdx)] = arg.substring(eqIdx + 1);
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith("-")) {
          // --flag value
          flags[arg.substring(2)] = next;
          i++;
        } else {
          // --flag (boolean)
          flags[arg.substring(2)] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        flags[arg.substring(1)] = next;
        i++;
      } else {
        flags[arg.substring(1)] = true;
      }
    } else {
      positional.push(arg);
    }
    i++;
  }

  return { positional, flags };
}
