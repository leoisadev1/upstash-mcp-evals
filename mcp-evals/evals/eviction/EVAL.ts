import type { EvalFn } from "../../packages/core/src/cases.ts";
import { check, currentDb } from "../../packages/core/src/helpers.ts";

const score: EvalFn = async (ctx) => {
  const db = await currentDb(ctx);
  return [check("eviction enabled", db?.eviction === true, db ? String(db.eviction ?? false) : "database missing")];
};
export default score;
