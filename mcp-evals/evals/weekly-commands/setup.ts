import type { RunContext } from "../../packages/core/src/cases.ts";
import { startingDb } from "../../packages/core/src/helpers.ts";

/** A starting DB with a little traffic so stats have something to show. */
export default async function setup(ctx: RunContext) {
  const state = await startingDb(ctx);
  if (!state.db) return state;
  for (let i = 0; i < 20; i++) await ctx.upstash.redisExec(state.db.secrets, ["SET", `k${i}`, String(i)]);
  for (let i = 0; i < 10; i++) await ctx.upstash.redisExec(state.db.secrets, ["GET", `k${i}`]);
  return state;
}
