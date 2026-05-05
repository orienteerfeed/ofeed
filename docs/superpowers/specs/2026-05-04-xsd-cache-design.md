# XSD Schema In-Memory Cache Design

**Date:** 2026-05-04  
**Scope:** IOF XML upload validation — eliminate per-request GitHub fetch of the IOF XSD

---

## Problem

`fetchIOFXmlSchema()` in `upload.handlers.ts` makes a live HTTP GET to GitHub on every upload request where `validateXml` is enabled. The IOF XSD is a stable, rarely-changing document. The round-trip adds latency and creates a hard dependency on GitHub availability.

---

## Goal

Cache the XSD in memory with a 24-hour TTL. On TTL expiry + fetch failure, return the stale copy so validation still runs. On first-ever fetch failure, return `''` (same as current behaviour — caller skips validation gracefully).

---

## Architecture

### New file: `apps/server/src/modules/upload/upload.xsd-cache.ts`

Single responsibility: own the cached XSD content and its freshness.

```
module state
  xsdCache: { content: string; fetchedAt: number } | null = null
  XSD_TTL_MS = 24 * 60 * 60 * 1000   // 24 hours

exported function
  getXsdSchema(): Promise<string>
    1. if cache exists && (Date.now() - fetchedAt) < XSD_TTL_MS → return content
    2. fetch IOF_XML_SCHEMA URL
       success → update cache, return fresh content
       failure + cache exists → return stale content  (stale-on-error)
       failure + no cache → log error, return ''
```

`IOF_XML_SCHEMA` URL constant moves here from `upload.handlers.ts`.

### Modified: `apps/server/src/modules/upload/upload.handlers.ts`

- Remove `fetchIOFXmlSchema()` function and `IOF_XML_SCHEMA` constant
- Add `import { getXsdSchema } from './upload.xsd-cache.js'`
- Replace `const xsd = await fetchIOFXmlSchema()` with `const xsd = await getXsdSchema()`
- Remove `fetchIOFXmlSchema` from `parseXmlForTesting` export object

---

## Cache Behaviour

| State | Fetch result | Behaviour |
|---|---|---|
| No cache | Success | Populate cache, return fresh content |
| No cache | Failure | Log error, return `''` |
| Cache fresh (< 24h) | (not called) | Return cached content |
| Cache stale (≥ 24h) | Success | Update cache, return fresh content |
| Cache stale (≥ 24h) | Failure | Return stale content, no error thrown |

---

## Error Handling

- Fetch errors are caught inside `getXsdSchema()` — never propagate to caller
- Stale-on-error is silent (no log spam on transient GitHub hiccups)
- First-ever fetch failure logs `console.error` (same as current `fetchIOFXmlSchema`)
- Caller (`handleIofXmlUpload`) behaviour is unchanged: `''` is passed to `validateIofXml`, identical to the current `fetchIOFXmlSchema` error path

---

## Testing

**New file: `apps/server/src/modules/upload/__tests__/upload.xsd-cache.test.ts`**

Uses `vi.spyOn(global, 'fetch')`. Each test gets a clean module instance via `vi.resetModules()` + dynamic `import()`.

| # | Test | Spy setup | Assertion |
|---|---|---|---|
| 1 | Cache miss → fetches and caches | Returns XSD content | Spy called once, content returned |
| 2 | Cache hit → skips fetch | Returns XSD content | Spy called exactly once across two `getXsdSchema()` calls |
| 3 | Stale cache + fetch failure → returns stale | First call succeeds, advance clock past TTL, second call throws | Stale content returned, no throw |

---

## Out of Scope

- Configurable TTL via env var (24 h hardcoded is sufficient)
- Cache invalidation endpoint / manual purge
- Persistent cache (disk / Redis)
- Any change to `validateIofXml()` or the `validateXml` request parameter
