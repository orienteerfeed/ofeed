# System radio devices

Status: completed. Issue: https://github.com/orienteerfeed/ofeed/issues/435
Spec: ../../specs/system-radio-devices.md ADR:
../../architecture/adr/0014-system-radio-devices.md

- [x] Shared contracts, inventory/assignment schema and migration.
- [x] Admin services/API, scoped worker and commit fencing.
- [x] Admin inventory and event readonly presentation, six locales.
- [x] Service/integration/component/browser checks and documentation.

Verified: all 468 client tests (61 files); 53 focused server tests; four
disposable MariaDB integration scenarios, including concurrent identity
reservation, A→B history isolation, stale writes, collection scopes,
timeout/outage closure and GraphQL authorization. The native worker
group/routing test also passed after using realistic Meshtastic IDs.

Two Chrome lifecycle tests passed at desktop/mobile widths (1280/390px), with
deterministic GraphQL transport. Client/server TypeScript, strict GraphQL types,
shared contracts and targeted ESLint passed. All 80 migrations applied only to
disposable local MariaDB. No production migration or deployment.

The multistep preset interaction test has a 15-second budget for loaded CI
hosts; its behavioral assertions are unchanged. Browser tests run separately
from the full client suite to avoid resource contention.

Native package publication/timezone fixes and real hardware acceptance remain
separate. Deployment must coordinate all server replicas before system reception
is enabled; see the API documentation. Pre-existing working-tree changes
preserved.
