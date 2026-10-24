import type { EvalFn } from "../../packages/core/src/cases.ts";
import { check, envHasWorkingCreds, readDotenv } from "../../packages/core/src/helpers.ts";

const score: EvalFn = async (ctx) => {
  const s = ctx.state.db?.secrets;
  if (!s) return [check("starting DB existed", false)];
  const vars = readDotenv(ctx.workspace);
  return [
    check(".env has variables", vars.size > 0, [...vars.keys()].join(",")),
    check(".env has a working URL + token pair for the DB", envHasWorkingCreds(vars, s)),
  ];
};
export default score;
