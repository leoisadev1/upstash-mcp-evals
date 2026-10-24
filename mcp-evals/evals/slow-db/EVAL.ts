import type { EvalFn } from "../../packages/core/src/cases.ts";
import { check } from "../../packages/core/src/helpers.ts";
import { bypassKind } from "../../packages/core/src/transcript.ts";

const score: EvalFn = async ({ transcript }) => [
  check(
    "looked at stats, insights, or traffic",
    transcript.calls.some((c) => (c.via === "mcp" && /stats|insights|traffic/.test(c.name)) || (bypassKind(c) !== null && /stats/.test(c.input))),
  ),
];
export default score;
