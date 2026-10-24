import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT } from "@mcp-evals/core/paths";
import type { RunResult } from "@mcp-evals/core/runner";
import type { Transcript } from "@mcp-evals/core/transcript";

/** Prints a saved run as a paced terminal session, for asciinema. Usage: bun replay.ts <run-dir> */

const dir = process.argv[2];
if (!dir) {
  console.error("usage: bun packages/manual/src/replay.ts <results/.../run-N>");
  process.exit(2);
}
const result: RunResult = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
const transcript: Transcript = JSON.parse(readFileSync(join(dir, "transcript.json"), "utf8"));
const prompt = readFileSync(join(dir, "prompt.md"), "utf8").trim();

const c = { dim: "\x1b[2m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m", cyan: "\x1b[36m", yellow: "\x1b[33m", reset: "\x1b[0m" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const wrap = (s: string, width = 96) => s.split("\n").flatMap((line) => line.match(new RegExp(`.{1,${width}}(\\s|$)`, "g")) ?? [""]).map((l) => l.trimEnd());
const out = (s = "") => process.stdout.write(`${s}\n`);

async function typeOut(s: string) {
  for (const ch of s) {
    process.stdout.write(ch);
    await sleep(18);
  }
  out();
}

out(`${c.dim}Replay of a headless run: ${relative(ROOT, dir)}${c.reset}`);
out(`${c.bold}${result.agent}${c.reset} ${c.dim}(${result.model})${c.reset}  case ${c.bold}${result.caseId}${c.reset}`);
out();
process.stdout.write(`${c.cyan}> ${c.reset}`);
await typeOut(prompt);
out();
await sleep(600);

const shown = transcript.calls.filter((x) => x.via !== "other" || !/^(ToolSearch|getMcpTools|mcp_list_tools|read|Read|todo)/i.test(x.name));
for (const call of shown.slice(0, 14)) {
  const label = call.via === "mcp" ? `${c.green}upstash MCP${c.reset} ${call.name}` : call.via === "shell" ? `${c.yellow}shell${c.reset}` : `${c.dim}${call.name}${c.reset}`;
  const input = call.input.replace(/\s+/g, " ").slice(0, 150);
  out(`⏺ ${label} ${c.dim}${input}${c.reset}`);
  await sleep(500);
  const lines = wrap(call.output.replace(/\\n/g, "\n"), 90).filter(Boolean).slice(0, 3);
  for (const l of lines) out(`  ${call.isError ? c.red : c.dim}⎿ ${l}${c.reset}`);
  out();
  await sleep(700);
}
if (shown.length > 14) out(`${c.dim}… ${shown.length - 14} more tool calls${c.reset}\n`);

for (const l of wrap(transcript.finalText).slice(0, 18)) {
  out(l);
  await sleep(90);
}
out();
if (result.score.kind === "scored") {
  const color = result.score.pass ? c.green : c.red;
  out(`${color}${c.bold}${result.score.pass ? "PASS" : "FAIL"}${c.reset} ${c.dim}(checked through the upstash CLI, ${Math.round(result.durationMs / 1000)}s)${c.reset}`);
  for (const ch of result.score.checks) out(`  ${ch.ok ? `${c.green}✓` : `${c.red}✗`}${c.reset} ${ch.name}${ch.detail ? ` ${c.dim}${ch.detail}${c.reset}` : ""}`);
}
await sleep(2500);
