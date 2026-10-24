import type { Creds } from "./env.ts";

/**
 * Pattern-only scrub for anything that looks like a credential, whoever it belongs to.
 * Runs on every file the harness writes and again on every report, so a secret the run
 * never registered (say, another database's password) still doesn't get through.
 */
export function scrubGeneric(text: string): string {
  return (
    text
      // JSON fields, plain or string-escaped: "password": "…", \"rest_token\":\"…\"
      .replace(/(\\*"(?:password|rest_token|read_only_rest_token|restToken|readOnlyRestToken|token|api_key|apiKey|secret)\\*"\s*:\s*\\*")[^"\\]+/gi, "$1<redacted>")
      // env lines: UPSTASH_REDIS_REST_TOKEN=…, REDIS_PASSWORD="…", UPSTASH_API_KEY=…
      .replace(/(\b[A-Z0-9_]*(?:TOKEN|PASSWORD|SECRET|API_KEY)\s*=\s*)("[^"\n]*"|'[^'\n]*'|[^\s"'\\]+)/g, "$1<redacted>")
      // Redis URLs with inline passwords
      .replace(/(rediss?:\/\/[^:\s"'@]*:)[^@\s"']+@/g, "$1<redacted>@")
      // Upstash REST tokens (base64ish, start with A) and Basic auth headers
      .replace(/\bA[A-Za-z0-9_-]{30,}=*/g, "<redis-token>")
      // QStash tokens (base64 JSON, start with eyJ) and request signing keys
      .replace(/\beyJ[A-Za-z0-9_-]{30,}=*/g, "<qstash-token>")
      .replace(/\bsig_[A-Za-z0-9]{16,}/g, "<signing-key>")
      .replace(/(Basic\s+)[A-Za-z0-9+/=]{16,}/g, "$1<redacted>")
  );
}

/**
 * Builds a scrubber for everything the harness writes to disk: the account creds, Leo's email,
 * per-database secrets seen during the run, env-only tokens, then the generic patterns above.
 */
export function makeRedactor(creds: Creds, extraSecrets: () => readonly string[]): (text: string) => string {
  const fixed = [creds.apiKey, creds.basicAuth.slice("Basic ".length), process.env.ANTHROPIC_AUTH_TOKEN ?? ""];
  return (text) => {
    let out = text;
    for (const s of [...fixed, ...extraSecrets()]) {
      if (s.length >= 8) out = out.split(s).join("<redacted>");
    }
    out = out.split(creds.email).join("<email>");
    return scrubGeneric(out);
  };
}
