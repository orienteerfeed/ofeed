# Entry promo codes

Status: implemented; database rollout pending. Source: approved user plan. No issue linked: search found none and environment approval policy rejected issue creation.

## Goal and acceptance

Event owners/admins create event-scoped percentage codes in Settings → Services and revoke future use without repricing saved orders. Codes are reusable until revoked, immutable, case-insensitive, 3–40 ASCII letters/digits/_/-, unique per event forever; percentage >0–100 with two decimals. Checkout supports one code per event order, authoritative server preview and explicit invalid-code errors.

Registration rules gain allowPromoCode (default false). Highest matching percentage wins; ties combine only if all winning rules permit. Promo applies after existing discounts, to fees and rental of eligible items only. Round the discount on the eligible subtotal to two decimals. Store code/percentage/base/discount snapshots on Entry and registration pricing snapshots on items. Editing retains snapshots of identified existing items; new items use current rules. Revocation never changes history. Payment receipts remain immutable.

## API and tests

Add GraphQL owner/admin list/create/revoke and public quote accepting item inputs; REST create accepts optional promoCode. No public listing of codes. Serialize create/revoke with event write lock. Shared Zod owns constraints and pure pricing. Test authorization, event isolation, concurrent revocation, rounding, mixed eligibility, 100%, edit snapshots, receipts and checkout/settings UI. Generate Prisma and GraphQL snapshots; build shared and check both consumers. Verify migration on disposable local database and browser flows when available.

## Verification (2026-11-03)

- Full client suite: 392 tests passed across 50 files with one worker. The initial
  unrestricted parallel run suffered timeouts; the complete serial rerun passed.
- Relevant server entry/payment/email/availability/settings/GraphQL/OpenAPI suites:
  238 tests passed; 12 database integration scenarios skipped without opt-in URLs.
- Shared build and type check, client/server type checks including the strict
  GraphQL profile, Prisma generation/validation and focused ESLint passed.
- SQL migration generated from schema comparison. No existing database changed.
  Docker daemon is unavailable, so migration application and the new concurrent
  MariaDB test remain unverified. Run the test on a migrated disposable local
  database named `ofeed_promo_test` (or a suffixed variant) with
  `PROMO_TEST_DATABASE_URL` set, using server Vitest on
  `src/modules/entry/__tests__/promo-code.integration.test.ts`.
- Playwright checkout check passed at 1280px and 390px: apply/remove code,
  authoritative price display (100 → 80 CZK), final submission carrying
  `promoCode`, and no horizontal overflow. API responses were intercepted fixtures;
  no real entries were created. Screenshots visually inspected. Settings create,
  validation, combination toggle and revoke confirmation covered by component tests.
