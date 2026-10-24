import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { BASELINE_DIR, RESOURCE_PREFIX } from "./paths.ts";
import type { UpstashCli } from "./upstash.ts";

/**
 * Non-Redis Upstash resources: Vector and Search indexes, Blob buckets, QStash schedules.
 * Listed, protected and cleaned up with the same rules as Redis: the harness only ever
 * deletes things whose name (or, for a schedule, destination URL) contains `mcpeval-`.
 */

export type ResourceKind = "vector" | "search" | "blob" | "qstash-schedule";
export type Resource = { readonly kind: ResourceKind; readonly id: string; readonly name: string; readonly region?: string };

export const QSTASH_REGIONS = ["eu-central-1", "us-east-1"] as const;
export type QstashRegion = (typeof QSTASH_REGIONS)[number];

const Named = z.array(z.object({ id: z.string(), name: z.string() }).passthrough());
const QstashUser = z.object({ id: z.string(), region: z.string(), token: z.string(), read_only_token: z.string().optional() }).passthrough();
const Schedule = z.object({ scheduleId: z.string(), destination: z.string(), cron: z.string().optional() }).passthrough();
export type QstashSchedule = z.infer<typeof Schedule>;

export function qstashBaseUrl(region: string): string {
  return `https://qstash-${region}.upstash.io`;
}

/** QStash REST access for one region. Both tokens are registered for redaction. */
export async function qstashAuth(upstash: UpstashCli, region: QstashRegion): Promise<{ url: string; token: string } | null> {
  const users = z.array(z.object({ id: z.string(), region: z.string() }).passthrough()).parse(await upstash.json(["qstash", "list"]));
  const user = users.find((u) => u.region === region);
  if (!user) return null;
  const full = QstashUser.parse(await upstash.json(["qstash", "get", "--qstash-id", user.id]));
  upstash.seenSecrets.add(full.token);
  if (full.read_only_token) upstash.seenSecrets.add(full.read_only_token);
  return { url: qstashBaseUrl(region), token: full.token };
}

export async function qstashFetch(auth: { url: string; token: string }, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${auth.url}${path}`, { signal: AbortSignal.timeout(30_000), ...init, headers: { Authorization: `Bearer ${auth.token}`, ...(init.headers ?? {}) } });
}

export async function listSchedules(upstash: UpstashCli): Promise<Resource[]> {
  const out: Resource[] = [];
  for (const region of QSTASH_REGIONS) {
    const auth = await qstashAuth(upstash, region);
    if (!auth) continue;
    const res = await qstashFetch(auth, "/v2/schedules");
    if (!res.ok) throw new Error(`qstash schedules ${region}: ${res.status}`);
    for (const s of z.array(Schedule).parse(await res.json())) out.push({ kind: "qstash-schedule", id: s.scheduleId, name: s.destination, region });
  }
  return out;
}

/** Every non-Redis resource in the account. */
export async function listResources(upstash: UpstashCli): Promise<Resource[]> {
  const vector = Named.parse(await upstash.json(["vector", "list"])).map((v) => ({ kind: "vector" as const, id: v.id, name: v.name }));
  const search = Named.parse(await upstash.json(["search", "list"])).map((v) => ({ kind: "search" as const, id: v.id, name: v.name }));
  const blob = Named.parse(await upstash.json(["blob", "ls"])).map((v) => ({ kind: "blob" as const, id: v.id, name: v.name }));
  return [...vector, ...search, ...blob, ...(await listSchedules(upstash))];
}

/** A run name (`mcpeval-<case>-<6 char tag>`) as a whole URL path segment. */
const RUN_NAME_SEGMENT = /\/mcpeval-[a-z0-9-]+-[a-z0-9]{6}(?=[/?#]|$)/;

/**
 * Harness-made: named `mcpeval-*`, or for a QStash schedule a destination whose path has a run name
 * as a whole segment, and never something recorded in the baseline.
 */
export function isOurs(r: Resource): boolean {
  if (loadOtherBaseline().some((b) => b.kind === r.kind && b.id === r.id)) return false;
  return r.kind === "qstash-schedule" ? RUN_NAME_SEGMENT.test(r.name) : r.name.startsWith(RESOURCE_PREFIX);
}

/** Deletes one harness-made resource. Refuses anything else. */
export async function deleteResource(upstash: UpstashCli, r: Resource): Promise<void> {
  if (!isOurs(r)) throw new Error(`refusing to delete non-${RESOURCE_PREFIX} ${r.kind} ${r.name}`);
  switch (r.kind) {
    case "vector":
      await upstash.json(["vector", "delete", "--index-id", r.id]);
      return;
    case "search":
      await upstash.json(["search", "delete", "--index-id", r.id]);
      return;
    case "blob":
      await upstash.json(["blob", "rb", "--force", "--quiet", r.name]);
      return;
    case "qstash-schedule": {
      const region = QSTASH_REGIONS.find((x) => x === r.region);
      const auth = region ? await qstashAuth(upstash, region) : null;
      if (!auth) throw new Error(`no QStash user in ${r.region}`);
      const res = await qstashFetch(auth, `/v2/schedules/${r.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`delete schedule ${r.id}: ${res.status}`);
      return;
    }
    default: {
      const _exhaustive: never = r.kind;
      throw new Error(`unknown kind ${String(_exhaustive)}`);
    }
  }
}

const BASELINE_FILE = join(BASELINE_DIR, "other.json");

const BaselineFile = z.array(z.object({ kind: z.enum(["vector", "search", "blob", "qstash-schedule"]), id: z.string(), name: z.string(), region: z.string().optional() }));

/** Pre-existing non-Redis resources. Required: without it nothing would protect them. */
export function loadOtherBaseline(): Resource[] {
  if (!existsSync(BASELINE_FILE)) throw new Error(`No baseline at ${BASELINE_FILE}. Run \`bun run manual --baseline\` first.`);
  return BaselineFile.parse(JSON.parse(readFileSync(BASELINE_FILE, "utf8")));
}

export function otherBaselineFile(): string {
  return BASELINE_FILE;
}

/** Ids of pre-existing resources that are gone. */
export function missingFromBaseline(baseline: readonly Resource[], now: readonly Resource[]): Resource[] {
  return baseline.filter((b) => !now.some((n) => n.kind === b.kind && n.id === b.id));
}
