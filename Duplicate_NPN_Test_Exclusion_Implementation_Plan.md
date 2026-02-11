# Duplicate NPN Upline Resolution Plan (Test-Data Exclusion)

## Goal

Ensure contacts with a duplicate `uplineProducerId` are attached to the correct real upline when one duplicate is test data, without deleting test records.

## Problem We Are Solving

Current hierarchy resolution treats all duplicate NPN candidates equally.  
Example: `uplineProducerId = 21625599` matches both:

- `Lesley Fuentes` (real)
- `VEE TEST` (test data)

Because the match is ambiguous, contacts like `Eros Nedd` and `Adam Bajjey` are assigned via synthetic duplicate handling instead of directly under Lesley.

Impact:

- Real contacts can appear under synthetic/fallback paths.
- Downline placement looks incorrect for business users.
- Test records influence production hierarchy decisions.

## Proposed Solution

Add a **candidate filtering layer** during upline matching in `api/ghl/snapshot.js`:

1. Identify likely test/sandbox contacts.
2. Exclude those contacts from parent-candidate selection.
3. If exactly one valid non-test candidate remains, assign it directly.
4. If multiple valid non-test candidates remain, keep existing duplicate handling behavior.
5. Keep test contacts visible in the hierarchy; they are excluded only as upline matching candidates.

## Why This Works

- Preserves data (no deletion).
- Keeps tree model intact (single parent).
- Produces deterministic parent resolution for real records.
- Limits scope to backend matching logic; UI remains stable.

## Implementation Scope

### Backend

File: `api/ghl/snapshot.js`

Additions:

1. Test-contact detection utility
- Reuse/extend existing `isLikelyTestRootCandidate(...)` pattern into a general predicate.
- Candidate signals:
  - Name contains `test` (case-insensitive normalized text)
  - Licensing state indicates test/sandbox values
  - Optional env override list (recommended)

2. Candidate filtering before uniqueness checks
- Apply filter to candidate arrays from:
  - `npnIndex.get(node.uplineProducerId)`
  - `surelcIndex.get(node.uplineProducerId)`
  - `emailIndex.get(node.uplineEmail)` (optional but recommended for consistency)

3. Keep current fallback logic unchanged
- If no valid non-test candidate remains, preserve current behavior:
  - synthetic grouping
  - root fallback
  - issue flags

4. Diagnostics metadata (recommended)
- Add optional debug fields in snapshot responses for traceability:
  - `matchingCandidatesRaw`
  - `matchingCandidatesFiltered`
  - `excludedAsTestCount`

### Optional Config

Add optional env vars (safe defaults if absent):

- `HL_UPLINE_EXCLUDE_TEST_CANDIDATES=1`
- `HL_TEST_CONTACT_ID_ALLOWLIST` / `HL_TEST_CONTACT_ID_BLOCKLIST`
- `HL_TEST_EMAIL_PATTERNS` (comma-separated)

This allows tuning without code edits.

## Step-by-Step Plan

1. Add generalized `isLikelyTestContact(node)` helper in `snapshot.js`.
2. Add `filterParentCandidates(ids)` helper:
- remove self
- remove test/excluded candidates
- preserve deterministic order
3. Update NPN matching path to use filtered candidates first.
4. Update SureLC matching path to use filtered candidates first.
5. Update email fallback path similarly (if implemented).
6. Keep duplicate/synthetic and fallback logic as secondary path.
7. Add lightweight debug logging behind a debug flag.
8. Run snapshot verification script before/after and compare:
- `uplineSource` counts
- specific cases (`Eros Nedd`, `Adam Bajjey`)
9. Update docs in `Hierarchy_Logic_Rules.md`.

## Test Plan

### Target Case

For `uplineProducerId = 21625599`:

- `VEE TEST` should be excluded from parent candidate matching.
- `Lesley Fuentes` should become unique candidate.
- `Eros Nedd` and `Adam Bajjey` should resolve directly under Lesley (`uplineSource = npn`).

### Regression Checks

1. No runtime errors in `/api/ghl/snapshot`.
2. Existing non-duplicate NPN matches unchanged.
3. Duplicate NPN groups still appear when real ambiguity remains.
4. Fallback behavior still works for unresolved uplines.
5. Visual hierarchy renders without synthetic group card regressions.

### Commands

- `npm run typecheck`
- `npm run build`
- existing snapshot analysis scripts:
  - `node scripts/ghl-upline-analysis.mjs`
  - custom verification for specific contacts/NPNs

## Risks and Mitigations

Risk: False-positive "test" detection excludes real contacts.  
Mitigation: Start with conservative rules + env-based explicit blocklist.

Risk: Different teams rely on current synthetic behavior.  
Mitigation: Feature flag (`HL_UPLINE_EXCLUDE_TEST_CANDIDATES`) with staged rollout.

Risk: Hidden ambiguity still exists among non-test records.  
Mitigation: Keep current duplicate grouping fallback for true ambiguity.

## Rollout Strategy

1. Implement behind feature flag (off by default).
2. Enable in local/dev and validate known cases.
3. Enable in staging and compare snapshot metrics.
4. Enable in production after sign-off.

## Acceptance Criteria

1. Contacts with `uplineProducerId=21625599` resolve to `Lesley Fuentes` when test filtering is enabled.
2. `VEE TEST` remains visible in hierarchy but is not selected as parent candidate.
3. No regression in tree generation, pagination, search, inspector, export.
4. Documented behavior in `Hierarchy_Logic_Rules.md`.

## Out of Scope (for this plan)

- Converting hierarchy from tree to DAG (multi-parent structure).
- Automatic data cleanup/merge of duplicate records in source system.
- Hard deletion of test contacts.
