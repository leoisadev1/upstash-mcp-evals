import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, REPORT_DIR } from "@mcp-evals/core/paths";
import { run } from "@mcp-evals/core/proc";

/**
 * Records replays of saved runs as .cast, .gif and .mp4 in report/recordings/.
 * Usage: bun run record <name>=<results/.../run-N> [...]
 * Needs asciinema, agg and ffmpeg on PATH.
 */

const pairs = process.argv.slice(2).map((arg) => {
  const [name, dir] = arg.split("=");
  if (!name || !dir) throw new Error(`expected name=run-dir, got ${arg}`);
  return { name, dir };
});
if (pairs.length === 0) {
  console.error("usage: bun run record <name>=<results/.../run-N> [...]");
  process.exit(2);
}
const outDir = join(REPORT_DIR, "recordings");
mkdirSync(outDir, { recursive: true });

for (const { name, dir } of pairs) {
  const cast = join(outDir, `${name}.cast`);
  const gif = join(outDir, `${name}.gif`);
  const mp4 = join(outDir, `${name}.mp4`);
  const replay = `bun ${join(ROOT, "packages/manual/src/replay.ts")} ${join(ROOT, dir)}`;
  const steps = [
    ["asciinema", "rec", "--overwrite", "--quiet", "--headless", "--window-size", "100x34", "-c", replay, cast],
    ["agg", "--font-size", "16", "--theme", "monokai", "--idle-time-limit", "2", cast, gif],
    ["ffmpeg", "-y", "-loglevel", "error", "-i", gif, "-movflags", "faststart", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", mp4],
  ];
  for (const cmd of steps) {
    const res = await run({ cmd, timeoutMs: 180_000 });
    if (res.exitCode !== 0) throw new Error(`${cmd[0]} failed: ${res.stderr.slice(0, 300)}`);
  }
  console.log(`${name}: ${mp4}`);
}
