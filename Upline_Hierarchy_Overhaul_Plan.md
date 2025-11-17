# Upline/Downline Hierarchy Overhaul Plan

## Summary
- Goal: Build a reliable, bottom-up organizational hierarchy (upline/downline) of insurance agents using two HighLevel contact custom fields: `NPN` (agent National Producer Number) and `Upline NPN` (the NPN of the immediate upline). Visualize the hierarchy as an interactive org chart.
- Scope: Read contacts via HighLevel Private Integration API, compute hierarchical relationships, surface issues (duplicates, cycles, orphans), and output data consumable by a visual component. Optionally persist non-PII derived metadata back to HighLevel or a local store.

## Objectives
- Single source of truth for hierarchy: contact custom fields `NPN` and `Upline NPN`.
- Bottom-up build: for each contact, link to parent via the `Upline NPN`; repeat upward to roots.
- Robust handling of edge cases (missing data, duplicates, cycles, very deep trees).
- Scalable sync: initial backfill + incremental updates without API throttling issues.
- Clear, searchable, interactive visualization with expand/collapse and path highlighting.

## Assumptions & Inputs
- Two HighLevel contact custom fields exist (or will be created):
  - `NPN` (string, unique per person; no formatting like dashes/spaces)
  - `Upline NPN` (string, may be empty if top-level)
- Private Integration Token available (HighLevel Marketplace → Private Apps). We will store secrets in `.env`.
- Contacts are scoped to a Location (most HighLevel contacts endpoints are location-scoped). We will supply `Location-Id` in headers.
- Optional: We may validate NPNs against a trusted service (e.g., NIPR or SureLC) if needed. Note: `https://surelc.surancebay.com/sbweb/ws` appears in the repo; if used, keep PII safeguards.

## Environment & Config
- `.env` entries (example; names can be adjusted to project standards):
  - `HL_API_BASE=https://services.leadconnectorhq.com` (HighLevel/LeadConnector base)
  - `HL_PRIVATE_API_KEY=<private_integration_token>`
  - `HL_LOCATION_ID=<your_location_id>`
  - `HL_NPN_FIELD_ID=<custom_field_id_for_npn>`
  - `HL_UPLINE_NPN_FIELD_ID=<custom_field_id_for_upline_npn>`
  - `HL_PAGE_SIZE=200` (tune based on limits)
  - `HL_RATE_LIMIT_PER_MIN=50` (tune based on observed limits)
- Headers pattern (confirm exact docs):
  - `Authorization: Bearer <HL_PRIVATE_API_KEY>`
  - `Version: 2021-07-28`
  - `Location-Id: <HL_LOCATION_ID>` (location-scoped endpoints)
  - `Content-Type: application/json`

## Data Model
- Contact (from HighLevel):
  - `id`
  - `firstName`, `lastName`, `email`, `phone` (for display in tooltips)
  - `customFields`: includes values for `HL_NPN_FIELD_ID` and `HL_UPLINE_NPN_FIELD_ID`
- Derived Node:
  - `contactId`, `npn`, `uplineNpn`
  - `parentContactId` (resolved via `uplineNpn → npn → contactId`)
  - `childrenContactIds[]`
  - `level` (root = 0), `pathToRoot[]`, `subtreeSize` (optional)
  - `statusFlags`: `missingNpn`, `duplicateNpn`, `uplineNotFound`, `cycleDetected`, `tooDeep` (boolean flags)
- Outputs:
  - `hierarchy.json` (compact tree or forest)
  - `issues.json` (any data-quality exceptions)
  - Optionally: `contactId → computedMetadata` map to cache derived info

## API Integration (HighLevel)
- Endpoints to confirm in docs (examples; actual paths may vary slightly):
  - List or search contacts (paginated): `GET /contacts` or `GET /contacts/search` with `limit`, pagination token/URL.
  - Get/Update a contact: `GET /contacts/{id}`, `PUT /contacts/{id}` (if we choose to persist derived fields).
  - Custom fields definitions: `GET /custom-fields` or `GET /locations/{locationId}/custom-fields` (to discover IDs/names).
