# Visual Upline Hierarchy – Mobile Responsiveness Plan

**Page:** `/visual-hierarchy`  
**Key files:**  
- `src/pages/VisualHierarchyPage.tsx`  
- `src/pages/VisualHierarchyPage.css`  
- `src/components/hierarchy/HierarchyCanvas.tsx`  
- `src/components/hierarchy/hierarchyCanvas.css`  
- `src/components/hierarchy/NodeCard.tsx` / `nodeCard.css`  

This document focuses specifically on making the Visual Upline Hierarchy usable on phones and small tablets while preserving the current desktop experience.

---

## 1. Current Layout & Mobile Behavior

### 1.1 High‑level structure

- The page is a full‑screen layout: `.visual-hierarchy-page` is a flex column containing a sticky header and a `main` area with toolbar, breadcrumbs, scope callout, and a workspace (`canvas + inspector`).
- The hierarchy itself is rendered via ReactFlow in `HierarchyCanvas`, inside `.visual-hierarchy-canvas` → `.hierarchy-canvas` containers.
- Inspector details live in a right‑side panel on desktop; on narrower widths that panel is stacked above the canvas (`order: -1` in CSS).

### 1.2 Observed mobile behavior (from code + screenshots)

- On narrow widths, the header, stat cards, search bar, and control chips stack vertically (which is good) but consume most of the 100vh viewport.
- The inspector panel sits above the canvas and takes additional vertical space even when “empty” (no node selected).
- The ReactFlow canvas is forced into the remaining slice of height; with `overflow: hidden` on the page and main containers, the canvas can’t grow and the user can’t scroll to reveal more of it.
- Node cards are large (320–360px wide), so ReactFlow’s `fitView` shrinks the graph significantly on small screens, making text and badges hard to read.
- ReactFlow controls + minimap sit on top of the graph; on a phone‑width viewport this overlay eats into the already small canvas.

---

## 2. Mobile UX Issues & Root Causes

### 2.1 Layout & scrolling

- `.visual-hierarchy-page` sets `height: 100vh` and `overflow: hidden`  
  - Result: page content is locked to the viewport height; extra vertical content can’t scroll.
- `.visual-hierarchy-main` also uses `overflow: hidden` and `flex: 1` within the same 100vh container.  
  - Result: toolbar + breadcrumbs + scope callout + workspace must all fit within one fixed height; anything that doesn’t fit is clipped rather than scrollable.
- `.visual-hierarchy-workspace` is `display: grid` with `flex: 1` and `min-height: 0`.  
  - On desktop the 2‑column layout works, but on small screens the workspace height is still capped by the no‑scroll ancestors.

### 2.2 Inspector panel

- At `max-width: 1200px`, CSS changes the workspace to a 1‑column grid and sets `.visual-hierarchy-inspector { order: -1; }`.  
  - The inspector appears above the canvas even when empty, permanently consuming vertical real estate on mobile.
- The inspector container has `max-height: 100%` and `overflow: auto`, which assumes the workspace itself is tall enough; that assumption fails once the page is locked to 100vh and other content grows.

### 2.3 Hierarchy canvas & ReactFlow

- `.visual-hierarchy-canvas` and `.hierarchy-canvas` both set `height: 100%` with `overflow: hidden`. Combined with the limited workspace height, this constrains the ReactFlow viewport rather than allowing it to grow or scroll.
- ReactFlow is configured with:
  - `fitView` + `fitViewOptions` using `CANVAS_MIN_ZOOM = 0.08`
  - `panOnScroll`, `panOnDrag`, `zoomOnScroll`, `minZoom`, `maxZoom`  
  - On small screens, `fitView` tends to pick a very small zoom level to squeeze the tree into a tiny viewport.
- The canvas doesn’t currently respond to viewport size changes explicitly (no resize observer) beyond ReactFlow’s own internal behavior. When orientation changes or browser UI overlays grow/shrink, the graph may not re‑fit ideally on mobile.

### 2.4 Node cards & density

- Card widths are effectively fixed based on density:  
  - `useElkLayout`: 360 / 340 / 320px width per density  
  - `nodeCard.css`: `width: 340px` by default, with small tweaks per density
- On phones, those widths can easily exceed 80–90% of the viewport, forcing ELK to produce very wide layouts and encouraging extremely low zoom levels.
- Density is stored globally (`useHierarchyStore`) but `VisualHierarchyPage` always uses `density = useDensity()` without exposing any density control or mobile‑specific overrides; in practice, everything renders at `cozy` even on small screens.

### 2.5 Toolbar, stats, and header

