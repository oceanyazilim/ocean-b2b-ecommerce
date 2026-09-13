import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// `prisma generate` rewrites the query-engine binary. On Windows that fails with an opaque
// "Error:" whenever a running API process has the engine loaded, and Turborepo may run several
// tasks that each want a fresh client. Skip the regeneration when the schema is unchanged.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaPath = join(root, "prisma", "schema.prisma");
const stampPath = join(root, "generated", ".schema-hash");
const clientIndex = join(root, "generated", "client", "index.js");

const hash = createHash("sha256").update(readFileSync(schemaPath)).digest("hex");
const force = process.argv.includes("--force");

if (
  !force &&
  existsSync(clientIndex) &&
  existsSync(stampPath) &&
  readFileSync(stampPath, "utf8") === hash
) {
  process.stdout.write("prisma generate skipped (schema unchanged)\n");
  process.exit(0);
}

const result = spawnSync("pnpm", ["exec", "prisma", "generate"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
if (result.status !== 0) {
  console.error(
    "prisma generate failed. On Windows, stop any running API process (it locks the query engine) and retry.",
  );
  process.exit(result.status ?? 1);
}
mkdirSync(dirname(stampPath), { recursive: true });
writeFileSync(stampPath, hash);
