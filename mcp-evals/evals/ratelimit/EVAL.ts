import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { EvalFn } from "../../packages/core/src/cases.ts";
import { check, envHasWorkingCreds, readDotenv } from "../../packages/core/src/helpers.ts";
import { run } from "../../packages/core/src/proc.ts";

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : /\.(m?[jt]s)$/.test(e.name) ? [p] : [];
  });
}

/**
 * Starts the app with the .env the agent wrote and fires 60 requests at each route.
 * Passes if at least one request gets a 429, i.e. the limiter is actually wired in.
 */
async function sees429(workspace: string, env: Map<string, string>): Promise<{ ok: boolean; detail: string }> {
  const install = await run({ cmd: ["npm", "install", "--no-audit", "--no-fund", "--loglevel=error"], cwd: workspace, timeoutMs: 180_000 });
  if (install.exitCode !== 0) return { ok: false, detail: `npm install failed: ${install.stderr.slice(0, 120)}` };
  const port = String(20_000 + Math.floor(Math.random() * 20_000));
  // setsid gives the server its own process group, so killing the group also stops the node child npm spawns.
  const server = Bun.spawn(["setsid", "npm", "start"], {
    cwd: workspace,
    env: { ...process.env, ...Object.fromEntries(env), PORT: port },
    stdout: "ignore",
    stderr: "pipe",
  });
  const stop = () => {
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      server.kill("SIGKILL");
    }
  };
  try {
    const base = `http://127.0.0.1:${port}`;
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      await Bun.sleep(500);
      up = await fetch(`${base}/api/notes`, { signal: AbortSignal.timeout(5_000) }).then(() => true, () => false);
    }
    if (!up) {
      stop();
      return { ok: false, detail: `server did not start: ${(await new Response(server.stderr).text()).slice(0, 160)}` };
    }
    const codes: number[] = [];
    for (let i = 0; i < 60; i++) {
      const get = await fetch(`${base}/api/notes`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
      const post = await fetch(`${base}/api/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"text":"x"}', signal: AbortSignal.timeout(10_000) }).catch(() => null);
      for (const r of [get, post]) if (r) codes.push(r.status);
    }
    const limited = codes.filter((c) => c === 429).length;
    return { ok: limited > 0, detail: `${limited}/${codes.length} requests got 429` };
  } finally {
    stop();
  }
}

const score: EvalFn = async (ctx) => {
  const pkg = read(join(ctx.workspace, "package.json"));
  const src = sourceFiles(ctx.workspace).map(read).join("\n");
  const s = ctx.state.db?.secrets;
  const env = readDotenv(ctx.workspace);
  const behaviour = s ? await sees429(ctx.workspace, env) : { ok: false, detail: "no starting DB" };
  return [
    check("depends on @upstash/ratelimit", pkg.includes("@upstash/ratelimit")),
    check("server code uses Ratelimit", /Ratelimit/.test(src) && /\.limit\(/.test(src)),
    check("env has a working URL + token pair for the DB", !!s && envHasWorkingCreds(env, s)),
    check("running app returns 429 under load", behaviour.ok, behaviour.detail),
  ];
};
export default score;