- Strategy:
  - Discover `HL_NPN_FIELD_ID` and `HL_UPLINE_NPN_FIELD_ID` at startup by name, or read IDs from `.env`.
  - Paginate through all contacts for the first full build, filtering client-side to records where either `NPN` or `Upline NPN` is set.
  - Implement retry with backoff for 429/5xx.

## Hierarchy Build Algorithm
1. Fetch contacts snapshot (initial full pull or incremental since last run).
2. Normalize field values:
   - Trim, uppercase, strip non-digits for `npn/uplineNpn` if numeric-only policy applies.
3. Build indexes:
   - `npnToContactIds: Map<string, string[]>` (expect size 1, multiple signals duplicates)
   - `idToNode: Map<string, Node>` pre-seeded with `npn/uplineNpn` and display info
4. Link edges (bottom-up):
   - For each contact with `uplineNpn`, resolve `parentContactId` via `npnToContactIds[uplineNpn]`.
   - If multiple parents found, flag as `duplicateNpn`; choose best candidate by heuristic (e.g., contact with latest update or same location) and continue.
   - If not found, flag `uplineNotFound`.
5. Validate & sanitize:
   - Cycle detection: DFS or union-find with ancestor stack. If cycle detected, break the edge with the weakest confidence (e.g., recently changed `uplineNpn`) and flag.
   - Depth limit: set a sane max depth to avoid runaway trees (e.g., 25); if exceeded, truncate and flag `tooDeep`.
6. Compute derived values:
   - Roots = nodes with no parent. BFS/DFS to set `level`, `pathToRoot`, `subtreeSize`.
7. Persist outputs:
   - Write `hierarchy.json` (forest of roots with nested children, minimal fields for visualization).
   - Write `issues.json` with categorized lists: `missingNpn`, `duplicateNpn`, `uplineNotFound`, `cycleDetected`.
8. Optional write-backs:
   - Cache computed metadata locally (DB/file). Avoid writing back to HighLevel by default to keep fields authoritative and prevent drift.

### Pseudocode (Core Build)
```pseudo
contacts = fetchAllContacts()
for c in contacts:
  npn = normalize(c.customFields[NPN_FIELD_ID])
  up  = normalize(c.customFields[UPLINE_NPN_FIELD_ID])
  node = { id: c.id, npn: npn, uplineNpn: up, children: [] }
  idToNode[c.id] = node
  if npn: npnToContactIds[npn].push(c.id)

for node in idToNode.values():
  if node.uplineNpn:
    parents = npnToContactIds[node.uplineNpn]
    if !parents: flag(node, 'uplineNotFound'); continue
    parentId = chooseParent(parents) // heuristic if >1
    node.parentId = parentId
    idToNode[parentId].children.push(node.id)

roots = []
for node in idToNode.values():
  if !node.parentId: roots.push(node.id)

detectAndBreakCycles(idToNode, roots)
computeDerived(roots, idToNode)
writeOutputs(roots, idToNode)
```

## Visualization (Org Chart)
- Library options:
  - D3.js (tree/cluster layout), Dagre (directed acyclic graph), Cytoscape.js (large graphs), or specialized org chart libs.
- Features:
  - Search by name/email/NPN; highlight node and auto-expand path to root.
  - Expand/collapse subtrees; show counts for large downlines.
  - Hover tooltip with key fields; click to open contact in HighLevel.
  - Breadcrumb/path-to-root display; mini-map for large hierarchies.
- Data contract (`hierarchy.json`):
  - Minimal node payload: `id`, `label` (name + NPN), `children[]` (by reference or nested), `badges[]` (issue flags), `level`.

## Sync Strategy
- Initial Backfill:
  - Full pull of contacts; store a `lastSyncedAt` watermark.
- Incremental Updates:
  - Poll contacts updated since `lastSyncedAt` (if supported) or use webhooks (contact updated/created) to enqueue rebuild of affected branches.
  - On update of `NPN` or `Upline NPN`, recompute only impacted nodes (local re-link and affected ancestors/descendants) instead of full rebuild.
