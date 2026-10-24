import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parseAgentList } from "@mcp-evals/core/agents/index";
import { loadCases, selectCases } from "@mcp-evals/core/cases";
import { loadCreds } from "@mcp-evals/core/env";
import { ArgError } from "@mcp-evals/core/errors";
import { REPORT_DIR } from "@mcp-evals/core/paths";
import { run } from "@mcp-evals/core/proc";
import { loadBaseline, runOne } from "@mcp-evals/core/runner";

const HELP = `bun run record-live --agent <id> --case <id> --name <file-stem>

Runs one case live with the agent's human-readable output inside asciinema, scores it like
any other run, and writes report/recordings/<name>.{cast,gif,mp4}. Agents with a live mode:
codex, opencode, cursor. Results go to results/live/.`;

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { agent: { type: "string" }, case: { type: "string" }, name: { type: "string" }, help: { type: "boolean", short: "h" } } });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (!values.agent || !values.case || !values.name) throw new ArgError("--agent, --case and --name are required");
  const [agent] = parseAgentList(values.agent);
  const [testCase] = selectCases(loadCases(), values.case, false);
  if (!agent || !testCase) throw new ArgError("need exactly one agent and one case");
  const dir = join(REPORT_DIR, "recordings");
  mkdirSync(dir, { recursive: true });
  const cast = join(dir, `${values.name}.cast`);
  const result = await runOne({
    phase: "live", agent, model: agent.defaultModel, testCase, run: 1, creds: loadCreds(), baseline: loadBaseline(),
    log: (m) => console.error(m), recordCast: cast,
  });
  if (result.harnessError) throw new Error(`recording failed: ${result.harnessError}`);
  const gif = join(dir, `${values.name}.gif`);
  const mp4 = join(dir, `${values.name}.mp4`);
  for (const cmd of [
    ["agg", "--font-size", "15", "--theme", "monokai", "--idle-time-limit", "2", "--speed", "1.5", cast, gif],
    ["ffmpeg", "-y", "-loglevel", "error", "-i", gif, "-movflags", "faststart", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", mp4],
  ]) {
    const res = await run({ cmd, timeoutMs: 300_000 });
    if (res.exitCode !== 0) throw new Error(`${cmd[0]} failed: ${res.stderr.slice(0, 200)}`);
  }
  console.log(`${values.name}: ${result.harnessError ?? "recorded"} -> ${mp4}. Live runs aren't scored; the scored runs are in report/sheet.md.`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(e instanceof ArgError ? 2 : 1);
  },
);
