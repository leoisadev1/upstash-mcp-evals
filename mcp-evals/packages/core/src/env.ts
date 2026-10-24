import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { ENV_FILE } from "./paths.ts";

export type Creds = { readonly email: string; readonly apiKey: string; readonly basicAuth: string };

const CredsFile = z.object({
  UPSTASH_EMAIL: z.string().email(),
  UPSTASH_API_KEY: z.string().min(8),
});

function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m?.[1]) continue;
    out[m[1]] = (m[2] ?? "").replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/** Loads Upstash creds from the repo `.env`. Throws with a fix-it message, never with the values. */
export function loadCreds(): Creds {
  if (!existsSync(ENV_FILE)) {
    throw new Error(`Missing ${ENV_FILE}. Add UPSTASH_EMAIL= and UPSTASH_API_KEY= (Upstash console > Account > Management API).`);
  }
  const parsed = CredsFile.safeParse(parseDotenv(readFileSync(ENV_FILE, "utf8")));
  if (!parsed.success) throw new Error(`${ENV_FILE} needs a valid UPSTASH_EMAIL and UPSTASH_API_KEY.`);
  const { UPSTASH_EMAIL: email, UPSTASH_API_KEY: apiKey } = parsed.data;
  return { email, apiKey, basicAuth: `Basic ${Buffer.from(`${email}:${apiKey}`).toString("base64")}` };
}
