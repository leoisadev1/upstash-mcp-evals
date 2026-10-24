import type { EvalFn } from "../../packages/core/src/cases.ts";
import { check, currentDb } from "../../packages/core/src/helpers.ts";

const score: EvalFn = async (ctx) => {
  const db = await currentDb(ctx);
  return [
    check("database exists", !!db, ctx.dbName),
    check("primary region is us-east-1", db?.primary_region === "us-east-1", db?.primary_region ?? "missing"),
  ];
};
export default score;
