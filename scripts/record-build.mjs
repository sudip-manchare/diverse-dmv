import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const paths = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else paths.push(path);
  }
}
for (const directory of ["src", "db", "public"]) collect(directory);
for (const path of [
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  ".dockerignore",
  ".vercelignore",
  "vercel.json",
  "deployment/Dockerfile",
  "render.yaml",
])
  if (existsSync(path)) paths.push(path);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const manifest = paths.sort().map((path) => ({
  path,
  sha256: digest(readFileSync(path)),
}));
const version = (name) =>
  JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")).version;
const smokePath = "docs/implementation/evidence/container-smoke.json";
const smoke = existsSync(smokePath)
  ? JSON.parse(readFileSync(smokePath, "utf8"))
  : {};
const result = {
  recordedAt: new Date().toISOString(),
  sourceDigestSha256: digest(JSON.stringify(manifest)),
  sourceDigestScope:
    "Runtime sources, migrations, public assets and deployment/build configuration; excludes credentials, tests and reports",
  baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  releaseCommit: null,
  workingTree:
    "Uncommitted implementation plus preserved pre-existing planning changes",
  nextBuildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
  versions: {
    node: process.version,
    next: version("next"),
    react: version("react"),
    typescript: version("typescript"),
    playwright: version("playwright"),
  },
  containerImage: smoke.image ?? null,
  containerCheckedAt: smoke.checkedAt ?? null,
  hostingTarget: "Vercel; deployment deferred to owner",
  deploymentUrl: null,
  httpsDomain: null,
  manifest,
};
writeFileSync(
  "docs/implementation/evidence/build-identity.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    sourceDigestSha256: result.sourceDigestSha256,
    nextBuildId: result.nextBuildId,
    files: manifest.length,
  }),
);