- Scheduling:
  - Nightly full validation job + on-demand partial rebuilds. Use exponential backoff for API errors.

## Error Handling & Data Quality
- Missing `NPN` on a contact with a set `Upline NPN` → flag `missingNpn`.
- Duplicate `NPN` values → flag `duplicateNpn`; report affected contacts; choose consistent parent to keep tree connected.
- `Upline NPN` not found → flag `uplineNotFound` and treat as temporary root.
- Cycles → detect and break edges deterministically, log details.
- Optional: Validate `NPN` format; optionally cross-verify with external NPN sources (e.g., NIPR) respecting licensing and compliance.

## Security & Compliance
- Store `HL_PRIVATE_API_KEY` only in `.env`/secrets manager. Never log it.
- Avoid persisting PII beyond what’s necessary for visualization. Mask or omit emails/phones in logs.
- Respect rate limits. Backoff on 429/5xx. Avoid parallel bursts that may trigger throttling.

## Testing Plan
- Unit tests for normalization, parent resolution, cycle detection, and incremental rebuild logic.
- Fixture-based tests with crafted edge cases: duplicates, orphans, cycles, deep trees, large breadth.
- Mock the HighLevel API for CI (record/replay or stub client).
- Manual smoke test against a sandbox location with ~100–1,000 contacts.

## Deployment & Operations
- Runner: small service/CLI (Node.js/TypeScript or Python) with `.env` config.
- Outputs: write to `data/hierarchy.json` and `data/issues.json` or to a DB key for the web app to read.
- Schedule via cron/Task Scheduler/GitHub Actions or a serverless function with a timed trigger.
- Observability: logs with request IDs; counters for records scanned, edges linked, issues by type, API errors, rebuild durations.

## Rollout Plan
1. Dry-run in staging: produce `hierarchy.json` and validate against a hand-checked sample.
2. Enable visualization read-only for internal users; gather feedback on correctness and UX.
3. Address data-quality issues; add duplicate resolution heuristics as needed.
4. Go live; monitor errors and performance; adjust page size/rate limits.

## Deliverables
- CLI/service to:
  - Fetch contacts and custom fields from HighLevel.
  - Build `hierarchy.json` and `issues.json` (and optionally cache state).
  - Provide a `--since` argument for incremental runs.
- Visualization component/page that consumes `hierarchy.json` and provides search, expand/collapse, and path highlighting.
- Configuration docs for `.env` and field setup.
- Operational docs: runbook, rate-limiting notes, troubleshooting.

## Acceptance Criteria
- Hierarchy accurately reflects `NPN`/`Upline NPN` relationships for 95%+ of contacts with sufficient data.
- All edge cases reported in `issues.json` with actionable categories.
- Org chart renders within 2 seconds for up to 5,000 nodes (baseline; may paginate large views).
- Sync job completes a full pass within agreed SLO (e.g., < 10 minutes for 20k contacts) without breaching API limits.

## Open Questions
- Should we persist any derived fields back to HighLevel (e.g., `Hierarchy Path` or `Level`) or keep them local only?
- How should we resolve duplicate NPNs (manual review workflow vs. automated heuristic)?
- Do we need multi-location hierarchy support or is one location the source of truth?
- Is NPN guaranteed to be person-unique across the entire org or only within a location?
- Any compliance constraints for showing certain fields in the visualization (e.g., phone/email)?

## Example API Calls (to confirm in docs)
Note: Paths may differ by API version; confirm in HighLevel Marketplace API docs before implementation.

```
GET https://services.leadconnectorhq.com/custom-fields
Headers:
  Authorization: Bearer <HL_PRIVATE_API_KEY>
  Version: 2021-07-28
  Location-Id: <HL_LOCATION_ID>

GET https://services.leadconnectorhq.com/contacts?limit=200
Headers:
  Authorization: Bearer <HL_PRIVATE_API_KEY>
  Version: 2021-07-28
  Location-Id: <HL_LOCATION_ID>

GET https://services.leadconnectorhq.com/contacts/search?query=<npn>&limit=1
Headers:
  Authorization: Bearer <HL_PRIVATE_API_KEY>
  Version: 2021-07-28
  Location-Id: <HL_LOCATION_ID>
```

