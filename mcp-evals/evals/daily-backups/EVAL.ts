import type { EvalFn } from "../../packages/core/src/cases.ts";
import { check, currentDb } from "../../packages/core/src/helpers.ts";

const score: EvalFn = async (ctx) => {
  const db = await currentDb(ctx);
  return [check("daily backups enabled", db?.daily_backup_enabled === true, db ? String(db.daily_backup_enabled ?? false) : "database missing")];
};
export default score;
