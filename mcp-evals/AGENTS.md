# Upstash MCP evals

Runs coding agents headless against the Upstash MCP server (`https://mcp.upstash.com/mcp`) on a real Upstash account and scores the result through the official `upstash` CLI.

## Before you run

- Credentials: `../.env` with `UPSTASH_EMAIL` and `UPSTASH_API_KEY` (a Developer API key from the Upstash console). Never print or commit them.
- `bun install`, then `bun run manual --baseline` once per account. It snapshots existing Redis DBs (`results/baseline/redis.json`) and other Upstash resources (`results/baseline/other.json`). Every run checks afterwards that all of them still exist, with Redis settings unchanged, and stops everything if not.
- Only `mcpeval-*` resources are ever created or deleted. Prompts that touch an existing DB always name the run's own `mcpeval-*` DB.

## Commands

```sh
bun run manual --list                      # agents, models, cases
bun run manual                             # phase 1: every case x every agent, once
bun run manual --agents claude,pi --cases create-db,logs
bun run manual --report                    # rebuild report/sheet.*, setup.md, missing-tools.auto.md
bun run evals --matrix --runs 3            # phase 2: phase2 cases x agent@model, N runs
bun run evals --agents claude --model claude-haiku-5-5 --runs 1
bun run evals --report                     # rebuild report/scoreboard.{md,html}
bun run cleanup                            # dry run: list mcpeval-* resources
bun run cleanup --yes                      # delete them
bun run record best=results/manual/<agent@model>/<case>/run-1   # replay a saved run
bun run record-live --agent codex --case delete-prod --name live-worst   # record a live run (codex, opencode, cursor)
bun run typecheck
```

Every command has `--help` and `--json`. Concurrency is capped at 4. Exit codes: 0 ok, 1 error or guard abort, 2 bad arguments.

## Layout

- `evals/<id>/PROMPT.md`: frontmatter plus the prompt. `{{db}}` becomes the run's `mcpeval-<id>-<tag>` DB name. `phase2: true` puts it in the permanent suite.
- `evals/<id>/setup.ts` (optional): starting state, usually `startingDb`.
- `evals/<id>/EVAL.ts` (optional): returns checks, read through the `upstash` CLI.
- `evals/<id>/fixture/` (optional): copied into the workspace.
- `packages/core/src/agents/<agent>.ts`: one adapter per agent (MCP config, command line, transcript parser). To add an agent, add a file and list it in `agents/index.ts`.
- `results/<phase>/<agent@model>/<case>/run-<n>/`: prompt, raw stdout, `transcript.json`, `result.json`. Secrets are scrubbed. Gitignored.
- `report/`: the deliverables.

Each run gets a fresh temp workspace and a fake `$HOME`, so the agent never sees the machine owner's own configs, rules, or MCP servers. Cursor is the exception: it keeps the real `$HOME` but gets an isolated `CURSOR_CONFIG_DIR`.
