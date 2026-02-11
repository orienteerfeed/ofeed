# Deployment Manual: k3s + Helm + HashiCorp Vault

Tento postup nasadí OFeed aplikaci do k3s:
- frontend (`web`) + backend (`api`) + migration job přes Helm
- externí MariaDB/MySQL (mimo tento chart)
- `DATABASE_URL` a `JWT_TOKEN_SECRET_KEY` z HashiCorp Vault

## 1. Předpoklady

- funkční k3s cluster
- `kubectl` a `helm` nastavené na daný cluster
- HashiCorp Vault s povolenou Kubernetes auth metodou
- dostupné image backendu a frontendu (např. v GHCR)

## 2. Namespace

```bash
kubectl create namespace ofeed --dry-run=client -o yaml | kubectl apply -f -
```

## 3. Vault secret

Do Vault path ulož:
- `DATABASE_URL` (např. `mysql://ofeed:***@mariadb.database.svc.cluster.local:3306/ofeed`)
- `JWT_TOKEN_SECRET_KEY` (min. 32 znaků)

Příklad (KV v2):

```bash
vault kv put kv/ofeed/api \
  DATABASE_URL='mysql://ofeed:password@mariadb.database.svc.cluster.local:3306/ofeed' \
  JWT_TOKEN_SECRET_KEY='replace-with-long-random-secret-min-32-chars'
```

## 4. Vault policy a role

Policy:

```hcl
path "kv/data/ofeed/api" {
  capabilities = ["read"]
}
```

Vytvoření policy:

```bash
vault policy write ofeed-api-policy /path/to/policy.hcl
```

Role (mapovaná na service account z Helm chartu):

```bash
vault write auth/kubernetes/role/ofeed-api \
  bound_service_account_names='ofeed-ofeed-vault' \
  bound_service_account_namespaces='ofeed' \
  policies='ofeed-api-policy' \
  ttl='24h'
```

Poznámka: pokud změníš `release name` nebo `fullnameOverride`, uprav i `bound_service_account_names`.

## 5. Helm deploy

Výchozí deploy:

```bash
helm upgrade --install ofeed ./deploy/helm/ofeed \
  --namespace ofeed \
  --create-namespace \
  -f ./deploy/helm/ofeed/values-production.yaml \
  --set vault.enabled=true \
  --set vault.role=ofeed-api \
  --set vault.authPath=auth/kubernetes \
  --set vault.secretPath=kv/data/ofeed/api \
  --set ingress.hosts[0].host=ofeed.example.com
```

Pro private GHCR vytvoř image pull secret:

```bash
kubectl -n ofeed create secret docker-registry regcred \
  --docker-server=ghcr.io \
  --docker-username='<github-username>' \
  --docker-password='<github-token-read-packages>'
```

a při Helm deploy přidej:

```bash
--set imagePullSecrets[0].name=regcred
```

## 6. Kontrola

```bash
kubectl -n ofeed get pods
kubectl -n ofeed get svc
kubectl -n ofeed get ingress
kubectl -n ofeed logs deploy/api
```

Health endpoint API:

```bash
kubectl -n ofeed port-forward svc/api 3001:3001
curl http://localhost:3001/health
```

OpenAPI:

```bash
curl http://localhost:3001/doc
curl http://localhost:3001/reference
```

## 7. Upgrade / rollback

```bash
helm upgrade ofeed ./deploy/helm/ofeed -n ofeed -f ./deploy/helm/ofeed/values-production.yaml
helm rollback ofeed 1 -n ofeed
```
