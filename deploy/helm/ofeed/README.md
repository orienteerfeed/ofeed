# OFeed Helm Chart

Chart nasazuje `web`, `api`, volitelný `board` a Argo CD `PreSync` migrační Job
z image `ops`. MariaDB/MySQL je externí služba.

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

Podrobný Argo CD a Vault postup je v
[`docs/DEPLOYMENT_ARGOCD.md`](../../../docs/DEPLOYMENT_ARGOCD.md).
