import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Resolve binary paths — Claude Desktop's node process may not have ~/.cargo/bin in PATH
const NST_BIN = process.env.NST_BIN || "/Users/hoho/.cargo/bin/nst";
const ASC_BIN = process.env.ASC_BIN || "asc";

interface ShellResult {
  content: Array<{ type: "text"; text: string }>;
  [key: string]: unknown;
}

interface ShellOptions {
  stdin?: string;
  timeout?: number;
}

export async function runNst(
  args: string[],
  options?: ShellOptions,
): Promise<ShellResult> {
  return runCommand(NST_BIN, args, options);
}

export async function runAsc(
  args: string[],
  options?: ShellOptions,
): Promise<ShellResult> {
  // Auto-append --output json if not present
  if (!args.some((a) => a === "--output" || a.startsWith("--output="))) {
    args.push("--output", "json");
  }
  return runCommand(ASC_BIN, args, options);
}

async function runCommand(
  binary: string,
  args: string[],
  options?: ShellOptions,
): Promise<ShellResult> {
  try {
    const { stdout } = await execFileAsync(binary, args, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: options?.timeout ?? 30_000,
      ...(options?.stdin !== undefined
        ? { input: options.stdin }
        : undefined),
    });
    return { content: [{ type: "text", text: stdout }] };
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    const message = err.stderr || err.message || "Unknown error";
    throw new Error(`${binary} command failed: ${message}`);
  }
}
