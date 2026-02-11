# Hierarchy Tree UX Review & Improvement Plan

## Context

The hierarchy tree visualizes ~191 agency contacts using ReactFlow + ELK.js layout. The tree supports expand/collapse, global pagination (8 children per page), search/focus, and a "Show All" mode. Users have reported the tree being "buggy" — the root causes are: blank canvas when clicking between nodes, upline saves not reflecting in the tree, a confusing global pagination model, layout instability during state transitions, and performance degradation at scale.

---

## Identified Issues (Prioritized)

### P0 — Critical Bugs (broken/incorrect behavior)

#### 1. Blank canvas when clicking between nodes (RACE CONDITION) — IMPLEMENTED
**Files:** [HierarchyCanvas.tsx](src/components/hierarchy/HierarchyCanvas.tsx), [VisualHierarchyPage.tsx](src/pages/VisualHierarchyPage.tsx), [ErrorBoundary.tsx](src/components/hierarchy/ErrorBoundary.tsx)
**Symptom:** Click one contact, then click another — the entire tree canvas and sidebar go blank.
**Root cause — layout race condition:** The ELK layout runs asynchronously in a `useEffect`. `flowNodes` starts as `useState<Node[]>([])`. When clicking between nodes rapidly, previous layouts get cancelled before `setFlowNodes()` runs, leaving the canvas blank.
**Root cause — uncaught throw in baseNodes:** Threw `new Error(...)` if `visibleTraversal` contained a stale node ID. No error boundary to catch this.

**Changes made:**
- Replaced the `throw` in `baseNodes` memo with a defensive `continue` + `console.warn` — missing nodes are skipped instead of crashing
- Added 60ms debounce to the layout effect — prevents rapid state changes from starting/cancelling layouts
- On layout cancel, previous `flowNodes` are preserved (not cleared) — canvas never goes blank
- On ELK layout failure, catches the error and keeps previous layout visible
- Extracted `FocusOnSelection` to a standalone component outside the render body (fixes ref remount bug)
- Added `<HierarchyErrorBoundary>` around `<HierarchyCanvas>` with a retry button

#### 2. Upline NPN save does not refresh the tree — IMPLEMENTED
**Files:** [VisualHierarchyPage.tsx](src/pages/VisualHierarchyPage.tsx), [api/ghl/snapshot.js](api/ghl/snapshot.js)
**Symptom:** User edits the upline NPN ID, clicks save, the save succeeds (spinner completes), but the tree doesn't reflect the new parent-child relationship.

**Changes made:**
- Added cache-busting timestamp `_t=` param + `Cache-Control: no-cache` request header to `fetchSnapshotData()`
- Added `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` + `Pragma: no-cache` response headers to `api/ghl/snapshot.js`
- Added 1-second delay after `updateUplineProducerId()` before calling `fetchSnapshot()` to allow GHL propagation
- Added `isRefreshFromSaveRef` flag — when set, the snapshot rebuild effect preserves current `expandedIds` (pruned to valid IDs) instead of resetting to localStorage/expand-all. Applied to all three save handlers (upline, carrier company name, carrier agent number)

#### 3. FocusOnSelection component defined inside render body — IMPLEMENTED (part of #1)
**File:** [HierarchyCanvas.tsx](src/components/hierarchy/HierarchyCanvas.tsx)
**Changes made:** Extracted `FocusOnSelection` to a standalone component with proper `FocusOnSelectionProps` type. Receives `activeNodeId`, `focusNonce`, and `flowNodes` as props. Ref now persists correctly across renders.

