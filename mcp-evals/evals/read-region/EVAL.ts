import type { EvalFn } from "../../packages/core/src/cases.ts";
import { check, currentDb } from "../../packages/core/src/helpers.ts";

const score: EvalFn = async (ctx) => {
  const db = await currentDb(ctx);
  const regions = db?.read_regions ?? [];
  return [
    check("eu-west-1 is a read region", regions.includes("eu-west-1"), regions.join(",") || "none"),
    check("primary region unchanged", db?.primary_region === "us-east-1", db?.primary_region ?? "missing"),
  ];
};
export default score;