## Next Steps
1. Confirm the exact HighLevel endpoints and headers in the Marketplace API docs. IDs captured — see "Confirmed Custom Field IDs" below.
2. Choose runtime (TypeScript or Python) and set up a small client with pagination + retries.
3. Implement the builder with cycle detection and issue reporting.
4. Produce `hierarchy.json`/`issues.json` locally and wire a quick visualization.
5. Iterate on UX and data quality; then schedule recurring syncs.

## Field Mapping Update (Equita/Quility)
- Upline fields of record:
  - Display name: `Upline Code Equita` → env: `HL_UPLINE_CODE_EQUITA_FIELD_ID`
  - Display name: `Upline Code Quility` → env: `HL_UPLINE_CODE_QUILITY_FIELD_ID`
- Agent identifier:
  - Display name: `NPN` / `National Producer Number` → env: `HL_NPN_FIELD_ID` (use to uniquely identify contacts).

### Parent Resolution Logic
- Read both upline fields; normalize values by trimming and stripping non-digits.
- Precedence (configurable): use `Upline Code Equita` first; if empty, use `Upline Code Quility`.
- If both are present and differ after normalization, flag `uplineConflict` and choose the one set by precedence (still continue).
- Resolve parent by matching the chosen upline value to a contact whose `NPN` equals that value.
- If no match found, flag `uplineNotFound` and treat the node as a temporary root.

### Data Model Additions
- Node fields extended with:
  - `uplineEquitaRaw`, `uplineQuilityRaw` (original values for audit)
  - `uplineConflict` (boolean)

### Normalization Rules
- `npn`: remove all non-digits; if empty after stripping, treat as missing.
- `upline codes`: remove all non-digits; if the result looks like an `npn` (>=6 digits), treat as an NPN candidate. Keep raw form for auditing.

### Environment & Config Additions
- `.env`:
  - `HL_UPLINE_CODE_EQUITA_FIELD_ID=<id>`
  - `HL_UPLINE_CODE_QUILITY_FIELD_ID=<id>`
- Optional precedence override:
  - `HL_UPLINE_PREFERRED_SOURCE=equita|quility`

### Pseudocode Delta
```pseudo
for c in contacts:
  npn = normalizeDigits(valueOf(c, HL_NPN_FIELD_ID))
  upEq = normalizeDigits(valueOf(c, HL_UPLINE_CODE_EQUITA_FIELD_ID))
  upQu = normalizeDigits(valueOf(c, HL_UPLINE_CODE_QUILITY_FIELD_ID))
  selectedUp = selectByPrecedence(upEq, upQu, pref=HL_UPLINE_PREFERRED_SOURCE)
  node = { id: c.id, npn, uplineEquitaRaw: upEq, uplineQuilityRaw: upQu }
  node.uplineNpn = selectedUp

link parent via: parentId = first(npnToContactIds[node.uplineNpn])
if none → flag uplineNotFound
if both upEq and upQu present and upEq != upQu → flag uplineConflict
```

### Testing Scenarios (Added)
- Only `Upline Code Equita` set → resolves correctly.
- Only `Upline Code Quility` set → resolves correctly.
- Both set and equal → resolves; no conflict.
- Both set and different → flags `uplineConflict`; honors precedence.
- Upline code set but no contact has matching `NPN` → `uplineNotFound`.

### Open Questions (Updated)
- Do `Upline Code Equita`/`Quility` always contain NPNs, or can they contain non-NPN vendor codes? If vendor codes are possible, do we have direct contact fields for each agent’s own `Equita Code` / `Quility Code` to support mapping?
- Which source should win if both upline fields are populated with different values? Is Equita-first acceptable, or should this be location-configurable?

