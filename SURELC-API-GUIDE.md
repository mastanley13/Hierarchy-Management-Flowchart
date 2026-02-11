# SureLC API Guide (Equita + Quility)

This repo talks to the **SureLC SBWeb "ws" API** (`https://surelc.surancebay.com/sbweb/ws`) using **two different credential sets**:

- **Equita** (primary/admin set)
- **Quility** (secondary/admin set)

Those two accounts often have **different access scope** in SureLC. For the same producer, one set may return `200` while the other returns `403` (blocked / out-of-scope). The report at `reports/surelc-access-report-2026-01-21T08-54-00-136Z.executive-summary.md` is an example of that behavior.

---

## 1) How API calls work in this repo (today)

There are **two** call patterns:

### A) "General SureLC WS calls" (browser -> `/api` or `/api/proxy` -> SureLC)

Used by the client-side API layer in `src/lib/api.ts` to call many SureLC endpoints (firm relationships, producer endpoints, carrier CSVs, carrier upload, etc.).

**Dev (Vite):**

- The browser calls paths like `GET /api/producer/123`.
- Vite proxies `'/api'` to SureLC and rewrites `/api/...` -> `/sbweb/ws/...` (see `vite.config.ts`).
- The browser must supply an `Authorization: Basic ...` header.

**Prod (Vercel):**

- The browser calls `GET /api/proxy?path=/producer/123` (or whatever endpoint path is needed).
- `api/proxy.js` forwards that request to `https://surelc.surancebay.com/sbweb/ws{path}` and forwards the `Authorization` header.
- The browser must supply an `Authorization: Basic ...` header.

**Credential choice (Equita vs Quility):**

- The UI chooses which credentials to use by passing `'equita'` or `'quility'` to `createAuthToken(...)` (in `src/lib/api.ts`), which builds the `Authorization: Basic ...` value from `VITE_SURELC_*` env vars.

> Security note: anything in `VITE_*` is browser-exposed at build time. For production use, prefer server-side `SURELC_*` (pattern B below) so credentials never reach the client.

### B) "SureLC Producer Aggregator" (browser -> `/api/surelc/producer` -> SureLC)

Used by the **Visual Hierarchy** UI to fetch a producer's SureLC details without requiring credentials in the browser.

- The browser calls `GET /api/surelc/producer?mode=both&which=AUTO&npn=...&producerId=...`
- The serverless function `api/surelc/producer.js`:
  - Loads **server-side creds** (`SURELC_USER_*` / `SURELC_PASS_*`) and builds Basic Auth
  - Calls SureLC **multiple times** (producer record, relationship, licenses, appointments, contracts, addresses)
  - Returns a normalized payload, including **both** Quility + Equita "views" when `mode=both`
  - Caches results for 15 minutes (override via `nocache=1`)

---

## 2) Where producer identifiers come from (HighLevel -> app)

When building the hierarchy snapshot, we extract these HighLevel custom fields (see `api/ghl/snapshot.js`):

- **NPN**: `contact.onboarding__npn`
- **SureLC Producer ID**: `contact.onboarding__producer_number`

The Visual Hierarchy SureLC fetch uses **both**:

- Prefer `npn` when present
- Also pass `producerId` if present (helps when NPN is missing or malformed)

---

## 3) Authentication & environment variables

### Server-side env (recommended for production)

Used by `api/surelc/producer.js` (and usable by scripts).

```env
# Optional override (defaults to https://surelc.surancebay.com/sbweb/ws)
SURELC_BASE=https://surelc.surancebay.com/sbweb/ws

# Equita credential set
SURELC_USER_EQUITA=...
SURELC_PASS_EQUITA=...

# Quility credential set
SURELC_USER_QUILITY=...
SURELC_PASS_QUILITY=...

# Optional fallback credential set (used if explicitly requested or as a last attempt)
SURELC_USER=...
SURELC_PASS=...
```

You can also provide precomputed tokens:

```env
SURELC_AUTH_EQUITA=Basic <base64(user:pass)>
SURELC_AUTH_QUILITY=Basic <base64(user:pass)>
SURELC_AUTH=Basic <base64(user:pass)>
```

### Dev env (current repo conventions)

The repo includes several dev helpers that read `VITE_SURELC_*` for local work:

```env
VITE_SURELC_USER_EQUITA=...
VITE_SURELC_PASS_EQUITA=...
VITE_SURELC_USER_QUILITY=...
VITE_SURELC_PASS_QUILITY=...
VITE_SURELC_USER=...
VITE_SURELC_PASS=...
```

---

## 4) SureLC endpoints we call

All of these are **relative to**:

```
https://surelc.surancebay.com/sbweb/ws
```

### Producer lookups + detail endpoints

- `GET /producer/npn/{npn}`
- `GET /producer/{producerId}`
- `GET /producer/{producerId}/relationship`
- `GET /producer/{producerId}/licenses`
- `GET /producer/{producerId}/appointments`
- `GET /contract/producer/{producerId}`
- `GET /producer/{producerId}/addresses`

