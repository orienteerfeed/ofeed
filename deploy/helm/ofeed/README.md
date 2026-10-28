# OFeed Helm Chart

Chart nasazuje `web`, `api`, volitelný `board` a Argo CD `PreSync` migrační Job
z image `ops`. MariaDB/MySQL je externí služba. Job nejdřív aplikuje migrace a
potom doplní číselníky zemí, měn a sportu. Seed lze opakovat a nevytváří
uživatelská ani demonstrační data. Selhání kteréhokoli kroku zablokuje rollout.

## Image a GitOps

Každý workload používá explicitní immutable tag `X.Y.Z` z GHCR. GitOps values v
samostatném repozitáři musí změnit všechny čtyři tagy společně. Chart tagy
vyžaduje, aby Argo CD nikdy omylem nenasadil neoznačený image.

```bash
helm template ofeed ./deploy/helm/ofeed \
  --set api.image.tag=1.2.3 \
  --set web.image.tag=1.2.3 \
  --set ops.image.tag=1.2.3 \
  --set board.image.tag=1.2.3
```

## API request budgets

API request budgets are configured in `api.env`. Defaults are 600/minute for
GraphQL (`GRAPHQL_RATE_LIMIT_MAX`) and ordinary REST (`RATE_LIMIT_MAX` with
`RATE_LIMIT_WINDOW_MS=60000`), 60/minute for uploads (`UPLOAD_RATE_LIMIT_MAX`)
and 120/minute for session refresh/logout (`SESSION_RATE_LIMIT_MAX`). Verified
users/events have independent GraphQL/REST/upload budgets; session limits use
the client IP. Update old values in external GitOps overrides during rollout.
See
[request budget verification](../../../docs/ops/observability.md#api-request-budgets).

## Ingress

`ingress` routes the web application. To expose the API on a distinct host,
configure `api.ingress`; it always routes to the API Service rather than the web
Service. For example, the dev environment can use `dev.ofeed.live` for the web
application and `api.dev.ofeed.live` for the API:

```yaml
ingress:
  hosts:
    - host: dev.ofeed.live
      paths: [{ path: /, pathType: Prefix }]

api:
  ingress:
    enabled: true
    hosts:
      - host: api.dev.ofeed.live
        paths: [{ path: /, pathType: Prefix }]
    tls:
      - secretName: ofeed-dev-api-tls
        hosts: [api.dev.ofeed.live]
```

## Runtime configuration

`api.env` obsahuje běžnou serverovou konfiguraci. Citlivé hodnoty poskytni
jednou z těchto cest:

- `api.envFrom` a `ops.envFrom` s Kubernetes SecretRef;
- volitelný Vault Agent Injector (`vault.enabled=true`).

Explicitní proměnné podu mají přednost před hodnotou se stejným názvem z Vault
souboru. Pro migrace nastav stejný zdroj databázového připojení také pro `ops`.

`web.env` a `board.env` jsou veřejné hodnoty, ze kterých Nginx vytvoří
`/runtime-config.js`; nepřidávej do nich hesla ani klíče.

## Vault

Při `vault.enabled=true` chart vyžaduje `vault.role` a `vault.secretPath`.
`vault.secretKeys` určuje přesné klíče exportované do souboru Vault Agentu,
například `DATABASE_URL`, `JWT_TOKEN_SECRET_KEY` a `MAPY_API_KEY`.

`EXPO_ACCESS_TOKEN` (push notifikace, G25) je volitelný a potřebný jen při
zapnutém Expo enhanced push security. Do `vault.secretKeys` ho přidej až ve
chvíli, kdy klíč ve Vaultu existuje. API pody potřebují odchozí HTTPS na
`exp.host`.

Podrobný Argo CD a Vault postup je v
[`docs/DEPLOYMENT_ARGOCD.md`](../../../docs/DEPLOYMENT_ARGOCD.md).

## Image digests and migration order

Each component supports `image.digest: sha256:<64 hex characters>`. A digest
renders as `repository@sha256:...` and takes precedence over `image.tag`.
`requireImageDigests: true` rejects any enabled workload without a digest.
Explicit tags remain supported by default for existing deployments.

`migrations.hook` accepts `PreSync` (default) or `Sync`; `migrations.syncWave`
defaults to `-1`. For an ESO-managed dev environment, use `Sync` in wave `-10`
and set `serviceAccount.annotations.argocd.argoproj.io/sync-wave: "-20"`. The
runtime ExternalSecret must also be ready in wave `-20`. Hook Jobs use Argo hook
deletion policies for cleanup.

## Device-session signing keys

Vault Agent mode also requires `vault.accessKeysSecretPath`, a KV secret whose
`bundle` field contains the access-signing JSON bundle. The API reads
`/vault/secrets/access-keys.json` rather than shell-sourcing PEM keys. The Agent
runs as UID/GID 1000 and renders this file with mode `0400`. Existing ESO/volume
delivery can instead provide `ACCESS_JWT_KEY_FILE` through API configuration.
Production will not start without valid ES256 keys. Configure exact same-site
web/API origins for browser refresh cookies. See the
[device-session runbook](../../../docs/ops/runbooks/device-sessions.md) for the
coordinated legacy-token cutover, staged key rotation, and outage behavior.
