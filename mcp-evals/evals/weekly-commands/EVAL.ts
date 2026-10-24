import type { EvalFn } from "../../packages/core/src/cases.ts";
import { answerMatches, check } from "../../packages/core/src/helpers.ts";
import { bypassKind } from "../../packages/core/src/transcript.ts";

const score: EvalFn = async ({ transcript }) => {
  const lookedUp = transcript.calls.some((c) => (c.via === "mcp" && /stats|insights/.test(c.name)) || (bypassKind(c) !== null && /stats/.test(c.input)));
  return [
    check("looked up usage stats", lookedUp),
    check("answers with a number", answerMatches(transcript, /\b\d+\b.{0,40}command/i, /command.{0,40}\b\d+\b/i)),
  ];
};
export default score;