- Stats grid uses `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));` which works well but produces a tall stack of four cards on small devices (big vertical footprint).
- Search control has `min-width: 320px`; just under that width, it will trigger horizontal overflow.
- The toolbar exposes a lot of controls at once (theme, fit/collapse/expand, focus, depth slider, refresh, paging). On a phone the visual density is high and individual chips may drop below the ideal 44×44px tap target, especially when text wraps.
- Export dropdown is absolutely positioned in the top‑right of the header; it works but can crowd the space on small devices.

### 2.6 ReactFlow controls & minimap

- The default `Controls` and `MiniMap` are always rendered. On small screens they overlap a significant portion of the canvas and may be fiddly to use with touch.
- There is no breakpoint‑aware behavior (e.g., hiding minimap or simplifying controls on mobile).

---

## 3. Mobile Design Goals

1. **Scroll‑first layout:** The page should scroll vertically like a normal document; no hard 100vh locking for the whole experience.
2. **Usable canvas space:** On phones, the hierarchy canvas should occupy a large, stable portion of the screen (e.g., 50–70% of viewport height) and remain legible without extreme zooming.
3. **Progressive disclosure:** Secondary controls (depth slider, export modes, global paging) should be available but not dominate the initial mobile layout.
4. **Inspector as optional detail:** Node details should be accessible on mobile without permanently stealing vertical space when no node is selected.
5. **No unexpected horizontal scroll:** Avoid layouts that force sideways page scrolling; horizontal interaction should stay inside the ReactFlow pan/zoom context.
6. **Touch‑friendly controls:** Frequently used actions should have adequate tap targets and spacing, and avoid tiny clustered buttons.

---

## 4. Implementation Options by Area

### 4.1 Page layout & scrolling

**Option A – CSS‑only scrollable page (recommended as first step)**  

- Change `.visual-hierarchy-page`:
  - From `height: 100vh; overflow: hidden;`  
  - To `min-height: 100vh; height: auto; overflow-x: hidden; overflow-y: auto;`
- Change `.visual-hierarchy-main`:
  - Remove or relax `overflow: hidden`; allow the main area to grow and let the page scroll.
  - Keep `flex-direction: column` and `gap` so sections stack naturally.
- Ensure `body`/`#root` continue using `min-height: 100vh` (already true via `App.css`), so the page fills the viewport without over‑constraining height.

**Pros:**  
- Minimal code changes, mostly in CSS.  
- Immediately restores vertical scroll and prevents content from being clipped on phones.  

**Cons:**  
- The canvas height will still be determined by its content; without further tweaks it might become very tall on some devices.

---

**Option B – Internal scroll container**

- Keep `.visual-hierarchy-page` at `height: 100vh` for a “full‑app” feel, but move the scroll container down to `.visual-hierarchy-main`:
  - Give `main` `overflow-y: auto;` and a calculated height (e.g., `height: calc(100vh - headerHeight)`).
  - Ensure all internal sections (toolbar, breadcrumbs, workspace) have `min-height: 0` so the scroll container works correctly.

**Pros:**  
- Maintains a fixed, sticky header while scrolling the rest.  

**Cons:**  
- Slightly more brittle to header height changes; needs explicit sizing and testing across devices.

> **Recommendation:** Start with Option A to unblock mobile scrolling quickly; revisit Option B later if you want a more “app‑like” full‑height container.

---

### 4.2 Workspace & canvas height

**Option A – Responsive grid to flex stack**

- At `max-width: 1200px`, instead of a single‑column grid with an ordered inspector, switch the workspace to a simple flex column:
  - `.visual-hierarchy-workspace { display: flex; flex-direction: column; }`
  - Move inspector position/stacking into CSS (and possibly component state) rather than relying on grid `order` alone.
- Give `.visual-hierarchy-canvas` a responsive min height on small screens:
  - E.g., `min-height: 420px;` or `min-height: 60vh;` at `max-width: 768px`.

**Pros:**  
- Simpler mental model for layout; easier to reason about vertical stacking on small screens.  
- Guarantees a usable canvas height even when toolbar/inspector are present.

**Cons:**  
- Requires careful testing to ensure the canvas doesn’t become too tall on very small devices.

---

**Option B – Keep grid but tune heights**

- Retain the grid layout but remove `flex: 1` from `.visual-hierarchy-workspace` on small screens and rely on its intrinsic height.
- Adjust `.visual-hierarchy-inspector`:
  - Reduce padding/margins on mobile.  
  - Remove `max-height: 100%` to let it grow naturally within the page scroll.
