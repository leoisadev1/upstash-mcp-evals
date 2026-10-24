import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { MCP_URL } from "../paths.ts";
import { clip, shellCall, type ToolCall } from "../transcript.ts";
import type { Agent } from "./types.ts";
import { REAL_HOME, childEnv, contentText, linkFromRealHome, readJsonFile, writeJson } from "./util.ts";

/** T3 installs Devin from the ACP registry; there is no `devin` on PATH. */
const DEVIN_BIN = join(REAL_HOME, ".t3/tools/devin/3000.11.3/linux-x86_64/bin/devin");
const EXPORT_FILE = "devin-export.json";

const Export = z.object({
  steps: z.array(
    z.object({
      source: z.string(),
      message: z.unknown().optional(),
      tool_calls: z.array(z.object({ tool_call_id: z.string(), function_name: z.string(), arguments: z.record(z.string(), z.unknown()) })).nullish(),
      observation: z.object({ results: z.array(z.object({ source_call_id: z.string().nullish(), content: z.unknown() })) }).nullish(),
    }),
  ),
});

export const devin: Agent = {
  id: "devin",
  label: "Devin CLI",
  bin: DEVIN_BIN,
  defaultModel: "claude-opus-5-5-medium",
  extraModels: [],
  upstashSetupFlag: null,

  async configure({ paths, creds }) {
    writeJson(join(paths.workspace, ".devin/mcp_config.local.json"), {
      mcpServers: { upstash: { url: MCP_URL, transport: "http", headers: { Authorization: creds.basicAuth } } },
    });
    linkFromRealHome(paths.home, ".local/share/devin/credentials.toml");
    return [
      { by: "manual", what: "`upstash setup` has no Devin option. Wrote the remote server with an Authorization header by hand", file: ".devin/mcp_config.local.json" },
      { by: "manual", what: "`devin mcp add upstash --url … -H \"Authorization: Basic …\"` writes the same file but then blocks for ~5 min on a browser OAuth login it doesn't need" },
      { by: "manual", what: "Pass `--respect-workspace-trust false`; print mode cannot show the trust prompt" },
    ];
  },

  command({ paths, prompt, model }) {
    return {
      cmd: [DEVIN_BIN, "-p", prompt, "--model", model, "--permission-mode", "dangerous", "--respect-workspace-trust", "false", "--export", join(paths.outDir, EXPORT_FILE)],
      env: childEnv(paths.home, {}),
    };
  },

  parse({ stdout, outDir }) {
    const file = join(outDir, EXPORT_FILE);
    if (!existsSync(file)) return { calls: [], finalText: stdout.trim(), agentError: "no export file" };
    const exp = Export.parse(readJsonFile(file));
    const results = new Map<string, unknown>();
    for (const s of exp.steps) for (const r of s.observation?.results ?? []) if (r.source_call_id) results.set(r.source_call_id, r.content);
    const calls: ToolCall[] = [];
    let finalText = "";
    for (const s of exp.steps) {
      if (s.source !== "agent") continue;
      const text = typeof s.message === "string" ? s.message : "";
      if (text) finalText = text;
      for (const tc of s.tool_calls ?? []) {
        const output = contentText(results.get(tc.tool_call_id) ?? "");
        const isError = /returned an error|^Error|"isError":\s*true/.test(output);
        if (tc.function_name === "mcp_call_tool" && tc.arguments.server_name === "upstash") {
          calls.push({ via: "mcp", name: String(tc.arguments.tool_name), input: clip(tc.arguments.arguments), output: clip(output), isError });
        } else if (tc.function_name === "exec") {
          calls.push(shellCall(String(tc.arguments.command ?? ""), output, isError));
        } else {
          calls.push({ via: "other", name: tc.function_name, input: clip(tc.arguments), output: clip(output), isError });
        }
      }
    }
    return { calls, finalText: finalText || stdout.trim(), agentError: null };
  },
};
