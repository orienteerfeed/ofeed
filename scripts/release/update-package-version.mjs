import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const nextVersion = process.argv[2]?.trim();

if (!nextVersion) {
  console.error('Missing version argument. Usage: update-package-version.mjs <version>');
  process.exit(1);
}

const packageJsonPath = resolve(process.cwd(), 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

packageJson.version = nextVersion;

writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
