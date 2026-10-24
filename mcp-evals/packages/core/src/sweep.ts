import type { Agent } from "./agents/index.ts";
import type { Case } from "./cases.ts";
import { loadCreds } from "./env.ts";
import { pool } from "./proc.ts";
import { loadOtherBaseline } from "./products.ts";
import { GuardError, loadBaseline, runOne, type RunResult } from "./runner.ts";

export type Combo = { readonly agent: Agent; readonly model: string };

export const MAX_CONCURRENCY = 4;

/** Runs every case x combo x run, at most 4 at a time. Stops launching new runs if the baseline guard trips. */
export async function sweep(opts: {
  phase: string;
  combos: readonly Combo[];
  cases: readonly Case[];
  runs: number;
  concurrency: number;
}): Promise<{ results: RunResult[]; aborted: string | null }> {
  const creds = loadCreds();
  const baseline = loadBaseline();
  loadOtherBaseline(); // fail fast if the non-Redis baseline is missing
  const jobs = opts.cases.flatMap((testCase) => opts.combos.flatMap((combo) => Array.from({ length: opts.runs }, (_, i) => ({ ...combo, testCase, run: i + 1 }))));
  const log = (msg: string) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
  log(`${jobs.length} runs, concurrency ${opts.concurrency}`);
  let aborted: string | null = null;
  const results = await pool(jobs, Math.min(opts.concurrency, MAX_CONCURRENCY), async (job) => {
    if (aborted) return null;
    try {
      return await runOne({ phase: opts.phase, agent: job.agent, model: job.model, testCase: job.testCase, run: job.run, creds, baseline, log });
    } catch (e) {
      if (e instanceof GuardError) aborted = e.message;
      else log(`✖ ${job.agent.id} ${job.testCase.id}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  });
  if (aborted) log(`ABORTED: ${aborted}`);
  return { results: results.filter((r): r is RunResult => r !== null), aborted };
}
