# 0015: Generate current entry settlement PDFs on the server

- Status: proposed
- Date: 2026-11-16
- Context: user-approved implementation plan for Czech entry settlement PDFs.

## Decision

Use PDFKit with bundled licensed Noto Sans fonts. The entry module owns a shared
settlement data builder and renderer for binary downloads and processed-email
attachments. Generate from current data; do not archive issued documents.
Store validated organizer and payer objects as nullable JSON, with shared Zod
contracts and typed GraphQL objects. Keep event enablement separate and disabled
by default. Use receipt ledger amounts, not historical paid flags.

## Consequences

No browser renderer or external PDF service is needed. Font assets must ship with
the server build. Downloads may differ from earlier attachments. This is an
entry settlement, without invoice numbering or VAT breakdown.
