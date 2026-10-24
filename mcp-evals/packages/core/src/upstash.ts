import { z } from "zod";
import type { Creds } from "./env.ts";
import { ENV_FILE, RESOURCE_PREFIX, UPSTASH_BIN } from "./paths.ts";
import { run } from "./proc.ts";

/** Thin wrapper over the official `upstash` CLI. Scorers, setup, and cleanup all go through here. */

const RedisDb = z.object({
  database_id: z.string(),
  database_name: z.string(),
  state: z.string(),
  primary_region: z.string().optional(),
  read_regions: z.array(z.string()).nullish(),
  eviction: z.boolean().optional(),
  type: z.string().optional(),
  database_type: z.string().optional(),
  budget: z.number().nullish(),
  daily_backup_enabled: z.boolean().optional(),
  endpoint: z.string().optional(),
});
export type RedisDb = z.infer<typeof RedisDb>;

const RedisSecrets = z.object({
  endpoint: z.string(),
  password: z.string(),
  rest_token: z.string(),
  read_only_rest_token: z.string(),
});
export type RedisSecrets = z.infer<typeof RedisSecrets> & { readonly restUrl: string };

export type ResourceName = string & { readonly __brand: "McpevalName" };

export function isMcpevalName(name: string): name is ResourceName {
  return name.startsWith(RESOURCE_PREFIX);
}

export class UpstashCli {
  constructor(private readonly creds: Creds) {}

  /** Secrets seen through this client, so the redactor can scrub them from transcripts. */
  readonly seenSecrets = new Set<string>();

  async json(args: readonly string[]): Promise<unknown> {
    let res = await run({ cmd: [UPSTASH_BIN, "--env-path", ENV_FILE, ...args], timeoutMs: 90_000 });
    // The Upstash API occasionally drops a request ("fetch failed", 5xx). Retry those a few times.
    for (let attempt = 1; attempt < 4 && res.exitCode !== 0 && /fetch failed|ECONNRESET|ETIMEDOUT|\b5\d\d\b/.test(res.stderr + res.stdout); attempt++) {
      await Bun.sleep(2_000 * attempt);
      res = await run({ cmd: [UPSTASH_BIN, "--env-path", ENV_FILE, ...args], timeoutMs: 90_000 });
    }
    if (res.exitCode !== 0) throw new Error(`upstash ${args.join(" ")} failed (${res.exitCode}): ${res.stderr.slice(0, 300) || res.stdout.slice(0, 300)}`);
    const text = res.stdout.trim();
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "error" in parsed) throw new Error(`upstash ${args.join(" ")}: ${JSON.stringify(parsed).slice(0, 300)}`);
    return parsed;
  }

  async listRedis(): Promise<RedisDb[]> {
    return z.array(RedisDb).parse(await this.json(["redis", "list"]));
  }

  async findRedisByName(name: string): Promise<RedisDb | undefined> {
    return (await this.listRedis()).find((d) => d.database_name === name);
  }

  /** Full record, including `daily_backup_enabled`, which `--hide-credentials` drops. Secrets are split off. */
  async getRedis(id: string): Promise<{ db: RedisDb; secrets: RedisSecrets }> {
    const raw = await this.json(["redis", "get", "--db-id", id]);
    const db = RedisDb.parse(raw);
    const s = RedisSecrets.parse(raw);
    for (const v of [s.password, s.rest_token, s.read_only_rest_token]) this.seenSecrets.add(v);
    return { db, secrets: { ...s, restUrl: `https://${s.endpoint}` } };
  }

  async createRedis(opts: { name: ResourceName; region: string; readRegions?: readonly string[] }): Promise<RedisDb> {
    const args = ["redis", "create", "--name", opts.name, "--region", opts.region];
    if (opts.readRegions?.length) args.push("--read-regions", ...opts.readRegions);
    const db = RedisDb.parse(await this.json(args));
    await this.getRedis(db.database_id); // record its secrets for redaction
    return db;
  }

  /** Refuses anything not named `mcpeval-*`. */
  async deleteRedis(db: Pick<RedisDb, "database_id" | "database_name">): Promise<void> {
    if (!isMcpevalName(db.database_name)) throw new Error(`refusing to delete non-${RESOURCE_PREFIX} database ${db.database_name}`);
    await this.json(["redis", "delete", "--db-id", db.database_id]);
  }

  /** Returns the command's `result` (the CLI prints `{ "result": ... }`). */
  async redisExec(secrets: RedisSecrets, command: readonly (string | number)[]): Promise<unknown> {
    const out = await this.json(["redis", "exec", "--db-url", secrets.restUrl, "--db-token", secrets.rest_token, "--json", JSON.stringify(command.map(String))]);
    return z.object({ result: z.unknown() }).parse(out).result;
  }

  async listVector(): Promise<{ id: string; name: string }[]> {
    return z.array(z.object({ id: z.string(), name: z.string() })).parse(await this.json(["vector", "list"]));
  }

  get email(): string {
    return this.creds.email;
  }
}
