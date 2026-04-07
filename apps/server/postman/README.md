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
- `10 - Admin (optional)`
- `11 - Cleanup`

Before running the full collection:

- Put your XML files under `fixtures/quickevent`, `fixtures/meos`, or
  `fixtures/si-droid`.
- Put Czech ranking CSV exports under `fixtures/czech-ranking`.
- The image upload scenario uses `fixtures/images/ofeed-event-image.png`.
- In Postman Desktop, set your Working Directory to `apps/server/postman`.
- The setup folder now also smoke-tests `/`, `/health/*`, `/metrics`, `/doc`,
  `/reference`, `/graphql`, and the map tile session/raster endpoints.
- Live external-provider testing happens in `03 - External Import` through
  `/rest/v1/events/import/search` and `/rest/v1/events/import/preview`. The
  collection now picks a random search result, previews it, and uses the
  previewed values to build the event-create payload. Later event lifecycle
  requests still exercise normal CRUD updates on that created OFeed event.
- The collection now sends the full safe parameter set for the covered auth,
  event, upload, and competitor requests. `oauthRedirectUris` can be adjusted in
  the environment if you want a custom OAuth redirect URI list.
- The collection stores concrete file paths in the upload requests:
  `fixtures/quickevent/qe-results-kam-251016.xml`,
  `fixtures/meos/meos-startlist-fra-260321.xml`, and
  `fixtures/si-droid/sidroid-results-shk-230122.xml`, plus
  `fixtures/czech-ranking/export_ranking_2026-03-31_2_20260407_222017.txt`.
- The `fixtureQuickEventXml`, `fixtureMeosXml`, and `fixtureSiDroidXml`
  environment values are only reference values now; the same applies to
  `fixtureCzechRankingCsv`. Postman Desktop reads the file path from the request
  body itself.
- To use different XML files in Postman Desktop, either replace those files or
  edit the request body file path directly after import. The Czech ranking
  upload request follows the same pattern.
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
- Admin coverage is skipped unless `runAdminScenarios=true` and
  `adminBearerToken` contains a valid admin JWT. The admin ranking write routes
  are exercised through validation-failure cases by default so the collection
  does not clear snapshots, clear event results, or trigger ORIS sync unless you
  later customize those requests intentionally.
- External import defaults to `ORIS`, which runs without an Eventor API key.
  Switch `externalImportProvider` to `EVENTOR` and set `externalImportApiKey`
  when you want to cover Eventor instead. The stored event metadata mirrors
  `externalImportProvider`, and the create request now uses the selected
  previewed external event id instead of a generated placeholder id.
- The final publish step reuses the imported event payload, so the event you
  inspect after the run keeps the ORIS-derived name/location/details and only
  adds the `- Postman test` suffix plus publication state.

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
- `fixtureCzechRankingCsv`
- `czechRankingType`
- `czechRankingCategory`
- `czechRankingValidForMonth`
- `fixtureEventImage`
- `runEventImageScenario`
- `runAdminScenarios`
- `adminBearerToken`

Newman example:

```bash
newman run apps/server/postman/collection.json \
  -e apps/server/postman/environments/dev.json \
  --working-dir apps/server/postman
```
