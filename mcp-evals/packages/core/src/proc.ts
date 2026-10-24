export type ProcResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly durationMs: number;
};

/** Runs a command with stdin closed and a hard timeout. Never throws on a non-zero exit. */
export async function run(opts: {
  cmd: readonly string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs: number;
}): Promise<ProcResult> {
  const started = Date.now();
  const proc = Bun.spawn([...opts.cmd], {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGTERM");
    setTimeout(() => proc.kill("SIGKILL"), 5_000);
  }, opts.timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { exitCode, stdout, stderr, timedOut, durationMs: Date.now() - started };
}

/** Runs async jobs with at most `limit` in flight, preserving input order in the result. */
export async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  const queue = items.entries();
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (const [i, item] of queue) out[i] = await fn(item, i);
  });
  await Promise.all(workers);
  return out;
}
