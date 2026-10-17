import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseDocument } from 'yaml';

const nextVersion = process.argv[2]?.trim();

if (!nextVersion || !/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  console.error('Missing or invalid version. Usage: update-package-version.mjs <X.Y.Z>');
  process.exit(1);
}

const packageJsonPath = resolve(process.cwd(), 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
packageJson.version = nextVersion;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

// Candidate builds append `-candidate.<run-id>` to Chart.yaml's version, so chart and app share X.Y.Z.
const chartPath = resolve(process.cwd(), 'deploy/helm/ofeed/Chart.yaml');
const chart = parseDocument(readFileSync(chartPath, 'utf8'));
chart.set('version', nextVersion);
chart.set('appVersion', nextVersion);
writeFileSync(chartPath, String(chart));
