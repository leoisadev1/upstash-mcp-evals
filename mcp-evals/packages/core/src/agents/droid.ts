import { join } from "node:path";
import { z } from "zod";
import { MCP_URL } from "../paths.ts";
import { clip, mcpToolsInScript, shellCall, type ToolCall } from "../transcript.ts";
import type { Agent } from "./types.ts";
import { childEnv, contentText, jsonlEvents, linkFromRealHome, writeJson } from "./util.ts";

const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool_call"), id: z.string(), toolName: z.string(), parameters: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("tool_result"), id: z.string(), value: z.unknown(), isError: z.boolean().optional() }),
  z.object({ type: z.literal("completion"), finalText: z.string().optional() }),
  z.object({ type: z.literal("error"), message: z.string().optional() }),
]);

export const droid: Agent = {
  id: "droid",
  label: "Factory Droid",
  bin: "droid",
  defaultModel: "claude-opus-5-5",
  extraModels: [],
  upstashSetupFlag: null,

  async configure({ paths, creds }) {
    writeJson(join(paths.workspace, ".factory/mcp.json"), {
      mcpServers: { upstash: { type: "http", url: MCP_URL, headers: { Authorization: creds.basicAuth } } },
    });
    linkFromRealHome(paths.home, ".factory/auth.v2.file");
    linkFromRealHome(paths.home, ".factory/auth.v2.key");
    return [
      { by: "manual", what: "`upstash setup` has no Droid option. Wrote the remote server with an Authorization header by hand (`droid mcp add` only writes the user-level file)", file: ".factory/mcp.json" },
      { by: "manual", what: "No Upstash skill installed (setup only writes skills for the agents it supports)" },
    ];
  },

  command({ paths, prompt, model }) {
    return {
      cmd: ["droid", "exec", "-m", model, "-o", "stream-json", "--skip-permissions-unsafe", "--cwd", paths.workspace, prompt],
      env: childEnv(paths.home, {}),
    };
  },

  parse({ stdout }) {
    const calls: ToolCall[] = [];
    const pending = new Map<string, { name: string; params: Record<string, unknown> }>();
    let finalText = "";
    let agentError: string | null = "no completion event";
    for (const ev of jsonlEvents(stdout, Event)) {
      switch (ev.type) {
        case "tool_call":
          pending.set(ev.id, { name: ev.toolName, params: ev.parameters });
          break;
        case "completion":
          finalText = ev.finalText ?? "";
          agentError = null;
          break;
        case "error":
          agentError = clip(ev.message ?? "error");
          break;
        case "tool_result": {
          const call = pending.get(ev.id);
          if (!call) break;
          const output = contentText(ev.value);
          const isError = ev.isError ?? false;
          const direct = /^upstash___(.+)$/.exec(call.name)?.[1];
          if (direct) {
            calls.push({ via: "mcp", name: direct, input: clip(call.params), output: clip(output), isError });
          } else if (call.name === "Script") {
            const script = String(call.params.script ?? "");
            const tools = mcpToolsInScript(script);
            for (const t of tools) calls.push({ via: "mcp", name: t, input: clip(script), output: clip(output), isError: isError || /returned an error/.test(output) });
            if (tools.length === 0) calls.push({ via: "other", name: "Script", input: clip(script), output: clip(output), isError });
          } else if (call.name === "Execute") {
            calls.push(shellCall(String(call.params.command ?? ""), output, isError));
          } else {
            calls.push({ via: "other", name: call.name, input: clip(call.params), output: clip(output), isError });
          }
          break;
        }
        default: {
          const _exhaustive: never = ev;
          void _exhaustive;
        }
      }
    }
    return { calls, finalText, agentError };
  },
};
