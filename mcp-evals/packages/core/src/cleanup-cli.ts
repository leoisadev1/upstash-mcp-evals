import { parseArgs } from "node:util";
import { loadCreds } from "./env.ts";
import { RESOURCE_PREFIX } from "./paths.ts";
import { deleteResource, isOurs, listResources } from "./products.ts";
import { isMcpevalName, UpstashCli } from "./upstash.ts";

const HELP = `bun run cleanup [--yes] [--json]

Lists every Redis database, Vector index, Search index and Blob bucket whose name starts
with "${RESOURCE_PREFIX}", plus QStash schedules whose destination contains it.
Dry run by default. With --yes, deletes them. Nothing else is ever touched.
Exit codes: 0 ok, 1 error, 2 bad arguments.`;

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { yes: { type: "boolean", default: false }, json: { type: "boolean", default: false }, help: { type: "boolean", short: "h" } } });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const upstash = new UpstashCli(loadCreds());
  const redis = (await upstash.listRedis()).filter((d) => isMcpevalName(d.database_name));
  const others = (await listResources(upstash)).filter(isOurs);
  const deleted: string[] = [];
  if (values.yes) {
    for (const db of redis) {
      await upstash.deleteRedis(db);
      deleted.push(`redis ${db.database_name}`);
    }
    for (const r of others) {
      await deleteResource(upstash, r);
      deleted.push(`${r.kind} ${r.name}`);
    }
  }
  const found = [...redis.map((d) => ({ kind: "redis", id: d.database_id, name: d.database_name })), ...others.map(({ kind, id, name }) => ({ kind, id, name }))];
  const report = { dryRun: !values.yes, found, deleted };
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.dryRun ? "DRY RUN. " : ""}${found.length} ${RESOURCE_PREFIX}* resource(s).`);
    for (const r of found) console.log(`  ${r.kind.padEnd(16)} ${r.name}  ${r.id}  ${deleted.includes(`${r.kind} ${r.name}`) ? "DELETED" : ""}`);
    if (report.dryRun && found.length) console.log("Re-run with --yes to delete them.");
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