## Confirmed Custom Field IDs
- Location: `nEEiHT9n7OPxFnBZIycg`
- Source: `GET https://services.leadconnectorhq.com/locations/{locationId}/customFields` with headers `Authorization: Bearer <token>` and `Version: 2021-07-28`.

- `HL_NPN_FIELD_ID`
  - id: `AlXLQ8VFgdbDMzGJ1uOR`
  - fieldKey: `contact.onboarding__npn`
  - name: `Onboarding | NPN`
  - dataType: `TEXT`

- `HL_UPLINE_CODE_EQUITA_FIELD_ID`
  - id: `GM3pByQqhumadxL42TW4`
  - fieldKey: `contact.upline_code_equita`
  - name: `Upline Code Equita`
  - dataType: `CHECKBOX`

- `HL_UPLINE_CODE_QUILITY_FIELD_ID`
  - id: `OlclNe3DpHXj2MVIJJJM`
  - fieldKey: `contact.upline_code_quility`
  - name: `Upline Code Quility`
  - dataType: `CHECKBOX`

### .env Mapping (example)
```
HL_LOCATION_ID=nEEiHT9n7OPxFnBZIycg
HL_NPN_FIELD_ID=AlXLQ8VFgdbDMzGJ1uOR
HL_UPLINE_CODE_EQUITA_FIELD_ID=GM3pByQqhumadxL42TW4
HL_UPLINE_CODE_QUILITY_FIELD_ID=OlclNe3DpHXj2MVIJJJM
```

## Location-Specific Field Analysis (nEEiHT9n7OPxFnBZIycg)
- Total contact custom fields discovered: 26
- Key identifiers and link candidates:
  - Agent NPN → `contact.onboarding__npn` (TEXT, id: `AlXLQ8VFgdbDMzGJ1uOR`)
  - SureLC/Producer ID → `contact.onboarding__producer_number` (TEXT, id: `DJET2KZt9Ym6zpXFJnna`)
  - Upline Producer ID (parent key, ambiguous) → `contact.upline_producer_id` (TEXT, id: `TobxJaosIfFMoD1q40dN`)
  - Upline Email → `contact.onboarding__upline_email` (TEXT, id: `3tFAgS0tMSUjkJNjXqNd`)
  - Upline Name → `contact.upline_name` (TEXT, id: `H6JJZzCEGinqUyazbtXk`)
  - Upline Highest Stage → `contact.upline_highest_stage` (TEXT, id: `UljRAabJTITzaElafGCK`)
  - Aggregator flags → `contact.upline_code_equita` (CHECKBOX, id: `GM3pByQqhumadxL42TW4`), `contact.upline_code_quility` (CHECKBOX, id: `OlclNe3DpHXj2MVIJJJM`)
- Additional contact-card fields (useful for display/badges):
  - Licensing State → `contact.onboarding__licensing_state` (TEXT, id: `IhZWa68rJ4zC337fJo6j`)
  - Licensed? → `contact.onboarding__licensed` (CHECKBOX, id: `HrtsIFYkxjCszQI2Rxlc`)
  - XCEL status → `onboarding__xcel_*` (various CHECKBOX/TEXT/DATE):
    - Account Created `q9MmEcDr01pJlLO334JH`, Started `tbttl0jdYgNFeqi7Licg`, Paid `JjKtVp5msKsaB9gIrKiF`, Username `4a0V6WKqYNXYhCw9BLf2`, Temp Password `XZvDgZSAXBd9TgsCVQdM`, Enrollment Date `byYuPzDYowni2YrXO903`, Due Date `AVT26Sauj4eGeJzQGcGH`, Last Touch `b57wV6CKG35SeTDLIr4A`
  - Comp Level (MRFG) → `contact.onboarding__comp_level_mrfg` (TEXT, id: `ef87u0eDn6TXEPh92fbM`)
  - Comp Level Link → `contact.comp_level_link` (TEXT, id: `v9iRoqruOUc0kiM0KU7N`)
  - Comp Notes → `contact.custom_comp_level_notes` (LARGE_TEXT, id: `lYqYDnPcbhYXaAQPtZEy`)
  - Quility Profile Created → `contact.onboarding__quility_profile_created` (CHECKBOX, id: `rUZk7WzOjuhWaPjtooKo`)
  - Equita Profile Created → `contact.onboarding__equita_profile_created` (CHECKBOX, id: `HCLsdy4XpV4elDRZjmu0`)
  - Data hygiene note: there are two custom fields for phone: `contact.phone_number` (id: `51I4406sucXEBJOpWPHq`) and a misspelled `contact.phone_numer` (id: `nYBXNNINEE6ynzsRIN6t`). Prefer the standard contact phone over either; if needed, consolidate to the correctly spelled field.

