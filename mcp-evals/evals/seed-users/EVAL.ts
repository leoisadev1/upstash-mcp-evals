import type { EvalFn } from "../../packages/core/src/cases.ts";
import { check } from "../../packages/core/src/helpers.ts";

const score: EvalFn = async (ctx) => {
  const s = ctx.state.db?.secrets;
  if (!s) return [check("starting DB existed", false)];
  const size = Number(await ctx.upstash.redisExec(s, ["DBSIZE"]));
  return [check("at least 100 keys", size >= 100, `DBSIZE=${size}`)];
};
export default score;
