import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { z } from "zod";

export const REAL_HOME = homedir();

export function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode: 0o600 });
}

export function writeJson(path: string, value: unknown): void {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Exposes one of Leo's real auth files inside the fake home. Symlinked so token refreshes land in the real file. */
export function linkFromRealHome(fakeHome: string, rel: string): void {
  const target = join(fakeHome, rel);
  mkdirSync(dirname(target), { recursive: true });
  if (!existsSync(target)) symlinkSync(join(REAL_HOME, rel), target);
}

/** Parses JSONL, keeping only lines that match the schema. Agent streams mix many event kinds. */
export function jsonlEvents<S extends z.ZodTypeAny>(stdout: string, schema: S): z.infer<S>[] {
  const out: z.infer<S>[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    const parsed = schema.safeParse(value);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Text from an MCP-style content value: a string, or an array of `{text}` blocks. */
export function contentText(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(contentText).join("\n");
  if (v && typeof v === "object") {
    if ("text" in v) return contentText(v.text);
    if ("content" in v) return contentText(v.content);
  }
  return JSON.stringify(v) ?? "";
}

/** Env for an agent subprocess: Leo's env minus anything that would make the child think it is nested in T3 or Claude Code. */
export function childEnv(home: string, extra: Readonly<Record<string, string>>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_|T3_|CODEX_|CURSOR_|OPENCODE|PI_|DEVIN_|FACTORY_|UPSTASH_|XDG_)/.test(k)) continue;
    env[k] = v;
  }
  return { ...env, HOME: home, ...extra };
}
