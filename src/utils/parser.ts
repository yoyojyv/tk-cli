/**
 * 간단한 CLI 인자 파서
 * --flag value, --flag=value, -f value, 위치 인자 지원
 */
export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export interface ParseArgsOptions {
  /** 항상 boolean으로 처리할 플래그 이름 목록 (예: ["json", "verbose"]) */
  booleanFlags?: string[];
}

export function parseArgs(args: string[], options?: ParseArgsOptions): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const boolSet = new Set(options?.booleanFlags);

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        // --flag=value
        flags[arg.substring(2, eqIdx)] = arg.substring(eqIdx + 1);
      } else {
        const name = arg.substring(2);
        const next = args[i + 1];
        if (!boolSet.has(name) && next && !next.startsWith("-")) {
          // --flag value
          flags[name] = next;
          i++;
        } else {
          // --flag (boolean)
          flags[name] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const name = arg.substring(1);
      const next = args[i + 1];
      if (!boolSet.has(name) && next && !next.startsWith("-")) {
        flags[name] = next;
        i++;
      } else {
        flags[name] = true;
      }
    } else {
      positional.push(arg);
    }
    i++;
  }

  return { positional, flags };
}
