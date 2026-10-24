/** Agent-neutral view of one headless run. Each adapter parses its own output into this. */

export type CallVia =
  /** An Upstash MCP tool, called directly or from a code-mode script. */
  | "mcp"
  /** A shell command. `upstashCli` / `rawApi` mark Upstash access that bypassed the MCP. */
  | "shell"
  /** Anything else: file edits, reads, search, the agent's own tool discovery. */
  | "other";

export type ToolCall = {
  readonly via: CallVia;
  /** Bare tool name: `redis_create_database` for MCP, the agent's own name otherwise. */
  readonly name: string;
  readonly input: string;
  readonly output: string;
  readonly isError: boolean;
};

export type Transcript = {
  readonly calls: readonly ToolCall[];
  readonly finalText: string;
  /** Set when the agent itself failed (auth, crash, model error), as opposed to a task failure. */
  readonly agentError: string | null;
};

const CLIP = 2_000;
export const clip = (v: unknown): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v) ?? "";
  return s.length > CLIP ? `${s.slice(0, CLIP)}…[+${s.length - CLIP}]` : s;
};

/** `mcp__upstash__redis_x`, `upstash_redis_x`, `upstash-redis_x`, `upstash___redis_x` -> `redis_x`. */
export function bareMcpName(name: string): string | null {
  const m = /^(?:mcp__)?upstash(?:___|__|_|-|\.)(.+)$/.exec(name);
  return m?.[1] ?? null;
}

/** Upstash MCP tools invoked from a code-mode script (pi, droid). Tool-search queries that merely name a tool don't count. */
export function mcpToolsInScript(script: string): string[] {
  const found = new Set<string>();
  for (const m of script.matchAll(/(?:mcp__upstash__|upstash___|tools\.upstash\.)([a-z][a-z0-9_]+)\s*\(/g)) {
    if (m[1]) found.add(m[1]);
  }
  return [...found];
}

export function shellCall(command: string, output: unknown, isError: boolean): ToolCall {
  return { via: "shell", name: "shell", input: clip(command), output: clip(output), isError };
}

export function bypassKind(call: ToolCall): "upstash-cli" | "raw-api" | null {
  if (call.via !== "shell") return null;
  if (/api\.upstash\.com/.test(call.input)) return "raw-api";
  if (/(^|[\s;&|(])(npx\s+(-y\s+)?|bunx\s+|pnpm\s+dlx\s+)?upstash(@[\w.]+)?\s+(redis|vector|search|qstash|blob|team|setup|login|start-redis)\b/.test(call.input)) return "upstash-cli";
  return null;
}
