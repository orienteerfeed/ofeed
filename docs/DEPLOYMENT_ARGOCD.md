# Deployment: Argo CD, Helm, GHCR and Vault

## Release contract

Stabilní release workflow publikuje při tagu `vX.Y.Z`. V GitOps repozitáři
nastav pro `api`, `web`, `ops` a `board` stejný explicitní tag `X.Y.Z`;
nepoužívej `latest` ani tag větve. Argo CD sleduje GitOps repozitář a provádí
standardní sync; stabilní publish workflow do něj necommituje. Dev používá
samostatný automatický tok popsaný níže.

```yaml
api:
  image: { repository: ghcr.io/orienteerfeed/ofeed/server, tag: '1.2.3' }
web:
  image: { repository: ghcr.io/orienteerfeed/ofeed/client, tag: '1.2.3' }
ops:
  image: { repository: ghcr.io/orienteerfeed/ofeed/ops, tag: '1.2.3' }
board:
  image: { repository: ghcr.io/orienteerfeed/ofeed/board, tag: '1.2.3' }
```

GHCR packages jsou veřejné, takže imagePullSecret není nutný. Pokud se
viditelnost změní na privátní, nastav `imagePullSecrets` na read-only GHCR
Secret.

## Argo CD migration

Chart vytváří `ops` Job s anotací `argocd.argoproj.io/hook: PreSync` a sync-wave
`-1`. Job dokončí `prisma migrate deploy` a potom idempotentní seed číselníků
(země, měny a sport Orienteering) před rolloutem API, webu a boardu. Seed
používá stejný `DATABASE_URL` jako migrace, zachovává existující identifikátory
a nevytváří uživatele ani události, ani když je nastavené `EVENT_NAME`.
Selhání migrace nebo seedu zastaví synchronizaci. Při dalším nasazení se seed
bezpečně zopakuje. Příkaz `pnpm db:seed` zůstává určený pro lokální přípravu
včetně volitelné události; deployment používá `seed-reference-data.ts`. Migrace musí být zpětně kompatibilní s právě
běžící aplikací, protože rollback schématu se automaticky neprovádí.

## Secrets

Pro cluster bez Vaultu předej stejný Secret API a migracím:

```yaml
api:
  envFrom:
    - secretRef: { name: ofeed-runtime }
ops:
  envFrom:
    - secretRef: { name: ofeed-runtime }
vault:
  enabled: false
```

Pro Vault nastav Kubernetes auth roli, path a seznam klíčů, které má Agent
exportovat. Explicitní `env` a `envFrom` mají přednost před Vault hodnotou.

```yaml
vault:
  enabled: true
  role: ofeed-api
  authPath: auth/kubernetes
  secretPath: kv/data/ofeed/api
  kvVersion: v2
  secretKeys: [DATABASE_URL, JWT_TOKEN_SECRET_KEY, MAPY_API_KEY]
```

## Public runtime configuration

Stejný client nebo board image lze spustit na jiné doméně bez rebuildu. Nastav
pouze veřejné hodnoty (`OFEED_PUBLIC_URL`, `OFEED_PUBLIC_API_URL`,
`OFEED_BOARD_APP_URL`, případně `OFEED_BOARD_API_URL`) přes `web.env`,
`board.env` nebo Docker `environment`. Pokud URL není nastavená, client používá
aktuální origin a Nginx proxy směruje API uvnitř stejné domény. Nasazení je
podporováno z root cesty `/`, nikoli pod URL prefixem.

## Continuous deployment of develop

`dev` is the continuously updated development environment; release candidates
are reserved for a specific release version. After the existing CI validation
succeeds for a push to `develop`, `ci.yaml` calls `deploy-dev.yaml`:

1. Build and publish amd64/arm64 server, client, board and ops images.
2. Package the exact source chart as `0.0.0-dev.<run-number>.<attempt>` and
   publish it to `oci://ghcr.io/orienteerfeed/charts`.
3. Assemble the candidate with source SHA, four manifest digests and the chart
   package SHA-256. Image tags use `dev-<full-sha>` for traceability; deployment
   uses `repository@sha256:...` even if a tag is republished on a retry.