### Implications for Hierarchy Linking
- The two "Upline Code" fields are CHECKBOX flags, not codes/IDs. They should not be used as the parent key.
- Use a multi-source linking strategy:
  1. Try to match `upline_producer_id` to some contact's `NPN` (digits-only compare).
  2. If no match, try to match `upline_producer_id` to some contact's `SureLC ID`.
  3. If still no match, use `upline_email` to match by email.
  4. Otherwise flag `uplineNotFound`.
- Record `uplineSource` = `npn | surelc | email | unknown` and an `uplineConfidence` score for audit.

### Contact Card Schema (for Org Chart Nodes)
- Primary: name, title/role (optional), avatar initials.
- Key fields: `NPN`, `Licensing State`, `Comp Level (MRFG)`.
- Badges: `Licensed`, `Equita`, `Quility`, `Quility Profile Created`, `Equita Profile Created`.
- XCEL chip: derive status from Started/Paid/AccountCreated + dates.
- Tooltip/expand: `SureLC ID`, `Upline Name`, `Upline Highest Stage`, `Comp Notes` (truncate in card, full in tooltip).

### Org Chart Rendering Notes
- Forest support: multiple roots when `uplineNotFound` or top-level agents.
- Node layout similar to the provided image; allow expand/collapse per subtree.
- Highlight path-to-root on hover; show `uplineSource` in a subtle label for debugging.

### Updated TODOs (Supersedes prior Equita/Quility mapping section)
- Add env keys for link sources:
  - `HL_UPLINE_LINK_FIELD_ID=TobxJaosIfFMoD1q40dN`
  - `HL_UPLINE_EMAIL_FIELD_ID=3tFAgS0tMSUjkJNjXqNd`
  - `HL_SURELC_ID_FIELD_ID=DJET2KZt9Ym6zpXFJnna`
  - Optional display: `HL_UPLINE_NAME_FIELD_ID=H6JJZzCEGinqUyazbtXk`, `HL_UPLINE_HIGHEST_STAGE_FIELD_ID=UljRAabJTITzaElafGCK`
- Implement the revised linking heuristic and flags.
- Backfill data quality: standardize `upline_producer_id` to NPN where feasible.
- Decide whether to remove/deprecate the misspelled `phone_numer` field.

