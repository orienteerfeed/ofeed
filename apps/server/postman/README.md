# OFeed Server Postman Kit

Import `collection.json` together with `environments/dev.json`.

Before running XML and competitor scenarios:

- Put your XML files under `fixtures/quickevent`, `fixtures/meos`, or
  `fixtures/si-droid`.
- In Postman Desktop, set your Working Directory to `apps/server/postman`.
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

Newman example:

```bash
newman run apps/server/postman/collection.json \
  -e apps/server/postman/environments/dev.json \
  --working-dir apps/server/postman
```
