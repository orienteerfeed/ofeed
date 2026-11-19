# GHCR image retention

- Status: implemented; registry execution pending
- Issue: none (small maintenance change requested directly)
- Related ADRs: none

## Goal

Bound registry history to the five newest tagged images in each application
package: `ofeed/server`, `ofeed/client`, `ofeed/board` and `ofeed/ops`.

## Acceptance criteria

- A scheduled weekly workflow and manual dispatch apply the same retention.
- Keep the five newest tagged images per package across development and release
  tags, with no age threshold or protected tags. Fewer than five images remain
  untouched.
- Remove older images and unused untagged images while preserving platform
  manifests and attestations belonging to retained multi-architecture images.
- Use the repository token with `packages: write`; each package must grant the
  repository Admin access. Cleanup runs cannot overlap each other.

## Edge cases and operational limits

The five-image limit applies after successful cleanup, not continuously between
runs. GHCR may show additional child manifests for retained images. Registry
permissions, API errors or GitHub restrictions on deleting popular public
versions can prevent cleanup. Publication can overlap cleanup; retained images
must be checked after the run using the action's validation output.

Retention deliberately does not protect deployed digests. If an environment is
more than five builds behind, its image may be deleted and become unavailable
for restarts or rollback. Operators must update or export images they need to
retain before enabling the workflow on the default branch.

## API and data changes

No application API or database changes. The workflow deletes GHCR package
versions using `dataaxiom/ghcr-cleanup-action@v1`, which handles multi-architecture
image relationships.

## Validation and rollout

Parse the workflow YAML, verify its retention inputs and permissions, and run
Prettier plus `git diff --check`. No live registry deletion is part of local
validation. The weekly schedule activates on the repository's default branch;
manual dispatch is also available. Disabling the workflow stops future cleanup
but does not restore deleted images.
