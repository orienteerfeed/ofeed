# QR payment bank account formats

- Status: implemented
- Issue: [#601 — Bank account setup issue](https://github.com/orienteerfeed/ofeed/issues/601)
- Related: [entry checkout](entry-checkout.md)

## Goal

Accept a Czech domestic account or an IBAN in event Settings → Services → QR
Payment, and always generate QR Platba ACC in electronic IBAN form.

## Acceptance criteria

- Accept `2201340123/2010` and convert it to `CZ8020100000002201340123`.
- Support optional Czech prefixes (`19-2000145399/0800`), leading zeroes,
  surrounding/grouping whitespace, and lowercase/spaced IBAN input.
- Validate Czech prefix/account modulo 11, nonzero account and four-digit bank
  code, and IBAN format/checksum modulo 97. Existing valid foreign IBANs remain
  accepted; domestic conversion always produces CZ. Account existence and bank
  code registration are not verified.
- Use one shared normalization/validation source on client/server. Save and
  return canonical IBAN. Show both accepted forms and invalid-input feedback in
  all supported languages; block saving invalid nonempty bank-account values.
- Previously stored valid domestic accounts work in checkout, QR emails and
  order-detail QR instructions without a data migration. Do not offer QR payment
  for an invalid stored account. Empty/null account handling remains supported.
- Keep the GraphQL field name `bankAccountIban` and existing authorization,
  payment-reference configuration, atomic settings saves and order contracts.
  Input validation is stricter for malformed nonempty bank-account values.

## Algorithm and references

Use bank code (4 digits) + prefix (6 digits) + account (10 digits) for Czech BBAN;
compute `98 - mod97(BBAN + 123500)` for CZ check digits. Keep numeric parts as
strings to preserve zeroes and calculate remainders incrementally.

- [ČNB IBAN calculator](https://www.cnb.cz/cs/platebni-styk/iban/kalkulator-iban-ceska-republika/)
- [ČNB IBAN structure and example](https://www.cnb.cz/cs/platebni-styk/iban/iban-mezinarodni-cislo-uctu/index.html)
- [ČNB domestic account checksum](https://www.cnb.cz/export/sites/cnb/cs/platebni-styk/.galleries/sluzby_pro_klienty/download/abok_podminky_priloha_2.pdf)

## Tests

Shared helper/schema tests cover issue example, ČNB prefix example, zero-padded
forms, whitespace/case, international IBAN preservation, length/format failures,
zero accounts and bad checksums. Component tests verify save/load and disabled
save on malformed input. Server tests verify canonical persistence, rejection
before transaction, capabilities for legacy accounts and checkout QR ACC. Build
shared, run focused server/client tests and type checks. Browser verification
when feasible; no live bank transfer is needed.

## Verification

Shared build, client/server TypeScript, focused ESLint/formatting checks and all
268 client tests passed. Server verification passed 90 focused settings,
checkout and email tests plus 6 GraphQL detail/schema tests. Mobile WebKit with
mocked GraphQL responses verified domestic/prefixed/foreign input, canonical
save/reload and invalid-input blocking. No live bank transfer or production
database migration was performed.
