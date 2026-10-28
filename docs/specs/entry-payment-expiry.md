# Entry payment expiry

Status: implemented. Issue: not supplied in the current request.

## Goal and acceptance criteria
Organizers configure an optional whole-hour payment lifetime (1–8760 hours) in payment settings. Empty disables expiry for new orders. New non-cash orders with a positive amount snapshot a paymentDueAt deadline at receipt. Existing orders and deadlines remain unchanged when settings change. Unpaid RECEIVED orders become CANCELLED after that deadline; paid, cash, approved and processed orders remain unchanged. Partial payments do not prevent expiry. Cancellation records status history and releases rental cards through the existing cancellation service. The worker runs on startup and every minute, serializes event writes, rechecks eligibility under the lock and drains batches of 100. UI displays the deadline on checkout confirmation and entry detail only for unpaid RECEIVED non-cash orders.

## API and data
Nullable Event.entryPaymentLifetimeHours and Entry.paymentDueAt; additive GraphQL settings/input and entry field, shared REST response deadline. No runtime configuration.

## Test plan
Validate settings boundaries and preservation; verify expired/unexpired, paid/cash/approved exclusions and status history/rental release through existing transition tests. Run generation, focused service and component tests, consumer type checks and GraphQL schema snapshot.
