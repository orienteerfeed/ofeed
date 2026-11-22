# Device settings usability

Issue: https://github.com/orienteerfeed/ofeed/issues/435
Spec: ../../specs/live-device-status.md

- [x] Inspect settings, receiver contract and existing tests.
- [x] Implement guided registration, presets and progressive disclosure.
- [x] Localize new copy in all six locales and update regression tests.
- [x] Validate client tests, lint/types and browser behavior where practical.

Constraints: preserve unrelated local changes, GraphQL contracts and native receiver
behavior. No protocol discovery is available; channel and physical station codes
must remain explicit. Do not introduce guessed station codes or channels.

Checks: 467 client tests passed; focused device/action tests passed (17 tests).
Client TypeScript and targeted ESLint passed. Four Playwright scenarios passed in
installed Chrome at 1280px and 390px; the pinned Chromium executable was missing.
Screenshots checked on desktop/mobile. All 21 new keys exist in all six locales.

Complete. Native reception and upstream packaging/timezone fixes remain separate
from this UI change; browser transport is a deterministic fixture.
