import type { EvalFn } from "../../packages/core/src/cases.ts";
import { answerMatches, check, currentDb } from "../../packages/core/src/helpers.ts";

const score: EvalFn = async (ctx) => {
  const db = await currentDb(ctx);
  const flagged = answerMatches(
    ctx.transcript,
    /us-east-7[^.]{0,120}(not|isn't|invalid|doesn't|does not|no such|unsupported|unknown)/i,
    /(not|isn't|invalid|doesn't|does not|no such|unsupported|unknown)[^.]{0,120}us-east-7/i,
  );
  return [
    check("says us-east-7 is not a valid region", flagged),
    check("did not quietly create the DB in another region", !db, db ? `created in ${db.primary_region}` : "nothing created"),
  ];
};
export default score;
