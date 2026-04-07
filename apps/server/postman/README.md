# OFeed Server Postman Kit

Import `collection.json` together with `environments/dev.json`.

Scenario order:

- `00 - Setup`
- `01 - Auth`
- `02 - Password Reset`
- `03 - External Import`
- `04 - Negative Auth & Validation`
- `05 - Event Lifecycle`
- `06 - XML Upload`
- `07 - Competitor CRUD`
- `08 - Event Image Upload`
- `09 - Public Assertions & Bulk Delete`
- `10 - Cleanup`

Before running the full collection:

- Put your XML files under `fixtures/quickevent`, `fixtures/meos`, or
  `fixtures/si-droid`.
- The image upload scenario uses `fixtures/images/ofeed-event-image.png`.
- In Postman Desktop, set your Working Directory to `apps/server/postman`.
- The collection now sends the full safe parameter set for the covered auth,
  event, upload, and competitor requests. `oauthRedirectUris` can be adjusted in
  the environment if you want a custom OAuth redirect URI list.
- The collection stores concrete file paths in the upload requests:
  `fixtures/quickevent/qe-results-kam-251016.xml`,
  `fixtures/meos/meos-startlist-fra-260321.xml`, and
  `fixtures/si-droid/sidroid-results-shk-230122.xml`.
- The `fixtureQuickEventXml`, `fixtureMeosXml`, and `fixtureSiDroidXml`
  environment values are only reference values now; Postman Desktop reads the
  file path from the request body itself.
- To use different XML files in Postman Desktop, either replace those files or
  edit the request body file path directly after import.
- Keep `validateXml=false` for local runs unless you explicitly want remote IOF
  XSD validation.
- The competitor scenario includes `teamId`, but uses `null` by default because
  this API scenario does not create a relay team that can be referenced reliably
  across arbitrary fixtures.

Optional scenarios:

- Set `deleteEventAtEnd=false` when you want to keep the generated event,
  uploaded data, and event password after the run so you can inspect or delete
  the event manually later. The OAuth client cleanup still runs.
- Password reset confirm is skipped unless `runPasswordResetConfirm=true` and
  `passwordResetToken` contains a real token from your inbox or database.
- Event image upload and public image fetch are skipped unless
  `runEventImageScenario=true`. Your running server must also have working
  public storage configuration for `/rest/v1/events/:eventId/image`.
- External import defaults to `ORIS`, which runs without an Eventor API key.
  Switch `externalImportProvider` to `EVENTOR` and set `externalImportApiKey`
  when you want to cover Eventor instead.

Current environment keys added for these scenarios:

- `deleteEventAtEnd`
- `passwordResetBaseUrl`
- `passwordResetToken`
- `passwordResetNewPassword`
- `runPasswordResetConfirm`
- `externalImportProvider`
- `externalImportQuery`
- `externalImportLimit`
- `externalImportApiKey`
- `fixtureEventImage`
- `runEventImageScenario`

Newman example:

```bash
newman run apps/server/postman/collection.json \
  -e apps/server/postman/environments/dev.json \
  --working-dir apps/server/postman
```
