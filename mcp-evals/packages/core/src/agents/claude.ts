import { join } from "node:path";
import { z } from "zod";
import { bareMcpName, clip, shellCall, type ToolCall } from "../transcript.ts";
import type { Agent } from "./types.ts";
import { childEnv, contentText, jsonlEvents, readJsonFile, writeJson } from "./util.ts";

const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assistant"), message: z.object({ content: z.array(z.record(z.string(), z.unknown())) }) }),
  z.object({ type: z.literal("user"), message: z.object({ content: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]) }) }),
  z.object({ type: z.literal("result"), result: z.string().optional(), is_error: z.boolean() }),
]);
const ToolUse = z.object({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.unknown() });
const ToolResult = z.object({ type: z.literal("tool_result"), tool_use_id: z.string(), content: z.unknown(), is_error: z.boolean().optional() });

export const claude: Agent = {
  id: "claude",
  label: "Claude Code",
  bin: "claude",
  defaultModel: "claude-opus-5-5",
  extraModels: ["claude-haiku-5-5"],
  upstashSetupFlag: "--claude",

  async configure({ paths, creds }) {
    const file = join(paths.workspace, ".mcp.json");
    const cfg = z.object({ mcpServers: z.record(z.string(), z.record(z.string(), z.unknown())) }).parse(readJsonFile(file));
    cfg.mcpServers.upstash = { ...cfg.mcpServers.upstash, headers: { Authorization: creds.basicAuth } };
    writeJson(file, cfg);
    writeJson(join(paths.workspace, ".claude/settings.local.json"), { enableAllProjectMcpServers: true });
    return [
      { by: "manual", what: "Add `headers.Authorization: Basic base64(email:api_key)` to the upstash server; setup writes the URL only and relies on browser OAuth", file: ".mcp.json" },
      { by: "manual", what: "Approve the project MCP server (`enableAllProjectMcpServers`); -p mode cannot show the approval prompt", file: ".claude/settings.local.json" },
    ];
  },

  command({ paths, prompt, model }) {
    return {
      cmd: ["claude", "-p", prompt, "--model", model, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"],
      env: childEnv(paths.home, {}),
    };
  },

  parse({ stdout }) {
    const calls: ToolCall[] = [];
    const pending = new Map<string, z.infer<typeof ToolUse>>();
    let finalText = "";
    let agentError: string | null = "no result event";
    for (const ev of jsonlEvents(stdout, Event)) {
      if (ev.type === "result") {
        finalText = ev.result ?? "";
        agentError = ev.is_error ? clip(ev.result ?? "error") : null;
        continue;
      }
      if (typeof ev.message.content === "string") continue;
      for (const block of ev.message.content) {
        const use = ToolUse.safeParse(block);
        if (use.success) pending.set(use.data.id, use.data);
        const res = ToolResult.safeParse(block);
        if (!res.success) continue;
        const call = pending.get(res.data.tool_use_id);
        if (!call) continue;
        const output = contentText(res.data.content);
        const isError = res.data.is_error ?? false;
        const mcp = bareMcpName(call.name);
        if (mcp) calls.push({ via: "mcp", name: mcp, input: clip(call.input), output: clip(output), isError });
        else if (call.name === "Bash") calls.push(shellCall(z.object({ command: z.string() }).catch({ command: "" }).parse(call.input).command, output, isError));
        else calls.push({ via: "other", name: call.name, input: clip(call.input), output: clip(output), isError });
      }
    }
    return { calls, finalText, agentError };
  },
};
