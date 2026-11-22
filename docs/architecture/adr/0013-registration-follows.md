# 0013: Follow athlete registrations across events

Status: proposed

Issue: [#293](https://github.com/orienteerfeed/orienteerfeed/issues/293).

Extend ADR 0012 with durable user/registration/issuer follow records. The user
requested cross-event selection and profile management, supplying the new context
for expanding event-scoped favorites. Do not infer an issuer from registration
format; undeclared local events use a separate LOCAL scope.

Resolve audiences with SQL joins rather than copying one favorite per event.
Keep paused identities for later resumption and preserve inbox history while
paused. Serialize preference changes and delivery using recipient user row locks.
First observed states establish baselines; resuming does not reconstruct missed
activity. Backfill current registered favorites and keep unregistered/guest
selections event-scoped. Registration follows survive event/competitor deletion.
