import { join } from "node:path";
import { z } from "zod";
import { MCP_URL } from "../paths.ts";
import { run } from "../proc.ts";
import { clip, mcpToolsInScript, shellCall, type ToolCall } from "../transcript.ts";
import type { Agent } from "./types.ts";
import { childEnv, contentText, jsonlEvents, writeJson } from "./util.ts";

const Block = z.union([
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("toolCall"), id: z.string(), name: z.string(), arguments: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.string() }),
]);
const Message = z.discriminatedUnion("role", [
  z.object({ role: z.literal("assistant"), content: z.array(Block), errorMessage: z.string().nullish() }),
  z.object({ role: z.literal("toolResult"), toolCallId: z.string(), content: z.unknown(), isError: z.boolean().nullish() }),
]);
const Event = z.object({ type: z.literal("message_end"), message: z.unknown() });

export const pi: Agent = {
  id: "pi",
  label: "Pi",
  bin: "pi",
  defaultModel: "anthropic/claude-opus-5-5",
  extraModels: [],
  upstashSetupFlag: null,

  async configure({ paths, creds }) {
    // Harness-only: pi's anthropic provider ignores ANTHROPIC_BASE_URL, so point it at Leo's local proxy explicitly.
    writeJson(join(paths.home, ".pi/agent/models.json"), {
      providers: { anthropic: { baseUrl: process.env.ANTHROPIC_BASE_URL ?? "", apiKey: "${ANTHROPIC_AUTH_TOKEN}" } },
    });
    const add = await run({
      cmd: ["pi", "mcp", "add", "upstash", "--url", MCP_URL, "--header", `Authorization=${creds.basicAuth}`],
      cwd: paths.workspace,
      env: childEnv(paths.home, {}),
      timeoutMs: 60_000,
    });
    if (add.exitCode !== 0) throw new Error(`pi mcp add failed: ${add.stderr.slice(0, 200)}`);
    return [
      { by: "manual", what: "`upstash setup` has no Pi option. Ran `pi mcp add upstash --url https://mcp.upstash.com/mcp --header \"Authorization=Basic …\"`", file: "~/.pi/agent/mcp.json" },
      { by: "manual", what: "Used the user-level file: a project .pi/mcp.json is ignored until the project is trusted in an interactive pi session" },
      { by: "manual", what: "No Upstash skill installed (setup only writes skills for the agents it supports)" },
    ];
  },

  command({ paths, prompt, model }) {
    return {
      cmd: ["pi", "-p", "--mode", "json", "--no-session", "--model", model, prompt],
      env: childEnv(paths.home, {}),
    };
  },

  parse({ stdout }) {
    const calls: ToolCall[] = [];
    const pending = new Map<string, { name: string; args: Record<string, unknown> }>();
    let finalText = "";
    let agentError: string | null = null;
    for (const ev of jsonlEvents(stdout, Event)) {
      const msg = Message.safeParse(ev.message);
      if (!msg.success) continue;
      const m = msg.data;
      if (m.role === "assistant") {
        // Pi retries failed model calls itself; only an error on the last assistant message counts.
        agentError = m.errorMessage ? clip(m.errorMessage) : null;
        const text = m.content.flatMap((b) => ("text" in b ? [b.text] : [])).join("");
        if (text) finalText = text;
        for (const b of m.content) if ("arguments" in b) pending.set(b.id, { name: b.name, args: b.arguments });
        continue;
      }
      const call = pending.get(m.toolCallId);
      if (!call) continue;
      const output = contentText(m.content);
      const isError = m.isError ?? false;
      if (call.name === "codemode") {
        const code = String(call.args.code ?? "");
        const tools = mcpToolsInScript(code);
        for (const t of tools) calls.push({ via: "mcp", name: t, input: clip(code), output: clip(output), isError: isError || /"isError":\s*true/.test(output) });
        if (tools.length === 0) calls.push({ via: "other", name: "codemode", input: clip(code), output: clip(output), isError });
      } else if (call.name === "bash") {
        calls.push(shellCall(String(call.args.command ?? ""), output, isError));
      } else {
        calls.push({ via: "other", name: call.name, input: clip(call.args), output: clip(output), isError });
      }
    }
    return { calls, finalText, agentError };
  },
};
