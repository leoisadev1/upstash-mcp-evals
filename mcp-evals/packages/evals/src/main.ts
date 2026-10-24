import { parseArgs } from "node:util";
import { ArgError } from "@mcp-evals/core/errors";
import { AGENTS, parseAgentList } from "@mcp-evals/core/agents/index";
import { loadCases, selectCases } from "@mcp-evals/core/cases";
import { writeScoreboard } from "@mcp-evals/core/report";
import { MAX_CONCURRENCY, sweep, type Combo } from "@mcp-evals/core/sweep";

const PHASE = "evals";

const HELP = `bun run evals [options]

Phase 2. Runs the permanent evals (cases with phase2: true) N times per agent x model,
scores each through the upstash CLI, then writes report/scoreboard.{md,html} and results/summary.md.

  --agents a,b      ${Object.keys(AGENTS).join(",")} (default: all)
  --model M         model override (only with a single agent)
  --matrix          each agent's default model plus its extra models (e.g. claude + claude-haiku-5-5)
  --cases x,y       eval ids (default: every phase2 case)
  --runs N          runs per eval x combo (default 3)
  --concurrency N   parallel runs, max ${MAX_CONCURRENCY} (default ${MAX_CONCURRENCY})
  --report          rebuild the scoreboard from results/ without running anything
  --list            print the evals and combos that would run, and exit
  --json            machine-readable output

Exit codes: 0 ok, 1 error or aborted by the baseline guard, 2 bad arguments.`;


async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      agents: { type: "string" },
      agent: { type: "string" },
      model: { type: "string" },
      matrix: { type: "boolean", default: false },
      cases: { type: "string" },
      runs: { type: "string", default: "3" },
      concurrency: { type: "string", default: String(MAX_CONCURRENCY) },
      report: { type: "boolean", default: false },
      list: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.report) {
    writeScoreboard(PHASE);
    console.log(values.json ? JSON.stringify({ wrote: ["report/scoreboard.md", "report/scoreboard.html", "results/summary.md"] }) : "Wrote report/scoreboard.{md,html} and results/summary.md");
    return 0;
  }
  const agents = parseAgentList(values.agents ?? values.agent);
  if (values.model && agents.length !== 1) throw new ArgError("--model needs exactly one agent");
  const combos: Combo[] = agents.flatMap((agent) =>
    values.model ? [{ agent, model: values.model }] : [agent.defaultModel, ...(values.matrix ? agent.extraModels : [])].map((model) => ({ agent, model })),
  );
  const cases = selectCases(loadCases(), values.cases, true);
  const runs = Number(values.runs);
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(runs) || runs < 1) throw new ArgError("--runs must be a positive integer");
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new ArgError("--concurrency must be a positive integer");

  if (values.list) {
    const plan = { evals: cases.map((c) => c.id), combos: combos.map((c) => `${c.agent.id}@${c.model}`), runs, total: cases.length * combos.length * runs };
    console.log(values.json ? JSON.stringify(plan, null, 2) : `${plan.total} runs: ${plan.evals.length} evals x ${plan.combos.length} combos x ${runs}\n  evals:  ${plan.evals.join(", ")}\n  combos: ${plan.combos.join(", ")}`);
    return 0;
  }

  const { results, aborted } = await sweep({ phase: PHASE, combos, cases, runs, concurrency });
  writeScoreboard(PHASE);
  if (values.json) console.log(JSON.stringify({ runs: results.length, aborted }, null, 2));
  else console.log(`${results.length} runs done. Wrote report/scoreboard.{md,html} and results/summary.md`);
  return aborted ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(e instanceof ArgError ? 2 : 1);
  },
);
