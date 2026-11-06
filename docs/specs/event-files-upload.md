# Event files upload

Status: implemented. Scope: event Files settings UI requested directly by the
user; no linked issue supplied.

## Goal

Provide one shared file drop zone above the existing Start list, Courses and
Results sections.

## Acceptance criteria

- The shared zone is slightly taller, uses semantic shadcn theme colors and a
  centered “File upload” label, without an external heading or description. The
  whole zone supports click, Enter and Space and exposes a busy state.
- Show the configured supported formats below the upload label inside the zone.
- Section badges follow the latest relevant import source: IOF_XML displays “IOF
  XML v3”, MEOS displays “MeOS MOP”. Keep “IOF XML v3” as the fallback when no
  import record exists. Courses only use course import records.
- Exactly one uploader accepts the same XML files and uses automatic payload
  detection.
- Keep all three status sections, import metadata and radio control settings.
- Keep the course prerequisite hint when neither start list nor results exist;
  the server continues enforcing this prerequisite.
- Refresh status and import metadata after successful upload.

## API and edge cases

No API or data changes. Existing upload validation, errors and loading behavior
remain in use, including invalid files and course imports without prerequisites.

## Test plan

Run FilesSettingsTab component regressions for one uploader before/after
prerequisites, section rendering, successful upload refresh, metadata and radio
controls; run client type check and tests. Browser validation requires a running
app and authenticated event access.
