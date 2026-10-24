import type { Creds } from "../env.ts";
import type { Transcript } from "../transcript.ts";

export type AgentId = "claude" | "codex" | "cursor" | "opencode" | "pi" | "droid" | "devin";

/** One thing the harness had to do so the agent could reach the MCP headless. */
export type SetupStep = {
  readonly what: string;
  /** `upstash-setup` steps come from `upstash setup --project`; `manual` is what a person would have to do by hand. */
  readonly by: "upstash-setup" | "manual";
  readonly file?: string;
};

export type RunPaths = {
  readonly workspace: string;
  /** Fake `$HOME` for the run, so Leo's real agent configs and rules never load. */
  readonly home: string;
  /** Where the adapter may write extra transcript files (Devin's export). */
  readonly outDir: string;
};

export type AgentCommand = {
  readonly cmd: readonly string[];
  readonly env: Readonly<Record<string, string>>;
};

export type Agent = {
  readonly id: AgentId;
  readonly label: string;
  readonly bin: string;
  readonly defaultModel: string;
  /** Other models worth a run in the phase 2 matrix (all on Leo's allowlist). */
  readonly extraModels: readonly string[];
  /** The `upstash setup` flag for this agent, or null when the CLI doesn't support it. */
  readonly upstashSetupFlag: string | null;
  /** Writes whatever `upstash setup` left out (auth header, trust, model routing). */
  configure(opts: { paths: RunPaths; creds: Creds }): Promise<SetupStep[]>;
  command(opts: { paths: RunPaths; prompt: string; model: string }): AgentCommand;
  /** Optional human-readable variant of `command`, for live terminal recordings. */
  liveCommand?(opts: { paths: RunPaths; prompt: string; model: string }): AgentCommand;
  /** Turns raw stdout (plus any files in outDir) into the neutral transcript. */
  parse(opts: { stdout: string; outDir: string }): Transcript;
};
