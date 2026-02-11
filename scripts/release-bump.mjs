import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const nextVersion = process.argv[2];

if (!nextVersion) {
  console.error("Missing version argument. Usage: node scripts/release-bump.mjs <version>");
  process.exit(1);
}

const packageJsonPath = resolve(process.cwd(), "package.json");
const packageJsonRaw = await readFile(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageJsonRaw);

packageJson.version = nextVersion;

await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
console.log(`Updated root version to ${nextVersion}`);
