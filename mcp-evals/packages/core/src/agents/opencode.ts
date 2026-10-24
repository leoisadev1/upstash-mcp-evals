import { join } from "node:path";
import { z } from "zod";
import { bareMcpName, clip, shellCall, type ToolCall } from "../transcript.ts";
import type { Agent } from "./types.ts";
import { childEnv, jsonlEvents, readJsonFile, writeJson } from "./util.ts";

const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool_use"), part: z.object({ tool: z.string(), state: z.object({ status: z.string(), input: z.unknown(), output: z.unknown().optional(), error: z.unknown().optional() }) }) }),
  z.object({ type: z.literal("text"), part: z.object({ text: z.string() }) }),
  z.object({ type: z.literal("error"), error: z.unknown() }),
]);

export const opencode: Agent = {
  id: "opencode",
  label: "OpenCode",
  bin: "opencode",
  defaultModel: "anthropic/claude-opus-5-5",
  extraModels: [],
  upstashSetupFlag: "--opencode",

  async configure({ paths, creds }) {
    const file = join(paths.workspace, "opencode.json");
    const cfg = z.object({ mcp: z.record(z.string(), z.record(z.string(), z.unknown())) }).passthrough().parse(readJsonFile(file));
    cfg.mcp.upstash = { ...cfg.mcp.upstash, headers: { Authorization: creds.basicAuth } };
    writeJson(file, cfg);
    // Harness-only: route the anthropic provider through Leo's local Claude proxy. Not an Upstash setup step.
    writeJson(join(paths.home, ".config/opencode/opencode.json"), {
      $schema: "https://opencode.ai/config.json",
      provider: { anthropic: { options: { baseURL: `${process.env.ANTHROPIC_BASE_URL ?? ""}/v1`, apiKey: "{env:ANTHROPIC_AUTH_TOKEN}" } } },
    });
    return [{ by: "manual", what: "Add `headers.Authorization: Basic …` to mcp.upstash; setup writes the URL only", file: "opencode.json" }];
  },

  command({ paths, prompt, model }) {
    return {
      cmd: ["opencode", "run", "--format", "json", "-m", model, "--dir", paths.workspace, prompt],
      env: childEnv(paths.home, { OPENCODE_DISABLE_CLAUDE_CODE: "1" }),
    };
  },

  liveCommand({ paths, prompt, model }) {
    return {
      cmd: ["opencode", "run", "-m", model, "--dir", paths.workspace, prompt],
      env: childEnv(paths.home, { OPENCODE_DISABLE_CLAUDE_CODE: "1" }),
    };
  },

  parse({ stdout }) {
    const calls: ToolCall[] = [];
    let finalText = "";
    let agentError: string | null = null;
    for (const ev of jsonlEvents(stdout, Event)) {
      switch (ev.type) {
        case "text":
          finalText = ev.part.text;
          break;
        case "error":
          agentError = clip(ev.error);
          break;
        case "tool_use": {
          const { tool, state } = ev.part;
          const isError = state.status === "error";
          const output = isError ? state.error : state.output;
          const mcp = bareMcpName(tool);
          if (mcp) calls.push({ via: "mcp", name: mcp, input: clip(state.input), output: clip(output), isError });
          else if (tool === "bash") calls.push(shellCall(String(z.object({ command: z.string() }).catch({ command: "" }).parse(state.input).command), output, isError));
          else calls.push({ via: "other", name: tool, input: clip(state.input), output: clip(output), isError });
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
