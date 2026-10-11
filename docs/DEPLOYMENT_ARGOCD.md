# Deployment: Argo CD, Helm, GHCR and Vault

## Release contract

GitHub Actions publikuje pouze při tagu `vX.Y.Z`. V GitOps repozitáři nastav
pro `api`, `web`, `ops` a `board` stejný explicitní tag `X.Y.Z`; nepoužívej
`latest` ani tag větve. Argo CD sleduje GitOps repozitář a provádí standardní
sync, publish workflow do něj necommituje.

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
`-1`. Job dokončí `prisma migrate deploy` před rolloutem API, webu a boardu.
Jeho selhání zastaví synchronizaci. Migrace musí být zpětně kompatibilní s
právě běžící aplikací, protože rollback schématu se automaticky neprovádí.

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
