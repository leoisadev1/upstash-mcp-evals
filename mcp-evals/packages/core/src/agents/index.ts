import { ArgError } from "../errors.ts";
import { claude } from "./claude.ts";
import { codex } from "./codex.ts";
import { cursor } from "./cursor.ts";
import { devin } from "./devin.ts";
import { droid } from "./droid.ts";
import { opencode } from "./opencode.ts";
import { pi } from "./pi.ts";
import type { Agent, AgentId } from "./types.ts";

export type { Agent, AgentId, SetupStep } from "./types.ts";

/** Adding an agent: write one adapter file next to these and list it here. */
export const AGENTS = { claude, codex, cursor, opencode, pi, droid, devin } as const satisfies Record<AgentId, Agent>;

export function isAgentId(id: string): id is AgentId {
  return Object.hasOwn(AGENTS, id);
}

export function parseAgentList(csv: string | undefined): Agent[] {
  if (!csv || csv === "all") return Object.values(AGENTS);
  return csv.split(",").map((id) => {
    if (!isAgentId(id)) throw new ArgError(`unknown agent "${id}". Known: ${Object.keys(AGENTS).join(", ")}`);
    return AGENTS[id];
  });
}
