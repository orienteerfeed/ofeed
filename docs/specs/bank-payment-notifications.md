# Bank payment notifications (G25)

- Status: implemented (server)
- Issue: pending
- Owner: pending
- Related ADRs: [0007](../architecture/adr/0007-bank-payment-import.md)
- Depends on: [bank payment import](bank-payment-import.md) (G24)

## Goal and non-goals

Notify the organizer's phones when the server stores or changes the matching
status of a reported bank payment. The desktop app keeps showing its own native
notification from the batch response; the server is the source for every other
device.

Non-goals: mobile app code, Expo project credentials (FCM, APNs), server-side
localization of push texts, push receipt polling, notifications for manual
actions taken by the organizer.

## Current behavior and proposed behavior

Before: only the desktop that reported a batch learns about a match.
After: a reported transaction stored as `MATCHED` queues one push to every
phone the owner registered; the payload deep-links to the order.

## Acceptance criteria

- [ ] AC-01: `POST /rest/v1/devices/push-tokens` registers or updates a phone by
      user and `deviceId`; a token already registered elsewhere moves to the
      caller. `DELETE /rest/v1/devices/push-tokens/{deviceId}` removes the
      caller's device and is idempotent. The token is never returned.
- [ ] AC-02: A push is queued in the same database transaction that stores the
      status, only for `MATCHED`, `OVERPAID` and `UNMATCHED`, and at most once per
      (transaction, status). Batch retries (`DUPLICATE`) never queue again.
- [ ] AC-03: `GET`/`PUT /rest/v1/devices/notification-settings` switch each
      status on or off per user; all are on by default.
- [ ] AC-04: Only the owner's registered devices receive the push. Payload:
      `{ type: "BANK_PAYMENT", transactionId, amount, currency, status,
      entryId? }`, no token, no payer data.
- [ ] AC-05: Delivery retries transient failures with backoff (5 attempts) and
      removes tokens Expo reports as `DeviceNotRegistered`.
- [ ] AC-06: Rematching after an order change that settles an earlier
      `UNMATCHED` transaction queues a `MATCHED` push.

## Edge cases

- More than 100 devices: send all devices in batches of at most 100; mark the
  outbox row sent only after every batch completes. A transient later-batch
  failure retries the outbox row and may repeat earlier deliveries.
- No registered device: the push is marked sent with `NO_DEVICES`.
- Two API replicas: a conditional claim (`updateMany` on unsent, unclaimed rows)
  lets exactly one replica deliver; an expired claim is retried.
- Settings changed after queuing do not cancel already queued pushes.
- Manual match or ignore by the organizer does not push.
- Expo per-message ticket errors other than `DeviceNotRegistered` are recorded
  in `lastErrorCode` and not retried.

## API and data changes

- New tables `PushDevice` and `BankPaymentNotification` (outbox), column
  `User.bankPushStatuses` (JSON, missing keys mean on). Migration
  `20261028210000_bank_payment_notifications`.
- Delivery worker `startBankPushDelivery` polls every 5 s, 50 rows per pass, and
  deletes outbox rows older than 30 days.
- Expo client `apps/server/src/modules/bank/expo-push.ts`:
  `POST https://exp.host/--/api/v2/push/send`, JSON array of messages, one
  ticket per message. This contract was written from existing knowledge and was
  not re-verified against current Expo documentation in this change; verify
  before the first production rollout.
- Optional `EXPO_ACCESS_TOKEN` (only with Expo enhanced push security), from
  Vault.

Personal data: push tokens identify a device of the user; Expo receives tokens
and the payload (amount, currency, status, transaction and order ids, variable
symbol in the visible text). Expo is a processor; a processing agreement is
required before production.

## Test plan

| AC           | Check                                                      |
| ------------ | ---------------------------------------------------------- |
| AC-01, AC-03 | `devices/__tests__/devices.test.ts`                        |
| AC-02, AC-06 | `bank-matching.test.ts` (payment push outbox), `bank.integration.test.ts` |
| AC-04, AC-05 | `bank-push-delivery.test.ts` (worker and Expo client)      |

Commands as in [bank payment import](bank-payment-import.md#test-plan).

## Rollout and open questions

- Egress from API pods to `exp.host:443` must be allowed.
- Add `EXPO_ACCESS_TOKEN` to `vault.secretKeys` only after the key exists in
  Vault; the chart exports every listed key.
- Open: localized push texts (today English titles; the app can localize from
  `data.status`), push receipt polling, processing agreement with Expo.
