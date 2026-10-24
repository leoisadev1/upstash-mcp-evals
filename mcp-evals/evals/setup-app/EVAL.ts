import type { EvalFn } from "../../packages/core/src/cases.ts";
import { check, envHasWorkingCreds, readDotenv } from "../../packages/core/src/helpers.ts";

const score: EvalFn = async (ctx) => {
  const found = await ctx.upstash.findRedisByName(ctx.dbName);
  if (!found) return [check("database exists", false, ctx.dbName)];
  const { secrets } = await ctx.upstash.getRedis(found.database_id);
  return [
    check("database exists", true, found.primary_region ?? ""),
    check("app env has a working URL + token pair", envHasWorkingCreds(readDotenv(ctx.workspace), secrets)),
  ];
};
export default score;
