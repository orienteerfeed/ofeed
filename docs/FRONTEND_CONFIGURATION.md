# Frontend configuration: Vite, Docker Compose, and Kubernetes

Keep `VITE_*` for local Vite development and direct Vite builds. Use `OFEED_*`
for public runtime configuration in Docker Compose and Kubernetes. Do not change
Vite's `envPrefix`: Kubernetes does not require a particular prefix.

The container entrypoints write an explicit allowlist to `/runtime-config.js`
before Nginx starts. The HTML loads it before the application. This lets the same
image run in different environments without rebuilding. Every exported value is
public; never put secrets in these variables.

## Names and precedence

| App | Container runtime | Local Vite / legacy Compose |
| --- | --- | --- |
| Client | `OFEED_PUBLIC_API_URL` | `VITE_BASE_API_URL` |
| Client | `OFEED_PUBLIC_URL` | `VITE_PUBLIC_URL` |
| Client | `OFEED_BOARD_APP_URL` | `VITE_BOARD_APP_URL` |
| Client | `OFEED_DEFAULT_LANGUAGE` | `VITE_DEFAULT_LANGUAGE` |
| Client | `OFEED_DOCS_URL` | `VITE_DOCS_URL` |
| Client | `OFEED_DISCORD_INVITE_URL` | `VITE_DISCORD_INVITE_URL` |
| Client | `OFEED_GITHUB_REPO_URL` | `VITE_GITHUB_REPO_URL` |
| Client | `OFEED_ENABLE_MAP_VIEW` | `VITE_ENABLE_MAP_VIEW` |
| Client | `OFEED_DEBUG_LOGGING` | `VITE_DEBUG_LOGGING` |
| Board | `OFEED_BOARD_API_URL` | `VITE_OFEED_API_URL` |
| Board | `OFEED_BOARD_GQL_WS_URL` | `VITE_OFEED_GQL_WS_URL` |
| Board | `OFEED_BOARD_PROVIDERS` | `VITE_PROVIDERS` |

At container startup, each value uses the first non-empty value from the runtime
name, the legacy name, then the entrypoint default. `false` is a non-empty value
and is preserved. The browser uses non-empty runtime configuration before Vite
build values and application defaults. When no API/public URL is configured, the
client uses the browser origin, where Nginx proxies API requests. The production
Board link defaults to `https://board.orienteerfeed.com`; local Vite development
defaults to `http://localhost:5173`.

Local `pnpm dev` reads `VITE_*` from the app-local `.env`; it does not run the
container entrypoint or consume `OFEED_*`. `API_UPSTREAM` and
`BOARD_API_UPSTREAM` are internal Nginx upstream addresses, not browser URLs.

## Fix an existing Compose deployment

The root Compose file already passes `apps/client/.env` and `apps/board/.env`
through `env_file`. The Docker build context intentionally excludes app `.env`
files. No build arguments or root runtime `.env` are needed.

Previously, the runtime scripts accepted only `OFEED_*`, so a production `.env`
containing `VITE_BOARD_APP_URL` was ignored and the client used a localhost
fallback. Updated scripts also accept the legacy names. After updating the
source, the existing production setting works unchanged:

```dotenv
# apps/client/.env
VITE_BOARD_APP_URL=https://board.orienteerfeed.com
```

Alternatively, migrate that setting to the preferred container name:

```dotenv
# apps/client/.env
OFEED_BOARD_APP_URL=https://board.orienteerfeed.com
```

If both are present, the non-empty `OFEED_BOARD_APP_URL` wins. Rebuild once to
install the corrected scripts:

```bash
make up-build
```

To rebuild only the affected frontend images and recreate their containers:

```bash
docker compose build frontend board
docker compose up -d --no-deps frontend board
```

After future `.env` changes, recreate the containers; rebuilding is unnecessary:

```bash
docker compose up -d --no-deps --force-recreate frontend board
```

`docker compose restart` alone does not reload `env_file` values. Verify the
actual browser configuration rather than searching the compiled bundle:

```bash
docker compose exec frontend sh -c 'cat /usr/share/nginx/html/runtime-config.js'
docker compose exec board sh -c 'cat /usr/share/nginx/html/runtime-config.js'
curl -fsS https://orienteerfeed.com/runtime-config.js
```

The generated client object must contain
`VITE_BOARD_APP_URL: "https://board.orienteerfeed.com"`. The key inside the
JavaScript object remains `VITE_BOARD_APP_URL` even when the container input uses
`OFEED_BOARD_APP_URL`. Nginx serves this file with `Cache-Control: no-store`, and
the client service worker does not precache it. Reload an already open page to
read changed configuration.

## Kubernetes / Helm

Use the same images and runtime names through the chart's existing `web.env`
and `board.env` settings. Kubernetes does not load Compose app-local `.env`
files. For example:

```yaml
web:
  env:
    OFEED_PUBLIC_URL: https://orienteerfeed.com
    OFEED_BOARD_APP_URL: https://board.orienteerfeed.com
board:
  env:
    OFEED_BOARD_API_URL: /api/ofeed
    OFEED_BOARD_PROVIDERS: ofeed,liveResultat
```

Set `OFEED_PUBLIC_API_URL` only if the browser must use a different API origin;
otherwise the client uses its own origin. Helm passes these values directly to
container environment variables; changing deployment environment values rolls
out new Pods and regenerates the configuration at startup.

## Regression checks

```bash
node --test scripts/tests/frontend-runtime-config.test.mjs
```

These checks execute both shell entrypoints with the Dockerfile environment
defaults and verify legacy names, runtime precedence, defaults, escaping, and
the public-variable allowlist without a Docker daemon.
