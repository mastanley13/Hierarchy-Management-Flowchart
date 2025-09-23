## Hierarchy Management System — API Integration Plan

Goal: Build and render an org chart tailored to the “Major Revolution Financial Group” branch under the authenticated agency. Use only the official endpoints from Updated API Docs: Firm service for relationships, Producer service for identities/lookup, optional Producer relationship for node drill-down. Respect 20 req/sec.

### 1) Services and Endpoints

- Firm service (primary for hierarchy data)
  - GET `/firm/relationship/after/{date}?offset&limit` → array of `GARelation`
    - Use for initial load and incremental refresh (pagination required)
  - Optional (not for bulk): GET `/firm/{firmId}/relationship` (docs show single `GARelation`, not used for bulk)
  - GET `/firm/{firmId}` (firm details; not required for chart)

- Producer service (identity + search + node detail)
  - GET `/producer/{producerId}` → `Producer` (firstName, lastName, npn, etc.)
  - GET `/producer/npn/{npn}` → `Producer` (search bar)
  - GET `/producer/{producerId}/relationship` → single `GARelation` (optional node drill-down)
  - GET `/producer/relationship/after/{date}?offset&limit` (alternate delta stream; not needed if using firm endpoint)

- Auth / Roles
  - BASIC_AUTH with `ROLE_AGENCY` using configured username/password via proxy at `/api`.
  - Rate limit: 20 requests/second → 50 ms minimum spacing between calls; batch where possible.

### 2) Data Model (from docs)

- `GARelation` fields (key subset used by chart)
  - `gaId: long` — Firm/Agency id (parent)
  - `producerId: long` — Producer id (child)
  - `branchCode: string` — our branch/sub-agency grouping label
  - `upline: string` — free-form label or id; build tree using presence/absence and cross-references
  - `status`, `errors`, `warnings`, `ts`, etc. (badges/filters)

- `Producer` fields (key subset used by chart labels)
  - `id`, `firstName`, `lastName`, `npn` (name and search)

### 3) Call Flow

1. Initial snapshot
   - Start date: `VITE_INITIAL_SNAPSHOT_DATE` (e.g., `2000-01-01T00:00:00Z`).
   - Page through GET `/firm/relationship/after/{date}?offset&limit` until returned chunk < limit.

2. Scope to agency/firm
   - Determine available `gaId`s from the fetched relations; choose desired firm `gaId` (currently 323 as per logs).
   - Filter relations to `gaId === selectedFirmId`.

3. Scope to Major Revolution Financial Group (branch)
   - Optional branch filter: `branchCode === 'Major Revolution Financial Group'`.
   - If branch is absent, display a toast/warning and render full firm to aid discovery.

4. Build hierarchy
   - Convert filtered `GARelation[]` to chart tree (existing `relationsToChart`).
   - Group by `branchCode` at the first level, then build downline using `upline` presence.

5. Label resolution (names)
   - On-demand progressive fetch of names for visible nodes only via GET `/producer/{id}`.
   - Cache labels in `labelCache` Map to avoid duplicate calls.
   - Respect 20 req/sec; concurrency 3–5.

6. Incremental refresh
   - Use max `ts` from last payload as the next `after/{date}` watermark.
   - Rebuild/merge tree as needed.

### 4) Tailoring to “Major Revolution Financial Group”

- Default branch filter: `'Major Revolution Financial Group'` (exact match of `branchCode`).
- UI affordances:
  - If the branch isn’t found, show a non-blocking banner with available branchCode samples and allow toggling the branch filter off.
  - Add a branch picker fed from distinct `branchCode`s in the filtered relations.

### 5) Rate Limiting Strategy

- Global throttle constant: `RATE_LIMIT_MS = 50`.
- Progressive loader batches producer label requests with small concurrency (e.g., 4) and per-request spacing.
- Reuse `requestCache` for GETs to dedupe in-flight calls.

### 6) Proxy and Environment

- Proxy: `api/proxy.js` forwards to `https://surelc.surancebay.com/sbweb/ws{path}` with `Authorization: Basic ...`.
- Env vars (Vite):
  - `VITE_SURELC_USER`, `VITE_SURELC_PASS`, `VITE_FIRM_ID`, `VITE_INITIAL_SNAPSHOT_DATE`, `VITE_PAGE_LIMIT`.

### 7) Validation & Diagnostics (must-have logs)

- After fetch:
  - Log total relations and distinct `gaId`s.
  - If selected `firmId` not present, list available firms.
- After firm filter:
  - Log `distinct branchCode` counts; ensure `'Major Revolution Financial Group'` appears when expected.
- After tree build:
  - Log top-level branches count and a small sample node.

### 8) Implementation Tasks

1. Confirm branch presence
   - Inspect relations for `gaId === 323`, collect distinct `branchCode`s, confirm `'Major Revolution Financial Group'` appears.

2. Add optional branch filter
   - In `loadHierarchyData`, after firm filtering, conditionally filter by `branchCode`.
   - Add UI control to toggle/set branch filter; default to “Major Revolution Financial Group”.

3. Optimize name loading for branch focus
   - When a branch is expanded or when the branch filter is active, trigger progressive loader limited to that `branch:{branchCode}` subtree.

4. Improve diagnostics
   - Add logs for `gaId`s, branch counts, and tree size. Surface a user-facing banner if the configured branch isn’t found.

5. Keep firm-specific endpoint disabled by default
   - Retain `fetchFirmRelations` as experimental behind a feature flag; primary path is `/firm/relationship/after/{date}`.

### 9) Acceptance Criteria

- With valid credentials, the chart renders branches and producers for firm 323.
- Applying the “Major Revolution Financial Group” filter shows only that branch’s hierarchy.
- Producer names resolve progressively within rate limits.
- Refresh uses the latest `ts` and updates the chart without errors.

### 10) Risks / Unknowns

- `upline` semantics may be label-only in some datasets; our builder already handles missing internal references by placing such producers at root of branch.
- Branch naming could vary; we should support exact match and a fallback substring match option.

### 11) Next Steps

- Run a one-time relation fetch and log distinct `gaId`s and `branchCode`s to verify availability of the target branch.
- Implement branch filter and branch-focused name loading.
- Add branch selector UI and banner for missing-branch cases.


