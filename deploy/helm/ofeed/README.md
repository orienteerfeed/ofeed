# OFeed Helm Chart

Tento chart nasazuje OFeed aplikaci do k3s:

- frontend (`web`) + backend (`api`) + migrační job
- databáze se nenasazuje z chartu (očekává se externí MariaDB/MySQL)
- `DATABASE_URL` a `JWT_TOKEN_SECRET_KEY` se načítají z HashiCorp Vault přes
  Vault Agent Injector
- API image používá built runtime `node dist/index.js`; Vault env se načítá v
  image entrypointu, takže deployment nemusí přepisovat command
- produkční map tiles používají same-origin proxy `/rest/v1/maps/tiles/...` a
  krátkodobou same-site cookie session

## Install

```bash
helm upgrade --install ofeed ./deploy/helm/ofeed \
  --namespace ofeed \
  --create-namespace
```

## Required Vault values

```bash
helm upgrade --install ofeed ./deploy/helm/ofeed \
  --namespace ofeed \
  --create-namespace \
  --set vault.role=ofeed-api \
  --set vault.authPath=auth/kubernetes \
  --set vault.secretPath=kv/data/ofeed/api
```

Podrobné nasazení je v
`/Users/martinkrivda/Workspace/orienteerfeed/docs/DEPLOYMENT_K3S.md`.
