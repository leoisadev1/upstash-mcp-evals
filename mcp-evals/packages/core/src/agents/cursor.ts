import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { clip, shellCall, type ToolCall } from "../transcript.ts";
import type { Agent } from "./types.ts";
import { REAL_HOME, childEnv, contentText, jsonlEvents, readJsonFile, writeJson } from "./util.ts";

/** Cursor's CLI login lives in a per-account XDG dir on this box (see ~/.config/cursor/accounts). */
const CURSOR_XDG = join(REAL_HOME, ".config/cursor/accounts/account-1/xdg");
/**
 * Pinned: the 2026.10.22 auto-update replaced `cursor-agent` and `agent` with a shim that
 * only forwards to the Cursor IDE, which this headless box doesn't have.
 */
const CURSOR_BIN = join(REAL_HOME, ".local/share/cursor-agent/versions/2026.10.01-e373342/cursor-agent");

const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool_call"), subtype: z.string(), tool_call: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("result"), result: z.string().optional(), is_error: z.boolean().optional() }),
]);
const Payload = z.object({
  args: z.record(z.string(), z.unknown()).optional(),
  result: z.union([z.object({ success: z.unknown() }), z.object({ error: z.unknown() }), z.object({ rejected: z.unknown() })]).optional(),
});
const McpArgs = z.object({ providerIdentifier: z.string(), toolName: z.string(), args: z.unknown() });

export const cursor: Agent = {
  id: "cursor",
  label: "Cursor CLI (agent)",
  bin: CURSOR_BIN,
  defaultModel: "grok-4.7-medium",
  extraModels: [],
  upstashSetupFlag: "--cursor",

  async configure({ paths, creds }) {
    const file = join(paths.workspace, ".cursor/mcp.json");
    const cfg = z.object({ mcpServers: z.record(z.string(), z.record(z.string(), z.unknown())) }).parse(readJsonFile(file));
    cfg.mcpServers.upstash = { ...cfg.mcpServers.upstash, headers: { Authorization: creds.basicAuth } };
    writeJson(file, cfg);
    mkdirSync(join(paths.home, ".cursor"), { recursive: true });
    copyFileSync(join(REAL_HOME, ".cursor/cli-config.json"), join(paths.home, ".cursor/cli-config.json"));
    return [
      { by: "manual", what: "Add `headers.Authorization: Basic …` to the upstash server; setup writes the URL only", file: ".cursor/mcp.json" },
      { by: "manual", what: "Pass `--approve-mcps --trust` (headless runs cannot answer the MCP approval and workspace trust prompts)" },
    ];
  },

  command({ paths, prompt, model }) {
    return {
      cmd: [CURSOR_BIN, "-p", prompt, "--model", model, "--output-format", "stream-json", "--force", "--approve-mcps", "--trust", "--workspace", paths.workspace],
      // cursor-agent hangs at startup under a fake HOME, so it keeps the real one; CURSOR_CONFIG_DIR still isolates its MCP servers, rules, and hooks.
      env: childEnv(paths.home, { HOME: REAL_HOME, XDG_CONFIG_HOME: CURSOR_XDG, CURSOR_CONFIG_DIR: join(paths.home, ".cursor") }),
    };
  },

  liveCommand({ paths, prompt, model }) {
    return {
      cmd: [CURSOR_BIN, "-p", prompt, "--model", model, "--output-format", "text", "--force", "--approve-mcps", "--trust", "--workspace", paths.workspace],
      env: childEnv(paths.home, { HOME: REAL_HOME, XDG_CONFIG_HOME: CURSOR_XDG, CURSOR_CONFIG_DIR: join(paths.home, ".cursor") }),
    };
  },

  parse({ stdout }) {
    const calls: ToolCall[] = [];
    let finalText = "";
    let agentError: string | null = "no result event";
    for (const ev of jsonlEvents(stdout, Event)) {
      if (ev.type === "result") {
        finalText = ev.result ?? "";
        agentError = ev.is_error ? clip(ev.result ?? "error") : null;
        continue;
      }
      if (ev.subtype !== "completed") continue;
      for (const [kind, raw] of Object.entries(ev.tool_call)) {
        if (!kind.endsWith("ToolCall")) continue;
        const p = Payload.safeParse(raw);
        if (!p.success) continue;
        const result = p.data.result;
        const isError = !result || !("success" in result);
        const output = result ? contentText("success" in result ? result.success : "error" in result ? result.error : result.rejected) : "";
        const mcp = kind === "mcpToolCall" ? McpArgs.safeParse(p.data.args) : null;
        if (mcp?.success) {
          calls.push({ via: mcp.data.providerIdentifier === "upstash" ? "mcp" : "other", name: mcp.data.toolName, input: clip(mcp.data.args), output: clip(output), isError: isError || /"isError":\s*true/.test(clip(result)) });
        } else if (kind === "shellToolCall") {
          calls.push(shellCall(String(p.data.args?.command ?? ""), output, isError));
        } else {
          calls.push({ via: "other", name: kind.replace(/ToolCall$/, ""), input: clip(p.data.args), output: clip(output), isError });
        }
      }
    }
    return { calls, finalText, agentError };
  },
};
