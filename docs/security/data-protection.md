# Data protection

This is an engineering inventory and review checklist. It does not establish a
legal basis, privacy notice, data-processing agreement or GDPR compliance. The
operator must approve those policies and document unresolved decisions.

## Personal data inventory

| Area                       | Examples                                                                   | Handling considerations                                                    |
| -------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Accounts                   | Name, email, credentials, verification and reset tokens                    | Restrict access; never expose password hashes or token values              |
| Participants               | Name, registration, birth year, timing card, club, results/splits          | Publication is contextual; include minors and restricted splits in reviews |
| Entry orders               | Contact identity, email, participant items, notes, fees, payment reference | Separate organizer access from public event data                           |
| Emergency/contact metadata | User-provided contact information                                          | Minimize exposure and review field authorization                           |
| Timing ingestion           | Card, control, punch time, device ID, station serial, receipt times and author | JWT owner/admin ingestion; private raw ledger, removed with event deletion |
| Imports and caches         | Federation registrations, XML/CSV payloads and import history              | Preserve provenance; public source does not remove privacy obligations     |
| Operations                 | IP, user agent, request paths, errors and browser traces                   | Restrict sinks, redact sensitive fields and set retention                  |
| Storage/backups            | Uploaded assets, snapshots, database backups                               | Access control, deletion propagation and restore policy                    |

Exact fields and relationships are in the
[Prisma schema](../../apps/server/prisma/schema.prisma). This inventory must be
reviewed when new fields, providers or exports are introduced.

## Collection, display and logging

Collect only data required for the workflow. Do not copy real personal data into
specs, ADRs, agent plans, fixtures or AI prompts. Never log authorization
headers, passwords, reset tokens or complete request bodies without a specific
reviewed need. Review the actual logger configuration; do not assume all nested
data is redacted automatically.

SPAYD/QR payment messages include the entry contact's first and last name.
Displaying, printing, persisting or sharing the QR payload discloses that name.
Browser profiles, authentication state, screenshots and traces may also contain
personal data and session secrets.

## Retention and deletion: unresolved policy

The repository does not establish approved retention periods here. The operator
must define purposes/legal bases, controller/processor responsibilities,
recipient/provider inventory, retention per data class and backup expiry. Do not
present indefinite retention or arbitrary example periods as agreed policy.

For access/correction/deletion requests, verify the requester through an
approved process, identify linked account/competitor/order/import/cache/storage
records, and review accounting, public-result and legal retention obligations.
Inspect schema cascades before deletion; removing a `User` does not imply all
event snapshots, federation caches or backups disappear. Prefer a reviewed
operational procedure over manual broad SQL deletion. Record the action without
re-copying sensitive values into logs.

## Required follow-up decisions

- Operator/contact responsible for privacy and data requests.
- Retention schedule, backup deletion/restore handling and audit evidence.
- Public-result/minor-data publication policy and federation cache
  refresh/removal.
- Provider agreements, processing locations and breach response process.

Track these in owner-approved issues/specs. See [threat model](threat-model.md).
