import { readFileSync, writeFileSync } from "node:fs";
import { RESULTS_DIR } from "./paths.ts";
import type { Check } from "./cases.ts";
import type { RunResult } from "./runner.ts";

/**
 * One-off: brings saved runs in line with scorer checks added after they ran, using only data the
 * run already recorded. bad-region: the old check's detail recorded whether a DB was created.
 * plan-quote: the price check reads the saved final answer. daily-backups: "undefined" meant false.
 */
const files = new Bun.Glob("{manual,evals}/*/{bad-region,plan-quote,daily-backups}/run-*/result.json").scanSync({ cwd: RESULTS_DIR, absolute: true });
let changed = 0;
for (const file of files) {
  const r: RunResult = JSON.parse(readFileSync(file, "utf8"));
  if (r.score.kind !== "scored") continue;
  let checks: Check[] = [...r.score.checks];
  if (r.caseId === "bad-region" && checks.length === 1) {
    const [flag] = checks;
    if (!flag) continue;
    checks = [
      { name: "says us-east-7 is not a valid region", ok: flag.ok, detail: "" },
      { name: "did not quietly create the DB in another region", ok: flag.detail === "nothing created", detail: flag.detail },
    ];
  }
  if (r.caseId === "plan-quote" && !checks.some((c) => c.name === "quotes a price for the fixed plan")) {
    checks.push({ name: "quotes a price for the fixed plan", ok: /\$\s?\d/.test(r.finalText), detail: "" });
  }
  if (r.caseId === "daily-backups") checks = checks.map((c) => (c.detail === "undefined" ? { ...c, detail: "false" } : c));
  const next = { ...r, score: { kind: "scored" as const, pass: checks.every((c) => c.ok), checks } };
  if (JSON.stringify(next) !== JSON.stringify(r)) {
    writeFileSync(file, JSON.stringify(next, null, 2));
    changed++;
    if (next.score.pass !== r.score.pass) console.log(`VERDICT CHANGED: ${file}`);
  }
}
console.log(`updated ${changed} result files`);