- Set `.visual-hierarchy-canvas` to have a mobile‑only `min-height` and remove `height: 100%` so it can grow as needed.

**Pros:**  
- Smaller change set; keeps existing grid logic.  

**Cons:**  
- Grid + flex + height interactions are harder to reason about; easier to reintroduce clipping by accident.

> **Recommendation:** Prefer Option A (flex stack) for mobile breakpoints; it plays nicer with the scrollable page approach in 4.1.

---

### 4.3 Inspector behavior on mobile

**Option A – Collapsible panel in flow (low effort)**  

- Keep the inspector inside the normal document flow but:
  - Hide or minimize it when no node is selected (e.g., show only a small placeholder row with a brief message).  
  - On selection, expand it below the canvas or directly below the toolbar, depending on which reads best.
- Use CSS + a simple `isInspectorOpen` flag (derived from `selectedNodeId`) to drive styles:
  - Closed: smaller padding, reduced border, no box shadow.  
  - Open: current full card layout.

**Pros:**  
- Minimal structural changes; mostly CSS and a couple of conditional wrappers.  

**Cons:**  
- Still consumes vertical space above/below the canvas; not as strong as a true overlay.

---

**Option B – Bottom‑sheet inspector (recommended longer‑term)**  

- On `max-width: 768px`, treat the inspector as a modal bottom sheet:
  - Position it `fixed` at the bottom of the viewport with a max height (e.g., `70vh`) and internal scroll.  
  - Trigger open/close via `selectedNodeId` and a dedicated “Details” / “Close” handle.
- Keep the side‑panel inspector behavior on desktop and tablet; the same React markup can render in two different containers based on breakpoint (e.g., via a portal or conditional wrapper).

**Pros:**  
- Frees up the full vertical height for the canvas while showing rich details when needed.  
- Familiar pattern for phone users (similar to map apps showing place details).

**Cons:**  
- More involved implementation (portal, animations, focus management, escape handling).

> **Recommendation:** Use Option A in the first pass; schedule Option B as a higher‑impact enhancement after basic responsiveness is in place.

---

### 4.4 Canvas density, node sizing, and zoom

**Option A – Auto‑select compact density on small screens (low effort)**  

- Use a `useEffect` in `VisualHierarchyPage` to detect viewport width (via `window.innerWidth` or `matchMedia('(max-width: 768px)')`) and call `setDensity('compact')` when on mobile.
- Optionally remember the user’s choice in `localStorage` so they can still opt into a larger density on tablets.

**Pros:**  
- Immediate win: ELK uses narrower node widths and tighter lane spacing on phones.  
- No CSS changes required to node cards.

**Cons:**  
- Still relatively large cards; may not be enough for very dense branches.

---

**Option B – Introduce a dedicated `mobile` density**  

- Extend `Density` type and `useElkLayout`:
  - Add `mobile: { width: ~260px, height: ~80px, laneGap: ~72px }` (tune via testing).  
  - Update nodeCard CSS to support `[data-density='mobile']` with smaller font sizes, tighter padding, and fewer details (e.g., hide less critical metadata lines).
- Switch to `mobile` density automatically below a width threshold; on larger screens keep `cozy`/`comfortable` as options.

**Pros:**  
- Unlocks really readable layouts on phones by designing specifically for that context.  
- Can simplify node content to the essentials on mobile (name, status, key upline summary).

**Cons:**  
- Requires more design work and styling; we must choose which content to hide or abbreviate.

---

**Option C – Tune fit/zoom behavior for small screens**  

- For mobile breakpoints:
  - Increase `CANVAS_MIN_ZOOM` (e.g., from `0.08` to `0.15–0.2`) so nodes never shrink beyond readability.  
  - Use a different `fitViewOptions` padding, or call `fitView` to only include a focused branch instead of the entire graph.
- Consider disabling `panOnScroll` on touch devices to avoid intercepting vertical scroll gestures when the canvas doesn’t take full height.

**Pros:**  
- Better default zoom levels and interactions on small screens.  

**Cons:**  
- Needs careful tuning so large trees still fit without confusing initial views.

> **Recommendation:** Implement Option A now; evaluate Option C alongside the branch‑scoping work from the existing UX plan; consider Option B when you have design capacity.

---

### 4.5 Toolbar, stats, and controls

**Option A – Simple responsive tweaks (short‑term)**  

- Stats:
  - At `max-width: 768px`, reduce padding and font size slightly to shrink vertical footprint.  
  - Optionally show stats in a 2×2 grid instead of four full‑width rows.