### Full Field Inventory (Contact Model)
- `contact.phone_numer` — Phone Numer — TEXT — id: `nYBXNNINEE6ynzsRIN6t`
- `contact.phone_number` — Phone Number — TEXT — id: `51I4406sucXEBJOpWPHq`
- `contact.onboarding__licensed` — Onboarding | Licensed — CHECKBOX — id: `HrtsIFYkxjCszQI2Rxlc`
- `contact.onboarding__npn` — Onboarding | NPN — TEXT — id: `AlXLQ8VFgdbDMzGJ1uOR`
- `contact.onboarding__licensing_state` — Onboarding | Licensing State — TEXT — id: `IhZWa68rJ4zC337fJo6j`
- `contact.onboarding__upline_email` — Onboarding | Upline Email — TEXT — id: `3tFAgS0tMSUjkJNjXqNd`
- `contact.onboarding__cluster_applies` — Onboarding | Cluster Applies — TEXT — id: `PRPFFt9rbWciQRX5R2ye`
- `contact.onboarding__equita_profile_created` — Onboarding | Equita Producer Number — CHECKBOX — id: `HCLsdy4XpV4elDRZjmu0`
- `contact.upline_producer_id` — Upline Producer ID — TEXT — id: `TobxJaosIfFMoD1q40dN`
- `contact.onboarding__quility_profile_created` — Onboarding | Quility Profile Created — CHECKBOX — id: `rUZk7WzOjuhWaPjtooKo`
- `contact.upline_name` — Upline Name — TEXT — id: `H6JJZzCEGinqUyazbtXk`
- `contact.upline_highest_stage` — Upline Highest Stage — TEXT — id: `UljRAabJTITzaElafGCK`
- `contact.onboarding__xcel_account_created` — Onboarding | XCEL Account Created — CHECKBOX — id: `q9MmEcDr01pJlLO334JH`
- `contact.onboarding__xcel_username_email` — Onboarding | XCEL Username (Email) — TEXT — id: `4a0V6WKqYNXYhCw9BLf2`
- `contact.onboarding__comp_level_mrfg` — Onboarding | Comp Level (MRFG) — TEXT — id: `ef87u0eDn6TXEPh92fbM`
- `contact.onboarding__xcel_temp_password` — Onboarding | XCEL Temp Password — TEXT — id: `XZvDgZSAXBd9TgsCVQdM`
- `contact.comp_level_link` — Comp Level Link — TEXT — id: `v9iRoqruOUc0kiM0KU7N`
- `contact.custom_comp_level_notes` — Custom Comp Level Notes — LARGE_TEXT — id: `lYqYDnPcbhYXaAQPtZEy`
- `contact.xcel_enrollment_date` — XCEL Enrollment Date — DATE — id: `byYuPzDYowni2YrXO903`
- `contact.xcel_due_date` — XCEL Due Date — DATE — id: `AVT26Sauj4eGeJzQGcGH`
- `contact.xcel_last_touch` — XCEL Last Touch — DATE — id: `b57wV6CKG35SeTDLIr4A`
- `contact.onboarding__xcel_started` — Onboarding | XCEL Started — CHECKBOX — id: `tbttl0jdYgNFeqi7Licg`
- `contact.onboarding__xcel_paid` — Onboarding | XCEL Paid — CHECKBOX — id: `JjKtVp5msKsaB9gIrKiF`
- `contact.onboarding__producer_number` — Onboarding | SureLC ID — TEXT — id: `DJET2KZt9Ym6zpXFJnna`
- `contact.upline_code_equita` — Upline Code Equita — CHECKBOX — id: `GM3pByQqhumadxL42TW4`
- `contact.upline_code_quility` — Upline Code Quility — CHECKBOX — id: `OlclNe3DpHXj2MVIJJJM`

### Implementation Steps (This Location)
- Fetch custom field dictionary once per run via `GET /locations/{locationId}/customFields` and build `id → fieldKey` map.
- Pull contacts (paginated) and build quick indexes: `npnIndex`, `surelcIndex`, `emailIndex`.
- For each contact, extract `npn`, `surelcId`, `upline_producer_id`, `upline_email`, aggregator flags, licensing state, comp data.
- Apply linking heuristic (NPN → SureLC → Email) and set `parentId`, `uplineSource`, `uplineConfidence`.
- Validate graph: detect cycles; break lowest-confidence edge; emit `issues.json`.
- Output:
  - `hierarchy.json` ready for the org-chart renderer (forest of roots with children arrays).
  - `issues.json` with `missingNpn`, `uplineNotFound`, `duplicateNpn`, `conflictingLinks`.
- UI: render cards per schema above; show breadcrumbs to root and quick filter by badges (Equita/Quility/Licensed/XCEL state).

## Frontend/UI Integration Plan
- Goal: Replace mocks with live HighLevel data and render an interactive org chart + dashboard similar to the provided design.

