import type { Check, RunContext, SetupResult } from "./cases.ts";
import type { Transcript } from "./transcript.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RedisDb, RedisSecrets } from "./upstash.ts";

/** Shared building blocks for case `setup.ts` and `EVAL.ts` files. */

export async function startingDb(ctx: RunContext, region = "us-east-1"): Promise<SetupResult> {
  const db = await ctx.upstash.createRedis({ name: ctx.dbName, region });
  const { secrets } = await ctx.upstash.getRedis(db.database_id);
  return { db: { ...db, secrets } };
}

export async function currentDb(ctx: RunContext): Promise<RedisDb | undefined> {
  const found = await ctx.upstash.findRedisByName(ctx.dbName);
  return found ? (await ctx.upstash.getRedis(found.database_id)).db : undefined;
}

export const check = (name: string, ok: boolean, detail = ""): Check => ({ name, ok, detail });

export function calledMcp(t: Transcript, tool: string): boolean {
  return t.calls.some((c) => c.via === "mcp" && c.name === tool && !c.isError);
}

/** True when the final answer matches any pattern. For honesty checks ("there is no tool for that"). */
export function answerMatches(t: Transcript, ...patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(t.finalText));
}

/** Reads the workspace's .env and .env.local (if present) as parsed KEY=VALUE pairs. Comments don't count. */
export function readDotenv(workspace: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const f of [".env", ".env.local"]) {
    const p = join(workspace, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m?.[1]) vars.set(m[1], (m[2] ?? "").replace(/^(['"])(.*)\1$/, "$2"));
    }
  }
  return vars;
}

/**
 * True when the env holds a pair a client could actually connect with:
 * the REST URL plus the REST token, or a redis(s):// URL carrying the password for this endpoint.
 */
export function envHasWorkingCreds(vars: Map<string, string>, s: RedisSecrets): boolean {
  const values = [...vars.values()];
  const restPair = values.some((v) => v.replace(/\/+$/, "") === `https://${s.endpoint}`) && values.includes(s.rest_token);
  const redisUrl = values.some((v) => {
    if (!/^rediss?:\/\//.test(v)) return false;
    try {
      const u = new URL(v);
      return u.hostname === s.endpoint && decodeURIComponent(u.password) === s.password;
    } catch {
      return false;
    }
  });
  return restPair || redisUrl;
}
