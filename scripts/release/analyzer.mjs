import assert from 'node:assert/strict';

import { analyzeCommits as conventionalAnalysis } from '@semantic-release/commit-analyzer';

const PRIORITY = { patch: 1, minor: 2, major: 3 };

export function trailerOverride(commits) {
  let selected;
  for (const { message } of commits) {
    for (const match of message.matchAll(/^Release-Type:\s*(\S+)\s*$/gim)) {
      const level = match[1].toLowerCase();
      assert(level in PRIORITY, `Invalid Release-Type trailer: ${level}`);
      if (!selected || PRIORITY[level] > PRIORITY[selected]) selected = level;
    }
  }
  return selected;
}

export async function analyzeCommits(config, context) {
  const automatic = await conventionalAnalysis(
    { preset: 'conventionalcommits', ...config },
    context
  );
  const forced =
    context.env?.SEMANTIC_RELEASE_FORCE_LEVEL?.trim().toLowerCase() ||
    trailerOverride(context.commits);
  if (!forced) return automatic;
  assert(forced in PRIORITY, `Invalid release override: ${forced}`);
  assert(
    !automatic || PRIORITY[forced] >= PRIORITY[automatic],
    'Release override cannot downgrade Conventional Commit release intent'
  );
  context.logger.log(
    'Using explicit release override: %s (automatic: %s)',
    forced,
    automatic ?? 'none'
  );
  return forced;
}