### Data Flow
- Client triggers a refresh or first-load → Serverless fetches HighLevel contacts and builds a hierarchy snapshot → Client fetches `hierarchy.json` + `issues.json` + `stats.json` for rendering.
- Snapshot cadence: on-demand via button and optionally scheduled (Vercel cron).

### Serverless Endpoints
- `GET /api/ghl/custom-fields` → proxy to `GET {HL_API_BASE}/locations/{HL_LOCATION_ID}/customFields`.
- `GET /api/ghl/contacts?limit=&cursor=` → proxy to HL contacts search/list with pagination.
- `POST /api/ghl/refresh` → builds snapshot in-memory and returns `{ hierarchy, issues, stats, generatedAt }`.
- `GET /api/ghl/hierarchy` → returns last built snapshot.
- `GET /api/ghl/issues` → returns last issues summary.
- `GET /api/ghl/stats` → returns counts for cards (branches, producers, enhanced).
- Headers: `Authorization: Bearer ${HL_PRIVATE_API_KEY}`, `Version: 2021-07-28`, `Location-Id: ${HL_LOCATION_ID}`.

### Builder Outputs
- `hierarchy`: forest array of nodes `{ id, label, npn, children[], badges, metrics }`, includes `uplineSource`, `uplineConfidence`, `descendantCount`.
- `issues`: counters + lists for `missingNpn`, `uplineNotFound`, `duplicateNpn`, `cycleDetected`.
- `stats`: `{ branches, producers, enhanced }` where:
  - `branches` = number of roots (no parent).
  - `producers` = unique contacts with an `npn`.
  - `enhanced` = contacts with either `upline_code_equita` or `upline_code_quility` checked.

### Client Wiring (React)
- Replace mocks in `src/pages/UplineHierarchyPage.tsx` with live fetches:
  - Remove `mockHierarchy`, `mockIssues`, `syncTimeline` and stats mocks; replace with hooks that call `/api/ghl/hierarchy`, `/api/ghl/issues`, `/api/ghl/stats`.
  - Add `Refresh Snapshot` button to POST `/api/ghl/refresh` then refetch.
  - Add `Export` button to download `hierarchy.json`.
- Use existing layout components/styles to render nodes and side panels. Target files:
  - `src/pages/UplineHierarchyPage.tsx` (top-level page wiring)
  - `src/components/OrgChart.tsx` (progressive tree rendering; optional reuse)
  - `src/lib/transform.ts` (indexing/search helpers)
  - `src/lib/types.ts` (add `GHLContact`, `HierarchyNode`, `HierarchySnapshot` types)

### UI Behavior Mapping
- Search: filter by `npn` or contact name; expand path-to-root for matches.
- Vendor filter: `Equita | Quility | Combined` → filter nodes where badges include the vendor or show all when `Combined`.
- Issues only: filter to subtrees containing any issue flags; show issue badges on cards.
- Compliance view: highlight nodes not `Licensed` or missing `Licensing State`/XCEL milestones.
- Show agent counts: toggle display of `descendantCount` on cards.

### Status & Badges
- `ACTIVE` if `onboarding__licensed=true` OR recent XCEL activity; `PENDING` otherwise.
- Badges: `Equita` when `upline_code_equita=true`, `Quility` when `upline_code_quility=true`.
- Additional chips: `XCEL` (derived), `Profile Created` flags.

### Performance
- Do heavy lifting in serverless (snapshot build) to keep UI snappy.
- Paginate HL contacts (200 per page) with backoff; cache last snapshot and ETag.
- Lazy-render large trees with expand/collapse; compute `descendantCount` in builder to avoid O(n) per expand.

### Security
- Never expose `HL_PRIVATE_API_KEY` to the browser; only the serverless layer touches HighLevel.
- Validate `locationId` server-side; no user-provided tokens.

### Implementation Phases
- P1: Add serverless `api/ghl/*` endpoints and builder; wire UplineHierarchyPage to live data; counters + export.
- P2: Add issues-only/compliance view; path highlighting; search expand.
- P3: Upload Mapping (CSV) to correct `upline_producer_id` and backfill; cron snapshot.