- Toolbar:
  - Ensure each chip’s click area is at least ~40–44px tall (padding + line‑height).  
  - Confirm that `.visual-hierarchy-toolbar` flex column layout works with multi‑line toolbar actions; adjust margins/gaps for readability.
- Export dropdown:
  - Keep as is but verify tap targets and avoid overlap with the title on smallest widths.

**Option B – “Basic vs Advanced” control grouping (longer‑term)**  

- Surface a minimal control row on mobile (e.g., `Fit`, `Focus`, `Depth` summary, `Search`) and move less frequent actions (`Expand all`, `Collapse`, `Show all`, export variants) into a secondary “More” menu or bottom sheet.
- This can be driven by a single “Advanced” chip that opens a popover or drawer.

**Option C – ReactFlow controls & minimap adjustments**  

- At `max-width: 768px`, hide or simplify ReactFlow’s built‑in `Controls` and `MiniMap` via CSS:
  - Example: `.hierarchy-canvas .react-flow__minimap { display: none; }` for mobile.  
  - Optionally replace with custom zoom icons integrated into the existing toolbar.

> **Recommendation:** Apply Option A and the minimap hiding from Option C as part of the first pass; explore Option B later if the toolbar still feels crowded.

---

## 5. Phased Implementation Plan

### Phase 1 – Unblock basic responsiveness

**Goal:** Make the page scrollable and ensure the canvas occupies a sensible amount of space on phones.

- [ ] Remove `height: 100vh` + `overflow: hidden` from `.visual-hierarchy-page`; switch to scrollable page layout (4.1 Option A).
- [ ] Relax or remove `overflow: hidden` on `.visual-hierarchy-main` so content can extend vertically.
- [ ] On `max-width: 1200px`, switch `.visual-hierarchy-workspace` to a flex column stack instead of relying on grid `order` (4.2 Option A).
- [ ] Add a mobile `min-height` to `.visual-hierarchy-canvas` (e.g., `min-height: 420px` or `60vh`) to guarantee a usable viewport.
- [ ] Verify there is no horizontal page scroll at 320px, 375px, and 414px widths.

### Phase 2 – Make the graph legible on small screens

**Goal:** Ensure nodes and edges are readable at phone widths without extreme zooming.

- [ ] Auto‑apply `compact` density below a breakpoint by wiring `setDensity` into `VisualHierarchyPage` and persisting the choice (4.4 Option A).
- [ ] Raise `CANVAS_MIN_ZOOM` slightly on phones and tune `fitViewOptions` padding (4.4 Option C).
- [ ] Hide the ReactFlow minimap on `max-width: 768px`; consider simplifying or hiding zoom controls if they crowd the canvas (4.5 Option C).
- [ ] Run manual tests with a dense snapshot (~150+ contacts) to confirm readability and interaction feel.

### Phase 3 – Improve inspector & toolbar UX on mobile

**Goal:** Keep the graph central while making details and controls comfortable to use.

- [ ] Convert the inspector into a collapsible card on mobile that only fully expands when a node is selected (4.3 Option A).
- [ ] Tighten spacing and font sizes in stats and toolbar at `max-width: 768px` (4.5 Option A).
- [ ] Audit tap targets for primary controls (Fit, Focus, Depth, paging) and adjust padding to hit ~44px minimum height.
- [ ] Optionally introduce a simplified “advanced” controls drawer if the toolbar remains visually heavy (4.5 Option B).

### Phase 4 – Optional bottom‑sheet inspector & mobile density

**Goal:** Deliver a polished, mobile‑first reading of the experience.

- [ ] Implement a bottom‑sheet inspector that opens when a node is selected on `max-width: 768px`, using a portal and fixed positioning (4.3 Option B).
- [ ] Add a dedicated `mobile` density profile (`useElkLayout` + `nodeCard.css`) and switch to it on small screens (4.4 Option B).
- [ ] Re‑evaluate the export and advanced controls for mobile, potentially moving them into the inspector or a separate drawer.

---

## 6. Definition of Done for “Mobile Friendly”

- The `/visual-hierarchy` page is fully usable on a 320×568 viewport:
  - No clipped content; vertical scroll behaves normally.  
  - The hierarchy canvas has enough height to pan and zoom comfortably.  
  - Nodes are legible without pinching to microscopic zoom levels.
- Core actions (search, fit, focus, depth adjustment, basic pagination) are easy to tap and clearly visible.
- Inspector content is accessible but not always‑on; it does not permanently squeeze the canvas on mobile.
- There is no horizontal page scroll in normal use; horizontal movement is confined to the ReactFlow canvas.
- Desktop and large‑screen behavior remains effectively unchanged, aside from minor visual refinements.

