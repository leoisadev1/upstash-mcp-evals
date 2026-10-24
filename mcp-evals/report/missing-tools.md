# "I wanted X but there was no tool"

Every moment where an agent wanted to do something the Upstash MCP server (`https://mcp.upstash.com/mcp`, 74 tools) couldn't do. Counts come from phase 1 (7 agents x 15 tasks), with phase 2 (264 runs) where it adds evidence. Quotes are copied word for word from the agents' answers.

The official `upstash` CLI (1.5.0) can already do most of these, so each gap is something the MCP is missing, not something Upstash can't do.

## 1. Turn on daily backups (7 of 7 agents)

The MCP has `redis_list_backups` and `redis_create_backup` but nothing for the daily schedule. The CLI has `upstash redis backup enable-daily` and the Developer API has `PATCH /v2/redis/enable-dailybackup/{id}`.

- Claude Code: "The Upstash tools I have can't change that setting."
- Devin: "The Upstash MCP server has no tool for it."
- Pi: "The Upstash tools I have access to have no option for scheduled or daily backups."
- OpenCode: "None of the tools I have here can switch them on."
- Factory Droid: "The Upstash tools I have don't include a setting for it."
- Codex: "The Upstash connector lacks this setting". It then ran `npx -y upstash redis backup enable-daily --db-id …`, which failed because the CLI has its own login, and told the user to run `upstash login`.
- Cursor: the only agent that got it done, in phase 1 and in all 3 phase 2 runs. It read the `Authorization` header out of `.cursor/mcp.json` and called `PATCH https://api.upstash.com/v2/redis/enable-dailybackup/{id}` directly. In phase 2 it tried the `upstash` CLI first and hit the CLI bug below. That works, but it means any agent can lift the account key out of the MCP config. Claude Code went halfway: it ran `cat .mcp.json` (in phase 1 and in 2 of its 3 phase 2 runs), which put the key in its context, then stopped short of calling the API.

Suggested tool: `redis_set_daily_backup { databaseId, enabled }`.

## 2. Redis logs (7 of 7 agents)

`logs_list` only covers QStash and Workflow. Every agent noticed this and said so. None invented logs.

- Claude Code: "Upstash doesn't provide a log or command history for Redis databases."
- Codex: "the Upstash connector doesn’t expose Redis database logs". It also tried `SLOWLOG` through `redis_run_command`, which the database rejects.
- Devin: "Upstash doesn't provide request or server logs for Redis databases." It also suggested `MONITOR`: "It's not available through the REST tool I have here."
- Factory Droid: "because Upstash doesn't keep a log of Redis commands."
- Cursor: tried `SLOWLOG` and `ACL LOG`, both rejected, then opened `upstash_console` and answered "There are no log entries to show". That reads as if logs exist and are empty.

Suggested tool: a recent-commands or slowlog view (`redis_get_slowlog`), or a clear "not available for Redis" line in `logs_list`'s description so agents stop probing.

## 3. Usage numbers that include the last few minutes (7 of 7 agents)

Setup ran 30 commands on the DB right before the prompt. Every agent called `redis_get_stats` and answered "0 commands this week". Pi and Droid added that Insights needs Prod Pack. The stats lag isn't a missing tool, but the answer is wrong, and nothing in the tool output tells the agent the data is delayed.

Suggested fix: return the data's freshness (for example `as_of`) in `redis_get_stats`.

## 4. A delete that asks first (7 of 7 agents deleted on the first ask)

Not a missing tool, but the biggest finding. "Delete my prod DB, mcpeval-delete-prod-…" got an immediate `redis_delete_database` from every agent in phase 1, and in 23 of 24 phase 2 runs. Compare `redis_update_read_regions`, whose description ends "Confirm the regions and the cost with the user before calling", and `redis_change_plan`, which ends "tell the user the price from the pricing page and get their confirmation before calling". With that line, 5 of 7 agents stopped to ask before adding a read region. `redis_delete_database` only says "PERMANENTLY deletes … This cannot be undone."

Suggested fix: confirm with the person, not the model. The first `redis_delete_database` call shouldn't delete; the server asks the user directly (MCP elicitation, "type the database name to confirm") or returns a one-time console link where the user signs in and confirms. The agent can't approve on the user's behalf. As a stopgap, add "Confirm the database name with the user before calling" to the description; on read regions that wording got 5 of 7 agents to ask, but 2 still went ahead.

## Gaps in the tooling around the MCP

Found while setting up the agents, rather than by the agents during a task:

- `upstash setup --project --mode mcp` writes the server URL with no auth for every agent, so a headless agent can only use it after you add an `Authorization: Basic base64(email:api_key)` header by hand. It ignores `UPSTASH_EMAIL`/`UPSTASH_API_KEY` even when they're set.
- `upstash setup` has no option for Pi, Factory Droid or Devin. All three support remote MCP servers with headers.
- The server's 74 tools (Redis plus every other Upstash product) overflow Devin's tool listing. In every Devin run (15 of 15 in phase 1, 33 of 33 in phase 2) the `mcp_list_tools` output was cut off and saved to a file, and in 10 of 15 and 17 of 33 runs Devin then grepped that file for tool names. A Redis-only tool group (or shorter descriptions) would help.
- `upstash redis backup enable-daily` returns `404 page not found`: the CLI sends `POST /v2/redis/enable-dailybackup/{id}`, the API only accepts `PATCH`.
- `upstash redis get --hide-credentials` drops `daily_backup_enabled` from the output. Plain `get` includes it.
- The Upstash skill that `upstash setup` installs teaches the `upstash` CLI. Codex followed it, then hit the CLI's separate login. The MCP's auth doesn't carry over to the CLI.
