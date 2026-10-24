# MCP setup per agent

What it took to connect each agent to the Upstash MCP server and run it without a person present. Each run started from an empty project. Where `upstash setup` supports the agent, we ran `upstash setup <agent> --project --mode mcp -y` first. Every step marked `manual` below is one a developer would have to do by hand.

## Claude Code

Model: `claude-opus-5-5`. `upstash setup` flag: `--claude`.

- **upstash-setup**: upstash setup --claude --project --mode mcp -y
- **manual**: Add `headers.Authorization: Basic base64(email:api_key)` to the upstash server; setup writes the URL only and relies on browser OAuth (`.mcp.json`)
- **manual**: Approve the project MCP server (`enableAllProjectMcpServers`); -p mode cannot show the approval prompt (`.claude/settings.local.json`)

## Codex CLI

Model: `gpt-6.1-sol`. `upstash setup` flag: `--codex`.

- **upstash-setup**: upstash setup --codex --project --mode mcp -y
- **manual**: Add `http_headers = { Authorization = "Basic …" }` under [mcp_servers.upstash]; setup writes the URL only (`.codex/config.toml`)
- **manual**: Trust the project in the user config; Codex ignores a project .codex/config.toml in untrusted folders (`~/.codex/config.toml`)

## Cursor CLI (agent)

Model: `grok-4.7-medium`. `upstash setup` flag: `--cursor`.

- **upstash-setup**: upstash setup --cursor --project --mode mcp -y
- **manual**: Add `headers.Authorization: Basic …` to the upstash server; setup writes the URL only (`.cursor/mcp.json`)
- **manual**: Pass `--approve-mcps --trust` (headless runs cannot answer the MCP approval and workspace trust prompts)

## OpenCode

Model: `anthropic/claude-opus-5-5`. `upstash setup` flag: `--opencode`.

- **upstash-setup**: upstash setup --opencode --project --mode mcp -y
- **manual**: Add `headers.Authorization: Basic …` to mcp.upstash; setup writes the URL only (`opencode.json`)

## Pi

Model: `anthropic/claude-opus-5-5`. `upstash setup` flag: **none, not supported**.

- **manual**: `upstash setup` has no Pi option. Ran `pi mcp add upstash --url https://mcp.upstash.com/mcp --header "Authorization=Basic …"` (`~/.pi/agent/mcp.json`)
- **manual**: Used the user-level file: a project .pi/mcp.json is ignored until the project is trusted in an interactive pi session
- **manual**: No Upstash skill installed (setup only writes skills for the agents it supports)

## Factory Droid

Model: `claude-opus-5-5`. `upstash setup` flag: **none, not supported**.

- **manual**: `upstash setup` has no Droid option. Wrote the remote server with an Authorization header by hand (`droid mcp add` only writes the user-level file) (`.factory/mcp.json`)
- **manual**: No Upstash skill installed (setup only writes skills for the agents it supports)

## Devin CLI

Model: `claude-opus-5-5-medium`. `upstash setup` flag: **none, not supported**.

- **manual**: `upstash setup` has no Devin option. Wrote the remote server with an Authorization header by hand (`.devin/mcp_config.local.json`)
- **manual**: `devin mcp add upstash --url … -H "Authorization: Basic …"` writes the same file but then blocks for ~5 min on a browser OAuth login it doesn't need
- **manual**: Pass `--respect-workspace-trust false`; print mode cannot show the trust prompt

## Test environment notes (not Upstash setup steps)

- OpenCode and Pi were pointed at the Anthropic API through their own provider settings. Pi ignores `ANTHROPIC_BASE_URL`, so it needs a `models.json` override.
- Codex and Pi wait for input on stdin when run without a terminal; every agent ran with stdin closed.
- Cursor was tested through its command-line agent, pinned to version 2026.10.01. The 2026.10.22 update replaced the command-line binary with a launcher that needs the Cursor IDE installed.