4. Use a dedicated SSH deploy key to update only
   `apps/office-lab/_apps/dev/ofeed/` on GitOps branch `deploy/dev`. The
   existing GitOps updater validates the candidate, renders its chart and
   commits one complete release. A missing deployment branch is bootstrapped
   from GitOps `main`; an existing branch must already include the reviewed dev
   setup.
5. Argo CD automatically deploys `ofeed-dev`. CI waits for the exact GitOps
   revision to be healthy, then checks the web, API, DB readiness and CORS.

Required repository secrets in `orienteerfeed/ofeed`:

| Name                      | Purpose                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `OFEED_GITOPS_DEPLOY_KEY` | Private SSH key whose public key is installed as a write-enabled deploy key on `martinkrivda/officelab-argocd-apps` |
| `OFEED_ARGOCD_DEV_TOKEN`  | Expiring token for AppProject `ofeed-dev`, role `delivery-observer`                                                 |

No GitHub App or repository variable is required. GHCR uses the built-in
`GITHUB_TOKEN`. The workflow checks both secrets before starting image builds.

Generate a dedicated key locally outside the repository, without a passphrase
for unattended CI use:

```sh
ssh-keygen -t ed25519 -C "ofeed-dev-gitops" -f "$HOME/Downloads/ofeed-dev-gitops" -N ""
```

Add the `.pub` file to the GitOps repository's **Settings → Deploy keys → Add
deploy key**, enabling **Allow write access**. Store the private file as the
source repository's Actions secret, for example:

```sh
gh secret set OFEED_GITOPS_DEPLOY_KEY --repo orienteerfeed/ofeed < "$HOME/Downloads/ofeed-dev-gitops"
```

Use a separate key from the read-only Argo repository credential. Deploy keys
are scoped to the target repository, not to a branch or directory, and do not
expire. Protect GitOps `main` against direct pushes, including this deploy key,
and do not grant it a ruleset bypass. Permit automation pushes to `deploy/dev`.
The workflow stages only the dev directory and never force-pushes.

`actions/checkout@v4` configures the SSH key for subsequent Git commands and
removes it after the job. Strict host checking remains enabled; checkout adds
GitHub's host key implicitly. No `ssh-keyscan` or custom known-hosts secret is
needed for github.com. Revoke the deploy key in GitHub when retiring it and
rotate it deliberately.

The Argo observer needs only Application get access; CI does not need a
kubeconfig or Argo sync permission. Renew that token before expiry. Stable
semantic-release and `vX.Y.Z` publishing retain their existing behavior.

Configure the environment in GitOps, not in a second stage values file here: web
`OFEED_PUBLIC_URL=https://dev.ofeed.live`,
`OFEED_PUBLIC_API_URL=https://api.dev.ofeed.live`, API `CLIENT_APP_URL` and
`CORS_ORIGIN=https://dev.ofeed.live`, and distinct web/API TLS ingress rules.
Runtime values come from dev-specific Vault records through ESO. The GitOps
database/user is `ofeed_dev`.

For the first deployment with ESO, set `migrations.hook: Sync`,
`migrations.syncWave: -10`, and put the ServiceAccount and runtime
ExternalSecret in wave `-20`. Ordinary workloads use wave `0`. This ensures
secrets and the ServiceAccount exist before migrations. Existing deployments
retain the default `PreSync` hook. Enable `requireImageDigests: true` in
continuously deployed values to prevent an accidental fallback to mutable tags.

The workflow skips publication to GitOps when a newer develop commit exists.
Normal non-forced pushes prevent a competing update from overwriting history. CI
failures leave GitOps unchanged; migration failures block rollout. Smoke
failures are reported without automatically reverting database migrations. Use
backward-compatible schema migrations.

The complete bootstrap, Vault/Keycloak preparation and DNS requirements are in
[GitOps dev deployment](https://github.com/martinkrivda/officelab-argocd-apps/blob/main/docs/ofeed-dev.md).

Local deployment-contract checks:

```sh
python3 -m unittest discover -s scripts/delivery -p 'test_*.py'
# In the GitOps checkout, using this application's chart:
OFEED_CHART_SOURCE=../../orienteerfeed/deploy/helm/ofeed ruby scripts/test-ofeed-delivery.rb
```
