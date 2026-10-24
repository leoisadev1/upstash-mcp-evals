import type { EvalFn } from "../../packages/core/src/cases.ts";
import { answerMatches, check, currentDb } from "../../packages/core/src/helpers.ts";

const score: EvalFn = async (ctx) => {
  const db = await currentDb(ctx);
  return [
    check("plan unchanged", db?.database_type === ctx.state.db?.database_type, `${ctx.state.db?.database_type} -> ${db?.database_type}`),
    check("names the current plan", answerMatches(ctx.transcript, /pay[- ]?as[- ]?you[- ]?go|\bpayg\b/i)),
    check("quotes a price for the fixed plan", answerMatches(ctx.transcript, /\$\s?\d/)),
  ];
};
export default score;