### Firm relationship endpoints (used for hierarchy ingestion / MRFG data)

- `GET /firm/relationship/after/{isoDate}?offset={n}&limit={n}`
- `GET /firm/{firmId}/relationship`
- `GET /firm/{firmId}` (if supported by the account)

### Carrier endpoints (CSV + hierarchy upload)

- `GET /carrier/csv-report/{reportType}`
- `GET /carrier/csv-report/{reportType}/{isoDate}` (optional "after" date)
- `POST /carrier/uploadHierarchy` (multipart file upload)
- `GET /carrier/uploadHierarchy/{uploadId}`

---

## 5) Local endpoints exposed by this repo

### `GET /api/surelc/producer` (recommended)

Implemented in `api/surelc/producer.js`.

**Query parameters**

- `npn` (optional) - digits-only is enforced server-side
- `producerId` (optional) - digits-only is enforced server-side
- `mode` (optional)
  - `both` -> returns both Equita + Quility views in one response
  - anything else (default `single`) -> returns one "best effort" payload using the credential search order
- `which` (optional, default `AUTO`)
  - `EQUITA` | `QUILITY` | `GENERAL` | `AUTO`
  - Used for `mode=single` credential search order
- `include` / `includeEndpoints` / `raw` (optional)
  - When truthy, includes redacted raw endpoint payloads under `endpoints`
- `nocache` / `refresh` (optional)
  - When truthy, bypasses the 15-minute in-memory cache

**Credential search order (`mode=single`)**

- `which=EQUITA` -> tries `EQUITA`, then `GENERAL`, then `QUILITY`
- `which=QUILITY` -> tries `QUILITY`, then `GENERAL`, then `EQUITA`
- `which=GENERAL` -> tries `GENERAL`, then `QUILITY`, then `EQUITA`
- `which=AUTO` (default) -> tries `QUILITY`, then `EQUITA`, then `GENERAL`

**Response shape (high level)**

`mode=both`:

```json
{
  "ok": true,
  "mode": "both",
  "identifiers": { "npn": "...", "producerId": "..." },
  "views": {
    "QUILITY": { "ok": true, "available": true, "summary": { "...": "..." }, "endpointsMeta": { "...": "..." } },
    "EQUITA": { "ok": true, "available": true, "summary": { "...": "..." }, "endpointsMeta": { "...": "..." } }
  }
}
```

`mode=single` (success):

```json
{
  "ok": true,
  "mode": "single",
  "whichUsed": "EQUITA",
  "summary": { "...": "..." },
  "endpointsMeta": { "...": "..." },
  "attempts": [{ "which": "QUILITY", "producerByNpn": { "status": 403, "ok": false } }]
}
```

Failure (`mode=single`):

```json
{
  "ok": false,
  "errorCode": "ACCESS_DENIED",
  "attemptedCredentials": ["QUILITY", "EQUITA"],
  "attempts": [{ "...": "..." }]
}
```

When `include=endpoints` (or `includeEndpoints=true`), a redacted `endpoints` object is included alongside `endpointsMeta`.

**Example**

```bash
curl "http://localhost:3000/api/surelc/producer?mode=both&which=AUTO&npn=19421270"
```

### `GET /api/proxy?path=...` (prod proxy for general WS calls)

Implemented in `api/proxy.js`.

- Required header: `Authorization: Basic ...`
- Forwards the request to `https://surelc.surancebay.com/sbweb/ws{path}`
- Passes through `Accept` and `Content-Type` where relevant

**Example**

```bash
curl -H "Authorization: Basic <...>" \
  "https://<your-deployment>/api/proxy?path=/producer/npn/19421270"
```

---

## 6) How the Visual Hierarchy uses SureLC (Quility + Equita)

When you select a node in the Visual Hierarchy UI:

1. The UI finds identifiers from the node:
   - `node.npn`
   - `node.sourceNode.raw.surelcId` (producer ID)
2. It calls:
   - `GET /api/surelc/producer?which=AUTO&mode=both&npn=...&producerId=...`
3. The response includes two views:
   - `views.QUILITY`
   - `views.EQUITA`

This is why the UI can show "SureLC loaded" even when one credential set is blocked for that producer.

---

## 7) Troubleshooting (common status codes)

- `400 Bad Request` - usually **bad identifier** (wrong digits, empty, malformed NPN)
- `401 Unauthorized` - **credentials rejected** (bad user/pass, expired, locked out)
- `403 Forbidden` - **valid creds, but producer is outside that account's scope**
- `404 Not Found` - producer doesn't exist for the provided identifier

The access report runner (`npm run report:surelc-access`) is designed to quantify `200 vs 403 vs 400 vs 404` across contacts.

---

## 8) Useful scripts

- `node scripts/test-surelc-producer.mjs --npn <NPN> --which EQUITA`
  - Directly tests SureLC endpoints and prints summaries.
- `npm run report:surelc-access`
  - Generates cross-contact access breakdown (separate Equita + Quility tests).
