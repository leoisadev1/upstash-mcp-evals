import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { clip, shellCall, type ToolCall } from "../transcript.ts";
import type { Agent } from "./types.ts";
import { childEnv, contentText, jsonlEvents, linkFromRealHome, writeFile } from "./util.ts";

const Item = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent_message"), text: z.string() }),
  z.object({ type: z.literal("command_execution"), command: z.string(), aggregated_output: z.string().nullish(), exit_code: z.number().nullish() }),
  z.object({ type: z.literal("mcp_tool_call"), server: z.string(), tool: z.string(), arguments: z.unknown(), result: z.unknown(), error: z.unknown(), status: z.string() }),
  z.object({ type: z.literal("file_change"), changes: z.unknown() }),
]);
const Event = z.union([
  z.object({ type: z.literal("item.completed"), item: z.unknown() }),
  z.object({ type: z.enum(["turn.failed", "error"]), error: z.unknown().optional(), message: z.string().optional() }),
]);

export const codex: Agent = {
  id: "codex",
  label: "Codex CLI",
  bin: "codex",
  defaultModel: "gpt-6.1-sol",
  extraModels: [],
  upstashSetupFlag: "--codex",

  async configure({ paths, creds }) {
    appendFileSync(join(paths.workspace, ".codex/config.toml"), `http_headers = { Authorization = "${creds.basicAuth}" }\n`);
    linkFromRealHome(paths.home, ".codex/auth.json");
    writeFile(join(paths.home, ".codex/config.toml"), `[projects."${paths.workspace}"]\ntrust_level = "trusted"\n`);
    return [
      { by: "manual", what: "Add `http_headers = { Authorization = \"Basic …\" }` under [mcp_servers.upstash]; setup writes the URL only", file: ".codex/config.toml" },
      { by: "manual", what: "Trust the project in the user config; Codex ignores a project .codex/config.toml in untrusted folders", file: "~/.codex/config.toml" },
    ];
  },

  command({ paths, prompt, model }) {
    return {
      cmd: ["codex", "exec", "--json", "--skip-git-repo-check", "-m", model, "-c", 'model_reasoning_effort="medium"', "--dangerously-bypass-approvals-and-sandbox", "-C", paths.workspace, prompt],
      env: childEnv(paths.home, {}),
    };
  },

  liveCommand({ paths, prompt, model }) {
    return {
      cmd: ["codex", "exec", "--skip-git-repo-check", "-m", model, "-c", 'model_reasoning_effort="medium"', "--dangerously-bypass-approvals-and-sandbox", "-C", paths.workspace, prompt],
      env: childEnv(paths.home, {}),
    };
  },

  parse({ stdout }) {
    const calls: ToolCall[] = [];
    let finalText = "";
    let agentError: string | null = null;
    for (const ev of jsonlEvents(stdout, Event)) {
      if (ev.type !== "item.completed") {
        agentError = clip(ev.message ?? ev.error ?? ev.type);
        continue;
      }
      const item = Item.safeParse(ev.item);
      if (!item.success) continue;
      const it = item.data;
      switch (it.type) {
        case "agent_message":
          finalText = it.text;
          break;
        case "command_execution":
          calls.push(shellCall(it.command, it.aggregated_output ?? "", (it.exit_code ?? 0) !== 0));
          break;
        case "mcp_tool_call":
          calls.push({
            via: it.server === "upstash" ? "mcp" : "other",
            name: it.tool,
            input: clip(it.arguments),
            output: clip(it.error ? it.error : contentText(it.result)),
            isError: it.status !== "completed",
          });
          break;
        case "file_change":
          calls.push({ via: "other", name: "file_change", input: clip(it.changes), output: "", isError: false });
          break;
        default: {
          const _exhaustive: never = it;
          void _exhaustive;
        }
      }
    }
    return { calls, finalText, agentError };
  },
};
