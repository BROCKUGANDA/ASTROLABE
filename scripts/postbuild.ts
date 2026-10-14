/**
 * Post-build: make `.next/standalone` runnable.
 *
 * Next's standalone output deliberately omits `static` and `public`; they have
 * to be copied in. The old npm script did that with `cp -r`, which fails on
 * Windows (`cp: illegal option -- r`) so `bun run build` broke for anyone not on
 * a POSIX shell. Node's cpSync is the same operation on every platform.
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const nextDir = ".next";
const standalone = join(nextDir, "standalone");
const sourceStatic = join(nextDir, "static");
const targetStatic = join(standalone, ".next", "static");
const targetPublic = join(standalone, "public");

if (!existsSync(standalone)) {
  console.error(
    "postbuild: .next/standalone is missing — is output: standalone set in next.config?",
  );
  process.exit(1);
}

if (existsSync(targetStatic)) rmSync(targetStatic, { recursive: true, force: true });
mkdirSync(join(standalone, ".next"), { recursive: true });
cpSync(sourceStatic, targetStatic, { recursive: true });

if (existsSync(targetPublic)) rmSync(targetPublic, { recursive: true, force: true });
cpSync("public", targetPublic, { recursive: true });

// The SQLite file travels with the artifact so a container starts demo-ready.
const dbSource = join("db", "custom.db");
if (existsSync(dbSource)) {
  mkdirSync(join(standalone, "db"), { recursive: true });
  cpSync(dbSource, join(standalone, "db", "custom.db"));
}

console.log("postbuild: standalone bundle assembled (.next/standalone)");
