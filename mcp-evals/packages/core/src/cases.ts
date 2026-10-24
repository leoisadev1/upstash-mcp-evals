import { ArgError } from "./errors.ts";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Transcript } from "./transcript.ts";
import type { RedisDb, RedisSecrets, ResourceName, UpstashCli } from "./upstash.ts";
import { EVALS_DIR } from "./paths.ts";

/**
 * A case is a folder under `evals/`:
 *   PROMPT.md   frontmatter + the prompt. `{{db}}` (alias `{{name}}`) expands to this run's unique `mcpeval-<case>-<tag>` name.
 *   setup.ts    optional; default export creates starting state (and returns DBs to clean up).
 *   EVAL.ts     optional; default export scores the run through the `upstash` CLI.
 *   fixture/    optional; copied into the workspace before the agent starts.
 */

const Frontmatter = z.object({
  title: z.string(),
  /** Which brief idea this came from, for the sheet. */
  brief: z.string(),
  /** Part of the permanent phase 2 suite. */
  phase2: z.boolean().default(false),
  timeoutSec: z.number().int().positive().default(420),
  /** What a good answer looks like, for humans reading the sheet. */
  expect: z.string(),
});

export type CaseId = string & { readonly __brand: "CaseId" };

export type Case = z.infer<typeof Frontmatter> & {
  readonly id: CaseId;
  readonly dir: string;
  readonly promptTemplate: string;
  readonly fixtureDir: string | null;
  readonly hasSetup: boolean;
  readonly hasEval: boolean;
};

export type Check = { readonly name: string; readonly ok: boolean; readonly detail: string };

/** `na` means the case has no deterministic scorer; the sheet then relies on the transcript review. */
export type Score = { readonly kind: "scored"; readonly pass: boolean; readonly checks: readonly Check[] } | { readonly kind: "na"; readonly reason: string };

export type RunContext = {
  readonly upstash: UpstashCli;
  readonly workspace: string;
  /** Unique `mcpeval-<case>-<run>` name for this run's main database. */
  readonly dbName: ResourceName;
};

export type SetupResult = {
  /** The pre-made database, when the case starts from one. */
  readonly db: (RedisDb & { readonly secrets: RedisSecrets }) | null;
};

export type SetupFn = (ctx: RunContext) => Promise<SetupResult>;
export type EvalFn = (ctx: RunContext & { readonly state: SetupResult; readonly transcript: Transcript }) => Promise<Check[]>;

function splitFrontmatter(text: string): { data: unknown; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error("PROMPT.md needs --- frontmatter ---");
  return { data: parseYaml(m[1] ?? ""), body: (m[2] ?? "").trim() };
}

export function loadCases(): Case[] {
  return readdirSync(EVALS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = join(EVALS_DIR, d.name);
      const { data, body } = splitFrontmatter(readFileSync(join(dir, "PROMPT.md"), "utf8"));
      const fm = Frontmatter.parse(data);
      const fixture = join(dir, "fixture");
      return {
        ...fm,
        id: d.name as CaseId,
        dir,
        promptTemplate: body,
        fixtureDir: existsSync(fixture) ? fixture : null,
        hasSetup: existsSync(join(dir, "setup.ts")),
        hasEval: existsSync(join(dir, "EVAL.ts")),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function selectCases(all: readonly Case[], csv: string | undefined, phase2Only: boolean): Case[] {
  const pool = phase2Only ? all.filter((c) => c.phase2) : [...all];
  if (!csv || csv === "all") return pool;
  return csv.split(",").map((id) => {
    const c = all.find((x) => x.id === id);
    if (!c) throw new ArgError(`unknown case "${id}". Known: ${all.map((x) => x.id).join(", ")}`);
    return c;
  });
}

export async function loadSetup(c: Case): Promise<SetupFn | null> {
  if (!c.hasSetup) return null;
  const mod: { default: SetupFn } = await import(join(c.dir, "setup.ts"));
  return mod.default;
}

export async function loadEval(c: Case): Promise<EvalFn | null> {
  if (!c.hasEval) return null;
  const mod: { default: EvalFn } = await import(join(c.dir, "EVAL.ts"));
  return mod.default;
}

export function renderPrompt(c: Case, dbName: string): string {
  return c.promptTemplate.replaceAll("{{db}}", dbName).replaceAll("{{name}}", dbName);
}
