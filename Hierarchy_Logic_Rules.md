# Hierarchy Logic Rules (Current Implementation)

## Scope

This document explains the hierarchy logic currently used by the application, including:

- How contacts are linked into parent/child relationships
- Which fields are used and in what order
- How duplicates and missing data are handled
- Why synthetic/group nodes appear
- What happens when Upline NPN is updated

This reflects the current behavior in `api/ghl/snapshot.js` and the Visual Hierarchy UI flow.

## Source of Truth and Data Flow

1. The UI (`VisualHierarchyPage`) requests `/api/ghl/snapshot`.
2. Backend builds hierarchy in `buildSnapshot(...)` (`api/ghl/snapshot.js`).
3. UI renders the returned tree; it does not recompute parentage.
4. ELK layout in the frontend controls visual positioning only (not parent/child logic).

## Inputs Used Per Contact

Primary identity fields:

- `contact.onboarding__npn` -> contact NPN (normalized to digits)
- `contact.onboarding__producer_number` -> SureLC producer id (normalized to digits)
- contact email (normalized to lowercase)

Upline fields:

- `contact.upline_producer_id` (preferred)
- Fallback: `contact.onboarding__upline_npn`
- `contact.onboarding__upline_email`
- `contact.upline_name` (display context only)
- `contact.upline_highest_stage` (display context only)

Root/fallback configuration:

- `HL_ROOT_UPLINE_NPN` (default `18550335`)
- `HL_ROOT_CONTACT_ID` (optional hard pin)
- `HL_ROOT_CONTACT_EMAIL` (optional tie-breaker)
- `HL_UPLINE_EXCLUDE_TEST_CANDIDATES` (optional; when enabled, likely test contacts are excluded as parent-match candidates)

## Normalization Rules

- NPN and upline producer id values are normalized to digits only.
- Emails are normalized to lowercase/trimmed.
- Empty or non-digit upline producer ids become effectively unusable for NPN matching.

## Core Matching Indexes

During snapshot build, the system creates lookup indexes:

- `npnIndex`: NPN -> contact ids
- `surelcIndex`: SureLC producer id -> contact ids
- `emailIndex`: email -> contact ids

These indexes power parent selection.

## Parent Assignment Precedence (Most Important Section)

For each node, parent is assigned in this order:

1. **Upline producer id -> NPN match (primary rule)**
   - If `HL_UPLINE_EXCLUDE_TEST_CANDIDATES=1`, likely test contacts are removed from candidate matching first.
   - If `uplineProducerId` matches exactly one other contact NPN, parent = that contact.
   - `uplineSource = "npn"`, confidence `0.95`.

2. **If NPN match is ambiguous (duplicates)**
   - If the upline id equals configured root NPN and a fallback root exists, parent = fallback root.
   - Otherwise, parent may become an `npn-group:<npn>` synthetic group node.
   - `uplineSource = "synthetic"` in group-node case.

3. **Fallback to SureLC id matching**
   - If NPN matching failed, same `uplineProducerId` is attempted against `surelcIndex`.
   - Candidate filtering for likely test contacts also applies here when flag is enabled.
   - If unique: `uplineSource = "surelc"`, confidence `0.85`.
   - Ambiguous handling mirrors duplicate behavior above (group node/root special case).

4. **Email fallback (only when no upline producer id exists)**
   - If no `uplineProducerId` and `uplineEmail` exists, match by email.
   - Candidate filtering for likely test contacts also applies here when flag is enabled.
   - `uplineSource = "email"`, confidence `0.6`.

5. **Fallback root assignment**
   - If still unresolved and `uplineProducerId` exists, attach to fallback root.
   - `uplineSource = "fallback"`, confidence `0.4`.

6. **Mark unresolved uplines**
   - If raw upline fields exist but no parent found before final tree assembly, contact is flagged `uplineNotFound`.

## Fallback Root Selection Logic

Fallback root (`fallbackRootId`) is chosen in this order:

1. `HL_ROOT_CONTACT_ID` if present and valid (non-synthetic)
2. `HL_ROOT_CONTACT_EMAIL` match if configured
3. First candidate from `HL_ROOT_UPLINE_NPN` group, preferring non-synthetic and non-test records

After assignment passes, any remaining parentless non-root nodes may be attached under fallback root to keep a connected tree.

## Duplicate NPN Handling

When multiple real contacts share one NPN:

- The system may create `npn-group:<npn>` synthetic nodes.
- Members of that duplicate set can be grouped under this node.
- This avoids arbitrarily picking one duplicate as the canonical parent.

Special root rule:

- For duplicate records in the configured root NPN group, the chosen fallback root contact remains top root; other duplicates are grouped beneath it.

## Synthetic Nodes You May See

Two synthetic node types are intentionally created:

1. `upline:<id>`
   - Placeholder when contacts reference an upline id not found in known NPN/SureLC contacts.
2. `npn-group:<npn>`
   - Grouping node for duplicate NPN disambiguation.

These nodes are used for structural clarity and to preserve relationship intent.

## Cycle Prevention

Before assigning a parent, logic checks whether the edge would create a cycle.

- If a cycle would be introduced, the parent link is skipped and contact is marked in cycle issue tracking.

## Status and Issue Flags (Output Metadata)

Node status:

- `ACTIVE` if licensed
- `PENDING` if xcel started/paid but not licensed
- `INACTIVE` otherwise

Issue flags include:

- `missingNpn`
- `duplicateNpn`
- `uplineNotFound`
- `cycleBreak`

## What the Visual Diagram Does (and Does Not Do)

The visual page:

- Uses backend-provided tree as truth
- Flattens synthetic duplicate grouping nodes (`npn-group:*`) so they are not rendered as standalone contact cards
- Attaches grouped duplicate members directly under the visible parent and marks them as duplicate records in-card
- Converts `children` into graph edges
- Uses ELK for node placement (left/right spacing and vertical layering)

The visual layer does **not** decide who reports to whom.

## Behavior When Upline NPN Is Changed

When user edits upline value from UI:

1. UI calls `/api/ghl/update-upline-producer-id`
2. Value is normalized to digits
3. Field `contact.upline_producer_id` is updated
4. UI refreshes snapshot
5. Contact is re-evaluated using precedence rules above

Expected outcomes:

- Unique NPN match -> moves directly under that upline
- Duplicate target NPN -> may move under `npn-group:<npn>`
- No match -> fallback handling (and possibly root)
- Non-digit value -> cannot be matched as NPN

## Practical Interpretation

- The hierarchy is **primarily upline-NPN-driven**.
- It is **not exclusively direct-parent-by-NPN** in all cases due to duplicate handling, synthetic grouping, root fallback, and data quality exceptions.
- Editing Upline NPN usually moves a contact to the expected branch after snapshot refresh, provided the value is numeric and resolvable.
