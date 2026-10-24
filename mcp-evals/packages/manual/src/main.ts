import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ArgError } from "@mcp-evals/core/errors";
import { AGENTS, parseAgentList } from "@mcp-evals/core/agents/index";
import { loadCases, selectCases } from "@mcp-evals/core/cases";
import { loadCreds } from "@mcp-evals/core/env";
import { BASELINE_DIR } from "@mcp-evals/core/paths";
import { writeMissingTools, writeSetupReport, writeSheet } from "@mcp-evals/core/report";
import { baselineEntry } from "@mcp-evals/core/runner";
import { MAX_CONCURRENCY, sweep } from "@mcp-evals/core/sweep";
import { listResources, otherBaselineFile } from "@mcp-evals/core/products";
import { UpstashCli } from "@mcp-evals/core/upstash";

const PHASE = "manual";

const HELP = `bun run manual [options]

Phase 1. Runs each agent headless on every phase 1 prompt (once each by default),
then writes report/sheet.csv, report/sheet.md, report/setup.md and report/missing-tools.auto.md.

  --agents a,b      ${Object.keys(AGENTS).join(",")} (default: all)
  --cases x,y       case ids from evals/ (default: all)
  --runs N          runs per agent x case (default 1)
  --concurrency N   parallel runs, max ${MAX_CONCURRENCY} (default ${MAX_CONCURRENCY})
  --model M         override the model (only with a single agent)
  --baseline        snapshot existing Redis DBs to results/baseline/ and exit
  --report          rebuild the reports from results/ without running anything
  --list            print agents and cases and exit
  --json            machine-readable output

Exit codes: 0 ok, 1 error or aborted by the baseline guard, 2 bad arguments.`;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      agents: { type: "string" },
      cases: { type: "string" },
      runs: { type: "string", default: "1" },
      concurrency: { type: "string", default: String(MAX_CONCURRENCY) },
      model: { type: "string" },
      baseline: { type: "boolean", default: false },
      report: { type: "boolean", default: false },
      list: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  const print = (human: string, data: unknown) => console.log(values.json ? JSON.stringify(data, null, 2) : human);
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const allCases = loadCases();
  if (values.list) {
    print(
      [...Object.values(AGENTS).map((a) => `agent ${a.id.padEnd(9)} ${a.defaultModel}  setup: ${a.upstashSetupFlag ?? "none (configured by hand)"}`), ...allCases.map((c) => `case  ${c.id.padEnd(16)} ${c.phase2 ? "[phase2] " : ""}${c.title}`)].join("\n"),
      { agents: Object.values(AGENTS).map((a) => ({ id: a.id, model: a.defaultModel, upstashSetupFlag: a.upstashSetupFlag })), cases: allCases.map(({ id, title, phase2 }) => ({ id, title, phase2 })) },
    );
    return 0;
  }
  if (values.baseline) {
    const upstash = new UpstashCli(loadCreds());
    const written: string[] = [];
    const redisFile = join(BASELINE_DIR, "redis.json");
    mkdirSync(BASELINE_DIR, { recursive: true });
    if (!existsSync(redisFile)) {
      writeFileSync(redisFile, JSON.stringify((await upstash.listRedis()).map(baselineEntry), null, 2));
      written.push(redisFile);
    }
    const otherFile = otherBaselineFile();
    if (!existsSync(otherFile)) {
      writeFileSync(otherFile, JSON.stringify(await listResources(upstash), null, 2));
      written.push(otherFile);
    }
    print(written.length ? `Saved ${written.join(", ")}.` : "Baselines already exist; leaving them alone.", { written });
    return 0;
  }
  if (!values.report) {
    const agents = parseAgentList(values.agents);
    if (values.model && agents.length !== 1) throw new ArgError("--model needs exactly one --agents entry");
    const runs = Number(values.runs);
    const concurrency = Number(values.concurrency);
    if (!Number.isInteger(runs) || runs < 1) throw new ArgError("--runs must be a positive integer");
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new ArgError("--concurrency must be a positive integer");
    const { results, aborted } = await sweep({
      phase: PHASE,
      combos: agents.map((agent) => ({ agent, model: values.model ?? agent.defaultModel })),
      cases: selectCases(allCases, values.cases, false),
      runs,
      concurrency,
    });
    if (values.json) console.log(JSON.stringify({ runs: results.length, aborted }, null, 2));
    if (aborted) return 1;
  }
  const sheet = writeSheet(PHASE);
  writeSetupReport(PHASE);
  writeMissingTools(PHASE);
  if (!values.json) console.log(`Wrote report/sheet.{csv,md} (${sheet.rows} rows), report/setup.md, report/missing-tools.auto.md`);
  return 0;
}


main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(e instanceof ArgError ? 2 : 1);
  },
);
