# Visual Upline Hierarchy UI/UX Improvement Plan

## Context Recap
- The `/visual-hierarchy` page (`src/pages/VisualHierarchyPage.tsx`) renders the full graph inside a single ReactFlow canvas via `HierarchyCanvas`.
- Layout is driven by ELK (`src/components/hierarchy/useElkLayout.ts`) with a layered, top-down orientation and fixed card dimensions from `nodeCard.css`.
- Node expansion state is persisted to `localStorage`, so once users expand most of the tree they always return to a massive canvas.
- Previous findings in `Visual_Upline_Hierarchy_Analysis.md` already highlight that upline context is hard to read; the new screenshots show the additional scaling problem once 150+ contacts are visible.

## Observed Display Issues
1. **Single viewport renders the entire data set**  
   `HierarchyCanvas.tsx:77-123` always seeds the traversal from every root (and respects any previously expanded nodes), so the canvas attempts to keep thousands of points in play. Even with the depth slider (`VisualHierarchyPage.tsx:686-701`) the default is “All”, meaning the spiderweb reappears unless the user proactively limits it every session.

2. **Layout is width-first and dominated by large cards**  
   ELK uses constant widths per density (`useElkLayout.ts:33-65`) and our CSS locks cards between 320 px and 360 px (`nodeCard.css:4-24`). When a single depth has dozens of producers, ELK can only keep adding x-offset, so the org chart becomes several thousand pixels wide before the user even interacts with it.

3. **Edges offer no grouping or bundling**  
   `HierarchyEdge.tsx` draws identical smooth rails for every parent-child pair. With layered routing, long-distance edges jump across unrelated branches, which is what makes the graph resemble “a giant spiderweb” in the provided screenshots. There is no emphasis on the primary upline path from `highlightedPath`, so everything competes for attention.

4. **Focus and depth controls are buried in the toolbar**  
   The focus lens toggle simply dims nodes (`HierarchyCanvas.tsx:101-119`), and the depth slider is not discoverable. Users are left with “Expand all” and “Fit view” buttons that immediately recreate the overwhelming layout. Nothing recasts the tree around a selected branch.

5. **No upline-aware filtering or scoping**  
   Search only matches names/NPNs, and the breadcrumb merely teleports to ancestors. None of the Priority 1 recommendations from `Visual_Upline_Hierarchy_Analysis.md`—like upline filters, badges, or navigation affordances—are represented in the canvas itself, so visual clutter compounds the underlying UX gap.

## Solution Tracks

### 1. Branch-Scoped Canvas & Smart Focus (High impact, medium effort)
- **Goal:** Let users explore one branch at a time so the canvas never needs to render the entire book of business.
- **Approach:**
  - Introduce a `scopeRootId` (or reuse `selectedNodeId`) that redefines the traversal root when “Focus branch” is active. Update `HierarchyCanvas.visibleTraversal` to start from `[scopeRootId]` instead of `graph.rootIds`.
  - Add quick actions in the inspector (and breadcrumb) to “Focus on this upline”, “Show siblings”, or “Return to full org”.
  - When a node is focused, temporarily collapse siblings outside `highlightedPath` and auto-enable the focus lens so only the active path stays bright.
  - Persist scoped focus separately from the global expansion set so reopening the page does not immediately re-expand hidden branches.
- **Touch points:** `VisualHierarchyPage.tsx` (state, toolbar controls), `HierarchyCanvas.tsx` (root traversal + highlight rules), `VisualHierarchyPage.css` (new chip states).
- **Outcome:** The user always lands on a manageable subset by default, and the canvas reflects the “navigate up/down” affordances described in the prior analysis.

### 2. Adaptive Layout & Card Scaling (High impact, medium effort)
- **Goal:** Reduce horizontal bloat and keep nodes readable without forcing an ultrawide monitor.
- **Approach:**
  - Shrink card widths dynamically based on sibling counts (e.g., calculate width per depth bucket, cap at 220 px for extremely wide levels). This can be passed into ELK as `width` instead of the fixed table in `useElkLayout.ts`.
  - Allow ELK to route in *radial* or *multi-column* mode for levels with > N children (use `elk.direction=DOWN` for narrow sets and switch to `elk.algorithm=layered` with `nodeNode` compaction for wide sets).
  - Introduce “staggered lanes”: break very wide levels into stacked sub-rows (e.g., 2–3 lanes per depth) and draw short jump wires rather than long horizontal edges.
  - Update `nodeCard.css` to add a “micro” density that tightens padding, typography, and hides less critical metadata when the card is rendered in a constrained column.
