# Fixture Layout

Place IOF XML files in software-specific folders:

- `fixtures/quickevent/`
- `fixtures/meos/`
- `fixtures/si-droid/`
- `fixtures/images/`

The current collection references these concrete fixture files:

- `fixtures/quickevent/qe-results-kam-251016.xml`
- `fixtures/meos/meos-startlist-fra-260321.xml`
- `fixtures/si-droid/sidroid-results-shk-230122.xml`
- `fixtures/images/ofeed-event-image.png`

If you want to swap the sample payload used by Postman Desktop, replace one of
those files or edit the request file path directly in the collection.

At least one configured file should create classes for the event, otherwise the
competitor CRUD scenario cannot continue.
