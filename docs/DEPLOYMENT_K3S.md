# k3s deployment reference

The supported production delivery model is Argo CD with the OFeed Helm chart.
See [DEPLOYMENT_ARGOCD.md](./DEPLOYMENT_ARGOCD.md) for the release-tag, GHCR,
Vault, Secret and migration contract.

For a local k3s validation, render the chart with a single immutable version:

```bash
helm upgrade --install ofeed ./deploy/helm/ofeed \
  --namespace ofeed \
  --create-namespace \
  -f ./deploy/helm/ofeed/values-production.yaml \
  --set api.image.tag=1.2.3 \
  --set web.image.tag=1.2.3 \
  --set ops.image.tag=1.2.3 \
  --set board.image.tag=1.2.3
```

Use either `api.envFrom` and `ops.envFrom` with a Kubernetes Secret or enable
the Vault Agent Injector. The `ops` Job must have the same database connection
configuration as the API. Do not add secrets to `web.env` or `board.env`; those
variables become browser-visible runtime configuration.