- **Touch points:** `useElkLayout.ts`, `nodeCard.css`, `HierarchyCanvas.tsx` (per-node data for lane metadata), optional helper utilities for measuring branch width.
- **Outcome:** Each level gains responsive behavior; branches pack vertically before stretching horizontally, so even 150 nodes remain within a scanable width.

### 3. Branch Aggregation & Virtualization (Medium impact, higher effort)
- **Goal:** Avoid rendering every descendant simultaneously and make it obvious when additional contacts exist.
- **Approach:**
  - Replace deep child lists with “+23 more in this branch” aggregator nodes once the number of descendants exceeds a threshold. Clicking the aggregator either expands the next page or replaces the current column with that subset.
  - Virtualize node rows within a depth column so only the cards inside the viewport are mounted (ReactFlow 11 supports custom node renderers that tie into `useVisibleNodes` hooks, or we can render the outline in plain React outside ReactFlow).
  - Add a depth preview strip (mini timeline) that shows how many contacts sit at each level; interacting with the strip jumps to that depth without loading every branch.
  - Cache expansion counts in the graph (`PersonNode.metrics.descendantCount`) so aggregators can render accurate badges without fetching additional data.
- **Touch points:** `HierarchyCanvas.tsx` (new pseudo-nodes), `NodeCard.tsx` (variant to represent aggregators), store logic for lazy expansion, optional API endpoints if we decide to lazy-load children.
- **Outcome:** Users see a clear summary of how large each branch is and can drill down deliberately instead of wading through hundreds of cards.

### 4. Directed Edge Language & Upline Legend (Medium impact, low effort)
- **Goal:** Make upline paths visually distinct without reworking the entire layout.
- **Approach:**
  - Extend `HierarchyEdge.tsx` to read additional metadata: branch depth, upline path membership, and whether the edge spans non-adjacent lanes. Use that to draw bundled rails for siblings (shared bezier segments) and accentuate the ancestor path using gradients or arrow caps.
  - Add lightweight row separators or “lane gutters” (e.g., faint vertical lines per ancestor) to visually group children under the same parent, reducing the spiderweb feeling.
  - Surface a mini legend beside the canvas that explains highlight colors, synthetic vs. verified upline rails, and focus modes—closing the loop with the “missing upline indicators” noted in `Visual_Upline_Hierarchy_Analysis.md`.
- **Touch points:** `HierarchyEdge.tsx`, `HierarchyCanvas.tsx` (pass metadata), `VisualHierarchyPage.css` (legend, gutters).
- **Outcome:** Even when many nodes are visible, users can immediately distinguish the true upline path and trust the color semantics.

### 5. Alternate Outline / NotebookLM Mode (Longer-term option)
- The earlier `Visual_Hierarchy_Page_Redesign.md` outlines a NotebookLM-style collapsible outline. We can ship this as a second tab (“Outline view”) instead of trying to force every scenario into the canvas.
- **Approach:**
  - Keep the ReactFlow canvas for spatial exploration but add a sibling component that renders the hierarchy as an indented tree with virtual scrolling and inline detail toggles.
  - Share the same store (expanded IDs, focus settings) so users can switch views without losing context.
  - Use the outline to host richer inspector data (full custom-field modal, bulk actions) while the canvas remains lightweight.
- **Touch points:** new components (`HierarchyOutline`, `HierarchyCard`, modal), routing/feature flag inside `VisualHierarchyPage`.
- **Outcome:** Provides a guaranteed “fits on one page” experience for compliance tasks while we continue iterating on the visual graph.

## Phased Roadmap
1. **Stabilize focus (Sprint 1):** Implement branch scoping, improve depth defaults, and add a clear “Focus branch” CTA—this alone prevents runaway renders.
2. **Tighten layout (Sprint 2):** Introduce adaptive card sizing + staggered lanes, then ship edge bundling + legend improvements.
3. **Progressive disclosure (Sprint 3):** Add aggregators/lazy loading for very large branches and expose a depth preview strip.
4. **Dual-view experience (Sprint 4+):** Build the outline mode once the canvas state management is solid, using it to satisfy the NotebookLM-style request while keeping the current graph for quick visual checks.

These tracks address the immediate complaint (spiderweb visuals) and align with the open gaps from `Visual_Upline_Hierarchy_Analysis.md` by reinforcing upline-first navigation, adding visual cues, and giving users multiple levels of disclosure for very large networks.