#### 4. Collapse All doesn't reset pagination index
**File:** [VisualHierarchyPage.tsx:1849](src/pages/VisualHierarchyPage.tsx#L1849)
**Problem:** The "Collapse" button sets `expandedIds` to root IDs only, but does not reset `childPageIndex` to 0. When the user later re-expands a node, they see page N (wherever they left off) instead of page 1, which is disorienting.
**Fix:** In the Collapse button's onClick, also call `setChildPageIndex(0)` and `setChildPageOverrides(new Map())`.

#### 5. fitView fires on every layout recomputation
**Files:** [HierarchyCanvas.tsx:261-262](src/components/hierarchy/HierarchyCanvas.tsx#L261-L262), [VisualHierarchyPage.tsx:1618-1628](src/pages/VisualHierarchyPage.tsx#L1618-L1628)
**Problem:** Two separate fitView triggers compound to make the viewport "jumpy":
- The `fitView` prop is always `true` on `<ReactFlow>` (line 261), which re-fits on every node change
- A `useEffect` (line 1618) calls `handleFocusRoot()` with a 150ms timeout every time `childPageIndex` or `showAllChildren` changes — but this fires **before** the ELK layout completes, so it fits to stale/empty nodes
- The `skipNextFitViewRef` workaround (line 1620) only skips one fitView, but multiple can be queued

**Fix:** Remove `fitView` from the ReactFlow props. Remove the auto-fitView effect (line 1618-1628). Instead, call `reactFlowInstance.fitView()` only on: (a) initial load, (b) user clicking "Fit" button. Use a ref to track if initial fit has occurred.

#### 6. scopeRootId validation race after snapshot refresh — IMPLEMENTED
**File:** [HierarchyCanvas.tsx](src/components/hierarchy/HierarchyCanvas.tsx)
**Changes made:** Added a `safeScopeRootId` computed value that validates `scopeRootId` against `graph.nodesById` before use. `visibleTraversal` now uses `safeScopeRootId` — if the scope points to a node that doesn't exist in the current graph, it falls back to `graph.rootIds` immediately (same render cycle, no race). Combined with the defensive `baseNodes` filter (from #1), stale IDs can never cause a crash.

#### 7. PREV/NEXT pagination doesn't update tree after selecting a contact — IMPLEMENTED
**Files:** [VisualHierarchyPage.tsx — handleGlobalPagination](src/pages/VisualHierarchyPage.tsx), [HierarchyCanvas.tsx — visibleTraversal](src/components/hierarchy/HierarchyCanvas.tsx)
**Symptom:** Select a contact card, then click PREV or NEXT. The "Page X/Y" counter updates but the tree diagram does not change — it stays stuck showing the same nodes.
**Root cause:** When a user clicks a contact, `focusNode()` writes per-node page overrides into `childPageOverrides` (a `Map<string, number>`) for each ancestor in the path. These overrides ensure the selected node's branch is visible. In `visibleTraversal` (HierarchyCanvas), the pagination logic is:
```
const overrideIndex = childPageOverrides?.get(id);
const windowIndex = Math.min(overrideIndex ?? childPageIndex, ...);
```
The `??` operator means: **if an override exists for this node, use it; otherwise use the global `childPageIndex`**. When the user clicks NEXT, `handleGlobalPagination` increments `childPageIndex` but does **not** clear `childPageOverrides`. So for every node that has an override (set during the earlier `focusNode` call), the override wins and the global page index is ignored. The counter displays the new global page, but the tree renders from the stale overrides.

**Changes made:** Added `setChildPageOverrides(new Map())` at the start of `handleGlobalPagination()`. When the user explicitly clicks PREV/NEXT, all per-node overrides are cleared so the global page index takes effect everywhere. Overrides are only meant to keep a focused node visible during search — they should not persist through manual page navigation.

---

### P1 — Major UX Issues (significantly hurt usability)

#### 8. No loading state during async ELK layout
**File:** [HierarchyCanvas.tsx:211-224](src/components/hierarchy/HierarchyCanvas.tsx#L211-L224)
**Problem:** ELK layout is async and can take hundreds of milliseconds for large trees. During computation, stale node positions are shown, then all nodes jump to new positions simultaneously. There's no visual feedback that a relayout is happening.
**Fix:** Add a `layoutPending` state to HierarchyCanvas. Set it `true` before `layout()`, `false` after. While pending, show a subtle loading overlay or apply a CSS `opacity: 0.6` transition to the canvas. Expose this state to the parent for toolbar feedback if desired.

#### 9. Global pagination is confusing
**Files:** [HierarchyCanvas.tsx:107-116](src/components/hierarchy/HierarchyCanvas.tsx#L107-L116), [VisualHierarchyPage.tsx:278-280](src/pages/VisualHierarchyPage.tsx#L278-L280), [VisualHierarchyPage.tsx:1888-1932](src/pages/VisualHierarchyPage.tsx#L1888-L1932)
**Problem:** A single `childPageIndex` controls pagination for ALL expanded nodes simultaneously. "Page 4/7" applies page 4 everywhere — nodes with fewer pages get clamped. This is the #1 source of confusion: navigating pages changes children at every level at once.
**Fix (two-phase approach):**
- **Phase A (quick win):** Improve the pagination label to explain what's happening — e.g., "Showing children 9-16 per branch" or contextualize to selected node. Reset page index to 0 on any expand/collapse action.
- **Phase B (full fix):** Move to per-node pagination using the existing `childPageOverrides` Map as the primary pagination state (it's already partially implemented for search focus). Add small prev/next arrows on each NodeCard that has >8 children. Remove or simplify the global pager to just "Show All / Paged View" toggle.

#### 10. "Show All" mode is unusable at scale
**Files:** [HierarchyCanvas.tsx:107](src/components/hierarchy/HierarchyCanvas.tsx#L107), [VisualHierarchyPage.tsx:1272-1274](src/pages/VisualHierarchyPage.tsx#L1272-L1274)
**Problem:** With 191 nodes and "Show All" + "Expand All", the entire tree renders at once. ELK layout becomes slow, the viewport zooms out so far nodes become unreadable, and SVG edge rendering tanks performance.
**Fix:** Add a safeguard — when clicking "Show All" or "Expand All", if the visible node count would exceed a threshold (e.g., 60 nodes), show a warning: "This will display X nodes and may be slow. Continue?" Also consider adding a depth limit that auto-engages when total visible nodes exceeds the threshold.

#### 11. Layout jumps with no transition animation
**File:** [HierarchyCanvas.tsx:211-224](src/components/hierarchy/HierarchyCanvas.tsx#L211-L224)
**Problem:** When expanding, collapsing, or changing pages, all nodes instantly teleport to their new ELK-computed positions. There's no smooth transition, making it hard to track what changed.
**Fix:** After ELK computes new positions, apply them with a CSS transition. On each node, set `transition: transform 300ms ease` in the node card styles. ReactFlow supports `node.style` — add a transition property when updating positions.

#### 12. Difficult to navigate large trees
**Problem:** Even in paged mode, the tree can be hard to navigate. There's no way to zoom to a specific branch, the minimap is unhelpful (all green), and the breadcrumb trail disappears after 4 seconds when focus lens is off (line 1210-1212).
**Fix:**
- Make the breadcrumb trail persistent (don't auto-clear when focus lens is off)
- Add a "Zoom to selected" button or auto-zoom behavior when clicking a node
- Consider adding a tree outline / table-of-contents sidebar for quick navigation

---

### P2 — Polish (nice-to-have improvements)

#### 13. Search limited to 8 results with no overflow indicator
**File:** [VisualHierarchyPage.tsx:452](src/pages/VisualHierarchyPage.tsx#L452)
**Problem:** `searchResults.slice(0, 8)` silently discards extra matches. User has no idea more results exist.
**Fix:** Track `totalMatches` before slicing. If `totalMatches > 8`, show a footer in the dropdown: "Showing 8 of {totalMatches} results. Refine your search."

#### 14. Edge rendering performance at scale
**File:** [HierarchyEdge.tsx](src/components/hierarchy/HierarchyEdge.tsx)
**Problem:** Each edge renders 3 SVG `<BaseEdge>` elements (rail + stroke + glow). With 100+ edges in Show All mode, this is expensive.
**Fix:** Conditionally simplify — when the visible node count exceeds a threshold (e.g., 40), render only 1 path per edge (no glow, thinner rail). Re-enable full rendering when zoomed in or when node count is manageable.

#### 15. No confirmation dialog for upline edits
**File:** [VisualHierarchyPage.tsx:558-583](src/pages/VisualHierarchyPage.tsx#L558-L583)
**Problem:** Saving upline producer ID goes straight to the API with no confirmation. This moves a person in the tree with no undo.
**Fix:** Add a simple confirm dialog before saving: "Change {name}'s upline to NPN {value}? This will move them in the hierarchy." Consider also adding an undo toast that reverts within 5 seconds.

#### 16. MiniMap lacks useful color coding
**File:** [HierarchyCanvas.tsx:274](src/components/hierarchy/HierarchyCanvas.tsx#L274)
**Problem:** `nodeColor={() => '#60f5a1'}` — all nodes are the same green. The minimap doesn't help with orientation.
**Fix:** Color nodes by status (active=green, pending=yellow, inactive=gray) or by depth level. Pass a callback that reads node data.

#### 17. No error boundary around the tree
**File:** [HierarchyCanvas.tsx](src/components/hierarchy/HierarchyCanvas.tsx) (wrapping component)
**Problem:** If `baseNodes` throws (line 140), or ELK layout fails, or ReactFlow hits an internal error, the entire page goes blank with no recovery path. React unmounts the component tree with no fallback UI.
**Fix:** Wrap `<HierarchyCanvas>` in an error boundary component that catches render errors and shows a "Something went wrong — click to retry" message. This prevents blank canvas from being a dead end.

---

## Recommended Implementation Order

| Phase | Issues | Effort | Impact |
|-------|--------|--------|--------|
| **Phase 1** | #1, #2, #3, #4, #5, #6, #7 (P0 bugs) | Medium | Critical — fixes blank canvas, upline refresh, and broken viewport |
| **Phase 2** | #8, #11 (loading + transitions) | Medium | High — eliminates visual jank |
| **Phase 3** | #9 Phase A, #10, #12, #13 (pagination label + safeguards + nav + search) | Medium | High — reduces confusion |
| **Phase 4** | #9 Phase B (per-node pagination) | Large | Very high — best UX improvement |
| **Phase 5** | #14, #15, #16, #17 (performance + polish + error boundary) | Small-Medium | Medium |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/hierarchy/HierarchyCanvas.tsx` | Debounce layout effect, keep previous flowNodes on cancel (#1), extract FocusOnSelection (#3), remove fitView prop (#5), defensive scopeRootId check (#6), layout loading state (#8), node transitions (#11) |
| `src/pages/VisualHierarchyPage.tsx` | Upline save: cache-bust + delay + preserve expansion (#2), reset page on collapse (#4), remove auto-fitView effect (#5), clear overrides on PREV/NEXT (#7), pagination label (#9A), Show All safeguard (#10), persistent breadcrumbs (#12), search overflow (#13), upline confirm (#15) |
| `src/components/hierarchy/NodeCard.tsx` | Per-node pagination controls (#9B) |
| `src/components/hierarchy/HierarchyEdge.tsx` | Conditional edge simplification (#14) |
| `src/components/hierarchy/useHierarchyStore.ts` | Per-node page indices state (#9B) |
| `api/ghl/snapshot.js` | Add `Cache-Control: no-store` response header (#2) |
| `src/components/hierarchy/ErrorBoundary.tsx` | Error boundary wrapper (#17) |

---

## Verification

After each phase:
1. Run `npm run dev` and open localhost:3000
2. **Blank canvas test:** Click node A, then quickly click node B — tree should remain visible, never go blank
3. **Upline save test:** Edit upline NPN, save, verify the tree repositions the contact under the new parent
4. **Expand/collapse:** Nodes should not jump viewport or flash
5. **Pagination:** Page should reset to 1 on collapse, label should be clear
6. **PREV/NEXT after select:** Select a contact, then click NEXT — tree diagram should update to match the new page
7. **"Show All"** with tree fully expanded — should warn if >60 nodes
8. **Search:** Focus on a deep node, verify it navigates to the correct page
9. **"Fit" button:** Should work reliably; viewport should stay stable during normal interaction
10. **Error recovery:** Intentionally break a node ID in dev tools — error boundary should catch and show retry
11. Check browser DevTools Performance tab — no layout thrashing during expand/collapse
