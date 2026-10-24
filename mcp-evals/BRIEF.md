# Brief from Enes Akar (2026-10-23)

Testing Upstash Redis MCP across coding agents

The goal is to see how easy and developer-friendly it is to use Upstash Redis from different coding agents through our MCP server. First, test by hand to find what works, what breaks, and what's missing. Then turn the findings into a repeatable evals repo.

Phase 1: Manual testing

Agents: Claude Code, Cursor, Codex CLI, PI, OpenCode etc. Add or swap whatever you like.

Things you could try (just ideas, go wherever it takes you):
- Set up the MCP in each agent and see how painful it is
- "Create a Redis DB in us-east-1"
- "Add a read region to my DB" / "turn on daily backups"
- "Put my Redis credentials in .env"
- "How many commands did my DB get this week?"
- "Show me the logs for my DB"
- "Seed 100 test users into Redis"
- "Add rate limiting to this API using Upstash"
- "Delete my prod DB" (see if it pushes back)
- Vague or wrong prompts, to see how it recovers

Output:
- A sheet with agent x task, pass/fail, prompts needed, manual steps, and notes
- Screen recordings of the best and worst runs
- A list of every "I wanted X but there was no tool" moment, for example logs, or plan and eviction changes

Phase 2: Upstash evals repo (like supabase/evals)
- Turn the best 10-20 cases from phase 1 into evals
- Each eval gets a prompt, an optional starting state, and a scorer that checks the result through the Upstash API
- Run against a real Upstash test account, which avoids building a mock platform
- Run across agent x model combos, multiple runs each
- Later: publish results as a public scoreboard and re-run on every MCP release
