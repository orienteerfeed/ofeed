# Delivery Pipeline

Status: implemented in the workspace on 2026-10-16; activation requires the
GitOps token, Vault, DNS and registry setup below. Local tests do
not prove that a GitHub workflow has run or that a cluster has synchronized.

## Repositories and Environments

- Application: [orienteerfeed/ofeed](https://github.com/orienteerfeed/ofeed).
- GitOps: [martinkrivda/officelab-argocd-apps](https://github.com/martinkrivda/officelab-argocd-apps),
  locally `../office-lab/officelab-argocd-apps`.
- Dev: `dev.ofeed.live`, Argo CD project/Application/namespace `ofeed-test`.
- Production: `ofeed.live`, project `ofeed-prod`, Application/namespace `ofeed`.

All environment values, Applications and additional manifests live in GitOps.
CI builds and verifies containers and changes Git; it never obtains a kubeconfig.

## Event Contract

| Event | Action |
| --- | --- |
| Feature PR into `develop` | Verify source; no image publication or GitOps changes. |
| Merge into `develop` | Verify the merged commit, publish four multi-architecture candidate images and a versioned chart, then commit an atomic dev bump. |
| Update to protected `release/*` or `hotfix/*` | Publish a missing candidate; automatically restart qualification for an open release PR. |
| Release/hotfix PR into `main` | Qualify the exact image/chart set against disposable MariaDB and the recorded production baseline. |
| Merge of the qualified release/hotfix PR | Semantic-release computes the version automatically, promotes existing manifests, creates `vX.Y.Z`, and opens the production GitOps PR. |
| Merge of the production GitOps PR | Argo CD auto-syncs production. |
| Merge of a rollback PR | Argo CD reconciles the reverted image/chart bump; database changes are not reversed. |

Create `release/<topic>` from the selected develop commit. Use a **merge
commit** when merging release/hotfix PRs into main; squash/rebase release merges
are rejected so their Conventional Commits remain available to semantic-release.
Feature PRs may be squashed into develop with a Conventional Commit title.

## Automatic Versioning

`fix:` and `perf:` produce a patch; `feat:` produces a minor; `!:` or a
`BREAKING CHANGE:` footer produces a major. Documentation, CI and maintenance
changes alone do not produce releases. No release label or trailer is required.

An optional `Release-Type: patch|minor|major` trailer or the Release workflow's
manual override can increase the computed release level, or request a release
for maintenance-only commits. It cannot downgrade automatic release intent.
After a release, the `sync-version-pr` job opens a `chore(version)` PR that sets
root `package.json` `version` and `deploy/helm/ofeed/Chart.yaml` `version` and
`appVersion` to the released `X.Y.Z`. The production GitOps wrapper chart
(`ofeed-prod`) gets the same `version`/`appVersion` in the production PR. The
vendored `ofeed` chart package stays the immutable qualified candidate
(`X.Y.Z-candidate.<run-id>`) because its digest is verified against the delivery
record; it cannot be rewritten at release time.

Release preparation runs before semantic-release creates its Git tag. It checks
the merged tree, qualified head/base, workflow result, immutable candidate and
current production baseline, then promotes all four image manifests. The
GitHub Release is published before the production GitOps PR is opened. The
pipeline does not depend on another workflow being triggered by a tag created
with `GITHUB_TOKEN`.

## Immutable Artifacts

The four repositories remain:

- `ghcr.io/orienteerfeed/ofeed/server`
- `ghcr.io/orienteerfeed/ofeed/client`
- `ghcr.io/orienteerfeed/ofeed/board`
- `ghcr.io/orienteerfeed/ofeed/ops`

Candidate aliases are `develop-<full-sha>` or `candidate-<full-sha>`.
All GitOps image references include their digest. Publication verifies source
labels and both `linux/amd64` and `linux/arm64` platform manifests. Stable
`X.Y.Z` aliases are added by copying the original manifest bytes: no rebuild,
recompression, image-label change, or architecture conversion.

Candidate and prepared-release records are OCI artifacts in
`ghcr.io/orienteerfeed/ofeed/delivery`. They bind source commit/tree, four image
digests/platforms, chart version/digest, build run, policy version and qualification.
Do not delete production or rollback artifacts through registry retention rules.

The chart is published to `ghcr.io/orienteerfeed/charts/ofeed` with an exact
`<chart-version>-candidate.<run-id>` version. GitOps vendors those same qualified
chart package bytes under an environment wrapper chart and verifies their
SHA-256 against the delivery record. This avoids floating application chart
sources and avoids requiring Argo CD to authenticate to the chart registry.
The wrapper, values and pinned package change in one GitOps commit.

## GitOps Writes and Permissions

Application definitions stay on protected GitOps `main`. Dev delivery values,
wrapper/package and additional manifests are read from `deploy/dev`; production
uses `main`. The bot creates `deploy/dev` from main if it does not exist and
updates only the dev application paths. The dev Application itself remains
controlled from main.

Production uses a `deploy/ofeed-X.Y.Z` PR branch. Its first managed bump also
converts the existing production Application to the pinned wrapper chart.
Existing production Vault settings, resources and service configuration are
preserved. Never promote by merging the dev GitOps branch into main.

Configure GitOps main to require the `Validate OFeed delivery` check and human
review of production changes, with CODEOWNERS enforcement and no bot bypass.
The PAT can write GitOps branches and open production PRs. Branch protection,
not a bot-side path check, enforces the production approval boundary. Keep the
dev Argo CD project restricted to its own namespace and deny cluster resources.

Dev updates compare source ancestry and reject delayed older candidates. They
retry non-fast-forward GitOps conflicts from the new tip. Stable promotion is
serialized and not cancelled in progress. Default GitHub concurrency is not a
durable FIFO queue: keep only one release transaction in flight, and recover a
failed prepared release before merging another release. Do not assume
`cancel-in-progress: false` preserves every pending run.

## Release Qualification

The trusted selection job runs control scripts from protected application main;
GitOps App credentials are scoped to that step. The test job receives only
read permissions and runs no production credentials.

Qualification runs the exact candidate images in disposable containers:

- Native-library/binary smoke checks for both image architectures during build.
- Fresh MariaDB migrations and a real synthetic authentication account.
- When a managed production baseline exists: apply its migrations, keep its API
  running during the upgrade, verify its authentication/GraphQL behavior, and
  rerun its migration runner against the newer history.
- Browser tests against Nginx/API containers, not Vite dev servers.
- Board mount/proxy/runtime configuration, GraphQL execution and WebSocket
  subscription transport through both proxies.
- REST operation/required-parameter/response compatibility and GraphQL schema
  breaking-change detection against the baseline.
- Lint/render of the exact recorded chart with required image digests.

Evidence records the candidate digest, PR head/base/tree, production baseline,
policy version and workflow run. Missing/stale evidence fails release preparation.
Protect main with required CI and qualification checks, require branches to be
up to date, and restrict release merges to merge commits.

The first managed production deployment has no recorded old-image baseline.
It is a bootstrap, not proof of compatibility with an unknown legacy deployment.
Before approving that first GitOps PR, establish the actual production database
migration history and backup/recovery plan. Subsequent managed releases use the
recorded baseline automatically. Never fabricate image digests to initialize it.

## One-Time Activation

1. Merge the delivery control code onto application main as foundation work
   before opening the first release PR. Selection deliberately uses protected
   main's control scripts. Initialize develop from that foundation and protect
   develop/release/hotfix branches. An unqualified initial main commit may fail
   release preparation; it must not create a stable tag.
2. Create a fine-grained personal access token for
   `martinkrivda/officelab-argocd-apps` only. Grant repository
   **Contents: read/write** and **Pull requests: read/write**, then add it in
   application repository **Settings → Secrets and variables → Actions → New
   repository secret**:

   | Secret name | Value |
   | --- | --- |
   | `GITOPS_TOKEN` | The fine-grained token value |

   Set an expiration and rotate the token before it expires. Never commit it or
   send it in chat. The token needs no cluster, registry or database permissions.
3. Merge the GitOps bootstrap: dev Application/values/runtime ExternalSecret,
   test database bootstrap, delivery validation and updated nested-value
   validation. Keep the existing production Application until the first
   qualified production PR switches it atomically.
4. Populate the existing dev Vault paths using the existing filler workflow:

   ```bash
   make -C ../office-lab/officelab-vault-secrets app-test-ofeed
   ```

   Required runtime fields are the database `password`, server
   `JWT_TOKEN_SECRET_KEY` and `ENCRYPTION_SECRET_KEY`. Preserve existing keys.
   Dev's ExternalSecret builds `DATABASE_URL` from the same database password;
   it does not depend on manually duplicating that password into a URL.
5. The shared MariaDB Application runs the new idempotent bootstrap Job. It uses
   existing `database/mariadb-auth` root credentials and creates only
   `ofeed_test` plus its dedicated user. This also works with an existing PVC;
   adding initialization SQL alone would not. An existing user with a different
   password fails verification rather than being silently rotated.
6. Ensure `dev.ofeed.live` resolves to the k3s ingress and cert-manager can issue
   its certificate. Configure a separate board hostname before enabling its
   ingress; the board service is otherwise internal.
7. After initial publication, either make the four application image packages
   public in GHCR or provide a dev-specific `imagePullSecret`. Dev defaults to
   public pulls; production's existing `regcred` is preserved. Chart and record
   packages may remain private because only application CI reads them.
8. Merge a small Conventional Commit change into develop. Verify candidate
   publication, dev bump and Argo CD health. Then open the selected release PR,
   qualify it, merge using a merge commit, review the generated production
   GitOps PR, and rehearse rollback.

No repository secret values were available when this implementation was prepared.
Adding the GitOps token, setting branch rules, filling Vault and validating the
live cluster are activation steps, not outcomes of local unit tests.

## Recovery and Rollback

A retry reuses existing complete candidates. Stable tags with a different digest
are a hard failure. The prepared-release record is written only after all four
stable aliases verify and before the Git tag is created.

If a failure happens after preparation or tagging, manually run the Release
workflow with `resume_version=X.Y.Z`. Recovery checks the recorded source/tag,
re-verifies/promotes the same digests, creates missing release metadata, and
opens the production PR. It must not select a different candidate or newer
version. Review an existing production PR before resuming an old operation.

Roll back through a PR reverting the complete GitOps release bump. Argo CD does
not reverse database migrations. Use expand/contract changes and a tested
rollback window; outside it, use a reviewed forward fix or database recovery.
The migration Job is a Sync hook at wave -10, after prerequisites at -20 and
before workloads. Avoid selective sync, which skips hooks.

## Local Checks

Workspace verification on 2026-10-16 passed all four native ARM64 Docker builds,
14 browser E2E tests against those containers, 811 server tests, 200 client tests,
62 board tests and 23 delivery/runtime regression tests. Lint, type checks,
chart rendering, workflow syntax and offline GitOps validation also passed.
The database bootstrap was tested twice against a disposable MariaDB with a
special-character password and a production-data isolation check. GitOps
rollback validation accepted a previously approved record and rejected a stale
new candidate.

These checks did not publish to GHCR, execute GitHub Actions, exercise the
amd64 CI build, compare against the unknown legacy production baseline, or
connect to the office-lab cluster. The implementation is not a live deployment.

```bash
node --test scripts/tests/*.test.mjs
helm lint deploy/helm/ofeed -f deploy/helm/ofeed/values-production.yaml
pnpm --filter ./apps/board test:unit
```

The GitOps repository adds `ruby scripts/validate-ofeed-delivery.rb` to
`make validate`. It checks the vendored chart, all four digest pins, runtime
domains and production baseline changes.

See [frontend configuration](./FRONTEND_CONFIGURATION.md) for runtime variables,
and [deployment operations](./DEPLOYMENT_ARGOCD.md) for cluster prerequisites.
