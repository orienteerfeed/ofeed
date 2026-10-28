#!/usr/bin/env python3
"""Wait for an exact GitOps revision, then test public dev endpoints without cluster credentials."""

import json
import os
import re
import time
import urllib.error
import urllib.request

WEB = 'https://dev.ofeed.live'
API = 'https://api.dev.ofeed.live'
ARGOCD = 'https://argocd.martinkrivda.cz'


def deployed(application, revision):
    status = application.get('status', {})
    sync = status.get('sync', {})
    return (
        sync.get('status') == 'Synced'
        and sync.get('revisions') == [revision, revision]
        and status.get('health', {}).get('status') == 'Healthy'
        and status.get('operationState', {}).get('phase') == 'Succeeded'
    )


def fetch(url, headers=None):
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 200 or response.url != url:
            raise RuntimeError(f'Unexpected response for {url}')
        return response.read(), response.headers


def main():
    token = os.environ['ARGOCD_DEV_TOKEN']
    revision = os.environ['GITOPS_REVISION']
    if not token or not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise RuntimeError('A read-only Argo CD dev token and exact GitOps revision are required')
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        try:
            content, _ = fetch(
                f'{ARGOCD}/api/v1/applications/ofeed-dev?project=ofeed-dev',
                {'Authorization': f'Bearer {token}'},
            )
            application = json.loads(content)
            if deployed(application, revision):
                break
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504):
                raise RuntimeError(f'Argo CD returned HTTP {error.code}') from None
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(10)
    else:
        raise RuntimeError('Argo CD did not complete the expected dev deployment within 15 minutes')

    fetch(f'{WEB}/healthz')
    fetch(f'{WEB}/')
    runtime, _ = fetch(f'{WEB}/runtime-config.js')
    if API.encode() not in runtime:
        raise RuntimeError('Web runtime configuration does not point to the dev API')
    fetch(f'{API}/healthz')
    _, headers = fetch(f'{API}/readyz', {'Origin': WEB})
    if headers.get('Access-Control-Allow-Origin') != WEB:
        raise RuntimeError('Dev API does not allow the dev web origin')
    print(f'Dev deployment {revision}: Argo CD healthy; web, API, database readiness and CORS passed.')


if __name__ == '__main__':
    try:
        main()
    except (KeyError, RuntimeError, urllib.error.URLError, TimeoutError) as error:
        raise SystemExit(str(error)) from None
