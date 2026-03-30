const releaseLevel = process.env.SEMANTIC_RELEASE_FORCE_LEVEL?.trim().toLowerCase();
const supportedLevels = new Set(['patch', 'minor', 'major']);

if (!releaseLevel) {
  process.exit(0);
}

if (!supportedLevels.has(releaseLevel)) {
  console.error(
    `Unsupported SEMANTIC_RELEASE_FORCE_LEVEL: ${releaseLevel}. Expected one of patch, minor, major.`
  );
  process.exit(1);
}

process.stdout.write(releaseLevel);
