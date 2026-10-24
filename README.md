# Upstash Redis MCP evals

Seven coding agents (Claude Code, Codex, Cursor CLI, OpenCode, Pi, Factory Droid, Devin) were given real Upstash Redis tasks through the Upstash MCP server, on a live Upstash account. 369 runs; every result was checked against the account itself.

**Full report: [`mcp-evals/report/README.md`](mcp-evals/report/README.md)**

## Key takeaways

1. **Agents delete a production database without asking.** All 7 agents in phase 1, and 23 of 24 phase 2 runs, deleted the "prod" database on the first ask.
2. **Daily backups can't be turned on through the MCP.** Only Cursor managed it, by taking the API key from its MCP config and calling the Developer API.
3. **There are no Redis logs.** All 7 agents said so honestly.
4. **Usage stats lag** without warning: all 7 agents reported 0 commands right after 30 had run.
5. **`upstash setup` doesn't produce a working headless config**, and doesn't support Pi, Factory Droid or Devin.
6. **The everyday tasks work** for every agent: creating databases, eviction, read regions, seeding data, credentials in `.env`, rate limiting with `@upstash/ratelimit`.

## Fixes for Upstash

| Finding | Fix |
|---|---|
| Deletes go through without confirmation | Have the server confirm with the person: the first `redis_delete_database` call asks the user directly (MCP elicitation) or returns a one-time console link to sign in and confirm. The agent can't approve it. Stopgap: a "confirm with the user" line in the tool description |
| No daily-backup tool | Add `redis_set_daily_backup`; fix `upstash redis backup enable-daily` (sends POST, the API wants PATCH) |
| No Redis logs | Add a slowlog view, or say in `logs_list` that it covers QStash and Workflow only |
| Stats lag | Return the data's freshness from `redis_get_stats` |
| Setup needs a hand-added auth header | Have `upstash setup` write it, and add Pi, Factory Droid and Devin |
| Account key in plain text in MCP configs; 74 tools overflow some agents | Prefer scoped or OAuth tokens; offer a Redis-only tool set |

## Phase 2 scoreboard (11 tasks x 3 runs)

| Agent @ model | Pass rate |
|---|---|
| Cursor CLI @ grok-4.7-medium | 91% (82% using the MCP alone; its edge is the daily-backups API workaround) |
| Claude Code, Codex, Devin, Factory Droid, OpenCode @ their default model | 82% each |
| Pi @ claude-opus-5-5 | 79% |
| Claude Code @ claude-haiku-5-5 | 70% |

## In this repo

- [`mcp-evals/report/`](mcp-evals/report/): the report, the [phase 1 sheet](mcp-evals/report/sheet.md) ([CSV](mcp-evals/report/sheet.csv)), the [scoreboard](mcp-evals/report/scoreboard.md) ([HTML](mcp-evals/report/scoreboard.html)), the [missing-tools list](mcp-evals/report/missing-tools.md), [setup notes per agent](mcp-evals/report/setup.md), and [recordings](mcp-evals/report/recordings/).
- `mcp-evals/`: the eval harness. Each task in `mcp-evals/evals/` has a prompt, an optional starting state and a scorer. How to run it: [`mcp-evals/AGENTS.md`](mcp-evals/AGENTS.md).

Credentials go in a gitignored `.env` at the repo root (`UPSTASH_EMAIL`, `UPSTASH_API_KEY`). Raw run transcripts are kept out of the repo.
